'use client'
// BUCKETS' SHOT CHART. A half court, top-down, in ESPN's own feet (x 0-50 across, the RIM at feed y 1; drawn with the
// baseline at 0 -- lib/nba/zones.js FEED_TO_COURT).
//
// THE ZONE COURT (2026-10-20, Donovan: "instead of dots ... zones lit up based on shot percentages and wherever the team
// is weak to"; the contour hills retired). Twelve zones (lib/nba/zones.js), each painted on the floor by a LENS:
//   SHOOTING  his (or the club's) FG% in the zone against the league's (lib/nba/zoneBaselines.js): lit = better, dark = worse
//   {CLUB} D  what that defense allowed there last season against the league, shrunk for small samples: lit = weak spot
//   ATTACK    both at once: he beats the league there, they allow more than the league there, and it's a real share of his
//             shots -- outlined in cream, everything else dimmed
// A zone with fewer than MIN_A shots in the filtered set is not coloured (too few to say). DOTS keeps every attempt as a
// dot (made filled, missed a ring); tap one for its line. Tap a zone for its numbers. Nothing here is hover-only.
// The filters ride the address with a urlKey (lib/useHashFilters) so a shared link reopens the same chart.
import { useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { ChipGroup, ChartLegend, StatStrip } from '../charts'
import FlatStage from '../charts/FlatStage'
import { C, NUM_FONT } from '../../lib/nba/theme'
import { alpha, rgbOf } from '../../lib/scales'
import FiltersSheet from '../player/FiltersSheet'
import useHashFilters from '../../lib/useHashFilters'
import { ZONES12, zoneOfShot, FEED_TO_COURT, RIM, THREE_R, CORNER_X, CORNER_Y } from '../../lib/nba/zones'
import { leagueZonePct, leagueZoneShare, defZone, ZONE_BASE_SEASON } from '../../lib/nba/zoneBaselines'
import { ZONE_PATHS, ZONE_LABEL, ZONE_COURT_H } from '../../lib/nba/zoneCourt'
import BucketsTable from './BucketsTable'

// the 3D court loads only when opened (next/dynamic, as the other 3D views)
const CourtArena = dynamic(() => import('./CourtArena'), { ssr: false })

const ACCENT = C.purple
export const MIN_A = 15          // fewer attempts than this in a zone: not coloured
const HOT_FULL = 15              // points better than the league for the hottest colour (was one ceiling of 6 for both sides:
const COLD_FULL = 10             // +6 and +15 painted the same, Donovan 2026-10-22: "the colors are hard to differentiate")
const ATTACK_SHARE = 4           // a zone is an ATTACK only when at least this % of his shots come from it,
const ATTACK_SHOOT = 1.5         // he beats the league there by at least this many points,
const ATTACK_DEF = 1             // and the defense allowed at least this many points more than the league
const pct = (m, a) => (a ? `${Math.round((100 * m) / a)}%` : '—')
const sgn = (v) => (v == null ? '' : `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}`)
const ordinal = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`

/** Every zone's numbers for a set of shots, against the league and (optionally) one defense. */
export function zoneRead(shots, defense = null) {
  const by = Object.fromEntries(ZONES12.map((z) => [z.k, { a: 0, m: 0 }]))
  let total = 0
  for (const s of shots) { const k = zoneOfShot(s); if (!k) continue; by[k].a += 1; if (s.made) by[k].m += 1; total += 1 }
  return ZONES12.map((z) => {
    const { a, m } = by[z.k]
    const p = a ? (100 * m) / a : null, lg = leagueZonePct(z.k)
    const enough = a >= MIN_A
    const d = defense ? defZone(defense, z.k) : null
    const share = total ? (100 * a) / total : 0
    const attack = Boolean(d && enough && p - lg >= ATTACK_SHOOT && d.diff >= ATTACK_DEF && share >= ATTACK_SHARE)
    return { ...z, a, m, p, lg, diff: enough ? p - lg : null, share, lgShare: leagueZoneShare(z.k), enough, def: d, attack }
  })
}

// THE LIGHT ON A ZONE (2026-10-22, three steps you can tell apart). Better than the league climbs dim purple -> the accent
// -> cream as it gets hotter, so +4, +9 and +15 are three different colours, not three shades of one; worse than the
// league goes cold blue. Built from the theme's own tokens (ZONE_RAMP); 2D and 3D read the same function.
const mixRgb = (a, b, t) => { const x = rgbOf(a), y = rgbOf(b); return x.map((v, i) => Math.round(v + (y[i] - v) * t)) }
const rgba = ([r, g, b], a) => `rgba(${r},${g},${b},${Math.max(0, Math.min(1, a)).toFixed(3)})`
const DIM = (() => { const [r, g, b] = mixRgb(C.bg3, ACCENT, 0.45); return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}` })()
export const ZONE_RAMP = { cold: C.blue, dim: DIM, mid: ACCENT, hot: C.cream }
/** True when a zone's fill is light enough that its numbers need dark ink (the hottest, cream end of the ramp). */
export function needsDarkInk(fill) {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(String(fill || ''))
  if (!m) return false
  const a = m[4] == null ? 1 : Number(m[4]), L = (0.299 * m[1] + 0.587 * m[2] + 0.114 * m[3]) / 255
  return L * a > 0.55
}
export function fillFor(v) {
  if (v == null) return null
  if (v < 0) { const t = Math.min(1, -v / COLD_FULL); return alpha(ZONE_RAMP.cold, 0.16 + 0.5 * t) }
  const t = Math.min(1, v / HOT_FULL)
  const c = t < 0.5 ? mixRgb(ZONE_RAMP.dim, ZONE_RAMP.mid, t / 0.5) : mixRgb(ZONE_RAMP.mid, ZONE_RAMP.hot, (t - 0.5) / 0.5)
  return rgba(c, 0.4 + 0.55 * t)
}

function CourtLines({ stroke, width = 0.16 }) {
  const line = { fill: 'none', stroke, strokeWidth: width }
  const y0 = CORNER_Y
  return (
    <g style={{ pointerEvents: 'none' }}>
      <rect x={0} y={0} width={50} height={47} style={line} />
      <rect x={17} y={0} width={16} height={19} style={line} />
      <circle cx={25} cy={19} r={6} style={line} />
      <path d={`M ${RIM.x - 4} ${RIM.y} A 4 4 0 0 0 ${RIM.x + 4} ${RIM.y}`} style={line} />
      <line x1={CORNER_X} y1={0} x2={CORNER_X} y2={y0} style={line} />
      <line x1={50 - CORNER_X} y1={0} x2={50 - CORNER_X} y2={y0} style={line} />
      <path d={`M ${CORNER_X} ${y0} A ${THREE_R} ${THREE_R} 0 0 0 ${50 - CORNER_X} ${y0}`} style={line} />
      <circle cx={RIM.x} cy={RIM.y} r={0.75} style={{ ...line, stroke: C.rim, strokeWidth: 0.22 }} />
      <line x1={22} y1={4} x2={28} y2={4} style={{ ...line, strokeWidth: 0.3 }} />
    </g>
  )
}

const ALL_FILTERS = ['result', 'type', 'quarter', 'team', 'player']
/**
 * shots: unpackShots / reduceShots rows; names: { [playerId]: name }; teams: { [teamId]: abbrev }
 * defense: a club code whose defense the court can be lit by (his next opponent, the club's own), or null
 * defenseNote: the words for whose defense it is ("PHI tonight")
 */
export default function ShotChart({ shots = [], names = {}, teams = {}, title = '', filters = ALL_FILTERS, source = null, urlKey = null, defense = null, defenseNote = null, who = 'his', threeD = false, names3d = null, ownDefense = null }) {
  const has = new Set(filters)
  const [fs, setF, resetF] = useHashFilters(urlKey, { res: 'all', kind: 'all', q: 'all', team: 'all', who: 'all', span: 'all', ssn: 'all', view: 'zones', lens: 'auto' })
  const { res, kind, q, team, who: shooter, span, ssn } = fs
  const view = fs.view === '3d' && !threeD ? 'zones' : fs.view
  const lensAsked = fs.lens
  // a lens whose club isn't given falls back to Shooting; OWN = the club's own defense (its page), drawn like a defense

  const [picked, setPicked] = useState(null)       // a dot
  const [zone, setZone] = useState(null)           // a zone key
  const teamIds = [...new Set(shots.map((s) => s.team_id).filter((x) => x != null))]
  // the games and seasons the shots carry (the packed routes send each shot's game and date)
  const games = useMemo(() => {
    const g = new Map()
    for (const s of shots) if (s.game_id && !g.has(s.game_id)) g.set(s.game_id, s.game_date || '')
    return [...g.entries()].sort((a, b) => String(a[1]).localeCompare(String(b[1])) || Number(a[0]) - Number(b[0])).map(([id]) => id)
  }, [shots])
  const seasonOf = (d) => { if (!d) return null; const y = Number(d.slice(0, 4)), mo = Number(d.slice(5, 7)); const end = mo >= 9 ? y + 1 : y; return `${end - 1}-${String(end).slice(2)}` }
  const seasons = useMemo(() => [...new Set(shots.map((s) => seasonOf(s.game_date)).filter(Boolean))].sort().reverse(), [shots])
  const hasPeriod = shots.some((s) => s.period)
  const shown = useMemo(() => {
    const inSeason = (s) => ssn === 'all' || seasonOf(s.game_date) === ssn
    // the last N games are counted inside the season filter
    const pool = games.filter((id) => ssn === 'all' || shots.some((s) => s.game_id === id && inSeason(s)))
    const lastN = span === 'all' ? null : new Set(pool.slice(-Number(span.slice(1))))
    return shots.filter((s) => (res === 'all' || view !== 'dots' || (res === 'made') === s.made)
      && (kind === 'all' || (kind === '3' ? s.three : !s.three))
      && (q === 'all' || (q === 'ot' ? s.period > 4 : String(s.period) === q))
      && (team === 'all' || String(s.team_id) === String(team))
      && (shooter === 'all' || String(s.player_id) === String(shooter))
      && inSeason(s) && (!lastN || lastN.has(s.game_id)))
  }, [shots, res, kind, q, team, shooter, span, ssn, games, view])
  const players = useMemo(() => {
    const n = new Map()
    for (const s of shots.filter((x) => team === 'all' || String(x.team_id) === String(team))) if (s.player_id) n.set(s.player_id, (n.get(s.player_id) || 0) + 1)
    return [...n.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)
  }, [shots, team])
  const made = shown.filter((s) => s.made).length, threes = shown.filter((s) => s.three), pts = shown.filter((s) => s.made).reduce((t, s) => t + (s.three ? 3 : 2), 0)
  // the opening light: ATTACK when a defense is given and the set has an attack zone, else SHOOTING
  const withDef = useMemo(() => (defense ? zoneRead(shown, defense) : null), [shown, defense])
  const lens0 = lensAsked === 'auto' ? (withDef?.some((z) => z.attack) ? 'attack' : 'shoot') : lensAsked
  const lens = (lens0 === 'def' || lens0 === 'attack') && !defense ? 'shoot' : lens0 === 'own' && !ownDefense ? 'shoot' : lens0
  const isDef = lens === 'def' || lens === 'own'
  const defClub = lens === 'own' ? ownDefense : defense
  const zones = useMemo(() => (defClub === defense && withDef ? withDef : zoneRead(shown, defClub)), [shown, defClub, defense, withDef])
  const zk = Object.fromEntries(zones.map((z) => [z.k, z]))
  const valueOf = (z) => (isDef ? z.def?.diff ?? null : lens === 'attack' ? (z.attack ? z.diff + z.def.diff : null) : z.diff)
  // whose spots: his (one player), their (a club), or just "hot" (a game's shots from many players)
  const owner = who === 'their' ? 'their' : (has.has('player') && shooter === 'all' && players.length > 1) ? 'hot' : 'his'
  const OWNER = owner.toUpperCase(), Owner = owner[0].toUpperCase() + owner.slice(1)
  const attacks = zones.filter((z) => z.attack).sort((a, b) => (b.diff + b.def.diff) - (a.diff + a.def.diff))
  // WHAT EACH ZONE WEARS under this light -- one list, drawn by the 2D court and painted onto the 3D floor
  const paint = useMemo(() => zones.map((z) => {
    const showDef = isDef
    const quiet = lens === 'attack' && !z.attack
    const f = fillFor(valueOf(z))
    return {
      k: z.k, fill: quiet ? alpha(C.bg, 0.45) : f, ink: !quiet && needsDarkInk(f) ? C.bg : null, outline: lens === 'attack' && z.attack, quiet: quiet || (!showDef && !z.enough),
      big: showDef ? (z.def ? `${Math.round(z.def.pct)}%` : '') : z.a ? `${Math.round(z.p)}%` : '',
      // WORDS, NOT +/- (2026-10-22, Donovan: "when they're above, those should be highlighted as that player's spot ... I
      // didn't know what the plus meant"). The +/- against the league stays on the tap line and in the table.
      small: lens === 'attack' ? (z.attack ? 'ATTACK' : '')
        : showDef ? (z.def ? (z.def.diff > 0 ? 'GIVES UP' : 'TOUGH') : '')
        : !z.a ? '' : !z.enough ? `${z.a} FGA` : z.diff >= 0 ? `${OWNER} SPOT` : 'COLD',
      hot: (showDef ? z.def?.diff : z.diff) > 0,
    }
  }), [zones, lens, isDef, OWNER]) // eslint-disable-line react-hooks/exhaustive-deps
  const props = { theme: C, numFont: NUM_FONT }
  const setAny = (k, v) => { setF(k, v); setPicked(null) }

  // the one sentence: what the court says under this lens
  const sentence = (() => {
    if (!shown.length) return null
    if (view === 'dots') return <><b style={{ color: ACCENT, fontWeight: 900 }}>{pct(made, shown.length)}</b> from the field ({made}/{shown.length}), {pct(threes.filter((s) => s.made).length, threes.length)} on threes.</>
    if (lens === 'attack') {
      if (!attacks.length) return <>No zone where {who === 'their' ? 'they beat' : 'he beats'} the league <i>and</i> {defense} gave up more than the league. Try {defense} gives up.</>
      return <>Attack: <b style={{ color: C.cream }}>{attacks.slice(0, 2).map((z) => z.label.toLowerCase()).join(' and ')}</b>. {who === 'their' ? 'They beat' : 'He beats'} the league there and {defense} allowed more than the league.</>
    }
    if (isDef) {
      const ds = zones.filter((z) => z.def).sort((a, b) => b.def.diff - a.def.diff)
      return <>{defClub} were softest at <b style={{ color: ACCENT }}>{ds[0].label.toLowerCase()}</b> ({Math.round(ds[0].def.pct)}% allowed, {ordinal(ds[0].def.rank)} most of 30) and toughest at {ds[ds.length - 1].label.toLowerCase()}.</>
    }
    const ok = zones.filter((z) => z.enough).sort((a, b) => b.diff - a.diff)
    if (!ok.length) return <>Fewer than {MIN_A} shots in every zone: not enough to light the court yet.</>
    return <>Best against the league: <b style={{ color: ACCENT }}>{ok[0].label.toLowerCase()}</b> ({Math.round(ok[0].p)}%, {sgn(ok[0].diff)}). {ok.length > 1 && ok[ok.length - 1].diff < 0 ? <>Coldest: {ok[ok.length - 1].label.toLowerCase()} ({sgn(ok[ok.length - 1].diff)}).</> : null}</>
  })()

  const zp = zone ? zk[zone] : null
  const zoneLegend = <ChartLegend theme={C} items={[
    { key: 'ramp', mark: <svg width="48" height="10" aria-hidden="true">{[-8, 3, 8, 15].map((v, i) => <rect key={v} x={i * 12} width="12" height="10" fill={fillFor(v)} />)}</svg>,
      label: isDef ? 'tough → gives up more than the NBA average' : `cold → ${owner} spot (better than the NBA average)` },
    ...(lens === 'attack' ? [{ key: 'atk', mark: <svg width="12" height="10"><rect x="1" y="1" width="10" height="8" fill="none" stroke={C.cream} strokeWidth="1.5" /></svg>, label: `attack: ${owner} spot and ${defense} gives up` }] : []),
    { key: 'tap', mark: null, label: 'tap a zone' },
  ]} />
  // the lens names say what each one shows: his spots, where a defense gives up, where the two meet
  const lensItems = [{ k: 'shoot', label: `${Owner} spots` }, ...(ownDefense ? [{ k: 'own', label: `${ownDefense} gives up` }] : []), ...(defense ? [{ k: 'def', label: `${defense} gives up` }, { k: 'attack', label: 'Attack' }] : [])]
  const tableRows = zones.map((z) => ({ ...z, _id: z.k, fg: `${z.m}/${z.a}`, pctV: z.p, defPct: z.def?.pct ?? null, defRank: z.def?.rank ?? null }))
  const tableCols = [
    { key: 'label', label: 'Zone', group: 'Zone', w: 128, heat: false, bold: true, sticky: true },
    { key: 'fg', label: 'FG', group: 'Shooting', w: 62, heat: false, mono: true },
    { key: 'pctV', label: 'FG%', group: 'Shooting', w: 52, dp: 0, fmt: (v, r) => (v == null ? '—' : <span style={{ opacity: r.enough ? 1 : 0.5 }}>{Math.round(v)}%</span>) },
    { key: 'diff', label: 'vs Lg', group: 'Shooting', w: 56, mono: true, title: `His FG% minus the league's in the zone (${ZONE_BASE_SEASON}); blank under ${MIN_A} shots`, fmt: (v) => (v == null ? '—' : sgn(v)) },
    { key: 'share', label: 'Of shots', group: 'Shooting', w: 64, dp: 0, mono: true, fmt: (v) => `${Math.round(v)}%` },
    ...(defClub ? [
      { key: 'defPct', label: `${defClub} allow`, group: 'Defense', w: 72, mono: true, title: `What ${defClub}'s opponents shot in the zone (${ZONE_BASE_SEASON}), pulled toward the league for small samples`, fmt: (v) => (v == null ? '—' : `${Math.round(v)}%`) },
      { key: 'defRank', label: 'Rank', group: 'Defense', w: 50, mono: true, heat: false, title: '1 = allowed the most of the 30 clubs', fmt: (v) => (v == null ? '—' : `${ordinal(v)}`) },
    ] : []),
  ]

  return (
    <section aria-label={title || 'Shot chart'} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
        <ChipGroup {...props} first label="View" value={view} onChange={(k) => { setAny('view', k); setZone(null) }} color={ACCENT} options={[{ k: 'zones', label: 'Zones' }, { k: 'dots', label: 'Dots' }, ...(threeD ? [{ k: '3d', label: '3D' }] : [])]} />
        {view !== 'dots' && lensItems.length > 1 ? <ChipGroup {...props} label="Light" value={lens} onChange={(k) => setAny('lens', k)} color={ACCENT} options={lensItems} /> : null}
        <FiltersSheet style={{ marginLeft: 'auto' }} onReset={() => { resetF(); setPicked(null); setZone(null) }} groups={[
          ...(games.length > 5 ? [{ key: 'span', label: 'Games', value: span, defaultValue: 'all', onChange: (k) => setAny('span', k), options: [{ value: 'all', label: 'All on file' }, { value: 'l20', label: 'Last 20' }, { value: 'l10', label: 'Last 10' }, { value: 'l5', label: 'Last 5' }] }] : []),
          ...(seasons.length > 1 ? [{ key: 'ssn', label: 'Season', value: ssn, defaultValue: 'all', onChange: (k) => setAny('ssn', k), options: [{ value: 'all', label: 'Both' }, ...seasons.map((x) => ({ value: x, label: x }))] }] : []),
          { key: 'kind', label: 'Type', value: kind, defaultValue: 'all', onChange: (k) => setAny('kind', k), options: [{ value: 'all', label: 'All' }, { value: '2', label: '2s' }, { value: '3', label: '3s' }] },
          ...(view === 'dots' ? [{ key: 'res', label: 'Result', value: res, defaultValue: 'all', onChange: (k) => setAny('res', k), options: [{ value: 'all', label: 'All' }, { value: 'made', label: 'Makes' }, { value: 'missed', label: 'Misses' }] }] : []),
          ...(hasPeriod || has.has('quarter') ? [{ key: 'q', label: 'Quarter', value: q, defaultValue: 'all', onChange: (k) => setAny('q', k),
            options: [{ value: 'all', label: 'All' }, { value: '1', label: 'Q1' }, { value: '2', label: 'Q2' }, { value: '3', label: 'Q3' }, { value: '4', label: 'Q4' }, { value: 'ot', label: 'OT' }] }] : []),
          ...(has.has('team') && teamIds.length > 1 ? [{ key: 'team', label: 'Team', value: team, defaultValue: 'all', onChange: (k) => { setF('team', k); setF('who', 'all'); setPicked(null) },
            options: [{ value: 'all', label: 'Both' }, ...teamIds.map((t) => ({ value: String(t), label: teams[t] || String(t) }))] }] : []),
          ...(has.has('player') && players.length ? [{ key: 'who', label: 'Player', value: shooter, defaultValue: 'all', onChange: (k) => setAny('who', k),
            options: [{ value: 'all', label: 'Everyone' }, ...players.map(([id, n]) => ({ value: String(id), label: names[id] || String(id), n }))] }] : []),
        ]} />
      </div>
      <StatStrip {...props} label="The shown shots, in numbers" stats={[
        { k: 'FGA', v: shown.length }, { k: 'FG%', v: pct(made, shown.length), sub: `${made}/${shown.length}` },
        { k: '3PA', v: threes.length }, { k: '3P%', v: pct(threes.filter((s) => s.made).length, threes.length) }, { k: 'PTS', v: pts, sub: 'from the field' },
      ]} />
      {view === '3d' ? (
        <CourtArena shots={shown} zones={paint} names={names3d || names} title={title || 'Shot chart'} picked={zone} onPick={setZone} legend={zoneLegend}
          subtitle={`${shown.length} attempts · ${lens === 'shoot' ? `${owner} spots` : isDef ? `where ${defClub} gives up` : 'attack'}`} />
      ) : (
      <FlatStage theme={C} numFont={NUM_FONT} accent={ACCENT} label={title || 'Shot chart'} kicker="SHOT CHART"
        right={view !== 'dots' ? (lens === 'shoot' ? `${OWNER} SPOTS` : isDef ? `WHERE ${defClub} GIVES UP` : 'ATTACK') : `${shown.length} ${shown.length === 1 ? 'SHOT' : 'SHOTS'}`}
        title={title || null} sentence={sentence}
        legend={view === 'dots' ? <ChartLegend theme={C} items={[
          { key: 'made', mark: <svg width="10" height="10"><circle cx="5" cy="5" r="4" fill={ACCENT} /></svg>, label: 'made' },
          { key: 'miss', mark: <svg width="10" height="10"><circle cx="5" cy="5" r="3.5" fill="none" stroke={C.text3} /></svg>, label: 'missed' },
          { key: 'tap', mark: null, label: 'tap a shot for its line' },
        ]} /> : zoneLegend}
        more={{ label: 'More numbers', summary: 'every zone', children: (
          <BucketsTable rows={tableRows} columns={tableCols} heatMode="sorted" initialSort={{ key: 'share', dir: 'desc' }} maxHeight={9999} maxRows={12}
            onRowClick={(r) => setZone((r?._raw ?? r).k)} caption={`Every zone, against the league (${ZONE_BASE_SEASON})${defClub ? ` and what ${defClub} allowed there` : ''}. A row lights its zone.`} />
        ) }}>
        <svg viewBox={`0 0 50 ${ZONE_COURT_H}`} role="img" aria-label={`${shown.length} ${shown.length === 1 ? 'shot' : 'shots'} on a half court, ${view === 'zones' ? 'zone by zone' : 'every attempt'}`} style={{ width: '100%', maxWidth: 560, display: 'block', margin: '0 auto', touchAction: 'manipulation' }}>
          {Array.from({ length: Math.ceil(ZONE_COURT_H / 1.6) }, (_, i) => <rect key={i} x={0} y={i * 1.6} width={50} height={1.6} fill={i % 2 ? C.wood1 : C.wood2} />)}
          {view === 'zones' ? paint.map((z) => (
            <path key={z.k} d={ZONE_PATHS[z.k]} fillRule="evenodd" onClick={() => setZone((v) => (v === z.k ? null : z.k))} style={{ cursor: 'pointer' }}
              fill={z.fill || 'transparent'} stroke={alpha(C.courtLine, 0.22)} strokeWidth={0.1} />
          )) : null}
          <CourtLines stroke={alpha(C.courtLine, view === 'zones' ? 0.55 : 0.75)} />
          {view === 'zones' && lens === 'attack' ? attacks.map((z) => <path key={`a${z.k}`} d={ZONE_PATHS[z.k]} fillRule="evenodd" fill="none" stroke={C.cream} strokeWidth={0.32} style={{ pointerEvents: 'none' }} />) : null}
          {view === 'zones' && zp ? <path d={ZONE_PATHS[zp.k]} fillRule="evenodd" fill="none" stroke={C.text} strokeWidth={0.36} strokeDasharray="0.8 0.5" style={{ pointerEvents: 'none' }} /> : null}
          {view === 'zones' ? paint.map((z) => {
            const [lx, ly, side] = ZONE_LABEL[z.k]
            const fsz = side ? 1.45 : z.k === 'ra' ? 1.5 : 2.1
            return (
              <g key={`t${z.k}`} transform={side ? `rotate(-90 ${lx} ${ly})` : undefined} style={{ pointerEvents: 'none' }} opacity={z.quiet ? 0.55 : 1}>
                <text x={lx} y={ly} textAnchor="middle" fontSize={fsz} fontWeight={900} fill={z.ink || (z.hot ? C.cream : C.text)} stroke={z.ink ? C.cream : C.wood1} strokeWidth={0.42} paintOrder="stroke" fontFamily={NUM_FONT}>{z.big}</text>
                {z.small ? <text x={lx} y={ly + fsz * 0.78} textAnchor="middle" fontSize={fsz * 0.52} fontWeight={800} fill={z.ink || (z.hot ? C.cream : C.text2)} stroke={z.ink ? C.cream : C.wood1} strokeWidth={0.3} paintOrder="stroke" fontFamily={NUM_FONT}>{z.small}</text> : null}
              </g>
            )
          }) : null}
          {view === 'dots' && shown.map((s) => (
            <g key={s.event_id} onClick={() => setPicked(s)} style={{ cursor: 'pointer' }}>
              {shown.length <= 1500 ? <circle cx={s.x} cy={s.y + FEED_TO_COURT} r={1.6} fill="transparent" /> : null}
              <circle cx={s.x} cy={s.y + FEED_TO_COURT} r={0.62} fill={s.made ? ACCENT : 'none'} stroke={s.made ? ACCENT : C.text3} strokeWidth={0.2} opacity={picked && picked.event_id !== s.event_id ? 0.45 : shown.length > 1500 ? 0.7 : 1} />
            </g>
          ))}
        </svg>
      </FlatStage>
      )}
      {view !== 'dots' ? (
        <p style={{ margin: 0, fontSize: 12, color: C.text2, fontFamily: NUM_FONT, minHeight: 18 }}>
          {zp ? <><b style={{ color: C.text }}>{zp.label}</b>: {zp.a ? <>{Math.round(zp.p)}% ({zp.m}/{zp.a}){zp.enough ? <>, league {Math.round(zp.lg)}% ({sgn(zp.diff)})</> : <>, too few to compare</>} · {Math.round(zp.share)}% of the shots (league {Math.round(zp.lgShare)}%)</> : 'no shots here in this set'}{zp.def ? <> · {defClub} allowed {Math.round(zp.def.pct)}% here, {ordinal(zp.def.rank)} most of 30</> : null}{zp.attack ? <b style={{ color: C.cream }}> · ATTACK</b> : null}</>
            : `Tap a zone for its numbers. League = every club, ${ZONE_BASE_SEASON}.${defClub ? ` ${defClub} gives up = what ${defClub}'s opponents shot there last season${defClub === defense && defenseNote ? ` (${defenseNote})` : ''}.` : ''}`}
        </p>
      ) : null}
      {picked && view === 'dots' ? (
        <p style={{ margin: 0, fontSize: 12, color: C.text2, fontFamily: NUM_FONT }}>
          {picked.player_id ? <><b style={{ color: picked.made ? ACCENT : C.text }}>{names[picked.player_id] || picked.player_id}</b> · </> : null}{picked.made ? 'made' : 'missed'} {picked.three ? 'a three' : 'a two'}{picked.shot_type ? ` · ${picked.shot_type}` : ''}{picked.distance != null ? ` · ${picked.distance} ft` : ''}{picked.period ? ` · Q${picked.period > 4 ? `OT${picked.period - 4}` : picked.period} ${picked.clock || ''}` : ''}{picked.game_date ? ` · ${picked.game_date}` : ''}
        </p>
      ) : null}
      <p style={{ margin: 0, fontSize: 11, color: C.text3 }}>{source || 'Source: ESPN play-by-play (every field-goal attempt’s spot; free throws and end-of-quarter heaves out, as in the box score).'} No contested-shot or defender-distance data is on file.</p>
    </section>
  )
}
