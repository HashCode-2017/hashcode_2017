import { useApp } from '../lib/store'
import { compact, int } from '../lib/format'
import { Label, Num, Panel, SplitBar, Stat } from '../components/Kit'
import { LatencyCompare, RankBars, Treemap } from '../viz/Charts'
import { NetworkCanvas } from '../viz/NetworkCanvas'

/**
 * Act 4. Where every request actually lands once the caches are full.
 *
 * The before/after latency chart is the payoff: the same request volume,
 * redistributed from one tall amber column at the datacenter latency down into
 * the cyan spread of cache latencies.
 */
export function Routing() {
  const result = useApp((s) => s.result)
  const topo = useApp((s) => s.topology)
  const streaming = useApp((s) => s.streaming)

  if (!result || !topo) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100%' }}>
        <span className="lbl" style={{ color: 'var(--ink-3)' }}>
          {streaming ? 'waiting for the run to finish…' : 'run the placement first'}
        </span>
      </div>
    )
  }

  const worst = [...result.endpoints].filter((e) => e.demand > 0)
    .sort((a, b) => (b.before - b.after) - (a.before - a.after)).slice(0, 8)
  const busiest = [...result.caches].sort((a, b) => b.requests - a.requests).slice(0, 8)

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1.35fr 1fr var(--tele)',
      gap: 1, background: 'var(--line)', height: '100%', minHeight: 0,
    }}>
      <div style={{ display: 'grid', gridTemplateRows: '1fr auto', gap: 1, minHeight: 0 }}>
        <Panel title="latency actually served, weighted by request volume" style={{ minHeight: 0 }}>
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 18 }}>
            <LatencyCompare
              before={result.latencyBefore}
              after={result.latencyAfter}
              height={168}
            />
            <div>
              <Label style={{ marginBottom: 8 }}>where the request volume goes</Label>
              <SplitBar cache={result.servedByCache} dc={result.servedByDatacenter} />
            </div>
          </div>
        </Panel>

        {topo.tier === 'graph' && (
          <Panel title="the network, now routed" flush style={{ height: 250 }}>
            <NetworkCanvas topo={topo} routed placement={result.placement} />
          </Panel>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateRows: 'auto auto 1fr', gap: 1, minHeight: 0 }}>
        <Panel title="cache fill — area is megabytes stored">
          <Treemap
            items={result.caches.filter((c) => c.usedMB > 0)
              .map((c) => ({ id: c.id, value: c.usedMB, fill: c.fill }))}
            height={168}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
            <span className="lbl">{result.caches.filter((c) => c.usedMB > 0).length} caches used</span>
            <span className="lbl mono" style={{ color: 'var(--ink-2)' }}>
              brighter = fuller
            </span>
          </div>
        </Panel>

        <Panel title="busiest caches, by requests served">
          <RankBars rows={busiest.map((c) => ({ label: 'cache ' + c.id, value: c.requests }))} />
        </Panel>

        <Panel title="how widely videos got copied" style={{ minHeight: 0 }}>
          <div style={{ overflowY: 'auto', height: '100%' }}>
            <p style={{ fontSize: 11.5, color: 'var(--ink-3)', margin: '0 0 12px', lineHeight: 1.55 }}>
              {int(result.replication.distinctVideos)} distinct videos were stored, as{' '}
              {int(result.replication.totalCopies)} copies. Most sit in exactly one cache — capacity
              spent on a second copy has to beat a video that is not cached anywhere yet.
            </p>
            <RankBars
              rows={result.replication.hist.slice(0, 9)
                .map(([copies, n]) => ({ label: copies + (copies === 1 ? ' cache' : ' caches'), value: n }))}
            />
          </div>
        </Panel>
      </div>

      <Panel title="result" style={{ minHeight: 0 }}>
        <div style={{ overflowY: 'auto', height: '100%' }}>
          <Stat label="score — microseconds saved per request" wide accent="ca">
            <Num value={result.score} />
          </Stat>
          <Stat label="average time saved" note="per request, across the whole data set">
            {result.avgSavedMs} ms
          </Stat>
          <Stat label="share of the reachable ceiling" accent="ca"
            note={`perfect placement would score ${int(result.ceiling)}`}>
            {result.ceilingPct}%
          </Stat>
          <Stat label="requests served from a cache"
            note={`of ${compact(result.totalRequests)} total`}>
            {compact(result.servedByCache)}
          </Stat>
          <Stat label="requests still from the datacenter" accent="dc"
            note="either no cache is connected, or none has the video">
            {compact(result.servedByDatacenter)}
          </Stat>

          <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
            <Label style={{ marginBottom: 8 }}>endpoints that gained the most</Label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {worst.map((e) => (
                <div key={e.id} className="mono" style={{ fontSize: 10.5 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--ink-3)' }}>endpoint {e.id}</span>
                    <span style={{ color: 'var(--ca-bright)' }}>
                      −{Math.round(e.before - e.after)} ms
                    </span>
                  </div>
                  <div style={{ display: 'flex', height: 6, gap: 1, marginTop: 3 }}>
                    <div style={{ width: `${(e.after / e.before) * 100}%`, background: 'var(--ca)' }} />
                    <div style={{ flex: 1, background: 'var(--dc-dim)' }} />
                  </div>
                  <div style={{ color: 'var(--ink-4)', fontSize: 9.5, marginTop: 2 }}>
                    {Math.round(e.before)} ms → {Math.round(e.after)} ms
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Panel>
    </div>
  )
}
