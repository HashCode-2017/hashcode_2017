#!/usr/bin/env python3
"""Compare placement strategies on generated data sets.

The official Hash Code data sets are not redistributed with the problem PDF,
so to tell whether a change actually helps we generate instances in the same
shape as the real ones (many endpoints, overlapping cache connectivity, a
long-tailed popularity distribution) and score every strategy on each.

Usage:
    python bench.py                 # default sweep
    python bench.py --trials 10 --scale big
"""

import argparse
import random
import time
from pathlib import Path

import solution

# Rough shapes of the official data sets: videos, endpoints, caches, capacity
# MB, and a target request-row count. "big" matches the largest legal instance
# (V=10000, C=1000, R=1e6); "small" keeps the sweep quick.
SCALES = {
    "small": dict(V=200, E=50, C=20, X=500, target_R=5_000),
    "mid": dict(V=2000, E=200, C=100, X=1000, target_R=100_000),
    "big": dict(V=10000, E=1000, C=1000, X=2000, target_R=1_000_000),
}


def generate(rng, V, E, C, X, target_R):
    """Build an Instance directly, skipping the file round-trip.

    Video popularity is Zipf-like and cache latencies are drawn well below
    the data-centre latency, which is what makes placement decisions contend
    for capacity the way the real data sets do. Endpoints connect to several
    overlapping caches on purpose -- that overlap is exactly the case
    index-order greedy resolves badly.
    """
    sizes = [rng.randint(1, max(2, X // 4)) for _ in range(V)]
    endpoint_latency = [rng.randint(300, 4000) for _ in range(E)]
    endpoint_caches = [{} for _ in range(E)]
    for e in range(E):
        k = rng.randint(0, min(C, 8))
        for c in rng.sample(range(C), k):
            endpoint_caches[e][c] = rng.randint(1, endpoint_latency[e])

    # Zipf-like popularity over a random permutation of the video ids, so the
    # popular ids are not just the low-numbered ones.
    hot = rng.sample(range(V), V)
    weights = [1.0 / (i + 1) for i in range(V)]

    # Draw roughly target_R distinct (video, endpoint) pairs. Sampling with
    # replacement and de-duplicating keeps the popularity skew intact.
    rows_per_endpoint = max(1, target_R // E)
    requests = []
    for e in range(E):
        picks = rng.choices(hot, weights=weights, k=rows_per_endpoint)
        seen = set()
        for v in picks:
            if v in seen:
                continue
            seen.add(v)
            requests.append((v, e, rng.randint(1, 10000)))

    return solution.Instance(V, E, len(requests), C, X, sizes,
                             endpoint_latency, endpoint_caches, requests)


def run(strategy, inst):
    start = time.perf_counter()
    if strategy == "rounds":
        placed = solution.solve_rounds(inst)
    else:
        placed = solution.solve_best_first(inst)
    elapsed = time.perf_counter() - start
    solution.validate(inst, placed)
    return solution.score(inst, placed), elapsed


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--scale", choices=sorted(SCALES), default="mid")
    ap.add_argument("--trials", type=int, default=5)
    ap.add_argument("--seed", type=int, default=0)
    args = ap.parse_args()

    shape = SCALES[args.scale]
    print(f"scale={args.scale} {shape}")
    print(f"{'seed':>5} {'rounds':>12} {'best-first':>12} {'delta':>9} "
          f"{'t_rounds':>9} {'t_bf':>9}")

    totals = {"rounds": 0, "best-first": 0}
    for seed in range(args.seed, args.seed + args.trials):
        rng = random.Random(seed)
        inst = generate(rng, **shape)
        s_r, t_r = run("rounds", inst)
        s_b, t_b = run("best-first", inst)
        totals["rounds"] += s_r
        totals["best-first"] += s_b
        delta = (s_b - s_r) / s_r * 100 if s_r else float("nan")
        print(f"{seed:>5} {s_r:>12} {s_b:>12} {delta:>8.2f}% "
              f"{t_r:>8.2f}s {t_b:>8.2f}s")

    n = args.trials
    avg_r = totals["rounds"] / n
    avg_b = totals["best-first"] / n
    lift = (avg_b - avg_r) / avg_r * 100 if avg_r else float("nan")
    print(f"\nmean rounds     : {avg_r:,.0f}")
    print(f"mean best-first : {avg_b:,.0f}  ({lift:+.2f}%)")


if __name__ == "__main__":
    main()
