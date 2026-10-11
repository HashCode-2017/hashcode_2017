"""
Instance models for Hash Code 2017 "Streaming Videos", beyond `random`.

Each model is a parameter schema plus a builder. The schema drives both the
command line (`generate.py --model NAME --set key=value`) and the web console's
"generate an instance" form, so the two can never drift apart.

  random     the original generator: every structural axis on its own knob
             (density, capacity, Zipf skew, coverage...). See generate.py.
  dejavu     endpoint locality at full scale: each endpoint has its own
             favourite videos plus a shared hot set. Inspired by the "Deja Vu"
             generator of LesageArno/instanceCreatorHashcode2016, but repeated
             (video, endpoint) pairs are merged and counts stay <= 10000, so
             the output is always valid.
  patterned  structured instances from named patterns (video sizes, demand,
             latency geometry) -- the safe counterpart of "Universal Lambda",
             which runs arbitrary user functions and so cannot be offered on a
             shared server.
  trap       copies of a small gadget that misleads density greedy solvers:
             the best-looking first placement locks another endpoint out. A
             generalisation of the hand-made unit_size / le_X_over_k cases.

Every builder's output goes through `validate_text`, which checks the official
limits on the actual file, so nothing invalid is ever returned.
"""
import math
import random
from typing import Dict, List, Tuple

# Official limits from the problem statement.
MAX_V, MAX_E, MAX_C, MAX_R = 10_000, 1_000, 1_000, 1_000_000
MAX_X, MAX_SIZE, MAX_COUNT = 500_000, 1_000, 10_000
MIN_LD, MAX_LD, MAX_LC = 2, 4_000, 500


# ---------------------------------------------------------------------------
# Validation of the produced file
# ---------------------------------------------------------------------------

def validate_text(text: str) -> List[str]:
    """Every official constraint, checked on the file itself. [] means valid."""
    errors: List[str] = []
    try:
        it = iter(text.split())
        nxt = lambda: int(next(it))
        V, E, R, C, X = (nxt() for _ in range(5))
        for name, value, lo, hi in (("V", V, 1, MAX_V), ("E", E, 1, MAX_E), ("R", R, 1, MAX_R),
                                    ("C", C, 1, MAX_C), ("X", X, 1, MAX_X)):
            if not lo <= value <= hi:
                errors.append(f"{name}={value} outside [{lo}, {hi}]")
        sizes = [nxt() for _ in range(V)]
        if any(not 1 <= s <= MAX_SIZE for s in sizes):
            errors.append("a video size is outside [1, 1000]")
        for e in range(E):
            ld, K = nxt(), nxt()
            if not MIN_LD <= ld <= MAX_LD:
                errors.append(f"endpoint {e}: datacenter latency {ld} outside [2, 4000]")
            if not 0 <= K <= C:
                errors.append(f"endpoint {e}: {K} caches but C={C}")
            seen = set()
            for _ in range(K):
                c, lat = nxt(), nxt()
                if not 0 <= c < C or c in seen:
                    errors.append(f"endpoint {e}: bad or repeated cache id {c}")
                seen.add(c)
                if not 1 <= lat <= MAX_LC or lat >= ld:
                    errors.append(f"endpoint {e}: cache latency {lat} invalid (needs 1..500 and < {ld})")
        pairs = set()
        for _ in range(R):
            v, e, n = nxt(), nxt(), nxt()
            if not (0 <= v < V and 0 <= e < E):
                errors.append(f"request ({v}, {e}) refers to a missing video or endpoint")
            if not 1 <= n <= MAX_COUNT:
                errors.append(f"request count {n} outside [1, 10000]")
            if (v, e) in pairs:
                errors.append(f"request ({v}, {e}) listed twice")
            pairs.add((v, e))
        if next(it, None) is not None:
            errors.append("extra data after the last request")
    except StopIteration:
        errors.append("file ends early")
    except ValueError:
        errors.append("non-integer token")
    return errors[:20]


def to_text(V, E, C, X, sizes, endpoints, requests) -> str:
    lines = [f"{V} {E} {len(requests)} {C} {X}", " ".join(map(str, sizes))]
    for ld, links in endpoints:
        lines.append(f"{ld} {len(links)}")
        lines.extend(f"{c} {lat}" for c, lat in links)
    lines.extend(f"{v} {e} {n}" for v, e, n in requests)
    return "\n".join(lines) + "\n"


# ---------------------------------------------------------------------------
# Shared pieces
# ---------------------------------------------------------------------------

def _cache_latency(rng, ld, lo, hi):
    hi = min(hi, MAX_LC, ld - 1)
    lo = min(max(1, lo), hi)
    return rng.randint(lo, hi)


def _random_links(rng, C, k, ld, lat_lo, lat_hi):
    return [(c, _cache_latency(rng, ld, lat_lo, lat_hi)) for c in rng.sample(range(C), k)]


def _per_endpoint(R, E, noise, rng, cap):
    """Split R request lines over E endpoints, +/- noise, each at most `cap`."""
    base = R / E
    counts = [max(1, min(cap, int(round(base * (1 + rng.uniform(-noise, noise)))))) for _ in range(E)]
    return counts


def _count(rng, lo, hi, shape="uniform"):
    """A request count in [lo, hi].
    uniform: flat; heavy: mostly small, long tail; very_heavy: mostly the
    minimum; high: mostly near the maximum; saturated: nearly always the
    maximum (what merging many repeated lines of one pair produces once
    capped at the official 10000)."""
    u = rng.random()
    if shape == "heavy":
        x = lo + (hi - lo) * u ** 2
    elif shape == "very_heavy":
        x = lo + (hi - lo) * u ** 4
    elif shape == "high":
        x = hi - (hi - lo) * u ** 2
    elif shape == "saturated":
        x = hi - (hi - lo) * u ** 8
    else:
        return rng.randint(lo, hi)
    return max(lo, min(hi, MAX_COUNT, int(round(x))))


def build_dejavu(p, rng):
    V, E, C = p["V"], p["E"], p["C"]
    sizes = [rng.randint(p["size_min"], p["size_max"]) for _ in range(V)]
    k = max(0, min(C, p["connections"]))
    endpoints = []
    for _ in range(E):
        ld = rng.randint(p["dc_latency_min"], p["dc_latency_max"])
        endpoints.append((ld, _random_links(rng, C, k, ld, 1, p["cache_latency_max"])))
    hot = rng.sample(range(V), min(V, p["hot_set"]))
    requests = []
    for e, r_e in enumerate(_per_endpoint(p["R"], E, p["noise"], rng, V)):
        n_shared = min(len(hot), int(round(p["shared_fraction"] * r_e)))
        chosen = set(rng.sample(hot, n_shared))
        # The endpoint's own favourites: anything not already taken.
        while len(chosen) < r_e:
            chosen.add(rng.randrange(V))
        for v in chosen:
            requests.append((v, e, _count(rng, p["request_min"], p["request_max"], p["count_shape"])))
    return to_text(V, E, C, p["X"], sizes, endpoints, requests)


def _sizes(p, V, rng):
    lo, hi = p["size_min"], p["size_max"]
    pat = p["size_pattern"]
    if pat == "decreasing":
        return [max(lo, min(hi, int(round(hi - (hi - lo) * v / max(1, V - 1) * rng.uniform(0.9, 1.1)))))
                for v in range(V)]
    if pat == "bimodal":
        small_hi = lo + max(1, (hi - lo) // 10)
        return [rng.randint(lo, small_hi) if rng.random() < 0.8
                else rng.randint(max(lo, int(hi * 0.8)), hi) for _ in range(V)]
    if pat == "lambda":
        # The Universal Lambda example's formula: max(1, 1000 - id + randint(0, id)).
        # Big for the first ids, then collapses to the minimum for most videos.
        return [max(lo, min(hi, hi - v + rng.randint(0, v))) for v in range(V)]
    if pat == "two_halves":
        # First half small (up to 50 MB); second half climbs from half the
        # maximum to the maximum over its first 30%, then stays at the maximum.
        half = V // 2
        small_hi = max(lo, min(hi, 50))
        ramp = max(1, int(0.3 * (V - half)))
        return [rng.randint(lo, small_hi) if v < half
                else max(lo, min(hi, int(round(hi / 2 + (hi / 2) * min(1.0, (v - half) / ramp)))))
                for v in range(V)]
    return [rng.randint(lo, hi) for _ in range(V)]


def build_patterned(p, rng):
    V, E, C = p["V"], p["E"], p["C"]
    sizes = _sizes(p, V, rng)

    # Topology. random: each endpoint draws its own caches (how many varies,
    # averaging density x C); distance: a 1-D geography, nearest caches, latency
    # grows with distance; shared: every endpoint reaches the same caches.
    k = max(0, min(C, int(round(p["density"] * C))))
    cache_pos = [(c + 0.5) / C for c in range(C)]
    ep_pos = [rng.random() for _ in range(E)]
    shared = [round(i * C / k) % C for i in range(k)] if k else []
    shared = sorted(set(shared))
    endpoints = []
    for e in range(E):
        ld = rng.randint(p["dc_latency_min"], p["dc_latency_max"])
        if p["latency_pattern"] == "distance" and k:
            near = sorted(range(C), key=lambda c: abs(cache_pos[c] - ep_pos[e]))[:k]
            far = max(abs(cache_pos[c] - ep_pos[e]) for c in near) or 1.0
            top = min(p["cache_latency_max"], MAX_LC, ld - 1)
            low = min(max(1, p["cache_latency_min"]), top)
            links = [(c, low + int(round((top - low) * abs(cache_pos[c] - ep_pos[e]) / far))) for c in near]
        elif p["latency_pattern"] == "shared":
            links = [(c, _cache_latency(rng, ld, p["cache_latency_min"], p["cache_latency_max"])) for c in shared]
        else:
            k_e = sum(rng.random() < p["density"] for _ in range(C))
            links = _random_links(rng, C, k_e, ld, p["cache_latency_min"], p["cache_latency_max"])
        endpoints.append((ld, links))

    # Demand.
    shape = p["count_shape"]
    lo, hi = p["request_min"], p["request_max"]
    requests = []
    pat = p["demand_pattern"]
    if pat == "checkerboard":
        # As in the Universal Lambda example: even endpoints want every odd
        # video a lot, and also ask a little for even ones; odd endpoints ask a
        # little for anything. Even endpoints get 1.5x the request lines.
        weights = [1.5 if e % 2 == 0 else 1.0 for e in range(E)]
        scale = p["R"] / sum(weights)
        odd = list(range(1, V, 2)) or [0]
        even = list(range(0, V, 2)) or [0]
        for e in range(E):
            r_e = max(1, min(V, int(round(weights[e] * scale))))
            if e % 2 == 0:
                n_odd = min(len(odd), int(round(r_e * 2 / 3)))
                for v in rng.sample(odd, n_odd):
                    requests.append((v, e, rng.randint(max(lo, int(hi * 0.8)), hi)))
                for v in rng.sample(even, min(len(even), r_e - n_odd)):
                    requests.append((v, e, rng.randint(lo, min(hi, lo + 99))))
            else:
                for v in rng.sample(range(V), r_e):
                    requests.append((v, e, rng.randint(lo, min(hi, lo + 99))))
    elif pat == "same_parity":
        # Endpoints only want videos with the same parity as themselves.
        pools = [list(range(0, V, 2)) or [0], list(range(1, V, 2)) or [0]]
        for e, r_e in enumerate(_per_endpoint(p["R"], E, 0.05, rng, V)):
            pool = pools[e % 2]
            for v in rng.sample(pool, min(r_e, len(pool))):
                requests.append((v, e, _count(rng, lo, hi, shape)))
    elif pat == "local":
        # Each endpoint mostly wants the videos "near" it: a window of the catalog.
        width = max(1, int(p["local_width"] * V))
        for e, r_e in enumerate(_per_endpoint(p["R"], E, 0.1, rng, V)):
            center = int(ep_pos[e] * V)
            chosen = set()
            while len(chosen) < r_e:
                if rng.random() < 0.85:
                    v = int(rng.gauss(center, width / 2)) % V
                else:
                    v = rng.randrange(V)
                chosen.add(v)
            for v in chosen:
                requests.append((v, e, _count(rng, lo, hi, shape)))
    else:  # zipf
        order = list(range(V))
        rng.shuffle(order)
        weights = [1.0 / (r + 1) ** p["zipf"] for r in range(V)] if p["zipf"] > 0 else None
        for e, r_e in enumerate(_per_endpoint(p["R"], E, 0.1, rng, V)):
            chosen = set()
            attempts = 0
            while len(chosen) < r_e and attempts < 20 * r_e:
                attempts += 1
                chosen.update(rng.choices(order, weights=weights, k=max(1, r_e - len(chosen))))
            for v in list(chosen)[:r_e]:
                requests.append((v, e, _count(rng, lo, hi, shape)))
    return to_text(V, E, C, p["X"], sizes, endpoints, requests)


def build_trap(p, rng):
    """`copies` independent gadgets. In each: caches a (both endpoints, latency 1)
    and b (endpoint A only, latency 2); A's k videos are requested `margin`
    times more than B's. A density greedy fills a with A's videos and B gets
    nothing; the optimum is a <- B's videos, b <- A's."""
    k, size, n = p["k"], p["size"], p["count"]
    copies, margin, ld = p["copies"], p["margin"], p["dc_latency"]
    V, E, C = 2 * k * copies, 2 * copies, 2 * copies
    X = k * size
    sizes = [size] * V
    endpoints, requests = [], []
    for g in range(copies):
        a, b = 2 * g, 2 * g + 1
        A, B = 2 * g, 2 * g + 1
        endpoints.append((ld, [(a, 1), (b, 2)]))      # endpoint A
        endpoints.append((ld, [(a, 1)]))              # endpoint B
        base = 2 * k * g
        for i in range(k):
            requests.append((base + i, A, min(MAX_COUNT, n + margin)))
            requests.append((base + k + i, B, n))
    if p["shuffle"]:
        # Renumber everything so the gadgets are not visible from the ids.
        vmap = list(range(V)); rng.shuffle(vmap)
        cmap = list(range(C)); rng.shuffle(cmap)
        endpoints = [(ld_, [(cmap[c], lat) for c, lat in links]) for ld_, links in endpoints]
        requests = [(vmap[v], e, cnt) for v, e, cnt in requests]
        rng.shuffle(requests)
    return to_text(V, E, C, X, sizes, endpoints, requests)


def build_random(p, rng):
    """The original generator (generate.py): one knob per structural axis."""
    import generate                      # lazy: generate.py imports this module
    p = dict(p, balanced=p.get("balanced") == "yes")
    spec = generate.InstanceSpec(name="console", **p)
    problems = generate.validate_spec(spec)
    if problems:
        raise ValueError("; ".join(problems))
    return generate.generate_instance(spec, rng)


def _f(key, label, kind, default, lo=None, hi=None, help="", choices=None, advanced=False):
    return dict(key=key, label=label, type=kind, default=default, min=lo, max=hi,
                help=help, choices=choices, advanced=advanced)


SIZE_FIELDS = [
    _f("size_min", "smallest video (MB)", "int", 4, 1, MAX_SIZE),
    _f("size_max", "largest video (MB)", "int", 110, 1, MAX_SIZE),
]

MODELS: Dict[str, dict] = {
    "random": dict(
        label="Random — one knob per axis (our original generator)",
        help="Network density, capacity pressure, Zipf demand skew and coverage, each on "
             "its own knob, so you can vary one factor at a time.",
        build=build_random,
        fields=[
            _f("V", "videos", "int", 500, 1, MAX_V),
            _f("E", "endpoints", "int", 50, 1, MAX_E),
            _f("C", "caches", "int", 25, 1, MAX_C),
            _f("X", "cache size (MB)", "int", 1_000, 1, MAX_X),
            _f("R", "request lines", "int", 3_000, 1, MAX_R),
            _f("density", "share of caches per endpoint", "float", 0.5, 0.0, 1.0),
            _f("zipf_a", "demand skew (Zipf, 0 = uniform)", "float", 1.0, 0.0, 3.0),
            _f("k0_fraction", "endpoints with no cache", "float", 0.0, 0.0, 1.0, advanced=True),
            _f("video_coverage", "share of videos requested", "float", 0.7, 0.01, 1.0, advanced=True),
            _f("endpoint_coverage", "share of endpoints requesting", "float", 1.0, 0.01, 1.0, advanced=True),
            _f("size_min", "smallest video (MB)", "int", 1, 1, MAX_SIZE, advanced=True),
            _f("size_max", "largest video (MB)", "int", 100, 1, MAX_SIZE, advanced=True),
            _f("dc_latency_min", "min datacenter latency", "int", 400, MIN_LD, MAX_LD, advanced=True),
            _f("dc_latency_max", "max datacenter latency", "int", 1_200, MIN_LD, MAX_LD, advanced=True),
            _f("cache_latency_min", "min cache latency", "int", 10, 1, MAX_LC, advanced=True),
            _f("cache_latency_max", "max cache latency", "int", 200, 1, MAX_LC, advanced=True),
            _f("request_min", "min count per request", "int", 1, 1, MAX_COUNT, advanced=True),
            _f("request_max", "max count per request", "int", 5_000, 1, MAX_COUNT, advanced=True),
            _f("count_shape", "count distribution", "choice", "uniform",
               choices=["uniform", "heavy", "very_heavy", "high", "saturated"], advanced=True),
            _f("balanced", "spread requests evenly over endpoints", "choice", "no",
               choices=["no", "yes"], advanced=True),
        ],
    ),
    "dejavu": dict(
        label="Déjà vu — endpoint locality at scale",
        help="Each endpoint has its own favourite videos plus a shared hot set. "
             "Large, valid by construction (no repeated pairs, counts <= 10000).",
        build=build_dejavu,
        fields=[
            _f("V", "videos", "int", 10_000, 1, MAX_V),
            _f("E", "endpoints", "int", 115, 1, MAX_E),
            _f("C", "caches", "int", 20, 1, MAX_C),
            _f("X", "cache size (MB)", "int", 2_000, 1, MAX_X),
            _f("R", "request lines", "int", 75_000, 1, MAX_R, "distinct (video, endpoint) pairs"),
            _f("connections", "caches per endpoint", "int", 4, 0, MAX_C),
            _f("shared_fraction", "share from the hot set", "float", 0.2, 0.0, 1.0,
               "0 = every endpoint has its own taste, 1 = everyone wants the same videos"),
            _f("hot_set", "hot set size", "int", 100, 1, MAX_V),
            _f("noise", "request-count noise per endpoint", "float", 0.1, 0.0, 0.9, advanced=True),
            *[dict(f, advanced=True) for f in SIZE_FIELDS],
            _f("dc_latency_min", "min datacenter latency", "int", 2, MIN_LD, MAX_LD, advanced=True),
            _f("dc_latency_max", "max datacenter latency", "int", 1_000, MIN_LD, MAX_LD, advanced=True),
            _f("cache_latency_max", "max cache latency", "int", 500, 1, MAX_LC, advanced=True),
            _f("request_min", "min count per request", "int", 2, 1, MAX_COUNT, advanced=True),
            _f("request_max", "max count per request", "int", 10_000, 1, MAX_COUNT, advanced=True),
            _f("count_shape", "count distribution", "choice", "heavy",
               choices=["uniform", "heavy", "very_heavy", "high", "saturated"], advanced=True,
               help="high = mostly near the maximum, like many repeated requests merged"),
        ],
    ),
    "patterned": dict(
        label="Patterned — structured sizes, demand and geography",
        help="Pick named patterns instead of writing code: decreasing or two-size "
             "videos, checkerboard or local demand, latency that grows with distance.",
        build=build_patterned,
        fields=[
            _f("V", "videos", "int", 2_000, 1, MAX_V),
            _f("E", "endpoints", "int", 200, 1, MAX_E),
            _f("C", "caches", "int", 50, 1, MAX_C),
            _f("X", "cache size (MB)", "int", 5_000, 1, MAX_X),
            _f("R", "request lines", "int", 20_000, 1, MAX_R),
            _f("size_pattern", "video sizes", "choice", "decreasing",
               choices=["uniform", "decreasing", "bimodal", "lambda", "two_halves"],
               help="decreasing: bigger ids are smaller; bimodal: mostly small, some huge; "
                    "lambda: the Universal Lambda formula (most videos tiny); "
                    "two_halves: first half small, second half big and growing"),
            _f("demand_pattern", "demand", "choice", "local",
               choices=["zipf", "checkerboard", "local", "same_parity"],
               help="checkerboard: even endpoints want odd videos a lot; local: endpoints want videos "
                    "near them; same_parity: endpoints only want videos of their own parity"),
            _f("latency_pattern", "cache topology", "choice", "distance",
               choices=["random", "distance", "shared"],
               help="random: each endpoint its own caches; distance: nearest caches, latency grows "
                    "with distance; shared: every endpoint reaches the same caches"),
            _f("density", "share of caches per endpoint", "float", 0.2, 0.0, 1.0),
            _f("zipf", "Zipf exponent (zipf demand)", "float", 1.0, 0.0, 3.0, advanced=True),
            _f("local_width", "window width (local demand)", "float", 0.05, 0.001, 1.0, advanced=True),
            _f("size_min", "smallest video (MB)", "int", 1, 1, MAX_SIZE, advanced=True),
            _f("size_max", "largest video (MB)", "int", 1_000, 1, MAX_SIZE, advanced=True),
            _f("dc_latency_min", "min datacenter latency", "int", 500, MIN_LD, MAX_LD, advanced=True),
            _f("dc_latency_max", "max datacenter latency", "int", 1_500, MIN_LD, MAX_LD, advanced=True),
            _f("cache_latency_min", "min cache latency", "int", 1, 1, MAX_LC, advanced=True),
            _f("cache_latency_max", "max cache latency", "int", 500, 1, MAX_LC, advanced=True),
            _f("request_min", "min count per request", "int", 1, 1, MAX_COUNT, advanced=True),
            _f("request_max", "max count per request", "int", 10_000, 1, MAX_COUNT, advanced=True),
            _f("count_shape", "count distribution", "choice", "uniform",
               choices=["uniform", "heavy", "very_heavy", "high", "saturated"], advanced=True),
        ],
    ),
    "trap": dict(
        label="Trap — gadgets that fool greedy solvers",
        help="Copies of a small gadget where the best-looking first move locks another "
             "endpoint out. A density greedy scores about half the optimum here.",
        build=build_trap,
        fields=[
            _f("copies", "gadget copies", "int", 50, 1, 500, "each copy adds 2 endpoints and 2 caches"),
            _f("k", "videos per cache", "int", 3, 1, 100),
            _f("size", "video size (MB)", "int", 20, 1, MAX_SIZE),
            _f("count", "requests per video", "int", 9_999, 1, MAX_COUNT),
            _f("margin", "how much more the decoy is wanted", "int", 1, 0, MAX_COUNT - 1,
               "small = harder: the trap looks almost free"),
            _f("dc_latency", "datacenter latency", "int", 1_000, 3, MAX_LD),
            _f("shuffle", "hide the gadgets (shuffle ids)", "choice", "yes", choices=["yes", "no"]),
        ],
    ),
}


def describe() -> Dict[str, dict]:
    """The schema, without the builder functions (safe to send as JSON)."""
    return {name: {k: v for k, v in m.items() if k != "build"} for name, m in MODELS.items()}


def resolve(model: str, params: dict) -> dict:
    """Fill defaults and check every parameter against its schema."""
    if model not in MODELS:
        raise ValueError(f"unknown model {model!r}; choose one of {', '.join(MODELS)}")
    out = {}
    for f in MODELS[model]["fields"]:
        raw = params.get(f["key"], f["default"])
        if f["type"] == "choice":
            value = str(raw)
            if value not in f["choices"]:
                raise ValueError(f"{f['label']}: choose one of {', '.join(f['choices'])}")
        else:
            try:
                value = int(raw) if f["type"] == "int" else float(raw)
            except (TypeError, ValueError):
                raise ValueError(f"{f['label']}: not a number")
            if f["min"] is not None and value < f["min"] or f["max"] is not None and value > f["max"]:
                raise ValueError(f"{f['label']}: must be between {f['min']} and {f['max']}")
        out[f["key"]] = value
    # Cross-field rules.
    for lo, hi in (("size_min", "size_max"), ("dc_latency_min", "dc_latency_max"),
                   ("request_min", "request_max"), ("cache_latency_min", "cache_latency_max")):
        if lo in out and hi in out and out[lo] > out[hi]:
            raise ValueError(f"{lo} is larger than {hi}")
    if model == "trap":
        out["shuffle"] = out["shuffle"] == "yes"
        if 2 * out["k"] * out["copies"] > MAX_V:
            raise ValueError("too many videos: 2 x videos-per-cache x copies must be <= 10000")
        if out["k"] * out["size"] > MAX_X:
            raise ValueError("cache size (videos per cache x size) exceeds 500000")
    if "R" in out and "V" in out and "E" in out and out["R"] > out["V"] * out["E"]:
        raise ValueError(f"R={out['R']} is more than the {out['V'] * out['E']} distinct (video, endpoint) pairs")
    return out


def build(model: str, params: dict, seed: int = 2017) -> Tuple[str, dict]:
    """Return (instance text, resolved params). Raises ValueError if invalid."""
    p = resolve(model, params)
    text = MODELS[model]["build"](p, random.Random(seed))
    errors = validate_text(text)
    if errors:
        raise ValueError("generated instance failed validation: " + "; ".join(errors[:5]))
    return text, p


# ---------------------------------------------------------------------------
# Presets: parameters fitted to the class benchmark (new_instances/), so the
# console can make look-alikes. Each was checked by comparing the profile
# (sizes, latencies, links, counts, demand structure) of a generated copy
# with the original. The dejavu and lambda originals contain request counts
# above the official 10000; their look-alikes stay valid, so counts that would
# exceed it sit at 10000 instead.
# ---------------------------------------------------------------------------

PRESETS: Dict[str, dict] = {
    "custom_dejavu42": dict(
        model="dejavu",
        note="Deja Vu, seed 42: 115 endpoints with their own taste, tight caches (7% of the catalog)",
        params=dict(V=10_000, E=115, C=20, X=2_000, R=72_450, connections=4, shared_fraction=0.0,
                    hot_set=1, noise=0.1, size_min=4, size_max=109, dc_latency_min=2,
                    dc_latency_max=1_000, cache_latency_max=500, request_min=2_740,
                    request_max=10_000, count_shape="saturated"),
    ),
    "custom_universallambda42": dict(
        model="patterned",
        note="Universal Lambda, seed 42: checkerboard demand, most videos 1 MB",
        params=dict(V=10_000, E=115, C=20, X=2_000, R=717_907, size_pattern="lambda",
                    demand_pattern="checkerboard", latency_pattern="random", density=0.637,
                    size_min=1, size_max=1_000, dc_latency_min=1_900, dc_latency_max=2_160,
                    cache_latency_min=1, cache_latency_max=499, request_min=1, request_max=10_000,
                    count_shape="uniform"),
    ),
    "custom_universallambda42_asymmetric": dict(
        model="patterned",
        note="Asymmetric: same-parity demand, every endpoint on the same 63 caches, two-halves sizes",
        params=dict(V=10_000, E=1_000, C=250, X=2_000, R=832_647, size_pattern="two_halves",
                    demand_pattern="same_parity", latency_pattern="shared", density=0.252,
                    size_min=1, size_max=1_000, dc_latency_min=2_000, dc_latency_max=2_000,
                    cache_latency_min=1, cache_latency_max=99, request_min=1, request_max=33,
                    count_shape="very_heavy"),
    ),
    "instance1_corrected": dict(
        model="random",
        note="instance1: uniform demand, 5 of 10 caches per endpoint, big caches",
        params=dict(V=6_790, E=196, C=10, X=250_000, R=40_445, density=0.5, zipf_a=0.0,
                    k0_fraction=0.0, video_coverage=1.0, endpoint_coverage=1.0, size_min=1,
                    size_max=1_000, dc_latency_min=2, dc_latency_max=4_000, cache_latency_min=1,
                    cache_latency_max=250, request_min=1, request_max=3,
                    count_shape="very_heavy", balanced="yes"),
    ),
    "instance2_corrected": dict(
        model="random",
        note="instance2: mildly skewed demand, caches bigger than the catalog",
        params=dict(V=4_210, E=421, C=10, X=375_000, R=61_610, density=0.5, zipf_a=0.6,
                    k0_fraction=0.0, video_coverage=1.0, endpoint_coverage=1.0, size_min=1,
                    size_max=1_000, dc_latency_min=2, dc_latency_max=4_000, cache_latency_min=1,
                    cache_latency_max=136, request_min=1, request_max=7,
                    count_shape="very_heavy", balanced="yes"),
    ),
}


def describe_presets() -> Dict[str, dict]:
    return PRESETS
