'use client'
import { takeTarget } from '../../../lib/openTarget'
import { useEffect, useMemo, useState } from 'react'
import { C, NUM_FONT, TYPE } from '../../../lib/nfl/theme'
import { alignedSignals } from '../../../lib/nfl/dvpSignal'
import MatchupBadge from '../MatchupBadge'
import NflTable from '../NflTable'
import PageHeader from '../../PageHeader'
import NflSlate from '../NflSlate'
import { ViewPills } from '../../slate/SlateParts'
import BoardTopBar from '../../BoardTopBar'
import NflProjected from '../NflProjected'
import NflWeakSpots from '../NflWeakSpots'
import { nflGameOptions } from '../NflBoardExtras'
import { readHashKey, useHashFilter } from '../../../lib/filterHash'
import { useNflWatchlist } from '../../../lib/nfl/watchlist'
import { useResultsArchive } from '../../../lib/nfl/resultsArchive'
import { milestoneStreaks, modelNarrativeStories, milestoneHeadline, modelHeadline } from '../../../lib/nfl/storylines'

const HEADLINE_MARKETS = new Set(['TD', 'REC_YDS', 'RUSH_YDS', 'REC', 'PASS_YDS', 'KICK_PTS'])

// ── THE LANDING VIEW, TABLE FIRST (parity pass, 2026-09-16) ─────────────────
// MOONSHOT's own Games.js already made this exact call, from Donovan's own
// mouth (2026-08-30): "have the games open up full table instead of cards
// first, the game chips take up too much screen space." TUDDY never had a
// table view of Games at all -- cards were the only option. This is the same
// preference, same page's job, carried over: table lands first, cards are
// one tap away, same DenseTable component MOONSHOT's own table reuses (and
// TUDDY already reuses on Pairs/Explosive/Accountability/BoxScores).
function kickoffLabel(game) {
  if (game.state === 'in') return 'LIVE'
  if (game.completed) return 'FINAL'
  const at = game.kickoff ? Date.parse(game.kickoff) : NaN
  if (!Number.isFinite(at)) return '—'
  return new Date(at).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })
}

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

// The cards view became the Slate (2026-09-28): components/nfl/NflSlate.js,
// MOONSHOT's Slate built from components/slate/*. StateBadge, ScoreLine,
// SidePicks, DesignatedCalls, GameIntel and Meter went with the old cards;
// their data is in the Slate's read, players, matchup and picks sections.

// FILTERS (2026-09-28): the boards' top bar -- search, team, game -- above
// both views, replacing the old search / state box and game-picker strip.

export default function Games({ data, picks, matchup, logs, results, odds = null, onPlayerClick, onOpenTeam = null }) {
  const games = data?.games || []
  const players = data?.players || []
  // A game tapped on another tab (Storylines, the Ledger) opens selected here.
  // A game handed over from another tab (Storylines, the Ledger), or named in
  // the address, opens the Slate's Games view on it (2026-09-28).
  const [handed] = useState(() => (typeof window === 'undefined' ? null : takeTarget('game') || readHashKey('game') || null))
  // THE TOP BAR, THE BOARDS' OWN (2026-09-28, Donovan: "toggle games and teams"):
  // search, team and game above both views, team/game in the address (fteam /
  // fgame), exactly as the boards and MOONSHOT's Slate do.
  const [query, setQuery] = useState('')
  const [fteam, setFteam] = useHashFilter('fteam')
  const [fgame, setFgame] = useHashFilter('fgame')
  const [openGame, setOpenGame] = useState(null)
  // Cards first, like MOONSHOT's Slate (Donovan 2026-09-28); Table one tap away.
  const [view, setView] = useState('games')
  const watchlist = useNflWatchlist(data)
  const playersById = useMemo(() => Object.fromEntries(players.map((player) => [String(player.player_id), player])), [players])

  // WHY THIS MATTERS (2026-09-12) -- Storylines' second surface, per Phase
  // 3's original two-surface spec (tab + inline blurb). Same two real
  // angles the Storylines tab renders, from the same shared source
  // (lib/nfl/storylines.js) -- surfaced as one line on whichever game
  // actually has one. Most games won't; this renders nothing rather than
  // force a line that isn't there, same "say nothing when there's nothing
  // to say" rule MatchupBadge above already follows.
  const { archive: resultsArchive, keys: resultsKeys } = useResultsArchive(results, data?.season)
  const milestones = useMemo(() => milestoneStreaks(logs, data), [logs, data])
  const modelStories = useMemo(
    () => modelNarrativeStories(resultsArchive, resultsKeys, playersById),
    [resultsArchive, resultsKeys, playersById],
  )
  // ── ONE STORY PER CARD, AND NOT THE SAME STORY SIXTEEN TIMES ────────────
  // Picking each card's story independently meant each one took the longest
  // streak available, and the longest streaks all live in the same market —
  // every visible card read "has carried it 12+ times in N straight games."
  // Six identical sentence shapes in a column stop reading as storylines and
  // start reading as a template, which is the opposite of the point.
  //
  // So stories are assigned across the whole page in one pass: a market that
  // has already been used gets passed over while any card still has an
  // unused market available. Nothing is invented and nothing is suppressed —
  // the same stories, spread instead of stacked. Model narratives are exempt
  // (they are rare, and two on a page is already unusual).
  const storyByGame = useMemo(() => {
    const out = {}
    const usedMarkets = new Set()
    // `games` rather than the display-sorted list: `sorted` is declared
    // further down and this memo runs during the same render. Assignment
    // order only decides which card gets first pick of an unused market.
    for (const game of games) {
      const inGame = (p) => p?.team === game.away || p?.team === game.home
      const model = modelStories.find((c) => inGame(c.player))
      if (model) {
        out[game.game_id ?? `${game.away}@${game.home}`] =
          { kind: 'model', text: modelHeadline(model), player: model.player, market: model.hitMarket }
        continue
      }
      const candidates = milestones.filter((r) => inGame(r.player))
      if (!candidates.length) continue
      const mile = candidates.find((r) => !usedMarkets.has(r.marketKey)) || candidates[0]
      usedMarkets.add(mile.marketKey)
      out[game.game_id ?? `${game.away}@${game.home}`] =
        { kind: 'milestone', text: milestoneHeadline(mile), player: mile.player, market: mile.marketKey }
    }
    return out
  }, [games, milestones, modelStories])
  const storyForGame = (game) => storyByGame[game.game_id ?? `${game.away}@${game.home}`] || null

  if (!games.length) {
    return (
      <div style={{
        border: `1px dashed ${C.border2}`, borderRadius: 12, padding: 28,
        textAlign: 'center', color: C.text3, fontSize: TYPE.body,
      }}>
        No games on this slate yet. The bot posts the week when the schedule lands.
      </div>
    )
  }


  // Live first — real scoreboard behavior: what's happening right now
  // belongs at the top of the grid, not wherever the payload's own order
  // happened to put it. Array.prototype.sort is stable, so pregame/final
  // games keep their original relative order.
  const needle = query.trim().toLowerCase()
  const sorted = [...games].sort((a, b) => (a.state === 'in' ? 0 : 1) - (b.state === 'in' ? 0 : 1))
    .filter((game) => !fgame || `${game.away}@${game.home}` === fgame)
    .filter((game) => !fteam || game.away === fteam || game.home === fteam)
  const inView = (p) => (!fteam || p.team === fteam) && (!needle || `${p.name} ${p.team}`.toLowerCase().includes(needle))
  const liveCount = games.filter((game) => game.state === 'in').length
  const finalCount = games.filter((game) => game.completed).length

  // ── ONE ROW PER PLAYER, THE WHOLE SLATE (parity pass, 2026-09-16) ───────
  // Same filtered/sorted game set the card view already uses (state/search/
  // game-picker all apply to both views identically) -- just a different
  // shape of the same real data, nothing new fetched. TD is the flagship
  // market (same reason Home's own hero strip leads with it), so it's the
  // one numeric column here; the matchup badge and the two real signal
  // flags built this session (high_confidence_td_flag, alignedSignals) ride
  // along -- the first place either flag is visible on this page.
  const gameByTeam = {}
  for (const g of games) { gameByTeam[g.away] = g; gameByTeam[g.home] = g }
  const rowsFor = (teams) => players
    .filter((p) => teams.has(p.team) && !p.low_sample && inView(p))
    .map((p) => {
      const g = gameByTeam[p.team]
      const aligned = alignedSignals(matchup, p)
      const flags = `${p.high_confidence_td_flag ? '⭐' : ''}${aligned?.aligned ? '🧩' : ''}` || '—'
      return {
        _raw: p,
        name: p.name,
        team: p.team,
        position: p.position,
        opp: g ? (g.away === p.team ? g.home : g.away) : '—',
        state: g ? kickoffLabel(g) : '—',
        td: p.scores?.TD ?? null,
        matchup: null,
        watched: watchlist.isPinned(p.player_id) ? 1 : 0,
        flags,
      }
    })
    .sort((a, b) => (b.td ?? -1) - (a.td ?? -1))
  const tableRows = rowsFor(new Set(sorted.flatMap((g) => [g.away, g.home])))
  const TABLE_COLUMNS = [
    // Native DenseTable action column (see LongestBoard.js's buildColumns) --
    // lit off the row's own watched:1/0 field, not a custom button, so this
    // table's watchlist star behaves identically to every other DenseTable
    // board's, MLB or NFL.
    { key: 'watched', label: '☆', action: true, w: 28, mark: '★', markOff: '☆',
      titleOn: 'Remove from watchlist', titleOff: 'Add to watchlist',
      onAction: (row) => watchlist.toggle(row) },
    { key: 'name', label: 'Player', heat: false, sticky: true, bold: true, w: 150 },
    { key: 'team', label: 'Team', heat: false, w: 44 },
    { key: 'position', label: 'Pos', heat: false, w: 38 },
    { key: 'opp', label: 'Opp', heat: false, w: 44 },
    { key: 'state', label: 'Game', heat: false, w: 76 },
    { key: 'td', label: 'TD Score', w: 70, dp: 0 },
    { key: 'matchup', label: 'Matchup', heat: false, w: 88, fmt: (v, r) => <MatchupBadge matchup={matchup} player={r._raw} market="TD" /> },
    { key: 'flags', label: 'Signal', heat: false, w: 50, title: '⭐ A+ TD look · 🧩 aligned signals' },
  ]

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
  // Not over while a game is still being played (2026-09-28: it said so during MNF).
  const waveIsOver = lastKickoff > 0 && lastKickoff < Date.now() && !games.some((g) => g.state === 'in')
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
            border: `1px solid ${C.yellow}5c`, background: `${C.yellow}20`,
            color: C.text2, fontSize: TYPE.body, lineHeight: 1.5,
          }}
        >
          <b style={{ color: C.yellow }}>This wave is over.</b> Last kickoff was {waveEnded}
          — everything below is kept for reference, not live, until the next slate replaces it.
        </div>
      )}
      {/* The shared page header, not a hand-rolled hero (2026-09-18). Same
          component MOONSHOT's Slate page renders through; the eyebrow, the
          jade stat block and the sport's own words are props, not a second
          stylesheet. */}
      <PageHeader
        eyebrow="TUDDY · SLATE"
        title="Slate"
        note="Every game this week. Table ranks every scored player; Games opens one game at a time — its read, both rosters, where each defense gets beaten, and the calls."
        theme={C}
        numFont={NUM_FONT}
        accent={C.cyan}
        stats={[
          { value: games.length, label: 'GAMES', tone: C.green },
          { value: liveCount, label: 'LIVE', tone: C.green, dot: liveCount > 0 },
          { value: finalCount, label: 'FINAL', tone: C.green },
        ]}
      />

      <BoardTopBar query={query} setQuery={setQuery} placeholder="Search player or team…"
        team={fteam} setTeam={setFteam} teams={[...new Set(games.flatMap((g) => [g.away, g.home]).filter(Boolean))].sort()} teamLabel="🏈 All teams"
        game={fgame} setGame={setFgame} games={nflGameOptions(games)} gameLabel="All games" />
      <div style={{ height: 10 }} />

      {/* TABLE | GAMES, MOONSHOT's Slate pills (components/slate/SlateParts). */}
      <ViewPills views={[['table', '📊 Table'], ['games', '🏟 Games']]} view={view} setView={setView} accent={C.green} />

      {view === 'table' && (<>
      {!sorted.length && (
        <div style={{
          border: `1px dashed ${C.border2}`, borderRadius: 12, padding: 22,
          textAlign: 'center', color: C.text3, fontSize: TYPE.body, marginBottom: 12,
        }}>No games clear this filter.</div>
      )}
      {/* PROJECTED OUTPUT, MOONSHOT's Slate Table view's own panel (00Q step 1). */}
      <NflProjected data={data} matchup={matchup} logs={logs} players={players.filter(inView)} games={sorted} watchlist={watchlist}
        onOpenGame={(id) => { setOpenGame(String(id)); setView('games') }} onOpenTeam={onOpenTeam} />
      {/* WEAK SPOTS, MOONSHOT's "★ Weak spots" cards (00Q step 2). */}
      <NflWeakSpots matchup={matchup} players={players.filter(inView)} games={sorted} onPlayerClick={onPlayerClick} onOpenTeam={onOpenTeam} />

        <NflTable
          rows={tableRows}
          columns={TABLE_COLUMNS}
          onRowClick={(r) => onPlayerClick?.(r?._raw ?? r)}
          caption={`${tableRows.length} players · sorted by TD score`}
          maxRows={60 /* 0g E3: inside its box, but 300 DOM rows; "show N more" */}
        />
      </>)}

      {view === 'games' && (
        <NflSlate data={data} picks={picks} matchup={matchup} odds={odds} games={sorted} initialGame={openGame || handed}
          tableColumns={TABLE_COLUMNS} tableRowsFor={rowsFor} storyForGame={storyForGame}
          onPlayerClick={onPlayerClick} onOpenTeam={onOpenTeam} />
      )}


    </div>
  )
}
