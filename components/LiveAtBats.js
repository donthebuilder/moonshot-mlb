'use client'
import { useEffect, useMemo, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { nameOf, clean, playerId } from '../lib/player'
import { fetchLiveSlate } from '../lib/liveSlate'
import { teamAbbrs } from '../lib/gamelogs'

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
export default function LiveAtBats({
  players = [], watchIds, onGo, onPlayerClick, compact = false, max = 0,
}) {
  const [snap, setSnap] = useState(null)
  // 2026-08-13, Donovan: "difficult to understand the teams or the games
  // going on." The card carried a score and never said whose -- "4-1" means
  // nothing without the two sides. teamAbbrs() is the existing cached
  // /teams fetch AtThePlate.js already uses for the same reason; calling it
  // again here costs nothing, the promise is cached by team-id.
  const [abbrs, setAbbrs] = useState(null)
  useEffect(() => { let alive = true; teamAbbrs().then((m) => { if (alive && m) setAbbrs(m) }).catch(() => {}); return () => { alive = false } }, [])

  useEffect(() => {
    let alive = true
    let t = null
    const pull = () => fetchLiveSlate().then((s) => {
      if (!alive || !s) return
      setSnap(s)
      const anyLive = s.games?.some((x) => x.state === 'Live')
      clearInterval(t)
      // 25s while live — an at-bat lasts three or four minutes, so this is
      // inside the window where "who is up" is still true. Idle otherwise;
      // there is nothing to watch.
      t = setInterval(() => { if (!document.hidden) pull() }, anyLive ? 25000 : 120000)
    }).catch(() => {})
    pull()
    return () => { alive = false; clearInterval(t) }
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

  if (!rows.length) return null

  return (
    <div style={{ marginBottom: compact ? 10 : 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 5, flexWrap: 'wrap' }}>
        <span style={{ fontSize: compact ? 11 : 12.5, fontWeight: 900 }}>🎙️ At the plate right now</span>
        <span style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT }}>
          {rows.length} live · your picks first{onGo ? ' · tap for the full room' : ''}
        </span>
      </div>

      {/* A RAIL, not a stack. Eight live games as eight full-width rows is most
          of a phone screen and half a laptop one — and this is a strip that
          sits ABOVE the thing you came to read, on two different tabs. It
          scrolls sideways like every other dense row on the site. */}
      <div className="rail dense-scroll" style={{ overflowX: 'auto' }}>
        <div style={{ display: 'flex', gap: 7, minWidth: 'max-content', paddingBottom: 2 }}>
          {rows.map((r) => {
            const { g } = r
            const hot = r.role ? C.orange : r.watched ? '#FCD34D' : C.border
            return (
              <button
                key={g.pk}
                type="button"
                onClick={() => (onGo ? onGo(g.pk) : r.p && onPlayerClick?.(r.p))}
                title={`${r.name} batting · ${abbrs?.[g.awayId] || 'Away'} @ ${abbrs?.[g.homeId] || 'Home'} · ${g.half} ${g.inning} · ${g.awayScore ?? 0}-${g.homeScore ?? 0}${r.deckName ? ` · on deck ${r.deckName}` : ''}`}
                style={{
                  flex: '0 0 auto', width: compact ? 152 : 176, textAlign: 'left', cursor: 'pointer',
                  background: r.role ? 'rgba(249,115,22,.08)' : C.bg2,
                  border: `1px solid ${r.role || r.watched ? `${hot}66` : C.border}`,
                  borderRadius: 10, padding: '6px 9px 7px', minWidth: 0,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, fontFamily: NUM_FONT }}>
                  <span style={{ fontSize: 9, color: C.text3 }}>
                    {/^top/i.test(g.half) ? '▲' : /^bot/i.test(g.half) ? '▼' : '·'}{g.inning ?? ''}
                  </span>
                  <span style={{ fontSize: 10, fontWeight: 800, color: C.text2 }}>
                    {abbrs?.[g.awayId] ? `${abbrs[g.awayId]} ` : ''}{g.awayScore ?? 0}–{g.homeScore ?? 0}{abbrs?.[g.homeId] ? ` ${abbrs[g.homeId]}` : ''}
                  </span>
                  {r.role && <span style={{ marginLeft: 'auto', fontSize: 8, fontWeight: 900, color: C.orange }}>{r.role}</span>}
                  {!r.role && r.watched && <span style={{ marginLeft: 'auto', fontSize: 9 }}>★</span>}
                </div>
                <div style={{
                  fontSize: 12, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden',
                  textOverflow: 'ellipsis', color: r.p ? C.text : C.text2, marginTop: 1,
                }}>{r.name}</div>
                <div style={{ fontSize: 8.5, color: C.text3, fontFamily: NUM_FONT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {/* His line tonight is the context that makes the name mean
                      something — 0-for-3 and 2-for-2 are different at-bats to
                      watch. A man in his first PA has no line and says so. */}
                  {r.line ? `${r.line.h}-${r.line.ab}${r.line.hr ? ` · ${r.line.hr} HR` : ''}` : 'first look'}
                  {r.deckName ? ` · deck ${String(r.deckName).split(' ').slice(-1)[0]}` : ''}
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
