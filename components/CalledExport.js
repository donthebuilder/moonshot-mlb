'use client'
import { useMemo, useState } from 'react'
import { flatChip, FLAT_CHIP_CLASS } from '../lib/chips'
import { groupCalled, calledText } from '../lib/calledList'
import { useMemberState } from './MemberGate'
import { tdPool } from '../lib/nfl/tdPool'
import { tdStatusFor } from '../lib/nfl/tdStatus'
import { useGameCalls } from './nfl/GameCalls'

// 📋 COPY CALLED (2026-10-25, Donovan: "export all the names ... of all the players that are called for each game ... do the
// text first"). One tap on a slate: every CALLED man of that day, by game, with the lanes he is CALLED in, as text
// (lib/calledList.js). The statuses are the boards' own (each board's `status`, TUDDY's tdStatusFor + its pick card), read
// the way the slate reads them. MEMBERS ONLY: before the lock a CALLED pick is members' (components/MemberGate), so a free
// viewer gets no button rather than a back door around the lock.
// The tap opens a panel with the text and a Copy button: a phone (iOS Safari) refuses a copy that waits on a fetch, so the
// copy is its own tap; where the browser allows it, the first tap copies too.

const NBA_LANES = { pts: 'PTS 25+', reb: 'REB 10+', ast: 'AST 8+', '3pm': '3PM 4+', pra: 'PRA 35+', dd: 'DD', td: 'TD', first: 'FIRST BASKET' }
const NHL_LANES = { GOAL: 'GOAL', G2: '2+ GOALS', SOG: 'SHOTS' }
const getJSON = (u) => fetch(u).then((r) => (r.ok ? r.json() : null)).catch(() => null)
const q = (date, extra = {}) => { const p = new URLSearchParams(); if (date) p.set('date', date); for (const [k, v] of Object.entries(extra)) if (v) p.set(k, v); const s = p.toString(); return s ? `?${s}` : '' }
const dayWord = (d) => { try { return new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' }) } catch { return d || '' } }

async function nbaEntries(date) {
  const out = []
  for (const [m, lane] of Object.entries(NBA_LANES)) {
    const b = await getJSON(`/api/buckets/board${q(date, { market: m === 'pts' ? null : m })}`)
    for (const r of b?.rows || []) if (r.status === 'called') {
      const g = (b.games || []).find((x) => x.id === r.gameId)
      out.push({ gameKey: r.gameId, title: g ? `${g.away?.abbrev} @ ${g.home?.abbrev}` : `${r.team} vs ${r.opp}`, start: g?.start || null, name: r.name, team: r.team, lane })
    }
  }
  return { head: `🏀 BUCKETS · CALLED · ${dayWord(date)}`, entries: out }
}

async function nhlEntries(date) {
  const out = []
  for (const [m, lane] of Object.entries(NHL_LANES)) {
    const b = await getJSON(`/api/lamp/board${q(date, { market: m === 'GOAL' ? null : m })}`)
    for (const g of b?.games || []) for (const r of g.rows || []) if (r.status === 'called') {
      const gm = g.game || {}
      out.push({ gameKey: String(gm.id), title: `${gm.away?.abbrev} @ ${gm.home?.abbrev}`, start: gm.startUtc || null, name: r.name, team: r.team, lane: r.line ? `${lane} ${r.line}` : lane })
    }
  }
  return { head: `🚨 LAMP · CALLED · ${dayWord(date)}`, entries: out }
}

function nflEntries(data, picks, gameCalls) {
  const games = data?.games || []
  const gameOf = (team) => games.find((g) => g.home === team || g.away === team)
  const out = []
  const push = (p, lane) => { const g = gameOf(p.team); out.push({ gameKey: g?.game_id || p.team, title: g ? `${g.away} @ ${g.home}` : `${p.team} vs ${p.opp || ''}`, start: g?.kickoff || null, name: p.name, team: p.team, lane }) }
  // the TD lane: TUDDY's own status (the pick card's TD ladder + the locked game calls). onBotOf says WHICH market called
  // him; a man CALLED only by another market (a QB's passing yards, a kicker's points) is labelled by that market below
  const { statusOf, onBotOf } = tdStatusFor({ picksCard: picks?.card, gameCalls, games, board: tdPool(data).rows })
  for (const p of data?.players || []) {
    if (statusOf(p) !== 'called') continue
    const ob = onBotOf(p)
    if (ob?.market === 'TD') push(p, 'Anytime TD')
    else if (ob?.market === 'GAME') push(p, `${ob.role === 'TOP' ? 'TOP' : 'TD'} game call`)
  }
  // every other market: its pick-card rungs
  for (const [k, c] of Object.entries(picks?.card || {})) if (k !== 'TD') for (const r of c.rungs || []) push(r, c.label || k)
  return { head: `🏈 TUDDY · CALLED · week ${picks?.week ?? data?.week ?? ''}`, entries: out, weekday: true }
}

// the sports read here, by key (the registry rule: no sport ternaries)
const READERS = { nba: nbaEntries, nhl: nhlEntries }

/** TUDDY's: its week file + pick card are already on the page; the game calls are read here (NFL only). */
export function NflCalledExport({ data, picks, C, NUM_FONT, accent }) {
  const gameCalls = useGameCalls()
  const prepared = useMemo(() => (data ? nflEntries(data, picks, gameCalls) : null), [data, picks, gameCalls])
  return <CalledExport sport="nfl" prepared={prepared} C={C} NUM_FONT={NUM_FONT} accent={accent} />
}

/** sport: 'nba' | 'nhl' (read here, for `date`; null = tonight), or `prepared` entries (TUDDY's NflCalledExport). */
export default function CalledExport({ sport, date = null, prepared = null, C, NUM_FONT, accent }) {
  const member = useMemberState() === 'member'
  const [text, setText] = useState(null)   // null = closed, '' = loading / empty
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  if (!member) return null

  const build = async () => {
    const r = prepared || (READERS[sport] ? await READERS[sport](date) : null)
    return calledText({ head: r?.head || '', games: groupCalled(r?.entries || []), weekday: Boolean(r?.weekday) })
  }
  const copy = async (t) => { try { await navigator.clipboard.writeText(t); setCopied(true); setTimeout(() => setCopied(false), 1800) } catch { /* the panel still shows it */ } }
  const open = async () => {
    setBusy(true); setText('')
    // inside the tap: where the browser lets a copy wait on the fetch (ClipboardItem with a promise), it copies now
    const p = build()
    try {
      if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
        await navigator.clipboard.write([new ClipboardItem({ 'text/plain': p.then((t) => new Blob([t || ''], { type: 'text/plain' })) })])
        setCopied(true); setTimeout(() => setCopied(false), 1800)
      }
    } catch { /* copy from the panel */ }
    const t = await p
    setText(t || 'Nobody is CALLED on this day yet.'); setBusy(false)
  }

  return (
    <div style={{ display: 'grid', gap: 6, justifyItems: 'end' }}>
      <button type="button" className={FLAT_CHIP_CLASS} onClick={text == null ? open : () => setText(null)} aria-expanded={text != null} style={flatChip(text != null, accent, C, NUM_FONT)}>
        {busy ? 'Reading…' : copied ? 'Copied' : text != null ? 'Close list' : '📋 Copy called'}
      </button>
      {text ? (
        <div style={{ width: 'min(92vw, 420px)', border: `1px solid ${C.border2}`, borderRadius: 10, background: C.bg2, padding: 10, display: 'grid', gap: 8 }}>
          <pre style={{ margin: 0, maxHeight: '50vh', overflow: 'auto', whiteSpace: 'pre-wrap', font: `600 12px/1.45 ${NUM_FONT}`, color: C.text }}>{text}</pre>
          <button type="button" className={FLAT_CHIP_CLASS} onClick={() => copy(text)} style={{ ...flatChip(copied, accent, C, NUM_FONT), justifySelf: 'start' }}>{copied ? 'Copied' : 'Copy text'}</button>
        </div>
      ) : null}
    </div>
  )
}
