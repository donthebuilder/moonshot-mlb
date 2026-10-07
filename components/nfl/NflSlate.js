'use client'
import TeamMark, { MatchLogos } from '../TeamMark'
import { useEffect, useMemo, useState } from 'react'
import { C, NUM_FONT, TYPE, gradeFor } from '../../lib/nfl/theme'
import { useHashFilter } from '../../lib/filterHash'
import { useIsPhone } from '../MobileFold'
import Tap from '../Tap'
import GameSwitcher from '../GameSwitcher'
import { GameFilterRail, SlateStrip, GamePanelPills, PanelAnchor, GameFrame, PrevNextGame } from '../slate/SlateParts'
import GameOffDef, { Kicker } from './GameOffDef'
import { GameHeader, KeyPlayers, MatchupScoreboard, ImportantStats } from './GameSections'
import { Card as TdCard, tdPool } from './tabs/Touchdowns'
import NflTable from './NflTable'
import { useGameCalls } from './GameCalls'
import WriteupBlock from './WriteupBlock'
import GameLedgerLine from '../ledger/GameLedgerLine'
import { easternDate } from '../../lib/data'
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
const PANELS = [['field', 'The field'], ['players', 'Players'], ['matchup', 'Matchup'], ['research', 'Research']]
const SUBS = {
  field: 'where this offense attacks, where the other defense is weak, and where they meet.',
  players: "who gets the ball, who they face, and the model's calls.",
  matchup: 'the numbers that decide a game, side by side.',
  research: 'every scored player in the game, and the top touchdown looks.',
}

const stateOf = (g) => (g.state === 'in' ? 'live' : g.completed ? 'final' : 'upcoming')
const kickText = (g) => {
  const at = g.kickoff ? Date.parse(g.kickoff) : NaN
  if (!Number.isFinite(at)) return 'TBD'
  if (at < Date.now() && !g.completed && g.state !== 'in') return 'kickoff passed · not tracked'
  return new Date(at).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })
}
// the header's kickoff: the viewer's own time zone, named once
const kickWhen = (g) => {
  const at = g.kickoff ? Date.parse(g.kickoff) : NaN
  if (!Number.isFinite(at)) return 'TBD'
  if (at < Date.now() && !g.completed && g.state !== 'in') return 'kickoff passed · not tracked'
  return new Date(at).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })
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

export default function NflSlate({ data, picks, matchup, logs = null, odds = null, initialGame = null, games: shownGames, tableColumns, tableRowsFor, storyForGame, onPlayerClick, onOpenTeam = null }) {
  const allGames = data?.games || []
  const players = data?.players || []
  const isPhone = useIsPhone()
  const watchlist = useNflWatchlist(data)
  const pool = useMemo(() => tdPool(data), [data])
  const gameCalls = useGameCalls()   // BATCH-GAME-CALLS G5: TOP + TD per game
  const playersById = useMemo(() => Object.fromEntries(players.map((p) => [String(p.player_id), p])), [players])

  const [gfilter, setGfilter] = useState('all')
  const [panel, setPanel] = useState('field')
  const [cardsOpen, setCardsOpen] = useState(false)
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
      id: String(g.game_id), title: <MatchLogos sport="nfl" away={g.away} home={g.home} px={26} gap={5} />, past: Boolean(g.completed), heat,
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

  return (
    <div>
      <GameFilterRail value={gfilter} onChange={setGfilter} counts={counts} />
      <SlateStrip sport="nfl" isPhone={isPhone} rememberKey="tuddy_games_fold_v1" accent={C.green} theme={C}
        open={g ? { away: g.away, home: g.home } : null} cards={cards} activeId={activeId} onSelect={select}
        legend="Ring = expected touchdowns." />
      <GameSwitcher sport="nfl" games={switcherGames} activeGame={activeId} onSelect={select} live={switcherLive} accent={C.green} stickyTop="0px" />

      {g && (() => {
        const inGame = (p) => p.team === g.away || p.team === g.home
        const topTd = pool.rows.filter(inGame).slice(0, 4)
        const story = storyForGame?.(g)
        const rows = tableRowsFor(new Set([g.away, g.home]))
        // a one-game table: the kickoff on every row said nothing (Game column dropped);
        // the club code rides its logo
        const cols = tableColumns.filter((c) => c.key !== 'state').map((c) => (c.key === 'team' || c.key === 'opp' ? { ...c, code: true } : c))
        const x = xtdByGame[g.game_id] || 0
        return (
          <div id="tuddy-slate-game" style={{ scrollMarginTop: 'calc(var(--hdr-h, 0px) + var(--gsw-h, 0px) + 8px)', marginBottom: 20 }}>
            <GameFrame accent={C.green} past={Boolean(g.completed)}>
              {/* 1. THE GAME, ONCE: the one place the matchup, the kickoff and the dial are said */}
              <div style={{ padding: '12px 14px 12px' }}>
                <GameHeader game={g} when={kickWhen(g)} air={airText(g)} xtd={x} heat={heatOf(x)} past={Boolean(g.completed)} onOpenTeam={onOpenTeam} />
              </div>
              <div style={{ borderTop: `1px solid ${C.border}`, padding: '12px 14px 14px', background: 'rgba(0,0,0,.15)' }}>
                <GamePanelPills panels={PANELS} subs={SUBS} panel={panel} setPanel={setPanel} gamePk={g.game_id} isPhone={isPhone} accent={C.green} stickyTop="var(--gsw-h, 0px)" />

                {/* 2. OFFENSE vs DEFENSE: where it attacks, where it is weak, where they meet */}
                <PanelAnchor id="field" gamePk={g.game_id}>
                  <GameOffDef key={g.game_id} matchup={matchup} players={players} game={g} />
                </PanelAnchor>

                {/* 3. KEY PLAYERS, then the calls (one block) */}
                <PanelAnchor id="players" gamePk={g.game_id} style={{ marginTop: 6 }}>
                  <KeyPlayers matchup={matchup} data={data} game={g} onPlayerClick={onPlayerClick} onOpenTeam={onOpenTeam} />
                  {story && (
                    <p style={{ margin: '0 0 14px', fontSize: 13, lineHeight: 1.5, color: C.text2 }}>
                      <b style={{ color: story.kind === 'model' ? C.orange : C.green, fontFamily: NUM_FONT, fontSize: 12, letterSpacing: '.08em' }}>{story.kind === 'model' ? 'MODEL NARRATIVE' : 'MILESTONE'} </b>
                      <Tap onClick={() => onPlayerClick?.(story.player, story.market)}>{story.text}</Tap>
                    </p>
                  )}
                  <WriteupBlock game={g} gameCalls={gameCalls} week={data} matchup={matchup} logs={logs} odds={odds} onPlayerClick={onPlayerClick} onOpenTeam={onOpenTeam} />
                  <GameLedgerLine sport="nfl" gameId={g.game_id} day={g.kickoff ? easternDate(Date.parse(g.kickoff)) : null} />
                </PanelAnchor>

                {/* 4. THE MATCHUP, then the important stats */}
                <PanelAnchor id="matchup" gamePk={g.game_id}>
                  <MatchupScoreboard matchup={matchup} data={data} game={g} />
                  <ImportantStats matchup={matchup} data={data} game={g} onOpenTeam={onOpenTeam} />
                </PanelAnchor>

                {/* 5. THE DETAILED RESEARCH */}
                <PanelAnchor id="research" gamePk={g.game_id}>
                  <Kicker>ALL PLAYERS IN THE GAME, BY TD SCORE</Kicker>
                  <NflTable rows={rows} columns={cols} onRowClick={(r) => onPlayerClick?.(r?._raw ?? r)} maxRows={8} maxHeight={9999} />
                  {topTd.length > 0 && (
                    <div style={{ marginTop: 12 }}>
                      <button type="button" onClick={() => setCardsOpen((v) => !v)} aria-expanded={cardsOpen}
                        style={{ minHeight: 44, padding: '0 2px', border: 0, background: 'transparent', color: C.green, font: `800 13px/1 ${NUM_FONT}`, cursor: 'pointer' }}>
                        {cardsOpen ? 'Hide top touchdown cards ▴' : 'Top touchdown cards ▾'}
                      </button>
                      {cardsOpen && (
                        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))' }}>
                          {topTd.map((p, i) => (
                            <TdCard key={p.player_id} p={p} rank={i + 1} matchup={matchup} odds={odds} onPlayerClick={onPlayerClick}
                              weights={pool.weights} base={pool.base} pool={pool.rows} watchlist={watchlist} />
                          ))}
                        </div>
                      )}
                    </div>
                  )}
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
