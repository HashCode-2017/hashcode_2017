import { useEffect, useState } from 'react'
import { useApp } from '../lib/store'
import { compact, int, mb } from '../lib/format'
import { Label, Num, Panel, Stat } from '../components/Kit'
import { Histogram } from '../viz/Histogram'

/**
 * Act 1. The file becomes entities.
 *
 * The left pane types out the real first bytes of the real file; the right
 * pane shows what those bytes mean once parsed. The headline is the request
 * total, because that is the number nobody expects: `kittens` describes a
 * billion individual video requests in 200,000 lines.
 */
export function Ingest() {
  const summary = useApp((s) => s.summary)
  const [typed, setTyped] = useState(0)

  useEffect(() => {
    setTyped(0)
    if (!summary) return
    const target = summary.head.length
    const t0 = performance.now()
    let raf = 0
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 2200)
      setTyped(Math.floor(k * target))
      if (k < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [summary])

  if (!summary) return <Loading />

  const lines = summary.head.slice(0, typed).split('\n')
  const capacityRatio = summary.totalCapacityMB / summary.totalVideoMB

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr 1.25fr var(--tele)',
      gap: 1, background: 'var(--line)', height: '100%', minHeight: 0,
    }}>
      {/* raw bytes */}
      <Panel title={`${summary.id}.in — first bytes`} flush style={{ minHeight: 0 }}>
        <div className="mono" style={{
          height: '100%', overflow: 'hidden', padding: 12, fontSize: 10.5,
          lineHeight: 1.55, color: 'var(--ink-2)', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
        }}>
          {lines.map((l, i) => (
            <div key={i} style={{ display: 'flex', gap: 10 }}>
              <span style={{ color: 'var(--ink-4)', minWidth: 20, textAlign: 'right', flex: '0 0 auto' }}>
                {i + 1}
              </span>
              <span style={{ color: i === 0 ? 'var(--ca-bright)' : 'var(--ink-2)' }}>{l}</span>
            </div>
          ))}
          <span style={{
            display: 'inline-block', width: 7, height: 12, background: 'var(--ca-bright)',
            verticalAlign: -2, opacity: typed < summary.head.length ? 1 : 0,
          }} />
        </div>
      </Panel>

      {/* what it means */}
      <div style={{ display: 'grid', gridTemplateRows: 'auto 1fr', gap: 1, minHeight: 0 }}>
        <Panel title="the first line, decoded">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
            <Decoded k="V" label="videos" value={summary.V} />
            <Decoded k="E" label="endpoints" value={summary.E} />
            <Decoded k="R" label="request rows" value={summary.R} />
            <Decoded k="C" label="cache servers" value={summary.C} />
            <Decoded k="X" label="MB per cache" value={summary.X} />
          </div>
        </Panel>

        <Panel title="distributions" style={{ minHeight: 0 }}>
          <div style={{ display: 'grid', gap: 18, overflowY: 'auto', height: '100%' }}>
            <Block caption="video sizes, MB">
              <Histogram hist={summary.dist.videoSize} unit=" MB" caption="how big the catalog items are" />
            </Block>
            <Block caption="latency to the datacenter, per endpoint">
              <Histogram hist={summary.dist.dcLatency} color="var(--dc)" unit=" ms"
                caption="what every request costs today" />
            </Block>
            {summary.dist.cacheLatency && (
              <Block caption="latency to a cache, per link">
                <Histogram hist={summary.dist.cacheLatency} unit=" ms"
                  caption="what a cache hit would cost instead" />
              </Block>
            )}
            <Block caption="requests per row">
              <Histogram hist={summary.dist.requestRow} caption="demand concentration" />
            </Block>
          </div>
        </Panel>
      </div>

      {/* telemetry */}
      <Panel title="what we are working with" style={{ minHeight: 0 }}>
        <div style={{ overflowY: 'auto', height: '100%' }}>
          <Stat label="total individual requests" wide accent="dc"
            note={`described in just ${int(summary.R)} rows`}>
            <Num value={summary.totalRequests} />
          </Stat>
          <Stat label="catalog size" note="every video, stored in the datacenter">
            {mb(summary.totalVideoMB)}
          </Stat>
          <Stat label="total cache capacity"
            note={`${(capacityRatio * 100).toFixed(1)}% of the catalog fits in cache`}>
            {mb(summary.totalCapacityMB)}
          </Stat>
          <Stat label="endpoint ↔ cache links"
            note={`${summary.avgLinksPerEndpoint} per endpoint on average`}>
            <Num value={summary.links} />
          </Stat>
          {summary.unconnectedEndpoints > 0 && (
            <Stat label="endpoints with no cache at all" accent="dc"
              note="these can only ever be served by the datacenter">
              {int(summary.unconnectedEndpoints)}
            </Stat>
          )}
          <Stat label="parse cost" note="read once, reused for every run">
            {summary.prewarmed ? 'cached' : 'on demand'}
          </Stat>

          <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
            <Label>most requested videos</Label>
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {summary.topVideos.slice(0, 9).map((v) => (
                <div key={v.video} className="mono" style={{
                  display: 'grid', gridTemplateColumns: '54px 1fr 50px',
                  gap: 8, fontSize: 10.5, alignItems: 'center',
                }}>
                  <span style={{ color: 'var(--ink-3)' }}>v{v.video}</span>
                  <div style={{ height: 7, background: 'var(--panel-3)' }}>
                    <div style={{
                      width: `${(v.requests / summary.topVideos[0].requests) * 100}%`,
                      height: '100%', background: 'var(--ca)',
                    }} />
                  </div>
                  <span style={{ textAlign: 'right', color: 'var(--ink-1)' }}>{compact(v.requests)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Panel>
    </div>
  )
}

function Decoded({ k, label, value }: { k: string; label: string; value: number }) {
  return (
    <div style={{ borderLeft: '2px solid var(--ca-dim)', paddingLeft: 9 }}>
      <div className="mono" style={{ fontSize: 10, color: 'var(--ca-bright)' }}>{k}</div>
      <div className="num" style={{ fontSize: 19, color: 'var(--ink-0)', lineHeight: 1.2 }}>
        <Num value={value} />
      </div>
      <Label>{label}</Label>
    </div>
  )
}

function Block({ caption, children }: { caption: string; children: React.ReactNode }) {
  return (
    <div>
      <Label style={{ marginBottom: 7 }}>{caption}</Label>
      {children}
    </div>
  )
}

export function Loading() {
  return (
    <div style={{ display: 'grid', placeItems: 'center', height: '100%' }}>
      <span className="lbl" style={{ color: 'var(--ink-3)' }}>reading the file…</span>
    </div>
  )
}
