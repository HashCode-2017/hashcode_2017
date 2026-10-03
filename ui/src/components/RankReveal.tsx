import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion'
import { api, type BoardRow, type RankReport } from '../lib/api'
import { int } from '../lib/format'
import { BoardRows } from './BoardRows'
import { Tabs } from '../scenes/Leaderboard'

const HOLD_MS = 1300           // how long the "before" board sits before it reshuffles
const WINDOW = 3               // rows kept either side of you on a long board
const TOP = 3

/**
 * The end of the story: the board as it stood before this submission, then
 * the reshuffle as it lands. Long boards are trimmed to the podium plus your
 * neighbourhood, taken from both orderings so nobody pops in mid-move.
 */
export function RankReveal({ runId, onClose }: { runId: string; onClose: () => void }) {
  const [report, setReport] = useState<RankReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [which, setWhich] = useState<string | null>(null)
  const [phase, setPhase] = useState<'before' | 'after'>('before')

  // The run may be a beat ahead of the database write; retry briefly.
  useEffect(() => {
    let alive = true
    let tries = 0
    const load = () => api.rank(runId).then((r) => {
      if (!alive) return
      setReport(r)
      setWhich(r.boards.overall_group ? 'overall_group' : 'instance_group')
    }).catch((e) => {
      if (alive && tries++ < 10) setTimeout(load, 400)
      else if (alive) setError(String(e))
    })
    void load()
    return () => { alive = false }
  }, [runId])

  // Replay the reshuffle every time the view changes, or on request.
  const [take, setTake] = useState(0)
  useEffect(() => {
    if (!which) return
    setPhase('before')
    const t = setTimeout(() => setPhase('after'), HOLD_MS)
    return () => clearTimeout(t)
  }, [which, take])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const board = report && which ? report.boards[which] : null
  const meKey = report && board ? (board.by === 'user' ? report.userKey : report.groupKey) : null

  const view = useMemo(() => {
    if (!board || !meKey) return null
    const keep = new Set<string>()
    for (const list of [board.before, board.after]) {
      const i = list.findIndex((r) => r.key === meKey)
      list.slice(0, TOP).forEach((r) => keep.add(r.key))
      if (i >= 0) list.slice(Math.max(0, i - WINDOW), i + WINDOW + 1).forEach((r) => keep.add(r.key))
    }
    const before = board.before.find((r) => r.key === meKey) ?? null
    const after = board.after.find((r) => r.key === meKey) ?? null
    const pick = (list: BoardRow[]) => list.filter((r) => keep.has(r.key))
    let rows: (BoardRow & { ghostRow?: boolean })[] = pick(phase === 'before' ? board.before : board.after)
    // Not on the board yet: a placeholder at the bottom that slides up into place.
    if (phase === 'before' && !before && after) {
      rows = [...rows, { ...after, rank: board.before.length + 1, total: 0, scores: {}, ghostRow: true }]
    }
    return { rows, before, after, size: board.after.length, trimmed: keep.size < board.after.length }
  }, [board, meKey, phase])

  const moved = view?.before && view.after ? view.before.rank - view.after.rank : null
  // The latest upload replaces the previous one, so a group can also go down.
  const verdict = !report ? '' : !report.valid ? 'invalid — this data set now counts 0'
    : !view?.after ? '' : !view.before ? 'new on the board'
    : moved! > 0 ? `up ${moved} place${moved === 1 ? '' : 's'}`
    : moved! < 0 ? `down ${-moved!} place${moved === -1 ? '' : 's'}`
    : view.after.total > view.before.total ? 'score improved, same place'
    : view.after.total < view.before.total ? 'score dropped, same place'
    : 'same score, same place'

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 50, display: 'grid', placeItems: 'center',
        background: 'rgba(4, 5, 7, 0.82)', backdropFilter: 'blur(6px)',
      }}
    >
      <motion.div
        onClick={(e) => e.stopPropagation()}
        initial={{ y: 28, opacity: 0, scale: 0.98 }} animate={{ y: 0, opacity: 1, scale: 1 }}
        transition={{ duration: 0.45, ease: [0.22, 0.61, 0.36, 1] }}
        style={{
          width: 'min(860px, 92vw)', maxHeight: '88vh', overflowY: 'auto',
          background: 'var(--bg)', border: '1px solid var(--line-2)', padding: '24px 26px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 20 }}>
          <div>
            <div className="lbl">{report ? `${report.instance}.in · group ${report.group}` : 'scoring…'}</div>
            <div style={{ fontSize: 13, color: 'var(--ink-2)', marginTop: 6 }}>this submission scored</div>
            <div className="num" style={{ fontSize: 34, color: 'var(--ca-bright)', letterSpacing: '-0.02em' }}>
              {report ? int(report.score) : '—'}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="lbl">group {report?.group ?? ''} · place</div>
            <AnimatePresence mode="popLayout">
              <motion.div
                key={`${which}-${phase}`}
                initial={{ y: phase === 'after' ? 30 : 0, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -30, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 160, damping: 18 }}
                className="num"
                style={{
                  fontSize: 54, lineHeight: 1.05, fontWeight: 600,
                  color: phase === 'after' && view?.after?.rank === 1 ? 'var(--dc-bright)' : 'var(--ink-0)',
                }}
              >
                {phase === 'before'
                  ? (view?.before ? `#${view.before.rank}` : '—')
                  : (view?.after ? `#${view.after.rank}` : '—')}
              </motion.div>
            </AnimatePresence>
            <motion.div
              key={`${which}-verdict-${phase}`}
              initial={{ opacity: 0 }} animate={{ opacity: phase === 'after' ? 1 : 0 }}
              className="lbl"
              style={{ color: moved && moved > 0 || !view?.before ? 'var(--ca-bright)' : 'var(--ink-3)', marginTop: 2 }}
            >
              {verdict}{view?.after ? ` · of ${view.size}` : ''}
            </motion.div>
          </div>
        </div>

        {report && (
          <div style={{ display: 'flex', gap: 12, margin: '18px 0 14px', flexWrap: 'wrap' }}>
            <Tabs value={which ?? ''} onChange={setWhich} options={[
              ...(report.boards.overall_group ? [['overall_group', 'Final ranking']] as [string, string][] : []),
              ['instance_group', report.instance],
            ]} />
          </div>
        )}

        {error && <div className="mono" style={{ color: 'var(--alert-bright)', fontSize: 12 }}>{error}</div>}
        {view && view.rows.length > 0 && (
          <LayoutGroup id={`reveal-${which}`}>
            <BoardRows rows={view.rows} highlight={meKey}
              columns={board?.scope === 'overall' ? report?.ranked : undefined} />
          </LayoutGroup>
        )}
        {view && view.trimmed && (
          <div className="lbl" style={{ color: 'var(--ink-4)', marginTop: 8 }}>
            showing the top {TOP} and your neighbours · full board on the leaderboard page
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 20 }}>
          <button className="lbl" onClick={() => setTake((n) => n + 1)}
            style={{ color: 'var(--ink-2)' }}>↻ replay</button>
          <button onClick={onClose} style={{
            padding: '7px 16px', border: '1px solid var(--line-2)', color: 'var(--ink-1)', fontSize: 12.5,
          }}>close · esc</button>
        </div>
      </motion.div>
    </motion.div>
  )
}
