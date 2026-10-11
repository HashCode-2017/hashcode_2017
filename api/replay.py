"""Turn anyone's submission into the event stream the console animates.

The UI was built around the events `solution.solve` emits (`place`, `evict`,
`round_start`, ...). A classmate's solver, in any language, only has to hand
us two plain-text files:

  * the `.out` submission itself -- the final placement, which is what gets
    scored and ranked;
  * optionally a `.trace`, one decision per line, in the order it was made:

        + <cache> <video>     put a video into a cache
        - <cache> <video>     remove a video from a cache
        # <any text>          a marker, e.g. "# round 2": starts a new step

We recompute everything else -- the latency each move saved, the remaining
space, the endpoints it helped -- from the `.in`, so nobody has to log gains.
Without a trace, the `.out` is replayed cache by cache, and the run is
labelled as such: it shows the result, not the order the algorithm worked in.
"""
from collections import defaultdict

from solution import Instance, _endpoint_latency_snapshot

MAX_PROBLEMS = 50           # enough to debug from, without a 10k-line report
SNAPSHOTS = 24              # endpoint-latency frames per replay


class SubmissionError(ValueError):
    """The file cannot be read at all; reported to the uploader verbatim."""


def _ints(line, lineno, what):
    try:
        return [int(x) for x in line.split()]
    except ValueError:
        raise SubmissionError(f"{what} line {lineno}: expected integers, got {line.strip()[:60]!r}")


def _check_ids(inst, c, v, lineno, what):
    if not (0 <= c < inst.C):
        raise SubmissionError(f"{what} line {lineno}: cache {c} does not exist (0..{inst.C - 1})")
    if v is not None and not (0 <= v < inst.V):
        raise SubmissionError(f"{what} line {lineno}: video {v} does not exist (0..{inst.V - 1})")


def parse_out(inst: Instance, text: str):
    """Read a submission file into {cache: [videos in file order]}.

    Structural errors (wrong ids, wrong line count) raise; capacity overflows
    do not -- they are a scoring matter, reported by `analysis.validate`.
    """
    lines = [l for l in text.replace("\r", "").split("\n") if l.strip()]
    if not lines:
        raise SubmissionError(".out is empty")
    head = _ints(lines[0], 1, ".out")
    if len(head) != 1:
        raise SubmissionError(".out line 1: expected the number of cache servers described")
    n = head[0]
    if n != len(lines) - 1:
        raise SubmissionError(f".out line 1 says {n} cache servers, but {len(lines) - 1} are described")

    placed = {}
    for i, line in enumerate(lines[1:], start=2):
        nums = _ints(line, i, ".out")
        c, videos = nums[0], nums[1:]
        _check_ids(inst, c, None, i, ".out")
        if c in placed:
            raise SubmissionError(f".out line {i}: cache {c} is described twice")
        seen = []
        for v in videos:
            _check_ids(inst, c, v, i, ".out")
            if v not in seen:
                seen.append(v)
        placed[c] = seen
    return placed


def parse_trace(inst: Instance, text: str):
    """Read a trace into a list of ('+'|'-', cache, video, lineno) and ('#', label)."""
    ops = []
    for i, raw in enumerate(text.replace("\r", "").split("\n"), start=1):
        line = raw.strip()
        if not line:
            continue
        if line.startswith("#"):
            ops.append(("#", line[1:].strip(), None, i))
            continue
        sign, rest = line[0], line[1:]
        if sign not in "+-":
            raise SubmissionError(f".trace line {i}: must start with '+', '-' or '#'")
        nums = _ints(rest, i, ".trace")
        if len(nums) != 2:
            raise SubmissionError(f".trace line {i}: expected '{sign} <cache> <video>'")
        _check_ids(inst, nums[0], nums[1], i, ".trace")
        ops.append((sign, nums[0], nums[1], i))
    if not any(op[0] in "+-" for op in ops):
        raise SubmissionError(".trace contains no '+' or '-' lines")
    return ops


def ops_from_out(inst: Instance, placed):
    """No trace: replay the final placement most valuable first.

    File order fills one cache completely before touching the next, which
    looks nothing like any real algorithm. Instead each (cache, video) pair is
    ranked by the latency it would save on its own -- requests times time
    saved, over the endpoints wired to that cache -- per megabyte, so the
    replay lands the big wins first, spread across the whole network. The
    final state, and so the score, is exactly the .out either way.
    """
    ranked = []
    for c, videos in placed.items():
        links = inst.cache_endpoints.get(c, ())
        for v in videos:
            saving = 0
            for e, lat in links:
                n = inst.endpoint_requests[e].get(v) if e in inst.endpoint_requests else None
                if n:
                    saving += n * max(0, inst.endpoint_latency[e] - lat)
            ranked.append((saving / max(1, inst.sizes[v]), c, v))
    ranked.sort(key=lambda t: (-t[0], t[1], t[2]))
    ops = [("#", "final placement, most valuable first (no trace provided)", None, 0)]
    ops += [("+", c, v, 0) for _, c, v in ranked]
    return ops


def replay(inst: Instance, ops, emit):
    """Apply `ops` in order, emitting solver-shaped events with real gains.

    Returns (placement {cache: set}, problems [...], steps). The running sum of
    `gain - loss` equals the saved milliseconds of the final placement, so the
    console's score counter lands exactly on the official score.
    """
    placed = defaultdict(set)
    remaining = {c: inst.X for c in range(inst.C)}
    holders = defaultdict(dict)          # (endpoint, video) -> {cache: latency}
    current_best = defaultdict(dict)     # endpoint -> {video: latency}, for snapshots
    problems = []

    def problem(lineno, kind, detail):
        if len(problems) < MAX_PROBLEMS:
            problems.append({"line": lineno, "kind": kind, "detail": detail})

    moves = sum(1 for op in ops if op[0] in "+-")
    every = max(1, moves // SNAPSHOTS)
    round_no = 0
    done = 0
    started = False

    def snapshot(kind):
        emit(kind, {"round": round_no, "endpoint_latency": _endpoint_latency_snapshot(inst, current_best)})

    for op in ops:
        kind = op[0]
        if kind == "#":
            if started:
                snapshot("round_end")
                round_no += 1
            started = True
            emit("round_start", {"round": round_no, "message": op[1]})
            continue
        if not started:
            emit("round_start", {"round": round_no})
            started = True

        _, c, v, lineno = op
        size = inst.sizes[v]
        if kind == "+":
            if v in placed[c]:
                problem(lineno, "duplicate", f"video {v} is already in cache {c}")
                continue
            if size > remaining[c]:
                problem(lineno, "over_capacity",
                        f"video {v} ({size} MB) does not fit in cache {c} ({remaining[c]} MB free)")
            placed[c].add(v)
            remaining[c] -= size
            gain = improved = 0
            for e, lat in inst.cache_endpoints.get(c, ()):
                n = inst.endpoint_requests[e].get(v) if e in inst.endpoint_requests else None
                if not n:
                    continue
                key = (e, v)
                best = min(holders[key].values(), default=inst.endpoint_latency[e])
                holders[key][c] = lat
                if lat < best:
                    gain += n * (best - lat)
                    improved += 1
                    current_best[e][v] = lat
            emit("place", {"round": round_no, "cache": c, "video": v, "size": size,
                           "gain": gain, "remaining": remaining[c], "endpoints_improved": improved})
        else:
            if v not in placed[c]:
                problem(lineno, "not_present", f"video {v} is not in cache {c}")
                continue
            placed[c].discard(v)
            remaining[c] += size
            loss = 0
            for e, lat in inst.cache_endpoints.get(c, ()):
                n = inst.endpoint_requests[e].get(v) if e in inst.endpoint_requests else None
                if not n:
                    continue
                key = (e, v)
                before = min(holders[key].values(), default=inst.endpoint_latency[e])
                holders[key].pop(c, None)
                after = min(holders[key].values(), default=inst.endpoint_latency[e])
                if after > before:
                    loss += n * (after - before)
                if holders[key]:
                    current_best[e][v] = after
                else:
                    current_best[e].pop(v, None)
            emit("evict", {"round": round_no, "cache": c, "video": v, "size": size,
                           "remaining": remaining[c], "loss": loss})
        done += 1
        if done % every == 0 and done < moves:
            snapshot("progress")

    snapshot("round_end")
    return placed, problems, moves


def compare(trace_placed, out_placed):
    """Where the trace's final state and the .out disagree, cache by cache."""
    diffs = []
    for c in sorted(set(trace_placed) | set(out_placed)):
        a = set(trace_placed.get(c, ()))
        b = set(out_placed.get(c, ()))
        if a != b:
            diffs.append({
                "cache": c,
                "onlyInTrace": sorted(a - b)[:10],
                "onlyInOut": sorted(b - a)[:10],
            })
    return diffs
