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


def solve(inst: Instance, max_rounds: int = 5):
    """
    Iterative greedy by savings-density (see SOLUTION.md for the full
    write-up of the approach).

    Returns: dict cache_id -> set of video ids stored there.
    """
    placed = defaultdict(set)                        # cache -> {video ids}
    remaining_capacity = {c: inst.X for c in range(inst.C)}

    # current_best[e][v] = latency currently achievable for (endpoint e,
    # video v), defaulting to the datacenter latency until a cheaper cache
    # gets assigned that video.
    current_best = defaultdict(dict)

    def best_latency(e, v):
        return current_best[e].get(v, inst.endpoint_latency[e])

    for _round in range(max_rounds):
        placed_this_round = False

        for c in range(inst.C):
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

            for v, gain in candidates:
                if gain <= 0:
                    continue
                size = inst.sizes[v]
                if size <= remaining_capacity[c]:
                    placed[c].add(v)
                    remaining_capacity[c] -= size
                    placed_this_round = True
                    # Update current_best immediately so later caches in
                    # this same round (and the next round) see the
                    # improved latency for this (endpoint, video) pair.
                    for e, lat_c in endpoints:
                        if v in inst.endpoint_requests[e] and lat_c < best_latency(e, v):
                            current_best[e][v] = lat_c

        if not placed_this_round:
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


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input_file")
    parser.add_argument("output_file")
    parser.add_argument("--rounds", type=int, default=5,
                         help="max refinement rounds for the greedy solver")
    args = parser.parse_args()

    inst = parse_input(args.input_file)
    placed = solve(inst, max_rounds=args.rounds)
    write_output(args.output_file, placed, inst.C)
    s = score(inst, placed)
    print(f"Videos: {inst.V}  Endpoints: {inst.E}  Caches: {inst.C}  Requests: {inst.R}")
    print(f"Wrote submission to {args.output_file}")
    print(f"Score: {s}")


if __name__ == "__main__":
    main()
