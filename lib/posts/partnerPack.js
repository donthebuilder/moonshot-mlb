// THE PARTNER FEED: DASH's free posts in OTHER Discord servers (2026-10-23, Donovan: "build out the free version so I can attach them to the other
// Discords that I'm in ... 1 post 4 picks ... 4 straights then them played as [a parlay] ... a clear post of top 5 names on each sports then receipts at
// end of night and post a link to the site").
//
// Where: DISCORD_PARTNER_WEBHOOKS, one webhook per server (that server's admin makes it in a channel of theirs and hands Donovan the URL). Nothing
// else is sent there; routing.js room 'partner'. Unset = this module reads nothing and posts nothing.
//
// What, once a day, once every Card has locked (goTime):
//   partner_picks  each product's lead pick from today's Cards, as straights, and the same picks as one parlay (the stored prices multiplied)
//   partner_top5   tonight's top 5 names per product (the same CALLED names THE SLATE reads, with the same naming checks), names only
// PARTNER_BOX_ON (2026-10-31, Donovan: "definitely needs the box"): the two posts become ONE evening box (kind partner_box), claimed once a day.
// After the night: THE RECEIPT (lib/posts/receipt.js, routed to 'partner' too). Every post carries the site link.
// Plain words (lib/card/plain.js). No model chance printed. Never X. Claimed once a day (homer_feed_posts kinds partner_picks / partner_top5).
import { buildCard, dayWords, siteUrl } from '../dash/discordCard.js'
import { CARD_SPORTS, leadStraight, rowPrice, legPriceOf, fmtAmerican } from '../card/core.js'
import { ICON, PRODUCT, betWords, priceWords, whyPlain, who } from '../card/plain.js'
import { SPORT_ORDER } from '../card/briefing.js'

export const PICKS_KIND = 'partner_picks'
export const TOP5_KIND = 'partner_top5'
export const BOX_KIND = 'partner_box'
export const BOX_MIGRATION = 'supabase/migrations/202610311500_partner_box_kind.sql'
const truthy = (v) => /^(on|1|true|yes)$/i.test(String(v == null ? '' : v).trim())
/** PARTNER_BOX_ON=on: picks + top 5 go out as ONE post (partner_box) instead of two. Off = the two posts exactly as before. */
export const partnerBoxOn = () => truthy(process.env.PARTNER_BOX_ON)
export const SOON_MS = 15 * 60e3      // a lead pick whose game is this close goes out with what is locked, rather than be lost
export const MIGRATION = 'supabase/migrations/202610231800_partner_kinds.sql'
const MARKET = { mlb: 'home runs', nfl: 'touchdowns', nhl: 'goals', nba: 'points' }
const SITE_LINE = () => ({ text: 'Every pick, graded in public · DASH Network', url: siteUrl('/') })

const together = (n) => (n === 2 ? 'Both as one parlay' : `All ${n} as one parlay`)
const byOrder = (a, b) => SPORT_ORDER.indexOf(a.sport) - SPORT_ORDER.indexOf(b.sport)

/** The lead pick of each product's Card locked by `now`, whose game has not started. [{ sport, leg }] */
export function leadPicks(rows, now = Date.now()) {
  const out = []
  for (const sport of CARD_SPORTS) {
    const mine = (rows || []).filter((r) => r.sport === sport && r.lane === 'bot' && Date.parse(r.locks_at) <= now)
    const lead = leadStraight(mine)
    const leg = lead?.legs?.[0]
    if (leg && Date.parse(leg.start_at) > now) out.push({ sport, leg })
  }
  return out.sort(byOrder)
}

/** The parlay of the picks: the stored prices multiplied; null unless every pick has a price. */
export function parlayPrice(picks) {
  if ((picks || []).length < 2) return null
  return rowPrice({ product: 'parlay', legs: picks.map((p) => p.leg) }, picks.map((p) => legPriceOf(p.leg)))
}

/** The picks as sections: the straights, then the parlay (two or more). No link: the caller puts the one site link on its last section. */
export function picksSections(picks) {
  const straights = picks.map((p) => { const price = priceWords(p.leg); const why = whyPlain(p.leg.why); return `${ICON[p.sport]} **${who(p.leg)}** ${betWords(p.sport, p.leg)}${price ? ` · ${price}` : ''}${why ? `\n${why}` : ''}` })
  const parlay = parlayPrice(picks)
  const sections = [{ name: `${picks.length === 1 ? 'The pick' : `${picks.length} straights`}`, lines: [straights.join('\n')] }]
  if (picks.length > 1) sections.push({ name: together(picks.length), lines: [`${picks.map((p) => p.leg.name).join(' + ')}\n${parlay ? `About ${fmtAmerican(parlay.median)}. ` : ''}Every leg must hit.`] })
  return sections
}
export function picksEmbed({ day, picks, at = null }) {
  if (!picks?.length) return null
  const sections = picksSections(picks)
  sections[sections.length - 1].link = SITE_LINE()
  return buildCard({ sport: null, title: `🎯 Tonight's picks · ${dayWords(day)}`, description: 'One lead pick per product, picked before the game.', sections, at: at || Date.now(), maxSections: 3 })
}
export function picksText({ day, picks }) {
  if (!picks?.length) return ''
  const parlay = parlayPrice(picks)
  return [`🎯 Tonight's picks · ${dayWords(day)}`, '', ...picks.map((p) => { const price = priceWords(p.leg); return `${ICON[p.sport]} ${who(p.leg)} ${betWords(p.sport, p.leg)}${price ? ` · ${price}` : ''}` }),
    ...(picks.length > 1 ? ['', `${together(picks.length)}${parlay ? `: about ${fmtAmerican(parlay.median)}` : ''}. Every leg must hit.`] : []), '', siteUrl('/')].join('\n')
}

/** Tonight's top 5 per product from THE SLATE's sports (lib/posts/slateLoad.js): ranked CALLED names with no naming problem, game not started. */
export function topFive(sports, now = Date.now()) {
  const out = []
  for (const s of sports || []) {
    if (!s?.hasGames || !MARKET[s.sport]) continue
    const names = (s.cands || []).filter((c) => !c.problem && c.name && !(c.startMs <= now)).sort((a, b) => a.rank - b.rank).slice(0, 5)
    if (names.length) out.push({ sport: s.sport, names })
  }
  return out.sort(byOrder)
}
/** The top 5 lists as sections, one a product. No link (see picksSections). */
export const top5Sections = (lists) => lists.map((l) => ({ name: `${ICON[l.sport]} ${PRODUCT[l.sport]} · ${MARKET[l.sport]}`, lines: [l.names.map((c, i) => `${i + 1}. ${c.name}${c.team ? ` (${c.team})` : ''}`).join('\n')] }))
export function top5Embed({ day, lists, at = null }) {
  if (!lists?.length) return null
  const sections = top5Sections(lists)
  sections[sections.length - 1].link = SITE_LINE()
  return buildCard({ sport: null, title: `📋 Tonight's top 5 · ${dayWords(day)}`, description: 'The top of each board tonight, set before the games.', sections, at: at || Date.now(), maxSections: 5 })
}
export function top5Text({ day, lists }) {
  if (!lists?.length) return ''
  return [`📋 Tonight's top 5 · ${dayWords(day)}`, '', ...lists.flatMap((l) => [`${ICON[l.sport]} ${PRODUCT[l.sport]} · ${MARKET[l.sport]}`, ...l.names.map((c, i) => `${i + 1}. ${c.name}${c.team ? ` (${c.team})` : ''}`), '']), siteUrl('/')].join('\n').trim()
}

/** THE EVENING BOX (PARTNER_BOX_ON): the picks (straights + parlay) and the top 5 per product in ONE embed, one site link on the last section. Either part may be missing. */
export function boxEmbed({ day, picks, lists, at = null }) {
  const sections = [...(picks?.length ? picksSections(picks) : []), ...(lists?.length ? top5Sections(lists) : [])]
  if (!sections.length) return null
  sections[sections.length - 1].link = SITE_LINE()
  return buildCard({ sport: null, title: `🎯 Tonight · ${dayWords(day)}`, description: 'The lead picks and the top 5 of each board, set before the games.', sections, at: at || Date.now(), maxSections: 8 })
}
export function boxText({ day, picks, lists }) {
  const body = (t) => t.split('\n').slice(2).filter((l) => l !== siteUrl('/')).join('\n').trim()
  const parts = [picks?.length && body(picksText({ day, picks })), lists?.length && body(top5Text({ day, lists }))].filter(Boolean)
  return parts.length ? [`🎯 Tonight · ${dayWords(day)}`, '', parts.join('\n\n'), '', siteUrl('/')].join('\n') : ''
}

/**
 * WHEN THE PICKS GO (one post with every product): once every Card of the day has locked (`lockTimes`, the expected lock of each product's window
 * today), or earlier when a lead pick's game is SOON_MS away, so no lead is lost to a later lock. Only leads still pregame are in it (leadPicks).
 */
export function goTime({ leads, lockTimes = [], now = Date.now() }) {
  if (!leads?.length) return { go: false, reason: 'no lead pick locked and still pregame' }
  const pending = lockTimes.filter((t) => Number.isFinite(t) && t > now)
  if (!pending.length) return { go: true, reason: 'every Card of the day has locked' }
  const soonest = Math.min(...leads.map((p) => Date.parse(p.leg.start_at)))
  if (soonest - now <= SOON_MS) return { go: true, reason: 'a lead pick starts soon; going with the Cards locked so far' }
  return { go: false, reason: `waiting for ${pending.length} more Card lock${pending.length === 1 ? '' : 's'}` }
}

