// Speaker notes, one array per build step. Lines starting with "SAY:" are suggested wording.
// Edit freely: the speaker view (key S) and the team guide show them.
export const NOTES = {
  s01: [
    ['Title. The 3D network turns slowly behind: data center at the back, three caches, two groups of users.', 'SAY: Hello, we are Group D. Our problem is Hash Code 2017, Streaming Videos.'],
    ['Requests start flowing: every cube goes all the way to the data center and back.', 'SAY: A video service keeps every video in one big data center, far from the users. Every request travels there and back, which is slow.', 'SAY: Near the users there are a few small cache servers. Our job is to decide which videos to copy into them.'],
  ],
  s02: [
    ['The statement\'s own example: 5 videos, 3 caches of 100 MB, 2 endpoints.', 'SAY: This is the example from the statement. Endpoint 0 can reach three caches. Endpoint 1 has no cache at all.'],
    ['Our choice + the rule. The request cards now show where each request is served.', 'SAY: We choose which videos go into which caches. A request is served by the fastest place that holds the video. Right now, that is always the data center.'],
    ['The statement\'s answer is placed; the score counts up to 462,500.', 'SAY: The score is the average time saved per request, in microseconds. The statement\'s own answer gets 462,500.'],
    ['“Can we beat 462,500?”', 'SAY: Can we do better? Kacem will show how our algorithm works.', 'HANDOVER to Kacem.'],
  ],
  s03: [
    ['Two reasons it is hard.', 'SAY: Two things make this hard. One: every cache is a knapsack, videos have sizes and the cache has a limit. Two: the caches interact. A copy is only worth the time it saves beyond what the users already get.'],
    ['The scale from the statement.', 'SAY: And the data sets go up to ten thousand videos, a thousand caches, a million request lines. Nothing is both exact and fast at this size.'],
    ['The pipeline appears: floors 1 to 3 rise over the 3D network.', 'SAY: So we stack methods. Read and index the file. Build a fast answer with a greedy. Then improve each cache exactly.'],
    ['Floors 4 and 5, and the rule that ties them together.', 'SAY: Then change two caches together, and for small data sets solve the whole problem exactly.', 'SAY: Each floor starts from the answer below it and only keeps a change if the score does not drop.'],
  ],
  s04: [
    ['The queue: every (cache, video) pair with its saving and saving per MB.', 'SAY: Here is the greedy, step by step, on the statement\'s example. First we score every pair: requests times the time saved. For cache 0 and video 3, that is 1,500 times 900 milliseconds, divided by its 30 MB: 45,000 per MB.', 'SAY: Video 4 is 110 MB, it never fits. Endpoint 1 has no cache, so it never enters the queue.'],
    ['Pop 1: cache 0 · video 3 → place.', 'SAY: We always take the best pair, re-check its saving, and if it has not changed we place it. Video 3 goes into cache 0.'],
    ['Pop 2: cache 2 · video 3 → drop (the key moment).', 'SAY: Next is video 3 in cache 2. It looked worth 40,000 per MB. But endpoint 0 now gets video 3 from cache 0 in 100 ms. Re-checked, it saves nothing. We drop it. This re-check is what stops us storing useless copies.'],
    ['Pop 3: cache 1 · video 3 → drop.', 'SAY: Same for cache 1.'],
    ['Pop 4: cache 0 · video 1 → place. Score 562,500.', 'SAY: Video 1 into cache 0: unchanged, placed. Cache 0 is now 80 out of 100 MB.'],
    ['Pops 5 and 6 dropped.', 'SAY: Video 1 in the other caches: already served by cache 0. Dropped.'],
    ['Round over: evict and swap find nothing. +100,000 vs the statement.', 'SAY: After the round we evict useless copies and try swaps. Nothing to do here. We stop with 562,500: 100,000 more than the statement\'s answer.'],
    ['Is it optimal? Yes, and the exact solver agrees.', 'SAY: And here it is the best possible: endpoint 0 gets both videos from its fastest cache, and nothing else can be improved. Our exact solver proves it.'],
  ],
  s05: [
    ['Evict and swap, after every round.', 'SAY: Two clean-ups run after every round. Evict removes copies that no longer save anything. Swap trades the weakest copy for a better video.'],
    ['The ratio trap: one cache of 10 MB.', 'SAY: But choosing by saving per MB can be fooled. One cache of 10 MB. Video A has the best ratio, so the greedy takes it. Then nothing else fits: 600, and 4 MB wasted.'],
    ['The DP table fills.', 'SAY: The fix: freeze all the other caches. Then each video is worth a fixed amount in this cache, and filling it is exactly a knapsack. We solve it optimally with dynamic programming.'],
    ['The path back through the table: B + C = 900.', 'SAY: The table says: take B and C. 900 instead of 600.'],
    ['Repeat cache after cache. The slider lets you try other sizes.', 'SAY: We repeat this for every cache until nothing changes. It can only go up, so it always stops.', 'If asked: move the slider. At 11 MB both methods agree.'],
  ],
  s06: [
    ['The trap instance after the greedy: B gets nothing, ~50% of the optimum.', 'SAY: But re-pack changes one cache at a time. Here is a trap from our generator. Endpoint A\'s videos look slightly better in cache a, so the greedy puts them there. Endpoint B gets nothing: half the optimum.'],
    ['Re-pack is stuck.', 'SAY: Re-pack cache a alone: A\'s videos are still the best there. Re-pack cache b alone: A already gets them from a, so they are worth zero in b. Each cache is optimal given the other. Stuck.'],
    ['LNS: both caches emptied and rebuilt together. Score jumps to 998,499.', 'SAY: Large neighbourhood search empties two caches that share users and rebuilds them together. Now A goes to b and B goes to a. We keep a change only if the score does not drop.'],
    ['The exact solver: the integer program and the real output on this instance.', 'SAY: For small data sets we also write the whole problem as an integer program and solve it exactly. It proves 998,499 is optimal here, and the zoo data set in 3 seconds. On big ones it still gives a ceiling: on videos, no answer can pass 620,009.'],
    ['The ladder, computed live. The class trap data sets went from 50–67% to 100%.', 'SAY: Live, on this instance: greedy, re-pack, LNS, exact. And the same kind of trap in the class sheet: from about half the optimum to proven optimal.', 'HANDOVER to Dhia.'],
  ],
  s07: [
    ['Data sets.', 'SAY: How we measured. Four Google data sets, the 29 class data sets, the 15 of the local contest, and 12 we generated ourselves. Before anything, our scorer had to reproduce the statement\'s 462,500.'],
    ['Settings.', 'SAY: Same laptop for every method. Greedy up to five rounds; re-pack on the best 500 candidates per cache; LNS on two caches, five minutes per data set; the exact solver only on small models, 120 seconds.'],
    ['Limits.', 'SAY: The limits: a time budget per data set, runtimes from one laptop only, one LNS run per data set, and the class best is the sheet on 31 October.'],
    ['Metrics.', 'SAY: The official score; our score as a share of the best any group reached; the professor\'s three rankings; and proof: a proven optimum or the gap to a proven ceiling. Every output is re-scored independently.'],
  ],
  s08: [
    ['Totals as a share of the best possible: L, F, then us.', 'SAY: The official result: the local contest. We finished third of twelve, by all three rankings. 2,870 points behind first, out of almost 23 million.'],
    ['Heat map: data set × team. Our column is framed.', 'SAY: Every cell is one team on one data set, as a share of the best. Our worst data set is still above 99.3% of the best. Most teams fall below 90% somewhere.'],
    ['Our best cells only.', 'SAY: We have the best score on 9 of the 15 data sets, and we are the only team at the best on one of them.'],
    ['First to second submission.', 'SAY: Between our two submissions we gained 6,800 points. We were already third with the first.'],
  ],
  s09: [
    ['V1 → V3 on the class data sets.', 'SAY: On the class benchmark, the greedy versions first: cache by cache, then eviction, then one global heap with swaps. Plus 11.7 percent.'],
    ['The full pipeline: 6th → 2nd.', 'SAY: Then the full pipeline: plus 1.87 million points on the 29 class data sets, from sixth to second in the class sheet.'],
    ['Where the points came from: the traps.', 'SAY: Most of it comes from the trap data sets: the greedy was at 50 to 67 percent, now they are proven optimal. Eight data sets are proven optimal in total.'],
    ['Google data sets, and the ceiling on videos.', 'SAY: On the four Google data sets: zoo is proven optimal, and on videos we know we are at most 6,158 points from perfect.', 'HANDOVER to Marouane.'],
  ],
  s10: [
    ['LNS vs annealing.', 'SAY: Every parameter was chosen by a test. We implemented simulated annealing and LNS and compared them from the same start, same time. LNS gained more and won on six of nine. Annealing needs the right temperature, and it changes per data set.'],
    ['Group size and time.', 'SAY: Two caches per LNS step beats four or eight: smaller groups rebuild faster. And gains flatten after a few minutes, so five minutes per data set.'],
    ['Exact-solver threshold.', 'SAY: The exact solver wins below ten thousand variables and loses above two hundred thousand, so we set the limit at fifty thousand.'],
  ],
  s11: [
    ['Strengths.', 'SAY: Strengths: no step can lower the score, eight proven optima, and consistency: never below 99.3% of the best in the contest.'],
    ['Weaknesses.', 'SAY: Weaknesses: the greedy alone falls into traps, our improvements are local, and the exact solver stops at fifty thousand variables.'],
    ['Opportunities.', 'SAY: Opportunities: about six thousand points left on videos, parallel LNS, and splitting big integer programs.'],
    ['Threats.', 'SAY: Threats: the top three of the contest are within a hundredth of a percent, so small details decide the rank.'],
  ],
  s12: [
    ['Core flow: .in → solve.py → solver.cpp.', 'SAY: Now the code of our final submission. One command, solve.py, takes a data set and a time budget, and runs our C++ solver: greedy, re-pack, LNS.'],
    ['Exact solver in parallel, re-score, keep the best.', 'SAY: If the model is small, it runs the exact solver at the same time. Every candidate is re-scored by our independent Python scorer and checked for capacity. The best valid one is the .out.'],
    ['The tools around it. Click any box to show what it does.', 'SAY: Around it: the instance generator, a local runner page, and the class console you used, which reuses our parser and scorer.'],
  ],
  s13: [
    ['Python first, then C++ · real demand only.', 'SAY: Two choices for speed. We wrote the Python version first and ported it move by move to C++: same scores, kittens from six minutes to 13 seconds. And a cache only ever looks at the videos its own users request.'],
    ['Lazy heap · best and second-best latency.', 'SAY: The heap is lazy: gains only go down, so we only re-check the top. And we store the best and second-best latency per request, so re-pack gets "fastest from another cache" instantly.'],
    ['Bitset knapsack · always a valid answer.', 'SAY: The knapsack uses one bit per cell, and dividing sizes by their gcd makes it up to 5,000 times faster on equal sizes. And the first greedy round always finishes, so there is always a valid answer on time.'],
    ['Trust nothing · last round of tuning.', 'SAY: Nothing is submitted before an independent re-score. And with the second contest submission we added extra swap and replace moves between neighbouring caches.', 'HANDOVER to Daniel.'],
  ],
  s14: [
    ['Last time: 4th of 9, Python only. The list of next steps we promised.', 'SAY: To conclude, let\'s go back to our last presentation. We were fourth of nine, with a Python greedy, and we listed what we would do next.'],
    ['✓ Exact packing.', 'SAY: Exact packing for small caches: done, it is the re-pack. Zoo is now proven optimal.'],
    ['✓ Annealing.', 'SAY: Simulated annealing: done, and tested against LNS. LNS won, so we kept LNS.'],
    ['✓ Faster code.', 'SAY: Faster code: the C++ port, kittens in 13 seconds.'],
    ['✓ Best strategy + now.', 'SAY: Pick the best strategy: one command runs everything and keeps the best. Today we are second of twelve on the class benchmark, and third in the local contest.'],
  ],
  s15: [
    ['The four layers and what each fixes.', 'SAY: So our solution is four layers. Each one fixes a weakness we measured in the one before, and none can make the answer worse.'],
    ['The one-sentence summary and three numbers.', 'SAY: Build fast, improve with exact sub-problems, and solve exactly what is small enough. Third of twelve in the contest, second on the class benchmark, eight proven optima.'],
    ['Questions. Backup scenes: 16 playground, 17 proofs, 18 complexity (type 1 6, 1 7, 1 8).', 'SAY: Thank you. We are happy to take your questions.'],
  ],
  s16: [['Playground: sliders change the instance; buttons show each layer\'s placement. Use it to answer "what if" questions.']],
  s17: [['Proof sketches for the board: lazy heap, re-pack = knapsack, eviction, LNS acceptance, the ceiling, NP-hardness.']],
  s18: [['Cost of each step and the size of the Google data sets.']],
};

// what the speaker says when giving the floor to the next person (shown on the last step of a slot)
export const HANDOVER = {
  s02: 'Can we do better? Kacem will show how our algorithm works.',
  s06: 'Now, how well does it work? Dhia.',
  s09: 'Marouane will explain how we chose each setting.',
  s13: 'Daniel will conclude.',
};
