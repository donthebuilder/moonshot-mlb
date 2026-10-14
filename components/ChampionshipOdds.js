'use client'

// ── 🏆 CHAMPIONSHIP ODDS FOR THE OTHER SPORTS (2026-10-14) ────────────────────
//
// Donovan: "we need model predictions for the championship just like the MLB did", shown on the Home of each sport.
// MLB's version is components/PennantRace.js (October odds); this is its twin for TUDDY, LAMP and BUCKETS and it is
// built the same way: the bot simulates the rest of the season ten thousand times and publishes one small file per
// sport (bots/championship/*.py), the table is the shared DenseTable, and it sits in a closed Fold on Home.
// PennantRace itself is not touched (MOONSHOT stays pixel-identical); the MLB-only parts it carries -- the live
// statsapi standings merge -- have no twin here, so the standing beside the odds is the bot's own `race` block.
//
// IT DRAWS NOTHING UNTIL THE FILE IS GOOD. No file, a file that breaks the contract (lib/championship.js), or a
// partial team list all mean: no fold, no placeholder, no number. The fold is closed until asked, like October odds.
// Like MLB's panel, it never dresses a favourite up: the method line is always visible, below the table.
import { useEffect, useState } from 'react'
import { fetchJSON } from '../lib/data'
import { championshipPaths } from '../lib/dataSource'
import { CHAMPIONSHIP, readChampionship, applyRace, pctWords, listed } from '../lib/championship'
import { C as BASE_C } from '../lib/theme'
import { localTime } from '../lib/localTime'
import DenseTable from './DenseTable'
import TeamMark from './TeamMark'
import Fold from './Fold'

const CLINCH_WORD = { x: 'clinched a berth', y: 'clinched division', z: 'clinched top seed' }

const toneOf = (C) => (v) => {
  const n = Number(v) || 0
  if (n >= 0.15) return C.orange || BASE_C.orange
  if (n >= 0.06) return C.yellow || BASE_C.yellow
  if (n >= 0.01) return C.text2
  return C.text3
}

function Table({ cfg, data, C }) {
  const teams = data.teams.map(applyRace)
  const shown = listed(teams, 16)
  const hasRace = teams.some((t) => t.race)
  const left = teams.length - shown.length
  const top = Math.max(0.05, ...teams.map((t) => t.win_champion || 0))
  const tone = toneOf(C)
  const colFor = ([key, label]) => ({ key, label, w: 62, fmt: (v) => pctWords(v), tone: (n) => ({ color: tone(n) }) })
  const columns = [
    { key: 'rank', label: '#', heat: false, w: 26 },
    { key: 'abbr', label: 'Team', heat: false, sticky: true, w: 120, fmt: (v, t) => (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <TeamMark sport={cfg.teamSport} abbr={v} variant="logo" px={16} /><b>{v || t.name}</b>
        <span style={{ fontSize: 9, color: C.text3 }}>{String(t.division || t.conference || '').replace(/^(AFC|NFC)\s/, '')}</span>
      </span>) },
    { key: 'wlN', label: 'W-L', w: 58, fmt: (_, t) => cfg.record(t) },
    ...(hasRace ? [{ key: 'nowN', label: 'Now', heat: false, numeric: false, w: 78, fmt: (_, t) => (
      <span title={t.race?.clinch ? CLINCH_WORD[t.race.clinch] || 'clinched' : t.race?.eliminated ? 'Eliminated' : ''}
        style={{ color: t.locked === 'in' ? C.green : t.locked === 'out' ? C.text3 : C.text2 }}>
        {t.locked === 'in' ? `✓ ${t.race.clinch === 'y' ? 'div' : t.race.clinch === 'z' ? 'top' : 'in'}` : t.locked === 'out' ? '✗ out' : t.race?.seed ? `#${t.race.seed}` : '—'}
      </span>) }] : []),
    { key: 'proj_wins', label: 'Proj', w: 44, dp: 0, title: 'Average wins across every simulated season' },
    { key: 'make_playoffs', label: 'Playoffs', w: 62, fmt: (v) => pctWords(v), tone: (n) => ({ color: tone(n) }) },
    ...cfg.cols.filter(([k]) => teams.some((t) => t[k] != null)).map(colFor),
    { key: 'win_champion', label: cfg.final, w: 78, primary: true, bar: 'primary', domain: [0, top], fmt: (v) => pctWords(v), tone: (n) => ({ color: tone(n), weight: 800 }) },
  ]
  const rows = shown.map((t, i) => ({ ...t, _key: t.team_id, rank: i + 1, wlN: Number(t.wins) - Number(t.losses), nowN: t.race?.seed || 99 }))
  const asOf = data.as_of ? new Date(data.as_of) : null
  return (
    <div>
      <DenseTable bare noGroups rows={rows} columns={columns}
        initialSort={{ key: 'win_champion', dir: 'desc' }} heatMode="sorted" maxHeight={9999} maxRows={16}
        caption={`Playoff and ${cfg.final} odds by team, from ${Number(data.sims).toLocaleString()} simulations`} />
      <p style={{ fontSize: 9.5, color: C.text3, lineHeight: 1.55, margin: '9px 2px 0', maxWidth: 720 }}>
        {asOf && !Number.isNaN(asOf.getTime()) ? `Simulated ${localTime(asOf)}. ` : ''}
        {left > 0 ? `${left} teams with no realistic path are not listed. ` : ''}
        {data.method}
        {data.note ? ` ${data.note}` : ''}
      </p>
      <p style={{ fontSize: 9.5, color: C.text3, lineHeight: 1.55, margin: '6px 2px 0', maxWidth: 720 }}>{cfg.note}</p>
    </div>
  )
}

/** The Home fold for a sport ('nfl' | 'nhl' | 'nba'). Renders nothing at all until the published file passes the contract. */
export default function ChampionshipOdds({ sport, theme = BASE_C }) {
  const cfg = CHAMPIONSHIP[sport]
  const [data, setData] = useState(null)
  useEffect(() => {
    let alive = true
    if (!cfg) return undefined
    fetchJSON(championshipPaths(sport))
      .then((j) => { const r = readChampionship(sport, j); if (alive && r.ok) setData(r.doc) })
      .catch(() => {})
    return () => { alive = false }
  }, [sport, cfg])
  if (!cfg || !data) return null
  return (
    <Fold id={cfg.foldId} title={cfg.title} meta={cfg.meta}>
      <Table cfg={cfg} data={data} C={{ ...BASE_C, ...theme }} />
    </Fold>
  )
}
