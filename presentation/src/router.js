// The router turns every clicker press into one build step.
// Scene contract: { id, title, part, source, steps, minutes, mount(root, ctx), step(n, opts), unmount() }
import { SLOTS, SECTIONS } from './content/team.js';
import { TALK } from './content/facts.js';

export function createRouter({ scenes, root, chrome, ctx, onChange }) {
  let si = -1, k = 0, cur = null, busy = false;
  const partStart = {};      // slot letter -> timestamp when that slot started
  const t0 = Date.now();

  function agenda(sec) {
    return Object.entries(SECTIONS).map(([id, s]) => `<span class="${Number(id) === sec ? 'on' : Number(id) < sec ? 'past' : ''}"><i>${id}</i>${s.short}</span>`).join('');
  }
  function renderChrome() {
    const s = scenes[si];
    const slot = SLOTS[s.part];
    const sec = SECTIONS[slot.section];
    chrome.classList.toggle('minimal', !!s.chromeMinimal);
    chrome.classList.toggle('hide', !!s.chromeHidden);
    chrome.innerHTML = `
      <div class="chrome-top">
        <div class="scene-no">${String(si + 1).padStart(2, '0')}</div>
        <div class="scene-title">${s.title}</div>
        <div class="scene-part">${slot.section} · ${sec.name}<br><b>${slot.name}</b></div>
      </div>
      <div class="chrome-bottom">
        <span class="src">${s.source || ''}</span>
        <span class="dots">${Array.from({ length: s.steps }, (_, i) => `<i class="${i <= k ? 'on' : ''}"></i>`).join('')}</span>
        <span class="agenda">${agenda(slot.section)}</span>
      </div>`;
  }
  function updateDots() {
    chrome.querySelectorAll('.dots i').forEach((d, i) => d.classList.toggle('on', i <= k));
  }

  function notify() {
    const s = scenes[si];
    if (!partStart[s.part]) partStart[s.part] = Date.now();
    try { history.replaceState(null, '', `#${String(si + 1).padStart(2, '0')}.${k}`); } catch (e) { /* file:// in some browsers */ }
    onChange?.({ si, k, id: s.id, steps: s.steps, partStart: { ...partStart }, t0 });
  }

  async function go(nsi, nk = 0, { instant = false, dir = 1 } = {}) {
    nsi = Math.max(0, Math.min(scenes.length - 1, nsi));
    if (nsi !== si) {
      if (cur) { try { cur.unmount?.(); } catch (e) { console.error(e); } }
      root.innerHTML = '';
      si = nsi; cur = scenes[si];
      const sroot = document.createElement('div');
      sroot.className = 'scene scene-' + cur.id;
      root.appendChild(sroot);
      k = Math.max(0, Math.min(cur.steps - 1, nk));
      renderChrome();
      try { await cur.mount(sroot, ctx); } catch (e) { console.error('mount', cur.id, e); }
      try { cur.step(k, { instant: true, dir, entering: true }); } catch (e) { console.error('step', cur.id, e); }
    } else {
      const nk2 = Math.max(0, Math.min(cur.steps - 1, nk));
      if (nk2 === k && !instant) return notify();
      const d = nk2 > k ? 1 : -1;
      const jump = Math.abs(nk2 - k) > 1;
      k = nk2;
      updateDots();
      try { cur.step(k, { instant: instant || jump, dir: d }); } catch (e) { console.error('step', cur.id, e); }
    }
    notify();
  }

  async function next() {
    if (busy) return; busy = true;
    try {
      if (k < scenes[si].steps - 1) await go(si, k + 1);
      else if (si < scenes.length - 1) await go(si + 1, 0, { dir: 1 });
    } finally { busy = false; }
  }
  async function prev() {
    if (busy) return; busy = true;
    try {
      if (k > 0) await go(si, k - 1, { instant: false });
      else if (si > 0) await go(si - 1, scenes[si - 1].steps - 1, { instant: true, dir: -1 });
    } finally { busy = false; }
  }
  async function restart() { const s = si; si = -1; await go(s, 0); }

  return {
    go, next, prev, restart,
    get index() { return si; }, get step() { return k; }, get scene() { return scenes[si]; },
    scenes, partStart, cite: TALK.cite,
  };
}
