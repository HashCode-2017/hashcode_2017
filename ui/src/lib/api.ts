export type Tier = 'graph' | 'aggregate'

export interface InstanceRow {
  id: string; file: string; blurb: string; bytes: number; tier: Tier
  V: number; E: number; R: number; C: number; X: number
  prewarmed: boolean; loaded: boolean
}

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
  validation: {
    valid: boolean
    problems: { cache: number; kind: string; detail: string }[]
    describedCaches: number; totalCaches: number
    largestFill: number; capacityMB: number
  }
}

export interface RunMeta {
  id: string; instance: string; rounds: number
  status: 'queued' | 'parsing' | 'solving' | 'analysing' | 'done' | 'error'
  error: string | null; cached: boolean; eventCount: number
  parseSeconds: number | null; solveSeconds: number | null; analyseSeconds: number | null
  created?: boolean
}

export interface RunRecord extends RunMeta { events: Ev[]; result: RunResult | null }

async function get<T>(url: string): Promise<T> {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`${r.status} ${r.statusText} — ${url}`)
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
