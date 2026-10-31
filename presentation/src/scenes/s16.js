// 16 · Backup: a playground. Make a small random instance and watch every layer, live.
import { html, fmt, pct } from '../engines/dom.js';
import { drawNetwork } from '../engines/netsvg.js';
import { randomInstance, greedy, repack, lns, optimum, clonePlacement, toText } from '../solver/engine.js';

export default {
  id: 's16', title: 'Backup · Playground', part: 'Q', source: 'Random small instances (ours) · same solver as scenes 04–06', steps: 1, minutes: 0,
  mount(root, ctx) {
    this.root = root; ctx.net?.show(false);
    this.p = { V: 7, E: 3, C: 2, X: 80, skew: 1.2, seed: 176 };
    root.innerHTML = html`
      <div class="area">
        <div class="ctrl" style="gap:28px">
          ${[['V', 'videos', 3, 9], ['E', 'endpoints', 1, 4], ['C', 'caches', 1, 3], ['X', 'cache MB', 30, 160], ['skew', 'demand skew', 0, 2.5]].map(([k, l, a, b]) => `<label>${l} <b class="v-${k}"></b><input type="range" data-k="${k}" min="${a}" max="${b}" step="${k === 'skew' ? 0.1 : k === 'X' ? 10 : 1}" value="${this.p[k]}"></label>`)}
          <button class="btn go" data-act="new">New instance</button>
          <button class="btn" data-act="copy">Copy .in</button>
          <span class="small seed"></span>
        </div>
        <div class="netwrap" style="position:absolute;left:0;top:110px"></div>
        <div style="position:absolute;left:1180px;right:0;top:120px">
          <div class="eyebrow">Each layer, on this instance</div>
          <div class="ladder" style="margin-top:14px"></div>
          <div class="body view" style="margin-top:24px;font-size:22px"></div>
          <div class="ctrl" style="margin-top:16px">${['greedy', 'repack', 'lns', 'optimum'].map(k => `<button class="btn" data-show="${k}">${k === 'repack' ? 're-pack' : k === 'lns' ? 'LNS' : k}</button>`).join('')}</div>
        </div>
      </div>`;
    root.querySelectorAll('input[type=range]').forEach(inp => inp.addEventListener('input', () => { this.p[inp.dataset.k] = Number(inp.value); this.run(); }));
    root.querySelector('[data-act=new]').onclick = () => { this.p.seed = Math.floor(Math.random() * 99999); this.run(); };
    root.querySelector('[data-act=copy]').onclick = () => navigator.clipboard?.writeText(toText(this.inst));
    root.querySelectorAll('[data-show]').forEach(b => b.onclick = () => this.show(b.dataset.show));
    this.run();
  },
  run() {
    const p = this.p;
    for (const k of ['V', 'E', 'C', 'X', 'skew']) this.root.querySelector('.v-' + k).textContent = p[k];
    this.root.querySelector('.seed').textContent = `seed ${p.seed}`;
    const inst = this.inst = randomInstance({ ...p, sizeMin: 10, sizeMax: Math.max(15, Math.round(p.X * 0.6)) });
    const g = greedy(inst);
    const r = clonePlacement(g.placed); const rs = repack(inst, r).score;
    const l = clonePlacement(r); const ls = lns(inst, l, { steps: 120, seed: p.seed }).score;
    const o = optimum(inst, 300000);
    this.res = { greedy: [g.placed, g.score], repack: [r, rs], lns: [l, ls], optimum: o ? [o.placed, o.score] : null };
    const wrap = this.root.querySelector('.netwrap'); wrap.innerHTML = '';
    this.netv = drawNetwork(wrap, inst, { W: 1140, H: 780, cacheW: 250 });
    const top = o ? o.score : ls;
    const rows = [['Greedy', g.score], ['+ Re-pack', rs], ['+ LNS', ls], ['Optimum', o ? o.score : null]];
    this.root.querySelector('.ladder').innerHTML = rows.map(([nm, v]) => `<div class="rung ${v != null && v >= top ? 'good' : ''}"><span class="nm">${nm}</span><span class="tr"><span class="fl" style="width:${v == null ? 0 : v / Math.max(1, top) * 100}%"></span></span><span class="v">${v == null ? 'too big' : fmt(v)}</span></div>`).join('');
    this.show('lns');
  },
  show(k) {
    const r = this.res[k] || this.res.lns;
    this.netv.set(r[0]);
    this.root.querySelectorAll('[data-show]').forEach(b => b.setAttribute('aria-pressed', b.dataset.show === k));
    const opt = this.res.optimum?.[1];
    this.root.querySelector('.view').innerHTML = `Showing <b>${k === 'repack' ? 're-pack' : k}</b>: ${fmt(r[1])}${opt ? ` · ${pct(r[1] / opt)} of the optimum` : ''}`;
  },
  step() {},
  unmount() {},
};
