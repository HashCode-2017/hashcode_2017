"""Discovery and caching of the data sets shipped with the repo.

Two levels of detail:
  * `list_instances()` reads only the first line of each file, so the picker
    screen is instant even for the 6 MB data set.
  * `load(id)` does the full `parse_input` and keeps the result in a small LRU,
    because parsing `kittens.in` is not something we want to repeat per request.
"""
import os
import threading
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
    return None


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
        }
        entry.update(head)
        out.append(entry)
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
