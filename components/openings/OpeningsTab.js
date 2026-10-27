'use client'
import { useMemo, useState } from 'react'
import PageHeader from '../PageHeader'
import FiltersSheet from '../player/FiltersSheet'
import { PillRow } from '../Filters'
import { useLiveFetch } from '../../lib/useLiveFetch'
import FirstBasketMatchup from './FirstBasketMatchup'
import RateStack from './RateStack'
import LeagueLine from './LeagueLine'
import { HideClubs, useHidden } from './hideClubs'
import { shotTypeWord } from '../../lib/openings/shotType'
import { OPENING_WORDS } from '../../lib/openings/sportWords'

// 🧊🏈 THE OPENINGS TAB, SHARED (2026-10-26, Donovan: "just build an openings tab ... shared"). LAMP's and TUDDY's, on the pieces BUCKETS' and
// MOONSHOT's already use: the game-by-game matchup with its face wall and defense table (./FirstBasketMatchup.js), the product's own table
// skin, and the shared hide control (./hideClubs.js). Hockey and football have no player rows, so this page is the club half -- the jump
// (faceoff / who gets the ball), who scores first, how fast, the first stretch, what the first scores were and what each defense allowed --
// plus who scores first most. Counts from /api/<sport>/openings (opening_games; lib/openings/teamAgg.js). Never a chance: what happened.
// A product hands: its sport, the data url, its table skin, theme, accent, floor (the rink / field under the wall), its page chrome (`ui`).
const f1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : '—')
const pc = (v) => (Number.isFinite(v) ? `${v.toFixed(0)}%` : '—')
const typesText = (sport) => (v) => (v?.length ? v.slice(0, 2).map(([w, p]) => `${shotTypeWord(sport, w) || w} ${Number.isFinite(p) ? p.toFixed(0) : 0}%`).join(' · ') : '—')

export default function OpeningsTab({ sport, url, Table, C, NUM_FONT, accent, ui, floor = null, onOpenTeam = null, onOpenPlayer = null }) {
  const cfg = OPENING_WORDS[sport]
  const { DelayedBanner, Loading, EmptyState } = ui
  const [lane, setLane] = useState('first')
  const [season, setSeason] = useState('both')
  const [where, setWhere] = useState('all')
  const [last, setLast] = useState('all')
  const hc = useHidden(`${sport}:clubs`)
  const { data, error, loading } = useLiveFetch(`${url}?season=${season}&where=${where}${last === 'all' ? '' : `&last=${last}`}`)
  const { data: wall } = useLiveFetch(`/api/ledger/first?sport=${sport}&walls=1`)   // names and photos of the men who scored first
  const names = useMemo(() => new Map(Object.entries(wall?.walls?.names || {})), [wall])
  const faces = wall?.walls?.faces || {}

  const allTeams = data?.teams || []
  const teams = useMemo(() => allTeams.filter((t) => !hc.hidden.has(t.team)), [allTeams, hc.hidden])
  const teamsBy = useMemo(() => new Map(teams.map((t) => [t.team, t])), [teams])
  const games = useMemo(() => (data?.tonight || []).filter((g) => !hc.hidden.has(g.away) && !hc.hidden.has(g.home)), [data, hc.hidden])
  // the windows this sport has numbers for (a window no club has is not drawn)
  const windows = cfg.windows.filter(([k]) => allTeams.some((t) => Number.isFinite(t[`${k}For`])))
  const laneKey = lane === 'first' ? 'firstPct' : `${lane}For`
  const teamRows = useMemo(() => teams.map((t) => ({ ...t, _id: t.team, ownText: typesText(sport)(t.firstTypes), allowText: typesText(sport)(t.allows?.types) }))
    .sort((a, b) => (b[laneKey] ?? -1) - (a[laneKey] ?? -1)), [teams, laneKey, sport])
  const scorerRows = useMemo(() => (data?.scorers || []).filter((s) => !hc.hidden.has(s.team)).map((s) => ({ ...s, _id: `${s.team}-${s.playerId}`, name: names.get(String(s.playerId)) || '—' })), [data, hc.hidden, names])

  const teamCols = [
    { key: 'team', label: 'Team', group: 'Team', w: 60, heat: false, sticky: true, bold: true, mono: true, teamMark: sport, link: (r) => (onOpenTeam ? () => onOpenTeam(r.team) : null) },
    { key: 'gp', label: 'GP', group: 'Team', w: 40, heat: false },
    { key: 'jumpPct', label: cfg.jumpLabel, group: 'The jump', w: 78, fmt: pc, title: cfg.jumpTitle },
    { key: 'firstPct', label: cfg.firstLabel, group: cfg.firstWord, w: 78, fmt: pc, primary: lane === 'first', title: cfg.firstTitle },
    { key: 'firstWhenJumpPct', label: cfg.afterLabel, group: cfg.firstWord, w: 96, fmt: (v, r) => <RateStack v={v} pair={r.afterJump} C={C} NUM_FONT={NUM_FONT} />, title: cfg.afterTitle },
    { key: 'firstWhenLostPct', label: cfg.afterLostLabel, group: cfg.firstWord, w: 84, fmt: (v, r) => <RateStack v={v} pair={r.afterLost} C={C} NUM_FONT={NUM_FONT} />, title: cfg.afterLostTitle },
    { key: 'shotsToFirst', label: cfg.shotsLabel, group: cfg.firstWord, w: 84, fmt: f1, invert: true, title: cfg.shotsTitle },
    ...windows.flatMap(([k, , short]) => [
      { key: `${k}For`, label: 'FOR', group: short, w: 48, fmt: f1, primary: lane === k, title: `Points a game scored, ${short}` },
      { key: `${k}Ag`, label: 'AG', group: short, w: 44, fmt: f1, invert: true, title: `Points a game allowed, ${short}` },
    ]),
    { key: 'ownText', label: 'THEIR 1ST', group: 'What it was', w: 190, numeric: false, heat: false, fold: false, title: 'What their own first scores were, by type' },
    { key: 'allowText', label: 'ALLOWED', group: 'What it was', w: 190, numeric: false, heat: false, fold: false, title: 'What the first scores against them were, by type' },
  ]
  const scorerCols = [
    { key: 'name', label: 'Player', group: 'Player', w: 160, heat: false, sticky: true, bold: true, numeric: false, link: (r) => (onOpenPlayer && r.playerId ? () => onOpenPlayer(r.playerId) : null) },
    { key: 'team', label: 'Tm', group: 'Player', w: 52, heat: false, mono: true, teamMark: sport, link: (r) => (onOpenTeam ? () => onOpenTeam(r.team) : null) },
    { key: 'n', label: '1STS', group: cfg.firstWord, w: 52, primary: true, title: `Games he scored the game’s ${cfg.firstWord.toLowerCase()}` },
    { key: 'pct', label: 'SHARE', group: cfg.firstWord, w: 60, fmt: pc, title: 'Of his club’s games on file' },
  ]
  const stats = [
    { key: 'jumpPct', label: cfg.jumpStat, fmt: pc, higher: true },
    { key: 'firstPct', label: cfg.firstStat, fmt: pc, higher: true },
    { key: 'firstWhenJumpPct', label: cfg.afterStat, fmt: pc, higher: true },
    { key: 'firstWhenLostPct', label: cfg.afterLostStat, fmt: pc, higher: true },
    { key: 'shotsToFirst', label: cfg.shotsStat, fmt: f1, higher: false },
    ...windows.flatMap(([k, label]) => [{ key: `${k}For`, label: `${label} scored`, fmt: f1, higher: true }, { key: `${k}Ag`, label: `${label} allowed`, fmt: f1, higher: false }]),
  ]
  const seasonOpts = data?.seasons?.length > 1 ? [{ value: 'both', label: 'Both seasons' }, { value: 'this', label: 'This season' }, { value: 'last', label: 'Last season' }] : null
  const lastOpts = [{ value: 'all', label: 'Every game' }, ...cfg.lastOptions.map((n) => ({ value: n, label: `Last ${n}` }))]
  const sample = (data?.seasons || []).map((s) => `${s.label} ${s.games} games`).join(' · ')
  const L = data?.league

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <PageHeader eyebrow={cfg.eyebrow} title={cfg.title} note={sample ? `${cfg.note} ${sample}.` : cfg.note} theme={C} numFont={NUM_FONT} accent={accent} />
      <LeagueLine label={cfg.leagueStat} league={L} C={C} NUM_FONT={NUM_FONT} accent={accent} />
      <DelayedBanner error={error} what="the openings" />
      {loading && !data ? <Loading what="every game's opening" /> : null}
      {data && !data.games ? <EmptyState title="NO OPENINGS ON FILE YET" note="Each game's opening is written when it's graded. This fills as the season plays." /> : null}

      {data?.games > 0 && (
        <>
          <HideClubs clubs={allTeams.map((t) => t.team).sort()} h={hc} C={C} NUM_FONT={NUM_FONT} accent={accent} />
          {games.length > 0 && (
            <FirstBasketMatchup sport={sport} floor={floor} games={games} teams={teamsBy} players={[]} stats={stats} targetCols={[]} showTargets={false} defense
              typeLabel={cfg.typeLabel} Table={Table} C={C} NUM_FONT={NUM_FONT} accent={accent} words={{ first: cfg.firstWord }}
              onOpenTeam={onOpenTeam} nameOfExtra={names} urlOf={(id) => faces[id] || null} wallWords={cfg.wall} />
          )}
          <PillRow label="Sort by" value={lane} onChange={setLane} options={[{ key: 'first', label: cfg.firstWord }, ...windows.map(([k, label]) => ({ key: k, label }))]} />
          <FiltersSheet
            onReset={() => { setSeason('both'); setWhere('all'); setLast('all') }}
            groups={[
              ...(seasonOpts ? [{ key: 'season', label: 'Season', value: season, defaultValue: 'both', onChange: setSeason, options: seasonOpts }] : []),
              { key: 'where', label: 'Home / away', value: where, defaultValue: 'all', onChange: setWhere, options: [{ value: 'all', label: 'All' }, { value: 'home', label: 'Home' }, { value: 'away', label: 'Away' }] },
              { key: 'last', label: 'Window', value: last, defaultValue: 'all', onChange: setLast, options: lastOpts },
            ]} />
          <Table rows={teamRows} columns={teamCols} heatMode="primary" maxRows={12} maxHeight={9999}
            caption={`Every club, sorted by ${lane === 'first' ? cfg.firstWord.toLowerCase() : (cfg.windows.find(([k]) => k === lane) || [])[1]?.toLowerCase()}. FOR / AG = points a game scored / allowed in that stretch.`} />
          {scorerRows.length > 0 && (
            <>
              <div style={{ color: C.text2, font: `900 12px/1.2 ${NUM_FONT}`, letterSpacing: '.08em', marginTop: 4 }}>{cfg.scorersTitle}</div>
              <Table rows={scorerRows} columns={scorerCols} heatMode="primary" maxRows={10} maxHeight={9999} caption={cfg.scorersNote} />
            </>
          )}
        </>
      )}
    </div>
  )
}
