// 14 · Since our last presentation: what we said we would do, and what we did
import { html, revealSteps, fmt } from '../engines/dom.js';
import { LAST_TIME, PIPELINE } from '../content/facts.js';
import { SHEET } from '../content/tables.js';
import { contestStats } from './s08.js';

export default {
  id: 's14', title: 'Since our last presentation', part: 'F', source: 'Previous presentation (slides 8–10) · class sheet · local contest', steps: 5, minutes: 1.0,
  mount(root, ctx) {
    this.root = root; ctx.net?.show(false);
    const S = contestStats();
    const groups = Object.keys(SHEET.classTotals).length;
    root.innerHTML = html`
      <div class="area">
        <div style="display:flex;gap:70px;align-items:flex-end">
          <div class="stat"><span class="eyebrow">Last time</span><span class="big-num c-mute" style="font-size:64px">${LAST_TIME.rank}</span><span class="lbl">${fmt(LAST_TIME.total)} on the Google data sets · Python greedy only</span></div>
          <div class="display" style="font-size:70px;color:var(--ink-3)">→</div>
          <div class="stat" data-step="4" data-fx="fade"><span class="eyebrow">Now</span><span class="big-num c-fibre" style="font-size:64px">${PIPELINE.rankAfter}nd of ${groups}</span><span class="lbl">on the class benchmark · ${S.rankTotal}rd of ${groups} in the local contest</span></div>
        </div>
        <div class="eyebrow" style="margin-top:44px">What we said we would do next</div>
        <div style="margin-top:6px">
          ${LAST_TIME.promises.map((p, i) => `<div class="promise"><div class="said">“${p.said}”<small>${p.why}</small></div><div class="tick" data-step="${i + 1}" data-fx="scale">✓</div><div class="did" data-step="${i + 1}"><b>${p.did}</b><small>${p.proof}</small></div></div>`)}
        </div>
      </div>`;
  },
  step(n, { instant } = {}) { revealSteps(this.root, n, instant); },
  unmount() {},
};
