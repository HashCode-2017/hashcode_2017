import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { int } from '../lib/format'

/** A counter that rolls toward its target. Tabular figures, so it never reflows. */
export function Num({ value, dp = 0, className = '', instant = false }:
  { value: number; dp?: number; className?: string; instant?: boolean }) {
  const [shown, setShown] = useState(value)
  const from = useRef(value)
  const raf = useRef(0)

  useEffect(() => {
    if (instant) { setShown(value); from.current = value; return }
    const a = from.current
    const b = value
    if (a === b) return
    // Seed the clock from the first frame callback, not performance.now():
    // rAF reports the timestamp of the START of the frame, which can predate
    // the moment this effect ran. A negative elapsed time inverts the easing
    // and drives the value below where it started -- which showed up as the
    // score counter flashing large negative numbers while climbing fast.
    let t0 = -1
    const dur = 460
    const loop = (t: number) => {
      if (t0 < 0) t0 = t
      const k = Math.min(1, Math.max(0, (t - t0) / dur))
      const e = 1 - Math.pow(1 - k, 3)
      const v = a + (b - a) * e
      setShown(v)
      from.current = v
      if (k < 1) raf.current = requestAnimationFrame(loop)
      else from.current = b
    }
    raf.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf.current)
  }, [value, instant])

  return <span className={`num ${className}`}>{dp ? shown.toFixed(dp) : int(shown)}</span>
}

export function Label({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div className="lbl" style={style}>{children}</div>
}

/** Label over value. The workhorse readout of the whole console. */
export function Stat({ label, children, accent, wide, note }: {
  label: string; children: ReactNode; accent?: 'dc' | 'ca' | 'alert'
  wide?: boolean; note?: ReactNode
}) {
  const color = accent === 'dc' ? 'var(--dc-bright)'
    : accent === 'ca' ? 'var(--ca-bright)'
    : accent === 'alert' ? 'var(--alert-bright)' : 'var(--ink-0)'
  return (
    <div style={{ padding: '10px 0', borderTop: '1px solid var(--line)' }}>
      <Label>{label}</Label>
      <div className="num" style={{
        color, fontSize: wide ? 25 : 17, lineHeight: 1.15, marginTop: 4,
        fontWeight: 500, letterSpacing: '-0.01em',
      }}>{children}</div>
      {note && <div style={{ fontSize: 10.5, color: 'var(--ink-3)', marginTop: 3 }}>{note}</div>}
    </div>
  )
}

export function Panel({ title, right, children, style, flush }: {
  title?: string; right?: ReactNode; children: ReactNode
  style?: CSSProperties; flush?: boolean
}) {
  return (
    <section style={{
      background: 'var(--panel)', border: '1px solid var(--line)',
      display: 'flex', flexDirection: 'column', minHeight: 0, ...style,
    }}>
      {title && (
        <header style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '8px 12px', borderBottom: '1px solid var(--line)', flex: '0 0 auto',
        }}>
          <Label>{title}</Label>
          {right}
        </header>
      )}
      <div style={{ padding: flush ? 0 : 12, flex: '1 1 auto', minHeight: 0 }}>{children}</div>
    </section>
  )
}

/** Capacity as discrete blocks, not a smooth gradient: it is a store of
 *  countable megabytes, and the segments say so. */
export function Meter({ value, segments = 28, color = 'var(--ca)', height = 7 }:
  { value: number; segments?: number; color?: string; height?: number }) {
  const lit = Math.round(Math.max(0, Math.min(1, value)) * segments)
  return (
    <div style={{ display: 'flex', gap: 2, height }} aria-hidden>
      {Array.from({ length: segments }, (_, i) => (
        <div key={i} style={{
          flex: 1,
          background: i < lit ? color : 'var(--panel-3)',
          transition: 'background 220ms var(--ease)',
        }} />
      ))}
    </div>
  )
}

export function Chip({ children, tone = 'idle' }:
  { children: ReactNode; tone?: 'idle' | 'dc' | 'ca' | 'alert' }) {
  const map = {
    idle: ['var(--ink-3)', 'var(--line)'],
    dc: ['var(--dc-bright)', 'var(--dc-dim)'],
    ca: ['var(--ca-bright)', 'var(--ca-dim)'],
    alert: ['var(--alert-bright)', 'var(--alert)'],
  } as const
  const [fg, bd] = map[tone]
  return (
    <span className="lbl" style={{
      color: fg, border: `1px solid ${bd}`, padding: '2px 6px',
      display: 'inline-block', lineHeight: 1.3, whiteSpace: 'nowrap',
    }}>{children}</span>
  )
}

/** A two-part bar: the share served from cache vs from the datacenter.
 *  Direct-labelled, so identity never rests on colour alone. */
export function SplitBar({ cache, dc, height = 26 }:
  { cache: number; dc: number; height?: number }) {
  const total = cache + dc || 1
  const cw = (cache / total) * 100
  return (
    <div>
      <div style={{ display: 'flex', height, gap: 2 }}>
        <div style={{ width: `${cw}%`, background: 'var(--ca)', transition: 'width 600ms var(--ease)' }} />
        <div style={{ flex: 1, background: 'var(--dc)' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
        <span className="lbl" style={{ color: 'var(--ca-bright)' }}>
          ■ from cache {((cache / total) * 100).toFixed(1)}%
        </span>
        <span className="lbl" style={{ color: 'var(--dc-bright)' }}>
          from datacenter {((dc / total) * 100).toFixed(1)}% ■
        </span>
      </div>
    </div>
  )
}

export function Rule({ style }: { style?: CSSProperties }) {
  return <hr className="hair" style={style} />
}
