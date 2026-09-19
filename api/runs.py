"""Run lifecycle: solve on a worker thread, stream the events, cache the result.

`kittens` takes ~72 seconds to solve. That rules out a blocking request, so a
run is a job: POST creates it, an SSE stream reports it, and the finished
record is written to `.runs/` so the next time it is asked for it comes back
instantly and the UI replays it. Live and replayed runs carry exactly the same
event sequence, so the front end has one code path, not two.
"""
import json
import os
import threading
import time

from . import ROOT, instances as inst_mod, analysis
from solution import solve

RUNS_DIR = os.path.join(ROOT, ".runs")

# Events are appended to a list and subscribers poll it by index. With at most
# ~11.5k events per run that is cheaper and far less fragile than fanning out
# per-subscriber queues across the thread boundary.
_runs = {}
_lock = threading.Lock()


class Run:
    def __init__(self, run_id, instance_id, rounds):
        self.id = run_id
        self.instance = instance_id
        self.rounds = rounds
        self.status = "queued"          # queued|parsing|solving|analysing|done|error
        self.error = None
        self.events = []
        self.result = None
        self.cached = False
        self.started = time.time()
        self.parse_seconds = None
        self.solve_seconds = None
        self.analyse_seconds = None

    def emit(self, kind, payload=None):
        ev = {"i": len(self.events), "kind": kind}
        if payload:
            ev.update(payload)
        self.events.append(ev)

    def meta(self):
        return {
            "id": self.id, "instance": self.instance, "rounds": self.rounds,
            "status": self.status, "error": self.error, "cached": self.cached,
            "eventCount": len(self.events),
            "parseSeconds": self.parse_seconds,
            "solveSeconds": self.solve_seconds,
            "analyseSeconds": self.analyse_seconds,
        }

    def record(self):
        d = self.meta()
        d["events"] = self.events
        d["result"] = self.result
        return d


def run_id_for(instance_id, rounds):
    return f"{instance_id}-r{rounds}"


def cache_path(run_id):
    return os.path.join(RUNS_DIR, run_id + ".json")


def is_prewarmed(instance_id, rounds=5):
    return os.path.exists(cache_path(run_id_for(instance_id, rounds)))


def _load_from_disk(run_id):
    path = cache_path(run_id)
    if not os.path.exists(path):
        return None
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    run = Run(run_id, data["instance"], data["rounds"])
    run.status = "done"
    run.events = data["events"]
    run.result = data["result"]
    run.cached = True
    run.parse_seconds = data.get("parseSeconds")
    run.solve_seconds = data.get("solveSeconds")
    run.analyse_seconds = data.get("analyseSeconds")
    return run


def _persist(run: Run):
    os.makedirs(RUNS_DIR, exist_ok=True)
    tmp = cache_path(run.id) + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(run.record(), f, separators=(",", ":"))
    os.replace(tmp, cache_path(run.id))


def _work(run: Run):
    try:
        run.status = "parsing"
        run.emit("phase", {"phase": "parsing"})
        t0 = time.time()
        inst = inst_mod.load(run.instance)
        run.parse_seconds = round(time.time() - t0, 3)
        run.emit("parsed", {
            "seconds": run.parse_seconds,
            "V": inst.V, "E": inst.E, "R": inst.R, "C": inst.C, "X": inst.X,
            "links": inst_mod.link_count(inst),
        })

        run.status = "solving"
        run.emit("phase", {"phase": "solving"})
        t0 = time.time()
        placed = solve(inst, max_rounds=run.rounds, on_event=run.emit)
        run.solve_seconds = round(time.time() - t0, 3)

        run.status = "analysing"
        run.emit("phase", {"phase": "analysing"})
        t0 = time.time()
        run.result = analysis.analyse(inst, placed)
        run.result["submission"] = analysis.submission_text(inst, placed)
        run.result["validation"] = analysis.validate(inst, placed)
        run.analyse_seconds = round(time.time() - t0, 3)

        run.emit("done", {
            "score": run.result["score"],
            "solveSeconds": run.solve_seconds,
            "analyseSeconds": run.analyse_seconds,
        })
        # Persist BEFORE flipping to "done": callers (prewarm especially) treat
        # that status as the signal to move on, and a daemon thread still
        # writing when the process exits leaves a truncated .tmp behind.
        _persist(run)
        run.status = "done"
    except Exception as exc:                       # surface it, don't swallow it
        run.status = "error"
        run.error = f"{type(exc).__name__}: {exc}"
        run.emit("error", {"message": run.error})


def start(instance_id, rounds=5, force=False):
    """Return (run, created). Reuses an in-memory or on-disk run unless forced."""
    run_id = run_id_for(instance_id, rounds)
    with _lock:
        existing = _runs.get(run_id)
        if existing and not force and existing.status != "error":
            return existing, False
        if not force:
            disk = _load_from_disk(run_id)
            if disk is not None:
                _runs[run_id] = disk
                return disk, False
        run = Run(run_id, instance_id, rounds)
        _runs[run_id] = run

    threading.Thread(target=_work, args=(run,), daemon=True, name="solve:" + run_id).start()
    return run, True


def get(run_id):
    with _lock:
        run = _runs.get(run_id)
    if run is not None:
        return run
    run = _load_from_disk(run_id)
    if run is not None:
        with _lock:
            _runs[run_id] = run
    return run


def drop(run_id):
    with _lock:
        _runs.pop(run_id, None)
