'use client'
import { useEffect, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { hotColdZones } from '../lib/situational'
import { zonesUrl } from '../lib/dataSource'

// STRIKE-ZONE MAP — two data lanes, one grid.
//
// API lane (always available): StatsAPI hotColdZones — per-zone exit velo,
// SLG, OPS, AVG with MLB's own hot/cold grading. Season, batter only.
//
// BOT lane (when current/zones/ has this hitter): the spray-cache zone
// profiles — batter per-zone HR rate / xSLG / xwOBA over the last ~120 days,
// PLUS tonight's starter per-zone usage and his kill zones. That second half
// is what turns a heat map into a matchup: three views —
//   Zone match  — where his damage meets the starter's actual pitch traffic
//   HR% v use   — where his homers live, weighted by how often this arm goes there
//   Weak zones  — the holes tonight's attack plan will hunt (red, inverted)
// Verified live 2026-08-06 (Kwan, zones/today/batter_680757.json).
//
// Colour rule holds: orange = good for the hitter. The weak view is the one
// deliberate exception — red, because it maps what's bad for him.

const TEMP_ALPHA = { hot: 0.8, warm: 0.5, lukewarm: 0.26, cool: 0.12, cold: 0.05 }

const API_STATS = [
  { key: 'ev', label: 'Exit velo', hint: 'Average EV on balls hit from this zone — season, live API' },
  { key: 'slg', label: 'SLG', hint: 'Slugging on pitches in this zone — season, live API' },
  { key: 'ops', label: 'OPS', hint: 'OPS on pitches in this zone — season, live API' },
  { key: 'avg', label: 'AVG', hint: 'Average on pitches in this zone — season, live API' },
]
const BOT_STATS = [
  { key: 'match', label: '⚔ Zone match', hint: 'His xSLG per zone × how often tonight’s starter throws there — bright cells are where damage meets traffic' },
  { key: 'hrvuse', label: 'HR% v use', hint: 'His HR rate per zone, weighted by the starter’s usage — where his homers live on pitches he’ll actually see' },
  { key: 'weak', label: '⚠ Weak zones', hint: 'Inverted and red: where he’s weakest AND the starter goes often — the holes tonight’s attack plan hunts' },
]

const fmt3 = (v) => (v == null ? '—' : v.toFixed(3).replace(/^0\./, '.'))
const fmtPct = (v) => (v == null ? '—' : `${(100 * v).toFixed(v >= 0.1 ? 0 : 1)}%`)

function Cell({ main, sub, alpha, red, glow, big, align, title, dim }) {
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
      }}>{main}</span>
      {sub != null && (
        <span style={{ fontFamily: NUM_FONT, fontSize: 7.5, color: C.text3 }}>{sub}</span>
      )}
    </div>
  )
}

export default function ZoneMap({ playerId, bats }) {
  const [api, setApi] = useState(undefined)   // hotColdZones; undefined = loading
  const [bot, setBot] = useState(null)        // current/zones file, or null
  const [stat, setStat] = useState('ev')

  useEffect(() => {
    let alive = true
    setApi(undefined); setBot(null)
    // A bot view can't survive a player switch until the new zones file lands.
    setStat((s) => (BOT_STATS.some((b) => b.key === s) ? 'ev' : s))
    hotColdZones(playerId).then((d) => { if (alive) setApi(d) })
    if (playerId) {
      fetch(zonesUrl(playerId))
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (alive) setBot(d) })
        .catch(() => {})
    }
    return () => { alive = false }
  }, [playerId])

  const zp = bot?.zone_profile
  const pzp = bot?.pitcher_zone_profile
  const hasBot = !!(zp && (zp.zones_13 || zp.zones_9))
  const hasUse = !!(pzp && pzp.tendency)
  const isBotView = BOT_STATS.some((s) => s.key === stat)

  if (api === undefined && !hasBot) {
    return <div style={{ fontSize: 10, color: C.text3, padding: '6px 0', fontFamily: NUM_FONT }}>Loading zone map…</div>
  }
  if (!api && !hasBot) return null

  // ── build the 13 cells for whatever view is active ─────────────────────────
  const ZONES = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '11', '12', '13', '14']
  let cells = {}

  if (!isBotView || !hasBot) {
    const zs = api?.[stat] || {}
    ZONES.forEach((k) => {
      const z = zs[k] || zs[String(Number(k))]
      cells[k] = z
        ? { main: z.value, alpha: TEMP_ALPHA[z.temp] ?? 0.15, glow: z.temp === 'hot', title: `${z.temp}` }
        : { main: '—', alpha: 0 }
    })
  } else {
    const bz = {}
    ;(zp.zones_13 || zp.zones_9 || []).forEach((z) => { bz[z.zone] = z })
    const use = {}
    ;(pzp?.tendency || []).forEach((t) => { use[t.zone] = t.pct })
    const kill = new Set(pzp?.kill_zones || [])

    // score per zone, then normalize so the brightest cell is the story
    const raw = {}
    ZONES.forEach((k) => {
      const zn = Number(k)
      const b = bz[zn]
      const u = use[zn] ?? null
      if (!b) { raw[k] = null; return }
      if (stat === 'match') raw[k] = (b.xslg ?? 0) * (hasUse ? (u ?? 0) : 1)
      else if (stat === 'hrvuse') raw[k] = (b.hr_rate ?? 0) * (hasUse ? (u ?? 0) : 1)
      else raw[k] = Math.max(0, 0.4 - (b.xwoba ?? 0.4)) * (hasUse ? (u ?? 0) : 1) // weak: low xwOBA × traffic
    })
    const max = Math.max(...Object.values(raw).filter((v) => v != null), 0.000001)
    ZONES.forEach((k) => {
      const zn = Number(k)
      const b = bz[zn]
      const u = use[zn]
      if (!b) { cells[k] = { main: '—', alpha: 0 }; return }
      const score = raw[k] == null ? 0 : raw[k] / max
      const isKill = kill.has(zn)
      cells[k] = {
        main: stat === 'match' ? fmt3(b.xslg) : stat === 'hrvuse' ? fmtPct(b.hr_rate) : fmt3(b.xwoba),
        sub: hasUse && u != null ? `${isKill ? '⚠' : ''}${fmtPct(u)}` : null,
        alpha: 0.04 + score * 0.72,
        glow: score >= 0.72,
        red: stat === 'weak',
        dim: b.low_sample,
        title: `zone ${zn} · ${b.pa} PA · ${b.hr} HR · BA ${fmt3(b.ba)} · xwOBA ${fmt3(b.xwoba)} · xSLG ${fmt3(b.xslg)}${u != null ? ` · starter throws here ${fmtPct(u)}` : ''}${isKill ? ' · STARTER KILL ZONE' : ''}`,
      }
    })
  }

  const active = [...API_STATS, ...BOT_STATS].find((s) => s.key === stat)

  return (
    <div style={{
      background: `linear-gradient(155deg, ${C.bg2}, rgba(249,115,22,.03))`,
      border: `1px solid ${C.border}`, borderRadius: 12, padding: '11px 13px', marginBottom: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 800 }}>⌖ Strike-zone map</span>
        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
          {API_STATS.map((s) => (
            <button key={s.key} onClick={() => setStat(s.key)} title={s.hint} style={{
              padding: '3px 10px', borderRadius: 999, cursor: 'pointer', fontSize: 9.5,
              fontWeight: 700, fontFamily: NUM_FONT,
              border: `1px solid ${stat === s.key ? C.orange : C.border}`,
              background: stat === s.key ? 'rgba(249,115,22,.14)' : 'transparent',
              color: stat === s.key ? C.orange : C.text3,
            }}>{s.label}</button>
          ))}
          {hasBot && BOT_STATS.map((s) => (
            <button key={s.key} onClick={() => setStat(s.key)} title={s.hint} style={{
              padding: '3px 10px', borderRadius: 999, cursor: 'pointer', fontSize: 9.5,
              fontWeight: 700, fontFamily: NUM_FONT,
              border: `1px solid ${stat === s.key ? (s.key === 'weak' ? '#f87171' : C.orange) : C.border2}`,
              background: stat === s.key ? (s.key === 'weak' ? 'rgba(248,113,113,.12)' : 'rgba(249,115,22,.14)') : 'rgba(255,255,255,.02)',
              color: stat === s.key ? (s.key === 'weak' ? '#f87171' : C.orange) : C.text2,
            }}>{s.label}</button>
          ))}
        </div>
        <span style={{ fontSize: 9, color: C.text3, fontFamily: NUM_FONT, marginLeft: 'auto' }}>
          {isBotView ? `bot zone cache · ~${zp?.lookback || 120}d${hasUse ? ' · vs tonight’s starter' : ''}` : 'live API · season · MLB’s own grading'}
        </span>
      </div>

      {/* Fixed-height frame — v1 collapsed (abs-positioned child) and spilled
          over the controls. Corner values pinned into visible corners. */}
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
        {stat === 'match' && <>His xSLG in each cell, tonight&apos;s starter&apos;s usage share under it — <span style={{ color: C.orange }}>bright = his damage meets the pitch traffic</span>. ⚠ marks the starter&apos;s kill zones (high damage allowed AND high usage — live dangerously there).</>}
        {stat === 'hrvuse' && <>His per-zone HR rate over the starter&apos;s usage — <span style={{ color: C.orange }}>bright = homers live where this arm actually throws</span>. A hot cell the starter avoids is trivia; a hot cell he pounds is a bet.</>}
        {stat === 'weak' && <><span style={{ color: '#f87171' }}>Red = the holes</span>: lowest xwOBA weighted by how often the starter comes there — the cells tonight&apos;s attack plan will hunt. ⚠ = also a starter kill zone; that combination is the strikeout script.</>}
        {!isBotView && <>{active?.label} by pitch location, graded hot/cold by MLB against league norms — brighter orange is hotter for the hitter.</>}
        {' '}Catcher&apos;s view{bats === 'L' ? ' — for a lefty, inside is the right column' : bats === 'R' ? ' — for a righty, inside is the left column' : ''}. Corner panels are out-of-zone. Faded cells are small samples. Hover any cell for the full line.
      </div>
    </div>
  )
}
