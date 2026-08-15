'use client'
import { useMemo } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { nameOf, n, clean } from '../lib/player'

// 🌬 THE AIR — every park tonight, ranked, with the card's picks standing in it.
//
// 2026-08-15, Donovan sent a park-factors site (per-game HR/2B/1B/runs
// effects, wind arrows, hourly temps, roof states) and asked to "integrate
// something like this and innovate — maybe even incorporate it with the
// projected output."
//
// Every number their table shows was ALREADY on the slate row: the season
// park factor (park_hr_factor), tonight's modeled weather effect
// (weather_hr_effect_pct — the bot's own number, computed from wind/temp/roof
// and already folded into every score), the wind line, roof, humidity,
// precip. So this costs no fetch and no bot change. What it adds that a
// park-factors site can't:
//
//   1. THE PICKS STAND IN THE AIR. Each game row carries the bot's designated
//      picks for that game, and the headline says how many of tonight's
//      HR-side picks sit in the top-three environments. Their table tells you
//      Sutter Health is +30%; this one tells you whether anyone you CARE
//      about is playing there.
//   2. PARK AND WEATHER STAY SEPARATE before they combine. A season park
//      factor and tonight's wind are different kinds of fact — one is
//      structural, one expires at midnight — and summing them silently is
//      how a fly-ball park on a windy-in night gets misread as friendly.
//   3. IT ADMITS THE SCORES ALREADY KNOW. weather_hr_effect_pct is an input
//      to the bot's scoring, not new information beside it — so this board
//      is for seeing when a score is being CARRIED by its environment, not
//      for double-counting the air on top of the score.

const ROLES = ['TOP', 'HR', 'HIT', 'HRR', 'CONTACT']
const ROLE_COLOR = { TOP: '#FCD34D', HR: C.orange, HIT: '#a78bfa', HRR: '#22d3ee', CONTACT: '#4ade80' }
const rolesOf = (p) => String(p?.game_pick_role || '').split('/').map((x) => x.trim().toUpperCase()).filter((x) => ROLES.includes(x))

const pct = (mult) => Math.round((mult - 1) * 100)
const sign = (v) => `${v > 0 ? '+' : ''}${v}%`
const tone = (v) => (v >= 8 ? '#4ade80' : v >= 3 ? '#a3e635' : v <= -8 ? '#f87171' : v <= -3 ? C.orange : C.text2)

export default function AirBoard({ players = [], onPlayerClick }) {
  const games = useMemo(() => {
    const by = new Map()
    ;(players || []).forEach((p) => {
      const pk = Number(p?.game_pk)
      if (!pk) return
      let g = by.get(pk)
      if (!g) {
        g = {
          pk,
          away: p.away || p.team, home: p.home || p.opponent,
          venue: clean(p.venue_name, ''),
          park: n(p.park_hr_factor, NaN),
          hits: n(p.park_hits_factor, NaN),
          k: n(p.park_k_factor, NaN),
          wx: n(p.weather_hr_effect_pct, NaN),
          label: clean(p.weather_label, ''),
          roof: clean(p.roof, ''),
          temp: n(p.weather_temp_f, NaN),
          wind: n(p.weather_wind_mph, NaN),
          windDir: clean(p.weather_wind_direction_label, ''),
          rain: n(p.weather_precip_chance, 0),
          hasWx: Boolean(p.weather_has_data),
          picks: [],
        }
        by.set(pk, g)
      }
      rolesOf(p).forEach((role) => g.picks.push({ role, p }))
    })
    const out = [...by.values()].map((g) => {
      const parkPct = Number.isFinite(g.park) ? pct(g.park) : null
      const wxPct = Number.isFinite(g.wx) ? Math.round(g.wx) : null
      // Multiplicative, not additive — a 0.82 park doesn't become neutral
      // because the wind adds 18; it becomes a slightly less hostile 0.82.
      const combined = parkPct != null && wxPct != null
        ? Math.round((g.park * (1 + g.wx / 100) - 1) * 100)
        : parkPct ?? wxPct
      return { ...g, parkPct, wxPct, combined }
    })
    out.sort((a, b) => (b.combined ?? -99) - (a.combined ?? -99))
    return out
  }, [players])

  if (games.length < 2) return null

  // Which of the card's HR-side picks are standing in the best air?
  const ranked = games.filter((g) => g.combined != null)
  const top3 = new Set(ranked.slice(0, 3).map((g) => g.pk))
  const bot3 = new Set(ranked.slice(-3).map((g) => g.pk))
  const hrPicks = games.flatMap((g) => g.picks.filter((x) => x.role === 'HR' || x.role === 'TOP').map((x) => ({ ...x, pk: g.pk })))
  const inTop = hrPicks.filter((x) => top3.has(x.pk)).length
  const inBot = hrPicks.filter((x) => bot3.has(x.pk)).length

  return (
    <div>
      {hrPicks.length > 0 && ranked.length >= 4 && (
        <div style={{ fontSize: 10.5, color: C.text2, lineHeight: 1.6, marginBottom: 8, maxWidth: 760 }}>
          {inTop > 0
            ? <><b style={{ color: '#4ade80', fontFamily: NUM_FONT }}>{inTop}</b> of tonight&apos;s{' '}
              {hrPicks.length} HR-side picks are standing in the three best environments</>
            : <>None of tonight&apos;s {hrPicks.length} HR-side picks are in the three best environments</>}
          {inBot > 0 && <> — and <b style={{ color: '#f87171', fontFamily: NUM_FONT }}>{inBot}</b> in the three worst</>}.
          {' '}The scores already price the air in; this is for seeing when a score is being <i>carried</i> by it.
        </div>
      )}

      <div style={{ display: 'grid', gap: 4 }}>
        {games.map((g) => (
          <div key={g.pk} style={{
            display: 'flex', gap: 10, alignItems: 'center', minWidth: 0,
            background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 9,
            padding: '6px 11px',
          }}>
            <span style={{
              fontFamily: NUM_FONT, fontSize: 14, fontWeight: 900, minWidth: 44, textAlign: 'right',
              color: g.combined == null ? C.text3 : tone(g.combined),
            }} title="Park and tonight's weather combined (multiplicative), as an HR effect">
              {g.combined == null ? '—' : sign(g.combined)}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', gap: 7, alignItems: 'baseline', minWidth: 0 }}>
                <span style={{ fontFamily: NUM_FONT, fontSize: 11.5, fontWeight: 800, whiteSpace: 'nowrap' }}>
                  {g.away} @ {g.home}
                </span>
                <span style={{ fontSize: 9.5, color: C.text3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
                  {g.venue}
                </span>
              </div>
              <div style={{ fontFamily: NUM_FONT, fontSize: 9, color: C.text3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                title={g.label || undefined}>
                park <b style={{ color: g.parkPct == null ? C.text3 : tone(g.parkPct) }}>{g.parkPct == null ? '—' : sign(g.parkPct)}</b>
                {' · '}tonight <b style={{ color: g.wxPct == null ? C.text3 : tone(g.wxPct) }}>{g.wxPct == null ? '—' : sign(g.wxPct)}</b>
                {g.roof === 'closed' || /closed/i.test(g.roof) ? ' · roof closed' : (
                  <>
                    {Number.isFinite(g.temp) && ` · ${Math.round(g.temp)}°`}
                    {Number.isFinite(g.wind) && g.wind >= 1 && ` · ${Math.round(g.wind)}mph ${g.windDir || ''}`}
                    {g.rain >= 0.4 && ` · ☔ ${Math.round(g.rain * 100)}%`}
                  </>
                )}
              </div>
            </div>
            {/* the projected output, standing in this air */}
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: 360 }}>
              {g.picks.slice(0, 5).map(({ role, p }, i) => (
                <button key={`${role}-${i}`} onClick={() => onPlayerClick?.(p)} title={`${nameOf(p)} — the ${role} pick in this game`}
                  style={{
                    display: 'inline-flex', gap: 4, alignItems: 'baseline', cursor: 'pointer',
                    fontFamily: NUM_FONT, fontSize: 8.5, fontWeight: 800, whiteSpace: 'nowrap',
                    border: `1px solid ${(ROLE_COLOR[role] || C.text3)}44`, background: `${(ROLE_COLOR[role] || C.text3)}10`,
                    color: ROLE_COLOR[role] || C.text3, borderRadius: 6, padding: '1.5px 6px',
                  }}>
                  {role} <span style={{ color: C.text2, fontWeight: 700 }}>{String(nameOf(p)).split(' ').slice(-1)[0]}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 8.5, color: C.text3, marginTop: 6, lineHeight: 1.55 }}>
        Park is the season HR factor for the building; tonight is the bot&apos;s own modeled weather
        effect (wind, temp, roof), the same number already folded into every score — kept separate
        here because one is structural and the other expires at midnight, then combined
        multiplicatively. Chips are the bot&apos;s designated picks standing in that air; tap one for
        the card.
      </div>
    </div>
  )
}
