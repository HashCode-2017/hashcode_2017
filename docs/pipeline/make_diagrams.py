#!/usr/bin/env python3
"""
Build the SVG diagrams used by PIPELINE_VISUAL.md.

    python docs/pipeline/make_diagrams.py

Writes one .svg per figure next to this script. Every number in the figures
comes from example.in, PIPELINE.md or a hand trace of solver.cpp.
"""

import os
from html import escape

HERE = os.path.dirname(os.path.abspath(__file__))

# Reference palette (light surface).
SURF = "#fcfcfb"
INK = "#0b0b0b"
INK2 = "#52514e"
MUTED = "#8a8984"
GRID = "#e4e3df"
GRAY_T = "#f1f0ec"
BLUE, BLUE_T = "#2a78d6", "#e3eefb"
ORANGE, ORANGE_T = "#eb6834", "#fde6dc"
VIOLET, VIOLET_T = "#6250d6", "#ebe8fa"     # stage 1: greedy
AQUA, AQUA_T = "#1baf7a", "#dcf3ea"         # stage 2: re-pack
MAGENTA, MAG_T = "#e87ba4", "#fbe7ef"       # stage 3: LNS
YELLOW, YEL_T = "#eda100", "#fcf0d4"        # stage 4: exact
GREEN, GREEN_T = "#008300", "#e0f0e0"       # status: kept / placed
RED, RED_T = "#e34948", "#fbe2e2"           # status: dropped / undone

FONT = "'Segoe UI', -apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif"
MONO = "Consolas, 'SF Mono', Menlo, monospace"

ARROW_COLORS = {"ink": INK2, "blue": BLUE, "green": GREEN, "red": RED, "violet": VIOLET,
                "aqua": AQUA, "magenta": "#c94f7f", "yellow": "#b07800", "orange": ORANGE}


def doc(w, h, title, body):
    markers = "".join(
        f'<marker id="m-{k}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" '
        f'orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="{c}"/></marker>'
        for k, c in ARROW_COLORS.items())
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" '
            f'role="img" aria-label="{escape(title)}" font-family="{FONT}">\n'
            f'<title>{escape(title)}</title>\n<defs>{markers}'
            f'<pattern id="hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">'
            f'<rect width="8" height="8" fill="{RED_T}"/><line x1="0" y1="0" x2="0" y2="8" stroke="{RED}" '
            f'stroke-width="2" opacity="0.55"/></pattern></defs>\n'
            f'<rect x="0.5" y="0.5" width="{w - 1}" height="{h - 1}" rx="14" fill="{SURF}" stroke="{GRID}"/>\n'
            + "\n".join(body) + "\n</svg>\n")


def T(x, y, s, size=14, weight=400, fill=INK, anchor="start", mono=False, italic=False):
    fam = f' font-family="{MONO}"' if mono else ""
    it = ' font-style="italic"' if italic else ""
    return (f'<text x="{x}" y="{y}" font-size="{size}" font-weight="{weight}" fill="{fill}" '
            f'text-anchor="{anchor}"{fam}{it}>{escape(str(s))}</text>')


def lines(x, y, ls, size=13, lh=None, **kw):
    lh = lh or round(size * 1.4)
    return "\n".join(T(x, y + i * lh, s, size, **kw) for i, s in enumerate(ls))


def R(x, y, w, h, fill, stroke=None, rx=10, sw=1.5, dash=None, opacity=None):
    st = f' stroke="{stroke}" stroke-width="{sw}"' if stroke else ""
    da = f' stroke-dasharray="{dash}"' if dash else ""
    op = f' opacity="{opacity}"' if opacity else ""
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}"{st}{da}{op}/>'


def L(x1, y1, x2, y2, color="ink", sw=1.5, arrow=True, dash=None):
    c = ARROW_COLORS.get(color, color)
    m = f' marker-end="url(#m-{color})"' if arrow else ""
    da = f' stroke-dasharray="{dash}"' if dash else ""
    return f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{c}" stroke-width="{sw}"{da}{m}/>'


def P(d, color="ink", sw=1.5, arrow=True, dash=None):
    c = ARROW_COLORS.get(color, color)
    m = f' marker-end="url(#m-{color})"' if arrow else ""
    da = f' stroke-dasharray="{dash}"' if dash else ""
    return (f'<path d="{d}" fill="none" stroke="{c}" stroke-width="{sw}" stroke-linejoin="round" '
            f'stroke-linecap="round"{da}{m}/>')


def tw(s, size, weight=400):
    """Rough rendered width of a string, enough to size pills and boxes."""
    return len(s) * size * (0.6 if weight >= 600 else 0.55)


def node(x, y, w, h, title, sub=(), fill=GRAY_T, stroke=INK2, size=15, sub_size=12.5):
    out = [R(x, y, w, h, fill, stroke)]
    n = len(sub)
    lh = round(sub_size * 1.35)
    block = size + n * lh
    ty = y + (h - block) / 2 + size * 0.85
    out.append(T(x + w / 2, round(ty), title, size, 650, anchor="middle"))
    for i, s in enumerate(sub):
        out.append(T(x + w / 2, round(ty + (i + 1) * lh + 1), s, sub_size, fill=INK2, anchor="middle"))
    return "\n".join(out)


def diamond(cx, cy, w, h, ls, fill=GRAY_T, stroke=INK2, size=13):
    pts = f"{cx},{cy - h / 2} {cx + w / 2},{cy} {cx},{cy + h / 2} {cx - w / 2},{cy}"
    out = [f'<polygon points="{pts}" fill="{fill}" stroke="{stroke}" stroke-width="1.5"/>']
    lh = round(size * 1.3)
    y0 = cy - (len(ls) - 1) * lh / 2 + size * 0.35
    for i, s in enumerate(ls):
        out.append(T(cx, round(y0 + i * lh), s, size, 600, anchor="middle"))
    return "\n".join(out)


def pill(x, y, s, fill, stroke, size=12, weight=600, anchor="start", color=INK):
    w = tw(s, size, weight) + 18
    h = size + 10
    if anchor == "middle":
        x -= w / 2
    return R(round(x), y, round(w), h, fill, stroke, rx=h / 2, sw=1.2) + "\n" + \
        T(round(x + w / 2), round(y + h / 2 + size * 0.36), s, size, weight, fill=color, anchor="middle")


def tag(x, y, s, stroke):
    """Rounded label sitting on a line: white background so the line does not cross the text."""
    w = tw(s, 12) + 12
    return (R(round(x - w / 2), y - 10, round(w), 20, SURF, stroke, rx=10, sw=1) + "\n" +
            T(x, y + 4, s, 12, 600, fill=INK, anchor="middle"))


def chip(x, y, s, w=None, fill=GRAY_T, stroke="#b9b8b1", size=12, weight=600):
    w = w or round(tw(s, size, weight) + 14)
    return R(x, y, w, 24, fill, stroke, rx=6, sw=1.2) + "\n" + \
        T(x + w / 2, y + 16, s, size, weight, anchor="middle")


def heading(title, sub=None, stage=None):
    out = []
    x = 28
    if stage:
        label, fill, stroke = stage
        out.append(pill(x, 20, label, fill, stroke, size=12))
        x += round(tw(label, 12, 600) + 18) + 12
    out.append(T(x, 39, title, 20, 700))
    if sub:
        out.append(T(28, 64, sub, 13.5, fill=INK2))
    return out


def save(name, w, h, title, body):
    with open(os.path.join(HERE, name), "w", encoding="utf-8") as f:
        f.write(doc(w, h, title, body))


GREEDY = ("STAGE 1 · GREEDY", VIOLET_T, VIOLET)
REPACK = ("STAGE 2 · RE-PACK", AQUA_T, AQUA)
LNS = ("STAGE 3 · LNS", MAG_T, MAGENTA)
EXACT = ("STAGE 4 · EXACT", YEL_T, YELLOW)


# ------------------------------------------------------------------ 01 the problem

def fig_problem():
    b = heading("The problem: copy videos into caches",
                "The worked example from the statement (example.in). Latencies in ms, sizes in MB.")
    # data center
    b.append(node(170, 92, 240, 60, "Data center", ["holds every video"], fill=GRAY_T, stroke=INK2))
    # caches
    for i, (x, name) in enumerate([(80, "Cache 0"), (245, "Cache 1"), (410, "Cache 2")]):
        b.append(node(x, 232, 120, 58, name, ["100 MB"], fill=BLUE_T, stroke=BLUE))
    # endpoints
    b.append(node(170, 382, 140, 58, "Endpoint 0", ["data center: 1000"], fill=ORANGE_T, stroke=ORANGE,
                  sub_size=12))
    b.append(node(400, 382, 140, 58, "Endpoint 1", ["data center: 500"], fill=ORANGE_T, stroke=ORANGE,
                  sub_size=12))
    b.append(T(470, 458, "no linked cache", 12, fill=INK2, anchor="middle", italic=True))
    # links endpoint -> cache
    for cx, mx, lab in [(140, 190, "100"), (305, 272, "300"), (470, 355, "200")]:
        b.append(L(240, 382, cx, 290, "blue", sw=2, arrow=False))
    b.append(tag(186, 336, "100 ms", BLUE))
    b.append(tag(276, 336, "300 ms", BLUE))
    b.append(tag(366, 336, "200 ms", BLUE))
    # links endpoint -> data center
    b.append(P("M170,411 H40 V122 H170", "ink", sw=2, arrow=False))
    b.append(tag(40, 262, "1000 ms", INK2))
    b.append(P("M540,411 H570 V122 H410", "ink", sw=2, arrow=False))
    b.append(tag(570, 262, "500 ms", INK2))
    # legend
    b.append(L(40, 494, 70, 494, "blue", sw=2, arrow=False))
    b.append(T(78, 498, "endpoint–cache link (fast)", 12.5, fill=INK2))
    b.append(L(260, 494, 290, 494, "ink", sw=2, arrow=False))
    b.append(T(298, 498, "endpoint–data center link (slow)", 12.5, fill=INK2))

    # right panel
    x0 = 620
    b.append(T(x0, 104, "Videos (size in MB)", 14, 700))
    for i, (v, s) in enumerate([("v0", 50), ("v1", 50), ("v2", 80), ("v3", 30), ("v4", 110)]):
        bad = v == "v4"
        b.append(chip(x0 + i * 62, 116, f"{v}  {s}", w=56, fill=RED_T if bad else GRAY_T,
                      stroke=RED if bad else "#b9b8b1"))
    b.append(T(x0, 160, "v4 (110 MB) is bigger than any cache: it can never be copied.", 12, fill=INK2))

    b.append(T(x0, 196, "Requests", 14, 700))
    rows = [("Endpoint 0", "v3", "1500"), ("Endpoint 0", "v4", "500"), ("Endpoint 0", "v1", "1000"),
            ("Endpoint 1", "v0", "1000")]
    b.append(T(x0, 218, "who", 12, 600, fill=MUTED))
    b.append(T(x0 + 120, 218, "video", 12, 600, fill=MUTED))
    b.append(T(x0 + 300, 218, "count", 12, 600, fill=MUTED, anchor="end"))
    for i, (e, v, n) in enumerate(rows):
        y = 242 + i * 24
        b.append(T(x0, y, e, 13.5))
        b.append(T(x0 + 120, y, v, 13.5, 600))
        b.append(T(x0 + 300, y, n, 13.5, anchor="end"))
    b.append(L(x0, 340, x0 + 310, 340, GRID, sw=1, arrow=False))
    b.append(T(x0, 358, "total requests", 12.5, fill=INK2))
    b.append(T(x0 + 300, 358, "4000", 12.5, 600, anchor="end"))

    b.append(R(x0 - 6, 380, 322, 92, BLUE_T, BLUE, rx=10))
    b.append(lines(x0 + 8, 404, ["A request is served by the fastest", "linked cache that holds the video,",
                                 "otherwise by the data center."], 13.5, lh=20))

    # formula band
    b.append(R(28, 522, 904, 86, GRAY_T, None, rx=10))
    b.append(T(48, 552, "saving of a request group  =  count × (data-center latency − latency actually used)", 14.5,
               600))
    b.append(T(48, 580, "score  =  sum of all savings × 1000 ÷ total requests", 14.5, 600))
    b.append(T(48, 600, "The only decision: which videos go into which caches, without exceeding any cache's MB.",
               12.5, fill=INK2))
    save("01-problem.svg", 960, 630, "The Streaming Videos problem on example.in", b)


# ------------------------------------------------------------------ 02 overview

def fig_overview():
    b = heading("The whole pipeline (solve.py)",
                "Two branches run at the same time; every output is re-scored and the best valid one is kept.")
    b.append(node(320, 86, 320, 44, "Input .in file", fill=SURF, stroke=INK2))
    b.append(L(480, 130, 480, 148))
    b.append(node(300, 150, 360, 52, "Read and index", ["sum duplicate request lines · build the lookups"]))
    b.append(L(480, 202, 480, 220))
    b.append(node(300, 222, 360, 52, "Measure the exact model", ["y variables = request groups × faster caches"]))
    b.append(P("M480,274 V294 H250 V330"))
    b.append(P("M480,294 H720 V330"))
    b.append(T(365, 288, "always", 12.5, 600, fill=INK2, anchor="middle"))
    b.append(T(600, 288, "only if ≤ 50,000 variables", 12.5, 600, fill=INK2, anchor="middle"))

    # branch 1
    b.append(R(70, 332, 360, 300, SURF, "#c9c8c2", rx=14, dash="5 4"))
    b.append(T(90, 356, "Branch 1 · solver.cpp --lns", 13.5, 700))
    b.append(node(100, 370, 300, 50, "1 · Greedy", ["≤ 5 rounds of fill · evict · swap"], VIOLET_T, VIOLET))
    b.append(L(250, 420, 250, 436))
    b.append(node(100, 438, 300, 50, "2 · Exact re-pack", ["one cache at a time, until stable"], AQUA_T, AQUA))
    b.append(L(250, 488, 250, 504))
    b.append(node(100, 506, 300, 50, "3 · LNS", ["rebuild 2 linked caches, until time is up"], MAG_T, MAGENTA))
    b.append(L(250, 556, 250, 572))
    b.append(node(100, 574, 300, 44, "4 · Final re-pack sweep", (), AQUA_T, AQUA))

    # branch 2
    b.append(R(530, 332, 380, 300, SURF, "#c9c8c2", rx=14, dash="5 4"))
    b.append(T(550, 356, "Branch 2 · exact.py (small data sets)", 13.5, 700))
    b.append(node(570, 370, 300, 50, "Exact MILP (HiGHS)", ["up to half of the time budget"], YEL_T, YELLOW))
    b.append(L(720, 420, 720, 438))
    b.append(diamond(720, 470, 210, 64, ["proven optimal?"]))
    b.append(P("M615,470 H630 V530"))
    b.append(P("M825,470 H810 V530"))
    b.append(T(606, 462, "yes", 12.5, 600, fill=INK2, anchor="end"))
    b.append(T(834, 462, "no", 12.5, 600, fill=INK2))
    b.append(node(548, 532, 164, 72, "Stop branch 1", ["nothing can beat", "a proven optimum"], GREEN_T, GREEN,
                  size=14, sub_size=12))
    b.append(node(728, 532, 164, 72, "LNS from it", ["solver --start", "exact.out --lns"], MAG_T, MAGENTA,
                  size=14, sub_size=12))
    b.append(T(480, 470, "run in", 12.5, 600, fill=MUTED, anchor="middle"))
    b.append(T(480, 488, "parallel", 12.5, 600, fill=MUTED, anchor="middle"))

    # check
    b.append(P("M250,632 V683 H268"))
    b.append(P("M720,632 V683 H692"))
    b.append(node(270, 656, 420, 54, "Re-score every output with solution.score()",
                  ["reject any cache over capacity · keep the best score"]))
    b.append(L(480, 710, 480, 728))
    b.append(node(370, 730, 220, 40, "Best .out file", (), SURF, INK2, size=14))
    b.append(T(480, 800, "Every stage keeps a change only if the score does not drop, so the score can only go up.",
               13, 600, fill=INK2, anchor="middle"))
    save("02-overview.svg", 960, 822, "Overview of the pipeline run by solve.py", b)


# ------------------------------------------------------------------ 03 bookkeeping

def fig_bookkeeping():
    b = heading("What the code remembers",
                "Built once while reading the file, then kept up to date after every change. Values: the example's end state.")
    # panel A: requests
    b.append(R(28, 84, 440, 262, SURF, GRID, rx=12))
    b.append(T(46, 110, "1 · The requests", 15, 700))
    b.append(T(46, 130, "Lines for the same (endpoint, video) are added together.", 12, fill=INK2))
    hdr = [("who", 60, "start"), ("video", 170, "start"), ("requests", 320, "end"), ("data center", 440, "end")]
    for s, x, a in hdr:
        b.append(T(x, 160, s, 12, 600, fill=MUTED, anchor=a))
    groups = [("Endpoint 0", "v3", "1500", "1000 ms"), ("Endpoint 1", "v0", "1000", "500 ms"),
              ("Endpoint 0", "v4", "500", "1000 ms"), ("Endpoint 0", "v1", "1000", "1000 ms")]
    for i, (e, v, n, ld) in enumerate(groups):
        y = 186 + i * 26
        b.append(T(60, y, e, 13.5))
        b.append(T(170, y, v, 13.5, 600))
        b.append(T(320, y, n, 13.5, anchor="end"))
        b.append(T(440, y, ld, 13.5, anchor="end", fill=INK2))
    b.append(lines(46, 304, ["It also keeps, for each endpoint, its caches sorted",
                             "from fastest to slowest."], 12.5, lh=18, fill=INK2))

    # panel B: what is in each cache
    b.append(R(492, 84, 440, 262, SURF, GRID, rx=12))
    b.append(T(510, 110, "2 · What is in each cache", 15, 700))
    b.append(T(510, 130, "A yes / no table: is this video in this cache?", 12, fill=INK2))
    gx, gy, cw, ch = 580, 168, 46, 30
    for j in range(5):
        b.append(T(gx + j * cw + cw / 2, gy - 8, f"v{j}", 12, 600, fill=MUTED, anchor="middle"))
    held = {(0, 1), (0, 3)}
    free = [20, 100, 100]
    for i in range(3):
        b.append(T(gx - 12, gy + i * ch + 20, f"cache {i}", 12.5, 600, anchor="end"))
        for j in range(5):
            on = (i, j) in held
            b.append(R(gx + j * cw + 2, gy + i * ch + 2, cw - 4, ch - 4, BLUE if on else GRAY_T, None, rx=4))
            if on:
                b.append(T(gx + j * cw + cw / 2, gy + i * ch + 20, "yes", 12, 700, fill="#ffffff",
                           anchor="middle"))
        b.append(T(gx + 5 * cw + 12, gy + i * ch + 20, f"{free[i]} MB free", 12.5, fill=INK2))
    b.append(lines(510, 304, ["Checking, adding or removing a copy is instant,",
                              "and so is knowing how much space is left."], 12.5, lh=18, fill=INK2))

    # panel C: how fast each request is served now
    b.append(R(28, 362, 904, 268, SURF, GRID, rx=12))
    b.append(T(46, 388, "3 · How fast each request is served right now", 15, 700))
    b.append(T(46, 408, "The memory of what is already saved: a new copy only counts for the time it saves below this.",
               12, fill=INK2))
    cols = [("request", 60, "start"), ("best now", 300, "end"), ("given by", 330, "start"),
            ("next best", 590, "end")]
    for s, x, a in cols:
        b.append(T(x, 438, s, 12, 600, fill=MUTED, anchor=a))
    vals = [("Endpoint 0 · v3", "100 ms", "cache 0", "1000 ms"), ("Endpoint 1 · v0", "500 ms", "data center", "–"),
            ("Endpoint 0 · v4", "1000 ms", "data center", "–"), ("Endpoint 0 · v1", "100 ms", "cache 0", "1000 ms")]
    for i, (r, best, by, nxt) in enumerate(vals):
        y = 464 + i * 26
        b.append(T(60, y, r, 13.5, 600))
        b.append(T(300, y, best, 13.5, 700, anchor="end"))
        b.append(T(330, y, by, 13.5, fill=INK2))
        b.append(T(590, y, nxt, 13.5, anchor="end", fill=INK2))
    b.append(R(630, 426, 284, 120, AQUA_T, AQUA, rx=10))
    b.append(lines(646, 450, ["Why also keep the next best?",
                              "Swap and re-pack keep asking “if this",
                              "copy were removed, how slow would it",
                              "get?” The answer is just the next best,", "no searching needed."], 12.5, lh=18))
    b.append(lines(46, 584, ["When a copy is placed, “best now” drops for the requests it speeds up.",
                             "When a copy is removed, the next best takes its place."], 12.5, lh=18, fill=INK2))
    save("03-bookkeeping.svg", 960, 650, "What the solver remembers", b)


# ------------------------------------------------------------------ 04 greedy round

def fig_greedy_round():
    b = heading("One greedy round", "solver.cpp: globalFill → evictDeadWeight → swapPass, up to 5 rounds",
                stage=GREEDY)
    cx = 260
    b.append(T(110, 92, "1a · Global fill (lazy max-heap)", 14, 700, fill=INK))
    b.append(node(110, 102, 300, 58, "Score every (cache, video) pair",
                  ["= requests × ms saved, counting only", "time that is not saved already"], VIOLET_T,
                  VIOLET, size=14, sub_size=12))
    b.append(L(cx, 160, cx, 178))
    b.append(node(110, 180, 300, 46, "Push them all into one max-heap", ["best first: most time saved per MB"],
                  VIOLET_T, VIOLET, size=14, sub_size=12))
    b.append(L(cx, 226, cx, 244))
    b.append(node(110, 246, 300, 40, "Pop the best pair", (), VIOLET_T, VIOLET, size=14))
    b.append(L(cx, 286, cx, 302))
    b.append(diamond(cx, 334, 180, 62, ["still fits", "in the cache?"]))
    b.append(L(170, 334, 152, 334, "red"))
    b.append(T(178, 326, "no", 12, 600, fill=INK2, anchor="end"))
    b.append(pill(66, 322, "✗ drop", RED_T, RED, anchor="start"))
    b.append(L(cx, 365, cx, 384))
    b.append(T(cx + 8, 379, "yes", 12, 600, fill=INK2))
    b.append(node(110, 386, 300, 44, "Check its value again", ["earlier copies may have made it worth less"],
                  VIOLET_T, VIOLET, size=14, sub_size=12))
    b.append(L(cx, 430, cx, 448))
    b.append(diamond(cx, 486, 190, 72, ["worth the same", "as before?"]))
    b.append(L(165, 486, 152, 486, "red"))
    b.append(T(176, 476, "now 0", 12, 600, fill=INK2, anchor="end"))
    b.append(pill(66, 474, "✗ drop", RED_T, RED, anchor="start"))
    b.append(L(355, 486, 438, 486, "yellow"))
    b.append(T(396, 478, "less", 12, 600, fill=INK2, anchor="middle"))
    b.append(node(440, 462, 160, 48, "Push it back", ["with the new key"], YEL_T, YELLOW, size=14, sub_size=12))
    b.append(P("M520,462 V276 H412", "yellow"))
    b.append(L(cx, 522, cx, 546, "green"))
    b.append(T(cx + 8, 540, "same", 12, 600, fill=INK2))
    b.append(node(110, 548, 300, 54, "✓ Place it", ["the requests it speeds up are now faster"], GREEN_T,
                  GREEN, size=14, sub_size=12))
    b.append(P("M110,575 H40 V266 H108", "green"))
    # heap empty exit
    b.append(P("M410,254 H440 V128 H652"))
    b.append(T(448, 120, "heap empty", 12, 600, fill=INK2))

    # right column
    b.append(node(654, 92, 278, 72, "1b · Evict dead weight",
                  ["delete a copy if every endpoint that", "wants it gets it as fast elsewhere"], VIOLET_T,
                  VIOLET, size=14, sub_size=12))
    b.append(L(793, 164, 793, 192))
    b.append(node(654, 194, 278, 72, "1c · Swap",
                  ["give up the least useful copies for a", "better video, if we win more than we lose"], VIOLET_T,
                  VIOLET, size=14, sub_size=12))
    b.append(L(793, 266, 793, 292))
    b.append(diamond(793, 340, 250, 92, ["anything changed,", "round < 5 and", "time left?"]))
    b.append(P("M918,340 H944 V74 H395 V100"))
    b.append(T(924, 332, "yes", 12, 600, fill=INK2))
    b.append(T(600, 70, "next round", 12, 600, fill=INK2, anchor="middle"))
    b.append(L(793, 386, 793, 414))
    b.append(T(801, 406, "no", 12, 600, fill=INK2))
    b.append(node(674, 416, 238, 46, "Greedy done", ["→ stage 2, the re-pack"], AQUA_T, AQUA, size=14,
                  sub_size=12))

    b.append(R(640, 490, 292, 112, GRAY_T, None, rx=10))
    b.append(lines(656, 514, ["Why “lazy” is safe: placing a copy can", "only make other pairs worth less, never",
                              "more. So if a pair is still worth what the", "heap says, nothing below it can beat it."],
                   12.5, lh=19))
    b.append(lines(40, 636, ["Fast on big data sets: a cache only ever looks at the videos its own users ask for, "
                             "never the whole catalogue."], 12.5, fill=INK2))
    save("04-greedy-round.svg", 960, 660, "Flowchart of one greedy round", b)


# ------------------------------------------------------------------ 05 heap trace

def fig_heap_trace():
    b = heading("The greedy on the example, pop by pop", "Round 1 of the global fill. Endpoint 0 reaches caches "
                "0 / 2 / 1 at 100 / 200 / 300 ms, the data center at 1000 ms.", stage=GREEDY)
    hdr = [("pop", 44, "start"), ("pair", 84, "start"), ("gain", 268, "end"), ("gain / MB", 360, "end"),
           ("what happens", 384, "start")]
    for s, x, a in hdr:
        b.append(T(x, 104, s, 12, 600, fill=MUTED, anchor=a))
    rows = [
        ("1", "(c0, v3)", "1500 × 900", "45,000", True, "placed · c0 has 70 MB left"),
        ("2", "(c2, v3)", "1500 × 800", "40,000", False, "now 0: e0 gets v3 at 100 ms"),
        ("3", "(c1, v3)", "1500 × 700", "35,000", False, "now 0"),
        ("4", "(c0, v1)", "1000 × 900", "18,000", True, "placed · c0 has 20 MB left"),
        ("5", "(c2, v1)", "1000 × 800", "16,000", False, "now 0: e0 gets v1 at 100 ms"),
        ("6", "(c1, v1)", "1000 × 700", "14,000", False, "now 0"),
    ]
    for i, (n, pair, g, k, ok, what) in enumerate(rows):
        y = 134 + i * 34
        if ok:
            b.append(R(32, y - 22, 548, 32, GREEN_T, None, rx=6))
        b.append(T(52, y, n, 14, 700, anchor="middle"))
        b.append(T(84, y, pair, 14, 600, mono=True))
        b.append(T(268, y, g, 13.5, anchor="end", fill=INK2))
        b.append(T(360, y, k, 14, 600, anchor="end"))
        b.append(T(384, y, ("✓ " if ok else "✗ ") + what, 13, fill=GREEN if ok else RED, weight=600))
    b.append(T(44, 354, "Never pushed: (c, v4) for every cache, because 110 MB > 100 MB.", 12.5, fill=INK2))

    # cache bars
    x0, scale = 616, 3.0
    b.append(T(x0, 104, "Caches after the fill (100 MB each)", 13, 700))
    for i, (name, segs) in enumerate([("c0", [("v3", 30, BLUE), ("v1", 50, BLUE)]), ("c1", []), ("c2", [])]):
        y = 120 + i * 50
        b.append(T(x0, y + 22, name, 13, 700))
        x = x0 + 30
        for v, mb, col in segs:
            b.append(R(x, y + 4, mb * scale - 2, 28, col, None, rx=4))
            b.append(T(x + mb * scale / 2, y + 23, f"{v} · {mb}", 12.5, 700, fill="#ffffff", anchor="middle"))
            x += mb * scale
        free = 100 - sum(s[1] for s in segs)
        b.append(R(x, y + 4, free * scale, 28, GRAY_T, "#c9c8c2", rx=4, sw=1))
        b.append(T(x + free * scale / 2, y + 23, f"free {free}", 12, fill=INK2, anchor="middle"))

    b.append(T(x0, 290, "cur after the fill", 13, 700))
    for i, (g, before, after) in enumerate([("(e0, v3)", "1000", "100"), ("(e0, v1)", "1000", "100"),
                                           ("(e0, v4)", "1000", "1000"), ("(e1, v0)", "500", "500")]):
        y = 314 + i * 22
        b.append(T(x0, y, g, 13, mono=True))
        b.append(T(x0 + 120, y, before, 13, anchor="end", fill=INK2))
        b.append(T(x0 + 140, y, "→", 13, fill=INK2, anchor="middle"))
        b.append(T(x0 + 160, y, after, 13, 700 if after != before else 400))
    b.append(T(x0 + 200, 358, "too big", 12, fill=MUTED, italic=True))
    b.append(T(x0 + 200, 380, "no cache", 12, fill=MUTED, italic=True))

    b.append(R(28, 404, 904, 92, GRAY_T, None, rx=10))
    b.append(lines(46, 430, ["Evict: nothing to delete. Swap: v4 would be worth 450,000 in c0 but can never fit. "
                             "Round 2 changes nothing → stop.",
                             ],
                   12.5, fill=INK2))
    b.append(T(46, 460, "saving = 1500 × 900 + 1000 × 900 = 2,250,000", 14.5, 600))
    b.append(T(46, 484, "score = 2,250,000 × 1000 ÷ 4000 = 562,500", 14.5, 700))
    b.append(T(912, 484, "statement's sample answer: 462,500", 12.5, fill=INK2, anchor="end"))
    save("05-heap-trace.svg", 960, 516, "Trace of the greedy fill on example.in", b)


# ------------------------------------------------------------------ 06 evict & swap

def fig_evict():
    b = heading("Evict: delete copies that nobody uses", stage=GREEDY)
    b.append(node(70, 84, 140, 64, "Cache A", ["100 ms · holds v"], BLUE_T, BLUE, size=14, sub_size=12))
    b.append(node(286, 84, 140, 64, "Cache B", ["300 ms · holds v"], BLUE_T, BLUE, size=14, sub_size=12))
    b.append(node(178, 236, 140, 48, "Users", ["want v"], ORANGE_T, ORANGE, size=14, sub_size=12))
    b.append(L(222, 236, 150, 150, "green", sw=3))
    b.append(L(274, 236, 346, 150, "blue", sw=1.5, arrow=False, dash="5 4"))
    b.append(tag(172, 196, "used", GREEN))
    b.append(tag(326, 196, "never used", BLUE))
    b.append(R(396, 72, 66, 24, RED_T, RED, rx=12, sw=1.2))
    b.append(T(429, 88, "delete", 12, 700, fill=RED, anchor="middle"))

    b.append(R(492, 72, 440, 230, GRAY_T, None, rx=10))
    b.append(lines(510, 98, ["The users get v from cache A in 100 ms.",
                             "Cache B's copy of v (300 ms) is never used: everyone",
                             "who could use it already gets v faster from A.",
                             "",
                             "So the copy is deleted. Nobody waits longer, the score",
                             "stays exactly the same, and cache B gets its space back",
                             "for something useful in the next round.",
                             "",
                             "How it happens: during the fill, copies are added one at",
                             "a time and never removed, so a later copy (in A) can make",
                             "an earlier one (in B) useless."], 12.5, lh=19))
    b.append(T(46, 330, "Rule: delete a copy only if EVERY user of that cache who wants the video already gets it at "
               "least as fast from somewhere else.", 12.5, 600, fill=INK2))
    save("06a-evict.svg", 960, 352, "How eviction works", b)


def fig_swap():
    b = heading("Swap: make room for a better video, if the trade pays off",
                "The cache is full, but a video outside would help a lot. Is it worth throwing something out?",
                stage=GREEDY)
    sc, bx = 3.6, 520

    def bar(y, segs):
        out, x = [], bx
        for lab, mb, fill, txt, stroke in segs:
            out.append(R(x, y, mb * sc - 2, 32, fill, stroke, rx=4, sw=1))
            out.append(T(x + mb * sc / 2, y + 21, lab, 12, 700, fill=txt, anchor="middle"))
            x += mb * sc
        return out

    X = ("X saves 300", 30, BLUE, "#ffffff", None)
    Y = ("Y saves 600", 30, BLUE, "#ffffff", None)
    Z = ("Z saves 1800", 30, BLUE, "#ffffff", None)
    F10 = ("free", 10, GRAY_T, INK2, "#c9c8c2")

    def step(y, n, title, ls):
        out = [f'<circle cx="58" cy="{y + 6}" r="14" fill="{VIOLET_T}" stroke="{VIOLET}" stroke-width="1.5"/>',
               T(58, y + 11, n, 14, 700, anchor="middle"), T(84, y + 11, title, 15, 700)]
        out.append(lines(84, y + 34, ls, 12.5, lh=19, fill=INK2))
        return out

    y = 92
    b += step(y, "1", "The cache is full", ["The cache (100 MB) holds X, Y and Z, 30 MB each,",
                                            "and only 10 MB is free. Video W needs 60 MB and",
                                            "would save 1500 ms, but it does not fit."])
    b += bar(y - 4, [X, Y, Z, F10])
    b.append(R(bx, y + 38, 60 * sc - 2, 28, VIOLET_T, VIOLET, rx=4, sw=1.2))
    b.append(T(bx + 30 * sc, y + 57, "W · 60 MB · would save 1500", 12, 700, anchor="middle"))
    b.append(T(bx + 60 * sc + 10, y + 57, "← waiting outside", 12, fill=INK2))

    y = 214
    b += step(y, "2", "Rank the copies: who is least useful?", ["Per MB, X saves the least, then Y, then Z.",
                                                               "The least useful copies are the first ones",
                                                               "we would give up."])
    b += bar(y - 4, [X, Y, Z, F10])
    for i, lab in enumerate(["1st to go", "2nd to go", "keep"]):
        b.append(T(bx + (i * 30 + 15) * sc, y + 46, lab, 12, 600, fill=RED if i < 2 else INK2, anchor="middle"))

    y = 320
    b += step(y, "3", "Make room, least useful first", ["Remove X: 40 MB free, still too small for W.",
                                                       "Remove Y too: 70 MB free, now W fits."])
    b += bar(y - 4, [("X out", 30, "url(#hatch)", RED, RED), ("Y out", 30, "url(#hatch)", RED, RED), Z, F10])

    y = 414
    b += step(y, "4", "Is the trade worth it?", ["We lose what X and Y saved: 300 + 600 = 900.",
                                                "We win what W saves: 1500.",
                                                "1500 is more than 900, so we are 600 better: swap!"])
    b += bar(y - 4, [Z, ("W saves 1500", 60, GREEN, "#ffffff", None), F10])
    b.append(T(bx, y + 52, "after the swap", 12, 600, fill=GREEN))

    b.append(R(28, 512, 904, 84, GRAY_T, None, rx=10))
    b.append(lines(46, 536, ["If we would lose more than we win, nothing changes.",
                             "“X saves 300” means: without this copy, X's users would wait 300 ms more in total "
                             "(they fall back to the next best cache or the data center).",
                             "For each cache the solver tries the 20 most valuable videos it does not hold, makes "
                             "the best trade, then looks again (at most 50 trades per cache)."], 12.5, lh=20))
    save("06b-swap.svg", 960, 616, "How a swap works, step by step", b)


# ------------------------------------------------------------------ 07 ratio trap

def fig_ratio_trap():
    b = heading("Why the greedy is not enough: the ratio trap",
                "One cache of 10 MB. Choosing by saving per MB is not the best knapsack.")
    sc = 30
    items = [("A", 6, 600, "100 / MB", VIOLET), ("B", 5, 450, "90 / MB", BLUE), ("C", 5, 450, "90 / MB", BLUE)]
    b.append(T(40, 100, "videos", 13, 700))
    for i, (n, mb, val, ratio, col) in enumerate(items):
        y = 114 + i * 46
        b.append(R(40, y, mb * sc - 2, 32, col, None, rx=4))
        b.append(T(40 + mb * sc / 2, y + 21, f"{n} · {mb} MB", 13, 700, fill="#ffffff", anchor="middle"))
        b.append(T(40 + mb * sc + 10, y + 21, f"saves {val} · {ratio}", 13, fill=INK2))

    x0 = 470
    b.append(T(x0, 100, "Greedy (best ratio first)", 13, 700))
    b.append(R(x0, 114, 6 * sc - 2, 36, VIOLET, None, rx=4))
    b.append(T(x0 + 3 * sc, 137, "A", 13, 700, fill="#ffffff", anchor="middle"))
    b.append(R(x0 + 6 * sc, 114, 4 * sc, 36, "url(#hatch)", RED, rx=4, sw=1))
    b.append(T(x0 + 8 * sc, 137, "4 MB wasted", 12, 700, fill=RED, anchor="middle"))
    b.append(T(x0 + 10 * sc + 16, 138, "600", 22, 700))
    b.append(T(x0, 172, "takes A first; then neither B nor C (5 MB) fits in 4 MB", 12.5, fill=INK2))

    b.append(T(x0, 214, "Exact knapsack (stage 2)", 13, 700))
    b.append(R(x0, 228, 5 * sc - 2, 36, BLUE, None, rx=4))
    b.append(T(x0 + 2.5 * sc, 251, "B", 13, 700, fill="#ffffff", anchor="middle"))
    b.append(R(x0 + 5 * sc, 228, 5 * sc - 2, 36, BLUE, None, rx=4))
    b.append(T(x0 + 7.5 * sc, 251, "C", 13, 700, fill="#ffffff", anchor="middle"))
    b.append(T(x0 + 10 * sc + 16, 252, "900", 22, 700, fill=GREEN))
    b.append(T(x0, 286, "tries every combination (by DP) and keeps the best", 12.5, fill=INK2))
    b.append(T(40, 300, "PIPELINE.md: some class instances (4_2_4_2, 6_2_6_2 …) are built on this trap;",
               12.5, fill=INK2))
    b.append(T(40, 320, "the greedy reaches only 50–66 % of their optimum there.", 12.5, fill=INK2))
    save("07-ratio-trap.svg", 960, 344, "Greedy by ratio versus an exact knapsack", b)


# ------------------------------------------------------------------ 08 re-pack

def fig_repack_value():
    b = heading("Re-pack, part 1: how useful is a video in THIS cache?",
                "The other caches are locked. A copy here is only worth the time it saves on top of what users already get.",
                stage=REPACK)
    cards = [("Nobody nearby has it", GREEN_T, GREEN, ("data center", "1000 ms"), GRAY_T, INK2,
              ["Without this copy: 1000 ms", "(the data center).", "With it: 100 ms.", "Saves 900 ms per request."],
              "very useful"),
             ("Another cache has it, slower", YEL_T, YELLOW, ("other cache", "200 ms"), BLUE_T, BLUE,
              ["Without this copy: 200 ms", "(the other cache).", "With it: 100 ms.", "Saves only 100 ms per request."],
              "a little useful"),
             ("Another cache has it, faster", RED_T, RED, ("other cache", "50 ms"), BLUE_T, BLUE,
              ["Users already get it in 50 ms.", "This copy (100 ms) would", "never be used.", "Saves nothing."],
              "useless here")]
    for i, (title, tf, ts, other, of, os_, ls, verdict) in enumerate(cards):
        x, y = 28 + i * 312, 84
        b.append(R(x, y, 280, 300, SURF, GRID, rx=12))
        b.append(T(x + 16, y + 28, title, 14.5, 700))
        b.append(node(x + 16, y + 46, 116, 46, "this cache", ["100 ms"], AQUA_T, AQUA, size=13, sub_size=12))
        b.append(node(x + 148, y + 46, 116, 46, other[0], [other[1]], of, os_, size=13, sub_size=12))
        b.append(node(x + 80, y + 128, 120, 36, "users", (), ORANGE_T, ORANGE, size=13))
        b.append(L(x + 124, y + 128, x + 74, y + 92, "blue", arrow=False))
        b.append(L(x + 156, y + 128, x + 206, y + 92, "ink" if i == 0 else "blue", arrow=False))
        b.append(lines(x + 16, y + 192, ls, 12.5, lh=19))
        b.append(pill(x + 16, y + 266, verdict, tf, ts))
    b.append(T(480, 412, "Add this up over all the cache's users and all their requests: each video gets one "
               "number, its value in this cache.", 13, 600, fill=INK2, anchor="middle"))
    save("08a-repack-value.svg", 960, 436, "How re-pack values a video in one cache", b)


def fig_repack_steps():
    b = heading("Re-pack, part 2: refill the cache with the best combination",
                "Example: one cache of 10 MB that the greedy filled with A only.", stage=REPACK)
    w, gap = 214, 16
    titles = ["1 · Lock the others", "2 · Value of each video", "3 · Best combo for 10 MB", "4 · Better? Replace"]
    for i, t in enumerate(titles):
        x = 28 + i * (w + gap)
        b.append(R(x, 84, w, 280, SURF, GRID, rx=12))
        b.append(T(x + 14, 110, t, 14, 700))
        if i < 3:
            b.append(L(x + w + 2, 224, x + w + gap - 2, 224, "aqua"))
    # frame 1
    x = 28
    for j in range(5):
        on = j == 2
        b.append(R(x + 14 + j * 38, 134, 32, 32, AQUA_T if on else GRAY_T, AQUA if on else "#c9c8c2", rx=6,
                   sw=2 if on else 1))
    b.append(T(x + 14 + 2 * 38 + 16, 186, "this one", 12, 700, anchor="middle"))
    b.append(T(x + 14 + 0 * 38 + 16, 186, "locked", 11.5, fill=MUTED, anchor="middle"))
    b.append(T(x + 14 + 4 * 38 + 16, 186, "locked", 11.5, fill=MUTED, anchor="middle"))
    b.append(lines(x + 14, 230, ["Only this cache may change.", "All other caches stay exactly",
                                 "as they are for now, so each", "video's value here is a fixed", "number."],
                   12.5, lh=19, fill=INK2))
    # frame 2
    x = 28 + (w + gap)
    for j, (n, mb, val) in enumerate([("A", 6, 600), ("B", 5, 450), ("C", 5, 450)]):
        yy = 128 + j * 38
        b.append(R(x + 14, yy, mb * 14, 28, VIOLET if n == "A" else BLUE, None, rx=4))
        b.append(T(x + 14 + mb * 7, yy + 19, f"{n} · {mb} MB", 12, 700, fill="#ffffff", anchor="middle"))
        b.append(T(x + 14 + 6 * 14 + 10, yy + 19, f"worth {val}", 12.5, 600))
    b.append(lines(x + 14, 262, ["Worked out as in part 1:", "the time it saves on top of", "what users already get."],
                   12.5, lh=19, fill=INK2))
    # frame 3
    x = 28 + 2 * (w + gap)
    b.append(lines(x + 14, 138, ["A alone: 600", "B or C no longer fits next to A"], 12.5, lh=18))
    b.append(lines(x + 14, 186, ["A + B: 11 MB, too big"], 12.5, lh=18))
    b.append(T(x + 14, 216, "B + C: 900  ✓ the best", 13, 700, fill=GREEN))
    b.append(lines(x + 14, 262, ["A table checks all the", "combinations quickly", "(next figure)."], 12.5, lh=19,
                   fill=INK2))
    # frame 4
    x = 28 + 3 * (w + gap)
    s = 15
    b.append(T(x + 14, 136, "now", 12, 600, fill=INK2))
    b.append(R(x + 14, 142, 6 * s - 2, 26, VIOLET, None, rx=4))
    b.append(T(x + 14 + 3 * s, 160, "A", 12, 700, fill="#ffffff", anchor="middle"))
    b.append(R(x + 14 + 6 * s, 142, 4 * s, 26, "url(#hatch)", RED, rx=4, sw=1))
    b.append(T(x + 14 + 10 * s + 10, 160, "600", 14, 700))
    b.append(T(x + 14, 192, "best", 12, 600, fill=INK2))
    b.append(R(x + 14, 198, 5 * s - 2, 26, BLUE, None, rx=4))
    b.append(T(x + 14 + 2.5 * s, 216, "B", 12, 700, fill="#ffffff", anchor="middle"))
    b.append(R(x + 14 + 5 * s, 198, 5 * s - 2, 26, BLUE, None, rx=4))
    b.append(T(x + 14 + 7.5 * s, 216, "C", 12, 700, fill="#ffffff", anchor="middle"))
    b.append(T(x + 14 + 10 * s + 10, 216, "900", 14, 700, fill=GREEN))
    b.append(lines(x + 14, 262, ["900 is more than 600:", "empty the cache and put", "in B and C instead."], 12.5,
                   lh=19, fill=INK2))
    # loop
    b.append(P(f"M{28 + 3 * (w + gap) + w / 2},364 V392 H{28 + w / 2} V368", "aqua"))
    b.append(T(480, 386, "then the next cache", 12.5, 600, fill=INK2, anchor="middle"))
    b.append(lines(46, 422, ["Changing one cache changes what videos are worth in its neighbours, so the solver goes "
                             "round all caches again and again",
                             "until a full round changes nothing.  Why “perfect”: with the others locked, no other "
                             "set of videos for this cache saves more time."], 12.5, lh=20))
    save("08b-repack-steps.svg", 960, 470, "Re-pack, step by step", b)


# ------------------------------------------------------------------ 09 knapsack DP

def fig_knapsack():
    b = heading("Re-pack, part 3: the table that finds the best combination",
                "Each cell: the best total value with that much space. Shaded: the new video was put in.", stage=REPACK)
    x0, y0, cw, ch = 220, 112, 60, 40
    for cap in range(11):
        b.append(T(x0 + cap * cw + cw / 2, y0 - 10, str(cap), 12.5, 600, fill=MUTED, anchor="middle"))
    b.append(T(x0 - 14, y0 - 10, "space (MB) →", 12.5, 600, fill=MUTED, anchor="end"))
    rows = [("with A (6 MB, worth 600)", [0, 0, 0, 0, 0, 0, 600, 600, 600, 600, 600], {6, 7, 8, 9, 10}),
            ("+ B (5 MB, worth 450)", [0, 0, 0, 0, 0, 450, 600, 600, 600, 600, 600], {5}),
            ("+ C (5 MB, worth 450)", [0, 0, 0, 0, 0, 450, 600, 600, 600, 600, 900], {10})]
    for i, (lab, vals, bits) in enumerate(rows):
        y = y0 + i * ch
        b.append(T(x0 - 14, y + 25, lab, 13, 600, anchor="end"))
        for cap, v in enumerate(vals):
            on = cap in bits
            b.append(R(x0 + cap * cw + 1, y + 1, cw - 2, ch - 2, AQUA_T if on else SURF,
                       AQUA if on else GRID, rx=4, sw=1.5 if on else 1))
            b.append(T(x0 + cap * cw + cw / 2, y + 25, str(v), 13, 700 if on else 400,
                       fill=INK if v else MUTED, anchor="middle"))
    # backtrack path
    def cell(row, cap):
        return x0 + cap * cw + cw / 2, y0 + row * ch + ch / 2
    (ax, ay), (bx, by), (cx_, cy_) = cell(2, 10), cell(1, 5), cell(0, 0)
    b.append(f'<circle cx="{ax}" cy="{ay}" r="17" fill="none" stroke="{GREEN}" stroke-width="2.5"/>')
    b.append(f'<circle cx="{bx}" cy="{by}" r="17" fill="none" stroke="{GREEN}" stroke-width="2.5"/>')
    b.append(P(f"M{ax - 18},{ay - 6} L{bx + 20},{by + 6}", "green", sw=2))
    b.append(P(f"M{bx - 18},{by - 6} L{cx_ + 18},{cy_ + 6}", "green", sw=2, dash="4 4"))
    b.append(T(x0 + 11 * cw + 10, y0 + 2 * ch + 25, "= 900", 15, 700, fill=GREEN))

    b.append(R(28, 252, 904, 150, GRAY_T, None, rx=10))
    notes = [("Filling", ["Rows add one video at a time. For each cell there are two choices: leave the new video out",
                          "(keep the value just above), or put it in (its value + the best value for the space that is left).",
                          "Keep the bigger one. Shaded cells are where putting it in won."]),
             ("Reading", ["Start bottom-right (all videos, 10 MB): shaded, so C is in and 5 MB is left. In B's row at 5 MB:",
                          "shaded, so B is in and 0 MB is left. A's row at 0 MB is not shaded, so A is out. Answer: B + C = 900."])]
    y = 278
    for lab, ls in notes:
        b.append(T(46, y, lab, 13, 700))
        b.append(lines(130, y, ls, 13, lh=20))
        y += 20 * len(ls) + 12
    save("09-knapsack-dp.svg", 960, 430, "The knapsack dynamic program on the trap example", b)


# ------------------------------------------------------------------ 10 LNS

def fig_lns():
    b = heading("Large Neighbourhood Search", "Destroy two linked caches, rebuild them together, keep the "
                "result if the score did not drop.", stage=LNS)

    def net(x, y, c1, c2, title, total, good):
        out = [R(x, y, 290, 232, SURF, GREEN if good else GRID, rx=12, sw=2 if good else 1)]
        out.append(T(x + 16, y + 26, title, 14, 700))
        out.append(node(x + 30, y + 44, 100, 54, "C1", [f"holds {c1}"], BLUE_T, BLUE, size=13, sub_size=12))
        out.append(node(x + 160, y + 44, 100, 54, "C2", [f"holds {c2}"], BLUE_T, BLUE, size=13, sub_size=12))
        out.append(node(x + 30, y + 148, 110, 48, "E0", ["A×10, B×10"], ORANGE_T, ORANGE, size=13, sub_size=12))
        out.append(node(x + 170, y + 148, 90, 48, "E1", ["A×1"], ORANGE_T, ORANGE, size=13, sub_size=12))
        out.append(L(x + 70, y + 148, x + 80, y + 98, "blue", arrow=False))
        out.append(L(x + 110, y + 148, x + 200, y + 98, "blue", arrow=False))
        out.append(L(x + 200, y + 148, x + 100, y + 98, "blue", arrow=False))
        out.append(T(x + 274, y + 222, f"saving {total}", 13, 700, fill=GREEN if good else INK, anchor="end"))
        return out

    b += net(28, 82, "B", "A", "Now (re-pack is stuck)", "18,000", False)
    b.append(R(334, 82, 300, 232, GRAY_T, None, rx=12))
    b.append(lines(350, 108, ["All links 100 ms, data center 1000 ms,", "each cache fits one video."], 12.5, lh=18,
                   fill=INK2))
    b.append(lines(350, 156, ["Re-pack C1 alone: E0 already gets A", "from C2, so A is worth 900 (E1 only)",
                              "< B's 9,000 → keep B.",
                              "Re-pack C2 alone: B is worth 0", "(E0 gets B from C1) → keep A.",
                              "Neither single move helps."], 12.5, lh=19))
    b += net(642, 82, "A", "B", "Both changed together", "18,900", True)

    # loop
    b.append(T(46, 352, "One LNS step (repeated until the time budget is spent)", 15, 700))
    steps = [("1 · Pick", ["random cache, then", "cache → endpoint →", "cache (k = 2)"]),
             ("2 · Remember", ["their contents and", "saving S of the", "endpoints around"]),
             ("3 · Destroy", ["empty both", "caches"]),
             ("4 · Repair", ["re-pack just these 2,", "random order,", "until stable"]),
             ("5 · Compare", ["new saving ≥ S ?"])]
    bw, gap, x = 156, 26, 40
    for i, (t, sub) in enumerate(steps):
        b.append(node(x, 368, bw, 92, t, sub, MAG_T, MAGENTA, size=14, sub_size=12))
        if i < len(steps) - 1:
            b.append(L(x + bw, 414, x + bw + gap - 2, 414, "magenta"))
        x += bw + gap
    lx = 40 + 4 * (bw + gap)
    b.append(L(lx + 60, 460, lx + 60, 476, "magenta", arrow=False))
    b.append(pill(772, 476, "✓ yes: keep (ties too)", GREEN_T, GREEN))
    b.append(pill(772, 508, "✗ no: restore", RED_T, RED))
    b.append(P("M772,488 H118 V462", "magenta"))
    b.append(P("M772,520 H750 V488", "magenta", arrow=False))
    b.append(T(400, 506, "next step", 12.5, 600, fill=INK2, anchor="middle"))
    b.append(lines(46, 572, ["Only endpoints touching the 2 caches can change, so S is computed locally (no full re-score). "
                             "Keeping ties lets the search drift across plateaus.",
                             "k = 2 beat k = 4 and k = 8 (smaller groups → more steps per second). At the end: one full "
                             "re-pack sweep over every cache."], 12.5, lh=20, fill=INK2))
    save("10-lns.svg", 960, 624, "How the Large Neighbourhood Search works", b)


# ------------------------------------------------------------------ 11 MILP

def fig_milp():
    b = heading("The exact model (exact.py, HiGHS)", "Built on the example: only pairs that can save something "
                "become variables.", stage=EXACT)
    reqs = [("r0 · (e0, v3) × 1500", 150, "v3"), ("r3 · (e0, v1) × 1000", 290, "v1")]
    caches = [("c0", 100, 108), ("c2", 200, 208), ("c1", 300, 308)]
    for lab, y, _ in reqs:
        b.append(node(36, y - 24, 190, 48, lab.split(" · ")[0], [lab.split(" · ")[1]], ORANGE_T, ORANGE,
                      size=13, sub_size=12))
    for name, lat, y in caches:
        b.append(R(380, y - 18, 120, 90, BLUE_T, BLUE, rx=8))
    # x chips, stacked so each y edge reaches its chip without crossing the other one
    pos = {}
    for name, lat, y in caches:
        b.append(T(440, y, f"{name} · {lat} ms", 12.5, 700, anchor="middle"))
        for j, v in enumerate(["v3", "v1"]):
            cy = y + 10 + j * 30
            b.append(R(392, cy, 96, 24, YEL_T, YELLOW, rx=6, sw=1.2))
            b.append(T(440, cy + 16, f"x[{name}, {v}]", 11.5, 700, anchor="middle"))
            pos[(name, v)] = (392, cy + 12)
    for lab, y, v in reqs:
        for name, lat, _ in caches:
            px, py = pos[(name, v)]
            b.append(L(226, y, px - 2, py, "ink", sw=1.2))
    b.append(T(36, 96, "each line: “this cache could serve this request”", 12, 600, fill=INK2))
    b.append(lines(36, 368, ["r1 (e1, v0): no faster cache → no variable.", "r2 (e0, v4): too big → no variable."],
                   12, lh=17, fill=INK2))

    x0 = 540
    b.append(R(x0, 84, 392, 196, YEL_T, YELLOW, rx=10))
    b.append(T(x0 + 16, 108, "The choices", 13, 700))
    b.append(lines(x0 + 16, 128, ["x: copy this video into this cache, yes or no?",
                                  "y: which cache serves this request?"], 12.5, lh=18))
    b.append(T(x0 + 16, 176, "The goal", 13, 700))
    b.append(T(x0 + 16, 196, "as much time saved as possible, in total", 12.5))
    b.append(T(x0 + 16, 224, "The rules", 13, 700))
    b.append(lines(x0 + 16, 244, ["a request is served once, only by a cache that", "holds the video; no cache over its size"],
                   12.5, lh=18))
    b.append(lines(x0, 310, ["Used when y ≤ 50,000 (solve.py):",
                             "• me_at_the_zoo: 261 y → proven optimum 516,557 in 3 s",
                             "• small class instances: proven optimum in < 1 s",
                             "• videos_worth_spreading: 211k y → too slow, but proves",
                             "  that no answer can beat 620,009 (an upper bound)"], 12.5, lh=20))
    save("11-milp.svg", 960, 420, "The exact mixed-integer model", b)


# ------------------------------------------------------------------ 12 score chart

def fig_scores():
    b = heading("What each stage is worth", "Scores from PIPELINE.md. Each panel has its own axis; "
                "the score never goes down from one step to the next.")

    def panel(x, y, w, h, title, pts, lo, hi, step, ref, ref_label):
        out = [T(x, y, title, 14, 700)]
        px0, px1, py0, py1 = x + 60, x + w - 20, y + 30, y + h - 46
        def sy(v):
            return py1 - (v - lo) / (hi - lo) * (py1 - py0)
        v = lo
        while v <= hi:
            yy = round(sy(v), 1)
            out.append(L(px0, yy, px1, yy, GRID, sw=1, arrow=False))
            out.append(T(px0 - 8, yy + 4, f"{v // 1000}K", 11.5, fill=MUTED, anchor="end"))
            v += step
        ry = round(sy(ref), 1)
        out.append(L(px0, ry, px1, ry, INK2, sw=1, arrow=False))
        out.append(T(px0 + 6, ry - 6, ref_label, 11.5, 600, fill=INK2))
        n = len(pts)
        xs = [px0 + 30 + i * (px1 - px0 - 60) / (n - 1) for i in range(n)]
        d = " ".join(f"{'M' if i == 0 else 'L'}{xs[i]:.1f},{sy(p[1]):.1f}" for i, p in enumerate(pts))
        out.append(f'<path d="{d}" fill="none" stroke="{BLUE}" stroke-width="2" stroke-linejoin="round" '
                   f'stroke-linecap="round"/>')
        for i, (lab, val) in enumerate(pts):
            cx, cy = xs[i], sy(val)
            out.append(f'<g><title>{escape(lab)}: {val:,}</title><circle cx="{cx:.1f}" cy="{cy:.1f}" r="12" '
                       f'fill="transparent"/><circle cx="{cx:.1f}" cy="{cy:.1f}" r="5" fill="{BLUE}" '
                       f'stroke="{SURF}" stroke-width="2"/></g>')
            out.append(T(round(cx), py1 + 20, lab.split("|")[0], 11.5, 600, fill=INK2, anchor="middle"))
            if "|" in lab:
                out.append(T(round(cx), py1 + 35, lab.split("|")[1], 11.5, fill=MUTED, anchor="middle"))
            if i == 0:
                out.append(T(round(cx), round(cy) + 22, f"{val:,}", 12.5, 700, anchor="middle"))
            elif i == n - 1:
                out.append(T(round(cx) - 10, round(cy) - 10, f"{val:,}", 12.5, 700, anchor="end"))
        return out

    b += panel(36, 100, 520, 330, "videos_worth_spreading",
               [("Greedy", 609385), ("Re-pack", 610505), ("LNS|60 s", 612727), ("LNS|180 s", 613548),
                ("LNS|480 s", 613851)], 606000, 622000, 4000, 620009, "proven upper bound 620,009")
    b += panel(580, 100, 352, 330, "me_at_the_zoo",
               [("Greedy", 507906), ("Re-pack", 512115), ("Exact", 516557)], 504000, 520000, 4000, 516557,
               "proven optimum")
    b.append(lines(36, 466, ["Big gains come early; LNS keeps adding slowly with more time. The exact model either "
                             "solves the data set (zoo)", "or bounds how much is left to win (videos: at most 6,158 "
                             "more points)."], 12.5, lh=19, fill=INK2))
    save("12-scores.svg", 960, 510, "Score after each stage on two data sets", b)


# ------------------------------------------------------------------ 13 summary

def fig_summary():
    b = heading("How much each stage may change at once",
                "Bigger neighbourhoods escape more local optima, but cost more per step.")
    cols = [("Greedy", GREEDY[1], GREEDY[2], "pair", "one (cache, video)", "no: rule of thumb", "13 s on kittens"),
            ("Re-pack", REPACK[1], REPACK[2], "cache", "one whole cache", "yes, others fixed", "+5 s on kittens"),
            ("LNS", LNS[1], LNS[2], "two", "two linked caches", "yes, others fixed", "the whole time budget"),
            ("Exact MILP", EXACT[1], EXACT[2], "all", "everything", "yes, globally", "seconds (small) to hours")]
    w, gap = 208, 24
    for i, (name, fill, stroke, scope, what, exact, t) in enumerate(cols):
        x = 28 + i * (w + gap)
        b.append(R(x, 84, w, 300, SURF, GRID, rx=12))
        b.append(pill(x + w / 2, 98, name, fill, stroke, size=13, anchor="middle"))
        # 3x4 grid of caches, each with 3 slots
        gx, gy = x + 26, 140
        for r in range(3):
            for c in range(4):
                cx, cy = gx + c * 40, gy + r * 40
                on_cache = (scope == "cache" and (r, c) == (1, 1)) or (scope == "two" and (r, c) in
                                                                        {(1, 1), (1, 2)}) or scope == "all"
                b.append(R(cx, cy, 34, 34, fill if on_cache else GRAY_T, stroke if on_cache else "#d6d5cf", rx=5,
                           sw=1.5 if on_cache else 1))
                for s in range(3):
                    on = on_cache or (scope == "pair" and (r, c, s) == (1, 1, 0))
                    b.append(R(cx + 5, cy + 5 + s * 9, 24, 6, stroke if on else "#d6d5cf", None, rx=2))
        b.append(T(x + w / 2, 284, what, 13, 700, anchor="middle"))
        b.append(T(x + w / 2, 306, "exact? " + exact, 12.5, fill=INK2, anchor="middle"))
        b.append(T(x + w / 2, 326, "time: " + t, 12.5, fill=INK2, anchor="middle"))
    b.append(L(60, 404, 900, 404, "ink", sw=1.5))
    b.append(T(480, 426, "wider change per step · more exact · more expensive", 12.5, 600, fill=INK2,
               anchor="middle"))
    b.append(T(480, 456, "Build fast, improve with exact sub-problems, and solve exactly whatever is small enough.",
               14, 700, anchor="middle"))
    save("13-summary.svg", 960, 482, "Comparison of how much each stage changes", b)


# ------------------------------------------------------------------ 14-15 the last commit (d4abaea)

COMMIT = ("LAST COMMIT · d4abaea", GRAY_T, INK2)


def fig_commit_gcd():
    b = heading("Faster knapsack: count in 10 MB blocks, not 1 MB",
                "Example cache of 100 MB, videos of 50, 50, 80 and 30 MB. Every size is a multiple of 10.",
                stage=COMMIT)
    names = ["v0", "v1", "v2", "v3"]

    def grid(x, y, cols, cw, label, sizes, cap):
        out = [T(x, y - 14, label, 14, 700)]
        for i, n in enumerate(names):
            out.append(T(x - 10, y + i * 22 + 15, f"{n} · {sizes[i]}", 12, 600, fill=INK2, anchor="end"))
            for c in range(cols):
                out.append(R(round(x + c * cw, 2), y + i * 22, max(cw - 1, 1.5), 20, BLUE_T, None, rx=0))
        out.append(T(x, y + 4 * 22 + 16, "0", 11.5, fill=MUTED))
        out.append(T(round(x + cols * cw), y + 4 * 22 + 16, cap, 11.5, fill=MUTED, anchor="end"))
        return out

    b += grid(140, 112, 101, 6, "Before: one column per MB", [50, 50, 80, 30], "100 MB")
    b.append(T(760, 152, "4 × 101 = 404 cells", 15, 700))
    b.append(T(760, 174, "to fill and remember", 12.5, fill=INK2))
    b.append(T(480, 256, "↓  divide every size and the capacity by 10, their gcd (the biggest number that divides "
               "them all)  ↓", 13, 600, fill=INK2, anchor="middle"))
    b += grid(140, 306, 11, 36, "After: one column per 10 MB block", [5, 5, 8, 3], "10 blocks")
    b.append(T(760, 346, "4 × 11 = 44 cells", 15, 700, fill=GREEN))
    b.append(T(760, 368, "same answer, 9× less work", 12.5, fill=INK2))
    b.append(R(28, 430, 904, 66, GRAY_T, None, rx=10))
    b.append(lines(46, 456, ["Why the answer is the same: with sizes that are all multiples of 10, a used amount like "
                             "37 MB can never happen, so those columns were wasted.",
                             "The commit message reports up to 5000× faster on data sets where every video has the "
                             "same size."], 12.5, lh=20))
    save("14-commit-gcd.svg", 960, 516, "The gcd trick added to the knapsack", b)


def fig_commit_annealing():
    b = heading("Optional: allow steps backwards (simulated annealing)",
                "Two new switches. Both are off by default, so solve.py and the runner behave exactly as before.",
                stage=COMMIT)
    # panel A: --temp
    b.append(R(28, 84, 440, 392, SURF, GRID, rx=12))
    b.append(T(46, 110, "--temp T: sometimes keep a worse result", 15, 700))
    b.append(T(46, 130, "used by LNS and by --moves", 12, fill=INK2))
    px0, px1, py0, py1 = 90, 430, 154, 290
    b.append(L(px0, py1, px1, py1, GRID, sw=1, arrow=False))
    b.append(L(px0, py0, px0, py1, GRID, sw=1, arrow=False))
    b.append(f'<path d="M{px0},{py0} L{px1},{py1}" fill="none" stroke="{MAGENTA}" stroke-width="2"/>')
    b.append(T(px0 - 8, py0 + 4, "T", 12, 700, fill=INK2, anchor="end"))
    b.append(T(px0 - 8, py1 + 4, "0", 12, 700, fill=INK2, anchor="end"))
    b.append(T(px0, py1 + 18, "start", 12, fill=MUTED))
    b.append(T(px1, py1 + 18, "end of the time budget", 12, fill=MUTED, anchor="end"))
    b.append(T(54, 226, "temp.", 12, fill=MUTED, anchor="middle"))
    b.append(lines(px0 + 120, py0 + 8, ["early: bad steps often kept,", "so it can climb out of a dead end"], 12,
                   lh=16, fill=INK2))
    b.append(lines(px0 + 214, py0 + 62, ["late: almost never kept,", "so it settles"], 12, lh=16, fill=INK2))
    b.append(T(46, 340, "How likely is a worse result kept? (with --temp 1)", 12.5, 700))
    rows = [("at the start, 1 point worse", "37 %"), ("at the start, 3 points worse", "5 %"), ("near the end", "almost never")]
    for i, (a, p) in enumerate(rows):
        y = 364 + i * 22
        b.append(T(60, y, a, 12.5))
        b.append(T(300, y, p, 12.5, 700, anchor="end"))
    b.append(T(46, 450, "The best layout seen is saved and put back at the end.", 12.5, 600, fill=GREEN))

    # panel B: --moves
    b.append(R(492, 84, 440, 392, SURF, GRID, rx=12))
    b.append(T(510, 110, "--moves S: tiny moves, tried very fast", 15, 700))
    b.append(T(510, 130, "after the re-pack, for S seconds", 12, fill=INK2))

    def cache(x, y, name, vid, hi=False):
        return node(x, y, 74, 46, name, [f"holds {vid}"], MAG_T if hi else BLUE_T, MAGENTA if hi else BLUE,
                    size=13, sub_size=12)

    b.append(T(510, 160, "Swap: two caches that share users trade videos", 12.5, 600))
    b.append(cache(516, 172, "C1", "a"))
    b.append(cache(600, 172, "C2", "b"))
    b.append(L(684, 195, 738, 195, "magenta", sw=2))
    b.append(cache(746, 172, "C1", "b", True))
    b.append(cache(830, 172, "C2", "a", True))
    b.append(T(510, 254, "Replace: a cache swaps one video for one its users ask for", 12.5, 600))
    b.append(cache(516, 266, "C", "a"))
    b.append(L(600, 289, 654, 289, "magenta", sw=2))
    b.append(cache(662, 266, "C", "b", True))
    b.append(T(748, 286, "(or just add b", 12, fill=INK2))
    b.append(T(748, 302, "if it already fits)", 12, fill=INK2))
    b.append(lines(510, 350, ["Why it is fast: only requests for a and b can change,",
                              "so the score change is computed from those two videos",
                              "only. Each move is tiny, so many more of them fit in",
                              "the same time than LNS steps.",
                              "Kept if not worse, or by the --temp rule on the left."], 12.5, lh=19, fill=INK2))

    b.append(R(28, 490, 904, 58, GRAY_T, None, rx=10))
    b.append(T(46, 514, "Try it:  solver in.in out.out --lns 300 --temp 1     or     solver in.in out.out --moves 300 "
               "--temp 1", 12.5, 600, mono=True))
    b.append(T(46, 536, "The right temperature differs per data set (PIPELINE.md), which is why it stays opt-in.",
               12.5, fill=INK2))
    save("15-commit-annealing.svg", 960, 568, "The annealing options added by the last commit", b)


if __name__ == "__main__":
    for f in [fig_problem, fig_overview, fig_bookkeeping, fig_greedy_round, fig_heap_trace, fig_evict, fig_swap,
              fig_ratio_trap, fig_repack_value, fig_repack_steps, fig_knapsack, fig_lns, fig_milp, fig_scores, fig_summary,
              fig_commit_gcd, fig_commit_annealing]:
        f()
    print("diagrams written to", HERE)
