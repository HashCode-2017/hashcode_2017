"""Discovery and caching of the data sets: the ones shipped with the repo, and
the ones generated from the web console (stored in the database, cached as
files in `.generated/` because the parser and the download read files).

Two levels of detail:
  * `list_instances()` reads only the first line of each file, so the picker
    screen is instant even for the 6 MB data set.
  * `load(id)` does the full `parse_input` and keeps the result in a small LRU,
    because parsing `kittens.in` is not something we want to repeat per request.
"""
import csv
import os
import threading
import time
from collections import OrderedDict

from . import ROOT
from solution import parse_input, Instance

# Files to expose, in the order the picker should show them: smallest and most
# explicable first, the headline data set last.
CATALOG = [
    ("example", "example.in", "The worked example from the problem statement"),
    ("me_at_the_zoo", "instances/me_at_the_zoo.in", "Small enough to read every node"),
    ("videos_worth_spreading", "instances/videos_worth_spreading.in", "Sparse links, large catalog"),
    ("trending_today", "instances/trending_today.in", "Every endpoint sees every cache"),
    ("kittens", "instances/kittens.in", "The full-scale data set"),
]

# The four data sets of the real qualification round. The overall ranking is
# the sum of each player's best score on these, exactly as Hash Code scored it.
OFFICIAL = ["me_at_the_zoo", "videos_worth_spreading", "trending_today", "kittens"]


def _generated():
    """Benchmark data sets from `generated_instances/`, described by its manifest."""
    folder = os.path.join(ROOT, "generated_instances")
    manifest = os.path.join(folder, "manifest.csv")
    if not os.path.exists(manifest):
        return []
    with open(manifest, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    return [(r["name"], f"generated_instances/{r['name']}.in", f"Generated: {r['tag']}")
            for r in rows]


CATALOG += _generated()

# A node-link drawing stops meaning anything long before this, but these two
# bounds are where it stops being *drawable* at all.
MAX_GRAPH_LINKS = 1200
MAX_GRAPH_NODES = 400

_cache = OrderedDict()          # id -> Instance
_cache_lock = threading.Lock()
_parse_locks = {}               # id -> Lock, so one file is parsed only once
_CACHE_SIZE = 2                 # a parsed `kittens` is large; hold very few


def path_for(instance_id):
    for iid, rel, _ in CATALOG:
        if iid == instance_id:
            return os.path.join(ROOT, rel)
    if instance_id in web_instances():
        return _web_file(instance_id)
    return None


# ------------------------------------------------- generated from the console

WEB_DIR = os.path.join(ROOT, ".generated")
_WEB_TTL = 15                   # seconds between database refreshes of the list
_web = {}
_web_loaded = 0.0
_web_lock = threading.Lock()


def web_instances(refresh=False):
    """id -> metadata of every console-generated instance."""
    global _web, _web_loaded
    with _web_lock:
        if refresh or time.time() - _web_loaded > _WEB_TTL:
            from . import db
            _web = {r["id"]: r for r in db.generated_instances()}
            _web_loaded = time.time()
        return _web


def _web_file(instance_id):
    path = os.path.join(WEB_DIR, instance_id + ".in")
    if not os.path.exists(path):
        from . import db
        text = db.generated_text(instance_id)
        if text is None:
            return None
        os.makedirs(WEB_DIR, exist_ok=True)
        tmp = path + ".tmp"
        with open(tmp, "w", encoding="ascii", newline="\n") as f:
            f.write(text)
        os.replace(tmp, path)
    return path


def forget(instance_id):
    """Drop a deleted generated instance from every cache."""
    with _cache_lock:
        _cache.pop(instance_id, None)
    try:
        os.remove(os.path.join(WEB_DIR, instance_id + ".in"))
    except FileNotFoundError:
        pass
    web_instances(refresh=True)


def _header(path):
    """Read just the first line: V E R C X."""
    with open(path, "r", encoding="ascii") as f:
        first = f.readline()
    V, E, R, C, X = (int(x) for x in first.split())
    return {"V": V, "E": E, "R": R, "C": C, "X": X}


def tier_for(E, C, links):
    """Pick a topology representation.

    'graph' ships real nodes and edges. 'aggregate' ships per-cache and
    per-endpoint summaries instead -- `kittens` has 351,881 endpoint-cache
    links, and drawing those is neither possible nor informative.
    """
    if links is not None and links > MAX_GRAPH_LINKS:
        return "aggregate"
    if E + C > MAX_GRAPH_NODES:
        return "aggregate"
    return "graph"


def list_instances():
    out = []
    for iid, rel, blurb in CATALOG:
        path = os.path.join(ROOT, rel)
        if not os.path.exists(path):
            continue
        head = _header(path)
        # Link count needs a full parse, so estimate the tier from the header
        # here and let the detail endpoint correct it once the file is read.
        entry = {
            "id": iid,
            "file": rel.replace("\\", "/"),
            "blurb": blurb,
            "bytes": os.path.getsize(path),
            "tier": tier_for(head["E"], head["C"], None),
            "loaded": iid in _cache,
            "official": iid in OFFICIAL,
        }
        entry.update(head)
        out.append(entry)
    for iid, meta in web_instances().items():
        V, E, R, C, X = (int(x) for x in meta["header"].split())
        group = meta["owner_group"]
        who = "the professors" if group == "P" else f"group {group}" if group else "an admin"
        out.append({
            "id": iid, "file": f"generated/{iid}.in",
            "blurb": f"{meta['label']} · {meta['model']}, generated by {who}",
            "bytes": meta["bytes"], "tier": tier_for(E, C, None), "loaded": iid in _cache,
            "official": iid in OFFICIAL, "V": V, "E": E, "R": R, "C": C, "X": X,
            "generated": {"model": meta["model"], "group": group, "by": meta["created_by"],
                          "params": meta["params"], "seed": meta["seed"]},
        })
    return out


def load(instance_id) -> Instance:
    """Parse an instance, memoised.

    The parse happens under a per-instance lock rather than inside the cache
    lock: the browser asks for the summary and the topology at the same moment,
    and without this both requests miss the cache and parse the same 6 MB file
    concurrently -- twice the wait and twice the memory. Holding the *cache*
    lock across the parse instead would serialise every unrelated request.
    """
    with _cache_lock:
        if instance_id in _cache:
            _cache.move_to_end(instance_id)
            return _cache[instance_id]
        lock = _parse_locks.get(instance_id)
        if lock is None:
            lock = _parse_locks[instance_id] = threading.Lock()

    path = path_for(instance_id)
    if path is None or not os.path.exists(path):
        raise KeyError(instance_id)

    with lock:
        # Another thread may have finished parsing while we waited.
        with _cache_lock:
            if instance_id in _cache:
                _cache.move_to_end(instance_id)
                return _cache[instance_id]

        inst = parse_input(path)

        with _cache_lock:
            _cache[instance_id] = inst
            _cache.move_to_end(instance_id)
            while len(_cache) > _CACHE_SIZE:
                _cache.popitem(last=False)
        return inst


def link_count(inst: Instance):
    return sum(len(c) for c in inst.endpoint_caches.values())
