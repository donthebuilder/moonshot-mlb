'use client'
import { useEffect, useMemo, useState } from 'react'
import { C, NUM_FONT, TYPE } from '../lib/theme'
import PlayerFace from './PlayerFace'
import TeamMark from './TeamMark'
import { Chip } from './writeups/ChipLines'
import { SPORT_ACCENT } from '../lib/sportAccent'
import { nameOf, clean, playerId } from '../lib/player'
import { fetchLiveSlate } from '../lib/liveSlate'
import { teamAbbrs } from '../lib/gamelogs'
import { onLiveRefresh } from '../lib/liveRefresh'

// 🎙️ EVERY AT-BAT AT ONCE — the whole slate, one strip.
//
// 2026-08-10, Donovan: "you can only watch one game... no way to see all the
// live at-bats across the slate at once, which is what you'd actually want
// with eight games running."
//
// At the Plate is a ROOM: one batter, his zone, his spray, deep. That is the
// right design for the man you care about and the wrong one for the question
// "what is happening right now", which is about all eight games and none of
// them in particular. Those are two different jobs and one page was doing the
// first while pretending to do the second — you had to pick a game to see
// anything, and picking a game is exactly what you cannot do when you don't
// know where the action is yet.
//
// COSTS NOTHING NEW. Every field here is already in the shared liveSlate
// snapshot: who is at the plate and on deck come from the linescore's offense
// block, the score and inning from the schedule, tonight's line from the
// boxscore. No per-game feed call — that is what makes it safe to put on two
// tabs and to leave running.
//
// ORDERED BY YOUR SKIN, not by game time. A pick at the plate outranks a
// watchlist name, which outranks a stranger, because the one thing this strip
// is for is telling you where to look.
//
// 2026-08-13, Donovan: "i dont like the design of the page how its like side
// ways" → confirmed target: this rail's horizontal scroll. WRAPS now instead
// of scrolling sideways, same ParkBoard idiom (flex-wrap + cap the default
// count + a "show all" tap) so a heavy night — eight, ten games with someone
// up — doesn't turn into a wall either. A caller that passes an explicit
// `max` (a compact widget elsewhere, sized for a fixed slot) keeps its hard
// cap and no button; only the uncapped case (this page's own usage) gets the
// expand affordance, since only it can actually grow past a screenful.
const DEFAULT_SHOWN = 6

export default function LiveAtBats({
  players = [], watchIds, onGo, onPlayerClick, compact = false, max = 0,
}) {
  const [snap, setSnap] = useState(null)
  const [showAll, setShowAll] = useState(false)
  // 2026-08-13, Donovan: "difficult to understand the teams or the games
  // going on." The card carried a score and never said whose -- "4-1" means
  // nothing without the two sides. teamAbbrs() is the existing cached
  // /teams fetch AtThePlate.js already uses for the same reason; calling it
  // again here costs nothing, the promise is cached by team-id.
  const [abbrs, setAbbrs] = useState(null)
  useEffect(() => { let alive = true; teamAbbrs().then((m) => { if (alive && m) setAbbrs(m) }).catch(() => {}); return () => { alive = false } }, [])

  useEffect(() => {
    let alive = true
    const pull = () => fetchLiveSlate().then((s) => {
      if (!alive || !s) return
      setSnap(s)
      const anyLive = s.games?.some((x) => x.state === 'Live')
    }).catch(() => {})
    pull()
    const off = onLiveRefresh(pull)   // LIVE ON YOUR TAP (2026-10-02): no timer -- a ↻ or a return to the tab (lib/liveRefresh.js)
    return () => { alive = false; off() }
  }, [])

  const byId = useMemo(() => {
    const m = new Map()
    players.forEach((p) => m.set(Number(p?.player_id ?? p?.id), p))
    return m
  }, [players])

  const rows = useMemo(() => {
    const live = (snap?.games || []).filter((g) => g.state === 'Live' && !g.postponed)
    const out = live.map((g) => {
      const p = byId.get(Number(g.upBatter)) || null
      const deck = byId.get(Number(g.onDeck)) || null
      const role = String(p?.game_pick_role || '').split('/')[0].trim().toUpperCase()
      const watched = p ? !!watchIds?.has(playerId(p)) : false
      return {
        g,
        p,
        deck,
        role,
        watched,
        name: p ? nameOf(p) : clean(g.upBatterName, ''),
        deckName: deck ? nameOf(deck) : clean(g.onDeckName, ''),
        line: snap?.lines?.[Number(g.upBatter)] || null,
        rank: (role ? 0 : watched ? 1 : 2),
      }
    }).filter((r) => r.name)
    out.sort((a, b) => a.rank - b.rank || (b.g.inning || 0) - (a.g.inning || 0))
    return max > 0 ? out.slice(0, max) : out
  }, [snap, byId, watchIds, max])

  // An explicit max is a caller-sized hard cap (no expand button, matches
  // its old behaviour exactly). Otherwise show DEFAULT_SHOWN and let the
  // count on the header + this button say how many more there are.
  const capped = max > 0
  const visRows = (capped || showAll) ? rows : rows.slice(0, DEFAULT_SHOWN)

  if (!rows.length) return null

  const theme = { C, NUM_FONT, TYPE, accent: SPORT_ACCENT.mlb }
  return (
    <div style={{ marginBottom: compact ? 10 : 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, font: `900 ${TYPE.label}px/1 ${NUM_FONT}`, letterSpacing: '.12em', color: theme.accent }}>
          <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: theme.accent, boxShadow: `0 0 8px ${theme.accent}` }} />AT THE PLATE NOW
        </span>
        <span style={{ font: `700 ${TYPE.micro}px/1 ${NUM_FONT}`, color: C.text3 }}>{rows.length} live{onGo ? ' · tap a game' : ''}</span>
      </div>

      {/* WRAPS, not a sideways scroll (2026-08-13): as many rows as it takes, the count past DEFAULT_SHOWN folds behind "Show all". */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {visRows.map((r) => {
          const { g } = r
          const away = abbrs?.[g.awayId], home = abbrs?.[g.homeId]
          const picked = Boolean(r.role)
          return (
            <button
              key={g.pk}
              type="button"
              onClick={() => (onGo ? onGo(g.pk) : r.p && onPlayerClick?.(r.p))}
              title={`${r.name} batting · ${away || 'Away'} @ ${home || 'Home'} · ${g.half} ${g.inning} · ${g.awayScore ?? 0}-${g.homeScore ?? 0}${r.deckName ? ` · on deck ${r.deckName}` : ''}`}
              style={{
                flex: '1 1 150px', maxWidth: compact ? 200 : 240, minHeight: 44, textAlign: 'left', cursor: 'pointer', color: C.text,
                background: picked ? `${theme.accent}14` : C.bg2,
                border: `1px solid ${picked ? `${theme.accent}80` : r.watched ? C.border2 : C.border}`,
                borderRadius: 12, padding: '8px 10px', minWidth: 0,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, font: `800 ${TYPE.body}px/1 ${NUM_FONT}`, color: C.text2 }}>
                <span style={{ color: C.text3 }}>{/^top/i.test(g.half) ? '▲' : /^bot/i.test(g.half) ? '▼' : '·'}{g.inning ?? ''}</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  {away && <TeamMark sport="mlb" abbr={away} variant="logo" px={16} />}{g.awayScore ?? 0}–{g.homeScore ?? 0}{home && <TeamMark sport="mlb" abbr={home} variant="logo" px={16} />}
                </span>
                {picked && <span style={{ marginLeft: 'auto' }}><Chip theme={theme} label={r.role} heat={2} /></span>}
                {!picked && r.watched && <span style={{ marginLeft: 'auto' }}><Chip theme={theme} label="watching" /></span>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 6 }}>
                {r.p && <PlayerFace sport="mlb" id={String(r.p.player_id ?? r.p.id)} name={r.name} size={28} theme={C} />}
                <span style={{ font: `800 ${TYPE.name}px/1.2 ${NUM_FONT}`, minWidth: 0, overflowWrap: 'anywhere', color: r.p ? C.text : C.text2 }}>{r.name}</span>
              </div>
              {/* His line tonight is the context: 0-for-3 and 2-for-2 are different at-bats to watch. A man in his first PA has no line and says so. */}
              <div style={{ font: `700 ${TYPE.micro}px/1.3 ${NUM_FONT}`, color: C.text3, marginTop: 3 }}>
                {r.line ? `${r.line.h}-${r.line.ab}${r.line.hr ? ` · ${r.line.hr} HR` : ''}` : 'first look'}
                {r.deckName ? ` · deck ${String(r.deckName).split(' ').slice(-1)[0]}` : ''}
              </div>
            </button>
          )
        })}
      </div>

      {!capped && !showAll && rows.length > DEFAULT_SHOWN && (
        <button type="button" onClick={() => setShowAll(true)} style={{
          display: 'block', width: '100%', marginTop: 9, cursor: 'pointer', minHeight: 44,
          font: `800 ${TYPE.label}px/1 ${NUM_FONT}`, color: C.text2,
          background: C.bg2, border: `1px dashed ${C.border2}`, borderRadius: 12,
          padding: '0 10px', letterSpacing: '.02em',
        }}>Show all {rows.length} games ▾</button>
      )}
    </div>
  )
}
