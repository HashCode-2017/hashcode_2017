export type Tier = 'graph' | 'aggregate'

export interface InstanceRow {
  id: string; file: string; blurb: string; bytes: number; tier: Tier
  V: number; E: number; R: number; C: number; X: number
  prewarmed: boolean; loaded: boolean; official: boolean
  /** set for instances generated from the console */
  generated?: { model: string; group: string | null; by: string; params: Record<string, unknown>; seed: number }
}

export interface GenField {
  key: string; label: string; type: 'int' | 'float' | 'choice'; default: number | string
  min: number | null; max: number | null; help: string; choices: string[] | null; advanced: boolean
}
export interface GenModel { label: string; help: string; fields: GenField[] }
export interface GeneratorSchema { models: Record<string, GenModel>; maxR: number; perGroup: number }

export interface Hist { lo: number; hi: number; bins: number[]; max: number }

export interface Summary {
  id: string
  V: number; E: number; R: number; C: number; X: number
  links: number; tier: Tier
  totalRequests: number; totalVideoMB: number; totalCapacityMB: number
  avgLinksPerEndpoint: number; unconnectedEndpoints: number
  head: string
  dist: {
    videoSize: Hist; dcLatency: Hist; cacheLatency: Hist | null
    requestRow: Hist; endpointDegree: Hist
  }
  topVideos: { video: number; requests: number; size: number }[]
  prewarmed: boolean
}

export interface CacheRow {
  id: number; degree: number; minLat: number | null; meanLat: number | null
  capacity: number; reachDemand: number
}
export interface EndpointRow {
  id: number; ld: number; degree: number; bestLat: number
  demand: number; videos: number
}
export interface Matrix {
  rows: number; cols: number
  latency: (number | null)[][]; density: number[][]
  rowLabel: string; colLabel: string
}
export interface Topology {
  id: string; tier: Tier; links: number
  V: number; E: number; C: number; X: number
  caches: CacheRow[]; endpoints: EndpointRow[]
  edges?: { e: number; c: number; lat: number }[]
  matrix?: Matrix | null
}

export interface Ev {
  i: number; kind: string
  round?: number; cache?: number; video?: number; size?: number
  gain?: number; remaining?: number; endpoints_improved?: number
  reason?: 'swap'; loss?: number
  candidates?: number; top?: { video: number; gain: number; size: number }[]
  placements?: number; endpoint_latency?: number[]
  phase?: string; seconds?: number; score?: number; message?: string
  V?: number; E?: number; R?: number; C?: number; X?: number; links?: number
}

export interface ResultCache {
  id: number; videos: number; usedMB: number; capacityMB: number
  fill: number; requests: number; degree: number
}
export interface ResultEndpoint {
  id: number; ld: number; demand: number; before: number; after: number
  cachedShare: number; degree: number
}
export interface RunResult {
  score: number; ceiling: number; ceilingPct: number | null
  savedMs: number; totalRequests: number; avgSavedMs: number
  servedByCache: number; servedByDatacenter: number; cacheShare: number
  caches: ResultCache[]; endpoints: ResultEndpoint[]
  latencyBefore: [number, number][]; latencyAfter: [number, number][]
  replication: {
    distinctVideos: number; totalCopies: number
    hist: [number, number][]
    top: { video: number; copies: number; size: number }[]
  }
  placement: Record<string, number[]>
  submission: string
  trace?: {
    provided: boolean; steps: number
    problems?: { line: number; kind: string; detail: string }[]
    consistent?: boolean; differenceCount?: number
  }
  validation: {
    valid: boolean
    problems: { cache: number; kind: string; detail: string }[]
    describedCaches: number; totalCaches: number
    largestFill: number; capacityMB: number
  }
}

export interface RunMeta {
  id: string; instance: string; rounds: number
  source: 'solver' | 'trace' | 'out'; owner: string | null
  status: 'queued' | 'parsing' | 'solving' | 'analysing' | 'done' | 'error'
  error: string | null; cached: boolean; eventCount: number
  parseSeconds: number | null; solveSeconds: number | null; analyseSeconds: number | null
  created?: boolean
}

export interface RunRecord extends RunMeta { events: Ev[]; result: RunResult | null }

export interface User { id: number; username: string; group: string | null; isAdmin?: boolean }
export interface Person { id: number; username: string; group: string | null; submissions: number; isAdmin?: boolean }
/** `capacity` is null for the Professors group; `admin` groups need the admin code to join. */
export interface GroupSeat { group: string; members: number; capacity: number | null; admin?: boolean; label?: string }
export interface MySubmission {
  id: number; instance: string; run_id: string; score: number
  valid: number; source: string; created: number
  /** who in the group uploaded it */
  username?: string
}
export interface BoardRow {
  key: string; name: string; group: string; rank: number
  total: number; scores: Record<string, number>
}
export interface Board { scope: string; by: 'user' | 'group'; instances: string[]; rows: BoardRow[] }
export interface RankBoard { scope: string; by: 'user' | 'group'; before: BoardRow[]; after: BoardRow[] }
/** Bucketed endpoint x cache request volumes after placement (dense data sets). */
export interface RoutedMatrix {
  rows: number; cols: number
  served: number[][]; datacenter: number[]
  rowLabel: string; colLabel: string
}
export interface ClassStats {
  players: number; submissions: number; valid: number; withTrace: number
  instances: {
    instance: string; submissions: number; invalid: number; withTrace: number
    players: number; groups: number
    best: number | null; median: number | null; mean: number | null; lowest: number | null
    playerBests: number[]
  }[]
  groups: { group: string; members: number; submissions: number }[]
  timeline: [number, number][]
}
export interface RankReport {
  instance: string; score: number; valid: boolean
  username: string; group: string; userKey: string; groupKey: string
  ranked: string[]
  boards: Record<string, RankBoard>
}

/** FastAPI puts the reason in `detail`; show that, not the status line. */
async function failure(r: Response, url: string) {
  let msg = `${r.status} ${r.statusText} — ${url}`
  try { const j = await r.json(); if (j && typeof j.detail === 'string') msg = j.detail } catch { /* not JSON */ }
  return new Error(msg)
}

async function get<T>(url: string): Promise<T> {
  const r = await fetch(url, { credentials: 'same-origin' })
  if (!r.ok) throw await failure(r, url)
  return r.json() as Promise<T>
}

async function post<T>(url: string, body: unknown): Promise<T> {
  return send<T>('POST', url, body)
}

async function send<T>(method: string, url: string, body: unknown): Promise<T> {
  const r = await fetch(url, {
    method, credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!r.ok) throw await failure(r, url)
  return r.json() as Promise<T>
}

export const api = {
  instances: () => get<InstanceRow[]>('/api/instances'),
  summary: (id: string) => get<Summary>(`/api/instances/${id}`),
  topology: (id: string) => get<Topology>(`/api/instances/${id}/topology`),
  run: (id: string) => get<RunRecord>(`/api/runs/${id}`),
  runMeta: (id: string) => get<RunMeta>(`/api/runs/${id}/meta`),
  start: async (instance: string, rounds = 5, force = false): Promise<RunMeta> => {
    const r = await fetch('/api/runs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ instance, rounds, force }),
    })
    if (!r.ok) throw new Error(`${r.status} ${await r.text()}`)
    return r.json()
  },
  submissionUrl: (runId: string) => `/api/runs/${runId}/submission`,
  downloadUrl: (instanceId: string) => `/api/instances/${instanceId}/download`,

  groups: () => get<GroupSeat[]>('/api/groups'),
  me: () => get<User>('/api/auth/me'),
  login: (username: string, password: string) =>
    post<User>('/api/auth/login', { username, password }),
  register: (username: string, email: string, password: string, group: string, code?: string) =>
    post<User>('/api/auth/register', { username, email, password, group, code }),
  logout: () => post<{ ok: boolean }>('/api/auth/logout', {}),

  submit: (instance: string, out: string, trace: string | null) =>
    post<RunMeta>('/api/submissions', { instance, out, trace }),
  mySubmissions: () => get<MySubmission[]>('/api/submissions/mine'),
  stats: () => get<ClassStats>('/api/stats'),
  generator: () => get<GeneratorSchema>('/api/generator'),
  generate: (model: string, params: Record<string, unknown>, seed: number | null, name: string) =>
    post<InstanceRow>('/api/instances/generate', { model, params, seed, name }),
  deleteInstance: (id: string) => send<{ ok: boolean }>('DELETE', `/api/instances/${id}`, {}),
  routed: (runId: string) => get<RoutedMatrix>(`/api/runs/${runId}/routed`),
  ranked: () => get<{ instances: string[]; default: string[] }>('/api/ranked'),
  people: () => get<Person[]>('/api/admin/people'),
  setGroup: (userId: number, group: string) => send<User>('PUT', `/api/admin/people/${userId}/group`, { group }),
  setRanked: (instances: string[]) => send<{ instances: string[] }>('PUT', '/api/admin/ranked', { instances }),
  rank: (runId: string) => get<RankReport>(`/api/submissions/${runId}/rank`),
  leaderboard: (scope: string, by: 'user' | 'group') =>
    get<Board>(`/api/leaderboard?scope=${encodeURIComponent(scope)}&by=${by}`),
}

/** Follow a live run. Events arrive batched; `onBatch` gets each batch in order. */
export function streamRun(
  runId: string,
  onBatch: (events: Ev[], status: RunMeta['status']) => void,
  onEnd: (status: RunMeta['status']) => void,
  from = 0,
): () => void {
  const es = new EventSource(`/api/runs/${runId}/stream?start=${from}`)
  es.onmessage = (m) => {
    const d = JSON.parse(m.data) as { events: Ev[]; status: RunMeta['status']; final?: boolean }
    if (d.events.length) onBatch(d.events, d.status)
    if (d.final) { es.close(); onEnd(d.status) }
  }
  es.onerror = () => { es.close(); onEnd('error') }
  return () => es.close()
}
