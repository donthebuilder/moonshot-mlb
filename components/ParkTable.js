'use client'
// TONIGHT'S PARKS, AS ONE TABLE (2026-10-07, Donovan: "Power ... big boxes look outdated -> dense table").
// The Parks lens of the Power page used to be a wall of weather cards. Same rows (parkRows, the arithmetic
// the lead sentence also reads, so the two cannot disagree), drawn as DenseTable skin v2: the best fifth of
// each column glows, the worst recedes, the header sorts. Nothing here scores anything: the park term is the
// bot's park HR factor, the weather term the bot's own HR weather effect (or the old wind / temperature
// heuristic when the bot did not publish one), their sum is the edge, and the projected outcome comes from
// lib/projection.js. Tap a park to filter the Farthest board to that game; tap the matchup for the game;
// tap a name for his card.
import { useMemo } from 'react'
import DenseTable from './DenseTable'
import Tap from './Tap'
import { C } from '../lib/theme'
import { n, nameOf } from '../lib/player'
import { parkRows } from './ParkBoard'
import { projectPool, projectionPublished } from '../lib/projection'
import { useClubHr } from '../lib/clubHr'
import { gameExpHr } from '../lib/teamHr'
import { useGameNav } from '../lib/teamNav'
import { localTime } from '../lib/localTime'

const G_PARK = { key: 'park', label: 'The park', order: 0 }
const G_EDGE = { key: 'edge', label: 'Tonight’s edge', order: 1 }
const G_AIR = { key: 'air', label: 'The air', order: 2 }
const G_PROJ = { key: 'proj', label: 'Projected game', order: 3 }
const G_BATS = { key: 'bats', label: 'Who it helps', order: 4 }

const timeText = (t) => {
  if (!t) return ''
  const d = new Date(t)
  return Number.isNaN(d.getTime()) ? '' : localTime(d, { zone: false })
}
const signed = (v, dp = 0) => (v == null || !Number.isFinite(v) ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(dp)}%`)

export default function ParkTable({ players = [], activeVenue = '', onVenueClick, onPlayerClick }) {
  const openGame = useGameNav()
  const parks = useMemo(() => parkRows(players), [players])
  const club = useClubHr()   // the team model's league table (lib/teamHr.js)
  const hasProj = useMemo(() => projectionPublished(parks.flatMap((g) => g.bats)), [parks])
  const rows = useMemo(() => [...parks].sort((a, b) => b.edge - a.edge).map((g, i) => {
    const pj = hasProj ? projectPool(g.bats) : null
    const teamHr = gameExpHr(g.bats, club)   // HR is the team model: both clubs, one source
    return {
      _key: String(g.pk),
      _raw: g,
      rank: i + 1,
      venue: g.venue || g.matchup,
      matchup: g.matchup,
      pk: g.pk,
      time: g.time ? new Date(g.time).getTime() : null,
      timeText: timeText(g.time),
      edge: g.edge,
      parkTerm: g.parkTerm,
      parkHR: g.parkHR > 0 ? g.parkHR : null,
      wxTerm: g.wxTerm,
      temp: g.temp > 0 ? g.temp : null,
      wind: /out/i.test(g.windLabel) ? g.wind : /in\b/i.test(g.windLabel) ? -g.wind : (g.wind || null),
      windLabel: g.windLabel,
      humidity: g.humidity,
      rain: g.rain,
      roof: g.roof || '',
      projHr: teamHr ? teamHr.total : null,
      projHits: pj ? pj.hits : null,
      projTb: pj ? pj.tb : null,
      threats: g.threats,
    }
  }), [parks, hasProj, club])

  const columns = useMemo(() => [
    { key: 'rank', label: '#', heat: false, w: 34, mono: true, dim: true, rankCol: true, title: 'Rank by tonight’s edge: the park’s HR factor plus tonight’s weather' },
    { key: 'venue', label: 'Park', heat: false, w: 168, bold: true, sticky: true, group: G_PARK,
      fmt: (v, r) => <span title={activeVenue === r._raw.venue ? 'Tap again to release the Farthest filter' : 'Tap to filter the Farthest board to this game'} style={{ color: activeVenue && activeVenue === r._raw.venue ? C.orange : undefined }}>{v}</span> },
    { key: 'matchup', label: 'Game', heat: false, w: 92, mono: true, dim: true, group: G_PARK,
      link: (r) => (openGame && r?.pk != null ? () => openGame(r.pk) : null) },
    { key: 'timeText', label: 'First pitch', heat: false, w: 74, mono: true, dim: true, numeric: false, group: G_PARK },
    { key: 'edge', label: 'Edge', w: 58, dp: 0, primary: true, bar: 'primary', domain: [-15, 15], fmt: (v) => signed(v), group: G_EDGE,
      title: 'The park’s HR factor and tonight’s weather, added: how much more (or less) the ball carries here tonight.' },
    { key: 'parkTerm', label: 'Park', w: 52, dp: 0, fmt: (v) => signed(v), group: G_EDGE, title: 'The building alone: (park HR factor − 1) × 100.' },
    { key: 'wxTerm', label: 'Weather', w: 58, dp: 0, fmt: (v) => signed(v), group: G_EDGE, title: 'Tonight’s weather alone: MOONSHOT’s own weather HR effect, or a wind and temperature read when it did not publish one.' },
    { key: 'temp', label: 'Temp', w: 48, dp: 0, fmt: (v) => (v == null ? '—' : `${Math.round(v)}°`), group: G_AIR, title: 'Temperature at first pitch (°F). Warm air carries the ball.' },
    { key: 'wind', label: 'Wind', w: 74, dp: 0, group: G_AIR,
      fmt: (v, r) => (v == null ? '—' : `${Math.abs(Math.round(v))} mph${r.windLabel ? ` ${String(r.windLabel).toLowerCase()}` : (v > 0 ? ' out' : ' in')}`),
      title: 'Wind speed and direction. Out to the field helps a fly ball; in from the field holds it up. Sorted by help: out is positive.' },
    { key: 'humidity', label: 'Humidity', w: 62, dp: 0, fmt: (v) => (v == null ? '—' : `${Math.round(v)}%`), group: G_AIR, title: 'Relative humidity' },
    { key: 'rain', label: 'Rain', w: 48, dp: 0, invert: true, fmt: (v) => (v == null ? '—' : `${Math.round(v)}%`), group: G_AIR, title: 'Chance of rain at first pitch' },
    { key: 'roof', label: 'Roof', heat: false, w: 70, mono: true, dim: true, group: G_AIR },
    ...(hasProj ? [
      { key: 'projHr', label: 'HR', w: 46, dp: 1, group: G_PROJ, title: 'Expected home runs in the game, both clubs, from the team model (lib/teamHr.js): club rate, the starter, the park and the weather' },
      { key: 'projHits', label: 'Hits', w: 46, dp: 1, group: G_PROJ, title: 'Projected hits in the game' },
      { key: 'projTb', label: 'TB', w: 46, dp: 1, group: G_PROJ, title: 'Projected total bases in the game' },
    ] : []),
    { key: 'threats', label: 'Longest threats', heat: false, numeric: false, w: 250, group: G_BATS,
      fmt: (v, r) => (
        <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', whiteSpace: 'nowrap' }}>
          {(r.threats || []).map((p, i) => (
            <span key={p?.player_id ?? i}>{i ? <span style={{ color: C.text3 }}>{'· '}</span> : null}<Tap onClick={onPlayerClick ? () => onPlayerClick(p) : null}>{nameOf(p)}</Tap></span>
          ))}
        </span>
      ),
      title: 'The two bats with the best longest-HR score in this building tonight' },
  ], [activeVenue, hasProj, openGame, onPlayerClick])

  if (!rows.length) return null
  return (
    <DenseTable
      rows={rows}
      columns={columns}
      onRowClick={(g) => onVenueClick?.(activeVenue && activeVenue === g.venue ? '' : g.venue)}
      initialSort={{ key: 'rank', dir: 'asc' }}
      maxHeight={640}
      maxRows={Math.max(rows.length, 1)}
      caption="Parks ranked by tonight's edge: the building's HR factor plus tonight's weather. It ranks places and scores nothing. Tap a park to filter the Farthest board to that game, the game to open it, a name for his card."
    />
  )
}
