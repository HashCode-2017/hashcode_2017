import { motion } from 'framer-motion'
import type { BoardRow } from '../lib/api'
import { Num } from './Kit'

/**
 * Leaderboard rows that glide to their new position whenever the order
 * changes. Rows are keyed by player/group, so framer-motion's `layout` does
 * the reordering animation for both the live board and the rank reveal.
 */
export function BoardRows({ rows, highlight, columns, ghost }: {
  rows: (BoardRow & { ghostRow?: boolean })[]
  highlight?: string | null
  /** Per-instance score columns; omitted on single-instance boards. */
  columns?: string[]
  ghost?: boolean
}) {
  const grid = `56px 1fr ${columns ? columns.map(() => '96px').join(' ') : ''} 120px`
  return (
    <div>
      <div className="lbl" style={{
        display: 'grid', gridTemplateColumns: grid, gap: 10,
        padding: '0 14px 7px', color: 'var(--ink-4)',
      }}>
        <span>rank</span><span>name</span>
        {columns?.map((c) => (
          <span key={c} title={c} style={{
            textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{short(c)}</span>
        ))}
        <span style={{ textAlign: 'right' }}>score</span>
      </div>
      {rows.map((r) => {
        const me = r.key === highlight
        return (
          <motion.div
            key={r.key}
            layout
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: r.ghostRow ? 0.35 : r.empty ? 0.45 : 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ layout: { type: 'spring', stiffness: 120, damping: 20 }, duration: 0.35 }}
            style={{
              display: 'grid', gridTemplateColumns: grid, gap: 10, alignItems: 'center',
              padding: '9px 14px', marginBottom: 2, position: 'relative',
              background: me ? 'var(--panel-3)' : 'var(--panel)',
              border: `1px solid ${me ? 'var(--ca)' : 'var(--line)'}`,
              boxShadow: me ? '0 0 0 1px var(--ca-dim), 0 0 28px -6px var(--ca)' : 'none',
              zIndex: me ? 2 : 1,
            }}
          >
            <span className="num" style={{
              fontSize: 15, color: r.rank === 1 && !r.ghostRow ? 'var(--dc-bright)' : me ? 'var(--ca-bright)' : 'var(--ink-2)',
            }}>{r.ghostRow || r.empty ? '—' : `#${r.rank}`}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
              <span className="mono" style={{
                fontSize: 10.5, color: 'var(--ink-2)', border: '1px solid var(--line-2)',
                width: 20, textAlign: 'center', padding: '1px 0', flex: '0 0 auto',
              }}>{r.group}</span>
              <span style={{
                fontSize: 13, color: me ? 'var(--ink-0)' : 'var(--ink-1)', fontWeight: me ? 600 : 400,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{r.name}{me && !ghost ? '  · you' : ''}</span>
            </span>
            {columns?.map((c) => (
              <span key={c} className="num" style={{ textAlign: 'right', fontSize: 12, color: 'var(--ink-3)' }}>
                {r.scores[c] != null ? <Num value={r.scores[c]} /> : '—'}
              </span>
            ))}
            <span className="num" style={{ textAlign: 'right', fontSize: 14.5, color: me ? 'var(--ca-bright)' : 'var(--ink-0)' }}>
              {r.empty
                ? <span className="lbl" style={{ color: 'var(--ink-3)' }}>no evaluation submission yet</span>
                : <Num value={r.total} />}
            </span>
          </motion.div>
        )
      })}
    </div>
  )
}

const short = (id: string) => ({
  me_at_the_zoo: 'zoo', videos_worth_spreading: 'videos',
  trending_today: 'trending', kittens: 'kittens',
} as Record<string, string>)[id] ?? id
