// 03 · Why it is hard, and the plan: the solving pipeline stacked over the network
import { html, revealSteps, fmt } from '../engines/dom.js';
import { STATEMENT } from '../content/facts.js';

const FLOORS = [
  ['Read & index', 'each cache only looks at videos its own users ask for'],
  ['Greedy fill', 'best saving per MB first, then evict and swap'],
  ['Exact re-pack', 'freeze the others, fill one cache optimally'],
  ['Large neighbourhood search', 'empty two linked caches, rebuild them together'],
  ['Exact solver', 'small instances: proven optimum · large: a bound'],
];

export default {
  id: 's03', title: 'Why it is hard, and our plan', part: 'B', source: 'Statement · input limits · our pipeline (PIPELINE.md)', steps: 4, minutes: 0.8,
  mount(root, ctx) {
    this.root = root; this.ctx = ctx;
    ctx.net?.reset(); ctx.net?.show(false);
    const L = STATEMENT.limits;
    root.innerHTML = html`
      <div class="area">
        <div data-step="0" data-until="1" class="cards" style="grid-template-columns:1fr 1fr;width:1500px">
          <div class="card gacc"><h3>Every cache is a knapsack</h3><p class="body">Videos have different sizes and a cache has a fixed number of MB. Choosing the best set for <b>one</b> cache is already NP-hard.</p></div>
          <div class="card accent"><h3>The caches interact</h3><p class="body">A copy is only worth the time it saves <b>beyond</b> what the users already get. Video A in cache 1 can make its copy in cache 2 worthless.</p></div>
        </div>
        <div data-step="1" data-until="1" style="margin-top:44px;display:flex;gap:70px;align-items:flex-end">
          <div class="stat"><span class="big-num">${fmt(L.V)}</span><span class="lbl">videos (at most)</span></div>
          <div class="stat"><span class="big-num">${fmt(L.C)}</span><span class="lbl">caches</span></div>
          <div class="stat"><span class="big-num">${fmt(L.R)}</span><span class="lbl">request lines</span></div>
          <div class="body" style="max-width:520px">No method is both <b>exact</b> and <b>fast</b> at this size. So we mix both.</div>
        </div>
        <div data-step="2" style="position:absolute;left:0;top:0;width:640px">
          <div class="eyebrow">Our pipeline, bottom to top</div>
          <ol class="floors" style="list-style:none;padding:0;margin:14px 0 0;display:flex;flex-direction:column-reverse;gap:12px">
            ${FLOORS.map(([t, d], i) => `<li class="card fl${i}" style="padding:14px 20px;border-left:6px solid ${i === 4 ? 'var(--pass)' : 'var(--fibre)'}"><b style="font-family:var(--font-display);font-size:26px;text-transform:uppercase;letter-spacing:.04em">${String(i + 1).padStart(2, '0')} · ${t}</b><div class="small" style="color:var(--ink-2)">${d}</div></li>`)}
          </ol>
        </div>
        <div data-step="3" style="position:absolute;left:0;bottom:0;width:640px" class="card pacc">
          <h3>No step can make it worse</h3>
          <p class="body">Each floor starts from the answer below it and keeps a change only if the score does not drop.</p>
        </div>
      </div>`;
  },
  step(n, { instant } = {}) {
    revealSteps(this.root, n, instant);
    const net = this.ctx.net;
    this.root.querySelectorAll('.floors li').forEach((li, i) => { li.style.opacity = n >= 3 || i < 3 ? 1 : 0.25; });
    if (!net) return;
    net.show(n >= 2);
    if (n >= 2) { net.setView('explode', instant ? 0 : 1.4); net.setExplode(n >= 3 ? 5 : 3, instant ? 0 : 1.0); net.setMode('cold'); net.labels(false); }
    else net.setExplode(0, 0);
  },
  unmount() { this.ctx.net?.reset(); this.ctx.net?.show(false); },
};
