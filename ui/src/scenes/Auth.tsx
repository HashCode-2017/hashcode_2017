import { useEffect, useState, type FormEvent } from 'react'
import { motion } from 'framer-motion'
import { api, type GroupSeat } from '../lib/api'
import { useApp } from '../lib/store'
import { Label } from '../components/Kit'

/**
 * The door. Signing up means picking one of the class groups; a group holds
 * at most four people, and a full group is shown full rather than failing on
 * submit.
 */
export function Auth() {
  const signedIn = useApp((s) => s.signedIn)
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [group, setGroup] = useState<string | null>(null)
  const [groups, setGroups] = useState<GroupSeat[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (mode === 'register') api.groups().then(setGroups).catch(() => setGroups([]))
  }, [mode])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (mode === 'register' && !group) { setError('pick your group'); return }
    setBusy(true); setError(null)
    try {
      signedIn(mode === 'login'
        ? await api.login(username, password)
        : await api.register(username, email, password, group!, code))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      if (mode === 'register') api.groups().then(setGroups).catch(() => null)
    } finally { setBusy(false) }
  }

  return (
    <div className="layer" style={{ display: 'grid', placeItems: 'center', height: '100%', position: 'relative', zIndex: 3 }}>
      <motion.form
        onSubmit={submit}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 0.61, 0.36, 1] }}
        style={{
          width: 420, background: 'var(--panel)', border: '1px solid var(--line)',
          padding: '26px 28px 24px',
        }}
      >
        <div style={{ fontSize: 20, color: 'var(--ink-0)', fontWeight: 600, letterSpacing: '-0.02em' }}>
          Streaming Videos
        </div>
        <div className="lbl" style={{ marginTop: 4 }}>Hash Code 2017 · class console</div>

        <div style={{ display: 'flex', gap: 0, marginTop: 22, borderBottom: '1px solid var(--line)' }}>
          {(['login', 'register'] as const).map((m) => (
            <button key={m} type="button" onClick={() => { setMode(m); setError(null) }} style={{
              padding: '8px 14px 9px', fontSize: 12.5,
              color: mode === m ? 'var(--ink-0)' : 'var(--ink-3)',
              borderBottom: `2px solid ${mode === m ? 'var(--ca-bright)' : 'transparent'}`,
              marginBottom: -1,
            }}>{m === 'login' ? 'Sign in' : 'Create account'}</button>
          ))}
        </div>

        {mode === 'login' ? (
          <Field label="email or username" value={username} onChange={setUsername} autoFocus />
        ) : (
          <>
            <Field label="username · shown on the leaderboard" value={username} onChange={setUsername} autoFocus />
            <Field label="email · private, for signing in" value={email} onChange={setEmail} type="email" />
          </>
        )}
        <Field label="password" value={password} onChange={setPassword} type="password" />

        {mode === 'register' && (
          <div style={{ marginTop: 16 }}>
            <Label style={{ marginBottom: 7 }}>your group · 4 seats each</Label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 5 }}>
              {groups.filter((g) => g.capacity !== null).map((g) => {
                const full = g.members >= (g.capacity ?? Infinity)
                const on = group === g.group
                return (
                  <button key={g.group} type="button" disabled={full}
                    onClick={() => setGroup(g.group)}
                    title={full ? 'this group is full'
                      : `${g.members} of ${g.capacity} seats taken${g.admin ? ' · admin group, needs the admin code' : ''}`}
                    style={{
                      padding: '7px 0 6px', border: `1px solid ${on ? 'var(--ca-bright)' : 'var(--line)'}`,
                      background: on ? 'var(--panel-3)' : 'var(--panel-2)',
                      opacity: full ? 0.3 : 1, cursor: full ? 'not-allowed' : 'pointer',
                    }}>
                    <div className="mono" style={{ fontSize: 15, color: on ? 'var(--ca-bright)' : g.admin ? 'var(--dc-bright)' : 'var(--ink-1)' }}>
                      {g.group}{g.admin ? '★' : ''}
                    </div>
                    <div style={{ display: 'flex', gap: 2, justifyContent: 'center', marginTop: 5 }}>
                      {Array.from({ length: g.capacity ?? 0 }, (_, i) => (
                        <span key={i} style={{
                          width: 5, height: 5,
                          background: i < g.members ? 'var(--ca)' : 'var(--panel-3)',
                        }} />
                      ))}
                    </div>
                  </button>
                )
              })}
            </div>
            {groups.filter((g) => g.capacity === null).map((g) => {
              const on = group === g.group
              return (
                <button key={g.group} type="button" onClick={() => setGroup(g.group)} style={{
                  marginTop: 5, width: '100%', padding: '8px 0',
                  border: `1px solid ${on ? 'var(--ca-bright)' : 'var(--line)'}`,
                  background: on ? 'var(--panel-3)' : 'var(--panel-2)',
                  color: on ? 'var(--ca-bright)' : 'var(--dc-bright)', fontSize: 12.5,
                }}>{g.label ?? g.group} ★ · {g.members} joined · not ranked</button>
              )
            })}
            <div className="lbl" style={{ marginTop: 6, color: 'var(--ink-4)' }}>★ admin groups: joining needs the admin code</div>
            {group && groups.find((g) => g.group === group)?.admin && (
              <Field label="admin code" value={code} onChange={setCode} type="password" />
            )}
          </div>
        )}

        {error && (
          <div className="mono" style={{ marginTop: 14, fontSize: 11.5, color: 'var(--alert-bright)' }}>{error}</div>
        )}

        <button type="submit" disabled={busy} style={{
          marginTop: 20, width: '100%', padding: '10px 0',
          background: 'var(--ca-dim)', border: '1px solid var(--ca)', color: 'var(--ink-0)',
          fontSize: 13, fontWeight: 550, opacity: busy ? 0.5 : 1,
        }}>
          {mode === 'login' ? 'Sign in'
            : `Join${group ? ` ${groups.find((g) => g.group === group)?.label ?? `group ${group}`}` : ''}`}
        </button>
      </motion.form>
    </div>
  )
}

function Field({ label, value, onChange, type = 'text', autoFocus }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; autoFocus?: boolean
}) {
  return (
    <label style={{ display: 'block', marginTop: 16 }}>
      <Label style={{ marginBottom: 6 }}>{label}</Label>
      <input
        type={type} value={value} autoFocus={autoFocus}
        autoComplete={type === 'password' ? 'current-password' : type === 'email' ? 'email' : 'username'}
        onChange={(e) => onChange(e.target.value)}
        className="mono"
        style={{
          width: '100%', padding: '9px 10px', fontSize: 13,
          background: 'var(--bg)', border: '1px solid var(--line-2)', color: 'var(--ink-0)',
          outline: 'none',
        }}
      />
    </label>
  )
}
