import { useEffect, useState } from 'react'
import { api, type GroupSeat, type Person } from '../lib/api'
import { useApp } from '../lib/store'
import { bytes, int } from '../lib/format'
import { Chip, Label, Panel } from '../components/Kit'

/**
 * Two decisions only the admin makes: which data sets add up to the final
 * ranking, and who sits in which group. The server enforces both (admin-only
 * endpoints, four seats per group), so this page is just their control panel.
 */
export function Admin() {
  const user = useApp((s) => s.user)
  if (!user?.isAdmin) {
    return <div className="lbl" style={{ padding: 30, color: 'var(--ink-3)' }}>admins only</div>
  }
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'minmax(380px, 1fr) minmax(420px, 1.2fr)', gap: 1,
      background: 'var(--line)', height: '100%', minHeight: 0,
    }}>
      <RankedSets />
      <People />
    </div>
  )
}

function RankedSets() {
  const instances = useApp((s) => s.instances)
  const loadInstances = useApp((s) => s.loadInstances)
  const [chosen, setChosen] = useState<Set<string> | null>(null)
  const [saved, setSaved] = useState<string[]>([])
  const [defaults, setDefaults] = useState<string[]>([])
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    api.ranked().then((r) => { setChosen(new Set(r.instances)); setSaved(r.instances); setDefaults(r.default) })
      .catch((e) => setMsg({ ok: false, text: String(e) }))
  }, [])

  if (!chosen) return <Panel title="final ranking"><span className="lbl">loading…</span></Panel>

  const dirty = chosen.size !== saved.length || saved.some((i) => !chosen.has(i))
  const toggle = (id: string) => {
    const next = new Set(chosen)
    if (next.has(id)) next.delete(id); else next.add(id)
    setChosen(next); setMsg(null)
  }
  const save = async () => {
    try {
      // Keep the catalogue's order, so the leaderboard columns read the same way.
      const order = instances.map((r) => r.id).filter((id) => chosen.has(id))
      const r = await api.setRanked(order)
      setSaved(r.instances); setMsg({ ok: true, text: 'saved — every leaderboard now uses this set' })
      void loadInstances()
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) }) }
  }

  return (
    <Panel title="data sets in the final ranking" style={{ minHeight: 0 }} flush>
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <p style={{ fontSize: 12.5, color: 'var(--ink-2)', margin: 0, padding: '12px 14px', lineHeight: 1.55 }}>
          A player's overall score is the sum of their best score on each ticked data set. Every
          data set keeps its own board either way.
        </p>
        <div style={{ overflowY: 'auto', flex: 1, minHeight: 0, borderTop: '1px solid var(--line)' }}>
          {instances.map((r) => {
            const on = chosen.has(r.id)
            return (
              <label key={r.id} className="adm-row" style={{
                display: 'grid', gridTemplateColumns: '22px 1fr auto auto', gap: 10, alignItems: 'center',
                padding: '8px 14px', borderBottom: '1px solid var(--line)', cursor: 'pointer',
                background: on ? 'var(--panel-2)' : 'transparent',
              }}>
                <input type="checkbox" checked={on} onChange={() => toggle(r.id)}
                  style={{ accentColor: 'var(--dc-bright)', width: 14, height: 14 }} />
                <span>
                  <span className="mono" style={{ fontSize: 12.5, color: on ? 'var(--ink-0)' : 'var(--ink-2)' }}>{r.id}</span>
                  <span style={{ display: 'block', fontSize: 10.5, color: 'var(--ink-4)' }}>{r.blurb}</span>
                </span>
                <span className="lbl mono">{int(r.V)}V · {int(r.C)}C</span>
                <span className="lbl mono" style={{ minWidth: 52, textAlign: 'right' }}>{bytes(r.bytes)}</span>
              </label>
            )
          })}
        </div>
        <div style={{
          padding: '11px 14px', borderTop: '1px solid var(--line)',
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        }}>
          <button onClick={() => void save()} disabled={!dirty || chosen.size === 0} style={{
            padding: '7px 16px', fontSize: 12.5, fontWeight: 550,
            border: `1px solid ${dirty ? 'var(--dc)' : 'var(--line)'}`,
            background: dirty ? 'var(--dc-dim)' : 'transparent',
            color: dirty ? 'var(--ink-0)' : 'var(--ink-4)',
          }}>save · {chosen.size} data set{chosen.size === 1 ? '' : 's'}</button>
          <button className="lbl" onClick={() => { setChosen(new Set(instances.map((r) => r.id))); setMsg(null) }}
            disabled={chosen.size === instances.length}
            style={{ color: chosen.size === instances.length ? 'var(--ink-4)' : 'var(--ca-bright)' }}>select all</button>
          <button className="lbl" onClick={() => { setChosen(new Set()); setMsg(null) }}
            disabled={chosen.size === 0}
            style={{ color: chosen.size === 0 ? 'var(--ink-4)' : 'var(--ink-2)' }}>clear</button>
          <button className="lbl" onClick={() => { setChosen(new Set(defaults)); setMsg(null) }}
            style={{ color: 'var(--ink-2)' }}>reset to the 4 official</button>
          {msg && (
            <span className="mono" style={{ fontSize: 11, color: msg.ok ? 'var(--ca-bright)' : 'var(--alert-bright)' }}>
              {msg.text}
            </span>
          )}
        </div>
        <style>{`.adm-row:hover { background: var(--panel-3) !important; }`}</style>
      </div>
    </Panel>
  )
}

function People() {
  const [people, setPeople] = useState<Person[] | null>(null)
  const [seats, setSeats] = useState<GroupSeat[]>([])
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [filter, setFilter] = useState('')

  const load = () => Promise.all([api.people(), api.groups()])
    .then(([p, g]) => { setPeople(p); setSeats(g) })
    .catch((e) => setMsg({ ok: false, text: String(e) }))
  useEffect(() => { void load() }, [])

  const move = async (p: Person, group: string) => {
    if (group === p.group) return
    try {
      await api.setGroup(p.id, group)
      setMsg({ ok: true, text: `${p.username} moved to group ${group}` })
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) })
    }
    void load()
  }

  const shown = (people ?? []).filter((p) => p.username.toLowerCase().includes(filter.toLowerCase()))

  return (
    <Panel title={`people · ${people?.length ?? 0}`} style={{ minHeight: 0 }} flush>
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--line)' }}>
          <Label style={{ marginBottom: 7 }}>seats per group</Label>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {seats.map((g) => (
              <span key={g.group} className="mono" style={{
                fontSize: 11, padding: '3px 7px', border: '1px solid var(--line-2)',
                color: g.capacity !== null && g.members >= g.capacity ? 'var(--dc-bright)' : 'var(--ink-1)',
              }}>{g.group}{g.admin ? '★' : ''} {g.members}{g.capacity !== null ? `/${g.capacity}` : ''}</span>
            ))}
          </div>
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="filter by name…"
            className="mono" style={{
              marginTop: 12, width: '100%', padding: '7px 9px', fontSize: 12,
              background: 'var(--bg)', border: '1px solid var(--line-2)', color: 'var(--ink-0)', outline: 'none',
            }} />
          {msg && (
            <div className="mono" style={{ marginTop: 9, fontSize: 11.5, color: msg.ok ? 'var(--ca-bright)' : 'var(--alert-bright)' }}>
              {msg.text}
            </div>
          )}
        </div>
        <div className="lbl" style={{
          display: 'grid', gridTemplateColumns: '1fr 90px 130px', gap: 10,
          padding: '7px 14px', borderBottom: '1px solid var(--line)',
        }}>
          <span>player</span><span style={{ textAlign: 'right' }}>submissions</span><span>group</span>
        </div>
        <div style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
          {people && shown.length === 0 && (
            <div className="lbl" style={{ padding: 14, color: 'var(--ink-4)' }}>nobody yet</div>
          )}
          {shown.map((p) => (
            <div key={p.id} style={{
              display: 'grid', gridTemplateColumns: '1fr 90px 130px', gap: 10, alignItems: 'center',
              padding: '7px 14px', borderBottom: '1px solid var(--line)',
            }}>
              <span style={{ fontSize: 12.5, color: 'var(--ink-1)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {p.username}{p.isAdmin && <span className="lbl" style={{ color: 'var(--dc-bright)', marginLeft: 6 }}>admin</span>}
              </span>
              <span className="num" style={{ textAlign: 'right', fontSize: 12, color: 'var(--ink-2)' }}>{p.submissions}</span>
              <select value={p.group ?? ''} onChange={(e) => void move(p, e.target.value)} className="mono" style={{
                padding: '4px 6px', fontSize: 12, background: 'var(--panel-2)',
                border: '1px solid var(--line-2)', color: 'var(--ink-0)',
              }}>
                {seats.map((g) => {
                  const full = g.capacity !== null && g.members >= g.capacity && g.group !== p.group
                  return (
                    <option key={g.group} value={g.group} disabled={full}>
                      {g.capacity === null ? `${g.label ?? g.group} ★` : `${g.group}${g.admin ? '★' : ''} · ${g.members}/${g.capacity}`}{full ? ' full' : ''}
                    </option>
                  )
                })}
              </select>
            </div>
          ))}
        </div>
        <div style={{ padding: '9px 14px', borderTop: '1px solid var(--line)' }}>
          <Chip tone="idle">★ = admin group · moving a player moves their scores to the new group's board</Chip>
        </div>
      </div>
    </Panel>
  )
}
