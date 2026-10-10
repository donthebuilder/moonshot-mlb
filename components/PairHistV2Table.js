'use client'
import { useEffect, useMemo, useState } from 'react'
import { useSportTheme } from './SportTheme'
import { SPORT_ACCENT } from '../lib/sportAccent'
import { fetchJSON } from '../lib/data'
import { pairHistV2Paths } from '../lib/dataSource'
import { readPairHistV2, pairHistRows, seasonLabel, coverageLine } from '../lib/pairHistV2'
import { explain } from '../lib/explain'
import { inputStyle } from './ui'
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

const WORDS = {
  mlb: { unit: 'home run', both: 'Both homered', lead: 'hitters', day: 'day' },
  nhl: { unit: 'goal', both: 'Both scored', lead: 'skaters', day: 'day' },
  nfl: { unit: 'touchdown', both: 'Both scored', lead: 'players', day: 'week' },
}

export default function PairHistV2Table({ sport = 'mlb', onOpenPlayer = null, accent = null, id = 'pairhist-v2' }) {
  const { C, NUM_FONT } = useSportTheme()
  const hue = accent || SPORT_ACCENT[sport] || C.orange
  const W = WORDS[sport] || WORDS.mlb
  const [file, setFile] = useState(undefined)   // undefined = loading, null = not published
  const [query, setQuery] = useState('')
  const [sameGame, setSameGame] = useState(false)
  const [limit, setLimit] = useState(SHOW)

  useEffect(() => {
    let alive = true
    fetchJSON(pairHistV2Paths(sport), (j) => Boolean(readPairHistV2(j, sport)))
      .then((j) => { if (alive) setFile(readPairHistV2(j, sport)) })
      .catch(() => { if (alive) setFile(null) })
    return () => { alive = false }
  }, [sport])

  const all = useMemo(() => pairHistRows(file, { query, sameGameOnly: sameGame }), [file, query, sameGame])
  const rows = useMemo(() => all.slice(0, limit), [all, limit])
  const seasons = file?.seasons_covered || []

  const whatIsThis = () => explain('Pair history', file?.definition
    ? `${file.definition} Only active players are counted: on a current roster, and a regular this season, or in at least 3 of the last 4 seasons. Rate is both-${W.unit}s games over joint games. Expected is what the two players' own rates would give if they were unrelated; Lift is the pair's actual count over that, so near 1.0 means no more than coincidence.`
    : `Two ${W.lead} who each had a ${W.unit} on the same day. Only active players, four seasons.`)

  const head = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
      <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: C.text }}>Pair history, four seasons</h2>
      <button type="button" onClick={whatIsThis} aria-label="What is pair history?"
        style={{ minWidth: 44, minHeight: 44, border: 0, background: 'transparent', color: hue, font: `800 14px/1 ${NUM_FONT}`, cursor: 'pointer' }}>(?)</button>
    </div>
  )

  if (file === undefined) {
    return <section id={id}>{head}<div style={{ color: C.text3, fontSize: 12, padding: '8px 0' }}>Loading pair history…</div></section>
  }
  if (!file) {
    return (
      <section id={id}>
        {head}
        <div role="status" style={{ border: `1px dashed ${C.border2}`, borderRadius: 12, padding: 18, color: C.text3, fontSize: 12, lineHeight: 1.5 }}>
          Four-season pair history is not published yet. It appears here when the bot has built pairhist_v2_{sport}.json.
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
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '0 0 10px' }}>
        <input style={{ ...inputStyle(), width: 'auto', flex: '1 1 180px', minWidth: 150, minHeight: 44 }} placeholder={`Search either ${W.lead.slice(0, -1)}…`}
          aria-label="Search pairs" value={query} onChange={(e) => { setQuery(e.target.value); setLimit(SHOW) }} />
        <button type="button" onClick={() => { setSameGame((v) => !v); setLimit(SHOW) }} aria-pressed={sameGame}
          style={{ minHeight: 44, padding: '0 14px', borderRadius: 10, border: `1px solid ${sameGame ? hue : C.border}`, background: sameGame ? hue : C.bg2,
            color: sameGame ? C.bg : C.text2, font: `700 12px/1 ${NUM_FONT}`, cursor: 'pointer' }}>Same game only</button>
      </div>
      {all.length === 0 ? (
        <div style={{ color: C.text3, fontSize: 12, padding: '10px 0' }}>No pair matches.</div>
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
