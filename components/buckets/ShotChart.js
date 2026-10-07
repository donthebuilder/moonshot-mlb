'use client'
// BUCKETS' SHOT CHART (BATCH-BUCKETS B6, 2026-10-02). One game's field-goal
// attempts on a half court, in ESPN's own feet: x 0-50 across, y with the
// RIM at y 1 (fitted on 764 shots with a stated distance, mean error 0.39 ft,
// 10-02); the baseline sits 4.25 ft behind it -- lib/nba/api.js reduceShots. Built from the
// shared chart pieces LAMP's shot map uses (components/charts): the filters
// (result · 2s or 3s · quarter · team · player), the stat strip (FGA · FG% ·
// 3PA · 3P% · PTS), the legend, and per-zone makes / attempts with their n.
// "vs league" per zone waits for the backfill (it would be a guess today).
// Tap a shot for its line (nothing here is hover-only).
import { useMemo, useState } from 'react'
import { ChipGroup, ChartCard, ChartLegend, StatStrip } from '../charts'
import { C, NUM_FONT } from '../../lib/theme'

const ACCENT = C.purple
// drawn with the baseline at 0: a feed y + FEED_TO_COURT. The rim: feed (25, 1) = court (25, 5.25)
const FEED_TO_COURT = 4.25
const RIM = { x: 25, y: 5.25 }
// the five zones (BUCKETS-PLAN-v2 B6), from the shot's own spot and value
export function zoneOf(s) {
  const y = s.y + FEED_TO_COURT
  const d = Math.hypot(s.x - RIM.x, y - RIM.y)
  if (s.three) return y <= 14 && Math.abs(s.x - 25) >= 21 ? 'corner3' : 'above3'
  if (d <= 4) return 'rim'
  if (Math.abs(s.x - 25) <= 8 && y <= 19) return 'paint'
  return 'mid'
}
const ZONES = [['rim', 'Restricted area'], ['paint', 'Paint'], ['mid', 'Mid-range'], ['corner3', 'Corner 3'], ['above3', 'Above the break 3']]
const pct = (m, a) => (a ? `${Math.round((100 * m) / a)}%` : '—')
const HEAT_AT = 400
const BIN = 2
function binsOf(shots) {
  const m = new Map()
  for (const s of shots) {
    const bx = Math.floor(s.x / BIN), by = Math.floor((s.y + FEED_TO_COURT) / BIN)
    if (bx < 0 || by < 0 || bx >= 25 || by >= 24) continue
    const k = `${bx}:${by}`
    const b = m.get(k) || { k, bx, by, a: 0, m: 0 }
    b.a += 1; if (s.made) b.m += 1
    m.set(k, b)
  }
  return [...m.values()]
}

function Court() {
  const line = { fill: 'none', stroke: C.border2, strokeWidth: 0.25 }
  // the three-point arc: corners straight to y 14, then the 23.75 ft arc around the rim
  const a = Math.acos((25 - 3) / 23.75), y0 = RIM.y + 23.75 * Math.sin(a)
  return (
    <g>
      <rect x={0} y={0} width={50} height={47} style={line} />
      <rect x={17} y={0} width={16} height={19} style={line} />
      <circle cx={25} cy={19} r={6} style={line} />
      <path d={`M ${RIM.x - 4} ${RIM.y} A 4 4 0 0 0 ${RIM.x + 4} ${RIM.y}`} style={line} />
      <line x1={3} y1={0} x2={3} y2={y0} style={line} />
      <line x1={47} y1={0} x2={47} y2={y0} style={line} />
      <path d={`M 3 ${y0} A 23.75 23.75 0 0 0 47 ${y0}`} style={line} />
      <circle cx={RIM.x} cy={RIM.y} r={0.75} style={{ ...line, stroke: ACCENT }} />
      <line x1={22} y1={4} x2={28} y2={4} style={{ ...line, stroke: C.text3 }} />
    </g>
  )
}

// `filters`: which filter groups show. A season's shots for one player or one
// club (the packed shots route: spot, made, three -- no quarter, no shooter)
// pass ['result', 'type']: a filter on a field the rows don't carry would empty the chart.
const ALL_FILTERS = ['result', 'type', 'quarter', 'team', 'player']
/** shots: reduceShots rows; names: { [playerId]: name }; teams: { [teamId]: abbrev } */
export default function ShotChart({ shots = [], names = {}, teams = {}, title = '', filters = ALL_FILTERS, source = null }) {
  const has = new Set(filters)
  const [res, setRes] = useState('all')
  const [kind, setKind] = useState('all')
  const [q, setQ] = useState('all')
  const [team, setTeam] = useState('all')
  const [who, setWho] = useState('all')
  const [picked, setPicked] = useState(null)
  // HEAT for a season's worth (a club's is 7,000+ attempts: as dots it is one
  // purple blot). 2 ft bins, shaded by attempts; tap a bin for its makes / attempts.
  const [view, setView] = useState(shots.length > HEAT_AT ? 'heat' : 'dots')
  const [bin, setBin] = useState(null)
  const teamIds = [...new Set(shots.map((s) => s.team_id))]
  const shown = useMemo(() => shots.filter((s) => (res === 'all' || (res === 'made') === s.made)
    && (kind === 'all' || (kind === '3' ? s.three : !s.three))
    && (q === 'all' || (q === 'ot' ? s.period > 4 : String(s.period) === q))
    && (team === 'all' || s.team_id === team)
    && (who === 'all' || s.player_id === who)), [shots, res, kind, q, team, who])
  const players = useMemo(() => {
    const n = new Map()
    for (const s of shots.filter((x) => team === 'all' || x.team_id === team)) n.set(s.player_id, (n.get(s.player_id) || 0) + 1)
    return [...n.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)
  }, [shots, team])
  const made = shown.filter((s) => s.made).length, threes = shown.filter((s) => s.three), pts = shown.filter((s) => s.made).reduce((t, s) => t + (s.three ? 3 : 2), 0)
  const bins = useMemo(() => (view === 'heat' ? binsOf(shown) : []), [view, shown])
  const maxA = bins.reduce((n, b) => Math.max(n, b.a), 1)
  const zones = ZONES.map(([k, label]) => { const z = shown.filter((s) => zoneOf(s) === k); return { k, label, a: z.length, m: z.filter((s) => s.made).length } })
  const props = { theme: C, numFont: NUM_FONT }
  return (
    <section aria-label={title || 'Shot chart'} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {shots.length > HEAT_AT && <ChipGroup {...props} first label="View" value={view} onChange={(k) => { setView(k); setBin(null); setPicked(null) }} color={ACCENT} options={[{ k: 'heat', label: 'Heat' }, { k: 'dots', label: 'Dots' }]} />}
        <ChipGroup {...props} first={shots.length <= HEAT_AT} label="Result" value={res} onChange={setRes} color={ACCENT} options={[{ k: 'all', label: 'All' }, { k: 'made', label: 'Made' }, { k: 'missed', label: 'Missed' }]} />
        <ChipGroup {...props} label="Type" value={kind} onChange={setKind} color={ACCENT} options={[{ k: 'all', label: 'All' }, { k: '2', label: '2s' }, { k: '3', label: '3s' }]} />
        {has.has('quarter') && <ChipGroup {...props} label="Quarter" value={q} onChange={setQ} color={ACCENT} options={[{ k: 'all', label: 'All' }, { k: '1', label: 'Q1' }, { k: '2', label: 'Q2' }, { k: '3', label: 'Q3' }, { k: '4', label: 'Q4' }, { k: 'ot', label: 'OT' }]} />}
        {has.has('team') && <ChipGroup {...props} label="Team" value={team} onChange={(k) => { setTeam(k); setWho('all') }} color={ACCENT} options={[{ k: 'all', label: 'Both' }, ...teamIds.map((t) => ({ k: t, label: teams[t] || t }))]} />}
      </div>
      {/* a dropdown, not 12 stacked chips (a phone's scroll) */}
      {has.has('player') && <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 11, fontWeight: 800, letterSpacing: '.08em', color: C.text3, fontFamily: NUM_FONT }}>
        PLAYER
        <select value={who} onChange={(e) => setWho(e.target.value)} style={{ minHeight: 44, flex: '1 1 auto', maxWidth: 320, borderRadius: 10, border: `1px solid ${who === 'all' ? C.border2 : ACCENT}`, background: C.bg2, color: C.text, fontSize: 14, padding: '0 10px' }}>
          <option value="all">Everyone</option>
          {players.map(([id, n]) => <option key={id} value={id}>{names[id] || id} · {n} {n === 1 ? 'shot' : 'shots'}</option>)}
        </select>
      </label>}
      <StatStrip {...props} label="The shown shots, in numbers" stats={[
        { k: 'FGA', v: shown.length }, { k: 'FG%', v: pct(made, shown.length), sub: `${made}/${shown.length}` },
        { k: '3PA', v: threes.length }, { k: '3P%', v: pct(threes.filter((s) => s.made).length, threes.length) }, { k: 'PTS', v: pts, sub: 'from the field' },
      ]} />
      <ChartCard theme={C} accent={ACCENT}>
        <svg viewBox="-1 -1 52 49" role="img" aria-label={`${shown.length} ${shown.length === 1 ? 'shot' : 'shots'} on a half court`} style={{ width: '100%', maxWidth: 560, display: 'block', margin: '0 auto' }}>
          <Court />
          {view === 'heat' && bins.map((b) => (
            <rect key={b.k} x={b.bx * BIN} y={b.by * BIN} width={BIN} height={BIN} onClick={() => setBin(b)} style={{ cursor: 'pointer' }}
              fill={ACCENT} fillOpacity={0.12 + 0.88 * Math.sqrt(b.a / maxA)} stroke={bin?.k === b.k ? C.text : 'none'} strokeWidth={0.2} />
          ))}
          {view === 'dots' && shown.map((s) => (
            <g key={s.event_id} onClick={() => setPicked(s)} style={{ cursor: 'pointer' }}>
              {/* the wider tap target only while the chart is a game's worth: a club's season is 7,000+ shots */}
              {shown.length <= 1500 ? <circle cx={s.x} cy={s.y + FEED_TO_COURT} r={1.6} fill="transparent" /> : null}
              <circle cx={s.x} cy={s.y + FEED_TO_COURT} r={0.7} fill={s.made ? ACCENT : 'none'} stroke={s.made ? ACCENT : C.text3} strokeWidth={0.22} opacity={picked && picked.event_id !== s.event_id ? 0.45 : 1} />
            </g>
          ))}
        </svg>
      </ChartCard>
      {view === 'heat' ? (
        <p style={{ margin: 0, fontSize: 12, color: C.text2, fontFamily: NUM_FONT, minHeight: 18 }}>
          {bin ? <>This spot ({BIN} ft square): <b style={{ color: C.text }}>{bin.m}/{bin.a}</b> made · {pct(bin.m, bin.a)}</> : 'Darker = more attempts from that spot. Tap a square for its makes over attempts.'}
        </p>
      ) : null}
      {view === 'dots' && <ChartLegend theme={C} items={[
        { key: 'made', mark: <svg width="10" height="10"><circle cx="5" cy="5" r="4" fill={ACCENT} /></svg>, label: 'made' },
        { key: 'miss', mark: <svg width="10" height="10"><circle cx="5" cy="5" r="3.5" fill="none" stroke={C.text3} /></svg>, label: 'missed' },
        { key: 'tap', mark: null, label: 'tap a shot for its line' },
      ]} />}
      {picked ? (
        <p style={{ margin: 0, fontSize: 12, color: C.text2, fontFamily: NUM_FONT }}>
          {picked.player_id ? <><b style={{ color: picked.made ? ACCENT : C.text }}>{names[picked.player_id] || picked.player_id}</b> · </> : null}{picked.made ? 'made' : 'missed'} {picked.three ? 'a three' : 'a two'}{picked.shot_type ? ` · ${picked.shot_type}` : ''}{picked.distance != null ? ` · ${picked.distance} ft` : ''}{picked.period ? ` · Q${picked.period > 4 ? `OT${picked.period - 4}` : picked.period} ${picked.clock || ''}` : ''}
        </p>
      ) : null}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 6 }}>
        {zones.map((z) => (
          <div key={z.k} style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: '6px 10px', background: C.bg2 }}>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.06em', color: C.text3, fontFamily: NUM_FONT }}>{z.label.toUpperCase()}</div>
            <div style={{ fontFamily: NUM_FONT, fontSize: 14, fontWeight: 900 }}>{pct(z.m, z.a)} <span style={{ fontSize: 11, color: C.text3, fontWeight: 600 }}>{z.m}/{z.a}</span></div>
          </div>
        ))}
      </div>
      <p style={{ margin: 0, fontSize: 11, color: C.text3 }}>{source || 'Source: ESPN play-by-play (every field-goal attempt’s spot; free throws and end-of-quarter heaves out, as in the box score).'}</p>
    </section>
  )
}
