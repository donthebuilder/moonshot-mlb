'use client'
import { useMemo } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { n, clean, nameOf, teamOf, oppOf } from '../lib/player'

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

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 12.5, fontWeight: 900 }}>🏟 Tonight&apos;s parks, ranked</span>
        <span style={{ fontSize: 9.5, color: C.text3 }}>
          park factor + tonight&apos;s air, one edge number vs a neutral night — tap a park to filter the board to that game
        </span>
      </div>
      <div style={{
        display: 'grid', gap: 7,
        gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))',
      }}>
        {parks.map((g, i) => {
          const eCol = g.edge >= 8 ? C.orange : g.edge >= 3 ? '#FCD34D' : g.edge <= -3 ? '#38bdf8' : C.text3
          const isActive = activeVenue && g.venue === activeVenue
          const out = /out/i.test(g.windLabel)
          const wIn = /in\b/i.test(g.windLabel)
          return (
            <div
              key={g.pk}
              onClick={() => onVenueClick?.(isActive ? '' : g.venue)}
              title={`Park ${g.parkHR > 0 ? `×${g.parkHR.toFixed(2)}` : '—'} + ${g.wxFromBot ? "the bot's weather HR effect" : 'wind/temp heuristic (bot weather effect not published for this game)'} = ${g.edge > 0 ? '+' : ''}${g.edge.toFixed(0)}% vs neutral. Ranks this board, scores nothing.`}
              style={{
                cursor: 'pointer',
                background: isActive
                  ? `linear-gradient(155deg, ${eCol}22, ${eCol}08)`
                  : `linear-gradient(155deg, ${eCol}10, transparent)`,
                border: `1px solid ${isActive ? eCol : `${eCol}40`}`,
                borderRadius: 10, padding: '8px 11px',
              }}
            >
              <div style={{ display: 'flex', gap: 6, alignItems: 'baseline', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 10.5, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
                  <span style={{ color: C.text3, fontFamily: NUM_FONT }}>#{i + 1} </span>{g.venue || g.matchup}
                </span>
                <span style={{ fontSize: 13, fontWeight: 900, fontFamily: NUM_FONT, color: eCol, flexShrink: 0 }}>
                  {g.edge > 0 ? '+' : ''}{g.edge.toFixed(0)}%
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', marginTop: 3, fontFamily: NUM_FONT, fontSize: 9.5, color: C.text3 }}>
                <span>{g.matchup}</span>
                {g.temp > 0 && <span style={{ color: g.temp >= 82 ? C.orange : g.temp <= 58 ? '#38bdf8' : C.text3 }}>{Math.round(g.temp)}°</span>}
                {g.wind > 0 && <span style={{ color: out ? C.orange : wIn ? '#38bdf8' : C.text3 }}>{out ? '↗' : wIn ? '↙' : '→'}{Math.round(g.wind)}</span>}
                {g.parkHR > 0 && <span>×{g.parkHR.toFixed(2)}</span>}
                {g.roof && <span>roof {g.roof}</span>}
              </div>
              {g.threats.length > 0 && (
                <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                  {g.threats.map((p) => (
                    <span
                      key={p?.player_id || nameOf(p)}
                      onClick={(e) => { e.stopPropagation(); onPlayerClick?.(p) }}
                      title={`Biggest distance threat in this building tonight — longest-HR score ${n(p?.longest_hr_score, 0).toFixed(0)}`}
                      style={{ fontSize: 9.5, fontWeight: 700, color: C.text2, cursor: 'pointer' }}
                    >
                      💪 {String(nameOf(p)).split(' ').slice(-1)[0]}
                      <b style={{ fontFamily: NUM_FONT, color: C.orange }}> {n(p?.longest_hr_score, 0).toFixed(0)}</b>
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
