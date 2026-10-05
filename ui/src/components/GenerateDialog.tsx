import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { api, type GenField, type GeneratorSchema } from '../lib/api'
import { useApp } from '../lib/store'
import { int } from '../lib/format'
import { Label } from './Kit'

/**
 * Make a new instance from one of the generator models. The form is built
 * from the server's schema (generated_instances/models.py), so a parameter
 * added there shows up here with its range and help text. The server checks
 * everything again and validates the produced file against the official
 * limits before saving it.
 */
export function GenerateDialog({ onClose }: { onClose: () => void }) {
  const loadInstances = useApp((s) => s.loadInstances)
  const select = useApp((s) => s.select)
  const [schema, setSchema] = useState<GeneratorSchema | null>(null)
  const [model, setModel] = useState('trap')
  const [values, setValues] = useState<Record<string, string>>({})
  const [name, setName] = useState('')
  const [seed, setSeed] = useState('')
  const [advanced, setAdvanced] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { api.generator().then(setSchema).catch((e) => setError(String(e))) }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  const m = schema?.models[model]
  // Reset the form to the model's defaults when switching model.
  useEffect(() => {
    if (!m) return
    setValues(Object.fromEntries(m.fields.map((f) => [f.key, String(f.default)])))
    setError(null)
  }, [m])

  const shown = useMemo(() => (m ? m.fields.filter((f) => advanced || !f.advanced) : []), [m, advanced])

  const submit = async () => {
    if (!m) return
    setBusy(true); setError(null)
    try {
      const params: Record<string, unknown> = {}
      for (const f of m.fields) {
        const raw = values[f.key]
        params[f.key] = f.type === 'choice' ? raw : Number(raw)
      }
      const row = await api.generate(model, params, seed.trim() === '' ? null : Number(seed), name)
      await loadInstances()
      onClose()
      await select(row.id)          // straight to Ingest of the new instance
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally { setBusy(false) }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={() => !busy && onClose()}
      style={{
        position: 'fixed', inset: 0, zIndex: 50, display: 'grid', placeItems: 'center',
        background: 'rgba(4, 5, 7, 0.82)', backdropFilter: 'blur(6px)',
      }}
    >
      <motion.div
        onClick={(e) => e.stopPropagation()}
        initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.35, ease: [0.22, 0.61, 0.36, 1] }}
        style={{
          width: 'min(860px, 94vw)', maxHeight: '90vh', overflowY: 'auto',
          background: 'var(--bg)', border: '1px solid var(--line-2)', padding: '22px 24px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
          <div style={{ fontSize: 19, fontWeight: 600, color: 'var(--ink-0)' }}>Generate a new instance</div>
          {schema && (
            <span className="lbl">≤ {int(schema.maxR)} request lines · {schema.perGroup} per group</span>
          )}
        </div>
        <p style={{ fontSize: 12.5, color: 'var(--ink-3)', margin: '6px 0 16px', lineHeight: 1.55 }}>
          Every file is checked against the official limits before it is saved. The instance is shared
          with the class as a practice data set: download it, run your algorithm, submit.
        </p>

        {!schema && !error && <div className="lbl">loading the models…</div>}

        {schema && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
              {Object.entries(schema.models).map(([key, mm]) => (
                <button key={key} onClick={() => setModel(key)} style={{
                  textAlign: 'left', padding: '9px 10px',
                  border: `1px solid ${model === key ? 'var(--ca-bright)' : 'var(--line-2)'}`,
                  background: model === key ? 'var(--panel-3)' : 'var(--panel)',
                }}>
                  <div className="mono" style={{ fontSize: 12.5, color: model === key ? 'var(--ca-bright)' : 'var(--ink-1)' }}>{key}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--ink-3)', marginTop: 3, lineHeight: 1.35 }}>
                    {mm.label.split('—')[1]?.trim() ?? mm.label}
                  </div>
                </button>
              ))}
            </div>
            {m && <p style={{ fontSize: 12, color: 'var(--ink-2)', margin: '12px 0 14px', lineHeight: 1.55 }}>{m.help}</p>}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
              <Text label="name (optional)" value={name} onChange={setName} placeholder={`${model} instance`} />
              <Text label="seed (optional: same seed = same file)" value={seed} onChange={setSeed} placeholder="random" mono />
              {shown.map((f) => (
                <Field key={f.key} f={f} value={values[f.key] ?? ''} onChange={(v) => setValues((s) => ({ ...s, [f.key]: v }))} />
              ))}
            </div>
            {m && m.fields.some((f) => f.advanced) && (
              <button className="lbl" onClick={() => setAdvanced((a) => !a)} style={{ marginTop: 12, color: 'var(--ca-bright)' }}>
                {advanced ? '− hide advanced parameters' : `+ ${m.fields.filter((f) => f.advanced).length} advanced parameters`}
              </button>
            )}
          </>
        )}

        {error && (
          <div className="mono" style={{
            marginTop: 14, fontSize: 12, color: 'var(--alert-bright)', border: '1px solid var(--alert)', padding: '8px 11px',
          }}>{error}</div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
          <button onClick={onClose} disabled={busy} style={{
            padding: '8px 16px', fontSize: 12.5, border: '1px solid var(--line-2)', color: 'var(--ink-1)',
          }}>cancel · esc</button>
          <button onClick={() => void submit()} disabled={!m || busy} style={{
            padding: '8px 18px', fontSize: 12.5, fontWeight: 550,
            border: '1px solid var(--ca)', background: 'var(--ca-dim)', color: 'var(--ink-0)', opacity: busy ? 0.5 : 1,
          }}>{busy ? 'generating…' : 'Generate & open →'}</button>
        </div>
      </motion.div>
    </motion.div>
  )
}

function Field({ f, value, onChange }: { f: GenField; value: string; onChange: (v: string) => void }) {
  const range = f.type === 'choice' ? '' : ` · ${f.min ?? ''}–${f.max ?? ''}`
  return (
    <label style={{ display: 'block' }} title={f.help || undefined}>
      <Label style={{ marginBottom: 5 }}>{f.label}{range}</Label>
      {f.type === 'choice' ? (
        <select value={value} onChange={(e) => onChange(e.target.value)} className="mono" style={input}>
          {f.choices!.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value)} className="mono" style={input}
          inputMode={f.type === 'int' ? 'numeric' : 'decimal'} />
      )}
      {f.help && <div style={{ fontSize: 10.5, color: 'var(--ink-4)', marginTop: 3, lineHeight: 1.4 }}>{f.help}</div>}
    </label>
  )
}

function Text({ label, value, onChange, placeholder, mono }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; mono?: boolean
}) {
  return (
    <label style={{ display: 'block' }}>
      <Label style={{ marginBottom: 5 }}>{label}</Label>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className={mono ? 'mono' : undefined} style={input} />
    </label>
  )
}

const input = {
  width: '100%', padding: '7px 9px', fontSize: 12.5, boxSizing: 'border-box' as const,
  background: 'var(--panel)', border: '1px solid var(--line-2)', color: 'var(--ink-0)', outline: 'none',
}
