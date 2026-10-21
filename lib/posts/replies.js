// HITS AND MISSES, IN OUR VOICE (Donovan, 2026-10-20: "of course we need different replies for this, just like the called hits
// should have their own unique replies"; misses: "a clean reply, no morning receipt"). Pure. Fixed words only, never the AI.
//
//   HIT   the live receipt's first words, ALL CAPS + one emoji (playbook rule 5), one of a few per sport, picked by the event's own
//         key so the same event always reads the same and a night of them doesn't repeat one line. lib/dash/quoteFor.js receiptLineOf.
//   MISS  the night's misses go in ONE clean recap reply (lib/posts/receipt.js postMissRecap, "one recap is good"): who, what didn't
//         happen (eventWord), and that it counts. No joke, no excuse, no "unlucky", no number we don't have, no swearing.
//         missReplyText (one man's line) is kept for a single-miss use; the recap is what posts.
import { OVERCLAIM, SWEARS } from '../facts/check'

const pick = (list, key) => { let h = 7; for (const c of String(key ?? '')) h = (h * 31 + c.charCodeAt(0)) >>> 0; return list[h % list.length] }

export const HIT_WORDS = Object.freeze({
  mlb: ['WE HAD HIM \u{1F525}', 'GONE. WE HAD HIM \u{1F525}', 'THE NETWORK HAD HIM \u{1F525}'],
  nfl: ['WE HAD HIM \u{1F525}', 'SIX. WE HAD HIM \u{1F525}', 'THE NETWORK HAD HIM \u{1F525}'],
  nhl: ['WE HAD HIM \u{1F6A8}', 'LIGHT IT UP. WE HAD HIM \u{1F6A8}', 'THE NETWORK HAD HIM \u{1F6A8}'],
  nba: ['WE HAD HIM \u{1F525}', 'BUCKETS. WE HAD HIM \u{1F525}', 'THE NETWORK HAD HIM \u{1F525}'],
})
/** The hit line's first words for one event (`key`: the event's own id). */
export const hitWords = (sport, key) => pick(HIT_WORDS[sport] || HIT_WORDS.mlb, key)

// what didn't happen, in a fan's word, from the call's own market words (lib/routes.js POST_WORDS and the write-ups' markets);
// a points bar is said as it is ("25 points"); a market with no plain word gets no reply (we never guess what he was called for)
const EVENT = [
  [/home run|\bhr\b/i, 'home run'], [/touchdown|\btd\b/i, 'touchdown'], [/goal/i, 'goal'], [/triple-double/i, 'triple-double'],
  [/double-double/i, 'double-double'], [/^\s*\d+\+? points\s*$/i, 'SAME'], [/^\s*hit\s*$/i, 'hit'],
]
export function eventWord(market) {
  const m = String(market || '').trim()
  for (const [re, word] of EVENT) if (re.test(m)) return word === 'SAME' ? m.replace('+', '') : word
  return null
}

export const MISS_LINES = Object.freeze([
  (n, e) => `${n} didn't get there tonight. No ${e}.`,
  (n, e) => `Not tonight for ${n}. No ${e}. It counts.`,
  (n, e) => `No ${e} for ${n} tonight. Graded as a miss.`,
  (n, e) => `${n} came up empty tonight: no ${e}. It goes in the record.`,
  (n, e) => `Missed: ${n}, no ${e} tonight. On to the next one.`,
])
/**
 * The clean reply for a graded miss: `g` = { sport, id, name, market }, `day` = the card date. null when the market has no plain word
 * (we never guess what he was called for). Checked: no swearing, no overclaim.
 */
export function missReplyText(g, day) {
  const e = eventWord(g?.market)
  if (!g?.name || !e) return null
  const t = pick(MISS_LINES, `${g.sport}:${g.id}:${day}`)(String(g.name), e)
  return SWEARS.test(t) || OVERCLAIM.test(t) ? null : t
}
