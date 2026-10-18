# The full solving pipeline: greedy → re-pack → LNS (+ exact solver)

`solution.py` (V3) builds a solution in one go and stops. This document describes what we
added on top of it to go from **#6 to #2** on both tabs of the class sheet, step by step, with
the cost of every step and the measurements behind each decision.

| File | Role |
|---|---|
| [`solver.cpp`](./solver.cpp) | C++ port of `solution.py` (same greedy, eviction, swap) + exact per-cache re-pack + Large Neighbourhood Search |
| [`exact.py`](./exact.py) | The whole problem as an integer program, solved by HiGHS (through scipy): proven optimum on small instances, proven upper bound on large ones |
| [`solve.py`](./solve.py) | One command that picks the methods for a data set, runs them within a time budget and keeps the best valid result |
| [`runner/`](./runner) | A local web page: drop `.in` files, watch each step, download the `.out` files |

```bash
g++ -O2 -std=c++17 -o solver solver.cpp

solver input.in out.out                          # = python solution.py (greedy V3)
solver input.in out.out --repack                 # greedy + exact re-pack
solver input.in out.out --lns 300                # greedy + re-pack + 5 minutes of LNS
solver input.in out.out --start best.out --lns 300   # continue from an existing submission
python exact.py input.in out.out --time-limit 120     # exact solver (small instances)
solver input.in out.out --lns 600 --time-limit 120   # never runs longer than 120 s

python solve.py input.in out.out --time 300          # everything above, chosen automatically
python runner/server.py                              # the same in a web page: http://127.0.0.1:8017
```

Every stage only keeps a change if the score does not drop, so each one starts from the
output of the previous one and **can never make it worse**.

---

## 0. The problem in one paragraph, and why it is hard

Put copies of videos in caches (capacity `X` MB each) so that the average latency saved per
request is as high as possible; a request is served by the fastest connected cache holding the
video, or by the datacenter. Two things make it hard:

1. **Every cache is a knapsack**: choose videos of different sizes under a capacity, which is
   already NP-hard on its own.
2. **The caches interact**: what a video is worth in cache `c` depends on what the *other*
   caches already serve to the same endpoints. Putting video A in C1 can make the copy of A in
   C2 worthless.

So the problem is NP-hard (it contains knapsack and facility location). No method is both
exact and fast on the big instances; the pipeline mixes a fast heuristic, an exact local
optimisation, and an exact global solver where it is affordable.

### Notation (same as the README)

| Symbol | Meaning |
|---|---|
| `V`, `E`, `R`, `C`, `X` | videos, endpoints, request lines, caches, cache capacity (MB) |
| `L = Σ K_e` | endpoint–cache links; `K_max` the most links of one endpoint |
| `Q_e` | distinct videos requested by endpoint `e` |
| `W = Σ_e K_e · Q_e` | (cache, endpoint, requested video) triples: the cost of scoring every cache once |
| `W_c` | the part of `W` belonging to cache `c` |
| `r_v` | endpoints requesting video `v` |
| `m` | candidate videos kept for one cache's knapsack (≤ 400 + 100 + what the cache holds) |
| `k` | caches destroyed together in one LNS step (2) |

---

## 1. Step 1: greedy construction (unchanged V3 algorithm)

**What it does.** Up to 5 rounds of:

1. **Global fill.** Every (cache, video) pair is scored by its saving per MB
   (`gain / size`) and put in one max-heap. Pop the best pair, re-score it; if its gain is
   unchanged place it, otherwise push it back with the new value (lazy heap: gains only
   decrease, so a stored key is always an upper bound).
2. **Evict.** Remove copies that save nothing (another cache already serves every endpoint
   that wanted it at least as fast).
3. **Swap.** Per cache, replace the cheapest copies (value per MB) with a better video when
   `gain(new) − value(removed) > 0`; top 20 candidates, ≤ 50 swaps per cache.

**Cost per round:** `O(W + (H + U)·(log H + r_max))` for the fill,
`O(Σ_c (1 + S_c)·W_c·K_max)` for the swap (see the README for the full breakdown).

**Why it is not enough.** Decisions are taken one pair at a time by *ratio* and never
revisited as a whole. The ratio rule is a heuristic for a knapsack, not the knapsack's
optimum, and some small instances (`4_2_4_2`, `6_2_6_2`, …) are built exactly to trap it: there
the greedy reaches only 50–66 % of the optimum.

**Why we keep it.** It gives a good start very fast, and a good start matters. Re-packing from
empty caches ends lower than re-packing the greedy's output (videos 606,631 vs 610,505;
zoo 500,513 vs 512,115). Eviction and swap also stay: turning them off lowers the final score
on 3 of 7 instances tested (e.g. INSTANCED 1,280,062 vs 1,280,715).

**C++ port.** `solver.cpp` reproduces `solution.py` move for move (same heap order and tie
break); scores are identical on the 4 Google instances and 30 of the 31 evaluation
instances (the last one differs by 1 point, a different tie between two equal candidates).
Kittens: 362 s in Python, 13 s in C++.

---

## 2. Step 2: exact per-cache re-pack (`--repack`)

**Key observation.** Freeze every cache except `c`. Then the saving that video `v` brings to
`c` is a fixed number:

```
g(v) = Σ over endpoints e linked to c, requesting v:
           n(e, v) · max(0, best_other(e, v) − lat(e, c))
```

where `best_other` is the fastest latency `e` gets for `v` from any *other* cache (or the
datacenter). The videos inside `c` no longer interact with each other (they are different
videos), so filling `c` is **exactly a 0/1 knapsack**: values `g(v)`, weights `size(v)`,
capacity `X`. We solve it **optimally** with dynamic programming.

**Algorithm.**

```
repeat
    for each cache c:
        compute g(v) for every video requested around c
        keep the m best candidates (top 400 by g/size, top 100 by g, plus c's current videos)
        solve the knapsack exactly by DP
        if its value > value of c's current content: replace the content of c
until a full pass changes nothing
```

**Fast "best other" lookups.** For every (endpoint, video) request we store the best latency,
which cache gives it, and the second-best latency. Then `best_other(e, v)` is the best one,
or the second one if the best comes from `c` itself: **O(1)**. After a cache changes, only
the requests of the changed videos at the endpoints of that cache are refreshed
(`O(K_e)` each).

**Cost of one cache.** `O(W_c)` for the gains, `O(m log m)` to pick candidates, `O(m · X)`
time and `O(m · X / 64)` bits of memory for the DP (if all candidates fit, no DP at all).
One pass is `O(W + Σ_c m_c · X)`. It always ends: every change strictly increases the score,
which is bounded.

**What it finds that the greedy can't.** The best *combination* inside a cache. Example:
`X = 10`, videos A (6 MB, saves 600), B (5 MB, 450), C (5 MB, 450). By ratio the greedy takes A
(100/MB) and then nothing else fits → 600. The knapsack takes B + C → 900.

**Relation to evict and swap.** Within one cache, re-pack does both and more: dropping a
worthless copy (evict) and trading copies for a better video (swap) are just two of the
packings the DP considers.

**Limit.** It changes **one cache at a time**. If an improvement needs two caches to change
together, each cache on its own sees no gain and the re-pack is stuck (a local optimum).

---

## 3. Step 3: Large Neighbourhood Search (`--lns SECONDS`)

**Idea.** Destroy a part of the solution and rebuild it as well as possible; keep the result
if the score did not drop.

```
until the time budget is spent:
    pick a random cache c1, then k−1 caches that share endpoints with it
        (walk cache → random endpoint → random cache of that endpoint)
    remember their contents and the saving S of all endpoints touching them
    empty those k caches
    re-pack only those k caches (step 2) in random order until stable
    if new saving ≥ S: keep it          (equal is kept too: lets the search drift)
    else:              put the old contents back
finally: one full re-pack pass over all caches
```

**Why it beats the re-pack alone.** Example: endpoint E0 is linked to C1 and C2, both full.
The best is A in C1 and B in C2, but we have B in C1 and A in C2. Re-packing C1 alone: A is
already served by C2, so A in C1 gains nothing; same for C2 → stuck. LNS empties C1 **and** C2
at once and rebuilds them together, so it finds the swap.

**Cost of one step.** `O(k · sweeps · (W_c + m · X))` for the repair, plus the local saving
over the endpoints touching the `k` caches. Only those endpoints can change, so the
acceptance test never needs a full re-score.

**Choices, measured.**

- **Group size `k = 2`.** On videos (20 s): `k = 2` → 612,601, `k = 4` → 612,056,
  `k = 8` → 611,486. Smaller groups are rebuilt faster, so more steps fit in the time.
- **Accepting equal moves** lets the search move across plateaus instead of stopping at the
  first one.

### Why LNS and not simulated annealing

We implemented both and compared them from the same start, with the same time.

| 60 s per instance (9 instances) | Annealing | LNS |
|---|--:|--:|
| Total gain | +12,656 | **+17,945** |
| Instances where it is better | 2 | **6** |

| 180 s | Annealing, temperature 1 | Annealing, temperature 0.001 | LNS |
|---|--:|--:|--:|
| videos | **615,635** | 610,510 | 613,548 |
| kittens | 1,024,603 | **1,024,734** | 1,024,706 |
| INSTANCED | 1,292,386 | 1,280,715 | **1,297,807** |

Annealing can be stronger on one instance (videos), but **only with the right temperature,
and the right temperature is different for every instance**: the setting that wins on videos
gains nothing on kittens, and the reverse. LNS has no such parameter, never accepts a worse
solution, and gains more overall. We kept LNS and removed annealing.

---

## 4. Exact solver for small instances (`exact.py`)

**Model** (mixed-integer program):

```
x[c,v] ∈ {0,1}    video v is stored in cache c
y[r,c] ∈ [0,1]    request group r = (endpoint e, video v) is served by cache c

maximise    Σ  n_r · (L_D(e) − L_c(e)) · y[r,c]
subject to  Σ_c y[r,c] ≤ 1            each request is served once
            y[r,c] ≤ x[c,v]           only by a cache holding the video
            Σ_v size_v · x[c,v] ≤ X   capacity of every cache
```

Only pairs that can save something are created: `|x| ≤` (cache, requested video) pairs,
`|y| = Σ_r` (caches of `r`'s endpoint faster than the datacenter). HiGHS solves it by branch
and bound: exponential in the worst case, but seconds on the small instances.

**When it is used.**

| Instance | Result |
|---|---|
| me_at_the_zoo (183 x, 261 y) | **proven optimum 516,557** in 3 s (greedy: 507,906) |
| 2_2_2_1, 4_2_4_2, 6_2_6_2, 8_2_8_2, 20_2_20_2 (and their le_X / unit_size copies), big, supra | proven optimum in < 1 s |
| regional_instance, zipF_instance | stopped at 120 s, already far above the greedy; then LNS on top |
| videos_worth_spreading (135k x, 211k y) | 15 min: solution 590,639 (worse than ours) but a **proven upper bound of 620,009** |

So on large instances it is not a solver but a **ruler**: no submission on videos can ever
exceed 620,009.

---

## 5. Which method produced which score

For every instance we keep the best valid output across methods (all checked with the Python
scorer in `solution.py`, including capacity). Before = our V3 scores in the class sheet.
LNS ran 5 minutes per instance, starting from the re-pack (or exact) output.

#### Google instances

| Instance | Before (V3) | Now | Gain | Best in class | Final step |
|---|--:|--:|--:|--:|---|
| kittens | 1,022,115 | **1,024,812** | +2,697 | 1,025,096 | greedy + re-pack + LNS |
| me_at_the_zoo | 507,906 | **516,557** | +8,651 | 516,557 (=) | exact (proven optimum) |
| trending_today | 499,966 | **499,997** | +31 | 500,000 | greedy + re-pack + LNS |
| videos_worth_spreading | 609,385 | **613,851** | +4,466 | 614,545 | greedy + re-pack + LNS |
| **Total** | **2,639,372** | **2,655,217** | **+15,845** | | **rank #6 → #2** |

#### Class instances

| Instance | Before (V3) | Now | Gain | Best in class | Final step |
|---|--:|--:|--:|--:|---|
| custom_dejavu42 | 64,428 | **64,596** | +168 | 65,003 | greedy + re-pack + LNS |
| custom_universallambda42 | 1,339,620 | **1,339,903** | +283 | 1,342,673 | greedy + re-pack + LNS |
| custom_universallambda42_asymmetric | 974,865 | **976,552** | +1,687 | 976,610 | greedy + re-pack + LNS |
| instance1 | 1,496,448 | **1,496,478** | +30 | 1,498,093 | greedy + re-pack |
| instance2 | 1,966,090 | **1,966,090** | +0 | 1,971,053 | greedy + re-pack |
| 4990_246_84901_50 | 1,799,210 | **1,799,750** | +540 | 1,800,557 | greedy + re-pack + LNS |
| 6970_311_100000_69 | 1,837,888 | **1,837,941** | +53 | 1,841,035 | greedy + re-pack |
| 10000_500_100000_100 | 2,020,907 | **2,020,908** | +1 | 2,021,538 | greedy + re-pack |
| 3860_246_84901_66 | 1,977,797 | **1,977,807** | +10 | 1,978,585 | greedy + re-pack |
| regional_instance | 2,367,395 | **2,435,730** | +68,335 | 2,432,239 (beaten) | exact (time limit) + LNS |
| zipF_instance | 1,915,779 | **1,958,529** | +42,750 | 1,958,110 (beaten) | exact (time limit) + LNS |
| big | 271,267 | **271,267** | +0 | 271,267 (=) | exact (proven optimum) |
| supra | 411,743 | **411,743** | +0 | 411,743 (=) | exact (proven optimum) |
| INSATANC2D | 131,647 | **132,275** | +628 | 249,794 | greedy + re-pack + LNS |
| INSTANCED | 1,277,284 | **1,298,607** | +21,323 | 1,301,742 | greedy + re-pack + LNS |
| 2_2_2_1 | 951,327 | **951,327** | +0 | 951,327 (=) | exact (proven optimum) |
| 4_2_4_2 | 655,321 | **982,271** | +326,950 | 982,271 (=) | exact (proven optimum) |
| 6_2_6_2 | 499,524 | **998,499** | +498,975 | 998,499 (=) | exact (proven optimum) |
| 8_2_8_2 | 567,228 | **991,480** | +424,252 | 991,480 (=) | exact (proven optimum) |
| 20_2_20_2 | 524,928 | **995,902** | +470,974 | 995,902 (=) | exact (proven optimum) |
| realistic_large_clustered | 947,788 | **951,792** | +4,004 | 951,237 (beaten) | greedy + re-pack + LNS |
| realistic_large_random | 928,932 | **930,980** | +2,048 | 930,650 (beaten) | greedy + re-pack + LNS |
| dense | 69,654 | **69,683** | +29 | 69,683 (=) | greedy + re-pack |
| dense2 | 284,493 | **284,493** | +0 | 284,493 (=) | greedy + re-pack |
| medium_mixed_lambda | 51,168 | **51,683** | +515 | 51,621 (beaten) | greedy + re-pack + LNS |
| medium_skew_dense_dejavu | 146,067 | **146,546** | +479 | 146,440 (beaten) | greedy + re-pack + LNS |
| medium_skew_sparse_lambda | 43,283 | **43,821** | +538 | 43,763 (beaten) | greedy + re-pack + LNS |
| medium_flat_dense_dejavu | 89,295 | **89,528** | +233 | 89,890 | greedy + re-pack + LNS |
| medium_flat_sparse_lambda | 23,597 | **23,953** | +356 | 24,012 | greedy + re-pack + LNS |
| **Total** | **25,634,973** | **27,500,134** | **+1,865,161** | | **rank #6 → #2** |

"Best in class" is the best score any group entered in the sheet when we fetched it; "(=)"
means we match it, "(beaten)" that we are above it. We are at or above the best on **16 of
the 29** class instances. The `INSATANC2D` best (249,794) is far above anything our methods
reach and should be double-checked in the sheet.

---

## 6. Running it on any data set: `solve.py` and the runner

`solve.py` decides which methods to use, so nobody has to remember the rules above:

1. Always run `solver --lns` (greedy, re-pack, LNS) for the whole time budget.
2. If the exact model is small (at most 50,000 assignment variables), run `exact.py` at the
   same time. If it proves the optimum, stop everything at once. If it stops at its time limit,
   improve its solution with LNS for the rest of the budget.
3. Re-score every candidate with `solution.score()`, check the capacities, keep the best.

The 50,000 threshold comes from the measurements: the exact solver wins on instances with
under 10,000 variables (zoo 261, regional 2,943, zipF 2,539, big 8,762) and loses on those with
200,000 or more (videos 210,540, INSTANCED 929,425).

`--time-limit` caps any `solver` run: the first greedy round always completes, so there is
always a valid answer, and every later step stops on time. On a generated instance near the
official limits (1,000 caches, 1,000,000 requests) a 120 s limit stopped at 120.2 s; without
it the re-pack kept making 40 s passes for gains of a few points.

`runner/server.py` serves a page where you drop one or many `.in` files, choose the time per
data set and how many run at once, and follow each run as a checklist of the steps above
(greedy round, re-pack pass, LNS, exact solver) with the best score so far. Each `.out` can be
downloaded, or all of them as a zip with a `scores.csv`.

## 7. Summary

| Stage | Exact? | Changes per step | Can lower the score? | Typical time (kittens) |
|---|---|---|---|---|
| Greedy (heap + evict + swap) | no | one (cache, video) pair | no | 13 s |
| Re-pack | yes, for one cache with the others fixed | one whole cache | no | +5 s |
| LNS | yes, for 2 caches with the others fixed | two related caches | no | time budget (5 min) |
| Exact MILP | yes, globally | the whole solution | — | seconds (small) / hours (large) |

The pattern is the classic one for hard assignment problems: **build fast, then improve with
exact sub-problems, and solve exactly whatever is small enough**. Each layer fixes one
measured weakness of the one before it.

**Where the remaining points are.** videos_worth_spreading (−694 to the class best, ≤ 6,158
to the proven bound), INSTANCED (−3,135), instance2 (−4,963), 6970 (−3,094). Longer LNS runs
keep improving slowly (videos, from the re-pack: +2,222 after 60 s, +3,043 after 180 s,
+3,346 after 480 s).
