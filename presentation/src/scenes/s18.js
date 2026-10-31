// 18 · Backup: the cost of each step
import { html, fmt } from '../engines/dom.js';
import { GOOGLE } from '../content/facts.js';

const ROWS = [
  ['Read and index', 'O(V + E + L + R)', 'one pass builds: requests per endpoint, endpoints per cache, requesters per video'],
  ['Greedy fill (per round)', 'O(W + (H + U)(log H + r<sub>max</sub>))', 'score each (cache, video) pair once; each pop re-scores one pair'],
  ['Swap (per round)', 'O(Σ<sub>c</sub> (1 + S<sub>c</sub>) W<sub>c</sub> K<sub>max</sub>)', 'per cache, once plus once after each swap (≤ 50)'],
  ['Re-pack one cache', 'O(W<sub>c</sub> + m log m + m·X)', 'gains, pick m candidates, DP (bitset: m·X/64 words)'],
  ['LNS step (k = 2)', 'O(k · sweeps · (W<sub>c</sub> + m·X))', 'only endpoints touching the k caches are re-scored'],
  ['Exact solver', 'exponential (worst case)', 'branch and bound; seconds when ≤ 10,000 variables'],
];

export default {
  id: 's18', title: 'Backup · Cost of each step', part: 'Q', source: 'README.md · Complexity · PIPELINE.md §1–§4', steps: 1, minutes: 0,
  mount(root, ctx) {
    this.root = root; ctx.net?.show(false);
    root.innerHTML = html`<div class="area">
      <table class="tbl"><tr><th>Step</th><th>Time</th><th>Why</th></tr>${ROWS.map(r => `<tr><td><b>${r[0]}</b></td><td class="math" style="font-size:25px">${r[1]}</td><td style="font-size:20px">${r[2]}</td></tr>`)}</table>
      <div style="display:grid;grid-template-columns:1.1fr 1fr;gap:40px;margin-top:28px">
        <div class="card"><h3 style="font-size:24px">Symbols</h3><p class="small" style="color:var(--ink-2);font-size:19px;line-height:1.55">V, E, R, C, X: videos, endpoints, request lines, caches, cache MB · L: endpoint–cache links · K<sub>max</sub>: most links of one endpoint · W = Σ<sub>e</sub> K<sub>e</sub>·Q<sub>e</sub>: (cache, endpoint, requested video) triples · H: pairs in the heap · U: pushes back · r<sub>v</sub>: endpoints asking for v · m: knapsack candidates (≈ 500)</p></div>
        <table class="tbl" style="font-size:19px"><tr><th>Data set</th><th class="n">V</th><th class="n">E</th><th class="n">R</th><th class="n">C</th></tr>${GOOGLE.sizes.map(s => `<tr><td class="mono">${s.name}</td><td class="n">${fmt(s.V)}</td><td class="n">${fmt(s.E)}</td><td class="n">${fmt(s.R)}</td><td class="n">${fmt(s.C)}</td></tr>`)}</table>
      </div></div>`;
  },
  step() {},
  unmount() {},
};
