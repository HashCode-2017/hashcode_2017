import { useEffect, useState } from 'react'
import { api, type RunResult } from '../lib/api'
import { useApp } from '../lib/store'
import { compact, int } from '../lib/format'
import { Chip, Label, Meter, Num, Panel, Stat } from '../components/Kit'
import { RankBars } from '../viz/Charts'
import { NeedSubmission } from './NeedSubmission'

/**
 * Act 5. The file we would actually submit, the rules it has to satisfy, and
 * the official scoring formula with this run's own numbers in it.
 */
export function Submission() {
  const result = useApp((s) => s.result)
  const meta = useApp((s) => s.meta)
  const summary = useApp((s) => s.summary)
  const instances = useApp((s) => s.instances)
  const [scores, setScores] = useState<Record<string, number>>({})
  const reveal = useApp((s) => s.reveal)
  const setReveal = useApp((s) => s.setReveal)
  const setShowRank = useApp((s) => s.setShowRank)
  const mine = !!meta && meta.source !== 'solver'
  const user = useApp((s) => s.user)
  const needSubmission = useApp((s) => s.needSubmission)

  // A fresh upload ends on its rank: once, a beat after the last act opens.
  useEffect(() => {
    if (!result || !meta || reveal !== meta.id) return
    const t = setTimeout(() => { setShowRank(meta.id); setReveal(null) }, 900)
    return () => clearTimeout(t)
  }, [result, meta, reveal, setReveal, setShowRank])

  // Compare data sets: a player's own best on each; for the admin, the
  // reference solver's prewarmed runs.
  useEffect(() => {
    let alive = true
    void (async () => {
      const out: Record<string, number> = {}
      if (!user?.isAdmin) {
        const subs = await api.mySubmissions().catch(() => [])
        for (const s of subs) if (s.valid) out[s.instance] = Math.max(out[s.instance] ?? 0, s.score)
        if (alive) setScores(out)
        return
      }
      for (const row of instances) {
        if (!row.prewarmed) continue
        try {
          const r = await fetch(`/api/runs/${row.id}-r5/result`)
          if (r.ok) out[row.id] = (await r.json()).score
        } catch { /* a missing prewarm just drops out of the chart */ }
      }
      if (alive) setScores(out)
    })()
    return () => { alive = false }
  }, [instances, user, result])

  if (!result && needSubmission) return <NeedSubmission />
  if (!result || !meta || !summary) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100%' }}>
        <span className="lbl" style={{ color: 'var(--ink-3)' }}>run the placement first</span>
      </div>
    )
  }

  const v = result.validation
  const lines = result.submission.split('\n').filter(Boolean)
  const preview = lines.slice(0, 40)

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr 1fr var(--tele)',
      gap: 1, background: 'var(--line)', height: '100%', minHeight: 0,
    }}>
      <Panel
        title={`${meta.instance}.out`}
        right={
          <a
            href={api.submissionUrl(meta.id)}
            download
            className="lbl"
            style={{ color: 'var(--ca-bright)', textDecoration: 'none' }}
          >download ↓</a>
        }
        flush
        style={{ minHeight: 0 }}
      >
        <div className="mono" style={{ height: '100%', overflow: 'auto', padding: 12, fontSize: 10.5, lineHeight: 1.6 }}>
          <div style={{ display: 'flex', gap: 10 }}>
            <span style={{ color: 'var(--ink-4)', minWidth: 26, textAlign: 'right' }}>1</span>
            <span style={{ color: 'var(--dc-bright)' }}>{lines[0]}</span>
            <span style={{ color: 'var(--ink-4)' }}>← cache servers described</span>
          </div>
          {preview.slice(1).map((l, i) => {
            const parts = l.split(' ')
            return (
              <div key={i} style={{ display: 'flex', gap: 10 }}>
                <span style={{ color: 'var(--ink-4)', minWidth: 26, textAlign: 'right' }}>{i + 2}</span>
                <span style={{ wordBreak: 'break-all' }}>
                  <span style={{ color: 'var(--ca-bright)' }}>{parts[0]}</span>
                  <span style={{ color: 'var(--ink-3)' }}> {parts.slice(1).join(' ')}</span>
                </span>
              </div>
            )
          })}
          {lines.length > 40 && (
            <div style={{ color: 'var(--ink-4)', marginTop: 8, paddingLeft: 36 }}>
              … {int(lines.length - 40)} more lines
            </div>
          )}
        </div>
      </Panel>

      <div style={{ display: 'grid', gridTemplateRows: 'auto auto 1fr', gap: 1, minHeight: 0 }}>
        <Panel title="validation">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <Chip tone={v.valid ? 'ca' : 'alert'}>
              {v.valid ? '✓ valid submission' : `✗ ${v.problems.length} problems`}
            </Chip>
            <span className="lbl">checked against the statement&apos;s rules</span>
          </div>
          <Check ok label="format matches the spec"
            detail={`${v.describedCaches} of ${v.totalCaches} caches described, one line each`} />
          <Check ok={v.largestFill <= v.capacityMB}
            label="no cache exceeds its capacity"
            detail={`fullest cache holds ${int(v.largestFill)} MB of ${int(v.capacityMB)} MB`} />
          <Check ok label="video ids in range, no repeats within a cache"
            detail={`ids 0 … ${int(summary.V - 1)}`} />
          {v.problems.map((p, i) => (
            <div key={i} className="mono" style={{ fontSize: 10.5, color: 'var(--alert-bright)', marginTop: 6 }}>
              cache {p.cache}: {p.kind} — {p.detail}
            </div>
          ))}
          <div style={{ marginTop: 12 }}>
            <Label style={{ marginBottom: 6 }}>fullest cache</Label>
            <Meter value={v.largestFill / v.capacityMB} segments={34}
              color={v.largestFill > v.capacityMB ? 'var(--alert)' : 'var(--ca)'} />
          </div>
        </Panel>

        <Panel title="the score, worked out">
          <div className="mono" style={{ fontSize: 11.5, lineHeight: 2, color: 'var(--ink-2)' }}>
            <div>
              Σ saved <span style={{ color: 'var(--ink-0)' }}>{int(result.savedMs)}</span> ms
            </div>
            <div>
              × 1000 ÷ <span style={{ color: 'var(--ink-0)' }}>{int(result.totalRequests)}</span> requests
            </div>
            <div style={{
              borderTop: '1px solid var(--line)', paddingTop: 7, marginTop: 4,
              fontSize: 17, color: 'var(--ca-bright)',
            }}>
              = {int(result.score)} μs saved per request
            </div>
          </div>
          <p style={{ fontSize: 11, color: 'var(--ink-4)', marginTop: 12, marginBottom: 0, lineHeight: 1.55 }}>
            Computed by the same <span className="mono">score()</span> in solution.py that the CLI
            uses — and independently reproduced by the running counter in the previous act, which
            sums each placement&apos;s marginal gain.
          </p>
        </Panel>

        <Panel title={user?.isAdmin ? 'all data sets · reference solver' : "your group's best on each data set"} style={{ minHeight: 0 }}>
          <div style={{ overflowY: 'auto', height: '100%' }}>
            {Object.keys(scores).length ? (
              <RankBars
                rows={instances.filter((r) => scores[r.id] !== undefined).map((r) => ({
                  label: r.id.slice(0, 11),
                  value: scores[r.id],
                }))}
                color="var(--ca)"
              />
            ) : (
              <span className="lbl" style={{ color: 'var(--ink-4)' }}>
                {user?.isAdmin ? 'prewarm the other data sets to compare' : 'submit on other data sets to compare'}
              </span>
            )}
            <p style={{ fontSize: 11, color: 'var(--ink-4)', marginTop: 14, lineHeight: 1.55 }}>
              A contest score is the sum across all data sets, so each one is worth solving well.
            </p>
          </div>
        </Panel>
      </div>

      <Panel title="run" style={{ minHeight: 0 }}>
        <div style={{ overflowY: 'auto', height: '100%' }}>
          <Stat label="final score" wide accent="ca">
            <Num value={result.score} />
          </Stat>
          {mine && (
            <button onClick={() => setShowRank(meta.id)} style={{
              width: '100%', margin: '4px 0 10px', padding: '9px 0', fontSize: 12.5,
              border: '1px solid var(--ca)', background: 'var(--ca-dim)', color: 'var(--ink-0)',
            }}>show our group's rank ★</button>
          )}
          {result.trace && <TraceReport trace={result.trace} />}
          <Stat label="submission lines" note={`${int(result.replication.totalCopies)} video placements`}>
            {int(lines.length)}
          </Stat>
          <Stat label={mine ? 'replay time' : 'solve time'}
            note={mine ? 'rebuilding the run from your files' : meta.cached ? 'from the prewarmed run' : 'this session, live'}>
            {meta.solveSeconds != null ? `${meta.solveSeconds} s` : '—'}
          </Stat>
          <Stat label="parse time">{meta.parseSeconds != null ? `${meta.parseSeconds} s` : '—'}</Stat>
          <Stat label="analysis time" note="routing every request to its source">
            {meta.analyseSeconds != null ? `${meta.analyseSeconds} s` : '—'}
          </Stat>
          <Stat label="events replayed" note="round scans and placements">
            {int(meta.eventCount)}
          </Stat>
          <Stat label="requests accounted for">{compact(result.totalRequests)}</Stat>

          <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
            <p style={{ fontSize: 11.5, color: 'var(--ink-3)', lineHeight: 1.6, margin: 0 }}>
              Press <span className="mono" style={{ color: 'var(--ink-1)' }}>E</span> to open free
              explore and dig into any cache, endpoint or video — useful when someone asks.
            </p>
          </div>
        </div>
      </Panel>
    </div>
  )
}

function TraceReport({ trace }: { trace: NonNullable<RunResult['trace']> }) {
  if (!trace.provided) {
    return (
      <Stat label="trace" note="upload a .trace to replay your algorithm's own order">none · .out replayed</Stat>
    )
  }
  const problems = trace.problems ?? []
  return (
    <div style={{ padding: '10px 0', borderTop: '1px solid var(--line)' }}>
      <Label>trace · {int(trace.steps)} steps</Label>
      <Check ok={!!trace.consistent} label={trace.consistent ? 'ends exactly at your .out' : 'does not match your .out'}
        detail={trace.consistent ? 'every cache agrees' : `${trace.differenceCount} caches differ; the .out is what is scored`} />
      <Check ok={problems.length === 0} label={problems.length ? `${problems.length} step problem${problems.length > 1 ? 's' : ''}` : 'every step was legal'}
        detail={problems.length ? '' : 'no overflow, no double add, no phantom remove'} />
      {problems.slice(0, 6).map((p, i) => (
        <div key={i} className="mono" style={{ fontSize: 10, color: 'var(--alert-bright)', paddingLeft: 21, lineHeight: 1.6 }}>
          line {p.line}: {p.detail}
        </div>
      ))}
    </div>
  )
}

function Check({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <div style={{ display: 'flex', gap: 9, padding: '5px 0', alignItems: 'flex-start' }}>
      <span className="mono" style={{
        color: ok ? 'var(--ca-bright)' : 'var(--alert-bright)', fontSize: 12, lineHeight: 1.3,
      }}>{ok ? '✓' : '✗'}</span>
      <span>
        <span style={{ fontSize: 12, color: 'var(--ink-1)', display: 'block' }}>{label}</span>
        <span className="mono" style={{ fontSize: 10, color: 'var(--ink-4)' }}>{detail}</span>
      </span>
    </div>
  )
}
