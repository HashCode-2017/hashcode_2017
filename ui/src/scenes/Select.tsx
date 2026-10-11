import { useState } from 'react'
import { motion } from 'framer-motion'
import { useApp } from '../lib/store'
import { bytes, compact, int } from '../lib/format'
import { Chip, Label } from '../components/Kit'
import { api, type InstanceRow } from '../lib/api'
import { Tabs } from './Leaderboard'

/**
 * Act 0. Five data sets as cartridges: the real header numbers, aligned in a
 * mono grid, plus a log-scale magnitude bar so the jump from the worked example
 * to `kittens` is legible at a glance rather than something you have to read.
 */
export function Select() {
  const instances = useApp((s) => s.instances)
  const select = useApp((s) => s.select)
  const submitFor = useApp((s) => s.submitFor)
  const admin = useApp((s) => !!s.user?.isAdmin)
  const user = useApp((s) => s.user)
  const setGeneratorOpen = useApp((s) => s.setGeneratorOpen)
  const loadInstances = useApp((s) => s.loadInstances)
  const remove = async (r: InstanceRow) => {
    try { await api.deleteInstance(r.id); await loadInstances() } catch { /* the card simply stays */ }
  }
  // Remembered across visits: a group working on the evaluation sets wants to stay there.
  const [only, setOnly] = useState(() => localStorage.getItem('dataset-filter') === 'evaluation')
  const choose = (v: string) => {
    setOnly(v === 'evaluation')
    localStorage.setItem('dataset-filter', v)
  }
  const evaluation = instances.filter((r) => r.official)
  const shown = only ? evaluation : instances

  const scale = (r: InstanceRow) => {
    const weight = r.V * 1 + r.E * 50 + r.C * 50 + r.R * 2
    return Math.min(1, Math.log10(Math.max(10, weight)) / 6.6)
  }

  return (
    <div style={{ padding: '28px 30px', overflowY: 'auto', height: '100%' }}>
      <div style={{ maxWidth: 1180 }}>
        <h1 style={{
          fontSize: 27, fontWeight: 600, letterSpacing: '-0.025em',
          color: 'var(--ink-0)', margin: '0 0 8px',
        }}>
          Which network are we placing videos in?
        </h1>
        <p style={{ color: 'var(--ink-2)', maxWidth: 660, margin: '0 0 26px', fontSize: 13.5 }}>
          Every data set describes the same thing at a different scale: a datacenter holding every
          video, a set of cache servers with a fixed capacity, and endpoints whose users are about
          to ask for things. Download one, run your algorithm on it, then submit your output and
          follow your own placement from raw bytes to a scored file. Data sets marked{' '}
          <span style={{ color: 'var(--dc-bright)' }}>ranked</span> count for the final ranking.
        </p>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '-8px 0 16px' }}>
          <Tabs value={only ? 'evaluation' : 'all'} onChange={choose} options={[
            ['all', `All data sets · ${instances.length}`],
            ['evaluation', `Evaluation only · ${evaluation.length}`],
          ]} />
          {only && (
            <span className="lbl">the data sets the admin chose for the final ranking</span>
          )}
          <span style={{ flex: 1 }} />
          <button onClick={() => setGeneratorOpen(true)} className="lbl act-btn act-btn-main">+ generate a new instance</button>
        </div>

        {only && evaluation.length === 0 && (
          <div className="lbl" style={{ color: 'var(--ink-4)', padding: '20px 0' }}>
            no evaluation data sets chosen yet
          </div>
        )}

        <div style={{ display: 'grid', gap: 12 }}>
          {shown.map((r, i) => (
            <motion.div
              key={r.id}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter') void select(r.id) }}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.055, duration: 0.35, ease: [0.22, 0.61, 0.36, 1] }}
              onClick={() => void select(r.id)}
              className="cartridge"
              style={{
                display: 'grid', gridTemplateColumns: '260px 1fr auto', gap: 22,
                alignItems: 'center', textAlign: 'left', cursor: 'pointer',
                background: 'var(--panel)', border: '1px solid var(--line)',
                padding: '15px 18px',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div className="mono" style={{
                  fontSize: 14.5, color: 'var(--ink-0)', fontWeight: 500, letterSpacing: '-0.01em',
                }}>{r.id}.in</div>
                <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 3 }}>{r.blurb}</div>
                <div style={{ marginTop: 9, display: 'flex', gap: 6, alignItems: 'center' }}>
                  {r.official && <Chip tone="dc">ranked</Chip>}
                  {r.generated && (
                    <Chip tone="ca">{r.generated.model} · by {r.generated.by} ({r.generated.group === 'P' ? 'professors' : r.generated.group ? `group ${r.generated.group}` : 'admin'})</Chip>
                  )}
                  {admin && (
                    <Chip tone={r.prewarmed ? 'ca' : 'idle'}>
                      {r.prewarmed ? 'prewarmed' : 'solves live'}
                    </Chip>
                  )}
                  <span className="lbl mono">{bytes(r.bytes)}</span>
                </div>
                <div style={{ marginTop: 10, display: 'flex', gap: 6 }}>
                  <a
                    href={api.downloadUrl(r.id)}
                    download={`${r.id}.in`}
                    onClick={(e) => e.stopPropagation()}
                    className="lbl act-btn"
                  >download .in ↓</a>
                  <button
                    onClick={(e) => { e.stopPropagation(); void submitFor(r.id) }}
                    className="lbl act-btn act-btn-main"
                  >submit solution →</button>
                  {r.generated && (admin || (user?.group && r.generated.group === user.group)) && (
                    <button
                      onClick={(e) => { e.stopPropagation(); void remove(r) }}
                      className="lbl act-btn" title="delete this generated instance"
                    >delete</button>
                  )}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14 }}>
                <Field label="videos" value={int(r.V)} />
                <Field label="endpoints" value={int(r.E)} />
                <Field label="caches" value={int(r.C)} />
                <Field label="request rows" value={compact(r.R)} />
                <Field label="cache size" value={`${int(r.X)} MB`} />
              </div>

              <div style={{ width: 132 }}>
                <Label style={{ textAlign: 'right', marginBottom: 5 }}>scale</Label>
                <div style={{ display: 'flex', gap: 2, height: 22, alignItems: 'flex-end' }}>
                  {Array.from({ length: 22 }, (_, k) => {
                    const lit = k / 22 < scale(r)
                    return (
                      <div key={k} style={{
                        flex: 1, height: `${35 + (k / 22) * 65}%`,
                        background: lit ? 'var(--ca)' : 'var(--panel-3)',
                      }} />
                    )
                  })}
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        <style>{`
          .cartridge { transition: border-color 180ms var(--ease), background 180ms var(--ease); }
          .cartridge:hover { border-color: var(--ca); background: var(--panel-2); }
          .act-btn {
            border: 1px solid var(--line-2); padding: 4px 8px; color: var(--ink-1);
            text-decoration: none; background: var(--bg); white-space: nowrap;
            transition: border-color 160ms var(--ease), color 160ms var(--ease);
          }
          .act-btn:hover { border-color: var(--ink-2); color: var(--ink-0); }
          .act-btn-main { border-color: var(--ca-dim); color: var(--ca-bright); }
          .act-btn-main:hover { border-color: var(--ca); }
        `}</style>
      </div>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="num" style={{ fontSize: 15, color: 'var(--ink-1)', marginTop: 2 }}>{value}</div>
    </div>
  )
}
