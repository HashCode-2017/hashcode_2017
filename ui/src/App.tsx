import { useEffect, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ACTS, useApp } from './lib/store'
import { Chrome } from './components/Chrome'
import { Select } from './scenes/Select'
import { Ingest } from './scenes/Ingest'
import { Topology } from './scenes/Topology'
import { Solve } from './scenes/Solve'
import { Routing } from './scenes/Routing'
import { Submission } from './scenes/Submission'
import { Explore } from './scenes/Explore'

const SCENES = [Select, Ingest, Topology, Solve, Routing, Submission]

export default function App() {
  const act = useApp((s) => s.act)
  const explore = useApp((s) => s.explore)
  const instanceId = useApp((s) => s.instanceId)
  const meta = useApp((s) => s.meta)
  const result = useApp((s) => s.result)
  const error = useApp((s) => s.error)
  const loadInstances = useApp((s) => s.loadInstances)

  useEffect(() => { void loadInstances() }, [loadInstances])

  // Presenter keys: the whole story is drivable without a mouse.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return
      const s = useApp.getState()
      if (e.key === 'ArrowRight') { s.go(1); e.preventDefault() }
      else if (e.key === 'ArrowLeft') { s.go(-1); e.preventDefault() }
      else if (e.key === 'e' || e.key === 'E') s.toggleExplore()
      else if (e.key === 'r' || e.key === 'R') s.back()
      else if (e.key === 'f' || e.key === 'F') {
        if (document.fullscreenElement) void document.exitFullscreen()
        else void document.documentElement.requestFullscreen()
      } else if (/^[1-6]$/.test(e.key)) s.setAct(Number(e.key) - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const Scene = SCENES[act]

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'var(--rail) 1fr',
      height: '100%', position: 'relative', zIndex: 3,
    }}>
      <Chrome />
      <Rail />
      <main className="layer" style={{ display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
        <TopBar />
        <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
          {error && (
            <div className="mono" style={{
              position: 'absolute', top: 14, left: 16, right: 16, zIndex: 20,
              border: '1px solid var(--alert)', background: 'var(--panel)',
              color: 'var(--alert-bright)', padding: '9px 12px', fontSize: 11.5,
            }}>{error}</div>
          )}
          {/* Sync, not mode="wait": scenes are absolutely positioned so they
              cross-fade in place, and "wait" deadlocks under StrictMode's
              double-mount -- the exit callback fires for the discarded
              instance and the incoming scene never mounts. */}
          <AnimatePresence initial={false}>
            <motion.div
              key={explore ? 'explore' : act}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.3, ease: [0.22, 0.61, 0.36, 1] }}
              style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' }}
            >
              {explore ? <Explore /> : <Scene />}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
      <StatusStrip instanceId={instanceId} meta={meta} hasResult={!!result} />
    </div>
  )
}

function Rail() {
  const act = useApp((s) => s.act)
  const setAct = useApp((s) => s.setAct)
  const instanceId = useApp((s) => s.instanceId)
  const explore = useApp((s) => s.explore)
  const toggleExplore = useApp((s) => s.toggleExplore)
  const result = useApp((s) => s.result)

  return (
    <aside className="layer" style={{
      borderRight: '1px solid var(--line)', background: 'var(--panel)',
      display: 'flex', flexDirection: 'column', minHeight: 0,
    }}>
      <div style={{ padding: '16px 16px 14px', borderBottom: '1px solid var(--line)' }}>
        <div style={{ fontSize: 14.5, color: 'var(--ink-0)', letterSpacing: '-0.015em', fontWeight: 600 }}>
          Streaming Videos
        </div>
        <div className="lbl" style={{ marginTop: 3 }}>Hash Code 2017 · qualification</div>
      </div>

      <nav style={{ flex: 1, padding: '8px 0', overflowY: 'auto' }}>
        {ACTS.map((a, i) => {
          const locked = i > 0 && !instanceId
          const active = !explore && i === act
          return (
            <button
              key={a.key}
              disabled={locked}
              onClick={() => setAct(i)}
              style={{
                display: 'grid', gridTemplateColumns: '22px 1fr', gap: 8,
                width: '100%', textAlign: 'left', padding: '8px 16px',
                background: active ? 'var(--panel-2)' : 'transparent',
                borderLeft: `2px solid ${active ? 'var(--ca-bright)' : 'transparent'}`,
                opacity: locked ? 0.3 : 1,
                transition: 'background 180ms var(--ease)',
              }}
            >
              <span className="mono" style={{
                fontSize: 10, color: active ? 'var(--ca-bright)' : 'var(--ink-4)', paddingTop: 2,
              }}>{String(i + 1).padStart(2, '0')}</span>
              <span>
                <span style={{
                  display: 'block', fontSize: 12.5,
                  color: active ? 'var(--ink-0)' : 'var(--ink-2)', fontWeight: active ? 550 : 400,
                }}>{a.name}</span>
                <span style={{ display: 'block', fontSize: 10.5, color: 'var(--ink-4)' }}>{a.sub}</span>
              </span>
            </button>
          )
        })}
      </nav>

      <button
        onClick={toggleExplore}
        disabled={!result}
        style={{
          padding: '11px 16px', borderTop: '1px solid var(--line)', textAlign: 'left',
          background: explore ? 'var(--panel-2)' : 'transparent',
          borderLeft: `2px solid ${explore ? 'var(--dc-bright)' : 'transparent'}`,
        }}
      >
        <span className="lbl" style={{ color: explore ? 'var(--dc-bright)' : 'var(--ink-3)' }}>
          {explore ? '◂ back to the story' : 'free explore  ·  E'}
        </span>
      </button>

      <div style={{ padding: '10px 16px', borderTop: '1px solid var(--line)' }}>
        <div className="lbl mono" style={{ color: 'var(--ink-4)', lineHeight: 1.9 }}>
          ← → act &nbsp; 1–6 jump<br />space play &nbsp; f full &nbsp; r reset
        </div>
      </div>
    </aside>
  )
}

function TopBar() {
  const act = useApp((s) => s.act)
  const explore = useApp((s) => s.explore)
  const instanceId = useApp((s) => s.instanceId)
  const summary = useApp((s) => s.summary)
  const go = useApp((s) => s.go)

  const title = explore ? 'Free explore' : ACTS[act].name
  const sub = explore ? 'inspect any cache, endpoint or video' : ACTS[act].sub

  return (
    <header style={{
      height: 'var(--bar)', borderBottom: '1px solid var(--line)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 18px', flex: '0 0 auto', background: 'var(--bg)',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, minWidth: 0 }}>
        <span style={{ fontSize: 14, color: 'var(--ink-0)', fontWeight: 550, letterSpacing: '-0.01em' }}>
          {title}
        </span>
        <span className="lbl" style={{ color: 'var(--ink-3)' }}>{sub}</span>
        {instanceId && (
          <span className="mono" style={{
            fontSize: 11, color: 'var(--ca-bright)', borderLeft: '1px solid var(--line)', paddingLeft: 12,
          }}>
            {instanceId}.in
            {summary && (
              <span style={{ color: 'var(--ink-3)' }}>
                {' '}· {summary.V.toLocaleString()}V · {summary.E}E · {summary.C}C
              </span>
            )}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        <NavBtn onClick={() => go(-1)} disabled={act === 0}>←</NavBtn>
        <NavBtn onClick={() => go(1)} disabled={act === ACTS.length - 1 || !instanceId}>→</NavBtn>
      </div>
    </header>
  )
}

function NavBtn({ children, ...p }: { children: ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...p} className="mono" style={{
      width: 30, height: 26, border: '1px solid var(--line)', color: 'var(--ink-2)', fontSize: 12,
    }}>{children}</button>
  )
}

function StatusStrip({ instanceId, meta, hasResult }: {
  instanceId: string | null
  meta: { status: string; cached: boolean; solveSeconds: number | null } | null
  hasResult: boolean
}) {
  if (!instanceId) return null
  const label = !meta ? 'idle'
    : meta.status === 'done'
      ? (meta.cached ? 'replay · prewarmed' : `solved live in ${meta.solveSeconds}s`)
      : meta.status
  const live = meta && meta.status !== 'done' && meta.status !== 'error'
  return (
    <div className="lbl mono" style={{
      position: 'fixed', right: 14, bottom: 10, zIndex: 30,
      display: 'flex', alignItems: 'center', gap: 7,
      color: live ? 'var(--dc-bright)' : hasResult ? 'var(--ca-bright)' : 'var(--ink-3)',
      pointerEvents: 'none',
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: 6, display: 'inline-block',
        background: 'currentColor',
        animation: live ? 'none' : undefined,
        opacity: live ? 0.5 + 0.5 * Math.sin(Date.now() / 300) : 1,
      }} />
      {label}
    </div>
  )
}
