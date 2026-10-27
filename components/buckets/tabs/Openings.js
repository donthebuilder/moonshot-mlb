'use client'
import { useMemo, useState } from 'react'
import PageHeader from '../../PageHeader'
import BucketsTable from '../BucketsTable'
import FiltersSheet from '../../player/FiltersSheet'
import { PillRow } from '../../Filters'
import { C, NUM_FONT } from '../../../lib/nba/theme'
import { useLiveFetch } from '../../../lib/useLiveFetch'
import { useBucketsScores } from '../../../lib/nba/useBuckets'
import { useHashLens } from '../../../lib/useHashLens'
import { DelayedBanner, Loading, EmptyState } from '../ui'
import FirstBasketMatchup from '../../openings/FirstBasketMatchup'
import RateStack from '../../openings/RateStack'
import LeagueLine from '../../openings/LeagueLine'
import { HideClubs, useHidden } from '../../openings/hideClubs'
import { surname } from '../../../lib/player'

// 🏀 OPENINGS (2026-10-22, Donovan: "researching the first basket ... team tip win rate, who gets the first shots, position and
// players, how many shots they take in the first 3 minutes, usage in that first 3 minutes, points ... first baskets for their
// team and/or the game" + "the first six minutes ... for first quarter tickets"). The research page for the opening of a game:
//   TONIGHT   each game's two clubs: tip record, their usual jumper, how often they score first, the man who takes their first
//             shot most, and their first-3-minute and Q1 scoring (answer first)
//   TEAMS / PLAYERS  every club and every player, sorted by the lane you pick (first basket · first 3 min · first 6 min · Q1)
// Counts from /api/buckets/openings (opening_games / opening_players: every game since 2025-26, written once at grade time).
// Nothing here is a chance: what happened, and how often. The tip is credited to the club that got the ball.
// each lane: its word and the column it sorts by on each table
const LANES = {
  first: { word: 'First basket', team: 'firstPct', player: 'firstFgPct' },
  w1: { word: 'First 3 min', team: 'w1For', player: 'w1Use' },
  w2: { word: 'First 6 min', team: 'w2For', player: 'w2Use' },
  q1: { word: 'Q1', team: 'q1For', player: 'q1Pts' },
}
const VIEWS = ['teams', 'players']
const f1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : '—')
const pc = (v) => (Number.isFinite(v) ? `${v.toFixed(0)}%` : '—')
// his first baskets by shot: "2PT Jumper 2 · 3PT 1" (the counts, biggest first)
const typeText = (v) => (v?.length ? v.slice(0, 3).map(([w, , n]) => `${w} ${n}`).join(' · ') : '—')

export default function Openings({ date, onOpenPlayer, onOpenTeam, onOpenGame }) {
  const [view, setView] = useHashLens(VIEWS, 'players')
  const [lane, setLane] = useState('first')
  const [season, setSeason] = useState('this')
  const [where, setWhere] = useState('all')
  const [last, setLast] = useState('all')
  const url = `/api/buckets/openings?season=${season}&where=${where}${last === 'all' ? '' : `&last=${last}`}`
  const { data, error, loading } = useLiveFetch(url)
  const { data: sb } = useBucketsScores(date)
  const { data: lineupData } = useLiveFetch(`/api/buckets/lineups?date=${date}`)   // who is starting tonight (ESPN posts it close to tip)
  const L = LANES[lane] || LANES.first
  const hc = useHidden('nba:clubs')   // clubs hidden on this device (components/openings/hideClubs.js)
  // a rate on a handful of games is noise: 20+ games across seasons, anyone this early in this season alone
  const minGp = season === 'this' ? 1 : 20

  const teamsBy = useMemo(() => new Map((data?.teams || []).map((t) => [t.team, t])), [data])
  const players = useMemo(() => (data?.players || []).filter((p) => p.gp >= minGp && !hc.hidden.has(p.team)), [data, minGp, hc.hidden])
  // each club's man who takes its first shot most (the same games floor as the table)
  const firstShooter = useMemo(() => {
    const m = new Map()
    for (const p of players) if (p.gp >= minGp && (!m.has(p.team) || p.firstShotPct > m.get(p.team).firstShotPct)) m.set(p.team, p)
    return m
  }, [players, minGp])

  // TONIGHT: two rows a game (away first), the clubs' own records
  const tonight = useMemo(() => (sb?.games || []).filter((g) => !hc.hidden.has(g.away?.abbrev) && !hc.hidden.has(g.home?.abbrev)).flatMap((g) => ['away', 'home'].map((s) => {
    const t = g[s]?.abbrev
    const T = teamsBy.get(t) || {}
    const fs = firstShooter.get(t)
    return { _id: `${g.id}-${s}`, gameId: g.id, game: s === 'away' ? `${g.away?.abbrev} @ ${g.home?.abbrev}` : '', team: t, ...T,
      jumperTxt: T.jumper ? `${T.jumper} ${T.jumperW}-${T.jumperJ - T.jumperW}` : '—', shooter: fs?.name || '—', shooterId: fs?.playerId || null, shooterPct: fs?.firstShotPct ?? null }
  })), [sb, teamsBy, firstShooter, hc.hidden])

  const tonightCols = [
    { key: 'game', label: 'Game', group: 'Game', w: 92, heat: false, sticky: true, bold: true, link: (r) => (onOpenGame && r.game ? () => onOpenGame(r.gameId) : null) },
    { key: 'team', label: 'Tm', group: 'Game', w: 52, heat: false, mono: true, teamMark: 'nba', link: (r) => (onOpenTeam ? () => onOpenTeam(r.team) : null) },
    { key: 'tipPct', label: 'TIP %', group: 'The tip', w: 56, fmt: pc, primary: true, title: 'How often his club got the opening tip' },
    { key: 'jumperTxt', label: 'Jumper', group: 'The tip', w: 150, heat: false, numeric: false, link: (r) => (onOpenPlayer && r.jumperId ? () => onOpenPlayer(r.jumperId) : null), title: 'The man who jumps for them most, and his tip record (won-lost)' },
    { key: 'firstPct', label: '1ST SCORE %', group: 'First basket', w: 78, fmt: pc, title: 'How often his club made the first basket' },
    { key: 'firstWhenTipPct', label: 'AFTER TIP %', group: 'First basket', w: 78, fmt: (v, r) => <RateStack v={v} pair={r.afterTip} C={C} NUM_FONT={NUM_FONT} />, title: 'How often they scored the first basket in games they won the tip' },
    { key: 'shooter', label: 'Takes 1st shot', group: 'First basket', w: 150, heat: false, numeric: false, link: (r) => (onOpenPlayer && r.shooterId ? () => onOpenPlayer(r.shooterId) : null), title: 'The player who takes his club’s first shot most often' },
    { key: 'shooterPct', label: '%', group: 'First basket', w: 44, fmt: pc, title: 'How often he took the game’s first shot' },
    { key: 'w1For', label: '3 MIN', group: 'Scoring', w: 52, fmt: f1, title: 'Points a game in the first 3 minutes' },
    { key: 'q1For', label: 'Q1', group: 'Scoring', w: 48, fmt: f1, title: 'Points a game in the first quarter' },
    { key: 'q1Ag', label: 'Q1 AG', group: 'Scoring', w: 52, fmt: f1, invert: true, title: 'Points a game allowed in the first quarter' },
  ]
  const teamCols = [
    { key: 'team', label: 'Team', group: 'Team', w: 60, heat: false, sticky: true, bold: true, mono: true, teamMark: 'nba', link: (r) => (onOpenTeam ? () => onOpenTeam(r.team) : null) },
    { key: 'gp', label: 'GP', group: 'Team', w: 40, heat: false },
    { key: 'tipPct', label: 'TIP %', group: 'The tip', w: 56, fmt: pc, primary: lane === 'first' },
    { key: 'jumper', label: 'Jumper', group: 'The tip', w: 140, heat: false, numeric: false, link: (r) => (onOpenPlayer && r.jumperId ? () => onOpenPlayer(r.jumperId) : null) },
    { key: 'jumperRec', label: 'W-L', group: 'The tip', w: 56, heat: false, numeric: false },
    { key: 'firstPct', label: '1ST SCORE %', group: 'First basket', w: 78, fmt: pc, primary: lane === 'first' },
    { key: 'firstWhenTipPct', label: 'AFTER TIP %', group: 'First basket', w: 78, fmt: (v, r) => <RateStack v={v} pair={r.afterTip} C={C} NUM_FONT={NUM_FONT} />, title: 'How often they scored the first basket in games they won the tip' },
    { key: 'firstWhenLostPct', label: 'IF LOST TIP %', group: 'First basket', w: 84, fmt: (v, r) => <RateStack v={v} pair={r.afterLost} C={C} NUM_FONT={NUM_FONT} />, title: 'How often they scored the first basket in games they lost the tip' },
    { key: 'shotsToFirst', label: 'SHOTS TO 1ST', group: 'First basket', w: 84, fmt: f1, invert: true, title: 'Their field-goal attempts before the game’s first made basket (that make counts), a game; fewer is quicker' },
    { key: 'w1For', label: 'FOR', group: 'First 3 min', w: 48, fmt: f1, primary: lane === 'w1' },
    { key: 'w1Ag', label: 'AG', group: 'First 3 min', w: 44, fmt: f1, invert: true },
    { key: 'w1FgPct', label: 'FG%', group: 'First 3 min', w: 52, fmt: pc, title: 'His club’s shots made over taken in the first 3 minutes, every game' },
    { key: 'w2For', label: 'FOR', group: 'First 6 min', w: 48, fmt: f1, primary: lane === 'w2' },
    { key: 'w2Ag', label: 'AG', group: 'First 6 min', w: 44, fmt: f1, invert: true },
    { key: 'w2FgPct', label: 'FG%', group: 'First 6 min', w: 52, fmt: pc, title: 'His club’s shots made over taken in the first 6 minutes, every game' },
    { key: 'q1For', label: 'FOR', group: 'Q1', w: 48, fmt: f1, primary: lane === 'q1' },
    { key: 'q1Ag', label: 'AG', group: 'Q1', w: 44, fmt: f1, invert: true },
    { key: 'q1FgPct', label: 'FG%', group: 'Q1', w: 52, fmt: pc, title: 'His club’s shots made over taken in the first quarter, every game' },
  ]
  const playerCols = [
    { key: 'name', label: 'Player', group: 'Player', w: 150, heat: false, sticky: true, bold: true },
    { key: 'team', label: 'Tm', group: 'Player', w: 52, heat: false, mono: true, teamMark: 'nba', link: (r) => (onOpenTeam ? () => onOpenTeam(r.team) : null) },
    { key: 'pos', label: 'Pos', group: 'Player', w: 40, heat: false, numeric: false, dim: true },
    { key: 'gp', label: 'GP', group: 'Sample', w: 40, heat: false },
    { key: 'gs', label: 'GS', group: 'Sample', w: 40, heat: false, title: 'Games he started' },
    { key: 'firstShotPct', label: '1ST SHOT %', group: 'First basket', w: 72, fmt: pc, title: 'How often he took the game’s first shot' },
    { key: 'top3ShotPct', label: 'TOP-3 %', group: 'First basket', w: 60, fmt: pc, title: 'How often he took one of the game’s first three shots' },
    { key: 'firstFg', label: '1ST FG', group: 'First basket', w: 52, title: 'First baskets of the game he made' },
    { key: 'firstFgPct', label: '1ST FG %', group: 'First basket', w: 64, fmt: pc, primary: lane === 'first' },
    { key: 'firstTypes', label: '1ST FG TYPE', group: 'First basket', w: 170, numeric: false, heat: false, fmt: typeText, title: 'What his first baskets were: the shot and how many' },
    { key: 'w1Fga', label: 'FGA', group: 'First 3 min', w: 44, fmt: f1 },
    { key: 'w1Pts', label: 'PTS', group: 'First 3 min', w: 44, fmt: f1 },
    { key: 'w1FgPct', label: 'FG%', group: 'First 3 min', w: 52, fmt: pc, title: 'His shots made over taken in the first 3 minutes, every game' },
    { key: 'w1Use', label: 'USG %', group: 'First 3 min', w: 56, fmt: f1, primary: lane === 'w1', title: 'His share of his club’s shots, free throws and turnovers in the first 3 minutes' },
    { key: 'w2Fga', label: 'FGA', group: 'First 6 min', w: 44, fmt: f1 },
    { key: 'w2Pts', label: 'PTS', group: 'First 6 min', w: 44, fmt: f1 },
    { key: 'w2FgPct', label: 'FG%', group: 'First 6 min', w: 52, fmt: pc, title: 'His shots made over taken in the first 6 minutes, every game' },
    { key: 'w2Use', label: 'USG %', group: 'First 6 min', w: 56, fmt: f1, primary: lane === 'w2' },
    { key: 'q1Pts', label: 'PTS', group: 'Q1', w: 44, fmt: f1, primary: lane === 'q1' },
    { key: 'q1FgPct', label: 'FG%', group: 'Q1', w: 52, fmt: pc, title: 'His shots made over taken in the first quarter, every game' },
    { key: 'q1Reb', label: 'REB', group: 'Q1', w: 44, fmt: f1 },
    { key: 'q1Ast', label: 'AST', group: 'Q1', w: 44, fmt: f1 },
    { key: 'q1Ra', label: 'R+A', group: 'Q1', w: 44, fmt: f1 },
    { key: 'q1Use', label: 'USG %', group: 'Q1', w: 56, fmt: f1 },
  ]
  // THE FIRST-BASKET MATCHUP (components/openings/FirstBasketMatchup.js, shared): tonight's games, each club against the other,
  // then the first-basket targets ranked by the record (first baskets made %, then first shot %)
  const matchGames = useMemo(() => (sb?.games || []).filter((g) => g.away?.abbrev && g.home?.abbrev && !hc.hidden.has(g.away.abbrev) && !hc.hidden.has(g.home.abbrev)).map((g) => ({ key: String(g.id), away: g.away.abbrev, home: g.home.abbrev, label: `${g.away.abbrev} @ ${g.home.abbrev}` })), [sb, hc.hidden])
  const matchStats = [
    { key: 'tipPct', label: 'Wins the tip', fmt: pc, higher: true },
    { key: 'jumper', label: 'Usual jumper', fmt: (v, T) => (T.jumper ? `${surname(T.jumper)} ${T.jumperW}-${T.jumperJ - T.jumperW}` : '—'), higher: true, barOf: (T) => (T.jumperJ ? (100 * T.jumperW) / T.jumperJ : null) },   // lit / pulled by his tip win %
    { key: 'firstPct', label: 'Scores first', fmt: pc, higher: true },
    { key: 'firstWhenTipPct', label: 'First, after the tip', fmt: pc, higher: true },
    { key: 'firstWhenLostPct', label: 'First, after losing it', fmt: pc, higher: true },
    { key: 'shotsToFirst', label: 'Shots to 1st FG', fmt: f1, higher: false },   // fewer attempts before the game's first make is quicker
    { key: 'w1For', label: 'First 3 min PTS', fmt: f1, higher: true },
    { key: 'w1Ag', label: 'First 3 min allowed', fmt: f1, higher: false },
    { key: 'w1FgPct', label: 'First 3 min FG%', fmt: pc, higher: true },
    { key: 'q1For', label: 'Q1 PTS', fmt: f1, higher: true },
    { key: 'q1Ag', label: 'Q1 allowed', fmt: f1, higher: false },
    { key: 'q1FgPct', label: 'Q1 FG%', fmt: pc, higher: true },
  ]
  // percent first, the count small under it (Trending's cell; Donovan: "I like the percentages")
  const rate = (ok, n) => (v) => (!Number.isFinite(v) ? '—' : (
    <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1.15 }}>
      <span>{v.toFixed(0)}%</span><span style={{ font: `600 10px/1.1 ${NUM_FONT}`, color: C.text3 }}>{`${ok}/${n}`}</span>
    </span>
  ))
  const targetCols = [
    { key: 'name', label: 'Player', group: 'Player', w: 150, heat: false, sticky: true, bold: true },
    { key: 'team', label: 'Tm', group: 'Player', w: 52, heat: false, mono: true, teamMark: 'nba', link: (r) => (onOpenTeam ? () => onOpenTeam(r.team) : null) },
    { key: 'firstFgPct', label: '1ST FG', group: 'First basket', w: 52, primary: true, fmt: (v, r) => rate(r.firstFg, r.gp)(v), title: 'How often he made the game’s first basket (first baskets / games)' },
    { key: 'firstShotPct', label: 'TAKES', group: 'First basket', w: 52, fmt: (v, r) => rate(r.firstShots, r.gp)(v), title: 'How often he took the game’s first shot' },
    { key: 'firstShotMadePct', label: 'MAKES', group: 'First basket', w: 52, fmt: (v, r) => rate(r.firstShotMade, r.firstShots)(v), title: 'When he took the game’s first shot, how often it went in' },
    { key: 'w1FgPct', label: '3M FG%', group: 'First basket', w: 56, fmt: pc, title: 'His field-goal % in the first 3 minutes' },
    { key: 'firstTypes', label: '1ST FG TYPE', group: 'First basket', w: 170, numeric: false, heat: false, fmt: typeText, title: 'What his first baskets were: the shot and how many' },
    { key: 'pos', label: 'OPP ALLOWS', group: 'Matchup', w: 110, numeric: false, heat: false, fmt: (v, r) => oppAllows(r), title: 'The club he faces tonight, and the share of first baskets it has given up to his position' },
  ]
  // the club each side faces tonight, for OPP ALLOWS
  const oppOf = new Map(matchGames.flatMap((g) => [[g.away, g.home], [g.home, g.away]]))
  const oppAllows = (r) => {
    const opp = oppOf.get(r.team)
    if (!opp) return '—'
    const A = teamsBy.get(opp)?.allows
    const hit = A?.pos?.find(([pos]) => pos === r.pos)
    return A?.n ? `${opp} ${r.pos || '—'} ${hit ? Math.round(hit[1]) : 0}%` : opp
  }
  const targetSort = (a, b) => (b.firstFgPct ?? -1) - (a.firstFgPct ?? -1) || (b.firstShotPct ?? -1) - (a.firstShotPct ?? -1)

  const teamRows = useMemo(() => (data?.teams || []).filter((t) => !hc.hidden.has(t.team)).map((t) => ({ ...t, _id: t.team, jumperRec: t.jumper ? `${t.jumperW}-${t.jumperJ - t.jumperW}` : '—' }))
    .sort((a, b) => (b[L.team] ?? -1) - (a[L.team] ?? -1)), [data, L, hc.hidden])
  const playerRows = useMemo(() => players.map((p) => ({ ...p, _id: p.playerId })).sort((a, b) => (b[L.player] ?? -1) - (a[L.player] ?? -1)), [players, L])
  const seasonOpts = null   // THIS SEASON ONLY (2026-10-27, Donovan)
  const sample = (data?.seasons || []).map((s) => `${s.label} ${s.games} games`).join(' · ')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <PageHeader eyebrow="BUCKETS · OPENINGS" title="The tip, the first basket, the first quarter"
        note={sample ? `What happened in the opening of every game: ${sample}. Counts, not a chance.` : 'What happened in the opening of every game. Counts, not a chance.'}
        theme={C} numFont={NUM_FONT} accent={C.purple} />
      <LeagueLine label="Tip winner scores first" league={data?.league} C={C} NUM_FONT={NUM_FONT} accent={C.purple} />
      <DelayedBanner error={error} what="the openings" />
      {loading && !data ? <Loading what="every game's opening" /> : null}
      {data && !data.games ? <EmptyState title="NO OPENINGS ON FILE YET" note="Each game's opening is written when it's graded. This fills as the season plays." /> : null}

      {data?.games > 0 && <HideClubs clubs={(data?.teams || []).map((t) => t.team).sort()} h={hc} C={C} NUM_FONT={NUM_FONT} accent={C.purple} />}

      {data?.games > 0 && tonight.length > 0 && (
        <section aria-label="Tonight's openings">
          <div style={{ color: C.text2, font: `900 12px/1.2 ${NUM_FONT}`, letterSpacing: '.08em', margin: '0 0 6px' }}>TONIGHT · WHO WINS THE TIP, WHO SCORES FIRST</div>
          <BucketsTable rows={tonight} columns={tonightCols} heatMode="primary" maxRows={12} maxHeight={9999}
            caption="Each club's record in the games on file. The tip goes to the club that got the ball; the first basket is the first made field goal." />
        </section>
      )}

      {data?.games > 0 && matchGames.length > 0 && (
        <FirstBasketMatchup sport="nba" floor={{ kind: 'court', a: C.wood1, b: C.wood2, line: C.courtLine }} games={matchGames} teams={teamsBy} players={data?.players || []} stats={matchStats} targetCols={targetCols} targetSort={targetSort}
          minGp={minGp} Table={BucketsTable} C={C} NUM_FONT={NUM_FONT} accent={C.purple} words={{ first: 'First basket' }}
          lineups={lineupData?.games || null} defense
          onOpenPlayer={onOpenPlayer} onOpenTeam={onOpenTeam} faceOf={(r) => ({ sport: 'nba', id: r.playerId, name: r.name })} />
      )}

      {data?.games > 0 && (
        <>
          <PillRow tall label="View" value={view} onChange={setView} options={[{ key: 'players', label: 'Players' }, { key: 'teams', label: 'Teams' }]} />
          <PillRow label="Sort by" value={lane} onChange={setLane} options={[{ key: 'first', label: LANES.first.word }, { key: 'w1', label: LANES.w1.word }, { key: 'w2', label: LANES.w2.word }, { key: 'q1', label: LANES.q1.word }]} />
          <FiltersSheet
            onReset={() => { setSeason('this'); setWhere('all'); setLast('all') }}
            groups={[
              { key: 'where', label: 'Home / away', value: where, defaultValue: 'all', onChange: setWhere, options: [{ value: 'all', label: 'All' }, { value: 'home', label: 'Home' }, { value: 'away', label: 'Away' }] },
              { key: 'last', label: 'Window', value: last, defaultValue: 'all', onChange: setLast, options: [{ value: 'all', label: 'Every game' }, { value: '10', label: 'Last 10' }, { value: '20', label: 'Last 20' }] },
            ]} />
          {view === 'teams'
            ? <BucketsTable rows={teamRows} columns={teamCols} heatMode="primary" maxRows={12} maxHeight={9999}
                caption={`Every club, sorted by ${L.word.toLowerCase()}. FOR / AG = points a game scored / allowed in that stretch.`} />
            : playerRows.length
              ? <BucketsTable nameCell="player" faceOf={(r) => ({ sport: 'nba', id: r.playerId, name: r.name })} rows={playerRows} columns={playerCols} heatMode="primary" maxRows={12} maxHeight={9999}
                  onRowClick={(r) => onOpenPlayer?.((r?._raw ?? r).playerId)}
                  caption={`Players with ${minGp}+ games, sorted by ${L.word.toLowerCase()}. USG % = his share of his club's shots, free throws and turnovers in that stretch.`} />
              : <EmptyState title="NOT ENOUGH GAMES YET" note={`Nobody has ${minGp}+ games in this window yet. Try both seasons.`} />}
        </>
      )}
    </div>
  )
}
