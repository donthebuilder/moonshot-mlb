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

export default function Games({ players, onAdd, onWatch, watchIds, onPlayerClick }) {
  const [mode, setMode]         = useState('default')
  const [activeGame, setActive] = useState(null)
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
    setActive(pk)
    const el = gameRefs.current[pk]
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div>
      <PanelTitle
        title="Games"
        sub={`${games.length} games · ${slots.length} time slots`}
        right={
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => setMode('default')} style={btnStyle(C.orange, mode === 'default')}>Default</button>
            <button onClick={() => setMode('botview')} style={btnStyle(C.cyan,   mode === 'botview')}>Bot Output</button>
            <button onClick={() => setMode('lineups')} style={btnStyle(C.green,  mode === 'lineups')}>Lineups</button>
          </div>
        }
      />

      {/* Game selector. Was a sticky bar of matchup pills -- it told you a
          game existed and nothing else, so picking one meant opening several
          to find the live one. The cards carry the deciding numbers. */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 20, background: '#09090b',
        paddingTop: 4, paddingBottom: 8, marginBottom: 14,
        borderBottom: `1px solid ${C.border}`,
      }}>
        <GameStrip games={games} activeGame={activeGame} onSelect={scrollTo} />
      </div>

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
          {games.map((g) => {
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
            return (
              <div key={g.game_pk} style={{
                flex: '1 1 460px', minWidth: 0, background: C.bg2,
                border: `1px solid ${C.border}`, borderRadius: 13, overflow: 'hidden',
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
                <div style={{ display: 'flex', gap: 0 }}>
                  {Object.entries(byTeam).map(([t, lineup], ti) => (
                    <div key={t} style={{
                      flex: 1, minWidth: 0, padding: '8px 12px',
                      borderLeft: ti ? `1px solid ${C.border}` : 'none',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 5 }}>
                        <span style={{ fontSize: 11, fontWeight: 900, fontFamily: NUM_FONT }}>{t}</span>
                        <span style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT }}>
                          vs {String(lineup[0]?.pitcher_name || 'TBD').split(' ').slice(-1)[0]}
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
              </div>
            )
          })}
        </div>
      )}

      {/* ── Selected game ── */}
      {/* Only the selected game renders. The strip above is the selector; an
          accordion of all fifteen underneath was the same list a second time,
          and because every row started collapsed the lineup table was never
          on screen. */}
      {mode !== 'lineups' && games.filter((g) => g.game_pk === activeGame).map((g) => {
        // THE GAME'S DESIGNATED PICKS, one per category — the same five slots
        // the results tracker grades. This grid used to show the top 8 by HR
        // score, which overlapped the picks but wasn't them: a game could
        // show eight power bats while its actual HIT and CONTACT picks sat
        // below the cut, so what you saw here never matched what Results
        // graded. Now it's exactly the bot's slots, in category order. If a
        // game somehow carries two hitters with the same primary role, the
        // higher score on that category's own scale wins — same rule as The
        // Four — so there is always exactly one per category.
        const CAT_ORDER = ['TOP', 'HR', 'HIT', 'HRR', 'CONTACT']
        const CAT_SCORE = {
          TOP: (p) => p?.top_board_score_v2 ?? p?.overall_score ?? p?.hr_score ?? 0,
          HR: (p) => p?.hr_score ?? 0,
          HIT: (p) => p?.hit_score ?? 0,
          HRR: (p) => p?.hrr_score ?? 0,
          CONTACT: (p) => p?.contact_score ?? 0,
        }
        const primaryRole = (p) => String(p?.game_pick_role || '').split('/')[0].trim().toUpperCase()
        const picks = CAT_ORDER
          .map((cat) => [...g.players]
            .filter((p) => primaryRole(p) === cat)
            .sort((a, b) => (CAT_SCORE[cat](b) || 0) - (CAT_SCORE[cat](a) || 0))[0])
          .filter(Boolean)
        // Fallback for a game with no designated picks published yet (early
        // slate build): top four by HR score, labelled as such below.
        const sorted = picks.length
          ? picks
          : [...g.players].sort((a, b) => hrScore(b) - hrScore(a)).slice(0, 4)
        const isDesignated = picks.length > 0
        const past = isPast(g.game_time)
        const isActive = true

        return (
          <section
            key={g.game_pk}
            ref={el => { gameRefs.current[g.game_pk] = el }}
            style={{ marginBottom: isActive ? 28 : 4, scrollMarginTop: 160 }}
          >
            {/* game header — click toggles which game is expanded */}
            <div
              onClick={() => {}}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                marginBottom: isActive ? 10 : 0, padding: isActive ? '0 0 8px' : '8px 4px',
                borderBottom: `2px solid ${isActive ? C.orange : C.border}`,
                cursor: 'pointer', transition: 'border-color .15s, padding .15s',
                background: isActive ? 'transparent' : 'rgba(255,255,255,0.015)',
                borderRadius: isActive ? 0 : 8,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div>
                  <div style={{ fontSize: isActive ? 15 : 13, fontWeight: 800, color: past ? C.text3 : C.text }}>
                    {past ? '✓ ' : ''}{g.away || '—'} @ {g.home || '—'}
                  </div>
                  {isActive && (
                    <div style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT, marginTop: 2 }}>
                      {localTime(g.game_time)} · {g.lineup_confirmed ? 'Lineup confirmed' : 'Projected lineup'}
                      {past && <span style={{ color: C.border, marginLeft: 6 }}>· Game passed</span>}
                    </div>
                  )}
                </div>
              </div>
              <div style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT }}>
                {!isActive && `${localTime(g.game_time)} · `}{g.players.length} batters
              </div>
            </div>

            {isActive && (
              <GameLineup players={g.players} onPlayerClick={onPlayerClick} />
            )}

            {isActive && (
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
            )}

            {/* FLEX, NOT GRID, on purpose. Five cards in an auto-fit grid
                leave an orphan on any width that fits four columns — one card
                alone with three empty cells, which is the "rows aren't full"
                problem. Flex with grow lets the last row stretch to fill, so
                the five picks always occupy the complete width, and each card
                wears its category as a colored banner so the row reads as the
                five slots rather than five loose players. */}
            {isActive && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'stretch' }}>
              {sorted.map((p) => {
                const roleInfo = isDesignated ? getRoleDisplay(p) : null
                // CONNECTED, not stacked. The first pass put a banner strip
                // ON TOP of each card — but the card keeps its own border and
                // corners, so banner and card read as two disconnected boxes.
                // Now the category is a ring drawn around the card itself
                // (boxShadow hugs whatever radius the card has) with the
                // label as a tag punched through the top edge — one object,
                // clearly labelled, instead of a hat on a box.
                const wrap = (inner) => (
                  <div key={playerId(p)} style={{
                    flex: '1 1 225px', minWidth: 0, position: 'relative',
                    display: 'flex', flexDirection: 'column',
                    marginTop: roleInfo ? 9 : 0,
                    minHeight: 190,
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
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 2 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.25 }}>{p?.name || '—'}</span>
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
            )}
          </section>
        )
      })}

      {/* Bottom of the page on purpose. The strip and the game panel are the
          task; this is the check you read afterwards to see whether the slate
          agreed with what you just looked at. */}
      <ProjectedOutput games={games} players={players} />

    </div>
  )
}
