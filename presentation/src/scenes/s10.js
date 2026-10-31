// 10 · Every parameter was chosen by a measurement
import { html, revealSteps, fmt } from '../engines/dom.js';
import { hbars } from '../engines/charts.js';
import { CHOICES } from '../content/facts.js';

export default {
  id: 's10', title: 'Every choice was measured', part: 'D', source: 'PIPELINE.md §1, §3, §6 (same machine, same starting point, same time)', steps: 3, minutes: 1.0,
  mount(root, ctx) {
    this.root = root; ctx.net?.show(false);
    const A = CHOICES.lnsVsAnnealing60, gs = CHOICES.groupSize, mt = CHOICES.moreTime, ex = CHOICES.exactThreshold;
    root.innerHTML = html`
      <div class="area"><div class="cards" style="grid-template-columns:1fr 1fr 1fr;height:100%;align-items:start">
        <div data-step="0" class="card accent"><h3>LNS beat annealing</h3>
          <p class="small">${A.instances} data sets, ${A.seconds} s each, same start</p>
          <div class="w-ann" style="margin-top:8px"></div>
          <p class="body" style="font-size:23px">Better on <b>${A.lnsWins}</b> data sets vs ${A.annealingWins}. Annealing only wins with the right temperature, and that temperature changes per data set:</p>
          <table class="tbl" style="font-size:19px;margin-top:6px"><tr><th>180 s</th><th class="n">T = 1</th><th class="n">T = 0.001</th><th class="n">LNS</th></tr>
          ${CHOICES.lnsVsAnnealing180.map(r => { const m = Math.max(r.annealT1, r.annealT0001, r.lns); const b = x => x === m ? `<b>${fmt(x)}</b>` : fmt(x); return `<tr><td class="mono">${r.name}</td><td class="n">${b(r.annealT1)}</td><td class="n">${b(r.annealT0001)}</td><td class="n">${b(r.lns)}</td></tr>`; })}</table>
        </div>
        <div data-step="1" class="card gacc"><h3>Two caches, five minutes</h3>
          <p class="small">LNS group size · ${gs.instance}, ${gs.seconds} s</p>
          <div class="w-k" style="margin-top:8px"></div>
          <p class="small" style="margin-top:14px">More time on ${mt.instance}: gain over re-pack</p>
          <div class="w-t" style="margin-top:8px"></div>
          <p class="body" style="font-size:23px">Small groups rebuild faster, so more steps fit. Gains flatten: 5 minutes is the sweet spot.</p>
        </div>
        <div data-step="2" class="card dcacc"><h3>When to run the exact solver</h3>
          <p class="small">Size of the integer program (assignment variables)</p>
          <table class="tbl" style="font-size:20px;margin-top:6px"><tr><th>Data set</th><th class="n">Variables</th><th>Exact solver</th></tr>
            ${ex.wins.map(w => `<tr><td class="mono">${w.name}</td><td class="n">${fmt(w.vars)}</td><td class="c-pass">wins</td></tr>`)}
            ${ex.loses.map(w => `<tr><td class="mono">${w.name}</td><td class="n">${fmt(w.vars)}</td><td class="c-fail">loses</td></tr>`)}
          </table>
          <p class="body" style="font-size:23px;margin-top:10px">Threshold set in between: <b>${fmt(ex.chosen)}</b> variables.</p>
          <p class="small" style="margin-top:10px">Also measured: re-pack starting from the greedy beats starting from empty caches (${CHOICES.startFromGreedy.map(s => `${s.name} ${fmt(s.greedyStart)} vs ${fmt(s.emptyStart)}`).join(' · ')}).</p>
        </div>
      </div></div>`;
    this.ann = hbars(root.querySelector('.w-ann'), [{ label: 'LNS', value: A.lnsGain, cls: 'me' }, { label: 'Annealing', value: A.annealingGain }], { W: 520, rowH: 38, gap: 10, labelW: 120, unit: ' pts' });
    this.k = hbars(root.querySelector('.w-k'), gs.rows.map(r => ({ label: `k = ${r.k}`, value: r.score, cls: r.k === 2 ? 'me' : '' })), { W: 520, rowH: 34, gap: 8, labelW: 90, min: 611000 });
    this.t = hbars(root.querySelector('.w-t'), mt.rows.map(r => ({ label: `${r.s} s`, value: r.gain, cls: r.s === 180 ? '' : '' })), { W: 520, rowH: 30, gap: 8, labelW: 90, unit: ' pts' });
  },
  step(n, { instant } = {}) { revealSteps(this.root, n, instant); this.ann.grow(n >= 0); this.k.grow(n >= 1); this.t.grow(n >= 1); },
  unmount() {},
};
