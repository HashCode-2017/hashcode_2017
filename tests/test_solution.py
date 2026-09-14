"""Tests for the Hash Code 2017 "Streaming Videos" solution.

The anchor test is `test_scorer_matches_pdf_example`: if `score()` cannot
reproduce the 462500 the problem statement computes by hand for its own
illustrative submission, nothing else here means anything.
"""

import random
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import solution  # noqa: E402

EXAMPLE = Path(__file__).resolve().parent.parent / "example.in"

# The submission the PDF walks through: cache 0 -> {2}, cache 1 -> {3, 1},
# cache 2 -> {0, 1}. The statement states this scores 462500.
PDF_SUBMISSION = [{2}, {3, 1}, {0, 1}]
PDF_SCORE = 462500


@pytest.fixture
def inst():
    return solution.parse_input(EXAMPLE)


def make_instance(text, tmp_path):
    p = tmp_path / "case.in"
    p.write_text(text, encoding="ascii")
    return solution.parse_input(p)


# --- parsing -------------------------------------------------------------

def test_parses_example_header(inst):
    assert (inst.V, inst.E, inst.R, inst.C, inst.X) == (5, 2, 4, 3, 100)
    assert inst.sizes == [50, 50, 80, 30, 110]
    assert inst.endpoint_latency == [1000, 500]
    assert inst.endpoint_caches[0] == {0: 100, 2: 200, 1: 300}
    assert inst.endpoint_caches[1] == {}  # K == 0 is legal


def test_aggregates_duplicate_request_rows(tmp_path):
    # Two rows for the same (video, endpoint) must sum, not overwrite.
    text = "1 1 2 1 100\n50\n1000 1\n0 100\n0 0 30\n0 0 70\n"
    got = make_instance(text, tmp_path)
    assert got.endpoint_requests[0] == {0: 100}
    assert got.video_endpoints[0] == [(0, 100)]


@pytest.mark.parametrize("mangle", [
    lambda s: s.replace("\n", "\r\n"),          # CRLF line endings
    lambda s: s + "\n\n\n",                     # trailing blank lines
    lambda s: s.replace("\n", "\n\n"),          # blank line between every row
    lambda s: "\n" + s,                         # leading blank line
])
def test_parser_tolerates_whitespace_variation(mangle, tmp_path, inst):
    text = mangle(EXAMPLE.read_text(encoding="ascii"))
    got = make_instance(text, tmp_path)
    assert got.requests == inst.requests
    assert got.endpoint_caches == inst.endpoint_caches


def test_truncated_input_is_rejected(tmp_path):
    # Header promises 4 request rows; only one is present.
    text = "5 2 4 3 100\n50 50 80 30 110\n1000 0\n500 0\n3 0 1500\n"
    with pytest.raises(ValueError, match="file ended early"):
        make_instance(text, tmp_path)


def test_unknown_cache_reference_is_rejected(tmp_path):
    text = "1 1 1 1 100\n50\n1000 1\n7 100\n0 0 1\n"
    with pytest.raises(ValueError, match="unknown cache"):
        make_instance(text, tmp_path)


# --- scoring -------------------------------------------------------------

def test_scorer_matches_pdf_example(inst):
    """The anchor: reproduce the statement's own hand-computed 462500."""
    assert solution.score(inst, PDF_SUBMISSION) == PDF_SCORE


def test_empty_placement_scores_zero(inst):
    assert solution.score(inst, [set(), set(), set()]) == 0


def test_score_is_zero_when_nobody_requests_anything(tmp_path):
    text = "1 1 1 1 100\n50\n1000 1\n0 100\n0 0 0\n"
    got = make_instance(text, tmp_path)
    assert solution.score(got, [{0}]) == 0


# --- solving -------------------------------------------------------------

@pytest.mark.parametrize("strategy", solution.STRATEGIES)
def test_solver_beats_the_statements_illustrative_submission(strategy, inst):
    placed = solve_with(strategy, inst)
    assert solution.score(inst, placed) > PDF_SCORE


@pytest.mark.parametrize("strategy", solution.STRATEGIES)
def test_solver_never_exceeds_capacity(strategy, inst):
    placed = solve_with(strategy, inst)
    assert solution.validate(inst, placed)


@pytest.mark.parametrize("strategy", solution.STRATEGIES)
def test_video_too_big_for_any_cache_is_never_placed(strategy, inst):
    # Video 4 is 110MB against a 100MB capacity.
    placed = solve_with(strategy, inst)
    assert all(4 not in videos for videos in placed)


@pytest.mark.parametrize("strategy", solution.STRATEGIES)
def test_endpoint_with_no_caches_is_handled(strategy, tmp_path):
    text = "2 2 2 1 100\n50 50\n1000 0\n500 1\n0 10\n0 0 999\n1 1 5\n"
    got = make_instance(text, tmp_path)
    placed = solve_with(strategy, got)
    # Endpoint 0 has no caches, so caching video 0 cannot help anyone;
    # only endpoint 1's video 1 is worth storing.
    assert placed[0] == {1}


def test_validate_rejects_over_capacity(inst):
    with pytest.raises(ValueError, match="capacity"):
        solution.validate(inst, [{0, 1, 2}, set(), set()])


def test_validate_rejects_unknown_video(inst):
    with pytest.raises(ValueError, match="unknown video"):
        solution.validate(inst, [{99}, set(), set()])


# --- output --------------------------------------------------------------

def test_output_lists_only_non_empty_caches(tmp_path, inst):
    out = tmp_path / "sub.txt"
    solution.write_output(out, [{1, 3}, set(), {0}])
    assert out.read_text(encoding="ascii") == "2\n0 1 3\n2 0\n"


def test_output_of_empty_placement(tmp_path):
    out = tmp_path / "sub.txt"
    solution.write_output(out, [set(), set()])
    assert out.read_text(encoding="ascii") == "0\n"


# --- randomised cross-checks --------------------------------------------

def random_instance(rng, tmp_path, V=40, E=8, C=6, X=200):
    lines = []
    R_rows = []
    for e in range(E):
        for v in range(V):
            if rng.random() < 0.3:
                R_rows.append((v, e, rng.randint(1, 1000)))
    sizes = [rng.randint(1, 120) for _ in range(V)]
    lines.append(f"{V} {E} {len(R_rows)} {C} {X}")
    lines.append(" ".join(map(str, sizes)))
    for e in range(E):
        L_D = rng.randint(200, 1000)
        conn = rng.sample(range(C), rng.randint(0, C))
        lines.append(f"{L_D} {len(conn)}")
        for c in conn:
            lines.append(f"{c} {rng.randint(1, L_D)}")
    for v, e, n in R_rows:
        lines.append(f"{v} {e} {n}")
    return make_instance("\n".join(lines) + "\n", tmp_path)


def solve_with(strategy, inst):
    if strategy == "rounds":
        return solution.solve_rounds(inst)
    return solution.solve_best_first(inst)


@pytest.mark.parametrize("seed", range(12))
def test_random_instances_produce_valid_non_negative_solutions(seed, tmp_path):
    rng = random.Random(seed)
    inst = random_instance(rng, tmp_path)
    for strategy in solution.STRATEGIES:
        placed = solve_with(strategy, inst)
        assert solution.validate(inst, placed)
        assert solution.score(inst, placed) >= 0


@pytest.mark.parametrize("scale", ["small", "mid"])
def test_generated_input_round_trips_through_a_file(scale, tmp_path):
    """generate -> write_input -> parse_input must give back the same data.

    This is the cross-check between the writer and the parser: if either
    drifts from the official format, the two stop agreeing.
    """
    import bench

    original = bench.generate(random.Random(7), **bench.SCALES[scale])
    path = tmp_path / f"{scale}.in"
    bench.write_input(original, path)

    reparsed = solution.parse_input(path)

    assert (reparsed.V, reparsed.E, reparsed.R, reparsed.C, reparsed.X) == \
           (original.V, original.E, original.R, original.C, original.X)
    assert reparsed.sizes == original.sizes
    assert reparsed.endpoint_latency == original.endpoint_latency
    assert reparsed.endpoint_caches == original.endpoint_caches
    assert reparsed.requests == original.requests
    # And it must actually be solvable end to end.
    assert solution.validate(reparsed, solution.solve_best_first(reparsed))


@pytest.mark.parametrize("seed", range(12))
def test_best_first_is_never_worse_than_doing_nothing(seed, tmp_path):
    rng = random.Random(seed)
    inst = random_instance(rng, tmp_path)
    placed = solution.solve_best_first(inst)
    empty = [set() for _ in range(inst.C)]
    assert solution.score(inst, placed) >= solution.score(inst, empty)
