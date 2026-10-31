// 02 · The problem in one minute, on the statement's own example, and the score
import { html, revealSteps, fmt, countTo } from '../engines/dom.js';
import { drawNetwork } from '../engines/netsvg.js';
import { STATEMENT } from '../content/facts.js';
import { parse, emptyPlacement, score } from '../solver/engine.js';

export default {
  id: 's02', title: 'The problem in one minute', part: 'A', source: 'Statement · example input, example submission, scoring', steps: 4, minutes: 0.7,
  mount(root, ctx) {
    this.root = root;
    ctx.net?.show(false);
    this.inst = parse(STATEMENT.exampleIn);
    this.subm = STATEMENT.exampleSubmission.map(a => new Set(a));
    root.innerHTML = html`
      <div class="area">
        <div class="netwrap" style="position:absolute;left:0;top:0"></div>
        <div style="position:absolute;left:1130px;top:0;right:0;display:flex;flex-direction:column;gap:22px">
          <div data-step="0">
            <span class="tag statement">from the statement</span>
            <p class="body" style="margin:12px 0 0">5 videos, <b>3 caches of 100 MB</b>, 2 user groups (endpoints). Endpoint 1 has no cache at all.</p>
          </div>
          <div data-step="1" class="card accent">
            <h3>Our choice</h3>
            <p class="body">Which videos to copy into which caches. A video may sit in several caches, or none.</p>
            <p class="body" style="margin-top:10px">Each request is served by the <b>fastest</b> place that holds the video.</p>
          </div>
          <div data-step="2" class="card dcacc">
            <h3>The score</h3>
            <div class="math" style="margin:6px 0 4px">score = 1000 × <span style="display:inline-block;vertical-align:middle;text-align:center"><span style="display:block;border-bottom:2px solid var(--ink);padding:0 6px">Σ requests × time saved</span><span style="display:block">Σ requests</span></span></div>
            <p class="small">${STATEMENT.scoreRule}</p>
          </div>
          <div data-step="2" class="scorebox"><span class="small">Statement's answer</span><span class="big-num s-score">0</span></div>
          <div data-step="3" class="kicker" style="font-size:40px">Can we beat <span class="c-fibre">${fmt(STATEMENT.exampleSubmissionScore)}</span>?</div>
        </div>
      </div>`;
    this.net = drawNetwork(root.querySelector('.netwrap'), this.inst, { W: 1080, H: 760 });
  },
  step(n, { instant } = {}) {
    revealSteps(this.root, n, instant);
    const p = n >= 2 ? this.subm : emptyPlacement(this.inst);
    this.net.set(p, { show: n >= 1 });
    countTo(this.root.querySelector('.s-score'), n >= 2 ? score(this.inst, this.subm) : 0, { instant });
  },
  unmount() {},
};
