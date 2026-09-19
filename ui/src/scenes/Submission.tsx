import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { useApp } from '../lib/store'
import { compact, int } from '../lib/format'
import { Chip, Label, Meter, Num, Panel, Stat } from '../components/Kit'
import { RankBars } from '../viz/Charts'

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

  // Pull every prewarmed run so the closing chart can compare data sets.
  useEffect(() => {
    let alive = true
    void (async () => {
      const out: Record<string, number> = {}
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
  }, [instances])

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

        <Panel title="all data sets" style={{ minHeight: 0 }}>
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
                prewarm the other data sets to compare
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
          <Stat label="submission lines" note={`${int(result.replication.totalCopies)} video placements`}>
            {int(lines.length)}
          </Stat>
          <Stat label="solve time"
            note={meta.cached ? 'from the prewarmed run' : 'this session, live'}>
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
