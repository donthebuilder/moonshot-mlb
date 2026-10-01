'use client'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { C, NUM_FONT } from '../../lib/nfl/theme'
import { NFL_DATA_BASE } from '../../lib/nfl/dataSource'
import { ChipGroup, ChartCard, ChartLegend, ChartEmpty } from '../charts'
import { fieldModel } from './MatchupMap'
import { RedZoneStrip } from './RedZoneField'
import { appHref, playerHref } from '../../lib/routes'

// 🏈 THE FIELD (2026-09-30, BATCH-NFL-FIELD). Every target a player drew,
// drawn where it went: its real air yards up the field from the line of
// scrimmage, its charted lane across, over the defence he plays next shaded
// by where it leaks. The red zone is the strip under it. Football's answer to
// MOONSHOT's spray chart, and built from the same core (components/charts:
// the frame, the chips, the legend, the empty states).
//
// THE CHAIN (bots/nfl/nfl_field.py module docstring has the bot half):
//   nflverse pbp + FTN charting -> team_plays() -> nfl_field_{TEAM}.json
//   (every target: wk, opp, q, dn, tg, yl, lane, air, yac, gain, res, epa,
//   hash, box, pa, sc; every touch inside the 20) -> this file. The window
//   is the last N games HE was targeted in (TEAM: the offence's last N
//   weeks); NORMAL is yardline_100 > 20, RED ZONE <= 20.
// THE LEAK is not in that file. It is matchup.field.def_pass vs league_pass
// through MatchupMap's own fieldModel(), so a zone reads the same here and on
// the Matchup map: (their yards a target - the league's) / the league's, and
// nothing under 8 targets against that defence in the zone.
//
// GEOMETRY. One viewBox, 640 wide. Air yards run up: Y(a) = y0 + (36 -
// clamp(a, -5.5, 35)) / 42 * plot height. Three equal lanes; four depth bands
// (behind, 0-9, 10-19, 20+) are the cells. Labels are sized in SCREEN pixels
// (u() = px * viewBox units per px), so a phone gets 11px numbers instead of
// the desktop's labels shrunk to 6.

const W = 640
const LANES = ['L', 'M', 'R']
const LANE_WORD = { L: 'left', M: 'middle', R: 'right' }
const BANDS = [
  { key: 'deep', lo: 20, hi: 36, label: '20+' },
  { key: 'mid', lo: 10, hi: 20, label: '10–19' },
  { key: 'short', lo: 0, hi: 10, label: '0–9' },
  { key: 'behind', lo: -6, hi: 0, label: 'BEHIND' },
]
const ZONE_SIDE = { L: 'left', M: 'middle', R: 'right' }
const bandOf = (air) => (air < 0 ? 'behind' : air < 10 ? 'short' : air < 20 ? 'mid' : 'deep')
const MIN_DEF_ATT = 8
const WINS = [['SZN', 'SZN', 99], ['L5', 'L5', 5], ['L3', 'L3', 3], ['WK', 'LAST WK', 1]]
const SITS = [['NORMAL', 'NORMAL'], ['RZ', 'RED ZONE'], ['ALL', 'ALL']]
const WHO_INK = [C.cream, C.ice, C.teal, C.amber]
const DISPLAY = "'Barlow Condensed','Roboto Condensed','Helvetica Neue','Arial Narrow',-apple-system,BlinkMacSystemFont,sans-serif"
const PHONE_AT = 760
// Every name on the Field is a link (the clickable rule): a player opens his
// file, a team opens the Players page filtered to it.
const teamHref = (t) => `${appHref('nfl', 'players')}&team=${encodeURIComponent(t)}`
const linkStyle = { color: 'inherit', textDecoration: 'none' }
// A team code is three letters: padded out to a 44px target with matching
// negative margins, so the line it sits in doesn't move.
const teamLinkStyle = { ...linkStyle, display: 'inline-block', padding: '12px 11px', margin: '-12px -11px', lineHeight: '20px' }
function TeamLink({ t, onOpenTeam }) {
  if (!t) return null
  return onOpenTeam
    ? <a href={teamHref(t)} onClick={(e) => { e.preventDefault(); onOpenTeam(t) }} style={teamLinkStyle}>{t}</a>
    : <a href={teamHref(t)} style={teamLinkStyle}>{t}</a>
}
// The plan's leak alpha, min(.42, |leak|/90 + .05), drawn at 60%: at full
// strength a -41% zone out-shouted the touchdown, and the defence is the
// backdrop here, not the subject.
const QUIET = 0.6

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
  return st.team === team ? st : { team, state: 'loading', body: null }
}

// A fixed scatter per play (by its index in the file), so a filter never
// reshuffles the dots that stay.
function jitter(n) {
  const x = Math.sin((n + 1) * 78.233) * 43758.5453
  return x - Math.floor(x) - 0.5
}

const yardWords = (yl) => (yl == null ? '' : yl > 50 ? `at their own ${100 - yl}` : yl === 50 ? 'at midfield' : `at their ${yl}`)
const one = (v) => (v == null || !Number.isFinite(v) ? '—' : (Math.round(v * 10) / 10).toFixed(1))
const pct = (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(Math.round(v))}%`

function readHash() {
  if (typeof window === 'undefined') return null
  const h = new URLSearchParams(window.location.hash.slice(1))
  if (h.get('view') !== 'field') return null
  const win = { szn: 'SZN', l5: 'L5', l3: 'L3', wk: 'WK' }[h.get('win')] || null
  const sit = { normal: 'NORMAL', rz: 'RZ', all: 'ALL' }[h.get('sit')] || null
  return { win, sit }
}
function clearHash() {
  if (typeof window === 'undefined') return
  const h = new URLSearchParams(window.location.hash.slice(1))
  if (!h.has('view') && !h.has('win') && !h.has('sit')) return
  if (h.get('view') === 'field') h.delete('view')
  h.delete('win'); h.delete('sit')
  window.history.replaceState(window.history.state, '', `#${h.toString()}`)
}
function writeHash(win, sit) {
  if (typeof window === 'undefined') return
  const h = new URLSearchParams(window.location.hash.slice(1))
  h.set('view', 'field'); h.set('win', win.toLowerCase()); h.set('sit', sit.toLowerCase())
  window.history.replaceState(window.history.state, '', `#${h.toString()}`)
}

/**
 * team       the offence (its nfl_field_{TEAM}.json)
 * player     the slate row of the player (PLAYER mode); null = TEAM only
 * defTeam    the defence he plays next; defWeek its week number
 * matchup    nfl_matchup.json (field.def_pass / league_pass for the leak)
 * players    slate rows, for faces and names in TEAM mode
 * hashSync   read/write view=field&win=&sit= on the URL (the player card)
 */
export default function FieldChart({ team, player = null, defTeam, defWeek = null, matchup, players = [], initialMode = null, hashSync = false, onPlayerClick = null, onOpenTeam = null, fallback = undefined }) {
  const file = useFieldFile(team)
  const pid = player ? String(player.player_id) : null
  const fromHash = useMemo(() => (hashSync ? readHash() : null), [hashSync])
  const [mode, setMode] = useState(initialMode || (pid ? 'PLAYER' : 'TEAM'))
  const [win, setWin] = useState(fromHash?.win || 'SZN')
  const [sit, setSit] = useState(fromHash?.sit || 'NORMAL')
  const [heat, setHeat] = useState(false)
  const [pick, setPick] = useState(null)
  const [howTo, setHowTo] = useState(false)
  const wrap = useRef(null)
  const fieldBox = useRef(null)
  const [cw, setCw] = useState(900)
  const [fw, setFw] = useState(560)
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')

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
  useEffect(() => { if (hashSync && file.state === 'ready') writeHash(win, sit) }, [hashSync, win, sit, file.state])
  // Leaving the Field takes its params with it, so another page's link
  // never carries view=field.
  useEffect(() => () => { if (hashSync) clearHash() }, [hashSync])
  useEffect(() => { setPick(null) }, [mode, win, sit, team, pid])

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

  const mine = mode === 'PLAYER' && pid ? all.filter((p) => p.pid === pid) : all
  const weeksIn = useMemo(() => {
    const ws = mode === 'PLAYER' ? [...new Set(mine.map((p) => p.wk))] : [...(body?.weeks || [])]
    return ws.sort((a, b) => b - a)
  }, [mine, mode, body])
  const winWeeks = (k) => new Set(weeksIn.slice(0, (WINS.find((w) => w[0] === k) || WINS[0])[2]))
  const inWin = (k) => { const s = winWeeks(k); return mine.filter((p) => s.has(p.wk)) }
  const sitOk = (k) => (p) => (k === 'ALL' ? true : k === 'RZ' ? p.yl != null && p.yl <= 20 : p.yl == null || p.yl > 20)
  const windowed = inWin(win)
  const P = windowed.filter(sitOk(sit))
  const drawn = P.filter((p) => p.lane && p.air != null)

  // TEAM mode inks: the four most-targeted in what is drawn.
  const topWho = useMemo(() => {
    if (mode !== 'TEAM') return []
    const n = new Map()
    for (const p of drawn) n.set(p.pid, (n.get(p.pid) || 0) + 1)
    return [...n.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k]) => k)
  }, [mode, drawn])

  // ── the defence ────────────────────────────────────────────────────────
  const model = useMemo(() => fieldModel({ field: matchup?.field, defTeam, mode: 'def', pass: true }), [matchup, defTeam])
  const cells = useMemo(() => {
    const cnt = {}
    for (const p of drawn) { const k = p.lane + bandOf(p.air); cnt[k] = (cnt[k] || 0) + 1 }
    const n = drawn.length || 1
    return LANES.flatMap((L) => BANDS.map((B) => {
      const z = model?.by?.[`${ZONE_SIDE[L]}|${B.key}`]
      const att = z?.att || 0
      return { L, B, k: L + B.key, att, leak: att >= MIN_DEF_ATT && Number.isFinite(z?.leak) ? z.leak : null, n: cnt[L + B.key] || 0, share: (100 * (cnt[L + B.key] || 0)) / n }
    }))
  }, [drawn, model])
  const qualify = cells.filter((c) => c.leak != null).length
  const fillOn = Boolean(model) && qualify >= 6
  const spot = useMemo(() => {
    let best = null
    for (const c of cells) {
      if (c.leak == null || c.leak <= 0 || c.share <= 0) continue
      const v = c.share * c.leak
      if (!best || v > best.v) best = { ...c, v }
    }
    return fillOn ? best : null
  }, [cells, fillOn])

  // ── header + states ──────────────────────────────────────────────────────
  const subjName = mode === 'PLAYER' && player ? player.name : `${team} offence`
  const TL = (t) => <TeamLink t={t} onOpenTeam={onOpenTeam} />
  const lastWk = weeksIn[0] || null
  // On a phone THE SPOT sentence is the subtitle (it is the read, and the
  // card has no room for both); without a spot the one-line subtitle stays.
  const headWith = (lead = null) => (
    <div style={{ marginBottom: phone ? 5 : 8 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontFamily: DISPLAY, fontStretch: 'condensed', fontWeight: 800, fontSize: phone ? 21 : 26, lineHeight: 1.05, letterSpacing: '.01em', textTransform: 'uppercase', color: C.text }}>
          <span style={{ color: C.green }}>The Field</span>
          <span style={{ color: C.text3, margin: '0 .3em' }}>·</span>
          {mode === 'PLAYER' && player
            ? <><a href={playerHref('nfl', pid)} style={linkStyle}>{player.name}</a><span style={{ color: C.text3 }}> · {TL(team)}</span></>
            : <>{TL(team)} offence</>}
        </h3>
      </div>
      {phone && lead ? <div style={{ marginTop: 3 }}>{lead}</div> : phone ? (
        <p style={{ margin: '2px 0 0', fontSize: 12, lineHeight: 1.4, color: C.text2 }}>
          {mode === 'PLAYER' ? 'His targets' : <>{TL(team)}&apos;s targets</>} {sit === 'NORMAL' ? 'outside the 20' : sit === 'RZ' ? 'inside the 20' : 'everywhere'}{defTeam ? <>, over <b style={{ color: C.text }}>{TL(defTeam)}</b>&apos;s leaks{defWeek ? ` (wk ${defWeek})` : ''}</> : null}.
        </p>
      ) : (
      <p style={{ margin: '3px 0 0', fontSize: 12, lineHeight: 1.45, color: C.text2, maxWidth: 720 }}>
        {mode === 'PLAYER' ? 'Where he catches the ball' : <>Where {TL(team)} throw it</>}
        {sit === 'NORMAL' ? ' on normal downs — outside the 20 —' : sit === 'RZ' ? ' inside the 20' : ' all over the field'}
        {defTeam ? <> and where <b style={{ color: C.text }}>{TL(defTeam)}</b>{defWeek ? <>, {mode === 'PLAYER' ? 'his' : 'their'} week {defWeek} opponent,</> : null} gives up yards</> : null}.
        {' The red zone is the strip under the field.'}
      </p>
      )}
    </div>
  )
  const head = headWith()

  if (file.state === 'loading') return <section ref={wrap}>{head}<ChartEmpty theme={C}>Loading every target…</ChartEmpty></section>
  // No file yet (the bot publishes nfl_field_{TEAM}.json from 2026-09-30):
  // the caller's fallback (the card keeps football's spray chart), else the
  // honest line.
  if ((file.state === 'error' || file.state === 'none') && fallback !== undefined) return fallback
  if (file.state === 'error' || file.state === 'none') return <section ref={wrap}>{head}<ChartEmpty theme={C}>Couldn&apos;t load {team}&apos;s plays file. The field draws from nfl_field_{team}.json and it isn&apos;t published yet.</ChartEmpty></section>
  if (!mine.length) return <section ref={wrap}>{head}<ChartEmpty theme={C}>{mode === 'PLAYER' ? `No targets for ${player?.name || 'him'} in ${body?.season || 'this'} season's play-by-play yet.` : `No targets for ${team} yet.`}</ChartEmpty></section>

  // ── the chips ────────────────────────────────────────────────────────────
  const chipH = phone ? { minHeight: 44, padding: '0 11px', fontSize: 11, whiteSpace: 'nowrap', flexShrink: 0 } : { minHeight: 32, padding: '0 10px', fontSize: 10.5, whiteSpace: 'nowrap' }
  const dock = (
    <div className="field-dock" style={{
      display: 'flex', alignItems: 'center', gap: 5, marginBottom: phone ? 6 : 8,
      ...(phone ? { flexWrap: 'nowrap', overflowX: 'auto', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', margin: '0 -2px 6px', padding: '0 2px' } : { flexWrap: 'wrap' }),
    }}>
      {pid && (
        <ChipGroup first theme={C} numFont={NUM_FONT} color={C.green} value={mode} onChange={setMode} chipStyle={chipH}
          options={[{ k: 'PLAYER', label: 'PLAYER', n: null, title: `${player?.name}'s targets` }, { k: 'TEAM', label: 'TEAM', n: null, title: `Every target ${team} threw` }]} />
      )}
      <ChipGroup first={!pid} label={phone ? null : 'Window'} theme={C} numFont={NUM_FONT} color={C.cyan} value={win} onChange={setWin} chipStyle={chipH}
        options={WINS.map(([k, label, n]) => ({ k, label, n: k === 'SZN' ? null : inWin(k).filter(sitOk(sit)).length, title: k === 'SZN' ? 'The whole season' : `The last ${n === 1 ? 'game' : `${n} games`} ${mode === 'PLAYER' ? 'he was targeted in' : `${team} played`}` }))} />
      <ChipGroup label={phone ? null : 'Plays'} theme={C} numFont={NUM_FONT} color={C.amber} value={sit} onChange={setSit} chipStyle={chipH}
        options={SITS.map(([k, label]) => ({ k, label, n: windowed.filter(sitOk(k)).length, title: k === 'NORMAL' ? 'Outside the 20' : k === 'RZ' ? 'Inside the 20' : 'Every target' }))} />
      <ChipGroup theme={C} numFont={NUM_FONT} color={C.cream} value={heat ? 'HEAT' : ''} onChange={() => setHeat((v) => !v)} chipStyle={chipH}
        options={[{ k: 'HEAT', label: 'HEAT', n: null, title: `Shade each zone by ${mode === 'PLAYER' ? 'his' : 'their'} share of targets` }]} />
      {phone && <ChipGroup theme={C} numFont={NUM_FONT} color={C.text2} value={howTo ? 'HOW' : ''} onChange={() => setHowTo((v) => !v)} chipStyle={chipH}
        options={[{ k: 'HOW', label: 'HOW TO READ', n: null, title: 'What the dots, rings and colours mean' }]} />}
    </div>
  )

  // ── the field ────────────────────────────────────────────────────────────
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

  const parts = []
  // turf + mow bands: alternate five-yard stripes, two steps apart
  parts.push(<rect key="turf" x={0} y={0} width={W} height={H} fill={C.turf2} />)
  for (let a = -10; a < 36; a += 5) {
    if (Math.round(a / 5) % 2 === 0) continue
    const top = Y(Math.min(36, a + 5)), bot = Y(Math.max(-6, a))
    if (bot > top) parts.push(<rect key={`mow${a}`} x={x0} y={top} width={x1 - x0} height={bot - top} fill={C.turf1} />)
  }
  parts.push(<rect key="vig" x={x0} y={yTop} width={x1 - x0} height={yBot - yTop} fill={`url(#vig${uid})`} />)

  // cells
  for (const c of cells) {
    const li = LANES.indexOf(c.L)
    const bx = cx0 + li * lw, by = Y(c.B.hi), bh = Y(c.B.lo) - by
    const ins = u(1.5)
    if (fillOn && c.leak != null) {
      parts.push(<rect key={`f${c.k}`} x={bx + ins} y={by + ins} width={lw - 2 * ins} height={bh - 2 * ins} rx={u(2)}
        fill={c.leak > 0 ? C.green : C.pink} opacity={(QUIET * Math.min(0.42, Math.abs(c.leak) / 90 + 0.05)).toFixed(3)} />)
    } else if (model) {
      parts.push(<rect key={`h${c.k}`} x={bx + ins} y={by + ins} width={lw - 2 * ins} height={bh - 2 * ins} rx={u(2)} fill={`url(#hatch${uid})`} />)
    }
    if (heat && c.n) {
      parts.push(<rect key={`ht${c.k}`} x={bx + ins} y={by + ins} width={lw - 2 * ins} height={bh - 2 * ins} rx={u(2)} fill={C.cream} opacity={(0.05 + (0.4 * Math.min(40, c.share)) / 40).toFixed(3)} />)
    }
  }
  // lane boundaries, quiet
  for (const bxl of [cx0, cx0 + lw, cx0 + 2 * lw, cx1]) {
    parts.push(<line key={`lb${bxl}`} x1={bxl} y1={yTop} x2={bxl} y2={yBot} stroke={C.cream} strokeOpacity={bxl === cx0 || bxl === cx1 ? 0.22 : 0.07} vectorEffect="non-scaling-stroke" strokeWidth={1} />)
  }
  // yard lines every 5 (10s brighter); numbers every 10 in the sidelines
  for (let a = -5; a <= 35; a += 5) {
    if (a === 0) continue
    parts.push(<line key={`yl${a}`} x1={x0} y1={Y(a)} x2={x1} y2={Y(a)} stroke={C.cream} strokeOpacity={a % 10 === 0 ? 0.28 : 0.14} vectorEffect="non-scaling-stroke" strokeWidth={1} />)
  }
  // hash ticks every yard at the two lane boundaries
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
  // line of scrimmage
  parts.push(<line key="los" x1={x0} y1={Y(0)} x2={x1} y2={Y(0)} stroke={C.ice} strokeWidth={2.4} vectorEffect="non-scaling-stroke" />)

  // cell labels: leak top-left, targets top-right (desktop)
  const labels = []
  const KO = { stroke: C.turf2, strokeWidth: u(3), strokeOpacity: 0.85, style: { paintOrder: 'stroke' }, strokeLinejoin: 'round' }
  if (fillOn) {
    for (const c of cells) {
      const li = LANES.indexOf(c.L)
      const bx = cx0 + li * lw, by = Y(c.B.hi)
      if (c.leak != null) {
        labels.push(<text key={`lk${c.k}`} x={bx + u(7)} y={by + u(16)} fontFamily={NUM_FONT} fontWeight={800} fontSize={u(labelPx)} fill={c.leak > 0 ? C.green : C.pink} {...KO}>{pct(c.leak)}</text>)
      } else {
        labels.push(<text key={`lk${c.k}`} x={bx + u(7)} y={by + u(16)} fontFamily={NUM_FONT} fontWeight={700} fontSize={u(labelPx)} fill={C.text3} {...KO}>thin</text>)
      }
      if (!phone && c.att) labels.push(<text key={`nt${c.k}`} x={bx + lw - u(7)} y={by + u(16)} textAnchor="end" fontFamily={NUM_FONT} fontWeight={700} fontSize={u(labelPx)} fill={C.text3} {...KO}>{c.att} tgt</text>)
    }
  }
  // band labels down the left, lane labels under
  for (const B of BANDS) {
    labels.push(<text key={`bl${B.key}`} x={x0 - u(6)} y={(Y(B.lo) + Y(B.hi)) / 2} dy=".35em" textAnchor="end" fontFamily={NUM_FONT} fontWeight={800} fontSize={u(labelPx)} fill={C.text3}>{B.label}</text>)
  }
  LANES.forEach((L, li) => labels.push(<text key={`ln${L}`} x={cx0 + li * lw + lw / 2} y={H - u(phone ? 6 : 8)} textAnchor="middle" fontFamily={NUM_FONT} fontWeight={800} fontSize={u(labelPx)} letterSpacing={u(1)} fill={C.text3}>{{ L: 'LEFT', M: 'MIDDLE', R: 'RIGHT' }[L]}</text>))

  // THE SPOT badge, bottom-right of its cell; the LOS label avoids it
  let badge = null
  if (spot) {
    const li = LANES.indexOf(spot.L)
    const bx = cx0 + li * lw, by = Y(spot.B.hi), bh = Y(spot.B.lo) - by
    const bw = Math.min(u(phone ? 58 : 66), lw - u(8)), bhh = u(phone ? 16 : 19)
    badge = { x: bx + lw - u(6) - bw, y: by + bh - u(6) - bhh, w: bw, h: bhh, cell: { bx, by, bh } }
  }
  const losText = 'LINE OF SCRIMMAGE'
  const losW = u(losText.length * labelPx * 0.62)
  let losX = cx0 + u(6), losAnchor = 'start'
  const losY = Y(0) - u(6)
  if (badge && losX < badge.x + badge.w && losX + losW > badge.x && losY > badge.y - u(2) && losY - u(labelPx) < badge.y + badge.h) { losX = cx1 - u(6); losAnchor = 'end' }
  if (badge && losAnchor === 'end' && losX - losW < badge.x + badge.w && losX > badge.x && losY > badge.y - u(2) && losY - u(labelPx) < badge.y + badge.h) { losX = cx0 + lw + lw / 2; losAnchor = 'middle' }
  labels.push(<text key="loslbl" x={losX} y={losY} textAnchor={losAnchor} fontFamily={NUM_FONT} fontWeight={800} fontSize={u(phone ? 10 : 10.5)} letterSpacing={u(0.8)} fill={C.ice} {...KO}>{losText}</text>)

  // share rings
  const rings = []
  for (const c of cells) {
    if (c.share < 2) continue
    const li = LANES.indexOf(c.L)
    const bx = cx0 + li * lw, by = Y(c.B.hi), bh = Y(c.B.lo) - by
    const r = 6 + 34 * Math.sqrt(c.share / 100)
    rings.push(<circle key={`r${c.k}`} cx={bx + lw / 2} cy={by + bh / 2} r={Math.min(r, bh / 2 - u(2))} fill="none" stroke={C.cream} strokeOpacity={0.3} strokeWidth={1.2} vectorEffect="non-scaling-stroke" strokeDasharray="3 3" />)
  }

  // dots: misses under catches under touchdowns, so the loudest thing sits on top
  const order = { inc: 0, int: 0, catch: 1, td: 2 }
  const dots = [...drawn].sort((a, b) => (order[a.res] - order[b.res]) || (a.i - b.i)).map((p) => {
    const li = LANES.indexOf(p.lane)
    const cx = cx0 + li * lw + lw / 2 + jitter(p.i) * lw * 0.72
    const cy = Y(p.air)
    const on = pick === p.i
    const r = (3.6 + (Math.min(25, p.yac || 0) / 25) * 4.4) * dotScale
    const who = mode === 'TEAM' ? topWho.indexOf(p.pid) : 0
    const ink = mode === 'TEAM' ? (who >= 0 ? WHO_INK[who] : C.text3) : C.cream
    const td = p.res === 'td'
    const caught = p.res === 'catch' || td
    const fill = td ? C.orange : caught ? ink : 'none'
    const stroke = on ? C.ice : td ? C.orange : ink
    const label = `${td ? 'Touchdown' : p.res === 'catch' ? 'Catch' : p.res === 'int' ? 'Intercepted' : 'Incomplete'}, ${p.air} air yards, ${LANE_WORD[p.lane]} lane, week ${p.wk}${mode === 'TEAM' ? `, ${nameOf(p.pid)}` : ''}`
    return (
      <g key={`d${p.i}`} role="button" tabIndex={0} aria-label={label} aria-pressed={on}
        onClick={() => setPick(on ? null : p.i)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPick(on ? null : p.i) } }}
        style={{ cursor: 'pointer', outline: 'none' }}>
        {td && <>
          <circle cx={cx} cy={cy} r={r + 7 * dotScale} fill={C.orange} opacity={0.18} />
          <circle cx={cx} cy={cy} r={r + 4 * dotScale} fill={C.orange} opacity={0.55} filter={`url(#glow${uid})`} />
        </>}
        <circle cx={cx} cy={cy} r={on ? r + 2.5 * dotScale : r} fill={fill} fillOpacity={td ? 1 : 0.9}
          stroke={stroke} strokeWidth={on ? 2 : 1.3} vectorEffect="non-scaling-stroke" />
        {/* 44px to tap; where two overlap, the one drawn later (louder) wins */}
        <circle cx={cx} cy={cy} r={u(22)} fill="transparent" />
      </g>
    )
  })

  if (badge) {
    labels.push(<rect key="spotcell" x={badge.cell.bx + u(1.5)} y={badge.cell.by + u(1.5)} width={lw - u(3)} height={badge.cell.bh - u(3)} rx={u(2)} fill="none" stroke={C.orange} strokeOpacity={0.75} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />)
    labels.push(<g key="spot" aria-hidden="true">
      <rect x={badge.x} y={badge.y} width={badge.w} height={badge.h} rx={u(3)} fill={C.orange} />
      <text x={badge.x + badge.w / 2} y={badge.y + badge.h / 2} dy=".35em" textAnchor="middle" fontFamily={NUM_FONT} fontWeight={900} fontSize={Math.min(u(phone ? 9.5 : 10.5), (badge.w - u(6)) / 5.6)} letterSpacing={u(0.4)} fill={C.bg}>THE SPOT</text>
    </g>)
  }

  const field = (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${subjName}: ${drawn.length} targets by depth and lane${defTeam ? `, over ${defTeam}'s yards allowed by zone` : ''}`}
      style={{ display: 'block', width: '100%', height: 'auto', borderRadius: 8 }}>
      <defs>
        <linearGradient id={`vig${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={C.bg} stopOpacity=".55" />
          <stop offset=".35" stopColor={C.bg} stopOpacity="0" />
          <stop offset=".85" stopColor={C.bg} stopOpacity="0" />
          <stop offset="1" stopColor={C.bg} stopOpacity=".35" />
        </linearGradient>
        <pattern id={`hatch${uid}`} width={u(7)} height={u(7)} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2={u(7)} stroke={C.cream} strokeOpacity=".07" strokeWidth={u(2)} />
        </pattern>
        <filter id={`glow${uid}`} x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation={3 * dotScale} /></filter>
      </defs>
      {parts}{rings}{dots}{labels}
    </svg>
  )

  // ── the rail ─────────────────────────────────────────────────────────────
  const ct = P.filter((p) => p.res === 'catch' || p.res === 'td')
  const tds = P.filter((p) => p.res === 'td').length
  const yds = P.reduce((s, p) => s + (p.gain || 0), 0)
  const airs = P.filter((p) => p.air != null)
  const stats = [
    ['TARGETS', P.length, C.text], ['CATCHES', ct.length, C.text], ['YARDS', yds, C.text], ['TD', tds, C.orange],
    ['AIR / TGT', airs.length ? one(airs.reduce((s, p) => s + p.air, 0) / airs.length) : '—', C.text2],
    ['YAC / CATCH', ct.length ? one(ct.reduce((s, p) => s + (p.yac || 0), 0) / ct.length) : '—', C.text2],
  ]
  const statBlock = phone ? (
    <div role="list" style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 2, marginTop: 8 }}>
      {stats.map(([l, v, col]) => (
        <div key={l} role="listitem" style={{ textAlign: 'center', minWidth: 0 }}>
          <div style={{ fontFamily: DISPLAY, fontStretch: 'condensed', fontWeight: 800, fontSize: 19, lineHeight: 1, color: col }}>{v}</div>
          <div style={{ fontFamily: NUM_FONT, fontSize: 9.5, fontWeight: 800, color: C.text3, marginTop: 2, whiteSpace: 'nowrap', letterSpacing: '.02em' }}>{{ TARGETS: 'TGT', CATCHES: 'REC', YARDS: 'YDS', TD: 'TD', 'AIR / TGT': 'AIR', 'YAC / CATCH': 'YAC' }[l]}</div>
        </div>
      ))}
    </div>
  ) : (
    <dl style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 14px', margin: 0 }}>
      {stats.map(([l, v, col]) => (
        <div key={l} style={{ minWidth: 0 }}>
          <dt style={{ fontFamily: NUM_FONT, fontSize: 10, fontWeight: 800, letterSpacing: '.08em', color: C.text3 }}>{l}</dt>
          <dd style={{ margin: '2px 0 0', fontFamily: DISPLAY, fontStretch: 'condensed', fontWeight: 800, fontSize: 30, lineHeight: 1, color: col }}>{v}</dd>
        </div>
      ))}
    </dl>
  )

  const picked = pick != null ? all[pick] : null
  const cardLines = picked ? (() => {
    const p = picked
    const head1 = p.res === 'td' ? 'TOUCHDOWN' : p.res === 'catch' ? 'CATCH' : p.res === 'int' ? 'INTERCEPTED' : 'INCOMPLETE'
    const yardsBit = p.res === 'catch' || p.res === 'td' ? ` · ${p.air} air + ${p.yac} yac` : p.air != null ? ` · ${p.air} air` : ''
    const q = p.q ? (p.q >= 5 ? 'OT' : `Q${p.q}`) : null
    const l2 = [`WK ${p.wk}${p.opp ? ` vs ${p.opp}` : ''}`, q, p.dn && p.tg != null ? `${p.dn}&${p.tg} ${yardWords(p.yl)}` : yardWords(p.yl)].filter(Boolean).join(' · ')
    const l3 = [p.lane ? `${LANE_WORD[p.lane]} lane` : null, p.hash ? `snapped from the ${{ L: 'left', R: 'right', M: 'middle' }[p.hash]} hash` : null,
      p.box ? `${p.box} in the box` : null, p.sc ? 'screen' : null, p.pa ? 'play action' : null,
      p.epa != null ? `${p.epa > 0 ? '+' : ''}${p.epa.toFixed(2)} EPA` : null].filter(Boolean).join(' · ')
    return { head1, yardsBit, l2, l3, who: mode === 'TEAM' ? nameOf(p.pid) : null, td: p.res === 'td' }
  })() : null
  const card = (
    <div aria-live="polite" style={{ fontFamily: NUM_FONT, fontSize: 11.5, lineHeight: 1.6, color: C.text2 }}>
      {cardLines ? <>
        <div><b style={{ color: cardLines.td ? C.orange : C.cream, letterSpacing: '.04em' }}>{cardLines.head1}</b>{cardLines.yardsBit}{cardLines.who ? <span style={{ color: C.text }}> · <a href={playerHref('nfl', picked.pid)} style={linkStyle}>{cardLines.who}</a></span> : null}</div>
        <div>{cardLines.l2}</div>
        {cardLines.l3 && <div style={{ color: C.text3 }}>{cardLines.l3}</div>}
      </> : <span style={{ color: C.text3 }}>Tap a target for the play.</span>}
    </div>
  )

  const spotLine = spot && phone ? (
    <div style={{ fontSize: 12, lineHeight: 1.45, color: C.text2 }}>
      <b style={{ color: C.orange, fontFamily: NUM_FONT, letterSpacing: '.06em' }}>THE SPOT</b> · {LANE_WORD[spot.L]}, {spot.B.label === 'BEHIND' ? 'behind the line' : spot.B.label}: {Math.round(spot.share)}% of {mode === 'PLAYER' ? 'his' : 'their'} targets, {TL(defTeam)} <b style={{ color: C.green }}>{pct(spot.leak)}</b> yds/tgt vs the league.
    </div>
  ) : spot ? (
    <div style={{ fontSize: 12, lineHeight: 1.5, color: C.text2 }}>
      <b style={{ color: C.orange, fontFamily: NUM_FONT, letterSpacing: '.06em' }}>THE SPOT</b> · {LANE_WORD[spot.L]} lane, {spot.B.label === 'BEHIND' ? 'behind the line' : `${spot.B.label} yards`}: {Math.round(spot.share)}% of {mode === 'PLAYER' ? 'his' : 'their'} targets go into a zone where {TL(defTeam)} gives up <b style={{ color: C.green }}>{pct(spot.leak)}</b> yards a target vs the league.
    </div>
  ) : (
    <div style={{ fontSize: 12, lineHeight: 1.5, color: C.text3 }}>
      {fillOn ? <>No zone where {mode === 'PLAYER' ? 'his' : 'their'} targets and {TL(defTeam)}&apos;s leaks line up in this window.</> : null}
    </div>
  )
  const thinCaption = model && !fillOn ? (
    <div style={{ fontSize: 11, color: C.text3, marginTop: 6, lineHeight: 1.5 }}>
      {TL(defTeam)}&apos;s leak by zone shows after {MIN_DEF_ATT} targets in a zone · {qualify} of 12 qualify{lastWk ? ` after week ${lastWk}` : ''}.
    </div>
  ) : null

  const anyCatch = drawn.some((p) => p.res === 'catch')
  const anyMiss = drawn.some((p) => p.res === 'inc' || p.res === 'int')
  const anyTd = drawn.some((p) => p.res === 'td')
  const sw = (fill, stroke = fill, glow = false, dashed = false) => (
    <i aria-hidden="true" style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', boxSizing: 'border-box', background: fill === 'none' ? 'transparent' : fill, border: `1.5px ${dashed ? 'dashed' : 'solid'} ${stroke}`, boxShadow: glow ? `0 0 6px ${C.orange}` : 'none', flexShrink: 0 }} />)
  const box = (col) => <i aria-hidden="true" style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: col, opacity: 0.6 }} />
  const legendItems = [
    mode === 'PLAYER' && anyCatch && { key: 'c', mark: sw(C.cream), label: 'catch' },
    anyMiss && { key: 'i', mark: sw('none', mode === 'PLAYER' ? C.cream : C.text2), label: 'incomplete' },
    anyTd && { key: 't', mark: sw(C.orange, C.orange, true), label: 'touchdown' },
    !phone && drawn.length > 0 && { key: 's', mark: null, label: 'size = yards after catch' },
    fillOn && cells.some((c) => c.leak > 0) && { key: 'lk', mark: box(C.green), label: 'leaks' },
    fillOn && cells.some((c) => c.leak != null && c.leak < 0) && { key: 'st', mark: box(C.pink), label: 'stingy' },
    !phone && cells.some((c) => c.share >= 2) && { key: 'r', mark: sw('none', C.text3, false, true), label: 'dashed ring = share of targets' },
    ...(mode === 'TEAM' ? topWho.map((w, i) => ({ key: `w${w}`, mark: sw(WHO_INK[i]), label: <a href={playerHref('nfl', w)} onClick={onPlayerClick && byPid.get(String(w)) ? (e) => { e.preventDefault(); onPlayerClick(byPid.get(String(w))) } : undefined} style={linkStyle}>{nameOf(w)}</a> })) : []),
    mode === 'TEAM' && drawn.some((p) => !topWho.includes(p.pid)) && { key: 'rest', mark: sw(C.text3), label: 'everyone else' },
  ].filter(Boolean)

  // ── the strip ────────────────────────────────────────────────────────────
  const rzWeeks = winWeeks(win)
  const rz = (body?.redzone || []).map((r, i) => Object.fromEntries((body.rz_cols || []).map((c, j) => [c, r[j]]).concat([['seed', i]])))
    .filter((t) => rzWeeks.has(t.wk) || win === 'SZN')
  const rzBy = new Map()
  for (const t of rz) { if (!rzBy.has(t.pid)) rzBy.set(t.pid, []); rzBy.get(t.pid).push(t) }
  let stripIds = mode === 'PLAYER' && pid ? [pid] : [...rzBy.keys()].sort((a, b) => rzBy.get(b).length - rzBy.get(a).length).slice(0, 5)
  if (mode === 'TEAM' && pid && !stripIds.includes(pid) && rzBy.has(pid)) stripIds = [...stripIds.slice(0, 4), pid]
  const stripRows = stripIds.map((id) => ({ key: id, name: nameOf(id), href: playerHref('nfl', id), player: byPid.get(String(id)) || { name: nameOf(id), team }, clickable: byPid.has(String(id)), touches: rzBy.get(id) || [] }))
  const stripKicker = (
    <div style={{ fontFamily: NUM_FONT, fontSize: 10.5, fontWeight: 800, letterSpacing: '.08em', color: C.text3, margin: '10px 0 4px' }}>
      <span style={{ color: C.orange }}>RED ZONE</span>{phone ? ' · every touch inside the 20' : ' · every touch inside the 20, by distance to the goal line'}
    </div>
  )
  const strip = stripRows.some((r) => r.touches.length)
    ? <RedZoneStrip rows={stripRows} kicker={phone ? null : stripKicker} phone={phone} onPlayerClick={onPlayerClick}
        rulerLabel={phone ? <span style={{ color: C.orange }}>RED ZONE</span> : null} />
    : <>{stripKicker}<ChartEmpty theme={C} style={{ padding: '2px 0' }}>No red-zone touches{mode === 'PLAYER' ? ' for him' : ''} in this window.</ChartEmpty></>

  const notes = (
    <div style={{ fontSize: 11, lineHeight: 1.55, color: C.text3, display: 'grid', gap: 6 }}>
      {phone && <div>Dot size = yards after catch · dashed ring = his share of targets in the zone.</div>}
      <div><b style={{ color: C.text2 }}>How the dots are placed.</b> Up the field is the real air yards, from the line of scrimmage. Across is only the lane the play-by-play charts (left, middle, right); inside a lane the spread is a fixed scatter so dots don&apos;t stack, not where the ball was caught.</div>
      <div><b style={{ color: C.text2 }}>What this is not.</b> Not a coverage or a cornerback matchup. A zone&apos;s colour is {defTeam ? TL(defTeam) : 'the defence'}&apos;s yards a target there against the league&apos;s, every situation, {matchup?.season || ''} — the same number as the Matchup map.</div>
    </div>
  )

  const emptyWin = !P.length ? <ChartEmpty theme={C} style={{ padding: '4px 0 0' }}>No {sit === 'RZ' ? 'red-zone ' : ''}targets in this window — try SZN{sit !== 'ALL' ? ' or ALL' : ''}.</ChartEmpty> : null

  return (
    <section ref={wrap} aria-label={`The Field: ${subjName}`} style={{ margin: '4px 0 12px' }}>
      {headWith(phone && spot ? spotLine : null)}
      {dock}
      <ChartCard theme={C} className="field-card" style={phone ? { display: 'block', padding: 7 } : { gap: 18, padding: 12, flexWrap: 'nowrap' }}>
        <div style={{ flex: '1 1 auto', minWidth: 0, maxWidth: phone ? 'none' : 680 }}>
          <div ref={fieldBox}>{field}</div>
          {thinCaption}
          {emptyWin}
          <ChartLegend theme={C} items={legendItems} style={phone ? { gap: '0 10px', marginTop: 6, fontSize: 11 } : { marginTop: 6 }} />
          {phone && howTo && <div style={{ margin: '0 0 6px' }}>{notes}</div>}
          {phone && statBlock}
          {strip}
        </div>
        {!phone && (
          <div style={{ flex: '1 0 280px', maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
            {statBlock}
            <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 10, minHeight: 64 }}>{card}</div>
            {spotLine}
            {notes}
          </div>
        )}
        {phone && !spot && <div style={{ marginTop: 8 }}>{spotLine}</div>}
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
