'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { clean } from '../lib/player'

// ◎ LIVE PITCH PLOT + 🗺 LIVE GAME SPRAY (2026-08-09, Donovan: "see live
// where all the pitches are going, if they're in the zone, actual dots — and
// a live spray chart of the whole game, where everything's going"; then
// "go hard at making the live pitches and spray better and intuitive... make
// this into something very useful").
//
// Both are REAL PLOTTED COORDINATES from the live feed, verified before this
// file was written (gamePk 823425, mid-game): 324 of 324 pitches carried
// pitchData.coordinates.pX/pZ AND a per-batter strikeZoneTop/Bottom, and 57
// of 57 batted balls carried hitData.coordinates.coordX/coordY. Nothing here
// is modeled — every dot is where the ball actually was.
//
// EVERY FIELD READ HERE WAS VERIFIED PRESENT AND POPULATED IN A LIVE FEED:
//   playEvents[].isPitch · pitchData.coordinates.pX/pZ · strikeZoneTop/Bottom
//   pitchData.startSpeed · details.type.code/.description
//   details.call.description · details.isInPlay/.isStrike/.isBall
//   hitData.coordinates.coordX/coordY · launchSpeed · launchAngle
//   totalDistance · trajectory
//   matchup.batter/.pitcher {id, fullName} · about.inning/.halfInning
//   result.event/.description
//
// NOTHING ELSE IS TOUCHED. In particular the BALL-STRIKE COUNT and the
// PITCH NUMBER inside an at-bat are DERIVED here from the verified
// isBall / isStrike / isInPlay / call.description sequence rather than read
// off a `count` object — one fewer unverified field, and it can't disagree
// with the dots that are actually drawn, because it's built from them.
//
// PITCH PLOT geometry: pX is feet from the center of the plate (catcher's
// view, negative = the batter's right on a RHB... which is why the plot is
// drawn from the CATCHER'S view like every zone map on this site, x flipped
// so it reads the same way). pZ is feet above the ground. The zone box uses
// the batter's OWN top/bottom from that pitch, averaged over the pitches
// shown — a zone drawn at a fixed height would be a lie for a 5'6" hitter.
//
// SPRAY geometry: Statcast's hit coordinates are a fixed 250x250 grid with
// home plate at roughly (125.42, 198.27) and y INVERTED (small y = deep), at
// 2.5 feet per grid unit. That's the same transform SprayField uses, so the
// two charts agree. The spray SVG works directly in grid units (viewBox), so
// the field is never stretched out of square.

const FEED = 'liveData,plays,allPlays,playEvents,isPitch,pitchData,coordinates,pX,pZ,zone,strikeZoneTop,strikeZoneBottom,startSpeed,details,type,code,description,call,isInPlay,isStrike,isBall,hitData,launchSpeed,launchAngle,totalDistance,coordX,coordY,trajectory,matchup,batter,pitcher,id,fullName,result,event,about,halfInning,inning,gameData,teams,home,away,abbreviation'

// pitch families → the site's existing pitch language
const PCOL = {
  FF: '#f87171', FA: '#f87171', SI: '#fb923c', FT: '#fb923c', FC: '#fbbf24',
  SL: '#22d3ee', ST: '#67e8f9', SV: '#67e8f9', CU: '#a78bfa', KC: '#c4b5fd',
  CS: '#c4b5fd', CH: '#4ade80', FS: '#86efac', FO: '#86efac', KN: '#9ca3af',
  EP: '#9ca3af',
}
const pcol = (t) => PCOL[t] || '#9ca3af'
const PITCH_NAMES = {
  FF: '4-seam', FA: 'Fastball', SI: 'Sinker', FT: 'Two-seam', FC: 'Cutter',
  SL: 'Slider', ST: 'Sweeper', SV: 'Slurve', CU: 'Curve', KC: 'Knuckle curve',
  CS: 'Slow curve', CH: 'Changeup', FS: 'Splitter', FO: 'Forkball',
  KN: 'Knuckleball', EP: 'Eephus',
}

// RESULT ENCODING — the whole point of the redraw (owner: "make it
// intuitive"). Hollow-vs-filled could only say two things, and there are five
// outcomes that matter. Now the SHAPE says what happened and the COLOR says
// what was thrown, so you can read "he's missing bats with the slider down"
// off the picture without a single label:
//
//   ○ ring     taken for a ball        (dim — the ones he didn't offer at)
//   ◎ halo     CALLED STRIKE           (ring inside a ring: a free strike)
//   ✕ cross    SWING AND MISS          (the loudest mark on the plot)
//   ▢ square   FOULED OFF              (he touched it)
//   ★ star     PUT IN PLAY             (biggest mark — the at-bat ended here)
//   ◇ diamond  HIT BY PITCH
const KIND_LABEL = {
  ball: 'ball', called: 'called strike', whiff: 'swing & miss',
  foul: 'foul', inplay: 'in play', hbp: 'hit by pitch',
}
const SWUNG = new Set(['whiff', 'foul', 'inplay'])
const STRIKEISH = new Set(['called', 'whiff', 'foul', 'inplay'])

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)

// ── shared marker painter for the pitch plot ────────────────────────────────
function PitchMark({ kind, x, y, col, r, dim }) {
  const op = dim ? 0.28 : 1
  if (kind === 'whiff') {
    const a = r * 1.25
    return (
      <g opacity={op}>
        <line x1={x - a} y1={y - a} x2={x + a} y2={y + a} stroke={col} strokeWidth={2.1} strokeLinecap="round" />
        <line x1={x - a} y1={y + a} x2={x + a} y2={y - a} stroke={col} strokeWidth={2.1} strokeLinecap="round" />
      </g>
    )
  }
  if (kind === 'inplay') {
    const R = r * 1.75, r2 = R * 0.44
    const pts = []
    for (let i = 0; i < 10; i += 1) {
      const rad = (Math.PI / 5) * i - Math.PI / 2
      const rr = i % 2 === 0 ? R : r2
      pts.push(`${(x + Math.cos(rad) * rr).toFixed(2)},${(y + Math.sin(rad) * rr).toFixed(2)}`)
    }
    return <polygon points={pts.join(' ')} fill={col} stroke="#09090b" strokeWidth={0.7} opacity={op} />
  }
  if (kind === 'foul') {
    const s = r * 0.95
    return <rect x={x - s} y={y - s} width={s * 2} height={s * 2} rx={0.6} fill={col} fillOpacity={0.45} stroke={col} strokeWidth={1.2} opacity={op} />
  }
  if (kind === 'hbp') {
    const s = r * 1.3
    return <polygon points={`${x},${y - s} ${x + s},${y} ${x},${y + s} ${x - s},${y}`} fill="none" stroke={col} strokeWidth={1.6} opacity={op} />
  }
  if (kind === 'called') {
    return (
      <g opacity={op}>
        <circle cx={x} cy={y} r={r} fill={col} fillOpacity={0.22} stroke={col} strokeWidth={1.6} />
        <circle cx={x} cy={y} r={r + 2.6} fill="none" stroke={col} strokeWidth={0.9} opacity={0.55} />
      </g>
    )
  }
  // ball — taken, out of the zone or not
  return <circle cx={x} cy={y} r={r * 0.9} fill="none" stroke={col} strokeWidth={1.3} opacity={op * 0.62} />
}

export default function LivePitchPlot({ gamePk, batterId = null, batterName = '', compact = false }) {
  const [data, setData] = useState(undefined)
  const [scope, setScope] = useState(batterId ? 'batter' : 'game')  // batter | pitcher | game
  const [heat, setHeat] = useState(false)
  const [seqOn, setSeqOn] = useState(true)
  const [typePick, setTypePick] = useState(null)   // null = all pitch types
  const [sprayMode, setSprayMode] = useState('result')  // result | ev | dist
  const [auto, setAuto] = useState(true)
  const timer = useRef(null)

  const pull = async () => {
    if (!gamePk) return
    const j = await fetch(`https://statsapi.mlb.com/api/v1.1/game/${gamePk}/feed/live?fields=${FEED}`)
      .then((r) => (r.ok ? r.json() : null)).catch(() => null)
    setData(j || null)
  }
  useEffect(() => { setData(undefined); setTypePick(null); pull() }, [gamePk])
  useEffect(() => { setScope(batterId ? 'batter' : 'game'); setTypePick(null) }, [batterId])
  useEffect(() => {
    clearInterval(timer.current)
    if (auto) timer.current = setInterval(() => { if (!document.hidden) pull() }, 25000)
    return () => clearInterval(timer.current)
  }, [auto, gamePk])

  // ── one pass over the feed: every pitch, every batted ball, and the count
  //    rebuilt from the pitches themselves ───────────────────────────────────
  const model = useMemo(() => {
    const plays = data?.liveData?.plays?.allPlays || []
    const pitches = []
    const balls = []
    const meta = []
    plays.forEach((pl, pi) => {
      const bid = Number(pl?.matchup?.batter?.id) || null
      const bname = clean(pl?.matchup?.batter?.fullName, '')
      const pid = Number(pl?.matchup?.pitcher?.id) || null
      const pname = clean(pl?.matchup?.pitcher?.fullName, '')
      const half = String(pl?.about?.halfInning || '')
      const inn = pl?.about?.inning
      const event = clean(pl?.result?.event, '')
      let b = 0, s = 0, seq = 0, any = false
      ;(pl.playEvents || []).forEach((e) => {
        if (e?.isPitch) {
          any = true
          const call = clean(e?.details?.call?.description, '')
          const inPlay = !!e?.details?.isInPlay
          const isStrike = !!e?.details?.isStrike
          const isBall = !!e?.details?.isBall
          const kind = inPlay ? 'inplay'
            : /hit by pitch/i.test(call) ? 'hbp'
            : /swinging strike|missed bunt/i.test(call) ? 'whiff'
            : /foul/i.test(call) ? 'foul'
            : /called strike|automatic strike/i.test(call) ? 'called'
            : isBall ? 'ball'
            : isStrike ? 'called'
            : 'ball'
          seq += 1
          const cnt = `${b}-${s}`
          if (e?.pitchData?.coordinates?.pX != null) {
            pitches.push({
              pi, bid, bname, pid, pname, half, inn, seq, cnt, kind, call,
              x: Number(e.pitchData.coordinates.pX),
              z: Number(e.pitchData.coordinates.pZ),
              top: Number(e.pitchData.strikeZoneTop) || null,
              bot: Number(e.pitchData.strikeZoneBottom) || null,
              type: String(e?.details?.type?.code || ''),
              typeName: clean(e?.details?.type?.description, ''),
              velo: Number(e?.pitchData?.startSpeed) || null,
            })
          }
          // advance the count exactly the way an umpire does
          if (kind === 'ball') b += 1
          else if (kind === 'foul') { if (s < 2) s += 1 }
          else if (kind === 'called' || kind === 'whiff') s += 1
        }
        const hc = e?.hitData?.coordinates
        if (hc?.coordX != null && hc?.coordY != null) {
          balls.push({
            pi, bid, bname, pid, pname, half, inn, event,
            cx: Number(hc.coordX), cy: Number(hc.coordY),
            ev: Number(e.hitData.launchSpeed) || null,
            la: Number(e.hitData.launchAngle),
            dist: Number(e.hitData.totalDistance) || null,
            traj: String(e.hitData.trajectory || ''),
          })
        }
      })
      if (any) meta.push({ pi, bid, bname, pid, pname, half, inn, event })
    })
    return { pitches, balls, meta }
  }, [data])

  if (!gamePk) return null
  if (data === undefined) {
    return <div style={{ fontSize: 10.5, color: C.text3, padding: '8px 0', fontFamily: NUM_FONT }}>Loading the live pitch feed…</div>
  }
  if (!data) return null
  if (!model.pitches.length) {
    return <div style={{ fontSize: 10, color: C.text3, padding: '6px 0' }}>No tracked pitches in this game yet.</div>
  }

  const bId = Number(batterId) || null
  const meta = model.meta
  const lastPlay = meta[meta.length - 1] || null
  // The arm on the mound right now: the pitcher of the batter's own most
  // recent plate appearance when we're following a batter, otherwise the
  // pitcher of the last plate appearance in the game.
  const batterLast = bId ? [...meta].reverse().find((m) => m.bid === bId) : null
  const curPitcher = (batterLast || lastPlay) || null
  const curPid = curPitcher?.pid || null
  const curPname = curPitcher?.pname || ''

  // the at-bat whose sequence gets numbered
  const abPlay = scope === 'batter' && batterLast ? batterLast
    : scope === 'pitcher' && curPid ? ([...meta].reverse().find((m) => m.pid === curPid) || lastPlay)
    : lastPlay
  const abIdx = abPlay?.pi ?? -1

  const inScope = (o) => (scope === 'batter' && bId ? o.bid === bId
    : scope === 'pitcher' && curPid ? o.pid === curPid
    : true)

  const scoped = model.pitches.filter(inScope)
  const pitches = typePick ? scoped.filter((p) => typePick.has(p.type)) : scoped
  const balls = model.balls.filter(inScope)
  const gt = data?.gameData?.teams || {}

  // pitch-type table for the legend: count, share, average velo
  const byType = []
  const seenT = new Map()
  scoped.forEach((p) => {
    if (!p.type) return
    if (!seenT.has(p.type)) { const row = { k: p.type, n: 0, velos: [], wh: 0, sw: 0 }; seenT.set(p.type, row); byType.push(row) }
    const row = seenT.get(p.type)
    row.n += 1
    if (p.velo) row.velos.push(p.velo)
    if (SWUNG.has(p.kind)) row.sw += 1
    if (p.kind === 'whiff') row.wh += 1
  })
  byType.sort((a, b) => b.n - a.n)

  // summary, computed from EXACTLY the pitches drawn
  const nP = pitches.length
  const strikes = pitches.filter((p) => STRIKEISH.has(p.kind)).length
  const swings = pitches.filter((p) => SWUNG.has(p.kind)).length
  const whiffs = pitches.filter((p) => p.kind === 'whiff').length
  const veloAvg = avg(pitches.map((p) => p.velo).filter(Boolean))
  const tops = pitches.map((p) => p.top).filter(Boolean)
  const bots = pitches.map((p) => p.bot).filter(Boolean)
  const zTop = tops.length ? avg(tops) : 3.4
  const zBot = bots.length ? avg(bots) : 1.6
  const HALF = 0.708   // plate is 17in wide
  const isIn = (p) => Math.abs(p.x) <= HALF && p.z <= (p.top || zTop) && p.z >= (p.bot || zBot)
  const inZone = pitches.filter(isIn).length
  const outZone = nP - inZone
  const chases = pitches.filter((p) => !isIn(p) && SWUNG.has(p.kind)).length

  const scopeLabel = scope === 'batter' ? (batterName || 'this batter')
    : scope === 'pitcher' ? (curPname || 'this pitcher') : 'the whole game'

  const btn = (on, col) => ({
    fontSize: 9, fontWeight: 800, fontFamily: NUM_FONT, cursor: 'pointer',
    borderRadius: 999, padding: '2px 9px', whiteSpace: 'nowrap',
    border: `1px solid ${on ? col : C.border}`,
    background: on ? `${col}22` : 'transparent',
    color: on ? col : C.text3,
  })

  return (
    <div style={{
      background: `linear-gradient(155deg, ${C.bg2}, rgba(34,211,238,.03))`,
      border: `1px solid ${C.border}`, borderRadius: 12, padding: '10px 13px', marginBottom: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 3 }}>
        <span style={{ fontSize: 12, fontWeight: 900 }}>◎ Live pitches &amp; spray</span>
        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
          {[
            ['batter', batterName ? `🎤 ${batterName.split(' ').slice(-1)[0]}` : '🎤 This batter', !!bId, 'Only the pitches this hitter has seen tonight'],
            ['pitcher', curPname ? `⚾ ${curPname.split(' ').slice(-1)[0]}` : '⚾ This pitcher', !!curPid, `Every pitch ${curPname || 'the current arm'} has thrown tonight — where he's living and where he misses`],
            ['game', '◍ Whole game', true, 'Every tracked pitch in the game'],
          ].filter(([, , ok]) => ok).map(([k, lb, , tip]) => (
            <button key={k} title={tip} onClick={() => { setScope(k); setTypePick(null) }} style={btn(scope === k, '#22d3ee')}>{lb}</button>
          ))}
        </div>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 5 }}>
          <button onClick={() => setAuto((v) => !v)} style={{ ...btn(auto, '#4ade80'), borderRadius: 6, fontSize: 8.5 }}>
            {auto ? '● 25s' : '○ auto'}
          </button>
          <button onClick={pull} style={{ ...btn(false, C.text3), borderRadius: 6, fontSize: 8.5 }}>↻</button>
        </span>
      </div>

      {/* THE SUMMARY LINE — computed from exactly the pitches drawn below, so
          it can never describe a different sample than the picture. */}
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center', margin: '5px 0 7px' }}>
        {[
          ['PITCHES', String(nP), C.text, `Every tracked pitch to ${scopeLabel}`],
          ['STRIKE', nP ? `${Math.round((100 * strikes) / nP)}%` : '—', '#fbbf24', 'Called, swung at, fouled or put in play'],
          ['IN ZONE', nP ? `${Math.round((100 * inZone) / nP)}%` : '—', '#22d3ee', "Inside the batter's own measured zone"],
          ['WHIFF', swings ? `${Math.round((100 * whiffs) / swings)}%` : '—', '#f87171', `${whiffs} misses on ${swings} swings`],
          ['CHASE', outZone ? `${Math.round((100 * chases) / outZone)}%` : '—', '#a78bfa', `${chases} swings at ${outZone} pitches out of the zone`],
          ['AVG V', veloAvg ? `${veloAvg.toFixed(1)}` : '—', '#fb923c', 'Average release speed of the pitches shown'],
        ].map(([k, v, col, tip]) => (
          <span key={k} title={tip} style={{
            display: 'inline-flex', gap: 5, alignItems: 'baseline', fontFamily: NUM_FONT,
            border: `1px solid ${C.border}`, background: 'rgba(255,255,255,.02)',
            borderRadius: 7, padding: '2px 8px',
          }}>
            <b style={{ fontSize: 7.5, letterSpacing: '.09em', color: C.text3 }}>{k}</b>
            <b style={{ fontSize: 11, color: col }}>{v}</b>
          </span>
        ))}
      </div>

      <div style={{ fontSize: 9.5, color: C.text3, lineHeight: 1.55, marginBottom: 8 }}>
        <b style={{ color: C.text2 }}>What this answers:</b> every pitch and every ball in play,
        plotted where it actually was — the feed&apos;s own coordinates, not a model. Showing{' '}
        <b style={{ color: C.text2 }}>{scopeLabel}</b>.
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <PitchZone
          pitches={pitches} byType={byType} typePick={typePick} setTypePick={setTypePick}
          heat={heat} setHeat={setHeat} seqOn={seqOn} setSeqOn={setSeqOn}
          abIdx={abIdx} abPlay={abPlay} zTop={zTop} zBot={zBot} HALF={HALF}
          scope={scope} compact={compact} btn={btn}
        />
        <SprayLive
          balls={balls} away={gt?.away?.abbreviation} home={gt?.home?.abbreviation}
          mode={sprayMode} setMode={setSprayMode} focusId={bId} focusName={batterName}
          compact={compact} btn={btn}
        />
      </div>
    </div>
  )
}

// ── the strike zone, catcher's view, every pitch a dot ──────────────────────
function PitchZone({ pitches, byType, typePick, setTypePick, heat, setHeat, seqOn, setSeqOn, abIdx, abPlay, zTop, zBot, HALF, scope, compact, btn }) {
  const W = compact ? 240 : 280
  const H = Math.round(W * 1.16)
  // feet → pixels. 2.2ft either side of center and 0.6→4.6ft high frames the
  // zone plus every realistic miss.
  const XR = 2.2, ZLO = 0.6, ZHI = 4.6
  const px = (x) => W / 2 - (x / XR) * (W / 2 - 12)   // flipped: catcher's view
  const pz = (z) => H - 12 - ((z - ZLO) / (ZHI - ZLO)) * (H - 24)

  const top = zTop, bot = zBot

  // the current at-bat's pitches, in order
  const ab = pitches.filter((p) => p.pi === abIdx).sort((a, b) => a.seq - b.seq)
  const abSet = new Set(ab.map((p) => p.seq + p.pi * 1000))
  const dimOthers = seqOn && ab.length > 0 && pitches.length > ab.length && scope !== 'batter'

  // ── DENSITY GRID (5×5): the middle 3×3 IS the zone, the outer ring is the
  //    shadow. Cells come from the same pX/pZ the dots come from, so the tint
  //    and the dots can never disagree. 90 pitches of dots go muddy; the tint
  //    answers "where does he live" in one look.
  const xe = [-XR, -HALF, -HALF / 3, HALF / 3, HALF, XR]
  const ze = [ZLO, bot, bot + (top - bot) / 3, bot + (2 * (top - bot)) / 3, top, ZHI]
  const cells = []
  if (heat) {
    const counts = Array.from({ length: 5 }, () => [0, 0, 0, 0, 0])
    let maxc = 0
    pitches.forEach((p) => {
      const ci = xe.findIndex((v, i) => i < 5 && p.x >= v && p.x < xe[i + 1])
      const ri = ze.findIndex((v, i) => i < 5 && p.z >= v && p.z < ze[i + 1])
      if (ci >= 0 && ri >= 0) { counts[ri][ci] += 1; if (counts[ri][ci] > maxc) maxc = counts[ri][ci] }
    })
    for (let r = 0; r < 5; r += 1) {
      for (let c = 0; c < 5; c += 1) {
        const n = counts[r][c]
        if (!n) continue
        cells.push({
          key: `${r}-${c}`, n,
          x: px(xe[c + 1]), y: pz(ze[r + 1]),
          w: px(xe[c]) - px(xe[c + 1]), h: pz(ze[r]) - pz(ze[r + 1]),
          a: 0.07 + 0.42 * (maxc ? n / maxc : 0),
          pct: pitches.length ? Math.round((100 * n) / pitches.length) : 0,
        })
      }
    }
  }

  return (
    <div style={{ flex: '1 1 250px', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', marginBottom: 4 }}>
        <span style={{ fontSize: 9, fontWeight: 900, color: C.text3, letterSpacing: '.07em', fontFamily: NUM_FONT }}>
          STRIKE ZONE · CATCHER&apos;S VIEW
        </span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          <button title="Tint the zone cells by how many pitches landed in each — for reading a pitcher's whole night at once"
            onClick={() => setHeat((v) => !v)} style={{ ...btn(heat, '#f97316'), fontSize: 8.5 }}>▦ density</button>
          <button title="Number this at-bat's pitches 1,2,3… and connect them in order"
            onClick={() => setSeqOn((v) => !v)} style={{ ...btn(seqOn, '#22d3ee'), fontSize: 8.5 }}>① sequence</button>
        </span>
      </div>

      {!pitches.length ? (
        <div style={{ fontSize: 10, color: C.text3, padding: '18px 0' }}>
          No pitches match this filter yet.
        </div>
      ) : (
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', background: '#0b0b0d', borderRadius: 8, border: `1px solid ${C.border2}` }}>
          {/* density first, under everything */}
          {cells.map((c) => (
            <rect key={c.key} x={c.x} y={c.y} width={c.w} height={c.h} fill={`rgba(249,115,22,${c.a.toFixed(3)})`}>
              <title>{`${c.n} pitches here (${c.pct}%)`}</title>
            </rect>
          ))}
          {/* the zone, drawn from these batters' own measured top/bottom */}
          <rect x={px(HALF)} y={pz(top)} width={px(-HALF) - px(HALF)} height={pz(bot) - pz(top)}
            fill="rgba(255,255,255,.03)" stroke="rgba(255,255,255,.40)" strokeWidth="1.4" />
          {/* thirds, so "up and in" is readable without a grid of numbers */}
          {[1, 2].map((i) => (
            <g key={i}>
              <line x1={px(HALF - (i * 2 * HALF) / 3)} x2={px(HALF - (i * 2 * HALF) / 3)} y1={pz(top)} y2={pz(bot)} stroke="rgba(255,255,255,.10)" />
              <line x1={px(HALF)} x2={px(-HALF)} y1={pz(top - (i * (top - bot)) / 3)} y2={pz(top - (i * (top - bot)) / 3)} stroke="rgba(255,255,255,.10)" />
            </g>
          ))}
          {/* the box says what it is, in feet — a rectangle with no label is a
              rectangle you have to take on faith */}
          <text x={px(-HALF) + 3} y={pz(top) - 3} fill="rgba(255,255,255,.42)" fontSize="7.5" fontFamily={NUM_FONT}>
            {top.toFixed(2)} ft
          </text>
          <text x={px(-HALF) + 3} y={pz(bot) + 8} fill="rgba(255,255,255,.42)" fontSize="7.5" fontFamily={NUM_FONT}>
            {bot.toFixed(2)} ft
          </text>
          <text x={W / 2} y={12} fill="rgba(255,255,255,.34)" fontSize="7.5" fontFamily={NUM_FONT} textAnchor="middle">
            ZONE = BATTER&apos;S OWN TOP / BOTTOM
          </text>
          {/* home plate */}
          <polygon points={`${px(HALF)},${H - 5} ${px(-HALF)},${H - 5} ${px(-HALF)},${H - 9} ${px(0)},${H - 13} ${px(HALF)},${H - 9}`}
            fill="rgba(255,255,255,.16)" />

          {/* the current at-bat, connected faintly in order */}
          {seqOn && ab.length > 1 && (
            <polyline
              points={ab.map((p) => `${px(p.x).toFixed(1)},${pz(p.z).toFixed(1)}`).join(' ')}
              fill="none" stroke="#22d3ee" strokeWidth="1" strokeDasharray="3 3" opacity="0.45"
            />
          )}

          {pitches.map((p, i) => {
            const dim = dimOthers && !abSet.has(p.seq + p.pi * 1000)
            return (
              <g key={i}>
                <PitchMark kind={p.kind} x={px(p.x)} y={pz(p.z)} col={pcol(p.type)} r={3.6} dim={dim} />
                <circle cx={px(p.x)} cy={pz(p.z)} r={7} fill="transparent">
                  <title>{`#${p.seq} · ${p.cnt} count — ${p.typeName || p.type || 'pitch'}${p.velo ? ` ${p.velo.toFixed(1)} mph` : ''} · ${p.call || KIND_LABEL[p.kind]}${p.bname ? ` · ${p.bname} vs ${p.pname}` : ''} (${p.half.slice(0, 3)}${p.inn})`}</title>
                </circle>
              </g>
            )
          })}

          {/* pitch numbers for the at-bat in progress */}
          {seqOn && ab.map((p) => (
            <text key={`n${p.seq}`} x={px(p.x) + 6.5} y={pz(p.z) - 5}
              fill="#e8fbff" fontSize="8" fontWeight="800" fontFamily={NUM_FONT}
              stroke="#09090b" strokeWidth="2.2" paintOrder="stroke">{p.seq}</text>
          ))}
        </svg>
      )}

      {/* PITCH-TYPE LEGEND — count, share and average velo per type, and it's
          a filter: tap a type to isolate it on the plot. */}
      {byType.length > 0 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
          <button onClick={() => setTypePick(null)} style={{ ...btn(!typePick, C.text2), fontSize: 8.5 }}>all</button>
          {byType.map((t) => {
            const on = !!typePick && typePick.has(t.k)
            const v = avg(t.velos)
            return (
              <button
                key={t.k}
                title={`${PITCH_NAMES[t.k] || t.k} · ${t.n} thrown${v ? ` · ${v.toFixed(1)} mph avg` : ''}${t.sw ? ` · ${t.wh}/${t.sw} whiffs on swings` : ''}`}
                onClick={() => setTypePick((s) => {
                  const next = new Set(s || [])
                  if (next.has(t.k)) next.delete(t.k); else next.add(t.k)
                  return next.size ? next : null
                })}
                style={{
                  ...btn(on, pcol(t.k)), fontSize: 8.5, padding: '2px 7px',
                  color: on ? pcol(t.k) : C.text2,
                }}
              >
                <span style={{ color: pcol(t.k) }}>●</span> {t.k} {t.n}
                {v ? <span style={{ opacity: 0.7 }}> · {v.toFixed(0)}</span> : null}
              </button>
            )
          })}
        </div>
      )}

      {/* SHAPE KEY — the thing that makes the plot readable without hovering */}
      <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap', marginTop: 6, fontSize: 8.5, color: C.text3, fontFamily: NUM_FONT, alignItems: 'center' }}>
        {[['ball', 'taken ball'], ['called', 'called strike'], ['whiff', 'swing & miss'], ['foul', 'foul'], ['inplay', 'in play']].map(([k, lb]) => (
          <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
            <svg width="14" height="14" viewBox="0 0 14 14"><PitchMark kind={k} x={7} y={7} col={C.text2} r={3.4} /></svg>
            {lb}
          </span>
        ))}
      </div>

      {/* THIS AT-BAT, PITCH BY PITCH — how they're working him right now, in
          the order it happened, with the count before each pitch. */}
      {ab.length > 0 && (
        <div style={{ marginTop: 7, border: `1px solid ${C.border}`, borderRadius: 8, padding: '5px 7px', background: 'rgba(34,211,238,.035)' }}>
          <div style={{ fontSize: 8.5, fontWeight: 900, letterSpacing: '.07em', color: '#22d3ee', fontFamily: NUM_FONT, marginBottom: 3 }}>
            THIS AT-BAT · {clean(abPlay?.bname, '').split(' ').slice(-1)[0] || '—'} vs {clean(abPlay?.pname, '').split(' ').slice(-1)[0] || '—'}
            {abPlay?.inn ? ` · ${String(abPlay.half).slice(0, 3)}${abPlay.inn}` : ''}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {ab.map((p) => (
              <div key={p.seq} style={{ display: 'flex', gap: 6, alignItems: 'baseline', fontSize: 9.5, fontFamily: NUM_FONT, minWidth: 0 }}>
                <span style={{ color: C.text3, width: 13, flexShrink: 0 }}>{p.seq}</span>
                <span style={{ color: C.text2, width: 22, flexShrink: 0 }}>{p.cnt}</span>
                <span style={{ color: pcol(p.type), fontWeight: 800, width: 26, flexShrink: 0 }}>{p.type || '—'}</span>
                <span style={{ color: C.text2, width: 34, flexShrink: 0 }}>{p.velo ? p.velo.toFixed(0) : '—'}</span>
                <span style={{
                  color: p.kind === 'whiff' ? '#f87171' : p.kind === 'inplay' ? '#4ade80' : p.kind === 'called' ? '#fbbf24' : C.text3,
                  fontWeight: p.kind === 'whiff' || p.kind === 'inplay' ? 800 : 500,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0,
                }}>{p.call || KIND_LABEL[p.kind]}</span>
                <span style={{ marginLeft: 'auto', flexShrink: 0, color: C.text3 }}>
                  {Math.abs(p.x) <= HALF && p.z <= (p.top || 0) && p.z >= (p.bot || 0) ? 'zone' : 'off'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ fontSize: 8.5, color: C.text3, marginTop: 5, lineHeight: 1.5 }}>
        Shape = what happened, color = what was thrown. The box is the batter&apos;s own measured
        zone ({bot.toFixed(2)}–{top.toFixed(2)} ft here), not a fixed rectangle
        {scope === 'pitcher' ? ' — averaged across the hitters he has faced' : ''}. Hover any mark
        for the count, the pitch and the call.
      </div>
    </div>
  )
}

// ── the field, every ball in play a dot ─────────────────────────────────────
//
// Drawn straight in Statcast grid units (1 unit = 2.5 ft, plate at
// 125.42/198.27, y inverted) via the viewBox, so the field is square and a
// ball 380 ft to left-center sits exactly where 380 ft to left-center is.
const PLATE = { x: 125.42, y: 198.27 }
const FT = 2.5   // feet per grid unit
// distance/angle (0 = straight to center, negative = left field) → grid point
const gp = (ft, deg) => {
  const rad = (deg * Math.PI) / 180
  return [PLATE.x + (Math.sin(rad) * ft) / FT, PLATE.y - (Math.cos(rad) * ft) / FT]
}
// A generic-but-honest wall: 330 down the lines, 375 to the gaps, 400 to
// center. The live feed doesn't publish this park's dimensions, so the arc is
// labeled "generic wall" rather than pretending to be Fenway.
const wallAt = (deg) => {
  const a = Math.abs(deg)
  return a >= 45 ? 330 : a >= 22.5 ? 330 + ((45 - a) / 22.5) * 45 : 375 + ((22.5 - a) / 22.5) * 25
}

// EV ramp: blue → white-hot. Fixed 70–110 so two nights are comparable.
const evColor = (ev) => {
  const t = clamp01(((ev || 0) - 70) / 40)
  if (t < 0.5) {
    const u = t / 0.5
    return `rgb(${Math.round(96 + u * 153)},${Math.round(165 - u * 50)},${Math.round(250 - u * 228)})`
  }
  const u = (t - 0.5) / 0.5
  return `rgb(${Math.round(249 + u * 6)},${Math.round(115 - u * 42)},${Math.round(22 + u * 49)})`
}
const distColor = (d) => {
  const t = clamp01((d || 0) / 430)
  return `rgb(${Math.round(90 + t * 165)},${Math.round(190 - t * 120)},${Math.round(240 - t * 200)})`
}

function SprayLive({ balls, away, home, mode, setMode, focusId, focusName, compact, btn }) {
  // viewBox in grid units — everything deep enough to matter, plus the plate
  const VB = { x: 8, y: 26, w: 234, h: 186 }
  const hrs = balls.filter((b) => /home_run/i.test(b.event))
  const hits = balls.filter((b) => /single|double|triple/i.test(b.event))
  const hardest = balls.filter((b) => b.ev).sort((a, b) => b.ev - a.ev)[0] || null
  const farthest = balls.filter((b) => b.dist).sort((a, b) => b.dist - a.dist)[0] || null
  const fid = Number(focusId) || null
  const anyFocus = fid ? balls.some((b) => b.bid === fid) : false

  const colOf = (b) => {
    if (mode === 'ev') return b.ev ? evColor(b.ev) : 'rgba(255,255,255,.28)'
    if (mode === 'dist') return b.dist ? distColor(b.dist) : 'rgba(255,255,255,.28)'
    if (/home_run/i.test(b.event)) return '#4ade80'
    if (/single|double|triple/i.test(b.event)) return '#22d3ee'
    return 'rgba(255,255,255,.34)'
  }
  const rOf = (b) => {
    if (mode === 'ev') return b.ev ? 1.6 + 2.6 * clamp01((b.ev - 70) / 40) : 1.4
    if (mode === 'dist') return b.dist ? 1.6 + 2.6 * clamp01(b.dist / 430) : 1.4
    return /home_run/i.test(b.event) ? 3.4 : /single|double|triple/i.test(b.event) ? 2.4 : 2
  }

  const wallPts = []
  for (let a = -45; a <= 45; a += 3) wallPts.push(gp(wallAt(a), a))

  return (
    <div style={{ flex: '1 1 250px', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', marginBottom: 4 }}>
        <span style={{ fontSize: 9, fontWeight: 900, color: C.text3, letterSpacing: '.07em', fontFamily: NUM_FONT }}>
          EVERY BALL IN PLAY {away && home ? `· ${away} @ ${home}` : ''}
        </span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          {[['result', 'result'], ['ev', 'exit velo'], ['dist', 'distance']].map(([k, lb]) => (
            <button key={k} onClick={() => setMode(k)} style={{ ...btn(mode === k, '#f97316'), fontSize: 8.5 }}>{lb}</button>
          ))}
        </span>
      </div>

      {!balls.length ? (
        <div style={{ fontSize: 10, color: C.text3, padding: '18px 0' }}>
          Nothing put in play here yet — the field fills in as balls are hit.
        </div>
      ) : (
        <svg width="100%" viewBox={`${VB.x} ${VB.y} ${VB.w} ${VB.h}`}
          style={{ display: 'block', background: '#0b0b0d', borderRadius: 8, border: `1px solid ${C.border2}` }}>
          {/* fair territory */}
          <polygon
            points={`${PLATE.x},${PLATE.y} ${wallPts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')}`}
            fill="rgba(249,115,22,.055)" stroke="#f97316" strokeWidth="0.7" strokeOpacity="0.55" strokeLinejoin="round"
          />
          {/* distance arcs, labeled */}
          {[200, 300, 400].map((d) => {
            const pts = []
            for (let a = -48; a <= 48; a += 4) pts.push(gp(d, a))
            const [lx, ly] = gp(d, 0)
            return (
              <g key={d}>
                <polyline points={pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')}
                  fill="none" stroke="rgba(249,115,22,.20)" strokeWidth="0.5" />
                <text x={lx} y={ly + 4} fill="rgba(249,115,22,.55)" fontSize="4.4" fontFamily={NUM_FONT} textAnchor="middle">{d}</text>
              </g>
            )
          })}
          {/* foul lines */}
          {[-45, 45].map((a) => {
            const [x, y] = gp(420, a)
            return <line key={a} x1={PLATE.x} y1={PLATE.y} x2={x} y2={y} stroke="#f97316" strokeWidth="0.7" opacity="0.6" />
          })}
          {/* infield: bases + mound, so "shallow" has a reference */}
          <polygon
            points={[gp(0, 0), gp(90, -45), gp(127.28, 0), gp(90, 45)]
              .map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')}
            fill="rgba(249,115,22,.09)" stroke="rgba(164,82,13,.9)" strokeWidth="0.5"
          />
          <circle cx={gp(60.5, 0)[0]} cy={gp(60.5, 0)[1]} r="1.7" fill="none" stroke="rgba(164,82,13,.9)" strokeWidth="0.5" />
          <circle cx={PLATE.x} cy={PLATE.y} r="1.3" fill="none" stroke="#fdb75a" strokeWidth="0.7" />

          {/* the balls. Outs stay quiet, homers get a ring and a distance. */}
          {balls.map((b, i) => {
            const hr = /home_run/i.test(b.event)
            const dim = anyFocus && b.bid !== fid
            const r = rOf(b)
            return (
              <g key={i} opacity={dim ? 0.22 : 1}>
                <circle cx={b.cx} cy={b.cy} r={r} fill={colOf(b)} opacity={hr ? 1 : 0.82}
                  stroke={hr ? '#09090b' : 'none'} strokeWidth={0.5} />
                {hr && <circle cx={b.cx} cy={b.cy} r={r + 2} fill="none" stroke={colOf(b)} strokeWidth="0.6" opacity="0.7" />}
                {!dim && b.bid === fid && !hr && (
                  <circle cx={b.cx} cy={b.cy} r={r + 2.4} fill="none" stroke="#fff" strokeWidth="0.5" opacity="0.75" />
                )}
                <circle cx={b.cx} cy={b.cy} r="5" fill="transparent">
                  <title>{`${b.bname} — ${String(b.event).replace(/_/g, ' ')}${b.ev ? ` · ${b.ev.toFixed(1)} mph` : ''}${Number.isFinite(b.la) ? ` · ${b.la.toFixed(0)}°` : ''}${b.dist ? ` · ${b.dist.toFixed(0)} ft` : ''}${b.traj ? ` · ${b.traj.replace(/_/g, ' ')}` : ''} · off ${b.pname} (${b.half.slice(0, 3)}${b.inn})`}</title>
                </circle>
              </g>
            )
          })}
          {/* homers wear their distance — the one number you'd quote */}
          {hrs.map((b, i) => (
            <text key={`hr${i}`} x={b.cx} y={b.cy - 5} fill="#4ade80" fontSize="4.6" fontWeight="800"
              fontFamily={NUM_FONT} textAnchor="middle" stroke="#09090b" strokeWidth="1.2" paintOrder="stroke">
              {b.dist ? `${b.dist.toFixed(0)}ft` : 'HR'}
            </text>
          ))}
          <text x={PLATE.x} y={VB.y + 7} fill="rgba(255,255,255,.30)" fontSize="4.6" fontFamily={NUM_FONT} textAnchor="middle">
            GENERIC WALL 330/375/400 — THE FEED PUBLISHES NO PARK DIMENSIONS
          </text>
        </svg>
      )}

      {/* HARDEST HIT TONIGHT — the line you'd actually say out loud */}
      {(hardest || farthest) && (
        <div style={{ fontSize: 9.5, color: C.text2, fontFamily: NUM_FONT, marginTop: 5, lineHeight: 1.55 }}>
          {hardest && (
            <div>
              <b style={{ color: '#f87171' }}>Hardest hit:</b> {clean(hardest.bname, '?')}{' '}
              <b style={{ color: C.text }}>{hardest.ev.toFixed(1)} mph</b>
              {hardest.dist ? ` · ${hardest.dist.toFixed(0)} ft` : ''}
              {' · '}{String(hardest.event || 'in play').replace(/_/g, ' ')}
              {hardest.pname ? ` off ${clean(hardest.pname, '').split(' ').slice(-1)[0]}` : ''}
            </div>
          )}
          {farthest && (!hardest || farthest !== hardest) && (
            <div>
              <b style={{ color: '#fb923c' }}>Farthest:</b> {clean(farthest.bname, '?')}{' '}
              <b style={{ color: C.text }}>{farthest.dist.toFixed(0)} ft</b>
              {farthest.ev ? ` · ${farthest.ev.toFixed(1)} mph` : ''}
              {' · '}{String(farthest.event || 'in play').replace(/_/g, ' ')}
            </div>
          )}
        </div>
      )}

      <div style={{ fontSize: 8.5, color: C.text3, marginTop: 4, lineHeight: 1.5 }}>
        {mode === 'result' ? (
          <>
            <span style={{ color: '#4ade80' }}>● {hrs.length} homer{hrs.length === 1 ? '' : 's'}</span> ·{' '}
            <span style={{ color: '#22d3ee' }}>● {hits.length} hits</span> · ○ outs.
          </>
        ) : mode === 'ev' ? (
          <>Color and size = <b style={{ color: C.text2 }}>exit velocity</b>, fixed 70–110 mph scale (
            <span style={{ color: evColor(75) }}>●</span>{' '}
            <span style={{ color: evColor(95) }}>●</span>{' '}
            <span style={{ color: evColor(108) }}>●</span>), so two nights compare.
          </>
        ) : (
          <>Color and size = <b style={{ color: C.text2 }}>total distance</b>, fixed 0–430 ft (
            <span style={{ color: distColor(120) }}>●</span>{' '}
            <span style={{ color: distColor(300) }}>●</span>{' '}
            <span style={{ color: distColor(420) }}>●</span>).
          </>
        )}
        {' '}{balls.length} tracked ball{balls.length === 1 ? '' : 's'} in play
        {anyFocus ? <> · <b style={{ color: C.text2 }}>{clean(focusName, 'the current hitter')}</b> ringed in white, everyone else dimmed</> : ''}
        . Homers carry their distance. Landing spots are the feed&apos;s own hit coordinates — hover
        any dot for the hitter, exit velo, launch angle and the arm he hit it off.
      </div>
    </div>
  )
}
