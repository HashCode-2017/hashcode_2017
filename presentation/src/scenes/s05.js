// 05 · After each round: evict and swap. Then the ratio rule's blind spot, fixed by an exact knapsack per cache.
import { html, revealSteps, fmt, sleep } from '../engines/dom.js';
import { knapsack, ratioFill } from '../solver/engine.js';

const ITEMS = [{ v: 'A', w: 6, val: 600, col: 'var(--vid0)' }, { v: 'B', w: 5, val: 450, col: 'var(--vid1)' }, { v: 'C', w: 5, val: 450, col: 'var(--vid2)' }];

export default {
  id: 's05', title: 'When "best per MB" is fooled', part: 'B', source: 'Our pipeline, step 2 (PIPELINE.md §2) · numbers are an illustration', steps: 5, minutes: 1.2,
  mount(root, ctx) {
    this.root = root; this.ctx = ctx; this.token = 0;
    ctx.net?.show(false);
    this.cap = 10;
    root.innerHTML = html`
      <div class="area">
        <div data-step="0" data-until="0" class="cards" style="grid-template-columns:1fr 1fr;width:1500px">
          <div class="card accent"><h3>Evict <small>after every round</small></h3><p class="body">A copy that no longer saves anything (users get the video as fast from another cache) is removed. The score is unchanged and the space goes back into the next round.</p></div>
          <div class="card gacc"><h3>Swap <small>after every round</small></h3><p class="body">The weakest copy is traded for an outside video when the trade saves strictly more. Up to 20 candidates, 50 swaps per cache.</p></div>
        </div>
        <div data-step="1" style="position:absolute;left:0;top:0;width:820px">
          <div class="eyebrow">One cache · <span class="capv">${this.cap}</span> MB <span class="tag ours" style="margin-left:10px">illustration</span></div>
          <table class="tbl" style="margin-top:10px;width:640px">
            <tr><th>Video</th><th class="n">Size</th><th class="n">Saves</th><th class="n">Per MB</th></tr>
            ${ITEMS.map(it => `<tr><td><span class="chipv" style="background:${it.col};color:#fff;font-family:var(--font-mono);padding:2px 10px">${it.v}</span></td><td class="n">${it.w} MB</td><td class="n">${it.val}</td><td class="n">${it.val / it.w}</td></tr>`)}
          </table>
          <div class="eyebrow" style="margin-top:30px">Greedy, best per MB first</div>
          <div class="strip s-greedy" style="margin-top:8px;width:640px"></div>
          <div class="body" style="margin-top:6px">Takes A, then nothing else fits → <b class="v-greedy"></b></div>
          <div data-step="3" style="margin-top:26px">
            <div class="eyebrow">Exact knapsack</div>
            <div class="strip s-dp" style="margin-top:8px;width:640px"></div>
            <div class="body" style="margin-top:6px">→ <b class="c-pass v-dp"></b></div>
          </div>
          <div data-step="4" class="ctrl" style="margin-top:26px"><label>Try another cache size <input type="range" min="5" max="16" value="10" class="capin"></label></div>
        </div>
        <div data-step="2" style="position:absolute;left:880px;top:0;right:0">
          <p class="body" style="margin:0 0 16px"><b>Freeze every other cache.</b> Then each video's value in this cache is a fixed number, so filling it is <b>exactly a 0/1 knapsack</b>, solved by dynamic programming.</p>
          <div class="dpwrap"></div>
          <p class="small" style="margin-top:10px">Cell = best saving using the videos up to this row with this many MB. Each cell: skip the video, or take it and add its saving to the best answer with its size removed.</p>
        </div>
        <div data-step="4" class="card pacc" style="position:absolute;left:880px;bottom:0;right:0">
          <h3>Repeat, cache after cache</h3>
          <p class="body">Until a full pass changes nothing. Every change raises the score, so it always stops. Its limit: it moves <b>one</b> cache at a time.</p>
        </div>
      </div>`;
    this.root.querySelector('.capin').addEventListener('input', e => { this.cap = Number(e.target.value); this.render(this.k, true); });
  },
  strip(el, chosen, cap) {
    const W = 628;
    const usedMB = chosen.reduce((s, it) => s + it.w, 0);
    el.innerHTML = chosen.map(it => `<div class="slot" style="width:${it.w / cap * W}px;background:${it.col}">${it.v} · ${it.w}</div>`).join('') + (cap - usedMB > 0 ? `<div class="waste" style="width:${(cap - usedMB) / cap * W}px">${cap - usedMB} MB wasted</div>` : '');
  },
  async drawDP(n, instant) {
    const tok = ++this.token;
    const cap = this.cap;
    const { table, chosen } = knapsack(ITEMS, cap, { keepTable: true });
    const wrap = this.root.querySelector('.dpwrap');
    const cols = [...Array(cap + 1).keys()];
    wrap.innerHTML = `<table class="dp"><tr><th></th>${cols.map(x => `<th>${x}</th>`).join('')}</tr>${ITEMS.map((it, i) => `<tr><td class="rowh">+ ${it.v} <span class="small">(${it.w} MB, ${it.val})</span></td>${cols.map(x => `<td class="empty" data-i="${i + 1}" data-x="${x}">${table[i + 1][x]}</td>`).join('')}</tr>`).join('')}</table>`;
    const cells = [...wrap.querySelectorAll('td[data-i]')];
    if (n < 2) return;
    for (const td of cells) {
      if (tok !== this.token) return;
      const i = Number(td.dataset.i), x = Number(td.dataset.x);
      td.classList.remove('empty');
      if (table[i][x] !== table[i - 1][x]) td.classList.add('take');
      if (!instant && !this.ctx.exportMode) await sleep(22);
    }
    if (n >= 3) { // walk back the chosen items
      let x = cap;
      for (let i = ITEMS.length; i > 0; i--) {
        wrap.querySelector(`td[data-i="${i}"][data-x="${x}"]`)?.classList.add('path');
        if (table[i][x] !== table[i - 1][x]) x -= ITEMS[i - 1].w;
      }
    }
    return chosen;
  },
  render(n, instant) {
    const cap = this.cap;
    this.root.querySelector('.capv').textContent = cap;
    const g = ratioFill(ITEMS, cap), d = knapsack(ITEMS, cap);
    this.strip(this.root.querySelector('.s-greedy'), g.chosen, cap);
    this.strip(this.root.querySelector('.s-dp'), d.chosen, cap);
    this.root.querySelector('.v-greedy').textContent = fmt(g.best);
    this.root.querySelector('.v-dp').textContent = `${d.chosen.map(it => it.v).join(' + ')} = ${fmt(d.best)}${d.best > g.best ? `  (+${Math.round((d.best / g.best - 1) * 100)}%)` : '  (same as greedy here)'}`;
    this.drawDP(n, instant);
  },
  step(n, { instant } = {}) {
    this.k = n;
    revealSteps(this.root, n, instant);
    if (n < 4 && this.cap !== 10) { this.cap = 10; this.root.querySelector('.capin').value = 10; }
    this.render(n, instant);
  },
  unmount() { this.token++; },
};
