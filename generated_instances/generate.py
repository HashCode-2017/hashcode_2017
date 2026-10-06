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
    python generate.py                     # the 12 presets, in current directory
    python generate.py --out-dir ../data   # writes elsewhere
    python generate.py --seed 12345        # reproducible run
    python generate.py --list-presets      # show preset names
    python generate.py --preset tiny_dense # only some presets (repeatable)

    # one custom instance; unspecified parameters use defaults
    python generate.py --name my_inst --V 200 --E 20 --C 10 --R 500 --zipf 1.5

    # N instances with random parameters; any parameter given stays fixed
    python generate.py --random 5 --scale medium --density 1.0

    # the other models (see models.py): dejavu, patterned, trap
    python generate.py --list-models
    python generate.py --model trap --set copies=200 --set k=4 --name big_trap
    python generate.py --model patterned --set demand_pattern=checkerboard

Run with --help for every parameter.
"""

import argparse
import csv
import itertools
import math
import os
import random
import sys
from dataclasses import dataclass, field
from typing import List, Optional

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import models  # noqa: E402  -- the dejavu / patterned / trap models


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
    count_shape: str = "uniform"   # uniform | heavy | very_heavy | high | saturated
    balanced: bool = False         # spread request lines evenly over endpoints

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
    # Accumulated once: rng.choices(weights=...) rebuilds this table on every
    # call, O(V) per draw. Passing it pre-built gives the very same draws.
    cum_weights = list(itertools.accumulate(weights))

    requests = []
    seen_pairs = set()
    attempts = 0
    max_attempts = spec.R * 20  # safety valve

    while len(requests) < spec.R and attempts < max_attempts:
        attempts += 1
        # Pick a video weighted by Zipf
        v = rng.choices(requested_videos, cum_weights=cum_weights, k=1)[0]
        # Pick an endpoint uniformly from active ones
        if spec.balanced:
            e = active_endpoints[(len(requests) + attempts) % len(active_endpoints)]
        else:
            e = rng.choice(active_endpoints)
        pair = (v, e)
        if pair in seen_pairs:
            continue
        seen_pairs.add(pair)
        if spec.count_shape == "uniform":
            n = rng.randint(spec.request_min, spec.request_max)
        else:
            import models  # noqa: the shared count shapes
            n = models._count(rng, spec.request_min, spec.request_max, spec.count_shape)
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
# Custom and random specifications
# ---------------------------------------------------------------------------

# CLI flag -> InstanceSpec field.  Every flag defaults to None so we can tell
# "not given" apart from an explicit value.
SPEC_PARAMS = [
    # flag                 field                type   help
    ("--V",                 "V",                 int,   "number of videos"),
    ("--E",                 "E",                 int,   "number of endpoints"),
    ("--C",                 "C",                 int,   "number of cache servers"),
    ("--R",                 "R",                 int,   "number of request descriptions"),
    ("--X",                 "X",                 int,   "cache capacity in MB"),
    ("--size-min",          "size_min",          int,   "min video size (MB)"),
    ("--size-max",          "size_max",          int,   "max video size (MB)"),
    ("--density",           "density",           float, "fraction of caches each endpoint reaches (0-1)"),
    ("--k0-fraction",       "k0_fraction",       float, "fraction of endpoints with no cache (0-1)"),
    ("--dc-latency-min",    "dc_latency_min",    int,   "min datacenter latency (ms)"),
    ("--dc-latency-max",    "dc_latency_max",    int,   "max datacenter latency (ms)"),
    ("--cache-latency-min", "cache_latency_min", int,   "min cache latency (ms)"),
    ("--cache-latency-max", "cache_latency_max", int,   "max cache latency (ms)"),
    ("--zipf",              "zipf_a",            float, "Zipf exponent for demand (0 = uniform)"),
    ("--video-coverage",    "video_coverage",    float, "fraction of videos that get requests (0-1]"),
    ("--endpoint-coverage", "endpoint_coverage", float, "fraction of endpoints that make requests (0-1]"),
    ("--request-min",       "request_min",       int,   "min requests per description"),
    ("--request-max",       "request_max",       int,   "max requests per description"),
]

# Ranges for V, E, C, R when drawing random instances, per scale tier.
RANDOM_TIERS = {
    "tiny":   dict(V=(5, 20),     E=(2, 6),    C=(2, 6),   R=(10, 40)),
    "small":  dict(V=(20, 80),    E=(5, 15),   C=(4, 10),  R=(40, 150)),
    "medium": dict(V=(80, 300),   E=(10, 30),  C=(8, 20),  R=(150, 600)),
    "large":  dict(V=(300, 2000), E=(30, 150), C=(20, 60), R=(1000, 8000)),
}


def max_request_pairs(spec: InstanceSpec) -> int:
    """Number of distinct (video, endpoint) pairs the generator can draw."""
    n_videos = max(1, int(round(spec.video_coverage * spec.V)))
    n_endpoints = spec.E
    if spec.endpoint_coverage < 1.0:
        n_endpoints = max(1, int(round(spec.endpoint_coverage * spec.E)))
    return n_videos * n_endpoints


def capacity_for_ratio(V: int, C: int, size_min: int, size_max: int,
                       ratio: float) -> int:
    """Cache capacity X giving total_capacity / expected_catalog = ratio."""
    expected_catalog = V * (size_min + size_max) / 2
    return min(500000, max(1, int(round(ratio * expected_catalog / C))))


def custom_spec(name: str, fixed: dict) -> InstanceSpec:
    """One instance from user-given params; missing ones use defaults."""
    params = dict(V=100, E=10, C=10, R=200)
    params.update(fixed)
    if "X" not in params:
        # Default to moderate pressure: caches hold ~half the catalog.
        defaults = InstanceSpec(name="", V=1, E=1, C=1, R=1, X=1)
        params["X"] = capacity_for_ratio(
            params["V"], params["C"],
            params.get("size_min", defaults.size_min),
            params.get("size_max", defaults.size_max), 0.5)
    return InstanceSpec(name=name, tag="custom", **params)


def random_spec(name: str, rng: random.Random, scale: str,
                fixed: dict) -> InstanceSpec:
    """One instance with randomly drawn params; `fixed` ones are kept as given."""
    if scale == "any":
        scale = rng.choice(sorted(RANDOM_TIERS))
    tier = RANDOM_TIERS[scale]
    p = {}

    def pick(key, draw):
        p[key] = fixed[key] if key in fixed else draw()

    pick("V", lambda: rng.randint(*tier["V"]))
    pick("E", lambda: rng.randint(*tier["E"]))
    pick("C", lambda: rng.randint(*tier["C"]))
    pick("size_min", lambda: rng.randint(1, 50))
    pick("size_max", lambda: rng.randint(p["size_min"],
                                         min(1000, p["size_min"] + rng.randint(20, 300))))
    pick("X", lambda: capacity_for_ratio(p["V"], p["C"], p["size_min"],
                                         p["size_max"], rng.uniform(0.2, 1.5)))
    pick("density", lambda: round(rng.uniform(0.1, 1.0), 2))
    pick("k0_fraction", lambda: round(rng.uniform(0.0, 0.2), 2) if rng.random() < 0.5 else 0.0)
    pick("dc_latency_min", lambda: rng.randint(50, 1500))
    pick("dc_latency_max", lambda: rng.randint(p["dc_latency_min"],
                                               min(4000, p["dc_latency_min"] + 2000)))
    pick("cache_latency_min", lambda: rng.randint(1, 50))
    pick("cache_latency_max", lambda: rng.randint(p["cache_latency_min"], 400))
    pick("zipf_a", lambda: round(rng.uniform(0.0, 2.0), 2))
    pick("video_coverage", lambda: round(rng.uniform(0.3, 1.0), 2))
    pick("endpoint_coverage", lambda: round(rng.uniform(0.7, 1.0), 2))
    pick("request_min", lambda: rng.randint(1, 100))
    pick("request_max", lambda: rng.randint(max(p["request_min"], 500), 10000))

    spec = InstanceSpec(name=name, tag=f"random ({scale})", R=1, **p)
    # A drawn R must not exceed the distinct (video, endpoint) pairs available.
    spec.R = fixed["R"] if "R" in fixed else min(rng.randint(*tier["R"]),
                                                 max_request_pairs(spec))
    return spec


def validate_spec(spec: InstanceSpec) -> List[str]:
    """Return a list of constraint violations (empty if the spec is valid)."""
    s = spec
    checks = [
        (1 <= s.V <= 10000, f"V={s.V} must be in [1, 10000]"),
        (1 <= s.E <= 1000, f"E={s.E} must be in [1, 1000]"),
        (1 <= s.C <= 1000, f"C={s.C} must be in [1, 1000]"),
        (1 <= s.X <= 500000, f"X={s.X} must be in [1, 500000]"),
        (1 <= s.R <= 1000000, f"R={s.R} must be in [1, 1000000]"),
        (1 <= s.size_min <= s.size_max <= 1000,
         f"need 1 <= size_min ({s.size_min}) <= size_max ({s.size_max}) <= 1000"),
        (0.0 <= s.density <= 1.0, f"density={s.density} must be in [0, 1]"),
        (0.0 <= s.k0_fraction <= 1.0, f"k0_fraction={s.k0_fraction} must be in [0, 1]"),
        (2 <= s.dc_latency_min <= s.dc_latency_max <= 4000,
         f"need 2 <= dc_latency_min ({s.dc_latency_min}) <= dc_latency_max ({s.dc_latency_max}) <= 4000"),
        (1 <= s.cache_latency_min <= s.cache_latency_max,
         f"need 1 <= cache_latency_min ({s.cache_latency_min}) <= cache_latency_max ({s.cache_latency_max})"),
        (s.zipf_a >= 0.0, f"zipf={s.zipf_a} must be >= 0"),
        (0.0 < s.video_coverage <= 1.0, f"video_coverage={s.video_coverage} must be in (0, 1]"),
        (0.0 < s.endpoint_coverage <= 1.0, f"endpoint_coverage={s.endpoint_coverage} must be in (0, 1]"),
        (1 <= s.request_min <= s.request_max <= 10000,
         f"need 1 <= request_min ({s.request_min}) <= request_max ({s.request_max}) <= 10000"),
    ]
    errors = [msg for ok, msg in checks if not ok]
    if not errors and s.R > max_request_pairs(s):
        errors.append(f"R={s.R} exceeds the {max_request_pairs(s)} distinct "
                      f"(video, endpoint) pairs available; lower R or raise "
                      f"V/E/video_coverage/endpoint_coverage")
    return errors


# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------

def write_manifest(out_dir: str, rows: List[dict]) -> None:
    """Merge rows into out_dir/manifest.csv, replacing rows with the same name."""
    csv_path = os.path.join(out_dir, "manifest.csv")
    merged = {}
    if os.path.exists(csv_path):
        with open(csv_path, encoding="utf-8", newline="") as f:
            for row in csv.DictReader(f):
                merged[row["name"]] = row
    for row in rows:
        merged[row["name"]] = row
    with open(csv_path, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()),
                                extrasaction="ignore")
        writer.writeheader()
        writer.writerows(merged.values())


def emit(spec: InstanceSpec, text: str, out_dir: str) -> dict:
    """Write one .in file, print a summary line, return its manifest row."""
    path = os.path.join(out_dir, f"{spec.name}.in")
    with open(path, "w", encoding="ascii", newline="\n") as f:
        f.write(text)

    stats = instance_stats(spec, text)
    print(f"  {spec.name + '.in':<30s}  V={stats['V']:<5} E={stats['E']:<4} "
          f"C={stats['C']:<4} R={stats['R']:<5} X={stats['X']:<6} "
          f"cap/cat={stats['capacity_ratio']:.2f}  "
          f"avg_K={stats['avg_caches_per_endpoint']:<5}  "
          f"zipf={spec.zipf_a}")
    if stats["R"] < spec.R:
        print(f"    warning: only {stats['R']} of {spec.R} requested descriptions "
              f"could be drawn (too few distinct pairs under this skew)")
    return stats


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Generate Hash Code 2017 instances.  With no instance "
                    "parameters it writes the 12 preset instances; with "
                    "parameters it writes one custom instance; with --random N "
                    "it writes N instances with random parameters (any "
                    "parameter you pass stays fixed).",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument("--out-dir", default=".",
                        help="directory for .in files and manifest.csv")
    parser.add_argument("--seed", type=int, default=2017,
                        help="RNG seed for reproducibility")

    mode = parser.add_argument_group("mode")
    mode.add_argument("--preset", action="append", metavar="NAME",
                      help="only write this preset (repeatable)")
    mode.add_argument("--list-presets", action="store_true",
                      help="list preset names and exit")
    mode.add_argument("--random", type=int, metavar="N",
                      help="generate N instances with random parameters")
    mode.add_argument("--scale", default="any",
                      choices=["any"] + sorted(RANDOM_TIERS),
                      help="size tier for --random")
    mode.add_argument("--model", choices=sorted(models.MODELS),
                      help="use another model instead of the random one; "
                           "set its parameters with --set (see --list-models)")
    mode.add_argument("--set", action="append", default=[], metavar="KEY=VALUE",
                      help="a parameter of --model (repeatable)")
    mode.add_argument("--list-models", action="store_true",
                      help="list the other models and their parameters, then exit")
    mode.add_argument("--name",
                      help="file name for a custom instance (default: custom), "
                           "or name prefix for --random (default: random)")

    params = parser.add_argument_group("instance parameters")
    for flag, dest, typ, help_text in SPEC_PARAMS:
        params.add_argument(flag, dest=dest, type=typ, default=None,
                            help=help_text)

    args = parser.parse_args()

    if args.list_models:
        if hasattr(sys.stdout, "reconfigure"):
            sys.stdout.reconfigure(errors="replace")
        for name, m in models.MODELS.items():
            print(f"\n{name}: {m['label']}\n  {m['help']}")
            for f in m["fields"]:
                rng_ = f" one of {f['choices']}" if f["choices"] else f" [{f['min']}, {f['max']}]"
                print(f"    {f['key']:<20s} default {f['default']!s:<10s}{rng_}  {f['label']}")
        return

    if args.model:
        params = {}
        for item in args.set:
            if "=" not in item:
                parser.error(f"--set needs KEY=VALUE, got {item!r}")
            key, value = item.split("=", 1)
            params[key.strip()] = value.strip()
        known = {f["key"] for f in models.MODELS[args.model]["fields"]}
        unknown = set(params) - known
        if unknown:
            parser.error(f"unknown parameter(s) for {args.model}: {', '.join(sorted(unknown))} "
                         f"(see --list-models)")
        try:
            text, resolved = models.build(args.model, params, seed=args.seed)
        except ValueError as exc:
            parser.error(str(exc))
        os.makedirs(args.out_dir, exist_ok=True)
        # The manifest row records the model's own skew and density.
        spec = InstanceSpec(name=args.name or args.model, tag=f"model: {args.model}",
                            V=1, E=1, C=1, R=1, X=1,
                            zipf_a=float(resolved.get("zipf_a", resolved.get("zipf", 0.0))),
                            density=float(resolved.get("density", 0.0)))
        row = emit(spec, text, args.out_dir)
        write_manifest(args.out_dir, [row])
        print(f"\n  Wrote {spec.name}.in + manifest.csv to {os.path.abspath(args.out_dir)}/")
        return

    if args.list_presets:
        # Tags contain non-ASCII (e.g. "≈"), which the Windows console rejects.
        if hasattr(sys.stdout, "reconfigure"):
            sys.stdout.reconfigure(errors="replace")
        for spec in INSTANCE_SPECS:
            print(f"  {spec.name:<24s} {spec.tag}")
        return

    fixed = {dest: getattr(args, dest) for _, dest, _, _ in SPEC_PARAMS
             if getattr(args, dest) is not None}

    if args.preset and (fixed or args.random is not None):
        parser.error("--preset cannot be combined with --random or instance parameters")
    if args.random is not None and args.random < 1:
        parser.error("--random N needs N >= 1")

    os.makedirs(args.out_dir, exist_ok=True)
    rng = random.Random(args.seed)
    rows = []

    if args.random is not None:
        prefix = args.name or "random"
        width = len(str(args.random))
        for i in range(1, args.random + 1):
            spec = random_spec(f"{prefix}_{i:0{width}d}", rng, args.scale, fixed)
            errors = validate_spec(spec)
            if errors:
                parser.error(f"{spec.name}: " + "; ".join(errors))
            rows.append(emit(spec, generate_instance(spec, rng), args.out_dir))

    elif fixed:
        spec = custom_spec(args.name or "custom", fixed)
        errors = validate_spec(spec)
        if errors:
            parser.error("; ".join(errors))
        rows.append(emit(spec, generate_instance(spec, rng), args.out_dir))

    else:
        known = {s.name for s in INSTANCE_SPECS}
        unknown = set(args.preset or []) - known
        if unknown:
            parser.error(f"unknown preset(s): {', '.join(sorted(unknown))} "
                         f"(see --list-presets)")
        wanted = set(args.preset) if args.preset else known
        # Always draw every preset in order so a subset comes out identical
        # to the same files from a full run.
        for spec in INSTANCE_SPECS:
            text = generate_instance(spec, rng)
            if spec.name in wanted:
                rows.append(emit(spec, text, args.out_dir))

    write_manifest(args.out_dir, rows)
    print(f"\n  Wrote {len(rows)} instance(s) + manifest.csv to {os.path.abspath(args.out_dir)}/")


if __name__ == "__main__":
    main()
