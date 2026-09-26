// SPORTSGAMEODDS — the one place the site talks to the odds provider
// (.claude-notes/BATCH-ODDS-PLAN.md, step 1, 2026-09-26). SERVER ONLY: the
// key is SGO_API_KEY, read here and sent only as the x-api-key header. It
// never reaches a page, a log line or a response body.
//
// COST. The free plan meters OBJECTS, and one object is one game returned,
// however many markets and books come with it: 2,500 a month, 10 requests a
// minute. Measured 09-26: /account/usage costs nothing (the month counter did
// not move across two reads), so the budget is read fresh on every tick that
// might spend, rather than once a day as the plan guessed.
//
// FREE-PLAN GAP, measured 09-26: every events response carries a notice like
// "Response is missing 4367 bookmaker odds" -- some books are withheld on this
// tier. What comes back is stored as it came; a book that isn't there is not
// a row, never an estimate.
const BASE = 'https://api.sportsgameodds.com/v2'

export const hasKey = () => Boolean(process.env.SGO_API_KEY)

async function get(path) {
  const r = await fetch(`${BASE}${path}`, { headers: { 'x-api-key': process.env.SGO_API_KEY || '' }, cache: 'no-store' })
  let j = null
  try { j = await r.json() } catch { /* fall through */ }
  if (!r.ok || !j?.success) throw new Error(`sgo ${path.split('?')[0]} ${r.status}${j?.error ? `: ${j.error}` : ''}`)
  return j
}

/** { used, max } objects this month. Free to read. */
export async function monthUsage() {
  const j = await get('/account/usage')
  const m = j.data?.rateLimits?.['per-month'] || {}
  return { used: Number(m['current-entities']) || 0, max: Number(m['max-entities']) || 0 }
}

/** Every event page for a query, following nextCursor. Each event costs one object. */
async function pages(query, cap) {
  const out = []
  let cursor = null
  do {
    const j = await get(`/events?${query}&limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`)
    out.push(...(j.data || []))
    cursor = j.nextCursor || null
  } while (cursor && out.length < cap)
  return out
}

/** The day's games for one league, [fromIso, toIso). */
export const eventsBetween = (leagueID, fromIso, toIso, cap = 60) =>
  pages(`leagueID=${leagueID}&startsAfter=${encodeURIComponent(fromIso)}&startsBefore=${encodeURIComponent(toIso)}`, cap)

/** Named games only -- the cheapest call (every other filter is ignored when eventIDs is set). */
export const eventsById = (ids) => (ids.length ? pages(`eventIDs=${ids.map(encodeURIComponent).join(',')}`, ids.length) : Promise.resolve([]))
