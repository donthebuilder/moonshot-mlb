'use client'
import { useEffect, useMemo, useState } from 'react'
import { useSportTheme } from './SportTheme'
import { SPORT_ACCENT } from '../lib/sportAccent'
import { fetchJSON } from '../lib/data'
import { pairHistV2Paths } from '../lib/dataSource'
import { readPairHistV2, pairHistRows, seasonLabel, coverageLine } from '../lib/pairHistV2'
import { explain } from '../lib/explain'
import FindBar from './FindBar'
import DenseTable from './DenseTable'
import { LegCell } from './PairBlock'

// PAIR HISTORY, FOUR SEASONS, ACTIVE PLAYERS ONLY (2026-10-07, Donovan: "pull all of the pair history data from
// this season and the last three seasons ... only for active players ... good pairs ... for goals and
// touchdowns too"). ONE table for all three sports: MOONSHOT (home runs), LAMP (goals), TUDDY (touchdowns).
// The numbers are the bot's (bots/pair_history_v2.py -> pairhist_v2_<sport>.json); this draws them and
// computes nothing. The pair cell is PairBlock's LegCell (club logo and name, both links), stacked so a phone
// sees both names in the pinned column. If the file is not published yet the page says so.
// the pinned column is narrow on a phone: 'William Nylander' is drawn 'W. Nylander' (the tap still opens the whole player)
const short = (p) => {
  const parts = String(p?.name || '').trim().split(/\s+/)
  return parts.length > 1 ? { ...p, name: `${parts[0][0]}. ${parts.slice(1).join(' ')}`, _orig: p } : { ...p, _orig: p }
}
const SHOW = 25   // a long list previews a few rows; "+N more" opens the rest
const LIFT_BAR = 1.5   // the Lift filter: at least this many times what coincidence gives
const RECENT_DAYS = 30   // the recent filter

const WORDS = {
  mlb: { unit: 'home run', both: 'Both homered', lead: 'hitters', day: 'day' },
  nhl: { unit: 'goal', both: 'Both scored', lead: 'skaters', day: 'day' },
  nfl: { unit: 'touchdown', both: 'Both scored', lead: 'players', day: 'week' },
  // BUCKETS builds its own file from our graded games (lib/nba/pairHistory.js): its title, its active rule and its empty / missing words
  nba: { unit: '25-point game', both: 'Both 25+', lead: 'players', day: 'day', own: true, title: 'Pair history',
    active: 'Only active players are counted: a game inside the last 3 weeks of graded games on file.',
    missing: 'Pair history is unavailable right now. It is counted from our own graded games and loads from BUCKETS.' },
}
const ACTIVE = 'Only active players are counted: on a current roster, and a regular this season, or in at least 3 of the last 4 seasons.'

export default function PairHistV2Table({ sport = 'mlb', onOpenPlayer = null, accent = null, id = 'pairhist-v2' }) {
  const { C, NUM_FONT } = useSportTheme()
  const hue = accent || SPORT_ACCENT[sport] || C.orange
  const W = WORDS[sport] || WORDS.mlb
  const [file, setFile] = useState(undefined)   // undefined = loading, null = not published
  const [query, setQuery] = useState('')
  const [sameGame, setSameGame] = useState(false)
  const [limit, setLimit] = useState(SHOW)
  // THE SITE'S FILTER ROW (2026-10-21, Donovan: "the pairs page beautiful ... we can add filters"): components/FindBar.js
  const [team, setTeam] = useState('')
  const [season, setSeason] = useState('')
  const [liftOn, setLiftOn] = useState(false)
  const [recentOn, setRecentOn] = useState(false)

  useEffect(() => {
    let alive = true
    fetchJSON(pairHistV2Paths(sport), (j) => Boolean(readPairHistV2(j, sport)))
      .then((j) => { if (alive) setFile(readPairHistV2(j, sport)) })
      .catch(() => { if (alive) setFile(null) })
    return () => { alive = false }
  }, [sport])

  const all = useMemo(() => pairHistRows(file, { query, sameGameOnly: sameGame }).filter((r) => (
    (!team || r._a?.team === team || r._b?.team === team)
    && (!season || Number(r[`s${season}`]) > 0)
    && (!liftOn || (r.lift != null && r.lift >= LIFT_BAR))
    && (!recentOn || (r.ago != null && r.ago <= RECENT_DAYS))
  )), [file, query, sameGame, team, season, liftOn, recentOn])
  const teams = useMemo(() => [...new Set((file?.pairs || []).flatMap((p) => (p?.players || []).map((x) => x?.team)).filter(Boolean))].sort(), [file])
  const rows = useMemo(() => all.slice(0, limit), [all, limit])
  const seasons = file?.seasons_covered || []

  const whatIsThis = () => explain('Pair history', file?.definition
    ? `${file.definition} ${W.active || ACTIVE} Rate is both-${W.unit}s games over joint games. Expected is what the two players' own rates would give if they were unrelated; Lift is the pair's actual count over that, so near 1.0 means no more than coincidence.`
    : `Two ${W.lead} who each had a ${W.unit} on the same day. Only active players, four seasons.`)

  const head = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
      <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: C.text }}>{W.title || 'Pair history, four seasons'}</h2>
      <button type="button" onClick={whatIsThis} aria-label="What is pair history?"
        style={{ minWidth: 44, minHeight: 44, border: 0, background: 'transparent', color: hue, font: `800 14px/1 ${NUM_FONT}`, cursor: 'pointer' }}>(?)</button>
    </div>
  )

  if (file === undefined) {
    return <section id={id}>{head}<div style={{ color: C.text3, fontSize: 12, padding: '8px 0' }}>Loading pair history…</div></section>
  }
  // BUCKETS builds this from its own graded games: before the first graded night the file is valid and empty
  if (W.own && file && !file.pairs.length && !(file.seasons_covered || []).length) {
    return (
      <section id={id}>
        {head}
        <div role="status" style={{ border: `1px dashed ${C.border2}`, borderRadius: 12, padding: 18, color: C.text3, fontSize: 12, lineHeight: 1.5 }}>
          Pair history builds as the season plays: it is counted from our own graded games, and none is graded yet.
        </div>
      </section>
    )
  }
  if (!file) {
    return (
      <section id={id}>
        {head}
        <div role="status" style={{ border: `1px dashed ${C.border2}`, borderRadius: 12, padding: 18, color: C.text3, fontSize: 12, lineHeight: 1.5 }}>
          {W.missing || <>Four-season pair history is not published yet. It appears here when we have built pairhist_v2_{sport}.json.</>}
        </div>
      </section>
    )
  }

  const open = onOpenPlayer ? (p) => onOpenPlayer(p._orig || p) : null
  const cols = [
    { key: 'rank', label: '#', group: 'Pair', heat: false, w: 30, rankCol: true },
    { key: 'pair', label: 'Pair', group: 'Pair', heat: false, sticky: true, w: 176,
      fmt: (_v, r) => (
        <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 3, padding: '3px 0' }}>
          <LegCell player={short(r._a)} sport={sport} onOpen={open} />
          <LegCell player={short(r._b)} sport={sport} onOpen={open} />
        </span>
      ) },
    { key: 'jd', label: 'Joint games', group: 'Evidence', w: 64, dp: 0, title: 'Days both players played, over the four seasons' },
    { key: 'je', label: W.both, group: 'Evidence', w: 66, dp: 0, title: `Of those, days both had a ${W.unit}` },
    { key: 'sg', label: 'Same game', group: 'Evidence', w: 62, dp: 0, title: `Of those, days both had a ${W.unit} in the same game` },
    { key: 'rate', label: 'Rate (n)', group: 'Rate', w: 92, dp: 1, fmt: (v, r) => (v == null ? '—' : `${v.toFixed(1)}% (n=${Number.isFinite(r?.jd) ? r.jd : '—'})`), title: `${W.both} games, as a share of joint games. n is the joint games behind the rate.` },
    { key: 'exp', label: 'Expected', group: 'Rate', w: 62, dp: 1, title: 'What the two players’ own rates would give if they were unrelated' },
    { key: 'lift', label: 'Lift', group: 'Rate', w: 48, dp: 2, title: 'Actual over expected. Near 1.00 is coincidence.' },
    ...seasons.map((y) => ({ key: `s${y}`, label: seasonLabel(sport, y), group: 'By season', w: 46, dp: 0, title: `${W.both} in ${seasonLabel(sport, y)}` })),
    { key: 'last', label: 'Last time', group: 'Recent', heat: false, w: 84, mono: true, dim: true },
    { key: 'ago', label: 'Days before', group: 'Recent', w: 58, dp: 0, invert: true, title: 'Days between their last time and the day this file was built' },
  ]

  return (
    <section id={id}>
      {head}
      <div style={{ fontSize: 12, color: C.text3, fontFamily: NUM_FONT, marginBottom: 8 }}>{coverageLine(file, sport)}</div>
      {(() => { const reset = (f) => (v) => { f(v); setLimit(SHOW) }; return (
        <FindBar query={query} setQuery={reset(setQuery)} placeholder={`Search either ${W.lead.slice(0, -1)}…`} searchLabel="Search pairs" accent={hue} style={{ margin: '0 0 10px' }}
          filters={[
            { key: 'team', label: 'Team', aria: 'Pairs with a player on this team', value: team, onChange: reset(setTeam), all: 'All teams', options: teams.map((t) => ({ key: t, label: t })) },
            { key: 'season', label: 'Season', aria: `Pairs who both had a ${W.unit} in this season`, value: season, onChange: reset(setSeason), all: 'Every season', options: seasons.map((y) => ({ key: String(y), label: seasonLabel(sport, y) })) },
          ]}
          toggles={[
            { key: 'same', label: 'Same game only', on: sameGame, onChange: reset(setSameGame), title: `Both had a ${W.unit} in the same game` },
            { key: 'lift', label: `Lift ${LIFT_BAR}+`, on: liftOn, onChange: reset(setLiftOn), title: `Did it at least ${LIFT_BAR}x as often as coincidence would give` },
            { key: 'recent', label: `Last ${RECENT_DAYS} days`, on: recentOn, onChange: reset(setRecentOn), title: `Last did it within ${RECENT_DAYS} days of the file` },
          ]} />
      ) })()}
      {all.length === 0 ? (
        <div style={{ color: C.text3, fontSize: 12, padding: '10px 0' }}>
          {!file.pairs.length && file.thresholds
            ? `No pair has reached ${file.thresholds.min_joint_days} joint games and ${file.thresholds.min_joint_event_days} joint ${W.unit} days yet. This builds as the season plays.`
            : 'No pair matches.'}
        </div>
      ) : (
        <DenseTable
          rows={rows}
          accent={hue}
          title="Pair history"
          bare
          initialSort={{ key: 'je', dir: 'desc' }}
          maxHeight={9999}
          columns={cols}
          caption={`Active players only. A pair is two ${W.lead} who each had a ${W.unit} on the same ${W.day}. Ranked by the days both did. ${file.thresholds ? `Needs ${file.thresholds.min_joint_days}+ joint games and ${file.thresholds.min_joint_event_days}+ joint ${W.unit} days.` : ''}`}
        />
      )}
      {all.length > rows.length && (
        <button type="button" onClick={() => setLimit((n) => n + 50)}
          style={{ display: 'block', width: '100%', minHeight: 44, margin: '8px 0 0', border: `1px solid ${C.border}`, borderRadius: 10, background: C.bg2, color: C.text2, font: `700 12px/1 ${NUM_FONT}`, cursor: 'pointer' }}>
          +{all.length - rows.length} more pairs
        </button>
      )}
    </section>
  )
}
