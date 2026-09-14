#!/usr/bin/env python3
"""
Hash Code 2017 Qualification Round -- "Streaming Videos"

Reads a data set describing videos, endpoints, cache servers and predicted
requests, decides which videos to store in which cache server, and writes a
valid submission file. Also includes a scorer that reproduces the official
scoring formula from the problem statement.

See SOLUTION.md for the full write-up of the approach, the team's task
division, and the thought process behind this implementation.

Usage:
    python solution.py <input_file> <output_file> [--strategy best-first|rounds]
"""

import argparse
import heapq


class Instance:
    """Parsed data set plus the indexes the solver and scorer need.

    Everything keyed by a dense id (video, endpoint, cache) is a list rather
    than a dict, and every index is built exactly once here, so neither the
    solver nor the scorer ever has to re-scan the raw request list.
    """

    __slots__ = ("V", "E", "R", "C", "X", "sizes", "endpoint_latency",
                 "endpoint_caches", "cache_endpoints", "cache_latency",
                 "requests", "endpoint_requests", "video_endpoints")

    def __init__(self, V, E, R, C, X, sizes, endpoint_latency, endpoint_caches,
                 requests):
        self.V = V
        self.E = E
        self.R = R
        self.C = C
        self.X = X
        self.sizes = sizes                        # sizes[v] -> MB
        self.endpoint_latency = endpoint_latency  # endpoint_latency[e] -> L_D
        self.endpoint_caches = endpoint_caches    # endpoint_caches[e] -> {cache: latency}
        self.requests = requests                  # [(v, e, n)] as given in the file

        # cache -> [(endpoint, latency)] for sweeping a cache's demand, and
        # the same data as a dict for O(1) "does cache c serve endpoint e,
        # and how fast" lookups.
        self.cache_endpoints = [[] for _ in range(C)]
        self.cache_latency = [{} for _ in range(C)]
        for e in range(E):
            for c, lat in endpoint_caches[e].items():
                self.cache_endpoints[c].append((e, lat))
                self.cache_latency[c][e] = lat

        # endpoint -> {video: total requests}, plus the reverse index
        # video -> [(endpoint, total requests)]. The reverse index is what
        # lets us recompute the gain of a single (cache, video) pair cheaply.
        self.endpoint_requests = [{} for _ in range(E)]
        for v, e, n in requests:
            er = self.endpoint_requests[e]
            er[v] = er.get(v, 0) + n

        self.video_endpoints = [[] for _ in range(V)]
        for e in range(E):
            for v, n in self.endpoint_requests[e].items():
                self.video_endpoints[v].append((e, n))


def parse_input(path):
    """Parse a data set.

    Reads the whole file as one whitespace-separated token stream rather than
    line by line, so blank lines, a trailing newline and CRLF endings are all
    handled rather than shifting every subsequent field. The two bulk blocks
    (video sizes and the up-to-1,000,000 request rows) are converted with a
    single `map(int, ...)` over a slice instead of per-row parsing, which is
    where nearly all the time in a large data set goes.
    """
    with open(path, "r", encoding="ascii") as f:
        data = f.read().split()

    pos = 0

    def take(k, what):
        nonlocal pos
        chunk = data[pos:pos + k]
        if len(chunk) != k:
            raise ValueError(f"input ended early: {what}")
        pos += k
        return [int(x) for x in chunk]

    V, E, R, C, X = take(5, "expected 5 header values")

    sizes = take(V, f"expected {V} video sizes")

    endpoint_latency = [0] * E
    endpoint_caches = [{} for _ in range(E)]
    for e in range(E):
        L_D, K = take(2, f"inside endpoint {e}")
        endpoint_latency[e] = L_D
        caches = endpoint_caches[e]
        # An endpoint may legally be connected to no caches at all (K == 0).
        pairs = take(2 * K, f"inside endpoint {e} cache list")
        for i in range(0, 2 * K, 2):
            c, Lc = pairs[i], pairs[i + 1]
            if not 0 <= c < C:
                raise ValueError(f"endpoint {e} references unknown cache {c}")
            caches[c] = Lc

    # Bulk-convert the request block in one pass; zip over a shared iterator
    # groups it into (video, endpoint, count) triples without slicing per row.
    need = 3 * R
    chunk = data[pos:pos + need]
    if len(chunk) != need:
        raise ValueError(f"expected {R} request rows, file ended early")
    pos += need
    nums = map(int, chunk)
    requests = list(zip(nums, nums, nums))

    return Instance(V, E, R, C, X, sizes, endpoint_latency, endpoint_caches,
                    requests)


def _gain(inst, best, c, v):
    """Marginal latency saved by adding video `v` to cache `c`, right now.

    `best[e]` holds the latency already achievable for each video at endpoint
    `e`; anything absent is still served by the data centre. Only endpoints
    that both request `v` and are connected to `c` can contribute.
    """
    lats = inst.cache_latency[c]
    if not lats:
        return 0
    endpoint_latency = inst.endpoint_latency
    total = 0
    for e, n in inst.video_endpoints[v]:
        lat = lats.get(e)
        if lat is None:
            continue
        cur = best[e].get(v, endpoint_latency[e])
        if lat < cur:
            total += n * (cur - lat)
    return total


def _commit(inst, best, placed, remaining, c, v):
    """Place `v` in `c` and propagate the improved latency to its endpoints."""
    placed[c].add(v)
    remaining[c] -= inst.sizes[v]
    lats = inst.cache_latency[c]
    endpoint_latency = inst.endpoint_latency
    for e, _n in inst.video_endpoints[v]:
        lat = lats.get(e)
        if lat is None:
            continue
        be = best[e]
        if lat < be.get(v, endpoint_latency[e]):
            be[v] = lat


def solve_best_first(inst):
    """Global best-first greedy by savings-density, with lazy re-evaluation.

    Ranks every (cache, video) candidate by marginal savings per MB across the
    *whole* instance instead of filling caches in index order, so when two
    caches serve the same endpoint the video lands in whichever one actually
    saves more.

    Placing a video can only ever lower the gain of the remaining candidates
    (an endpoint that now reaches it faster has less left to save), never
    raise it. So a candidate popped off the heap whose freshly recomputed
    density still beats the next entry really is the global best -- which is
    what lets us re-evaluate lazily instead of rebuilding every gain after
    every placement.

    Returns: list indexed by cache id of sets of video ids.
    """
    placed = [set() for _ in range(inst.C)]
    remaining = [inst.X] * inst.C
    best = [{} for _ in range(inst.E)]
    sizes = inst.sizes

    # Seed the heap with one entry per (cache, video) pair that could ever
    # help, built by walking each cache's endpoints so the cost stays tied to
    # real demand rather than to V x C.
    heap = []
    for c in range(inst.C):
        gains = {}
        for e, lat_c in inst.cache_endpoints[c]:
            saved = inst.endpoint_latency[e] - lat_c
            if saved <= 0:
                continue  # this cache is no better than the data centre here
            for v, n in inst.endpoint_requests[e].items():
                if sizes[v] > inst.X:
                    continue  # too big for any cache, ever
                gains[v] = gains.get(v, 0) + n * saved
        for v, g in gains.items():
            if g > 0:
                heap.append((-g / sizes[v], c, v))
    heapq.heapify(heap)

    while heap:
        _key, c, v = heapq.heappop(heap)
        size = sizes[v]
        # remaining[] only ever shrinks, so a video that does not fit now can
        # never fit later: drop the candidate instead of re-queuing it.
        if size > remaining[c] or v in placed[c]:
            continue

        g = _gain(inst, best, c, v)
        if g <= 0:
            continue
        density = g / size

        # Stale entry: something placed since we queued it shrank this gain.
        # Re-queue at the true density unless it still tops the heap.
        if heap and -density > heap[0][0]:
            heapq.heappush(heap, (-density, c, v))
            continue

        _commit(inst, best, placed, remaining, c, v)

    return placed


def solve_rounds(inst, max_rounds=5):
    """Original iterative per-cache greedy, kept for comparison.

    Fills caches in index order, re-deriving gains each round until a full
    pass places nothing new. Easier to reason about than `solve_best_first`,
    but biased towards low-numbered caches; see SOLUTION.md section 3.
    """
    placed = [set() for _ in range(inst.C)]
    remaining = [inst.X] * inst.C
    best = [{} for _ in range(inst.E)]
    sizes = inst.sizes

    for _round in range(max_rounds):
        placed_this_round = False

        for c in range(inst.C):
            if remaining[c] <= 0:
                continue
            here = placed[c]
            gains = {}
            for e, lat_c in inst.cache_endpoints[c]:
                be = best[e]
                L_D = inst.endpoint_latency[e]
                for v, n in inst.endpoint_requests[e].items():
                    if v in here or sizes[v] > remaining[c]:
                        continue
                    cur = be.get(v, L_D)
                    if lat_c < cur:
                        gains[v] = gains.get(v, 0) + n * (cur - lat_c)
            if not gains:
                continue

            for v, gain in sorted(gains.items(),
                                  key=lambda kv: kv[1] / sizes[kv[0]],
                                  reverse=True):
                if gain > 0 and sizes[v] <= remaining[c]:
                    _commit(inst, best, placed, remaining, c, v)
                    placed_this_round = True

        if not placed_this_round:
            break

    return placed


STRATEGIES = ("best-first", "rounds")


def validate(inst, placed):
    """Raise if `placed` is not a legal submission."""
    for c, videos in enumerate(placed):
        # Check ids before summing sizes, so a bad id reports itself rather
        # than blowing up on the lookup.
        for v in videos:
            if not 0 <= v < inst.V:
                raise ValueError(f"cache {c} holds unknown video {v}")
        used = sum(inst.sizes[v] for v in videos)
        if used > inst.X:
            raise ValueError(f"cache {c} holds {used}MB > capacity {inst.X}MB")
    return True


def write_output(path, placed):
    used = [c for c, videos in enumerate(placed) if videos]
    with open(path, "w", encoding="ascii", newline="\n") as f:
        f.write(f"{len(used)}\n")
        for c in used:
            videos = " ".join(str(v) for v in sorted(placed[c]))
            f.write(f"{c} {videos}\n")


def score(inst, placed):
    """Recompute the official score: average microseconds saved per request."""
    total_saved_ms = 0
    total_requests = 0

    for v, e, n in inst.requests:
        L_D = inst.endpoint_latency[e]
        best = L_D
        for c, lat_c in inst.endpoint_caches[e].items():
            if lat_c < best and v in placed[c]:
                best = lat_c
        total_saved_ms += n * (L_D - best)
        total_requests += n

    if total_requests == 0:
        return 0
    return (total_saved_ms * 1000) // total_requests


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input_file")
    parser.add_argument("output_file")
    parser.add_argument("--strategy", choices=STRATEGIES, default="best-first",
                        help="placement heuristic (default: best-first)")
    parser.add_argument("--rounds", type=int, default=5,
                        help="max refinement rounds, --strategy rounds only")
    args = parser.parse_args()

    inst = parse_input(args.input_file)
    if args.strategy == "rounds":
        placed = solve_rounds(inst, max_rounds=args.rounds)
    else:
        placed = solve_best_first(inst)
    validate(inst, placed)
    write_output(args.output_file, placed)
    print(f"Videos: {inst.V}  Endpoints: {inst.E}  "
          f"Caches: {inst.C}  Requests: {inst.R}")
    print(f"Wrote submission to {args.output_file}")
    print(f"Score: {score(inst, placed)}")


if __name__ == "__main__":
    main()
