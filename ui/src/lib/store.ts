import { create } from 'zustand'
import { api, streamRun } from './api'
import type { Ev, InstanceRow, RunMeta, RunResult, Summary, Topology } from './api'
import { Player } from './player'

export const ACTS = [
  { key: 'select', name: 'Data set', sub: 'choose an input' },
  { key: 'ingest', name: 'Ingest', sub: 'parse the file' },
  { key: 'topology', name: 'Cold network', sub: 'everything from the datacenter' },
  { key: 'solve', name: 'Placement', sub: 'fill the caches' },
  { key: 'routing', name: 'Routing', sub: 'where requests land' },
  { key: 'submission', name: 'Submission', sub: 'the output file' },
] as const

interface App {
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

  loadInstances: () => Promise<void>
  select: (id: string) => Promise<void>
  startRun: (force?: boolean) => Promise<void>
  setAct: (n: number) => void
  go: (delta: number) => void
  toggleExplore: () => void
  bump: () => void
  back: () => void
}

let stop: null | (() => void) = null

export const useApp = create<App>((set, get) => ({
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

  loadInstances: async () => {
    try { set({ instances: await api.instances() }) }
    catch (e) { set({ error: String(e) }) }
  },

  select: async (id) => {
    stop?.(); stop = null
    set({
      instanceId: id, summary: null, topology: null, meta: null, result: null,
      player: null, streaming: false, live: false, error: null, act: 1,
    })
    try {
      const [summary, topology] = await Promise.all([api.summary(id), api.topology(id)])
      set({ summary, topology })
    } catch (e) { set({ error: String(e) }) }
  },

  startRun: async (force = false) => {
    const { instanceId, summary } = get()
    if (!instanceId || !summary) return
    stop?.(); stop = null

    const player = new Player(summary.C, summary.X, summary.totalRequests)
    set({ player, result: null, streaming: true, error: null })

    try {
      const meta = await api.start(instanceId, 5, force)
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

  setAct: (n) => {
    const act = Math.max(0, Math.min(ACTS.length - 1, n))
    const { instanceId, player } = get()
    if (act > 0 && !instanceId) return
    if (act === 3 && !player) void get().startRun()
    set({ act, explore: false })
  },

  go: (d) => get().setAct(get().act + d),

  back: () => {
    stop?.(); stop = null
    set({
      act: 0, instanceId: null, summary: null, topology: null, meta: null,
      result: null, player: null, streaming: false, explore: false, error: null,
    })
  },

  toggleExplore: () => {
    if (!get().result) return
    set((s) => ({ explore: !s.explore }))
  },
}))
