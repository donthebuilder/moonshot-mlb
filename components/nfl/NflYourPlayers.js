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
import { useDashAccount } from '../../lib/dash/sync'
import { fetchNflLive, lineFor, gameFor, tdsIn } from '../../lib/nfl/liveSlate'

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
const COLLAPSED_N = 3
const OPEN_KEY = 'tuddy_yourplayers_open_v1'
const readOpen = () => { try { return localStorage.getItem(OPEN_KEY) === '1' } catch { return false } }
const writeOpen = (v) => { try { localStorage.setItem(OPEN_KEY, v ? '1' : '0') } catch {} }

const wrap = { border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 14px' }
const head = { display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }
const title = { fontSize: 12.5, color: C.text }
const note = { fontSize: 10, color: C.text3, fontFamily: NUM_FONT }

export default function NflYourPlayers({ players = [], onPlayerClick = null }) {
  const { rows: followed, unfollow } = useFollowing('nfl')
  const account = useDashAccount()
  const [snap, setSnap] = useState(null)
  // Starts closed on server + first client render, then adopts the stored
  // choice in an effect -- reading localStorage during render is the exact
  // hydration mismatch lib/theme.js's applyTheme() comment warns about.
  const [open, setOpen] = useState(false)
  useEffect(() => { setOpen(readOpen()) }, [])
  const toggle = () => setOpen((v) => { writeOpen(!v); return !v })

  useEffect(() => {
    let alive = true
    const pull = () => fetchNflLive().then((s) => { if (alive && s) setSnap(s) }).catch(() => {})
    pull()
    const t = setInterval(() => { if (!document.hidden) pull() }, 45000)
    return () => { alive = false; clearInterval(t) }
  }, [])

  const rows = useMemo(() => {
    const byName = new Map((players || []).map((p) => [`${p.name}|${p.team}`, p]))
    return followed.map((r) => {
      const p = byName.get(`${r.name}|${r.team}`) || null
      const line = lineFor(snap, r)
      const g = gameFor(snap, r)
      const onBoard = !!p
      let status = 'off'
      if (g?.completed || g?.state === 'post') status = 'final'
      else if (line && (tdsIn(line) > 0 || n(line.receiving_yards) > 0 || n(line.rushing_yards) > 0 || n(line.passing_yards) > 0 || n(line.receptions) > 0)) status = 'live'
      else if (g?.state === 'in') status = 'live'
      else if (onBoard || g) status = 'pre'
      const opp = g ? (g.home === r.team ? g.away : g.home) : (p?.opp || '')
      return {
        ...r, p, line, g, onBoard, status,
        bars: line ? barsCleared(line) : [],
        tds: line ? tdsIn(line) : 0,
        highConf: !!p?.high_confidence_td_flag,
        tdScore: Number.isFinite(p?.scores?.TD) ? Math.round(p.scores.TD) : null,
        matchup: `${r.team}${opp ? ` vs ${opp}` : ''}`.trim(),
      }
    }).sort((a, b) => (RANK[a.status] - RANK[b.status])
      || (b.tds - a.tds)
      || String(a.name).localeCompare(String(b.name)))
  }, [followed, players, snap])

  if (!rows.length) {
    return (
      <div style={wrap}>
        <div style={head}><b style={title}>★ Your players</b><span style={note}>nobody yet</span></div>
        <p style={{ ...note, margin: '6px 0 0', lineHeight: 1.6 }}>
          Star a player anywhere on the board and he lands here, with this week&apos;s
          line beside him.
        </p>
      </div>
    )
  }

  const liveN = rows.filter((r) => r.status === 'live').length
  const tdN = rows.reduce((a, r) => a + r.tds, 0)
  const shown = open ? rows : rows.slice(0, COLLAPSED_N)
  const hiddenN = rows.length - shown.length

  return (
    <div style={wrap}>
      <div style={head}>
        <b style={title}>★ Your players</b>
        <span style={note}>
          {rows.length} {rows.length === 1 ? 'player' : 'players'} ·{' '}
          {account.signedIn ? 'saved to your account' : 'saved on this device'}
          {liveN > 0 && <> · <b style={{ color: C.green }}>{liveN} live</b></>}
          {tdN > 0 && <> · <b style={{ color: C.green }}>{tdN} TD{tdN > 1 ? 's' : ''}</b> tonight</>}
        </span>
        {rows.length > COLLAPSED_N && (
          <button type="button" onClick={toggle} style={{
            marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer',
            fontFamily: NUM_FONT, fontSize: 9.5, color: C.green, fontWeight: 800,
          }}>{open ? 'show less' : `+${hiddenN} more`}</button>
        )}
      </div>
      <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {shown.map((r) => (
          <button key={`${r.sport}:${r.id}`} type="button" onClick={() => r.p && onPlayerClick?.(r.p, 'TD')}
            disabled={!r.p}
            style={{
              display: 'grid', gridTemplateColumns: '1fr auto auto', alignItems: 'center', gap: 8,
              width: '100%', padding: '7px 4px', border: 0, borderTop: `1px solid ${C.border}`,
              background: 'transparent', color: 'inherit', textAlign: 'left',
              cursor: r.p ? 'pointer' : 'default',
            }}>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                {r.status === 'live' && <i style={{ width: 5, height: 5, borderRadius: '50%', background: C.green, flexShrink: 0 }} />}
                <b style={{ fontSize: 11.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</b>
                {r.highConf && <span title="Bot's high-confidence TD flag" style={{ fontSize: 10 }}>⭐</span>}
              </span>
              <span style={{ display: 'block', marginTop: 2, fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT }}>
                {r.matchup || 'not on this week’s board'}
              </span>
            </span>
            <span style={{ fontSize: 10, color: C.text2, textAlign: 'right' }}>
              {r.bars.length ? r.bars.join(' · ') : (r.status === 'live' ? 'in progress' : r.status === 'final' ? 'no stat line' : r.status === 'pre' ? 'not kicked off' : '')}
            </span>
            {r.tdScore != null && (
              <span style={{ fontFamily: NUM_FONT, fontSize: 12, fontWeight: 900, color: C.green, textAlign: 'right', minWidth: 26 }}>{r.tdScore}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
