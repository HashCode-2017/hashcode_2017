#!/usr/bin/env python3
"""
Solve a data set exactly as a mixed-integer program (scipy / HiGHS).

    x[c,v] in {0,1}   video v stored in cache c
    y[r,c] in [0,1]   request group r = (endpoint e, video v) served by cache c

    maximise   sum n_r * (L_D(e) - L_c(e)) * y[r,c]
    subject to sum_c y[r,c] <= 1          each request is served once
               y[r,c] <= x[c,v]           only from a cache holding the video
               sum_v size_v x[c,v] <= X   capacity

Only practical on small data sets (me_at_the_zoo: seconds). On larger ones
--time-limit returns the best solution found so far plus a proven upper
bound, which tells how far from optimal any submission is.

Usage:
    python exact.py <input.in> <output.out> [--time-limit 600]
"""

import argparse
import sys
import time

import numpy as np
from scipy.optimize import Bounds, LinearConstraint, milp
from scipy.sparse import coo_matrix

from solution import parse_input, score, write_output


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("input")
    ap.add_argument("output")
    ap.add_argument("--time-limit", type=float, default=600)
    a = ap.parse_args()

    t0 = time.time()
    inst = parse_input(a.input)
    X = inst.X

    xs = {}                       # (c, v) -> column
    ys = []                       # (row of request, c, v, value)
    groups = []                   # per request group: list of y columns
    for e, demand in inst.endpoint_requests.items():
        L = inst.endpoint_latency[e]
        for v, n in demand.items():
            if inst.sizes[v] > X:
                continue
            cols = []
            for c, lat in inst.endpoint_caches[e].items():
                if lat < L:
                    xs.setdefault((c, v), len(xs))
                    cols.append(len(ys))
                    ys.append((c, v, n * (L - lat)))
            if cols:
                groups.append(cols)

    nx, ny = len(xs), len(ys)
    print(f"{nx:,} x vars, {ny:,} y vars", file=sys.stderr)
    cost = np.zeros(nx + ny)
    for j, (_, _, val) in enumerate(ys):
        cost[nx + j] = -val

    rows, cols, vals, lo, hi = [], [], [], [], []
    r = 0
    for g in groups:                                   # sum_c y <= 1
        for j in g:
            rows.append(r); cols.append(nx + j); vals.append(1.0)
        lo.append(-np.inf); hi.append(1.0); r += 1
    for j, (c, v, _) in enumerate(ys):                  # y - x <= 0
        rows += [r, r]; cols += [nx + j, xs[(c, v)]]; vals += [1.0, -1.0]
        lo.append(-np.inf); hi.append(0.0); r += 1
    for (c, v), k in xs.items():                        # capacity
        rows.append(r + c); cols.append(k); vals.append(float(inst.sizes[v]))
    lo += [-np.inf] * inst.C; hi += [float(X)] * inst.C; r += inst.C

    A = coo_matrix((vals, (rows, cols)), shape=(r, nx + ny)).tocsr()
    integrality = np.concatenate([np.ones(nx), np.zeros(ny)])
    res = milp(cost, constraints=LinearConstraint(A, lo, hi), integrality=integrality,
               bounds=Bounds(0, 1),
               options={"time_limit": a.time_limit, "disp": False, "mip_rel_gap": 0})
    print(f"status: {res.message}", file=sys.stderr)
    if res.x is None:
        sys.exit("no solution found")

    total = sum(n for _, _, n in inst.requests)
    placed = {}
    for (c, v), k in xs.items():
        if res.x[k] > 0.5:
            placed.setdefault(c, set()).add(v)
    write_output(a.output, placed, inst.C)
    bound = getattr(res, "mip_dual_bound", None)
    print(f"score {score(inst, placed):,}", file=sys.stderr)
    if bound is not None:
        print(f"upper bound {int(-bound * 1000 // total):,}", file=sys.stderr)
    print(f"{time.time() - t0:.0f}s", file=sys.stderr)


if __name__ == "__main__":
    main()
