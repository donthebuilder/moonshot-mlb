'use client'
import { useEffect, useMemo, useState } from 'react'
import Rink, { VS_MIN, VS_FULL } from './Rink'
import HowToRead from '../charts/HowToRead'
import dynamic from 'next/dynamic'
import { webglOk } from '../../lib/webglOk'
// 🏟 the arena rides in on demand -- three.js is ~600KB (BATCH-NHL-3D)
const RinkArena = dynamic(() => import('./RinkArena'), { ssr: false })
const NO_SHOTS = []   // one empty list, so the HEAT arena isn't rebuilt every render
import { C, NUM_FONT, RINK } from '../../lib/nhl/theme'
import { useLampShots, useLampShotSpeed, useLampGoalies, useLampGoalieZones } from '../../lib/nhl/useLamp'
import { goalieZoneRead, overlapSentence, matchZones, MATCH_SHARE, ZONE_LABEL } from '../../lib/nhl/zones'
import { shotLine } from '../../lib/nhl/shotStats'
import { hardestIndex, measuredMph } from '../../lib/nhl/shotPath'
import { DelayedBanner, Loading, Pills } from './ui'
import { FactLines } from '../matchup/MatchupParts'
import { chipColor } from '../Heatmap'
import { ChipGroup, ChartCard, ChartLegend, ChartEmpty, StatStrip, viewBtn } from '../charts'

// 🏒 WHERE HE SHOOTS FROM (lamp research step 3). The rink plus the numbers
// it is drawn from, for one player or one club: season or last 10 games,
// attempts / on net / goals, and the slot share with the slot defined in
// words beside it. A player with no shots on file gets a sentence, not an
// empty rink. Data: /api/lamp/shots (aggregates, cached a day).
const WINDOWS = [{ key: 'all', text: 'SEASON' }, { key: 'last10', text: 'LAST 10' }]
const pct = (v) => (v == null ? '—' : `${Math.round(v * 100)}%`)
const share = (n, d) => `${Math.round((100 * n) / d)}%`

// SHOT DEPTH (2026-09-28): what the archive already knows past the rink --
// the shot types (unblocked attempts; a block has no type), how far out the
// shots on net and the goals come from, and, once the archive keeps it, why
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
const RES = [['ALL', 'All'], ['goal', 'Goal'], ['sog', 'On net'], ['miss', 'Miss'], ['block', 'Blocked']]
const STR = [['ALL', 'All'], ['ev', 'Even'], ['pp', 'PP'], ['sh', 'SH']]
const PER = [['ALL', 'All'], ['1', '1st'], ['2', '2nd'], ['3', '3rd'], ['OT', 'OT']]
const perOf = (sh) => (sh[6] && sh[6] !== 'REG' ? 'OT' : sh[5] != null ? String(sh[5]) : null)
const NET_X = 89
const distOf = (sh) => Math.round(Math.hypot(NET_X - sh[0], sh[1]))
// Zones, in the league's feet after every shot is turned to attack the right-hand net.
const ZONES = [
  { key: 'slot', label: 'Slot', def: 'between the faceoff dots and the goal line', test: ([x, y]) => x >= 69 && x <= 89 && Math.abs(y) <= 22 },
  { key: 'high', label: 'High slot', def: 'the middle, from the top of the circles to the dots', test: ([x, y]) => x >= 54 && x < 69 && Math.abs(y) <= 22 },
  { key: 'circles', label: 'Circles', def: 'outside the dots, either side', test: ([x, y]) => x >= 54 && x <= 89 && Math.abs(y) > 22 },
  { key: 'point', label: 'Point', def: 'the blue line to the top of the circles', test: ([x]) => x < 54 },
  { key: 'below', label: 'Below', def: 'behind the goal line', test: ([x]) => x > 89 },
]
const clock = (t) => (t == null ? '' : `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`)
const RES_WORD = { goal: 'Goal', sog: 'On net, saved', miss: 'Missed the net', block: 'Blocked' }

export default function ShotPanel({ sel, who = 'He', height = 300 }) {
  const { data, error, loading } = useLampShots(sel)
  const [win, setWin] = useState('all')
  const [res, setRes] = useState('ALL')
  const [type, setType] = useState('ALL')
  const [str, setStr] = useState('ALL')
  const [per, setPer] = useState('ALL')
  const [picked, setPicked] = useState(null)
  const [help, setHelp] = useState(false)
  const [view, setView] = useState('dots')   // DOTS / HEAT, held here so the legend reads what is drawn
  const [arena, setArena] = useState(false)  // 🏟 the 3D arena, open beside the 2D
  const [gl, setGl] = useState(false)
  const [hardOnly, setHardOnly] = useState(false)   // ⚡ HARDEST 10 (BATCH-3D-V2 1g)
  useEffect(() => { setGl(webglOk()) }, [])
  const m = data?.[win]
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
  const defaultGoalie = goalies.find((g) => g.team && g.team !== (sel?.team || '')) || goalies[0] || null
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
    return { key: z.key, label: z.label, g, pct: shots.length ? (100 * inZ.length) / shots.length : 0,
      text: `${inZ.length}${g ? ` · ${g}G` : ''}`, def: z.def }
  })
  const filtered = res !== 'ALL' || type !== 'ALL' || str !== 'ALL' || per !== 'ALL' || hardOnly
  const clearAll = () => { setRes('ALL'); setType('ALL'); setStr('ALL'); setPer('ALL'); setHardOnly(false); setPicked(null) }
  // THE NUMBERS ON SCREEN (1c): one line off the filtered list, the same in the
  // 3D dock; EDGE's average / top when it has him
  const stats = [
    ...shotLine(shots, data?.league, { resultOn: res !== 'ALL' }),
    ...(speed ? [{ k: 'AVG SHOT', v: speed.avg, sub: `mph · lg ${speed.leagueAvg}`, title: `His average shot speed, NHL EDGE (league ${speed.leagueAvg} mph)` },
      { k: 'TOP', v: speed.top, sub: 'mph', title: `His hardest shot this season, NHL EDGE (league ${speed.topLeague} mph)` }] : []),
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
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <DelayedBanner error={error} what="the shot map" />
      {loading && !data ? <ChartEmpty theme={C}>Loading the shot map…</ChartEmpty> : null}
      {data && !data.season ? (
        <ChartEmpty theme={C}>
          No regular-season shots on file for {sel?.team || sel?.against ? 'this club' : 'him'} yet. The archive holds 2025-26 and fills in after every graded game.
        </ChartEmpty>
      ) : null}
      {data?.season && m ? (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <Pills ariaLabel="Shot window" value={win} onChange={setWin} options={WINDOWS} />
            <span style={{ color: C.text3, font: `800 9px/1 ${NUM_FONT}`, letterSpacing: '.08em' }}>{data.seasonLabel} REGULAR SEASON{data.stale ? ' · LAST SEASON' : ''} · {m.games} GAMES{data.stale && data.currentGames > 0 ? ` · ${data.currentLabel}: ${data.currentGames} OF ${data.minGames} IN` : ''}</span>
          </div>
          {recent.length > 0 && recent[0].length > 3 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <ChipGroup {...chipProps} first label="Result" value={res} onChange={(k) => { setRes(k); setPicked(null) }} color={C.lamp}
                options={RES.map(([k, label]) => ({ k, label, n: countIn('res', (sh) => sh[2] === k), title: k === 'ALL' ? 'Every drawn attempt' : `Only ${label.toLowerCase()} attempts` }))} />
              <ChipGroup {...chipProps} label="Type" value={type} onChange={(k) => { setType(k); setPicked(null) }} color={C.ice}
                options={[['ALL', 'All'], ...types.map((t) => [t, t])].map(([k, label]) => ({ k, label, n: countIn('type', (sh) => sh[3] === k), title: k === 'ALL' ? 'Every shot type' : `Only ${label} shots (a block has no type)` }))} />
              <ChipGroup {...chipProps} label="Strength" value={str} onChange={(k) => { setStr(k); setPicked(null) }} color={C.teal || C.ice}
                options={STR.map(([k, label]) => ({ k, label, n: countIn('str', (sh) => sh[4] === k), title: k === 'ALL' ? 'Every strength' : `Only ${label === 'PP' ? 'power-play' : label === 'SH' ? 'shorthanded' : 'even-strength'} attempts` }))} />
              <ChipGroup {...chipProps} label="Period" value={per} onChange={(k) => { setPer(k); setPicked(null) }} color={C.cream || C.ice}
                options={PER.map(([k, label]) => ({ k, label, n: countIn('per', (sh) => perOf(sh) === k), title: k === 'ALL' ? 'Every period' : `Only the ${label} ${k === 'OT' ? '(overtime)' : 'period'}` }))} />
              {hardN > 0 && (
                <button type="button" onClick={() => { setHardOnly((v) => !v); setPicked(null) }} aria-pressed={hardOnly}
                  title={`His ten hardest shots this season (NHL EDGE, measured) -- ${hardN} of them are on this map`}
                  style={{ minHeight: 32, padding: '0 10px', borderRadius: 999, cursor: 'pointer', font: `800 10px/1 ${NUM_FONT}`,
                    border: `1px solid ${hardOnly ? C.ice : C.border2}`, background: hardOnly ? `${C.ice}1f` : 'transparent', color: hardOnly ? C.ice : C.text2 }}>
                  ⚡ HARDEST 10 <span style={{ color: C.text3 }}>{hardN}</span>
                </button>
              )}
              {filtered && <button type="button" onClick={clearAll}
                style={{ background: 'transparent', border: 'none', color: C.text3, font: `700 10px/1 ${NUM_FONT}`, cursor: 'pointer', textDecoration: 'underline dotted', minHeight: 0 }}>clear</button>}
            </div>
          )}
          {/* THE NUMBERS, ON SCREEN (BATCH-3D-V2 1c): the filtered list's line,
              above the rink so it never disappears when the arena toggles */}
          <StatStrip stats={stats} theme={C} numFont={NUM_FONT} label="The shown shots, in numbers" />
          {view === 'goalie' && goalieRead && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: C.text3, fontFamily: NUM_FONT }}>
                <span>GOALIE</span>
                <select value={gId} onChange={(e) => { setGoalieId(e.target.value); setPicked(null) }}
                  style={{ minHeight: 36, background: C.bg2, color: C.text, border: `1px solid ${C.border2}`, borderRadius: 8, padding: '0 8px', font: `700 13px/1 ${NUM_FONT}`, maxWidth: '100%' }}>
                  {goalies.slice(0, 80).map((g) => <option key={g.id} value={g.id}>{g.name} · {g.team} · {g.sa} SA</option>)}
                </select>
              </label>
              <div style={{ fontSize: 13, color: C.text, lineHeight: 1.45 }}>
                {overlapSentence(goalieRead, shots, goalie?.name || 'The goalie', sel?.name || sel?.team || 'He', who === 'He' && !sel?.team ? 'his' : 'their')}
              </div>
            </div>
          )}
          {filtered && !shots.length && <ChartEmpty theme={C}>None of {who === 'He' ? 'his' : 'their'} last {recent.length} attempts match every filter at once.</ChartEmpty>}
          {/* MOONSHOT'S SPRAY CHART LAYOUT (2026-09-30, Donovan: "shot map I
              already told you I want basically like the spray chart"). The
              chart and its readout share one framed panel (SprayField's
              .spray-wrap): the rink on the left; on the right the readout in a
              fixed place (tapping a dot never moves the page), the zone lanes
              as SprayField's lane bars (share + goals, like LF/CF/RF + HR),
              the colour key in one line, the numbers, and the fine print
              behind "how to read this". */}
          {/* THE ARENA (BATCH-NHL-3D): the same filtered shots, in the building.
              Opens above the card; the 2D rink and its readout stay, so a
              tapped puck fills the same detail card. */}
          {arena && gl && (
            <RinkArena shots={view === 'dots' || view === 'goalie' ? shots : NO_SHOTS} goalieRead={view === 'goalie' ? goalieRead : null} onPickZone={(z) => setPicked({ zone: z })} map={m} league={data.league} slot={data.slot} gridSpec={data.gridSpec} view={view}
              speed={speed} hardest={hardest} stats={stats} dockChips={dockChips} onClearAll={clearAll} totalShots={recent.length} slotPct={slotStat?.v ? parseInt(slotStat.v, 10) : null}
              title={sel?.name || sel?.team || sel?.against || ''} subtitle={`${shots.length} of the last ${recent.length} attempts`}
              onPick={(sh) => setPicked(sh)} onPickCell={(cell) => setPicked({ cell })} />
          )}
          <ChartCard theme={C}>
            <Rink map={m} slot={data.slot} gridSpec={data.gridSpec} height={height} shots={shots} view={view} onView={setView} league={data.league}
              speed={speed} hardest={hardest} slotPct={slotStat?.v ? parseInt(slotStat.v, 10) : null}
              goalieRead={goalieRead} pickedZone={picked?.zone || null} onPickZone={(z) => setPicked({ zone: z })}
              extraView={gl ? (
                <button type="button" onClick={() => setArena((v) => !v)} aria-pressed={arena}
                  title={arena ? 'Close the 3D arena' : 'The same shots, in the arena, in 3D'}
                  style={viewBtn(arena, C.ice, C, NUM_FONT)}>
                  🏟 ARENA
                </button>
              ) : null}
              onPick={(sh) => setPicked(sh === picked ? null : sh)} picked={picked}
              onPickCell={(cell) => setPicked({ cell })} />
            <div style={{ flex: 1, minWidth: 180 }}>
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
                : picked.cell ? <>{picked.cell.att} attempts in that zone · {picked.cell.sog} on net · <b style={{ color: C.lamp }}>{picked.cell.g} goal{picked.cell.g === 1 ? '' : 's'}</b></>
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
                        ? <><b style={{ color: C.ice }}>{measuredMph(hardest, picked)} MPH</b>, measured (NHL EDGE) · one of his ten hardest</>
                        : speed ? <>HIS AVG SHOT {speed.avg} MPH (league {speed.leagueAvg}) — not this shot&apos;s speed</>
                          : 'No shot speed on file for him (NHL EDGE has no row) — the replay runs at a fixed pace.'}
                    </div>
                  </>}
              </div>
              {/* VS GOALIE: the goalie's named zones -- his share of the shots there (the bar), the
                  goalie's rate vs the league's, MATCH where both line up (lib/nhl/zones matchZones) */}
              {view === 'goalie' && goalieRead && shots.length > 0 && (
                <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }} aria-label="Where the shooter and the goalie match">
                  {matchZones(goalieRead, shots).filter((z) => z.n).map((z) => {
                    const pct = Math.round(z.share * 100)
                    return (
                      <button key={z.key} type="button" onClick={() => setPicked({ zone: z.key })} title={`${z.label}: ${z.n} of ${who === 'He' ? 'his' : 'their'} ${shots.length} shots${z.r.thin ? '; the goalie is thin here' : `; ${goalie?.name} lets in ${(z.r.rate * 100).toFixed(1)}% (league ${(z.r.lg * 100).toFixed(1)}%)`}`}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', color: 'inherit' }}>
                        <span style={{ width: 70, color: z.match ? C.lamp : C.text3, fontFamily: NUM_FONT, fontWeight: z.match ? 800 : 400 }}>{z.label}</span>
                        <div style={{ flex: 1, height: 11, background: C.bg3, borderRadius: 2, outline: z.match ? `1px dashed ${C.lamp}` : 'none', outlineOffset: 1 }}>
                          <div style={{ width: `${Math.max(2, pct)}%`, height: '100%', background: chipColor(pct, 0, 45), borderRadius: 2 }} />
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
              {view !== 'goalie' && shots.length > 0 && recent[0]?.length > 3 && (
                <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {zoneItems.map((z) => (
                    <div key={z.key} title={`${z.label}: ${z.def}`} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10 }}>
                      <span style={{ width: 58, color: C.text3, fontFamily: NUM_FONT }}>{z.label}</span>
                      <div style={{ flex: 1, height: 11, background: C.bg3, borderRadius: 2 }}>
                        <div style={{ width: `${Math.max(2, z.pct)}%`, height: '100%', background: chipColor(z.pct, 0, 45), borderRadius: 2 }} />
                      </div>
                      <span style={{ fontFamily: NUM_FONT, color: C.text2, minWidth: 52, textAlign: 'right' }}>
                        {z.pct.toFixed(0)}%{z.g > 0 && <span style={{ color: C.lamp }}> {z.g}G</span>}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {/* ONE LEGEND, FROM WHAT IS DRAWN (BATCH-2D-CORE flag 2): the
                  two hand-written keys (under the rink and here) became this. */}
              <ChartLegend theme={C} style={{ marginTop: 8 }} items={view === 'goalie' && goalieRead
                ? [{ key: 'worse', mark: <i aria-hidden="true" style={{ width: 10, height: 8, borderRadius: 2, background: `${C.lamp}aa` }} />, label: `${goalie?.name || 'the goalie'} lets in more than the league` },
                  { key: 'better', mark: <i aria-hidden="true" style={{ width: 10, height: 8, borderRadius: 2, background: `${RINK.blue}aa` }} />, label: 'fewer' },
                  { key: 'thin', mark: <i aria-hidden="true" style={{ width: 10, height: 8, borderRadius: 2, border: `1px solid ${C.border2}` }} />, label: 'thin' },
                  { key: 'match', mark: <i aria-hidden="true" style={{ width: 10, height: 8, borderRadius: 2, border: `1.5px dashed ${C.lamp}` }} />, label: `MATCH = he's weak there and ${who === 'He' ? 'he takes' : 'they take'} ${Math.round(MATCH_SHARE * 100)}%+ of the shots from it` },
                  { key: 'bar', mark: <i aria-hidden="true" style={{ width: 10, height: 8, borderRadius: 2, background: chipColor(30, 0, 45) }} />, label: `bar = ${who === 'He' ? 'his' : 'their'} share of the shots` }]
                : view === 'vs'
                ? [{ key: 'more', mark: <i aria-hidden="true" style={{ width: 10, height: 8, borderRadius: 2, background: `${C.lamp}aa` }} />, label: `more of ${who === 'He' ? 'his' : 'their'} attempts here than the league's (points)` },
                  { key: 'less', mark: <i aria-hidden="true" style={{ width: 10, height: 8, borderRadius: 2, background: `${C.ice}aa` }} />, label: 'fewer' },
                  { key: 'blank', mark: <i aria-hidden="true" style={{ width: 10, height: 8, borderRadius: 2, border: `1px solid ${C.border2}` }} />, label: `blank = under ${VS_MIN} attempts` }]
                : view === 'heat'
                ? [{ key: 'heat', mark: <i aria-hidden="true" style={{ width: 10, height: 8, borderRadius: 2, background: `${C.ice}88` }} />, label: 'shaded by attempts per zone' },
                  { key: 'slot', mark: <i aria-hidden="true" style={{ width: 10, height: 8, borderRadius: 1, background: `${C.ice}24` }} />, label: 'the slot' },
                  { key: 'arcs', mark: <b aria-hidden="true">◌</b>, label: '20 / 40 / 60 ft from the net' }]
                : [{ key: 'goal', mark: <b aria-hidden="true" style={{ color: C.lamp }}>●</b>, label: 'goal' },
                  { key: 'sog', mark: <b aria-hidden="true" style={{ color: RINK.puck, WebkitTextStroke: `0.6px ${RINK.puckRim}` }}>●</b>, label: 'on net (saved)' },
                  { key: 'miss', mark: <b aria-hidden="true">✕</b>, label: 'missed' },
                  { key: 'block', mark: <b aria-hidden="true">╱</b>, label: 'blocked' },
                  ...(hardN ? [{ key: 'hard', mark: <b aria-hidden="true" style={{ color: C.ice }}>◎</b>, label: 'one of his 10 hardest (measured)' }] : []),
                  { key: 'slot', mark: <i aria-hidden="true" style={{ width: 10, height: 8, borderRadius: 1, background: `${C.ice}24` }} />, label: 'the slot' },
                  { key: 'arcs', mark: <b aria-hidden="true">◌</b>, label: '20 / 40 / 60 ft from the net' }]} />
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 8, fontFamily: NUM_FONT }}>
                {[
                  ['slot share', pct(m.slotShare), C.ice],
                  ...(data.league?.slotShare != null ? [[`league's ${data.seasonLabel || ''}`.trim(), pct(data.league.slotShare), C.text2]] : []),
                  ['attempts', m.attempts, C.text],
                  ['on net', m.sog, C.text],
                  ['goals', m.goals, C.lamp],
                  ['missed', m.misses, C.text2],
                  ['blocked', m.blocked, C.text2],
                  ['on the PP', m.byStrength?.pp || 0, C.text2],
                ].map(([k, v, tone]) => (
                  <span key={k} style={{ fontSize: 10, color: C.text3 }}><b style={{ color: tone, fontSize: 12.5, fontWeight: 900 }}>{v}</b> {k}</span>
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
                  Every attempt is turned to attack the same net (the right-hand one), so the ends a team switches between periods read as one. Positions are the league feed&apos;s, in feet: goal line at 89, blue line at 25. The filter chips cut the dots, the zone bars and the arena together.
                </div>
                <div style={{ marginBottom: 6 }}>
                  {ZONES.map((z, i) => <span key={z.key}>{i ? ' · ' : ''}<b style={{ color: C.text2 }}>{z.label}</b> {z.def}</span>)}.
                </div>
                {goalieRead && <div style={{ marginBottom: 6 }}>
                  VS GOALIE: the goalie&apos;s {data.seasonLabel} regular season under {who === 'He' ? 'his' : 'their'} pucks. Each named zone is shaded by the goals he let in per shot on goal from there against the league&apos;s rate from the same zone: red, he lets in more; blue, fewer; no tint, within 1.5 points of the league; hatched, under 15 shots (thin). Tonight&apos;s starter isn&apos;t published by the league, so the busiest goalie from another club opens and the picker changes it. Where in the net a shot went (glove, blocker, five-hole) isn&apos;t in the public feed, so no net map is drawn.
                </div>}
                <div>
                  HEAT splits the attacking end into a 5 × 5 grid and shades each zone by its share of the attempts.
                  {data.league ? <> VS LEAGUE puts the same grid against every regular-season attempt in the league that season ({data.league.attempts.toLocaleString()} of them): each zone&apos;s number is {who === 'He' ? 'his' : 'their'} share there minus the league&apos;s, in points, from {win === 'all' ? 'the season' : 'the last ten games'} against the league&apos;s season; under {VS_MIN} attempts a zone is left blank, and the colour is full at {Math.round(VS_FULL * 100)} points. The league&apos;s slot share is cut the same way as {who === 'He' ? 'his' : 'theirs'}.</> : null} 🏟 ARENA draws the same shots in 3D; its lines run from the shot to the net along the ice and are not tracked puck paths.
                </div>
              </HowToRead>
            </div>
          </ChartCard>
          <FactLines theme={C} lines={depthLines(m, who, Boolean(sel?.against))} />
        </>
      ) : null}
    </div>
  )
}
