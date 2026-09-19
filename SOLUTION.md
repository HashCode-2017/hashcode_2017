# Hash Code 2017 Qualification Round — "Streaming Videos"

Team: **Kacem, Daniel, Marouan, Dhia**

Files in this solution:
- [`solution.py`](./solution.py) — parser, solver, output writer, and scorer.
- [`example.in`](./example.in) — the worked example from the problem statement (transcribed
  verbatim), used to sanity-check the code.
- [`api/`](./api) + [`ui/`](./ui) — a web console that visualises a run from input file to
  scored submission; see [DEMO.md](./DEMO.md). `solve()` takes an optional `on_event`
  callback so the console can observe the search; it is purely observational and the
  placement is identical with or without it.

Run it with:

```
python solution.py <input_file> <output_file>
```

It prints the achieved score and writes a valid submission file.

---

## 1. The problem, in plain terms

We run a video service. Videos live permanently in a **data center**, which is slow to reach
from some **endpoints** (user groups). We also have a fixed number of **cache servers**, each
with a limited storage capacity, sitting between the data center and some endpoints with much
lower latency. We're told in advance, for every (video, endpoint) pair, **how many requests**
we expect.

We choose which videos to copy into which caches (a video can sit in zero, one, or many
caches, as long as no cache exceeds its capacity). For every request, the actual latency used
is the **best available option**: the closest connected cache that has the video, or the data
center if none does. The goal is to **maximize the average latency saved per request**
(equivalently: minimize average waiting time), scored in microseconds.

This is fundamentally a **capacitated placement problem with shared, overlapping benefit**:
it looks like a knapsack problem (pick items — videos — under a capacity constraint), but the
"value" of putting a video in a given cache depends on what's *already* achievable for that
video at each endpoint (from other caches, or the data center), so caches aren't independent
knapsacks — they interact through the endpoints they share.

## 2. Why we didn't reach for an exact solver

With up to `V=10000` videos, `C=1000` caches and `R=1,000,000` request rows, an exact
integer program is out of reach in contest time, and even a per-cache 0/1 knapsack DP
(`O(capacity × videos)` per cache) is too slow multiplied by 1000 caches. We needed something
that is:
- cheap enough to run on the largest data sets in seconds,
- good enough to beat a naive fill by a wide margin,
- simple enough that four people could split it into independent, testable pieces.

That ruled out ILP/LP relaxation and full DP knapsack, and pointed us at a **greedy heuristic**
— the standard, well-known approach for this exact Hash Code problem.

## 3. The algorithm: iterative greedy by savings-density

**Idea.** For a given cache, the "value" of storing video `v` is the total latency it would
save across all requests for `v` from endpoints connected to that cache — but only counting
the part of the latency that isn't *already* being saved by a cheaper option. We rank
candidate videos per cache by **value per megabyte** (a knapsack ratio) and greedily fill each
cache. Since placing a video in one cache can reduce the marginal value of placing it in
another (an endpoint might already reach it faster elsewhere), we repeat this over several
rounds, refreshing "the best latency currently achievable" after every placement.

**Precompute once:**
- `endpoint_requests[e][v]` — aggregated request count for video `v` from endpoint `e`.
- `cache_endpoints[c]` — list of `(endpoint, latency)` for endpoints connected to cache `c`.
- `best_latency[e][v]` — initialized to the data-center latency `L_D[e]` for every endpoint.

**Each round, for every cache `c` with spare capacity:**
1. For every endpoint `e` connected to `c` and every video `v` it requests, compute the
   marginal gain if `v` were added to `c`:
   `gain(c, v) += requests(v, e) × max(0, best_latency[e][v] − latency(c, e))`
2. Sort candidate videos by `gain / size`, descending.
3. Walk the sorted list, placing each video that still fits in the cache's remaining
   capacity (classic greedy knapsack fill).
4. Immediately update `best_latency[e][v]` for every endpoint touched, so later caches in the
   *same* round (and the next round) see the improvement.

Rounds repeat until a full pass places nothing new, or a round cap is hit (bounds runtime on
the largest inputs).

```
for round in 1..max_rounds:
    changed = false
    for c in caches with spare capacity:
        gains = {}                         # video -> marginal savings if placed in c
        for (e, lat_c) in cache_endpoints[c]:
            for (v, n) in endpoint_requests[e]:
                if v not in placed[c] and lat_c < best_latency[e][v]:
                    gains[v] += n * (best_latency[e][v] - lat_c)
        for v in sorted(gains, key = gains[v] / size[v], desc):
            if size[v] <= remaining[c]:
                place v in c; remaining[c] -= size[v]; changed = true
                update best_latency[e][v] for touched endpoints
    if not changed: break
```

**Complexity.** Each round costs roughly `O(Σc |cache_endpoints[c]| × avg videos/endpoint +
Σc candidates·log(candidates))` — bounded by the total endpoint–cache connections and request
rows rather than `V × C`, which is what keeps it tractable for `R` up to 1,000,000. A handful
of rounds (we default to 5) is enough to converge in practice, since gains only ever shrink
round over round.

## 4. Validating it

The PDF's worked example (`example.in`) ships an **illustrative** submission (cache 0: video
2; cache 1: videos 3, 1; cache 2: videos 0, 1) that scores exactly `462500` — we reproduced
that number with our `score()` function to confirm our scoring implementation matches the spec
precisely:

```
scorer on PDF example submission -> 462500
```

That example submission is deliberately *not* optimal, though (it leaves cache 0 — the
lowest-latency cache for endpoint 0, at 100ms — empty). Running our actual solver on the same
input finds the better assignment `cache 0: {video 1, video 3}`, which the scorer puts at:

```
Score: 562500
```

i.e. our heuristic beats the statement's own illustrative example, which is exactly the
sanity check we wanted: the scorer is correct, and the solver genuinely optimizes rather than
just reproducing the example.

## 5. Team division of work

We split the pipeline into four independent, testable stages and paired each with a teammate:

| Person | Stage | Responsibility |
|---|---|---|
| **Kacem** | Input modeling & I/O | Nailed down the exact file format from the spec, wrote `parse_input`/`write_output`, defined the core data structures (`Instance`, aggregated request table, endpoint↔cache latency maps), transcribed `example.in` from the PDF. |
| **Daniel** | Core algorithm design | Derived the scoring formula from the spec's definition, designed the marginal-gain formula and the greedy ratio rule, wrote the first single-pass version of `solve`. |
| **Marouan** | Optimization & scaling | Turned the single-pass greedy into the iterative multi-round refinement (the `best_latency` update + repeated rounds), reasoned about worst-case sizes (`V≤10000`, `C≤1000`, `R≤1e6`) and kept the per-round cost tied to actual connections/requests instead of `V×C`. |
| **Dhia** | Testing, scoring & write-up | Implemented `score()` independently from `solve()`, validated it against the PDF's worked example (462500), checked edge cases (endpoints with `K=0`, an oversized video like video 4 at 110MB against 100MB caches, ties in gain/size), and co-authored this document. |

## 6. How we actually got here (thought process)

**Reading the statement.** We started by restating the problem out loud to each other:
"we're placing copies of videos into caches to shave latency off requests, under per-cache
size limits — and we're scored on the *average* time saved, weighted by request volume."
Kacem immediately flagged the trickiest part of the I/O: endpoints can have zero connected
caches (`K=0`), and a video is *allowed* to be too big for a cache (video 4 in the example is
110MB against 100MB capacity) — both had to be handled as normal cases, not errors.

**Brainstorming approaches.** We listed four options on the whiteboard:
1. *Random/naive fill* — quick to write, but leaves obvious value on the table.
2. *Per-cache independent 0/1 knapsack* (value = savings vs. the data center only, solved per
   cache in isolation) — simple and parallelizable across caches, but overcounts: if the same
   video is worth caching at two different caches connected to the same endpoint, this
   approach happily stores it in both, wasting capacity that could hold a different video.
3. *ILP/LP relaxation over the whole instance* — theoretically the "right" answer, but with up
   to a million request rows and thousands of caches, solving (or even building) that model in
   contest time wasn't realistic.
4. *Greedy by value density, refreshed iteratively* — combines the simplicity of a knapsack
   ratio with rounds that let the "current best latency" propagate, so a cache doesn't get
   credit for a video an endpoint can already reach cheaply elsewhere.

Daniel pushed for option 4 as the sweet spot: cheap per round, and each additional round
strictly cannot get worse (gains only shrink as information updates), which is a comforting
property when you don't have time to prove optimality. Marouan's worry was purely
computational — "if we recompute gains against *every* video for *every* cache every round,
we'll choke on `V=10000, C=1000`" — so we agreed upfront to only ever consider videos actually
*requested* by an endpoint connected to that cache, never the full video catalog, which keeps
the work proportional to real demand instead of worst-case combinatorics.

**Splitting the work.** Once the approach was fixed, the four stages fell out naturally along
the data's own life cycle: read it in (Kacem), decide what "good" means and make a first pass
(Daniel), make that pass scale and actually converge (Marouan), and prove the numbers are
trustworthy (Dhia). That let us work in parallel against a shared `Instance` interface instead
of stepping on each other.

**Checking our work.** Before trusting any score on a real data set, Dhia insisted on
reproducing the PDF's own worked numeric example by hand first — if `score()` couldn't
reproduce `462500` on the exact submission the statement describes, nothing downstream could
be trusted. Only after that matched exactly did we run the actual solver and compare: seeing
it *beat* the statement's own (intentionally non-optimal) example — `562500` vs. `462500` on
the same tiny instance — was the confirmation that both halves (scoring and optimizing) were
doing their jobs correctly.

## 7. Possible next steps (not implemented here)

For the full-scale official data sets (not included with this PDF — only the worked example
was), we'd want to: vectorize the gain computation with `numpy` for very large `R`; try a
few different cache-processing orders per round (e.g., emptiest cache first) since order
affects the single-pass greedy fill; and add a light local-search pass (swap one placed video
for an unplaced one) once the greedy converges, to recover a bit more score cheaply.
