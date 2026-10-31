// 04 · The required execution example: the greedy, pop by pop, on the statement's example (no code)
import { html, revealSteps, fmt, countTo, vcol } from '../engines/dom.js';
import { drawNetwork } from '../engines/netsvg.js';
import { STATEMENT } from '../content/facts.js';
import { parse, greedy, emptyPlacement, bestLatency } from '../solver/engine.js';

const POPS_AT = [0, 1, 2, 3, 4, 6, 6, 6]; // pops done after each step

export default {
  id: 's04', title: 'Running it on the example, pop by pop', part: 'B', source: "Statement's example · run live by our solver", steps: 8, minutes: 1.7,
  mount(root, ctx) {
    this.root = root; this.ctx = ctx;
    ctx.net?.show(false);
    const inst = this.inst = parse(STATEMENT.exampleIn);
    this.run = greedy(inst);
    const q = this.run.trace.queue;
    const top = q[0], r0 = inst.byEndpoint[0].find(r => r.v === top.v), lat0 = inst.lat[0].get(top.c);
    root.innerHTML = html`
      <div class="area">
        <div class="netwrap" style="position:absolute;left:0;top:0"></div>
        <div style="position:absolute;left:1050px;right:0;top:0">
          <div class="eyebrow">The queue · best saving per MB first</div>
          <table class="queue" style="margin-top:8px">
            <tr><th>#</th><th>Cache</th><th>Video</th><th class="r">Saving (ms)</th><th class="r">Per MB</th><th>Decision</th></tr>
            ${q.map((p, i) => `<tr data-i="${i}"><td>${i + 1}</td><td>${p.c}</td><td><span class="chipv" style="background:${vcol(p.v)}">v${p.v}</span></td><td class="r">${fmt(p.g)}</td><td class="r">${fmt(p.key)}</td><td class="dec"></td></tr>`)}
          </table>
          <div class="explain body" style="margin-top:22px;min-height:190px"></div>
          <div class="scorebox" style="margin-top:6px"><span class="small">Score</span><span class="big-num s-score">0</span><span data-step="6" style="margin-left:28px"><span class="stamp ok" style="font-size:28px">+${fmt(this.run.score - STATEMENT.exampleSubmissionScore)} vs the statement</span></span></div>
        </div>
      </div>`;
    this.netv = drawNetwork(root.querySelector('.netwrap'), inst, { W: 1010, H: 770, cacheW: 240 });
    this.texts = [
      `<b>Score every pair once.</b> Cache ${top.c} · video ${top.v}: ${fmt(r0.n)} requests × (${fmt(inst.ld[0])} − ${lat0}) ms = ${fmt(top.g)} ms, ÷ ${inst.sizes[top.v]} MB = <b>${fmt(top.key)} per MB</b>.<br><span class="small">Video 4 (${inst.sizes[4]} MB) never fits a ${inst.X} MB cache. Endpoint 1 has no cache, so its request never enters the queue.</span>`,
    ];
  },
  explainPop(i) {
    const p = this.run.trace.pops[i], inst = this.inst;
    const before = this.placedAfter(i);
    if (p.decision === 'place') return `<b>Pop ${i + 1}:</b> cache ${p.c} · video ${p.v}. Re-check the saving: still ${fmt(p.now)}. <b class="c-pass">Unchanged → place it.</b>`;
    // who already serves it
    const best = bestLatency(inst, before, 0, p.v);
    const from = inst.links[0].find(([c, L]) => L === best && before[c].has(p.v));
    return `<b>Pop ${i + 1}:</b> cache ${p.c} · video ${p.v}. Re-check: endpoint 0 already gets video ${p.v} from cache ${from?.[0]} in ${best} ms. Saving now ${fmt(p.now)}. <b class="c-fail">Drop it.</b>`;
  },
  placedAfter(k) { // placement after the first k pops
    const p = emptyPlacement(this.inst);
    this.run.trace.pops.slice(0, k).forEach(x => { if (x.decision === 'place') p[x.c].add(x.v); });
    return p;
  },
  step(n, { instant } = {}) {
    revealSteps(this.root, n, instant);
    const k = POPS_AT[n];
    const placed = this.placedAfter(k);
    this.netv.set(placed);
    this.netv.clearMarks(); this.netv.ghost(null);
    const pops = this.run.trace.pops;
    this.root.querySelectorAll('.queue tr[data-i]').forEach(tr => {
      const i = Number(tr.dataset.i), p = pops[i];
      tr.className = i < k ? `done-${p.decision}` : '';
      if (n >= 1 && n <= 5 && i === k - 1) tr.classList.add('cur');
      if (n === 5 && i === k - 2) tr.classList.add('cur');
      tr.querySelector('.dec').textContent = i < k ? (p.decision === 'place' ? 'place' : 'drop') : '';
    });
    let t = '';
    if (n === 0) t = this.texts[0];
    else if (n >= 1 && n <= 4) {
      const p = pops[k - 1];
      t = this.explainPop(k - 1);
      this.netv.mark(p.c, p.decision === 'place' ? 'place' : 'drop');
      if (p.decision !== 'place') this.netv.ghost(p.c, p.v, 'drop');
    } else if (n === 5) t = `<b>Pops 5–6:</b> video 1 in caches 2 and 1. Endpoint 0 already gets it from cache 0 in 100 ms. <b class="c-fail">Both dropped.</b>`;
    else if (n === 6) t = `<b>Queue empty, round over.</b> Evict: no copy saves nothing. Swap: no better video fits. The next round places nothing, so we stop.`;
    else t = `<b>Is this the best possible?</b> Endpoint 0 gets videos 3 and 1 from its fastest cache; video 4 can never be cached; endpoint 1 has no cache. <b class="c-pass">Yes: our exact solver proves ${fmt(this.run.score)} is optimal.</b>`;
    const ex = this.root.querySelector('.explain'); ex.innerHTML = t;
    countTo(this.root.querySelector('.s-score'), pops.slice(0, k).reduce((s, p) => p.decision === 'place' ? p.score : s, 0), { instant, dur: 700 });
  },
  unmount() {},
};
