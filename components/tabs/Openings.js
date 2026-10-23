'use client'
import { useMemo, useState } from 'react'
import PageHeader from '../PageHeader'
import DenseTable from '../DenseTable'
import FiltersSheet from '../player/FiltersSheet'
import { PillRow } from '../Filters'
import { DelayedBanner } from '../StaleBanner'
import { C, NUM_FONT } from '../../lib/theme'
import { useLiveFetch } from '../../lib/useLiveFetch'
import { useHashLens } from '../../lib/useHashLens'
import { teamKey } from '../../lib/mlbTeams'

// ⚾ OPENINGS (2026-10-22, Donovan: "for [baseball] it just be whatever that opening is, first inning, first hit"; the core
// lanes: "a real first everything model"). MOONSHOT's twin of BUCKETS' Openings (components/buckets/tabs/Openings.js): the
// research page for the opening of a game, on MOONSHOT's own table.
//   TONIGHT   each game's two clubs: how often they score in the 1st, get the game's first hit, its first run and its first
//             homer, and who leads off for them (answer first)
//   PLAYERS / TEAMS   every starter and every club, sorted by the lane you pick (First hit · First HR · 1st inning · First run)
// Counts from /api/mlb/openings (opening_games / opening_players, sport 'mlb': every game this season, written once it's final).
// Nothing here is a chance: what happened, and how often, per start.
const LANES = {
  hit: { word: 'First hit', team: 'firstHitPct', player: 'firstHitPct' },
  hr: { word: 'First HR', team: 'firstHrPct', player: 'firstHrPct' },
  inn: { word: '1st inning', team: 'scored1Pct', player: 'hit1Pct' },
  run: { word: 'First run', team: 'firstRunPct', player: 'run1Pct' },
}
const LANE_OPTIONS = Object.entries(LANES).map(([id, v]) => Object.assign({}, { key: id }, { label: v.word }))
const VIEWS = ['players', 'teams']
const pc = (v) => (Number.isFinite(v) ? `${v.toFixed(0)}%` : '—')
const f2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : '—')
const pid = (p) => String(p?.player_id ?? p?.id ?? '')

export default function Openings({ players = [], games = [], onPlayerClick }) {
  const [view, setView] = useHashLens(VIEWS, 'players')
  const [lane, setLane] = useState('hit')
  const [part, setPart] = useState('all')
  const [where, setWhere] = useState('all')
  const [last, setLast] = useState('all')
  const onSlate = useMemo(() => new Map(players.map((p) => [pid(p), p])), [players])
  // answer first: on a game night the players table opens on tonight's hitters; the whole league is one tap away
  const [whoPick, setWho] = useState(null)
  const whoDefault = onSlate.size ? 'tonight' : 'all'
  const who = whoPick || whoDefault
  const url = `/api/mlb/openings?part=${part}&where=${where}${last === 'all' ? '' : `&last=${last}`}`
  const { data, error, loading } = useLiveFetch(url)
  const L = LANES[lane] || LANES.hit
  // a rate on a handful of starts is noise: 20+ starts on the season, half the window on a last-N, 3 in October alone
  const minGs = last !== 'all' ? Math.ceil(Number(last) / 2) : part === 'post' ? 3 : 20

  const openPlayer = (id, name, team) => {
    if (!onPlayerClick || !id) return null
    const p = onSlate.get(String(id))
    return () => onPlayerClick(p || { api_only: true, player_id: String(id), name: name || '', team: team || '' })
  }
  const teamsBy = useMemo(() => new Map((data?.teams || []).map((t) => [t.team, t])), [data])
  const byId = useMemo(() => new Map((data?.players || []).map((p) => [p.playerId, p])), [data])

  // TONIGHT: two rows a game, the clubs' own records, and the man leading off for each (tonight's lineup when it's posted)
  const tonight = useMemo(() => games.flatMap((g) => {
    const clubs = [...new Set((g.players || []).map((p) => teamKey(p.team) || p.team).filter(Boolean))]
    return clubs.map((t, i) => {
      const T = teamsBy.get(t) || {}
      const lo = (g.players || []).find((p) => (teamKey(p.team) || p.team) === t && p.lineup_confirmed && Number(p.lineup_spot) === 1)   // a projected spot isn't a lineup
      const loId = lo ? pid(lo) : T.leadoffId
      const P = loId ? byId.get(String(loId)) : null
      return { _id: `${g.game_pk}-${t}`, game: i === 0 ? clubs.join(' v ') : '', team: t, ...T,
        lead: lo?.name || T.leadoff || '—', leadId: loId || null,
        leadHit1: P?.hit1Pct ?? null, leadFirstHit: P?.firstHit ?? null }
    })
  }), [games, teamsBy, byId])

  const tonightCols = [
    { key: 'game', label: 'Game', group: 'Game', w: 84, heat: false, sticky: true, bold: true },
    { key: 'team', label: 'Tm', group: 'Game', w: 44, heat: false, mono: true, teamMark: 'mlb' },
    { key: 'scored1Pct', label: '1ST INN %', group: '1st inning', w: 64, fmt: pc, primary: true, title: 'How often they scored in the 1st inning' },
    { key: 'r1For', label: 'R/G', group: '1st inning', w: 44, fmt: f2, title: 'Runs a game in the 1st inning' },
    { key: 'firstHitPct', label: '1ST HIT %', group: 'Firsts', w: 64, fmt: pc, title: 'How often they got the game’s first hit' },
    { key: 'firstRunPct', label: '1ST RUN %', group: 'Firsts', w: 66, fmt: pc, title: 'How often they scored the game’s first run' },
    { key: 'firstHrPct', label: '1ST HR %', group: 'Firsts', w: 60, fmt: pc, title: 'Of games with a homer, how often they hit the first one' },
    { key: 'lead', label: 'Leads off', group: 'Leadoff', w: 140, heat: false, numeric: false, link: (r) => openPlayer(r.leadId, r.lead, r.team), title: 'Tonight’s leadoff man when the lineup is in; before that, the man who has led off for them most' },
    { key: 'leadHit1', label: 'HIT 1ST %', group: 'Leadoff', w: 62, fmt: pc, title: 'How often he got a hit in the 1st inning, per start' },
    { key: 'leadFirstHit', label: '1ST HITS', group: 'Leadoff', w: 56, title: 'Games where he got the game’s first hit' },
  ]
  const teamCols = [
    { key: 'team', label: 'Team', group: 'Team', w: 56, heat: false, sticky: true, bold: true, mono: true, teamMark: 'mlb' },
    { key: 'gp', label: 'GP', group: 'Team', w: 40, heat: false },
    { key: 'scored1Pct', label: 'SCORED %', group: '1st inning', w: 64, fmt: pc, primary: lane === 'inn', title: 'How often they scored in the 1st inning' },
    { key: 'allowed1Pct', label: 'ALLOWED %', group: '1st inning', w: 70, fmt: pc, invert: true, title: 'How often they allowed a run in the 1st inning' },
    { key: 'r1For', label: 'R/G', group: '1st inning', w: 44, fmt: f2 },
    { key: 'r1Ag', label: 'RA/G', group: '1st inning', w: 48, fmt: f2, invert: true },
    { key: 'firstHitPct', label: '1ST HIT %', group: 'Firsts', w: 64, fmt: pc, primary: lane === 'hit', title: 'How often they got the game’s first hit' },
    { key: 'firstRunPct', label: '1ST RUN %', group: 'Firsts', w: 66, fmt: pc, primary: lane === 'run', title: 'How often they scored the game’s first run' },
    { key: 'firstHrPct', label: '1ST HR %', group: 'Firsts', w: 60, fmt: pc, primary: lane === 'hr', title: 'Of games with a homer, how often they hit the first one' },
    { key: 'leadoff', label: 'Leadoff', group: 'Leadoff', w: 140, heat: false, numeric: false, link: (r) => openPlayer(r.leadoffId, r.leadoff, r.team), title: 'The man who has led off for them most' },
    { key: 'leadoffGs', label: 'GS', group: 'Leadoff', w: 40, heat: false, title: 'His starts in the 1 hole' },
  ]
  const playerCols = [
    { key: 'name', label: 'Player', group: 'Player', w: 150, heat: false, sticky: true, bold: true },
    { key: 'team', label: 'Tm', group: 'Player', w: 44, heat: false, mono: true, teamMark: 'mlb' },
    { key: 'pos', label: 'Pos', group: 'Player', w: 38, heat: false, numeric: false, dim: true },
    { key: 'slot', label: 'Slot', group: 'Player', w: 40, heat: false, title: 'The lineup spot he has started in most often (BATS % shows how often that put him at the plate in the 1st)' },
    { key: 'gs', label: 'GS', group: 'Sample', w: 40, heat: false, title: 'His starts in this window' },
    { key: 'firstHit', label: '1ST HITS', group: 'First hit', w: 56, title: 'Games where he got the game’s first hit' },
    { key: 'firstHitPct', label: '%', group: 'First hit', w: 44, fmt: pc, primary: lane === 'hit', title: 'The game’s first hit, per start' },
    { key: 'firstHr', label: '1ST HRS', group: 'First HR', w: 52, title: 'Games where he hit the game’s first homer' },
    { key: 'firstHrPct', label: '%', group: 'First HR', w: 44, fmt: pc, primary: lane === 'hr', title: 'The game’s first homer, per start' },
    { key: 'bat1Pct', label: 'BATS %', group: '1st inning', w: 56, fmt: pc, title: 'How often he came to the plate in the 1st inning' },
    { key: 'hit1Pct', label: 'HIT %', group: '1st inning', w: 50, fmt: pc, primary: lane === 'inn', title: 'How often he got a hit in the 1st inning, per start' },
    { key: 'hr1', label: 'HR', group: '1st inning', w: 38, title: 'His homers in the 1st inning' },
    { key: 'run1Pct', label: 'RUN %', group: '1st inning', w: 52, fmt: pc, primary: lane === 'run', title: 'How often he scored a run in the 1st inning, per start' },
    { key: 'tb1', label: 'TB/G', group: '1st inning', w: 46, fmt: f2, title: 'Total bases a start in the 1st inning' },
  ]
  const teamRows = useMemo(() => (data?.teams || []).map((t) => ({ ...t, _id: t.team })).sort((a, b) => (b[L.team] ?? -1) - (a[L.team] ?? -1)), [data, L])
  const playerRows = useMemo(() => (data?.players || [])
    .filter((p) => p.gs >= minGs && (who === 'all' || onSlate.has(p.playerId)))
    .map((p) => ({ ...p, _id: p.playerId }))
    .sort((a, b) => (b[L.player] ?? -1) - (a[L.player] ?? -1) || b.gs - a.gs), [data, L, minGs, who, onSlate])
  const sample = data?.games ? `${data.season} · ${data.games.toLocaleString()} games through ${String(data.through || '').slice(5).replace('-', '/')}` : ''

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <PageHeader eyebrow="MOONSHOT · OPENINGS" title="The 1st inning, the first hit, the first homer"
        note={sample ? `What happened at the start of every game: ${sample}. Counts per start, not a chance.` : 'What happened at the start of every game. Counts per start, not a chance.'}
        theme={C} numFont={NUM_FONT} accent={C.orange} />
      <DelayedBanner error={error} what="the openings" />
      {loading && !data ? <div style={{ color: C.text3, fontSize: 12, padding: '8px 0' }}>Counting every game’s 1st inning…</div> : null}
      {data && !data.games ? (
        <div style={{ color: C.text3, fontSize: 12, lineHeight: 1.5, padding: '8px 0' }}>
          <div style={{ color: C.text, font: `900 12px/1.3 ${NUM_FONT}`, letterSpacing: '.08em' }}>NO OPENINGS ON FILE YET</div>
          Each game’s 1st inning is written once it’s final. This fills as games are played.
        </div>
      ) : null}

      {data?.games > 0 && tonight.length > 0 && (
        <section aria-label="Tonight's openings">
          <div style={{ color: C.text2, font: `900 12px/1.2 ${NUM_FONT}`, letterSpacing: '.08em', margin: '0 0 6px' }}>TONIGHT · WHO STARTS FAST</div>
          <DenseTable rows={tonight} columns={tonightCols} heatMode="primary" maxRows={12} maxHeight={9999} initialSort={null}
            caption="Each club's record this season. The first hit and first run are the game's; the first homer counts only games that had one." />
        </section>
      )}

      {data?.games > 0 && (
        <>
          <PillRow tall label="View" value={view} onChange={setView} options={[{ key: 'players', label: 'Players' }, { key: 'teams', label: 'Teams' }]} />
          <PillRow label="Sort by" value={lane} onChange={setLane} options={LANE_OPTIONS} />
          <FiltersSheet
            onReset={() => { setPart('all'); setWhere('all'); setLast('all'); setWho(null) }}
            groups={[
              ...(onSlate.size && view === 'players' ? [{ key: 'who', label: 'Who', value: who, defaultValue: whoDefault, onChange: setWho, options: [{ value: 'all', label: 'Everyone' }, { value: 'tonight', label: 'On tonight’s slate' }] }] : []),
              { key: 'part', label: 'Games', value: part, defaultValue: 'all', onChange: setPart, options: [{ value: 'all', label: 'Season + October' }, { value: 'reg', label: 'Regular season' }, { value: 'post', label: 'October only' }] },
              { key: 'where', label: 'Home / away', value: where, defaultValue: 'all', onChange: setWhere, options: [{ value: 'all', label: 'All' }, { value: 'home', label: 'Home' }, { value: 'away', label: 'Away' }] },
              { key: 'last', label: 'Window', value: last, defaultValue: 'all', onChange: setLast, options: [{ value: 'all', label: 'Every game' }, { value: '10', label: 'Last 10' }, { value: '30', label: 'Last 30' }] },
            ]} />
          {view === 'teams'
            ? <DenseTable rows={teamRows} columns={teamCols} heatMode="primary" maxRows={12} maxHeight={9999} initialSort={null}
                caption={`Every club, sorted by ${L.word.toLowerCase()}. R/G and RA/G = runs a game scored / allowed in the 1st inning.`} />
            : playerRows.length
              ? <DenseTable nameCell="player" faceOf={(r) => ({ sport: 'mlb', id: r.playerId, name: r.name })} rows={playerRows} columns={playerCols} heatMode="primary" maxRows={12} maxHeight={9999} initialSort={null}
                  onRowClick={(r) => { const x = r?._raw ?? r; openPlayer(x.playerId, x.name, x.team)?.() }}
                  caption={`Starters with ${minGs}+ starts, sorted by ${L.word.toLowerCase()}. Every rate is per start; his slot decides how often he bats in the 1st (BATS %).`} />
              : <div style={{ color: C.text3, fontSize: 12, padding: '8px 0' }}>{who === 'tonight' ? `Nobody on tonight’s slate has ${minGs}+ starts in this window.` : `Nobody has ${minGs}+ starts in this window yet.`} Widen the window{who === 'tonight' ? ' or show everyone' : ''}.</div>}
        </>
      )}
    </div>
  )
}
