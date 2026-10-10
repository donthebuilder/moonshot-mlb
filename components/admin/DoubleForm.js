'use client'
// DONOVAN'S DOUBLE, THE FORM (admin only; a tab of /admin/two-man). Optional, daily: two players from TWO DIFFERENT sports, a one-to-three line note,
// entered before the EARLIER of the two sports' locks. Same freeze and no-edit-after-lock rules as his Two-Man (the server and the database refuse a
// late save). After the lock it shows on the site with his note, in its own record. He is not held to the bot's plus-money window: it is his pick.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { C, NUM_FONT } from '../../lib/theme'
import { STATUS_WORD } from '../../lib/callStatus'

const LABEL = { nhl: 'LAMP · NHL', nfl: 'TUDDY · NFL', mlb: 'MOONSHOT · MLB' }
const hm = (iso) => new Date(iso).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'America/Phoenix' })
const etToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
const btn = (on) => ({ minHeight: 44, padding: '0 14px', borderRadius: 10, border: `1px solid ${on ? C.text : C.border2}`, background: on ? 'rgba(127,127,127,.18)' : 'transparent', color: C.text, fontWeight: 800, fontSize: 13, fontFamily: NUM_FONT, cursor: 'pointer' })

async function api(path, init) {
  const r = await fetch(path, { cache: 'no-store', ...init })
  const j = await r.json().catch(() => ({}))
  return r.ok ? { ok: true, ...j } : { ok: false, error: j.error || `HTTP ${r.status}` }
}

export default function DoubleForm() {
  const [date, setDate] = useState(etToday())
  const [data, setData] = useState(null)
  const [tab, setTab] = useState('nhl')
  const [pick, setPick] = useState([])          // [{ sport, player_id, name }]
  const [note, setNote] = useState('')
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  const load = useCallback(async (d) => {
    setBusy(true); setMsg(null)
    const r = await api(`/api/admin/two-man?product=double&date=${d}`)
    setData(r); setBusy(false)
    if (r.ok) {
      setPick((r.entry?.legs || []).map((l) => ({ sport: l.sport, player_id: l.player_id, name: l.name })))
      setNote(r.entry?.note || '')
      setTab(r.sports.find((s) => s.field?.length)?.sport || 'nhl')
    }
  }, [])
  useEffect(() => { load(date) }, [date, load])

  const open = Boolean(data?.ok && data.earliest_lock && Date.now() < Date.parse(data.earliest_lock) && !data.entry?.result)
  const closed = data?.ok && !open
  const field = useMemo(() => {
    const f = data?.sports?.find((s) => s.sport === tab)?.field || []
    const t = q.trim().toLowerCase()
    return t ? f.filter((p) => `${p.name} ${p.team} ${p.opp}`.toLowerCase().includes(t)) : f
  }, [data, tab, q])
  const isOn = (p) => pick.some((x) => x.sport === p.sport && x.player_id === p.player_id)
  // one player per sport: picking a second player of a sport replaces the first
  const toggle = (p) => setPick((cur) => (isOn(p) ? cur.filter((x) => !(x.sport === p.sport && x.player_id === p.player_id)) : [...cur.filter((x) => x.sport !== p.sport), { sport: p.sport, player_id: p.player_id, name: p.name }].slice(-2)))
  const lines = note.split(/\r?\n/).filter((l) => l.trim()).length
  const ready = pick.length === 2 && lines >= 1 && lines <= (data?.note?.lines || 3)

  const save = async () => {
    setBusy(true); setMsg(null)
    const r = await api('/api/admin/two-man', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ product: 'double', date, picks: pick.map((p) => ({ sport: p.sport, player_id: p.player_id })), note }) })
    setBusy(false)
    if (r.ok) { setMsg({ ok: true, text: 'Saved. You can change it until the earlier lock.' }); load(date) } else setMsg({ ok: false, text: r.error })
  }
  const withdraw = async () => {
    setBusy(true); setMsg(null)
    const r = await api('/api/admin/two-man', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ product: 'double', date, action: 'withdraw' }) })
    setBusy(false)
    if (r.ok) { setMsg({ ok: true, text: 'Withdrawn.' }); load(date) } else setMsg({ ok: false, text: r.error })
  }

  return (
    <div style={{ color: C.text }}>
      <p style={{ margin: '0 0 12px', fontSize: 13, lineHeight: 1.5, color: C.text2 }}>
        Your own Double: one player from each of two different sports, a note of one to three lines, before the <b>earlier</b> of the two locks. Nothing can be
        changed after it. After the lock it shows on the site as <b>Donovan&apos;s Double</b> with your note, in its own record, never the bot&apos;s.
      </p>
      <label style={{ display: 'block', fontSize: 12, color: C.text3, margin: '4px 0' }} htmlFor="dbl-date">Game date</label>
      <input id="dbl-date" type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)}
        style={{ minHeight: 44, padding: '0 12px', borderRadius: 10, border: `1px solid ${C.border2}`, background: 'transparent', color: C.text, fontSize: 16, marginBottom: 10 }} />
      {data && !data.ok && <p style={{ color: C.red, fontSize: 13 }}>{data.error}</p>}
      {data?.ok && (
        <>
          <p style={{ margin: '0 0 10px', fontSize: 12, color: C.text3 }}>
            {data.sports.map((s) => (s.locks_at ? `${s.sport.toUpperCase()} locks ${hm(s.locks_at)}` : `${s.sport.toUpperCase()}: ${s.error || 'no games'}`)).join(' · ')} (Phoenix).
            {data.earliest_lock ? (open ? ` The entry closes at ${hm(data.earliest_lock)}.` : ` Closed at ${hm(data.earliest_lock)}.`) : ''}
          </p>
          {closed && (
            <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 12px', fontSize: 13, lineHeight: 1.5 }}>
              {data.entry
                ? <><b>{data.entry.legs.map((l) => l.name).join(' + ')}</b><div style={{ whiteSpace: 'pre-wrap', color: C.text2, marginTop: 4 }}>{data.entry.note}</div><div style={{ color: C.text3, marginTop: 4, fontSize: 12 }}>Locked. It shows on the site as Donovan&apos;s Double.</div></>
                : 'No Double was entered for this day, and the entry is closed.'}
            </div>
          )}
          {open && (
            <>
              <div role="tablist" aria-label="Sport" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                {data.sports.map((s) => <button key={s.sport} type="button" role="tab" aria-selected={tab === s.sport} disabled={!s.field?.length} onClick={() => setTab(s.sport)} style={{ ...btn(tab === s.sport), opacity: s.field?.length ? 1 : 0.4 }}>{LABEL[s.sport]}{pick.some((p) => p.sport === s.sport) ? ' ✓' : ''}</button>)}
              </div>
              <label style={{ display: 'block', fontSize: 12, color: C.text3, margin: '4px 0' }} htmlFor="dbl-q">Find a player</label>
              <input id="dbl-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="name or team" autoComplete="off"
                style={{ width: '100%', boxSizing: 'border-box', minHeight: 44, padding: '0 12px', borderRadius: 10, border: `1px solid ${C.border2}`, background: 'transparent', color: C.text, fontSize: 16 }} />
              <div role="group" aria-label="Board" style={{ marginTop: 8, border: `1px solid ${C.border}`, borderRadius: 10, maxHeight: 320, overflowY: 'auto' }}>
                {busy && !field.length && <div style={{ padding: 12, fontSize: 13, color: C.text3 }}>Reading the board…</div>}
                {field.map((p) => {
                  const on = isOn(p)
                  return (
                    <button key={`${p.sport}-${p.player_id}`} type="button" aria-pressed={on} onClick={() => toggle(p)}
                      style={{ display: 'grid', gridTemplateColumns: '28px minmax(0,1fr) auto', alignItems: 'center', gap: 8, width: '100%', minHeight: 48, padding: '4px 10px', border: 0, borderBottom: `1px solid ${C.border}`, background: on ? 'rgba(127,127,127,.2)' : 'transparent', color: C.text, textAlign: 'left', cursor: 'pointer' }}>
                      <span aria-hidden="true" style={{ fontFamily: NUM_FONT, fontWeight: 900 }}>{on ? '✓' : ''}</span>
                      <span style={{ display: 'grid', lineHeight: 1.2, minWidth: 0 }}>
                        <b style={{ fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</b>
                        <span style={{ fontSize: 11, color: C.text3 }}>{p.team} vs {p.opp} · {hm(p.start_at)}{p.status ? ` · ${STATUS_WORD[p.status] || ''}` : ''}</span>
                      </span>
                      <span style={{ fontFamily: NUM_FONT, fontWeight: 900, fontSize: 14 }}>{Math.round(p.score)}</span>
                    </button>
                  )
                })}
              </div>
              <p style={{ margin: '8px 0 0', fontSize: 12, color: C.text3 }}>Picked: {pick.length ? pick.map((p) => `${p.name} (${p.sport.toUpperCase()})`).join(' + ') : 'nobody yet'} · {pick.length} of 2</p>
              <label style={{ display: 'block', fontSize: 12, color: C.text3, margin: '12px 0 4px' }} htmlFor="dbl-note">Your note (1 to 3 lines; no links, no hashtags)</label>
              <textarea id="dbl-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={data.note?.chars || 420}
                style={{ width: '100%', boxSizing: 'border-box', padding: 10, borderRadius: 10, border: `1px solid ${C.border2}`, background: 'transparent', color: C.text, fontSize: 16, lineHeight: 1.4, resize: 'vertical' }} />
              <div style={{ fontSize: 12, color: lines > (data.note?.lines || 3) ? C.red : C.text3, margin: '2px 0 10px' }}>{lines} of {data.note?.lines || 3} lines</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <button type="button" disabled={busy || !ready} onClick={save} style={{ ...btn(true), opacity: busy || !ready ? 0.5 : 1 }}>{data.entry ? 'Replace my Double' : 'Save my Double'}</button>
                {data.entry && <button type="button" disabled={busy} onClick={withdraw} style={btn(false)}>Withdraw</button>}
              </div>
            </>
          )}
        </>
      )}
      {msg && <p role="status" style={{ marginTop: 10, fontSize: 13, color: msg.ok ? C.green : C.red }}>{msg.text}</p>}
    </div>
  )
}
