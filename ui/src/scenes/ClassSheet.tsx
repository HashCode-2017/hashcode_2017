import { useEffect, useRef, useState } from 'react'
import { api, type ClassSheet as Sheet, type SheetChange, type SheetGroup, type SheetInstance, type SheetSection } from '../lib/api'
import { useApp } from '../lib/store'
import { int } from '../lib/format'
import { Tabs } from './Leaderboard'

/**
 * The class's shared Google Sheet, mirrored: every group's score on every
 * instance, whether or not it was ever uploaded here. Read-only and separate
 * from console submissions -- admins refresh it from the sheet with one button.
 */
export function ClassSheet() {
  const user = useApp((s) => s.user)
  const [sheet, setSheet] = useState<Sheet | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState(0)

  useEffect(() => {
    api.classSheet().then(setSheet).catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }, [])

  const sections = sheet?.sections ?? []
  const section = sections[Math.min(tab, sections.length - 1)]

  return (
    <div style={{ padding: '26px 30px', overflowY: 'auto', height: '100%' }}>
      <div style={{ maxWidth: 1240 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontSize: 25, fontWeight: 600, letterSpacing: '-0.025em', color: 'var(--ink-0)', margin: '0 0 6px' }}>
              Class sheet
            </h1>
            <p style={{ color: 'var(--ink-2)', margin: '0 0 18px', fontSize: 13.5, maxWidth: 700 }}>
              The scores every group reported in the class's shared sheet, on every instance, including
              the ones never uploaded here. Separate from the leaderboard: nothing on this page is
              re-scored by the console.
            </p>
          </div>
          {user?.isAdmin && <SyncButton onSynced={(v) => setSheet(v)} />}
        </div>

        {error && <div className="mono" style={{ color: 'var(--alert-bright)', fontSize: 12 }}>{error}</div>}
        {!sheet && !error && <div className="lbl">loading…</div>}

        {sheet?.empty && (
          <div style={{ border: '1px dashed var(--line-2)', padding: '28px 22px', color: 'var(--ink-2)', fontSize: 13 }}>
            Nothing imported yet.{' '}
            {user?.isAdmin ? 'Use “sync from sheet” above to pull the class sheet in.' : 'An admin has to sync the class sheet first.'}
          </div>
        )}

        {section && sheet && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 18, flexWrap: 'wrap' }}>
              <Tabs value={String(tab)} onChange={(v) => setTab(Number(v))}
                options={sections.map((s, i) => [String(i), `${shortTitle(s.title)} · ${s.instances.length}`] as [string, string])} />
              <span className="lbl">
                updated {ago(sheet.synced_at)}{sheet.synced_by ? ` by ${sheet.synced_by}` : ''} ·{' '}
                <a href={sheet.source} target="_blank" rel="noreferrer" style={{ color: 'var(--ca-bright)', textDecoration: 'none' }}>
                  open the sheet ↗
                </a>
              </span>
            </div>
            <Standings section={section} mine={user?.group ?? null} />
            <ScoreMatrix section={section} mine={user?.group ?? null} />
            {sheet.last_sync && <LastChanges sync={sheet.last_sync} />}
          </>
        )}
      </div>
    </div>
  )
}

/** Admin-only: pull the sheet now. Says what happened in one short line. */
export function SyncButton({ onSynced }: { onSynced?: (view: Sheet) => void }) {
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ tone: 'ok' | 'idle' | 'err'; text: string } | null>(null)
  const timer = useRef<number>()

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const run = async () => {
    setBusy(true); setNote(null)
    try {
      const r = await api.syncClassSheet()
      setNote(r.changed
        ? { tone: 'ok', text: `Data updated · ${r.changed} cell${r.changed === 1 ? '' : 's'} changed` }
        : { tone: 'idle', text: 'Nothing to update' })
      onSynced?.(r.view)
    } catch (e) {
      setNote({ tone: 'err', text: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(false)
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setNote(null), 6000)
    }
  }

  const color = note?.tone === 'ok' ? 'var(--ca-bright)' : note?.tone === 'err' ? 'var(--alert-bright)' : 'var(--ink-2)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      {note && (
        <span role="status" className="mono sheet-note" style={{
          fontSize: 11.5, color, border: `1px solid ${note.tone === 'ok' ? 'var(--ca-dim)' : note.tone === 'err' ? 'var(--alert)' : 'var(--line-2)'}`,
          padding: '5px 9px', background: 'var(--panel)',
        }}>{note.tone === 'ok' ? '✓ ' : note.tone === 'err' ? '✕ ' : '· '}{note.text}</span>
      )}
      <button onClick={() => void run()} disabled={busy} style={{
        padding: '7px 16px', fontSize: 12.5, fontWeight: 550,
        border: '1px solid var(--dc)', background: 'var(--dc-dim)', color: 'var(--ink-0)',
      }}>{busy ? 'syncing…' : '↻ sync from sheet'}</button>
      <style>{`.sheet-note { animation: sheet-in 220ms var(--ease); }
        @keyframes sheet-in { from { opacity: 0; transform: translateY(-3px); } to { opacity: 1; transform: none; } }`}</style>
    </div>
  )
}

function Standings({ section, mine }: { section: SheetSection; mine: string | null }) {
  const ranked = section.groups.filter((g) => g.rank !== null).sort((a, b) => a.rank! - b.rank!)
  const top = ranked[0]?.total ?? 0
  const world = ranked.some((g) => g.world_rank !== null)
  return (
    <section style={{ marginBottom: 26 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink-0)', margin: 0 }}>Standings</h2>
        <span className="lbl">sum over the {section.instances.length} instances · VBS total {int(section.vbs_total)}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 8 }}>
        {ranked.map((g) => <GroupCard key={g.group} g={g} top={top} section={section} mine={g.group === mine} world={world} />)}
      </div>
    </section>
  )
}

function GroupCard({ g, top, section, mine, world }: {
  g: SheetGroup; top: number; section: SheetSection; mine: boolean; world: boolean
}) {
  const share = section.vbs_total ? g.total / section.vbs_total : 0
  const first = g.rank === 1
  return (
    <div style={{
      border: `1px solid ${mine ? 'var(--ca)' : first ? 'var(--dc-dim)' : 'var(--line-2)'}`,
      background: mine ? 'var(--panel-2)' : 'var(--panel)', padding: '10px 12px',
      display: 'flex', flexDirection: 'column', gap: 6,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: mine ? 'var(--ca-bright)' : 'var(--ink-0)' }}>
          Group {g.group}{mine && <span className="lbl" style={{ marginLeft: 6, color: 'var(--ca-bright)' }}>you</span>}
        </span>
        <span className="num" style={{ fontSize: 20, fontWeight: 600, color: first ? 'var(--dc-bright)' : 'var(--ink-1)' }}>
          #{g.rank}
        </span>
      </div>
      <span className="num" style={{ fontSize: 17, color: 'var(--ink-0)' }}>{int(g.total)}</span>
      <div style={{ height: 4, background: 'var(--panel-3)' }} aria-hidden>
        <div style={{ height: '100%', width: `${(top ? g.total / top : 0) * 100}%`, background: mine ? 'var(--ca)' : 'var(--ink-3)' }} />
      </div>
      <span className="lbl mono">
        {g.gap ? `−${int(g.gap)} to VBS · ${(share * 100).toFixed(2)}%` : 'equals VBS'}
      </span>
      <span className="lbl mono" style={{ color: 'var(--ink-3)' }}>
        {g.best_count} best · {g.scored}/{section.instances.length} scored
        {world && g.world_rank !== null ? ` · world #${int(g.world_rank)}` : ''}
      </span>
    </div>
  )
}

/** Gap to VBS -> cell shading. Cyan at VBS, neutral when close, amber as it falls behind. */
const BANDS: { max: number; bg: string; fg: string; label: string }[] = [
  { max: 0, bg: 'var(--seq-2)', fg: 'var(--ca-bright)', label: '= VBS' },
  { max: 0.001, bg: 'var(--seq-0)', fg: 'var(--ink-0)', label: '< 0.1%' },
  { max: 0.01, bg: 'var(--panel-3)', fg: 'var(--ink-1)', label: '< 1%' },
  { max: 0.05, bg: 'var(--amb-0)', fg: 'var(--ink-1)', label: '< 5%' },
  { max: 0.2, bg: 'var(--amb-1)', fg: 'var(--ink-0)', label: '< 20%' },
  { max: Infinity, bg: 'var(--amb-3)', fg: 'var(--ink-0)', label: '≥ 20%' },
]
const band = (gap: number) => BANDS.find((b) => gap <= b.max)!

function ScoreMatrix({ section, mine }: { section: SheetSection; mine: string | null }) {
  const groups = section.groups.filter((g) => g.rank !== null).sort((a, b) => a.rank! - b.rank!)
  const [hover, setHover] = useState<{ inst: SheetInstance; group: string } | null>(null)
  const cols = `minmax(170px, 1.6fr) 84px repeat(${groups.length}, minmax(80px, 1fr))`
  const minWidth = 170 + 84 + 80 * groups.length + 40

  return (
    <section style={{ marginBottom: 26 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink-0)', margin: 0 }}>Every instance</h2>
        <span className="lbl">gap to VBS:</span>
        {BANDS.map((b) => (
          <span key={b.label} className="lbl mono" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 10, height: 10, background: b.bg, border: '1px solid var(--line-2)' }} />{b.label}
          </span>
        ))}
      </div>
      <div style={{ height: 22, marginBottom: 6 }} className="mono">
        {hover ? <HoverLine inst={hover.inst} group={hover.group} /> :
          <span className="lbl" style={{ color: 'var(--ink-4)' }}>hover a cell for its gap and rank</span>}
      </div>
      <div style={{ overflowX: 'auto', border: '1px solid var(--line)', background: 'var(--panel)' }}
        onMouseLeave={() => setHover(null)}>
        <div style={{ minWidth }}>
          <div className="lbl" style={{
            display: 'grid', gridTemplateColumns: cols, gap: 2, padding: '8px 10px',
            borderBottom: '1px solid var(--line)', position: 'sticky', top: 0, background: 'var(--panel)',
          }}>
            <span>instance</span>
            <span style={{ textAlign: 'right' }}>VBS</span>
            {groups.map((g) => (
              <span key={g.group} style={{ textAlign: 'right', color: g.group === mine ? 'var(--ca-bright)' : undefined }}>
                {g.group} <span style={{ color: 'var(--ink-4)' }}>#{g.rank}</span>
              </span>
            ))}
          </div>
          {section.instances.map((inst) => (
            <div key={inst.name} className="mono sheet-row" style={{
              display: 'grid', gridTemplateColumns: cols, gap: 2, padding: '2px 10px', fontSize: 11.5,
              borderBottom: '1px solid var(--line)', alignItems: 'center',
            }}>
              <span title={inst.name} style={{ color: 'var(--ink-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }}>
                {inst.name}
              </span>
              <span style={{ textAlign: 'right', color: 'var(--ink-3)' }}>{inst.vbs === null ? '—' : int(inst.vbs)}</span>
              {groups.map((g) => {
                const v = inst.scores[g.group]
                if (v === undefined) {
                  return <span key={g.group} style={{ textAlign: 'right', color: 'var(--ink-4)', padding: '5px 6px' }}>—</span>
                }
                const gap = inst.vbs ? (inst.vbs - v) / inst.vbs : 0
                const b = band(gap)
                const on = hover?.inst === inst && hover.group === g.group
                return (
                  <span key={g.group} onMouseEnter={() => setHover({ inst, group: g.group })} style={{
                    textAlign: 'right', padding: '5px 6px', background: b.bg, color: b.fg,
                    fontWeight: gap === 0 ? 600 : 400,
                    outline: on ? '1px solid var(--ink-1)' : g.group === mine ? '1px solid var(--ca-dim)' : 'none',
                    outlineOffset: -1, cursor: 'default',
                  }}>{int(v)}</span>
                )
              })}
            </div>
          ))}
          <div className="mono" style={{
            display: 'grid', gridTemplateColumns: cols, gap: 2, padding: '8px 10px', fontSize: 12,
            borderTop: '1px solid var(--line-2)', background: 'var(--panel-2)',
          }}>
            <span style={{ fontFamily: 'var(--sans)', fontWeight: 600, color: 'var(--ink-0)' }}>Total</span>
            <span style={{ textAlign: 'right', color: 'var(--ink-2)' }}>{int(section.vbs_total)}</span>
            {groups.map((g) => (
              <span key={g.group} style={{
                textAlign: 'right', fontWeight: 600,
                color: g.rank === 1 ? 'var(--dc-bright)' : g.group === mine ? 'var(--ca-bright)' : 'var(--ink-0)',
              }}>{int(g.total)}</span>
            ))}
          </div>
        </div>
      </div>
      <style>{`.sheet-row:hover { background: var(--panel-2); }`}</style>
    </section>
  )
}

function HoverLine({ inst, group }: { inst: SheetInstance; group: string }) {
  const v = inst.scores[group]
  const gap = inst.vbs ? inst.vbs - v : 0
  const n = Object.keys(inst.scores).length
  return (
    <span style={{ fontSize: 12, color: 'var(--ink-1)' }}>
      <span style={{ color: 'var(--ink-0)', fontWeight: 600 }}>Group {group}</span> · {inst.name} ·{' '}
      <span style={{ color: 'var(--ink-0)' }}>{int(v)}</span> ·{' '}
      {gap ? <span style={{ color: 'var(--dc-bright)' }}>−{int(gap)} ({((gap / inst.vbs!) * 100).toFixed(3)}%) to VBS</span>
        : <span style={{ color: 'var(--ca-bright)' }}>at VBS</span>}
      {' '}· rank {inst.ranks[group]} of {n}
    </span>
  )
}

function LastChanges({ sync }: { sync: { at: number; by: string; count: number; changes: SheetChange[] } }) {
  const [open, setOpen] = useState(false)
  const fmt = (v: number | null) => (v === null ? '—' : int(v))
  return (
    <section style={{ border: '1px solid var(--line)', background: 'var(--panel)' }}>
      <button onClick={() => setOpen(!open)} style={{
        width: '100%', textAlign: 'left', padding: '10px 14px', display: 'flex', gap: 10, alignItems: 'baseline',
      }}>
        <span className="mono" style={{ color: 'var(--ink-3)', width: 10 }}>{open ? '▾' : '▸'}</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-0)' }}>Last update</span>
        <span className="lbl">{sync.count} cell{sync.count === 1 ? '' : 's'} changed · {ago(sync.at)} by {sync.by}</span>
      </button>
      {open && (
        <div style={{ maxHeight: 320, overflowY: 'auto', borderTop: '1px solid var(--line)' }}>
          {sync.changes.map((c, i) => (
            <div key={i} className="mono" style={{
              display: 'grid', gridTemplateColumns: '120px 40px 1fr auto', gap: 10, padding: '5px 14px',
              fontSize: 11.5, borderBottom: '1px solid var(--line)', color: 'var(--ink-2)',
            }}>
              <span className="lbl" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{shortTitle(c.section)}</span>
              <span style={{ color: 'var(--ink-0)' }}>{c.group}</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.instance}</span>
              <span>
                {fmt(c.old)} → <span style={{
                  color: c.new === null ? 'var(--alert-bright)' : c.old === null || c.new > c.old ? 'var(--ca-bright)' : 'var(--dc-bright)',
                }}>{fmt(c.new)}</span>
              </span>
            </div>
          ))}
          {sync.count > sync.changes.length && (
            <div className="lbl" style={{ padding: '8px 14px' }}>… and {sync.count - sync.changes.length} more</div>
          )}
        </div>
      )}
    </section>
  )
}

/** "INSTANCES FOURNIES PAR GOOGLE" -> "Google"; "INSTANCES DE LA PROMO" -> "Class". */
function shortTitle(title: string) {
  const t = title.toLowerCase()
  if (t.includes('google')) return 'Google'
  if (t.includes('promo')) return 'Class'
  return title
}

function ago(t: number | null | undefined) {
  if (!t) return 'never'
  const m = Math.max(0, Math.round((Date.now() / 1000 - t) / 60))
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} d ago`
}
