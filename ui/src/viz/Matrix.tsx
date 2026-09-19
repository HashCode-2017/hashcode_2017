import { useEffect, useRef, useState } from 'react'
import type { Matrix as MatrixData } from '../lib/api'
import { INK3, PANEL2, SEQ, alpha, fitCanvas, ramp } from './palette'

/**
 * Endpoint x cache connection map for the dense data sets.
 *
 * `kittens` has 351,881 endpoint-cache links. There is no honest node-link
 * drawing of that, so the server buckets it and we show the block structure
 * instead: rows sorted by endpoint demand, columns by cache connectivity,
 * each cell the mean latency of the links inside it. Empty cells mean no
 * connection at all, which is itself part of the shape.
 *
 * Sequential ramp, one hue, light-to-dark: this encodes magnitude, not identity.
 */
export function Matrix({ m, height = 300 }: { m: MatrixData; height?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<{ r: number; c: number; x: number; y: number } | null>(null)

  let lo = Infinity
  let hi = -Infinity
  for (const row of m.latency) {
    for (const v of row) {
      if (v === null) continue
      if (v < lo) lo = v
      if (v > hi) hi = v
    }
  }
  if (!Number.isFinite(lo)) { lo = 0; hi = 1 }

  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const { ctx, w, h } = fitCanvas(cv)
    ctx.clearRect(0, 0, w, h)
    const cw = w / m.cols
    const chh = h / m.rows
    for (let r = 0; r < m.rows; r++) {
      for (let c = 0; c < m.cols; c++) {
        const v = m.latency[r][c]
        if (v === null) {
          ctx.fillStyle = PANEL2
        } else {
          // Lower latency is the better outcome, so it gets the brighter step.
          ctx.fillStyle = ramp(SEQ, 1 - (v - lo) / (hi - lo || 1))
        }
        ctx.fillRect(c * cw, r * chh, Math.ceil(cw), Math.ceil(chh))
      }
    }
    if (hover) {
      ctx.strokeStyle = '#FCFCFC'
      ctx.lineWidth = 1
      ctx.strokeRect(hover.c * cw, hover.r * chh, cw, chh)
    }
  }, [m, hover, lo, hi])

  const val = hover ? m.latency[hover.r][hover.c] : null
  const dens = hover ? m.density[hover.r][hover.c] : 0

  return (
    <div>
      <div
        ref={wrap}
        style={{ position: 'relative', width: '100%', height }}
        onMouseMove={(ev) => {
          const box = wrap.current
          if (!box) return
          const r = box.getBoundingClientRect()
          const c = Math.floor(((ev.clientX - r.left) / r.width) * m.cols)
          const rr = Math.floor(((ev.clientY - r.top) / r.height) * m.rows)
          if (rr < 0 || rr >= m.rows || c < 0 || c >= m.cols) { setHover(null); return }
          setHover({ r: rr, c, x: ev.clientX - r.left, y: ev.clientY - r.top })
        }}
        onMouseLeave={() => setHover(null)}
      >
        <canvas ref={ref} style={{ width: '100%', height: '100%', display: 'block', cursor: 'crosshair' }} />
        {hover && (
          <div className="mono" style={{
            position: 'absolute', left: hover.x + 12, top: hover.y + 12, zIndex: 5,
            background: 'var(--panel-2)', border: '1px solid var(--line-2)',
            padding: '6px 8px', fontSize: 10.5, pointerEvents: 'none', whiteSpace: 'nowrap',
          }}>
            {val === null
              ? <span style={{ color: 'var(--ink-3)' }}>no connection</span>
              : <>
                  <div style={{ color: 'var(--ca-bright)' }}>{val} ms mean</div>
                  <div style={{ color: 'var(--ink-2)' }}>{dens.toLocaleString()} links in block</div>
                </>}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, alignItems: 'center' }}>
        <span className="lbl">{m.rowLabel} ↓</span>
        <Legend lo={lo} hi={hi} />
        <span className="lbl">{m.colLabel} →</span>
      </div>
    </div>
  )
}

function Legend({ lo, hi }: { lo: number; hi: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
      <span className="lbl mono">{hi} ms</span>
      <div style={{ display: 'flex', width: 92, height: 8 }}>
        {SEQ.map((c) => <div key={c} style={{ flex: 1, background: c }} />)}
      </div>
      <span className="lbl mono">{lo} ms</span>
      <span className="lbl" style={{ color: INK3, borderLeft: '1px solid var(--line)', paddingLeft: 7 }}>
        <span style={{
          display: 'inline-block', width: 8, height: 8, background: PANEL2,
          border: '1px solid ' + alpha('#FCFCFC', 0.15), marginRight: 4, verticalAlign: -1,
        }} />
        none
      </span>
    </div>
  )
}
