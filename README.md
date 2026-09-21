# Hash Code 2017 — Streaming Videos

A Python 3 solution for the Google Hash Code 2017 qualification-round
"Streaming Videos" problem.

## Requirements

Python 3. The solver uses only the Python standard library.

## Run the example

```bash
python3 solution.py example.in generated-example.out
```

The bundled example should report a score of `562500` and write a valid
submission file to `generated-example.out`.

## Complexity

Notation, all read from the input file:

| Symbol | Meaning |
|---|---|
| `V`, `E`, `R`, `C` | videos, endpoints, request lines, caches |
| `L` | endpoint–cache links in total (`Σ K_e`); `K_max` is the most links any endpoint has |
| `Q_e` | distinct videos requested by endpoint `e` |
| `W = Σ_e K_e · Q_e` | (cache, endpoint, requested video) triples: the work of scoring every cache once |
| `\|E_c\|` | endpoints linked to cache `c` |
| `W_c = Σ_{e linked to c} Q_e` | the part of `W` that belongs to cache `c` |
| `P_c` | videos stored in cache `c` at the end of a round |
| `r_v` | endpoints that request video `v` |
| `H ≤ W` | (cache, video) pairs with a positive gain, i.e. the queue size |
| `U` | times a pair is pushed back into the queue after its gain dropped |
| `S_c` | swaps made in cache `c` in one round, capped at 50 |
| `T` | rounds actually run, capped by `--rounds` (default 5) |

Each round runs three steps: a global fill from one priority queue, an eviction of copies
that save nothing, and a swap pass that trades low-value copies for better videos.

| Step | Time | Why |
|---|---|---|
| Parse and index | `O(V + E + L + R)` | one pass over the file builds the request table, the cache → endpoints index and the video → requesters index |
| Global fill, per round | `O(W + (H + U) · (log H + r_max))` | score every (cache, video) pair once (`W`), build the heap; each pop re-scores one pair by walking the video's requesters (`r_v`) and either places it, pushes it back, or drops it |
| Eviction, per round | `O(Σ_c P_c · \|E_c\| · K_max)` | for each stored copy, each endpoint of its cache checks the other caches holding that video |
| Swap, per round | `O(Σ_c (1 + S_c) · W_c · K_max)` | each cache re-scores what its copies are worth and what other videos would gain, once plus once after every swap it makes |
| Score | `O(R · K_max)` | each request line looks at the caches of its endpoint |
| **Total** | **`O(V + L + R + T · (W · K_max · (1 + S_max) + (H + U) · (log H + r_max)))`** | the eviction term is dominated by the swap term |

Memory is `O(V + L + R + W)`: the input, the indexes, the best latency for each
(endpoint, video) pair, the queue of at most `H ≤ W` pairs, and which caches hold which
copies.

The cost depends on `W` rather than `V × C`: a cache only ever looks at the videos its own
endpoints request. That is what keeps the largest data sets tractable:

| Data set | V | E | R | C | Links `L` | `W` | Runtime |
|---|---|---|---|---|---|---|---|
| `me_at_the_zoo` | 100 | 10 | 100 | 10 | 32 | 261 | ~0 s |
| `videos_worth_spreading` | 10,000 | 100 | 100,000 | 100 | 521 | 210,540 | ~2 s |
| `trending_today` | 10,000 | 100 | 100,000 | 100 | 10,000 | 9,518,000 | ~19 s |
| `kittens` | 10,000 | 1,000 | 200,000 | 500 | 351,881 | 69,651,168 | ~375 s |

Runtimes were measured on one machine and are only a guide. They grow roughly with `W`:
`kittens` has 7× the `W` of `trending_today`, and its dense links (`K_max` = 500) make the
swap pass the most expensive step. `--no-swap` brings `kittens` down to ~270 s for a
0.04% lower score, and `--strategy per-cache --no-swap` runs the original cache-by-cache
fill (~163 s).

For a walkthrough of the heuristic and scoring approach, see
[SOLUTION.md](SOLUTION.md). The original challenge statement is available in
[hashcode2017_qualification_task.pdf](hashcode2017_qualification_task.pdf).

## Demo console

A web console wraps the solver so the whole pipeline can be watched: the file parsing, the
cold network where every request goes to the datacenter, the caches filling round by round,
the re-routed traffic, and the scored submission.

```bash
pip install -r api/requirements.txt
cd ui && npm install && npm run build && cd ..
python -m api.prewarm                        # solve every data set up front
python -m uvicorn api.main:app --port 8000   # then open http://127.0.0.1:8000
```

See [DEMO.md](DEMO.md) for the presenter keys and a suggested running order. The console never
reimplements the algorithm -- it imports `parse_input`, `solve`, `write_output` and `score`
from `solution.py`.
