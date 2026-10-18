#!/usr/bin/env python3
"""
Local web runner for the solving pipeline (solve.py).

Drop one or many .in files in the page, pick a time budget, and every file
goes through solve.solve(): greedy -> re-pack -> LNS, plus the exact solver on
small data sets. Results (score, method, proven bound, time) appear as they
finish, and each .out can be downloaded, or all of them as one zip.

    python runner/server.py [--port 8017] [--parallel 4]

then open http://127.0.0.1:8017
"""

import argparse
import io
import os
import re
import sys
import threading
import time
import uuid
import zipfile

import uvicorn
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, HTMLResponse, Response

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
import solve  # noqa: E402  (needs ROOT on the path)

HERE = os.path.dirname(os.path.abspath(__file__))
WORK = os.path.join(HERE, ".work")
LIBRARY = [os.path.join(ROOT, "instances")]      # folders offered as one-click picks

app = FastAPI()
lock = threading.Lock()
jobs = {}            # id -> job dict, in insertion order
settings = {"parallel": 4}


def _safe_name(name):
    base = os.path.basename(name or "instance.in")
    base = re.sub(r"[^A-Za-z0-9._ ()-]", "_", base)
    return base if base.endswith(".in") else base + ".in"


def _public(job):
    return {k: job[k] for k in ("id", "name", "bytes", "budget", "status", "phase",
                                "queued", "started", "finished", "result", "error", "progress")}


def _new_job(name, data, budget):
    jid = uuid.uuid4().hex[:10]
    folder = os.path.join(WORK, jid)
    os.makedirs(folder)
    path = os.path.join(folder, _safe_name(name))
    with open(path, "wb") as f:
        f.write(data)
    job = {"id": jid, "name": _safe_name(name), "bytes": len(data), "budget": budget,
           "status": "queued", "phase": "waiting", "queued": time.time(), "started": None,
           "finished": None, "result": None, "error": None, "progress": None,
           "input": path, "output": path[:-3] + ".out"}
    with lock:
        jobs[jid] = job
    return job


def _run(job):
    def log(msg):
        job["phase"] = msg
    try:
        def progress(snap):
            job["progress"] = snap
        job["result"] = solve.solve(job["input"], job["output"], job["budget"], log=log,
                                    on_progress=progress)
        job["status"] = "done"
        job["phase"] = "done"
    except Exception as e:                       # shown in the page, never fatal
        job["status"] = "error"
        job["error"] = str(e) or type(e).__name__
        job["phase"] = "failed"
    job["finished"] = time.time()


def _scheduler():
    """Start queued jobs in order, at most settings['parallel'] at a time."""
    while True:
        with lock:
            running = sum(1 for j in jobs.values() if j["status"] == "running")
            free = settings["parallel"] - running
            for j in jobs.values():
                if free <= 0:
                    break
                if j["status"] == "queued":
                    j["status"], j["phase"], j["started"] = "running", "starting", time.time()
                    threading.Thread(target=_run, args=(j,), daemon=True).start()
                    free -= 1
        time.sleep(0.3)


@app.get("/", response_class=HTMLResponse)
def index():
    with open(os.path.join(HERE, "index.html"), encoding="utf8") as f:
        return f.read()


@app.get("/api/state")
def state():
    with lock:
        return {"jobs": [_public(j) for j in jobs.values()], "parallel": settings["parallel"],
                "now": time.time()}


@app.post("/api/jobs")
async def add_job(request: Request, name: str, budget: float = 300):
    data = await request.body()
    if not data:
        raise HTTPException(400, "the file is empty")
    head = data[:200].split(b"\n", 1)[0].split()
    if len(head) != 5 or not all(t.isdigit() for t in head):
        raise HTTPException(400, f"{name} does not start with the 'V E R C X' line of a Hash Code 2017 input")
    return _public(_new_job(name, data, max(5.0, min(budget, 3600.0))))


@app.get("/api/library")
def library():
    files = []
    for folder in LIBRARY:
        if os.path.isdir(folder):
            for f in sorted(os.listdir(folder)):
                if f.endswith(".in"):
                    files.append({"name": f, "bytes": os.path.getsize(os.path.join(folder, f))})
    return files


@app.post("/api/library/{name}")
def add_from_library(name: str, budget: float = 300):
    for folder in LIBRARY:
        path = os.path.join(folder, os.path.basename(name))
        if os.path.isfile(path):
            with open(path, "rb") as f:
                return _public(_new_job(name, f.read(), max(5.0, min(budget, 3600.0))))
    raise HTTPException(404, f"{name} is not in the library")


@app.put("/api/parallel/{n}")
def set_parallel(n: int):
    settings["parallel"] = max(1, min(n, os.cpu_count() or 4))
    return {"parallel": settings["parallel"]}


@app.delete("/api/jobs/{jid}")
def remove(jid: str):
    with lock:
        job = jobs.get(jid)
        if not job:
            raise HTTPException(404, "no such run")
        if job["status"] == "running":
            raise HTTPException(409, "this run is in progress; it can be removed once it ends")
        del jobs[jid]
    return {"ok": True}


@app.delete("/api/jobs")
def clear_finished():
    with lock:
        for jid in [j for j, job in jobs.items() if job["status"] in ("done", "error")]:
            del jobs[jid]
    return {"ok": True}


def _out_name(job):
    return job["name"][:-3] + ".out"


@app.get("/api/jobs/{jid}/out")
def download(jid: str):
    job = jobs.get(jid)
    if not job or job["status"] != "done":
        raise HTTPException(404, "no output for this run yet")
    return FileResponse(job["output"], filename=_out_name(job), media_type="text/plain")


@app.get("/api/outputs.zip")
def download_all():
    done = [j for j in jobs.values() if j["status"] == "done"]
    if not done:
        raise HTTPException(404, "no finished runs yet")
    buf = io.BytesIO()
    seen = set()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        lines = ["instance,score,method,proven_upper_bound,seconds"]
        for j in done:
            name = _out_name(j)
            if name in seen:                          # same file run twice
                name = f"{name[:-4]}_{j['id']}.out"
            seen.add(name)
            z.write(j["output"], name)
            r = j["result"]
            lines.append(f"{j['name']},{r['score']},{r['method']},{r['bound'] or ''},{r['seconds']}")
        z.writestr("scores.csv", "\n".join(lines) + "\n")
    return Response(buf.getvalue(), media_type="application/zip",
                    headers={"Content-Disposition": 'attachment; filename="outputs.zip"'})


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8017)
    ap.add_argument("--parallel", type=int, default=4, help="data sets solved at the same time")
    a = ap.parse_args()
    settings["parallel"] = max(1, a.parallel)
    os.makedirs(WORK, exist_ok=True)
    solve.build_solver()
    threading.Thread(target=_scheduler, daemon=True).start()
    print(f"runner on http://127.0.0.1:{a.port}")
    uvicorn.run(app, host="127.0.0.1", port=a.port, log_level="warning")


if __name__ == "__main__":
    main()
