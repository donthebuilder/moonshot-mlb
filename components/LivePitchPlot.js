'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { clean } from '../lib/player'

// ◎ LIVE PITCH PLOT + 🗺 LIVE GAME SPRAY (2026-08-09, Donovan: "see live
// where all the pitches are going, if they're in the zone, actual dots — and
// a live spray chart of the whole game, where everything's going").
//
// Both are REAL PLOTTED COORDINATES from the live feed, verified before this
// file was written (gamePk 823425, mid-game): 324 of 324 pitches carried
// pitchData.coordinates.pX/pZ AND a per-batter strikeZoneTop/Bottom, and 57
// of 57 batted balls carried hitData.coordinates.coordX/coordY. Nothing here
// is modeled — every dot is where the ball actually was.
//
// PITCH PLOT geometry: pX is feet from the center of the plate (catcher's
// view, negative = the batter's right on a RHB... which is why the plot is
// drawn from the CATCHER'S view like every zone map on this site, x flipped
// so it reads the same way). pZ is feet above the ground. The zone box uses
// the batter's OWN top/bottom from that pitch, averaged over the pitches
// shown — a zone drawn at a fixed height would be a lie for a 5'6" hitter.
//
// SPRAY geometry: Statcast's hit coordinates are a fixed 250x250 grid with
// home plate at roughly (125.42, 198.27) and y INVERTED (small y = deep). The
// same transform SprayField uses, so the two charts agree.

const FEED = 'liveData,plays,allPlays,playEvents,isPitch,pitchData,coordinates,pX,pZ,zone,strikeZoneTop,strikeZoneBottom,startSpeed,details,type,code,description,call,isInPlay,isStrike,isBall,hitData,launchSpeed,launchAngle,totalDistance,coordX,coordY,trajectory,matchup,batter,pitcher,id,fullName,result,event,about,halfInning,inning,gameData,teams,home,away,abbreviation'

// pitch families → the site's existing pitch language
const PCOL = {
  FF: '#f87171', FA: '#f87171', SI: '#fb923c', FT: '#fb923c', FC: '#fbbf24',
  SL: '#22d3ee', ST: '#67e8f9', SV: '#67e8f9', CU: '#a78bfa', KC: '#c4b5fd',
  CS: '#c4b5fd', CH: '#4ade80', FS: '#86efac', FO: '#86efac', KN: '#9ca3af',
  EP: '#9ca3af',
}
const pcol = (t) => PCOL[t] || '#9ca3af'

export default function LivePitchPlot({ gamePk, batterId = null, batterName = '', compact = false }) {
  const [data, setData] = useState(undefined)
  const [scope, setScope] = useState(batterId ? 'batter' : 'game')  // batter | game
  const [auto, setAuto] = useState(true)
  const timer = useRef(null)

  const pull = async () => {
    if (!gamePk) return
    const j = await fetch(`https://statsapi.mlb.com/api/v1.1/game/${gamePk}/feed/live?fields=${FEED}`)
      .then((r) => (r.ok ? r.json() : null)).catch(() => null)
    setData(j || null)
  }
  useEffect(() => { setData(undefined); pull() }, [gamePk])
  useEffect(() => { setScope(batterId ? 'batter' : 'game') }, [batterId])
  useEffect(() => {
    clearInterval(timer.current)
    if (auto) timer.current = setInterval(() => { if (!document.hidden) pull() }, 25000)
    return () => clearInterval(timer.current)
  }, [auto, gamePk])

  const model = useMemo(() => {
    const plays = data?.liveData?.plays?.allPlays || []
    const pitches = []
    const balls = []
    plays.forEach((pl) => {
      const bid = Number(pl?.matchup?.batter?.id) || null
      const bname = clean(pl?.matchup?.batter?.fullName, '')
      const half = String(pl?.about?.halfInning || '')
      const inn = pl?.about?.inning
      ;(pl.playEvents || []).forEach((e) => {
        if (e?.isPitch && e?.pitchData?.coordinates?.pX != null) {
          pitches.push({
            bid, bname, half, inn,
            x: Number(e.pitchData.coordinates.pX),
            z: Number(e.pitchData.coordinates.pZ),
            top: Number(e.pitchData.strikeZoneTop) || null,
            bot: Number(e.pitchData.strikeZoneBottom) || null,
            type: String(e?.details?.type?.code || ''),
            typeName: clean(e?.details?.type?.description, ''),
            velo: Number(e?.pitchData?.startSpeed) || null,
            call: clean(e?.details?.call?.description, ''),
            inPlay: !!e?.details?.isInPlay,
            strike: !!e?.details?.isStrike,
          })
        }
        const hc = e?.hitData?.coordinates
        if (hc?.coordX != null && hc?.coordY != null) {
          balls.push({
            bid, bname, half, inn,
            cx: Number(hc.coordX), cy: Number(hc.coordY),
            ev: Number(e.hitData.launchSpeed) || null,
            la: Number(e.hitData.launchAngle),
            dist: Number(e.hitData.totalDistance) || null,
            traj: String(e.hitData.trajectory || ''),
            event: clean(pl?.result?.event, ''),
          })
        }
      })
    })
    return { pitches, balls }
  }, [data])

  if (!gamePk) return null
  if (data === undefined) {
    return <div style={{ fontSize: 10.5, color: C.text3, padding: '8px 0', fontFamily: NUM_FONT }}>Loading the live pitch feed…</div>
  }
  if (!data) return null

  const onlyBatter = scope === 'batter' && batterId
  const pitches = onlyBatter ? model.pitches.filter((p) => p.bid === Number(batterId)) : model.pitches
  const balls = onlyBatter ? model.balls.filter((b) => b.bid === Number(batterId)) : model.balls
  if (!model.pitches.length) {
    return <div style={{ fontSize: 10, color: C.text3, padding: '6px 0' }}>No tracked pitches in this game yet.</div>
  }

  const gt = data?.gameData?.teams || {}

  return (
    <div style={{
      background: `linear-gradient(155deg, ${C.bg2}, rgba(34,211,238,.03))`,
      border: `1px solid ${C.border}`, borderRadius: 12, padding: '10px 13px', marginBottom: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 3 }}>
        <span style={{ fontSize: 12, fontWeight: 900 }}>◎ Live pitches &amp; spray</span>
        <span style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT }}>
          {pitches.length} pitches · {balls.length} balls in play
        </span>
        {batterId && (
          <div style={{ display: 'flex', gap: 3 }}>
            {[['batter', batterName ? batterName.split(' ').slice(-1)[0] : 'This batter'], ['game', 'Whole game']].map(([k, lb]) => (
              <button key={k} onClick={() => setScope(k)} style={{
                fontSize: 9, fontWeight: 800, fontFamily: NUM_FONT, cursor: 'pointer',
                borderRadius: 999, padding: '2px 9px',
                border: `1px solid ${scope === k ? '#22d3ee' : C.border}`,
                background: scope === k ? 'rgba(34,211,238,.14)' : 'transparent',
                color: scope === k ? '#22d3ee' : C.text3,
              }}>{lb}</button>
            ))}
          </div>
        )}
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 5 }}>
          <button onClick={() => setAuto((v) => !v)} style={{
            fontSize: 8.5, fontWeight: 700, fontFamily: NUM_FONT, cursor: 'pointer', borderRadius: 6, padding: '2px 8px',
            border: `1px solid ${auto ? '#4ade80' : C.border}`, background: auto ? 'rgba(74,222,128,.12)' : 'transparent',
            color: auto ? '#4ade80' : C.text3,
          }}>{auto ? '● 25s' : '○ auto'}</button>
          <button onClick={pull} style={{
            fontSize: 8.5, fontWeight: 700, fontFamily: NUM_FONT, cursor: 'pointer', borderRadius: 6, padding: '2px 8px',
            border: `1px solid ${C.border}`, background: 'transparent', color: C.text3,
          }}>↻</button>
        </span>
      </div>
      <div style={{ fontSize: 9.5, color: C.text3, lineHeight: 1.55, marginBottom: 8 }}>
        <b style={{ color: C.text2 }}>What this answers:</b> every pitch thrown and every ball put in
        play, plotted where it actually was — not a model, the feed&apos;s own coordinates.
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <PitchZone pitches={pitches} compact={compact} />
        <SprayLive balls={balls} away={gt?.away?.abbreviation} home={gt?.home?.abbreviation} compact={compact} />
      </div>
    </div>
  )
}

// ── the strike zone, catcher's view, every pitch a dot ──────────────────────
function PitchZone({ pitches, compact }) {
  const W = compact ? 230 : 270
  const H = Math.round(W * 1.15)
  // feet → pixels. Show 2.2ft either side of center and 0.6→4.6ft high, which
  // frames the zone plus every realistic miss.
  const XR = 2.2, ZLO = 0.6, ZHI = 4.6
  const px = (x) => W / 2 - (x / XR) * (W / 2 - 12)   // flipped: catcher's view
  const pz = (z) => H - 10 - ((z - ZLO) / (ZHI - ZLO)) * (H - 20)

  const tops = pitches.map((p) => p.top).filter(Boolean)
  const bots = pitches.map((p) => p.bot).filter(Boolean)
  const top = tops.length ? tops.reduce((a, b) => a + b, 0) / tops.length : 3.4
  const bot = bots.length ? bots.reduce((a, b) => a + b, 0) / bots.length : 1.6
  // plate is 17in wide = 1.417ft, so ±0.708ft from center
  const half = 0.708

  const types = [...new Set(pitches.map((p) => p.type).filter(Boolean))]
  const inZone = pitches.filter((p) => Math.abs(p.x) <= half && p.z <= top && p.z >= bot).length

  return (
    <div style={{ flex: '1 1 240px', minWidth: 0 }}>
      <div style={{ fontSize: 9, fontWeight: 900, color: C.text3, letterSpacing: '.07em', fontFamily: NUM_FONT, marginBottom: 4 }}>
        STRIKE ZONE · CATCHER&apos;S VIEW
      </div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', background: '#0b0b0d', borderRadius: 8, border: `1px solid ${C.border2}` }}>
        {/* the zone, drawn from these batters' own measured top/bottom */}
        <rect x={px(half)} y={pz(top)} width={px(-half) - px(half)} height={pz(bot) - pz(top)}
          fill="rgba(255,255,255,.03)" stroke="rgba(255,255,255,.30)" strokeWidth="1.2" />
        {/* thirds, so "up and in" is readable without a grid of numbers */}
        {[1, 2].map((i) => (
          <g key={i}>
            <line x1={px(half - (i * 2 * half) / 3)} x2={px(half - (i * 2 * half) / 3)} y1={pz(top)} y2={pz(bot)} stroke="rgba(255,255,255,.10)" />
            <line x1={px(half)} x2={px(-half)} y1={pz(top - (i * (top - bot)) / 3)} y2={pz(top - (i * (top - bot)) / 3)} stroke="rgba(255,255,255,.10)" />
          </g>
        ))}
        {/* home plate */}
        <polygon points={`${px(half)},${H - 6} ${px(-half)},${H - 6} ${px(-half)},${H - 10} ${px(0)},${H - 14} ${px(half)},${H - 10}`}
          fill="rgba(255,255,255,.14)" />
        {pitches.map((p, i) => {
          const called = /called strike|swinging|foul|in play/i.test(p.call)
          return (
            <circle key={i} cx={px(p.x)} cy={pz(p.z)} r={p.inPlay ? 4.5 : 3.2}
              fill={p.inPlay ? pcol(p.type) : 'none'}
              stroke={pcol(p.type)} strokeWidth={p.inPlay ? 1 : 1.4}
              opacity={called || p.inPlay ? 0.95 : 0.5}>
              <title>{`${p.typeName || p.type}${p.velo ? ` ${p.velo.toFixed(0)}mph` : ''} — ${p.call}${p.bname ? ` · ${p.bname}` : ''} (${p.half.slice(0, 3)}${p.inn})`}</title>
            </circle>
          )
        })}
      </svg>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 5 }}>
        {types.slice(0, 7).map((t) => (
          <span key={t} style={{ fontSize: 8.5, fontFamily: NUM_FONT, color: pcol(t), fontWeight: 800 }}>● {t}</span>
        ))}
      </div>
      <div style={{ fontSize: 8.5, color: C.text3, marginTop: 4, lineHeight: 1.5 }}>
        Hollow = taken or missed · filled = put in play. <b style={{ color: C.text2 }}>{inZone}</b> of{' '}
        {pitches.length} in the zone ({pitches.length ? Math.round((100 * inZone) / pitches.length) : 0}%).
        The box is these batters&apos; own measured zone, not a fixed rectangle.
      </div>
    </div>
  )
}

// ── the field, every ball in play a dot ─────────────────────────────────────
function SprayLive({ balls, away, home, compact }) {
  const W = compact ? 230 : 270
  const H = Math.round(W * 0.92)
  // Statcast's 250×250 grid: plate ~ (125.42, 198.27), y inverted.
  const sx = (cx) => (cx / 250) * W
  const sy = (cy) => (cy / 250) * H

  const col = (b) => {
    if (/home_run/i.test(b.event)) return '#4ade80'
    if (/single|double|triple/i.test(b.event)) return '#22d3ee'
    return 'rgba(255,255,255,.35)'
  }
  const hrs = balls.filter((b) => /home_run/i.test(b.event)).length
  const hits = balls.filter((b) => /single|double|triple/i.test(b.event)).length

  return (
    <div style={{ flex: '1 1 240px', minWidth: 0 }}>
      <div style={{ fontSize: 9, fontWeight: 900, color: C.text3, letterSpacing: '.07em', fontFamily: NUM_FONT, marginBottom: 4 }}>
        EVERY BALL IN PLAY {away && home ? `· ${away} @ ${home}` : ''}
      </div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', background: '#0b0b0d', borderRadius: 8, border: `1px solid ${C.border2}` }}>
        {/* the field: foul lines out of home plate, then the arc of the wall */}
        <line x1={sx(125.42)} y1={sy(198.27)} x2={sx(20)} y2={sy(95)} stroke="rgba(255,255,255,.18)" />
        <line x1={sx(125.42)} y1={sy(198.27)} x2={sx(231)} y2={sy(95)} stroke="rgba(255,255,255,.18)" />
        <path d={`M ${sx(20)} ${sy(95)} Q ${sx(125.42)} ${sy(-8)} ${sx(231)} ${sy(95)}`} fill="none" stroke="rgba(255,255,255,.22)" />
        <path d={`M ${sx(74)} ${sy(150)} Q ${sx(125.42)} ${sy(104)} ${sx(177)} ${sy(150)}`} fill="none" stroke="rgba(255,255,255,.10)" />
        <circle cx={sx(125.42)} cy={sy(198.27)} r="2.5" fill="rgba(255,255,255,.5)" />
        {balls.map((b, i) => (
          <circle key={i} cx={sx(b.cx)} cy={sy(b.cy)} r={/home_run/i.test(b.event) ? 4.5 : 3}
            fill={col(b)} opacity={/home_run/i.test(b.event) ? 0.95 : 0.7}>
            <title>{`${b.bname} — ${b.event.replace(/_/g, ' ')}${b.ev ? ` · ${b.ev.toFixed(1)} mph` : ''}${b.dist ? ` · ${b.dist.toFixed(0)} ft` : ''}${b.traj ? ` · ${b.traj.replace(/_/g, ' ')}` : ''} (${b.half.slice(0, 3)}${b.inn})`}</title>
          </circle>
        ))}
      </svg>
      <div style={{ fontSize: 8.5, color: C.text3, marginTop: 5, lineHeight: 1.5 }}>
        <span style={{ color: '#4ade80' }}>● {hrs} homer{hrs === 1 ? '' : 's'}</span> ·{' '}
        <span style={{ color: '#22d3ee' }}>● {hits} hits</span> · ○ outs. Landing spots from the feed&apos;s own
        hit coordinates — hover any dot for the hitter, exit velo and distance.
      </div>
    </div>
  )
}
