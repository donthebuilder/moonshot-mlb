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
import CardButton from '../CardButton'
import { downloadNflGameCard } from './shareCard'
import { tdStatusFor } from '../../lib/nfl/tdStatus'
import { DefenseFile } from './DefenseSections'
import { tdPool } from './tabs/Touchdowns'
import { boardReason } from '../../lib/nfl/boardReason'
import { tdCallStatus } from '../../lib/callStatus'
import { withNflFullSet } from '../../lib/nfl/boardColumns'
import GameTotalLine, { GameTotalMark, totalRowFor, useGameTotals } from '../GameTotalLine'
import NflTable from './NflTable'
import { useGameCalls } from './GameCalls'
import WriteupBlock from './WriteupBlock'
import GameLedgerLine from '../ledger/GameLedgerLine'
import { easternDate } from '../../lib/data'
import { useNflWatchlist } from '../../lib/nfl/watchlist'
import { localDayTime } from '../../lib/localTime'
import { slateTotals, TD_WORD } from '../../lib/nfl/teamTdModel'
import InjuryOut from '../injuries/InjuryOut'
import { useOutCounts } from '../injuries/InjuryLayer'
import { nameKey } from '../../lib/injuries/lookup'
import { depthRole } from '../../lib/nfl/roles'

// TUDDY'S SLATE (2026-09-28). Donovan: "there's no breakdown page like the
// slate page for mlb ... I should be able to see each game and get a good
// breakdown just like mlb"; "MOONSHOT IS THE BASE, everything else like
// TUDDY is seasoning." So this is MOONSHOT's Slate (components/tabs/Games.js,
// Games view) built from its own pieces -- components/slate/* -- with
// football's data in them:
//   the strip   one SlateCard per game: expected touchdowns in the game on the dial
//               (the TEAM model, lib/nfl/teamTdModel.js: both clubs, ringed against
//               the league's matchups),
//               kickoff / live / final, the bot's calls in the game as chips
//   the game    The read (each offense against the other defense, in the
//               Matchups page's plain lines), Players (both rosters, the TD
//               table), Matchup (each defense's zone tiles), Picks (the calls,
//               then the game's top TD cards), prev / next
// The open game rides the address (#…&game=<id>), so a shared link opens it.
// The dial is the team model's one number (lib/nfl/teamTdModel.js slateTotals);
// scores, calls and the defense data are the week file's and the matchup file's own.

const HEADLINE_MARKETS = ['TD', 'REC_YDS', 'RUSH_YDS', 'REC', 'PASS_YDS', 'KICK_PTS']
const MARKET_TAG = { TD: 'TD', REC_YDS: 'REC YDS', RUSH_YDS: 'RUSH YDS', REC: 'REC', PASS_YDS: 'PASS YDS', KICK_PTS: 'KICK' }
const PANELS = [['calls', 'Our calls'], ['field', 'The field'], ['players', 'Players'], ['matchup', 'Matchup'], ['out', 'Out']]
const SUBS = {
  calls: "our calls in this game and the game's top touchdown scores.",
  field: 'where this offense attacks, where the other defense is weak, and where they meet; who gets the ball.',
  players: 'every scored player in the game, all the numbers.',
  matchup: 'the numbers that decide a game, side by side.',
  out: 'who is out this week for both clubs, from the injury report.',
}

const stateOf = (g) => (g.state === 'in' ? 'live' : g.completed ? 'final' : 'upcoming')
const kickText = (g) => {
  const at = g.kickoff ? Date.parse(g.kickoff) : NaN
  if (!Number.isFinite(at)) return 'TBD'
  if (at < Date.now() && !g.completed && g.state !== 'in') return 'kickoff passed · not tracked'
  return localDayTime(at, { zone: false })
}
// the header's kickoff: the viewer's own time zone, named once
const kickWhen = (g) => {
  const at = g.kickoff ? Date.parse(g.kickoff) : NaN
  if (!Number.isFinite(at)) return 'TBD'
  if (at < Date.now() && !g.completed && g.state !== 'in') return 'kickoff passed · not tracked'
  return localDayTime(at)
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

// THE USAGE GROUP: what he is on the field for, from the week file's own TD components (percentiles, 0-100; the same fields the board
// reads). Shown only when a row has it (withNflFullSet's rule applies to these too: an empty column is dropped by the table).
// groups in order: PLAYER, THE CALL, USAGE, then boardColumns' own (model scores 3, scoring chances 4, receiving 5 ...)
const GROUP_PLAYER = { key: 'player', label: 'PLAYER', order: 0 }
const GROUP_CALL = { key: 'call', label: 'THE CALL', order: 1 }
const GROUP_USAGE = { key: 'usage', label: 'Role & usage', order: 2 }   // the same group as lib/nfl/boardColumns.js NFL_BOARD_GROUPS.usage (the share columns: Snap %, Snap L3, Tgt %)
const pctOf = (v) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : null)
const usageOf = (p) => {
  const c = p?.components?.TD || {}
  return { u_snap: pctOf(c.f_snap_pct), u_rz: pctOf(c.f_rz_opp), u_gl: pctOf(c.f_gl_opp), u_touch: pctOf(c.f_touches), u_xtd: pctOf(c.f_xtd) }
}
const USAGE_COLS = [
  { key: 'u_snap', label: 'Snap %ile', w: 66, dp: 0, group: GROUP_USAGE, explain: 'Snap share, as a percentile among this week\'s scored players (100 = on the field the most).' },
  { key: 'u_touch', label: 'Touches', w: 62, dp: 0, group: GROUP_USAGE, explain: 'Touches (carries + targets), as a percentile among this week\'s scored players.' },
  { key: 'u_rz', label: 'RZ touches', w: 70, dp: 0, group: GROUP_USAGE, explain: 'Red-zone touches, as a percentile among this week\'s scored players.' },
  { key: 'u_gl', label: 'Goal line', w: 64, dp: 0, group: GROUP_USAGE, explain: 'Goal-line opportunity, as a percentile among this week\'s scored players.' },
  { key: 'u_xtd', label: 'xTD', w: 54, dp: 0, group: GROUP_USAGE, explain: 'Expected touchdowns, as a percentile among this week\'s scored players.' },
]

export default function NflSlate({ data, picks, matchup, logs = null, odds = null, results = null, initialGame = null, games: shownGames, tableColumns, tableRowsFor, storyForGame, onPlayerClick, onOpenTeam = null }) {
  const allGames = data?.games || []
  const players = data?.players || []
  const isPhone = useIsPhone()
  const watchlist = useNflWatchlist(data)
  const pool = useMemo(() => tdPool(data), [data])
  const gameCalls = useGameCalls()   // BATCH-GAME-CALLS G5: TOP + TD per game
  const playersById = useMemo(() => Object.fromEntries(players.map((p) => [String(p.player_id), p])), [players])
  const outCounts = useOutCounts('nfl')   // lib/injuries: "3 out" on the game row and the Out pill (null while loading / unavailable)

  const [gfilter, setGfilter] = useState('all')
  const [panel, setPanel] = useState('field')
  const gameTotals = useGameTotals('nfl')   // each game's own Top Totals row, said on its own game (components/GameTotalLine.js)
  const [hashGame, setHashGame] = useHashFilter('game')
  // A game handed over from another tab (Storylines, the Ledger) opens here.
  useEffect(() => { if (initialGame) setHashGame(String(initialGame)) }, [initialGame])   // eslint-disable-line react-hooks/exhaustive-deps

  // Expected touchdowns per game: the TEAM model's number (both clubs). One source:
  // lib/nfl/teamTdModel.js -- never a sum over the players here.
  const totals = useMemo(() => slateTotals(data, logs), [data, logs])
  const xOf = (g) => (g && Number.isFinite(totals[g.game_id]?.total) ? totals[g.game_id].total : null)
  const heatOf = (g) => totals[g.game_id]?.heat ?? 0

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

  const top = games.reduce((a, g) => ((xOf(g) ?? -1) > ((a ? xOf(a) : null) ?? -1) ? g : a), null)

  const cards = games.map((g) => {
    const x = xOf(g)
    const heat = heatOf(g)
    const calls = callsIn(picks, g)
    const chipsFrom = calls.length
      ? calls.slice(0, 3).map(({ market, call }) => ({ market, name: call.name, score: call.score, pid: call.player_id }))
      : players.filter((p) => (p.team === g.away || p.team === g.home) && Number.isFinite(p.scores?.TD)).sort((a, b) => b.scores.TD - a.scores.TD).slice(0, 2)
        .map((p) => ({ market: 'TD', name: p.name, score: p.scores.TD, pid: p.player_id }))
    const live = g.state === 'in'
    return {
      id: String(g.game_id), title: <MatchLogos sport="nfl" away={g.away} home={g.home} px={26} gap={5} />, past: Boolean(g.completed), heat,
      tooltip: `${g.away} @ ${g.home}${g.venue ? ` · ${g.venue}` : ''}`,
      dial: { value: x, dp: 1, pct: 100 * heat, title: x == null ? `${TD_WORD} — loading` : `${x.toFixed(1)} ${TD_WORD} between the two teams — each club's touchdown rate against the other's defence. The ring shows where it sits among all matchups in the league.` },
      band: x == null ? null : top && g.game_id === top.game_id ? { icon: '🌋', word: 'MAIN EVENT' } : heat >= 0.8 ? { icon: '🔥', word: '' } : heat <= 0.2 ? { icon: '🧊', word: '' } : null,
      status: live ? { kind: 'live', text: g.detail || 'LIVE' } : g.completed ? { kind: 'final', text: 'FINAL' } : { kind: 'time', text: kickText(g) },
      extra: (() => {
        const oc = outCounts([g.away, g.home]); const line = [airText(g), oc?.out ? `${oc.out} out` : null].filter(Boolean).join(' · ')
        const tr = gameTotals?.[String(g.game_id)]
        const tot = totalRowFor(gameTotals, g.game_id) ? <GameTotalMark row={tr} /> : null
        return line || tot ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>{line}{tot}</span> : null
      })(),
      score: (live || g.completed) ? { away: g.away, home: g.home, awayScore: g.away_score, homeScore: g.home_score, live } : null,
      chips: chipsFrom.map((k) => ({
        key: `${k.market}-${k.pid}`, tag: MARKET_TAG[k.market] || k.market, color: gradeFor(k.score).color,
        name: k.name, score: Math.round(k.score ?? 0),
        title: calls.length ? `TUDDY's ${MARKET_TAG[k.market] || k.market} call in this game` : "Top TD score in this game (no headline call lands here)",
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
        legend={`Ring = ${TD_WORD}.`} />
      <GameSwitcher sport="nfl" games={switcherGames} activeGame={activeId} onSelect={select} live={switcherLive} accent={C.green} stickyTop="0px" />

      {g && (() => {
        const inGame = (p) => p.team === g.away || p.team === g.home
        const story = storyForGame?.(g)
        const rows = tableRowsFor(new Set([g.away, g.home]))
        // a one-game table: the kickoff on every row said nothing (Game column dropped); the club code rides its logo.
        // FULL SET (2026-10-10, Donovan: "its kinda just bland wtf no stats or nothing"): the player, the call, the usage, then every
        // number a week-file row carries (lib/nfl/boardColumns.js), in groups.
        const own = tableColumns.filter((c) => c.key !== 'state').map((c) => (c.key === 'team' || c.key === 'opp' ? { ...c, code: true } : c))
        const full = withNflFullSet(rows.map((r) => ({ ...r, ...usageOf(r._raw) })), [...own.map((c) => ({ ...c, group: c.group || (['td', 'matchup', 'flags'].includes(c.key) ? GROUP_CALL : GROUP_PLAYER) })), ...USAGE_COLS], { skip: ['sc_TD'] })
        const x = xOf(g)
        // this game's top touchdown scores that are not the bot's calls: they ride the calls row, wearing their own board word
        const extras = pool.rows.filter(inGame).slice(0, 5).map((p) => {
          const rank = pool.rows.indexOf(p) + 1
          return { player_id: String(p.player_id), name: p.name, team: p.team, position: p.position, depth_role: depthRole(matchup, p.player_id, p.position), role: null, rank, of: pool.rows.length,
            status: tdCallStatus({ td_board: { rank, of: pool.rows.length } }), espn_id: p.espn_id, row: p, score: p.scores?.TD, reason: boardReason(p, pool.weights, pool.base, 'TD', pool.rows)?.text || null }
        })
        return (
          <div id="tuddy-slate-game" style={{ scrollMarginTop: 'calc(var(--hdr-h, 0px) + var(--gsw-h, 0px) + 8px)', marginBottom: 20 }}>
            <GameFrame accent={C.green} past={Boolean(g.completed)}>
              {/* 1. THE GAME, ONCE: the matchup, the kickoff, the dial, and this game's own total */}
              <div style={{ padding: '12px 14px 12px' }}>
                <GameHeader game={g} when={kickWhen(g)} air={airText(g)} xtd={x} heat={heatOf(g)} past={Boolean(g.completed)} onOpenTeam={onOpenTeam}
                  action={<CardButton sport="nfl" label="Download this game as an image" style={{ margin: '-12px 0' }} onDownload={() => {
                    // 📸 this game as a PNG (Wave 8): the two clubs, the team model's expected touchdowns, the men on the board (the call word is lib/nfl/tdStatus's, the board's own)
                    const st = tdStatusFor({ picksCard: picks?.card, gameCalls, games: allGames, board: pool.rows })
                    return downloadNflGameCard(g, { rows: pool.rows.filter(inGame).map((p) => ({ p, status: st.statusOf(p), rank: pool.rows.indexOf(p) + 1 })), total: totals[g.game_id] || null, games: allGames, results, date: g.kickoff ? easternDate(Date.parse(g.kickoff)) : '' })
                  }} />}
                  outLine={(() => { const oc = outCounts([g.away, g.home]); return oc?.out ? `${oc.out} out` : null })()} />
                <GameTotalLine sport="nfl" row={gameTotals?.[String(g.game_id)]} style={{ marginTop: 8 }} />
              </div>
              <div style={{ borderTop: `1px solid ${C.border}`, padding: '12px 14px 14px', background: 'rgba(0,0,0,.15)' }}>
                <GamePanelPills panels={PANELS} subs={SUBS} panel={panel} setPanel={setPanel} gamePk={g.game_id} isPhone={isPhone} accent={C.green} stickyTop="var(--gsw-h, 0px)"
                  badges={{ out: (() => { const oc = outCounts([g.away, g.home]); return oc?.out ? String(oc.out) : '' })() }} />

                {/* 2. OUR CALLS: the headline. The called men as cards, this game's top touchdown scores after them */}
                <PanelAnchor id="calls" gamePk={g.game_id}>
                  <WriteupBlock game={g} gameCalls={gameCalls} week={data} matchup={matchup} logs={logs} odds={odds} onPlayerClick={onPlayerClick} onOpenTeam={onOpenTeam} extras={extras} />
                  {story && (
                    <p style={{ margin: '0 0 14px', fontSize: 13, lineHeight: 1.5, color: C.text2 }}>
                      <b style={{ color: C.green, fontFamily: NUM_FONT, fontSize: 12, letterSpacing: '.08em' }}>{story.kind === 'model' ? 'THE CALL' : 'MILESTONE'} </b>
                      <Tap onClick={() => onPlayerClick?.(story.player, story.market)}>{story.text}</Tap>
                    </p>
                  )}
                  <GameLedgerLine sport="nfl" gameId={g.game_id} day={g.kickoff ? easternDate(Date.parse(g.kickoff)) : null} />
                </PanelAnchor>

                {/* 3. THE FIELD: offense vs defense, then who gets the ball against which corner */}
                <PanelAnchor id="field" gamePk={g.game_id}>
                  <GameOffDef key={g.game_id} matchup={matchup} players={players} game={g} onPlayerClick={onPlayerClick} />
                  <KeyPlayers matchup={matchup} data={data} game={g} onPlayerClick={onPlayerClick} onOpenTeam={onOpenTeam} />
                </PanelAnchor>

                {/* 4. THE PLAYERS: every scored player in the game, all the numbers */}
                <PanelAnchor id="players" gamePk={g.game_id}>
                  <Kicker>ALL PLAYERS IN THE GAME, BY TD SCORE</Kicker>
                  <NflTable {...full} onRowClick={(r) => onPlayerClick?.(r?._raw ?? r)} maxRows={8} maxHeight={9999}
                    caption={`${full.rows.length} players · sorted by TD score`} />
                </PanelAnchor>

                {/* 5. THE MATCHUP, the important stats, then each defence's file */}
                <PanelAnchor id="matchup" gamePk={g.game_id} style={{ marginTop: 14 }}>
                  <MatchupScoreboard matchup={matchup} data={data} game={g} />
                  <ImportantStats matchup={matchup} data={data} game={g} onOpenTeam={onOpenTeam} />
                  {/* BOTH DEFENCES (2026-10-10): each club's defence tags and its key defenders, the defence the other offence faces */}
                  <DefenseFile matchup={matchup} slateSeason={data?.season} def={g.home} off={g.away} />
                  <DefenseFile matchup={matchup} slateSeason={data?.season} def={g.away} off={g.home} />
                </PanelAnchor>

                {/* 6. WHO IS OUT (lib/injuries): collapsed, both clubs, our board men first */}
                <PanelAnchor id="out" gamePk={g.game_id}>
                  {(() => {
                    const mine = new Set(callsIn(picks, g).map(({ call }) => nameKey(call.name)))
                    const find = (e) => players.find((p) => p.team === e.team && nameKey(p.name) === nameKey(e.name)) || null
                    return (
                      <InjuryOut sport="nfl" clubs={[g.away, g.home]} theme={{ C, NUM_FONT, accent: C.green }} title="Out this week" openSignal={panel === 'out'}
                        isOurs={(e) => mine.has(nameKey(e.name)) || Boolean(find(e) && Number.isFinite(find(e).scores?.TD))}
                        openPlayer={(e) => { const p = find(e); return p ? () => onPlayerClick?.(p, 'TD') : null }}
                        roleOf={(e) => { const p = find(e); return p ? depthRole(matchup, p.player_id, p.position) : null }}
                        onOpenTeam={onOpenTeam} />
                    )
                  })()}
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
