import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, type ClassStats, type Hist, type RunResult } from '../lib/api'
import { useApp } from '../lib/store'
import { compact, int } from '../lib/format'
import { Label, Panel } from '../components/Kit'
import { Histogram } from '../viz/Histogram'
import { RankBars } from '../viz/Charts'
import { Tabs } from './Leaderboard'

/** Equal-width bins over `values`; the shape the Histogram component draws. */
function toHist(values: number[], bins = 20, lo?: number, hi?: number): Hist | null {
  if (!values.length) return null
  const a = lo ?? Math.min(...values)
  const b = hi ?? Math.max(...values)
  const span = b - a || 1
  const counts = new Array(bins).fill(0)
  for (const v of values) counts[Math.min(bins - 1, Math.max(0, Math.floor(((v - a) / span) * bins)))]++
  return { lo: a, hi: b === a ? a + 1 : b, bins: counts, max: Math.max(1, ...counts) }
}

/**
 * Two lenses on the numbers. "This run" takes the loaded result apart --
 * every cache, every endpoint, sortable. "Class" aggregates every submission:
 * how each data set is going, who is active, and when.
 */
export function Stats() {
  const result = useApp((s) => s.result)
  const meta = useApp((s) => s.meta)
  const [tab, setTab] = useState<'run' | 'class'>(result ? 'run' : 'class')

  return (
    <div style={{ padding: '24px 30px', overflowY: 'auto', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 18, marginBottom: 18, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 25, fontWeight: 600, letterSpacing: '-0.025em', color: 'var(--ink-0)', margin: 0 }}>
          Statistics
        </h1>
        <Tabs value={tab} onChange={(v) => setTab(v as 'run' | 'class')}
          options={[['run', meta ? `this run · ${meta.instance}` : 'this run'], ['class', 'the class']]} />
      </div>
      {tab === 'run'
        ? (result ? <RunStats result={result} /> : <Empty>Pick a data set and play a run (yours or the reference solver) to see its statistics.</Empty>)
        : <ClassView />}
    </div>
  )
}

function Empty({ children }: { children: ReactNode }) {
  return <div className="lbl" style={{ color: 'var(--ink-3)', padding: '40px 0' }}>{children}</div>
}

function Tile({ label, value, note, accent }: { label: string; value: ReactNode; note?: string; accent?: boolean }) {
  return (
    <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', padding: '11px 13px' }}>
      <Label>{label}</Label>
      <div className="num" style={{
        fontSize: 22, marginTop: 4, letterSpacing: '-0.01em',
        color: accent ? 'var(--ca-bright)' : 'var(--ink-0)',
      }}>{value}</div>
      {note && <div style={{ fontSize: 10.5, color: 'var(--ink-3)', marginTop: 2 }}>{note}</div>}
    </div>
  )
}

const tiles = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 8, marginBottom: 14 } as const
const row3 = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 8, marginBottom: 14 } as const

// ------------------------------------------------------------------ this run

function RunStats({ result }: { result: RunResult }) {
  const C = result.caches.length
  const used = result.caches.filter((c) => c.videos > 0)
  const capacity = result.caches.reduce((s, c) => s + c.capacityMB, 0)
  const usedMB = result.caches.reduce((s, c) => s + c.usedMB, 0)
  const withDemand = result.endpoints.filter((e) => e.demand > 0)
  const gainPct = withDemand.map((e) => e.before ? ((e.before - e.after) / e.before) * 100 : 0)
  const improved = gainPct.filter((g) => g > 0).length
  const untouched = withDemand.filter((e) => e.cachedShare === 0)

  return (
    <>
      <div style={tiles}>
        <Tile label="score" value={int(result.score)} accent note="µs saved per request" />
        <Tile label="of the reachable ceiling" value={`${result.ceilingPct ?? '—'}%`} note={`ceiling ${int(result.ceiling)}`} />
        <Tile label="requests from a cache" value={`${(result.cacheShare * 100).toFixed(1)}%`} note={`${compact(result.servedByCache)} of ${compact(result.totalRequests)}`} />
        <Tile label="average time saved" value={`${result.avgSavedMs} ms`} note="per request" />
        <Tile label="capacity used" value={`${capacity ? ((usedMB / capacity) * 100).toFixed(1) : 0}%`} note={`${int(usedMB)} of ${int(capacity)} MB`} />
        <Tile label="caches in use" value={`${used.length} / ${C}`} note={`${C - used.length} left empty`} />
        <Tile label="videos stored" value={int(result.replication.distinctVideos)} note={`as ${int(result.replication.totalCopies)} copies`} />
        <Tile label="endpoints improved" value={`${improved} / ${withDemand.length}`} note={`${untouched.length} get nothing from a cache`} />
      </div>

      <div style={row3}>
        <Panel title="endpoint latency cut, % — one bar per range of endpoints">
          <Histogram hist={toHist(gainPct, 20, 0, 100)} unit="%" height={110} caption="how much faster each endpoint got" />
        </Panel>
        <Panel title="cache fill, % — how full each cache ended">
          <Histogram hist={toHist(result.caches.map((c) => c.fill * 100), 20, 0, 100)} unit="%" height={110} caption="caches per fill level" />
        </Panel>
        <Panel title="requests served per cache">
          <Histogram hist={toHist(result.caches.map((c) => c.requests), 20)} height={110} caption="caches per load level" />
        </Panel>
      </div>

      <div style={row3}>
        <Panel title="most-copied videos — copies across caches">
          <RankBars rows={result.replication.top.slice(0, 10).map((t) => ({
            label: `video ${t.video}`, value: t.copies, sub: `${t.size} MB`,
          }))} unit="×" />
        </Panel>
        <Panel title="busiest caches, by requests served">
          <RankBars rows={[...result.caches].sort((a, b) => b.requests - a.requests).slice(0, 10)
            .map((c) => ({ label: `cache ${c.id}`, value: c.requests }))} />
        </Panel>
        <Panel title="heaviest endpoints, by request volume">
          <RankBars rows={[...withDemand].sort((a, b) => b.demand - a.demand).slice(0, 10)
            .map((e) => ({ label: `endpoint ${e.id}`, value: e.demand, sub: `${(e.cachedShare * 100).toFixed(0)}% cached` }))} />
        </Panel>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(460px, 1fr))', gap: 8 }}>
        <Panel title="every cache" flush>
          <Table
            rows={result.caches}
            cols={[
              ['cache', (c) => c.id, (c) => c.id],
              ['videos', (c) => c.videos, (c) => int(c.videos)],
              ['used MB', (c) => c.usedMB, (c) => int(c.usedMB)],
              ['fill', (c) => c.fill, (c) => `${(c.fill * 100).toFixed(1)}%`],
              ['requests', (c) => c.requests, (c) => compact(c.requests)],
              ['endpoints', (c) => c.degree, (c) => c.degree],
            ]}
            initial={4}
          />
        </Panel>
        <Panel title="every endpoint" flush>
          <Table
            rows={result.endpoints}
            cols={[
              ['endpoint', (e) => e.id, (e) => e.id],
              ['requests', (e) => e.demand, (e) => compact(e.demand)],
              ['before ms', (e) => e.before, (e) => Math.round(e.before)],
              ['after ms', (e) => e.after, (e) => Math.round(e.after)],
              ['cut', (e) => e.before ? (e.before - e.after) / e.before : 0,
                (e) => `${e.before ? (((e.before - e.after) / e.before) * 100).toFixed(1) : 0}%`],
              ['cached', (e) => e.cachedShare, (e) => `${(e.cachedShare * 100).toFixed(0)}%`],
              ['caches', (e) => e.degree, (e) => e.degree],
            ]}
            initial={1}
          />
        </Panel>
      </div>
    </>
  )
}

type Col<T> = [string, (r: T) => number, (r: T) => ReactNode]
const ROW_CAP = 300

/** Click a header to sort; click again to flip. Capped so `kittens` stays snappy. */
function Table<T>({ rows, cols, initial }: { rows: T[]; cols: Col<T>[]; initial: number }) {
  const [sort, setSort] = useState<{ i: number; desc: boolean }>({ i: initial, desc: true })
  const sorted = useMemo(() => {
    const key = cols[sort.i][1]
    return [...rows].sort((a, b) => (sort.desc ? key(b) - key(a) : key(a) - key(b))).slice(0, ROW_CAP)
  }, [rows, cols, sort])
  const grid = `repeat(${cols.length}, 1fr)`
  return (
    <div style={{ maxHeight: 380, overflowY: 'auto' }}>
      <div className="lbl" style={{
        display: 'grid', gridTemplateColumns: grid, gap: 8, padding: '7px 12px',
        position: 'sticky', top: 0, background: 'var(--panel)', borderBottom: '1px solid var(--line)',
      }}>
        {cols.map(([name], i) => (
          <button key={name} className="lbl" onClick={() => setSort({ i, desc: sort.i === i ? !sort.desc : true })}
            style={{ textAlign: i ? 'right' : 'left', color: sort.i === i ? 'var(--ca-bright)' : 'var(--ink-3)' }}>
            {name}{sort.i === i ? (sort.desc ? ' ↓' : ' ↑') : ''}
          </button>
        ))}
      </div>
      {sorted.map((r, k) => (
        <div key={k} className="mono strow" style={{
          display: 'grid', gridTemplateColumns: grid, gap: 8, padding: '4px 12px', fontSize: 11.5,
          borderBottom: '1px solid var(--line)',
        }}>
          {cols.map(([name, , show], i) => (
            <span key={name} style={{ textAlign: i ? 'right' : 'left', color: i ? 'var(--ink-1)' : 'var(--ink-3)' }}>{show(r)}</span>
          ))}
        </div>
      ))}
      {rows.length > ROW_CAP && (
        <div className="lbl" style={{ padding: '8px 12px', color: 'var(--ink-4)' }}>
          showing {ROW_CAP} of {int(rows.length)} — sort to bring others to the top
        </div>
      )}
      <style>{`.strow:hover { background: var(--panel-2); }`}</style>
    </div>
  )
}

// --------------------------------------------------------------------- class

function ClassView() {
  const [stats, setStats] = useState<ClassStats | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [focus, setFocus] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    const load = () => api.stats().then((s) => { if (alive) setStats(s) }).catch((e) => alive && setError(String(e)))
    void load()
    const t = setInterval(load, 15000)
    return () => { alive = false; clearInterval(t) }
  }, [])

  if (error) return <Empty>{error}</Empty>
  if (!stats) return <Empty>loading…</Empty>
  if (!stats.submissions) return <Empty>No submissions yet. The first upload starts the statistics.</Empty>

  const current = stats.instances.find((r) => r.instance === focus) ?? stats.instances[0]
  const recent = stats.timeline.slice(-12)

  return (
    <>
      <div style={tiles}>
        <Tile label="players" value={stats.players} note={`in ${stats.groups.length} groups`} />
        <Tile label="submissions" value={int(stats.submissions)} accent />
        <Tile label="valid" value={`${((stats.valid / stats.submissions) * 100).toFixed(0)}%`} note={`${stats.submissions - stats.valid} over capacity`} />
        <Tile label="with a trace" value={`${((stats.withTrace / stats.submissions) * 100).toFixed(0)}%`} note="replayed in their own order" />
        <Tile label="data sets attempted" value={stats.instances.length} />
      </div>

      <Panel title="per data set — click a row for its score distribution" flush style={{ marginBottom: 14 }}>
        <div>
          <div className="lbl" style={{
            display: 'grid', gridTemplateColumns: '1.6fr repeat(8, 1fr)', gap: 8, padding: '7px 12px',
            borderBottom: '1px solid var(--line)',
          }}>
            {['data set', 'submissions', 'players', 'groups', 'best', 'median', 'mean', 'lowest', 'invalid'].map((h, i) => (
              <span key={h} style={{ textAlign: i ? 'right' : 'left' }}>{h}</span>
            ))}
          </div>
          {stats.instances.map((r) => (
            <button key={r.instance} onClick={() => setFocus(r.instance)} className="mono strow" style={{
              display: 'grid', gridTemplateColumns: '1.6fr repeat(8, 1fr)', gap: 8, padding: '6px 12px',
              width: '100%', fontSize: 11.5, borderBottom: '1px solid var(--line)',
              background: r.instance === current.instance ? 'var(--panel-3)' : 'transparent',
            }}>
              <span style={{ textAlign: 'left', color: r.instance === current.instance ? 'var(--ca-bright)' : 'var(--ink-1)' }}>{r.instance}</span>
              {[r.submissions, r.players, r.groups, r.best, r.median, r.mean, r.lowest, r.invalid].map((v, i) => (
                <span key={i} style={{ textAlign: 'right', color: 'var(--ink-1)' }}>{v == null ? '—' : int(v)}</span>
              ))}
            </button>
          ))}
          <style>{`.strow:hover { background: var(--panel-2); }`}</style>
        </div>
      </Panel>

      <div style={row3}>
        <Panel title={`${current.instance} — each player's best score`}>
          <Histogram hist={toHist(current.playerBests, 16)} height={120} caption={`${current.players} players`} />
        </Panel>
        <Panel title="submissions per group">
          <RankBars rows={[...stats.groups].sort((a, b) => b.submissions - a.submissions)
            .map((g) => ({ label: `group ${g.group}`, value: g.submissions, sub: `${g.members}/4 members` }))} />
        </Panel>
        <Panel title="submissions per hour, latest 12">
          <RankBars rows={recent.map(([t, n]) => ({
            label: new Date(t * 1000).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' }),
            value: n,
          }))} />
        </Panel>
      </div>
    </>
  )
}
