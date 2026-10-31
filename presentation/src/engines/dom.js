// tiny DOM helpers shared by all scenes
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function html(strings, ...vals) {
  let s = '';
  strings.forEach((str, i) => { s += str + (i < vals.length ? (Array.isArray(vals[i]) ? vals[i].join('') : vals[i] ?? '') : ''); });
  return s;
}

export const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const SVGNS = 'http://www.w3.org/2000/svg';
export function svg(tag, attrs = {}, parent) {
  const n = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) n.setAttribute(k, v);
  if (parent) parent.appendChild(n);
  return n;
}
export function text(parent, x, y, str, attrs = {}) { const t = svg('text', { x, y, ...attrs }, parent); t.textContent = str; return t; }

// reveal elements with data-step="k" (and optional data-until="k") for step n
export function revealSteps(root, n, instant = false) {
  if (instant) root.classList.add('instant');
  for (const e of root.querySelectorAll('[data-step]')) {
    const from = Number(e.dataset.step);
    const until = e.dataset.until !== undefined ? Number(e.dataset.until) : Infinity;
    e.classList.toggle('is-on', n >= from && n <= until);
    e.classList.toggle('is-past', n > from);
  }
  if (instant) { void root.offsetWidth; requestAnimationFrame(() => root.classList.remove('instant')); }
}

export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const fmt = n => Math.round(n).toLocaleString('en-US');
export const pct = (x, d = 1) => (x * 100).toFixed(d) + '%';

// count a number up inside an element
export function countTo(el, to, { from = null, dur = 900, instant = false, format = fmt } = {}) {
  cancelAnimationFrame(el._raf);
  const start = from ?? Number(el.dataset.v || 0);
  el.dataset.v = to;
  if (instant || dur <= 0) { el.textContent = format(to); return; }
  const t0 = performance.now();
  const tick = now => {
    const u = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - u, 3);
    el.textContent = format(start + (to - start) * e);
    if (u < 1) el._raf = requestAnimationFrame(tick);
  };
  el._raf = requestAnimationFrame(tick);
}

// a scene-local tooltip
export function tooltip(root) {
  const tip = document.createElement('div'); tip.className = 'tip'; root.appendChild(tip);
  return {
    show(t, x, y) { tip.innerHTML = t; tip.style.left = x + 'px'; tip.style.top = y + 'px'; tip.classList.add('on'); },
    hide() { tip.classList.remove('on'); },
  };
}

// convert a client mouse position to stage coordinates
export function stageXY(ctx, e) {
  const r = ctx.stage.getBoundingClientRect();
  const s = r.width / 1920;
  return [(e.clientX - r.left) / s, (e.clientY - r.top) / s];
}

// video colours: one muted hue per video id (tape-cartridge labels)
export const VIDEO_COLORS = ['var(--vid0)', 'var(--vid1)', 'var(--vid2)', 'var(--vid3)', 'var(--vid4)', 'var(--vid5)', 'var(--vid6)', 'var(--vid7)'];
export const vcol = v => VIDEO_COLORS[v % VIDEO_COLORS.length];
