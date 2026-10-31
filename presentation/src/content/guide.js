// Text for the plain-words team guide (docs/team-guide-plain-words.pdf). The per-step text comes from notes.js.
export const STORY = [
  'Picture a huge warehouse far out of town that stocks every product, and a few small corner shops close to where people live. Each shop has only a few shelves. If a shop has what you want, you get it quickly. If not, you wait for the warehouse.',
  'In our problem the warehouse is the data center, the corner shops are the cache servers, the shelves are megabytes, the products are videos, and the neighbourhoods are the endpoints (groups of users). We know in advance how many times each neighbourhood will ask for each video.',
  'We choose which videos to put on which shelves. The score is the average time saved per request. Two things make it hard: shelves are small (a knapsack problem), and shops share customers, so a second copy of a video nearby is often worth nothing.',
  'Our answer is a stack of methods. A fast greedy fills the shelves with the best saving per MB first. Then we re-pack one shop at a time exactly. Then we empty two neighbouring shops and rebuild them together (LNS). For small problems, an exact solver finds the proven best answer, and for big ones it tells us how far from perfect we can be at most.',
];

export const GLOSSARY = [
  ['Data center', 'The far place that holds every video. Always available, always slow.'],
  ['Cache (cache server)', 'A small, fast storage close to some users, with a fixed size in MB.'],
  ['Endpoint', 'A group of users in one place. Each endpoint is linked to some caches (maybe none).'],
  ['Latency', 'Waiting time between a request and the video arriving, in milliseconds (ms).'],
  ['Request description', 'A line of the input: "this endpoint will ask for this video this many times".'],
  ['Score', 'Average time saved per request, in microseconds (µs): the number Google ranks by.'],
  ['Greedy', 'Build the answer one best-looking choice at a time, without going back.'],
  ['Saving per MB', 'How much time a copy saves, divided by its size. The greedy sorts by it.'],
  ['Heap (priority queue)', 'A structure that always gives the item with the highest value first.'],
  ['Lazy heap', 'We only re-check the top item. Values only go down, so the top is safe if unchanged.'],
  ['Evict', 'Remove a copy that saves nothing any more.'],
  ['Swap', 'Replace the weakest copy in a cache by a better video when it strictly helps.'],
  ['Knapsack', 'Choose items with sizes and values to fit a bag and get the highest total value.'],
  ['Dynamic programming (DP)', 'Solve a big problem by filling a table of small answers. Gives the exact knapsack answer.'],
  ['Re-pack', 'Freeze every other cache and fill one cache exactly with a knapsack.'],
  ['LNS', 'Large neighbourhood search: empty a few related caches, rebuild them, keep it if not worse.'],
  ['Simulated annealing', 'A search that sometimes accepts a worse answer to escape a dead end. We tested it; LNS won.'],
  ['Integer program (MILP)', 'The whole problem written as equations with 0/1 variables, given to a solver (HiGHS).'],
  ['Branch and bound', 'How the solver searches: split the problem, and skip parts that cannot beat the best so far.'],
  ['Proven optimum', 'An answer the exact solver proves nobody can beat.'],
  ['Upper bound (ceiling)', 'A number no answer can pass. On videos_worth_spreading: 620,009.'],
  ['VBS / best in class', 'The best score any group reached on a data set.'],
  ['NP-hard', 'No known method solves every case both exactly and fast.'],
  ['gcd', 'Greatest common divisor. Dividing all sizes by it keeps the same answer with a smaller table.'],
  ['Trap instance', 'A data set built so that the greedy gets about half of the best possible score.'],
];

// one "word to know" per scene (key into GLOSSARY)
export const WORDS = {
  s01: 'Data center', s02: 'Score', s03: 'Knapsack', s04: 'Lazy heap', s05: 'Dynamic programming (DP)', s06: 'LNS',
  s07: 'VBS / best in class', s08: 'VBS / best in class', s09: 'Proven optimum', s10: 'Simulated annealing', s11: 'Upper bound (ceiling)',
  s12: 'Integer program (MILP)', s13: 'gcd', s14: 'Re-pack', s15: 'Branch and bound', s16: 'Greedy', s17: 'Lazy heap', s18: 'NP-hard',
};
