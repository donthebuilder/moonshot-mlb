'use client'
import { useMemo, useState, useRef, useEffect } from 'react'
import { C, NUM_FONT } from '../../lib/theme'
import { groupGames } from '../../lib/data'
import { dateText, playerId, hrScore } from '../../lib/player'
import { PanelTitle, Empty, btnStyle } from '../ui'
import PlayerCard from '../PlayerCard'
import GameStrip from '../GameStrip'
import GameLineup from '../GameLineup'
import ProjectedOutput from '../ProjectedOutput'
import Heatmap from '../Heatmap'
import { pillMeta, pillStyle } from '../../lib/pills'
import OffBot from '../OffBot'
import GameDeepDive from '../GameDeepDive'
import LineupSlotMatchup from '../LineupSlotMatchup'

const ROLE_CONFIG = {
  TOP:     { label: 'Top Pick',     color: '#FCD34D' },
  HR:      { label: 'HR Pick',      color: '#FB923C' },
  HIT:     { label: 'Hit Pick',     color: '#60A5FA' },
  HRR:     { label: 'HRR Pick',     color: '#34D399' },
  CONTACT: { label: 'Contact Pick', color: '#A78BFA' },
}
function getRoleDisplay(p) {
  const primary = (p?.game_pick_role || '').split('/')[0]
  if (ROLE_CONFIG[primary]) return ROLE_CONFIG[primary]
  const label = p?.best_bet_type || p?.beginner_label || '—'
  const color = label.toLowerCase().includes('avoid') ? '#F87171'
    : label.toLowerCase().includes('strong hr') ? '#FB923C'
    : label.toLowerCase().includes('power watch') ? '#A78BFA'
    : '#9CA3AF'
  return { label, color }
}

// group games by time slot (same UTC hour)
//
// BUGFIX: previously returned `${h}:${m}` with an UNPADDED hour (e.g. "0:30"
// for a game just after midnight UTC, "16:10" for one at 16:10 UTC), then
// sorted slots with localeCompare (plain string comparison). "0:30" sorts
// BEFORE "16:10" alphabetically since "0" < "1" as the first character --
// even though 00:30 UTC the next day is chronologically LATER than 16:10
// UTC. MST evening games (5:40pm/6:45pm MST) land on single-digit UTC hours
// just after midnight UTC and were sorting to the top of the list for
// exactly this reason. Returning the actual timestamp (epoch ms, rounded to
// the 30-min bucket) makes the key directly numerically/chronologically
// sortable, with no date-rollover ambiguity.
function timeSlot(gameTime) {
  if (!gameTime) return null
  const d = new Date(gameTime)
  if (Number.isNaN(d.getTime())) return null
  const ms = d.getTime()
  const thirtyMin = 30 * 60 * 1000
  return Math.floor(ms / thirtyMin) * thirtyMin
}

function localTime(gameTime) {
  if (!gameTime) return '—'
  const d = new Date(gameTime)
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })
}

function isPast(gameTime) {
  if (!gameTime) return false
  return new Date(gameTime) < new Date(Date.now() - 3 * 60 * 60 * 1000) // 3hr buffer for late games
}

// The five designated slots for a game — the same ones Results grades.
// Shared by the rundown cards and the expanded pick row so the two can
// never disagree about who a game's picks are.
const CAT_ORDER = ['TOP', 'HR', 'HIT', 'HRR', 'CONTACT']
const CAT_COLOR = { TOP: '#FCD34D', HR: '#FB923C', HIT: '#60A5FA', HRR: '#22d3ee', CONTACT: '#A78BFA' }
const CAT_SCORE = {
  TOP: (p) => p?.top_board_score_v2 ?? p?.overall_score ?? p?.hr_score ?? 0,
  HR: (p) => p?.hr_score ?? 0,
  HIT: (p) => p?.hit_score ?? 0,
  HRR: (p) => p?.hrr_score ?? 0,
  CONTACT: (p) => p?.contact_score ?? 0,
}
const primaryRole = (p) => String(p?.game_pick_role || '').split('/')[0].trim().toUpperCase()
const picksFor = (g) => CAT_ORDER
  .map((cat) => [...(g.players || [])]
    .filter((p) => primaryRole(p) === cat)
    .sort((a, b) => (CAT_SCORE[cat](b) || 0) - (CAT_SCORE[cat](a) || 0))[0])
  .filter(Boolean)

// The two sides of a game: each team with the ARM ITS BATTERS FACE — every
// hitter row already carries his opposing pitcher, so side one's pitcher is
// just the first row's pitcher fields.
function sidesOf(g) {
  const byTeam = {}
  ;(g.players || []).forEach((p) => {
    const t = p?.team || '?'
    ;(byTeam[t] = byTeam[t] || []).push(p)
  })
  Object.values(byTeam).forEach((l) => l.sort((a, b) => (Number(a?.lineup_spot) || 99) - (Number(b?.lineup_spot) || 99)))
  const order = [g.away, g.home].filter((t) => byTeam[t])
  const teams = order.length === 2 ? order : Object.keys(byTeam)
  return teams.map((t) => {
    const lineup = byTeam[t]
    return {
      team: t,
      lineup,
      arm: lineup[0]?.pitcher_name || 'TBD',
      throws: lineup[0]?.pitcher_throws || '',
      hr9: Number(lineup[0]?.pitcher_hr9) || null,
      era: Number(lineup[0]?.pitcher_era) || null,
      projected: !!lineup[0]?.pitcher_projected,
      stars: lineup.filter((p) => p?.weak_spot_flag).length,
    }
  })
}

export default function Games({ players, slateDate = '', onAdd, onWatch, watchIds, onPlayerClick }) {
  const [mode, setMode]         = useState('default')
  const [activeGame, setActive] = useState(null)
  // Lineups mode focus (2026-08-06): clicking a bubble used to scroll the
  // page to a card buried under ten others — "flies all the way to the
  // bottom". Now it FOCUSES: the chosen game renders alone, full width, with
  // the slot-by-slot depth open; everything else steps aside until the back
  // button (or re-clicking the bubble) restores the wall.
  const [lineupFocus, setLineupFocus] = useState(null)
  const gameRefs                = useRef({})

  const games = useMemo(() => groupGames(players), [players])

  // Group games by time slot
  const slots = useMemo(() => {
    const map = {}
    const tbd = []
    games.forEach(g => {
      const slot = timeSlot(g.game_time)
      if (slot == null) { tbd.push(g); return }
      if (!map[slot]) map[slot] = []
      map[slot].push(g)
    })
    // Numeric keys sort correctly in actual chronological order -- no more
    // string comparison across a midnight-UTC rollover.
    const sorted = Object.entries(map).sort(([a], [b]) => Number(a) - Number(b))
    if (tbd.length) sorted.push(['TBD', tbd])
    return sorted
  }, [games])

  // Default active = first non-past game
  useEffect(() => {
    if (games.length && !activeGame) {
      const first = games.find(g => !isPast(g.game_time)) || games[0]
      setActive(first.game_pk)
    }
  }, [games])

  if (!games.length) return <Empty text="No games found yet." />

  const scrollTo = (pk) => {
    if (mode === 'lineups') {
      setActive(pk)
      // focus, don't fly — re-clicking the same bubble releases it
      setLineupFocus((cur) => (cur === pk ? null : pk))
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    // card grid: clicking a card TOGGLES its in-place deep-dive below the
    // grid — re-click closes, a new card switches and scrolls to the panel
    setActive((cur) => {
      const next = cur === pk ? null : pk
      if (next != null) setTimeout(() => {
        const el = gameRefs.current[pk]
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 60)
      return next
    })
  }

  return (
    <div>
      <PanelTitle
        title="Games"
        sub={`${games.length} games · ${slots.length} time slots · ${
          mode === 'lineups' ? 'every batting order at once — click a game bubble for slot-by-slot depth'
          : mode === 'botview' ? "the picks with the bot's five category bars per card"
          : 'the slate as heat-sized game cards — tap one for the full deep-dive, in place'
        }`}
        right={
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => setMode('default')} style={btnStyle(C.orange, mode === 'default')}>Default</button>
            <button onClick={() => setMode('botview')} style={btnStyle(C.cyan,   mode === 'botview')}>Bot Output</button>
            <button onClick={() => setMode('lineups')} style={btnStyle(C.green,  mode === 'lineups')}>Lineups</button>
          </div>
        }
      />

      {/* Lineups keeps the strip as its sticky jump bar; Default and Bot
          Output render the card grid as the page itself, below. */}
      {mode === 'lineups' && (
        <div style={{
          position: 'sticky', top: 0, zIndex: 20, background: '#09090b',
          paddingTop: 4, paddingBottom: 8, marginBottom: 14,
          borderBottom: `1px solid ${C.border}`,
        }}>
          <GameStrip games={games} activeGame={activeGame} onSelect={scrollTo} mode={mode} />
        </div>
      )}

      {/* The slate's blind spot: hitters batting tonight the bot never
          scored. Collapsed by default, fetches only on expand. */}
      <OffBot players={players} onPlayerClick={onPlayerClick} />

      {/* LINEUPS — every game's confirmed batting orders at once, 1 through
          9, both teams side by side. The site had lineup data on every row
          and nowhere to just READ the lineups. ✓ green = confirmed, hollow =
          projected. Click a name for his modal. */}
      {/* LINEUPS 2.0 — the matchup card, PF-inspired and then some. Each
          game is one card: weather + park header (their idea), the two
          orders facing each other around a center spine, each hitter a
          full-size row with an HR-score bar, badges, and his line vs the
          arm he faces. Chips grew — a lineup you squint at isn't a tool. */}
      {mode === 'lineups' && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
          {lineupFocus && (
            <button onClick={() => setLineupFocus(null)} style={{
              flex: '1 1 100%', textAlign: 'left', cursor: 'pointer',
              background: 'transparent', border: `1px dashed ${C.border2}`, borderRadius: 9,
              padding: '6px 12px', fontSize: 11, fontWeight: 700, color: C.text3,
            }}>← All lineups</button>
          )}
          {(lineupFocus ? games.filter((g) => g.game_pk === lineupFocus) : games).map((g) => {
            const byTeam = {}
            ;(g.players || []).forEach((p) => {
              const t = p?.team || '?'
              ;(byTeam[t] = byTeam[t] || []).push(p)
            })
            Object.values(byTeam).forEach((l) => l.sort((a, b) => (Number(a?.lineup_spot) || 99) - (Number(b?.lineup_spot) || 99)))
            const any = (g.players || [])[0] || {}
            const temp = Number(any.weather_temp_f) || 0
            const wind = Number(any.weather_wind_mph) || 0
            const wLbl = String(any.wind_direction_label || '')
            const parkF = Number(any.park_hr_factor) || Number(any.park_dist_factor) || 0
            const isSel = g.game_pk === lineupFocus
            return (
              <div key={g.game_pk}
                ref={(el) => { if (el) gameRefs.current[g.game_pk] = el }}
                style={{
                flex: isSel ? '1 1 100%' : '1 1 460px', minWidth: 0, background: C.bg2,
                border: `1px solid ${isSel ? C.orange : C.border}`, borderRadius: 13, overflow: 'hidden',
                boxShadow: isSel ? `0 0 24px -8px ${C.orange}` : 'none', scrollMarginTop: 160,
              }}>
                {/* header: matchup + conditions, PF-style but ours */}
                <div style={{
                  display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap',
                  padding: '9px 14px', background: C.bg3, borderBottom: `1px solid ${C.border}`,
                }}>
                  <span style={{ fontSize: 14, fontWeight: 900, fontFamily: NUM_FONT }}>{g.away} @ {g.home}</span>
                  <span style={{ fontSize: 10, color: g.lineup_confirmed ? '#4ade80' : C.text3, fontFamily: NUM_FONT, fontWeight: 700 }}>
                    {g.lineup_confirmed ? '✓ confirmed' : '◻ projected'}
                  </span>
                  <span style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT }}>{localTime(g.game_time)}</span>
                  <span style={{ marginLeft: 'auto', display: 'flex', gap: 9, fontSize: 10, fontFamily: NUM_FONT }}>
                    {temp > 0 && <span style={{ color: temp >= 82 ? C.orange : C.text2 }}>{Math.round(temp)}°</span>}
                    {wind > 0 && <span style={{ color: /out/i.test(wLbl) ? C.orange : C.text3 }}>{/out/i.test(wLbl) ? '↗' : /in\b/i.test(wLbl) ? '↙' : '→'}{Math.round(wind)}mph</span>}
                    {parkF > 0 && <span style={{ color: parkF >= 1.03 ? C.orange : C.text3 }}>park ×{parkF.toFixed(2)}</span>}
                  </span>
                </div>
                <div className="lineup-cols" style={{ display: 'flex', gap: 0 }}>
                  {Object.entries(byTeam).map(([t, lineup], ti) => (
                    <div key={t} className="lineup-col" style={{
                      flex: 1, minWidth: 0, padding: '8px 12px',
                      borderLeft: ti ? `1px solid ${C.border}` : 'none',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 5 }}>
                        <span style={{ fontSize: 11, fontWeight: 900, fontFamily: NUM_FONT }}>{t}</span>
                        <span style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT }}>
                          vs {String(lineup[0]?.pitcher_name || 'TBD').split(' ').slice(-1)[0]}
                          {lineup[0]?.pitcher_projected ? ' ≈' : ''}
                          {lineup[0]?.pitcher_hr9 ? ` · ${Number(lineup[0].pitcher_hr9).toFixed(2)} HR/9` : ''}
                        </span>
                      </div>
                      {lineup.slice(0, 9).map((p) => {
                        const hs = hrScore(p)
                        return (
                          <div key={playerId(p)} onClick={() => onPlayerClick?.(p)}
                            style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '2.5px 0', cursor: 'pointer', minWidth: 0 }}>
                            <span style={{ fontFamily: NUM_FONT, fontSize: 10, color: C.text3, width: 11, flexShrink: 0 }}>{p?.lineup_spot ?? '·'}</span>
                            <span style={{ fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0, flex: 1 }}>
                              {p?.name}
                              <span style={{ fontFamily: NUM_FONT, fontSize: 9, color: C.text3, marginLeft: 4 }}>{p?.bats}</span>
                              {String(p?.game_pick_role || '').trim() && <span style={{ fontSize: 9, marginLeft: 3 }}>🤖</span>}
                              {p?.weak_spot_flag && <span style={{ fontSize: 9, marginLeft: 2 }}>⭐</span>}
                              {Number(p?.last5_hits) >= 6 && <span style={{ fontSize: 9, marginLeft: 2 }}>🧨</span>}
                            </span>
                            <div style={{ flex: '0 0 46px', height: 6, background: 'rgba(255,255,255,.06)', borderRadius: 3, overflow: 'hidden' }}>
                              <div style={{ width: `${Math.min(100, hs)}%`, height: '100%', borderRadius: 3,
                                background: hs >= 60 ? '#f97316' : hs >= 45 ? '#FCD34D' : 'rgba(255,255,255,.2)' }} />
                            </div>
                            <span style={{ fontFamily: NUM_FONT, fontSize: 10.5, fontWeight: 800, width: 22, textAlign: 'right', flexShrink: 0,
                              color: hs >= 60 ? C.orange : hs >= 45 ? '#FCD34D' : C.text3 }}>{hs.toFixed(0)}</span>
                          </div>
                        )
                      })}
                    </div>
                  ))}
                </div>

                {/* The game's designated picks ride under every lineup card
                    (2026-08-06, on request) — one chip per category, the same
                    five slots Results grades. */}
                {(() => {
                  const CAT_ORDER = ['TOP', 'HR', 'HIT', 'HRR', 'CONTACT']
                  const CAT_COLOR = { TOP: '#FCD34D', HR: '#FB923C', HIT: '#60A5FA', HRR: '#22d3ee', CONTACT: '#A78BFA' }
                  const CAT_SC = {
                    TOP: (p) => p?.top_board_score_v2 ?? p?.overall_score ?? 0,
                    HR: (p) => p?.hr_score ?? 0, HIT: (p) => p?.hit_score ?? 0,
                    HRR: (p) => p?.hrr_score ?? 0, CONTACT: (p) => p?.contact_score ?? 0,
                  }
                  const prim = (p) => String(p?.game_pick_role || '').split('/')[0].trim().toUpperCase()
                  const picks = CAT_ORDER
                    .map((cat) => (g.players || []).filter((p) => prim(p) === cat)
                      .sort((a, b) => (CAT_SC[cat](b) || 0) - (CAT_SC[cat](a) || 0))[0])
                    .filter(Boolean)
                  if (!picks.length) return null
                  return (
                    <div style={{
                      padding: '7px 12px', borderTop: `1px solid ${C.border}`, background: 'rgba(255,255,255,.015)',
                    }}>
                      {/* GRID (2026-08-06): five free-wrapping chips left one
                          orphan dangling off the line on narrow cards. Auto-
                          fit cells stretch every row edge to edge instead. */}
                      {/* ONE row of five, always (2026-08-06) — the wrapped
                          second row read as clutter. Chips squeeze instead of
                          wrapping; phones get the auto-fit fallback via CSS. */}
                      <div className="pickstrip" style={{ display: 'grid', gap: 5, gridTemplateColumns: `repeat(${picks.length}, minmax(0, 1fr))`, alignItems: 'stretch' }}>
                        {picks.map((p) => {
                          const cat = prim(p)
                          const col = CAT_COLOR[cat] || C.text3
                          return (
                            <button key={playerId(p)} onClick={(e) => { e.stopPropagation(); onPlayerClick?.(p) }} style={{
                              display: 'flex', gap: 5, alignItems: 'baseline', cursor: 'pointer', minWidth: 0,
                              border: `1px solid ${col}55`, background: `${col}10`,
                              borderRadius: 7, padding: '3px 8px',
                            }}>
                              <span style={{ fontSize: 8.5, fontWeight: 900, color: col, fontFamily: NUM_FONT, letterSpacing: '.05em', flexShrink: 0 }}>{cat}</span>
                              <span style={{ fontSize: 10.5, fontWeight: 700, color: C.text, minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{String(p?.name || '').split(' ').slice(-1)[0]}</span>
                              <span style={{ marginLeft: 'auto', fontSize: 9.5, fontWeight: 800, color: col, fontFamily: NUM_FONT, flexShrink: 0 }}>{(CAT_SC[cat](p) || 0).toFixed(0)}</span>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                })()}

                {/* Clicking a game bubble earns the DEPTH read (2026-08-06):
                    slot-by-slot — what this arm allows to each batting-order
                    spot (live API, b1–b9) braided with what the batter in
                    that spot does against this arm's side. 🔥 = both agree. */}
                {isSel && (
                  <div style={{ borderTop: `1px solid ${C.border}`, padding: '9px 12px', background: 'rgba(249,115,22,.02)' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginBottom: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 11, fontWeight: 900 }}>⚔ Slot-by-slot</span>
                      <span style={{ fontSize: 9, color: C.text3 }}>
                        bar = what the arm allows THAT spot (season OPS-against, live) · right numbers = the batter&apos;s AVG/ISO vs this arm&apos;s side
                        {' '}· 💥 slot bleeds · ⭐ side match · <b style={{ color: C.orange }}>🔥 both — the built-in mismatch</b>
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                      {Object.entries(byTeam).map(([t, lineup]) => (
                        <LineupSlotMatchup key={t} team={t} lineup={lineup} onPlayerClick={onPlayerClick} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── THE CARD GRID (restored 2026-08-08, owner feedback) ──────────
          The rundown LIST is gone as the top level: Default and Bot Output
          open on the heat-tinted, heat-SIZED game cards (GameStrip) — the
          grid Donovan liked — now carrying each game's TOP + HR headline
          picks and both lineup ✓ marks right on the card. Clicking a card
          opens the SAME in-place deep-dive the rundown had, directly under
          the grid; clicking the card (or its header) again closes it. */}
      {mode !== 'lineups' && (
        <>
          <GameStrip games={games} activeGame={activeGame} onSelect={scrollTo} mode={mode} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
              {games.filter((g) => g.game_pk === activeGame).map((g) => {
                const picks = picksFor(g)
                const isDesignated = picks.length > 0
                const sorted = isDesignated
                  ? picks
                  : [...g.players].sort((a, b) => hrScore(b) - hrScore(a)).slice(0, 4)
                const past = isPast(g.game_time)
                const isActive = g.game_pk === activeGame
                const sides = sidesOf(g)
                const any = (g.players || [])[0] || {}
                const temp = Number(any.weather_temp_f) || 0
                const wind = Number(any.weather_wind_mph) || 0
                const wLbl = String(any.wind_direction_label || '')
                const parkF = Number(any.park_hr_factor) || Number(any.park_dist_factor) || 0

                return (
                  <section
                    key={g.game_pk}
                    ref={(el) => { gameRefs.current[g.game_pk] = el }}
                    style={{
                      scrollMarginTop: 160, minWidth: 0,
                      background: isActive ? `linear-gradient(160deg, rgba(249,115,22,.05), ${C.bg2} 45%)` : C.bg2,
                      border: `1px solid ${isActive ? 'rgba(249,115,22,.5)' : C.border}`,
                      borderRadius: 14, overflow: 'hidden',
                      boxShadow: isActive ? '0 0 26px -10px rgba(249,115,22,.5)' : 'none',
                      opacity: past && !isActive ? 0.65 : 1,
                    }}
                  >
                    {/* ── card header: matchup + duel + conditions + picks ── */}
                    <div
                      onClick={() => setActive(isActive ? null : g.game_pk)}
                      style={{ cursor: 'pointer', padding: '11px 14px 10px' }}
                      title={isActive ? 'Collapse this game' : 'Open the full read on this game'}
                    >
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', minWidth: 0 }}>
                        <span style={{ fontSize: 17, fontWeight: 900, fontFamily: NUM_FONT, letterSpacing: '-.02em', color: past ? C.text3 : C.text }}>
                          {past ? '✓ ' : ''}{g.away || '—'} <span style={{ color: C.text3, fontWeight: 400 }}>@</span> {g.home || '—'}
                        </span>
                        <span style={{ fontSize: 10, fontWeight: 700, fontFamily: NUM_FONT, color: g.lineup_confirmed ? C.green : C.text3 }}>
                          {g.lineup_confirmed ? '✓ lineups in' : '◻ projected'}
                        </span>
                        <span style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT }}>{localTime(g.game_time)}</span>
                        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'baseline', gap: 9, fontSize: 10, fontFamily: NUM_FONT, flexShrink: 0 }}>
                          {temp > 0 && <span title="Game-time temperature" style={{ color: temp >= 82 ? C.orange : C.text3 }}>{Math.round(temp)}°</span>}
                          {wind > 0 && <span title={`Wind: ${wLbl || 'direction n/a'}`} style={{ color: /out/i.test(wLbl) ? C.orange : C.text3 }}>{/out/i.test(wLbl) ? '↗' : /in\b/i.test(wLbl) ? '↙' : '→'}{Math.round(wind)}</span>}
                          {parkF > 0 && <span title="Park HR factor — above 1.00 the yard helps hitters" style={{ color: parkF >= 1.03 ? C.orange : C.text3 }}>×{parkF.toFixed(2)}</span>}
                          <span style={{ color: isActive ? C.orange : C.text3, fontWeight: 800 }}>{isActive ? '▾' : '▸'}</span>
                        </span>
                      </div>

                      {/* the pitcher duel — each side wears the arm ITS bats face */}
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 7 }}>
                        {sides.map((s) => (
                          <div key={s.team} style={{
                            flex: '1 1 200px', minWidth: 0, display: 'flex', alignItems: 'baseline', gap: 7,
                            background: 'rgba(255,255,255,.025)', border: `1px solid ${C.border}`,
                            borderRadius: 8, padding: '4px 10px',
                          }}>
                            <span style={{ fontSize: 10.5, fontWeight: 900, fontFamily: NUM_FONT, flexShrink: 0 }}>{s.team}</span>
                            <span style={{ fontSize: 9.5, color: C.text3, flexShrink: 0 }}>vs</span>
                            <span style={{ fontSize: 10.5, fontWeight: 700, color: C.text2, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {s.arm}{s.throws ? ` (${s.throws})` : ''}{s.projected ? ' ≈' : ''}
                            </span>
                            <span style={{ marginLeft: 'auto', display: 'flex', gap: 7, flexShrink: 0, fontFamily: NUM_FONT, fontSize: 9.5 }}>
                              {s.hr9 != null && (
                                <span title="HR allowed per 9 innings — higher favors the bats" style={{ color: s.hr9 >= 1.3 ? C.orange : C.text3, fontWeight: 700 }}>
                                  {s.hr9.toFixed(2)} HR/9
                                </span>
                              )}
                              {/* Bot Output speaks in bars (owner feedback
                                  2026-08-08): the duel's HR/9 gets one too,
                                  scaled 0–2.00 like the pen board reads. */}
                              {mode === 'botview' && s.hr9 != null && (
                                <span style={{ width: 44, height: 5, background: 'rgba(255,255,255,.07)', borderRadius: 3, overflow: 'hidden', alignSelf: 'center' }}>
                                  <span style={{ display: 'block', width: `${Math.min(100, (s.hr9 / 2) * 100)}%`, height: '100%', background: s.hr9 >= 1.3 ? '#f87171' : s.hr9 >= 1.05 ? '#22d3ee' : '#4ade80' }} />
                                </span>
                              )}
                              {s.stars > 0 && (
                                <span title={`${s.stars} weak lineup spot${s.stars > 1 ? 's' : ''} this order can reach`} style={{ color: '#FCD34D', fontWeight: 800 }}>★{s.stars}</span>
                              )}
                            </span>
                          </div>
                        ))}
                      </div>

                      {/* pick chips — the bot's five slots, always visible */}
                      {picks.length > 0 && (
                        <div className="pickstrip" style={{ display: 'grid', gap: 5, gridTemplateColumns: `repeat(${picks.length}, minmax(0, 1fr))`, alignItems: 'stretch', marginTop: 8 }}>
                          {picks.map((p) => {
                            const cat = primaryRole(p)
                            const col = CAT_COLOR[cat] || C.text3
                            return (
                              <button key={playerId(p)} onClick={(e) => { e.stopPropagation(); onPlayerClick?.(p) }} style={{
                                display: 'flex', gap: 5, alignItems: 'baseline', cursor: 'pointer', minWidth: 0,
                                border: `1px solid ${col}55`, background: `${col}10`,
                                borderRadius: 7, padding: '3px 8px',
                              }}>
                                <span style={{ fontSize: 8.5, fontWeight: 900, color: col, fontFamily: NUM_FONT, letterSpacing: '.05em', flexShrink: 0 }}>{cat}</span>
                                <span style={{ fontSize: 10.5, fontWeight: 700, color: C.text, minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{String(p?.name || '').split(' ').slice(-1)[0]}</span>
                                <span style={{ marginLeft: 'auto', fontSize: 9.5, fontWeight: 800, color: col, fontFamily: NUM_FONT, flexShrink: 0 }}>{(CAT_SCORE[cat](p) || 0).toFixed(0)}</span>
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>

                    {/* ── expanded: the full read, in place ── */}
                    {isActive && (
                      <div style={{ borderTop: `1px solid ${C.border}`, padding: '12px 14px 14px', background: 'rgba(0,0,0,.15)' }}>
                        <GameDeepDive game={g} allPlayers={players} slateDate={slateDate} onPlayerClick={onPlayerClick} />
                        <GameLineup players={g.players} onPlayerClick={onPlayerClick} />

                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '12px 0 8px' }}>
                          <span style={{ fontSize: 11.5, fontWeight: 800 }}>
                            {isDesignated ? '🎯 This game’s bot picks' : 'Top by HR score'}
                          </span>
                          <span style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT }}>
                            {isDesignated
                              ? 'one per category, the same five slots Results grades'
                              : 'no designated picks published for this game yet'}
                          </span>
                        </div>

                        {/* FLEX, NOT GRID, on purpose — the last row stretches to
                            fill, no orphan card beside empty cells. Each card wears
                            its category as a ring + tag: one object, labelled. */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'stretch' }}>
                          {sorted.map((p) => {
                            const roleInfo = isDesignated ? getRoleDisplay(p) : null
                            const wrap = (inner) => (
                              <div key={playerId(p)} style={{
                                flex: '1 1 240px', minWidth: 0, position: 'relative',
                                display: 'flex', flexDirection: 'column',
                                marginTop: roleInfo ? 9 : 0,
                                minHeight: 170,
                              }}>
                                {roleInfo && (
                                  <span style={{
                                    position: 'absolute', top: -8, left: 13, zIndex: 2,
                                    background: '#09090b',
                                    border: `1px solid ${roleInfo.color}99`,
                                    color: roleInfo.color, borderRadius: 6, padding: '1px 9px',
                                    fontSize: 9, fontWeight: 900, letterSpacing: '.08em',
                                    textTransform: 'uppercase', fontFamily: NUM_FONT,
                                    boxShadow: `0 0 10px ${roleInfo.color}33`,
                                  }}>{roleInfo.label}</span>
                                )}
                                <div style={{
                                  flex: 1, display: 'flex', flexDirection: 'column',
                                  borderRadius: 14,
                                  boxShadow: roleInfo
                                    ? `0 0 0 1px ${roleInfo.color}66, 0 0 16px ${roleInfo.color}1c`
                                    : 'none',
                                }}>{inner}</div>
                              </div>
                            )
                            if (mode === 'botview') {
                  const { color: lcolor } = getRoleDisplay(p)
                  const pills = Array.isArray(p?.signal_pills) ? p.signal_pills : []
                  // Each bar in its category's site-wide colour, and the bar
                  // for the category HE'S PICKED FOR renders at full weight
                  // while the rest sit dimmed — so the card answers "how
                  // strong is he at the thing he's here for" at a glance
                  // instead of five identical orange bars.
                  const pickedCat = String(p?.game_pick_role || '').split('/')[0].trim().toUpperCase()
                  const scores = [
                    { k: 'hr_score',      l: 'HR',  c: '#FB923C', cat: 'HR' },
                    { k: 'hrr_score',     l: 'HRR', c: '#22d3ee', cat: 'HRR' },
                    { k: 'hit_score',     l: 'HIT', c: '#60A5FA', cat: 'HIT' },
                    { k: 'contact_score', l: 'CTG', c: '#A78BFA', cat: 'CONTACT' },
                    { k: 'overall_score', l: 'OVR', c: '#FCD34D', cat: 'TOP' },
                  ]
                  return wrap(
                    <div
                      onClick={() => onPlayerClick?.(p)}
                      style={{
                        background: C.bg2, border: `1px solid ${C.border}`,
                        borderRadius: 10,
                        padding: '11px 14px', cursor: 'pointer', flex: 1,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 2, minWidth: 0 }}>
                        {/* same rule as PlayerCard: long names shrink, never clip */}
                        <span title={p?.name || ''} style={{
                          fontSize: String(p?.name || '').length > 18 ? 11.5 : 13,
                          fontWeight: 700, lineHeight: 1.25, minWidth: 0,
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>{p?.name || '—'}</span>
                      </div>
                      <div style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT, marginBottom: 8 }}>
                        {p?.team} #{p?.lineup_spot ?? '?'} · vs {p?.pitcher_name || '?'} ({p?.pitcher_throws || '?'})
                      </div>
                      {scores.map(({ k, l, c, cat }) => {
                        const val = Math.min(100, Math.max(0, p?.[k] || 0))
                        const isHis = cat === pickedCat
                        return (
                          <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3, opacity: isHis || !pickedCat ? 1 : 0.5 }}>
                            <span style={{ width: 26, fontSize: 9, color: isHis ? c : C.text3, fontWeight: isHis ? 800 : 400, fontFamily: NUM_FONT, textTransform: 'uppercase' }}>{l}</span>
                            <div style={{ flex: 1, height: isHis ? 6 : 4, background: 'rgba(255,255,255,0.07)', borderRadius: 3 }}>
                              <div style={{ width: `${val}%`, height: '100%', background: c, borderRadius: 3, boxShadow: isHis ? `0 0 8px ${c}66` : 'none' }} />
                            </div>
                            <span style={{ width: 24, fontSize: 10, fontWeight: isHis ? 800 : 400, color: isHis ? c : 'rgba(255,255,255,0.6)', fontFamily: NUM_FONT, textAlign: 'right' }}>{val.toFixed(0)}</span>
                          </div>
                        )
                      })}
                      {/* MORE BARS (owner feedback 2026-08-08): Bot Output is
                          the graph view — the card's remaining numbers join
                          the bar language instead of sitting as text. Same
                          row grammar as the five categories, dimmer voice.
                          ARM is the opposing starter's HR/9 on a 0–2.00 bar
                          (higher = the arm bleeds homers, good for the bat). */}
                      {(() => {
                        const extras = [
                          { l: 'HRW', v: Number(p?.hrw_score) || 0, max: 100, c2: '#f472b6', txt: (Number(p?.hrw_score) || 0).toFixed(0), tip: 'HR Watch score' },
                          { l: 'DMG', v: Number(p?.damage_conversion_score) || 0, max: 100, c2: '#34d399', txt: (Number(p?.damage_conversion_score) || 0).toFixed(0), tip: 'Damage conversion score' },
                          { l: 'ARM', v: Number(p?.pitcher_hr9) || 0, max: 2, c2: '#f87171', txt: (Number(p?.pitcher_hr9) || 0).toFixed(2), tip: 'Opposing starter HR/9 — bar runs 0 to 2.00, higher favors the bat' },
                        ].filter((e) => e.v > 0)
                        if (!extras.length) return null
                        return (
                          <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 6, paddingTop: 5 }}>
                            {extras.map((e) => (
                              <div key={e.l} title={e.tip} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3, opacity: 0.85 }}>
                                <span style={{ width: 26, fontSize: 9, color: C.text3, fontFamily: NUM_FONT, textTransform: 'uppercase' }}>{e.l}</span>
                                <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.07)', borderRadius: 3 }}>
                                  <div style={{ width: `${Math.min(100, (e.v / e.max) * 100)}%`, height: '100%', background: e.c2, borderRadius: 3 }} />
                                </div>
                                <span style={{ width: 30, fontSize: 10, color: 'rgba(255,255,255,0.6)', fontFamily: NUM_FONT, textAlign: 'right' }}>{e.txt}</span>
                              </div>
                            ))}
                          </div>
                        )
                      })()}
                      {pills.length > 0 && (
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 8 }}>
                          {pills.map((pill, i) => (
                            <span key={i} title={pillMeta(pill).title} style={pillStyle(pill, NUM_FONT)}>{pill}</span>
                          ))}
                        </div>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); onAdd?.(p, p?.best_bet_type) }}
                        style={{ width: '100%', marginTop: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.75)', borderRadius: 8, padding: '6px 10px', fontSize: 11, cursor: 'pointer' }}
                      >
                        + Add to Slip
                      </button>
                    </div>
                  )
                }
                            return wrap(
                              <PlayerCard
                                p={p} type="hr"
                                onAdd={onAdd} onWatch={onWatch}
                                watched={watchIds.has(playerId(p))}
                                onClick={() => onPlayerClick?.(p)}
                              />
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </section>
                )
              })}
          </div>
        </>
      )}

      {/* Bottom of the page on purpose. The strip and the game panel are the
          task; this is the check you read afterwards to see whether the slate
          agreed with what you just looked at. */}
      <ProjectedOutput games={games} players={players} />

    </div>
  )
}
