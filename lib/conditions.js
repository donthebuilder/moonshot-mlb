'use client'

// 🌤️ THE AIR, IN A SENTENCE (2026-08-15).
//
// Four surfaces built the same chip strip out of the same six fields —
// GameStrip, Games (twice), ParkBoard and the game deep-dive — each with its
// own arrow logic and its own idea of when a number is worth printing. The
// deep-dive's version was a row of nine floating chips above the two arm
// panels, which is the tile style Donovan has now ruled against four separate
// times ("i dont like the tile style id rather text just like the storylines
// section").
//
// So this is the same facts as one clause of English. NOTHING IS DROPPED to
// make it read: temp, wind speed, wind direction, park HR factor, humidity,
// rain chance and roof all appear when they carry a value, and the tooltip
// text that used to hang off each chip moves into `parts[].title` so a caller
// can keep it. Condense the form, keep every fact.
//
// The park factor is spoken rather than printed as "park ×1.06": a reader who
// knows the number gets it in the title, and a reader who doesn't gets the
// only thing it means.

const num = (v, d = 0) => {
  const x = Number(v)
  return Number.isFinite(x) ? x : d
}
const str = (v) => String(v ?? '').trim()

const wTemp = (p) => num(p?.weather_temp_f, num(p?.temp_f, 0))
const wWind = (p) => num(p?.weather_wind_mph, num(p?.wind_mph, 0))
const wLabel = (p) => str(p?.weather_wind_direction_label || p?.wind_direction_label)

export function windWay(label) {
  const l = str(label)
  if (/out/i.test(l)) return 'out'
  if (/\bin\b/i.test(l)) return 'in'
  return l ? 'across' : ''
}

/**
 * The conditions for one game as an ordered list of spoken parts.
 * Each part is { text, tone, title }; tone is 'hot' | 'cold' | 'plain'.
 * Callers join them — see `airSentence` for the plain-string form.
 */
export function airParts(any) {
  if (!any) return []
  const out = []
  const temp = wTemp(any)
  const wind = wWind(any)
  const label = wLabel(any)
  const way = windWay(label)
  const parkHr = num(any?.park_hr_factor, num(any?.park_dist_factor, 0))
  const humid = num(any?.weather_humidity, num(any?.humidity_pct, 0))
  const rain = num(any?.weather_precip_chance, num(any?.precip_chance, 0)) * 100
  const roof = str(any?.roof)

  if (temp > 0) {
    out.push({
      key: 'temp',
      text: `${Math.round(temp)}°`,
      tone: temp >= 82 ? 'hot' : temp <= 58 ? 'cold' : 'plain',
      title: 'Game-time temperature. Warm air is less dense, so the ball carries.',
    })
  }
  if (wind > 0) {
    // "blowing out at 11" is the read; the raw compass label stays in the
    // title because it is the only place the direction is exact.
    const phrase = way === 'out' ? `wind blowing out at ${Math.round(wind)} mph`
      : way === 'in' ? `wind in at ${Math.round(wind)} mph`
      : way === 'across' ? `wind across at ${Math.round(wind)} mph`
      : `${Math.round(wind)} mph wind`
    out.push({
      key: 'wind',
      text: phrase,
      tone: way === 'out' ? 'hot' : way === 'in' ? 'cold' : 'plain',
      title: label ? `Wind: ${label}` : 'Wind speed; direction not reported',
    })
  }
  if (parkHr > 0) {
    const pct = Math.round((parkHr - 1) * 100)
    out.push({
      key: 'park',
      text: parkHr >= 1.03 ? `a park that adds ${pct}% to home runs`
        : parkHr <= 0.97 ? `a park that takes ${Math.abs(pct)}% off home runs`
          : 'a neutral park',
      tone: parkHr >= 1.03 ? 'hot' : parkHr <= 0.97 ? 'cold' : 'plain',
      title: `Park HR factor ×${parkHr.toFixed(2)} — above 1.00 helps hitters`,
    })
  }
  if (humid > 0) {
    out.push({
      key: 'humid',
      text: humid >= 65 ? `thick ${Math.round(humid)}% humidity` : `${Math.round(humid)}% humidity`,
      tone: 'plain',
      title: 'Humid air is thinner than dry air — the ball carries a touch further',
    })
  }
  if (rain > 5) {
    out.push({
      key: 'rain',
      text: `${Math.round(rain)}% chance of rain`,
      tone: 'cold',
      title: 'Precipitation chance at game time',
    })
  }
  if (roof) {
    out.push({
      key: 'roof',
      text: `roof ${roof.toLowerCase()}`,
      tone: 'plain',
      title: 'Roof state — a closed roof takes the weather out of the game',
    })
  }
  return out
}

/** The same thing as one plain string, for titles and share cards. */
export function airSentence(any, venue = '') {
  const parts = airParts(any).map((p) => p.text)
  if (!parts.length) return venue ? String(venue) : ''
  const head = venue ? `${venue}: ` : ''
  if (parts.length === 1) return `${head}${parts[0]}.`
  return `${head}${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}.`
}

/**
 * One word for how the air is treating hitters, from the fields that actually
 * move the ball (temp, wind direction, park). Returns '' when nothing is
 * strong enough to claim — silence beats a manufactured verdict.
 */
export function airVerdict(any) {
  if (!any) return ''
  let s = 0
  const temp = wTemp(any)
  const wind = wWind(any)
  const way = windWay(wLabel(any))
  const parkHr = num(any?.park_hr_factor, num(any?.park_dist_factor, 0))
  if (temp >= 85) s += 1
  if (temp > 0 && temp <= 55) s -= 1
  if (way === 'out' && wind >= 8) s += 1
  if (way === 'in' && wind >= 8) s -= 1
  if (parkHr >= 1.05) s += 1
  if (parkHr > 0 && parkHr <= 0.95) s -= 1
  if (s >= 2) return 'carrying'
  if (s <= -2) return 'dead'
  return ''
}
