'use client'
import { useEffect, useMemo, useState } from 'react'
import { C, NUM_FONT, gradeFor } from '../../../lib/nfl/theme'
import { ActiveFilters, FilterBar, FilterSearch, Segmented } from '../../Filters'

const HEADLINE_MARKETS = new Set(['TD', 'REC_YDS', 'RUSH_YDS', 'REC', 'PASS_YDS', 'KICK_PTS'])

// Games — the slate, one card per matchup: real scoreboard weight up top,
// each side's best plays underneath.
//
// Folded Live's real-time scoreboard treatment (pulse dot, big score line,
// cyan glow card) in here on 2026-08-24 rather than keeping it a separate
// tab — two tabs answering "what's the score" and "what should I play" cost
// a click apiece for no reason when one card can carry both honestly. See
// Live.js's header (kept on disk, no longer wired into NflDashboard.js/TABS)
// for exactly which fields this is and isn't built on — same ESPN scoreboard
// fetch, same absence of possession and of quarter/clock as separate fields
// (`detail` already arrives as ESPN's own formatted "Q3 8:42" string).
//
// Kept the "top three per team" scoping from the original design on
// purpose. This is still the orientation tab: you come here to see WHAT'S
// ON, not to research. Everything deeper is one tab over, and a card that
// tries to be a board is neither.

function StateBadge({ g }) {
  if (g.state === 'in') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <span style={{
          width: 7, height: 7, borderRadius: 999, background: C.cyan,
          boxShadow: `0 0 6px ${C.cyan}`, flexShrink: 0,
        }} />
        <span style={{
          fontSize: 10, fontWeight: 900, color: C.cyan, letterSpacing: '.06em', fontFamily: NUM_FONT,
        }}>{g.detail || 'LIVE'}</span>
      </span>
    )
  }
  if (g.completed) {
    return (
      <span style={{
        fontSize: 9.5, fontWeight: 900, color: C.text3, letterSpacing: '.08em', textTransform: 'uppercase',
      }}>Final</span>
    )
  }
  // ── A KICKOFF THAT HAS ALREADY HAPPENED IS NOT AN UPCOMING GAME ─────────
  // (2026-08-29, Donovan: "whats up with the games tab on the nfl page.")
  // The published payload was built 2026-08-21 and never rebuilt: preseason
  // ended, so the bot's wave filter finds nothing ahead of today and the
  // branch keeps carrying that build. Sixteen games sat on the tab, fourteen
  // of them still flagged neither live nor complete, printing a future-tense
  // kickoff time for games that had finished a week earlier. Two were marked
  // FINAL; the rest read as tonight's football.
  //
  // The payload cannot be trusted to mark them, so the clock decides: a
  // kickoff in the past on a game the feed never closed out is a game the
  // feed stopped following, and it says so instead of naming an hour that
  // has been and gone. This is the same rule the MLB side already applies to
  // stale odds quotes -- when the data stops moving, say so, don't dress it
  // up as current.
  const kicked = (() => {
    if (!g.kickoff) return false
    const at = Date.parse(g.kickoff)
    return Number.isFinite(at) && at < Date.now()
  })()
  if (kicked) {
    return (
      <span
        title="This game's kickoff has passed and the feed never marked it live or final, so the bot has no result for it. The card below is the last thing the bot published about this game, not a live read."
        style={{ fontSize: 9.5, fontWeight: 900, color: '#fbbf24', letterSpacing: '.06em', textTransform: 'uppercase', cursor: 'default' }}
      >Kickoff passed · not tracked</span>
    )
  }
  let t = g.detail
  if (!t && g.kickoff) {
    try {
      t = new Date(g.kickoff).toLocaleString('en-US', {
        weekday: 'short', hour: 'numeric', minute: '2-digit',
      })
    } catch { t = 'TBD' }
  }
  return <span style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT }}>{t || 'TBD'}</span>
}

// Real scoreboard weight — 21px numerals, not the 12px line the score used
// to share with the kickoff label. Shown for both live and final states;
// pregame cards get the plain matchup headline instead (there's no score to
// carry yet).
function ScoreLine({ g }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontFamily: NUM_FONT, marginBottom: 4 }}>
      <span style={{ fontSize: 11.5, fontWeight: 800, color: C.text2, minWidth: 28 }}>{g.away}</span>
      <span style={{ fontSize: 21, fontWeight: 900, color: C.text }}>{g.away_score ?? 0}</span>
      <span style={{ fontSize: 12, color: C.text3 }}>–</span>
      <span style={{ fontSize: 21, fontWeight: 900, color: C.text }}>{g.home_score ?? 0}</span>
      <span style={{ fontSize: 11.5, fontWeight: 800, color: C.text2, minWidth: 28 }}>{g.home}</span>
    </div>
  )
}

function SidePicks({ players, team, onPlayerClick }) {
  const rows = players
    .filter((p) => p.team === team && !p.low_sample)
    .sort((a, b) => (b.scores?.TD ?? 0) - (a.scores?.TD ?? 0))
    .slice(0, 3)

  if (!rows.length) {
    return <div style={{ fontSize: 10.5, color: C.text3, padding: '6px 0' }}>No scored players</div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
      {rows.map((p) => {
        const g = gradeFor(p.scores?.TD)
        return (
          <button
            key={p.player_id}
            onClick={() => onPlayerClick?.(p)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, width: '100%',
              background: 'rgba(255,255,255,.03)', border: `1px solid ${C.border}`,
              borderRadius: 8, padding: '5px 8px', cursor: 'pointer', textAlign: 'left',
            }}
          >
            <span style={{
              fontFamily: NUM_FONT, fontSize: 11, fontWeight: 900, color: g.color,
              minWidth: 30,
            }}>{Math.round(p.scores?.TD ?? 0)}</span>
            <span style={{
              fontSize: 11, color: C.text, fontWeight: 600, flex: 1,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{p.name}</span>
            <span style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT }}>{p.position}</span>
            {p.questionable && (
              <span style={{ fontSize: 8.5, color: C.yellow, fontWeight: 900 }}>Q</span>
            )}
          </button>
        )
      })}
    </div>
  )
}

function DesignatedCalls({ game, picks, playersById, onPlayerClick }) {
  const calls = Object.entries(picks?.card || {}).filter(([market]) => HEADLINE_MARKETS.has(market))
    .map(([market, block]) => ({ market, block, call: block?.rungs?.[0] }))
    .filter(({ call }) => call && (call.team === game.away || call.team === game.home))
  if (!calls.length) return <div style={{ color: C.text3, fontSize: 9.5 }}>No headline call lands in this game.</div>
  return <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>{calls.map(({ market, block, call }) => {
    const player = playersById[String(call.player_id)]
    const grade = gradeFor(call.score)
    return <button key={market} onClick={() => player && onPlayerClick?.(player, market)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', border: `1px solid ${grade.color}45`, borderRadius: 8, background: `${grade.color}0d`, color: C.text, cursor: player ? 'pointer' : 'default', textAlign: 'left' }}><span style={{ color: grade.color, fontFamily: NUM_FONT, fontSize: 8, fontWeight: 900 }}>{market}</span><b style={{ fontSize: 9.5 }}>{call.name}</b><em style={{ color: C.text3, fontFamily: NUM_FONT, fontSize: 8, fontStyle: 'normal' }}>bar {block.bar}</em></button>
  })}</div>
}

function softRole(matchup, defense) {
  const roles = matchup?.dvp?.season?.[defense] || {}
  const ranked = Object.entries(roles).filter(([, row]) => Number.isFinite(Number(row?.td_rank)))
    .sort((a, b) => Number(a[1].td_rank) - Number(b[1].td_rank))
  if (!ranked.length) return null
  return { role: ranked[0][0], ...ranked[0][1] }
}

// REST (2026-08-28, B7). A blunt but real fatigue proxy -- days since each
// team's last game, computed purely from schedule dates
// (bots/nfl/nfl_espn.py's attach_rest_days()), no new API. Distinct from
// the DVP softness tiles below: this is about the TEAM being tired, not
// about which role a defense leaks. Week 1 and any team missing a prior
// game in the pool honestly shows '—', never a guessed number.
function restLabel(days, shortWeek) {
  if (days == null) return '—'
  return `${days}d${shortWeek ? ' ⚠' : ''}`
}

function GameIntel({ game, matchup }) {
  const awayDefense = softRole(matchup, game.away)
  const homeDefense = softRole(matchup, game.home)
  const hasWeather = Number.isFinite(game.weather_temp_f)
  return <div className="nfl-game-intel">
    <div><small>ENVIRONMENT</small><b style={{ color: game.indoors ? C.cyan : C.text2 }}>{game.indoors ? 'INDOORS' : hasWeather ? `${Math.round(game.weather_temp_f)}°F` : 'OUTDOORS'}</b><span>{game.indoors ? 'weather removed from the game' : hasWeather ? (game.weather_condition || 'forecast published') : 'forecast not yet published for this game'}</span></div>
    <div><small>REST</small><b>{game.away} {restLabel(game.away_rest_days, game.away_short_week)} · {game.home} {restLabel(game.home_rest_days, game.home_short_week)}</b><span>{(game.away_short_week || game.home_short_week) ? 'short week flagged ⚠ — 5 days or fewer since last game' : 'days since each team’s last game'}</span></div>
    <div><small>{game.away} DEFENSE</small><b>{awayDefense ? `${awayDefense.role} · #${awayDefense.td_rank}` : '—'}</b><span>{awayDefense ? 'softest TD role · rank 1 leaks most' : 'matchup table pending'}</span></div>
    <div><small>{game.home} DEFENSE</small><b>{homeDefense ? `${homeDefense.role} · #${homeDefense.td_rank}` : '—'}</b><span>{homeDefense ? 'softest TD role · rank 1 leaks most' : 'matchup table pending'}</span></div>
  </div>
}

// C5 (dash-network-master-plan-2026-08-28.md): "the ratchet continues: NFL
// Boards, stat portal, Wire, Odds pages" -- Games.js was the one sibling tab
// under components/nfl/tabs/ with zero Filters.js imports. State/search are
// the two useful axes here that the existing game-picker strip below doesn't
// already cover: the picker jumps to ONE game, it doesn't narrow the grid to
// "just what's live right now" on a 16-game Sunday, and it has no search for
// a slate too wide to scan. Team/Position aren't added -- there's no
// per-player row here to filter, the grid unit is a game.
const STATE_OPTIONS = [
  { key: 'all', label: 'All' },
  { key: 'live', label: 'Live' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'final', label: 'Final' },
]

export default function Games({ data, picks, matchup, onPlayerClick }) {
  const games = data?.games || []
  const players = data?.players || []
  const [selectedGame, setSelectedGame] = useState('all')
  const [stateFilter, setStateFilter] = useState('all')
  const [query, setQuery] = useState('')
  const playersById = useMemo(() => Object.fromEntries(players.map((player) => [String(player.player_id), player])), [players])

  // ── MOBILE PROGRESSIVE DISCLOSURE (2026-08-29) ─────────────────────────
  // Fifteen fully-expanded cards made the phone page enormous (both reviews
  // said so). On <=760px each card opens collapsed — teams, state, score,
  // the designated calls, and each side's single best play — with the
  // environment/defense intel and full top-3 lists one tap away. Desktop is
  // untouched: every card renders full, nothing behind a tap, same vibe.
  const [isMobile, setIsMobile] = useState(false)
  const [openCards, setOpenCards] = useState(() => new Set())
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 760px)')
    const sync = () => setIsMobile(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])
  const toggleCard = (id) => setOpenCards((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  if (!games.length) {
    return (
      <div style={{
        border: `1px dashed ${C.border2}`, borderRadius: 12, padding: 28,
        textAlign: 'center', color: C.text3, fontSize: 12.5,
      }}>
        No games on this slate yet. The bot posts the week when the schedule lands.
      </div>
    )
  }

  const stateOf = (game) => (game.state === 'in' ? 'live' : game.completed ? 'final' : 'upcoming')

  // Live first — real scoreboard behavior: what's happening right now
  // belongs at the top of the grid, not wherever the payload's own order
  // happened to put it. Array.prototype.sort is stable, so pregame/final
  // games keep their original relative order.
  const needle = query.trim().toLowerCase()
  const sorted = [...games].sort((a, b) => (a.state === 'in' ? 0 : 1) - (b.state === 'in' ? 0 : 1))
    .filter((game) => selectedGame === 'all' || game.game_id === selectedGame)
    .filter((game) => stateFilter === 'all' || stateOf(game) === stateFilter)
    .filter((game) => !needle || `${game.away} ${game.home}`.toLowerCase().includes(needle))
  const liveCount = games.filter((game) => game.state === 'in').length
  const finalCount = games.filter((game) => game.completed).length

  // ── IS THERE ANY FOOTBALL LEFT ON THIS SLATE? ──────────────────────────
  // (2026-08-29.) Every game on the published wave had kicked off days ago
  // and the tab still called itself "the slate". One line at the top is the
  // difference between a stale page and an honest one, and it costs nothing
  // when there IS football: the banner only renders when the newest kickoff
  // on the payload is already behind us.
  const lastKickoff = games.reduce((newest, game) => {
    const at = game.kickoff ? Date.parse(game.kickoff) : NaN
    return Number.isFinite(at) && at > newest ? at : newest
  }, 0)
  const waveIsOver = lastKickoff > 0 && lastKickoff < Date.now()
  const waveEnded = waveIsOver
    ? new Date(lastKickoff).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : null

  return (
    <div>
      {waveIsOver && (
        <div
          role="status"
          style={{
            marginBottom: 11, padding: '10px 14px', borderRadius: 12,
            border: `1px solid ${C.yellow}45`, background: `${C.yellow}12`,
            color: C.text2, fontSize: 11.5, lineHeight: 1.5,
          }}
        >
          <b style={{ color: C.yellow }}>This wave is over.</b> The last kickoff on this
          slate was {waveEnded} — every card below is the final published state of a game
          that has already been played, kept here for reference rather than removed. The
          bot builds one wave at a time and only looks ahead, so nothing new lands here
          until the next slate does.
        </div>
      )}
      <section className="nfl-games-hero"><div><small>TUDDY GAME CENTER</small><h1>The slate, with the reasons attached.</h1><p>Scoreboard, The Six calls, each side&apos;s top TD board, matchup pressure, and honest feed limits in one card.</p></div><div><strong>{games.length}</strong><span>GAMES</span><strong>{liveCount}</strong><span>LIVE</span><strong>{finalCount}</strong><span>FINAL</span></div></section>

      <div style={{
        display: 'flex', flexDirection: 'column', gap: 9, marginBottom: 11,
        padding: '10px 12px', border: `1px solid ${C.border}`, borderRadius: 12,
        background: C.bg2,
      }}>
        <FilterBar>
          <FilterSearch value={query} onChange={setQuery} placeholder="Search team…" width={165} />
          <Segmented label="State" value={stateFilter} onChange={setStateFilter} options={STATE_OPTIONS} />
        </FilterBar>
        <ActiveFilters
          shown={sorted.length}
          total={games.length}
          filters={[
            query && { key: 'query', label: `Team: ${query}`, onClear: () => setQuery('') },
            stateFilter !== 'all' && { key: 'state', label: `State: ${STATE_OPTIONS.find((o) => o.key === stateFilter)?.label}`, onClear: () => setStateFilter('all') },
          ]}
          onClearAll={() => { setQuery(''); setStateFilter('all') }}
        />
      </div>

      <div className="nfl-game-picker"><button className={selectedGame === 'all' ? 'active' : ''} onClick={() => setSelectedGame('all')}>ALL GAMES</button>{games.map((game) => <button key={game.game_id} className={selectedGame === game.game_id ? 'active' : ''} onClick={() => setSelectedGame(game.game_id)}>{game.away} @ {game.home}</button>)}</div>

      {!sorted.length && (
        <div style={{
          border: `1px dashed ${C.border2}`, borderRadius: 12, padding: 22,
          textAlign: 'center', color: C.text3, fontSize: 12,
        }}>No games clear this filter.</div>
      )}

      <div style={{
        display: 'grid', gap: 10,
        gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
      }}>
        {sorted.map((g) => {
          const live = g.state === 'in'
          const hasScore = live || g.completed
          const open = !isMobile || openCards.has(g.game_id)
          return (
            <div key={g.game_id} style={{
              background: live ? `linear-gradient(155deg, rgba(34,211,238,.08), ${C.bg2} 55%)` : C.bg2,
              border: `1px solid ${live ? 'rgba(34,211,238,.4)' : C.border}`,
              borderRadius: 12, padding: '11px 13px',
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                gap: 8, marginBottom: hasScore ? 6 : 2,
              }}>
                {hasScore ? (
                  <StateBadge g={g} />
                ) : (
                  <>
                    <span style={{ fontSize: 14, fontWeight: 900, color: C.text }}>
                      {g.away} <span style={{ color: C.text3, fontWeight: 600 }}>@</span> {g.home}
                    </span>
                    <span style={{ fontSize: 10, fontFamily: NUM_FONT }}><StateBadge g={g} /></span>
                  </>
                )}
              </div>

              {hasScore && <ScoreLine g={g} />}

              {/* B7 (2026-08-28): shows real down/distance the moment ESPN's feed
                  carries it (bots/nfl/nfl_espn.py's best-effort situation parse,
                  unverified against a real live game as of this build) -- falls
                  back to the same honest caveat as before when it doesn't. */}
              {live && (g.down_distance
                ? <div style={{ margin: '1px 0 7px', color: g.red_zone ? C.yellow : C.cyan, fontSize: 9, fontWeight: 800, fontFamily: NUM_FONT }}>{g.down_distance}{g.red_zone ? ' · RED ZONE' : ''}</div>
                : <div style={{ margin: '1px 0 7px', color: C.text3, fontSize: 8.5, fontFamily: NUM_FONT }}>Drive possession and down/distance are not published in the current feed · ESPN state: {g.detail || 'live'}</div>
              )}

              {open ? (
                <>
                  {g.venue && (
                    <div style={{ fontSize: 9.5, color: C.text3, marginBottom: 2 }}>
                      {g.venue}{g.indoors ? ' · indoors' : ''}
                    </div>
                  )}

                  <GameIntel game={g} matchup={matchup} />

                  <div style={{ marginTop: 10, paddingTop: 9, borderTop: `1px solid ${C.border}` }}>
                    <div style={{ marginBottom: 6, color: C.green, fontSize: 8, fontWeight: 900, fontFamily: NUM_FONT, letterSpacing: '.09em' }}>THE SIX · DESIGNATED CALLS IN THIS GAME</div>
                    <DesignatedCalls game={g} picks={picks} playersById={playersById} onPlayerClick={onPlayerClick} />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 4 }}>
                    {[g.away, g.home].map((t) => (
                      <div key={t}>
                        <div style={{
                          fontSize: 9.5, fontWeight: 900, color: C.text3,
                          letterSpacing: '.08em', textTransform: 'uppercase',
                        }}>{t}</div>
                        <SidePicks players={players} team={t} onPlayerClick={onPlayerClick} />
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <div style={{ marginTop: 7, paddingTop: 7, borderTop: `1px solid ${C.border}` }}>
                    <DesignatedCalls game={g} picks={picks} playersById={playersById} onPlayerClick={onPlayerClick} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 7 }}>
                    {[g.away, g.home].map((t) => {
                      const best = players
                        .filter((p) => p.team === t && !p.low_sample)
                        .sort((a, b) => (b.scores?.TD ?? 0) - (a.scores?.TD ?? 0))[0]
                      if (!best) return null
                      const bg = gradeFor(best.scores?.TD)
                      return (
                        <button key={t} onClick={() => onPlayerClick?.(best)} style={{
                          display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                          background: 'rgba(255,255,255,.03)', border: `1px solid ${C.border}`,
                          borderRadius: 8, padding: '5px 8px', cursor: 'pointer', textAlign: 'left',
                        }}>
                          <span style={{ fontSize: 8.5, fontWeight: 900, color: C.text3, fontFamily: NUM_FONT, minWidth: 28 }}>{t}</span>
                          <span style={{ fontFamily: NUM_FONT, fontSize: 11, fontWeight: 900, color: bg.color, minWidth: 26 }}>{Math.round(best.scores?.TD ?? 0)}</span>
                          <span style={{ fontSize: 11, color: C.text, fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{best.name}</span>
                          <span style={{ fontSize: 9, color: C.text3, fontFamily: NUM_FONT }}>{best.position}</span>
                        </button>
                      )
                    })}
                  </div>
                </>
              )}

              {isMobile && (
                <button onClick={() => toggleCard(g.game_id)} aria-expanded={open} style={{
                  width: '100%', marginTop: 9, padding: '7px 0',
                  border: `1px solid ${C.border}`, borderRadius: 8,
                  background: 'transparent', color: C.text3, cursor: 'pointer',
                  font: `800 9px/1 ${NUM_FONT}`, letterSpacing: '.08em',
                }}>{open ? 'COLLAPSE \u25B4' : 'WEATHER \u00B7 DEFENSE \u00B7 TOP 3 EACH SIDE \u25BE'}</button>
              )}
            </div>
          )
        })}
      </div>
      <style>{`
        .nfl-games-hero{display:flex;align-items:center;justify-content:space-between;gap:20px;min-height:175px;margin-bottom:9px;padding:24px;border:1px solid rgba(34,211,238,.28);border-radius:16px;background:radial-gradient(circle at 88% 10%,rgba(34,211,238,.13),transparent 36%),radial-gradient(circle at 8% 100%,rgba(34,197,94,.12),transparent 40%),${C.bg2}}.nfl-games-hero small{color:${C.cyan};font:900 8px/1 ${NUM_FONT};letter-spacing:.12em}.nfl-games-hero h1{max-width:720px;margin:8px 0 6px;font-size:clamp(30px,5vw,50px);line-height:1;letter-spacing:-.05em}.nfl-games-hero p{margin:0;color:${C.text3};font-size:10px}.nfl-games-hero>div:last-child{display:grid;grid-template-columns:auto auto;align-items:baseline;gap:4px 9px}.nfl-games-hero>div:last-child strong{color:${C.green};font:900 22px/1 ${NUM_FONT};text-align:right}.nfl-games-hero>div:last-child span{color:${C.text3};font:800 7px/1 ${NUM_FONT}}.nfl-game-picker{display:flex;gap:5px;overflow-x:auto;margin-bottom:10px}.nfl-game-picker button{flex:0 0 auto;padding:8px 10px;border:1px solid ${C.border};border-radius:8px;background:${C.bg2};color:${C.text3};font:800 8px/1 ${NUM_FONT};cursor:pointer}.nfl-game-picker button.active{border-color:${C.green};color:${C.green};background:rgba(34,197,94,.08)}.nfl-game-intel{display:grid;grid-template-columns:repeat(4,1fr);gap:5px;margin-top:8px}.nfl-game-intel>div{min-height:61px;padding:8px;border:1px solid ${C.border};border-radius:8px;background:rgba(255,255,255,.025)}.nfl-game-intel small,.nfl-game-intel b,.nfl-game-intel span{display:block}.nfl-game-intel small{color:${C.text3};font:800 7px/1 ${NUM_FONT}}.nfl-game-intel b{margin-top:6px;font:900 9px/1 ${NUM_FONT}}.nfl-game-intel span{margin-top:4px;color:${C.text3};font-size:7.5px;line-height:1.25}@media(max-width:620px){.nfl-games-hero{align-items:flex-start}.nfl-games-hero>div:last-child{display:none}.nfl-game-intel{grid-template-columns:1fr 1fr}}
      `}</style>
    </div>
  )
}
