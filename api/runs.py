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
import uuid

from . import ROOT, instances as inst_mod, analysis, replay, db
from solution import solve

RUNS_DIR = os.path.join(ROOT, ".runs")

# Events are appended to a list and subscribers poll it by index. With at most
# ~11.5k events per run that is cheaper and far less fragile than fanning out
# per-subscriber queues across the thread boundary.
_runs = {}
_lock = threading.Lock()


class Run:
    def __init__(self, run_id, instance_id, rounds, source="solver", owner=None):
        self.id = run_id
        self.instance = instance_id
        self.rounds = rounds
        self.source = source            # solver | trace | out
        self.owner = owner              # username for uploaded submissions
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
            "source": self.source, "owner": self.owner,
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
    """From the disk cache, else from the database (refilling the cache)."""
    path = cache_path(run_id)
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    else:
        try:
            text = db.load_run(run_id)
        except Exception:
            text = None
        if text is None:
            return None
        os.makedirs(RUNS_DIR, exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            f.write(text)
        data = json.loads(text)
    run = Run(run_id, data["instance"], data["rounds"],
              data.get("source", "solver"), data.get("owner"))
    run.status = "done"
    run.events = data["events"]
    run.result = data["result"]
    run.cached = True
    run.parse_seconds = data.get("parseSeconds")
    run.solve_seconds = data.get("solveSeconds")
    run.analyse_seconds = data.get("analyseSeconds")
    return run


def _persist(run: Run):
    text = json.dumps(run.record(), separators=(",", ":"))
    os.makedirs(RUNS_DIR, exist_ok=True)
    tmp = cache_path(run.id) + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(text)
    os.replace(tmp, cache_path(run.id))
    # The copy that outlives the server's disk. A failure here must not lose
    # the run that was just computed, so it is reported but not raised.
    try:
        db.save_run(run.id, run.instance, text)
    except Exception as exc:
        print(f"warning: could not store run {run.id} in the database: {exc}")


def _solver(inst, run):
    return solve(inst, max_rounds=run.rounds, on_event=run.emit), None


def _work(run: Run, produce=_solver, on_done=None):
    """Parse, produce a placement, analyse. `produce(inst, run)` returns
    (placement, extra) and emits events as it goes; `extra` is merged into the
    result. The reference solver is just the default producer."""
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
        placed, extra = produce(inst, run)
        run.solve_seconds = round(time.time() - t0, 3)

        run.status = "analysing"
        run.emit("phase", {"phase": "analysing"})
        t0 = time.time()
        run.result = analysis.analyse(inst, placed)
        run.result["submission"] = analysis.submission_text(inst, placed)
        run.result["validation"] = analysis.validate(inst, placed)
        if extra:
            run.result.update(extra)
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
        if on_done:
            on_done(run)
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


def start_submission(instance_id, out_text, trace_text, owner, on_done=None):
    """Validate the files up front (so a bad upload is a 400, not a failed
    job), then replay them on a worker thread like any other run."""
    inst = inst_mod.load(instance_id)
    out_placed = replay.parse_out(inst, out_text)
    ops = replay.parse_trace(inst, trace_text) if trace_text and trace_text.strip() else None

    def produce(inst, run):
        if ops is None:
            placed, problems, steps = replay.replay(inst, replay.ops_from_out(inst, out_placed), run.emit)
            return placed, {"trace": {"provided": False, "steps": steps}}
        trace_placed, problems, steps = replay.replay(inst, ops, run.emit)
        diffs = replay.compare(trace_placed, out_placed)
        # The .out is what gets scored, whatever the trace says.
        placed = {c: set(vs) for c, vs in out_placed.items()}
        return placed, {"trace": {
            "provided": True, "steps": steps, "problems": problems,
            "consistent": not diffs, "differences": diffs[:20],
            "differenceCount": len(diffs),
        }}

    run_id = f"sub-{uuid.uuid4().hex[:10]}"
    run = Run(run_id, instance_id, 0, "trace" if ops else "out", owner)
    with _lock:
        _runs[run_id] = run
    threading.Thread(target=_work, args=(run, produce, on_done), daemon=True,
                     name="replay:" + run_id).start()
    return run


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
