// Every number shown in the talk lives here, with where it comes from.
// Scenes read from this file (and from tables.js); they never type a source number themselves.
// `ref` strings name the document and section, so any figure can be traced back during questions.

export const TALK = {
  title: 'Streaming Videos',
  subtitle: 'From a fast greedy to proven optimal answers',
  contest: 'Google Hash Code 2017 · Qualification round',
  course: 'Advanced Problem Solving',
  group: 'Group D',
  members: ['Kacem', 'Daniel', 'Marouane', 'Dhia'],
  repo: 'github.com/HashCode-2017/hashcode_2017',
  cite: 'Hash Code 2017 · Streaming Videos · Group D',
};

// ------------------------------------------------------------------ the problem statement
export const STATEMENT = {
  ref: 'Problem statement (hashcode2017_qualification_task.pdf)',
  limits: { V: 10000, E: 1000, R: 1000000, C: 1000, X: 500000, size: 1000, LD: 4000, Lc: 500, Rn: 10000 },
  limitsRef: 'Statement · Input data set',
  scoreRule: 'The score is the average time saved per request, in microseconds.',
  scoreRef: 'Statement · Scoring',
  // the worked example, verbatim (also in models/statement_example.in)
  exampleIn: `5 2 4 3 100
50 50 80 30 110
1000 3
0 100
2 200
1 300
500 0
3 0 1500
0 1 1000
4 0 500
1 0 1000`,
  exampleRef: 'Statement · Example input file',
  // the statement's own example submission and its score
  exampleSubmission: [[2], [3, 1], [0, 1]],
  exampleSubmissionScore: 462500,
  exampleSubmissionRef: 'Statement · Example submission file and Scoring',
};

// ------------------------------------------------------------------ the official Google data sets
export const GOOGLE = {
  ref: 'PIPELINE.md §5 (our scores, re-scored with solution.py) · class sheet (best in class)',
  rows: [
    { name: 'kittens',                v3: 1022115, final: 1024812, best: 1025096, method: 'greedy + re-pack + LNS' },
    { name: 'me_at_the_zoo',          v3: 507906,  final: 516557,  best: 516557,  method: 'exact solver · proven optimum' },
    { name: 'trending_today',         v3: 499966,  final: 499997,  best: 500000,  method: 'greedy + re-pack + LNS' },
    { name: 'videos_worth_spreading', v3: 609385,  final: 613851,  best: 614545,  method: 'greedy + re-pack + LNS' },
  ],
  v3Total: 2639372,
  finalTotal: 2655217,
  sizes: [
    { name: 'me_at_the_zoo', V: 100, E: 10, R: 100, C: 10 },
    { name: 'videos_worth_spreading', V: 10000, E: 100, R: 100000, C: 100 },
    { name: 'trending_today', V: 10000, E: 100, R: 100000, C: 100 },
    { name: 'kittens', V: 10000, E: 1000, R: 200000, C: 500 },
  ],
  sizesRef: 'README.md · Complexity',
};

// ------------------------------------------------------------------ greedy versions on the 24 class instances
export const VERSIONS = {
  ref: 'scores_v1_v2_v3.md (24 class instances, same machine)',
  rows: [
    { v: 'V1', label: 'Cache by cache', detail: 'fill each cache in index order', total: 17713981 },
    { v: 'V2', label: '+ eviction', detail: 'drop copies that save nothing', total: 17817536 },
    { v: 'V3', label: '+ global heap & swap', detail: 'one ranking for the whole network', total: 19793522 },
  ],
  vbs: 20568196,
  runtime: { name: 'realistic_large_random', V1: 11, V2: 28, V3: 192 },
};

// ------------------------------------------------------------------ the full pipeline on the class instances
export const PIPELINE = {
  ref: 'PIPELINE.md §5 · class sheet',
  classBefore: 25634973,
  classAfter: 27500134,
  classGain: 1865161,
  rankBefore: 6,
  rankAfter: 2,
  provenOptima: 8,
  provenList: ['me_at_the_zoo', '2_2_2_1', '4_2_4_2', '6_2_6_2', '8_2_8_2', '20_2_20_2', 'big', 'supra'],
  traps: [
    { name: '4_2_4_2', greedy: 655321, optimum: 982271 },
    { name: '6_2_6_2', greedy: 499524, optimum: 998499 },
    { name: '8_2_8_2', greedy: 567228, optimum: 991480 },
    { name: '20_2_20_2', greedy: 524928, optimum: 995902 },
  ],
  trapsRef: 'PIPELINE.md §1 and §5 (greedy = V3 · optimum proven by the exact solver)',
  exact: {
    zoo: { score: 516557, seconds: 3, greedy: 507906, x: 183, y: 261 },
    videos: { bound: 620009, ours: 613851, milpSolution: 590639, minutes: 15 },
    ref: 'PIPELINE.md §4',
  },
};

// ------------------------------------------------------------------ measured design choices
export const CHOICES = {
  ref: 'PIPELINE.md §1, §3, §4, §6 · SOLUTION.md §7',
  lnsVsAnnealing60: { instances: 9, seconds: 60, annealingGain: 12656, lnsGain: 17945, annealingWins: 2, lnsWins: 6 },
  lnsVsAnnealing180: [
    { name: 'videos', annealT1: 615635, annealT0001: 610510, lns: 613548 },
    { name: 'kittens', annealT1: 1024603, annealT0001: 1024734, lns: 1024706 },
    { name: 'INSTANCED', annealT1: 1292386, annealT0001: 1280715, lns: 1297807 },
  ],
  groupSize: { instance: 'videos', seconds: 20, rows: [{ k: 2, score: 612601 }, { k: 4, score: 612056 }, { k: 8, score: 611486 }] },
  moreTime: { instance: 'videos', rows: [{ s: 60, gain: 2222 }, { s: 180, gain: 3043 }, { s: 480, gain: 3346 }] },
  startFromGreedy: [{ name: 'videos', greedyStart: 610505, emptyStart: 606631 }, { name: 'zoo', greedyStart: 512115, emptyStart: 500513 }],
  exactThreshold: { winsBelow: 10000, losesAbove: 200000, chosen: 50000,
    wins: [{ name: 'zoo', vars: 261 }, { name: 'zipF', vars: 2539 }, { name: 'regional', vars: 2943 }, { name: 'big', vars: 8762 }],
    loses: [{ name: 'videos', vars: 210540 }, { name: 'INSTANCED', vars: 929425 }] },
  eviction: [
    { name: 'me_at_the_zoo', perCache: 3.2, gainPct: 1.900 },
    { name: 'videos_worth_spreading', perCache: 5.2, gainPct: 0.641 },
    { name: 'kittens', perCache: 704, gainPct: 0.015 },
    { name: 'trending_today', perCache: 100, gainPct: 0.000 },
  ],
};

// ------------------------------------------------------------------ implementation
export const CODE = {
  ref: 'PIPELINE.md §1, §2, §6 · solve.py · git log',
  files: [
    { file: 'solution.py', lines: 745, role: 'Python reference: parser, greedy, scorer' },
    { file: 'solver.cpp', lines: 819, role: 'C++: greedy, exact re-pack, LNS, time limit' },
    { file: 'exact.py', lines: 102, role: 'integer program, solved by HiGHS (SciPy)' },
    { file: 'solve.py', lines: 296, role: 'one command: runs the methods, keeps the best' },
  ],
  tools: [
    { file: 'runner/', role: 'local page: drop .in files, download .out' },
    { file: 'api/ + ui/', role: 'class console: upload, replay, leaderboard' },
    { file: 'generated_instances/', role: 'instance generator: random, dejavu, patterned, trap' },
  ],
  port: { identicalGoogle: 4, identicalEval: 30, evalTotal: 31, kittensPython: 362, kittensCpp: 13 },
  repackCandidates: { byRatio: 400, byGain: 100 },
  gcdSpeedup: 5000,
  timeLimitCheck: { limit: 120, stoppedAt: 120.2 },
  exactMax: 50000,
  lnsMinutes: 5,
};

// ------------------------------------------------------------------ the protocol
export const PROTOCOL = {
  ref: 'PIPELINE.md · scores_v1_v2_v3.md · previous presentation (machine)',
  machine: 'Intel i5-10300H @ 2.5 GHz · 24 GB RAM · Windows 11',
  datasets: [
    { n: 4, what: 'official Google data sets', detail: 'zoo, videos, trending, kittens' },
    { n: 29, what: 'class data sets', detail: 'the shared class sheet, incl. small traps' },
    { n: 15, what: 'local-contest data sets', detail: 'scored by the professor' },
    { n: 12, what: 'generated data sets', detail: 'tiny → large, sparse → dense, uniform → skewed' },
  ],
};

// ------------------------------------------------------------------ the previous presentation (what we said we would do)
export const LAST_TIME = {
  ref: 'Previous presentation, slides 8–10',
  total: 2639372,
  rank: '4th of 9',
  pctOfBest: 99.37,
  promises: [
    { said: 'Exact packing for small caches', why: 'our biggest gap (zoo)', did: 'Exact per-cache re-pack', proof: 'zoo now proven optimal' },
    { said: 'Simulated annealing', why: 'escape local optima', did: 'Annealing and LNS, tested side by side', proof: 'LNS won 6 of 9 instances' },
    { said: 'Faster code', why: 'kittens took ~6 min in Python', did: 'C++ port, same moves', proof: 'kittens greedy in 13 s' },
    { said: 'Pick the best strategy', why: 'per type of instance', did: 'One command runs every method', proof: 'keeps the best valid answer' },
  ],
};
