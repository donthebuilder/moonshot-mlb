'use client'

// ⭐ YOUR PLAYERS — TUDDY's twin of MOONSHOT's YourPlayers.js.
//
// MOONSHOT's own header comment explains the gap this closes: a followed or
// starred player used to be a name chip and nothing else (components/
// FollowingStrip.js, which TUDDY's Home still mounts directly) — so on a
// week where three of your guys are playing right now, the section that is
// supposed to be about them tells you their names, which you already knew.
// This says what he's actually done this week, per man, in one line.
//
// ONE STORE, NOT TWO (a real, deliberate difference from MOONSHOT). MOONSHOT
// unions two independent stores (a slate-scoped star and a durable follow)
// because they ARE independent there. TUDDY's own lib/nfl/watchlist.js
// already documents that pinning a player also calls follow('nfl', ...) --
// "Starring also FOLLOWS the player... the pin is about this slate, the
// follow is about the man" -- so useFollowing('nfl') alone already carries
// every pinned player. Forcing a second union here would double-count the
// same men, not add coverage.
//
// NO NEW POLLER. fetchNflLive() is the shared, TTL-cached snapshot the
// header ticker and NflHeadlineStrip already pull on this exact page —
// asking again here is free until the TTL expires.

import { useEffect, useMemo, useState } from 'react'
import { C, NUM_FONT } from '../../lib/nfl/theme'
import { useFollowing } from '../../lib/dash/follow'
import YourPlayersView, { KEYS } from '../YourPlayersView'
import { fetchNflLive, lineFor, gameFor, tdsIn } from '../../lib/nfl/liveSlate'
import { onLiveRefresh } from '../../lib/liveRefresh'

const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0)

/** Which of his live line's numbers are worth calling out -- same idea as
 * MOONSHOT's barsCleared(), thresholds picked off nfl_scoring's own
 * high-confidence bars rather than invented round numbers. */
function barsCleared(line) {
  const out = []
  const tds = tdsIn(line)
  if (tds >= 1) out.push(`${tds} TD${tds > 1 ? 's' : ''}`)
  if (n(line?.receiving_yards) >= 75) out.push('75+ rec yds')
  else if (n(line?.rushing_yards) >= 75) out.push('75+ rush yds')
  else if (n(line?.passing_yards) >= 250) out.push('250+ pass yds')
  if (n(line?.receptions) >= 6) out.push('6+ rec')
  return out.slice(0, 3)
}

// Live first (can still change), then not-yet-kicked-off (still can), then
// final, then not on this week's slate at all. Same rank shape as MOONSHOT.
const RANK = { live: 0, pre: 1, final: 2, off: 3 }

// Mobile-scroll discipline: preview the loudest three, everything else is
// one tap away. Same cap MOONSHOT settled on after "make sure it only shows
// 3 players max for the preview, it takes up the whole page."
// THE SECTION IS MOONSHOT'S (2026-10-03, parity): components/YourPlayersView.js
// draws it -- the collapsible header with live and TD counts, × to remove, show
// more, Clear all -- and this file is TUDDY's data: the follow list, this
// week's live line, the bars it cleared.
const statLine = (l) => {
  const parts = []
  if (n(l?.receptions) || n(l?.receiving_yards)) parts.push(`${n(l.receptions)} rec ${n(l.receiving_yards)} yds`)
  if (n(l?.rushing_yards)) parts.push(`${n(l.rushing_yards)} rush`)
  if (n(l?.passing_yards)) parts.push(`${n(l.passing_yards)} pass`)
  return parts.join(' · ')
}

export default function NflYourPlayers({ players = [], onPlayerClick = null }) {
  const { rows: followed } = useFollowing('nfl')
  const [snap, setSnap] = useState(null)

  useEffect(() => {
    let alive = true
    const pull = () => fetchNflLive().then((s) => { if (alive && s) setSnap(s) }).catch(() => {})
    pull()
    const t = onLiveRefresh(pull)   // LIVE ON YOUR TAP (2026-10-02): no timer -- a ↻ or a return to the tab (lib/liveRefresh.js)
    return () => { alive = false; t() }
  }, [])

  const rows = useMemo(() => {
    const byName = new Map((players || []).map((p) => [`${p.name}|${p.team}`, p]))
    return followed.map((r) => {
      const p = byName.get(`${r.name}|${r.team}`) || null
      const line = lineFor(snap, r)
      const g = gameFor(snap, r)
      const onSlate = !!p
      let status = 'off'
      if (g?.completed || g?.state === 'post') status = 'final'
      else if (line && (tdsIn(line) > 0 || n(line.receiving_yards) > 0 || n(line.rushing_yards) > 0 || n(line.passing_yards) > 0 || n(line.receptions) > 0)) status = 'live'
      else if (g?.state === 'in') status = 'live'
      else if (onSlate || g) status = 'pre'
      const opp = g ? (g.home === r.team ? g.away : g.home) : (p?.opp || '')
      const tds = line ? tdsIn(line) : 0
      const sl = line ? statLine(line) : ''
      return {
        ...r, p, line, g, onSlate, status,
        bars: line ? barsCleared(line) : [],
        hr: tds,
        // The role slot carries the bot's TD score, the board's number for him.
        role: Number.isFinite(p?.scores?.TD) ? `TD ${Math.round(p.scores.TD)}${p.high_confidence_td_flag ? ' ⭐' : ''}` : '',
        matchup: `${r.team}${opp ? ` vs ${opp}` : ''}`.trim(),
        lineNode: sl
          ? <span style={{ fontSize: 11.5, fontWeight: 700, color: C.text, fontFamily: NUM_FONT, whiteSpace: 'nowrap' }}>{sl}{tds > 0 && <b style={{ color: C.green }}>{' '}{tds} TD</b>}</span>
          : <span style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT, whiteSpace: 'nowrap' }}>{status === 'off' ? 'not on this week’s board' : status === 'final' ? 'no stat line' : status === 'live' ? 'in progress' : 'not kicked off'}</span>,
        clock: status === 'live' ? 'live' : status === 'final' ? 'final' : status === 'pre' && g?.detail ? g.detail : '',
      }
    }).sort((a, b) => (RANK[a.status] - RANK[b.status])
      || (b.hr - a.hr)
      || String(a.name).localeCompare(String(b.name)))
  }, [followed, players, snap])

  return (
    <YourPlayersView sport="nfl" rows={rows} onPlayerClick={onPlayerClick ? (p) => onPlayerClick(p, 'TD') : null}
      theme={C} numFont={NUM_FONT} accent={C.green} liveInk={C.green} keys={KEYS.nfl}
      eventWord={(k) => `${k} TD${k > 1 ? 's' : ''} this week`} hiddenEventWord={(k) => `${k} with a TD`}
      emptyNote={<>Star a player anywhere on the board and he lands here, with this week&apos;s
          line beside him.</>} />
  )
}
