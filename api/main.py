"""HTTP surface for the demo console."""
import asyncio
import json
import os

from fastapi import Cookie, Depends, FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import ROOT, instances as inst_mod, viewmodel, runs, db, replay

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


def viewer(hc_session: str | None = Cookie(default=None)):
    """The signed-in user; every run endpoint below checks what they may see."""
    user = db.user_for_token(hc_session)
    if user is None:
        raise HTTPException(401, "sign in first")
    return user


def _visible_run(run_id, user):
    """A group is a shared account: members see every submission made by
    anyone in their group, and nobody else's. The reference solver's runs --
    whose `.out` could simply be downloaded and resubmitted -- are admin-only."""
    run = runs.get(run_id)
    if run is None:
        raise HTTPException(404, f"unknown run: {run_id}")
    if user.get("isAdmin"):
        return run
    if run.source == "solver" or not (run.owner == user["username"] or db.same_group(run.owner, user)):
        raise HTTPException(403, "not your run")
    return run


@app.get("/api/instances")
def api_instances():
    out = inst_mod.list_instances()
    chosen = set(db.ranked_instances(inst_mod.OFFICIAL))
    for row in out:
        row["prewarmed"] = runs.is_prewarmed(row["id"])
        # `official` now means "counts for the final ranking", as the admin set it.
        row["official"] = row["id"] in chosen
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


@app.get("/api/instances/{instance_id}/download")
def api_download(instance_id: str):
    """The raw `.in`, so players can run their own solver on exactly this file."""
    path = inst_mod.path_for(instance_id)
    if path is None or not os.path.exists(path):
        raise HTTPException(404, f"unknown instance: {instance_id}")
    return FileResponse(path, media_type="text/plain", filename=f"{instance_id}.in")


class RunRequest(BaseModel):
    instance: str
    rounds: int = 5
    force: bool = False


@app.post("/api/runs")
def api_create_run(req: RunRequest, user=Depends(viewer)):
    if not user.get("isAdmin"):
        raise HTTPException(403, "the reference solver is for admins; submit your own .out")
    if inst_mod.path_for(req.instance) is None:
        raise HTTPException(404, f"unknown instance: {req.instance}")
    if not (1 <= req.rounds <= 20):
        raise HTTPException(400, "rounds must be between 1 and 20")
    run, created = runs.start(req.instance, req.rounds, force=req.force)
    meta = run.meta()
    meta["created"] = created
    return meta


@app.get("/api/runs/{run_id}")
def api_run(run_id: str, user=Depends(viewer)):
    run = _visible_run(run_id, user)
    return JSONResponse(run.record())


@app.get("/api/runs/{run_id}/meta")
def api_run_meta(run_id: str, user=Depends(viewer)):
    return _visible_run(run_id, user).meta()


@app.get("/api/runs/{run_id}/result")
def api_run_result(run_id: str, user=Depends(viewer)):
    run = _visible_run(run_id, user)
    if run.result is None:
        raise HTTPException(409, f"run is {run.status}")
    return JSONResponse(run.result)


@app.get("/api/runs/{run_id}/submission")
def api_submission(run_id: str, user=Depends(viewer)):
    run = _visible_run(run_id, user)
    if run.result is None:
        raise HTTPException(404, "no finished run")
    return Response(
        run.result["submission"],
        media_type="text/plain",
        headers={"Content-Disposition": f'attachment; filename="{run.instance}.out"'},
    )


@app.get("/api/runs/{run_id}/validate")
def api_validate(run_id: str, user=Depends(viewer)):
    run = _visible_run(run_id, user)
    if run.result is None:
        raise HTTPException(404, "no finished run")
    return run.result["validation"]


@app.get("/api/runs/{run_id}/routed")
def api_routed(run_id: str, user=Depends(viewer)):
    """Bucketed routing map, computed on demand from the run's placement."""
    run = _visible_run(run_id, user)
    if run.result is None:
        raise HTTPException(409, f"run is {run.status}")
    placed = {int(c): set(vs) for c, vs in run.result["placement"].items()}
    return viewmodel.routed_matrix(_load(run.instance), placed)


@app.get("/api/runs/{run_id}/stream")
async def api_stream(run_id: str, start: int = 0, user=Depends(viewer)):
    """Server-sent events, batched.

    Subscribers track their own index into the run's event list, so a client
    that connects late (or reconnects) backfills from `start` and then follows
    live without the server holding per-client state.
    """
    run = _visible_run(run_id, user)

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


# ------------------------------------------------------------ accounts

SESSION_COOKIE = "hc_session"
MAX_UPLOAD_CHARS = 40_000_000


class Credentials(BaseModel):
    username: str                    # sign-in accepts an email here too
    password: str
    email: str | None = None
    group: str | None = None
    code: str | None = None          # admin code, only for the admin groups


def current_user(hc_session: str | None = Cookie(default=None)):
    user = db.user_for_token(hc_session)
    if user is None:
        raise HTTPException(401, "sign in first")
    return user


def _signed_in(response: Response, user, refresh=None):
    response.set_cookie(SESSION_COOKIE, db.new_session(user["id"], refresh), httponly=True,
                        samesite="lax", max_age=60 * 60 * 24 * 30)
    return user


@app.get("/api/groups")
def api_groups():
    return db.group_counts()


@app.post("/api/auth/register")
def api_register(body: Credentials, response: Response):
    try:
        db.register(body.username, body.email, body.password, body.group, body.code)
        user, refresh = db.login(body.username, body.password)
    except db.AuthError as exc:
        raise HTTPException(400, str(exc))
    return _signed_in(response, user, refresh)


@app.post("/api/auth/login")
def api_login(body: Credentials, response: Response):
    try:
        user, refresh = db.login(body.username, body.password)
    except db.AuthError as exc:
        raise HTTPException(401, str(exc))
    return _signed_in(response, user, refresh)


@app.post("/api/auth/logout")
def api_logout(response: Response, hc_session: str | None = Cookie(default=None)):
    if hc_session:
        db.end_session(hc_session)
    response.delete_cookie(SESSION_COOKIE)
    return {"ok": True}


@app.get("/api/auth/me")
def api_me(user=Depends(current_user)):
    return user


def admin_user(user=Depends(current_user)):
    if not user.get("isAdmin"):
        raise HTTPException(403, "admins only")
    return user


def ranked():
    return db.ranked_instances(inst_mod.OFFICIAL)


class GroupChange(BaseModel):
    group: str


class RankedChange(BaseModel):
    instances: list[str]


@app.get("/api/admin/people")
def api_people(admin=Depends(admin_user)):
    return db.people()


@app.put("/api/admin/people/{user_id}/group")
def api_set_group(user_id: int, body: GroupChange, admin=Depends(admin_user)):
    try:
        return db.set_group(user_id, body.group)
    except db.AuthError as exc:
        raise HTTPException(400, str(exc))


@app.get("/api/ranked")
def api_ranked(user=Depends(current_user)):
    return {"instances": ranked(), "default": inst_mod.OFFICIAL}


@app.put("/api/admin/ranked")
def api_set_ranked(body: RankedChange, admin=Depends(admin_user)):
    unknown = [i for i in body.instances if inst_mod.path_for(i) is None]
    if unknown:
        raise HTTPException(400, f"unknown data sets: {', '.join(unknown)}")
    if not body.instances:
        raise HTTPException(400, "pick at least one data set")
    db.set_ranked_instances(body.instances)
    return {"instances": ranked()}


# --------------------------------------------------------- submissions

class SubmissionRequest(BaseModel):
    instance: str
    out: str
    trace: str | None = None


@app.post("/api/submissions")
def api_submit(body: SubmissionRequest, user=Depends(current_user)):
    if inst_mod.path_for(body.instance) is None:
        raise HTTPException(404, f"unknown instance: {body.instance}")
    if len(body.out) + len(body.trace or "") > MAX_UPLOAD_CHARS:
        raise HTTPException(413, "files too large")

    def on_done(run):
        db.record_submission(user["id"], run.instance, run.id, run.result["score"],
                             run.result["validation"]["valid"], run.source)

    try:
        run = runs.start_submission(body.instance, body.out, body.trace, user["username"], on_done)
    except replay.SubmissionError as exc:
        raise HTTPException(400, str(exc))
    return run.meta()


@app.get("/api/submissions/mine")
def api_my_submissions(user=Depends(current_user)):
    return db.group_submissions(user)


def _board(scope, by, upto=None):
    instances = ranked() if scope == "overall" else [scope]
    return db.leaderboard(instances, by=by, upto=upto)


@app.get("/api/leaderboard")
def api_leaderboard(scope: str = "overall", by: str = "user"):
    if by not in ("user", "group"):
        raise HTTPException(400, "by must be user or group")
    if scope != "overall" and inst_mod.path_for(scope) is None:
        raise HTTPException(404, f"unknown instance: {scope}")
    return {"scope": scope, "by": by, "instances": ranked() if scope == "overall" else [scope],
            "rows": _board(scope, by)}


@app.get("/api/stats")
def api_stats(user=Depends(current_user)):
    return db.class_stats()


@app.get("/api/submissions/{run_id}/rank")
def api_rank(run_id: str, user=Depends(current_user)):
    """The boards just before and just after this submission landed."""
    sub = db.submission_by_run(run_id)
    if sub is None:
        raise HTTPException(404, "submission not scored yet")
    sid = sub["id"]
    scopes = {"instance": sub["instance"]}
    if sub["instance"] in ranked():
        scopes["overall"] = "overall"
    boards = {}
    for name, scope in scopes.items():
        for by in ("user", "group"):
            boards[f"{name}_{by}"] = {
                "scope": scope, "by": by,
                "before": _board(scope, by, sid - 1),
                "after": _board(scope, by, sid),
            }
    return {
        "instance": sub["instance"], "score": sub["score"], "valid": bool(sub["valid"]),
        "username": sub["username"], "group": sub["grp"],
        "userKey": f"u{sub['user_id']}", "groupKey": f"g{sub['grp']}",
        "ranked": ranked(),
        "boards": boards,
    }


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
