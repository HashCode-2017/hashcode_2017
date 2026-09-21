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
    python solution.py <input_file> <output_file> [--rounds N]
"""

import argparse
import heapq
from collections import defaultdict


class Instance:
    def __init__(self, V, E, R, C, X, sizes, endpoint_latency, endpoint_caches, requests):
        self.V = V
        self.E = E
        self.R = R
        self.C = C
        self.X = X
        self.sizes = sizes                          # sizes[v] -> MB
        self.endpoint_latency = endpoint_latency     # endpoint_latency[e] -> L_D
        self.endpoint_caches = endpoint_caches       # endpoint_caches[e] -> {cache_id: latency}
        self.requests = requests                     # list of (v, e, n) as given in the file

        # Aggregated endpoint -> video -> total requests, and the reverse
        # index cache -> [(endpoint, latency), ...], both built once and
        # reused by the solver so it never has to re-scan the raw request
        # list.
        self.endpoint_requests = defaultdict(lambda: defaultdict(int))
        for v, e, n in requests:
            self.endpoint_requests[e][v] += n

        self.cache_endpoints = defaultdict(list)
        for e, caches in endpoint_caches.items():
            for c, lat in caches.items():
                self.cache_endpoints[c].append((e, lat))


def parse_input(path):
    with open(path, "r", encoding="ascii") as f:
        tokens = f.read().split("\n")

    lines = iter(tokens)

    def next_ints():
        return [int(x) for x in next(lines).split()]

    V, E, R, C, X = next_ints()
    sizes = next_ints()
    assert len(sizes) == V, "video size count does not match V"

    endpoint_latency = {}
    endpoint_caches = {}
    for e in range(E):
        L_D, K = next_ints()
        endpoint_latency[e] = L_D
        caches = {}
        for _ in range(K):
            c, Lc = next_ints()
            caches[c] = Lc
        endpoint_caches[e] = caches

    requests = []
    for _ in range(R):
        Rv, Re, Rn = next_ints()
        requests.append((Rv, Re, Rn))

    return Instance(V, E, R, C, X, sizes, endpoint_latency, endpoint_caches, requests)


TOP_CANDIDATES = 12


def _endpoint_latency_snapshot(inst: "Instance", current_best):
    """Demand-weighted average achieved latency for every endpoint.

    Emitted once per round (not per placement) so an observer can animate
    per-endpoint improvement without the solver having to report every single
    latency update -- on the largest data set those number in the millions,
    while this snapshot is only E values wide.
    """
    snapshot = []
    for e in range(inst.E):
        L_D = inst.endpoint_latency[e]
        demand = inst.endpoint_requests.get(e)
        best_here = current_best.get(e)
        total_n = 0
        weighted = 0
        if demand:
            for v, n in demand.items():
                lat = best_here.get(v, L_D) if best_here else L_D
                total_n += n
                weighted += n * lat
        snapshot.append(round(weighted / total_n, 2) if total_n else float(L_D))
    return snapshot


def evict_dead_weight(inst: Instance, placed):
    """
    (cache, video) pairs whose removal provably cannot change the score.

    The rounds never undo a placement, so a cache can keep a copy that a later
    placement made redundant: another holder now reaches every endpoint that
    wanted it at an equal or better latency. Such a copy saves nothing yet
    still occupies megabytes that a different video could use.

    Candidates are tested against a running set, so two caches that are
    redundant only with respect to each other never both get dropped.
    """
    holders = defaultdict(dict)                      # (endpoint, video) -> {cache: latency}
    for c, videos in placed.items():
        for e, lat in inst.cache_endpoints[c]:
            requested = inst.endpoint_requests[e]
            for v in videos:
                if v in requested:
                    holders[(e, v)][c] = lat

    evictions = []
    for c in sorted(placed):
        for v in sorted(placed[c]):
            dominated = True
            served = []
            for e, lat_c in inst.cache_endpoints[c]:
                if v not in inst.endpoint_requests[e]:
                    continue
                best_without = inst.endpoint_latency[e]
                for other, lat in holders[(e, v)].items():
                    if other != c and lat < best_without:
                        best_without = lat
                if best_without > lat_c:
                    dominated = False
                    break
                served.append((e, v))
            if dominated:
                evictions.append((c, v))
                for key in served:
                    holders[key].pop(c, None)
    return evictions


def _greedy_fill(inst: Instance, placed, remaining_capacity, current_best,
                 max_rounds, on_event=None, round_offset=0):
    """
    Iterative greedy by savings-density, resumed from whatever is already
    placed. Mutates `placed`, `remaining_capacity` and `current_best`;
    returns how many videos it placed.
    """

    def best_latency(e, v):
        return current_best[e].get(v, inst.endpoint_latency[e])

    # An observer wants to watch endpoint latency fall as the caches fill, but
    # reporting every individual (endpoint, video) improvement means millions
    # of events on the largest data set. Sampling the whole endpoint vector a
    # handful of times per round costs E floats per sample and is enough to
    # animate smoothly.
    snap_every = max(1, inst.C // 10)
    total_placements = 0

    for _pass in range(max_rounds):
        _round = round_offset + _pass
        placed_this_round = False
        round_placements = 0
        round_gain = 0

        if on_event:
            on_event("round_start", {"round": _round})

        for c in range(inst.C):
            if on_event and c and c % snap_every == 0:
                on_event("progress", {
                    "round": _round,
                    "cache": c,
                    "endpoint_latency": _endpoint_latency_snapshot(inst, current_best),
                })
            if remaining_capacity[c] <= 0:
                continue
            endpoints = inst.cache_endpoints.get(c)
            if not endpoints:
                continue

            # Marginal gain of adding video v to cache c, given the best
            # latency currently known for each (endpoint, video) pair.
            gains = defaultdict(int)
            for e, lat_c in endpoints:
                for v, n in inst.endpoint_requests[e].items():
                    if v in placed[c]:
                        continue
                    cur = best_latency(e, v)
                    if lat_c < cur:
                        gains[v] += n * (cur - lat_c)

            if not gains:
                continue

            # Greedy 0/1 knapsack: take candidates in decreasing
            # gain/size order while they still fit in the cache.
            candidates = sorted(
                gains.items(),
                key=lambda item: item[1] / inst.sizes[item[0]],
                reverse=True,
            )

            if on_event:
                on_event("cache_scan", {
                    "round": _round,
                    "cache": c,
                    "candidates": len(candidates),
                    "remaining": remaining_capacity[c],
                    # Only the head of the ranking -- that is what makes the
                    # gain-per-megabyte rule legible; the tail never fits.
                    "top": [
                        {"video": v, "gain": g, "size": inst.sizes[v]}
                        for v, g in candidates[:TOP_CANDIDATES]
                    ],
                })

            for v, gain in candidates:
                if gain <= 0:
                    continue
                size = inst.sizes[v]
                if size <= remaining_capacity[c]:
                    placed[c].add(v)
                    remaining_capacity[c] -= size
                    placed_this_round = True
                    round_placements += 1
                    round_gain += gain
                    # Update current_best immediately so later caches in
                    # this same round (and the next round) see the
                    # improved latency for this (endpoint, video) pair.
                    improved = 0
                    for e, lat_c in endpoints:
                        if v in inst.endpoint_requests[e] and lat_c < best_latency(e, v):
                            current_best[e][v] = lat_c
                            improved += 1
                    if on_event:
                        on_event("place", {
                            "round": _round,
                            "cache": c,
                            "video": v,
                            "size": size,
                            "gain": gain,
                            "remaining": remaining_capacity[c],
                            "endpoints_improved": improved,
                        })

        if on_event:
            on_event("round_end", {
                "round": _round,
                "placements": round_placements,
                "gain": round_gain,
                "endpoint_latency": _endpoint_latency_snapshot(inst, current_best),
            })

        total_placements += round_placements

        if not placed_this_round:
            break

    return total_placements


def _global_fill(inst: Instance, placed, remaining_capacity, current_best,
                 video_requests, on_event=None, round_no=0):
    """
    One round of network-wide greedy: every (cache, video) pair competes in a
    single max-heap keyed by savings per megabyte, so no cache gets to fill up
    before the others have bid for the same videos.

    Keys are lazy. A placement only ever lowers other pairs' gains, so a
    stored key is an upper bound: a popped pair is re-scored and placed only
    if its true gain still equals the key, otherwise it goes back in at its
    new value. Returns how many videos it placed.
    """
    sizes = inst.sizes
    endpoint_caches = inst.endpoint_caches
    endpoint_latency = inst.endpoint_latency

    def gain_of(c, v):
        total = 0
        best_e = current_best
        for e, n in video_requests[v]:
            lat_c = endpoint_caches[e].get(c)
            if lat_c is not None:
                cur = best_e[e].get(v, endpoint_latency[e])
                if lat_c < cur:
                    total += n * (cur - lat_c)
        return total

    heap = []
    for c in range(inst.C):
        if remaining_capacity[c] <= 0:
            continue
        endpoints = inst.cache_endpoints.get(c)
        if not endpoints:
            continue
        gains = defaultdict(int)
        for e, lat_c in endpoints:
            best_e = current_best[e]
            L_D = endpoint_latency[e]
            for v, n in inst.endpoint_requests[e].items():
                cur = best_e.get(v, L_D)
                if lat_c < cur and v not in placed[c]:
                    gains[v] += n * (cur - lat_c)
        cap = remaining_capacity[c]
        for v, g in gains.items():
            if sizes[v] <= cap:
                heap.append((-g / sizes[v], c, v, g))
    heapq.heapify(heap)

    if on_event:
        on_event("round_start", {"round": round_no})

    # Snapshots cost O(requests) each, so sample by placement count rather
    # than per placement.
    snap_every = max(20, inst.C)
    placements = 0
    round_gain = 0
    while heap:
        _, c, v, g = heapq.heappop(heap)
        size = sizes[v]
        if size > remaining_capacity[c]:
            continue                                  # capacity only shrinks
        actual = gain_of(c, v)
        if actual <= 0:
            continue
        if actual < g:
            heapq.heappush(heap, (-actual / size, c, v, actual))
            continue

        placed[c].add(v)
        remaining_capacity[c] -= size
        placements += 1
        round_gain += actual
        improved = 0
        for e, _n in video_requests[v]:
            lat_c = endpoint_caches[e].get(c)
            if lat_c is not None and lat_c < current_best[e].get(v, endpoint_latency[e]):
                current_best[e][v] = lat_c
                improved += 1
        if on_event:
            on_event("place", {
                "round": round_no,
                "cache": c,
                "video": v,
                "size": size,
                "gain": actual,
                "remaining": remaining_capacity[c],
                "endpoints_improved": improved,
            })
            if placements % snap_every == 0:
                on_event("progress", {
                    "round": round_no,
                    "endpoint_latency": _endpoint_latency_snapshot(inst, current_best),
                })

    if on_event:
        on_event("round_end", {
            "round": round_no,
            "placements": placements,
            "gain": round_gain,
            "endpoint_latency": _endpoint_latency_snapshot(inst, current_best),
        })
    return placements


SWAP_CANDIDATES = 20
MAX_SWAPS_PER_CACHE = 50


def swap_pass(inst: Instance, placed, remaining_capacity, current_best,
              on_event=None, round_no=0):
    """
    Local search: in each cache, replace low-value copies with a video that
    saves more than they do together.

    A copy's value is what the score loses if it goes -- at each endpoint
    where it is the fastest holder, the gap to the next-best holder (or the
    datacenter). Within one cache the removed videos and the incoming one are
    all different videos, so they touch disjoint (endpoint, video) pairs and
    the net change is exactly gain(incoming) - sum(values removed). A swap is
    taken only if that is strictly positive, so the score only ever rises and
    the search terminates. Eviction is the special case of removing copies
    worth 0 without adding anything.

    Mutates `placed`, `remaining_capacity` and `current_best`; returns the
    number of swaps made.
    """
    sizes = inst.sizes
    LD = inst.endpoint_latency

    holders = defaultdict(dict)                      # (endpoint, video) -> {cache: latency}
    for c, videos in placed.items():
        for e, lat in inst.cache_endpoints[c]:
            requested = inst.endpoint_requests[e]
            for v in videos:
                if v in requested:
                    holders[(e, v)][c] = lat

    def remove(c, v, endpoints):
        placed[c].discard(v)
        remaining_capacity[c] += sizes[v]
        for e, lat_c in endpoints:
            if v not in inst.endpoint_requests[e]:
                continue
            h = holders[(e, v)]
            h.pop(c, None)
            if current_best[e].get(v) == lat_c:
                m = min(h.values(), default=LD[e])
                if m < LD[e]:
                    current_best[e][v] = m
                else:
                    del current_best[e][v]

    def add(c, v, endpoints):
        placed[c].add(v)
        remaining_capacity[c] -= sizes[v]
        improved = 0
        for e, lat_c in endpoints:
            if v not in inst.endpoint_requests[e]:
                continue
            holders[(e, v)][c] = lat_c
            if lat_c < current_best[e].get(v, LD[e]):
                current_best[e][v] = lat_c
                improved += 1
        return improved

    swaps = 0
    for c in range(inst.C):
        endpoints = inst.cache_endpoints.get(c)
        if not endpoints or not placed.get(c):
            continue
        for _ in range(MAX_SWAPS_PER_CACHE):
            here = placed[c]
            values = dict.fromkeys(here, 0)
            gains = defaultdict(int)
            for e, lat_c in endpoints:
                best_e = current_best[e]
                L = LD[e]
                for v, n in inst.endpoint_requests[e].items():
                    if v in here:
                        second = L
                        for other, lat in holders[(e, v)].items():
                            if other != c and lat < second:
                                second = lat
                        if second > lat_c:
                            values[v] += n * (second - lat_c)
                    else:
                        cur = best_e.get(v, L)
                        if lat_c < cur:
                            gains[v] += n * (cur - lat_c)
            if not gains:
                break

            # Cheapest copies to give up first: least value per megabyte.
            by_cost = sorted(here, key=lambda v: values[v] / sizes[v])
            free = remaining_capacity[c]
            best = None
            for w, g in heapq.nlargest(SWAP_CANDIDATES, gains.items(), key=lambda it: it[1]):
                need = sizes[w] - free
                cost = 0
                out = []
                for v in by_cost:
                    if need <= 0:
                        break
                    out.append(v)
                    cost += values[v]
                    need -= sizes[v]
                if need > 0:
                    continue
                net = g - cost
                if net > 0 and (best is None or net > best[0]):
                    best = (net, w, g, out)
            if best is None:
                break

            _net, w, g, out = best
            for v in out:
                remove(c, v, endpoints)
                if on_event:
                    on_event("evict", {
                        "round": round_no, "cache": c, "video": v, "size": sizes[v],
                        "remaining": remaining_capacity[c],
                        "reason": "swap", "loss": values[v],
                    })
            improved = add(c, w, endpoints)
            swaps += 1
            if on_event:
                on_event("place", {
                    "round": round_no, "cache": c, "video": w, "size": sizes[w],
                    "gain": g, "remaining": remaining_capacity[c],
                    "endpoints_improved": improved,
                })
    return swaps


STRATEGIES = ("global", "per-cache")


def solve(inst: Instance, max_rounds: int = 5, on_event=None, evict: bool = True,
          strategy: str = "global", swap: bool = True):
    """
    Iterative greedy by savings-density, evicting dead weight after every
    round (see SOLUTION.md for the full write-up of the approach).

    Each round fills the caches, then hands back any copy that has become
    dominated -- another holder now reaches every endpoint that wanted it at
    least as fast -- so the next round can spend that capacity on something
    that still pays. Evicting once at the end instead finds roughly half as
    much on the sparser data sets, because a refill creates dead weight of
    its own that a single pass never revisits.

    `on_event(kind, payload)` is an optional, purely observational callback
    invoked at the natural checkpoints of the search -- round boundaries,
    cache scans, placements and evictions. The search behaves identically
    whether or not it is supplied; it exists so the demo console in `api/`
    can visualise a run as it happens. See DEMO.md.

    `evict=False` skips the eviction entirely, reproducing the plain greedy
    behaviour.

    Returns: dict cache_id -> set of video ids stored there.
    """
    placed = defaultdict(set)                        # cache -> {video ids}
    remaining_capacity = {c: inst.X for c in range(inst.C)}

    # current_best[e][v] = latency currently achievable for (endpoint e,
    # video v), defaulting to the datacenter latency until a cheaper cache
    # gets assigned that video.
    current_best = defaultdict(dict)

    if strategy not in STRATEGIES:
        raise ValueError(f"unknown strategy {strategy!r}, expected one of {STRATEGIES}")
    if strategy == "global":
        video_requests = defaultdict(list)           # video -> [(endpoint, requests)]
        for e, reqs in inst.endpoint_requests.items():
            for v, n in reqs.items():
                video_requests[v].append((e, n))

    for _round in range(max_rounds):
        if strategy == "global":
            placements = _global_fill(inst, placed, remaining_capacity, current_best,
                                      video_requests, on_event, round_no=_round)
        else:
            placements = _greedy_fill(inst, placed, remaining_capacity, current_best,
                                      1, on_event, round_offset=_round)

        evicted = 0
        if evict:
            # Dropping a dominated copy cannot change current_best: the test
            # is that another holder is already at least as fast at every
            # endpoint that mattered, so the table stays correct as it is.
            for c, v in evict_dead_weight(inst, placed):
                placed[c].discard(v)
                remaining_capacity[c] += inst.sizes[v]
                evicted += 1
                if on_event:
                    on_event("evict", {
                        "round": _round,
                        "cache": c,
                        "video": v,
                        "size": inst.sizes[v],
                        "remaining": remaining_capacity[c],
                    })

        swapped = 0
        if swap:
            swapped = swap_pass(inst, placed, remaining_capacity, current_best,
                                on_event, round_no=_round)

        if not placements and not evicted and not swapped:
            break

    return placed


def write_output(path, placed, C):
    used = [c for c in range(C) if placed.get(c)]
    with open(path, "w", encoding="ascii", newline="\n") as f:
        f.write(f"{len(used)}\n")
        for c in used:
            videos = " ".join(str(v) for v in sorted(placed[c]))
            f.write(f"{c} {videos}\n")


def score(inst: Instance, placed):
    """Recompute the official score: average microseconds saved per request."""
    total_saved_ms = 0
    total_requests = 0

    for v, e, n in inst.requests:
        L_D = inst.endpoint_latency[e]
        best = L_D
        for c, lat_c in inst.endpoint_caches[e].items():
            if v in placed.get(c, ()) and lat_c < best:
                best = lat_c
        total_saved_ms += n * (L_D - best)
        total_requests += n

    if total_requests == 0:
        return 0
    return (total_saved_ms * 1000) // total_requests


def _limited(items, limit):
    """First `limit` items (all if limit is 0) and how many were left out."""
    items = list(items)
    if limit and len(items) > limit:
        return items[:limit], len(items) - limit
    return items, 0


def _more(hidden, what):
    if hidden:
        print(f"    ... {hidden:,} more {what} (use --log-limit 0 to show all)")


def log_input(inst: Instance, path, limit):
    print(f"=== INPUT: {path}")
    print(f"  line 1  'V E R C X' = {inst.V} {inst.E} {inst.R} {inst.C} {inst.X}")
    print(f"          {inst.V:,} videos, {inst.E:,} endpoints, {inst.R:,} request descriptions, "
          f"{inst.C:,} caches of {inst.X:,} MB each")

    print("  line 2  video sizes in MB, one per video:")
    shown, hidden = _limited(enumerate(inst.sizes), limit)
    print("    " + "  ".join(f"v{v}={s}" for v, s in shown))
    _more(hidden, "videos")

    print("  endpoint blocks  'L_D K', then K lines 'cache latency':")
    shown, hidden = _limited(range(inst.E), limit)
    for e in shown:
        links = sorted(inst.endpoint_caches[e].items(), key=lambda cl: cl[1])
        via = ", ".join(f"c{c} {lat}ms" for c, lat in links) or "no caches"
        print(f"    e{e}: datacenter {inst.endpoint_latency[e]}ms, "
              f"{len(links)} caches -> {via}")
    _more(hidden, "endpoints")

    print("  request lines  'video endpoint count':")
    shown, hidden = _limited(inst.requests, limit)
    for v, e, n in shown:
        print(f"    v{v} requested {n:,} times from e{e}")
    _more(hidden, "request lines")


def log_placement(inst: Instance, placed, path, limit):
    used = [c for c in range(inst.C) if placed.get(c)]
    total_mb = sum(inst.sizes[v] for c in used for v in placed[c])
    print(f"=== STORED IN CACHES: {len(used):,} of {inst.C:,} caches used, "
          f"{total_mb:,} of {inst.C * inst.X:,} MB filled")
    shown, hidden = _limited(range(inst.C), limit)
    for c in shown:
        videos = sorted(placed.get(c, ()))
        mb = sum(inst.sizes[v] for v in videos)
        vids, more_v = _limited(videos, limit)
        listing = " ".join(f"v{v}" for v in vids) + (f" ... +{more_v} more" if more_v else "")
        print(f"    c{c}: {mb:>6,}/{inst.X:,} MB, {len(videos):>4} videos  {listing or '(empty)'}")
    _more(hidden, "caches")

    lines = [str(len(used))] + [f"{c} " + " ".join(map(str, sorted(placed[c]))) for c in used]
    shown, hidden = _limited(lines, limit + 1 if limit else 0)
    for line in shown:
        print(f"    | {line if len(line) <= 100 else line[:100] + ' ...'}")
    _more(hidden, "lines")


def log_score(inst: Instance, placed):
    total_saved_ms = 0
    total_requests = 0
    from_cache = 0
    for v, e, n in inst.requests:
        L_D = inst.endpoint_latency[e]
        best = L_D
        for c, lat_c in inst.endpoint_caches[e].items():
            if v in placed.get(c, ()) and lat_c < best:
                best = lat_c
        total_saved_ms += n * (L_D - best)
        total_requests += n
        if best < L_D:
            from_cache += n
    s = (total_saved_ms * 1000) // total_requests if total_requests else 0
    print("\n=== SCORE")
    print(f"  requests: {total_requests:,}, served from a cache: {from_cache:,} "
          f"({from_cache / total_requests:.1%})" if total_requests else "  no requests")
    print(f"  score = saved ms x 1000 / requests (rounded down) = {s:,} microseconds per request")
    return s


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input_file")
    parser.add_argument("output_file")
    parser.add_argument("--rounds", type=int, default=5,
                         help="max refinement rounds for the greedy solver")
    parser.add_argument("--no-evict", action="store_true",
                         help="skip the dead-weight eviction and refill pass")
    parser.add_argument("--strategy", choices=STRATEGIES, default="global",
                         help="global: one queue over every (cache, video) pair; "
                              "per-cache: fill caches one at a time in id order")
    parser.add_argument("--no-swap", action="store_true",
                         help="skip the swap local search after each round")
    parser.add_argument("--log-limit", type=int, default=10,
                         help="max entries shown per list in the log (0 = show everything)")
    parser.add_argument("--show-input", action="store_true",
                         help="also log the parsed input data")
    args = parser.parse_args()

    inst = parse_input(args.input_file)
    if args.show_input:
        log_input(inst, args.input_file, args.log_limit)
        print()
    placed = solve(inst, max_rounds=args.rounds, evict=not args.no_evict,
                   strategy=args.strategy, swap=not args.no_swap)
    write_output(args.output_file, placed, inst.C)
    log_placement(inst, placed, args.output_file, args.log_limit)
    log_score(inst, placed)


if __name__ == "__main__":
    main()
