// 07 · Experimental protocol: data sets, settings, limits, metrics
import { html, revealSteps } from '../engines/dom.js';
import { PROTOCOL, CODE, STATEMENT } from '../content/facts.js';
import { fmt } from '../engines/dom.js';

export default {
  id: 's07', title: 'Experimental protocol', part: 'C', source: 'PIPELINE.md · scores_v1_v2_v3.md · solve.py · local contest sheet', steps: 4, minutes: 1.0,
  mount(root, ctx) {
    this.root = root; ctx.net?.show(false);
    root.innerHTML = html`
      <div class="area"><div class="cards" style="grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;height:100%">
        <div data-step="0" class="card cacc"><h3>Data sets</h3><ul>
          ${PROTOCOL.datasets.map(d => `<li><b>${d.n} ${d.what}</b> · ${d.detail}</li>`)}
          <li><b>The statement's example</b> · our scorer must give ${fmt(STATEMENT.exampleSubmissionScore)} on its answer first</li>
        </ul></div>
        <div data-step="1" class="card accent"><h3>Settings</h3><ul>
          <li><b>Same machine</b> for every method: ${PROTOCOL.machine}</li>
          <li><b>Greedy:</b> up to 5 rounds · ≤ 50 swaps per cache · 20 swap candidates</li>
          <li><b>Re-pack:</b> per cache, top ${CODE.repackCandidates.byRatio} videos by saving/MB + top ${CODE.repackCandidates.byGain} by saving</li>
          <li><b>LNS:</b> 2 caches per step · ${CODE.lnsMinutes} min per data set</li>
          <li><b>Exact solver:</b> only if ≤ ${fmt(CODE.exactMax)} variables · 120 s limit</li>
        </ul></div>
        <div data-step="2" class="card facc"><h3>Limits</h3><ul>
          <li>A <b>time budget</b> per data set: every step stops on time, a valid answer always exists</li>
          <li>Runtimes come from <b>one laptop</b>: a guide, not a benchmark</li>
          <li>LNS is random: <b>one run</b> reported per data set</li>
          <li>Annealing compared at <b>fixed temperatures</b> only</li>
          <li>"Best in class" = the shared sheet <b>on 31 October</b></li>
        </ul></div>
        <div data-step="3" class="card dcacc"><h3>Metrics</h3><ul>
          <li><b>Official score:</b> average time saved per request, in µs</li>
          <li><b>% of the best:</b> our score ÷ the best any group reached on that data set</li>
          <li><b>Rank</b>, the professor's three ways: by total, by sum of ranks, by distance to the best</li>
          <li><b>Proof:</b> proven optimum, or the gap to a proven ceiling</li>
          <li><b>Runtime</b> and every output <b>re-scored</b> by an independent scorer with a capacity check</li>
        </ul></div>
      </div></div>`;
  },
  step(n, { instant } = {}) { revealSteps(this.root, n, instant); },
  unmount() {},
};
