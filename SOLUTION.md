# Hash Code 2017 Qualification Round — "Streaming Videos"

Team: **Kacem, Daniel, Marouan, Dhia**

Files in this solution:
- [`solution.py`](./solution.py) — parser, both solvers, validator, output writer, and scorer.
- [`tests/test_solution.py`](./tests/test_solution.py) — test suite, anchored on the score the
  problem statement computes by hand.
- [`bench.py`](./bench.py) — instance generator and strategy comparison.
- [`example.in`](./example.in) — the worked example from the problem statement (transcribed
  verbatim), used to sanity-check the code.

Run it with:

```
python solution.py <input_file> <output_file> [--strategy best-first|rounds]
```

It validates the placement, writes a valid submission file, and prints the achieved score.

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

## 3. The algorithm: greedy by savings-density

**Idea.** For a given cache, the "value" of storing video `v` is the total latency it would
save across all requests for `v` from endpoints connected to that cache — but only counting
the part of the latency that isn't *already* being saved by a cheaper option. We rank
candidates by **value per megabyte** (a knapsack ratio) and greedily place them, refreshing
"the best latency currently achievable" after every placement, since putting a video in one
cache reduces the marginal value of putting it in another.

The question that separates a decent implementation from a good one is *in what order* you
spend capacity. We implemented both answers; `solution.py` keeps both behind `--strategy`
so the comparison stays reproducible.

### 3a. `--strategy rounds` — per-cache, index order (our first version)

Walk caches `0..C-1`, greedily filling each from its own ranked candidate list, and repeat
for a few rounds until a full pass places nothing new.

This is simple and fast, but it has a structural bias: **cache 0 always picks first**. When
two caches serve the same endpoint, the video lands in whichever has the *lower index*, not
whichever *saves more* — the low-numbered cache spends its capacity on a video that a better
cache should have held.

### 3b. `--strategy best-first` — global order, lazily re-evaluated (default)

Rank every `(cache, video)` candidate against each other in one global priority queue rather
than per cache, and always spend capacity on the best remaining candidate in the whole
instance.

Recomputing every gain after every placement would be far too slow, so we re-evaluate
**lazily**. The key observation is that gains are **monotone non-increasing**: placing a
video anywhere can only ever *lower* what's left to save elsewhere (an endpoint that now
reaches a video faster has less remaining benefit), never raise it. So a candidate popped
off the heap needs only its own gain recomputed — if that fresh value still beats the next
entry in the heap, it genuinely is the global best and can be placed immediately; otherwise
it is pushed back at its true density and we pop again. Stale entries therefore cost a
re-queue, not a full rebuild.

Two cheap prunes matter: a video larger than the cache capacity is never a candidate at all,
and because remaining capacity only ever shrinks, a candidate that doesn't fit *now* can be
dropped outright rather than re-queued.

In pseudocode:

```
heap = []                                  # max-heap on gain/size
for c in caches:
    gains = {}                             # video -> savings if placed in c
    for (e, lat_c) in cache_endpoints[c]:
        if lat_c >= L_D[e]: continue       # cache no better than the data centre here
        for (v, n) in endpoint_requests[e]:
            if size[v] <= capacity:
                gains[v] += n * (L_D[e] - lat_c)
    for v, g in gains: push(heap, (-g/size[v], c, v))

while heap:
    (_, c, v) = pop(heap)
    if size[v] > remaining[c] or v in placed[c]: continue   # can never fit; drop
    g = gain(c, v)                                          # recompute, fresh
    if g <= 0: continue
    if heap and g/size[v] < -heap[0][0]:                    # stale -> requeue
        push(heap, (-g/size[v], c, v)); continue
    place v in c; remaining[c] -= size[v]
    update best_latency[e][v] for endpoints of c that request v
```

**Precompute once** (in `Instance`, so neither solver re-scans the raw request list):
- `endpoint_requests[e][v]` — aggregated request count for video `v` from endpoint `e`.
- `video_endpoints[v]` — the reverse index, `[(endpoint, count)]`. This is what makes
  recomputing a *single* `gain(c, v)` cheap, and therefore what makes lazy evaluation
  viable at all.
- `cache_endpoints[c]` and `cache_latency[c][e]` — the endpoint↔cache latency map, as a
  list to sweep and a dict for O(1) lookup.

**Complexity.** Building the heap costs `O(Σc |cache_endpoints[c]| × avg videos/endpoint)`,
i.e. bounded by the real endpoint–cache connections and request rows rather than `V × C` —
the same bound as one round of 3a, and what keeps it tractable for `R` up to 1,000,000.
Each placement then costs `O(|video_endpoints[v]| + log H)` plus however many stale re-queues
the heap needs. Only videos actually *requested* by a connected endpoint are ever considered,
so the work tracks real demand rather than worst-case combinatorics.

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

### Test suite

`tests/test_solution.py` (47 tests, run with `python -m pytest tests/`) pins that anchor
number and covers the edge cases we found while reading the spec: endpoints with `K = 0`, a
video too big for any cache (video 4, 110MB against 100MB), duplicate request rows for the
same `(video, endpoint)` pair that must *sum* rather than overwrite, truncated input, and
whitespace variation (CRLF, blank lines, leading/trailing newlines). Both strategies are run
against randomised instances and checked for validity and non-negative score.

One test earned its keep immediately: `validate()` originally summed `sizes[v]` before
range-checking `v`, so an out-of-range video id crashed with `IndexError` instead of
reporting itself. Caught and fixed.

### Does best-first actually beat rounds?

The official data sets aren't redistributed with the PDF, so claiming an improvement on the
worked 5-video example would be meaningless — both strategies score `562500` there, because
the instance is too small to contain the decision that separates them. `bench.py` instead
generates instances shaped like the real ones — Zipf-distributed video popularity, endpoints
wired to several *overlapping* caches, which is precisely the case 3a resolves badly — and
scores both strategies on each:

| scale | V | E | C | R | `rounds` | `best-first` | delta |
|---|---|---|---|---|---|---|---|
| small | 200 | 50 | 20 | ~2.4k | 632,242 | 660,758 | **+4.51%** |
| mid | 2,000 | 200 | 100 | ~48k | 319,637 | 337,160 | **+5.48%** |
| big | 10,000 | 1,000 | 1,000 | ~512k | 238,794 | 252,661 | **+5.81%** |

Best-first won on every individual seed, not just on the mean. It does cost runtime — at the
largest size roughly 20s against 6s, from heap churn as stale candidates are re-queued. With
hours on the contest clock that's an easy trade, so it's the default; `--strategy rounds`
stays available for when a fast answer matters more than the last 5%.

### Parser

The parser was rewritten from line-by-line to a single whitespace token stream. That was done
for **correctness** — the old version split on `"\n"` only, so one stray blank line shifted
every subsequent field and silently produced a wrong instance rather than an error. Bulk-
converting the request block with `map(int, ...)` made it **1.8× faster** as a side effect
(0.72s vs 1.30s on a 1,000,000-row, 13MB input), and it was checked to parse field-for-field
identically to the original.

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

Cache-processing order turned out to matter most, so that one got built: it's section 3b,
worth roughly +5% over index order. What's still on the list:

- **Local search.** Once the greedy converges, try swapping one placed video for an unplaced
  one and keep the swap if the score improves. Greedy-by-density is known to leave a few
  percent on the table in exactly this way, and a swap pass is cheap to bound by a time limit.
- **Eviction, not just insertion.** Neither strategy ever removes a video. Allowing a cache
  to drop a video that has since become redundant (because a better cache picked it up) would
  free capacity that's currently stranded.
- **Taming the heap churn.** Best-first spends most of its extra runtime re-queuing stale
  candidates. Batching placements that provably can't interact — candidates on caches sharing
  no endpoint — would cut that without changing the result.
- **`numpy` for the gain sweep** if `R` ever became the bottleneck; on the sizes measured
  above it isn't, so this stayed unbuilt rather than being added speculatively.
