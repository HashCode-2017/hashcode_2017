"""Turns a parsed Instance into payloads a browser can actually render.

The hard constraint here is `kittens`: 1000 endpoints, 500 caches and 351,881
endpoint-cache links. Shipping that edge list would be a multi-megabyte
response describing a drawing nobody can read. So topology comes in two
shapes -- a real node-link graph for the sparse data sets, and per-node
aggregates plus a downsampled matrix for the dense ones -- and the UI is told
which one it got, rather than being handed a hairball to fake its way through.

Both shapes always carry the same `caches` and `endpoints` aggregate arrays,
so the solve animation is written once and works for either.
"""
from . import instances as inst_mod
from solution import Instance

MATRIX_BUCKETS = 100
HEAD_BYTES = 1400


def histogram(values, bins, lo=None, hi=None):
    """Plain counts over equal-width bins. Returns edges + counts."""
    values = list(values)
    if not values:
        return {"lo": 0, "hi": 0, "bins": [], "max": 0}
    lo = min(values) if lo is None else lo
    hi = max(values) if hi is None else hi
    if hi <= lo:
        return {"lo": lo, "hi": hi, "bins": [len(values)], "max": len(values)}
    counts = [0] * bins
    span = hi - lo
    for v in values:
        i = int((v - lo) / span * bins)
        if i >= bins:
            i = bins - 1
        elif i < 0:
            i = 0
        counts[i] += 1
    return {"lo": lo, "hi": hi, "bins": counts, "max": max(counts)}


def _endpoint_demand(inst: Instance):
    """Total requests per endpoint, summed once.

    Computing this inside the per-cache loop instead means re-summing an
    endpoint's demand table once for every cache it is wired to -- on `kittens`
    that is 500 caches x 704 endpoints x ~198 videos, tens of millions of
    operations, and it showed up as a visible stall before the topology
    appeared.
    """
    out = [0] * inst.E
    for e in range(inst.E):
        d = inst.endpoint_requests.get(e)
        if d:
            out[e] = sum(d.values())
    return out


def _cache_rows(inst: Instance, demand_by_endpoint=None):
    """Per-cache facts that are true before anything is placed."""
    if demand_by_endpoint is None:
        demand_by_endpoint = _endpoint_demand(inst)
    rows = []
    for c in range(inst.C):
        eps = inst.cache_endpoints.get(c) or []
        lats = [lat for _, lat in eps]
        demand = 0
        for e, _ in eps:
            demand += demand_by_endpoint[e]
        rows.append({
            "id": c,
            "degree": len(eps),
            "minLat": min(lats) if lats else None,
            "meanLat": round(sum(lats) / len(lats), 1) if lats else None,
            "capacity": inst.X,
            "reachDemand": demand,
        })
    return rows


def _endpoint_rows(inst: Instance, demand_by_endpoint=None):
    """Per-endpoint facts, including the cold (all-datacenter) latency and the
    best latency physically reachable if capacity were unlimited."""
    if demand_by_endpoint is None:
        demand_by_endpoint = _endpoint_demand(inst)
    rows = []
    for e in range(inst.E):
        caches = inst.endpoint_caches.get(e) or {}
        demand_map = inst.endpoint_requests.get(e)
        demand = demand_by_endpoint[e]
        rows.append({
            "id": e,
            "ld": inst.endpoint_latency[e],
            "degree": len(caches),
            "bestLat": min(caches.values()) if caches else inst.endpoint_latency[e],
            "demand": demand,
            "videos": len(demand_map) if demand_map else 0,
        })
    return rows


def summary(inst: Instance, instance_id, head_text):
    """Everything the ingest scene needs: counts, distributions, file head."""
    links = inst_mod.link_count(inst)
    total_requests = sum(n for _, _, n in inst.requests)

    video_demand = {}
    for v, _, n in inst.requests:
        video_demand[v] = video_demand.get(v, 0) + n
    top_videos = sorted(video_demand.items(), key=lambda kv: kv[1], reverse=True)[:24]

    ep_rows = _endpoint_rows(inst)
    cache_lats = [lat for caches in inst.endpoint_caches.values() for lat in caches.values()]

    return {
        "id": instance_id,
        "V": inst.V, "E": inst.E, "R": inst.R, "C": inst.C, "X": inst.X,
        "links": links,
        "tier": inst_mod.tier_for(inst.E, inst.C, links),
        "totalRequests": total_requests,
        "totalVideoMB": sum(inst.sizes),
        "totalCapacityMB": inst.X * inst.C,
        "avgLinksPerEndpoint": round(links / inst.E, 1),
        "unconnectedEndpoints": sum(1 for r in ep_rows if r["degree"] == 0),
        "head": head_text,
        "dist": {
            "videoSize": histogram(inst.sizes, 48),
            "dcLatency": histogram([r["ld"] for r in ep_rows], 40),
            "cacheLatency": histogram(cache_lats, 40) if cache_lats else None,
            "requestRow": histogram([n for _, _, n in inst.requests], 40),
            "endpointDegree": histogram([r["degree"] for r in ep_rows], 40),
        },
        "topVideos": [{"video": v, "requests": n, "size": inst.sizes[v]} for v, n in top_videos],
    }


def _matrix(inst: Instance, cache_rows, endpoint_rows):
    """Downsampled endpoint x cache latency map for the dense data sets.

    Rows and columns are sorted by demand and degree respectively, so the
    block structure of the connection graph is visible instead of being
    scrambled by arbitrary ids.
    """
    ep_order = [r["id"] for r in sorted(endpoint_rows, key=lambda r: -r["demand"])]
    c_order = [r["id"] for r in sorted(cache_rows, key=lambda r: -r["degree"])]
    rows = min(MATRIX_BUCKETS, len(ep_order))
    cols = min(MATRIX_BUCKETS, len(c_order))
    if rows == 0 or cols == 0:
        return None

    ep_bucket = {e: min(rows - 1, i * rows // len(ep_order)) for i, e in enumerate(ep_order)}
    c_bucket = {c: min(cols - 1, i * cols // len(c_order)) for i, c in enumerate(c_order)}

    total = [[0] * cols for _ in range(rows)]
    count = [[0] * cols for _ in range(rows)]
    for e, caches in inst.endpoint_caches.items():
        rb = ep_bucket[e]
        for c, lat in caches.items():
            cb = c_bucket[c]
            total[rb][cb] += lat
            count[rb][cb] += 1

    cells = [
        [round(total[r][c] / count[r][c]) if count[r][c] else None for c in range(cols)]
        for r in range(rows)
    ]
    dens = [[count[r][c] for c in range(cols)] for r in range(rows)]
    return {
        "rows": rows, "cols": cols, "latency": cells, "density": dens,
        "rowLabel": "endpoints, by demand", "colLabel": "caches, by connectivity",
    }


def topology(inst: Instance, instance_id):
    links = inst_mod.link_count(inst)
    tier = inst_mod.tier_for(inst.E, inst.C, links)
    demand = _endpoint_demand(inst)
    cache_rows = _cache_rows(inst, demand)
    ep_rows = _endpoint_rows(inst, demand)

    payload = {
        "id": instance_id,
        "tier": tier,
        "links": links,
        "V": inst.V, "E": inst.E, "C": inst.C, "X": inst.X,
        "caches": cache_rows,
        "endpoints": ep_rows,
    }

    if tier == "graph":
        payload["edges"] = [
            {"e": e, "c": c, "lat": lat}
            for e, caches in sorted(inst.endpoint_caches.items())
            for c, lat in sorted(caches.items())
        ]
    else:
        payload["matrix"] = _matrix(inst, cache_rows, ep_rows)
    return payload


def file_head(path, limit=HEAD_BYTES):
    with open(path, "r", encoding="ascii") as f:
        return f.read(limit)
