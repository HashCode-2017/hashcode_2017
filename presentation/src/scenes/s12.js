// 12 · Code: how the final submission is built (click a box for details)
import { html, revealSteps, svg, fmt } from '../engines/dom.js';
import { CODE } from '../content/facts.js';

const NODES = [
  { id: 'in', x: 0, y: 300, w: 230, cls: '', step: 0, t: '.in file', s: 'one data set', d: 'Any data set: Google, class, contest or generated. Parsed once into indexes: which caches each endpoint reaches, which videos each endpoint asks for.' },
  { id: 'solve', x: 330, y: 280, w: 300, cls: 'orch', step: 0, t: 'solve.py', s: 'one command · time budget', d: 'Decides which methods to run for this data set, starts them in parallel within the time budget, and keeps the best valid answer.' },
  { id: 'cpp', x: 760, y: 120, w: 420, cls: 'solver', step: 0, t: 'solver.cpp', s: 'greedy → exact re-pack → LNS', d: 'The C++ port of our Python greedy (same moves), plus the exact per-cache re-pack and the large neighbourhood search. Never runs past --time-limit.' },
  { id: 'exact', x: 760, y: 440, w: 420, cls: 'solver', step: 1, t: 'exact.py', s: `integer program · HiGHS · ≤ ${fmt(CODE.exactMax)} variables`, d: 'Builds the integer program and solves it with HiGHS (through SciPy). If it proves the optimum, everything stops. If it hits its limit, LNS polishes its answer.' },
  { id: 'check', x: 1290, y: 280, w: 300, cls: '', step: 1, t: 'solution.score()', s: 're-score + capacity check', d: 'Every candidate .out is re-scored by the Python scorer (written independently of the solvers, checked on the statement: 462,500) and every cache capacity is checked.' },
  { id: 'out', x: 1640, y: 300, w: 140, cls: '', step: 1, t: '.out', s: 'best valid', d: 'The submission: the best valid candidate.' },
  { id: 'runner', x: 330, y: 610, w: 300, cls: 'web', step: 2, t: 'runner/', s: 'local page: drop .in, get .out', d: 'A local web page around solve.py: drop many .in files, watch each step, download every .out and a scores.csv.' },
  { id: 'console', x: 760, y: 640, w: 420, cls: 'web', step: 2, t: 'api/ + ui/', s: 'class console: upload, replay, rank', d: 'Our class console (FastAPI + React, hosted online): groups upload their .out, watch it replay and see the leaderboard. It imports the parser and scorer from solution.py instead of rewriting them.' },
  { id: 'gen', x: 0, y: 610, w: 300, cls: 'web', step: 2, t: 'generated_instances/', s: 'random · dejavu · patterned · trap', d: 'Our instance generator: every file checked against the statement limits. The trap model builds exactly the case where the greedy gets half the optimum.' },
];
const EDGES = [['in', 'solve', 0], ['solve', 'cpp', 0], ['solve', 'exact', 1], ['cpp', 'check', 1], ['exact', 'check', 1], ['check', 'out', 1], ['runner', 'solve', 2, 'dash'], ['console', 'check', 2, 'dash'], ['gen', 'in', 2, 'dash']];

export default {
  id: 's12', title: 'How the final submission is built', part: 'E', source: 'Repository: solve.py, solver.cpp, exact.py, solution.py, runner/, api/, ui/', steps: 3, minutes: 1.5,
  mount(root, ctx) {
    this.root = root; ctx.net?.show(false);
    root.innerHTML = html`
      <div class="area">
        <div class="flow" style="left:0;top:0;width:1780px;height:740px"></div>
        <div class="card detail" style="position:absolute;left:1240px;top:520px;width:536px;min-height:150px"><h3 class="dt">Click a box</h3><p class="body dd" style="font-size:22px">Each box is one file of the repository.</p></div>
        <div style="position:absolute;left:0;top:0;width:640px"><table class="tbl" style="font-size:19px">${CODE.files.map(f => `<tr><td class="mono">${f.file}</td><td class="n">${f.lines} lines</td></tr>`)}</table></div>
      </div>`;
    const flow = root.querySelector('.flow');
    const s = svg('svg', { width: 1780, height: 740, style: 'position:absolute;left:0;top:0' }, flow);
    const byId = Object.fromEntries(NODES.map(n => [n.id, n]));
    this.edges = EDGES.map(([a, b, st, cls]) => {
      const A = byId[a], B = byId[b];
      const ax = A.x + A.w, ay = A.y + 45, bx = B.x, by = B.y + 45;
      const up = cls === 'dash' && B.y < A.y;
      const d = up ? `M${A.x + A.w / 2},${A.y} C${A.x + A.w / 2},${A.y - 90} ${B.x + B.w / 2},${B.y + 180} ${B.x + B.w / 2},${B.y + 92}` : `M${ax},${ay} C${(ax + bx) / 2},${ay} ${(ax + bx) / 2},${by} ${bx},${by}`;
      const p = svg('path', { d, class: cls || '' }, s);
      return { p, st };
    });
    this.nodes = NODES.map(n => {
      const el = document.createElement('div');
      el.className = `node ${n.cls}`; el.style.cssText = `left:${n.x}px;top:${n.y}px;width:${n.w}px`;
      el.innerHTML = `<b>${n.t}</b><span>${n.s}</span>`;
      el.onclick = () => { this.nodes.forEach(x => x.el.classList.remove('sel')); el.classList.add('sel'); root.querySelector('.dt').textContent = n.t; root.querySelector('.dd').textContent = n.d; };
      flow.appendChild(el);
      return { el, n };
    });
  },
  step(n, { instant } = {}) {
    revealSteps(this.root, n, instant);
    this.nodes.forEach(({ el, n: d }) => { el.style.transition = instant ? 'none' : 'opacity .5s'; el.style.opacity = d.step <= n ? 1 : 0; el.style.pointerEvents = d.step <= n ? 'auto' : 'none'; });
    this.edges.forEach(({ p, st }) => { p.style.transition = instant ? 'none' : 'opacity .5s'; p.style.opacity = st <= n ? 1 : 0; });
  },
  unmount() {},
};
