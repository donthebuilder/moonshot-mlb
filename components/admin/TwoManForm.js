'use client'
// DONOVAN'S TWO-MAN, THE FORM (admin only; /admin/two-man). ALWAYS OPEN (2026-10-12, "i want to be able to submit mine whenever"): pick the sport and a slate
// (tonight, the next two days, the football week), pick two players, write a one-to-three line note, save. Before the card's lock and before any leg's game
// has started it is the verified entry (before the card's lock as always; after the lock it is still verified and LOCKS AT SAVE). Once a game of his has
// started it is saved as LATE: clearly marked, kept out of the record, never posted, never public (the server decides; this form tells him first and asks him to confirm).
// SEE WHO YOU ARE LOOKING AT: every candidate shows his face, name, club, opponent and the game's start (ET, with the day), the market and the stored
// price, whether the leg and the pair clear the Card's floors (information only; his lane is never blocked), OUR BOARD WORD and the model score; and the
// two picked men are drawn as the dual card that would post (a preview that stores nothing).
// THE N-MAN TAB (2026-10-12, "do up a 6 man with a card too"): the same picker, 2 to 6 players (no one twice; two players here are the 2-Man in the N-man card's layout), the COMBINED price (each leg's best stored price multiplied; a leg with no
// price says "no price" and the line says "not all priced"), an optional stake in units (0.25 to 1, 0.5 by default), the same note and card name, a live preview of the N-man card.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { C, NUM_FONT } from '../../lib/theme'
import { SPORT_ACCENT } from '../../lib/sportAccent'
import { pairFloor, comboOf } from '../../lib/card/picker'
import { fmtAmerican, adminNMan, NMAN_MIN, NMAN_MAX, NMAN_UNITS } from '../../lib/card/core'
import PlayerFace from '../PlayerFace'
import TeamMark from '../TeamMark'
import CallStatusBadge from '../CallStatusBadge'
import DoubleForm from './DoubleForm'

const SPORTS = [['nhl', 'LAMP · NHL'], ['nfl', 'TUDDY · NFL'], ['mlb', 'MOONSHOT · MLB']]
const etStamp = (iso) => (iso ? `${new Date(iso).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }).replace(',', '')} ET` : '')
const btn = (on) => ({ minHeight: 44, padding: '0 14px', borderRadius: 10, border: `1px solid ${on ? C.text : C.border2}`, background: on ? 'rgba(127,127,127,.18)' : 'transparent', color: C.text, fontWeight: 800, fontSize: 13, fontFamily: NUM_FONT, cursor: 'pointer' })
const LATE_TAG = { display: 'inline-block', fontFamily: NUM_FONT, fontSize: 11, fontWeight: 900, letterSpacing: '.08em', color: C.yellow, border: `1px solid ${C.yellow}`, borderRadius: 4, padding: '1px 6px', lineHeight: 1.3, whiteSpace: 'nowrap' }
const FLOOR_WORD = (f) => (f.code === 'ok' ? `clears +${f.floor}` : f.code === 'no_price' ? 'no price' : `under +${f.floor}`)

async function api(path, init) {
  const r = await fetch(path, { cache: 'no-store', ...init })
  const j = await r.json().catch(() => ({}))
  return r.ok ? { ok: true, ...j } : { ok: false, error: j.error || `HTTP ${r.status}`, ...j }
}

/** The face: the site's PlayerFace, over a circle with his initials so a missing photo leaves a tidy blank, never a broken-image box. */
function Face({ sport, f, name, team, size = 38 }) {
  const initials = String(name || '').split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase()
  if (!f) return <span aria-hidden="true" style={{ width: size, height: size, borderRadius: '50%', background: C.bg3, flex: 'none' }} />
  if (sport === 'nfl') return <PlayerFace sport="nfl" espnId={f.espnId} team={team} name={name} size={size} />
  return (
    <span aria-hidden="true" style={{ position: 'relative', display: 'inline-grid', placeItems: 'center', width: size, height: size, borderRadius: '50%', background: C.bg3, color: C.text3, font: `900 ${Math.round(size * 0.32)}px/1 ${NUM_FONT}`, flex: 'none', overflow: 'hidden' }}>
      {initials}
      <span style={{ position: 'absolute', inset: 0 }}><PlayerFace sport={f.sport} id={f.id} photo={f.photo} name={name} team={team} size={size} variant="table" style={{ background: 'transparent' }} /></span>
    </span>
  )
}

function PriceLine({ p, compact = false }) {
  const parts = []
  if (p.market) parts.push(p.market)
  if (p.price) parts.push(`${fmtAmerican(p.price.median)}${p.price.books ? ` · ${p.price.books} books` : ''}`)
  return (
    <span style={{ fontSize: compact ? 12 : 12, color: C.text2, lineHeight: 1.3 }}>
      {parts.join(' ')}{p.price ? '' : (parts.length ? ' · ' : '') + 'no price'}
      <span style={{ marginLeft: 6, color: p.floor.code === 'ok' ? C.text : C.text3, fontWeight: 700 }}>{FLOOR_WORD(p.floor)}</span>
    </span>
  )
}

const POST_STATE = { posted: 'posted', dropped: 'claimed, no names cleared', 'in-card-post': "in the day's card post", 'over-cap': 'saved, not posted (over 3)', 'not-yet': 'not posted yet' }
const POST_NAME = { two_man: 'Two-Man', n_man: 'N-Man', straight_1: 'Straight', straight_2: 'Straight 2', straight_3: 'Straight 3' }
/** POSTS TODAY (2026-10-12, up to 3 a day and sport): how many of his entries for this slate have gone out, and which. */
function PostsToday({ posts }) {
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: '8px 12px', fontSize: 12, lineHeight: 1.5, marginBottom: 10, color: C.text2 }}>
      <b style={{ color: C.text, fontFamily: NUM_FONT }}>Posts today: {posts.used} of {posts.max}</b>
      {posts.entries.map((e) => <span key={e.key} style={{ display: 'block' }}>{POST_NAME[e.key] || e.key}: {POST_STATE[e.state] || e.state}</span>)}
      <span style={{ display: 'block', color: C.text3 }}>3 posts max a day for each sport, the oldest entry first. An entry past that is saved and shown on the site, and is not posted.</span>
    </div>
  )
}

export default function TwoManForm() {
  const [kind, setKind] = useState('two_man')       // 'two_man' | 'double'
  const [sport, setSport] = useState('nhl')
  const [data, setData] = useState(null)
  const [date, setDate] = useState(null)
  const [board, setBoard] = useState(null)
  const [pick, setPick] = useState([])
  const [note, setNote] = useState('')
  const [cardName, setCardName] = useState('')
  const [units, setUnits] = useState(String(NMAN_UNITS.def))
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [askLate, setAskLate] = useState(false)
  const [askLock, setAskLock] = useState(false)
  const [pv, setPv] = useState({ state: 'idle', url: null, late: false, err: null })
  const dateRef = useRef(null)
  dateRef.current = date

  const loadWindows = useCallback(async (s, keep = null, keepMsg = false) => {
    setBusy(true); if (!keepMsg) setMsg(null); setBoard(null); setPick([]); setAskLate(false); setAskLock(false)
    const r = await api(`/api/admin/two-man?sport=${s}`)
    setData(r); setBusy(false)
    if (r.ok && r.windows?.length) setDate(keep && r.windows.some((w) => w.card_date === keep) ? keep : (r.windows.find((w) => w.mode === 'on_time') || r.windows[0]).card_date)
    else setDate(null)
  }, [])
  useEffect(() => { loadWindows(sport) }, [sport, loadWindows])

  const win = useMemo(() => data?.windows?.find((w) => w.card_date === date) || null, [data, date])
  // his own entry for this slate: the verified one while it is on time, else his late one
  const isN = kind === 'n_man'
  const MINP = isN ? NMAN_MIN : 2
  const MAXP = isN ? NMAN_MAX : 2
  const entryOf = (w) => (isN ? w?.n_entry : w?.entry)
  const lateOf = (w) => (isN ? w?.n_late_entry : w?.late_entry)
  const own = win ? (win.mode === 'on_time' ? entryOf(win) : lateOf(win)) : null
  const lockedOnTime = win && win.mode !== 'on_time' && entryOf(win) ? entryOf(win) : null
  const nowMs = data?.now ? Date.parse(data.now) : 0
  const frozenLate = Boolean(own?.late && own.edit_until && Date.parse(own.edit_until) <= nowMs)

  useEffect(() => {
    if (!date || !win) return
    setPick(own?.legs?.map((l) => String(l.player_id)) || []); setNote(own?.note || ''); setCardName(own?.card_name || ''); setUnits(String(own?.stake ?? NMAN_UNITS.def)); setAskLate(false); setAskLock(false)
    let live = true
    setBusy(true); setBoard(null)
    api(`/api/admin/two-man?sport=${sport}&date=${date}`).then((r) => { if (live) { setBoard(r); setBusy(false) } })
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, sport, kind, win?.entry?.legs?.length, win?.late_entry?.legs?.length, win?.n_entry?.legs?.length, win?.n_late_entry?.legs?.length])

  const field = board?.field || []
  const byId = useMemo(() => new Map(field.map((p) => [p.player_id, p])), [field])
  const chosen = pick.map((id) => byId.get(id)).filter(Boolean)
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase()
    return t ? field.filter((p) => `${p.name} ${p.team} ${p.opp}`.toLowerCase().includes(t)) : field
  }, [field, q])
  // a Two-Man swaps the older of two picks for a new one (as it always did); an N-man never drops a pick behind his back: at six, the next tap says so
  const toggle = (id) => {
    if (isN && !pick.includes(id) && pick.length >= MAXP) { setMsg({ ok: false, text: `${MAXP} is the most. Tap one of your picks to take it off first.` }); return }
    setMsg(null)
    setPick((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : !isN && cur.length >= 2 ? [cur[1], id] : [...cur, id]))
  }
  const lines = note.split(/\r?\n/).filter((l) => l.trim()).length
  const lateNow = Boolean(win && chosen.some((p) => p.started))
  const lockNow = Boolean(win && win.mode !== 'on_time' && !lateNow)
  const pair = !isN && chosen.length === 2 ? pairFloor(chosen[0], chosen[1]) : null
  const combo = isN && chosen.length ? comboOf(chosen.map((p) => p.price)) : null

  // THE LIVE PREVIEW: the dual card that would post, drawn by the server from this selection (stores nothing)
  useEffect(() => {
    if (!win || pick.length < MINP || pick.length > MAXP) { setPv((o) => { if (o.url) URL.revokeObjectURL(o.url); return { state: 'idle', url: null, late: false, err: null } }); return }
    const ctl = new AbortController()
    const t = setTimeout(async () => {
      setPv((o) => ({ ...o, state: 'loading', err: null }))
      try {
        const r = await fetch('/api/admin/two-man/preview', { method: 'POST', cache: 'no-store', signal: ctl.signal, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sport, date, players: pick, card_name: cardName, ...(isN ? { product: 'n_man', units } : {}) }) })
        if (!r.ok) { const j = await r.json().catch(() => ({})); setPv((o) => ({ ...o, state: 'err', err: j.error || `HTTP ${r.status}` })); return }
        const late = r.headers.get('x-entry') === 'late'
        const url = URL.createObjectURL(await r.blob())
        setPv((o) => { if (o.url) URL.revokeObjectURL(o.url); return { state: 'ok', url, late, err: null } })
      } catch (e) { if (e?.name !== 'AbortError') setPv((o) => ({ ...o, state: 'err', err: 'The card could not be drawn.' })) }
    }, 400)
    return () => { clearTimeout(t); ctl.abort() }
  }, [pick, sport, date, win, cardName, isN, units])
  useEffect(() => () => { setPv((o) => { if (o.url) URL.revokeObjectURL(o.url); return o }) }, [])

  const save = async () => {
    setBusy(true); setMsg(null)
    const r = await api('/api/admin/two-man', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sport, date, players: pick, note, card_name: cardName, confirm_late: lateNow || askLate, confirm_lock: lockNow || askLock, ...(isN ? { product: 'n_man', units } : {}) }) })
    setBusy(false)
    if (r.ok) {
      setAskLate(false); setAskLock(false)
      setMsg({ ok: true, text: r.lock_now ? 'Saved. VERIFIED and locked now: it counts in your record and cannot be changed.' : r.late ? `Saved as LATE. It is not in the record and is never posted. You can change it for ${data?.late?.edit_min || 15} minutes.` : 'Saved. You can change it until the lock.' })
      loadWindows(sport, date, true)
    } else if (r.needs_confirm) { if (r.lock_now) setAskLock(true); else setAskLate(true); setMsg({ ok: false, text: r.error }) } else setMsg({ ok: false, text: r.error })
  }
  const withdraw = async (lane) => {
    setBusy(true); setMsg(null)
    const r = await api('/api/admin/two-man', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sport, date, action: 'withdraw', ...(isN ? { product: 'n_man' } : {}), ...(lane === 'late' ? { lane: 'late' } : {}) }) })
    setBusy(false)
    if (r.ok) { setMsg({ ok: true, text: 'Withdrawn.' }); setPick([]); setNote(''); loadWindows(sport, date) } else setMsg({ ok: false, text: r.error })
  }

  const tabs = (
    <div role="tablist" aria-label="Product" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
      <button type="button" role="tab" aria-selected={kind === 'two_man'} onClick={() => { setKind('two_man'); setMsg(null) }} style={btn(kind === 'two_man')}>Two-Man</button>
      <button type="button" role="tab" aria-selected={kind === 'n_man'} onClick={() => { setKind('n_man'); setMsg(null) }} style={btn(kind === 'n_man')}>2 to 6-Man</button>
      <button type="button" role="tab" aria-selected={kind === 'double'} onClick={() => setKind('double')} style={btn(kind === 'double')}>Double</button>
    </div>
  )
  if (kind === 'double') return <div style={{ color: C.text }}>{tabs}<DoubleForm /></div>

  const accent = SPORT_ACCENT[sport]
  const lateRows = (isN ? data?.late?.n_rows : data?.late?.rows) || []
  const lateRec = (isN ? data?.late?.n_record : data?.late?.record) || { graded: 0, hits: 0 }
  const unitsOk = !isN || (Number.isFinite(Number(units)) && Number(units) >= NMAN_UNITS.min && Number(units) <= NMAN_UNITS.max)
  const canSave = !busy && pick.length >= MINP && pick.length <= MAXP && unitsOk && lines > 0 && lines <= (data?.note?.lines || 3) && !frozenLate
  return (
    <div style={{ color: C.text }}>
      {tabs}
      <p style={{ margin: '0 0 12px', fontSize: 13, lineHeight: 1.5, color: C.text2 }}>
        {isN
          ? <>Two to six players, <b>every one must land</b>, and a note of one to three lines. This is always open. Saved before a game starts it is <b>{adminNMan(Math.max(pick.length, NMAN_MIN))}</b> (verified, in its own record; after the card&apos;s lock it locks the moment you save).
            {' '}<span style={{ color: C.text3 }}>A plain Two-Man (the Two-Man tab) stays the primary 2-leg entry; two players here are the same bet saved under the N-man card layout, counted in the N-man record, not the Two-Man&apos;s.</span></>
          : <>Your two players and a note of one to three lines. This is always open. Saved before a game starts it is <b>Admin&apos;s Two-Man</b> (verified, in its own record; after the card&apos;s lock it locks the moment you save).</>}
        {' '}Saved after a game has started it is <span style={LATE_TAG}>LATE</span>: kept out of the record, never posted.
      </p>
      <div role="tablist" aria-label="Sport" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {SPORTS.map(([k, label]) => <button key={k} type="button" role="tab" aria-selected={sport === k} onClick={() => setSport(k)} style={btn(sport === k)}>{label}</button>)}
      </div>
      {data && !data.ok && <p style={{ color: C.red, fontSize: 13 }}>{data.error}</p>}
      {data?.ok && !data.windows?.length && <p style={{ fontSize: 13, color: C.text3 }}>{data.error || 'No games to come on this slate.'}</p>}
      {data?.ok && data.windows?.length > 0 && (
        <div role="tablist" aria-label="Slate" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          {data.windows.map((w) => (
            <button key={w.card_date} type="button" role="tab" aria-selected={date === w.card_date} onClick={() => { setDate(w.card_date); setMsg(null) }} style={{ ...btn(date === w.card_date), display: 'grid', justifyItems: 'start', alignContent: 'center', lineHeight: 1.15, padding: '4px 12px' }}>
              <span>{w.label}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: w.mode === 'live' ? C.yellow : C.text3 }}>{w.mode === 'live' ? 'games under way' : w.mode === 'lock_now' ? 'locks when saved' : 'on time'}{entryOf(w) ? ' · entered' : lateOf(w) ? ' · late entry' : ''}</span>
            </button>
          ))}
        </div>
      )}
      {win && (
        <p style={{ margin: '0 0 10px', fontSize: 12, lineHeight: 1.45, color: C.text3 }}>
          First game {win.first_when}. {win.mode === 'on_time' ? `Verified: the card locks ${etStamp(win.locks_at)}, an hour before it.` : win.mode === 'lock_now' ? `Verified: saved before the first game starts (locks now). The card's own lock was ${etStamp(win.locks_at)}.` : <>Games are under way. A pick whose game has not started is verified and locks when saved; a pick whose game has started is <span style={LATE_TAG}>LATE</span>.</>}
        </p>
      )}
      {win?.posts && <PostsToday posts={win.posts} />}
      {lockedOnTime && (
        <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 12px', fontSize: 13, lineHeight: 1.5, marginBottom: 10 }}>
          <b>{lockedOnTime.legs.map((l) => l.name).join(' + ')}</b>
          <div style={{ whiteSpace: 'pre-wrap', color: C.text2, marginTop: 4 }}>{lockedOnTime.note}</div>
          <div style={{ color: C.text3, marginTop: 4, fontSize: 12 }}>Locked{lockedOnTime.result ? `, graded ${lockedOnTime.result}` : ''}. This is the verified entry. A late entry never replaces it.</div>
        </div>
      )}
      {own?.late && (
        <div style={{ border: `1px solid ${C.yellow}`, borderRadius: 10, padding: '10px 12px', fontSize: 13, lineHeight: 1.5, marginBottom: 10 }}>
          <span style={LATE_TAG}>LATE</span> <b>{own.legs.map((l) => l.name).join(' + ')}</b>{own.result ? <span style={{ color: C.text3 }}> · graded {own.result}</span> : null}
          <div style={{ color: C.text3, marginTop: 4, fontSize: 12 }}>
            Saved {etStamp(own.saved_at)}. Not in the record, never posted. {frozenLate ? 'It can no longer be changed.' : `You can change or withdraw it until ${etStamp(own.edit_until)}.`}
          </div>
        </div>
      )}
      {win && (
        <>
          <label style={{ display: 'block', fontSize: 12, color: C.text3, margin: '4px 0' }} htmlFor="tm-q">Find a player</label>
          <input id="tm-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="name or team" autoComplete="off"
            style={{ width: '100%', boxSizing: 'border-box', minHeight: 44, padding: '0 12px', borderRadius: 10, border: `1px solid ${C.border2}`, background: 'transparent', color: C.text, fontSize: 16 }} />
          {board?.ok && board.prices_ok === false && <p style={{ margin: '6px 0 0', fontSize: 12, color: C.text3 }}>The stored prices could not be read just now, so every man shows no price.</p>}
          <div role="group" aria-label="The board" style={{ marginTop: 8, border: `1px solid ${C.border}`, borderRadius: 10, maxHeight: 460, overflowY: 'auto', overscrollBehavior: 'contain' }}>
            {busy && !field.length && <div style={{ padding: 12, fontSize: 13, color: C.text3 }}>Reading the board…</div>}
            {board && !board.ok && <div style={{ padding: 12, fontSize: 13, color: C.text2 }}>{board.error}</div>}
            {shown.map((p) => {
              const on = pick.includes(p.player_id)
              return (
                <button key={p.player_id} type="button" aria-pressed={on} onClick={() => toggle(p.player_id)}
                  style={{ display: 'grid', gridTemplateColumns: '40px minmax(0,1fr) auto', alignItems: 'center', gap: 10, width: '100%', minHeight: 68, padding: '6px 10px', border: 0, borderBottom: `1px solid ${C.border}`, borderLeft: `3px solid ${on ? accent : 'transparent'}`, background: on ? 'rgba(127,127,127,.2)' : 'transparent', color: C.text, textAlign: 'left', cursor: 'pointer', boxSizing: 'border-box' }}>
                  <Face sport={sport} f={p.face} name={p.name} team={p.team} />
                  <span style={{ display: 'grid', gap: 2, minWidth: 0 }}>
                    <span style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
                      <b style={{ fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</b>
                      {p.pos && <span style={{ fontSize: 11, color: C.text3, flex: 'none' }}>{p.pos}</span>}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 12, color: C.text2 }}>
                      <TeamMark sport={sport} abbr={p.team} variant="logo" px={16} />
                      <span>{p.team} vs {p.opp}</span>
                      <span style={{ color: C.text3 }}>{p.when}</span>
                      {p.started && <span style={{ ...LATE_TAG, fontSize: 10 }}>STARTED</span>}
                    </span>
                    <PriceLine p={p} />
                  </span>
                  <span style={{ display: 'grid', justifyItems: 'end', gap: 4 }}>
                    <span style={{ fontFamily: NUM_FONT, fontWeight: 900, fontSize: 16 }}>{Math.round(p.score)}</span>
                    <CallStatusBadge status={p.status || 'off'} accent={accent} size={12} />
                  </span>
                </button>
              )
            })}
          </div>

          {chosen.length > 0 && (
            <div style={{ marginTop: 12, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 12px', display: 'grid', gap: 8 }}>
              <b style={{ fontSize: 13 }}>{isN ? `Your picks (${chosen.length} of ${MINP} to ${MAXP})` : 'Your pick'}</b>
              {chosen.map((p) => (
                <div key={p.player_id} style={{ display: 'grid', gridTemplateColumns: isN ? '40px minmax(0,1fr) 44px' : '40px minmax(0,1fr)', gap: 10, alignItems: 'center' }}>
                  <Face sport={sport} f={p.face} name={p.name} team={p.team} />
                  <span style={{ display: 'grid', gap: 2, minWidth: 0, fontSize: 12, color: C.text2 }}>
                    <b style={{ fontSize: 14, color: C.text }}>{p.name} <span style={{ fontWeight: 400, color: C.text3 }}>{p.team} vs {p.opp} · {p.when}</span></b>
                    <PriceLine p={p} />
                  </span>
                  {isN && <button type="button" aria-label={`Take ${p.name} off`} onClick={() => toggle(p.player_id)} style={{ minWidth: 44, minHeight: 44, borderRadius: 10, border: `1px solid ${C.border2}`, background: 'transparent', color: C.text, fontWeight: 800, fontSize: 18, cursor: 'pointer' }}>×</button>}
                </div>
              ))}
              {combo && (
                <div role="status" data-combined style={{ fontSize: 13, lineHeight: 1.45, color: C.text }}>
                  <b>Combined: {combo.all ? fmtAmerican(combo.best) : 'not all priced'}</b>
                  <span style={{ color: C.text2 }}>{combo.all ? ' (each leg\'s best stored price, multiplied; your book\'s parlay price will differ).' : ` (${combo.priced} of ${combo.n} legs have a stored price; the legs with no price are shown as no price).`}</span>
                  {' '}<span style={{ color: C.text3 }}>For your information only: your lane is never held to the floors.</span>
                </div>
              )}
              {pair && (
                <div style={{ fontSize: 12, lineHeight: 1.45, color: C.text2 }}>
                  {pair.code === 'no_price'
                    ? 'Together: a price is missing on one leg, so the combined price is not known.'
                    : `Together: ${fmtAmerican(pair.combined)} (the two stored prices multiplied), ${pair.code === 'ok' ? `clearing the +${pair.floor} Two-Man floor` : `under the +${pair.floor} Two-Man floor`}.`}
                  {' '}For your information only: your lane is never held to the floors.
                </div>
              )}
              {chosen.length >= MINP && chosen.length <= MAXP && (
                <div style={{ display: 'grid', justifyItems: 'center', gap: 6 }}>
                  <div style={{ fontSize: 12, color: C.text3 }}>The card that posts{pv.late || lateNow ? ' (this one is LATE and will not post)' : lockNow ? ' (verified, locks when saved)' : ' at the lock'}</div>
                  <div style={{ width: '100%', maxWidth: 360, aspectRatio: '4 / 5', borderRadius: 10, overflow: 'hidden', background: C.bg3, display: 'grid', placeItems: 'center' }}>
                    {pv.url && <img src={pv.url} alt={`${isN ? `The ${chosen.length}-man card` : 'The Two-Man card'}: ${chosen.map((p) => p.name).join(', ')}`} style={{ width: '100%', height: '100%', objectFit: 'contain', opacity: pv.state === 'loading' ? 0.5 : 1 }} />}
                    {!pv.url && pv.state !== 'err' && <span style={{ fontSize: 12, color: C.text3 }}>Drawing the card…</span>}
                    {pv.state === 'err' && <span style={{ fontSize: 12, color: C.text2, padding: 12, textAlign: 'center' }}>{pv.err}</span>}
                  </div>
                </div>
              )}
            </div>
          )}

          <label style={{ display: 'block', fontSize: 12, color: C.text3, margin: '12px 0 4px' }} htmlFor="tm-name">Card name (optional; blank = {isN ? adminNMan(Math.max(pick.length, NMAN_MIN)) : "ADMIN'S TWO-MAN"})</label>
          <input id="tm-name" value={cardName} onChange={(e) => setCardName(e.target.value.replace(/[@#]/g, ''))} maxLength={28} placeholder={isN ? adminNMan(Math.max(pick.length, NMAN_MIN)) : "Admin's Two-Man"} autoComplete="off"
            style={{ width: '100%', boxSizing: 'border-box', minHeight: 44, padding: '0 12px', borderRadius: 10, border: `1px solid ${C.border2}`, background: 'transparent', color: C.text, fontSize: 16 }} />
          <div style={{ fontSize: 12, color: C.text3, margin: '2px 0 0' }}>{cardName.length} of 28 · letters, numbers, spaces and basic punctuation; shows on the card, the Discord post and the X text</div>
          {isN && (
            <>
              <label style={{ display: 'block', fontSize: 12, color: C.text3, margin: '12px 0 4px' }} htmlFor="tm-units">Stake in units ({NMAN_UNITS.min} to {NMAN_UNITS.max}; {NMAN_UNITS.def} like the Two-Man)</label>
              <input id="tm-units" type="number" inputMode="decimal" min={NMAN_UNITS.min} max={NMAN_UNITS.max} step={NMAN_UNITS.step} value={units} onChange={(e) => setUnits(e.target.value)}
                style={{ width: 120, boxSizing: 'border-box', minHeight: 44, padding: '0 12px', borderRadius: 10, border: `1px solid ${unitsOk ? C.border2 : C.red}`, background: 'transparent', color: C.text, fontSize: 16 }} />
            </>
          )}
          <label style={{ display: 'block', fontSize: 12, color: C.text3, margin: '12px 0 4px' }} htmlFor="tm-note">Your note (1 to 3 lines; no links, no hashtags)</label>
          <textarea id="tm-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={data?.note?.chars || 420}
            style={{ width: '100%', boxSizing: 'border-box', padding: 10, borderRadius: 10, border: `1px solid ${C.border2}`, background: 'transparent', color: C.text, fontSize: 16, lineHeight: 1.4, resize: 'vertical' }} />
          <div style={{ fontSize: 12, color: lines > (data?.note?.lines || 3) ? C.red : C.text3, margin: '2px 0 10px' }}>{lines} of {data?.note?.lines || 3} lines</div>
          {lockNow && !askLate && (
            <p role="note" style={{ margin: '0 0 10px', fontSize: 12, lineHeight: 1.45, color: C.text2 }}>
              Verified: saved before the first game starts (locks now). It counts in your record and cannot be changed after you save. The post goes out only if this card&apos;s post has not already gone.
            </p>
          )}
          {!lateNow && !askLate && win.posts && !entryOf(win) && win.posts.entries.length >= win.posts.max && (
            <p role="note" style={{ margin: '0 0 10px', fontSize: 12, lineHeight: 1.45, color: C.yellow }}>
              3 posts max a day: this one will not post. It is still saved, counts in your record and shows on the site.
            </p>
          )}
          {(lateNow || askLate) && (
            <p role="note" style={{ margin: '0 0 10px', fontSize: 12, lineHeight: 1.45, color: C.text2 }}>
              <span style={LATE_TAG}>LATE</span> A game on this entry has already started. 
              It will be saved apart from the record: not counted, not posted to X, the free Discord or #members, not shown to anyone but you. It can be changed for {data?.late?.edit_min || 15} minutes.
            </p>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button type="button" disabled={!canSave} onClick={save} style={{ ...btn(true), opacity: canSave ? 1 : 0.5 }}>
              {lateNow || askLate ? 'Save as LATE' : lockNow || askLock ? 'Save and lock now' : own && !own.late ? (isN ? `Replace my ${pick.length}-Man` : 'Replace my Two-Man') : (isN ? `Save my ${Math.max(pick.length, NMAN_MIN)}-Man` : 'Save my Two-Man')}
            </button>
            {win.mode === 'on_time' && entryOf(win) && <button type="button" disabled={busy} onClick={() => withdraw('on_time')} style={btn(false)}>Withdraw</button>}
            {own?.late && !frozenLate && <button type="button" disabled={busy} onClick={() => withdraw('late')} style={btn(false)}>Withdraw late entry</button>}
            <span style={{ fontSize: 12, color: C.text3 }}>{pick.length} of {isN ? `${MINP} to ${MAXP}` : 2} picked</span>
          </div>
        </>
      )}
      {msg && <p role="status" style={{ marginTop: 10, fontSize: 13, color: msg.ok ? C.green : C.red }}>{msg.text}</p>}

      {data?.ok && lateRows.length > 0 && (
        <section aria-label="Late entries" style={{ marginTop: 22 }}>
          <h2 style={{ margin: '0 0 6px', fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}><span style={LATE_TAG}>LATE</span> {isN ? 'N-man ' : ''}entries, for your reference</h2>
          <p style={{ margin: '0 0 8px', fontSize: 12, lineHeight: 1.45, color: C.text3 }}>
            Not part of the record, the ledger or any post. {lateRec.graded ? `${lateRec.hits} of ${lateRec.graded} landed ${isN ? 'every leg' : 'both legs'}.` : 'None graded yet.'}
          </p>
          <div style={{ overflowX: 'auto', border: `1px solid ${C.border}`, borderRadius: 10 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead><tr style={{ textAlign: 'left', color: C.text3 }}><th style={{ padding: '8px 10px' }}>Date</th><th style={{ padding: '8px 6px' }}>Sport</th><th style={{ padding: '8px 6px' }}>Pair</th><th style={{ padding: '8px 10px' }}>Result</th></tr></thead>
              <tbody>
                {lateRows.map((r) => (
                  <tr key={`${r.sport}-${r.card_date}`} style={{ borderTop: `1px solid ${C.border}` }}>
                    <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>{String(r.card_date).slice(5, 10)}</td>
                    <td style={{ padding: '8px 6px', textTransform: 'uppercase' }}>{r.sport}</td>
                    <td style={{ padding: '8px 6px' }}>{r.legs.map((l) => l.name).join(' + ')}</td>
                    <td style={{ padding: '8px 10px', whiteSpace: 'nowrap', fontFamily: NUM_FONT, fontWeight: 800 }}>{r.result || 'pending'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
