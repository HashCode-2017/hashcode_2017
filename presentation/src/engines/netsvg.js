// A flat drawing of any small instance: data center on the left, caches in the middle, endpoints on the right.
// Caches are racks with a capacity bar filled by video cartridges (width = MB); endpoint cards list their
// requests and where each one is served from. Used by the worked examples and the playground.
import { svg, text, vcol, fmt } from './dom.js';
import { bestLatency, used } from '../solver/engine.js';

export function drawNetwork(parent, inst, { W = 1100, H = 720, names = {}, cacheW = 250 } = {}) {
  const s = svg('svg', { class: 'net', width: W, height: H, viewBox: `0 0 ${W} ${H}` }, parent);
  const gLinks = svg('g', {}, s), gNodes = svg('g', {}, s);
  const cn = c => names.cache?.[c] ?? `Cache ${c}`;
  const en = e => names.endpoint?.[e] ?? `Endpoint ${e}`;
  const vn = v => names.video?.[v] ?? `v${v}`;

  const dc = { x: 20, y: H / 2 - 90, w: 150, h: 180 };
  // endpoint cards: one column if they fit, otherwise two narrower columns with tighter rows
  const rowsOf = e => inst.byEndpoint[e].length;
  const head = 60; // card header + bottom padding
  const oneColH = rh => [...Array(inst.E).keys()].reduce((a, e) => a + head + rowsOf(e) * rh, 0) + (inst.E + 1) * 16;
  let cols = 1, rowH = 38, cardW = 370;
  if (oneColH(38) > H) {
    if (oneColH(30) <= H) rowH = 30;
    else { cols = 2; cardW = 312; }
  }
  const colOf = [], colH = Array(cols).fill(0);
  // in order: the first endpoints go left until about half the rows, the rest go right
  const allRows = [...Array(inst.E).keys()].reduce((a, e) => a + rowsOf(e), 0);
  for (let e = 0, acc = 0; e < inst.E; e++) {
    const c = cols === 1 || e === 0 || (acc + rowsOf(e) / 2 <= allRows / 2 && colH[1] === 0) ? 0 : 1;
    colOf[e] = c; colH[c] += rowsOf(e); acc += rowsOf(e);
  }
  if (cols === 2) {
    rowH = Math.max(24, Math.min(36, Math.floor(Math.min(...colH.map((n, c) => n ? (H - 16 * (colOf.filter(x => x === c).length + 1) - head * colOf.filter(x => x === c).length) / n : 99)))));
  }
  const cacheX = cols === 1 ? W * 0.36 : 200, cW = cols === 1 ? cacheW : Math.min(cacheW, 215);
  if (cols === 2) s.classList.add('compact');
  const cH = Math.min(150, (H - 40) / inst.C - 24);
  const caches = [...Array(inst.C).keys()].map(c => ({ x: cacheX, y: 20 + c * ((H - 40) / inst.C) + ((H - 40) / inst.C - cH) / 2, w: cW, h: cH }));
  const eps = [...Array(inst.E).keys()].map(e => {
    const n = rowsOf(e);
    return { x: W - (cols - colOf[e]) * (cardW + 10) + 10, w: cardW, h: head + n * rowH, n, col: colOf[e] };
  });
  for (let c = 0; c < cols; c++) {
    const mine = eps.filter(ep => ep.col === c);
    const totalH = mine.reduce((a, b) => a + b.h, 0), gap = Math.max(12, (H - totalH) / (mine.length + 1));
    let y = gap; mine.forEach(ep => { ep.y = y; y += ep.h + gap; });
  }

  // links
  const links = {};
  const mkLink = (e, server, x1, y1, x2, y2, ms) => {
    const g = svg('g', { class: `link ${server === 'dc' ? 'dc' : 'cache'}` }, gLinks);
    const mx = (x1 + x2) / 2;
    const p = svg('path', { d: `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}` }, g);
    const tx = text(g, mx, (y1 + y2) / 2 - 8, `${ms} ms`, { 'text-anchor': 'middle', class: 'lat' });
    links[`${e}:${server}`] = { g, p, tx };
  };
  eps.forEach((ep, e) => {
    const ey = ep.y + 30;
    mkLink(e, 'dc', ep.x, ey, dc.x + dc.w, dc.y + dc.h / 2, inst.ld[e]);
    inst.links[e].forEach(([c, ms]) => mkLink(e, c, ep.x, ey, caches[c].x + caches[c].w, caches[c].y + caches[c].h / 2, ms));
  });

  // data center
  const gdc = svg('g', { class: 'dcnode' }, gNodes);
  svg('rect', { x: dc.x, y: dc.y, width: dc.w, height: dc.h, rx: 4 }, gdc);
  for (let r = 0; r < 4; r++) svg('rect', { class: 'win', x: dc.x + 16, y: dc.y + 58 + r * 26, width: dc.w - 32, height: 10 }, gdc);
  text(gdc, dc.x + dc.w / 2, dc.y + 30, 'DATA CENTER', { 'text-anchor': 'middle', class: 'nlabel inv' });
  text(gdc, dc.x + dc.w / 2, dc.y + dc.h + 28, 'every video · slow', { 'text-anchor': 'middle', class: 'nsub' });

  // caches
  const cacheEls = caches.map((r, c) => {
    const g = svg('g', { class: 'cachenode' }, gNodes);
    svg('rect', { class: 'rack', x: r.x, y: r.y, width: r.w, height: r.h, rx: 4 }, g);
    text(g, r.x + 14, r.y + 30, cn(c), { class: 'nlabel inv' });
    const cap = text(g, r.x + r.w - 14, r.y + 30, '', { 'text-anchor': 'end', class: 'nsub inv' });
    const barY = r.y + r.h - 62, barW = r.w - 28;
    svg('rect', { class: 'bay', x: r.x + 14, y: barY, width: barW, height: 46 }, g);
    const slots = svg('g', {}, g);
    return { g, r, cap, slots, barY, barW };
  });

  // endpoints
  const epEls = eps.map((ep, e) => {
    const g = svg('g', { class: 'epnode' }, gNodes);
    svg('rect', { class: 'epbox', x: ep.x, y: ep.y, width: ep.w, height: ep.h, rx: 6 }, g);
    text(g, ep.x + 16, ep.y + 34, en(e), { class: 'nlabel' });
    text(g, ep.x + ep.w - 16, ep.y + 34, inst.links[e].length ? `${inst.links[e].length} cache${inst.links[e].length > 1 ? 's' : ''}` : 'no cache', { 'text-anchor': 'end', class: 'nsub' });
    const rows = inst.byEndpoint[e].map((r, i) => {
      const cy = ep.y + 46 + rowH * (i + 0.5), yy = cy + 8, bh = Math.min(28, rowH - 4);
      const rg = svg('g', { class: 'req' }, g);
      svg('rect', { x: ep.x + 14, y: cy - bh / 2, width: cols === 1 ? 54 : 46, height: bh, fill: vcol(r.v), rx: 2 }, rg);
      text(rg, ep.x + (cols === 1 ? 41 : 37), yy - 2, vn(r.v), { 'text-anchor': 'middle', class: 'vlabel' });
      text(rg, ep.x + (cols === 1 ? 80 : 70), yy - 2, `×${fmt(r.n)}`, { class: 'rq' });
      const served = text(rg, ep.x + ep.w - (cols === 1 ? 16 : 12), yy - 2, '', { 'text-anchor': 'end', class: 'served' });
      return { r, served };
    });
    return { g, rows };
  });

  function set(placed, { show = true } = {}) {
    cacheEls.forEach((ce, c) => {
      ce.slots.innerHTML = '';
      let x = ce.r.x + 14;
      for (const v of placed[c]) {
        const w = inst.sizes[v] / inst.X * ce.barW;
        const g = svg('g', { class: 'cart' }, ce.slots);
        svg('rect', { x: x + 1, y: ce.barY + 2, width: Math.max(2, w - 2), height: 42, fill: vcol(v) }, g);
        if (w > 34) text(g, x + w / 2, ce.barY + 30, vn(v), { 'text-anchor': 'middle', class: 'vlabel' });
        x += w;
      }
      ce.cap.textContent = `${used(inst, placed[c])} / ${inst.X} MB`;
    });
    Object.values(links).forEach(l => l.g.classList.remove('hot'));
    epEls.forEach((ee, e) => ee.rows.forEach(({ r, served }) => {
      const best = bestLatency(inst, placed, r.e, r.v);
      let from = 'dc';
      for (const [c, L] of inst.links[r.e]) if (L === best && placed[c].has(r.v)) { from = c; break; }
      served.textContent = show ? (from === 'dc' ? `DC · ${best} ms` : `${cn(from).toLowerCase()} · ${best} ms`) : '';
      served.setAttribute('class', 'served ' + (from === 'dc' ? 'slow' : 'fast'));
      if (show && from !== 'dc') links[`${e}:${from}`]?.g.classList.add('hot');
    }));
  }
  function mark(c, cls, on = true) { cacheEls[c]?.g.classList.toggle(cls, on); }
  function clearMarks() { cacheEls.forEach(ce => ce.g.classList.remove('focus', 'drop', 'place', 'dim')); }
  // a cartridge floating next to a cache: the candidate being considered
  function ghost(c, v, cls = '') {
    s.querySelectorAll('.ghost').forEach(n => n.remove());
    if (c == null) return;
    const ce = cacheEls[c];
    const w = inst.sizes[v] / inst.X * ce.barW;
    const g = svg('g', { class: 'ghost ' + cls }, gNodes);
    svg('rect', { x: ce.r.x - w - 26, y: ce.barY + 2, width: w, height: 42, fill: vcol(v) }, g);
    text(g, ce.r.x - w / 2 - 26, ce.barY + 30, vn(v), { 'text-anchor': 'middle', class: 'vlabel' });
  }
  return { svg: s, set, mark, clearMarks, ghost, links, caches: cacheEls, eps: epEls };
}
