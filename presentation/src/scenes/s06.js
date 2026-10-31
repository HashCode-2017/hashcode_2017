// 06 · The trap: re-pack is stuck one cache at a time; LNS changes two caches together; the exact solver proves it.
import { html, revealSteps, fmt, countTo, sleep, pct } from '../engines/dom.js';
import { drawNetwork } from '../engines/netsvg.js';
import { PIPELINE } from '../content/facts.js';
import { parse, greedy, repack, lns, optimum, clonePlacement, emptyPlacement, score } from '../solver/engine.js';

const NAMES = { cache: ['Cache a', 'Cache b'], endpoint: ['Endpoint A', 'Endpoint B'], video: ['A1', 'A2', 'B1', 'B2'] };

export default {
  id: 's06', title: 'Two caches at once, then exact', part: 'B', source: 'Trap gadget from our generator (models/trap_gadget.in) · solved live · real solver output in models/output', steps: 5, minutes: 1.3,
  async mount(root, ctx) {
    this.root = root; this.ctx = ctx; this.token = 0;
    ctx.net?.show(false);
    const txt = await fetch('models/trap_gadget.in').then(r => r.text()).catch(() => null);
    this.recorded = await fetch('models/output/trap_gadget.txt').then(r => r.text()).catch(() => '');
    const inst = this.inst = parse(txt || '4 2 4 2 100\n50 50 50 50\n1000 2\n0 1\n1 2\n1000 1\n0 1\n0 0 1001\n2 1 1000\n1 0 1001\n3 1 1000');
    this.solve();
    const traps = PIPELINE.traps;
    root.innerHTML = html`
      <div class="area">
        <div class="netwrap" style="position:absolute;left:0;top:0"></div>
        <div class="scorebox" style="position:absolute;left:0;top:620px"><span class="small">Score</span><span class="big-num s-score">0</span><span class="small s-pct"></span></div>
        <div style="position:absolute;left:1020px;right:0;top:0">
          <div data-step="0" data-until="0" class="card accent" style="position:absolute;left:0;right:0;top:0"><h3>Greedy</h3><p class="body">A's videos look a little better in cache a, so the greedy puts them there. Cache b can only reach A, who is already served. <b>B gets nothing.</b></p></div>
          <div data-step="1" data-until="1" class="card gacc" style="position:absolute;left:0;right:0;top:0"><h3>Re-pack: stuck</h3><p class="body">Re-pack <b>a</b> alone: A's videos are still worth most there. Re-pack <b>b</b> alone: A already gets them from a, so they are worth 0 in b. Each cache is optimal given the other.</p></div>
          <div data-step="2" data-until="2" class="card pacc" style="position:absolute;left:0;right:0;top:0"><h3>Large neighbourhood search</h3><p class="body">Pick a cache and a neighbour sharing users. <b>Empty both</b>, re-pack them together in random order, keep the result if the score did not drop. Repeat for the time budget.</p></div>
          <div data-step="3" data-until="3" style="position:absolute;left:0;right:0;top:0">
            <div class="card dcacc"><h3>The exact solver</h3>
              <div class="math" style="font-size:26px;line-height:1.55"><i>x</i><sub>c,v</sub> ∈ {0,1}: video <i>v</i> stored in cache <i>c</i><br><i>y</i><sub>r,c</sub> ∈ [0,1]: request <i>r</i> served by cache <i>c</i><br>maximise Σ <i>n<sub>r</sub></i> (<i>L<sub>D</sub></i> − <i>L<sub>c</sub></i>) <i>y</i><sub>r,c</sub><br>Σ<sub>c</sub> <i>y</i><sub>r,c</sub> ≤ 1 · <i>y</i><sub>r,c</sub> ≤ <i>x</i><sub>c,v</sub> · Σ<sub>v</sub> size<sub>v</sub> <i>x</i><sub>c,v</sub> ≤ X</div>
              <p class="small" style="margin-top:8px">Solved by branch and bound (HiGHS). Small instance: <b>proven optimum</b> (zoo: ${fmt(PIPELINE.exact.zoo.score)} in ${PIPELINE.exact.zoo.seconds} s). Large: a <b>proven ceiling</b> (videos: nothing can exceed ${fmt(PIPELINE.exact.videos.bound)}).</p>
            </div>
            <div class="terminal" style="margin-top:14px"><div class="tbar"><i></i><i></i><i></i>recorded · exact.py on this instance</div><pre class="rec"></pre></div>
          </div>
          <div data-step="4" style="position:absolute;left:0;right:0;top:0">
            <div class="eyebrow">Live, on this instance</div>
            <div class="ladder" style="margin-top:12px"></div>
            <button class="btn" style="margin-top:16px" data-act="rerun">Run again</button>
            <div class="eyebrow" style="margin-top:30px">Same kind of trap in the class sheet</div>
            <table class="tbl" style="margin-top:6px">
              <tr><th>Data set</th><th class="n">Greedy</th><th class="n">Now</th></tr>
              ${traps.map(t => `<tr><td class="mono">${t.name}</td><td class="n">${pct(t.greedy / t.optimum, 0)}</td><td class="n c-pass">100% · proven</td></tr>`)}
            </table>
          </div>
        </div>
      </div>`;
    this.netv = drawNetwork(root.querySelector('.netwrap'), inst, { W: 980, H: 600, names: NAMES, cacheW: 260 });
    const rec = this.recorded.split('$ python exact.py')[1] || '';
    root.querySelector('.rec').textContent = rec ? '$ python exact.py trap_gadget.in out.out' + rec.trimEnd() : '(recorded output missing)';
    root.querySelector('[data-act=rerun]').addEventListener('click', () => { this.solve(Math.floor(Math.random() * 1e6)); this.ladder(true); });
  },
  solve(seed = 7) {
    const inst = this.inst;
    const g = greedy(inst);
    const r = clonePlacement(g.placed); const rs = repack(inst, r).score;
    const l = clonePlacement(r); const ls = lns(inst, l, { steps: 80, seed }).score;
    const o = optimum(inst);
    this.res = { g, rs, l, ls, o };
  },
  ladder(animate) {
    const { g, rs, ls, o } = this.res, opt = o.score;
    const rows = [['Greedy', g.score], ['+ Re-pack', rs], ['+ LNS', ls], ['Exact', opt]];
    const el = this.root.querySelector('.ladder');
    el.innerHTML = rows.map(([nm, v]) => `<div class="rung ${v >= opt ? 'good' : 'bad'}"><span class="nm">${nm}</span><span class="tr"><span class="fl" style="width:0"></span><span class="opt" style="left:100%"></span></span><span class="v">${fmt(v)}</span></div>`).join('');
    requestAnimationFrame(() => el.querySelectorAll('.fl').forEach((f, i) => { f.style.transitionDelay = animate ? `${i * 250}ms` : '0ms'; f.style.width = `${rows[i][1] / opt * 100}%`; }));
  },
  async step(n, { instant } = {}) {
    revealSteps(this.root, n, instant);
    const tok = ++this.token;
    const inst = this.inst, { g, l, o } = this.res;
    const show = (p, inst2 = instant) => { this.netv.set(p); const s = score(inst, p); countTo(this.root.querySelector('.s-score'), s, { instant: inst2 }); this.root.querySelector('.s-pct').textContent = `${pct(s / o.score)} of the optimum`; };
    this.netv.clearMarks();
    if (n <= 1) { show(g.placed); if (n === 1) { this.netv.mark(0, 'focus'); this.netv.mark(1, 'focus'); } return; }
    if (n === 2 && !instant && !this.ctx.exportMode) {
      show(g.placed, true); await sleep(500); if (tok !== this.token) return;
      this.netv.mark(0, 'focus'); this.netv.mark(1, 'focus'); show(emptyPlacement(inst)); await sleep(900); if (tok !== this.token) return;
      const half = emptyPlacement(inst); [...l[1]].forEach(v => half[1].add(v)); show(half); await sleep(900); if (tok !== this.token) return;
      show(l); this.netv.clearMarks(); this.netv.mark(0, 'place'); this.netv.mark(1, 'place');
      return;
    }
    show(n >= 3 ? o.placed : l);
    if (n === 4) this.ladder(!instant);
  },
  unmount() { this.token++; },
};
