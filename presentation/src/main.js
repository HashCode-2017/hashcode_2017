import { createRouter } from './router.js';
import { SCENES } from './scenes/index.js';
import { NOTES } from './content/notes.js';
import { startSpeakerView } from './speaker.js';

const params = new URLSearchParams(location.search);
if (params.get('view') === 'speaker') {
  startSpeakerView();
} else {
  startMain();
}

function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }

async function startMain() {
  const stage = document.getElementById('stage');
  const lite = params.has('lite');
  const exportMode = params.has('export'); // used by the PDF exporters

  // ---- theme: projector (light) by default, P toggles the dark theme
  const theme = params.get('theme') || store('sv-theme') || 'light';
  document.documentElement.dataset.theme = theme;

  // ---- scale the 1920x1080 stage to the window
  function fit() {
    const s = Math.min(innerWidth / 1920, innerHeight / 1080);
    stage.style.transform = `translate(-50%, -50%) scale(${s})`;
    stage.style.transformOrigin = '50% 50%';
    window.__stageScale = s;
    net?.resize?.(s);
  }

  await Promise.allSettled([
    '500 20px "Barlow Condensed"', '600 20px "Barlow Condensed"', '700 20px "Barlow Condensed"',
    '400 20px "Barlow"', 'italic 400 20px "Barlow"', '500 20px "Barlow"', '600 20px "Barlow"',
    '400 20px "IBM Plex Mono"', '600 20px "IBM Plex Mono"', '400 20px "JetBrains Mono"', '600 20px "JetBrains Mono"',
    '400 20px "LM Roman 10"', 'italic 400 20px "LM Roman 10"', '700 20px "LM Roman 10"',
  ].map(f => document.fonts.load(f)));
  await document.fonts.ready;

  // ---- 3D network (optional: every scene works without it)
  let net = null;
  try {
    const { createNetwork } = await import('./engines/net3d.js');
    net = await createNetwork({ container: document.getElementById('gl'), labels: document.getElementById('labels'), lite, theme });
  } catch (e) {
    console.warn('3D not available, using 2D fallbacks', e);
  }
  fit();
  addEventListener('resize', fit);

  // ---- speaker window link
  let speakerWin = null;
  const bc = 'BroadcastChannel' in window ? new BroadcastChannel('sv-talk') : null;
  let lastState = null;
  function send(state) {
    lastState = state;
    const msg = { type: 'state', state, notes: NOTES[state.id]?.[state.k] ?? null };
    try { speakerWin && !speakerWin.closed && speakerWin.postMessage(msg, '*'); } catch (e) { /* ignore */ }
    try { bc?.postMessage(msg); } catch (e) { /* ignore */ }
  }
  function onCommand(cmd) {
    if (cmd === 'next') router.next();
    if (cmd === 'prev') router.prev();
    if (cmd === 'black') toggleBlack();
    if (cmd === 'hello' && lastState) send(lastState);
    if (typeof cmd === 'object' && cmd.go) router.go(cmd.go[0], cmd.go[1] ?? 0, { instant: true });
  }
  const seen = new Set();
  const onCmdMsg = d => {
    if (d?.type !== 'cmd') return;
    if (d.id) { if (seen.has(d.id)) return; seen.add(d.id); }
    onCommand(d.cmd);
  };
  addEventListener('message', e => onCmdMsg(e.data));
  if (bc) bc.onmessage = e => onCmdMsg(e.data);

  const ctx = { net, lite, exportMode, stage, get theme() { return document.documentElement.dataset.theme; } };
  const router = createRouter({
    scenes: SCENES, root: document.getElementById('scene-root'), chrome: document.getElementById('chrome'), ctx,
    onChange: send,
  });
  ctx.router = router;
  window.__router = router;

  // ---- keys
  const black = document.getElementById('blackout');
  function toggleBlack() { black.classList.toggle('on'); }
  const help = document.getElementById('help');
  help.innerHTML = `<div class="card"><h3>Controls</h3><table>
    <tr><td><kbd>→</kbd> <kbd>Space</kbd> <kbd>PgDn</kbd></td><td>next step (clickers send PgDn)</td></tr>
    <tr><td><kbd>←</kbd> <kbd>PgUp</kbd></td><td>previous step</td></tr>
    <tr><td><kbd>S</kbd></td><td>open the speaker view</td></tr>
    <tr><td><kbd>B</kbd> <kbd>.</kbd></td><td>black screen</td></tr>
    <tr><td><kbd>P</kbd></td><td>projector (light) / dark theme</td></tr>
    <tr><td><kbd>1</kbd>…<kbd>9</kbd>, <kbd>1</kbd><kbd>6</kbd></td><td>jump to a scene (two digits quickly for 10 and up)</td></tr>
    <tr><td><kbd>R</kbd></td><td>restart the current scene</td></tr>
    <tr><td><kbd>F</kbd></td><td>full screen</td></tr>
    <tr><td><kbd>H</kbd> <kbd>?</kbd></td><td>this help</td></tr></table>
    <p class="small">Add <b>?lite</b> to the address for slow laptops.</p></div>`;
  help.addEventListener('click', () => help.classList.remove('on'));

  function toast(t) { const el = document.getElementById('toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.remove('on'), 1600); }

  let digitBuf = '', digitT = null;
  addEventListener('keydown', e => {
    if (e.target.closest?.('input, textarea, select')) return;
    const key = e.key;
    if (['ArrowRight', 'PageDown', ' ', 'Enter', 'ArrowDown'].includes(key)) { e.preventDefault(); router.next(); return; }
    if (['ArrowLeft', 'PageUp', 'Backspace', 'ArrowUp'].includes(key)) { e.preventDefault(); router.prev(); return; }
    if (key === 'b' || key === 'B' || key === '.') { toggleBlack(); return; }
    if (key === 'p' || key === 'P') {
      const nt = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = nt; store('sv-theme', nt); net?.setTheme(nt);
      router.scene.onTheme?.(nt);
      toast(nt === 'dark' ? 'Dark theme' : 'Projector theme'); return;
    }
    if (key === 's' || key === 'S') {
      speakerWin = window.open(location.pathname + '?view=speaker' + (location.hash || ''), 'sv-speaker', 'width=1280,height=760');
      setTimeout(() => lastState && send(lastState), 600);
      return;
    }
    if (key === 'r' || key === 'R') { router.restart(); return; }
    if (key === 'f' || key === 'F') { if (!document.fullscreenElement) document.documentElement.requestFullscreen?.(); else document.exitFullscreen?.(); return; }
    if (key === 'h' || key === 'H' || key === '?') { help.classList.toggle('on'); return; }
    if (key === 'Escape') { help.classList.remove('on'); black.classList.remove('on'); return; }
    if (/^[0-9]$/.test(key)) {
      digitBuf += key; clearTimeout(digitT);
      digitT = setTimeout(() => {
        let n = Number(digitBuf); digitBuf = '';
        if (n === 0) n = 10;
        if (n >= 1 && n <= SCENES.length) router.go(n - 1, 0, { instant: true });
      }, 450);
    }
  });

  // ---- start at #SS.k if given
  const m = (location.hash || '').match(/^#(\d+)(?:\.(\d+))?/);
  await router.go(m ? Number(m[1]) - 1 : 0, m && m[2] ? Number(m[2]) : 0, { instant: true });
  document.body.classList.add('ready');
  window.__ready = true;
}
