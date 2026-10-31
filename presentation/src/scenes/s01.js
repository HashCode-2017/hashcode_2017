// 01 · Title, then the cold network: every request travels to the far data center
import { html, revealSteps } from '../engines/dom.js';
import { TALK } from '../content/facts.js';

export default {
  id: 's01', title: 'Streaming Videos', part: 'A', source: 'Statement · example network (3D view is ours)', steps: 2, minutes: 0.3, chromeMinimal: true,
  mount(root, ctx) {
    this.root = root; this.ctx = ctx;
    const net = ctx.net;
    net?.reset(); net?.show(true); net?.setView('title', 0); net?.spin(!ctx.exportMode);
    root.innerHTML = html`
      <div class="titlecard" data-step="0" data-until="0" data-fx="left">
        <div class="eyebrow">${TALK.contest}</div>
        <h1>${TALK.title}</h1>
        <div class="sub">${TALK.subtitle}</div>
        <div class="team"><span class="grp">${TALK.group}</span>${TALK.members.join(' · ')}</div>
        <div class="small" style="margin-top:18px">${TALK.course}</div>
      </div>
      <div data-step="1" style="position:absolute;left:72px;top:150px;width:720px">
        <div class="kicker">Every video lives far away</div>
        <p class="body" style="margin-top:16px">Without caches, every request goes to the <b class="c-dc">data center</b> and back. That is slow.</p>
        <div class="overlay-panel legend3d" style="position:relative;margin-top:30px;width:560px">
          <div><i></i>cache link · fast (100–300 ms)</div>
          <div><i class="dash"></i>data-center route · slow (500–1000 ms)</div>
          <div class="small">Coloured cubes = requests, one colour per video. Cable length follows latency.</div>
        </div>
      </div>
      ${ctx.net ? '' : '<div class="overlay-panel" style="right:72px;top:420px;width:620px"><b>3D view unavailable.</b> The network is drawn in 2D on the next scene.</div>'}`;
  },
  step(n, { instant } = {}) {
    revealSteps(this.root, n, instant);
    const net = this.ctx.net;
    if (!net) return;
    net.setMode(n >= 1 ? 'cold' : 'idle');
    net.setView('title', instant ? 0 : 1.6);
    net.spin(n === 0 && !this.ctx.exportMode);
  },
  unmount() { this.ctx.net?.reset(); this.ctx.net?.show(false); },
};
