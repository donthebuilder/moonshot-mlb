// THE RECEIPT LINE (Donovan, 2026-10-20). MLB's write-up ended on "Locked before first pitch. Graded against exactly that."
// He asked for it on every sport ("dont all sports do that too"), then on every tweet ("makeusre all the tweet get that notice
// too expsically our write ups on players"). The lines live HERE, once; the write-ups (lib/writeups) and the X sender
// (lib/dash/xPost.js postToX) both read them.
//
// WHICH POSTS. The line says a call was locked and is graded, so it goes only on a post that names one of our calls:
//   the write-ups, the boards, the card posts, the slates, top totals, the receipts (they grade a call), the NFL
//   "why he's on the board", and a live alert for a CALLED player ("🤖 CALLED IT").
// NOT on a fact post, a list, a poll, the longshots ("prices, not picks"), a moment or a live alert for a man we did not call:
// nothing there is a locked call, and "graded against exactly that" would claim one. Pure.
import { kindInfo } from '../dash/xSchedule'
import { POLL_RESULT_KINDS } from '../dash/polls/kinds'

export const RECEIPT_LINE = Object.freeze({
  mlb: 'Locked before first pitch. Graded against exactly that.',
  nfl: 'Locked before kickoff. Graded against exactly that.',
  nhl: 'Locked before puck drop. Graded against exactly that.',
  nba: 'Locked before tip. Graded against exactly that.',
  all: 'Locked before each game. Graded against exactly that.',
})

// THE CARD's public posts never print "lock" in any form (lib/card/text.js PUBLIC_BANNED, lib/card/core.js: "X never sees ...
// 'lock'"), so the card kinds carry the same receipt as "Called before ...": the same promise, without the word.
export const CARD_RECEIPT_LINE = Object.freeze(Object.fromEntries(Object.entries(RECEIPT_LINE).map(([k, v]) => [k, v.replace(/^Locked before/, 'Called before')])))
const isCardKind = (kind) => /^card_/.test(String(kind || ''))

// the KIND_TAGS groups (lib/dash/xSchedule.js) whose posts name a locked call
const CALL_GROUPS = new Set(['board', 'card', 'slate', 'lampslate', 'writeup', 'receipt', 'totals', 'whyboard'])

/** The receipt line a post of `kind` carries, or null. `text` decides a live alert (only a CALLED one). */
export function receiptLineFor(kind, { sport = null, text = '' } = {}) {
  const info = kindInfo(kind)
  if (!info || !info.group) return null
  if (POLL_RESULT_KINDS.includes(String(kind))) return null   // a poll's reveal grades the network's guess, not our call
  const call = CALL_GROUPS.has(info.group) || (info.group === 'called' && /CALLED IT/.test(String(text)))
  if (!call) return null
  // the kind's own sport; a cross-sport kind ('all': the slate, the night receipt) keeps the cross-sport words whatever room it is routed to
  const sp = info.sport && info.sport !== 'all' ? info.sport : (info.sport === 'all' ? 'all' : sport)
  const lines = isCardKind(kind) ? CARD_RECEIPT_LINE : RECEIPT_LINE
  return lines[sp] || lines.all
}

/** True when the text already carries a receipt: the line itself, or its own "before first pitch / kickoff / puck drop / tip"
 *  (a CALLED live alert says "called it before first pitch: #3 on tonight's board"; the line would only repeat it). */
export const hasReceiptLine = (text) => /Graded against exactly that\.|\bbefore (?:first pitch|kickoff|puck drop|tip(?:-off)?)\b/i.test(String(text || ''))

/**
 * The post with its receipt line as the last block, when it has one, it isn't there yet and it fits `limit` (X's count:
 * code points). Never trims the post to make room: a post that is full goes without the line.
 */
export function withReceiptLine(text, kind, { sport = null, limit = Infinity } = {}) {
  const t = String(text || '')
  if (!t || hasReceiptLine(t)) return t
  const line = receiptLineFor(kind, { sport, text: t })
  if (!line) return t
  const out = `${t.replace(/\s+$/, '')}\n\n${line}`
  return Array.from(out).length <= limit ? out : t
}
