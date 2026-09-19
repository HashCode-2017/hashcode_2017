"""Post-solve analysis: where every request actually gets served from.

`solution.py`'s `score()` stays the authority on the number we report. What
this module adds is the *attribution* the console needs -- which cache won
each request, how full each cache ended up, how much of the theoretically
reachable saving the heuristic captured.

The naive way to resolve routing is, per request, to scan every connected
cache; on `kittens` that is 200,000 requests x 352 caches = 70M checks. Instead
we walk the placement once (cache -> its endpoints -> its stored videos), which
is bounded by the placement size rather than the request count.
"""
from solution import Instance, score as official_score


def _best_source(inst: Instance, placed):
    """(endpoint, video) -> (latency, cache_id) for everything a cache can serve.

    Anything absent falls back to the datacenter.
    """
    best = {}
    for c, videos in placed.items():
        if not videos:
            continue
        endpoints = inst.cache_endpoints.get(c) or []
        for e, lat_c in endpoints:
            demand = inst.endpoint_requests.get(e)
            if not demand:
                continue
            slot = best.get(e)
            if slot is None:
                slot = best[e] = {}
            # Iterate the cache's contents (tens of videos), not the
            # endpoint's demand table (hundreds).
            for v in videos:
                if v in demand:
                    cur = slot.get(v)
                    if cur is None or lat_c < cur[0]:
                        slot[v] = (lat_c, c)
    return best


def analyse(inst: Instance, placed):
    best = _best_source(inst, placed)

    total_requests = 0
    saved_ms = 0
    served_by_cache = 0
    served_by_dc = 0
    cache_volume = {}                      # cache -> requests it serves
    ep_after = [0] * inst.E                # demand-weighted latency, after
    ep_before = [0] * inst.E
    ep_demand = [0] * inst.E
    ep_cached = [0] * inst.E               # request volume served from a cache
    before_hist = {}
    after_hist = {}

    for v, e, n in inst.requests:
        L_D = inst.endpoint_latency[e]
        slot = best.get(e)
        hit = slot.get(v) if slot else None
        lat, src = hit if hit else (L_D, None)

        total_requests += n
        saved_ms += n * (L_D - lat)
        ep_demand[e] += n
        ep_before[e] += n * L_D
        ep_after[e] += n * lat
        if src is None:
            served_by_dc += n
        else:
            served_by_cache += n
            ep_cached[e] += n
            cache_volume[src] = cache_volume.get(src, 0) + n
        before_hist[L_D] = before_hist.get(L_D, 0) + n
        after_hist[lat] = after_hist.get(lat, 0) + n

    # Ceiling: the score if every request could use the closest cache its
    # endpoint is wired to, capacity and contents ignored. Nothing can beat it.
    ceiling_saved = 0
    for v, e, n in inst.requests:
        L_D = inst.endpoint_latency[e]
        caches = inst.endpoint_caches.get(e) or {}
        ceiling_saved += n * (L_D - (min(caches.values()) if caches else L_D))

    score = official_score(inst, placed)
    ceiling = (ceiling_saved * 1000) // total_requests if total_requests else 0

    # Per-cache fill and load.
    caches = []
    for c in range(inst.C):
        videos = placed.get(c) or set()
        used = sum(inst.sizes[v] for v in videos)
        caches.append({
            "id": c,
            "videos": len(videos),
            "usedMB": used,
            "capacityMB": inst.X,
            "fill": round(used / inst.X, 4) if inst.X else 0.0,
            "requests": cache_volume.get(c, 0),
            "degree": len(inst.cache_endpoints.get(c) or []),
        })

    endpoints = []
    for e in range(inst.E):
        d = ep_demand[e]
        endpoints.append({
            "id": e,
            "ld": inst.endpoint_latency[e],
            "demand": d,
            "before": round(ep_before[e] / d, 1) if d else float(inst.endpoint_latency[e]),
            "after": round(ep_after[e] / d, 1) if d else float(inst.endpoint_latency[e]),
            "cachedShare": round(ep_cached[e] / d, 4) if d else 0.0,
            "degree": len(inst.endpoint_caches.get(e) or {}),
        })

    # How widely each video got replicated -- the counterweight to "just cache
    # everything popular everywhere".
    replication = {}
    for videos in placed.values():
        for v in videos:
            replication[v] = replication.get(v, 0) + 1
    rep_hist = {}
    for count in replication.values():
        rep_hist[count] = rep_hist.get(count, 0) + 1
    top_replicated = sorted(replication.items(), key=lambda kv: -kv[1])[:20]

    return {
        "score": score,
        "ceiling": ceiling,
        "ceilingPct": round(score / ceiling * 100, 1) if ceiling else None,
        "savedMs": saved_ms,
        "totalRequests": total_requests,
        "avgSavedMs": round(saved_ms / total_requests, 2) if total_requests else 0,
        "servedByCache": served_by_cache,
        "servedByDatacenter": served_by_dc,
        "cacheShare": round(served_by_cache / total_requests, 4) if total_requests else 0,
        "caches": caches,
        "endpoints": endpoints,
        "latencyBefore": sorted(before_hist.items()),
        "latencyAfter": sorted(after_hist.items()),
        "replication": {
            "distinctVideos": len(replication),
            "totalCopies": sum(replication.values()),
            "hist": sorted(rep_hist.items()),
            "top": [
                {"video": v, "copies": n, "size": inst.sizes[v]}
                for v, n in top_replicated
            ],
        },
        "placement": {str(c): sorted(vs) for c, vs in placed.items() if vs},
    }


def submission_text(inst: Instance, placed):
    """The exact bytes `write_output` would produce, without touching disk."""
    used = [c for c in range(inst.C) if placed.get(c)]
    lines = [str(len(used))]
    for c in used:
        lines.append(str(c) + " " + " ".join(str(v) for v in sorted(placed[c])))
    return "\n".join(lines) + "\n"


def validate(inst: Instance, placed):
    """Check the submission against the rules in the problem statement."""
    problems = []
    described = [c for c in range(inst.C) if placed.get(c)]
    for c in described:
        videos = placed[c]
        used = sum(inst.sizes[v] for v in videos)
        if used > inst.X:
            problems.append({
                "cache": c, "kind": "over_capacity",
                "detail": f"{used} MB stored in a {inst.X} MB cache",
            })
        for v in videos:
            if not (0 <= v < inst.V):
                problems.append({"cache": c, "kind": "bad_video_id", "detail": str(v)})
    return {
        "valid": not problems,
        "problems": problems,
        "describedCaches": len(described),
        "totalCaches": inst.C,
        "largestFill": max((sum(inst.sizes[v] for v in placed[c]) for c in described), default=0),
        "capacityMB": inst.X,
    }
