'use client'
import TeamMark, { MatchLogos } from '../TeamMark'
import { useEffect, useMemo, useState } from 'react'
import { C, NUM_FONT, TYPE, gradeFor } from '../../lib/nfl/theme'
import { softRole, softLine } from '../../lib/nfl/dvpSignal'
import { useHashFilter } from '../../lib/filterHash'
import { useIsPhone } from '../MobileFold'
import Rail from '../Rail'
import Tap from '../Tap'
import GameSwitcher from '../GameSwitcher'
import SlateCard from '../slate/SlateCard'
import { GameFilterRail, StripFold, GamePanelPills, PanelAnchor, GameFrame, GameHeaderLine, PrevNextGame } from '../slate/SlateParts'
import { SubLabel, FactTiles } from '../matchup/MatchupParts'
import { Zones, defenseTiles, offenseTiles, factsNote, PassGame } from './tabs/Matchups'
import { Card as TdCard, tdPool } from './tabs/Touchdowns'
import NflTable from './NflTable'
import GameCalls, { useGameCalls } from './GameCalls'
import { useNflWatchlist } from '../../lib/nfl/watchlist'

// TUDDY'S SLATE (2026-09-28). Donovan: "there's no breakdown page like the
// slate page for mlb ... I should be able to see each game and get a good
// breakdown just like mlb"; "MOONSHOT IS THE BASE, everything else like
// TUDDY is seasoning." So this is MOONSHOT's Slate (components/tabs/Games.js,
// Games view) built from its own pieces -- components/slate/* -- with
// football's data in them:
//   the strip   one SlateCard per game: expected TDs in the game on the dial
//               (the sum of each man's xTD, ringed against this week's range),
//               kickoff / live / final, the bot's calls in the game as chips
//   the game    The read (each offense against the other defense, in the
//               Matchups page's plain lines), Players (both rosters, the TD
//               table), Matchup (each defense's zone tiles), Picks (the calls,
//               then the game's top TD cards), prev / next
// The open game rides the address (#…&game=<id>), so a shared link opens it.
// Nothing here is a new number: xTD, scores, calls and the defense data are
// the week file's and the matchup file's own.

const HEADLINE_MARKETS = ['TD', 'REC_YDS', 'RUSH_YDS', 'REC', 'PASS_YDS', 'KICK_PTS']
const MARKET_TAG = { TD: 'TD', REC_YDS: 'REC YDS', RUSH_YDS: 'RUSH YDS', REC: 'REC', PASS_YDS: 'PASS YDS', KICK_PTS: 'KICK' }
const PANELS = [['read', 'The read'], ['players', 'Players'], ['matchup', 'Matchup'], ['picks', 'Picks']]
const SUBS = {
  read: 'where it is played, rest, and each offense against the other defense.',
  players: 'both rosters as the TD table — every scored player, sortable.',
  matchup: 'where each defense gets beaten, zone by zone.',
  picks: "the bot's calls in this game, then its top touchdown cards.",
}

const stateOf = (g) => (g.state === 'in' ? 'live' : g.completed ? 'final' : 'upcoming')
const kickText = (g) => {
  const at = g.kickoff ? Date.parse(g.kickoff) : NaN
  if (!Number.isFinite(at)) return 'TBD'
  if (at < Date.now() && !g.completed && g.state !== 'in') return 'kickoff passed · not tracked'
  return new Date(at).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })
}
const airText = (g) => (g.indoors ? 'indoors' : Number.isFinite(g.weather_temp_f) ? `${Math.round(g.weather_temp_f)}°F${g.weather_condition ? ` ${String(g.weather_condition).toLowerCase()}` : ''}` : null)

/** The bot's headline calls that land in this game: [{ market, call, block }]. */
function callsIn(picks, g) {
  return HEADLINE_MARKETS.map((market) => {
    const block = picks?.card?.[market]
    const call = block?.rungs?.[0]
    return call && (call.team === g.away || call.team === g.home) ? { market, call, block } : null
  }).filter(Boolean)
}

export default function NflSlate({ data, picks, matchup, odds = null, initialGame = null, games: shownGames, tableColumns, tableRowsFor, storyForGame, onPlayerClick, onOpenTeam = null }) {
  const allGames = data?.games || []
  const players = data?.players || []
  const isPhone = useIsPhone()
  const watchlist = useNflWatchlist(data)
  const pool = useMemo(() => tdPool(data), [data])
  const gameCalls = useGameCalls()   // BATCH-GAME-CALLS G5: TOP + TD per game
  const playersById = useMemo(() => Object.fromEntries(players.map((p) => [String(p.player_id), p])), [players])

  const [gfilter, setGfilter] = useState('all')
  const [panel, setPanel] = useState('read')
  const [hashGame, setHashGame] = useHashFilter('game')
  // A game handed over from another tab (Storylines, the Ledger) opens here.
  useEffect(() => { if (initialGame) setHashGame(String(initialGame)) }, [initialGame])   // eslint-disable-line react-hooks/exhaustive-deps

  // Expected TDs per game: the sum of every scored man's xTD on both teams.
  const xtdByGame = useMemo(() => {
    const byTeam = new Map()
    for (const p of players) if (!p.on_bye) byTeam.set(p.team, (byTeam.get(p.team) || 0) + (Number(p?.stats?.xTD) || 0))
    return Object.fromEntries(allGames.map((g) => [g.game_id, (byTeam.get(g.away) || 0) + (byTeam.get(g.home) || 0)]))
  }, [players, allGames])

  const counts = useMemo(() => {
    const c = { all: shownGames.length, live: 0, upcoming: 0, final: 0 }
    for (const g of shownGames) c[stateOf(g)] += 1
    return c
  }, [shownGames])
  const games = useMemo(() => shownGames
    .filter((g) => gfilter === 'all' || stateOf(g) === gfilter)
    .sort((a, b) => (Date.parse(a.kickoff || '') || 0) - (Date.parse(b.kickoff || '') || 0)), [shownGames, gfilter])

  // Opens on the game that matters now: one in progress, else the next to
  // kick off, else the first -- a week of finals shouldn't hide Monday night.
  const lead = games.find((x) => x.state === 'in') || games.find((x) => stateOf(x) === 'upcoming') || games[0] || null
  const activeId = games.some((g) => String(g.game_id) === hashGame) ? hashGame : (lead ? String(lead.game_id) : null)
  const select = (id) => {
    setHashGame(String(id))
    if (typeof document !== 'undefined') requestAnimationFrame(() => document.getElementById('tuddy-slate-game')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  const xs = games.map((g) => xtdByGame[g.game_id] || 0)
  const lo = Math.min(...xs, 0); const hi = Math.max(...xs, 0)
  const heatOf = (v) => (hi > lo ? (v - lo) / (hi - lo) : 0)
  const top = games.reduce((a, g) => ((xtdByGame[g.game_id] || 0) > (xtdByGame[a?.game_id] || -1) ? g : a), null)

  const cards = games.map((g) => {
    const x = xtdByGame[g.game_id] || 0
    const heat = heatOf(x)
    const calls = callsIn(picks, g)
    const chipsFrom = calls.length
      ? calls.slice(0, 3).map(({ market, call }) => ({ market, name: call.name, score: call.score, pid: call.player_id }))
      : players.filter((p) => (p.team === g.away || p.team === g.home) && Number.isFinite(p.scores?.TD)).sort((a, b) => b.scores.TD - a.scores.TD).slice(0, 2)
        .map((p) => ({ market: 'TD', name: p.name, score: p.scores.TD, pid: p.player_id }))
    const live = g.state === 'in'
    return {
      id: String(g.game_id), title: <MatchLogos sport="nfl" away={g.away} home={g.home} px={20} gap={5} />, past: Boolean(g.completed), heat,
      tooltip: `${g.away} @ ${g.home}${g.venue ? ` · ${g.venue}` : ''}`,
      dial: { value: x, dp: 1, pct: 100 * heat, title: `${x.toFixed(1)} expected touchdowns between the two teams — the sum of each scored player's xTD. The ring fills against this week's range.` },
      band: top && g.game_id === top.game_id ? { icon: '🌋', word: 'MAIN EVENT' } : heat >= 0.62 ? { icon: '🔥', word: '' } : heat < 0.3 ? { icon: '🧊', word: '' } : null,
      status: live ? { kind: 'live', text: g.detail || 'LIVE' } : g.completed ? { kind: 'final', text: 'FINAL' } : { kind: 'time', text: kickText(g) },
      extra: airText(g) ? <span>{airText(g)}</span> : null,
      score: (live || g.completed) ? { away: g.away, home: g.home, awayScore: g.away_score, homeScore: g.home_score, live } : null,
      chips: chipsFrom.map((k) => ({
        key: `${k.market}-${k.pid}`, tag: MARKET_TAG[k.market] || k.market, color: gradeFor(k.score).color,
        name: k.name, score: Math.round(k.score ?? 0),
        title: calls.length ? `The bot's ${MARKET_TAG[k.market] || k.market} call in this game` : "Top TD score in this game (no headline call lands here)",
        onClick: (e) => { e.stopPropagation(); const p = playersById[String(k.pid)]; if (p) onPlayerClick?.(p, k.market) },
      })),
    }
  })

  const switcherGames = games.map((g) => ({ game_pk: String(g.game_id), away: g.away, home: g.home, game_time: g.kickoff }))
  const switcherLive = Object.fromEntries(games.filter((g) => g.state === 'in' || g.completed).map((g) => [String(g.game_id), { away_score: g.away_score, home_score: g.home_score }]))
  const g = games.find((x) => String(x.game_id) === activeId) || null
  // logo-only (Donovan 10-02); the code rides the logo's title / alt and the tap's label
  const teamLink = (t) => <Tap onClick={onOpenTeam && (() => onOpenTeam(t))} title={t}><span style={{ display: 'inline-flex', alignItems: 'center' }}><TeamMark sport="nfl" abbr={t} variant="logo" px={18} /></span></Tap>

  return (
    <div>
      <GameFilterRail value={gfilter} onChange={setGfilter} counts={counts} />
      <StripFold isPhone={isPhone} count={games.length} rememberKey="tuddy_games_fold_v1" accent={C.green}
        summary={g ? <>reading <MatchLogos sport="nfl" away={g.away} home={g.home} px={14} gap={3} /></> : 'tap to pick one'}>
        <div style={{ marginBottom: 16 }}>
          <style>{'@keyframes gsLivePulse{0%,100%{opacity:1}50%{opacity:.3}}'}</style>
          <Rail itemMin={264} gap={8} wheelScroll={false}>
            {cards.map((c) => <SlateCard key={c.id} card={c} on={c.id === activeId} accent={C.green} onSelect={select} sport="nfl" />)}
          </Rail>
          <div style={{ marginTop: 7, fontSize: 9.5, color: C.text3 }}>Kickoff order. The dial is expected touchdowns in the game; 🌋 the most this week, 🔥 hot, 🧊 cold.</div>
        </div>
      </StripFold>
      <GameSwitcher sport="nfl" games={switcherGames} activeGame={activeId} onSelect={select} live={switcherLive} accent={C.green} stickyTop="0px" />

      {g && (() => {
        const live = g.state === 'in'
        const calls = callsIn(picks, g)
        const inGame = (p) => p.team === g.away || p.team === g.home
        const topTd = pool.rows.filter(inGame).slice(0, 4)
        const story = storyForGame?.(g)
        const rows = tableRowsFor(new Set([g.away, g.home]))
        return (
          <div id="tuddy-slate-game" style={{ scrollMarginTop: 'calc(var(--hdr-h, 0px) + var(--gsw-h, 0px) + 8px)', marginBottom: 20 }}>
            <GameFrame accent={C.green} past={Boolean(g.completed)}>
              <div style={{ padding: '11px 14px 10px' }}>
                <GameHeaderLine away={teamLink(g.away)} home={teamLink(g.home)} past={Boolean(g.completed)}>
                  <span style={{ fontSize: TYPE.micro, fontFamily: NUM_FONT, color: live ? C.green : C.text3, fontWeight: 800 }}>
                    {live ? (g.detail || 'LIVE') : g.completed ? 'FINAL' : kickText(g)}
                  </span>
                  {(live || g.completed) && <span style={{ fontFamily: NUM_FONT, fontSize: 14, fontWeight: 900, color: live ? C.green : C.text2 }}>{teamLink(g.away)} {g.away_score ?? 0}–{g.home_score ?? 0} {teamLink(g.home)}</span>}
                </GameHeaderLine>
                {live && (g.down_distance || g.possession) && (
                  <div style={{ marginTop: 4, color: g.red_zone ? C.yellow : C.green, fontSize: TYPE.micro, fontWeight: 800, fontFamily: NUM_FONT }}>
                    {g.possession ? `${g.possession} ball` : ''}{g.possession && g.down_distance ? ' · ' : ''}{g.down_distance || ''}{g.red_zone ? ' · RED ZONE' : ''}
                  </div>
                )}
                <GameCalls calls={gameCalls} game={g} playersById={playersById} weights={pool.weights} base={pool.base} onPlayerClick={onPlayerClick} />
              </div>
              <div style={{ borderTop: `1px solid ${C.border}`, padding: '12px 14px 14px', background: 'rgba(0,0,0,.15)' }}>
                <GamePanelPills panels={PANELS} subs={SUBS} panel={panel} setPanel={setPanel} gamePk={g.game_id} isPhone={isPhone} accent={C.green} stickyTop="var(--gsw-h, 0px)"
                  badges={{ picks: calls.length ? String(calls.length) : '' }} />

                <PanelAnchor id="read" gamePk={g.game_id}>
                  <FactTiles theme={C} numFont={NUM_FONT} min={104} tiles={[
                    { k: g.indoors ? 'INDOORS' : 'WEATHER', v: airText(g) && !g.indoors ? airText(g).replace(/°F/, '°') : g.indoors ? 'dome' : null, sub: g.venue || null },
                    { k: 'DAYS REST', v: g.away_rest_days != null && g.home_rest_days != null ? `${g.away_rest_days} · ${g.home_rest_days}` : null, sub: `${g.away}${g.away_short_week ? ' (short)' : ''} · ${g.home}${g.home_short_week ? ' (short)' : ''}` },
                    { k: 'EXPECTED TDS', v: (xtdByGame[g.game_id] || 0).toFixed(1), sub: 'both teams' },
                  ]} />
                  {story && (
                    <p style={{ margin: '0 0 12px', fontSize: 12.5, lineHeight: 1.5, color: C.text2 }}>
                      <b style={{ color: story.kind === 'model' ? C.orange : C.green, fontFamily: NUM_FONT, fontSize: 10, letterSpacing: '.08em' }}>{story.kind === 'model' ? 'MODEL NARRATIVE' : 'MILESTONE'} </b>
                      <Tap onClick={() => onPlayerClick?.(story.player, story.market)}>{story.text}</Tap>
                    </p>
                  )}
                  <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', marginBottom: 6 }}>
                    {[[g.away, g.home], [g.home, g.away]].map(([off, def]) => {
                      const soft = softRole(matchup, def)
                      const side = pool.rows.filter((p) => p.team === off).slice(0, 3)
                      return (
                        <div key={off} style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: '11px 13px', minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 900, marginBottom: 6 }}>{teamLink(off)} offense <span style={{ color: C.text3, fontWeight: 600, fontFamily: NUM_FONT, fontSize: 11 }}>vs {teamLink(def)} defense</span></div>
                          <p style={{ margin: '0 0 8px', fontSize: 12.5, lineHeight: 1.5, color: C.text2 }}>
                            {soft?.standout ? <><b style={{ color: C.text }}>{teamLink(def)}</b> {softLine(soft)}.</> : <><b style={{ color: C.text }}>{teamLink(def)}</b> has no standout weakness this week.</>}
                          </p>
                          <SubLabel theme={C} numFont={NUM_FONT}>{off} OFFENSE</SubLabel>
                          <FactTiles theme={C} numFont={NUM_FONT} tiles={offenseTiles(matchup, off)} />
                          <SubLabel theme={C} numFont={NUM_FONT}>{def} DEFENSE</SubLabel>
                          <FactTiles theme={C} numFont={NUM_FONT} tiles={defenseTiles(matchup, def)} note={factsNote(matchup, off, def, data?.season)} />
                          <PassGame matchup={matchup} data={data} off={off} def={def} onPlayerClick={onPlayerClick} />
                          {side.length > 0 && <SubLabel theme={C} numFont={NUM_FONT}>TOP TD LOOKS</SubLabel>}
                          <div style={{ display: 'grid', gap: 4 }}>
                            {side.map((p) => (
                              <button key={p.player_id} onClick={() => onPlayerClick?.(p, 'TD')} style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 44, padding: '6px 9px', borderRadius: 10, border: `1px solid ${C.border}`, background: C.glass, color: C.text, cursor: 'pointer', textAlign: 'left' }}>
                                <b style={{ fontFamily: NUM_FONT, color: gradeFor(p.scores?.TD).color, minWidth: 26 }}>{Math.round(p.scores?.TD ?? 0)}</b>
                                <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                                <span style={{ fontFamily: NUM_FONT, fontSize: 10.5, color: C.text3 }}>{p.position}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </PanelAnchor>

                <PanelAnchor id="players" gamePk={g.game_id} style={{ marginTop: 14 }}>
                  <SubLabel theme={C} numFont={NUM_FONT}>PLAYERS · BOTH ROSTERS, BY TD SCORE</SubLabel>
                  <NflTable rows={rows} columns={tableColumns} onRowClick={(r) => onPlayerClick?.(r?._raw ?? r)} maxRows={12} maxHeight={9999} />
                </PanelAnchor>

                <PanelAnchor id="matchup" gamePk={g.game_id} style={{ marginTop: 14 }}>
                  <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))' }}>
                    {[g.home, g.away].map((def) => (
                      <div key={def} style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 900, marginBottom: 6 }}>{teamLink(def)} defense <span style={{ color: C.text3, fontWeight: 600, fontFamily: NUM_FONT, fontSize: 11 }}>facing {teamLink(def === g.home ? g.away : g.home)}</span></div>
                        <Zones field={matchup?.field} team={def} />
                      </div>
                    ))}
                  </div>
                </PanelAnchor>

                <PanelAnchor id="picks" gamePk={g.game_id} style={{ marginTop: 14 }}>
                  <SubLabel theme={C} numFont={NUM_FONT}>THE BOT&apos;S CALLS IN THIS GAME</SubLabel>
                  {calls.length ? (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                      {calls.map(({ market, call, block }) => {
                        const p = playersById[String(call.player_id)]
                        const gr = gradeFor(call.score)
                        return (
                          <button key={market} onClick={() => p && onPlayerClick?.(p, market)} style={{ display: 'flex', alignItems: 'center', gap: 7, minHeight: 44, padding: '6px 10px', borderRadius: 10, border: `1px solid ${C.border}`, background: C.glass, color: C.text, cursor: p ? 'pointer' : 'default', textAlign: 'left' }}>
                            <b style={{ color: gr.color, fontFamily: NUM_FONT, fontSize: 10.5 }}>{MARKET_TAG[market]}</b>
                            <span style={{ fontSize: 12.5, fontWeight: 700 }}>{call.name}</span>
                            <span style={{ color: C.text3, fontFamily: NUM_FONT, fontSize: 10.5 }}>bar {block.bar}</span>
                          </button>
                        )
                      })}
                    </div>
                  ) : <p style={{ margin: '0 0 12px', fontSize: 12.5, color: C.text3 }}>No headline call lands in this game.</p>}
                  {topTd.length > 0 && <SubLabel theme={C} numFont={NUM_FONT}>TOP TOUCHDOWN CARDS</SubLabel>}
                  <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))' }}>
                    {topTd.map((p, i) => (
                      <TdCard key={p.player_id} p={p} rank={i + 1} matchup={matchup} odds={odds} onPlayerClick={onPlayerClick}
                        weights={pool.weights} base={pool.base} pool={pool.rows} watchlist={watchlist} />
                    ))}
                  </div>
                </PanelAnchor>
              </div>
            </GameFrame>
          </div>
        )
      })()}
      <PrevNextGame sport="nfl" games={games} activeId={activeId} idOf={(x) => String(x.game_id)} onGo={select} accent={C.green} />
    </div>
  )
}
