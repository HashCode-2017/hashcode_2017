import { useMemo, useState } from 'react'
import { useApp } from '../lib/store'
import { compact, int } from '../lib/format'
import { Label, Meter, Panel, Stat } from '../components/Kit'

type Tab = 'caches' | 'endpoints' | 'video'

/**
 * Free explore. Not part of the narrative — this is the mode to switch into
 * when somebody in the room asks "what about cache 212?" and the answer should
 * take two seconds, not a rebuild.
 */
export function Explore() {
  const result = useApp((s) => s.result)
  const topo = useApp((s) => s.topology)
  const [tab, setTab] = useState<Tab>('caches')
  const [sel, setSel] = useState<number | null>(null)
  const [query, setQuery] = useState('')

  // video id -> caches holding it, built once from the placement.
  const videoIndex = useMemo(() => {
    const m = new Map<number, number[]>()
    if (!result) return m
    for (const [c, vs] of Object.entries(result.placement)) {
      for (const v of vs) {
        const arr = m.get(v)
        if (arr) arr.push(Number(c))
        else m.set(v, [Number(c)])
      }
    }
    return m
  }, [result])

  if (!result || !topo) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100%' }}>
        <span className="lbl" style={{ color: 'var(--ink-3)' }}>run the placement first</span>
      </div>
    )
  }

  const rows = tab === 'caches'
    ? result.caches.filter((c) => !query || String(c.id).includes(query))
    : tab === 'endpoints'
      ? result.endpoints.filter((e) => !query || String(e.id).includes(query))
      : []

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr 380px',
      gap: 1, background: 'var(--line)', height: '100%', minHeight: 0,
    }}>
      <Panel
        title="free explore"
        right={
          <div style={{ display: 'flex', gap: 3 }}>
            {(['caches', 'endpoints', 'video'] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => { setTab(t); setSel(null); setQuery('') }}
                className="lbl"
                style={{
                  padding: '3px 9px',
                  border: `1px solid ${tab === t ? 'var(--ca)' : 'var(--line)'}`,
                  color: tab === t ? 'var(--ca-bright)' : 'var(--ink-3)',
                }}
              >{t}</button>
            ))}
          </div>
        }
        flush
        style={{ minHeight: 0 }}
      >
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ padding: '9px 12px', borderBottom: '1px solid var(--line)' }}>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value.replace(/[^0-9]/g, ''))}
              placeholder={tab === 'video' ? 'video id…' : `filter by ${tab.slice(0, -1)} id…`}
              className="mono"
              style={{
                width: '100%', background: 'var(--panel-2)', border: '1px solid var(--line)',
                color: 'var(--ink-0)', padding: '6px 9px', fontSize: 11.5, outline: 'none',
              }}
            />
          </div>

          <div style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
            {tab === 'video' ? (
              <VideoLookup id={query ? Number(query) : null} index={videoIndex} />
            ) : (
              <table className="mono" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10.5 }}>
                <thead>
                  <tr style={{ position: 'sticky', top: 0, background: 'var(--panel)' }}>
                    {(tab === 'caches'
                      ? ['id', 'videos', 'used MB', 'fill', 'endpoints', 'requests served']
                      : ['id', 'DC ms', 'achieved ms', 'saved', 'caches', 'requests']
                    ).map((h) => (
                      <th key={h} className="lbl" style={{
                        textAlign: h === 'id' ? 'left' : 'right',
                        padding: '7px 12px', borderBottom: '1px solid var(--line)', fontWeight: 500,
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 400).map((r) => {
                    const active = sel === r.id
                    return (
                      <tr
                        key={r.id}
                        onClick={() => setSel(active ? null : r.id)}
                        style={{
                          background: active ? 'var(--panel-2)' : 'transparent',
                          cursor: 'pointer', borderBottom: '1px solid var(--line)',
                        }}
                      >
                        {tab === 'caches' ? <CacheCells r={r as typeof result.caches[0]} />
                          : <EndpointCells r={r as typeof result.endpoints[0]} />}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
            {rows.length > 400 && (
              <div className="lbl" style={{ padding: 12, color: 'var(--ink-4)' }}>
                showing the first 400 of {int(rows.length)} — filter to narrow
              </div>
            )}
          </div>
        </div>
      </Panel>

      <Panel title={sel === null ? 'nothing selected' : `${tab.slice(0, -1)} ${sel}`} style={{ minHeight: 0 }}>
        <div style={{ overflowY: 'auto', height: '100%' }}>
          {sel === null ? (
            <p style={{ fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.6 }}>
              Pick a row to see what it holds, who it serves, and how much it saved.
            </p>
          ) : tab === 'caches' ? (
            <CacheDetail id={sel} />
          ) : (
            <EndpointDetail id={sel} />
          )}
        </div>
      </Panel>
    </div>
  )
}

const td: React.CSSProperties = { padding: '5px 12px', textAlign: 'right', color: 'var(--ink-1)' }
const tdL: React.CSSProperties = { ...td, textAlign: 'left', color: 'var(--ca-bright)' }

function CacheCells({ r }: { r: { id: number; videos: number; usedMB: number; fill: number; degree: number; requests: number } }) {
  return (
    <>
      <td style={tdL}>c{r.id}</td>
      <td style={td}>{int(r.videos)}</td>
      <td style={td}>{int(r.usedMB)}</td>
      <td style={{ ...td, color: r.fill > 0.9 ? 'var(--ca-bright)' : 'var(--ink-2)' }}>
        {(r.fill * 100).toFixed(0)}%
      </td>
      <td style={td}>{int(r.degree)}</td>
      <td style={td}>{compact(r.requests)}</td>
    </>
  )
}

function EndpointCells({ r }: { r: { id: number; ld: number; after: number; before: number; degree: number; demand: number } }) {
  const saved = r.before - r.after
  return (
    <>
      <td style={tdL}>e{r.id}</td>
      <td style={td}>{r.ld}</td>
      <td style={td}>{Math.round(r.after)}</td>
      <td style={{ ...td, color: saved > 0 ? 'var(--ca-bright)' : 'var(--ink-4)' }}>
        {saved > 0 ? `−${Math.round(saved)}` : '—'}
      </td>
      <td style={td}>{r.degree}</td>
      <td style={td}>{compact(r.demand)}</td>
    </>
  )
}

function CacheDetail({ id }: { id: number }) {
  const result = useApp((s) => s.result)
  const topo = useApp((s) => s.topology)
  if (!result || !topo) return null
  const c = result.caches[id]
  const stored = result.placement[String(id)] || []
  const meta = topo.caches[id]

  return (
    <>
      <Stat label="capacity used" note={`${int(c.usedMB)} of ${int(c.capacityMB)} MB`}>
        {(c.fill * 100).toFixed(1)}%
      </Stat>
      <div style={{ padding: '2px 0 12px' }}><Meter value={c.fill} segments={30} /></div>
      <Stat label="videos stored">{int(c.videos)}</Stat>
      <Stat label="requests it serves" note="requests for which it was the closest copy">
        {compact(c.requests)}
      </Stat>
      <Stat label="endpoints connected"
        note={meta && meta.minLat !== null ? `closest is ${meta.minLat} ms away` : undefined}>
        {int(c.degree)}
      </Stat>

      <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
        <Label style={{ marginBottom: 8 }}>contents — {stored.length} video ids</Label>
        <div className="mono" style={{
          fontSize: 10, color: 'var(--ink-2)', lineHeight: 1.75,
          maxHeight: 240, overflowY: 'auto', wordBreak: 'break-all',
        }}>
          {stored.length ? stored.join('  ') : <span style={{ color: 'var(--ink-4)' }}>empty</span>}
        </div>
      </div>
    </>
  )
}

function EndpointDetail({ id }: { id: number }) {
  const result = useApp((s) => s.result)
  const topo = useApp((s) => s.topology)
  if (!result || !topo) return null
  const e = result.endpoints[id]
  const meta = topo.endpoints[id]
  const edges = (topo.edges || []).filter((x) => x.e === id).sort((a, b) => a.lat - b.lat)

  return (
    <>
      <Stat label="achieved latency" wide accent="ca"
        note={`down from ${Math.round(e.before)} ms at the datacenter`}>
        {Math.round(e.after)} ms
      </Stat>
      <Stat label="requests from here">{compact(e.demand)}</Stat>
      <Stat label="share served from a cache">{(e.cachedShare * 100).toFixed(1)}%</Stat>
      <Stat label="caches reachable"
        note={meta ? `best possible is ${meta.bestLat} ms` : undefined}>
        {int(e.degree)}
      </Stat>

      {edges.length > 0 && (
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
          <Label style={{ marginBottom: 8 }}>its caches, nearest first</Label>
          {edges.map((x) => {
            const stored = result.placement[String(x.c)] || []
            return (
              <div key={x.c} className="mono" style={{
                display: 'flex', justifyContent: 'space-between',
                fontSize: 10.5, padding: '3px 0',
              }}>
                <span style={{ color: 'var(--ca-bright)' }}>cache {x.c}</span>
                <span style={{ color: 'var(--ink-2)' }}>{x.lat} ms</span>
                <span style={{ color: 'var(--ink-4)' }}>{stored.length} videos</span>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}

function VideoLookup({ id, index }: { id: number | null; index: Map<number, number[]> }) {
  const result = useApp((s) => s.result)
  const summary = useApp((s) => s.summary)
  if (id === null || Number.isNaN(id)) {
    return (
      <div style={{ padding: 16 }}>
        <p style={{ fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.6, maxWidth: 460 }}>
          Type a video id to see every cache holding a copy of it.
        </p>
        {result && (
          <div style={{ marginTop: 18, maxWidth: 460 }}>
            <Label style={{ marginBottom: 8 }}>most widely copied videos</Label>
            {result.replication.top.slice(0, 12).map((t) => (
              <div key={t.video} className="mono" style={{
                display: 'flex', justifyContent: 'space-between',
                fontSize: 11, padding: '4px 0', borderBottom: '1px solid var(--line)',
              }}>
                <span style={{ color: 'var(--ca-bright)' }}>video {t.video}</span>
                <span style={{ color: 'var(--ink-2)' }}>{t.size} MB</span>
                <span style={{ color: 'var(--ink-1)' }}>{t.copies} copies</span>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }
  const caches = index.get(id) || []
  return (
    <div style={{ padding: 16, maxWidth: 560 }}>
      <div className="mono" style={{ fontSize: 17, color: 'var(--ink-0)' }}>video {id}</div>
      <div className="lbl" style={{ marginTop: 4 }}>
        {summary && id < summary.V ? 'in the catalog' : 'out of range for this data set'}
      </div>
      <div style={{ marginTop: 16 }}>
        <Label style={{ marginBottom: 8 }}>
          stored in {caches.length} {caches.length === 1 ? 'cache' : 'caches'}
        </Label>
        <div className="mono" style={{ fontSize: 11, color: 'var(--ca-bright)', lineHeight: 1.9, wordBreak: 'break-all' }}>
          {caches.length
            ? caches.map((c) => 'c' + c).join('  ')
            : <span style={{ color: 'var(--ink-4)' }}>nowhere — every request for it goes to the datacenter</span>}
        </div>
      </div>
    </div>
  )
}
