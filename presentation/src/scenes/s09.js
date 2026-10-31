// 09 · The class benchmark: how each version moved the total, and where the points came from
import { html, revealSteps, fmt, pct } from '../engines/dom.js';
import { hbars, pairs } from '../engines/charts.js';
import { VERSIONS, PIPELINE, GOOGLE } from '../content/facts.js';
import { SHEET } from '../content/tables.js';

export default {
  id: 's09', title: 'The class benchmark: from 6th to 2nd', part: 'C', source: 'scores_v1_v2_v3.md · PIPELINE.md §5 · class sheet (31 Oct)', steps: 4, minutes: 1.5,
  mount(root, ctx) {
    this.root = root; ctx.net?.show(false);
    const v = VERSIONS.rows;
    const classRows = Object.entries(SHEET.classTotals).filter(([, x]) => x > 20e6).sort((a, b) => b[1] - a[1]);
    const trapGain = PIPELINE.traps.reduce((s, t) => s + t.optimum - t.greedy, 0);
    // Google tab with our final scores in place of the earlier entry
    const g = { ...SHEET.googleTotals, D: GOOGLE.finalTotal };
    const gRank = 1 + Object.values(g).filter(x => x > GOOGLE.finalTotal).length;
    const vid = GOOGLE.rows.find(r => r.name === 'videos_worth_spreading');
    root.innerHTML = html`
      <div class="area">
        <div data-step="0" data-until="0" style="position:absolute;left:0;top:0;width:1100px">
          <div class="eyebrow">Greedy versions · total over the ${24} class data sets of that time</div>
          <div class="w-ver" style="margin-top:14px"></div>
          <p class="body" style="margin-top:10px">Each version kept the previous ideas and fixed one measured weakness: <b>+${pct(v[2].total / v[0].total - 1)}</b> from V1 to V3 · ${pct(v[2].total / VERSIONS.vbs)} of the best-per-data-set total.</p>
        </div>
        <div data-step="1" data-until="1" style="position:absolute;left:0;top:0;width:1100px">
          <div class="eyebrow">Class sheet today · total over the 29 class data sets (groups above 20 M)</div>
          <div class="w-class" style="margin-top:14px"></div>
        </div>
        <div data-step="2" data-until="2" style="position:absolute;left:0;top:0;width:1100px">
          <div class="eyebrow">Trap data sets · greedy vs proven optimum</div>
          <div class="w-trap" style="margin-top:14px"></div>
          <p class="body">These four alone: <b>+${fmt(trapGain)}</b> of the +${fmt(PIPELINE.classGain)} gained.</p>
        </div>
        <div data-step="3" style="position:absolute;left:0;top:0;width:1100px">
          <div class="eyebrow">Google data sets · our final outputs, re-scored by our scorer</div>
          <table class="tbl" style="margin-top:10px">
            <tr><th>Data set</th><th class="n">Greedy V3</th><th class="n">Final</th><th class="n">Best in class</th><th>Final step</th></tr>
            ${GOOGLE.rows.map(r => `<tr><td class="mono">${r.name}</td><td class="n">${fmt(r.v3)}</td><td class="n"><b>${fmt(r.final)}</b></td><td class="n">${fmt(r.best)}</td><td style="font-size:19px">${r.method}</td></tr>`)}
            <tr><td><b>Total</b></td><td class="n">${fmt(GOOGLE.v3Total)}</td><td class="n"><b>${fmt(GOOGLE.finalTotal)}</b></td><td class="n"></td><td style="font-size:19px">→ ${gRank}nd of 12 on the Google tab</td></tr>
          </table>
          <div class="eyebrow" style="margin-top:34px">videos_worth_spreading · how far from perfect can we be?</div>
          <div class="w-bound" style="margin-top:12px"></div>
        </div>
        <div style="position:absolute;left:1170px;right:0;top:0;display:flex;flex-direction:column;gap:30px">
          <div data-step="1" class="stat"><span class="big-num c-fibre">+${fmt(PIPELINE.classGain)}</span><span class="lbl">on the 29 class data sets with the full pipeline (${fmt(PIPELINE.classBefore)} → ${fmt(PIPELINE.classAfter)})</span></div>
          <div data-step="1" class="stat"><span class="big-num">${PIPELINE.rankBefore}<small>th</small> → ${PIPELINE.rankAfter}<small>nd</small></span><span class="lbl">rank in the class sheet · ${fmt(SHEET.classTotals.K - SHEET.classTotals.D)} points behind group K</span></div>
          <div data-step="2" class="stat"><span class="big-num c-pass">${PIPELINE.provenOptima}</span><span class="lbl">data sets solved to a <b>proven optimum</b>: ${PIPELINE.provenList.join(', ')}</span></div>
          <div data-step="3" class="stat"><span class="big-num">≤ ${fmt(PIPELINE.exact.videos.bound - vid.final)}</span><span class="lbl">points left on videos_worth_spreading: the exact solver proves no answer can exceed ${fmt(PIPELINE.exact.videos.bound)}</span></div>
        </div>
      </div>`;
    this.ver = hbars(root.querySelector('.w-ver'), [...v.map((r, i) => ({ label: `${r.v} · ${r.label}`, value: r.total, cls: i === 2 ? 'me' : '' })), { label: 'Best per data set', value: VERSIONS.vbs, cls: 'alt' }], { W: 1100, rowH: 64, gap: 18, labelW: 330, min: 17e6 });
    this.cls = hbars(root.querySelector('.w-class'), classRows.map(([gname, x]) => ({ label: `Group ${gname}`, value: x, cls: gname === 'D' ? 'me' : '' })), { W: 1100, rowH: 40, gap: 10, labelW: 160, min: 20e6 });
    this.trap = pairs(root.querySelector('.w-trap'), PIPELINE.traps.map(t => ({ label: t.name, a: t.greedy, b: t.optimum, aNote: pct(t.greedy / t.optimum, 0), bNote: 'optimum' })), { W: 1100, labelW: 160, aLabel: 'greedy (V3)', bLabel: 'now (exact solver)' });
    this.bound = hbars(root.querySelector('.w-bound'), [{ label: 'Our final', value: vid.final, cls: 'me' }, { label: 'Best in class', value: vid.best }, { label: 'Proven ceiling', value: PIPELINE.exact.videos.bound, cls: 'top' }], { W: 1100, rowH: 40, gap: 10, labelW: 220, min: 600000 });
  },
  step(n, { instant } = {}) {
    revealSteps(this.root, n, instant);
    this.ver.grow(n === 0); this.cls.grow(n === 1); this.trap.grow(n === 2); this.bound.grow(n === 3);
  },
  unmount() {},
};
