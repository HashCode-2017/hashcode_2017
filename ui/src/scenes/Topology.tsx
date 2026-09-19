import { useApp } from '../lib/store'
import { compact, int } from '../lib/format'
import { Label, Num, Panel, Stat } from '../components/Kit'
import { NetworkCanvas } from '../viz/NetworkCanvas'
import { Matrix } from '../viz/Matrix'
import { Histogram } from '../viz/Histogram'
import { Loading } from './Ingest'

/**
 * Act 2. The network before anything is cached: every request climbs all the
 * way to the datacenter, and the score is exactly zero.
 *
 * Which drawing appears depends on how dense the instance is. A node-link
 * graph for the sparse ones; for `trending_today` and `kittens` an aggregate
 * view, labelled as such. Faking a graph of 351,881 links would look busier
 * and say less.
 */
export function Topology() {
  const topo = useApp((s) => s.topology)
  const summary = useApp((s) => s.summary)
  if (!topo || !summary) return <Loading />

  const avgLd = summary.dist.dcLatency
  const reachable = topo.endpoints.filter((e) => e.degree > 0).length
  const demandTotal = topo.endpoints.reduce((s, e) => s + e.demand, 0)
  const reachableDemand = topo.endpoints.filter((e) => e.degree > 0)
    .reduce((s, e) => s + e.demand, 0)

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr var(--tele)',
      gap: 1, background: 'var(--line)', height: '100%', minHeight: 0,
    }}>
      <Panel
        title={topo.tier === 'graph' ? 'serving topology' : 'serving topology — aggregate view'}
        right={
          <span className="lbl mono" style={{ color: 'var(--ink-3)' }}>
            {int(topo.links)} endpoint↔cache links
          </span>
        }
        flush
        style={{ minHeight: 0 }}
      >
        {topo.tier === 'graph' ? (
          <NetworkCanvas topo={topo} />
        ) : (
          <DenseView />
        )}
      </Panel>

      <Panel title="cold state" style={{ minHeight: 0 }}>
        <div style={{ overflowY: 'auto', height: '100%' }}>
          <p style={{ fontSize: 12, color: 'var(--ink-2)', margin: '0 0 14px', lineHeight: 1.55 }}>
            Nothing is cached yet. Every one of those requests is answered by the datacenter, at the
            full latency of each endpoint&apos;s uplink.
          </p>

          <Stat label="time saved so far" wide accent="dc" note="the score before we do anything">
            0 μs
          </Stat>
          <Stat label="requests served by a cache" accent="dc">0</Stat>
          <Stat label="cache capacity in use" note={`${int(topo.C * topo.X)} MB sitting empty`}>
            0 MB
          </Stat>
          <Stat label="endpoints that can reach a cache"
            note={`${compact(reachableDemand)} of ${compact(demandTotal)} requests are even eligible`}>
            <Num value={reachable} /> / {topo.E}
          </Stat>

          <div style={{ marginTop: 18 }}>
            <Label style={{ marginBottom: 7 }}>datacenter latency, per endpoint</Label>
            <Histogram hist={avgLd} color="var(--dc)" unit=" ms" height={62}
              caption="what every request costs right now" />
          </div>

          {summary.dist.cacheLatency && (
            <div style={{ marginTop: 18 }}>
              <Label style={{ marginBottom: 7 }}>latency if a cache had the video</Label>
              <Histogram hist={summary.dist.cacheLatency} unit=" ms" height={62}
                caption="the whole opportunity, in one chart" />
            </div>
          )}

          <div style={{ marginTop: 18 }}>
            <Label style={{ marginBottom: 7 }}>caches reachable per endpoint</Label>
            <Histogram hist={summary.dist.endpointDegree} height={52} caption="connectivity" />
          </div>
        </div>
      </Panel>
    </div>
  )
}

function DenseView() {
  const topo = useApp((s) => s.topology)
  if (!topo) return null
  const m = topo.matrix

  return (
    <div style={{ padding: 14, height: '100%', overflowY: 'auto' }}>
      <div className="mono" style={{
        fontSize: 11, color: 'var(--ink-2)', border: '1px solid var(--line)',
        borderLeft: '2px solid var(--dc-bright)', padding: '9px 12px', marginBottom: 16,
      }}>
        {int(topo.links)} links between {int(topo.E)} endpoints and {int(topo.C)} caches.
        <span style={{ color: 'var(--ink-3)' }}>
          {' '}Too dense to draw as a graph — showing the connection map instead.
        </span>
      </div>

      {m && <Matrix m={m} height={330} />}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginTop: 22 }}>
        <div>
          <Label style={{ marginBottom: 8 }}>cache servers, by how many endpoints they serve</Label>
          <SparkRow
            values={topo.caches.map((c) => c.degree).sort((a, b) => b - a)}
            color="var(--ca)"
          />
        </div>
        <div>
          <Label style={{ marginBottom: 8 }}>endpoints, by request volume</Label>
          <SparkRow
            values={topo.endpoints.map((e) => e.demand).sort((a, b) => b - a)}
            color="var(--dc)"
          />
        </div>
      </div>
    </div>
  )
}

/** A ranked profile: every member of the population, tallest first. */
function SparkRow({ values, color }: { values: number[]; color: string }) {
  const max = Math.max(1, ...values)
  const cap = 220
  const stride = Math.max(1, Math.ceil(values.length / cap))
  const shown = values.filter((_, i) => i % stride === 0)
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 1, height: 64 }}>
        {shown.map((v, i) => (
          <div key={i} style={{
            flex: 1, height: `${Math.max(2, (v / max) * 100)}%`, background: color, opacity: 0.85,
          }} />
        ))}
      </div>
      <div style={{
        display: 'flex', justifyContent: 'space-between', marginTop: 4,
        borderTop: '1px solid var(--line)', paddingTop: 4,
      }}>
        <span className="lbl mono">max {int(max)}</span>
        <span className="lbl mono">{int(values.length)} total</span>
        <span className="lbl mono">min {int(values[values.length - 1] || 0)}</span>
      </div>
    </div>
  )
}
