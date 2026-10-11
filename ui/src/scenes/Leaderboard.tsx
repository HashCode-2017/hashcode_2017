import { useEffect, useState } from 'react'
import { LayoutGroup } from 'framer-motion'
import { api, type Board, type GroupMatrix } from '../lib/api'
import { useApp } from '../lib/store'
import { BoardRows } from '../components/BoardRows'
import { bytes, int } from '../lib/format'

const POLL_MS = 8000

/**
 * The class standings. Polls, so a board left up on the projector reshuffles
 * on its own as people submit.
 */
export function Leaderboard() {
  const instances = useApp((s) => s.instances)
  const submitFor = useApp((s) => s.submitFor)
  const [scope, setScope] = useState('overall')

  const evaluation = instances.filter((r) => r.official)
  const others = instances.filter((r) => !r.official).map((r) => r.id)
  const final = scope === 'overall'

  return (
    <div style={{ padding: '26px 30px', overflowY: 'auto', height: '100%' }}>
      <div style={{ maxWidth: 1100 }}>
        <h1 style={{ fontSize: 25, fontWeight: 600, letterSpacing: '-0.025em', color: 'var(--ink-0)', margin: '0 0 6px' }}>
          Leaderboard
        </h1>
        <p style={{ color: 'var(--ink-2)', margin: '0 0 18px', fontSize: 13.5, maxWidth: 720 }}>
          Groups compete, not individuals: every member's upload counts for the group. On each
          data set the group's latest submission is its result, replacing the one before, and
          the final score is the sum over the evaluation data sets.
        </p>

        <section style={{ border: '1px solid var(--dc-dim)', background: 'var(--panel)', padding: '12px 14px', marginBottom: 22 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
            <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--dc-bright)' }}>Evaluation data sets</span>
            <span className="lbl">chosen by the admin · these decide the final ranking</span>
          </div>
          {evaluation.length === 0 ? (
            <span className="lbl" style={{ color: 'var(--ink-4)' }}>none chosen yet</span>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 8 }}>
              {evaluation.map((r) => (
                <div key={r.id} style={{
                  border: '1px solid var(--line-2)', background: 'var(--bg)', padding: '9px 11px',
                  display: 'flex', flexDirection: 'column', gap: 6,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                    <span className="mono" style={{ fontSize: 12.5, color: 'var(--ink-0)' }}>{r.id}.in</span>
                    <span className="lbl mono">{bytes(r.bytes)}</span>
                  </div>
                  <span className="lbl mono">{int(r.V)} videos · {int(r.E)} endpoints · {int(r.C)} caches</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <a href={api.downloadUrl(r.id)} download={`${r.id}.in`} className="lbl" style={{
                      border: '1px solid var(--line-2)', padding: '3px 8px', color: 'var(--ink-1)', textDecoration: 'none',
                    }}>download .in ↓</a>
                    <button onClick={() => void submitFor(r.id)} className="lbl" style={{
                      border: '1px solid var(--ca-dim)', padding: '3px 8px', color: 'var(--ca-bright)',
                    }}>submit →</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <div style={{ display: 'flex', gap: 18, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
          <Tabs value={final || evaluation.some((r) => r.id === scope) ? scope : ''} onChange={setScope}
            options={[['overall', 'Final ranking'], ...evaluation.map((r) => [r.id, r.id] as [string, string])]} />
          <select value={others.includes(scope) ? scope : ''} onChange={(e) => e.target.value && setScope(e.target.value)}
            className="mono" style={{
              padding: '6px 8px', fontSize: 11.5, background: 'var(--panel)',
              border: `1px solid ${others.includes(scope) ? 'var(--ca)' : 'var(--line-2)'}`, color: 'var(--ink-1)',
            }}>
            <option value="">practice data sets…</option>
            {others.map((id) => <option key={id} value={id}>{id}</option>)}
          </select>
        </div>

        <Section title={final ? 'Final ranking — groups' : `${scope} — groups`} scope={scope} />

        <AllDataSets current={scope} onPick={setScope} />
      </div>
    </div>
  )
}

/** One polled group board. Rows glide when the order changes. */
function Section({ title, scope }: { title: string; scope: string }) {
  const user = useApp((s) => s.user)
  const [board, setBoard] = useState<Board | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setBoard(null)
    const load = () => api.leaderboard(scope, 'group')
      .then((b) => { if (alive) { setBoard(b); setError(null) } })
      .catch((e) => alive && setError(String(e)))
    void load()
    const t = setInterval(load, POLL_MS)
    return () => { alive = false; clearInterval(t) }
  }, [scope])

  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink-0)', margin: 0 }}>{title}</h2>
        {board && (() => {
          const ranked = board.rows.filter((r) => !r.empty).length
          const waiting = board.rows.length - ranked
          return <span className="lbl">{ranked} group{ranked === 1 ? '' : 's'} ranked{waiting ? ` · ${waiting} not submitted here yet` : ''}</span>
        })()}
      </div>
      {error && <div className="mono" style={{ color: 'var(--alert-bright)', fontSize: 12 }}>{error}</div>}
      {board && board.rows.every((r) => r.empty) && board.rows.length === 0 && (
        <div className="lbl" style={{ color: 'var(--ink-4)', padding: '18px 0' }}>
          no valid submissions here yet — be the first group
        </div>
      )}
      {board && board.rows.length > 0 && (
        <LayoutGroup id={`${scope}-group`}>
          <BoardRows rows={board.rows} highlight={user?.group ? `g${user.group}` : null}
            columns={scope === 'overall' ? board.instances : undefined} />
        </LayoutGroup>
      )}
    </section>
  )
}

export function Tabs({ value, onChange, options }: {
  value: string; onChange: (v: string) => void; options: [string, string][]
}) {
  return (
    <div style={{ display: 'flex', border: '1px solid var(--line-2)' }}>
      {options.map(([v, label]) => (
        <button key={v} onClick={() => onChange(v)} className="mono" style={{
          padding: '6px 11px', fontSize: 11.5,
          background: value === v ? 'var(--panel-3)' : 'transparent',
          color: value === v ? 'var(--ca-bright)' : 'var(--ink-3)',
          borderRight: '1px solid var(--line)',
        }}>{label}</button>
      ))}
    </div>
  )
}

/** "3 min ago" from a unix time in seconds. */
function ago(t: number | null) {
  if (!t) return 'never'
  const m = Math.max(0, Math.round((Date.now() / 1000 - t) / 60))
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} d ago`
}

/**
 * Every group x every data set that has submissions: each group's latest
 * score (the one its boards use), the best per data set highlighted, plus how
 * active each group is. The final ranking only counts the evaluation sets;
 * this is where all the other work shows up. Click a column for its board.
 */
function AllDataSets({ current, onPick }: { current: string; onPick: (scope: string) => void }) {
  const user = useApp((s) => s.user)
  const [m, setM] = useState<GroupMatrix | null>(null)

  useEffect(() => {
    let alive = true
    const load = () => api.matrix().then((x) => { if (alive) setM(x) }).catch(() => null)
    void load()
    const t = setInterval(load, POLL_MS)
    return () => { alive = false; clearInterval(t) }
  }, [])

  if (!m || m.groups.length === 0) return null
  const cols = `90px repeat(${m.instances.length}, minmax(96px, 1fr)) 92px 92px`

  return (
    <section style={{ marginTop: 30 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 6 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink-0)', margin: 0 }}>All data sets — every group</h2>
        <span className="lbl">latest score per data set · <span style={{ color: 'var(--ca-bright)' }}>■</span> best ·{' '}
          <span style={{ color: 'var(--dc-bright)' }}>★</span> counts for the final ranking · click a column for its board</span>
      </div>
      <div style={{ overflowX: 'auto', border: '1px solid var(--line)', background: 'var(--panel)' }}>
        <div style={{ minWidth: 90 + 96 * m.instances.length + 184 }}>
          <div className="lbl" style={{
            display: 'grid', gridTemplateColumns: cols, gap: 8, padding: '8px 12px',
            borderBottom: '1px solid var(--line)', alignItems: 'end',
          }}>
            <span>group</span>
            {m.instances.map((i) => {
              const evalSet = m.evaluation.includes(i)
              return (
                <button key={i} onClick={() => onPick(i)} title={`open the ${i} board`} className="lbl" style={{
                  textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  color: current === i ? 'var(--ca-bright)' : evalSet ? 'var(--dc-bright)' : 'var(--ink-3)',
                }}>{evalSet ? '★ ' : ''}{i}</button>
              )
            })}
            <span style={{ textAlign: 'right' }}>uploads</span>
            <span style={{ textAlign: 'right' }}>last upload</span>
          </div>
          {m.groups.map((g) => {
            const mine = user?.group === g.group
            return (
              <div key={g.group} className="mono" style={{
                display: 'grid', gridTemplateColumns: cols, gap: 8, padding: '7px 12px', fontSize: 12,
                borderBottom: '1px solid var(--line)', alignItems: 'center',
                background: mine ? 'var(--panel-3)' : 'transparent',
              }}>
                <span style={{ color: mine ? 'var(--ca-bright)' : 'var(--ink-1)', fontFamily: 'var(--sans)', fontWeight: mine ? 600 : 400 }}>
                  Group {g.group}<span className="lbl" style={{ marginLeft: 6 }}>{g.members}/4</span>
                </span>
                {m.instances.map((i) => {
                  const cell = g.scores[i]
                  if (!cell) return <span key={i} style={{ textAlign: 'right', color: 'var(--ink-4)' }}>—</span>
                  const top = cell.valid && cell.score === m.best[i] && cell.score > 0
                  return (
                    <span key={i} title={cell.valid ? undefined : 'latest upload overflows a cache: counts 0'} style={{
                      textAlign: 'right',
                      color: !cell.valid ? 'var(--alert-bright)' : top ? 'var(--ca-bright)' : 'var(--ink-1)',
                      fontWeight: top ? 600 : 400,
                    }}>{cell.valid ? int(cell.score) : 'invalid'}</span>
                  )
                })}
                <span style={{ textAlign: 'right', color: g.submissions ? 'var(--ink-1)' : 'var(--ink-4)' }}>{g.submissions}</span>
                <span style={{ textAlign: 'right', color: 'var(--ink-3)', fontSize: 11 }}>{ago(g.last)}</span>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
