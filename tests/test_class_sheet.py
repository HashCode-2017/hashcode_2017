"""The class sheet: parsing the public CSV, diffing two snapshots, the page's view."""
import copy
import os

import pytest

from api import class_sheet

FIXTURE = os.path.join(os.path.dirname(__file__), "fixtures", "class_sheet.csv")


@pytest.fixture
def parsed():
    with open(FIXTURE, encoding="utf-8") as f:
        return class_sheet.parse(f.read())


def _instance(section, name):
    return next(i for i in section["instances"] if i["name"] == name)


def test_parse_finds_both_sections(parsed):
    titles = [s["title"] for s in parsed["sections"]]
    assert titles == ["INSTANCES FOURNIES PAR GOOGLE", "INSTANCES DE LA PROMO"]
    assert [len(s["instances"]) for s in parsed["sections"]] == [4, 29]
    assert parsed["groups"] == list("ABCDEFGHIJKL") + ["P"]


def test_parse_reads_cells(parsed):
    google, promo = parsed["sections"]
    kittens = _instance(google, "kittens")
    assert kittens["vbs"] == 1024967
    assert kittens["scores"]["D"] == 1022115
    assert kittens["scores"]["K"] == 1024967
    assert "H" not in kittens["scores"]                  # empty cell: no score, not 0
    assert _instance(promo, "regional_instance.in")["scores"]["D"] == 2367395


def test_parse_reads_spaced_numbers(parsed):
    promo = parsed["sections"][1]
    assert _instance(promo, "medium_mixed_lambda.in")["scores"]["C"] == 51168


def test_parse_skips_totals_and_rankings(parsed):
    names = {i["name"] for s in parsed["sections"] for i in s["instances"]}
    assert not any(n.startswith(("TOTAL", "Classement")) for n in names)
    assert "" not in names


def test_parse_reads_world_rank(parsed):
    google, promo = parsed["sections"]
    assert google["world_rank"]["D"] == 18
    assert google["world_rank"]["K"] == 3
    assert promo["world_rank"] == {}


def test_parse_rejects_unknown_layout():
    with pytest.raises(class_sheet.SheetError):
        class_sheet.parse("a,b,c\n1,2,3\n")


def test_diff_of_identical_snapshots_is_empty(parsed):
    assert class_sheet.diff(parsed, copy.deepcopy(parsed)) == []


def test_diff_reports_changed_added_and_removed_cells(parsed):
    new = copy.deepcopy(parsed)
    promo = new["sections"][1]
    _instance(promo, "regional_instance.in")["scores"]["D"] = 2372676      # changed
    _instance(promo, "regional_instance.in")["scores"]["H"] = 1000         # added
    del _instance(promo, "big.in")["scores"]["A"]                          # removed
    changes = class_sheet.diff(parsed, new)
    as_tuples = {(c["instance"], c["group"], c["old"], c["new"]) for c in changes}
    assert as_tuples == {
        ("regional_instance.in", "D", 2367395, 2372676),
        ("regional_instance.in", "H", None, 1000),
        ("big.in", "A", 249794, None),
    }
    assert all(c["section"] == "INSTANCES DE LA PROMO" for c in changes)


def test_diff_against_nothing_lists_every_cell(parsed):
    changes = class_sheet.diff(None, parsed)
    assert len(changes) > 100
    assert all(c["old"] is None for c in changes)


def test_view_totals_and_ranks(parsed):
    view = class_sheet.view(parsed)
    google = view["sections"][0]
    by_group = {g["group"]: g for g in google["groups"]}
    assert by_group["D"]["total"] == 1022115 + 507906 + 499966 + 609385
    assert by_group["D"]["scored"] == 4
    assert by_group["K"]["rank"] == 1                      # K holds every VBS here
    assert by_group["H"]["rank"] is None and by_group["H"]["scored"] == 0
    assert by_group["D"]["world_rank"] == 18
    assert google["vbs_total"] == 1024967 + 516557 + 500000 + 614545
    assert by_group["D"]["gap"] == google["vbs_total"] - by_group["D"]["total"]


def test_view_ranks_each_instance(parsed):
    view = class_sheet.view(parsed)
    kittens = view["sections"][0]["instances"][0]
    assert kittens["name"] == "kittens"
    assert kittens["ranks"]["K"] == 1
    assert kittens["ranks"]["J"] == 2
    # ties share the better rank
    big = next(i for i in view["sections"][1]["instances"] if i["name"] == "big.in")
    assert big["ranks"]["C"] == big["ranks"]["D"] == 1


def test_sync_stores_only_when_something_changed(parsed, monkeypatch):
    saved = {}
    monkeypatch.setattr(class_sheet, "_load", lambda: saved.get("v"))
    monkeypatch.setattr(class_sheet, "_save", lambda v: saved.__setitem__("v", v))
    with open(FIXTURE, encoding="utf-8") as f:
        text = f.read()
    monkeypatch.setattr(class_sheet, "fetch", lambda url=None: text)

    first = class_sheet.sync("alice")
    assert first["changed"] > 100
    stamp = saved["v"]["synced_at"]

    second = class_sheet.sync("bob")
    assert second["changed"] == 0
    assert saved["v"]["synced_at"] == stamp                # nothing new: snapshot untouched
    assert saved["v"]["synced_by"] == "alice"

    monkeypatch.setattr(class_sheet, "fetch",
                        lambda url=None: text.replace("2367395", "2372676"))
    third = class_sheet.sync("carol")
    assert third["changed"] == 1
    assert saved["v"]["synced_by"] == "carol"
    assert saved["v"]["history"][0]["changes"][0]["new"] == 2372676
