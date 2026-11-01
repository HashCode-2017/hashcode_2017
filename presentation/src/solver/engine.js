// The live solver used on stage. Same steps as our submission (greedy -> exact re-pack -> LNS, exact
// optimum for tiny cases), written small enough to run in the browser on the examples of the talk.
// Pure functions, no DOM: the same file runs in the browser and in `npm test`.

// ------------------------------------------------------------------ input
export function parse(text) {
  const t = text.trim().split(/\s+/).map(Number);
  let i = 0;
  const [V, E, R, C, X] = t.slice(0, 5); i = 5;
  const sizes = t.slice(i, i + V); i += V;
  const ld = [], links = [];
  for (let e = 0; e < E; e++) {
    ld.push(t[i]); const K = t[i + 1]; i += 2;
    const l = [];
    for (let k = 0; k < K; k++) { l.push([t[i], t[i + 1]]); i += 2; }
    links.push(l);
  }
  const agg = new Map();
  for (let r = 0; r < R; r++) {
    const v = t[i], e = t[i + 1], n = t[i + 2]; i += 3;
    const key = e * V + v; agg.set(key, (agg.get(key) || 0) + n);
  }
  const requests = [...agg].map(([key, n]) => ({ e: Math.floor(key / V), v: key % V, n }));
  return build({ V, E, C, X, sizes, ld, links, requests });
}

// derived indexes shared by every step
export function build({ V, E, C, X, sizes, ld, links, requests }) {
  const lat = links.map(l => new Map(l));                         // lat[e].get(c)
  const cacheEndpoints = Array.from({ length: C }, () => []);     // c -> [[e, lat]]
  links.forEach((l, e) => l.forEach(([c, L]) => cacheEndpoints[c].push([e, L])));
  const byEndpoint = Array.from({ length: E }, () => []);         // e -> [{v, n}]
  for (const r of requests) byEndpoint[r.e].push(r);
  const total = requests.reduce((s, r) => s + r.n, 0);
  return { V, E, C, X, sizes, ld, links, lat, cacheEndpoints, byEndpoint, requests, total };
}

export const emptyPlacement = inst => Array.from({ length: inst.C }, () => new Set());
export const clonePlacement = p => p.map(s => new Set(s));
export const used = (inst, set) => [...set].reduce((s, v) => s + inst.sizes[v], 0);

// ------------------------------------------------------------------ score (the statement's formula)
export function bestLatency(inst, placed, e, v, skip = -1) {
  let best = inst.ld[e];
  for (const [c, L] of inst.links[e]) if (c !== skip && L < best && placed[c].has(v)) best = L;
  return best;
}
export function saved(inst, placed) {
  let s = 0;
  for (const r of inst.requests) s += r.n * (inst.ld[r.e] - bestLatency(inst, placed, r.e, r.v));
  return s;
}
export function score(inst, placed) {
  return inst.total ? Math.floor(saved(inst, placed) * 1000 / inst.total) : 0;
}
export const valid = (inst, placed) => placed.every(s => used(inst, s) <= inst.X);

// gain of adding v to c, given what is placed now
export function gain(inst, placed, c, v) {
  let g = 0;
  for (const [e, L] of inst.cacheEndpoints[c]) {
    for (const r of inst.byEndpoint[e]) if (r.v === v) g += r.n * Math.max(0, bestLatency(inst, placed, e, v) - L);
  }
  return g;
}
// value of the copy of v held by c: what is lost if it is removed
export function copyValue(inst, placed, c, v) {
  let g = 0;
  for (const [e, L] of inst.cacheEndpoints[c]) {
    for (const r of inst.byEndpoint[e]) if (r.v === v) g += r.n * Math.max(0, bestLatency(inst, placed, e, v, c) - L);
  }
  return g;
}
const candidates = (inst, c) => {
  const s = new Set();
  for (const [e] of inst.cacheEndpoints[c]) for (const r of inst.byEndpoint[e]) s.add(r.v);
  return [...s].sort((a, b) => a - b);
};

// ------------------------------------------------------------------ step 1: greedy (global lazy max-heap, then evict, then swap)
// Returns the placement and, for the stage, every pop of the first round with its decision.
export function greedy(inst, { rounds = 5, evict = true, swap = true } = {}) {
  const placed = emptyPlacement(inst);
  const trace = { queue: [], pops: [], rounds: [] };
  for (let round = 0; round < rounds; round++) {
    const heap = [];
    for (let c = 0; c < inst.C; c++) {
      for (const v of candidates(inst, c)) {
        if (placed[c].has(v) || inst.sizes[v] > inst.X) continue;
        const g = gain(inst, placed, c, v);
        if (g > 0) heap.push({ c, v, g, key: g / inst.sizes[v] });
      }
    }
    const order = (a, b) => b.key - a.key || a.c - b.c || a.v - b.v;
    heap.sort(order);
    if (round === 0) trace.queue = heap.map(h => ({ ...h }));
    let placedNow = 0;
    while (heap.length) {
      const top = heap.shift();
      const room = inst.X - used(inst, placed[top.c]);
      const g = gain(inst, placed, top.c, top.v);
      let decision;
      if (inst.sizes[top.v] > room) decision = 'nofit';
      else if (g <= 0) decision = 'drop';
      else if (g < top.g) { decision = 'requeue'; const n = { ...top, g, key: g / inst.sizes[top.v] }; heap.push(n); heap.sort(order); }
      else { decision = 'place'; placed[top.c].add(top.v); placedNow++; }
      if (round === 0) trace.pops.push({ c: top.c, v: top.v, key: top.key, stored: top.g, now: g, decision, score: score(inst, placed) });
    }
    let evicted = 0, swaps = 0;
    if (evict) evicted = evictDominated(inst, placed);
    if (swap) swaps = swapPass(inst, placed);
    trace.rounds.push({ placed: placedNow, evicted, swaps, score: score(inst, placed) });
    if (!placedNow && !evicted && !swaps) break;
  }
  return { placed, trace, score: score(inst, placed) };
}

// remove copies that save nothing: every endpoint of c asking for v already has it as fast elsewhere
export function evictDominated(inst, placed) {
  let n = 0;
  for (let c = 0; c < inst.C; c++) {
    for (const v of [...placed[c]]) if (copyValue(inst, placed, c, v) === 0) { placed[c].delete(v); n++; }
  }
  return n;
}

// trade the weakest copy (value per MB) for a better outside video, while it strictly helps
export function swapPass(inst, placed, { maxSwaps = 50, top = 20 } = {}) {
  let total = 0;
  for (let c = 0; c < inst.C; c++) {
    for (let s = 0; s < maxSwaps; s++) {
      const held = [...placed[c]].map(v => ({ v, val: copyValue(inst, placed, c, v) })).sort((a, b) => a.val / inst.sizes[a.v] - b.val / inst.sizes[b.v]);
      if (!held.length) break;
      const weak = held[0];
      const room = inst.X - used(inst, placed[c]) + inst.sizes[weak.v];
      placed[c].delete(weak.v);
      const outs = candidates(inst, c).filter(v => !placed[c].has(v) && v !== weak.v && inst.sizes[v] <= room)
        .map(v => ({ v, g: gain(inst, placed, c, v) })).sort((a, b) => b.g - a.g).slice(0, top);
      const best = outs[0];
      if (best && best.g - weak.val > 0) { placed[c].add(best.v); total++; }
      else { placed[c].add(weak.v); break; }
    }
  }
  return total;
}

// ------------------------------------------------------------------ step 2: exact 0/1 knapsack (dynamic programming)
// items: [{v, w, val}] -> best value and chosen items; `table` is kept for the stage when asked.
export function knapsack(items, cap, { keepTable = false } = {}) {
  const n = items.length;
  const T = Array.from({ length: n + 1 }, () => new Float64Array(cap + 1));
  for (let i = 1; i <= n; i++) {
    const { w, val } = items[i - 1];
    for (let x = 0; x <= cap; x++) {
      T[i][x] = T[i - 1][x];
      if (w <= x && T[i - 1][x - w] + val > T[i][x]) T[i][x] = T[i - 1][x - w] + val;
    }
  }
  const chosen = [];
  for (let i = n, x = cap; i > 0; i--) if (T[i][x] !== T[i - 1][x]) { chosen.push(items[i - 1]); x -= items[i - 1].w; }
  return { best: T[n][cap], chosen: chosen.reverse(), table: keepTable ? T.map(r => [...r]) : null };
}

// greedy by ratio on the same items (what the knapsack beats)
export function ratioFill(items, cap) {
  let room = cap, best = 0; const chosen = [];
  for (const it of [...items].sort((a, b) => b.val / b.w - a.val / a.w)) if (it.w <= room) { chosen.push(it); room -= it.w; best += it.val; }
  return { best, chosen };
}

// freeze every other cache: the value of each video in c is a fixed number -> exact knapsack for c
export function repackCache(inst, placed, c) {
  const items = candidates(inst, c).filter(v => inst.sizes[v] <= inst.X).map(v => {
    let val = 0;
    for (const [e, L] of inst.cacheEndpoints[c]) for (const r of inst.byEndpoint[e]) if (r.v === v) val += r.n * Math.max(0, bestLatency(inst, placed, e, v, c) - L);
    return { v, w: inst.sizes[v], val };
  }).filter(it => it.val > 0);
  const now = items.filter(it => placed[c].has(it.v)).reduce((s, it) => s + it.val, 0);
  const { best, chosen } = knapsack(items, inst.X);
  if (best > now) { placed[c] = new Set(chosen.map(it => it.v)); return true; }
  return false;
}

export function repack(inst, placed, order = null) {
  let passes = 0, changed = true;
  while (changed && passes < 50) {
    changed = false; passes++;
    for (const c of order || [...Array(inst.C).keys()]) if (repackCache(inst, placed, c)) changed = true;
  }
  return { passes, score: score(inst, placed) };
}

// ------------------------------------------------------------------ step 3: Large Neighbourhood Search
export function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export function lnsStep(inst, placed, rand, k = 2) {
  const linked = [...Array(inst.C).keys()].filter(c => inst.cacheEndpoints[c].length);
  if (!linked.length) return null;
  const group = [linked[Math.floor(rand() * linked.length)]];
  for (let tries = 0; group.length < k && tries < 20; tries++) {
    const from = group[Math.floor(rand() * group.length)];
    const eps = inst.cacheEndpoints[from];
    const [e] = eps[Math.floor(rand() * eps.length)];
    const l = inst.links[e];
    const [c2] = l[Math.floor(rand() * l.length)];
    if (!group.includes(c2)) group.push(c2);
  }
  const before = saved(inst, placed);
  const keep = group.map(c => placed[c]);
  group.forEach(c => { placed[c] = new Set(); });
  const order = [...group].sort(() => rand() - 0.5);
  repack(inst, placed, order);
  const after = saved(inst, placed);
  if (after >= before) return { group, order, before, after, kept: true };
  group.forEach((c, i) => { placed[c] = keep[i]; });
  return { group, order, before, after, kept: false };
}

export function lns(inst, placed, { steps = 200, seed = 7, k = 2 } = {}) {
  const rand = rng(seed); const log = [];
  for (let i = 0; i < steps; i++) {
    const st = lnsStep(inst, placed, rand, k);
    if (!st) break;
    if (st.after > st.before) log.push({ i, ...st, score: score(inst, placed) });
  }
  return { log, score: score(inst, placed) };
}

// ------------------------------------------------------------------ step 4: exact optimum for tiny instances (exhaustive)
// The submission uses an integer program (HiGHS); for the stage's tiny examples, trying every packing is enough.
export function optimum(inst, limit = 400000) {
  const options = [];
  let combos = 1;
  for (let c = 0; c < inst.C; c++) {
    const cand = candidates(inst, c).filter(v => inst.sizes[v] <= inst.X);
    const subs = [];
    const rec = (i, set, w) => {
      if (i === cand.length) { subs.push(new Set(set)); return; }
      rec(i + 1, set, w);
      const v = cand[i];
      if (w + inst.sizes[v] <= inst.X) { set.push(v); rec(i + 1, set, w + inst.sizes[v]); set.pop(); }
    };
    rec(0, [], 0);
    options.push(subs);
    combos *= subs.length;
    if (combos > limit) return null;
  }
  let best = -1, bestP = null;
  const cur = emptyPlacement(inst);
  const walk = c => {
    if (c === inst.C) { const s = saved(inst, cur); if (s > best) { best = s; bestP = clonePlacement(cur); } return; }
    for (const s of options[c]) { cur[c] = s; walk(c + 1); }
  };
  walk(0);
  return { placed: bestP, score: score(inst, bestP), combos };
}

// ------------------------------------------------------------------ random small instances for the playground
export function randomInstance({ V = 8, E = 3, C = 3, X = 100, skew = 1.2, seed = 1, sizeMin = 10, sizeMax = 60 } = {}) {
  const r = rng(seed);
  const sizes = Array.from({ length: V }, () => sizeMin + Math.floor(r() * (sizeMax - sizeMin + 1)));
  const ld = [], links = [];
  for (let e = 0; e < E; e++) {
    const L = 400 + Math.floor(r() * 7) * 100; ld.push(L);
    const l = [];
    for (let c = 0; c < C; c++) if (r() < 0.75) l.push([c, 50 + Math.floor(r() * ((L - 100) / 50)) * 50]);
    links.push(l);
  }
  const requests = [];
  for (let e = 0; e < E; e++) for (let v = 0; v < V; v++) {
    const w = 1 / Math.pow(v + 1, skew);
    if (r() < 0.65) requests.push({ e, v, n: Math.max(1, Math.round(1000 * w * (0.5 + r()))) });
  }
  return build({ V, E, C, X, sizes, ld, links, requests });
}

export function toText(inst) {
  const lines = [`${inst.V} ${inst.E} ${inst.requests.length} ${inst.C} ${inst.X}`, inst.sizes.join(' ')];
  inst.links.forEach((l, e) => { lines.push(`${inst.ld[e]} ${l.length}`); l.forEach(([c, L]) => lines.push(`${c} ${L}`)); });
  inst.requests.forEach(r => lines.push(`${r.v} ${r.e} ${r.n}`));
  return lines.join('\n') + '\n';
}
