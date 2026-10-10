'use client'
import { useEffect, useMemo, useState } from 'react'
import Rink, { VS_MIN, VS_FULL, HEAT_MIN_SOG, HEAT_FULL } from './Rink'
import HowToRead from '../charts/HowToRead'
import dynamic from 'next/dynamic'
import { webglOk } from '../../lib/webglOk'
// 🏟 the arena rides in on demand -- three.js is ~600KB (BATCH-NHL-3D)
const RinkArena = dynamic(() => import('./RinkArena'), { ssr: false })
const NO_SHOTS = []   // one empty list, so the HEAT arena isn't rebuilt every render
import { C, NUM_FONT, RINK, RINK_DARK as RD } from '../../lib/nhl/theme'
import { useLampShots, useLampShotSpeed, useLampGoalies, useLampGoalieZones } from '../../lib/nhl/useLamp'
import { goalieZoneRead, overlapSentence, matchZones, MATCH_SHARE, ZONE_LABEL } from '../../lib/nhl/zones'
import { LEAGUE_MIN_GAMES } from '../../lib/nhl/shotMapShape'
import { stampLine, leagueStamp } from '../../lib/nhl/shotStamp'
import { shotLine } from '../../lib/nhl/shotStats'
import { hardestIndex, measuredMph } from '../../lib/nhl/shotPath'
import { DelayedBanner, Loading, Pills } from './ui'
import { FactLines } from '../matchup/MatchupParts'
import { alpha } from '../../lib/scales'
import FiltersSheet from '../player/FiltersSheet'
import useHashFilters from '../../lib/useHashFilters'
import { ChartCard, ChartLegend, ChartEmpty, StatStrip, viewBtn } from '../charts'

// 🏒 WHERE HE SHOOTS FROM (lamp research step 3). The rink plus the numbers
// it is drawn from, for one player or one club: season or last 10 games,
// attempts / on net / goals, and the slot share with the slot defined in
// words beside it. A player with no shots on file gets a sentence, not an
// empty rink. Data: /api/lamp/shots (aggregates, cached a day).
// 2026-10-03, Donovan: "it should just open up to last 10 games ... at least
// be able to do last five" -- LAST 5 / LAST 10 / SEASON, opening on LAST 10.
const WINDOWS = [{ key: 'last5', text: 'LAST 5' }, { key: 'last10', text: 'LAST 10' }, { key: 'all', text: 'SEASON' }]
const SEASONS = [{ key: 'this', text: 'THIS SEASON' }, { key: 'last', text: 'LAST SEASON' }, { key: 'both', text: 'BOTH' }]
const pct = (v) => (v == null ? '—' : `${Math.round(v * 100)}%`)
const share = (n, d) => `${Math.round((100 * n) / d)}%`

// SHOT DEPTH (2026-09-28): what we already know past the rink --
// the shot types (unblocked attempts; a block has no type), how far out the
// shots on net and the goals come from, and, once we keep it, why
// the misses missed. MOONSHOT's plain lines, LAMP's colours.
function depthLines(m, who, against = false) {
  const types = Object.entries(m.types || {}).sort((a, b) => b[1].att - a[1].att)
  const nTyped = types.reduce((a, [, t]) => a + t.att, 0)
  const top = types.slice(0, 3)
  const his = against ? "opponents'" : who === 'He' ? 'his' : 'their'
  return [
    ['Shot types', nTyped >= 10 ? <>{top.map(([k, t], i) => <span key={k}>{i ? ' · ' : ''}{k} {share(t.att, nTyped)}{t.g ? ` (${t.g} ${t.g === 1 ? 'goal' : 'goals'})` : ''}</span>)}<span style={{ color: C.text3 }}> of {nTyped} unblocked</span>.</> : null],
    ['Distance', m.distSog != null ? <>{his} shots on net come from {m.distSog} ft on average{m.distGoal != null ? <>, {his} goals from {m.distGoal} ft</> : null}.</> : null],
    ['Misses', m.missWhy && m.missWhy.n >= 10 ? <>wide {share(m.missWhy.wide, m.missWhy.n)} · high {share(m.missWhy.high, m.missWhy.n)} · off the post or bar {share(m.missWhy.iron, m.missWhy.n)}<span style={{ color: C.text3 }}> of {m.missWhy.n} misses</span>.</> : null],
  ]
}

// THE SPRAY-CHART PASS (2026-09-29, Donovan: "i love the where he shoots from
// -- make it better just like the spray chart"). MOONSHOT's spray chart
// pieces on the rink: its filter chips (components/charts ChipGroup, was matchup/SprayParts --
// result, shot type, strength, period, each chip counting what is in the
// window), zone bars (MatchupParts BarList) with every zone defined in words,
// and a tap-a-shot card. Filters cut the drawn shots (the most recent 200);
// the season numbers in the list are always the whole window.
const RES = [['ALL', 'All shots'], ['goal', 'Goals'], ['sog', 'Saved'], ['miss', 'Missed'], ['block', 'Blocked']]
const STR = [['ALL', 'All'], ['ev', 'Even'], ['pp', 'PP'], ['sh', 'SH']]
const PER = [['ALL', 'All'], ['1', '1st'], ['2', '2nd'], ['3', '3rd'], ['OT', 'OT']]
const perOf = (sh) => (sh[6] && sh[6] !== 'REG' ? 'OT' : sh[5] != null ? String(sh[5]) : null)
const NET_X = 89
const distOf = (sh) => Math.round(Math.hypot(NET_X - sh[0], sh[1]))
// Zones, in the league's feet after every shot is turned to attack the right-hand net.
export const ZONES = [
  { key: 'slot', label: 'Slot', def: 'between the faceoff dots and the goal line', test: ([x, y]) => x >= 69 && x <= 89 && Math.abs(y) <= 22 },
  { key: 'high', label: 'High slot', def: 'the middle, from the top of the circles to the dots', test: ([x, y]) => x >= 54 && x < 69 && Math.abs(y) <= 22 },
  { key: 'circles', label: 'Circles', def: 'outside the dots, either side', test: ([x, y]) => x >= 54 && x <= 89 && Math.abs(y) > 22 },
  { key: 'point', label: 'Point', def: 'the blue line to the top of the circles', test: ([x]) => x < 54 },
  { key: 'below', label: 'Below', def: 'behind the goal line', test: ([x]) => x > 89 },
]
const TALL = { minHeight: 44, padding: '0 12px', fontSize: 12, borderRadius: 999 }
const clock = (t) => (t == null ? '' : `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`)
const RES_WORD = { goal: 'Goal', sog: 'On net, saved', miss: 'Missed the net', block: 'Blocked' }

// Only the shots from these game days, with the counts the panel prints worked out again from them
// (the VS TEAM view: his shots in the games against one club). Pure; the grid is rebuilt from the shots.
function restrictTo(m, dates, spec) {
  const recent = (m.recent || []).filter((sh) => sh[8] && dates.has(sh[8]))
  const grid = Array.from({ length: spec.rows }, () => Array.from({ length: spec.cols }, () => ({ att: 0, sog: 0, g: 0 })))
  const cw = (spec.x1 - spec.x0) / spec.cols; const ch = (spec.y1 - spec.y0) / spec.rows
  for (const [x, y, r] of recent) {
    if (x < spec.x0) continue
    const c = Math.min(spec.cols - 1, Math.floor((x - spec.x0) / cw)); const rr = Math.min(spec.rows - 1, Math.max(0, Math.floor((spec.y1 - y) / ch)))
    grid[rr][c].att += 1; if (r === 'sog' || r === 'goal') grid[rr][c].sog += 1; if (r === 'goal') grid[rr][c].g += 1
  }
  const net = recent.filter((sh) => sh[2] === 'sog' || sh[2] === 'goal')
  const slotN = net.filter((sh) => sh[0] >= 69 && sh[0] <= 89 && Math.abs(sh[1]) <= 22).length
  return {
    ...m, recent, grid, games: new Set(recent.map((sh) => sh[8])).size, attempts: recent.length, sog: net.length, goals: recent.filter((sh) => sh[2] === 'goal').length,
    misses: recent.filter((sh) => sh[2] === 'miss').length, blocked: recent.filter((sh) => sh[2] === 'block').length, xg: null,   // a restricted window has no xG: the server sums it, the tuples here do not carry the shot's zone
    slotShare: net.length ? slotN / net.length : null, byStrength: { pp: recent.filter((sh) => sh[4] === 'pp').length }, types: null, distSog: null, distGoal: null, missWhy: null,
  }
}

// season: 'this' | 'last' | 'both' asks the shot map for that season (null = the page's own default);
// onlyDates: a Set of game days the drawn shots are limited to; startWin / startView: what it opens on.
export default function ShotPanel({ sel, who = 'He', height = 300, venue = null, opp = null, season: seasonProp = null, seasonSwitch = false, onlyDates = null, startWin = 'last10', startView = 'zones', compact = false, urlKey = null }) {
  // THE SEASON SWITCH (2026-10-10): where the page has no toggle of its own (Shot map tab, Matchups), the panel
  // carries one -- THIS SEASON (the default) / LAST SEASON / BOTH. Pages with a toggle pass `season` instead.
  const [localSeason, setLocalSeason] = useState('this')
  const season = seasonSwitch ? (localSeason === 'this' ? null : localSeason) : seasonProp
  const { data, error, loading } = useLampShots(sel, season)
  // THE FILTERS ARE IN THE ADDRESS when the panel is given a urlKey (the player page's own map): shots.res= / .type= / .str= / .per= / .hard= / .win=
  // (lib/useHashFilters), so a shared link or a refresh reopens the same map. Without a urlKey it is plain local state.
  const [fs, setF] = useHashFilters(urlKey, { win: onlyDates ? 'all' : startWin, res: 'ALL', type: 'ALL', str: 'ALL', per: 'ALL', hard: '' })
  const { win, res, type, str, per } = fs
  const hardOnly = fs.hard === '1'
  const setWin = (v) => setF('win', v)
  const setRes = (v) => setF('res', v)
  const setType = (v) => setF('type', v)
  const setStr = (v) => setF('str', v)
  const setPer = (v) => setF('per', v)
  const setHardOnly = (v) => setF('hard', (typeof v === 'function' ? v(hardOnly) : v) ? '1' : '')
  const [picked, setPicked] = useState(null)
  const [help, setHelp] = useState(false)
  const [view, setView] = useState(startView)
  useEffect(() => { setView(startView) }, [startView])   // the VS control flips this panel in place, never remounts it   // DOTS / HEAT, held here so the legend reads what is drawn
  const [arena, setArena] = useState(false)  // 2D (false) or 3D (true), one chart in one place
  const [gl, setGl] = useState(false)
  useEffect(() => { setGl(webglOk()) }, [])
  const m0 = data?.[onlyDates ? 'all' : win] || data?.last10 || data?.all   // an older cached answer has no last5
  const m = useMemo(() => (m0 && onlyDates ? restrictTo(m0, onlyDates, data.gridSpec) : m0), [m0, onlyDates, data?.gridSpec])
  const recent = m?.recent || []
  // NHL EDGE shot speed for this map's season (lib/nhl/shotSpeed.js): his
  // average + top, and his ten hardest matched to the drawn shots
  const { data: sp } = useLampShotSpeed(sel, data?.season)
  const speed = sp?.speed || null
  const hardest = useMemo(() => hardestIndex(speed), [speed])
  const hardN = useMemo(() => recent.filter((sh) => measuredMph(hardest, sh) != null).length, [recent, hardest])
  // SHOOTER vs GOALIE (1h): the map season's goalies; the busiest one from
  // another club by default (tonight's starter isn't published -- the feed
  // carries none), a picker to change it. Hidden until the SQL answers.
  const shooterView = !sel?.against
  const { data: gList } = useLampGoalies(data?.season, shooterView)
  const goalies = gList?.goalies || []
  const [goalieId, setGoalieId] = useState('')
  // TONIGHT'S NET FIRST (2026-10-03, Donovan: goalie vs player / team should
  // start where it matters): with tonight's opponent known (`opp`), his club's
  // busiest goalie by shots faced -- the likeliest starter, since the league
  // publishes no starter ahead of time; else the busiest from another club.
  const oppGoalie = opp ? goalies.find((g) => g.team === opp) || null : null
  const defaultGoalie = oppGoalie || goalies.find((g) => g.team && g.team !== (sel?.team || '')) || goalies[0] || null
  const gId = goalieId || defaultGoalie?.id || ''
  const goalie = goalies.find((g) => g.id === gId) || null
  const { data: gz } = useLampGoalieZones(shooterView ? gId : null, data?.season)
  const goalieRead = useMemo(() => (gz?.available ? goalieZoneRead(gz.goalie, gz.league) : null), [gz])
  const pass = (sh, skip) => (skip === 'hard' || !hardOnly || measuredMph(hardest, sh) != null)
    && (skip === 'res' || res === 'ALL' || sh[2] === res)
    && (skip === 'type' || type === 'ALL' || sh[3] === type)
    && (skip === 'str' || str === 'ALL' || sh[4] === str)
    && (skip === 'per' || per === 'ALL' || perOf(sh) === per)
  const shots = useMemo(() => recent.filter((sh) => pass(sh)), [recent, res, type, str, per, hardOnly, hardest]) // eslint-disable-line react-hooks/exhaustive-deps
  // Each chip counts the shots the OTHER filters leave, so a count never promises more than a tap gives.
  const countIn = (skip, test) => recent.filter((sh) => pass(sh, skip) && test(sh)).length
  const types = useMemo(() => {
    const t = {}; for (const sh of recent) if (sh[3]) t[sh[3]] = (t[sh[3]] || 0) + 1
    return Object.entries(t).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k]) => k)
  }, [recent])
  const zoneItems = ZONES.map((z) => {
    const inZ = shots.filter(z.test)
    const g = inZ.filter((sh) => sh[2] === 'goal').length
    return { key: z.key, label: z.label, g, n: inZ.length, total: shots.length, pct: shots.length ? (100 * inZ.length) / shots.length : 0,
      text: `${inZ.length}${g ? ` · ${g}G` : ''}`, def: z.def }
  })
  const filtered = res !== 'ALL' || type !== 'ALL' || str !== 'ALL' || per !== 'ALL' || hardOnly
  const clearAll = () => { setF('res', 'ALL'); setF('type', 'ALL'); setF('str', 'ALL'); setF('per', 'ALL'); setF('hard', ''); setPicked(null) }
  // THE NUMBERS ON SCREEN (1c): one line off the filtered list, the same in the
  // 3D dock; EDGE's average / top when it has him
  const stats = [
    ...shotLine(shots, data?.league, { resultOn: res !== 'ALL' }),
    ...(speed ? [{ k: 'AVG SHOT', v: speed.avg, sub: `mph · lg ${speed.leagueAvg}`, title: `His average shot speed (league ${speed.leagueAvg} mph)` },
      { k: 'TOP', v: speed.top, sub: 'mph', title: `His hardest shot this season (league ${speed.topLeague} mph)` }] : []),
  ].map((x) => (x.goal ? { ...x, tone: C.lamp } : x))
  const slotStat = stats.find((x) => x.k === 'SLOT')
  // the 3D dock's chips: what is on, each with its own clear
  const LBL = (rows, k) => (rows.find(([kk]) => kk === k) || [])[1] || k
  const dockChips = [
    ...(res !== 'ALL' ? [['res', LBL(RES, res), () => setRes('ALL')]] : []),
    ...(type !== 'ALL' ? [['type', type, () => setType('ALL')]] : []),
    ...(str !== 'ALL' ? [['str', LBL(STR, str), () => setStr('ALL')]] : []),
    ...(per !== 'ALL' ? [['per', LBL(PER, per), () => setPer('ALL')]] : []),
    ...(hardOnly ? [['hard', '⚡ HARDEST 10', () => setHardOnly(false)]] : []),
  ]
  const chipProps = { theme: C, numFont: NUM_FONT }
  // the one line over the chart: the window, the shots, the goals, and the slot's share of them
  const goalsShown = shots.filter((sh) => sh[2] === 'goal').length
  const slotZ = zoneItems.find((z) => z.key === 'slot')
  const winWords = onlyDates ? 'In these games' : win === 'last5' ? 'Last 5 games' : win === 'last10' ? 'Last 10 games' : 'The season'
  const summary = `${winWords}: ${shots.length} ${filtered ? 'shots in view' : 'shots'}, ${goalsShown} ${goalsShown === 1 ? 'goal' : 'goals'}${slotZ && shots.length ? `. ${Math.round(slotZ.pct)}% came from the slot.` : '.'}`
  const viewToggle = gl ? (
    <div role="group" aria-label="Chart view" style={{ display: 'inline-flex', gap: 6 }}>
      {[['2D', false], ['3D', true]].map(([label, on]) => (
        <button key={label} type="button" aria-pressed={arena === on} onClick={() => setArena(on)}
          title={on ? 'The same shots, in the arena, in 3D' : 'The flat rink'}
          style={{ ...viewBtn(arena === on, C.ice, C, NUM_FONT), font: `800 12px/1 ${NUM_FONT}`, minWidth: 52, minHeight: 44 }}>{label}</button>
      ))}
    </div>
  ) : null
  const mk = (node, label, key) => ({ key, mark: node, label })
  const legendNode = view === 'goalie' || view === 'vs' || view === 'heat' ? null : (
    <ChartLegend theme={C} style={{ fontSize: 12, gap: '6px 16px', color: C.text2 }} items={view === 'zones'
      ? [mk(<i aria-hidden="true" style={{ width: 16, height: 12, borderRadius: 3, background: `linear-gradient(90deg, ${alpha(C.ice, 0.25)}, ${alpha(C.ice, 0.95)})` }} />, 'brighter = more of the shots', 'z'),
        mk(<svg aria-hidden="true" width="16" height="16" viewBox="-4 -4 8 8"><circle r="3.6" fill={C.lamp} stroke={C.text} strokeWidth="0.7" /></svg>, 'goal', 'g')]
      : [mk(<svg aria-hidden="true" width="16" height="16" viewBox="-4 -4 8 8"><circle r="3.6" fill={C.lamp} stroke={C.text} strokeWidth="0.7" /></svg>, 'goal', 'g'),
        mk(<svg aria-hidden="true" width="16" height="16" viewBox="-4 -4 8 8"><circle r="2.2" fill={C.ice} /></svg>, 'on net', 's'),
        mk(<svg aria-hidden="true" width="16" height="16" viewBox="-4 -4 8 8"><circle r="2.2" fill="none" stroke={RD.miss} strokeWidth="0.9" /></svg>, 'missed', 'm'),
        mk(<svg aria-hidden="true" width="16" height="16" viewBox="-4 -4 8 8"><path d="M-2,-2 L2,2 M2,-2 L-2,2" stroke={RD.block} strokeWidth="1.1" strokeLinecap="round" /></svg>, 'blocked', 'b'),
        ...(hardN ? [mk(<svg aria-hidden="true" width="16" height="16" viewBox="-4 -4 8 8"><circle r="3.4" fill="none" stroke={C.text} strokeWidth="0.7" /></svg>, 'one of his 10 hardest', 'h')] : [])]} />
  )
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <DelayedBanner error={error} what="the shot map" />
      {loading && !data ? <ChartEmpty theme={C}>Loading the shot map…</ChartEmpty> : null}
      {data && !data.season ? (
        <ChartEmpty theme={C}>
          No regular-season shots for {sel?.team || sel?.against ? 'this club' : 'him'} in {season === 'last' ? 'last season' : season === 'both' ? 'these seasons' : 'this season'} yet. The map fills in after every game.
        </ChartEmpty>
      ) : null}
      {data?.season && m ? (
        <>
          {/* THE ONE-LINE SUMMARY, above the chart (2026-10-07: the chart leads the tab, not five rows of chips) */}
          {recent.length > 0 && (
            <div style={{ fontSize: 16, fontWeight: 800, color: C.text, lineHeight: 1.35 }}>
              {summary}
            </div>
          )}
          {view === 'goalie' && goalieRead && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {(sel?.name || goalie) && <div style={{ fontSize: 15, fontWeight: 800, color: C.text, lineHeight: 1.3 }}>{sel?.name || (who === 'He' ? 'He' : 'They')} <span style={{ color: C.ice, fontFamily: NUM_FONT, letterSpacing: '.1em', fontSize: 12 }}>VS</span> {goalie?.name || 'a goalie'}{goalie?.team ? <span style={{ color: C.text3, fontWeight: 600, fontSize: 13 }}> · {goalie.team}</span> : null}</div>}
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: C.text3, fontFamily: NUM_FONT }}>
                <span>GOALIE</span>
                <select value={gId} onChange={(e) => { setGoalieId(e.target.value); setPicked(null) }}
                  style={{ minHeight: 44, background: C.bg2, color: C.text, border: `1px solid ${C.border2}`, borderRadius: 8, padding: '0 8px', font: `700 13px/1 ${NUM_FONT}`, maxWidth: '100%' }}>
                  {goalies.slice(0, 80).map((g) => <option key={g.id} value={g.id}>{g.name} · {g.team} · {g.sa} SA</option>)}
                </select>
              </label>
              <div style={{ fontSize: 13, color: C.text, lineHeight: 1.45 }}>
                {overlapSentence(goalieRead, shots, goalie?.name || 'The goalie', sel?.name || sel?.team || 'He', who === 'He' && !sel?.team ? 'his' : 'their')}
              </div>
              <div style={{ fontSize: 11, color: gz?.leagueFallback ? C.amber : C.text3, fontFamily: NUM_FONT, lineHeight: 1.4 }}>
                {goalie?.name || 'The goalie'}: {data.seasonLabel} · {gz?.goalie?.games ?? 0} {gz?.goalie?.games === 1 ? 'game' : 'games'}{(gz?.goalie?.games ?? 0) < 10 ? ' (small sample)' : ''} · league rates from {gz?.leagueSeason ? `${String(gz.leagueSeason).slice(0, 4)}-${String(gz.leagueSeason).slice(6)}` : data.seasonLabel}{gz?.leagueFallback ? ' (last season: the league is early this year)' : ''}
              </div>
            </div>
          )}
          {filtered && !shots.length && <ChartEmpty theme={C}>{res !== 'ALL' && type === 'ALL' && str === 'ALL' && per === 'ALL' && !hardOnly
            ? `No ${LBL(RES, res).toLowerCase()} in ${who === 'He' ? 'his' : 'their'} ${recent.length ? `last ${recent.length} shots here` : 'shots here'}.`
            : `None of ${who === 'He' ? 'his' : 'their'} last ${recent.length} attempts match every filter at once.`}</ChartEmpty>}
          {/* MOONSHOT'S SPRAY CHART LAYOUT (2026-09-30, Donovan: "shot map I
              already told you I want basically like the spray chart"). The
              chart and its readout share one framed panel (SprayField's
              .spray-wrap): the rink on the left; on the right the readout in a
              fixed place (tapping a dot never moves the page), the zone lanes
              as SprayField's lane bars (share + goals, like LF/CF/RF + HR),
              the colour key in one line, the numbers, and the fine print
              behind "how to read this". */}
          {/* 2D / 3D, ONE CHART (2026-10-03, Donovan: "if you wanna toggle over
              to 3-D it's as simple as pressing a button"): the same filtered
              shots drawn flat or in the building, in the same place; the
              readout and its tap-a-shot card stay under either. */}
          {arena && gl && (
            <RinkArena shots={view === 'zones' || view === 'dots' || view === 'goalie' ? shots : NO_SHOTS} goalieRead={view === 'goalie' ? goalieRead : null} onPickZone={(z) => setPicked({ zone: z })} map={m} league={data.league} slot={data.slot} gridSpec={data.gridSpec} view={view === 'zones' ? 'dots' : view}
              speed={speed} hardest={hardest} stats={stats} dockChips={dockChips} onClearAll={clearAll} totalShots={recent.length} slotPct={slotStat?.v ? parseInt(slotStat.v, 10) : null}
              title={sel?.name || sel?.team || sel?.against || ''} subtitle={`${shots.length} of the last ${recent.length} attempts`} venue={venue}
              onPick={(sh) => setPicked(sh)} onPickCell={(cell) => setPicked({ cell })} />
          )}
          {/* 2D / 3D, one chart (2026-10-03): the flat rink and the arena share the chart's place; the toggle rides with the view buttons */}
          {arena && gl && viewToggle}
          <ChartCard theme={C}>
            <div style={{ flex: '1 1 300px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {!(arena && gl) && <Rink map={m} slot={data.slot} gridSpec={data.gridSpec} height={height} shots={shots} view={view} onView={setView} league={data.league} zones={zoneItems} extraView={viewToggle}
              speed={speed} hardest={hardest} slotPct={slotStat?.v ? parseInt(slotStat.v, 10) : null}
              goalieRead={goalieRead} pickedZone={picked?.zone || null} onPickZone={(z) => setPicked({ zone: z })}
              onPick={(sh) => setPicked(sh === picked ? null : sh)} picked={picked}
              onPickCell={(cell) => setPicked({ cell })} />}
            {/* THE LEGEND, directly under the rink: four marks, told apart by shape and by brightness */}
            {!(arena && gl) && legendNode}
            </div>
            <div style={{ flex: '1 1 180px', minWidth: 180 }}>
              <div aria-live="polite" style={{ minHeight: 54, fontFamily: NUM_FONT, fontSize: 10.5, lineHeight: 1.7, color: C.text2 }}>
                {!picked ? (
                  <div style={{ fontSize: 10, color: C.text3, lineHeight: 1.6 }}>
                    Tap a shot for its result, type, distance and moment{m?.grid ? ' · on HEAT, tap a zone' : ''}.
                    {' '}Showing <b style={{ color: C.text2 }}>{shots.length}</b> of the last {recent.length} attempts.
                  </div>
                ) : picked.zone && goalieRead ? (() => {
                  const r = goalieRead[picked.zone]
                  const sv = r.sa ? 1 - r.ga / r.sa : null
                  const types = Object.entries(r.types || {}).sort((a, b) => b[1].sa - a[1].sa).slice(0, 3)
                  return <>
                    <div style={{ color: C.text, fontWeight: 800, fontSize: 11 }}>{(ZONE_LABEL[picked.zone] || picked.zone).toUpperCase()} · {goalie?.name}</div>
                    {r.thin ? <div>Thin: {r.sa} shot{r.sa === 1 ? '' : 's'} on goal from here — too few to colour.</div> : <>
                      <div>{r.sa - r.ga} saves · <b style={{ color: C.lamp }}>{r.ga} goals</b> on {r.sa} shots · SV% <b style={{ color: C.text }}>{sv.toFixed(3).replace(/^0/, '')}</b> (league {(1 - r.lg).toFixed(3).replace(/^0/, '')})</div>
                      {types.length > 0 && <div style={{ color: C.text3 }}>{types.map(([k, t], i) => <span key={k}>{i ? ' · ' : ''}{k} {t.sa}{t.ga ? ` (${t.ga}G)` : ''}</span>)}</div>}
                    </>}
                  </>
                })() : picked.cell?.vs ? <><b style={{ color: C.text }}>{Math.round(picked.cell.vs.mine * 100)}%</b> of {who === 'He' ? 'his' : 'their'} attempts are in that zone · the league <b style={{ color: C.text }}>{Math.round(picked.cell.vs.lg * 100)}%</b> · {picked.cell.att} attempts, {picked.cell.g} goal{picked.cell.g === 1 ? '' : 's'}</>
                : picked.cell ? <>{picked.cell.att} attempts in that zone · {picked.cell.sog} on net · <b style={{ color: C.lamp }}>{picked.cell.g} goal{picked.cell.g === 1 ? '' : 's'}</b>{picked.cell.xg != null ? <> · xG <b style={{ color: C.ice }}>{picked.cell.xg.toFixed(1)}</b></> : null}</>
                  : <>
                    <div style={{ color: picked[2] === 'goal' ? C.lamp : C.text, fontWeight: 800, fontSize: 11 }}>{(RES_WORD[picked[2]] || picked[2] || '').toUpperCase()}</div>
                    <div>{picked[3] ? `${picked[3]} · ` : ''}{distOf(picked)} ft{picked[4] ? ` · ${picked[4].toUpperCase()}` : ''}</div>
                    <div style={{ color: C.text3 }}>
                      {picked[5] != null ? `${perOf(picked) === 'OT' ? 'OT' : `P${picked[5]}`} ${clock(picked[7])}` : ''}
                      {picked[8] ? ` · ${picked[8]}` : ''}
                      {picked[9] ? ` · ${picked[9].replace(/-/g, ' ')}` : ''}
                    </div>
                    {/* the speed, only what is measured (1g) */}
                    <div style={{ color: C.text3, fontSize: 10 }}>
                      {measuredMph(hardest, picked) != null
                        ? <><b style={{ color: C.ice }}>{measuredMph(hardest, picked)} MPH</b>, measured · one of his ten hardest</>
                        : speed ? <>HIS AVG SHOT {speed.avg} MPH (league {speed.leagueAvg}) — not this shot&apos;s speed</>
                          : 'No shot speed on file for him — the replay runs at a fixed pace.'}
                    </div>
                  </>}
              </div>
              {/* VS GOALIE: the goalie's named zones -- his share of the shots there (the bar), the
                  goalie's rate vs the league's, MATCH where both line up (lib/nhl/zones matchZones) */}
              {view === 'goalie' && goalieRead && shots.length > 0 && (
                <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }} aria-label="Where the shooter and the goalie match">
                  {matchZones(goalieRead, shots).filter((z) => z.n && (!compact || z.match || z.share >= 0.1)).map((z) => {
                    const pct = Math.round(z.share * 100)
                    return (
                      <button key={z.key} type="button" onClick={() => setPicked({ zone: z.key })} title={`${z.label}: ${z.n} of ${who === 'He' ? 'his' : 'their'} ${shots.length} shots${z.r.thin ? '; the goalie is thin here' : `; ${goalie?.name} lets in ${(z.r.rate * 100).toFixed(1)}% (league ${(z.r.lg * 100).toFixed(1)}%)`}`}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', color: 'inherit' }}>
                        <span style={{ width: 70, color: z.match ? C.lamp : C.text3, fontFamily: NUM_FONT, fontWeight: z.match ? 800 : 400 }}>{z.label}</span>
                        <div style={{ flex: 1, height: 11, background: C.bg3, borderRadius: 2, outline: z.match ? `1px dashed ${C.lamp}` : 'none', outlineOffset: 1 }}>
                          <div style={{ width: `${Math.max(2, pct)}%`, height: '100%', background: alpha(C.ice, 0.75), borderRadius: 2 }} />
                        </div>
                        <span style={{ fontFamily: NUM_FONT, color: C.text2, minWidth: 96, textAlign: 'right' }}>
                          {pct}% <span style={{ color: z.r.thin ? C.text3 : z.r.tint === 'worse' ? C.lamp : z.r.tint === 'better' ? RINK.blue : C.text3 }}>{z.r.thin ? 'thin' : `${(z.r.rate * 100).toFixed(1)}%`}</span>
                          {z.match ? <b style={{ color: C.lamp }}> MATCH</b> : null}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
              {/* ONE LEGEND, FROM WHAT IS DRAWN (BATCH-2D-CORE flag 2): the
                  two hand-written keys (under the rink and here) became this. */}
              <ChartLegend theme={C} style={{ marginTop: 8 }} items={view === 'goalie' && goalieRead
                ? [{ key: 'worse', mark: <i aria-hidden="true" style={{ width: 10, height: 8, borderRadius: 2, background: `${C.lamp}aa` }} />, label: `${goalie?.name || 'the goalie'} lets in more than the league` },
                  { key: 'better', mark: <i aria-hidden="true" style={{ width: 10, height: 8, borderRadius: 2, background: `${RINK.blue}aa` }} />, label: 'fewer' },
                  { key: 'thin', mark: <i aria-hidden="true" style={{ width: 10, height: 8, borderRadius: 2, border: `1px solid ${C.border2}` }} />, label: 'thin' },
                  { key: 'match', mark: <i aria-hidden="true" style={{ width: 10, height: 8, borderRadius: 2, border: `1.5px dashed ${C.lamp}` }} />, label: `MATCH = he's weak there and ${who === 'He' ? 'he takes' : 'they take'} ${Math.round(MATCH_SHARE * 100)}%+ of the shots from it` },
                  { key: 'bar', mark: <i aria-hidden="true" style={{ width: 10, height: 8, borderRadius: 2, background: alpha(C.ice, 0.75) }} />, label: `bar = ${who === 'He' ? 'his' : 'their'} share of the shots` }]
                : view === 'vs'
                ? [{ key: 'more', mark: <i aria-hidden="true" style={{ width: 10, height: 8, borderRadius: 2, background: `${C.lamp}aa` }} />, label: `more of ${who === 'He' ? 'his' : 'their'} attempts here than the league's (points)` },
                  { key: 'less', mark: <i aria-hidden="true" style={{ width: 10, height: 8, borderRadius: 2, background: `${C.ice}aa` }} />, label: 'fewer' },
                  { key: 'blank', mark: <i aria-hidden="true" style={{ width: 10, height: 8, borderRadius: 2, border: `1px solid ${C.border2}` }} />, label: `blank = under ${VS_MIN} attempts` }]
                : view === 'heat'
                ? [{ key: 'heat', mark: <i aria-hidden="true" style={{ width: 10, height: 8, borderRadius: 2, background: `${C.ice}88` }} />, label: 'shooting % per zone · shots under it' },
                  { key: 'arcs', mark: <b aria-hidden="true">◌</b>, label: '20 / 40 / 60 ft from the net' }]
                : []} />
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 8, fontFamily: NUM_FONT }}>
                {[
                  ['slot share', pct(m.slotShare), C.ice],
                  ...(data.league?.slotShare != null ? [[leagueStamp(data.league, data), pct(data.league.slotShare), C.text2]] : []),
                  ['attempts', m.attempts, C.text],
                  ['on net', m.sog, C.text],
                  ['goals', m.goals, C.lamp],
                  ...(m.xg ? [['xG', m.xg.total.toFixed(1), C.ice]] : []),
                  ['missed', m.misses, C.text2],
                  ['blocked', m.blocked, C.text2],
                  ['on the PP', m.byStrength?.pp || 0, C.text2],
                ].map(([k, v, tone]) => (
                  <span key={k} style={{ fontSize: 12, color: C.text2 }}><b style={{ color: tone, fontSize: 14, fontWeight: 900 }}>{v}</b> {k}</span>
                ))}
              </div>
              {/* components/charts/HowToRead (2D TOP TIER 1): SprayField's panel,
                  shared; size 12 for the phone rule */}
              <HowToRead theme={C} numFont={NUM_FONT} open={help} onToggle={setHelp} size={12}>
                <div style={{ marginBottom: 6 }}>
                  {sel?.against
                    ? <>Slot share: opponents&apos; shots on net from the slot as a share of every shot on net against them.</>
                    : <>Slot share: {who === 'He' ? 'his' : 'their'} shots on net from the slot as a share of all {who === 'He' ? 'his' : 'their'} shots on net.</>}
                  {' '}The dots are the last {recent.length} attempts; the numbers are the whole {win === 'all' ? 'season' : 'last ten games'}.
                </div>
                <div style={{ marginBottom: 6 }}>
                  Every attempt is turned to attack the same net (the right-hand one), so the ends a team switches between periods read as one. Positions are in feet: goal line at 89, blue line at 25. The filter chips cut the dots, the zone bars and the arena together.
                </div>
                <div style={{ marginBottom: 6 }}>
                  {ZONES.map((z, i) => <span key={z.key}>{i ? ' · ' : ''}<b style={{ color: C.text2 }}>{z.label}</b> {z.def}</span>)}.
                </div>
                {m.xg && <div style={{ marginBottom: 6 }}>
                  xG ({m.xg.version}): each shot on net is scored from where it was taken, its type and the strength, by a model fitted on 2025-26 games before February and tested on the games after; the number is those scores added up over {m.xg.sog} shots on net ({m.xg.goals} {m.xg.goals === 1 ? 'was a goal' : 'were goals'}). Tap a zone for its share. Empty-net shots are left out, and a rebound or a rush is not known to it.
                </div>}
                {goalieRead && <div style={{ marginBottom: 6 }}>
                  VS GOALIE: the goalie&apos;s {data.seasonLabel} regular season under {who === 'He' ? 'his' : 'their'} pucks. Each named zone is shaded by the goals he let in per shot on goal from there against the league&apos;s rate from the same zone: red, he lets in more; blue, fewer; no tint, within 1.5 points of the league; hatched, under 15 shots (thin). Tonight&apos;s starter isn&apos;t published by the league, so {opp ? <>tonight&apos;s opponent&apos;s busiest goalie ({opp}) opens</> : 'the busiest goalie from another club opens'} and the picker changes it. Where in the net a shot went (glove, blocker, five-hole) isn&apos;t in the public feed, so no net map is drawn.
                </div>}
                <div>
                  HEAT splits the attacking end into a 5 × 5 grid and colours each zone by {who === 'He' ? 'his' : 'their'} shooting percentage from it (goals per shot on goal; full colour at {Math.round(HEAT_FULL * 100)}%), with the shots taken from there under it; a zone with fewer than {HEAT_MIN_SOG} shots on goal shows its count only.
                  {data.league ? <> VS LEAGUE puts the same grid against every regular-season attempt in the league in {data.league.seasonLabel || 'that season'} ({data.league.attempts.toLocaleString()} of them){data.league.fallback ? ` -- last season's, because the league has under ${LEAGUE_MIN_GAMES} games of ${data.league.wantedLabel} so far` : ''}: each zone&apos;s number is {who === 'He' ? 'his' : 'their'} share there minus the league&apos;s, in points, from {win === 'all' ? 'the season' : win === 'last5' ? 'the last five games' : 'the last ten games'} against the league&apos;s season; under {VS_MIN} attempts a zone is left blank, and the colour is full at {Math.round(VS_FULL * 100)} points. The league&apos;s slot share is cut the same way as {who === 'He' ? 'his' : 'theirs'}.</> : null} 3D draws the same shots in the arena; its lines run from the shot to the net along the ice and are not tracked puck paths.
                </div>
              </HowToRead>
            </div>
          </ChartCard>
          {/* THE CONTROLS, under the chart: the window and the result stay in sight (44px), type / strength /
              period / hardest sit behind MORE */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              {!onlyDates && <Pills tall ariaLabel="Shot window" value={win} onChange={setWin} options={WINDOWS} />}
              {seasonSwitch && <Pills tall ariaLabel="Shot map season" value={localSeason} onChange={setLocalSeason} options={SEASONS} />}
              <span data-shot-season={data.season} style={{ color: data.fallback ? C.amber : C.text2, font: `800 11px/1.3 ${NUM_FONT}`, letterSpacing: '.06em' }}>{stampLine(data, m)}</span>
            </div>
            {recent.length > 0 && recent[0].length > 3 && (
              <FiltersSheet onReset={() => { clearAll() }} groups={[
                { key: 'res', label: 'Show', value: res, defaultValue: 'ALL', onChange: (k) => { setRes(k); setPicked(null) },
                  options: RES.map(([k, label]) => ({ value: k, label, n: k === 'ALL' ? null : countIn('res', (sh) => sh[2] === k), title: k === 'ALL' ? 'Every drawn attempt' : `Only ${label.toLowerCase()} attempts` })) },
                { key: 'type', label: 'Type', value: type, defaultValue: 'ALL', onChange: (k) => { setType(k); setPicked(null) },
                  options: [['ALL', 'All'], ...types.map((t) => [t, t])].map(([k, label]) => ({ value: k, label, n: k === 'ALL' ? null : countIn('type', (sh) => sh[3] === k), title: k === 'ALL' ? 'Every shot type' : `Only ${label} shots (a block has no type)` })) },
                { key: 'str', label: 'Strength', value: str, defaultValue: 'ALL', onChange: (k) => { setStr(k); setPicked(null) },
                  options: STR.map(([k, label]) => ({ value: k, label, n: k === 'ALL' ? null : countIn('str', (sh) => sh[4] === k), title: k === 'ALL' ? 'Every strength' : `Only ${label === 'PP' ? 'power-play' : label === 'SH' ? 'shorthanded' : 'even-strength'} attempts` })) },
                { key: 'per', label: 'Period', value: per, defaultValue: 'ALL', onChange: (k) => { setPer(k); setPicked(null) },
                  options: PER.map(([k, label]) => ({ value: k, label, n: k === 'ALL' ? null : countIn('per', (sh) => perOf(sh) === k), title: k === 'ALL' ? 'Every period' : `Only the ${label} ${k === 'OT' ? '(overtime)' : 'period'}` })) },
                ...(hardN > 0 ? [{ key: 'hard', label: 'Shot speed', value: hardOnly ? '1' : '', defaultValue: '', onChange: (k) => { setHardOnly(Boolean(k)); setPicked(null) },
                  options: [{ value: '', label: 'All' }, { value: '1', label: '⚡ Hardest 10', n: hardN, title: `His ten hardest shots this season (measured) -- ${hardN} of them are on this map` }] }] : []),
              ]} />
            )}
          </div>
          <StatStrip stats={stats} theme={C} numFont={NUM_FONT} label="The shown shots, in numbers" />
          {!onlyDates && !compact && <FactLines theme={C} lines={depthLines(m, who, Boolean(sel?.against))} />}
        </>
      ) : null}
    </div>
  )
}
