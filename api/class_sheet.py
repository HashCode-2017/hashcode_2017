"""The class's shared score sheet, mirrored into the console.

Every group writes its scores into one public Google Sheet. This module reads
it through the sheet's CSV export link (no Google API, no keys), keeps the
last snapshot in `hc_settings` under `class_sheet`, and tells what changed
between two snapshots. It never touches console submissions: the sheet is its
own dataset, shown on its own page.

    python -m api.class_sheet      # fetch the sheet now and store what changed
"""
import csv
import io
import re
import time

from . import db

SHEET_ID = "14uP3Iylm2Srmv9AOk9OhVznN6wd00v6XgQnqnTk3riw"
SHEET_URL = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/edit?gid=0"
CSV_URL = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=csv&gid=0"

SETTING_KEY = "class_sheet"
HEADER = "instance \\ score groupe"
HISTORY_KEEP = 20               # syncs that changed something
HISTORY_CHANGES = 300           # changes kept per sync; the count is always exact

_GROUP = re.compile(r"^[A-Z]$")
_SPACES = re.compile(r"[\s  ]")


class SheetError(RuntimeError):
    pass


# ------------------------------------------------------------- fetch & parse

def fetch(url=CSV_URL):
    import httpx
    try:
        r = httpx.get(url, follow_redirects=True, timeout=20)
    except httpx.HTTPError as exc:
        raise SheetError(f"could not reach the sheet: {exc}") from exc
    if r.status_code != 200:
        raise SheetError(f"the sheet answered HTTP {r.status_code}; is it still public?")
    r.encoding = "utf-8"
    return r.text


def _number(cell):
    """`2 656 069`, `64,516`, `51168` -> int; anything else (empty, text) -> None."""
    s = _SPACES.sub("", cell or "")
    if re.fullmatch(r"\d{1,3}(,\d{3})+", s):
        s = s.replace(",", "")
    return int(s) if s.isdigit() else None


def _cell(row, i):
    return row[i].strip() if i < len(row) else ""


def _title_above(rows, header_at):
    """The section title: nearest row above with only text in column B."""
    for row in reversed(rows[:header_at]):
        title = _cell(row, 1)
        if not _cell(row, 0) and title and _number(title) is None:
            return title
    return f"Section {header_at + 1}"


def parse(text):
    rows = list(csv.reader(io.StringIO(text)))
    headers = [i for i, row in enumerate(rows) if _cell(row, 0).lower() == HEADER]
    if not headers:
        raise SheetError(f"no '{HEADER}' header row found: the sheet's layout changed")

    groups = []
    sections = []
    for n, at in enumerate(headers):
        head = rows[at]
        vbs_col = next((i for i, c in enumerate(head) if c.strip().upper() == "VBS"), None)
        cols = {}
        for i, c in enumerate(head):
            g = c.strip()
            if _GROUP.match(g):
                cols[g] = i
                if g not in groups:
                    groups.append(g)

        end = headers[n + 1] if n + 1 < len(headers) else len(rows)
        instances, world_rank = [], {}
        in_block = True
        for row in rows[at + 1:end]:
            name = _cell(row, 0)
            if not name:
                in_block = False                     # instance rows end at the first blank
                continue
            if name.lower().startswith("classement hashcode"):
                world_rank = {g: v for g, i in cols.items() if (v := _number(_cell(row, i))) is not None}
                continue
            if not in_block or name.upper() == "TOTAL" or name.lower().startswith("classement"):
                continue
            scores = {g: v for g, i in cols.items() if (v := _number(_cell(row, i))) is not None}
            vbs = _number(_cell(row, vbs_col)) if vbs_col is not None else None
            instances.append({"name": name, "vbs": vbs, "scores": scores})

        sections.append({"title": _title_above(rows, at), "instances": instances,
                         "world_rank": world_rank})
    return {"groups": groups, "sections": sections}


# ---------------------------------------------------------------------- diff

def _cells(snapshot):
    """(section, instance, group) -> value, VBS included as group 'VBS'."""
    out = {}
    for s in (snapshot or {}).get("sections", []):
        for inst in s["instances"]:
            if inst.get("vbs") is not None:
                out[(s["title"], inst["name"], "VBS")] = inst["vbs"]
            for g, v in inst["scores"].items():
                out[(s["title"], inst["name"], g)] = v
    return out


def diff(old, new):
    before, after = _cells(old), _cells(new)
    changes = []
    for key, value in after.items():
        if before.get(key) != value:
            changes.append((key, before.get(key), value))
    for key, value in before.items():
        if key not in after:
            changes.append((key, value, None))
    return [{"section": s, "instance": i, "group": g, "old": o, "new": v}
            for (s, i, g), o, v in changes]


# ---------------------------------------------------------------------- sync

def _load():
    return db.store().get_setting(SETTING_KEY)


def _save(value):
    db.store().set_setting(SETTING_KEY, value)


def sync(by):
    """Fetch the sheet; store it only if a cell changed. Returns what changed."""
    fresh = parse(fetch())
    stored = _load()
    changes = diff(stored, fresh)
    if stored is not None and not changes:
        return {"changed": 0, "changes": [], "synced_at": stored.get("synced_at")}

    now = time.time()
    history = [{"at": now, "by": by, "count": len(changes), "changes": changes[:HISTORY_CHANGES]}]
    history += (stored or {}).get("history", [])[:HISTORY_KEEP - 1]
    _save({"source": SHEET_URL, "synced_at": now, "synced_by": by, **fresh, "history": history})
    return {"changed": len(changes), "changes": changes[:HISTORY_CHANGES], "synced_at": now}


# ---------------------------------------------------------------------- view

def _ranks(values):
    """Competition ranking, highest first: ties share the better rank."""
    order = sorted(values.values(), reverse=True)
    return {k: order.index(v) + 1 for k, v in values.items()}


def view(snapshot):
    """What the page draws: per section, totals, ranks and gaps to VBS."""
    groups = snapshot["groups"]
    sections = []
    for s in snapshot["sections"]:
        instances = []
        for inst in s["instances"]:
            scores = inst["scores"]
            best = max(scores.values(), default=None)
            vbs = max((v for v in (inst.get("vbs"), best) if v is not None), default=None)
            instances.append({"name": inst["name"], "vbs": vbs, "best": best,
                              "scores": scores, "ranks": _ranks(scores)})
        vbs_total = sum(i["vbs"] or 0 for i in instances)

        totals = {g: sum(i["scores"][g] for i in instances if g in i["scores"]) for g in groups}
        scored = {g: sum(g in i["scores"] for i in instances) for g in groups}
        ranks = _ranks({g: t for g, t in totals.items() if scored[g]})
        rows = [{"group": g, "total": totals[g], "scored": scored[g], "rank": ranks.get(g),
                 "gap": vbs_total - totals[g], "world_rank": s["world_rank"].get(g),
                 "best_count": sum(1 for i in instances
                                   if g in i["scores"] and i["scores"][g] == i["vbs"])}
                for g in groups]
        sections.append({"title": s["title"], "instances": instances, "vbs_total": vbs_total,
                         "groups": rows})
    last = (snapshot.get("history") or [None])[0]
    return {"source": snapshot.get("source", SHEET_URL), "synced_at": snapshot.get("synced_at"),
            "synced_by": snapshot.get("synced_by"), "groups": groups, "sections": sections,
            "last_sync": last}


def current_view():
    stored = _load()
    return view(stored) if stored else {"empty": True, "source": SHEET_URL}


if __name__ == "__main__":
    import sys
    try:
        result = sync("cli")
    except SheetError as exc:
        sys.exit(f"sync failed: {exc}")
    if not result["changed"]:
        print("nothing to update")
    else:
        fmt = lambda v: "—" if v is None else f"{v:,}"
        for c in result["changes"]:
            print(f"{c['group']} · {c['instance']}: {fmt(c['old'])} → {fmt(c['new'])}")
        print(f"data updated: {result['changed']} cell(s) changed")
