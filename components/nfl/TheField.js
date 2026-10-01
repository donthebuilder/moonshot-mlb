'use client'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { C, NUM_FONT } from '../../lib/nfl/theme'
import { NFL_DATA_BASE } from '../../lib/nfl/dataSource'
import { ChipGroup, ChartCard, ChartEmpty } from '../charts'
import {
  fieldModel, fieldView, mapAttempts, phrase, fmtPct, heatOf, coolOf, LANES, LANE_WORD, LANE_SHORT,
  SIDES, DEPTHS, MIN_DEF_ATT, SPOT_MIN_DEF_ATT, SPOT_MIN_SHARE, SPOT_MIN_MINE, FALLBACK_MIN_ATT,
} from '../../lib/nfl/fieldModel'
import { softRole, softLine, fitsSoft } from '../../lib/nfl/dvpSignal'
import { RedZoneStrip } from './RedZoneField'
import { appHref, playerHref } from '../../lib/routes'

// 🏈 THE FIELD (2026-10-01, 0e c -- BATCH-FIELD-FUSION-PLAN). ONE football
// picture where there were two (Donovan, two screenshots of the McLaughlin
// card: "These two are the same thing ... I only want ONE ... build off
// both"). This is FieldChart.js's bones -- the plays file, the real-yards
// geometry, the windows, the hash link, the tap-a-target card, the red-zone
// strip -- with MatchupMap's ideas poured in: the answer as a sentence
// first, the defence as halftone ink, THE SPOT hand-circled, the numbers one
// tap down. MatchupMap.js and TouchMap.js went with this (F5).
//
// THE CHAIN. nflverse pbp + FTN charting -> bots/nfl/nfl_field.py ->
// nfl_field_{TEAM}.json (every target: wk, opp, lane, air, yac, gain, res...;
// every touch inside the 20) -> the dots and the strip. The ink is NOT in
// that file: it is matchup.field.def_pass / def_rush vs the league through
// lib/nfl/fieldModel.js, the one model, so a zone reads the same here, on the
// Matchups tab and in the tests (scripts/check-field-model.mjs).
//
// THE 5-SECOND GATE (0e). No swatch legend, no rings, no HEAT or HOW chip.
// The sentence under the title says what the picture shows; one caption line
// under the picture is the whole explanation for whoever asks.
//
// GEOMETRY (unchanged from FieldChart). One viewBox, 640 wide. Air yards run
// up: Y(a) = y0 + (36 - clamp(a, -5.5, 35)) / 42 * plot height. Three lanes,
// four depth bands are the zones. Labels are sized in SCREEN pixels (u()).

const W = 640
const LANES3 = ['L', 'M', 'R']
const LANE_WORD3 = { L: 'left', M: 'middle', R: 'right' }
const ZONE_SIDE = { L: 'left', M: 'middle', R: 'right' }
const BANDS = [
  { key: 'deep', lo: 20, hi: 36, label: '20+' },
  { key: 'mid', lo: 10, hi: 20, label: '10–19' },
  { key: 'short', lo: 0, hi: 10, label: '0–9' },
  { key: 'behind', lo: -6, hi: 0, label: 'BEHIND' },
]
const bandOf = (air) => (air < 0 ? 'behind' : air < 10 ? 'short' : air < 20 ? 'mid' : 'deep')
const WINS = [['SZN', 'SZN', 99], ['L5', 'L5', 5], ['L3', 'L3', 3], ['WK', 'LAST WK', 1]]
const WHO_INK = [C.cream, C.ice, C.teal, C.amber]
const DISPLAY = "'Barlow Condensed','Roboto Condensed','Helvetica Neue','Arial Narrow',-apple-system,BlinkMacSystemFont,sans-serif"
const PHONE_AT = 760
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s)
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`

// Every name on the Field is a link (the clickable rule): a player opens his
// file, a team opens the Players page filtered to it.
const teamHref = (t) => `${appHref('nfl', 'players')}&team=${encodeURIComponent(t)}`
const linkStyle = { color: 'inherit', textDecoration: 'none' }
const teamLinkStyle = { ...linkStyle, display: 'inline-block', padding: '12px 11px', margin: '-12px -11px', lineHeight: '20px' }
function TeamLink({ t, onOpenTeam }) {
  if (!t) return null
  return onOpenTeam
    ? <a href={teamHref(t)} onClick={(e) => { e.preventDefault(); onOpenTeam(t) }} style={teamLinkStyle}>{t}</a>
    : <a href={teamHref(t)} style={teamLinkStyle}>{t}</a>
}

// One fetch per team file per page load.
const FILES = new Map()
function useFieldFile(team) {
  const [st, setSt] = useState(() => ({ team, state: team ? 'loading' : 'none', body: null }))
  useEffect(() => {
    if (!team) return undefined
    let live = true
    if (!FILES.has(team)) {
      FILES.set(team, fetch(`${NFL_DATA_BASE}/nfl_field_${team}.json`, { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .catch((e) => { FILES.delete(team); throw e }))
    }
    setSt({ team, state: 'loading', body: null })
    FILES.get(team).then((body) => { if (live) setSt({ team, state: 'ready', body }) },
      () => { if (live) setSt({ team, state: 'error', body: null }) })
    return () => { live = false }
  }, [team])
  if (!team) return { team, state: 'none', body: null }
  return st.team === team ? st : { team, state: 'loading', body: null }
}

// A fixed scatter per play (by its index in the file), so a window change
// never reshuffles the dots that stay.
function jitter(n) {
  const x = Math.sin((n + 1) * 78.233) * 43758.5453
  return x - Math.floor(x) - 0.5
}

const yardWords = (yl) => (yl == null ? '' : yl > 50 ? `at their own ${100 - yl}` : yl === 50 ? 'at midfield' : `at their ${yl}`)
const one = (v) => (v == null || !Number.isFinite(v) ? '—' : (Math.round(v * 10) / 10).toFixed(1))

// THE LINK (kept from FieldChart): #...&view=field&win= opens the card on
// the Matchup tab with the window set. `sit` is still read-tolerant (old
// links carried it) and dropped on write -- the red zone lives in the strip.
function readHash() {
  if (typeof window === 'undefined') return null
  const h = new URLSearchParams(window.location.hash.slice(1))
  if (h.get('view') !== 'field') return null
  return { win: { szn: 'SZN', l5: 'L5', l3: 'L3', wk: 'WK' }[h.get('win')] || null }
}
function clearHash() {
  if (typeof window === 'undefined') return
  const h = new URLSearchParams(window.location.hash.slice(1))
  if (!h.has('view') && !h.has('win') && !h.has('sit')) return
  if (h.get('view') === 'field') h.delete('view')
  h.delete('win'); h.delete('sit')
  window.history.replaceState(window.history.state, '', `#${h.toString()}`)
}
function writeHash(win) {
  if (typeof window === 'undefined') return
  const h = new URLSearchParams(window.location.hash.slice(1))
  h.set('view', 'field'); h.set('win', win.toLowerCase()); h.delete('sit')
  window.history.replaceState(window.history.state, '', `#${h.toString()}`)
}

/**
 * team       the offence (its nfl_field_{TEAM}.json)
 * player     the slate row (PLAYER mode); null = TEAM only
 * defTeam    the defence he plays next; defWeek its week number
 * matchup    nfl_matchup.json (field.* for the ink, roles/dvp for the ROLE line)
 * players    slate rows, for names in TEAM mode
 * hashSync   read/write view=field&win= on the URL (the player card)
 */
export default function TheField({ team, player = null, defTeam, defWeek = null, matchup, players = [], initialMode = null, hashSync = false, onPlayerClick = null, onOpenTeam = null }) {
  const file = useFieldFile(team)
  const pid = player ? String(player.player_id) : null
  const isQB = String(player?.position || '').toUpperCase() === 'QB'
  const fromHash = useMemo(() => (hashSync ? readHash() : null), [hashSync])
  // A QB is never targeted, so his picture is his offence's targets.
  const [mode, setMode] = useState(initialMode || (pid && !isQB ? 'PLAYER' : 'TEAM'))
  const [win, setWin] = useState(fromHash?.win || 'SZN')
  const [pick, setPick] = useState(null)
  const [open, setOpen] = useState(false)
  const wrap = useRef(null)
  const fieldBox = useRef(null)
  const [cw, setCw] = useState(900)
  const [fw, setFw] = useState(560)
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const field = matchup?.field
  const [viewPick, setViewPick] = useState(null)

  useEffect(() => {
    const ro = new ResizeObserver(() => {
      if (wrap.current) setCw(wrap.current.clientWidth)
      if (fieldBox.current) setFw(fieldBox.current.clientWidth)
    })
    if (wrap.current) ro.observe(wrap.current)
    if (fieldBox.current) ro.observe(fieldBox.current)
    return () => ro.disconnect()
  }, [file.state])
  useEffect(() => {
    if (fromHash && wrap.current) wrap.current.scrollIntoView({ block: 'start' })
  }, [fromHash, file.state])
  useEffect(() => { if (hashSync && file.state === 'ready') writeHash(win) }, [hashSync, win, file.state])
  // Leaving the Field takes its params with it.
  useEffect(() => () => { if (hashSync) clearHash() }, [hashSync])
  useEffect(() => { setPick(null) }, [mode, win, team, pid])

  const phone = cw < PHONE_AT
  const body = file.body
  const all = useMemo(() => {
    if (!body?.plays) return []
    const cols = body.cols || []
    return body.plays.map((r, i) => {
      const o = { i }
      cols.forEach((c, j) => { o[c] = r[j] })
      return o
    })
  }, [body])
  const byPid = useMemo(() => new Map((players || []).map((p) => [String(p.player_id), p])), [players])
  const nameOf = (id) => byPid.get(String(id))?.name || body?.names?.[id] || id

  const asPlayer = mode === 'PLAYER' && pid && !isQB
  const mine = asPlayer ? all.filter((p) => p.pid === pid) : all
  const weeksIn = useMemo(() => {
    const ws = asPlayer ? [...new Set(mine.map((p) => p.wk))] : [...(body?.weeks || [])]
    return ws.sort((a, b) => b - a)
  }, [mine, asPlayer, body])
  const winWeeks = (k) => new Set(weeksIn.slice(0, (WINS.find((w) => w[0] === k) || WINS[0])[2]))
  const inWin = (k) => { const s = winWeeks(k); return mine.filter((p) => s.has(p.wk)) }
  const P = inWin(win)
  const drawn = P.filter((p) => p.lane && p.air != null)

  // TEAM mode inks: the four most-targeted in what is drawn.
  const topWho = useMemo(() => {
    if (asPlayer) return []
    const n = new Map()
    for (const p of drawn) n.set(p.pid, (n.get(p.pid) || 0) + 1)
    return [...n.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k]) => k)
  }, [asPlayer, drawn])

  // ── the defence, through the one model ──────────────────────────────────
  const defModel = useMemo(() => fieldModel({ field, defTeam, mode: 'def', pass: true }), [field, defTeam])
  // A QB's spot is his own throws (field.qb_pass), the season grid.
  const qbModel = useMemo(() => (pid && isQB ? fieldModel({ field, defTeam, player, mode: 'player', pass: true, qb: true }) : null), [field, defTeam, player, pid, isQB])
  const cells = useMemo(() => {
    const cnt = {}
    for (const p of drawn) { const k = p.lane + bandOf(p.air); cnt[k] = (cnt[k] || 0) + 1 }
    const n = drawn.length || 1
    return LANES3.flatMap((L) => BANDS.map((B) => {
      const z = `${ZONE_SIDE[L]}|${B.key}`
      const m = defModel?.by?.[z]
      return { L, B, z, k: L + B.key, att: m?.att || 0, leak: m && Number.isFinite(m.leak) ? m.leak : null, tdLine: m?.tdLine || null, n: cnt[L + B.key] || 0, share: (100 * (cnt[L + B.key] || 0)) / n }
    }))
  }, [drawn, defModel])
  const byZ = useMemo(() => Object.fromEntries(cells.map((c) => [c.z, c])), [cells])

  // THE SPOT, HONEST (plan item 4): a real hole (12+ defence attempts, a
  // positive leak), 4%+ of the work, and at least five of the plays behind it.
  const spot = useMemo(() => {
    if (qbModel && mode === 'TEAM' && isQB) return qbModel.spot ? { ...byZ[qbModel.spot.z], share: qbModel.spot.share, n: qbModel.spot.mine?.att || 0 } : null
    if (drawn.length < SPOT_MIN_MINE) return null
    let best = null
    for (const c of cells) {
      if (c.leak == null || c.leak <= 0 || c.att < SPOT_MIN_DEF_ATT || c.share < SPOT_MIN_SHARE) continue
      const v = c.share * c.leak
      if (!best || v > best.v) best = { ...c, v }
    }
    return best
  }, [cells, drawn.length, qbModel, mode, isQB, byZ])

  // ── PASSING / RUNNING, ONE VIEW (plan items 3 + 8) ─────────────────────
  // The picture follows where his work is (lib/nfl/fieldModel.js
  // fieldView: targets -- a QB's throws -- vs carries, the season grids); a
  // toggle only for a pass-catching back. With no player (the Matchups
  // tab's TEAM read) both sides of the defence are a tap apart.
  const tgN = pid ? mapAttempts(isQB ? field?.qb_pass?.[pid] : field?.player_pass?.[pid]) : 0
  const caN = pid ? mapAttempts(field?.player_rush?.[pid]) : 0
  const dv = pid ? fieldView({ tg: tgN, ca: caN }) : { view: 'pass', toggle: Boolean(field?.def_rush?.[defTeam]) }
  const isRun = (dv.toggle && viewPick ? viewPick : dv.view) === 'rush'
  const runDef = useMemo(() => fieldModel({ field, defTeam, mode: 'def', pass: false }), [field, defTeam])
  const runMine = useMemo(() => (pid ? fieldModel({ field, defTeam, player, mode: 'player', pass: false }) : null), [field, defTeam, player, pid])
  const runModel = pid ? runMine : runDef
  const runSpot = runModel?.spot || null

  // ── the sentence ────────────────────────────────────────────────────────
  const TL = (t) => <TeamLink t={t} onOpenTeam={onOpenTeam} />
  const usingQb = Boolean(qbModel) && isQB && mode === 'TEAM'
  const n = usingQb ? qbModel.mineTotal : drawn.length
  const unit = usingQb ? 'throw' : 'target'
  const whose = asPlayer || usingQb ? 'his' : `${team}'s`
  const who = asPlayer || usingQb ? (player?.name || 'he') : team
  const thinSample = (asPlayer || usingQb) && n < FALLBACK_MIN_ATT
  const holes = cells.filter((c) => c.leak != null && c.leak > 0 && c.att >= SPOT_MIN_DEF_ATT)
  const role = pid ? matchup?.roles?.[pid] : null
  const soft = role && defTeam ? softRole(matchup, defTeam, 'season', [role]) : null
  const lines = []
  if (thinSample) lines.push(<>Built on {plural(n, unit)}: a hint, not a tendency.</>)
  if (!defTeam) lines.push(<>No opponent this week, so no defence to read: {whose} targets only.</>)
  else if (!defModel) lines.push(<>No passing map for {TL(defTeam)} yet, so the field has no ink.</>)
  else if (n >= SPOT_MIN_MINE) {
    if (spot) {
      lines.push(<><b style={{ color: C.orange, fontFamily: NUM_FONT, letterSpacing: '.04em' }}>THE SPOT</b>: {phrase(spot.z)}. {TL(defTeam)} give up <b style={{ color: C.text }}>{fmtPct(spot.leak)}</b> there, and <b style={{ color: C.text }}>{spot.n} of {whose} {n}</b> {unit}s went there.</>)
    } else if (!holes.length) {
      lines.push(<>{TL(defTeam)} have no zone that leaks on enough plays to call it.</>)
    } else {
      lines.push(<>Nothing lines up. Every hole {TL(defTeam)} leave is one {who} {asPlayer || usingQb ? "doesn't" : "don't"} {usingQb ? 'throw into' : asPlayer ? 'work' : 'throw into'}.</>)
    }
  }
  if (isRun) {
    // THE RUN VIEW'S SENTENCE: the same three shapes, on the seven gaps.
    lines.length = 0
    const rn = pid ? (runMine?.mineTotal || caN) : null
    const runHoles = (runDef?.cells || []).filter((c) => Number.isFinite(c.leak) && c.leak > 0 && c.att >= SPOT_MIN_DEF_ATT)
    const gap = (z) => LANE_WORD[z].replace(/^runs /, '')
    if (pid && rn < FALLBACK_MIN_ATT) lines.push(<>Built on {plural(rn, 'carry').replace('carrys', 'carries')}: a hint, not a tendency.</>)
    if (!defTeam) lines.push(<>No opponent this week, so no defence to read.</>)
    else if (!runDef) lines.push(<>No running map for {TL(defTeam)} yet, so the line has no ink.</>)
    else if (!pid || rn >= SPOT_MIN_MINE) {
      if (runSpot && pid) {
        lines.push(<><b style={{ color: C.orange, fontFamily: NUM_FONT, letterSpacing: '.04em' }}>THE SPOT</b>: {gap(runSpot.z)}. {TL(defTeam)} give up <b style={{ color: C.text }}>{fmtPct(runSpot.leak)}</b> a carry there, and <b style={{ color: C.text }}>{runSpot.mine?.att || 0} of his {rn}</b> carries went there.</>)
      } else if (runSpot) {
        lines.push(<><b style={{ color: C.orange, fontFamily: NUM_FONT, letterSpacing: '.04em' }}>THE WEAK SPOT</b>: {gap(runSpot.z)}. {TL(defTeam)} give up <b style={{ color: C.text }}>{fmtPct(runSpot.leak)}</b> a carry there, {Math.round(runSpot.share)}% of all the rushing yards they allow.</>)
      } else if (!runHoles.length) {
        lines.push(<>{TL(defTeam)} have no gap that leaks on enough carries to call it.</>)
      } else {
        lines.push(<>Nothing lines up. Every gap {TL(defTeam)} leave open is one {player?.name || 'he'} doesn&apos;t run.</>)
      }
    }
  }
  const roleLine = soft?.standout && soft.role === role && fitsSoft(player, soft)
    ? <>{TL(defTeam)} {softLine(soft)}: the same role {player?.name || 'he'} plays.</>
    : null

  const lastWk = weeksIn[0] || null
  const head = (
    <div style={{ marginBottom: phone ? 6 : 8 }}>
      <h3 style={{ margin: 0, fontFamily: DISPLAY, fontStretch: 'condensed', fontWeight: 800, fontSize: phone ? 21 : 26, lineHeight: 1.05, letterSpacing: '.01em', textTransform: 'uppercase', color: C.text }}>
        <span style={{ color: C.green }}>The Field</span>
        <span style={{ color: C.text3, margin: '0 .3em' }}>·</span>
        {pid && player
          ? <><a href={playerHref('nfl', pid)} style={linkStyle}>{player.name}</a><span style={{ color: C.text3 }}> · {TL(team)}</span></>
          : <>{TL(team)} offence</>}
      </h3>
      {(lines.length > 0 || roleLine) && (
        <div style={{ marginTop: 5, fontSize: 13, lineHeight: 1.5, color: C.text2 }}>
          {lines.map((l, i) => <div key={i}>{l}</div>)}
          {roleLine && <div style={{ marginTop: 3, fontSize: 12, color: C.text3 }}>{roleLine}</div>}
        </div>
      )}
    </div>
  )

  // Zero targets and zero carries: nothing to draw, no section.
  if (pid && !dv.view) return null
  if (!isRun && file.state === 'loading') return <section ref={wrap}>{head}<ChartEmpty theme={C}>Loading every target…</ChartEmpty></section>
  if (!isRun && (file.state === 'error' || file.state === 'none')) return <section ref={wrap}>{head}<ChartEmpty theme={C}>Couldn&apos;t load {team}&apos;s plays file (nfl_field_{team}.json), so there are no dots to draw yet.</ChartEmpty></section>
  if (!isRun && !mine.length) return <section ref={wrap}>{head}<ChartEmpty theme={C}>{asPlayer ? `No targets for ${player?.name || 'him'} in ${body?.season || 'this'} season's play-by-play yet.` : `No targets for ${team} yet.`}</ChartEmpty></section>

  // ── the chips ────────────────────────────────────────────────────────────
  const chipH = phone ? { minHeight: 44, padding: '0 11px', fontSize: 11, whiteSpace: 'nowrap', flexShrink: 0 } : { minHeight: 32, padding: '0 10px', fontSize: 10.5, whiteSpace: 'nowrap' }
  const dock = (
    <div className="field-dock" style={{
      display: 'flex', alignItems: 'center', gap: 5, marginBottom: phone ? 6 : 8,
      ...(phone ? { flexWrap: 'nowrap', overflowX: 'auto', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', margin: '0 -2px 6px', padding: '0 2px' } : { flexWrap: 'wrap' }),
    }}>
      {dv.toggle && (
        <ChipGroup first theme={C} numFont={NUM_FONT} color={C.amber} value={isRun ? 'rush' : 'pass'} onChange={setViewPick} chipStyle={chipH}
          options={[{ k: 'pass', label: 'PASSING', n: pid ? tgN : null, title: pid ? `${isQB ? 'His throws' : 'His targets'}, where they went` : 'Where they get beaten through the air' }, { k: 'rush', label: 'RUNNING', n: pid ? caN : null, title: pid ? 'His carries, gap by gap' : 'Where they get beaten on the ground' }]} />
      )}
      {pid && !isQB && !isRun && (
        <ChipGroup first={!dv.toggle} theme={C} numFont={NUM_FONT} color={C.green} value={mode} onChange={setMode} chipStyle={chipH}
          options={[{ k: 'PLAYER', label: 'PLAYER', n: null, title: `${player?.name}'s targets` }, { k: 'TEAM', label: 'TEAM', n: null, title: `Every target ${team} threw` }]} />
      )}
      <ChipGroup first={!dv.toggle && (!pid || isQB || isRun)} label={phone ? null : 'Window'} theme={C} numFont={NUM_FONT} color={C.cyan} value={win} onChange={setWin} chipStyle={chipH}
        options={WINS.map(([k, label, nn]) => ({ k, label, n: k === 'SZN' || isRun ? null : inWin(k).length, title: k === 'SZN' ? 'The whole season' : `The last ${nn === 1 ? 'game' : `${nn} games`} ${asPlayer ? 'he was targeted in' : `${team} played`}` }))} />
    </div>
  )

  // ── the picture ──────────────────────────────────────────────────────────
  const H = phone ? 420 : 560
  const k = W / Math.max(200, fw)
  const u = (px) => px * k
  const gutter = u(phone ? 46 : 50)
  const side = u(phone ? 26 : 34)
  const x0 = gutter, x1 = W - u(6)
  const cx0 = x0 + side, cx1 = x1 - side
  const lw = (cx1 - cx0) / 3
  const y0 = u(6), y1 = H - u(phone ? 20 : 24)
  const Y = (a) => y0 + ((36 - Math.max(-5.5, Math.min(35, a))) / 42) * (y1 - y0)
  const yTop = Y(36), yBot = Y(-6)
  const labelPx = 11
  const numPx = phone ? 16 : 22
  const dotScale = Math.max(1, k * 0.8)
  const KO = { stroke: C.turf2, strokeWidth: u(3), strokeOpacity: 0.85, style: { paintOrder: 'stroke' }, strokeLinejoin: 'round' }

  const defs = []
  const parts = []
  parts.push(<rect key="turf" x={0} y={0} width={W} height={H} fill={C.turf2} />)
  for (let a = -10; a < 36; a += 5) {
    if (Math.round(a / 5) % 2 === 0) continue
    const top = Y(Math.min(36, a + 5)), bot = Y(Math.max(-6, a))
    if (bot > top) parts.push(<rect key={`mow${a}`} x={x0} y={top} width={x1 - x0} height={bot - top} fill={C.turf1} />)
  }

  // THE INK (plan item 2): MatchupMap's halftone, as an SVG pattern per zone
  // -- dot size and pitch scale with how far above a normal defence the zone
  // runs (heatOf); a zone that holds up gets a finer, quieter cyan (coolOf).
  // A zone under MIN_DEF_ATT attempts gets no ink and says "thin".
  for (const c of cells) {
    if (c.leak == null) continue
    const li = LANES3.indexOf(c.L)
    const bx = cx0 + li * lw, by = Y(c.B.hi), bh = Y(c.B.lo) - by
    const ins = u(1.5)
    const h = heatOf(c.leak), cl = coolOf(c.leak)
    if (h >= 0.12) {
      const pitch = u(10 - h * 4.5), r = u(1.1 + h * 1.7)
      defs.push(<pattern key={`p${c.k}`} id={`ink${uid}${c.k}`} width={pitch} height={pitch} patternUnits="userSpaceOnUse"><circle cx={pitch / 2} cy={pitch / 2} r={r} fill={C.orange} fillOpacity={(0.42 + h * 0.4).toFixed(2)} /></pattern>)
      parts.push(<rect key={`g${c.k}`} x={bx + ins} y={by + ins} width={lw - 2 * ins} height={bh - 2 * ins} rx={u(2)} fill={C.orange} opacity={(0.04 + h * 0.1).toFixed(3)} />)
      parts.push(<rect key={`f${c.k}`} x={bx + ins} y={by + ins} width={lw - 2 * ins} height={bh - 2 * ins} rx={u(2)} fill={`url(#ink${uid}${c.k})`} />)
    } else if (cl >= 0.12) {
      const pitch = u(9 - cl * 3), r = u(0.8 + cl * 0.9)
      defs.push(<pattern key={`p${c.k}`} id={`ink${uid}${c.k}`} width={pitch} height={pitch} patternUnits="userSpaceOnUse"><circle cx={pitch / 2} cy={pitch / 2} r={r} fill={C.cyan} fillOpacity={(0.22 + cl * 0.3).toFixed(2)} /></pattern>)
      parts.push(<rect key={`f${c.k}`} x={bx + ins} y={by + ins} width={lw - 2 * ins} height={bh - 2 * ins} rx={u(2)} fill={`url(#ink${uid}${c.k})`} />)
    }
  }
  for (const bxl of [cx0, cx0 + lw, cx0 + 2 * lw, cx1]) {
    parts.push(<line key={`lb${bxl}`} x1={bxl} y1={yTop} x2={bxl} y2={yBot} stroke={C.cream} strokeOpacity={bxl === cx0 || bxl === cx1 ? 0.22 : 0.07} vectorEffect="non-scaling-stroke" strokeWidth={1} />)
  }
  for (let a = -5; a <= 35; a += 5) {
    if (a === 0) continue
    parts.push(<line key={`yl${a}`} x1={x0} y1={Y(a)} x2={x1} y2={Y(a)} stroke={C.cream} strokeOpacity={a % 10 === 0 ? 0.28 : 0.14} vectorEffect="non-scaling-stroke" strokeWidth={1} />)
  }
  const ticks = []
  for (let a = -5; a <= 35; a += 1) {
    if (a % 5 === 0) continue
    for (const hx of [cx0 + lw, cx0 + 2 * lw]) ticks.push(`M${(hx - u(3.5)).toFixed(1)} ${Y(a).toFixed(1)}h${u(7).toFixed(1)}`)
  }
  parts.push(<path key="ticks" d={ticks.join('')} stroke={C.cream} strokeOpacity={0.26} vectorEffect="non-scaling-stroke" strokeWidth={1} fill="none" />)
  for (const a of [10, 20, 30]) {
    for (const nx of [x0 + side / 2, x1 - side / 2]) {
      parts.push(<text key={`n${a}${nx}`} x={nx} y={Y(a)} dy=".35em" textAnchor="middle" fontFamily={DISPLAY} fontWeight={800} fontSize={u(numPx)}
        style={{ fontStretch: 'condensed', paintOrder: 'stroke' }} stroke={C.turf2} strokeWidth={u(4)} fill={C.cream} fillOpacity={0.45}>{a}</text>)
    }
  }
  parts.push(<line key="los" x1={x0} y1={Y(0)} x2={x1} y2={Y(0)} stroke={C.ice} strokeWidth={2.4} vectorEffect="non-scaling-stroke" />)

  // per-zone numbers (plan item 5): the leak where the sample holds, "thin"
  // elsewhere; the spot's number rides its ring.
  const labels = []
  if (defModel) {
    for (const c of cells) {
      const li = LANES3.indexOf(c.L)
      const bx = cx0 + li * lw, by = Y(c.B.hi)
      if (spot && c.z === spot.z) continue
      const txt = c.leak != null ? fmtPct(c.leak) : 'thin'
      labels.push(<rect key={`lb${c.k}`} x={bx + u(4)} y={by + u(4)} width={u(txt.length * labelPx * 0.66 + 7)} height={u(labelPx + 6)} rx={u(4)} fill={C.bg} opacity={0.62} />)
      labels.push(<text key={`lk${c.k}`} x={bx + u(7.5)} y={by + u(4 + labelPx * 0.5 + 3)} dy=".35em" fontFamily={NUM_FONT} fontWeight={c.leak != null ? 800 : 700} fontSize={u(labelPx)}
        fill={c.leak == null ? C.text3 : c.leak > 0 ? C.orange : C.cyan}>{txt}</text>)
    }
  }
  for (const B of BANDS) {
    labels.push(<text key={`bl${B.key}`} x={x0 - u(6)} y={(Y(B.lo) + Y(B.hi)) / 2} dy=".35em" textAnchor="end" fontFamily={NUM_FONT} fontWeight={800} fontSize={u(labelPx)} fill={C.text3}>{B.label}</text>)
  }
  LANES3.forEach((L, li) => labels.push(<text key={`ln${L}`} x={cx0 + li * lw + lw / 2} y={H - u(phone ? 6 : 8)} textAnchor="middle" fontFamily={NUM_FONT} fontWeight={800} fontSize={u(labelPx)} letterSpacing={u(1)} fill={C.text3}>{{ L: 'LEFT', M: 'MIDDLE', R: 'RIGHT' }[L]}</text>))
  labels.push(<text key="loslbl" x={x0 - u(6)} y={Y(0)} dy=".35em" textAnchor="end" fontFamily={NUM_FONT} fontWeight={900} fontSize={u(10)} fill={C.ice}>LINE</text>)

  // THE SPOT: MatchupMap's hand-circled double ring, centred on the zone,
  // with the zone's number on a tag under it.
  if (spot) {
    const li = LANES3.indexOf(spot.L)
    const cxs = cx0 + li * lw + lw / 2
    const cys = (Y(spot.B.hi) + Y(spot.B.lo)) / 2
    const rr = Math.min(lw, Y(spot.B.lo) - Y(spot.B.hi)) * 0.42
    const tagTxt = `THE SPOT ${fmtPct(spot.leak)}`
    const tagPx = phone ? 9.5 : 10.5
    const tagW = u(tagTxt.length * tagPx * 0.68 + 10), tagH = u(tagPx + 8)
    labels.push(<g key="spot" aria-hidden="true">
      <circle cx={cxs} cy={cys} r={rr} fill="none" stroke={C.text} strokeWidth={2} strokeOpacity={0.95} vectorEffect="non-scaling-stroke" />
      <circle cx={cxs + rr * 0.06} cy={cys - rr * 0.05} r={rr * 1.06} fill="none" stroke={C.text} strokeWidth={1.1} strokeOpacity={0.5} vectorEffect="non-scaling-stroke" />
      <rect x={cx0 + li * lw + u(4)} y={Y(spot.B.hi) + u(4)} width={tagW} height={tagH} rx={u(3)} fill={C.orange} />
      <text x={cx0 + li * lw + u(4) + tagW / 2} y={Y(spot.B.hi) + u(4) + tagH / 2} dy=".35em" textAnchor="middle" fontFamily={NUM_FONT} fontWeight={900} fontSize={u(tagPx)} letterSpacing={u(0.4)} fill={C.bg}>{tagTxt}</text>
    </g>)
  }

  // dots: misses under catches under touchdowns, so the loudest sits on top
  const order = { inc: 0, int: 0, catch: 1, td: 2 }
  const dots = [...drawn].sort((a, b) => (order[a.res] - order[b.res]) || (a.i - b.i)).map((p) => {
    const li = LANES3.indexOf(p.lane)
    const cx = cx0 + li * lw + lw / 2 + jitter(p.i) * lw * 0.72
    const cy = Y(p.air)
    const on = pick === p.i
    const r = (3.6 + (Math.min(25, p.yac || 0) / 25) * 4.4) * dotScale
    const whoI = asPlayer ? 0 : topWho.indexOf(p.pid)
    const ink = asPlayer ? C.cream : (whoI >= 0 ? WHO_INK[whoI] : C.text3)
    const td = p.res === 'td'
    const caught = p.res === 'catch' || td
    const fill = td ? C.orange : caught ? ink : 'none'
    // a touchdown keeps a cream edge so it never melts into the orange ink
    const stroke = on ? C.ice : td ? C.cream : ink
    const label = `${td ? 'Touchdown' : p.res === 'catch' ? 'Catch' : p.res === 'int' ? 'Intercepted' : 'Incomplete'}, ${p.air} air yards, ${LANE_WORD3[p.lane]} lane, week ${p.wk}${asPlayer ? '' : `, ${nameOf(p.pid)}`}`
    return (
      <g key={`d${p.i}`} role="button" tabIndex={0} aria-label={label} aria-pressed={on}
        onClick={() => setPick(on ? null : p.i)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPick(on ? null : p.i) } }}
        style={{ cursor: 'pointer', outline: 'none' }}>
        {td && <circle cx={cx} cy={cy} r={r + 5 * dotScale} fill={C.orange} opacity={0.3} filter={`url(#glow${uid})`} />}
        <circle cx={cx} cy={cy} r={on ? r + 2.5 * dotScale : r} fill={fill} fillOpacity={td ? 1 : 0.9}
          stroke={stroke} strokeWidth={on ? 2 : 1.3} vectorEffect="non-scaling-stroke" />
        <circle cx={cx} cy={cy} r={u(22)} fill="transparent" />
      </g>
    )
  })

  const subjName = asPlayer ? player.name : `${team} offence`

  // ── THE RUN VIEW (plan item 3): the same field, the ink on the seven gaps
  // as a band along the line of scrimmage, THE SPOT circled on the one gap
  // where his carries and their leak meet. No dot grids, no per-gap legend.
  // His carries outside the 20 are not in the plays file (checked), so the
  // band is the season grid and the dots are his red-zone touches, in the
  // strip under it.
  let runPicture = null
  if (isRun) {
    const RH = phone ? 232 : 280
    const rx0 = u(8), rx1 = W - u(8)
    const gw = (rx1 - rx0) / LANES.length
    const ry0 = u(6), ry1 = RH - u(6)
    const YR = (a) => ry0 + ((8 - Math.max(-9.5, Math.min(8, a))) / 17.5) * (ry1 - ry0)
    const bTop = YR(3.6), bBot = YR(-3.6)
    const rdefs = []
    const rparts = [<rect key="turf" x={0} y={0} width={W} height={RH} fill={C.turf2} />]
    for (let a = -10; a < 8; a += 5) {
      if (Math.round(a / 5) % 2 === 0) continue
      const top = YR(Math.min(8, a + 5)), bot = YR(Math.max(-9.5, a))
      if (bot > top) rparts.push(<rect key={`mow${a}`} x={0} y={top} width={W} height={bot - top} fill={C.turf1} />)
    }
    for (const a of [5]) rparts.push(<line key={`yl${a}`} x1={0} y1={YR(a)} x2={W} y2={YR(a)} stroke={C.cream} strokeOpacity={a % 10 === 0 ? 0.28 : 0.14} vectorEffect="non-scaling-stroke" strokeWidth={1} />)
    const rlabels = []
    LANES.forEach((z, i) => {
      const c = runModel?.by?.[z] || runDef?.by?.[z]
      const gx = rx0 + i * gw
      const ins = u(1.5)
      const h = heatOf(c?.leak), cl = coolOf(c?.leak)
      if (h >= 0.12) {
        const pitch = u(10 - h * 4.5), r = u(1.1 + h * 1.7)
        rdefs.push(<pattern key={`rp${i}`} id={`rink${uid}${i}`} width={pitch} height={pitch} patternUnits="userSpaceOnUse"><circle cx={pitch / 2} cy={pitch / 2} r={r} fill={C.orange} fillOpacity={(0.42 + h * 0.4).toFixed(2)} /></pattern>)
        rparts.push(<rect key={`rg${i}`} x={gx + ins} y={bTop} width={gw - 2 * ins} height={bBot - bTop} rx={u(3)} fill={C.orange} opacity={(0.04 + h * 0.1).toFixed(3)} />)
        rparts.push(<rect key={`rf${i}`} x={gx + ins} y={bTop} width={gw - 2 * ins} height={bBot - bTop} rx={u(3)} fill={`url(#rink${uid}${i})`} />)
      } else if (cl >= 0.12) {
        const pitch = u(9 - cl * 3), r = u(0.8 + cl * 0.9)
        rdefs.push(<pattern key={`rp${i}`} id={`rink${uid}${i}`} width={pitch} height={pitch} patternUnits="userSpaceOnUse"><circle cx={pitch / 2} cy={pitch / 2} r={r} fill={C.cyan} fillOpacity={(0.22 + cl * 0.3).toFixed(2)} /></pattern>)
        rparts.push(<rect key={`rf${i}`} x={gx + ins} y={bTop} width={gw - 2 * ins} height={bBot - bTop} rx={u(3)} fill={`url(#rink${uid}${i})`} />)
      } else {
        rparts.push(<rect key={`rf${i}`} x={gx + ins} y={bTop} width={gw - 2 * ins} height={bBot - bTop} rx={u(3)} fill={C.cream} opacity={0.03} />)
      }
      if (i > 0) rparts.push(<line key={`gb${i}`} x1={gx} y1={bTop} x2={gx} y2={bBot} stroke={C.cream} strokeOpacity={0.12} vectorEffect="non-scaling-stroke" strokeWidth={1} />)
      if (!(runSpot && runSpot.z === z)) {
        rlabels.push(<text key={`rl${i}`} x={gx + gw / 2} y={YR(1.7)} textAnchor="middle" fontFamily={NUM_FONT} fontWeight={800} fontSize={u(11)}
          fill={!Number.isFinite(c?.leak) ? C.text3 : c.leak > 0 ? C.orange : C.cyan} {...KO}>{Number.isFinite(c?.leak) ? fmtPct(c.leak) : 'thin'}</text>)
      }
      rlabels.push(<text key={`rn${i}`} x={gx + gw / 2} y={YR(-5.4)} textAnchor="middle" fontFamily={NUM_FONT} fontWeight={800} fontSize={u(phone ? 10 : 11)} letterSpacing={u(0.3)} fill={C.text3}>{LANE_SHORT[z]}</text>)
    })
    // the five linemen the gaps are named after, on the line
    for (let i = 1; i <= 5; i += 1) {
      const lx = rx0 + i * gw + gw / 2
      rparts.push(<rect key={`ol${i}`} x={lx - gw * 0.16} y={YR(0) + u(2)} width={gw * 0.32} height={u(7)} rx={u(2)} fill={C.cream} opacity={0.32} />)
    }
    rparts.push(<line key="los" x1={0} y1={YR(0)} x2={W} y2={YR(0)} stroke={C.ice} strokeWidth={2.4} vectorEffect="non-scaling-stroke" />)
    rlabels.push(<text key="loslbl" x={rx1} y={YR(5.4)} textAnchor="end" fontFamily={NUM_FONT} fontWeight={800} fontSize={u(phone ? 10 : 10.5)} letterSpacing={u(0.8)} fill={C.ice} {...KO}>LINE OF SCRIMMAGE</text>)
    if (runSpot) {
      const i = LANES.indexOf(runSpot.z)
      const cxs = rx0 + i * gw + gw / 2, cys = (bTop + bBot) / 2
      const rr = Math.min(gw, bBot - bTop) * 0.5
      const tagTxt = `THE SPOT ${fmtPct(runSpot.leak)}`
      const tagPx = phone ? 9.5 : 10.5
      const tagW = u(tagTxt.length * tagPx * 0.68 + 10), tagH = u(tagPx + 8)
      const tx = Math.max(rx0, Math.min(rx1 - tagW, cxs - tagW / 2))
      const ty = YR(-7.2)
      rlabels.push(<g key="rspot" aria-hidden="true">
        <circle cx={cxs} cy={cys} r={rr} fill="none" stroke={C.text} strokeWidth={2} strokeOpacity={0.95} vectorEffect="non-scaling-stroke" />
        <circle cx={cxs + rr * 0.06} cy={cys - rr * 0.05} r={rr * 1.06} fill="none" stroke={C.text} strokeWidth={1.1} strokeOpacity={0.5} vectorEffect="non-scaling-stroke" />
        <rect x={tx} y={ty} width={tagW} height={tagH} rx={u(3)} fill={C.orange} />
        <text x={tx + tagW / 2} y={ty + tagH / 2} dy=".35em" textAnchor="middle" fontFamily={NUM_FONT} fontWeight={900} fontSize={u(tagPx)} letterSpacing={u(0.4)} fill={C.bg}>{tagTxt}</text>
      </g>)
    }
    runPicture = (
      <svg viewBox={`0 0 ${W} ${RH}`} role="img" aria-label={`${defTeam || 'The defence'}: rushing yards allowed by gap vs a normal defence${pid ? `, with ${player?.name}'s carries` : ''}`}
        style={{ display: 'block', width: '100%', height: 'auto', borderRadius: 8 }}>
        <defs>{rdefs}</defs>
        {rparts}{rlabels}
      </svg>
    )
  }
  const picture = (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${subjName}: ${drawn.length} targets by depth and lane${defTeam ? `, over ${defTeam}'s yards allowed by zone` : ''}`}
      style={{ display: 'block', width: '100%', height: 'auto', borderRadius: 8 }}>
      <defs>
        <filter id={`glow${uid}`} x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation={3 * dotScale} /></filter>
        {defs}
      </defs>
      {parts}{dots}{labels}
    </svg>
  )

  // THE CAPTION (plan item 6): the whole explanation, one line.
  const caption = isRun ? (
    <div style={{ fontSize: 11.5, lineHeight: 1.5, color: C.text3, marginTop: 6 }}>
      {runDef ? <>Ink: where {TL(defTeam)} get beaten on the ground, gap by gap, vs a normal defence. Thin = too few carries to say. </> : null}
      Carries by gap are from the season grid; the dots in the strip are {pid ? 'his' : 'their'} touches inside the 20.
    </div>
  ) : (
    <div style={{ fontSize: 11.5, lineHeight: 1.5, color: C.text3, marginTop: 6 }}>
      {defModel ? <>Ink: where {TL(defTeam)} get beaten, vs a normal defence. </> : null}
      Dots: {asPlayer ? 'his' : `${team}'s`} targets, where they went (hollow = incomplete, orange = touchdown).
      {defModel ? ' Thin = too few plays to say.' : ''}
      {usingQb ? ' The spot uses his own throws this season.' : ''}
    </div>
  )
  // TEAM mode: whose dots are whose -- names (links), not a legend.
  const whoRow = !asPlayer && topWho.length ? (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0 12px', marginTop: 2, fontSize: 12 }}>
      {topWho.map((w, i) => (
        <a key={w} href={playerHref('nfl', w)} onClick={onPlayerClick && byPid.get(String(w)) ? (e) => { e.preventDefault(); onPlayerClick(byPid.get(String(w))) } : undefined}
          style={{ ...linkStyle, display: 'inline-flex', alignItems: 'center', gap: 5, minHeight: 32, color: C.text2 }}>
          <i aria-hidden="true" style={{ width: 9, height: 9, borderRadius: '50%', background: WHO_INK[i], display: 'inline-block' }} />{nameOf(w)}
        </a>
      ))}
    </div>
  ) : null

  // ── the numbers ──────────────────────────────────────────────────────────
  const ct = P.filter((p) => p.res === 'catch' || p.res === 'td')
  const tds = P.filter((p) => p.res === 'td').length
  const yds = P.reduce((s, p) => s + (p.gain || 0), 0)
  const airs = P.filter((p) => p.air != null)
  const stats = [
    ['TGT', P.length, C.text], ['REC', ct.length, C.text], ['YDS', yds, C.text], ['TD', tds, C.orange],
    ['AIR', airs.length ? one(airs.reduce((s, p) => s + p.air, 0) / airs.length) : '—', C.text2],
    ['YAC', ct.length ? one(ct.reduce((s, p) => s + (p.yac || 0), 0) / ct.length) : '—', C.text2],
  ]
  const runSrc = isRun && pid ? field?.player_rush?.[pid] : null
  if (runSrc) {
    const att = mapAttempts(runSrc)
    const ry = Object.values(runSrc).reduce((a, z) => a + (Number(z?.yds) || 0), 0)
    const rt = Object.values(runSrc).reduce((a, z) => a + (Number(z?.td) || 0), 0)
    stats.splice(0, stats.length, ['CARRIES', att, C.text], ['YDS', ry, C.text], ['TD', rt, C.orange], ['YPC', att ? one(ry / att) : '—', C.text2])
  }
  const statBlock = isRun && !runSrc ? null : (
    <div role="list" style={{ display: 'grid', gridTemplateColumns: `repeat(${stats.length}, 1fr)`, gap: 2, marginTop: 8 }}>
      {stats.map(([l, v, col]) => (
        <div key={l} role="listitem" style={{ textAlign: 'center', minWidth: 0 }}>
          <div style={{ fontFamily: DISPLAY, fontStretch: 'condensed', fontWeight: 800, fontSize: phone ? 19 : 24, lineHeight: 1, color: col }}>{v}</div>
          <div style={{ fontFamily: NUM_FONT, fontSize: 11, fontWeight: 800, color: C.text3, marginTop: 2, whiteSpace: 'nowrap', letterSpacing: '.02em' }}>{l}</div>
        </div>
      ))}
    </div>
  )

  // EVERY PART OF THE FIELD, WITH THE NUMBERS (plan item 7): MatchupMap's
  // table, one tap down, closed by default. Same model as the picture, so a
  // zone's % here is the % drawn on it.
  const tableRows = isRun
    ? LANES.map((z) => {
      const c = runModel?.by?.[z] || runDef?.by?.[z]
      return c ? { z, where: cap(LANE_WORD[z]), leak: Number.isFinite(c.leak) ? c.leak : null, tdLine: c.tdLine, right: pid ? `${c.mine?.att || 0} of ${runMine?.mineTotal || 0}` : `${Math.round(c.share)}%` } : null
    }).filter(Boolean)
    : DEPTHS.flatMap((d) => SIDES.map((s) => byZ[`${s}|${d}`])).filter(Boolean)
      .map((c) => ({ ...c, where: cap(phrase(c.z)), right: `${c.n} of ${drawn.length}` }))
  const table = (isRun ? runDef : defModel) ? (
    <div>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} style={{
        marginTop: 10, width: '100%', minHeight: 44, textAlign: 'left', cursor: 'pointer',
        border: `1px solid ${C.border}`, borderRadius: 10, padding: '8px 11px',
        background: 'rgba(255,255,255,.015)', color: C.text2,
        fontFamily: NUM_FONT, fontSize: 12, fontWeight: 800, letterSpacing: '.06em',
      }}>{open ? '▾' : '▸'} EVERY PART OF THE FIELD, WITH THE NUMBERS</button>
      {open && (
        <div style={{ marginTop: 6, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
          {tableRows.map((c, i) => (
            <div key={c.z} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 48px 58px', gap: 8, alignItems: 'baseline', padding: '7px 11px', borderTop: i ? `1px solid ${C.border}` : 0 }}>
              <span style={{ minWidth: 0, fontSize: 12, color: C.text2, lineHeight: 1.4 }}>
                {c.where}
                {c.tdLine ? <span style={{ display: 'block', fontSize: 11, color: C.text3 }}>{c.tdLine}</span> : null}
              </span>
              <span style={{ fontFamily: NUM_FONT, fontSize: 12, fontWeight: 900, textAlign: 'right', color: c.leak == null ? C.text3 : c.leak > 0 ? C.orange : C.cyan }}>{c.leak == null ? 'thin' : fmtPct(c.leak)}</span>
              <span style={{ fontFamily: NUM_FONT, fontSize: 11, color: C.text3, textAlign: 'right' }}>{c.right}</span>
            </div>
          ))}
          <div style={{ padding: '6px 11px 8px', fontSize: 11, color: C.text3, borderTop: `1px solid ${C.border}` }}>
            {isRun
              ? <>Middle: {defTeam}&apos;s yards a carry vs the league&apos;s in that gap ({matchup?.season || 'this'} season, thin under {MIN_DEF_ATT} carries). Right: {pid ? 'his season carries that went there' : 'their share of the rushing yards they allow'}.</>
              : <>Middle: {defTeam}&apos;s yards a target vs the league&apos;s there ({matchup?.season || 'this'} season, thin under {MIN_DEF_ATT} targets). Right: {whose} {win === 'SZN' ? '' : `${win} `}targets that went there.</>}
          </div>
        </div>
      )}
    </div>
  ) : null

  // ── the red zone strip (kept: his pick) ──────────────────────────────────
  const rzWeeks = winWeeks(win)
  const rz = (body?.redzone || []).map((r, i) => Object.fromEntries((body.rz_cols || []).map((c, j) => [c, r[j]]).concat([['seed', i]])))
    .filter((t) => rzWeeks.has(t.wk) || win === 'SZN')
  const rzBy = new Map()
  for (const t of rz) { if (!rzBy.has(t.pid)) rzBy.set(t.pid, []); rzBy.get(t.pid).push(t) }
  let stripIds = asPlayer ? [pid] : [...rzBy.keys()].sort((a, b) => rzBy.get(b).length - rzBy.get(a).length).slice(0, 5)
  if (!asPlayer && pid && !stripIds.includes(pid) && rzBy.has(pid)) stripIds = [...stripIds.slice(0, 4), pid]
  const stripRows = stripIds.map((id) => ({ key: id, name: nameOf(id), href: playerHref('nfl', id), player: byPid.get(String(id)) || { name: nameOf(id), team }, clickable: byPid.has(String(id)), touches: rzBy.get(id) || [] }))
  const stripKicker = (
    <div style={{ fontFamily: NUM_FONT, fontSize: 12, fontWeight: 800, letterSpacing: '.06em', color: C.text3, margin: '10px 0 4px' }}>
      <span style={{ color: C.orange }}>RED ZONE</span> · every touch inside the 20{phone ? '' : ', by distance to the goal line'}
    </div>
  )
  const strip = file.state !== 'ready'
    ? <>{stripKicker}<ChartEmpty theme={C} style={{ padding: '2px 0' }}>{file.state === 'loading' ? 'Loading the red-zone touches…' : `No plays file for ${team} yet, so no red-zone touches to draw.`}</ChartEmpty></>
    : stripRows.some((r) => r.touches.length)
    ? <RedZoneStrip rows={stripRows} kicker={phone ? null : stripKicker} phone={phone} onPlayerClick={onPlayerClick}
        rulerLabel={phone ? <span style={{ color: C.orange }}>RED ZONE</span> : null} />
    : <>{stripKicker}<ChartEmpty theme={C} style={{ padding: '2px 0' }}>No red-zone touches{asPlayer ? ' for him' : ''} in this window.</ChartEmpty></>

  // ── the tapped target ─────────────────────────────────────────────────────
  const picked = pick != null ? all[pick] : null
  const cardLines = picked ? (() => {
    const p = picked
    const head1 = p.res === 'td' ? 'TOUCHDOWN' : p.res === 'catch' ? 'CATCH' : p.res === 'int' ? 'INTERCEPTED' : 'INCOMPLETE'
    const yardsBit = p.res === 'catch' || p.res === 'td' ? ` · ${p.air} air + ${p.yac} yac` : p.air != null ? ` · ${p.air} air` : ''
    const q = p.q ? (p.q >= 5 ? 'OT' : `Q${p.q}`) : null
    const l2 = [`WK ${p.wk}${p.opp ? ` vs ${p.opp}` : ''}`, q, p.dn && p.tg != null ? `${p.dn}&${p.tg} ${yardWords(p.yl)}` : yardWords(p.yl)].filter(Boolean).join(' · ')
    const l3 = [p.lane ? `${LANE_WORD3[p.lane]} lane` : null, p.hash ? `snapped from the ${{ L: 'left', R: 'right', M: 'middle' }[p.hash]} hash` : null,
      p.box ? `${p.box} in the box` : null, p.sc ? 'screen' : null, p.pa ? 'play action' : null,
      p.epa != null ? `${p.epa > 0 ? '+' : ''}${p.epa.toFixed(2)} EPA` : null].filter(Boolean).join(' · ')
    return { head1, yardsBit, l2, l3, who: asPlayer ? null : nameOf(p.pid), td: p.res === 'td' }
  })() : null
  const card = (
    <div aria-live="polite" style={{ fontFamily: NUM_FONT, fontSize: 12, lineHeight: 1.6, color: C.text2 }}>
      {cardLines ? <>
        <div><b style={{ color: cardLines.td ? C.orange : C.cream, letterSpacing: '.04em' }}>{cardLines.head1}</b>{cardLines.yardsBit}{cardLines.who ? <span style={{ color: C.text }}> · <a href={playerHref('nfl', picked.pid)} style={linkStyle}>{cardLines.who}</a></span> : null}</div>
        <div>{cardLines.l2}</div>
        {cardLines.l3 && <div style={{ color: C.text3 }}>{cardLines.l3}</div>}
      </> : <span style={{ color: C.text3 }}>Tap a target for the play.</span>}
    </div>
  )
  const emptyWin = !P.length ? <ChartEmpty theme={C} style={{ padding: '4px 0 0' }}>No targets in this window. Try SZN.</ChartEmpty> : null

  return (
    <section ref={wrap} aria-label={`The Field: ${subjName}`} style={{ margin: '4px 0 12px' }}>
      {head}
      {dock}
      <ChartCard theme={C} className="field-card" style={phone ? { display: 'block', padding: 7 } : { gap: 18, padding: 12, flexWrap: 'nowrap' }}>
        <div style={{ flex: '1 1 auto', minWidth: 0, maxWidth: phone ? 'none' : 680 }}>
          <div ref={fieldBox}>{isRun ? runPicture : picture}</div>
          {!isRun && emptyWin}
          {caption}
          {!isRun && whoRow}
          {phone && statBlock}
          {strip}
          {phone && table}
        </div>
        {!phone && (
          <div style={{ flex: '1 0 280px', maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
            {statBlock}
            {!isRun && <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 10, minHeight: 64 }}>{card}</div>}
            {table}
          </div>
        )}
      </ChartCard>
      {phone && picked && (
        <div role="dialog" aria-label="The play" style={{
          position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 1000,
          padding: '12px 16px calc(12px + env(safe-area-inset-bottom))', background: C.bg2,
          borderTop: `1px solid ${C.border2}`, boxShadow: '0 -12px 32px rgba(0,0,0,.5)',
          display: 'flex', gap: 10, alignItems: 'flex-start',
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>{card}</div>
          <button type="button" onClick={() => setPick(null)} aria-label="Close the play"
            style={{ flex: '0 0 44px', width: 44, height: 44, border: `1px solid ${C.border}`, borderRadius: 10, background: 'transparent', color: C.text2, fontSize: 18, cursor: 'pointer' }}>×</button>
        </div>
      )}
    </section>
  )
}
