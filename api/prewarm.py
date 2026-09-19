"""Solve every data set ahead of time so the demo never waits on stage.

    python -m api.prewarm            # all of them
    python -m api.prewarm kittens    # just one
"""
import os
import sys
import time

from . import instances as inst_mod, runs


def main(argv):
    wanted = argv[1:] or [iid for iid, _, _ in inst_mod.CATALOG]
    rounds = 5
    for iid in wanted:
        if inst_mod.path_for(iid) is None:
            print(f"  skip {iid}: no such instance")
            continue
        t0 = time.time()
        print(f"  {iid} ...", end=" ", flush=True)
        run, created = runs.start(iid, rounds, force=True)
        while run.status not in ("done", "error"):
            time.sleep(0.2)
        if run.status == "error":
            print(f"FAILED {run.error}")
            continue
        path = runs.cache_path(run.id)
        if not os.path.exists(path):
            print(f"FAILED: no cache file written at {path}")
            continue
        print(f"score={run.result['score']}  {time.time() - t0:.1f}s  "
              f"-> {os.path.basename(path)} ({os.path.getsize(path) / 1e6:.2f} MB)")
        # Drop the parsed instance between data sets; holding two of the large
        # ones at once is a lot of memory for no benefit.
        runs.drop(run.id)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
