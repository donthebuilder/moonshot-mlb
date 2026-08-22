'use client'
import { seqChip, DOMAIN } from './scales'

// ══ THE HRW BAND — one ladder ═══════════════════════════════════════════════
//
// Donovan on the Boards/Charts emojis: "emojis around the HR stats look
// unprofessional" → then, the same day, resolved: "COMMIT. Keep them, do them
// properly."
//
// Committing means they stop being loose glyphs and become part of the colour
// system, held to the same rules as a scale. The audit found the opposite of
// that:
//
//   * TWO LADDERS FOR ONE THING. tabs/Bot.js thresholded hrw_score
//     numerically at 80 / 70 / 55 / 45. components/PlayerCard.js keyed on the
//     hrw_zone STRING (volatile_hot / strong_capped / sweet_spot / watch /
//     cold). Nothing guaranteed the two agreed, and nothing noticed when they
//     did not.
//   * THE GLYPH AS SOLE ENCODING. On PlayerCard the emoji was the only thing
//     the band produced — hrw_score is never printed on the card and the band
//     has no colour. Five states, carried entirely by a pictograph.
//   * A GLYPH USED AS A DATABASE KEY. tabs/HitsHRR.js:242 decides section
//     membership with top_board_tags.some(t => t.includes('🧩')). That is a
//     rendering detail load-bearing in a data path; strip the emoji upstream
//     and the section silently empties.
//
// So: one ladder, one definition, imported everywhere. The glyph ALWAYS sits
// beside the printed score. And the glyph's band maps onto a stop of the
// active sequential ramp, so the emoji and the colour are the same opinion
// instead of two independent ones.
//
// The numeric cuts are Bot.js's, kept verbatim, because they were the ones
// actually derived against scores rather than against a string. The zone
// strings map onto them so a row carrying only hrw_zone still lands right.

export const HRW_BANDS = [
  { key: 'volatile_hot',  glyph: '🌋', label: 'Erupting',  min: 80, at: 90 },
  { key: 'strong_capped', glyph: '🚀', label: 'Launching', min: 70, at: 75 },
  { key: 'sweet_spot',    glyph: '⚡', label: 'Live',      min: 55, at: 62 },
  { key: 'watch',         glyph: '🌤️', label: 'Warming',   min: 45, at: 50 },
  { key: 'cold',          glyph: '🧊', label: 'Cold',      min: -Infinity, at: 22 },
]

const BY_ZONE = Object.fromEntries(HRW_BANDS.map((b) => [b.key, b]))

/**
 * hrwBand(player) -> band | null
 *
 * Score first, zone as the fallback. `at` is the representative score for the
 * band, used only to pick a ramp stop — a band's colour should not jump around
 * inside itself, which is what colouring on the raw score would do.
 */
export function hrwBand(p) {
  const s = Number(p?.hrw_score)
  if (Number.isFinite(s) && s > 0) return HRW_BANDS.find((b) => s >= b.min) || HRW_BANDS[HRW_BANDS.length - 1]
  const z = String(p?.hrw_zone || '').trim()
  return BY_ZONE[z] || null
}

/** The band's colour on the ACTIVE ramp, so emoji and heat cannot disagree. */
export function hrwColor(band) {
  if (!band) return null
  return seqChip(band.at, DOMAIN.score)
}

/**
 * The whole thing a caller needs: glyph, word, colour, and the score to print.
 * Returns null when there is no HRW read at all — an absent band renders as
 * nothing rather than as 🧊, because "cold" and "not measured" are different
 * claims and only one of them is about the hitter.
 */
export function hrwRead(p) {
  const band = hrwBand(p)
  if (!band) return null
  const s = Number(p?.hrw_score)
  return {
    ...band,
    color: hrwColor(band),
    score: Number.isFinite(s) && s > 0 ? s : null,
    title: `HRW ${band.label}${Number.isFinite(s) && s > 0 ? ` · score ${s.toFixed(1)} of 100` : ''}`,
  }
}
