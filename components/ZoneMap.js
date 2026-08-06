'use client'
import { useEffect, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { hotColdZones } from '../lib/situational'
import { zonesUrl } from '../lib/dataSource'

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

function Cell({ main, sub, mark, alpha, red, glow, big, align, title, dim }) {
  const [v, h] = align || ['center', 'center']
  const base = red ? '248,113,113' : '249,115,22'
  return (
    <div title={title} style={{
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

export default function ZoneMap({ playerId, bats }) {
  const [api, setApi] = useState(undefined)
  const [bot, setBot] = useState(null)
  const [stat, setStat] = useState('ev')

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

  if (api === undefined && !hasBot) {
    return <div style={{ fontSize: 10, color: C.text3, padding: '6px 0', fontFamily: NUM_FONT }}>Loading zone map…</div>
  }
  if (!api && !hasBot) return null

  const ZONES = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '11', '12', '13', '14']
  let cells = {}
  let verdict = null

  if (!isMatch) {
    const zs = api?.[stat === 'matchup' ? 'ev' : stat] || {}
    ZONES.forEach((k) => {
      const z = zs[k] || zs[String(Number(k))]
      cells[k] = z
        ? { main: z.value, alpha: TEMP_ALPHA[z.temp] ?? 0.15, glow: z.temp === 'hot', title: `${ZONE_NAME[Number(k)]} · ${z.temp}` }
        : { main: '—', alpha: 0 }
    })
  } else {
    const bz = {}; (zp.zones_13 || zp.zones_9 || []).forEach((z) => { bz[z.zone] = z })
    const use = {}; (pzp?.tendency || []).forEach((t) => { use[t.zone] = t.pct })
    const pd = {}; (pzp?.damage || []).forEach((d) => { pd[d.zone] = d })
    const kill = new Set(pzp?.kill_zones || [])
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
      const isKill = kill.has(zn)
      cells[k] = {
        main: fmt3(b.xslg),
        sub: hasP && use[zn] != null ? fmtPct(use[zn]) : null,
        mark: hitterWins ? (h >= 0.7 ? '⚡' : '') : (p >= 0.7 ? '⚠' : ''),
        alpha: 0.04 + strength * 0.68,
        red: !hitterWins,
        glow: strength >= 0.7,
        dim: b.low_sample,
        title: `${ZONE_NAME[zn]} — him: ${b.hr} HR · ${fmt3(b.ba)} BA · xSLG ${fmt3(b.xslg)} in ${b.pa} PA`
          + (hasP ? ` — starter: throws here ${fmtPct(use[zn])}, allows xSLG ${fmt3(pd[zn]?.xslg)}${isKill ? ' · KILL ZONE' : ''}` : ''),
      }
    })

    // The verdict: name the one best edge and the one worst hole, in words.
    const bestH = ZONES.reduce((a, k) => (hE[k] > hE[a] ? k : a), ZONES[0])
    const bestP = ZONES.reduce((a, k) => (pE[k] > pE[a] ? k : a), ZONES[0])
    const bh = bz[Number(bestH)], bp = bz[Number(bestP)]
    verdict = (
      <div style={{ fontSize: 10.5, lineHeight: 1.55, marginBottom: 9, color: C.text2 }}>
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

      <div style={{ maxWidth: 250, margin: '0 auto' }}>
        <div style={{
          position: 'relative', height: 290,
          display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', gap: 3,
        }}>
          <Cell {...cells['11']} align={['top', 'left']} />
          <Cell {...cells['12']} align={['top', 'right']} />
          <Cell {...cells['13']} align={['bottom', 'left']} />
          <Cell {...cells['14']} align={['bottom', 'right']} />
          <div style={{
            position: 'absolute', inset: 44,
            display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gridTemplateRows: 'repeat(3, 1fr)',
            gap: 3, background: '#0b0b0d', borderRadius: 6, padding: 3,
            border: `1px solid ${C.border2}`,
          }}>
            {['01', '02', '03', '04', '05', '06', '07', '08', '09'].map((k) => (
              <Cell key={k} {...cells[k]} big />
            ))}
          </div>
        </div>
      </div>

      <div style={{ fontSize: 8.5, color: C.text3, marginTop: 6, lineHeight: 1.5 }}>
        {isMatch
          ? <>One map, both players. The number is HIS xSLG in that zone; the small number is how often
            tonight&apos;s starter throws there. <span style={{ color: C.orange }}>Orange = his damage meets
            their traffic</span> (⚡ strongest edge) · <span style={{ color: '#f87171' }}>red = his hole meets
            their traffic</span> (⚠ biggest danger) · dim = nothing collides there. Hover any cell for both
            sides of it.</>
          : <>{active?.label} by pitch location, MLB-graded hot/cold — brighter orange is hotter for the hitter.</>}
        {' '}Catcher&apos;s view{bats === 'L' ? ' — for this lefty, inside is the right column' : bats === 'R' ? ' — for this righty, inside is the left column' : ''}. Corners are out-of-zone. Faded = small sample.
      </div>
    </div>
  )
}
