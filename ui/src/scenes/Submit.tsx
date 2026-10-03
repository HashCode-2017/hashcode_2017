import { useEffect, useState, type DragEvent } from 'react'
import { motion } from 'framer-motion'
import { api, type MySubmission } from '../lib/api'
import { useApp } from '../lib/store'
import { bytes, int } from '../lib/format'
import { Chip, Label, Panel } from '../components/Kit'

interface Picked { name: string; text: string }

/**
 * Bring your own algorithm. Any language works: the console only needs the
 * `.out` it would submit, plus -- if you want the placement act to replay
 * *your* decisions -- a `.trace` of them in order.
 */
export function Submit() {
  const instances = useApp((s) => s.instances)
  const playSubmission = useApp((s) => s.playSubmission)
  const instance = useApp((s) => s.instanceId)
  const setAct = useApp((s) => s.setAct)
  const user = useApp((s) => s.user)
  const [out, setOut] = useState<Picked | null>(null)
  const [trace, setTrace] = useState<Picked | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mine, setMine] = useState<MySubmission[]>([])

  useEffect(() => { api.mySubmissions().then(setMine).catch(() => null) }, [])

  // A file named after a *different* data set is almost always the wrong file.
  const named = (p: Picked | null) => {
    if (!p) return null
    const stem = p.name.replace(/\.[^.]+$/, '')
    return instances.find((r) => r.id !== instance && (r.id === stem || stem.startsWith(r.id + '.'))) ?? null
  }
  const mismatch = named(out) ?? named(trace)

  const send = async () => {
    if (!out || !instance) return
    setBusy(true); setError(null)
    try {
      const meta = await api.submit(instance, out.text, trace?.text ?? null)
      await playSubmission(instance, meta.id)
      useApp.getState().setReveal(meta.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally { setBusy(false) }
  }

  const row = instances.find((r) => r.id === instance)

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr 380px', gap: 1,
      background: 'var(--line)', height: '100%', minHeight: 0,
    }}>
      <div style={{ background: 'var(--bg)', padding: '26px 30px', overflowY: 'auto' }}>
        <h1 style={{ fontSize: 25, fontWeight: 600, letterSpacing: '-0.025em', color: 'var(--ink-0)', margin: '0 0 6px' }}>
          Submit your solution
        </h1>
        <p style={{ color: 'var(--ink-2)', maxWidth: 640, margin: '0 0 22px', fontSize: 13.5 }}>
          Upload the <span className="mono">.out</span> your algorithm produced. It is scored with the
          official formula, ranked, and played back through every act of the story. Add a{' '}
          <span className="mono">.trace</span> to see <em>your</em> algorithm's decisions in order.
        </p>

        <Label style={{ marginBottom: 7 }}>data set</Label>
        {!instance || !row ? (
          <div style={{
            maxWidth: 760, border: '1px dashed var(--dc)', padding: '16px 18px', background: 'var(--panel)',
          }}>
            <div style={{ fontSize: 13.5, color: 'var(--ink-0)' }}>Choose a data set first.</div>
            <div style={{ fontSize: 12, color: 'var(--ink-3)', margin: '4px 0 12px' }}>
              Download its <span className="mono">.in</span>, run your algorithm on it, then come back
              here with the output.
            </div>
            <button onClick={() => setAct(0)} style={{
              padding: '7px 14px', fontSize: 12.5, border: '1px solid var(--dc)', color: 'var(--dc-bright)',
            }}>← pick a data set</button>
          </div>
        ) : (
          <div style={{
            maxWidth: 760, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
            border: '1px solid var(--line-2)', background: 'var(--panel)', padding: '11px 14px',
          }}>
            <span className="mono" style={{ fontSize: 15, color: 'var(--ink-0)' }}>{row.id}.in</span>
            <Chip tone={row.official ? 'ca' : 'idle'}>{row.official ? 'counts for the final ranking' : 'practice'}</Chip>
            <span className="lbl mono">{bytes(row.bytes)}</span>
            <span style={{ flex: 1 }} />
            <a href={api.downloadUrl(row.id)} download={`${row.id}.in`} className="lbl"
              style={{ color: 'var(--ca-bright)', textDecoration: 'none' }}>download .in ↓</a>
            <button onClick={() => setAct(0)} className="lbl" style={{ color: 'var(--ink-2)' }}>change</button>
          </div>
        )}

        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 18, maxWidth: 760,
          opacity: instance ? 1 : 0.35, pointerEvents: instance ? 'auto' : 'none',
        }}>
          <Drop label=".out — required" accept=".out,.txt" file={out} onFile={setOut} tone="ca" />
          <Drop label=".trace — optional" accept=".trace,.txt" file={trace} onFile={setTrace} tone="dc" />
        </div>

        {mismatch && (
          <div className="mono" style={{ marginTop: 14, maxWidth: 760, fontSize: 12, color: 'var(--dc-bright)' }}>
            heads up: that file is named after {mismatch.id}, but you are submitting to {instance}
          </div>
        )}

        {error && (
          <div className="mono" style={{
            marginTop: 14, maxWidth: 760, fontSize: 12, color: 'var(--alert-bright)',
            border: '1px solid var(--alert)', padding: '8px 11px',
          }}>{error}</div>
        )}

        <button onClick={() => void send()} disabled={!out || !instance || busy} style={{
          marginTop: 18, padding: '10px 22px', fontSize: 13, fontWeight: 550,
          background: out ? 'var(--ca-dim)' : 'var(--panel-2)',
          border: `1px solid ${out ? 'var(--ca)' : 'var(--line)'}`,
          color: out ? 'var(--ink-0)' : 'var(--ink-4)', opacity: busy ? 0.5 : 1,
        }}>
          {busy ? 'checking…' : instance ? `Score & play on ${instance}.in  →` : 'choose a data set first'}
        </button>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 30, maxWidth: 760 }}>
          <Format title=".out — the submission" lines={[
            ['3', 'number of cache servers described'],
            ['0 2', 'cache 0 holds video 2'],
            ['1 3 1', 'cache 1 holds videos 3 and 1'],
            ['2 0 1', 'cache 2 holds videos 0 and 1'],
          ]} />
          <Format title=".trace — your decisions, in order" lines={[
            ['# round 1', 'optional marker: a new step'],
            ['+ 1 3', 'put video 3 into cache 1'],
            ['+ 0 2', 'put video 2 into cache 0'],
            ['- 1 3', 'take video 3 back out'],
          ]} />
        </div>
        <p style={{ color: 'var(--ink-3)', maxWidth: 760, fontSize: 12, marginTop: 12, lineHeight: 1.6 }}>
          Write one trace line wherever your code adds or removes a video. The console computes the
          latency each move saved from the <span className="mono">.in</span>, checks every step
          against the cache capacity, and confirms the trace ends exactly where your{' '}
          <span className="mono">.out</span> does. The <span className="mono">.out</span> is always
          what gets scored.
        </p>
      </div>

      <Panel title={user?.group ? `group ${user.group} · shared submissions` : 'your submissions'} style={{ minHeight: 0 }} flush>
        <div style={{ overflowY: 'auto', height: '100%' }}>
          {mine.length === 0 && (
            <div className="lbl" style={{ padding: 16, color: 'var(--ink-4)' }}>nothing submitted yet</div>
          )}
          {mine.map((m, i) => (
            <motion.button key={m.id}
              initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }}
              transition={{ delay: Math.min(i, 12) * 0.03 }}
              onClick={() => void playSubmission(m.instance, m.run_id)}
              className="subrow"
              style={{
                display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, width: '100%',
                textAlign: 'left', padding: '10px 14px', borderBottom: '1px solid var(--line)',
              }}>
              <div>
                <div className="mono" style={{ fontSize: 12.5, color: 'var(--ink-1)' }}>{m.instance}</div>
                <div className="lbl" style={{ marginTop: 3 }}>
                  {m.username ? `${m.username} · ` : ''}{new Date(m.created * 1000).toLocaleString()} · {m.source === 'trace' ? 'with trace' : '.out only'}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="num" style={{ fontSize: 14, color: m.valid ? 'var(--ca-bright)' : 'var(--alert-bright)' }}>
                  {int(m.score)}
                </div>
                {!m.valid && <Chip tone="alert">invalid</Chip>}
              </div>
            </motion.button>
          ))}
        </div>
        <style>{`.subrow:hover { background: var(--panel-2); }`}</style>
      </Panel>
    </div>
  )
}

function Drop({ label, accept, file, onFile, tone }: {
  label: string; accept: string; file: Picked | null
  onFile: (p: Picked | null) => void; tone: 'ca' | 'dc'
}) {
  const [over, setOver] = useState(false)
  const read = (f: File | undefined) => {
    if (!f) return
    f.text().then((text) => onFile({ name: f.name, text }))
  }
  const onDrop = (e: DragEvent) => { e.preventDefault(); setOver(false); read(e.dataTransfer.files[0]) }
  const color = tone === 'ca' ? 'var(--ca-bright)' : 'var(--dc-bright)'
  return (
    <label
      onDragOver={(e) => { e.preventDefault(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      style={{
        display: 'block', padding: '18px 16px', cursor: 'pointer', minHeight: 96,
        border: `1px dashed ${over || file ? color : 'var(--line-2)'}`,
        background: over ? 'var(--panel-2)' : 'var(--panel)',
        transition: 'border-color 160ms var(--ease), background 160ms var(--ease)',
      }}>
      <input type="file" accept={accept} style={{ display: 'none' }}
        onChange={(e) => { read(e.target.files?.[0]); e.target.value = '' }} />
      <Label style={{ color: file ? color : undefined }}>{label}</Label>
      {file ? (
        <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span className="mono" style={{ fontSize: 13, color: 'var(--ink-0)' }}>{file.name}</span>
          <span className="lbl mono">
            {bytes(file.text.length)} ·{' '}
            <span onClick={(e) => { e.preventDefault(); onFile(null) }} style={{ color: 'var(--ink-2)' }}>remove</span>
          </span>
        </div>
      ) : (
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--ink-3)' }}>drop a file here or click to browse</div>
      )}
    </label>
  )
}

function Format({ title, lines }: { title: string; lines: [string, string][] }) {
  return (
    <div style={{ border: '1px solid var(--line)', background: 'var(--panel)', padding: '10px 12px' }}>
      <Label style={{ marginBottom: 8 }}>{title}</Label>
      {lines.map(([code, note]) => (
        <div key={code} className="mono" style={{ display: 'flex', gap: 12, fontSize: 11.5, lineHeight: 1.8 }}>
          <span style={{ color: 'var(--ink-0)', minWidth: 70 }}>{code}</span>
          <span style={{ color: 'var(--ink-3)' }}>{note}</span>
        </div>
      ))}
    </div>
  )
}
