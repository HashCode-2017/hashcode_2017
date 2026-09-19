"""HTTP surface for the demo console."""
import asyncio
import json
import os

from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import ROOT, instances as inst_mod, viewmodel, runs

app = FastAPI(title="Streaming Videos Console", version="1.0")

# Dev only: Vite serves the UI on :5173 and proxies /api, but allowing the
# origin directly makes it possible to point the dev UI at a remote box.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

SSE_BATCH = 400
SSE_POLL = 0.05


@app.get("/api/health")
def health():
    return {"ok": True}


@app.get("/api/instances")
def api_instances():
    out = inst_mod.list_instances()
    for row in out:
        row["prewarmed"] = runs.is_prewarmed(row["id"])
    return out


def _load(instance_id):
    try:
        return inst_mod.load(instance_id)
    except KeyError:
        raise HTTPException(404, f"unknown instance: {instance_id}")


@app.get("/api/instances/{instance_id}")
def api_instance(instance_id: str):
    inst = _load(instance_id)
    head = viewmodel.file_head(inst_mod.path_for(instance_id))
    data = viewmodel.summary(inst, instance_id, head)
    data["prewarmed"] = runs.is_prewarmed(instance_id)
    return data


@app.get("/api/instances/{instance_id}/topology")
def api_topology(instance_id: str):
    inst = _load(instance_id)
    return viewmodel.topology(inst, instance_id)


class RunRequest(BaseModel):
    instance: str
    rounds: int = 5
    force: bool = False


@app.post("/api/runs")
def api_create_run(req: RunRequest):
    if inst_mod.path_for(req.instance) is None:
        raise HTTPException(404, f"unknown instance: {req.instance}")
    if not (1 <= req.rounds <= 20):
        raise HTTPException(400, "rounds must be between 1 and 20")
    run, created = runs.start(req.instance, req.rounds, force=req.force)
    meta = run.meta()
    meta["created"] = created
    return meta


@app.get("/api/runs/{run_id}")
def api_run(run_id: str):
    run = runs.get(run_id)
    if run is None:
        raise HTTPException(404, f"unknown run: {run_id}")
    return JSONResponse(run.record())


@app.get("/api/runs/{run_id}/meta")
def api_run_meta(run_id: str):
    run = runs.get(run_id)
    if run is None:
        raise HTTPException(404, f"unknown run: {run_id}")
    return run.meta()


@app.get("/api/runs/{run_id}/result")
def api_run_result(run_id: str):
    run = runs.get(run_id)
    if run is None:
        raise HTTPException(404, f"unknown run: {run_id}")
    if run.result is None:
        raise HTTPException(409, f"run is {run.status}")
    return JSONResponse(run.result)


@app.get("/api/runs/{run_id}/submission")
def api_submission(run_id: str):
    run = runs.get(run_id)
    if run is None or run.result is None:
        raise HTTPException(404, "no finished run")
    return Response(
        run.result["submission"],
        media_type="text/plain",
        headers={"Content-Disposition": f'attachment; filename="{run.instance}.out"'},
    )


@app.get("/api/runs/{run_id}/validate")
def api_validate(run_id: str):
    run = runs.get(run_id)
    if run is None or run.result is None:
        raise HTTPException(404, "no finished run")
    return run.result["validation"]


@app.get("/api/runs/{run_id}/stream")
async def api_stream(run_id: str, start: int = 0):
    """Server-sent events, batched.

    Subscribers track their own index into the run's event list, so a client
    that connects late (or reconnects) backfills from `start` and then follows
    live without the server holding per-client state.
    """
    run = runs.get(run_id)
    if run is None:
        raise HTTPException(404, f"unknown run: {run_id}")

    async def gen():
        i = max(0, start)
        while True:
            total = len(run.events)
            if i < total:
                batch = run.events[i:i + SSE_BATCH]
                i += len(batch)
                yield "data: " + json.dumps(
                    {"events": batch, "status": run.status, "next": i},
                    separators=(",", ":"),
                ) + "\n\n"
                continue
            if run.status in ("done", "error"):
                yield "data: " + json.dumps({
                    "events": [], "status": run.status, "next": i, "final": True,
                    "meta": run.meta(),
                }, separators=(",", ":")) + "\n\n"
                return
            await asyncio.sleep(SSE_POLL)

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no"},
    )


# ---------------------------------------------------------------- static UI
# In demo mode the built front end is served from the same origin as the API,
# so there is one URL to open on stage and no CORS to go wrong.
_DIST = os.path.join(ROOT, "ui", "dist")
if os.path.isdir(_DIST):
    app.mount("/assets", StaticFiles(directory=os.path.join(_DIST, "assets")), name="assets")

    @app.get("/{full_path:path}")
    def spa(full_path: str):
        candidate = os.path.join(_DIST, full_path)
        if full_path and os.path.isfile(candidate):
            return FileResponse(candidate)
        return FileResponse(os.path.join(_DIST, "index.html"))
