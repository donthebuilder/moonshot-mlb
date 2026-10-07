// FIRST PITCH, batter vs one pitcher (2026-10-07). Pure: Statcast pitch rows in, a summary out.
// A "first pitch" is the 0-0 pitch of a plate appearance. Rows come from lib/savant.js
// savantPitchRows (the same export the head-to-head already downloads); nothing here is modelled.
// Returns null when he has not seen a first pitch from this arm: the card then shows nothing.
const SWING = new Set(['swinging_strike', 'swinging_strike_blocked', 'foul', 'foul_tip', 'foul_bunt', 'hit_into_play', 'missed_bunt', 'bunt_foul_tip'])
const WHIFF = new Set(['swinging_strike', 'swinging_strike_blocked', 'missed_bunt'])
const HIT = new Set(['single', 'double', 'triple', 'home_run'])

export function isFirstPitch(r) {
  return Number(r?.balls) === 0 && Number(r?.strikes) === 0 && String(r?.balls ?? '') !== '' && String(r?.strikes ?? '') !== ''
}

export function firstPitchSummary(rows) {
  const fp = (rows || []).filter(isFirstPitch)
  if (!fp.length) return null
  const swings = fp.filter((r) => SWING.has(r.description))
  const whiffs = fp.filter((r) => WHIFF.has(r.description))
  const inPlay = fp.filter((r) => r.description === 'hit_into_play')
  const hits = inPlay.filter((r) => HIT.has(r.events))
  const hr = inPlay.filter((r) => r.events === 'home_run')
  const called = fp.filter((r) => r.description === 'called_strike')
  const pct = (a, b) => (b ? (100 * a) / b : null)
  return {
    pitches: fp.length,
    swingPct: pct(swings.length, fp.length),
    whiffPct: pct(whiffs.length, swings.length),
    takeStrikePct: pct(called.length, fp.length),
    inPlay: inPlay.length,
    hits: hits.length,
    hr: hr.length,
    hitPerBip: pct(hits.length, inPlay.length),
  }
}

// Career first, then the seasons he has first pitches in, newest first (cap 3).
export function firstPitchRows(rows, maxSeasons = 3) {
  const out = []
  const career = firstPitchSummary(rows)
  if (!career) return out
  out.push({ key: 'career', label: 'Career', ...career })
  const years = [...new Set((rows || []).filter(isFirstPitch).map((r) => String(r.date || '').slice(0, 4)).filter(Boolean))].sort().reverse()
  if (years.length > 1) {
    years.slice(0, maxSeasons).forEach((y) => {
      const s = firstPitchSummary((rows || []).filter((r) => String(r.date || '').startsWith(y)))
      if (s) out.push({ key: y, label: y, ...s })
    })
  }
  return out
}
