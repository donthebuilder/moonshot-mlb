'use client'
import { useEffect, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { hotColdZones } from '../lib/situational'
import { zonesUrl } from '../lib/dataSource'
import {
  KIND_LABEL, PITCH_NAMES as LIVE_PITCH_NAMES, pitchColor, pitchSummary,
  pitchTypes, zoneBox, zoneCell, zoneFrac, inZone as pitchInZone,
} from '../lib/livePitches'

// STRIKE-ZONE MAP v3 — one map for both players.
//
// v2 split the matchup across three separate views (match / HR-v-use / weak)
// and made the reader do the aligning in their head. Consolidated: MATCHUP is
// now a single default view where every cell answers "do these two players
// collide here, and who wins the collision" —
//   orange, ⚡  his damage meets the starter's pitch traffic (edge: hitter)
//   red,    ⚠  his hole meets the starter's pitch traffic  (edge: pitcher)
//   dim         no traffic or no signal — nothing to bet on in that cell
// The verdict line above the grid names the single best edge and the single
// biggest danger in plain words, so the map confirms rather than explains.
//
// Batter side: bot zone cache (~120d xSLG/xwOBA/HR per zone). Pitcher side:
// same cache — his per-zone usage AND per-zone damage allowed, kill zones.
// The four API stat views (EV/SLG/OPS/AVG, season, MLB-graded) stay as the
// batter-only fallback and are all the map shows when no zones file exists.

const TEMP_ALPHA = { hot: 0.8, warm: 0.5, lukewarm: 0.26, cool: 0.12, cold: 0.05 }

const API_STATS = [
  { key: 'ev', label: 'Exit velo', hint: 'His average EV on balls from this zone — season, live API' },
  { key: 'slg', label: 'SLG', hint: 'His slugging on pitches in this zone — season, live API' },
  { key: 'ops', label: 'OPS', hint: 'His OPS on pitches in this zone — season, live API' },
  { key: 'avg', label: 'AVG', hint: 'His average on pitches in this zone — season, live API' },
]

const ZONE_NAME = {
  1: 'up-and-left', 2: 'up-and-middle', 3: 'up-and-right',
  4: 'middle-left', 5: 'dead middle', 6: 'middle-right',
  7: 'down-and-left', 8: 'down-and-middle', 9: 'down-and-right',
  11: 'high-left, off the zone', 12: 'high-right, off the zone',
  13: 'low-left, off the zone', 14: 'low-right, off the zone',
}

const fmt3 = (v) => (v == null ? '—' : v.toFixed(3).replace(/^0\./, '.'))
const fmtPct = (v) => (v == null ? '—' : `${(100 * v).toFixed(v >= 0.1 ? 0 : 1)}%`)

// ── Zone matches (audit #11, moved here 2026-08-08 when the Hot Zones tab
// retired — "everything is in the ev log"). Per stat: a zone in the batter's
// top-3 that is ALSO in the pitcher's top-3 damage zones, sample-gated.
// Says "no match" out loud when nothing lines up.
const MATCH_STATS = [
  { key: 'hr_rate', label: 'HR',  col: '#f87171' },
  { key: 'ba',      label: 'BA',  col: '#4ade80' },
  { key: 'fb_rate', label: 'FLY', col: '#22d3ee' },
  { key: 'gb_rate', label: 'GB',  col: '#FCD34D' },
]
const topZones = (cells, key, n = 3) => [...(cells || [])]
  .filter((z) => !z.low_sample && z[key] != null && z[key] > 0)
  .sort((a, b) => b[key] - a[key]).slice(0, n).map((z) => z.zone)

function ZoneMatchStrip({ zp, pzp }) {
  if (!zp || !pzp) return null
  const bCells = zp.zones_13 || zp.zones_9 || []
  const pCells = pzp.damage || []
  const hasShape = bCells.some((z) => z.gb_rate != null) && pCells.some((z) => z.gb_rate != null)
  const rows = MATCH_STATS.map((st) => {
    const shapeStat = st.key === 'gb_rate' || st.key === 'fb_rate'
    if (shapeStat && !hasShape) return { ...st, pending: true, zs: [] }
    const zs = topZones(bCells, st.key).filter((z) => topZones(pCells, st.key).includes(z))
    return { ...st, zs }
  })
  return (
    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 8 }}>
      {rows.map((r) => (
        <span key={r.key} title={r.pending ? 'gb/fly per zone publish with the next nightly cache' : `his top-3 ${r.label} zones ∩ the starter's top-3 bleed zones for the same stat`} style={{
          fontSize: 9, fontFamily: NUM_FONT, borderRadius: 999, padding: '2px 8px',
          border: `1px solid ${r.zs.length ? r.col + '66' : C.border}`,
          color: r.zs.length ? r.col : C.text3, background: r.zs.length ? r.col + '14' : 'transparent',
        }}>
          <b>{r.label}</b>{' '}
          {r.pending ? 'lands with tonight’s cache'
            : r.zs.length ? r.zs.map((z) => ZONE_NAME[z]).join(' · ')
            : 'no match'}
        </span>
      ))}
    </div>
  )
}

function Cell({ main, sub, mark, alpha, red, glow, big, align, title, dim, onHover, hoverKey }) {
  const [v, h] = align || ['center', 'center']
  const base = red ? '248,113,113' : '249,115,22'
  return (
    <div title={title}
      onMouseEnter={onHover ? () => onHover(hoverKey) : undefined}
      onMouseLeave={onHover ? () => onHover(null) : undefined}
      style={{
      display: 'flex', flexDirection: 'column',
      alignItems: h === 'left' ? 'flex-start' : h === 'right' ? 'flex-end' : 'center',
      justifyContent: v === 'top' ? 'flex-start' : v === 'bottom' ? 'flex-end' : 'center',
      background: `rgba(${base},${(alpha || 0).toFixed(2)})`,
      border: `1px solid ${glow ? `rgba(${base},.75)` : C.border}`,
      borderRadius: 4, height: '100%', minHeight: 0, minWidth: 0,
      boxShadow: glow ? `0 0 10px rgba(${base},.4)` : 'none',
      padding: align ? '5px 7px' : 0, overflow: 'hidden',
      opacity: dim ? 0.45 : 1,
    }}>
      <span style={{
        fontFamily: NUM_FONT, fontSize: big ? 11 : 9, lineHeight: 1.25,
        fontWeight: glow ? 900 : 600, color: glow ? '#fff' : C.text2,
      }}>{mark ? `${mark} ` : ''}{main}</span>
      {sub != null && (
        <span style={{ fontFamily: NUM_FONT, fontSize: 7.5, color: C.text3 }}>{sub}</span>
      )}
    </div>
  )
}

// per-pitch chip colors — matches the site's pitch language elsewhere
const P_COLORS = { FF: '#f87171', SI: '#fb923c', FC: '#fbbf24', SL: '#22d3ee', ST: '#67e8f9', CU: '#a78bfa', KC: '#c4b5fd', CH: '#4ade80', FS: '#86efac', OTHER: '#9ca3af' }

// ── TONIGHT'S PITCHES, ON THIS MAP ──────────────────────────────────────────
//
// 2026-08-10, Donovan: "there's no way to just use the spray and strike map we
// already have as the live ones as well?" — so the live feed comes to the map
// instead of the map being rebuilt somewhere else. Everything below draws
// inside the grid that was already here: same cells, same colours, same hover
// popout, one extra layer of real dots on top.
//
// GEOMETRY. The 3x3 strike zone sits at inset 44 with 3px of padding and a 1px
// border, so the zone's interior spans 48px in from every edge of the grid
// container. A pitch at fraction (fx, fz) of the zone therefore lands at
//     x = 48px + fx * (width  - 96px)     y = 48px + fz * (height - 96px)
// and anything outside 0..1 lands in the shadow ring, which is exactly what
// the four corner cells are for. The ring is 48px deep, so a pitch further out
// than that is pinned to the frame and drawn hollow-dim rather than dropped —
// the map never silently loses a pitch.
//
// BOTH AXES ARE EXPRESSED AS calc(% − px), NOT AS ABSOLUTE PIXELS (2026-08-09).
// The vertical used to be computed against a hard-coded 290px container
// height, which quietly welded the dots to one exact container size: the
// moment a phone rule made the grid shorter, every pitch would have been drawn
// in the wrong place with nothing failing loudly. calc(48px + fz*100% −
// fz*96px) is algebraically identical at 290px and correct at every other
// height, so the map can now be sized by CSS. `h` is kept only as the
// documented desktop height.
const ZG = { pad: 48, h: 290 }
const FX_LO = -0.26, FX_HI = 1.26
const FZ_LO = -0.21, FZ_HI = 1.21
const clampf = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v)

function livePos(f) {
  const fx = clampf(f.fx, FX_LO, FX_HI)
  const fz = clampf(f.fz, FZ_LO, FZ_HI)
  return {
    left: `calc(${ZG.pad}px + ${(fx * 100).toFixed(2)}% - ${(fx * ZG.pad * 2).toFixed(2)}px)`,
    top: `calc(${ZG.pad}px + ${(fz * 100).toFixed(2)}% - ${(fz * ZG.pad * 2).toFixed(2)}px)`,
    pinned: fx !== f.fx || fz !== f.fz,
  }
}

const isOffFrame = (f) => f.fx < FX_LO || f.fx > FX_HI || f.fz < FZ_LO || f.fz > FZ_HI

// Shape says WHAT HAPPENED, colour says WHAT WAS THROWN. Six outcomes, drawn
// as plain elements so they inherit the card's typography rather than
// importing a second chart's visual language.
function LiveDot({ kind, col, on, pinned }) {
  // static, centred by the 18px hit-area wrapper around it
  const base = {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxSizing: 'border-box', pointerEvents: 'none', flexShrink: 0,
    opacity: pinned ? 0.4 : on ? 1 : 0.92,
    filter: on ? `drop-shadow(0 0 6px ${col})` : 'none',
  }
  if (kind === 'whiff') {
    return <span style={{ ...base, width: 14, height: 14, color: col, fontFamily: NUM_FONT, fontSize: 12, fontWeight: 900, lineHeight: 1 }}>✕</span>
  }
  if (kind === 'inplay') {
    return <span style={{ ...base, width: 13, height: 13, borderRadius: '50%', background: col, border: '1.6px solid #fff' }} />
  }
  if (kind === 'foul') {
    return <span style={{ ...base, width: 9, height: 9, borderRadius: 1, background: `${col}66`, border: `1.2px solid ${col}` }} />
  }
  if (kind === 'hbp') {
    return <span style={{ ...base, width: 9, height: 9, transform: 'rotate(45deg)', border: `1.6px solid ${col}`, background: 'transparent' }} />
  }
  if (kind === 'called') {
    return <span style={{ ...base, width: 11, height: 11, borderRadius: '50%', background: `${col}3d`, border: `1.6px solid ${col}`, boxShadow: `0 0 0 2px ${col}2e` }} />
  }
  // taken ball — the ones he didn't offer at, kept quiet
  return <span style={{ ...base, width: 9, height: 9, borderRadius: '50%', border: `1.4px solid ${col}`, background: 'transparent', opacity: pinned ? 0.3 : 0.55 }} />
}

const LIVE_KINDS = ['ball', 'called', 'whiff', 'foul', 'inplay']

export default function ZoneMap({ playerId, bats, pitchInfo = null, livePitches = null, liveLabel = '', liveNote = '' }) {
  const [api, setApi] = useState(undefined)
  const [bot, setBot] = useState(null)
  const [stat, setStat] = useState('ev')
  // 🔍 hover popout (2026-08-08, Donovan: "i wish it was like hover over pop
  // out") — a real card instead of the browser's sluggish title bubble. It
  // carries EVERYTHING the Hot Zones tab knows about the cell: his line, his
  // batted-ball shape, the starter's traffic and bleed there. This is how
  // EV Log and Hot Zones become one map without EV Log changing its face.
  const [hover, setHover] = useState(null)
  // tonight's layer: which dot is under the cursor, and an optional pitch-type
  // filter driven by the same pills the rest of the card uses
  const [hoverP, setHoverP] = useState(null)
  const [liveType, setLiveType] = useState(null)

  useEffect(() => { setHoverP(null); setLiveType(null) }, [playerId])

  useEffect(() => {
    let alive = true
    setApi(undefined); setBot(null); setStat('ev')
    hotColdZones(playerId).then((d) => { if (alive) setApi(d) })
    if (playerId) {
      fetch(zonesUrl(playerId))
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!alive) return
          setBot(d)
          // Matchup is the map's whole point — make it the door, not a room.
          if (d?.zone_profile) setStat((s) => (s === 'ev' ? 'matchup' : s))
        })
        .catch(() => {})
    }
    return () => { alive = false }
  }, [playerId])

  const zp = bot?.zone_profile
  const pzp = bot?.pitcher_zone_profile
  const hasBot = !!(zp && (zp.zones_13 || zp.zones_9))
  const isMatch = stat === 'matchup' && hasBot

  // ── tonight's layer ───────────────────────────────────────────────────────
  // Everything here is derived from exactly the pitches handed in, so the
  // legend, the summary and the dots can never describe different samples.
  const allLive = Array.isArray(livePitches) ? livePitches : []
  const liveTypes = pitchTypes(allLive)
  const live = liveType ? allLive.filter((p) => p.type === liveType) : allLive
  const lbox = zoneBox(allLive)
  const lsum = pitchSummary(live, lbox)
  const hasLive = allLive.length > 0
  // every drawn pitch bucketed into the cell it landed in, so the cell popout
  // can say what was thrown there tonight
  const liveByCell = {}
  live.forEach((p) => {
    const zn = zoneCell(p, lbox)
    ;(liveByCell[zn] = liveByCell[zn] || []).push(p)
  })
  // the most recent plate appearance inside this set — "how they're working
  // him right now", in the order it happened
  const lastPi = live.length ? Math.max(...live.map((p) => p.pi)) : null
  const lastAb = lastPi == null ? [] : live.filter((p) => p.pi === lastPi).sort((a, b) => a.seq - b.seq)

  if (api === undefined && !hasBot && !hasLive) {
    return <div style={{ fontSize: 10, color: C.text3, padding: '6px 0', fontFamily: NUM_FONT }}>Loading zone map…</div>
  }
  if (!api && !hasBot && !hasLive) return null

  const ZONES = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '11', '12', '13', '14']
  let cells = {}
  let verdict = null
  // lifted out of the matchup branch so the hover popout can read them
  const bz = {}; (zp?.zones_13 || zp?.zones_9 || []).forEach((z) => { bz[z.zone] = z })
  const use = {}; (pzp?.tendency || []).forEach((t) => { use[t.zone] = t.pct })
  const pd = {}; (pzp?.damage || []).forEach((d) => { pd[d.zone] = d })
  const kill = new Set(pzp?.kill_zones || [])
  const apiZs = api?.[stat === 'matchup' ? 'ev' : stat] || {}

  if (!isMatch) {
    ZONES.forEach((k) => {
      const z = apiZs[k] || apiZs[String(Number(k))]
      cells[k] = z
        ? { main: z.value, alpha: TEMP_ALPHA[z.temp] ?? 0.15, glow: z.temp === 'hot' }
        : { main: '—', alpha: 0 }
    })
  } else {
    const hasP = !!pzp

    // Two edge scores per zone, each normalized to its own max so the
    // brightest cell of each colour is always the story of the night.
    //   hitter: his xSLG there × starter traffic there × (starter also bleeds there)
    //   pitcher: his weakness there (low xwOBA) × starter traffic there
    const hE = {}, pE = {}
    ZONES.forEach((k) => {
      const zn = Number(k); const b = bz[zn]
      const u = hasP ? (use[zn] ?? 0) : 1
      if (!b) { hE[k] = 0; pE[k] = 0; return }
      const pBleed = hasP && pd[zn]?.xslg != null ? 0.5 + 0.5 * Math.min(1, pd[zn].xslg / 0.6) : 1
      hE[k] = (b.xslg ?? 0) * u * pBleed
      pE[k] = Math.max(0, 0.4 - (b.xwoba ?? 0.4)) * u
    })
    const hMax = Math.max(...Object.values(hE), 1e-9)
    const pMax = Math.max(...Object.values(pE), 1e-9)

    ZONES.forEach((k) => {
      const zn = Number(k); const b = bz[zn]
      if (!b) { cells[k] = { main: '—', alpha: 0 }; return }
      const h = hE[k] / hMax, p = pE[k] / pMax
      const hitterWins = h >= p
      const strength = hitterWins ? h : p
      // native title dropped — the hover popout carries all of it, instantly
      cells[k] = {
        main: fmt3(b.xslg),
        sub: hasP && use[zn] != null ? fmtPct(use[zn]) : null,
        mark: hitterWins ? (h >= 0.7 ? '⚡' : '') : (p >= 0.7 ? '⚠' : ''),
        alpha: 0.04 + strength * 0.68,
        red: !hitterWins,
        glow: strength >= 0.7,
        dim: b.low_sample,
      }
    })

    // The verdict: name the one best edge and the one worst hole, in words.
    const bestH = ZONES.reduce((a, k) => (hE[k] > hE[a] ? k : a), ZONES[0])
    const bestP = ZONES.reduce((a, k) => (pE[k] > pE[a] ? k : a), ZONES[0])
    const bh = bz[Number(bestH)], bp = bz[Number(bestP)]
    // COLLISION COUNT (2026-08-07, "how many matches are there"). Absolute
    // gates, NOT the per-map normalization (which always crowns one cell per
    // color even on a nothing matchup): a zone counts only when the starter
    // really goes there (≥7% of pitches) AND the hitter is really dangerous
    // (xSLG ≥ .500) or really lost (xwOBA ≤ .280) in it. So "0 collisions"
    // is a possible — and honest — answer.
    const hisZones = [], theirZones = []
    if (hasP) ZONES.forEach((k) => {
      const zn = Number(k); const b = bz[zn]; const u = use[zn] ?? 0
      if (!b || u < 0.07 || b.low_sample) return
      if ((b.xslg ?? 0) >= 0.5) hisZones.push(zn)
      else if ((b.xwoba ?? 1) <= 0.28) theirZones.push(zn)
    })
    const tally = hasP ? (
      <div style={{ fontSize: 10, fontFamily: NUM_FONT, marginBottom: 6, color: C.text2 }}>
        ⚔ <b style={{ color: C.text }}>{hisZones.length + theirZones.length}</b> real collision{hisZones.length + theirZones.length === 1 ? '' : 's'} tonight
        {hisZones.length + theirZones.length > 0 ? <>
          {' — '}<b style={{ color: C.orange }}>{hisZones.length} his</b>
          {hisZones.length > 0 && <span style={{ color: C.text3 }}> ({hisZones.map((z) => ZONE_NAME[z]).join(', ')})</span>}
          {' · '}<b style={{ color: '#f87171' }}>{theirZones.length} the starter&apos;s</b>
          {theirZones.length > 0 && <span style={{ color: C.text3 }}> ({theirZones.map((z) => ZONE_NAME[z]).join(', ')})</span>}
        </> : <span style={{ color: C.text3 }}> — his zones and the starter&apos;s traffic barely overlap; the map below is relative shading only</span>}
        <span title="A zone counts only when the starter throws there ≥7% AND the hitter slugs ≥.500 (his) or runs ≤.280 xwOBA (theirs), with a real sample. The map's colors are normalized per side; this count is absolute." style={{ cursor: 'help', color: C.text3 }}> ⓘ</span>
      </div>
    ) : null
    verdict = (
      <div style={{ fontSize: 10.5, lineHeight: 1.55, marginBottom: 9, color: C.text2 }}>
        {tally}
        {bh && hE[bestH] > 0 && <>
          <b style={{ color: C.orange }}>⚡ Best edge:</b> {ZONE_NAME[Number(bestH)]} — he slugs{' '}
          <b style={{ fontFamily: NUM_FONT }}>{fmt3(bh.xslg)}</b> there
          {pzp && use[Number(bestH)] != null && <> and the starter goes there <b style={{ fontFamily: NUM_FONT }}>{fmtPct(use[Number(bestH)])}</b> of the time</>}.
        </>}
        {bp && pE[bestP] > 0 && <>
          {' '}<b style={{ color: '#f87171' }}>⚠ Danger:</b> {ZONE_NAME[Number(bestP)]} —{' '}
          <b style={{ fontFamily: NUM_FONT }}>{fmt3(bp.xwoba)}</b> xwOBA
          {pzp && use[Number(bestP)] != null && <> on <b style={{ fontFamily: NUM_FONT }}>{fmtPct(use[Number(bestP)])}</b> of the starter&apos;s pitches</>}.
        </>}
      </div>
    )
  }

  const pills = [...(hasBot ? [{ key: 'matchup', label: '⚔ Matchup', hint: 'Both players on one map — where his zones and the starter’s pitches collide, and who wins each collision' }] : []), ...API_STATS]
  const active = pills.find((s) => s.key === stat) || pills[0]

  return (
    <div style={{
      background: `linear-gradient(155deg, ${C.bg2}, rgba(249,115,22,.03))`,
      border: `1px solid ${C.border}`, borderRadius: 12, padding: '11px 13px', marginBottom: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 800 }}>⌖ Strike-zone map</span>
        {hasLive && (
          <span title={`${allLive.length} tracked pitches from tonight's feed, plotted on this same map`} style={{
            fontSize: 8.5, fontWeight: 900, fontFamily: NUM_FONT, letterSpacing: '.08em',
            color: '#4ade80', border: '1px solid rgba(74,222,128,.45)', background: 'rgba(74,222,128,.10)',
            borderRadius: 999, padding: '2px 8px',
          }}>● LIVE {allLive.length}</span>
        )}
        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
          {pills.map((s) => (
            <button key={s.key} onClick={() => setStat(s.key)} title={s.hint} style={{
              padding: '3px 10px', borderRadius: 999, cursor: 'pointer', fontSize: 9.5,
              fontWeight: 700, fontFamily: NUM_FONT,
              border: `1px solid ${stat === s.key ? C.orange : C.border}`,
              background: stat === s.key ? 'rgba(249,115,22,.14)' : 'transparent',
              color: stat === s.key ? C.orange : C.text3,
            }}>{s.label}</button>
          ))}
        </div>
        <span style={{ fontSize: 9, color: C.text3, fontFamily: NUM_FONT, marginLeft: 'auto' }}>
          {isMatch ? `bot zone cache · ~${zp?.lookback || 120}d · him + tonight's starter` : 'live API · season · MLB grading'}
        </span>
      </div>

      {verdict}
      {isMatch && <ZoneMatchStrip zp={zp} pzp={pzp} />}

      {/* per-pitch strip (2026-08-08, Donovan: "if there's per-pitch data
          show that"). His batted-ball line against each of tonight's
          pitches, usage-ordered. Stated honestly: no zone-BY-pitch split is
          published anywhere, so this rides BESIDE the grid, never pretends
          to be per-cell. */}
      {pitchInfo && pitchInfo.length > 0 && (
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 8 }}>
          {pitchInfo.map((pi) => {
            const col = P_COLORS[pi.code] || P_COLORS.OTHER
            return (
              <span key={pi.code}
                title={`${pi.code}${pi.usage != null ? ` — ${pi.usage.toFixed(0)}% of tonight's starter's mix` : ''}. His batted balls vs this pitch (tracked window): ${pi.seen}${pi.hr ? `, ${pi.hr} HR` : ''}${pi.avgEv ? `, avg EV ${pi.avgEv.toFixed(1)}` : ''}. No zone-by-pitch split exists in the data — this is his line vs the pitch, not a per-cell map.`}
                style={{
                  fontSize: 9, fontFamily: NUM_FONT, borderRadius: 999, padding: '2px 9px',
                  border: `1px solid ${col}55`, color: col, background: `${col}12`, whiteSpace: 'nowrap',
                }}>
                <b>{pi.code}</b>
                {pi.usage != null && <span style={{ opacity: 0.85 }}> {pi.usage.toFixed(0)}%</span>}
                {pi.seen > 0 && <span style={{ color: C.text2 }}> · {pi.seen}bb{pi.hr ? ` · ${pi.hr}HR` : ''}{pi.avgEv ? ` · ${pi.avgEv.toFixed(0)}ev` : ''}</span>}
              </span>
            )
          })}
        </div>
      )}

      {/* TONIGHT'S NUMBERS — computed from exactly the dots drawn below, so
          the strip can never describe a different sample than the picture. */}
      {hasLive && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 5 }}>
            {[
              ['PITCHES', String(lsum.n), C.text, `Every tracked pitch to ${liveLabel || 'this hitter'} tonight`],
              ['STRIKE', lsum.n ? `${Math.round((100 * lsum.strikes) / lsum.n)}%` : '—', '#fbbf24', 'Called, swung at, fouled or put in play'],
              ['IN ZONE', lsum.n ? `${Math.round((100 * lsum.inZone) / lsum.n)}%` : '—', C.cyan, "Inside the batter's own measured zone"],
              ['WHIFF', lsum.swings ? `${Math.round((100 * lsum.whiffs) / lsum.swings)}%` : '—', '#f87171', `${lsum.whiffs} misses on ${lsum.swings} swings`],
              ['CHASE', lsum.outZone ? `${Math.round((100 * lsum.chases) / lsum.outZone)}%` : '—', '#a78bfa', `${lsum.chases} swings at ${lsum.outZone} pitches out of the zone`],
              ['AVG V', lsum.veloAvg != null ? lsum.veloAvg.toFixed(1) : '—', '#fb923c', 'Average release speed of the pitches shown'],
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
          {liveTypes.length > 0 && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              <button onClick={() => setLiveType(null)} style={{
                fontSize: 9, fontFamily: NUM_FONT, fontWeight: 700, cursor: 'pointer',
                borderRadius: 999, padding: '2px 9px',
                border: `1px solid ${liveType ? C.border : C.border2}`,
                background: liveType ? 'transparent' : 'rgba(255,255,255,.05)',
                color: liveType ? C.text3 : C.text2,
              }}>all tonight</button>
              {liveTypes.map((t) => {
                const col = pitchColor(t.code)
                const on = liveType === t.code
                return (
                  <button
                    key={t.code}
                    onClick={() => setLiveType((v) => (v === t.code ? null : t.code))}
                    title={`${LIVE_PITCH_NAMES[t.code] || t.code} · ${t.n} thrown tonight${t.velo != null ? ` · ${t.velo.toFixed(1)} mph avg` : ''}${t.swings ? ` · ${t.whiffs}/${t.swings} whiffs on swings` : ''}`}
                    style={{
                      fontSize: 9, fontFamily: NUM_FONT, fontWeight: 700, cursor: 'pointer',
                      borderRadius: 999, padding: '2px 9px', whiteSpace: 'nowrap',
                      border: `1px solid ${on ? col : C.border}`,
                      background: on ? `${col}1f` : 'transparent',
                      color: on ? col : C.text2,
                    }}
                  >
                    <span style={{ color: col }}>●</span> <b>{t.code}</b> {t.n}
                    {t.velo != null && <span style={{ opacity: 0.7 }}> · {t.velo.toFixed(0)}</span>}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* .zone-wrap / .zone-grid are phone hooks only — MobileCSS widens the
          wrap to the full card and shrinks the grid to a viewport-relative
          square. On a desktop these classes carry nothing. */}
      <div className="zone-wrap" style={{ maxWidth: 250, margin: '0 auto' }}>
        <div className="zone-grid" style={{
          position: 'relative', height: ZG.h,
          display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', gap: 3,
        }}>
          <Cell {...cells['11']} align={['top', 'left']} onHover={setHover} hoverKey="11" />
          <Cell {...cells['12']} align={['top', 'right']} onHover={setHover} hoverKey="12" />
          <Cell {...cells['13']} align={['bottom', 'left']} onHover={setHover} hoverKey="13" />
          <Cell {...cells['14']} align={['bottom', 'right']} onHover={setHover} hoverKey="14" />
          <div style={{
            position: 'absolute', inset: 44,
            display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gridTemplateRows: 'repeat(3, 1fr)',
            gap: 3, background: '#0b0b0d', borderRadius: 6, padding: 3,
            border: `1px solid ${C.border2}`,
          }}>
            {['01', '02', '03', '04', '05', '06', '07', '08', '09'].map((k) => (
              <Cell key={k} {...cells[k]} big onHover={setHover} hoverKey={k} />
            ))}
          </div>

          {/* TONIGHT'S DOTS — the live feed's own pX/pZ, converted into this
              grid's coordinate space and drawn on top of the cells that were
              already here. Shape = what happened, colour = what was thrown. */}
          {hasLive && (
            <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 4 }}>
              {/* the batter's own measured zone, traced over the 3x3 so the
                  dots have the box they were actually judged against */}
              <div style={{
                position: 'absolute', left: ZG.pad, right: ZG.pad, top: ZG.pad, bottom: ZG.pad,
                border: '1px dashed rgba(255,255,255,.28)', borderRadius: 3,
              }} />
              {live.map((p, i) => {
                const pos = livePos(zoneFrac(p, lbox))
                const on = hoverP === i
                return (
                  <span
                    key={`${p.pi}-${p.seq}`}
                    onMouseEnter={() => setHoverP(i)}
                    onMouseLeave={() => setHoverP((v) => (v === i ? null : v))}
                    style={{
                      position: 'absolute', left: pos.left, top: pos.top,
                      width: 18, height: 18, transform: 'translate(-50%,-50%)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      pointerEvents: 'auto', cursor: 'crosshair', zIndex: on ? 5 : 4,
                    }}
                  >
                    <LiveDot kind={p.kind} col={pitchColor(p.type)} on={on} pinned={pos.pinned} />
                  </span>
                )
              })}
            </div>
          )}

          {/* the popout for a single live pitch — same card, same type, same
              placement rule as the cell popout below it */}
          {hasLive && hoverP != null && live[hoverP] && (() => {
            const p = live[hoverP]
            const f = zoneFrac(p, lbox)
            const col = pitchColor(p.type)
            const L = ({ children, dim: d2 }) => (
              <div style={{ fontSize: 9, fontFamily: NUM_FONT, color: d2 ? C.text3 : C.text2, lineHeight: 1.6, whiteSpace: 'nowrap' }}>{children}</div>
            )
            return (
              <div style={{
                position: 'absolute', zIndex: 7, pointerEvents: 'none', width: 170,
                ...(f.fx > 0.5 ? { right: '62%' } : { left: '62%' }),
                ...(f.fz > 0.66 ? { bottom: 0 } : f.fz > 0.33 ? { top: '28%' } : { top: 0 }),
                background: '#0b0b0d', border: `1px solid ${col}88`,
                borderRadius: 8, padding: '7px 10px', boxShadow: '0 6px 20px rgba(0,0,0,.55)',
              }}>
                <div style={{ fontSize: 9.5, fontWeight: 900, color: col, marginBottom: 2, whiteSpace: 'nowrap' }}>
                  {p.typeName || LIVE_PITCH_NAMES[p.type] || p.type || 'pitch'}
                  {p.velo != null ? ` · ${p.velo.toFixed(1)} mph` : ''}
                </div>
                <L>{p.call || KIND_LABEL[p.kind]}</L>
                <L>pitch {p.seq} of the PA · {p.cnt} count</L>
                <L dim>{pitchInZone(p, lbox) ? 'in the zone' : 'out of the zone'} · {ZONE_NAME[zoneCell(p, lbox)]}</L>
                {p.batterName && <L dim>{p.batterName} vs {p.pitcherName || '—'}</L>}
                {p.inning != null && <L dim>{String(p.half || '').slice(0, 3)} {p.inning}</L>}
                {isOffFrame(f) && <L dim>drawn at the frame — it missed further than this map goes</L>}
              </div>
            )
          })()}

          {/* THE POPOUT — everything Hot Zones knows about the cell, on
              hover, instantly, without leaving this map. It sits on the
              opposite side of the hovered cell so it never covers it. */}
          {hover != null && (() => {
            const zn = Number(hover)
            const col = zn >= 11 ? (zn === 11 || zn === 13 ? 0 : 2) : (zn - 1) % 3
            const row = zn >= 11 ? (zn <= 12 ? 0 : 2) : Math.floor((zn - 1) / 3)
            const b = bz[zn]
            const z = apiZs[hover] || apiZs[String(zn)]
            const isKill = kill.has(zn)
            const L = ({ children, dim: d2 }) => (
              <div style={{ fontSize: 9, fontFamily: NUM_FONT, color: d2 ? C.text3 : C.text2, lineHeight: 1.6, whiteSpace: 'nowrap' }}>{children}</div>
            )
            const shape = b && (b.gb_rate != null || b.fb_rate != null)
            return (
              <div style={{
                position: 'absolute', zIndex: 6, pointerEvents: 'none', width: 158,
                ...(col === 2 ? { right: '62%' } : { left: '62%' }),
                ...(row === 2 ? { bottom: 0 } : row === 1 ? { top: '28%' } : { top: 0 }),
                background: '#0b0b0d', border: `1px solid ${isKill ? 'rgba(248,113,113,.55)' : C.border2}`,
                borderRadius: 8, padding: '7px 10px', boxShadow: '0 6px 20px rgba(0,0,0,.55)',
              }}>
                <div style={{ fontSize: 9.5, fontWeight: 900, color: isKill ? '#f87171' : C.text, marginBottom: 2, whiteSpace: 'nowrap' }}>
                  {ZONE_NAME[zn]}{isKill ? ' · KILL ZONE' : ''}
                </div>
                {b ? (<>
                  <L>{b.pa} PA · {b.hr} HR · BA {fmt3(b.ba)}</L>
                  <L>xSLG {fmt3(b.xslg)} · xwOBA {fmt3(b.xwoba)}</L>
                  {shape
                    ? <L>GB {fmtPct(b.gb_rate)} · FLY {fmtPct(b.fb_rate)}</L>
                    : <L dim>gb/fly land with tonight&apos;s cache</L>}
                  {pzp && use[zn] != null && (
                    <L>starter: {fmtPct(use[zn])} here{pd[zn]?.xslg != null ? ` · bleeds ${fmt3(pd[zn].xslg)}` : ''}</L>
                  )}
                  {b.low_sample && <L dim>small sample — read lightly</L>}
                </>) : z ? (
                  <L>{active?.label} {z.value} · {z.temp}</L>
                ) : (
                  <L dim>no data in this zone</L>
                )}
                {/* WHAT WAS THROWN HERE TONIGHT — the live layer joins the
                    same popout rather than opening a second language. */}
                {hasLive && (() => {
                  const here = liveByCell[zn] || []
                  return (
                    <div style={{ marginTop: 4, paddingTop: 4, borderTop: `1px solid ${C.border}` }}>
                      <div style={{ fontSize: 8, fontWeight: 900, letterSpacing: '.08em', color: '#4ade80', fontFamily: NUM_FONT }}>
                        ● TONIGHT
                      </div>
                      {here.length === 0 ? (
                        <L dim>nothing thrown here yet</L>
                      ) : (<>
                        <L>{here.length} pitch{here.length === 1 ? '' : 'es'}
                          {here.filter((p) => p.kind === 'whiff').length > 0 ? ` · ${here.filter((p) => p.kind === 'whiff').length} whiff` : ''}
                          {here.filter((p) => p.kind === 'inplay').length > 0 ? ` · ${here.filter((p) => p.kind === 'inplay').length} in play` : ''}
                        </L>
                        {[...new Set(here.map((p) => p.type).filter(Boolean))].slice(0, 4).map((t) => {
                          const of = here.filter((p) => p.type === t)
                          const vs = of.map((p) => p.velo).filter((v) => v != null)
                          return (
                            <L key={t}>
                              <span style={{ color: pitchColor(t) }}>●</span> {t} ×{of.length}
                              {vs.length ? ` · ${(vs.reduce((a, c) => a + c, 0) / vs.length).toFixed(0)} mph` : ''}
                            </L>
                          )
                        })}
                        <L dim>{here[here.length - 1].call || KIND_LABEL[here[here.length - 1].kind]} (last)</L>
                      </>)}
                    </div>
                  )
                })()}
              </div>
            )
          })()}
        </div>
      </div>

      {/* LIVE KEY — the shapes, in the same row height and type as the rest
          of this card, so nothing here reads as a borrowed chart. */}
      {hasLive && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginTop: 7, fontSize: 8.5, color: C.text3, fontFamily: NUM_FONT }}>
          <span style={{ color: '#4ade80', fontWeight: 900, letterSpacing: '.07em' }}>● TONIGHT</span>
          {LIVE_KINDS.map((k) => (
            <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span style={{ display: 'inline-flex', width: 15, height: 15, alignItems: 'center', justifyContent: 'center' }}>
                <LiveDot kind={k} col={C.text2} />
              </span>
              {KIND_LABEL[k]}
            </span>
          ))}
          <span style={{ marginLeft: 'auto' }}>colour = pitch type</span>
        </div>
      )}

      {/* THIS AT-BAT, PITCH BY PITCH — how they're working him right now, in
          the order it happened, with the count before each pitch. */}
      {hasLive && lastAb.length > 0 && (
        <div style={{ marginTop: 7, border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 9px', background: 'rgba(74,222,128,.035)' }}>
          <div style={{ fontSize: 8.5, fontWeight: 900, letterSpacing: '.07em', color: '#4ade80', fontFamily: NUM_FONT, marginBottom: 3 }}>
            LATEST PLATE APPEARANCE
            {lastAb[0].batterName ? ` · ${lastAb[0].batterName}` : ''}
            {lastAb[0].pitcherName ? ` vs ${lastAb[0].pitcherName}` : ''}
            {lastAb[0].inning != null ? ` · ${String(lastAb[0].half || '').slice(0, 3)}${lastAb[0].inning}` : ''}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {lastAb.map((p) => (
              <div key={`${p.pi}-${p.seq}`} style={{ display: 'flex', gap: 7, alignItems: 'baseline', fontSize: 9.5, fontFamily: NUM_FONT, minWidth: 0 }}>
                <span style={{ color: C.text3, width: 12, flexShrink: 0 }}>{p.seq}</span>
                <span style={{ color: C.text2, width: 24, flexShrink: 0 }}>{p.cnt}</span>
                <span style={{ color: pitchColor(p.type), fontWeight: 800, width: 26, flexShrink: 0 }}>{p.type || '—'}</span>
                <span style={{ color: C.text2, width: 30, flexShrink: 0 }}>{p.velo != null ? p.velo.toFixed(0) : '—'}</span>
                <span style={{
                  color: p.kind === 'whiff' ? '#f87171' : p.kind === 'inplay' ? '#4ade80' : p.kind === 'called' ? '#fbbf24' : C.text3,
                  fontWeight: p.kind === 'whiff' || p.kind === 'inplay' ? 800 : 500,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0,
                }}>{p.call || KIND_LABEL[p.kind]}</span>
                <span style={{ marginLeft: 'auto', flexShrink: 0, color: C.text3 }}>
                  {pitchInZone(p, lbox) ? 'zone' : 'off'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ fontSize: 8.5, color: C.text3, marginTop: 6, lineHeight: 1.5 }}>
        {hasLive && <>
          <b style={{ color: '#4ade80' }}>Tonight&apos;s dots</b> are the live feed&apos;s own pX/pZ, laid over the
          same grid: the dashed box is the batter&apos;s measured zone ({lbox.bot.toFixed(2)}–{lbox.top.toFixed(2)} ft
          {lbox.measured ? '' : ', league default — no measured zone in this feed yet'}), anything outside it sits
          in the shadow corners. Hover a dot for the pitch, the call and the count; hover a cell for what was
          thrown there tonight on top of his season line.{liveNote ? ` ${liveNote}` : ''}{' '}
        </>}
        {isMatch
          ? <>One map, both players. The number is HIS xSLG in that zone; the small number is how often
            tonight&apos;s starter throws there. <span style={{ color: C.orange }}>Orange = his damage meets
            their traffic</span> (⚡ strongest edge) · <span style={{ color: '#f87171' }}>red = his hole meets
            their traffic</span> (⚠ biggest danger) · dim = nothing collides there. Hover any cell for both
            sides of it.</>
          : (api || hasBot)
            ? <>{active?.label} by pitch location, MLB-graded hot/cold — brighter orange is hotter for the hitter.</>
            : <>No season zone file for this hitter yet, so the cells are empty on purpose — only tonight&apos;s dots are real here.</>}
        {' '}Catcher&apos;s view{bats === 'L' ? ' — for this lefty, inside is the right column' : bats === 'R' ? ' — for this righty, inside is the left column' : ''}. Corners are out-of-zone. Faded = small sample.
      </div>
    </div>
  )
}
