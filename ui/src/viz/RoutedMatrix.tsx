import { useEffect, useRef, useState } from 'react'
import type { RoutedMatrix as RoutedData } from '../lib/api'
import { compact } from '../lib/format'
import { AMB, INK3, PANEL2, SEQ, alpha, fitCanvas, ramp } from './palette'

const DC_GAP = 0.02   // gap before the datacenter column, as a share of the width
const DC_COL = 0.05   // width of the datacenter column

/**
 * The routing view for data sets too dense to draw as a network.
 *
 * Same layout as the cold-network matrix (endpoints by demand down, caches by
 * connectivity across), but each block now shows how many requests those
 * endpoints actually get from those caches; the separate amber column is what
 * each row still fetches from the datacenter. Request volumes span several
 * orders of magnitude, so the one-hue ramps are log-scaled.
 */
export function RoutedMatrix({ m, height = 300 }: { m: RoutedData; height?: number | string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<{ r: number; c: number; x: number; y: number } | null>(null)

  let hi = 1
  for (const row of m.served) for (const v of row) if (v > hi) hi = v
  for (const v of m.datacenter) if (v > hi) hi = v
  const t = (v: number) => Math.log10(1 + v) / Math.log10(1 + hi)
  const gridW = 1 - DC_GAP - DC_COL

  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const { ctx, w, h } = fitCanvas(cv)
    ctx.clearRect(0, 0, w, h)
    const cw = (w * gridW) / m.cols
    const ch = h / m.rows
    for (let r = 0; r < m.rows; r++) {
      for (let c = 0; c < m.cols; c++) {
        const v = m.served[r][c]
        ctx.fillStyle = v ? ramp(SEQ, t(v)) : PANEL2
        ctx.fillRect(c * cw, r * ch, Math.ceil(cw), Math.ceil(ch))
      }
      const d = m.datacenter[r]
      ctx.fillStyle = d ? ramp(AMB, t(d)) : PANEL2
      ctx.fillRect(w * (1 - DC_COL), r * ch, w * DC_COL, Math.ceil(ch))
    }
    if (hover) {
      ctx.strokeStyle = '#FCFCFC'
      ctx.lineWidth = 1
      if (hover.c < 0) ctx.strokeRect(w * (1 - DC_COL), hover.r * ch, w * DC_COL, ch)
      else ctx.strokeRect(hover.c * cw, hover.r * ch, cw, ch)
    }
  }, [m, hover, hi])

  const value = hover ? (hover.c < 0 ? m.datacenter[hover.r] : m.served[hover.r][hover.c]) : 0

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div
        ref={wrap}
        style={{ position: 'relative', width: '100%', height, flex: typeof height === 'string' ? 1 : undefined, minHeight: 0 }}
        onMouseMove={(ev) => {
          const box = wrap.current
          if (!box) return
          const b = box.getBoundingClientRect()
          const fx = (ev.clientX - b.left) / b.width
          const r = Math.floor(((ev.clientY - b.top) / b.height) * m.rows)
          let c: number | null = null
          if (fx < gridW) c = Math.floor((fx / gridW) * m.cols)
          else if (fx >= 1 - DC_COL) c = -1          // the datacenter column
          if (c === null || r < 0 || r >= m.rows || c >= m.cols) { setHover(null); return }
          setHover({ r, c, x: ev.clientX - b.left, y: ev.clientY - b.top })
        }}
        onMouseLeave={() => setHover(null)}
      >
        <canvas ref={ref} style={{ width: '100%', height: '100%', display: 'block', cursor: 'crosshair' }} />
        {hover && (
          <div className="mono" style={{
            position: 'absolute', zIndex: 5, pointerEvents: 'none', whiteSpace: 'nowrap',
            left: Math.min(hover.x + 12, (wrap.current?.clientWidth ?? 400) - 190), top: hover.y + 12,
            background: 'var(--panel-2)', border: '1px solid var(--line-2)', padding: '6px 8px', fontSize: 10.5,
          }}>
            <div style={{ color: hover.c < 0 ? 'var(--dc-bright)' : 'var(--ca-bright)' }}>
              {value ? `${compact(value)} requests` : 'nothing served here'}
            </div>
            <div style={{ color: 'var(--ink-2)' }}>
              {hover.c < 0 ? 'still from the datacenter' : 'served by this block of caches'}
            </div>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span className="lbl">{m.rowLabel} ↓ · {m.colLabel} →</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <Ramp steps={SEQ} label="from a cache" />
          <Ramp steps={AMB} label="from the datacenter" />
          <span className="lbl" style={{ color: INK3, borderLeft: '1px solid var(--line)', paddingLeft: 7 }}>
            <span style={{
              display: 'inline-block', width: 8, height: 8, background: PANEL2,
              border: '1px solid ' + alpha('#FCFCFC', 0.15), marginRight: 4, verticalAlign: -1,
            }} />
            none · log scale
          </span>
        </span>
      </div>
    </div>
  )
}

function Ramp({ steps, label }: { steps: string[]; label: string }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <span style={{ display: 'flex', width: 54, height: 8 }}>
        {steps.map((c) => <span key={c} style={{ flex: 1, background: c }} />)}
      </span>
      <span className="lbl">{label}</span>
    </span>
  )
}
