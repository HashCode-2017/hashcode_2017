#!/usr/bin/env python3
"""
One command for the whole pipeline: pick the right methods for a data set,
run them within a time budget, and keep the best valid submission.

    1. Always:            solver --lns      greedy -> exact re-pack -> LNS (C++)
    2. Small data sets:   exact.py          proven optimum (or best found + upper bound),
                          then solver --start <exact output> --lns to polish it
    3. Every candidate is re-scored here with solution.score() and checked
       against the capacities; the best one is written to <output>.

Branches 1 and 2 run in parallel, so the wall time is at most about --time
seconds (plus parsing); a proven optimum ends the run at once. "Small" means
at most --exact-max assignment variables (cache x request pairs faster than
the datacenter): the exact solver wins below a few thousand and loses above
a few hundred thousand.

Usage:
    python solve.py <input.in> <output.out> [--time 300] [--exact-max 50000]
                    [--exact-share 0.5] [--lns-size 2] [--candidates 400]
                    [--rounds 5] [--seed 1]

solve() is also what the runner UI (runner/) calls.
"""

import argparse
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time

from solution import parse_input, score

HERE = os.path.dirname(os.path.abspath(__file__))
BINARY = os.path.join(HERE, "solver.exe" if os.name == "nt" else "solver")

# Tunable settings and their defaults; the runner UI exposes the same names.
DEFAULTS = {
    "exact_max": 50000,   # largest model (assignment variables) given to the exact solver
    "exact_share": 0.5,   # part of the budget the exact solver may use before LNS polishes it
    "lns_size": 2,        # caches emptied and rebuilt at each LNS step
    "candidates": 400,    # videos each cache's knapsack considers
    "rounds": 5,          # greedy rounds
    "seed": 1,            # LNS random seed: another seed explores another path
}


def solver_flags(p):
    return ["--lns-size", str(p["lns_size"]), "--candidates", str(p["candidates"]),
            "--rounds", str(p["rounds"]), "--seed", str(p["seed"])]


def build_solver():
    src = os.path.join(HERE, "solver.cpp")
    if os.path.exists(BINARY) and os.path.getmtime(BINARY) >= os.path.getmtime(src):
        return
    subprocess.run(["g++", "-O2", "-std=c++17", "-o", BINARY, src], check=True)


def assignment_vars(inst):
    """Size of exact.py's model: one y per (request group, faster cache)."""
    n = 0
    for e, demand in inst.endpoint_requests.items():
        L = inst.endpoint_latency[e]
        faster = sum(1 for lat in inst.endpoint_caches[e].values() if lat < L)
        if faster:
            n += faster * sum(1 for v in demand if inst.sizes[v] <= inst.X)
    return n


def read_out(path, inst):
    """Parse a submission; None if it is missing or breaks a rule."""
    try:
        with open(path) as f:
            lines = f.read().split("\n")
        placed = {}
        for line in lines[1:1 + int(lines[0])]:
            ids = [int(x) for x in line.split()]
            c, videos = ids[0], set(ids[1:])
            if not 0 <= c < inst.C or c in placed or any(not 0 <= v < inst.V for v in videos):
                return None
            if sum(inst.sizes[v] for v in videos) > inst.X:
                return None
            placed[c] = videos
        return placed
    except (OSError, ValueError, IndexError):
        return None


class Progress:
    """The pipeline's steps and their state, updated from the solvers' logs.

    Each step is pending, active, done or skipped, with a short detail (the
    greedy round, the re-pack pass, why the exact solver stopped). `best` is
    the best score any branch has reported so far. Every change is passed to
    `on_change(snapshot)`; the runner UI shows it as a live checklist.
    """

    def __init__(self, on_change=None, log=None):
        self.steps, self.best = [], None
        self.on_change, self.log = on_change, log
        self.lock = threading.Lock()

    def add(self, key, label):
        self.steps.append({"key": key, "label": label, "state": "pending", "detail": ""})

    def snapshot(self):
        return {"steps": [dict(s) for s in self.steps], "best": self.best}

    def set(self, key, state=None, detail=None, score=None):
        with self.lock:
            for s in self.steps:
                if s["key"] == key and s["state"] != "skipped":
                    if state:
                        if state == "active" and s["state"] != "active" and self.log:
                            self.log(s["label"].lower())
                        s["state"] = state
                    if detail is not None:
                        s["detail"] = detail
            if score is not None and (self.best is None or score > self.best):
                self.best = score
            snap = self.snapshot()
        if self.on_change:
            self.on_change(snap)

    def skip_unfinished(self, keys, why):
        for k in keys:
            if any(s["key"] == k and s["state"] in ("pending", "active") for s in self.steps):
                self.set(k, "skipped", why)


def _follow_solver(proc, prog, greedy, repack, lns):
    """Read solver.cpp's stderr and move the matching steps along.

    For a run started from an existing solution, greedy is None and the
    re-pack and LNS lines all feed the single `lns` step.
    """
    passes = 0
    for line in proc.stderr:
        if m := re.match(r"\s*round (\d+):.*-> (\d+)", line):
            prog.set(greedy, "active", f"round {m[1]}", int(m[2]))
        elif m := re.match(r"greedy: (\d+)", line):
            prog.set(greedy, "done", "", int(m[1]))
            prog.set(repack, "active")
        elif m := re.match(r"start .*: (\d+)", line):
            prog.set(lns, "active", "", int(m[1]))
        elif m := re.match(r"\s*re-pack sweep .*-> (\d+)", line):
            passes += 1
            prog.set(repack, "active", f"pass {passes}", int(m[1]))
        elif m := re.match(r"re-pack: (\d+)", line):
            if repack != lns:
                prog.set(repack, "done", f"{passes} pass{'es' if passes != 1 else ''}", int(m[1]))
            prog.set(lns, "active", score=int(m[1]))
        elif m := re.match(r"\s*lns score (\d+)", line):
            prog.set(lns, "active", score=int(m[1]))
        elif m := re.match(r"lns \+ re-pack: (\d+)", line):
            prog.set(lns, "done", "", int(m[1]))


def solve(input_path, output_path, time_budget=300.0, exact_max=None, log=None, on_progress=None,
          params=None):
    """Run the pipeline on one data set. Returns a dict describing the result.

    params overrides any of DEFAULTS; exact_max is kept as a shortcut for it.
    """
    p = dict(DEFAULTS, **(params or {}))
    if exact_max is not None:
        p["exact_max"] = exact_max
    exact_max = p["exact_max"]
    say = log or (lambda msg: print(msg, file=sys.stderr))
    prog = Progress(on_progress, say)
    t0 = time.time()
    build_solver()
    prog.add("read", "Read the file")
    prog.set("read", "active")
    inst = parse_input(input_path)
    size = assignment_vars(inst)
    use_exact = size <= exact_max
    info = {"V": inst.V, "E": inst.E, "R": inst.R, "C": inst.C, "X": inst.X,
            "variables": size, "exact": use_exact, "bound": None, "candidates": {}, "params": p}
    for key, label in [("greedy", "Greedy"), ("repack", "Re-pack"), ("lns", "LNS")]:
        prog.add(key, label)
    if use_exact:
        prog.add("exact", "Exact solver")
    prog.add("check", "Check scores")
    prog.set("read", "done", f"{size:,} variables")

    tmp = tempfile.mkdtemp(prefix="hc17_")
    try:
        budget = max(5.0, time_budget - (time.time() - t0))
        lns_out = os.path.join(tmp, "lns.out")
        main_run = subprocess.Popen(
            [BINARY, input_path, lns_out, "--lns", str(budget), "--time-limit", str(budget)] + solver_flags(p),
            stderr=subprocess.PIPE, text=True)
        runs = {"greedy + re-pack + LNS": main_run}
        outputs = {"greedy + re-pack + LNS": lns_out}
        readers = [threading.Thread(target=_follow_solver, args=(main_run, prog, "greedy", "repack", "lns"),
                                    daemon=True)]
        readers[0].start()

        if use_exact:
            prog.set("exact", "active")
            exact_out = os.path.join(tmp, "exact.out")
            r = subprocess.run([sys.executable, os.path.join(HERE, "exact.py"), input_path, exact_out,
                                "--time-limit", str(max(2.0, budget * p["exact_share"]))],
                               capture_output=True, text=True)
            m = re.search(r"upper bound ([\d,]+)", r.stderr)
            if m:
                info["bound"] = int(m.group(1).replace(",", ""))
            found = re.search(r"score ([\d,]+)", r.stderr)
            found = int(found.group(1).replace(",", "")) if found else None
            optimal = "Optimal" in r.stderr
            if os.path.exists(exact_out):
                if optimal:
                    # Nothing can beat a proven optimum: stop the other branch now.
                    runs.pop("greedy + re-pack + LNS").kill()
                    outputs = {"exact (proven optimum)": exact_out}
                    prog.set("exact", "done", "proven optimum", found)
                    prog.skip_unfinished(["greedy", "repack", "lns"], "not needed")
                else:
                    outputs["exact (time limit)"] = exact_out
                    prog.set("exact", "done", "stopped at its time limit", found)
                    prog.steps.insert(len(prog.steps) - 1, {"key": "polish", "label": "LNS on the exact solution",
                                                            "state": "pending", "detail": ""})
                    rest = max(2.0, time_budget - (time.time() - t0))
                    polished = os.path.join(tmp, "exact_lns.out")
                    polish = subprocess.Popen(
                        [BINARY, input_path, polished, "--start", exact_out, "--lns", str(rest),
                         "--time-limit", str(rest)] + solver_flags(p), stderr=subprocess.PIPE, text=True)
                    runs["exact + LNS"] = polish
                    outputs["exact + LNS"] = polished
                    t = threading.Thread(target=_follow_solver, args=(polish, prog, None, "polish", "polish"),
                                         daemon=True)
                    t.start()
                    readers.append(t)
            else:
                prog.set("exact", "skipped", "failed")

        for p in runs.values():
            p.wait()
        for t in readers:
            t.join(timeout=5)

        prog.set("check", "active")
        best_name, best_score = None, -1
        for name, path in outputs.items():
            placed = read_out(path, inst)
            s = None if placed is None else score(inst, placed)
            info["candidates"][name] = s
            if s is not None and s > best_score:
                best_name, best_score = name, s
        if best_name is None:
            raise RuntimeError("no valid submission produced")
        shutil.copy(outputs[best_name], output_path)
        prog.set("check", "done", f"kept {best_name}", best_score)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    info.update(score=best_score, method=best_name, seconds=round(time.time() - t0, 1),
                optimal=best_name == "exact (proven optimum)", steps=prog.snapshot()["steps"])
    return info


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("input")
    ap.add_argument("output")
    ap.add_argument("--time", type=float, default=300, help="wall-clock budget in seconds")
    ap.add_argument("--exact-max", type=int, default=DEFAULTS["exact_max"],
                    help="largest model (assignment variables) given to the exact solver")
    ap.add_argument("--exact-share", type=float, default=DEFAULTS["exact_share"],
                    help="part of the budget the exact solver may use")
    ap.add_argument("--lns-size", type=int, default=DEFAULTS["lns_size"], help="caches rebuilt per LNS step")
    ap.add_argument("--candidates", type=int, default=DEFAULTS["candidates"], help="videos per cache knapsack")
    ap.add_argument("--rounds", type=int, default=DEFAULTS["rounds"], help="greedy rounds")
    ap.add_argument("--seed", type=int, default=DEFAULTS["seed"], help="LNS random seed")
    a = ap.parse_args()

    r = solve(a.input, a.output, a.time, params={k: getattr(a, k) for k in DEFAULTS})
    print(f"{a.input}: V={r['V']} E={r['E']} R={r['R']} C={r['C']} X={r['X']}, "
          f"{r['variables']:,} assignment variables, exact solver {'on' if r['exact'] else 'off'}",
          file=sys.stderr)
    for name, s in r["candidates"].items():
        print(f"  {name:28s} {'invalid' if s is None else f'{s:,}'}", file=sys.stderr)
    line = f"best: {r['score']:,} from {r['method']} -> {a.output} ({r['seconds']:.0f}s)"
    if r["bound"] is not None:
        line += f"; proven upper bound {r['bound']:,}"
    print(line, file=sys.stderr)


if __name__ == "__main__":
    main()
