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
