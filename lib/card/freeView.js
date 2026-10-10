// THE CARD, FREE VIEW (Donovan, 2026-10-10: "the free site, and people who log in, should not show the plays until we get to that point").
// What the site's /api/card shows anyone who is not an admin: what the free posts already name (the LEAD straight, the Long Shot of the day,
// and the admin's own pair once its lock has passed) plus every row that has been graded. The other straights and the bot's Two-Man stay
// out of the site until they are graded; members get them in #members. Pure: rows in, rows out; nothing is re-ranked.
import { leadStraight } from './core'

export function freeRows(rows, { lead = leadStraight(rows) } = {}) {
  return (rows || []).filter((r) => r.result != null || r.lane === 'donovan' || r.product === 'long_shot' || r === lead)
}
