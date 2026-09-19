import { useState } from 'react'
import { int } from '../lib/format'
import type { Hist } from '../lib/api'

/** Counts over equal-width bins. Thin marks, recessive axis, hover readout;
 *  a single series, so it needs no legend — the caption names it. */
export function Histogram({ hist, color = 'var(--ca)', height = 74, unit = '', caption }:
  { hist: Hist | null; color?: string; height?: number; unit?: string; caption?: string }) {
  const [hover, setHover] = useState<number | null>(null)
  if (!hist || !hist.bins.length) {
    return <div style={{ height, display: 'grid', placeItems: 'center', color: 'var(--ink-4)' }} className="lbl">no data</div>
  }

  const n = hist.bins.length
  const step = (hist.hi - hist.lo) / n
  const at = hover != null ? hist.bins[hover] : null

  return (
    <div>
      <div
        style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height, position: 'relative' }}
        onMouseLeave={() => setHover(null)}
      >
        {hist.bins.map((c, i) => (
          <div
            key={i}
            onMouseEnter={() => setHover(i)}
            style={{ flex: 1, height: '100%', display: 'flex', alignItems: 'flex-end', cursor: 'crosshair' }}
          >
            <div style={{
              width: '100%',
              height: `${Math.max(c > 0 ? 2 : 0, (c / hist.max) * 100)}%`,
              background: hover === i ? 'var(--ink-0)' : color,
              borderRadius: '2px 2px 0 0',
              transition: 'background 120ms linear',
            }} />
          </div>
        ))}
      </div>
      <div style={{
        display: 'flex', justifyContent: 'space-between', marginTop: 5,
        borderTop: '1px solid var(--line)', paddingTop: 4,
      }}>
        <span className="lbl mono" style={{ whiteSpace: 'nowrap' }}>{int(hist.lo)}{unit}</span>
        <span className="lbl" style={{
          color: at != null ? 'var(--ink-1)' : 'var(--ink-3)',
          // Truncate rather than wrap: in the 300px telemetry column this
          // caption otherwise collides with the axis bounds either side.
          flex: 1, textAlign: 'center', padding: '0 8px',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {at != null
            ? `${int(hist.lo + hover! * step)}–${int(hist.lo + (hover! + 1) * step)}${unit} · ${int(at)}`
            : caption}
        </span>
        <span className="lbl mono" style={{ whiteSpace: 'nowrap' }}>{int(hist.hi)}{unit}</span>
      </div>
    </div>
  )
}
