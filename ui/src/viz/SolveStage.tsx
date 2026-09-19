import { useEffect, useRef, useState } from 'react'
import type { Player } from '../lib/player'
import type { Topology } from '../lib/api'
import {
  CA, CA_BRIGHT, CA_DIM, DC, DC_BRIGHT, INK2, INK3, INK4, PANEL3,
  SEQ, alpha, fitCanvas, ramp,
} from './palette'

/**
 * The placement stage: datacenter at the top, every cache server as a cell in
 * a grid, every endpoint as a bar along the bottom.
 *
 * This is the one view that works unchanged from 3 caches to 500, which is why
 * the solve act uses it for every data set regardless of tier -- here the story
 * is capacity filling up, not who is wired to whom.
 *
 * It reads the Player directly inside its own animation frame. Routing that
 * state through React would spend the frame budget on reconciliation instead
 * of drawing.
 */
export function SolveStage({ player, topo, tick }: {
  player: Player; topo: Topology; tick: number
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<{ id: number; x: number; y: number } | null>(null)
  const layout = useRef<{ cells: Cell[]; cw: number; ch: number } | null>(null)

  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    let raf = 0

    const draw = (now: number) => {
      const { ctx, w, h } = fitCanvas(cv)
      ctx.clearRect(0, 0, w, h)

      const C = topo.C
      const E = topo.E
      const dcH = 54
      const epH = E > 1 ? 58 : 0
      const gridTop = dcH + 26
      const gridBottom = h - epH - 18
      const gridH = Math.max(40, gridBottom - gridTop)

      // --- datacenter bar -------------------------------------------------
      const pulse = 0.5 + Math.sin(now / 700) * 0.09
      ctx.fillStyle = alpha(DC, 0.07)
      ctx.fillRect(0, 0, w, dcH)
      ctx.strokeStyle = alpha(DC, 0.5)
      ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(0, dcH + 0.5); ctx.lineTo(w, dcH + 0.5); ctx.stroke()
      ctx.beginPath(); ctx.arc(28, dcH / 2, 9 + pulse * 3, 0, 7)
      ctx.fillStyle = alpha(DC, 0.45); ctx.fill()
      ctx.lineWidth = 1.5; ctx.strokeStyle = DC_BRIGHT; ctx.stroke()
      ctx.font = '500 10px "JetBrains Mono Variable", monospace'
      ctx.fillStyle = INK2
      ctx.textAlign = 'left'
      ctx.fillText('DATACENTER', 46, dcH / 2 - 5)
      ctx.fillStyle = INK3
      ctx.fillText(topo.V.toLocaleString() + ' videos, all of them, always', 46, dcH / 2 + 10)

      // --- cache grid -----------------------------------------------------
      const aspect = w / gridH
      let cols = Math.max(1, Math.round(Math.sqrt(C * aspect)))
      cols = Math.min(cols, C)
      const rows = Math.ceil(C / cols)
      const gap = C > 200 ? 3 : C > 40 ? 5 : 10
      const cw = (w - 24 - gap * (cols - 1)) / cols
      const chRaw = (gridH - gap * (rows - 1)) / rows
      const ch = Math.min(chRaw, C <= 12 ? 112 : C <= 40 ? 84 : 60)
      const gridW = cols * cw + (cols - 1) * gap
      const x0 = (w - gridW) / 2
      const y0 = gridTop + Math.max(0, (gridH - (rows * ch + (rows - 1) * gap)) / 2)

      const cells: Cell[] = []
      for (let c = 0; c < C; c++) {
        const r = Math.floor(c / cols)
        const k = c % cols
        const x = x0 + k * (cw + gap)
        const y = y0 + r * (ch + gap)
        cells.push({ id: c, x, y, w: cw, h: ch })

        const used = player.cacheUsed[c] || 0
        const fill = Math.max(0, Math.min(1, used / topo.X))
        const isScanning = player.scanning && player.scanning.cache === c
        const recent = player.chips.some((p) => p.cache === c && now - p.born < 420)

        ctx.fillStyle = PANEL3
        ctx.fillRect(x, y, cw, ch)

        // Capacity as discrete blocks -- it is a store of countable megabytes.
        if (fill > 0) {
          const segs = cw > 26 ? Math.max(3, Math.floor(cw / 5)) : 1
          const lit = Math.max(1, Math.round(fill * segs))
          const sw = cw / segs
          for (let s = 0; s < lit; s++) {
            const t = segs > 1 ? s / (segs - 1) : 1
            ctx.fillStyle = recent ? CA_BRIGHT : ramp(SEQ, 0.35 + t * 0.45)
            ctx.fillRect(x + s * sw, y + ch * (1 - fill), Math.max(1, sw - (segs > 1 ? 1 : 0)), ch * fill)
          }
        }

        ctx.lineWidth = isScanning ? 1.6 : 1
        ctx.strokeStyle = isScanning ? DC_BRIGHT : recent ? CA_BRIGHT : alpha(CA_DIM, 0.75)
        ctx.strokeRect(x + 0.5, y + 0.5, cw - 1, ch - 1)

        if (cw > 40 && ch > 26) {
          ctx.font = '500 9px "JetBrains Mono Variable", monospace'
          ctx.fillStyle = fill > 0.55 ? '#04121a' : INK3
          ctx.textAlign = 'left'
          ctx.fillText('c' + c, x + 4, y + 11)
          if (cw > 62) {
            ctx.textAlign = 'right'
            ctx.fillText(Math.round(fill * 100) + '%', x + cw - 4, y + 11)
          }
        }
      }
      layout.current = { cells, cw, ch }

      // --- chips falling from the datacenter into their cache -------------
      for (const p of player.chips) {
        const age = (now - p.born) / 620
        if (age > 1) continue
        const cell = cells[p.cache]
        if (!cell) continue
        const e = 1 - Math.pow(1 - age, 2.2)
        const sx = 28
        const sy = dcH / 2
        const tx = cell.x + cell.w / 2
        const ty = cell.y + cell.h / 2
        const x = sx + (tx - sx) * e
        const y = sy + (ty - sy) * e
        const a = 1 - age * age
        ctx.fillStyle = alpha(CA_BRIGHT, a)
        ctx.beginPath(); ctx.arc(x, y, 2.6, 0, 7); ctx.fill()
        ctx.strokeStyle = alpha(CA_BRIGHT, a * 0.35)
        ctx.lineWidth = 1
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(x, y); ctx.stroke()
      }

      // --- endpoint band --------------------------------------------------
      if (epH > 0) {
        const by = h - epH + 14
        const bh = epH - 24
        const bw = Math.max(1, (w - 24) / E)
        ctx.font = '500 9.5px "JetBrains Mono Variable", monospace'
        ctx.textAlign = 'left'
        ctx.fillStyle = INK3
        ctx.fillText(E + ' ENDPOINTS — bar height is demand, colour is achieved latency', 12, by - 6)

        const lat = player.epLatency
        for (let e = 0; e < E; e++) {
          const ep = topo.endpoints[e]
          if (!ep) continue
          const dem = ep.demand
          const maxDem = maxDemand(topo)
          const hgt = Math.max(2, (Math.sqrt(dem) / Math.sqrt(maxDem)) * bh)
          const x = 12 + e * bw
          // Cold state (no snapshot yet) is the datacenter latency: all amber.
          let col = alpha(DC, 0.75)
          if (lat && lat[e] !== undefined) {
            const improve = ep.ld > 0 ? 1 - lat[e] / ep.ld : 0
            col = improve <= 0.001 ? alpha(DC, 0.75) : ramp(SEQ, 0.25 + improve * 0.75)
          }
          ctx.fillStyle = col
          ctx.fillRect(x, by + (bh - hgt), Math.max(1, bw - (bw > 3 ? 1 : 0)), hgt)
        }
        ctx.strokeStyle = alpha(INK4, 0.6)
        ctx.lineWidth = 1
        ctx.beginPath(); ctx.moveTo(12, by + bh + 0.5); ctx.lineTo(w - 12, by + bh + 0.5); ctx.stroke()
      }

      raf = requestAnimationFrame(draw)
    }

    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [player, topo, tick])

  const cell = hover && layout.current ? layout.current.cells[hover.id] : null

  return (
    <div
      ref={wrap}
      style={{ position: 'relative', width: '100%', height: '100%' }}
      onMouseMove={(ev) => {
        const lay = layout.current
        const box = wrap.current
        if (!lay || !box) return
        const r = box.getBoundingClientRect()
        const mx = ev.clientX - r.left
        const my = ev.clientY - r.top
        const found = lay.cells.find((c) => mx >= c.x && mx <= c.x + c.w && my >= c.y && my <= c.y + c.h)
        setHover(found ? { id: found.id, x: mx, y: my } : null)
      }}
      onMouseLeave={() => setHover(null)}
    >
      <canvas ref={ref} style={{ width: '100%', height: '100%', display: 'block' }} />
      {hover && cell && (
        <div className="mono" style={{
          position: 'absolute', left: Math.min(hover.x + 12, 10000), top: hover.y + 12, zIndex: 5,
          background: 'var(--panel-2)', border: '1px solid var(--line-2)',
          padding: '7px 9px', fontSize: 10.5, color: 'var(--ink-1)',
          pointerEvents: 'none', whiteSpace: 'nowrap',
        }}>
          <div className="lbl" style={{ color: 'var(--ca-bright)' }}>cache {hover.id}</div>
          <div style={{ marginTop: 2 }}>
            {Math.round(player.cacheUsed[hover.id] || 0).toLocaleString()} / {topo.X.toLocaleString()} MB
          </div>
          <div>{player.cacheVideos[hover.id] || 0} videos stored</div>
          <div>{topo.caches[hover.id] ? topo.caches[hover.id].degree : 0} endpoints connected</div>
        </div>
      )}
    </div>
  )
}

interface Cell { id: number; x: number; y: number; w: number; h: number }

let demandCache: { topo: Topology; max: number } | null = null
function maxDemand(topo: Topology) {
  if (!demandCache || demandCache.topo !== topo) {
    let m = 1
    for (const e of topo.endpoints) if (e.demand > m) m = e.demand
    demandCache = { topo, max: m }
  }
  return demandCache.max
}

export const STAGE_ACCENTS = { CA, CA_BRIGHT, DC, DC_BRIGHT }
