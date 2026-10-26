'use client'
import { useEffect, useMemo, useState } from 'react'
import PageHeader from '../PageHeader'
import DenseTable from '../DenseTable'
import FiltersSheet from '../player/FiltersSheet'
import { PillRow } from '../Filters'
import { DelayedBanner } from '../StaleBanner'
import { C, NUM_FONT } from '../../lib/theme'
import { useLiveFetch } from '../../lib/useLiveFetch'
import { useHashLens } from '../../lib/useHashLens'
import { teamKey } from '../../lib/mlbTeams'
import { slateFirstCalls } from '../../lib/mlb/firstModel'
import { FaceWallByGame } from '../openings/OpeningViz'

// ⚾ OPENINGS (2026-10-22, Donovan: "for [baseball] it just be whatever that opening is, first inning, first hit"; the core
// lanes: "a real first everything model"). MOONSHOT's twin of BUCKETS' Openings (components/buckets/tabs/Openings.js): the
// research page for the opening of a game, on MOONSHOT's own table.
//   TONIGHT   each game's two clubs: how often they score in the 1st, get the game's first hit, its first run and its first
//             homer, and who leads off for them (answer first)
//   PLAYERS / TEAMS   every starter and every club, sorted by the lane you pick (First hit · First HR · 1st inning · First run)
// Counts from /api/mlb/openings (opening_games / opening_players, sport 'mlb': every game this season, written once it's final).
// Nothing here is a chance: what happened, and how often, per start.
// THE CALL (moonshot-first-v1, lib/mlb/firstModel.js): tonight's 18 starters of each game ranked for the game's first hit and
// first homer from their season rates and the batting order. A rank, never a chance; the backtest is in the caption.
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
const rk = (v) => (Number.isFinite(v) ? `#${v}` : '—')
const code = (t) => teamKey(t) || t

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
  // who bats first, from MLB's schedule (the slate rows don't say); one small read for tonight's games
  const pks = useMemo(() => [...new Set(games.map((g) => g.game_pk).filter((k) => /^\d+$/.test(String(k))))].join(','), [games])
  const [homeOf, setHomeOf] = useState(null)
  useEffect(() => {
    if (!pks) return undefined
    let alive = true
    fetch(`https://statsapi.mlb.com/api/v1/schedule?gamePks=${pks}&hydrate=team&fields=dates,games,gamePk,teams,home,team,abbreviation`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive && j) setHomeOf(new Map((j.dates || []).flatMap((d) => d.games || []).map((g) => [String(g.gamePk), code(g.teams?.home?.team?.abbreviation)]))) })
      .catch(() => {})
    return () => { alive = false }
  }, [pks])
  const calls = useMemo(() => (homeOf ? slateFirstCalls(players, { homeOf, teamOf: (p) => code(p.team) }) : new Map()), [players, homeOf])
  const projected = useMemo(() => [...calls.values()].some((c) => c.projected), [calls])
  const rec = data?.firstRecord || null   // the call's own record, locked + graded (lib/mlb/firstLock.js)
  const teamsBy = useMemo(() => new Map((data?.teams || []).map((t) => [t.team, t])), [data])
  const byId = useMemo(() => new Map((data?.players || []).map((p) => [p.playerId, p])), [data])

  // TONIGHT: two rows a game, the clubs' own records, and the man leading off for each (tonight's lineup when it's posted)
  const tonight = useMemo(() => games.flatMap((g) => {
    const clubs0 = [...new Set((g.players || []).map((p) => code(p.team)).filter(Boolean))]
    const home = homeOf?.get(String(g.game_pk))
    const clubs = home && clubs0.includes(home) ? [...clubs0.filter((t) => t !== home), home] : clubs0   // the road club first, when known
    // the club's best-ranked man for each call
    const best = (t, k) => (g.players || []).filter((p) => code(p.team) === t && calls.get(pid(p))?.[k]).sort((a, b) => calls.get(pid(a))[k] - calls.get(pid(b))[k])[0]
    return clubs.map((t, i) => {
      const bh = best(t, 'hitRank'), bhr = best(t, 'hrRank')
      const T = teamsBy.get(t) || {}
      // tonight's 1 hole, the same lineup the call reads (marked when it's still the bot's projection)
      const lo = (g.players || []).find((p) => code(p.team) === t && Number(p.lineup_spot) === 1)
      const loId = lo ? pid(lo) : T.leadoffId
      const P = loId ? byId.get(String(loId)) : null
      return { _id: `${g.game_pk}-${t}`, game: i === 0 ? clubs.join(home ? ' @ ' : ' v ') : '', team: t, ...T,
        hitCall: bh ? `${bh.name} ${rk(calls.get(pid(bh)).hitRank)}` : '—', hitCallId: bh ? pid(bh) : null,
        hrCall: bhr ? `${bhr.name} ${rk(calls.get(pid(bhr)).hrRank)}` : '—', hrCallId: bhr ? pid(bhr) : null,
        lead: lo ? `${lo.name}${lo.lineup_confirmed ? '' : ' (proj.)'}` : T.leadoff || '—', leadId: loId || null,
        leadHit1: P?.hit1Pct ?? null, leadFirstHit: P?.firstHit ?? null }
    })
  }), [games, teamsBy, byId, homeOf, calls])

  // THE FACE WALL (10-26, Donovan: the BUCKETS first-basket wall for MOONSHOT's first inning): each of tonight's games, its two
  // clubs' games this season -- his face = the club scored the game's first run, and he scored it; ring = the club got the
  // game's first hit (BUCKETS' tip). components/openings/OpeningViz.js
  const wallGames = useMemo(() => games.map((g) => {
    const clubs0 = [...new Set((g.players || []).map((p) => code(p.team)).filter(Boolean))]
    const home = homeOf?.get(String(g.game_pk))
    if (clubs0.length !== 2) return null
    const away = home && clubs0.includes(home) ? clubs0.find((t) => t !== home) : clubs0[0]
    const hm = home && clubs0.includes(home) ? home : clubs0[1]
    return { key: String(g.game_pk), away, home: hm, label: `${away} ${home ? '@' : 'v'} ${hm}` }
  }).filter(Boolean), [games, homeOf])
  const nameOf = useMemo(() => new Map((data?.players || []).map((p) => [String(p.playerId), p.name])), [data])

  const tonightCols = [
    { key: 'game', label: 'Game', group: 'Game', w: 84, heat: false, sticky: true, bold: true },
    { key: 'team', label: 'Tm', group: 'Game', w: 44, heat: false, mono: true, teamMark: 'mlb' },
    ...(calls.size ? [
      { key: 'hitCall', label: '1st hit call', group: 'The call', w: 150, heat: false, numeric: false, link: (r) => openPlayer(r.hitCallId, r.hitCall, r.team), title: 'His club’s best-ranked man for the game’s first hit (#1 = the game’s top call)' },
      { key: 'hrCall', label: '1st HR call', group: 'The call', w: 150, heat: false, numeric: false, link: (r) => openPlayer(r.hrCallId, r.hrCall, r.team), title: 'His club’s best-ranked man for the game’s first homer (#1 = the game’s top call)' },
    ] : []),
    { key: 'scored1Pct', label: '1ST INN %', group: '1st inning', w: 64, fmt: pc, primary: true, title: 'How often they scored in the 1st inning' },
    { key: 'r1For', label: 'R/G', group: '1st inning', w: 44, fmt: f2, title: 'Runs a game in the 1st inning' },
    { key: 'firstHitPct', label: '1ST HIT %', group: 'Firsts', w: 64, fmt: pc, title: 'How often they got the game’s first hit' },
    { key: 'firstRunPct', label: '1ST RUN %', group: 'Firsts', w: 66, fmt: pc, title: 'How often they scored the game’s first run' },
    { key: 'firstHrPct', label: '1ST HR %', group: 'Firsts', w: 60, fmt: pc, title: 'Of games with a homer, how often they hit the first one' },
    { key: 'lead', label: 'Leads off', group: 'Leadoff', w: 140, heat: false, numeric: false, link: (r) => openPlayer(r.leadId, r.lead, r.team), title: 'Tonight’s leadoff man (proj. = the projected lineup until the real one posts); with no lineup at all, the man who has led off for them most' },
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
  // tonight's hitters with the call: ranked by it on First hit / First HR, everyone on the slate shown (a thin sample is dimmed)
  const showCalls = who === 'tonight' && calls.size > 0
  const rankKey = showCalls && lane === 'hit' ? 'hitRank' : showCalls && lane === 'hr' ? 'hrRank' : null
  const playerCols = [
    { key: 'name', label: 'Player', group: 'Player', w: 150, heat: false, sticky: true, bold: true },
    { key: 'team', label: 'Tm', group: 'Player', w: 44, heat: false, mono: true, teamMark: 'mlb' },
    { key: 'pos', label: 'Pos', group: 'Player', w: 38, heat: false, numeric: false, dim: true },
    { key: 'slot', label: 'Slot', group: 'Player', w: 40, heat: false, title: 'The lineup spot he has started in most often (BATS % shows how often that put him at the plate in the 1st)' },
    { key: 'slotPct', label: 'IN SLOT', group: 'Player', w: 52, heat: false, fmt: pc, title: 'How many of his starts were in that slot. Under about 70%: he moves around the lineup, so his slot is a guess for tonight' },
    ...(showCalls ? [
      { key: 'hitRank', label: '1ST HIT', group: 'The call', w: 52, fmt: rk, invert: true, primary: lane === 'hit', title: 'His rank in his game for the first hit (#1 = the top call of its 18 starters)' },
      { key: 'hrRank', label: '1ST HR', group: 'The call', w: 52, fmt: rk, invert: true, primary: lane === 'hr', title: 'His rank in his game for the first homer (#1 = the top call of its 18 starters)' },
    ] : []),
    { key: 'gs', label: 'GS', group: 'Sample', w: 40, heat: false, title: 'His starts in this window' },
    { key: 'firstHit', label: '1ST HITS', group: 'First hit', w: 56, title: 'Games where he got the game’s first hit' },
    { key: 'firstHitPct', label: '%', group: 'First hit', w: 44, fmt: pc, primary: lane === 'hit' && !showCalls, title: 'The game’s first hit, per start' },
    { key: 'firstHr', label: '1ST HRS', group: 'First HR', w: 52, title: 'Games where he hit the game’s first homer' },
    { key: 'firstHrPct', label: '%', group: 'First HR', w: 44, fmt: pc, primary: lane === 'hr' && !showCalls, title: 'The game’s first homer, per start' },
    { key: 'bat1Pct', label: 'BATS %', group: '1st inning', w: 56, fmt: pc, title: 'How often he came to the plate in the 1st inning' },
    { key: 'hit1Pct', label: 'HIT %', group: '1st inning', w: 50, fmt: pc, primary: lane === 'inn', title: 'How often he got a hit in the 1st inning, per start' },
    { key: 'hr1', label: 'HR', group: '1st inning', w: 38, title: 'His homers in the 1st inning' },
    { key: 'run1Pct', label: 'RUN %', group: '1st inning', w: 52, fmt: pc, primary: lane === 'run', title: 'How often he scored a run in the 1st inning, per start' },
    { key: 'tb1', label: 'TB/G', group: '1st inning', w: 46, fmt: f2, title: 'Total bases a start in the 1st inning' },
  ]
  const teamRows = useMemo(() => (data?.teams || []).map((t) => ({ ...t, _id: t.team })).sort((a, b) => (b[L.team] ?? -1) - (a[L.team] ?? -1)), [data, L])
  const playerRows = useMemo(() => (data?.players || [])
    .filter((p) => (who === 'all' ? p.gs >= minGs : onSlate.has(p.playerId) && (showCalls || p.gs >= minGs)))
    .map((p) => ({ ...p, _id: p.playerId, ...(calls.get(p.playerId) || {}) }))
    .sort((a, b) => (rankKey ? (a[rankKey] ?? 99) - (b[rankKey] ?? 99) : 0) || (b[L.player] ?? -1) - (a[L.player] ?? -1) || b.gs - a.gs), [data, L, minGs, who, onSlate, calls, rankKey, showCalls])
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
            caption={`${calls.size ? `The call ranks each game's 18 starters from season rates and the batting order${projected ? ' (projected lineups until they post)' : ''}. ${rec?.hit?.of ? `Locked before first pitch and graded: #1 first hit ${rec.hit.won} of ${rec.hit.of}, #1 first HR ${rec.hr.won} of ${rec.hr.of}. ` : ''}Replayed on 2,171 games this season, the #1 first-HR call hit it 9.3% of the time (a random starter 4.9%); the #1 first-hit call got it 20.1%, about the same as always taking the road leadoff man. ` : ''}Club rates are this season's; the first homer counts only games that had one.`} />
        </section>
      )}

      {data?.games > 0 && wallGames.length > 0 && (
        <FaceWallByGame title="First run · by game" games={wallGames} logOf={(t) => teamsBy.get(t)?.log} sport="mlb" C={C} NUM_FONT={NUM_FONT} accent={C.orange} nameOf={nameOf}
          words={{ ring: 'first hit', first: 'Scored the first run', both: 'First run + first hit', wasted: 'First hit, not the run', none: 'Neither' }} />
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
                  dimRow={(r) => (r?._raw ?? r).gs < minGs}
                  caption={`${showCalls ? `Tonight's starters${rankKey ? `, in the order of the ${L.word.toLowerCase()} call` : `, sorted by ${L.word.toLowerCase()}`}; under ${minGs} starts is dimmed.` : `Starters with ${minGs}+ starts, sorted by ${L.word.toLowerCase()}.`} Every rate is per start; his slot decides how often he bats in the 1st (BATS %).`} />
              : <div style={{ color: C.text3, fontSize: 12, padding: '8px 0' }}>{who === 'tonight' ? `Nobody on tonight’s slate has ${minGs}+ starts in this window.` : `Nobody has ${minGs}+ starts in this window yet.`} Widen the window{who === 'tonight' ? ' or show everyone' : ''}.</div>}
        </>
      )}
    </div>
  )
}
