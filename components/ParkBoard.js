'use client'
import { useMemo } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { n, clean, nameOf, teamOf, oppOf } from '../lib/player'

// "Luis García Jr." must not render as "Jr." — keep the suffix attached.
const SUFFIX = new Set(['jr.', 'jr', 'sr.', 'sr', 'ii', 'iii', 'iv'])
const surname = (full) => {
  const parts = String(full || '').trim().split(/\s+/)
  if (parts.length >= 2 && SUFFIX.has(parts[parts.length - 1].toLowerCase())) {
    return parts.slice(-2).join(' ')
  }
  return parts.slice(-1)[0] || '?'
}

// 🏟 PARK BOARD — tonight's parks ranked by HR-friendliness (2026-08-07).
//
// Promoted out of the Longest board's footnote strip to the top of the Power
// page, where Donovan expected it. One honest edge number per park:
//   park term — (park HR factor − 1) × 100, the bot's own park number
//   weather   — the bot's weather_hr_effect_pct when published, else a
//               gentle wind/temp heuristic (±1 per mph out/in, +1 per ~7°F
//               over 70) so the board still ranks on thin payloads.
// It ranks cards and scores nothing. Each card names the two biggest
// distance threats in that building (by longest_hr_score) and clicking a
// card filters the Longest board to that game — click again to release.

const wTemp = (p) => n(p?.weather_temp_f, n(p?.temp_f, 0))
const wWind = (p) => n(p?.weather_wind_mph, n(p?.wind_mph, 0))

export default function ParkBoard({ players = [], activeVenue, onVenueClick, onPlayerClick }) {
  const parks = useMemo(() => {
    const map = new Map()
    players.forEach((p) => {
      const pk = p?.game_pk
      if (pk == null) return
      if (!map.has(pk)) {
        map.set(pk, {
          pk,
          venue: clean(p?.venue_name, ''),
          temp: wTemp(p),
          wind: wWind(p),
          windLabel: clean(p?.wind_direction_label, ''),
          parkHR: n(p?.park_hr_factor, n(p?.park_dist_factor, 0)),
          wxEff: n(p?.weather_hr_effect_pct, n(p?.hr_weather_effect_pct, null)),
          roof: clean(p?.roof, ''),
          matchup: `${teamOf(p) || '?'} vs ${oppOf(p) || '?'}`,
          bats: [],
        })
      }
      map.get(pk).bats.push(p)
    })
    const out = [...map.values()].filter((g) => g.venue || g.temp)
    const windOut = (g) => /out/i.test(g.windLabel) ? g.wind : /in\b/i.test(g.windLabel) ? -g.wind : 0
    out.forEach((g) => {
      const parkTerm = g.parkHR > 0 ? (g.parkHR - 1) * 100 : 0
      const wxTerm = g.wxEff != null ? g.wxEff : windOut(g) + (g.temp > 0 ? (g.temp - 70) / 7 : 0)
      g.edge = parkTerm + wxTerm
      g.wxFromBot = g.wxEff != null
      g.threats = [...g.bats].sort((a, b) => n(b?.longest_hr_score, 0) - n(a?.longest_hr_score, 0)).slice(0, 2)
    })
    out.sort((a, b) => b.edge - a.edge)
    return out
  }, [players])

  if (!parks.length) return null

  // Visual bands (2026-08-07, "this need to be cooler"): the edge number
  // decides the card's whole personality — launch pads burn, ice boxes
  // freeze, the middle stays quiet. Top three glow.
  const bandOf = (edge) => edge >= 10 ? { icon: '🌋', col: '#f97316', word: 'LAUNCH PAD' }
    : edge >= 5 ? { icon: '🔥', col: '#fb923c', word: 'CARRIES' }
    : edge >= 0 ? { icon: '🌤', col: '#FCD34D', word: 'FAIR' }
    : edge >= -8 ? { icon: '🌬', col: '#7dd3fc', word: 'HEAVY AIR' }
    : { icon: '🧊', col: '#38bdf8', word: 'ICE BOX' }

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 7, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12.5, fontWeight: 900 }}>🏟 Tonight&apos;s parks</span>
        <span style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT }}>
          🌋 launch pads → 🧊 ice boxes · park factor + tonight&apos;s air · tap to filter the board
        </span>
      </div>
      <div style={{
        display: 'grid', gap: 8,
        gridTemplateColumns: 'repeat(auto-fill, minmax(172px, 1fr))',
      }}>
        {parks.map((g, i2) => {
          const band = bandOf(g.edge)
          const isActive = activeVenue && g.venue === activeVenue
          const isTop = i2 < 3 && g.edge > 0
          const out = /out/i.test(g.windLabel)
          const wIn = /in\b/i.test(g.windLabel)
          const roofNote = g.roof && !/open/i.test(g.roof) ? g.roof : ''
          return (
            <div
              key={g.pk}
              onClick={() => onVenueClick?.(isActive ? '' : g.venue)}
              title={`Park ${g.parkHR > 0 ? `×${g.parkHR.toFixed(2)}` : '—'} + ${g.wxFromBot ? "the bot's weather HR effect" : 'wind/temp heuristic (bot weather effect not published for this game)'} = ${g.edge > 0 ? '+' : ''}${g.edge.toFixed(0)}% vs neutral. Ranks this board, scores nothing.`}
              style={{
                cursor: 'pointer', position: 'relative', overflow: 'hidden', minWidth: 0,
                background: `linear-gradient(160deg, ${band.col}${isTop ? '26' : '14'} 0%, ${band.col}05 55%, transparent 100%)`,
                border: `1px solid ${isActive ? band.col : `${band.col}${isTop ? '70' : '35'}`}`,
                borderRadius: 12, padding: '9px 11px 8px',
                boxShadow: isActive ? `0 0 18px ${band.col}44` : isTop ? `0 0 12px ${band.col}22` : 'none',
              }}
            >
              {/* rank watermark */}
              <div style={{
                position: 'absolute', top: -8, right: 2, fontFamily: NUM_FONT,
                fontSize: 44, fontWeight: 900, color: band.col, opacity: 0.10, lineHeight: 1, pointerEvents: 'none',
              }}>{i2 + 1}</div>

              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ fontSize: 15 }}>{band.icon}</span>
                <span style={{ fontSize: 19, fontWeight: 900, fontFamily: NUM_FONT, color: band.col, letterSpacing: '-0.02em' }}>
                  {g.edge > 0 ? '+' : ''}{g.edge.toFixed(0)}%
                </span>
                <span style={{ fontSize: 7.5, fontWeight: 900, color: band.col, letterSpacing: '.1em', fontFamily: NUM_FONT, opacity: 0.85 }}>
                  {band.word}
                </span>
              </div>

              <div style={{ fontSize: 11, fontWeight: 800, marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {g.venue || g.matchup}
              </div>
              <div style={{ display: 'flex', gap: 7, alignItems: 'baseline', marginTop: 2, fontFamily: NUM_FONT, fontSize: 9, color: C.text3 }}>
                <span style={{ fontWeight: 800, color: C.text2 }}>{g.matchup}</span>
                {g.temp > 0 && <span style={{ color: g.temp >= 82 ? '#fb923c' : g.temp <= 58 ? '#38bdf8' : C.text3 }}>{Math.round(g.temp)}°</span>}
                {g.wind > 0 && (
                  <span title={g.windLabel} style={{ color: out ? '#fb923c' : wIn ? '#38bdf8' : C.text3, fontWeight: 800 }}>
                    {out ? '↗' : wIn ? '↙' : '→'}{Math.round(g.wind)}
                  </span>
                )}
                {g.parkHR > 0 && <span>×{g.parkHR.toFixed(2)}</span>}
                {roofNote && <span>🏠 {roofNote}</span>}
              </div>

              {g.threats.length > 0 && (
                <div style={{ display: 'flex', gap: 7, marginTop: 5, flexWrap: 'wrap', borderTop: `1px solid ${band.col}22`, paddingTop: 4 }}>
                  {g.threats.map((p) => (
                    <span
                      key={p?.player_id || nameOf(p)}
                      onClick={(e) => { e.stopPropagation(); onPlayerClick?.(p) }}
                      title={`Biggest distance threat in this building tonight — longest-HR score ${n(p?.longest_hr_score, 0).toFixed(0)}`}
                      style={{ fontSize: 9, fontWeight: 700, color: C.text2, cursor: 'pointer', whiteSpace: 'nowrap' }}
                    >
                      💪 {surname(nameOf(p))}
                      <b style={{ fontFamily: NUM_FONT, color: band.col }}> {n(p?.longest_hr_score, 0).toFixed(0)}</b>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
