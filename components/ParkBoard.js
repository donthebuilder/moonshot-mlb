'use client'
import { useEffect, useMemo, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { n, clean, nameOf, teamOf, oppOf } from '../lib/player'
import { teamAbbrs } from '../lib/gamelogs'
import { fetchPenFatigue, penTier } from '../lib/bullpen'
import { fetchRestTravel } from '../lib/restTravel'
import { dataUrl } from '../lib/dataSource'

// WEATHER-PAGE MODE (2026-08-07, Donovan): one schedule call turns the park
// board into tonight's weather desk — live game status (delayed / postponed /
// suspended), first pitch, per-team lineup confirmation and a delay-risk
// read off the rain chance. Context lane only; nothing here feeds a score.
function useGameStatus(slateDate) {
  const [st, setSt] = useState({})
  useEffect(() => {
    let alive = true
    const load = () => {
      const day = slateDate || new Date().toLocaleDateString('en-CA')
      fetch(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${day}&fields=dates,games,gamePk,status,detailedState,abstractGameState`)
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => {
          if (!alive || !j) return
          const m = {}
          ;(j?.dates?.[0]?.games || []).forEach((g) => {
            m[g.gamePk] = { detail: g?.status?.detailedState || '', state: g?.status?.abstractGameState || '' }
          })
          setSt(m)
        })
        .catch(() => {})
    }
    load()
    const id = setInterval(load, 5 * 60_000) // weather desk cadence, not live-wire cadence
    return () => { alive = false; clearInterval(id) }
  }, [slateDate])
  return st
}

const timeText = (t) => {
  if (!t) return ''
  const d = new Date(t)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

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

export default function ParkBoard({ players = [], slateDate = '', activeVenue, onVenueClick, onPlayerClick }) {
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
          rain: n(p?.weather_precip_chance, n(p?.precip_chance, 0)) * 100,
          time: p?.game_time || null,
          matchup: `${teamOf(p) || '?'} vs ${oppOf(p) || '?'}`,
          bats: [],
          confByTeam: {},
        })
      }
      const g0 = map.get(pk)
      g0.bats.push(p)
      const tm = teamOf(p)
      if (tm && !(tm in g0.confByTeam)) g0.confByTeam[tm] = p?.lineup_confirmed !== false
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

  const statuses = useGameStatus(slateDate)
  // pen fatigue means 'threw YESTERDAY' — that claim is only true for a
  // today slate; on tomorrow's board the relevant night hasn't happened.
  const penApplies = !slateDate || slateDate <= new Date().toLocaleDateString('en-CA')

  // Bullpen fatigue, joined by abbreviation (slate rows carry abbrs, the
  // boxscores carry ids — teamAbbrs() is the bridge, already cached).
  const [penByAbbr, setPenByAbbr] = useState(null)
  useEffect(() => {
    Promise.all([fetchPenFatigue(), teamAbbrs()]).then(([pen, abbrs]) => {
      const m = {}
      Object.entries(pen || {}).forEach(([tid, t]) => {
        const ab = abbrs?.[tid]
        if (ab) m[ab] = t
      })
      setPenByAbbr(m)
    }).catch(() => {})
  }, [])

  // 😴 rest & travel (audit #9): one schedule range call, flags per team.
  // Unlike pen fatigue this DOES apply to a tomorrow slate — the range just
  // shifts with the slate date. Context chips only; nothing is scored.
  const [restByAbbr, setRestByAbbr] = useState(null)
  useEffect(() => {
    const date = slateDate || new Date().toLocaleDateString('en-CA')
    Promise.all([fetchRestTravel(date), teamAbbrs()]).then(([rt, abbrs]) => {
      const m = {}
      rt.forEach((flags, tid) => {
        const ab = abbrs?.[tid]
        if (ab) m[ab] = flags
      })
      setRestByAbbr(m)
    }).catch(() => {})
  }, [slateDate])

  // 🏟 HOUSE HISTORY (2026-08-08, Donovan: "for the players in that park
  // too"). The bot's nightly context pack carries every slate player's HR
  // record at tonight's building (venue-ID matched). One fetch; each card
  // then names its bats with real history here. Date-gated: the pack is
  // today's slate, so tomorrow mode shows nothing rather than wrong parks.
  // Quiet until the first pack publishes — no file, no line, no fakes.
  const [housePack, setHousePack] = useState(null)
  useEffect(() => {
    fetch(dataUrl('current/context_pack_latest.json'))
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (j?.players) setHousePack(j) })
      .catch(() => {})
  }, [])
  // strict date gate: the pack must be FOR the slate being viewed — a stale
  // pack quietly showing yesterday's parks would be worse than nothing
  const packApplies = housePack
    && housePack.slate_date === (slateDate || new Date().toLocaleDateString('en-CA'))

  if (!parks.length) return null

  // Visual bands: the edge number decides the row's whole personality —
  // launch pads burn, ice boxes freeze, the middle stays quiet.
  const bandOf = (edge) => edge >= 10 ? { icon: '🌋', col: '#f97316', word: 'LAUNCH PAD' }
    : edge >= 5 ? { icon: '🔥', col: '#fb923c', word: 'CARRIES' }
    : edge >= 0 ? { icon: '🌤', col: '#FCD34D', word: 'FAIR' }
    : edge >= -8 ? { icon: '🌬', col: '#7dd3fc', word: 'HEAVY AIR' }
    : { icon: '🧊', col: '#38bdf8', word: 'ICE BOX' }

  // THE LADDER (2026-08-08 redesign — "a whole new look, not the same cards
  // polished"). The wall of tiles becomes one ranked ladder: every park a
  // full-width rung on a SHARED edge axis, a diverging bar from the neutral
  // line — ember right for carry, ice left for heavy air — so the whole
  // slate's spread is readable in one glance instead of card-by-card.
  // Every data element survives: edge %, band, conditions, live weather
  // desk, lineup checks, pen tags, rest/travel chips, threats and house
  // history — they just live in lanes on the rung now.
  const maxAbs = Math.max(4, ...parks.map((g) => Math.abs(g.edge)))

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 7, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12.5, fontWeight: 900 }}>🏟 The park ladder</span>
        <span style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT }}>
          every yard on one axis — bar right of the line helps hitters, left fights them · live status, rain risk, lineup checks, pens, rest · tap a rung to filter the board
        </span>
      </div>

      <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
        {parks.map((g, i2) => {
          const band = bandOf(g.edge)
          const isActive = activeVenue && g.venue === activeVenue
          const isTop = i2 < 3 && g.edge > 0
          const out = /out/i.test(g.windLabel)
          const wIn = /in\b/i.test(g.windLabel)
          const roofNote = g.roof && !/open/i.test(g.roof) ? g.roof : ''
          const frac = Math.min(1, Math.abs(g.edge) / maxAbs)
          return (
            <div
              key={g.pk}
              onClick={() => onVenueClick?.(isActive ? '' : g.venue)}
              title={`Park ${g.parkHR > 0 ? `×${g.parkHR.toFixed(2)}` : '—'} + ${g.wxFromBot ? "the bot's weather HR effect" : 'wind/temp heuristic (bot weather effect not published for this game)'} = ${g.edge > 0 ? '+' : ''}${g.edge.toFixed(0)}% vs neutral. Ranks this ladder, scores nothing.`}
              style={{
                cursor: 'pointer', minWidth: 0, position: 'relative',
                display: 'flex', gap: 12, alignItems: 'flex-start',
                padding: '9px 14px 8px',
                borderBottom: i2 < parks.length - 1 ? `1px solid ${C.border}` : 'none',
                borderLeft: `3px solid ${isActive ? band.col : isTop ? `${band.col}88` : 'transparent'}`,
                background: isActive
                  ? `linear-gradient(90deg, ${band.col}1c, transparent 60%)`
                  : isTop ? `linear-gradient(90deg, ${band.col}0d, transparent 55%)` : 'transparent',
              }}
            >
              {/* rank — the ladder is the order */}
              <span style={{
                fontFamily: NUM_FONT, fontSize: 13, fontWeight: 900, width: 22, flexShrink: 0,
                color: isTop ? band.col : C.text3, textAlign: 'right', paddingTop: 2,
              }}>{i2 + 1}</span>

              {/* the shared axis — edge number over a diverging bar */}
              <div style={{ width: 132, flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                  <span style={{ fontSize: 12 }}>{band.icon}</span>
                  <span style={{ fontSize: 16, fontWeight: 900, fontFamily: NUM_FONT, color: band.col, letterSpacing: '-0.02em' }}>
                    {g.edge > 0 ? '+' : ''}{g.edge.toFixed(0)}%
                  </span>
                  <span style={{ fontSize: 7, fontWeight: 900, color: band.col, letterSpacing: '.09em', fontFamily: NUM_FONT, opacity: 0.85 }}>
                    {band.word}
                  </span>
                </div>
                <div style={{ position: 'relative', height: 6, marginTop: 4, background: 'rgba(255,255,255,.05)', borderRadius: 3, overflow: 'hidden' }}>
                  {/* neutral line */}
                  <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: C.border2 }} />
                  <div style={{
                    position: 'absolute', top: 0, bottom: 0,
                    left: g.edge >= 0 ? '50%' : `${50 - frac * 50}%`,
                    width: `${frac * 50}%`,
                    background: `linear-gradient(90deg, ${band.col}66, ${band.col})`,
                    borderRadius: 3,
                  }} />
                </div>
              </div>

              {/* the rung's story — venue, conditions, weather desk, bats */}
              <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap', minWidth: 0 }}>
                <span style={{ fontSize: 11.5, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '46%' }}>
                  {g.venue || g.matchup}
                </span>
                <span style={{ fontFamily: NUM_FONT, fontSize: 9, fontWeight: 800, color: C.text2 }}>{g.matchup}</span>
                <span style={{ display: 'flex', gap: 7, alignItems: 'baseline', fontFamily: NUM_FONT, fontSize: 9, color: C.text3 }}>
                {g.temp > 0 && <span style={{ color: g.temp >= 82 ? '#fb923c' : g.temp <= 58 ? '#38bdf8' : C.text3 }}>{Math.round(g.temp)}°</span>}
                {g.wind > 0 && (
                  <span title={g.windLabel} style={{ color: out ? '#fb923c' : wIn ? '#38bdf8' : C.text3, fontWeight: 800 }}>
                    {out ? '↗' : wIn ? '↙' : '→'}{Math.round(g.wind)}
                  </span>
                )}
                {g.parkHR > 0 && <span title="Raw park HR factor before weather">×{g.parkHR.toFixed(2)}</span>}
                {roofNote && <span>🏠 {roofNote}</span>}
                </span>
              </div>

              {/* the weather-desk line: live status beats schedule beats nothing */}
              {(() => {
                const st = statuses[g.pk]
                const bad = st && /delay|postpon|suspend/i.test(st.detail)
                const live = st?.state === 'Live'
                const final = st?.state === 'Final'
                const teams = Object.keys(g.confByTeam)
                const rainy = g.rain >= 20 && !final && !/dome|closed/i.test(g.roof)
                return (
                  <div style={{ display: 'flex', gap: 7, alignItems: 'baseline', marginTop: 3, fontFamily: NUM_FONT, fontSize: 8.5, flexWrap: 'wrap' }}>
                    {bad ? (
                      <span style={{ color: '#f87171', fontWeight: 900 }}>⚠ {st.detail.toUpperCase()}</span>
                    ) : live ? (
                      <span style={{ color: '#4ade80', fontWeight: 800 }}>● LIVE</span>
                    ) : final ? (
                      <span style={{ color: C.text3, fontWeight: 700 }}>FINAL</span>
                    ) : (
                      g.time && <span style={{ color: C.text3 }}>⏰ {timeText(g.time)}</span>
                    )}
                    {rainy && (
                      <span title="Rain chance from the bot's weather pull — a delay-risk read, not a forecast of one" style={{ color: g.rain >= 50 ? '#f87171' : '#7dd3fc', fontWeight: 800 }}>
                        ☔ {Math.round(g.rain)}%{g.rain >= 50 ? ' delay risk' : ''}
                      </span>
                    )}
                    {teams.length === 2 && !final && (
                      <span title="Per-team lineup confirmation — ✓ posted, ◻ still projected" style={{ color: C.text3 }}>
                        {teams.map((tm, ti) => (
                          <span key={tm}>
                            {tm} <b style={{ color: g.confByTeam[tm] ? '#4ade80' : '#FCD34D' }}>{g.confByTeam[tm] ? '✓' : '◻'}</b>
                            {ti === 0 ? ' · ' : ''}
                          </span>
                        ))}
                      </span>
                    )}
                    {/* 🥵 gassed pens — yesterday's reliever workload, per side.
                        A tired pen is tonight's late-inning HR window. */}
                    {penApplies && penByAbbr && !final && teams.map((tm) => {
                      const tier = penTier(penByAbbr[tm])
                      if (!tier) return null
                      const t2 = penByAbbr[tm]
                      return (
                        <span
                          key={`pen-${tm}`}
                          title={`${tm} bullpen yesterday: ${t2.used} relievers, ${t2.pitches} pitches — ${t2.names.map((r2) => `${String(r2.name).split(' ').slice(-1)[0]} ${r2.pitches}p`).join(', ')}. Tired relief gives up homers; the late innings are the window.`}
                          style={{ color: tier.col, fontWeight: 900, cursor: 'help' }}
                        >{tier.icon} {tm} {tier.word}</span>
                      )
                    })}
                    {/* 😴 rest & travel — schedule facts, not vibes: day-after-
                        night, doubleheaders, overnight park changes, 3-in-3. */}
                    {restByAbbr && !final && teams.map((tm) => (
                      (restByAbbr[tm] || []).map((f) => (
                        <span key={`rt-${tm}-${f.label}`} title={`${tm}: ${f.title}`}
                          style={{ color: '#a1a1aa', fontWeight: 800, cursor: 'help' }}>
                          {f.icon} {tm} {f.label}
                        </span>
                      ))
                    ))}
                    {/* 🌇 twilight cooling — directional physics, no invented
                        forecast: external weather APIs failed verification, so
                        this says WHICH WAY the air moves, not a made-up number. */}
                    {(() => {
                      if (final || live || bad) return null
                      if (/dome|closed/i.test(g.roof)) return null
                      if (!(g.temp >= 75) || !g.time) return null
                      const h = new Date(g.time).getHours()
                      if (Number.isNaN(h) || h < 16) return null
                      return (
                        <span title="Warm evening start in an open-air park: the air cools and thickens as the game goes — carry favors the EARLY innings tonight. Directional read, not a forecast number." style={{ color: '#fbbf24', cursor: 'help' }}>
                          🌇 cools late
                        </span>
                      )
                    })()}
                  </div>
                )
              })()}

              {/* threats as clean pills — the 💪 read as clip-art (Donovan).
                  Top-3 parks get a matchup hook instead: THE bat vs THE arm,
                  which is the sentence you'd actually say out loud. */}
              {g.threats.length > 0 && (isTop ? (
                <div style={{ marginTop: 5, borderTop: `1px solid ${band.col}22`, paddingTop: 4 }}>
                  <span
                    onClick={(e) => { e.stopPropagation(); onPlayerClick?.(g.threats[0]) }}
                    style={{ fontSize: 10, fontWeight: 800, color: C.text, cursor: 'pointer' }}
                  >
                    {surname(nameOf(g.threats[0]))}
                    <b style={{ fontFamily: NUM_FONT, color: band.col }}> {n(g.threats[0]?.longest_hr_score, 0).toFixed(0)}</b>
                    <span style={{ color: C.text3, fontWeight: 600 }}> vs {surname(clean(g.threats[0]?.pitcher_name, 'TBD'))}</span>
                  </span>
                  {g.threats[1] && (
                    <span
                      onClick={(e) => { e.stopPropagation(); onPlayerClick?.(g.threats[1]) }}
                      style={{ fontSize: 9, color: C.text3, cursor: 'pointer', marginLeft: 8 }}
                    >
                      + {surname(nameOf(g.threats[1]))} <b style={{ fontFamily: NUM_FONT, color: band.col }}>{n(g.threats[1]?.longest_hr_score, 0).toFixed(0)}</b>
                    </span>
                  )}
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 5, marginTop: 5, flexWrap: 'wrap', borderTop: `1px solid ${band.col}22`, paddingTop: 4 }}>
                  {g.threats.map((p) => (
                    <span
                      key={p?.player_id || nameOf(p)}
                      onClick={(e) => { e.stopPropagation(); onPlayerClick?.(p) }}
                      title={`Biggest distance threat in this building tonight — longest-HR score ${n(p?.longest_hr_score, 0).toFixed(0)}`}
                      style={{
                        fontSize: 8.5, fontWeight: 700, color: C.text2, cursor: 'pointer', whiteSpace: 'nowrap',
                        border: `1px solid ${band.col}30`, borderRadius: 999, padding: '1px 7px',
                        background: `${band.col}0a`,
                      }}
                    >
                      {surname(nameOf(p))} <b style={{ fontFamily: NUM_FONT, color: band.col }}>{n(p?.longest_hr_score, 0).toFixed(0)}</b>
                    </span>
                  ))}
                </div>
              ))}

              {/* 🏟 house history — tonight's bats who have actually homered
                  in THIS building (bot context pack, venue-ID matched).
                  ▲ marks a hitter whose rate here beats his own overall
                  rate by 25%+ on 8+ games — the park likes him back. */}
              {packApplies && (() => {
                const vets = g.bats
                  .map((p) => ({ p, vh: housePack.players?.[String(p?.player_id)]?.venue_hr }))
                  .filter((x) => x.vh && x.vh.hr >= 2)
                  .sort((a, b) => b.vh.hr - a.vh.hr)
                  .slice(0, 3)
                if (!vets.length) return null
                return (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'baseline', marginTop: 4, flexWrap: 'wrap', fontFamily: NUM_FONT, fontSize: 8.5 }}>
                    <span style={{ color: C.text3, fontWeight: 800, letterSpacing: '.05em' }}>🏟</span>
                    {vets.map(({ p, vh }) => {
                      const up = vh.games >= 8 && vh.vs_self != null && vh.vs_self >= 1.25
                      return (
                        <span
                          key={p?.player_id}
                          onClick={(e) => { e.stopPropagation(); onPlayerClick?.(p) }}
                          title={`${nameOf(p)} in this building, ${vh.seasons}: ${vh.hr} HR in ${vh.games} games${vh.vs_self != null ? ` — ${(vh.vs_self).toFixed(2)}× his overall HR rate` : ''}${up ? '. The park plays UP for him.' : ''}`}
                          style={{ color: up ? band.col : C.text2, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
                        >
                          {surname(nameOf(p))} <b>{vh.hr}</b><span style={{ color: C.text3, fontWeight: 500 }}>/{vh.games}g</span>{up ? '▲' : ''}
                        </span>
                      )
                    })}
                  </div>
                )
              })()}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
