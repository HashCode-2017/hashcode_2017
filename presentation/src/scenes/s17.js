// 17 · Backup: why each step is correct (whiteboard-ready arguments)
import { html } from '../engines/dom.js';

const CARDS = [
  ['Why the lazy heap is right', 'Adding a copy can only lower the other pairs\' gains, never raise them. So a value stored in the heap is an upper bound. When the top pair is re-scored and is unchanged, nothing below can beat it: placing it is exactly the "best now" choice.', 'gacc'],
  ['Why re-pack is an exact knapsack', 'Freeze every other cache. For a request, the best latency from elsewhere is then fixed, so the saving of video v in cache c is a fixed number g(v). Different videos in one cache do not interact. Maximise Σ g(v) under Σ size ≤ X: a 0/1 knapsack, solved exactly by DP.', 'cacc'],
  ['Why eviction never lowers the score', 'A copy is removed only if every endpoint of that cache asking for the video already gets it at least as fast from another cache (or the data center). No request changes latency, so the score is identical right after the sweep.', 'accent'],
  ['Why LNS never lowers the score', 'It remembers the old contents and the saving S of every endpoint touching the emptied caches. Only those endpoints can change. It keeps the rebuild only if the new saving ≥ S, otherwise it puts the old contents back.', 'pacc'],
  ['Where the ceiling comes from', 'Branch and bound solves relaxations of the integer program. Any relaxed optimum is ≥ the true optimum, so the best bound found is a ceiling no submission can pass: 620,009 on videos_worth_spreading.', 'dcacc'],
  ['Why the problem is NP-hard', 'With one cache and one endpoint, it is exactly a 0/1 knapsack (sizes = weights, savings = values). With many caches sharing endpoints it also contains facility location.', 'facc'],
];

export default {
  id: 's17', title: 'Backup · Why each step is safe', part: 'Q', source: 'PIPELINE.md §1–§4 · SOLUTION.md §3', steps: 1, minutes: 0,
  mount(root, ctx) {
    this.root = root; ctx.net?.show(false);
    root.innerHTML = html`<div class="area"><div class="cards" style="grid-template-columns:repeat(3,1fr);grid-template-rows:1fr 1fr;height:100%">
      ${CARDS.map(([t, d, c]) => `<div class="card ${c}"><h3 style="font-size:28px">${t}</h3><p class="body" style="font-size:22px">${d}</p></div>`)}
    </div></div>`;
  },
  step() {},
  unmount() {},
};
