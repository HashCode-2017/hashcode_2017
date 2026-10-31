// 13 · Code: the implementation choices that make the final submission fast and safe
import { html, revealSteps, fmt } from '../engines/dom.js';
import { CODE } from '../content/facts.js';

const P = CODE.port;
const CARDS = [
  ['Python first, then C++', `Same moves in both: identical scores on the ${P.identicalGoogle} Google data sets and ${P.identicalEval} of ${P.evalTotal} class ones (the last differs by 1 point, a tie). Kittens: ${P.kittensPython} s → ${P.kittensCpp} s.`, 'accent'],
  ['Only look at real demand', 'A cache only scores the videos its own endpoints request. The work grows with links × requests, never with videos × caches.', 'cacc'],
  ['Lazy max-heap', 'Gains only ever go down, so a stored value is an upper bound. Only the pair on top is re-scored: placed if unchanged, pushed back otherwise.', 'gacc'],
  ['Best and second-best latency', 'Stored per request, with which cache gives the best. "Fastest from another cache" is then a constant-time lookup during re-pack.', 'dcacc'],
  ['Bitset knapsack, sizes ÷ gcd', `About ${CODE.repackCandidates.byRatio + CODE.repackCandidates.byGain} candidates per cache; one bit per (video, MB) cell. Dividing sizes and capacity by their gcd gives the same answer, up to ${fmt(CODE.gcdSpeedup)}× faster on equal-size data sets.`, 'gacc'],
  ['Always a valid answer', `The first greedy round always completes; every later step stops on time. A ${CODE.timeLimitCheck.limit} s limit stopped at ${CODE.timeLimitCheck.stoppedAt} s on a data set near the official limits.`, 'pacc'],
  ['Trust nothing', 'Every .out is re-scored by an independent scorer and every cache capacity is checked before it can be submitted.', 'facc'],
  ['Last round of tuning', 'Added with our 2nd local-contest submission: extra moves that swap two videos between neighbouring caches or replace one, with optional annealing. Off by default.', 'accent'],
];

export default {
  id: 's13', title: 'Implementation choices', part: 'E', source: 'PIPELINE.md §1–§2, §6 · solver.cpp · git log (19 Oct)', steps: 4, minutes: 1.5,
  mount(root, ctx) {
    this.root = root; ctx.net?.show(false);
    root.innerHTML = html`<div class="area"><div class="cards" style="grid-template-columns:repeat(4,1fr);grid-template-rows:1fr 1fr;height:100%">
      ${CARDS.map(([t, d, c], i) => `<div class="card ${c}" data-step="${Math.floor(i / 2)}"><h3 style="font-size:28px">${t}</h3><p class="body" style="font-size:23px">${d}</p></div>`)}
    </div></div>`;
  },
  step(n, { instant } = {}) { revealSteps(this.root, n, instant); },
  unmount() {},
};
