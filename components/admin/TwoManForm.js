'use client'
// DONOVAN'S TWO-MAN, THE FORM (admin only; /admin/two-man). Pick the sport and the card window, pick two players from the night's
// scored board (real player ids, best score first), write a one-to-three line note, save. Open until the lock (an hour before the
// card's first game); after that the form shows what he entered and says it is closed. The server refuses a late save too.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { C, NUM_FONT } from '../../lib/theme'
import { STATUS_WORD } from '../../lib/callStatus'

const SPORTS = [['nhl', 'LAMP · NHL'], ['nfl', 'TUDDY · NFL'], ['mlb', 'MOONSHOT · MLB']]
const hm = (iso) => new Date(iso).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'America/Phoenix' })
const btn = (on) => ({ minHeight: 44, padding: '0 14px', borderRadius: 10, border: `1px solid ${on ? C.text : C.border2}`, background: on ? 'rgba(127,127,127,.18)' : 'transparent', color: C.text, fontWeight: 800, fontSize: 13, fontFamily: NUM_FONT, cursor: 'pointer' })

async function api(path, init) {
  const r = await fetch(path, { cache: 'no-store', ...init })
  const j = await r.json().catch(() => ({}))
  return r.ok ? { ok: true, ...j } : { ok: false, error: j.error || `HTTP ${r.status}` }
}

export default function TwoManForm() {
  const [sport, setSport] = useState('nhl')
  const [data, setData] = useState(null)
  const [date, setDate] = useState(null)
  const [board, setBoard] = useState(null)
  const [pick, setPick] = useState([])
  const [note, setNote] = useState('')
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  const loadWindows = useCallback(async (s) => {
    setBusy(true); setMsg(null); setBoard(null); setPick([]); setDate(null)
    const r = await api(`/api/admin/two-man?sport=${s}`)
    setData(r); setBusy(false)
    if (r.ok && r.windows?.length) setDate(r.windows.find((w) => w.open)?.card_date || r.windows[0].card_date)
  }, [])
  useEffect(() => { loadWindows(sport) }, [sport, loadWindows])

  const win = useMemo(() => data?.windows?.find((w) => w.card_date === date) || null, [data, date])
  useEffect(() => {
    if (!date || !win) return
    setPick(win.entry?.legs?.map((l) => l.player_id) || []); setNote(win.entry?.note || '')
    if (!win.open) { setBoard(null); return }
    let live = true
    setBusy(true)
    api(`/api/admin/two-man?sport=${sport}&date=${date}`).then((r) => { if (live) { setBoard(r); setBusy(false) } })
    return () => { live = false }
  }, [date, win, sport])

  const field = board?.field || []
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase()
    return t ? field.filter((p) => `${p.name} ${p.team} ${p.opp}`.toLowerCase().includes(t)) : field
  }, [field, q])
  const toggle = (id) => setPick((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= 2 ? [cur[1], id] : [...cur, id]))
  const lines = note.split(/\r?\n/).filter((l) => l.trim()).length

  const save = async () => {
    setBusy(true); setMsg(null)
    const r = await api('/api/admin/two-man', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sport, date, players: pick, note }) })
    setBusy(false)
    if (r.ok) { setMsg({ ok: true, text: 'Saved. You can change it until the lock.' }); loadWindows(sport).then(() => setDate(date)) } else setMsg({ ok: false, text: r.error })
  }
  const withdraw = async () => {
    setBusy(true); setMsg(null)
    const r = await api('/api/admin/two-man', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sport, date, action: 'withdraw' }) })
    setBusy(false)
    if (r.ok) { setMsg({ ok: true, text: 'Withdrawn.' }); setPick([]); setNote(''); loadWindows(sport).then(() => setDate(date)) } else setMsg({ ok: false, text: r.error })
  }

  return (
    <div style={{ color: C.text }}>
      <p style={{ margin: '0 0 12px', fontSize: 13, lineHeight: 1.5, color: C.text2 }}>
        Your two players and a note of one to three lines, before the lock. Nothing can be changed after it. After the lock it shows on the site as
        <b> Donovan&apos;s Two-Man</b>, in its own record, never the bot&apos;s.
      </p>
      <div role="tablist" aria-label="Sport" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {SPORTS.map(([k, label]) => <button key={k} type="button" role="tab" aria-selected={sport === k} onClick={() => setSport(k)} style={btn(sport === k)}>{label}</button>)}
      </div>
      {data && !data.ok && <p style={{ color: C.red, fontSize: 13 }}>{data.error}</p>}
      {data?.ok && !data.windows?.length && <p style={{ fontSize: 13, color: C.text3 }}>{data.error || 'No games on this slate.'}</p>}
      {data?.ok && data.windows?.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          {data.windows.map((w) => <button key={w.card_date} type="button" onClick={() => setDate(w.card_date)} style={btn(date === w.card_date)}>{w.label}{w.open ? '' : ' · closed'}</button>)}
        </div>
      )}
      {win && (
        <p style={{ margin: '0 0 10px', fontSize: 12, color: C.text3 }}>
          First game {hm(win.first_start)} (Phoenix). {win.open ? `The entry closes at ${hm(win.locks_at)}.` : `Closed at ${hm(win.locks_at)}.`}
        </p>
      )}
      {win && !win.open && (
        <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 12px', fontSize: 13, lineHeight: 1.5 }}>
          {win.entry
            ? <><b>{win.entry.legs.map((l) => l.name).join(' + ')}</b><div style={{ whiteSpace: 'pre-wrap', color: C.text2, marginTop: 4 }}>{win.entry.note}</div><div style={{ color: C.text3, marginTop: 4, fontSize: 12 }}>Locked. It shows on the site as Donovan&apos;s Two-Man.</div></>
            : 'No two-man was entered for this card, and the entry is closed.'}
        </div>
      )}
      {win?.open && (
        <>
          <label style={{ display: 'block', fontSize: 12, color: C.text3, margin: '4px 0' }} htmlFor="tm-q">Find a player</label>
          <input id="tm-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="name or team" autoComplete="off"
            style={{ width: '100%', boxSizing: 'border-box', minHeight: 44, padding: '0 12px', borderRadius: 10, border: `1px solid ${C.border2}`, background: 'transparent', color: C.text, fontSize: 16 }} />
          <div role="group" aria-label="Tonight's board" style={{ marginTop: 8, border: `1px solid ${C.border}`, borderRadius: 10, maxHeight: 360, overflowY: 'auto' }}>
            {busy && !field.length && <div style={{ padding: 12, fontSize: 13, color: C.text3 }}>Reading the board…</div>}
            {board && !board.ok && <div style={{ padding: 12, fontSize: 13, color: C.red }}>{board.error}</div>}
            {shown.map((p) => {
              const on = pick.includes(p.player_id)
              return (
                <button key={p.player_id} type="button" aria-pressed={on} onClick={() => toggle(p.player_id)}
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
          <label style={{ display: 'block', fontSize: 12, color: C.text3, margin: '12px 0 4px' }} htmlFor="tm-note">Your note (1 to 3 lines; no links, no hashtags)</label>
          <textarea id="tm-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={data?.note?.chars || 420}
            style={{ width: '100%', boxSizing: 'border-box', padding: 10, borderRadius: 10, border: `1px solid ${C.border2}`, background: 'transparent', color: C.text, fontSize: 16, lineHeight: 1.4, resize: 'vertical' }} />
          <div style={{ fontSize: 12, color: lines > (data?.note?.lines || 3) ? C.red : C.text3, margin: '2px 0 10px' }}>{lines} of {data?.note?.lines || 3} lines</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button type="button" disabled={busy || pick.length !== 2 || !lines || lines > (data?.note?.lines || 3)} onClick={save} style={{ ...btn(true), opacity: busy || pick.length !== 2 || !lines ? 0.5 : 1 }}>
              {win.entry ? 'Replace my Two-Man' : 'Save my Two-Man'}
            </button>
            {win.entry && <button type="button" disabled={busy} onClick={withdraw} style={btn(false)}>Withdraw</button>}
            <span style={{ fontSize: 12, color: C.text3 }}>{pick.length} of 2 picked</span>
          </div>
        </>
      )}
      {msg && <p role="status" style={{ marginTop: 10, fontSize: 13, color: msg.ok ? C.green : C.red }}>{msg.text}</p>}
    </div>
  )
}
