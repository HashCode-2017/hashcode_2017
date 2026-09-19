"""FastAPI backend for the Streaming Videos demo console.

Wraps the existing `solution.py` solver -- parsing, solving, scoring -- in an
HTTP API that a browser can drive. It never reimplements the algorithm or the
scoring formula; both are imported from `solution.py`, which stays the single
source of truth.
"""
import os
import sys

# `solution.py` lives at the repo root, one level above this package.
_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

ROOT = _ROOT
