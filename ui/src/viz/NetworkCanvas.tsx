import { useEffect, useRef, useState } from 'react'
import {
  forceCollide, forceLink, forceSimulation, forceX, forceY,
  type SimulationNodeDatum,
} from 'd3-force'
import type { Topology } from '../lib/api'
import {
  CA, CA_BRIGHT, CA_DIM, DC, DC_BRIGHT, INK0, INK2, INK3,
  SEQ, alpha, fitCanvas, ramp,
} from './palette'

type Kind = 'dc' | 'cache' | 'endpoint'
interface N extends SimulationNodeDatum { key: string; kind: Kind; id: number; r: number }
interface L { source: N; target: N; lat: number; t: number; used: boolean }

export interface Pick { kind: Kind; id: number }

/**
 * The serving network as three bands: datacenter on top, caches in the middle,
 * endpoints below. A free force layout turns this into a blob and hides the one
 * thing that matters -- that traffic either climbs all the way to the
 * datacenter or stops at a cache. Forces only spread nodes within their band.
 *
 * Only ever mounted for tier === 'graph'. Dense data sets get the matrix.
 */
export function NetworkCanvas({ topo, routed, placement, onPick }: {
  topo: Topology
  routed?: boolean
  placement?: Record<string, number[]>
  onPick?: (p: Pick | null) => void
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<{ n: N; x: number; y: number } | null>(null)
  const state = useRef<{ nodes: N[] } | null>(null)

  useEffect(() => {
    const cv = ref.current
    const box = wrap.current
    if (!cv || !box) return
    const rect = box.getBoundingClientRect()
    const W = rect.width || 800
    const H = rect.height || 500

    const maxDemand = Math.max(1, ...topo.endpoints.map((e) => e.demand))
    const maxDeg = Math.max(1, ...topo.caches.map((c) => c.degree))

    const dc: N = { key: 'dc', kind: 'dc', id: -1, r: 15, fx: W / 2, fy: H * 0.11 }
    const caches: N[] = topo.caches.map((c) => ({
      key: 'c' + c.id, kind: 'cache', id: c.id,
      r: 5 + 6 * Math.sqrt(c.degree / maxDeg),
      x: W * (0.15 + 0.7 * Math.random()), y: H * 0.45,
    }))
    const eps: N[] = topo.endpoints.map((e) => ({
      key: 'e' + e.id, kind: 'endpoint', id: e.id,
      r: 3.2 + 5 * Math.sqrt(e.demand / maxDemand),
      x: W * (0.1 + 0.8 * Math.random()), y: H * 0.84,
    }))
    const byKey = new Map<string, N>()
    byKey.set('dc', dc)
    for (const n of caches) byKey.set(n.key, n)
    for (const n of eps) byKey.set(n.key, n)

    const edges = topo.edges || []
    const lats = edges.map((e) => e.lat)
    const loL = lats.length ? Math.min(...lats) : 1
    const hiL = lats.length ? Math.max(...lats) : 2
    const links: L[] = edges.map((e) => {
      const stored = placement ? placement[String(e.c)] : undefined
      return {
        source: byKey.get('e' + e.e) as N,
        target: byKey.get('c' + e.c) as N,
        lat: e.lat,
        t: (e.lat - loL) / (hiL - loL || 1),
        used: !!stored && stored.length > 0,
      }
    })

    // Layered layout. Each band is spread across the full width by rank, with
    // a couple of barycentre sweeps first so connected nodes sit near each
    // other and edges mostly run downhill instead of crossing. Pulling
    // everything toward a single centre instead just collapses the whole graph
    // into a narrow column and wastes the frame.
    const epOf = new Map<number, number[]>()
    const caOf = new Map<number, number[]>()
    for (const e of edges) {
      const a = caOf.get(e.c); if (a) a.push(e.e); else caOf.set(e.c, [e.e])
      const b = epOf.get(e.e); if (b) b.push(e.c); else epOf.set(e.e, [e.c])
    }
    const mean = (xs: number[] | undefined, rank: Map<number, number>, fallback: number) => {
      if (!xs || !xs.length) return fallback
      let s = 0
      for (const x of xs) s += rank.get(x) ?? 0
      return s / xs.length
    }
    let cRank = new Map(topo.caches.map((c, i) => [c.id, i]))
    let eRank = new Map(topo.endpoints.map((e, i) => [e.id, i]))
    for (let sweep = 0; sweep < 3; sweep++) {
      const cOrder = [...topo.caches].sort((a, b) =>
        mean(caOf.get(a.id), eRank, cRank.get(a.id) ?? 0) - mean(caOf.get(b.id), eRank, cRank.get(b.id) ?? 0))
      cRank = new Map(cOrder.map((c, i) => [c.id, i]))
      const eOrder = [...topo.endpoints].sort((a, b) =>
        mean(epOf.get(a.id), cRank, eRank.get(a.id) ?? 0) - mean(epOf.get(b.id), cRank, eRank.get(b.id) ?? 0))
      eRank = new Map(eOrder.map((e, i) => [e.id, i]))
    }

    const spread = (rank: number, count: number, width: number, inset: number) =>
      count <= 1 ? width / 2 : inset + ((width - 2 * inset) * rank) / (count - 1)

    const targetX = new Map<string, number>()
    for (const c of caches) targetX.set(c.key, spread(cRank.get(c.id) ?? 0, caches.length, W, 60))
    for (const e of eps) targetX.set(e.key, spread(eRank.get(e.id) ?? 0, eps.length, W, 40))
    for (const n of caches.concat(eps)) n.x = targetX.get(n.key) as number

    const bandY = (n: N) => (n.kind === 'dc' ? H * 0.11 : n.kind === 'cache' ? H * 0.45 : H * 0.84)
    const sim = forceSimulation<N>([dc, ...caches, ...eps])
      .force('link', forceLink<N, L>(links).id((d) => d.key).distance(60).strength(0.04))
      .force('y', forceY<N>(bandY).strength(1))
      .force('x', forceX<N>((d) => targetX.get(d.key) ?? W / 2).strength(0.6))
      .force('collide', forceCollide<N>((d) => d.r + 4).strength(1))
      .stop()
    for (let i = 0; i < 260; i++) sim.tick()

    const pad = 28
    for (const n of caches.concat(eps)) {
      n.x = Math.max(pad, Math.min(W - pad, n.x || 0))
      n.y = Math.max(pad, Math.min(H - pad, n.y || 0))
    }
    state.current = { nodes: [dc, ...caches, ...eps] }

    let raf = 0
    const t0 = performance.now()

    const draw = (now: number) => {
      const { ctx, w, h } = fitCanvas(cv)
      const reveal = Math.min(1, (now - t0) / 1500)
      const ease = 1 - Math.pow(1 - reveal, 3)
      ctx.clearRect(0, 0, w, h)

      // Datacenter reach: every endpoint can always fall back to it. Drawn
      // first and faint, so it reads as the floor beneath everything else.
      ctx.lineWidth = 1
      ctx.strokeStyle = alpha(DC, routed ? 0.07 : 0.17)
      for (let i = 0; i < eps.length; i++) {
        if (i / eps.length > ease * 1.2) continue
        const e = eps[i]
        ctx.beginPath()
        ctx.moveTo(e.x as number, e.y as number)
        ctx.bezierCurveTo(e.x as number, h * 0.5, W / 2, h * 0.42, W / 2, H * 0.11 + 10)
        ctx.stroke()
      }

      // Endpoint-to-cache links, tinted by latency (sequential ramp: magnitude).
      for (let i = 0; i < links.length; i++) {
        if (i / links.length > ease * 1.25) continue
        const l = links[i]
        const dim = routed && !l.used
        ctx.strokeStyle = dim ? alpha(INK3, 0.16) : alpha(ramp(SEQ, 1 - l.t), routed ? 0.85 : 0.5)
        ctx.lineWidth = dim ? 1 : 1.4
        ctx.beginPath()
        ctx.moveTo(l.source.x as number, l.source.y as number)
        ctx.lineTo(l.target.x as number, l.target.y as number)
        ctx.stroke()
      }

      // Packets: where traffic actually goes. Amber climbs all the way to the
      // datacenter; cyan stops at a cache.
      if (ease > 0.85) {
        const phase = (now / 2400) % 1
        if (!routed) {
          for (let i = 0; i < eps.length; i++) {
            const e = eps[i]
            const p = (phase + i / eps.length) % 1
            const x = (e.x as number) + (W / 2 - (e.x as number)) * p
            const y = (e.y as number) + (H * 0.11 - (e.y as number)) * p
            ctx.fillStyle = alpha(DC_BRIGHT, 0.9 * (1 - Math.abs(p - 0.5) * 1.1))
            ctx.beginPath(); ctx.arc(x, y, 1.7, 0, 7); ctx.fill()
          }
        } else {
          for (let i = 0; i < links.length; i++) {
            const l = links[i]
            if (!l.used) continue
            const p = (phase + i / links.length) % 1
            const x = (l.target.x as number) + ((l.source.x as number) - (l.target.x as number)) * p
            const y = (l.target.y as number) + ((l.source.y as number) - (l.target.y as number)) * p
            ctx.fillStyle = alpha(CA_BRIGHT, 0.95 * (1 - Math.abs(p - 0.5) * 1.1))
            ctx.beginPath(); ctx.arc(x, y, 1.8, 0, 7); ctx.fill()
          }
        }
      }

      for (const c of caches) {
        const stored = placement ? placement[String(c.id)] : undefined
        const filled = !!stored && stored.length > 0
        hexagon(ctx, c.x as number, c.y as number, c.r + 2)
        ctx.fillStyle = filled ? alpha(CA, 0.22) : alpha(INK0, 0.03)
        ctx.fill()
        ctx.lineWidth = 1.4
        ctx.strokeStyle = filled ? CA_BRIGHT : alpha(CA_DIM, 0.85)
        ctx.stroke()
      }

      for (const e of eps) {
        ctx.beginPath(); ctx.arc(e.x as number, e.y as number, e.r, 0, 7)
        ctx.fillStyle = routed ? alpha(CA, 0.3) : alpha(DC, 0.22)
        ctx.fill()
        ctx.lineWidth = 1.2
        ctx.strokeStyle = routed ? alpha(CA_BRIGHT, 0.85) : alpha(DC_BRIGHT, 0.7)
        ctx.stroke()
      }

      const pulse = 1 + Math.sin(now / 620) * 0.06
      ctx.beginPath(); ctx.arc(W / 2, H * 0.11, 22 * pulse, 0, 7)
      ctx.fillStyle = alpha(DC, 0.12); ctx.fill()
      ctx.beginPath(); ctx.arc(W / 2, H * 0.11, 13, 0, 7)
      ctx.fillStyle = alpha(DC, 0.5); ctx.fill()
      ctx.lineWidth = 1.6; ctx.strokeStyle = DC_BRIGHT; ctx.stroke()

      ctx.font = '500 9.5px "JetBrains Mono Variable", monospace'
      ctx.textAlign = 'center'
      ctx.fillStyle = INK2
      ctx.fillText('DATACENTER', W / 2, H * 0.11 - 30)
      // Band labels sit above their row, not beside it -- level with the row
      // they collided with the leftmost node.
      ctx.textAlign = 'left'
      ctx.fillStyle = INK3
      ctx.fillText(topo.C + ' CACHE SERVERS', 12, H * 0.45 - 30)
      ctx.fillText(topo.E + ' ENDPOINTS', 12, H * 0.84 - 30)

      raf = requestAnimationFrame(draw)
    }

    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [topo, routed, placement])

  return (
    <div
      ref={wrap}
      style={{ position: 'relative', width: '100%', height: '100%' }}
      onMouseMove={(ev) => {
        const st = state.current
        const box = wrap.current
        if (!st || !box) return
        const r = box.getBoundingClientRect()
        const mx = ev.clientX - r.left
        const my = ev.clientY - r.top
        let best: N | null = null
        let bd = 16
        for (const n of st.nodes) {
          const nx = (n.x !== undefined ? n.x : n.fx) || 0
          const ny = (n.y !== undefined ? n.y : n.fy) || 0
          const d = Math.hypot(nx - mx, ny - my)
          if (d < bd) { bd = d; best = n }
        }
        setHover(best ? { n: best, x: mx, y: my } : null)
        if (onPick) onPick(best && best.kind !== 'dc' ? { kind: best.kind, id: best.id } : null)
      }}
      onMouseLeave={() => { setHover(null); if (onPick) onPick(null) }}
    >
      <canvas ref={ref} style={{ width: '100%', height: '100%', display: 'block' }} />
      {hover && <NodeTip n={hover.n} x={hover.x} y={hover.y} topo={topo} placement={placement} />}
    </div>
  )
}

function NodeTip({ n, x, y, topo, placement }: {
  n: N; x: number; y: number; topo: Topology; placement?: Record<string, number[]>
}) {
  let body: string[] = []
  if (n.kind === 'dc') {
    body = ['stores every video', 'the fallback for every endpoint']
  } else if (n.kind === 'cache') {
    const c = topo.caches[n.id]
    const stored = placement ? placement[String(n.id)] : undefined
    body = [
      c.degree + ' endpoints connected',
      'closest latency ' + (c.minLat === null ? '--' : c.minLat + ' ms'),
      stored ? stored.length + ' videos stored' : topo.X + ' MB capacity',
    ]
  } else {
    const e = topo.endpoints[n.id]
    body = [
      e.ld + ' ms to datacenter',
      e.degree + ' caches reachable, best ' + e.bestLat + ' ms',
      e.demand.toLocaleString() + ' requests',
    ]
  }
  return (
    <div className="mono" style={{
      position: 'absolute', left: x + 14, top: y + 12, zIndex: 5,
      background: 'var(--panel-2)', border: '1px solid var(--line-2)',
      padding: '7px 9px', fontSize: 10.5, color: 'var(--ink-1)',
      pointerEvents: 'none', whiteSpace: 'nowrap',
    }}>
      <div className="lbl" style={{ color: n.kind === 'cache' ? 'var(--ca-bright)' : 'var(--dc-bright)' }}>
        {n.kind === 'dc' ? 'datacenter' : n.kind + ' ' + n.id}
      </div>
      {body.map((b, i) => <div key={i} style={{ marginTop: 2 }}>{b}</div>)}
    </div>
  )
}

function hexagon(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath()
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 2
    const px = x + Math.cos(a) * r
    const py = y + Math.sin(a) * r
    if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py)
  }
  ctx.closePath()
}
