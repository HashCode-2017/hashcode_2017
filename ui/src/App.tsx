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
import { Auth } from './scenes/Auth'
import { Submit } from './scenes/Submit'
import { Leaderboard } from './scenes/Leaderboard'
import { Stats } from './scenes/Stats'
import { Admin } from './scenes/Admin'
import { RankReveal } from './components/RankReveal'
import { GenerateDialog } from './components/GenerateDialog'

const SCENES = [Select, Ingest, Topology, Solve, Routing, Submission]

export default function App() {
  const act = useApp((s) => s.act)
  const explore = useApp((s) => s.explore)
  const instanceId = useApp((s) => s.instanceId)
  const meta = useApp((s) => s.meta)
  const result = useApp((s) => s.result)
  const error = useApp((s) => s.error)
  const loadInstances = useApp((s) => s.loadInstances)
  const user = useApp((s) => s.user)
  const authChecked = useApp((s) => s.authChecked)
  const checkAuth = useApp((s) => s.checkAuth)
  const page = useApp((s) => s.page)
  const showRank = useApp((s) => s.showRank)
  const setShowRank = useApp((s) => s.setShowRank)
  const generatorOpen = useApp((s) => s.generatorOpen)
  const setGeneratorOpen = useApp((s) => s.setGeneratorOpen)

  useEffect(() => { void checkAuth() }, [checkAuth])
  useEffect(() => { if (user) void loadInstances() }, [user, loadInstances])

  // Presenter keys: the whole story is drivable without a mouse.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')) return
      const s = useApp.getState()
      if (!s.user || s.showRank || s.generatorOpen) return
      // On a page only E (free explore) applies; the act keys belong to the story.
      if (s.page) { if (e.key === 'e' || e.key === 'E') s.toggleExplore(); return }
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

  if (!authChecked) return null
  if (!user) return (<><Chrome /><Auth /></>)

  const view = page ?? (explore ? 'explore' : act)
  const body = page === 'submit' ? <Submit />
    : page === 'leaderboard' ? <Leaderboard />
    : page === 'stats' ? <Stats />
    : page === 'admin' ? <Admin />
    : explore ? <Explore /> : <Scene />

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
              key={view}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.3, ease: [0.22, 0.61, 0.36, 1] }}
              style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' }}
            >
              {body}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
      <StatusStrip instanceId={instanceId} meta={meta} hasResult={!!result} />
      <AnimatePresence>
        {showRank && <RankReveal key={showRank} runId={showRank} onClose={() => setShowRank(null)} />}
        {generatorOpen && <GenerateDialog key="gen" onClose={() => setGeneratorOpen(false)} />}
      </AnimatePresence>
    </div>
  )
}

function Rail() {
  const act = useApp((s) => s.act)
  const setAct = useApp((s) => s.setAct)
  const instanceId = useApp((s) => s.instanceId)
  const runId = useApp((s) => s.runId)
  const player = useApp((s) => s.player)
  const explore = useApp((s) => s.explore)
  const toggleExplore = useApp((s) => s.toggleExplore)
  const result = useApp((s) => s.result)
  const page = useApp((s) => s.page)
  const openPage = useApp((s) => s.openPage)
  const user = useApp((s) => s.user)
  const logout = useApp((s) => s.logout)

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
          // Placement onwards replays a submission: closed until the group has one here.
          const locked = (i > 0 && !instanceId) || (i >= 3 && !runId && !player)
          const active = !explore && !page && i === act
          // Submitting is a step of the flow: once the data set is chosen and
          // read in, this is where a player hands in their own placement.
          const submitting = page === 'submit'
          const submitStep = a.key === 'ingest' && (
            <button
              key="submit"
              disabled={!instanceId}
              onClick={() => openPage(submitting ? null : 'submit')}
              style={{
                display: 'grid', gridTemplateColumns: '22px 1fr', gap: 8,
                width: '100%', textAlign: 'left', padding: '8px 16px',
                background: submitting ? 'var(--panel-2)' : 'transparent',
                borderLeft: `2px solid ${submitting ? 'var(--dc-bright)' : 'transparent'}`,
                opacity: instanceId ? 1 : 0.3,
                transition: 'background 180ms var(--ease)',
              }}
            >
              <span className="mono" style={{
                fontSize: 11, color: submitting ? 'var(--dc-bright)' : 'var(--dc)', paddingTop: 1,
              }}>↑</span>
              <span>
                <span style={{
                  display: 'block', fontSize: 12.5,
                  color: submitting ? 'var(--ink-0)' : 'var(--ink-1)', fontWeight: submitting ? 550 : 450,
                }}>Submit solution</span>
                <span style={{ display: 'block', fontSize: 10.5, color: 'var(--ink-4)' }}>
                  {instanceId ? `your .out for ${instanceId}` : 'choose a data set first'}
                </span>
              </span>
            </button>
          )
          return [
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
            </button>,
            submitStep,
          ]
        })}
      </nav>

      <div style={{ padding: '6px 0', borderTop: '1px solid var(--line)' }}>
        {([['leaderboard', 'Leaderboard', 'players & groups'],
           ['stats', 'Statistics', 'this run & the class'],
           ...(user?.isAdmin ? [['admin', 'Admin', 'ranked data sets & groups']] as const : [])] as const).map(([p, name, sub]) => (
          <button key={p} onClick={() => openPage(page === p ? null : p)} style={{
            display: 'block', width: '100%', textAlign: 'left', padding: '8px 16px',
            background: page === p ? 'var(--panel-2)' : 'transparent',
            borderLeft: `2px solid ${page === p ? 'var(--dc-bright)' : 'transparent'}`,
          }}>
            <span style={{ display: 'block', fontSize: 12.5, color: page === p ? 'var(--ink-0)' : 'var(--ink-1)', fontWeight: page === p ? 550 : 450 }}>{name}</span>
            <span style={{ display: 'block', fontSize: 10.5, color: 'var(--ink-4)' }}>{sub}</span>
          </button>
        ))}
      </div>

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

      {user && (
        <div style={{
          padding: '10px 16px', borderTop: '1px solid var(--line)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
        }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <span className="mono" style={{
              fontSize: 11, color: 'var(--ca-bright)', border: '1px solid var(--ca-dim)',
              width: 22, textAlign: 'center', padding: '2px 0',
            }}>{user.group ?? '★'}</span>
            <span style={{
              fontSize: 12.5, color: 'var(--ink-1)', minWidth: 0,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{user.username}</span>
          </span>
          <button className="lbl" onClick={() => void logout()}
            style={{ color: 'var(--ink-3)', whiteSpace: 'nowrap', flex: '0 0 auto' }}>sign out</button>
        </div>
      )}

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
  const page = useApp((s) => s.page)
  const meta = useApp((s) => s.meta)
  const user = useApp((s) => s.user)
  const logout = useApp((s) => s.logout)

  const title = page === 'submit' ? 'Submit' : page === 'leaderboard' ? 'Leaderboard' : page === 'stats' ? 'Statistics' : page === 'admin' ? 'Admin'
    : explore ? 'Free explore' : ACTS[act].name
  const sub = page === 'submit' ? 'any language, any algorithm'
    : page === 'leaderboard' ? 'best score per data set'
    : page === 'stats' ? 'caches, endpoints, players, groups'
    : page === 'admin' ? 'what counts, and who is where'
    : explore ? 'inspect any cache, endpoint or video' : ACTS[act].sub

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
        {instanceId && !page && (
          <span className="mono" style={{
            fontSize: 11, color: 'var(--ca-bright)', borderLeft: '1px solid var(--line)', paddingLeft: 12,
          }}>
            {instanceId}.in
            {summary && (
              <span style={{ color: 'var(--ink-3)' }}>
                {' '}· {summary.V.toLocaleString()}V · {summary.E}E · {summary.C}C
              </span>
            )}
            {meta && meta.source !== 'solver' && (
              <span style={{ color: 'var(--dc-bright)' }}>
                {' '}· {meta.owner}'s {meta.source === 'trace' ? 'trace' : '.out'}
              </span>
            )}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        {user && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, marginRight: 10 }}>
            <span className="mono" style={{
              fontSize: 10.5, border: `1px solid ${user.isAdmin ? 'var(--dc)' : 'var(--ca-dim)'}`,
              color: user.isAdmin ? 'var(--dc-bright)' : 'var(--ca-bright)', padding: '1px 6px',
            }}>{user.group === 'P' ? 'professor' : user.group ? `group ${user.group}` : 'admin'}{user.isAdmin && user.group ? ' · admin' : ''}</span>
            <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>{user.username}</span>
            <button onClick={() => void logout()} style={{
              fontSize: 11.5, padding: '3px 10px', border: '1px solid var(--line-2)', color: 'var(--ink-1)',
            }}>Log out</button>
          </span>
        )}
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
  meta: { status: string; cached: boolean; solveSeconds: number | null; source: string; owner: string | null } | null
  hasResult: boolean
}) {
  // Only for the reference solver: for a submission the top bar already says
  // whose run it is, and this fixed line sat on top of the charts' legends.
  if (!instanceId || !meta || meta.source !== 'solver') return null
  const label = !meta ? 'idle'
    : meta.status === 'done'
      ? (meta.source !== 'solver' ? `submission by ${meta.owner}`
        : meta.cached ? 'replay · prewarmed' : `solved live in ${meta.solveSeconds}s`)
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
