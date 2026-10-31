// 08 · The official result: the professor's local contest (15 data sets, 12 teams)
import { html, revealSteps, fmt, pct, tooltip, stageXY } from '../engines/dom.js';
import { hbars, heatmap } from '../engines/charts.js';
import { CONTEST } from '../content/tables.js';

const ME = 'D';

export function contestStats() {
  const { teams, instances, vbs, scores, firstTotals } = CONTEST;
  const total = t => scores[t].reduce((s, x) => s + x, 0);
  const totals = teams.map(t => ({ t, v: total(t) })).sort((a, b) => b.v - a.v);
  const rankBy = (arr, key, desc = true) => { const s = [...arr].sort((a, b) => desc ? b[key] - a[key] : a[key] - b[key]); return s.findIndex(x => x.t === ME) + 1; };
  const perInstRank = (t, i) => 1 + teams.filter(u => scores[u][i] > scores[t][i]).length;
  const rows = teams.map(t => ({ t, total: total(t), rankSum: instances.reduce((s, _, i) => s + perInstRank(t, i), 0), ratio: instances.reduce((s, _, i) => s + scores[t][i] / vbs[i], 0) / instances.length, worst: Math.min(...instances.map((_, i) => scores[t][i] / vbs[i])) }));
  const bestOn = instances.filter((_, i) => scores[ME][i] === vbs[i]).length;
  const soleBest = instances.filter((_, i) => scores[ME][i] === vbs[i] && teams.filter(u => scores[u][i] === vbs[i]).length === 1);
  const firstRank = 1 + teams.filter(t => firstTotals[t] > firstTotals[ME]).length;
  return {
    totals, rows, bestOn, soleBest, firstRank,
    rankTotal: rankBy(rows, 'total'), rankSum: rankBy(rows, 'rankSum', false), rankRatio: rankBy(rows, 'ratio'),
    me: rows.find(r => r.t === ME), gapToFirst: totals[0].v - total(ME), first: totals[0], vbsTotal: vbs.reduce((s, x) => s + x, 0),
    collapses: rows.filter(r => r.t !== ME && r.worst < 0.9).length,
  };
}

export default {
  id: 's08', title: 'The official result: local contest', part: 'C', source: "Professor's local-contest sheet ('Score', '1re soumission') · 12 teams · 15 data sets", steps: 4, minutes: 1.5,
  mount(root, ctx) {
    this.root = root; this.ctx = ctx; ctx.net?.show(false);
    const S = this.S = contestStats();
    const me = S.me, firstDelta = me.total - CONTEST.firstTotals[ME];
    root.innerHTML = html`
      <div class="area">
        <div class="left" style="position:absolute;left:0;top:0;width:1060px">
          <div data-step="0" data-until="0" style="position:absolute;left:0;right:0;top:0"><div class="eyebrow">Total over the 15 data sets · share of the best possible total (sum of best scores)</div><div class="barwrap" style="margin-top:12px"></div></div>
          <div data-step="1" style="position:absolute;left:0;right:0;top:0"><div class="eyebrow">Every data set × every team · % of the best score on that data set (hover a cell)</div><div class="heatwrap" style="margin-top:8px"></div>
            <div class="legend-row" style="margin-top:8px"><span><i style="background:var(--cache)"></i>best</span><span><i style="background:color-mix(in srgb,var(--cache) 55%,var(--bg))"></i>≥ 99.5%</span><span><i style="background:color-mix(in srgb,var(--gain) 45%,var(--bg))"></i>≥ 98%</span><span><i style="background:color-mix(in srgb,var(--fail) 45%,var(--bg))"></i>≥ 90%</span><span><i style="background:var(--fail)"></i>&lt; 90%</span></div>
          </div>
        </div>
        <div style="position:absolute;left:1120px;right:0;top:0;display:flex;flex-direction:column;gap:26px">
          <div data-step="0" class="stat"><span class="big-num c-fibre">${S.rankTotal}<small>rd of 12</small></span><span class="lbl">${fmt(me.total)} points · <b>${fmt(S.gapToFirst)}</b> behind team ${S.first.t} (${pct(S.gapToFirst / S.first.v, 4)})</span>
            <span class="small">3rd by all three of the professor's rankings: total (${S.rankTotal}), sum of ranks (${S.rankSum}), distance to the best (${S.rankRatio}).</span></div>
          <div data-step="1" class="stat"><span class="big-num">${pct(me.worst)}</span><span class="lbl">our <b>worst</b> data set, as a share of the best. ${S.collapses} of the 11 other teams fall below 90% somewhere.</span></div>
          <div data-step="2" class="stat"><span class="big-num">${S.bestOn}<small> of 15</small></span><span class="lbl">data sets where we have the best score${S.soleBest.length ? ` · the <b>only</b> team at the best on ${S.soleBest.join(', ')}` : ''}</span></div>
          <div data-step="3" class="stat"><span class="big-num">+${fmt(firstDelta)}</span><span class="lbl">from our 1st to our 2nd submission (${fmt(CONTEST.firstTotals[ME])} → ${fmt(me.total)}). Already ${S.firstRank}rd with the first one.</span></div>
        </div>
      </div>`;
    const vbsT = S.vbsTotal;
    this.bars = hbars(root.querySelector('.barwrap'), S.totals.map(x => ({ label: `Team ${x.t}`, value: x.v / vbsT * 100, cls: x.t === ME ? 'me' : '' })),
      { W: 1060, rowH: 34, gap: 9, labelW: 120, min: 94, max: 100, valueFmt: v => v.toFixed(3) + '%' });
    const tip = tooltip(root);
    this.heat = heatmap(root.querySelector('.heatwrap'), {
      rows: CONTEST.instances, cols: CONTEST.teams, highlightCol: ME, W: 1060, H: 610, rowLabelW: 120,
      value: (i, j) => CONTEST.scores[CONTEST.teams[j]][i] / CONTEST.vbs[i],
      raw: (i, j) => CONTEST.scores[CONTEST.teams[j]][i],
      tip: (ev, r, c, v, raw) => { if (!ev) return tip.hide(); const [x, y] = stageXY(ctx, ev); tip.show(`${r} · team ${c}<br><b>${fmt(raw)}</b> · ${pct(v, 2)} of the best`, x + 16, y + 16); },
    });
    this.heat.cells.forEach(c => { if (CONTEST.teams[c.j] === ME && c.v >= 0.99999) c.rect.classList.add('mine'); });
  },
  step(n, { instant } = {}) {
    revealSteps(this.root, n, instant);
    this.bars.grow(n === 0);
    this.heat.svg.classList.toggle('dimothers', n === 2);
  },
  unmount() {},
};
