# Demo runbook — Streaming Videos console

A web console that shows the solver working, end to end: pick a data set, watch it parse, see
the cold network where every request hits the datacenter, watch the greedy fill the caches,
see traffic re-route, and read the submission file it would hand in.

---

## Before you present

```bash
pip install -r api/requirements.txt          # fastapi + uvicorn
cd ui && npm install && npm run build && cd ..

python -m api.prewarm                        # ~2 min — solves all five data sets
python -m uvicorn api.main:app --port 8000
```

Open **http://127.0.0.1:8000** — one origin, no separate dev server, nothing to go wrong on stage.

**Do not skip the prewarm.** `kittens` takes about 90 seconds to solve. Prewarmed, it replays
instantly and you can scrub it; cold, you will stand there watching a progress chip. Prewarmed
runs are cached in `.runs/` (gitignored) and the picker marks each data set `PREWARMED` or
`SOLVES LIVE`, so you can see the state before you click.

If you *want* to show a real solve, the "solve again ↻" button under the stage forces a fresh
run and streams it live — `videos_worth_spreading` is the one to do this with (~1 s).

---

## Driving it

Everything works from the keyboard, so you never have to find the mouse.

| Key | Does |
|---|---|
| `→` `←` | next / previous act |
| `1`–`6` | jump straight to an act |
| `space` | play / pause the placement animation |
| `f` | fullscreen |
| `e` | free-explore mode (and back) |
| `r` | reset to the data-set picker |

During the placement act: the slider scrubs, and `0.25×`–`8×` sets playback speed. The animation
starts slow on purpose — the first few placements are the ones people need to actually see — then
accelerates.

---

## Suggested running order

**1. `me_at_the_zoo` — explain the mechanism.** 10 endpoints, 10 caches, 100 videos. Small enough
that every node is on screen and the whole network is legible. Use acts 2 and 3 here: the
candidate panel on the left of the placement act is the one that explains *why* the heuristic
works — videos ranked by savings per megabyte, with the ones too big for the remaining space
dimmed out. Final score **487,725**, which is 86.9% of the best any placement could do.

**2. `kittens` — show the scale.** 10,000 videos, 1,000 endpoints, 500 caches, and a billion
individual requests. Two things to point at:

- Act 1: `1,000,241,830` total requests, described in only 200,000 lines.
- Act 2: 351,881 endpoint–cache links. The console says so and switches to the aggregate
  connection map rather than drawing a hairball — worth calling out, it is a deliberate choice.
- Act 3: 500 cache cells filling at once. Final score **960,494**, the best of the five.

If you have time for a third, `trending_today` is the interesting failure case: every endpoint
sees every cache (a complete 100×100 bipartite graph), capacity is huge at 50,000 MB, and it
still only scores 499,966 — because with 10,000 videos and uniform connectivity there is far
less *differential* latency to win back.

---

## What each act shows

| Act | What is on screen |
|---|---|
| **1 Data set** | The five inputs with their real header numbers and a log-scale magnitude bar. |
| **2 Ingest** | The actual first bytes of the file typing out, decoded into V/E/R/C/X, plus size, latency and demand distributions. |
| **3 Cold network** | The topology with nothing cached. Score is 0. Sparse instances get a real node-link graph; dense ones get the aggregate map. |
| **4 Placement** | The solver running. Caches fill, the score counter climbs, and the left panel shows the savings-per-megabyte ranking for the cache currently being filled. |
| **5 Routing** | Before/after latency by request volume, cache-vs-datacenter split, cache fill treemap, replication, biggest-winning endpoints. |
| **6 Submission** | The `.out` file, validation against the statement's rules, and the official score formula with this run's numbers in it. |

Free explore (`e`) is for questions: click any cache to see its contents and load, any endpoint to
see what it achieved, or look up a video id to find every cache holding a copy.

---

## If something goes wrong

- **Port 8000 already in use** — `netstat -ano | grep :8000` then `taskkill /PID <pid> /F`.
- **The picker says `SOLVES LIVE` when you expected prewarmed** — the `.runs/` cache is missing or
  stale. Re-run `python -m api.prewarm`.
- **You changed `solution.py`** — re-run the prewarm, and check the scores still read
  562,500 / 487,725 / 594,079 / 499,966 / 960,494. Those are the known-good values.

---

## How it fits together

```
solution.py        the solver — unchanged logic, plus an optional on_event callback
api/               FastAPI: discovery, topology view models, job runner + SSE, analysis
ui/                React + TypeScript front end
.runs/             prewarmed run records (gitignored)
```

`solution.py` stays the single source of truth: the API imports `parse_input`, `solve`,
`write_output` and `score` rather than reimplementing any of them. The `on_event` callback is
purely observational — the search behaves identically with or without it, which the score table
above is the check for.

The running score in the placement act is accumulated independently, from each placement's own
marginal gain, and lands exactly on the number `score()` computes. Those two agreeing is a real
cross-check, not a coincidence — worth mentioning if the audience is technical.
