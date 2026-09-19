import { useState } from 'react'
import { compact, int } from '../lib/format'

/**
 * Demand-weighted latency distribution, before against after.
 *
 * Two series, so a legend is always present and both are direct-labelled --
 * identity never rests on colour alone. One shared x-axis; the two are the
 * same measure in the same unit, which is the only case where overlaying is
 * honest.
 */
export function LatencyCompare({ before, after, height = 150 }: {
  before: [number, number][]; after: [number, number][]; height?: number
}) {
  const [hover, setHover] = useState<number | null>(null)
  const BINS = 46
  const all = before.concat(after)
  if (!all.length) return null
  const lo = 0
  const hi = Math.max(...all.map(([l]) => l))

  const bucket = (rows: [number, number][]) => {
    const out = new Array<number>(BINS).fill(0)
    for (const [lat, n] of rows) {
      const i = Math.min(BINS - 1, Math.floor(((lat - lo) / (hi - lo || 1)) * BINS))
      out[i] += n
    }
    return out
  }
  const b = bucket(before)
  const a = bucket(after)
  const max = Math.max(...b, ...a) || 1
  const step = (hi - lo) / BINS

  return (
    <div>
      <div style={{ display: 'flex', gap: 14, marginBottom: 8 }}>
        <LegendKey color="var(--dc)" label="before — every request from the datacenter" />
        <LegendKey color="var(--ca)" label="after — best available source" />
      </div>
      <div
        style={{ position: 'relative', height, display: 'flex', alignItems: 'flex-end', gap: 2 }}
        onMouseLeave={() => setHover(null)}
      >
        {Array.from({ length: BINS }, (_, i) => (
          <div
            key={i}
            onMouseEnter={() => setHover(i)}
            style={{ flex: 1, height: '100%', position: 'relative', cursor: 'crosshair' }}
          >
            <div style={{
              position: 'absolute', bottom: 0, left: 0, right: 0,
              height: `${(b[i] / max) * 100}%`, background: 'var(--dc)',
              opacity: hover === i ? 1 : 0.5, borderRadius: '2px 2px 0 0',
            }} />
            <div style={{
              position: 'absolute', bottom: 0, left: 0, right: 0,
              height: `${(a[i] / max) * 100}%`, background: 'var(--ca)',
              opacity: hover === i ? 1 : 0.92, borderRadius: '2px 2px 0 0',
              // A 2px surface gap so the two fills never bleed into one mark.
              boxShadow: '0 0 0 1px var(--panel)',
            }} />
          </div>
        ))}
      </div>
      <div style={{
        display: 'flex', justifyContent: 'space-between', marginTop: 5,
        borderTop: '1px solid var(--line)', paddingTop: 4,
      }}>
        <span className="lbl mono" style={{ whiteSpace: 'nowrap' }}>0 ms</span>
        <span className="lbl" style={{ color: hover !== null ? 'var(--ink-1)' : 'var(--ink-3)' }}>
          {hover !== null
            ? `${int(lo + hover * step)}–${int(lo + (hover + 1) * step)} ms · before ${compact(b[hover])} · after ${compact(a[hover])}`
            : 'request volume by latency actually served'}
        </span>
        <span className="lbl mono" style={{ whiteSpace: 'nowrap' }}>{int(hi)} ms</span>
      </div>
    </div>
  )
}

export function LegendKey({ color, label }: { color: string; label: string }) {
  return (
    <span className="lbl" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--ink-2)' }}>
      <span style={{ width: 9, height: 9, background: color, display: 'inline-block' }} />
      {label}
    </span>
  )
}

/** Horizontal ranked bars with the value direct-labelled on each row. */
export function RankBars({ rows, color = 'var(--ca)', unit = '' }: {
  rows: { label: string; value: number; sub?: string }[]
  color?: string; unit?: string
}) {
  const max = Math.max(1, ...rows.map((r) => r.value))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '78px 1fr auto', gap: 9, alignItems: 'center' }}>
          <span className="mono" style={{ fontSize: 10.5, color: 'var(--ink-2)' }}>{r.label}</span>
          <div style={{ height: 9, background: 'var(--panel-3)' }}>
            <div style={{
              width: `${(r.value / max) * 100}%`, height: '100%', background: color,
              borderRadius: '0 2px 2px 0', transition: 'width 500ms var(--ease)',
            }} />
          </div>
          <span className="mono" style={{ fontSize: 10.5, color: 'var(--ink-1)', minWidth: 54, textAlign: 'right' }}>
            {int(r.value)}{unit}
          </span>
        </div>
      ))}
    </div>
  )
}

/**
 * Cache fill as a squarified treemap: area is megabytes stored, so a cache
 * that is full and one that is nearly empty differ by size, not just shade.
 */
export function Treemap({ items, height = 210, onPick }: {
  items: { id: number; value: number; fill: number }[]
  height?: number
  onPick?: (id: number) => void
}) {
  const [hover, setHover] = useState<number | null>(null)
  const total = items.reduce((s, i) => s + i.value, 0) || 1
  const rects = squarify(items.map((i) => ({ ...i, area: i.value / total })), 0, 0, 100, 100)
  return (
    <div style={{ position: 'relative', width: '100%', height, background: 'var(--panel-2)' }}>
      {rects.map((r) => (
        <div
          key={r.id}
          onMouseEnter={() => setHover(r.id)}
          onMouseLeave={() => setHover(null)}
          onClick={() => onPick && onPick(r.id)}
          title={`cache ${r.id} — ${int(r.value)} MB, ${(r.fill * 100).toFixed(0)}% full`}
          style={{
            position: 'absolute',
            left: `${r.x}%`, top: `${r.y}%`, width: `${r.w}%`, height: `${r.h}%`,
            background: `color-mix(in srgb, var(--ca) ${25 + r.fill * 70}%, var(--panel-2))`,
            // 2px surface gap between fills, per the mark spec.
            boxShadow: 'inset 0 0 0 1px var(--panel)',
            outline: hover === r.id ? '1px solid var(--ink-0)' : 'none',
            outlineOffset: -1,
            cursor: onPick ? 'pointer' : 'default',
          }}
        />
      ))}
      {hover !== null && (
        <div className="mono" style={{
          position: 'absolute', bottom: 6, left: 8, fontSize: 10.5,
          background: 'var(--panel)', border: '1px solid var(--line-2)', padding: '4px 7px',
          pointerEvents: 'none',
        }}>
          cache {hover} · {int(items.find((i) => i.id === hover)?.value || 0)} MB
        </div>
      )}
    </div>
  )
}

interface Sq { id: number; value: number; fill: number; area: number }
interface Rect { id: number; value: number; fill: number; x: number; y: number; w: number; h: number }

/** Squarified treemap layout (Bruls, Huizing & van Wijk), rectangles in %. */
function squarify(items: Sq[], x: number, y: number, w: number, h: number): Rect[] {
  const out: Rect[] = []
  const data = items.filter((i) => i.area > 0).sort((a, b) => b.area - a.area)
  let rest = data.slice()
  let cx = x, cy = y, cw = w, ch = h
  const areaScale = () => {
    const sum = rest.reduce((s, i) => s + i.area, 0)
    return sum > 0 ? (cw * ch) / sum : 0
  }

  while (rest.length) {
    const scale = areaScale()
    const short = Math.min(cw, ch)
    const row: Sq[] = []
    let best = Infinity
    for (const item of rest) {
      const trial = row.concat(item)
      const sum = trial.reduce((s, i) => s + i.area * scale, 0)
      const worst = Math.max(
        ...trial.map((i) => {
          const side = sum / short
          const len = (i.area * scale) / side
          return Math.max(side / len, len / side)
        }),
      )
      if (worst > best) break
      best = worst
      row.push(item)
    }
    if (!row.length) row.push(rest[0])

    const sum = row.reduce((s, i) => s + i.area * scale, 0)
    const thick = sum / short
    let off = 0
    for (const item of row) {
      const len = (item.area * scale) / thick
      if (cw >= ch) {
        out.push({ ...item, x: cx, y: cy + off, w: thick, h: len })
      } else {
        out.push({ ...item, x: cx + off, y: cy, w: len, h: thick })
      }
      off += len
    }
    if (cw >= ch) { cx += thick; cw -= thick } else { cy += thick; ch -= thick }
    rest = rest.slice(row.length)
    if (cw <= 0.01 || ch <= 0.01) break
  }
  return out
}
