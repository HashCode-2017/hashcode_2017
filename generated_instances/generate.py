#!/usr/bin/env python3
"""
Instance generator for Hash Code 2017 — "Streaming Videos".

Generates a dataset of problem instances that systematically vary the
structural parameters known to affect solver difficulty:

  1. Network density   — how many caches each endpoint can reach.
  2. Capacity pressure — total cache space vs. total video catalog size.
  3. Demand skew       — whether requests concentrate on few hot videos
                         (Zipf) or spread uniformly.
  4. Latency structure — uniform DC/cache latencies vs. varied ones.
  5. Scale             — from tiny debugging instances to mid-size ones
                         comparable to the official "me_at_the_zoo".

Every generated file is a valid .in file that solution.py can parse and
solve directly.  The generator also produces a manifest.csv summarising
every instance's parameters for easy experimental comparison.

Constraints enforced (from the problem statement):
  1 ≤ V ≤ 10000          video count
  1 ≤ S_i ≤ 1000         video size in MB
  1 ≤ E ≤ 1000           endpoint count
  2 ≤ L_D ≤ 4000         datacenter latency (ms)
  0 ≤ K ≤ C              caches per endpoint
  1 ≤ L_c < L_D          cache latency (ms), strictly less than L_D
  1 ≤ C ≤ 1000           cache count
  1 ≤ X ≤ 500000         cache capacity (MB)
  1 ≤ R ≤ 1000000        request descriptions
  1 ≤ R_n ≤ 10000        requests per description

Usage:
    python generate.py                     # writes to current directory
    python generate.py --out-dir ../data   # writes elsewhere
    python generate.py --seed 12345        # reproducible run
"""

import argparse
import csv
import math
import os
import random
from dataclasses import dataclass, field
from typing import List, Optional


# ---------------------------------------------------------------------------
# Instance specification: what knobs to turn
# ---------------------------------------------------------------------------

@dataclass
class InstanceSpec:
    """Blueprint for one generated instance."""
    name: str
    V: int                          # number of videos
    E: int                          # number of endpoints
    C: int                          # number of cache servers
    R: int                          # number of request descriptions
    X: int                          # cache capacity (MB)

    # Video sizes ---------------------------------------------------------
    size_min: int = 1               # min video size (MB)
    size_max: int = 100             # max video size (MB)

    # Network topology ---------------------------------------------------
    density: float = 0.3            # fraction of caches each endpoint sees
    k0_fraction: float = 0.0       # fraction of endpoints with K=0

    # Latency structure --------------------------------------------------
    dc_latency_min: int = 400       # datacenter latency range
    dc_latency_max: int = 1200
    cache_latency_min: int = 10     # cache latency range
    cache_latency_max: int = 200

    # Demand skew --------------------------------------------------------
    zipf_a: float = 1.0             # Zipf exponent (0 = uniform, >1 = skewed)
    video_coverage: float = 0.5     # fraction of videos that appear in requests
    endpoint_coverage: float = 1.0  # fraction of endpoints that make requests
    request_min: int = 1            # request count range per description
    request_max: int = 5000

    # Derived tag for manifest -------------------------------------------
    tag: str = ""                   # short description of what this tests


# ---------------------------------------------------------------------------
# The 12-instance experimental dataset
# ---------------------------------------------------------------------------

INSTANCE_SPECS: List[InstanceSpec] = [
    # -- Tiny: quick sanity-checks / debugging ----------------------------
    InstanceSpec(
        name="tiny_sparse",
        tag="tiny, sparse network",
        V=10, E=4, C=5, R=15, X=80,
        density=0.3, k0_fraction=0.25,
        size_min=10, size_max=60,
        dc_latency_min=800, dc_latency_max=1200,
        cache_latency_min=50, cache_latency_max=200,
        zipf_a=0.0, video_coverage=0.8,
        request_min=100, request_max=2000,
    ),
    InstanceSpec(
        name="tiny_dense",
        tag="tiny, dense network (all caches reachable)",
        V=10, E=4, C=5, R=20, X=120,
        density=1.0, k0_fraction=0.0,
        size_min=10, size_max=50,
        dc_latency_min=600, dc_latency_max=600,
        cache_latency_min=50, cache_latency_max=100,
        zipf_a=0.0, video_coverage=1.0,
        request_min=500, request_max=3000,
    ),

    # -- Small: readable but enough structure to exercise the algorithm ---
    InstanceSpec(
        name="small_sparse_uniform",
        tag="small, sparse, uniform demand",
        V=50, E=10, C=8, R=80, X=200,
        density=0.25, k0_fraction=0.1,
        size_min=5, size_max=80,
        dc_latency_min=500, dc_latency_max=1500,
        cache_latency_min=20, cache_latency_max=200,
        zipf_a=0.0, video_coverage=0.6,
        request_min=50, request_max=3000,
    ),
    InstanceSpec(
        name="small_sparse_skewed",
        tag="small, sparse, Zipf-skewed demand",
        V=50, E=10, C=8, R=80, X=200,
        density=0.25, k0_fraction=0.1,
        size_min=5, size_max=80,
        dc_latency_min=500, dc_latency_max=1500,
        cache_latency_min=20, cache_latency_max=200,
        zipf_a=1.5, video_coverage=0.6,
        request_min=50, request_max=3000,
    ),
    InstanceSpec(
        name="small_dense_uniform",
        tag="small, dense, uniform demand",
        V=50, E=10, C=8, R=100, X=300,
        density=0.8, k0_fraction=0.0,
        size_min=5, size_max=80,
        dc_latency_min=500, dc_latency_max=1500,
        cache_latency_min=10, cache_latency_max=150,
        zipf_a=0.0, video_coverage=0.7,
        request_min=100, request_max=5000,
    ),
    InstanceSpec(
        name="small_dense_skewed",
        tag="small, dense, Zipf-skewed demand",
        V=50, E=10, C=8, R=100, X=300,
        density=0.8, k0_fraction=0.0,
        size_min=5, size_max=80,
        dc_latency_min=500, dc_latency_max=1500,
        cache_latency_min=10, cache_latency_max=150,
        zipf_a=1.5, video_coverage=0.7,
        request_min=100, request_max=5000,
    ),

    # -- Medium: comparable to me_at_the_zoo (100V, 10E, 10C) ------------
    InstanceSpec(
        name="medium_tight_capacity",
        tag="medium, tight capacity (capacity/catalog ≈ 0.2)",
        V=100, E=15, C=10, R=200, X=80,
        density=0.3, k0_fraction=0.0,
        size_min=5, size_max=50,
        dc_latency_min=400, dc_latency_max=1400,
        cache_latency_min=10, cache_latency_max=200,
        zipf_a=1.0, video_coverage=0.5,
        request_min=10, request_max=5000,
    ),
    InstanceSpec(
        name="medium_loose_capacity",
        tag="medium, generous capacity (capacity/catalog ≈ 0.8)",
        V=100, E=15, C=10, R=200, X=400,
        density=0.3, k0_fraction=0.0,
        size_min=5, size_max=50,
        dc_latency_min=400, dc_latency_max=1400,
        cache_latency_min=10, cache_latency_max=200,
        zipf_a=1.0, video_coverage=0.5,
        request_min=10, request_max=5000,
    ),
    InstanceSpec(
        name="medium_full_mesh",
        tag="medium, every endpoint sees every cache",
        V=100, E=15, C=10, R=250, X=250,
        density=1.0, k0_fraction=0.0,
        size_min=10, size_max=60,
        dc_latency_min=600, dc_latency_max=600,
        cache_latency_min=50, cache_latency_max=100,
        zipf_a=0.8, video_coverage=0.8,
        request_min=100, request_max=8000,
    ),
    InstanceSpec(
        name="medium_heavy_skew",
        tag="medium, extreme Zipf skew (a=2.0)",
        V=100, E=15, C=10, R=200, X=200,
        density=0.4, k0_fraction=0.1,
        size_min=5, size_max=80,
        dc_latency_min=300, dc_latency_max=2000,
        cache_latency_min=5, cache_latency_max=250,
        zipf_a=2.0, video_coverage=0.4,
        request_min=1, request_max=10000,
    ),

    # -- Larger: stress the algorithm without being enormous --------------
    InstanceSpec(
        name="large_sparse",
        tag="larger scale, sparse (like videos_worth_spreading shape)",
        V=500, E=40, C=30, R=2000, X=500,
        density=0.15, k0_fraction=0.05,
        size_min=1, size_max=200,
        dc_latency_min=200, dc_latency_max=2000,
        cache_latency_min=5, cache_latency_max=200,
        zipf_a=1.2, video_coverage=0.5,
        request_min=1, request_max=8000,
    ),
    InstanceSpec(
        name="large_dense",
        tag="larger scale, dense (like kittens shape)",
        V=500, E=50, C=25, R=3000, X=1000,
        density=0.7, k0_fraction=0.0,
        size_min=1, size_max=300,
        dc_latency_min=500, dc_latency_max=3000,
        cache_latency_min=1, cache_latency_max=400,
        zipf_a=1.0, video_coverage=0.7,
        request_min=1, request_max=10000,
    ),
]


# ---------------------------------------------------------------------------
# Zipf-distributed random choice
# ---------------------------------------------------------------------------

def zipf_weights(n: int, a: float) -> List[float]:
    """Unnormalized Zipf weights for ranks 1..n.

    a = 0 gives uniform weights; a > 0 concentrates probability on low ranks.
    """
    if a <= 0 or n <= 0:
        return [1.0] * n
    return [1.0 / (k ** a) for k in range(1, n + 1)]


# ---------------------------------------------------------------------------
# Core generator
# ---------------------------------------------------------------------------

def generate_instance(spec: InstanceSpec, rng: random.Random) -> str:
    """Build a valid .in file from a specification.  Returns the file text."""

    # -- video sizes ------------------------------------------------------
    sizes = [rng.randint(spec.size_min, spec.size_max) for _ in range(spec.V)]

    # -- endpoint topology ------------------------------------------------
    endpoint_latency: List[int] = []       # L_D per endpoint
    endpoint_caches: List[List[tuple]] = []  # [(cache_id, latency), ...] per endpoint

    # Decide which endpoints get K=0
    k0_count = int(round(spec.k0_fraction * spec.E))
    k0_set = set(rng.sample(range(spec.E), min(k0_count, spec.E)))

    all_caches = list(range(spec.C))

    for e in range(spec.E):
        L_D = rng.randint(spec.dc_latency_min, spec.dc_latency_max)
        endpoint_latency.append(L_D)

        if e in k0_set:
            endpoint_caches.append([])
            continue

        # Pick K caches for this endpoint
        K = max(1, int(round(spec.density * spec.C)))
        K = min(K, spec.C)
        connected = rng.sample(all_caches, K)

        links = []
        for c in connected:
            # Cache latency must be in [cache_latency_min, min(cache_latency_max, L_D - 1)]
            lat_hi = min(spec.cache_latency_max, L_D - 1)
            lat_lo = min(spec.cache_latency_min, lat_hi)
            if lat_lo > lat_hi:
                lat_lo = lat_hi
            lat = rng.randint(lat_lo, lat_hi)
            links.append((c, lat))
        endpoint_caches.append(links)

    # -- request descriptions ---------------------------------------------
    # Pick the pool of videos that will be requested (video_coverage)
    num_requested_videos = max(1, int(round(spec.video_coverage * spec.V)))
    requested_videos = rng.sample(range(spec.V), num_requested_videos)

    # Pick the pool of endpoints that generate requests (endpoint_coverage)
    active_endpoints = list(range(spec.E))
    if spec.endpoint_coverage < 1.0:
        n_active = max(1, int(round(spec.endpoint_coverage * spec.E)))
        active_endpoints = rng.sample(active_endpoints, n_active)

    # Build Zipf weights over videos (rank = position in requested_videos)
    weights = zipf_weights(len(requested_videos), spec.zipf_a)

    requests = []
    seen_pairs = set()
    attempts = 0
    max_attempts = spec.R * 20  # safety valve

    while len(requests) < spec.R and attempts < max_attempts:
        attempts += 1
        # Pick a video weighted by Zipf
        v = rng.choices(requested_videos, weights=weights, k=1)[0]
        # Pick an endpoint uniformly from active ones
        e = rng.choice(active_endpoints)
        pair = (v, e)
        if pair in seen_pairs:
            continue
        seen_pairs.add(pair)
        n = rng.randint(spec.request_min, spec.request_max)
        requests.append((v, e, n))

    R = len(requests)

    # -- assemble the .in text --------------------------------------------
    lines = []
    lines.append(f"{spec.V} {spec.E} {R} {spec.C} {spec.X}")
    lines.append(" ".join(str(s) for s in sizes))

    for e in range(spec.E):
        K = len(endpoint_caches[e])
        lines.append(f"{endpoint_latency[e]} {K}")
        for c, lat in endpoint_caches[e]:
            lines.append(f"{c} {lat}")

    for v, e, n in requests:
        lines.append(f"{v} {e} {n}")

    return "\n".join(lines) + "\n"


# ---------------------------------------------------------------------------
# Manifest: one-row summary per instance for easy experimental comparison
# ---------------------------------------------------------------------------

def instance_stats(spec: InstanceSpec, text: str) -> dict:
    """Compute derived statistics for the manifest."""
    lines_iter = iter(text.split("\n"))

    def next_ints():
        return [int(x) for x in next(lines_iter).split()]

    V, E, R, C, X = next_ints()
    sizes = next_ints()
    total_catalog = sum(sizes)
    total_capacity = C * X

    total_K = 0
    k0 = 0
    for e in range(E):
        L_D, K = next_ints()
        total_K += K
        if K == 0:
            k0 += 1
        for _ in range(K):
            next_ints()

    req_counts = []
    for _ in range(R):
        _, _, n = next_ints()
        req_counts.append(n)

    avg_K = total_K / E if E else 0
    cap_ratio = total_capacity / total_catalog if total_catalog else 0

    return {
        "name": spec.name,
        "tag": spec.tag,
        "V": V, "E": E, "R": R, "C": C, "X": X,
        "size_min": min(sizes), "size_max": max(sizes),
        "avg_size": round(sum(sizes) / len(sizes), 1),
        "total_catalog_MB": total_catalog,
        "total_capacity_MB": total_capacity,
        "capacity_ratio": round(cap_ratio, 3),
        "avg_caches_per_endpoint": round(avg_K, 1),
        "endpoints_K0": k0,
        "zipf_a": spec.zipf_a,
        "density": spec.density,
        "total_requests": sum(req_counts),
    }


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Generate a benchmark dataset of Hash Code 2017 instances."
    )
    parser.add_argument(
        "--out-dir", default=".",
        help="directory to write .in files and manifest.csv (default: cwd)",
    )
    parser.add_argument(
        "--seed", type=int, default=2017,
        help="RNG seed for reproducibility (default: 2017)",
    )
    args = parser.parse_args()

    os.makedirs(args.out_dir, exist_ok=True)
    rng = random.Random(args.seed)

    manifest_rows = []

    for spec in INSTANCE_SPECS:
        text = generate_instance(spec, rng)
        path = os.path.join(args.out_dir, f"{spec.name}.in")
        with open(path, "w", encoding="ascii", newline="\n") as f:
            f.write(text)

        stats = instance_stats(spec, text)
        manifest_rows.append(stats)

        print(f"  {spec.name + '.in':<30s}  V={stats['V']:<5} E={stats['E']:<4} "
              f"C={stats['C']:<4} R={stats['R']:<5} X={stats['X']:<6} "
              f"cap/cat={stats['capacity_ratio']:.2f}  "
              f"avg_K={stats['avg_caches_per_endpoint']:<5}  "
              f"zipf={spec.zipf_a}")

    # Write CSV manifest
    csv_path = os.path.join(args.out_dir, "manifest.csv")
    fieldnames = list(manifest_rows[0].keys())
    with open(csv_path, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(manifest_rows)

    print(f"\n  Wrote {len(manifest_rows)} instances + manifest.csv to {os.path.abspath(args.out_dir)}/")


if __name__ == "__main__":
    main()
