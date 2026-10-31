// Small SVG charts in the talk's style. Bars grow on reveal (CSS transitions), values come from facts.js / tables.js.
import { svg, text, fmt } from './dom.js';

// horizontal bars. rows: [{label, value, cls, note}] ; axis from `min` (stated on the chart when not 0)
export function hbars(parent, rows, { W = 900, rowH = 46, gap = 12, labelW = 260, min = 0, max = null, valueFmt = fmt, unit = '' } = {}) {
  const hi = max ?? Math.max(...rows.map(r => r.value));
  const H = rows.length * (rowH + gap) + 34;
  const s = svg('svg', { class: 'chart hbars', width: W, height: H, viewBox: `0 0 ${W} ${H}` }, parent);
  const plotW = W - labelW - 170;
  const x = v => labelW + Math.max(0, (v - min) / (hi - min)) * plotW;
  const els = rows.map((r, i) => {
    const y = i * (rowH + gap);
    const g = svg('g', { class: `row ${r.cls || ''}` }, s);
    text(g, labelW - 14, y + rowH / 2 + 8, r.label, { 'text-anchor': 'end', class: 'lab' });
    svg('rect', { class: 'track', x: labelW, y, width: plotW, height: rowH }, g);
    const bar = svg('rect', { class: 'bar', x: labelW, y, width: 0, height: rowH }, g);
    const val = text(g, x(r.value) + 12, y + rowH / 2 + 8, valueFmt(r.value) + unit, { class: 'val' });
    if (r.note) text(g, x(r.value) + 12, y + rowH / 2 + 30, r.note, { class: 'note' });
    return { g, bar, w: x(r.value) - labelW, val };
  });
  if (min > 0) text(s, labelW, H - 6, `axis starts at ${valueFmt(min)}`, { class: 'axisnote' });
  return {
    svg: s,
    grow(on = true, stagger = 70) { els.forEach((e, i) => { e.bar.style.transitionDelay = `${on ? i * stagger : 0}ms`; e.bar.setAttribute('width', on ? Math.max(2, e.w) : 0); e.val.style.opacity = on ? 1 : 0; e.val.style.transitionDelay = `${on ? i * stagger + 300 : 0}ms`; }); },
    rows: els,
  };
}

// grouped "before → after" bars for a few named items, values on a common scale
export function pairs(parent, rows, { W = 900, rowH = 30, gap = 26, labelW = 200, max = null, aLabel = 'before', bLabel = 'after' } = {}) {
  const hi = max ?? Math.max(...rows.flatMap(r => [r.a, r.b]));
  const H = rows.length * (rowH * 2 + 6 + gap) + 40;
  const s = svg('svg', { class: 'chart pairs', width: W, height: H, viewBox: `0 0 ${W} ${H}` }, parent);
  const plotW = W - labelW - 220;
  const els = [];
  rows.forEach((r, i) => {
    const y = i * (rowH * 2 + 6 + gap);
    text(s, labelW - 14, y + rowH + 10, r.label, { 'text-anchor': 'end', class: 'lab' });
    [['a', r.a, r.aNote], ['b', r.b, r.bNote]].forEach(([k, v, note], j) => {
      const yy = y + j * (rowH + 6);
      svg('rect', { class: 'track', x: labelW, y: yy, width: plotW, height: rowH }, s);
      const bar = svg('rect', { class: `bar ${k}`, x: labelW, y: yy, width: 0, height: rowH }, s);
      const val = text(s, labelW + v / hi * plotW + 10, yy + rowH - 7, `${fmt(v)}${note ? '  ·  ' + note : ''}`, { class: `val ${k}` });
      els.push({ bar, w: v / hi * plotW, val });
    });
  });
  const ly = H - 14;
  svg('rect', { class: 'bar a', x: labelW, y: ly - 14, width: 18, height: 14 }, s); text(s, labelW + 26, ly, aLabel, { class: 'legend' });
  svg('rect', { class: 'bar b', x: labelW + 230, y: ly - 14, width: 18, height: 14 }, s); text(s, labelW + 256, ly, bLabel, { class: 'legend' });
  return { svg: s, grow(on = true) { els.forEach((e, i) => { e.bar.style.transitionDelay = `${on ? i * 60 : 0}ms`; e.bar.setAttribute('width', on ? Math.max(2, e.w) : 0); e.val.style.opacity = on ? 1 : 0; }); } };
}

// heat map: rows x cols, value in [0,1] (share of the best); hover shows the raw score
export function heatmap(parent, { rows, cols, value, raw, W = 1100, H = 560, rowLabelW = 130, highlightCol = null, tip }) {
  const s = svg('svg', { class: 'chart heat', width: W, height: H, viewBox: `0 0 ${W} ${H}` }, parent);
  const cw = (W - rowLabelW) / cols.length, ch = (H - 40) / rows.length;
  cols.forEach((c, j) => text(s, rowLabelW + j * cw + cw / 2, 26, c, { 'text-anchor': 'middle', class: `colh ${c === highlightCol ? 'me' : ''}` }));
  const cells = [];
  rows.forEach((r, i) => {
    text(s, rowLabelW - 12, 40 + i * ch + ch / 2 + 7, r, { 'text-anchor': 'end', class: 'rowh' });
    cols.forEach((c, j) => {
      const v = value(i, j);
      const cl = v >= 0.99999 ? 'best' : v >= 0.995 ? 'v1' : v >= 0.98 ? 'v2' : v >= 0.9 ? 'v3' : 'v4';
      const rect = svg('rect', { class: `cell ${cl}`, x: rowLabelW + j * cw + 2, y: 40 + i * ch + 2, width: cw - 4, height: ch - 4 }, s);
      rect.addEventListener('mouseenter', ev => tip?.(ev, r, c, v, raw?.(i, j)));
      rect.addEventListener('mouseleave', () => tip?.(null));
      cells.push({ rect, i, j, v });
    });
  });
  if (highlightCol != null) {
    const j = cols.indexOf(highlightCol);
    svg('rect', { class: 'colframe', x: rowLabelW + j * cw, y: 34, width: cw, height: H - 36 }, s);
  }
  return { svg: s, cells };
}
