'use client'
import { useEffect, useMemo, useState } from 'react'
import { C, NUM_FONT } from '../../lib/theme'
import { n, clean, nameOf, teamOf, oppOf, hrScore, playerId } from '../../lib/player'
import { PanelTitle, Empty } from '../ui'

// 🏆 MOONSHOT DERBY (2026-08-08, "yuhhh. yeah do it. i love the idea").
//
// Draft five hitters under a 300-point cap (every hitter costs his HR
// score), lock at first pitch, and the night scores itself in REAL FEET —
// every homer your guys hit counts its actual statcast distance. The bot
// drafts its own five under the same cap at the same deadline. Feet vs
// feet, human vs machine.
//
// The game is secretly a tutorial: five max-score studs don't fit under
// the cap, so winning means finding value — which is what every board on
// this site exists to surface.
//
// HONEST LIMITS, stated in the UI too: records live on THIS DEVICE
// (localStorage — no accounts, no server); the lock is an honor system a
// determined person could clear (it still refuses edits after first pitch,
// which is the part that matters for playing it straight); and statcast
// distance can lag a homer by a few minutes.

const CAP = 300
const SQUAD = 5

// The same calibrated band → HR-rate table ProjectedOutput uses, verbatim.
// Measured rates from the graded archive; the sim is only as good as these
// and says so.
const HR_BANDS = { 0: 12.8, 40: 15.0, 55: 15.3, 70: 18.7, 85: 16.1 }
const pHR = (score) => {
  let rate = HR_BANDS[0]
  Object.keys(HR_BANDS).map(Number).sort((a, b) => a - b)
    .forEach((f) => { if (score >= f) rate = HR_BANDS[f] })
  return rate / 100
}

const costOf = (p) => Math.max(20, Math.round(hrScore(p)))
const distOf = (p) => n(p?.recent_avg_hr_distance, 0) || 400

const keyFor = (d) => `derby:${d}`
const REC_KEY = 'derby_record'

function loadJSON(k) { try { return JSON.parse(localStorage.getItem(k) || 'null') } catch { return null } }
function saveJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)) } catch {} }

export default function Derby({ players = [], results, slateDate = '', onPlayerClick }) {
  const date = slateDate || new Date().toLocaleDateString('en-CA')
  const [picks, setPicks] = useState([])       // player ids
  const [lockedAt, setLockedAt] = useState(null)
  const [query, setQuery] = useState('')
  const [sim, setSim] = useState(null)
  const [record, setRecord] = useState(null)
  const [savedDay, setSavedDay] = useState(false)

  // restore this date's entry + the season record
  useEffect(() => {
    const st = loadJSON(keyFor(date))
    setPicks(st?.picks || [])
    setLockedAt(st?.lockedAt || null)
    setSavedDay(!!st?.saved)
    setRecord(loadJSON(REC_KEY) || { w: 0, l: 0, t: 0, ft: 0, botFt: 0 })
    setSim(null)
  }, [date])

  const byId = useMemo(() => new Map(players.map((p) => [String(p?.player_id ?? p?.id), p])), [players])
  const roster = picks.map((id) => byId.get(String(id))).filter(Boolean)
  const spent = roster.reduce((a, p) => a + costOf(p), 0)

  // first pitch = the slate's earliest game time; the lock is automatic
  const firstPitch = useMemo(() => {
    const ts = players.map((p) => new Date(p?.game_time || 0).getTime()).filter((t) => t > 0)
    return ts.length ? Math.min(...ts) : null
  }, [players])
  const pastFirstPitch = firstPitch != null && Date.now() > firstPitch
  const locked = !!lockedAt || (pastFirstPitch && roster.length > 0)

  // persist every draft change with a timestamp (the receipt)
  const persist = (nextPicks, nextLockedAt = lockedAt, saved = savedDay) => {
    saveJSON(keyFor(date), { picks: nextPicks, lockedAt: nextLockedAt, saved, ts: Date.now() })
  }

  const toggle = (p) => {
    if (locked) return
    const id = String(p?.player_id ?? p?.id)
    let next
    if (picks.includes(id)) next = picks.filter((x) => x !== id)
    else {
      if (picks.length >= SQUAD) return
      if (spent + costOf(p) > CAP) return
      next = [...picks, id]
    }
    setPicks(next); setSim(null); persist(next)
  }

  const lockNow = () => {
    if (!roster.length || locked) return
    const t = Date.now()
    setLockedAt(t); persist(picks, t)
  }

  // ── the bot's squad: greedy by hr_score under the same cap ──
  const botSquad = useMemo(() => {
    const sorted = [...players].sort((a, b) => hrScore(b) - hrScore(a))
    const out = []; let cap = CAP
    for (const p of sorted) {
      const c = costOf(p)
      if (out.length >= SQUAD) break
      if (c <= cap) { out.push(p); cap -= c }
    }
    return out
  }, [players])

  // ── real feet from tonight's graded homers ──
  const feetFor = (squad) => {
    const entries = results?.hr_capture_report?.all_homer_entries || []
    let ft = 0; const bombs = []
    squad.forEach((p) => {
      const pid = String(p?.player_id ?? p?.id)
      entries.filter((h) => String(h?.player_id) === pid).forEach((h) => {
        const ds = Array.isArray(h?.distances_ft) && h.distances_ft.length
          ? h.distances_ft.map(Number).filter(Boolean)
          : (Number(h?.longest_ft) ? [Number(h.longest_ft)] : [])
        ds.forEach((d) => { ft += d; bombs.push({ name: nameOf(p), d }) })
        if (!ds.length && Number(h?.hr) > 0) {
          // homered but no tracked distance yet — hold a 400 placeholder,
          // marked so nobody mistakes it for statcast
          ft += 400 * Number(h.hr)
          bombs.push({ name: nameOf(p), d: 400, est: true })
        }
      })
    })
    return { ft, bombs }
  }
  const mine = feetFor(roster)
  const bots = feetFor(botSquad)
  const slateFinal = results?.live_mode === false && (results?.hr_capture_report?.all_homer_entries || []).length > 0

  const saveResult = () => {
    if (!slateFinal || savedDay || !locked || !roster.length) return
    const rec = { ...(record || { w: 0, l: 0, t: 0, ft: 0, botFt: 0 }) }
    if (mine.ft > bots.ft) rec.w += 1
    else if (mine.ft < bots.ft) rec.l += 1
    else rec.t += 1
    rec.ft += mine.ft; rec.botFt += bots.ft
    saveJSON(REC_KEY, rec); setRecord(rec); setSavedDay(true); persist(picks, lockedAt, true)
  }

  // ── the simulator: 10k nights through the calibrated rates ──
  const runSim = () => {
    if (!roster.length) return
    const N = 10000
    const my = roster.map((p) => ({ p: pHR(hrScore(p)), d: distOf(p) }))
    const bo = botSquad.map((p) => ({ p: pHR(hrScore(p)), d: distOf(p) }))
    let mySum = 0; let wins = 0; let ties = 0
    for (let i = 0; i < N; i++) {
      let a = 0; let b = 0
      my.forEach((x) => { if (Math.random() < x.p) a += x.d })
      bo.forEach((x) => { if (Math.random() < x.p) b += x.d })
      mySum += a
      if (a > b) wins++
      else if (a === b) ties++
    }
    setSim({ avg: mySum / N, win: (100 * wins) / N, tie: (100 * ties) / N })
  }

  const q = query.toLowerCase().trim()
  const pool = useMemo(() => (
    [...players]
      .filter((p) => !q || `${nameOf(p)} ${teamOf(p)}`.toLowerCase().includes(q))
      .sort((a, b) => hrScore(b) - hrScore(a))
      .slice(0, 30)
  ), [players, q])

  if (!players.length) return <Empty text="No slate loaded yet — the derby drafts from tonight's board." />

  const Chip = ({ p, inRoster }) => {
    const c = costOf(p)
    const affordable = inRoster || (picks.length < SQUAD && spent + c <= CAP)
    return (
      <button
        onClick={() => toggle(p)}
        disabled={locked || (!inRoster && !affordable)}
        title={locked ? 'Locked — first pitch has passed' : inRoster ? 'Tap to drop' : affordable ? 'Tap to draft' : 'Does not fit the cap / squad'}
        style={{
          display: 'flex', gap: 7, alignItems: 'baseline', cursor: locked ? 'default' : 'pointer',
          border: `1px solid ${inRoster ? C.orange : affordable ? C.border2 : C.border}`,
          background: inRoster ? 'rgba(249,115,22,.12)' : 'transparent',
          opacity: !inRoster && !affordable ? 0.35 : 1,
          borderRadius: 8, padding: '5px 11px',
        }}
      >
        <span style={{ fontSize: 11.5, fontWeight: 700, color: inRoster ? C.orange : C.text }}>{nameOf(p)}</span>
        <span style={{ fontSize: 9, color: C.text3, fontFamily: NUM_FONT }}>{teamOf(p)} v {oppOf(p)}</span>
        <span style={{ fontSize: 10.5, fontWeight: 900, fontFamily: NUM_FONT, color: inRoster ? C.orange : C.text2 }}>{c}</span>
      </button>
    )
  }

  return (
    <div>
      <PanelTitle
        title="🏆 Derby"
        sub={`Draft ${SQUAD} under a ${CAP} cap · locks at first pitch · real homers score real feet · you vs the bot`}
        right={record && (record.w + record.l + record.t) > 0 ? (
          <span style={{ fontSize: 11, fontFamily: NUM_FONT, color: C.text2 }}>
            season: <b style={{ color: record.w >= record.l ? '#4ade80' : '#f87171' }}>{record.w}–{record.l}{record.t ? `–${record.t}` : ''}</b>
            {' '}· {Math.round(record.ft).toLocaleString()} ft vs {Math.round(record.botFt).toLocaleString()}
          </span>
        ) : null}
      />

      {/* scoreboard — you vs the bot, live feet */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {[{ label: 'YOU', squad: roster, r: mine, col: C.orange },
          { label: 'THE BOT', squad: botSquad, r: bots, col: '#22d3ee' }].map(({ label, squad, r, col }) => (
          <div key={label} style={{
            flex: '1 1 260px', minWidth: 0, background: C.bg2,
            border: `1px solid ${mine.ft !== bots.ft && ((label === 'YOU') === (mine.ft > bots.ft)) ? col : C.border}`,
            borderTop: `2px solid ${col}`, borderRadius: 11, padding: '9px 13px',
          }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: '.09em', color: col, fontFamily: NUM_FONT }}>{label}</span>
              <span style={{ fontSize: 22, fontWeight: 900, fontFamily: NUM_FONT, color: r.ft ? col : C.text3 }}>
                {Math.round(r.ft).toLocaleString()} <span style={{ fontSize: 10 }}>ft</span>
              </span>
              {label === 'YOU' && !locked && roster.length > 0 && (
                <span style={{ fontSize: 9, color: C.text3, fontFamily: NUM_FONT }}>drafting… {spent}/{CAP} spent</span>
              )}
              {label === 'YOU' && locked && <span style={{ fontSize: 9, color: '#4ade80', fontFamily: NUM_FONT }}>🔒 locked</span>}
            </div>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 6 }}>
              {squad.map((p) => (
                <span key={playerId(p)} onClick={() => onPlayerClick?.(p)} style={{
                  fontSize: 9.5, fontWeight: 700, color: C.text2, cursor: 'pointer',
                  border: `1px solid ${C.border}`, borderRadius: 999, padding: '2px 8px', fontFamily: NUM_FONT,
                }}>
                  {String(nameOf(p)).split(' ').slice(-1)[0]} {costOf(p)}
                </span>
              ))}
              {label === 'YOU' && !squad.length && <span style={{ fontSize: 10, color: C.text3 }}>no squad yet — draft below</span>}
            </div>
            {r.bombs.length > 0 && (
              <div style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT, marginTop: 5 }}>
                {r.bombs.map((b, i) => `${b.name.split(' ').slice(-1)[0]} ${Math.round(b.d)}${b.est ? '~' : ''}ft`).join(' · ')}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* controls */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
        {!locked && roster.length === SQUAD && (
          <button onClick={lockNow} style={{
            padding: '6px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 900,
            border: '1px solid rgba(74,222,128,.6)', background: 'rgba(74,222,128,.12)', color: '#4ade80',
          }}>🔒 LOCK MY FIVE</button>
        )}
        {roster.length > 0 && (
          <button onClick={runSim} style={{
            padding: '6px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 11, fontWeight: 800,
            border: `1px solid ${C.border2}`, background: 'transparent', color: C.text2,
          }}>🎲 simulate my night ×10,000</button>
        )}
        {sim && (
          <span style={{ fontSize: 11, fontFamily: NUM_FONT, color: C.text2 }}>
            your squad averages <b style={{ color: C.orange }}>{Math.round(sim.avg)} ft</b> and beats the bot in{' '}
            <b style={{ color: sim.win >= 50 ? '#4ade80' : '#f87171' }}>{sim.win.toFixed(0)}%</b> of sims
            {sim.tie >= 1 ? ` (ties ${sim.tie.toFixed(0)}%)` : ''}
          </span>
        )}
        {slateFinal && locked && !savedDay && (
          <button onClick={saveResult} style={{
            padding: '6px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 11, fontWeight: 800,
            border: '1px solid rgba(252,211,77,.5)', background: 'rgba(252,211,77,.1)', color: '#FCD34D',
          }}>🧾 save tonight to my record</button>
        )}
        {savedDay && <span style={{ fontSize: 10, color: '#4ade80', fontFamily: NUM_FONT }}>✓ counted in the season record</span>}
      </div>

      {/* the draft board */}
      {!locked && (
        <>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search a hitter to draft…"
            style={{
              background: C.bg3, border: `1px solid ${C.border2}`, color: C.text, borderRadius: 999,
              padding: '8px 14px', fontSize: 12, outline: 'none', width: '100%', maxWidth: 340,
              boxSizing: 'border-box', marginBottom: 8,
            }}
          />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {pool.map((p) => <Chip key={playerId(p)} p={p} inRoster={picks.includes(String(p?.player_id ?? p?.id))} />)}
          </div>
        </>
      )}

      <div style={{ fontSize: 9.5, color: C.text3, marginTop: 14, lineHeight: 1.65, maxWidth: 760 }}>
        The rules, honestly: your squad locks at first pitch whether you hit LOCK or not — after that,
        no edits, same as the bot lives with. Every real homer by your five scores its actual statcast
        distance (a ~ marks a bomb whose distance hasn&apos;t been measured yet — held at 400 until it
        is). The simulator uses the same calibrated band rates the projections page runs on, so it&apos;s
        exactly as good as the calibration and no better. Records live on THIS device only — no
        accounts, no server; screenshot your card and post it, that&apos;s the leaderboard for now. The
        cap is the game: five max-score studs don&apos;t fit, so go find the value the boards are
        hiding.
      </div>
    </div>
  )
}
