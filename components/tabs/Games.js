'use client'
import { useMemo, useState, useRef, useEffect } from 'react'
import { C, NUM_FONT } from '../../lib/theme'
import { groupGames } from '../../lib/data'
import { dateText, playerId, hrScore } from '../../lib/player'
import { PanelTitle, Grid, Empty, btnStyle } from '../ui'
import PlayerCard from '../PlayerCard'
import SlateGlance from '../SlateGlance'
import Heatmap from '../Heatmap'

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
          </div>
        }
      />

      {/* Slate-level view first: which games are worth attention at a glance.
          Ported from the Streamlit build -- the nav bar below tells you what
          exists, this tells you which of it matters. */}
      <SlateGlance games={games} players={players} onGameClick={scrollTo} />

      {/* ── Game nav bar ── */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 20,
        background: '#09090b',
        borderBottom: `1px solid ${C.border}`,
        marginBottom: 18, paddingBottom: 8,
        paddingTop: 4,
      }}>
        {slots.map(([slot, slotGames]) => {
          const allPast = slotGames.every(g => isPast(g.game_time))
          return (
            <div key={slot} style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
              {/* time slot label — inline with its pills, not stacked above, so a single-game slot doesn't cost a full extra row */}
              <span style={{
                fontSize: 9, fontWeight: 700, color: allPast ? C.border : C.text3,
                textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: NUM_FONT,
                flexShrink: 0, minWidth: 58,
              }}>
                {localTime(slotGames[0].game_time)}
              </span>
              {/* game pills for this slot */}
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {slotGames.map(g => {
                  const past = isPast(g.game_time)
                  const active = activeGame === g.game_pk
                  return (
                    <button
                      key={g.game_pk}
                      onClick={() => scrollTo(g.game_pk)}
                      style={{
                        padding: '4px 8px', fontSize: 10.5, fontWeight: 700, borderRadius: 6,
                        cursor: 'pointer', whiteSpace: 'nowrap',
                        border: `1px solid ${active ? C.orange : past ? C.border : 'rgba(255,255,255,0.15)'}`,
                        background: active ? `${C.orange}22` : past ? 'transparent' : 'rgba(255,255,255,0.04)',
                        color: active ? C.orange : past ? C.border : C.text2,
                        opacity: past ? 0.5 : 1,
                        textDecoration: past ? 'line-through' : 'none',
                      }}
                    >
                      {g.away} @ {g.home}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Game sections ── */}
      {games.map((g) => {
        const sorted = [...g.players].sort((a, b) => hrScore(b) - hrScore(a)).slice(0, 8)
        const past = isPast(g.game_time)
        const isActive = activeGame === g.game_pk

        return (
          <section
            key={g.game_pk}
            ref={el => { gameRefs.current[g.game_pk] = el }}
            style={{ marginBottom: isActive ? 28 : 4, scrollMarginTop: 160 }}
          >
            {/* game header — click toggles which game is expanded */}
            <div
              onClick={() => setActive(isActive ? null : g.game_pk)}
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
                <span style={{
                  fontSize: 10, color: C.text3, transform: isActive ? 'rotate(90deg)' : 'none',
                  transition: 'transform .15s', display: 'inline-block', width: 10,
                }}>▸</span>
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
            <Grid>
              {sorted.map((p) => {
                if (mode === 'botview') {
                  const { label, color: lcolor } = getRoleDisplay(p)
                  const pills = Array.isArray(p?.signal_pills) ? p.signal_pills : []
                  const scores = [
                    { k: 'hr_score',      l: 'HR'  },
                    { k: 'hrr_score',     l: 'HRR' },
                    { k: 'hit_score',     l: 'HIT' },
                    { k: 'contact_score', l: 'CTG' },
                    { k: 'overall_score', l: 'OVR' },
                  ]
                  return (
                    <div
                      key={playerId(p)}
                      onClick={() => onPlayerClick?.(p)}
                      style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 10, padding: '11px 14px', cursor: 'pointer' }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 2 }}>
                        <span style={{ fontSize: 14, fontWeight: 600 }}>{p?.name || '—'}</span>
                        <span style={{ fontSize: 10, fontWeight: 700, color: lcolor, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</span>
                      </div>
                      <div style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT, marginBottom: 8 }}>
                        {p?.team} #{p?.lineup_spot ?? '?'} · vs {p?.pitcher_name || '?'} ({p?.pitcher_throws || '?'})
                      </div>
                      {scores.map(({ k, l }) => {
                        const val = Math.min(100, Math.max(0, p?.[k] || 0))
                        return (
                          <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                            <span style={{ width: 26, fontSize: 9, color: C.text3, fontFamily: NUM_FONT, textTransform: 'uppercase' }}>{l}</span>
                            <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.07)', borderRadius: 2 }}>
                              <div style={{ width: `${val}%`, height: '100%', background: C.orange, borderRadius: 2 }} />
                            </div>
                            <span style={{ width: 24, fontSize: 10, color: 'rgba(255,255,255,0.6)', fontFamily: NUM_FONT, textAlign: 'right' }}>{val.toFixed(0)}</span>
                          </div>
                        )
                      })}
                      {pills.length > 0 && (
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 8 }}>
                          {pills.map((pill, i) => (
                            <span key={i} style={{ fontSize: 10, background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 5, padding: '2px 7px', fontFamily: NUM_FONT }}>{pill}</span>
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
                return (
                  <PlayerCard
                    key={playerId(p)}
                    p={p} type="hr"
                    onAdd={onAdd} onWatch={onWatch}
                    watched={watchIds.has(playerId(p))}
                    onClick={() => onPlayerClick?.(p)}
                  />
                )
              })}
            </Grid>
            )}
          </section>
        )
      })}
    </div>
  )
}
