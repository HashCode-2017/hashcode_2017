// The professor's five parts, and who speaks when. Change names or minutes here:
// the title bar, the speaker view, the timers and the team guide all follow.
export const SECTIONS = {
  1: { name: 'Algorithmic', short: 'Algorithm', minutes: 6 },
  2: { name: 'Experimental evaluation', short: 'Experiments', minutes: 6 },
  3: { name: 'Code', short: 'Code', minutes: 3 },
  4: { name: 'Conclusion', short: 'Conclusion', minutes: 2 },
  5: { name: 'Questions', short: 'Questions', minutes: 10 },
};

// one slot = one speaker inside one section
export const SLOTS = {
  A: { name: 'Daniel', section: 1, minutes: 1, part: 'The problem' },
  B: { name: 'Kacem', section: 1, minutes: 5, part: 'The algorithm, step by step' },
  C: { name: 'Dhia', section: 2, minutes: 4, part: 'Protocol and results' },
  D: { name: 'Marouane', section: 2, minutes: 2, part: 'Measured choices and SWOT' },
  E: { name: 'Marouane', section: 3, minutes: 3, part: 'The final submission' },
  F: { name: 'Daniel', section: 4, minutes: 2, part: 'Conclusion' },
  Q: { name: 'Everyone', section: 5, minutes: 10, part: 'Backup for questions' },
};

export const TALK_MINUTES = 17; // sections 1–4; questions come after
