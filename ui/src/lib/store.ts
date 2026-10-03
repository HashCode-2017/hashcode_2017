import { create } from 'zustand'
import { api, streamRun } from './api'
import type { Ev, InstanceRow, RunMeta, RunResult, Summary, Topology, User } from './api'
import { Player } from './player'

export const ACTS = [
  { key: 'select', name: 'Data set', sub: 'choose an input' },
  { key: 'ingest', name: 'Ingest', sub: 'parse the file' },
  { key: 'topology', name: 'Cold network', sub: 'everything from the datacenter' },
  { key: 'solve', name: 'Placement', sub: 'fill the caches' },
  { key: 'routing', name: 'Routing', sub: 'where requests land' },
  { key: 'submission', name: 'Submission', sub: 'the output file' },
] as const

/** Screens outside the six-act story. */
export type Page = 'submit' | 'leaderboard' | 'stats' | 'admin'

interface App {
  user: User | null
  authChecked: boolean
  page: Page | null
  /** A submission to play instead of running the reference solver. */
  runId: string | null
  /** A fresh upload: the rank reveal plays on its own when the story ends. */
  reveal: string | null
  /** The run whose rank reveal is on screen. */
  showRank: string | null
  /** A player opened the placement acts without having submitted anything here. */
  needSubmission: boolean

  act: number
  explore: boolean
  instances: InstanceRow[]
  instanceId: string | null
  summary: Summary | null
  topology: Topology | null
  meta: RunMeta | null
  result: RunResult | null
  player: Player | null
  streaming: boolean
  live: boolean
  error: string | null
  tick: number

  checkAuth: () => Promise<void>
  signedIn: (u: User) => void
  logout: () => Promise<void>
  openPage: (p: Page | null) => void
  playSubmission: (instance: string, runId: string) => Promise<void>
  /** Pick a data set and go straight to uploading a solution for it. */
  submitFor: (instance: string) => Promise<void>
  setReveal: (runId: string | null) => void
  setShowRank: (runId: string | null) => void

  loadInstances: () => Promise<void>
  select: (id: string, runId?: string | null) => Promise<void>
  startRun: (force?: boolean) => Promise<void>
  /** Players see their own submissions only; admins may fall back to the reference solver. */
  ensureRun: () => Promise<void>
  setAct: (n: number) => void
  go: (delta: number) => void
  toggleExplore: () => void
  bump: () => void
  back: () => void
}

let stop: null | (() => void) = null

export const useApp = create<App>((set, get) => ({
  user: null,
  authChecked: false,
  page: null,
  runId: null,
  reveal: null,
  showRank: null,
  needSubmission: false,
  act: 0,
  explore: false,
  instances: [],
  instanceId: null,
  summary: null,
  topology: null,
  meta: null,
  result: null,
  player: null,
  streaming: false,
  live: false,
  error: null,
  tick: 0,

  bump: () => set((s) => ({ tick: s.tick + 1 })),

  checkAuth: async () => {
    try { set({ user: await api.me() }) } catch { set({ user: null }) }
    set({ authChecked: true })
  },

  signedIn: (user) => set({ user }),

  logout: async () => {
    await api.logout().catch(() => null)
    get().back()
    set({ user: null, page: null })
  },

  openPage: (page) => set({ page, explore: false }),

  playSubmission: async (instance, runId) => {
    set({ page: null })
    await get().select(instance, runId)
    get().setAct(3)
  },

  submitFor: async (instance) => {
    const loading = get().select(instance)
    set({ page: 'submit' })
    await loading
  },

  setReveal: (reveal) => set({ reveal }),
  setShowRank: (showRank) => set({ showRank }),

  loadInstances: async () => {
    try { set({ instances: await api.instances() }) }
    catch (e) { set({ error: String(e) }) }
  },

  select: async (id, runId = null) => {
    stop?.(); stop = null
    set({
      instanceId: id, runId, page: null, reveal: null, needSubmission: false, summary: null, topology: null, meta: null, result: null,
      player: null, streaming: false, live: false, error: null, act: 1,
    })
    try {
      const [summary, topology] = await Promise.all([api.summary(id), api.topology(id)])
      set({ summary, topology })
    } catch (e) { set({ error: String(e) }) }
    if (!runId) {
      const mine = await api.mySubmissions().catch(() => [])
      const hit = mine.find((m) => m.instance === id)
      if (hit && get().instanceId === id && !get().runId) set({ runId: hit.run_id })
    }
  },

  startRun: async (force = false) => {
    const { instanceId, summary, runId } = get()
    if (!instanceId || !summary) return
    stop?.(); stop = null

    const player = new Player(summary.C, summary.X, summary.totalRequests)
    set({ player, result: null, streaming: true, error: null })

    try {
      // An uploaded submission is already running (or done) on the server;
      // otherwise this is the reference solver.
      const meta = runId && !force ? await api.runMeta(runId) : await api.start(instanceId, 5, force)
      set({ meta, live: !meta.cached })

      // One path for both cases: a prewarmed run streams its stored events in
      // a burst, a cold run streams them as the solver produces them. The
      // player paces playback either way.
      stop = streamRun(
        meta.id,
        (evs: Ev[]) => { player.append(evs); get().bump() },
        async (status) => {
          set({ streaming: false })
          if (status === 'error') {
            const m = await api.runMeta(meta.id).catch(() => null)
            set({ error: m?.error || 'the run failed' })
            return
          }
          try {
            const record = await api.run(meta.id)
            set({ result: record.result, meta: record })
          } catch (e) { set({ error: String(e) }) }
          get().bump()
        },
      )
    } catch (e) {
      set({ error: String(e), streaming: false })
    }
  },

  ensureRun: async () => {
    // No silent fallback to the reference solver, for anyone: the placement
    // acts show a submission or nothing. Admins can start the reference solver
    // explicitly from the "no placement yet" prompt.
    const { runId, instanceId } = get()
    if (runId) return get().startRun()
    // Your latest upload for this data set, if there is one.
    const mine = await api.mySubmissions().catch(() => [])
    const hit = mine.find((m) => m.instance === instanceId)
    if (hit && get().instanceId === instanceId) {
      set({ runId: hit.run_id, needSubmission: false })
      return get().startRun()
    }
    set({ needSubmission: true })
  },

  setAct: (n) => {
    const act = Math.max(0, Math.min(ACTS.length - 1, n))
    const { instanceId, player } = get()
    if (act > 0 && !instanceId) return
    // Every act from the placement on needs the run, so jumping straight to
    // routing or the submission starts it too.
    if (act >= 3 && !player && !get().needSubmission) void get().ensureRun()
    set({ act, explore: false, page: null })
  },

  go: (d) => get().setAct(get().act + d),

  back: () => {
    stop?.(); stop = null
    set({
      act: 0, instanceId: null, runId: null, reveal: null, needSubmission: false, summary: null, topology: null, meta: null,
      result: null, player: null, streaming: false, explore: false, error: null, page: null,
    })
  },

  toggleExplore: () => {
    if (!get().result) return
    set((s) => ({ explore: !s.explore }))
  },
}))
