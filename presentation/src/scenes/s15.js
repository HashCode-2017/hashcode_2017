// 15 · Conclusion, then questions
import { html, revealSteps } from '../engines/dom.js';
import { TALK, PIPELINE } from '../content/facts.js';
import { SHEET } from '../content/tables.js';
import { contestStats } from './s08.js';

const LAYERS = [
  ['Greedy (heap, evict, swap)', 'no', 'one (cache, video) pair', 'a good start, fast'],
  ['Exact re-pack', 'yes, one cache', 'a whole cache', 'the ratio rule misses combinations'],
  ['Large neighbourhood search', 'yes, two caches', 'two linked caches', 're-pack is stuck one cache at a time'],
  ['Exact solver', 'yes, globally', 'the whole solution', 'traps · gives a proven ceiling'],
];

export default {
  id: 's15', title: 'Conclusion', part: 'F', source: 'Scenes 03–14', steps: 3, minutes: 1.0,
  mount(root, ctx) {
    this.root = root; ctx.net?.show(false);
    const S = contestStats();
    const n = Object.keys(SHEET.classTotals).length;
    root.innerHTML = html`
      <div class="area">
        <div data-step="0" data-until="1">
          <table class="tbl" style="width:1500px"><tr><th>Layer</th><th>Exact?</th><th>Changes per step</th><th>Fixes</th></tr>
          ${LAYERS.map(r => `<tr><td><b>${r[0]}</b></td><td>${r[1]}</td><td>${r[2]}</td><td>${r[3]}</td></tr>`)}</table>
          <p class="body" style="margin-top:12px">Each layer fixes one <b>measured</b> weakness of the one below, and none can make the answer worse.</p>
        </div>
        <div data-step="1" data-until="1" style="margin-top:46px">
          <div class="kicker" style="font-size:56px;max-width:1500px">Build fast, improve with exact sub-problems, <span class="c-fibre">solve exactly what is small enough.</span></div>
          <div style="display:flex;gap:90px;margin-top:40px">
            <div class="stat"><span class="big-num">${S.rankTotal}<small>rd of ${n}</small></span><span class="lbl">local contest (official)</span></div>
            <div class="stat"><span class="big-num">${PIPELINE.rankAfter}<small>nd of ${n}</small></span><span class="lbl">class benchmark, 29 data sets</span></div>
            <div class="stat"><span class="big-num c-pass">${PIPELINE.provenOptima}</span><span class="lbl">proven optima</span></div>
          </div>
        </div>
        <div data-step="2" style="position:absolute;inset:0">
          <div class="display" style="font-size:180px;margin-top:40px">Questions?</div>
          <p class="body" style="margin-top:20px">Whiteboard welcome. Backup scenes: a live playground, why each step is safe, and the cost of each step.</p>
          <div class="team" style="margin-top:60px;font-size:28px;display:flex;gap:16px;align-items:center"><span class="pill">${TALK.group}</span>${TALK.members.join(' · ')}</div>
          <p class="small mono" style="margin-top:14px">${TALK.repo}</p>
        </div>
      </div>`;
  },
  step(n, { instant } = {}) { revealSteps(this.root, n, instant); },
  unmount() {},
};
