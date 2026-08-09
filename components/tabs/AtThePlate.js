'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { C, NUM_FONT } from '../../lib/theme'
import { nameOf, teamOf, oppOf, clean, n } from '../../lib/player'
import { fetchLiveSlate } from '../../lib/liveSlate'
import { Empty } from '../ui'
import ZoneMap from '../ZoneMap'
import SprayField from '../SprayField'
import LivePitchPlot from '../LivePitchPlot'

// 🎤 AT THE PLATE — the live batter's room (2026-08-09, Donovan: "add the
// spray chart and the zone map to the live at-bats, and make it a solo page
// too").
//
// WHAT THIS ANSWERS: the man batting RIGHT NOW — where he does damage in the
// zone against this arm, and where he actually hits the ball — while the
// pitch is still in the pitcher's hand.
//
// Only possible since 2026-08-09: the schedule `fields` whitelist had been
// stripping `offense.batter` out of every response, so "who's up" was null
// league-wide. With that fixed, every live game publishes its current batter,
// on-deck and in-the-hole hitter, and this page just follows them.
//
// The two charts are the SAME components the player card uses — ZoneMap (bot
// zone cache + live-API fallback, with the matchup view) and SprayField (the
// bot's tracked batted balls). No new data, no new math: one screen that
// points them both at whoever is hitting.

const primaryRole = (p) => String(p?.game_pick_role || '').split('/')[0].trim().toUpperCase()
const ROLE_COLOR = { TOP: '#FCD34D', HR: '#FB923C', HIT: '#60A5FA', HRR: '#22d3ee', CONTACT: '#A78BFA' }

export default function AtThePlate({ players = [], watchIds, mode = 'today', slateMode, onPlayerClick }) {
  const [snap, setSnap] = useState(null)
  const [pinned, setPinned] = useState(null)   // player_id the user locked onto
  const [auto, setAuto] = useState(true)
  const timer = useRef(null)

  const isTomorrow = mode === 'tomorrow'

  const pull = async () => {
    const s = await fetchLiveSlate()
    if (s) setSnap(s)
  }
  useEffect(() => {
    if (isTomorrow) return undefined
    pull()
    clearInterval(timer.current)
    // 25s: an at-bat runs ~3-4 minutes, so this lands inside it comfortably
    // while a hidden tab does nothing.
    if (auto) timer.current = setInterval(() => { if (!document.hidden) pull() }, 25000)
    return () => clearInterval(timer.current)
  }, [auto, isTomorrow])

  // every live game's current batter, joined back to his slate row
  const atBats = useMemo(() => {
    if (!snap?.games) return []
    const byId = new Map(players.map((p) => [Number(p?.player_id ?? p?.id), p]))
    return snap.games
      .filter((g) => g.state === 'Live' && g.upBatter)
      .map((g) => {
        const p = byId.get(Number(g.upBatter)) || null
        const line = snap.lines?.[Number(g.upBatter)] || null
        return {
          g, p, line,
          pid: Number(g.upBatter),
          role: p ? primaryRole(p) : '',
          watched: p ? watchIds?.has(`${clean(p?.player_id || p?.id, '')}-${clean(p?.game_pk || p?.team, '')}`) : false,
          onDeck: byId.get(Number(g.onDeck)) || null,
        }
      })
      // your skin first: picks, then watchlist, then everyone else
      .sort((a, b) => (b.role ? 2 : 0) + (b.watched ? 1 : 0) - ((a.role ? 2 : 0) + (a.watched ? 1 : 0)))
  }, [snap, players, watchIds])

  const active = useMemo(() => {
    if (pinned) {
      const hit = atBats.find((x) => x.pid === pinned)
      if (hit) return hit
    }
    return atBats[0] || null
  }, [atBats, pinned])

  if (isTomorrow) {
    return <Empty text="At the Plate is a tonight instrument — flip back to Today once games start." />
  }
  if (!snap) return <Empty text="Finding tonight's live at-bats…" />
  if (!atBats.length) {
    return (
      <div>
        <Header auto={auto} setAuto={setAuto} pull={pull} count={0} />
        <Empty text={snap.games?.some((g) => g.state === 'Live')
          ? 'Games are live but nobody is at the plate this second — between innings. It refreshes on its own.'
          : 'No games in progress. This page wakes up at first pitch.'} />
      </div>
    )
  }

  const a = active
  const p = a?.p
  const bats = String(p?.bats || '').toUpperCase().slice(0, 1)

  return (
    <div>
      <Header auto={auto} setAuto={setAuto} pull={pull} count={atBats.length} />

      {/* every live at-bat as a chip — tap to lock the charts onto him */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {atBats.map((x) => {
          const on = x.pid === a.pid
          const col = ROLE_COLOR[x.role] || (x.watched ? '#a78bfa' : C.border2)
          return (
            <button key={x.pid} onClick={() => setPinned(x.pid)} className="tap-row" style={{
              display: 'flex', gap: 6, alignItems: 'baseline', cursor: 'pointer',
              border: `1px solid ${on ? col : C.border}`,
              background: on ? `${col}1c` : C.bg2,
              borderRadius: 9, padding: '5px 11px',
              boxShadow: on ? `0 0 12px ${col}33` : 'none',
            }}>
              <span style={{ fontSize: 10 }}>🎤</span>
              <span style={{ fontSize: 11.5, fontWeight: 800, color: on ? C.text : C.text2 }}>
                {x.p ? nameOf(x.p) : `#${x.pid}`}
              </span>
              {x.role && <span style={{ fontSize: 8.5, fontWeight: 900, fontFamily: NUM_FONT, color: ROLE_COLOR[x.role] }}>🤖 {x.role}</span>}
              {x.watched && <span style={{ fontSize: 9 }}>★</span>}
              <span style={{ fontSize: 8.5, color: C.text3, fontFamily: NUM_FONT }}>
                {x.g.half?.slice(0, 3)}{x.g.inning}
              </span>
            </button>
          )
        })}
      </div>

      {/* the batter's room */}
      {p ? (
        <>
          <div style={{
            background: `linear-gradient(155deg, ${C.bg2}, rgba(74,222,128,.04))`,
            border: '1px solid rgba(74,222,128,.25)', borderRadius: 12,
            padding: '10px 14px', marginBottom: 12,
          }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <span onClick={() => onPlayerClick?.(p)} style={{ fontSize: 17, fontWeight: 900, cursor: 'pointer' }}>
                {nameOf(p)}
              </span>
              {a.role && <span style={{ fontSize: 10, fontWeight: 900, fontFamily: NUM_FONT, color: ROLE_COLOR[a.role] }}>🤖 {a.role} PICK</span>}
              <span style={{ fontSize: 10.5, color: C.text3, fontFamily: NUM_FONT }}>
                {teamOf(p)} vs {oppOf(p)} · {bats || '?'}HB · vs {clean(p?.pitcher_name, 'TBD')}
                {n(p?.pitcher_hr9, 0) > 0 && <> · <b style={{ color: n(p.pitcher_hr9, 0) >= 1.4 ? '#f87171' : C.text3 }}>{n(p.pitcher_hr9, 0).toFixed(2)} HR/9</b></>}
              </span>
              <span style={{ marginLeft: 'auto', fontSize: 10, fontFamily: NUM_FONT, color: '#4ade80', fontWeight: 800 }}>
                {a.g.half} {a.g.inning}
              </span>
            </div>
            <div style={{ fontSize: 10, color: C.text2, fontFamily: NUM_FONT, marginTop: 4 }}>
              {a.line
                ? <>Tonight: <b style={{ color: C.text }}>{a.line.h}-{a.line.ab}</b>{a.line.hr ? ` · ${a.line.hr} HR` : ''}{a.line.tb > 1 ? ` · ${a.line.tb} TB` : ''}{a.line.k ? ` · ${a.line.k} K` : ''}</>
                : 'first plate appearance tonight'}
              {a.onDeck && <span style={{ color: C.text3 }}> · on deck: {nameOf(a.onDeck)}</span>}
            </div>
          </div>

          {/* 🔴 the live game itself — every pitch and every ball in play,
              plotted from the feed's own coordinates. Defaults to THIS
              batter; one tap widens it to the whole game. */}
          <LivePitchPlot gamePk={a.g.pk} batterId={a.pid} batterName={nameOf(p)} />

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div style={{ flex: '1 1 300px', minWidth: 0 }}>
              <ZoneMap playerId={a.pid} bats={bats} />
            </div>
            <div style={{ flex: '1 1 300px', minWidth: 0 }}>
              <SprayField player={p} slateMode={slateMode} height={320} />
            </div>
          </div>
          <div style={{ fontSize: 9, color: C.text3, marginTop: 8, lineHeight: 1.55, maxWidth: 720 }}>
            The same zone map and spray chart from his player card, pointed at whoever is hitting.
            The zone map opens on ⚔ Matchup when the bot has zone files for both sides; the spray
            chart is his tracked batted balls. Tap a name above to lock the view on him — otherwise
            it follows your picks first. Refreshes every 25s while this tab is visible.
          </div>
        </>
      ) : (
        <Empty text="The hitter at the plate isn't on tonight's published slate, so there's no card to draw. He'll be replaced by the next batter." />
      )}
    </div>
  )
}

function Header({ auto, setAuto, pull, count }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, flexWrap: 'wrap', marginBottom: 4 }}>
      <span style={{ fontSize: 17, fontWeight: 900 }}>🎤 At the Plate</span>
      <span style={{ fontSize: 10.5, color: C.text3 }}>
        {count > 0 ? `${count} hitter${count === 1 ? '' : 's'} batting right now` : 'live batters, as they step in'}
      </span>
      <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
        <button onClick={() => setAuto((v) => !v)} style={{
          fontSize: 9, fontWeight: 700, fontFamily: NUM_FONT, cursor: 'pointer', borderRadius: 6, padding: '3px 9px',
          border: `1px solid ${auto ? '#4ade80' : C.border}`, background: auto ? 'rgba(74,222,128,.12)' : 'transparent',
          color: auto ? '#4ade80' : C.text3,
        }}>{auto ? '● auto 25s' : '○ auto'}</button>
        <button onClick={pull} style={{
          fontSize: 9, fontWeight: 700, fontFamily: NUM_FONT, cursor: 'pointer', borderRadius: 6, padding: '3px 9px',
          border: `1px solid ${C.border}`, background: 'transparent', color: C.text3,
        }}>↻</button>
      </span>
      <div style={{ flexBasis: '100%', fontSize: 11, color: C.text3, lineHeight: 1.6, marginTop: 2 }}>
        <b style={{ color: C.text2 }}>What this answers:</b> the man hitting right now — where he does
        damage in the zone, and where he actually puts the ball — while the pitch is still coming.
      </div>
    </div>
  )
}
