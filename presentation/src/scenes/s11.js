// 11 · SWOT of the final solver
import { html, revealSteps, fmt, pct } from '../engines/dom.js';
import { PIPELINE, GOOGLE, CODE } from '../content/facts.js';
import { contestStats } from './s08.js';

export default {
  id: 's11', title: 'SWOT', part: 'D', source: 'Our measurements (scenes 08–10) · class sheet · local contest', steps: 4, minutes: 1.0,
  mount(root, ctx) {
    this.root = root; ctx.net?.show(false);
    const S = contestStats();
    const vid = GOOGLE.rows.find(r => r.name === 'videos_worth_spreading');
    root.innerHTML = html`
      <div class="area"><div class="swot">
        <div data-step="0" class="card pacc"><h3>Strengths</h3><ul>
          <li><b>No step can lower the score</b>: lazy heap, safe eviction, keep-if-not-worse</li>
          <li><b>${PIPELINE.provenOptima} proven optima</b>, and a proven ceiling where we can't solve exactly</li>
          <li><b>Consistent</b>: never below ${pct(S.me.worst)} of the best in the local contest</li>
          <li><b>Fast start</b>: kittens greedy in ${CODE.port.kittensCpp} s, always a valid answer</li>
        </ul></div>
        <div data-step="1" class="card facc"><h3>Weaknesses</h3><ul>
          <li>The greedy alone <b>falls into traps</b> (50–67% of the optimum)</li>
          <li>Re-pack and LNS are <b>local</b>: one or two caches at a time</li>
          <li>LNS gains <b>flatten</b> on large data sets after a few minutes</li>
          <li>The exact solver stops at <b>${fmt(CODE.exactMax)} variables</b></li>
        </ul></div>
        <div data-step="2" class="card cacc"><h3>Opportunities</h3><ul>
          <li>Up to <b>${fmt(PIPELINE.exact.videos.bound - vid.final)}</b> points left on videos (proven ceiling)</li>
          <li>Run LNS on <b>several cores</b> in parallel</li>
          <li><b>Split</b> large integer programs so the exact solver reaches big data sets</li>
          <li>Reuse the class console as a <b>teaching tool</b></li>
        </ul></div>
        <div data-step="3" class="card gacc"><h3>Threats</h3><ul>
          <li>The top 3 of the contest are within <b>${pct(S.gapToFirst / S.first.v, 3)}</b>: tiny gaps decide the rank</li>
          <li>Other teams ahead on some data sets (local contest: ${15 - S.bestOn} of 15)</li>
          <li>The exact solver is <b>exponential</b> in the worst case</li>
          <li>Tight time limits on million-request inputs leave LNS little time</li>
        </ul></div>
      </div></div>`;
  },
  step(n, { instant } = {}) { revealSteps(this.root, n, instant); },
  unmount() {},
};
