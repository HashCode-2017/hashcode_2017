// Speaker view: open with S in the main window. It follows the main window and can drive it.
import { SCENES } from './scenes/index.js';
import { SLOTS, SECTIONS, TALK_MINUTES } from './content/team.js';
import { NOTES, HANDOVER } from './content/notes.js';

export function startSpeakerView() {
  document.body.classList.add('speaker');
  document.title = 'Speaker view · Streaming Videos';
  const wrap = document.createElement('div');
  wrap.className = 'sp';
  document.body.appendChild(wrap);
  let state = null;

  const bc = 'BroadcastChannel' in window ? new BroadcastChannel('sv-talk') : null;
  let seq = 0;
  const cmd = c => {
    // sent on both channels so it works however the window was opened; the main window drops the duplicate by id
    const m = { type: 'cmd', cmd: c, id: `${Date.now()}-${seq++}` };
    try { window.opener?.postMessage(m, '*'); } catch (e) { /* ignore */ }
    try { bc?.postMessage(m); } catch (e) { /* ignore */ }
  };
  const onMsg = d => { if (d?.type === 'state') { state = d.state; render(); } };
  addEventListener('message', e => onMsg(e.data));
  if (bc) bc.onmessage = e => onMsg(e.data);
  cmd('hello');

  addEventListener('keydown', e => {
    if (['ArrowRight', 'PageDown', ' ', 'Enter'].includes(e.key)) { e.preventDefault(); cmd('next'); }
    if (['ArrowLeft', 'PageUp', 'Backspace'].includes(e.key)) { e.preventDefault(); cmd('prev'); }
    if (e.key === 'b' || e.key === 'B' || e.key === '.') cmd('black');
  });

  const mmss = ms => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

  function render() {
    if (!state) { wrap.innerHTML = '<div><div class="now">Waiting for the main window…</div><p class="meta">Press S in the presentation window.</p></div>'; return; }
    const s = SCENES[state.si];
    const slot = SLOTS[s.part];
    const sec = SECTIONS[slot.section];
    const notes = NOTES[s.id]?.[state.k] ?? [];
    const nextScene = state.k < s.steps - 1 ? null : SCENES[state.si + 1];
    const nextNote = state.k < s.steps - 1 ? (NOTES[s.id]?.[state.k + 1]?.[0] ?? '') : '';
    const handTo = nextScene && SLOTS[nextScene.part].name !== slot.name ? SLOTS[nextScene.part].name : null;
    const partMs = Date.now() - (state.partStart[s.part] ?? Date.now());
    const limit = slot.minutes * 60000;
    const cls = partMs > limit ? 'over' : partMs > limit - 20000 ? 'warn' : '';
    const talkMs = Date.now() - state.t0;
    const tcls = talkMs > TALK_MINUTES * 60000 ? 'over' : '';
    wrap.innerHTML = `
      <div>
        <div class="meta">Scene ${String(state.si + 1).padStart(2, '0')} / ${SCENES.length} · Part ${slot.section} · ${sec.name} · ${slot.name}${s.minutes ? ' · target ' + s.minutes + ' min' : ''}</div>
        <div class="now">${s.title}</div>
        <div class="stepbar">${Array.from({ length: s.steps }, (_, i) => `<i class="${i <= state.k ? 'on' : ''}"></i>`).join('')}</div>
        <div class="meta" style="margin-top:8px">Step ${state.k + 1} of ${s.steps}</div>
        <ul class="notes">${notes.map(n => n.startsWith('SAY:') ? `<li class="say">“${n.slice(4).trim()}”</li>` : `<li>${n}</li>`).join('')}</ul>
        ${handTo && HANDOVER[s.id] ? `<div class="handover">Handover to ${handTo}: “${HANDOVER[s.id]}”</div>` : ''}
      </div>
      <div class="side">
        <div class="box"><div class="meta">${slot.name} · ${slot.part}</div><div class="timer ${cls}">${mmss(partMs)}</div><div class="meta">of ${mmss(limit)}</div></div>
        <div class="box"><div class="meta">Whole talk · target ${TALK_MINUTES}:00</div><div class="timer ${tcls}" style="font-size:40px">${mmss(talkMs)}</div></div>
        <div class="box next">${nextScene ? `Next scene<b>${String(state.si + 2).padStart(2, '0')} · ${nextScene.title}</b>${handTo ? `<span>${handTo} takes over</span>` : ''}` : nextNote ? `Next step<b style="font-size:21px;text-transform:none;font-family:var(--font-body)">${nextNote.replace(/^SAY:/, '')}</b>` : 'Last step'}</div>
        <div class="ctl"><button data-c="prev">◀ Back</button><button data-c="black">Black</button><button data-c="next">Next ▶</button></div>
        <div class="meta" style="font-size:15px">Keys work here too: → ← B</div>
      </div>`;
    wrap.querySelectorAll('[data-c]').forEach(b => b.onclick = () => cmd(b.dataset.c));
  }
  render();
  setInterval(render, 1000);
}
