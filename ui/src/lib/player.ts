import type { Ev } from './api'

export interface Scan {
  cache: number
  remaining: number
  candidates: number
  top: { video: number; gain: number; size: number }[]
}

export interface Pick { cache: number; video: number; size: number; gain: number }

export interface Chip { cache: number; video: number; size: number; born: number }

/**
 * Replays a solver event log and maintains the derived state the stage draws.
 *
 * Deliberately a plain class, not React state: at 8x speed this advances
 * several hundred events per frame, and pushing that through a store would
 * spend the whole frame budget on reconciliation. The canvas reads it
 * directly; React only re-renders from a once-per-frame snapshot.
 *
 * The running score is accumulated from each placement's own marginal `gain`.
 * That sum is exactly the solver's total saved milliseconds -- verified equal
 * to the analysis path's `savedMs` on all five data sets -- so the counter
 * lands precisely on the final score rather than approaching it.
 */
export class Player {
  events: Ev[] = []
  C = 0
  X = 1
  totalRequests = 1

  cursor = 0
  cacheUsed!: Float64Array
  cacheVideos!: Int32Array
  cumGain = 0
  placed = 0
  evicted = 0
  swapped = 0
  round = 0
  phase = 'idle'
  scanning: Scan | null = null
  epLatency: number[] | null = null
  chips: Chip[] = []
  recent: Pick[] = []
  lastTouched = 0
  /** True once the log shows per-cache scans; the global strategy emits none. */
  perCache = false

  constructor(C: number, X: number, totalRequests: number) {
    this.C = C
    this.X = X || 1
    this.totalRequests = totalRequests || 1
    this.reset()
  }

  reset() {
    this.cursor = 0
    this.cacheUsed = new Float64Array(this.C)
    this.cacheVideos = new Int32Array(this.C)
    this.cumGain = 0
    this.placed = 0
    this.evicted = 0
    this.swapped = 0
    this.round = 0
    this.phase = 'idle'
    this.scanning = null
    this.epLatency = null
    this.chips = []
    this.recent = []
    this.lastTouched = 0
  }

  get total() { return this.events.length }
  get done() { return this.cursor >= this.events.length }
  /** Microseconds saved per request, the official score, as of right now. */
  get score() { return Math.floor((this.cumGain * 1000) / this.totalRequests) }
  get usedMB() { let s = 0; for (let i = 0; i < this.C; i++) s += this.cacheUsed[i]; return s }
  get capacityMB() { return this.C * this.X }

  append(evs: Ev[]) {
    for (const e of evs) {
      if (e.kind === 'cache_scan') this.perCache = true
      this.events.push(e)
    }
  }

  private apply(e: Ev, now: number) {
    switch (e.kind) {
      case 'phase': this.phase = e.phase || ''; break
      case 'round_start': this.round = e.round ?? 0; this.scanning = null; break
      case 'cache_scan':
        this.scanning = {
          cache: e.cache!, remaining: e.remaining!,
          candidates: e.candidates!, top: e.top || [],
        }
        break
      case 'place': {
        const c = e.cache!
        this.cacheUsed[c] += e.size!
        this.cacheVideos[c] += 1
        this.cumGain += e.gain!
        this.placed += 1
        this.lastTouched = e.endpoints_improved ?? 0
        this.recent.unshift({ cache: c, video: e.video!, size: e.size!, gain: e.gain! })
        if (this.recent.length > 12) this.recent.pop()
        if (this.chips.length < 48) {
          this.chips.push({ cache: c, video: e.video!, size: e.size!, born: now })
        }
        break
      }
      case 'evict': {
        // A dominated copy saves nothing, so cumGain is untouched. A copy
        // swapped out for a better video carries the saving it gave up as
        // `loss`, and the replacement's `place` event adds its own gain.
        const c = e.cache!
        this.cacheUsed[c] -= e.size!
        this.cacheVideos[c] -= 1
        this.placed -= 1
        this.cumGain -= e.loss ?? 0
        if (e.reason === 'swap') this.swapped += 1
        else this.evicted += 1
        break
      }
      case 'progress':
      case 'round_end':
        if (e.endpoint_latency) this.epLatency = e.endpoint_latency
        break
    }
  }

  /** Advance to absolute event index `target` (rebuilding if it moved back). */
  seek(target: number, now: number) {
    const t = Math.max(0, Math.min(this.events.length, Math.floor(target)))
    if (t < this.cursor) {
      const chips = this.chips
      this.reset()
      this.chips = chips
    }
    while (this.cursor < t) this.apply(this.events[this.cursor++], now)
    // Chips are transient; drop the ones that have finished their flight.
    if (this.chips.length) this.chips = this.chips.filter((c) => now - c.born < 900)
  }
}

/**
 * Events per second at a given position.
 *
 * The opening is deliberately slow -- the first placements are the ones the
 * audience needs to actually see land -- then it accelerates so a 10,921-event
 * run still finishes inside the time anyone will watch it.
 */
export function rateAt(cursor: number, total: number, speed: number) {
  // Aim for a roughly fixed wall-clock duration (~20s at 1x) whatever the size
  // of the run, so a 104-event data set is watchable and an 11,515-event one
  // still finishes. Rate as a flat events-per-second made the small runs flash
  // past and the large ones interminable.
  const full = Math.min(900, Math.max(6, total / 20))
  // Warm up over a fixed handful of events, never a fraction of the total: at
  // 8% of an 11,515-event log the ramp alone ran for minutes.
  const warm = Math.min(80, Math.max(15, total * 0.06))
  const t = Math.min(1, cursor / warm)
  return (4 + (full - 4) * t * t) * speed
}
