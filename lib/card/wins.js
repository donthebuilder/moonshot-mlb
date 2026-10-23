// #MEMBERS WINS AND THE MORNING GRADE (2026-10-23, Donovan: "add the wins posts"; the plan he said yes to: "When a members pick hits, a short post ...
// Then the morning grade covers every pick, hits and misses").
//
//   WINS     one short post per grading pass with the picks of THE DAY that just graded as hits ("✅ Luther Burden III scored a TD"). Each pick is
//            claimed on its own kind (card_members_win_<sport>_<product>_<slot>, day = the card date), so a pick is never announced twice.
//   GRADED   once a game day's every pick is graded, after 8 AM ET: every pick with ✅ or ❌, hits and misses alike (card_members_graded).
// Members only (lib/dash/membersPost.js membersWebhook, never X, never a free channel). Plain words (lib/card/plain.js). Only rows graded in the last
// WIN_FRESH_MS are announced, so the first deploy does not post a backlog. MEMBERS_WINS_OFF=on turns both off.
// Needs supabase/migrations/202610231200_members_wins_kinds.sql (until it runs, the claims are refused and nothing posts).
import { buildCard, dayWords, ledgerLink } from '../dash/discordCard.js'
import { HEAD } from './text.js'
import { rowPrice, legPriceOf, fmtAmerican } from './core.js'
import { ICON, PRODUCT, betWords, hitWords, priceWords, who } from './plain.js'
import { SPORT_ORDER } from './briefing.js'

const sportRank = (s) => { const i = SPORT_ORDER.indexOf(s); return i < 0 ? 99 : i }      // the cross-product Double ('all') last

export const WIN_FRESH_MS = 6 * 3600e3
export const GRADED_KIND = 'card_members_graded'
export const GRADED_HOUR_ET = 8
export const winKind = (r) => `card_members_win_${r.sport}_${r.product}_${r.slot}`
export const winsOff = () => /^(on|1|true)$/i.test(String(process.env.MEMBERS_WINS_OFF || '').trim())
export const MIGRATION = 'supabase/migrations/202610231200_members_wins_kinds.sql'

const MEMBERS_PRODUCTS = new Set(['straight', 'two_man', 'double', 'long_shot'])
/** The rows THE DAY showed members: the bot's, every product it carries. */
export const dayPicks = (rows) => (rows || []).filter((r) => r.lane === 'bot' && MEMBERS_PRODUCTS.has(r.product) && r.legs?.length)

const isHit = (r) => r.result === 'hit'
const mark = (r) => (r.result === 'hit' ? '✅' : r.result === 'miss' ? '❌' : '➖')      // anything else (a void: a player who did not play) reads as no result

/** One pick as a win line: "Luther Burden III scored a TD (+186)". */
export function winLine(r) {
  const l = r.legs[0]
  if (r.product === 'straight') { const p = priceWords(l); return `**${who(l)}** ${hitWords(r.sport, l)}${p ? ` (${p})` : ''}` }
  if (r.product === 'long_shot') { const p = priceWords(l); return `🎲 Long shot: **${who(l)}** ${hitWords(r.sport, l)}${p ? ` at ${p}` : ''}` }
  if (r.product === 'two_man') return `🤝 Two-Man: **${r.legs.map((x) => x.name).join(' + ')}**, both ${hitWords(r.sport, r.legs[0])}`
  if (r.product === 'double') { const both = rowPrice(r, r.legs.map((x) => legPriceOf(x))); return `🔗 The Double: **${r.legs.map((x) => x.name).join(' + ')}**${both ? ` (about ${fmtAmerican(both.median)})` : ''}` }
  return null
}

/** The wins post for a set of just-graded hits (any sports): a card titled by the count, a line per pick, grouped by product. null when none. */
export function winsEmbed({ day, rows, at = null }) {
  const hits = dayPicks(rows).filter(isHit)
  if (!hits.length) return null
  const sports = [...new Set(hits.map((r) => r.sport))].sort((a, b) => sportRank(a) - sportRank(b))
  const one = sports.length === 1 && sports[0] !== 'all' ? sports[0] : null
  const sections = sports.map((s) => ({ name: s === 'all' ? '🔗 Across products' : `${ICON[s]} ${PRODUCT[s]}`, lines: hits.filter((r) => r.sport === s).map(winLine).filter(Boolean) }))
  return buildCard({
    sport: one, title: `✅ ${hits.length === 1 ? 'A pick hit' : `${hits.length} picks hit`} · ${dayWords(day)}`, description: 'Picked before the game.',
    sections, at: at || Date.now(), maxSections: 5,
  })
}
export function winsText({ day, rows }) {
  const hits = dayPicks(rows).filter(isHit)
  if (!hits.length) return ''
  return [`✅ ${hits.length === 1 ? 'A pick hit' : `${hits.length} picks hit`} · ${dayWords(day)}`, ...hits.map(winLine)].join('\n').replace(/\*\*/g, '')
}

/** One pick as a grade line: "✅ Luther Burden III to score a TD". */
function gradeLine(r) {
  const l = r.legs[0]
  if (r.product === 'straight') return `${mark(r)} ${who(l)} ${betWords(r.sport, l)}`
  if (r.product === 'long_shot') return `${mark(r)} Long shot: ${who(l)} ${betWords(r.sport, l)}`
  if (r.product === 'two_man') return `${mark(r)} Two-Man: ${r.legs.map((x) => x.name).join(' + ')}`
  if (r.product === 'double') return `${mark(r)} The Double: ${r.legs.map((x) => `${x.name} (${HEAD[x.sport] || ''})`).join(' + ')}`
  return null
}
const ORDER = { straight: 0, two_man: 1, long_shot: 2, double: 3 }

/** The morning grade: every pick of the day, hits and misses. null until every pick is graded. */
export function gradedParts(rows) {
  const picks = dayPicks(rows)
  if (!picks.length || picks.some((r) => r.result == null)) return null
  const counted = picks.filter((r) => r.result === 'hit' || r.result === 'miss')
  const hit = counted.filter(isHit).length
  const sports = [...new Set(picks.map((r) => r.sport))].sort((a, b) => sportRank(a) - sportRank(b))
  const sections = sports.map((s) => ({
    name: s === 'all' ? '🔗 Across products' : `${ICON[s]} ${PRODUCT[s]}`,
    lines: picks.filter((r) => r.sport === s).sort((a, b) => (ORDER[a.product] - ORDER[b.product]) || a.slot - b.slot).map(gradeLine).filter(Boolean),
  }))
  return { hit, of: counted.length, sections }
}
export function gradedEmbed({ day, rows, at = null }) {
  const g = gradedParts(rows)
  if (!g) return null
  const sport = (dayPicks(rows).find((r) => r.sport !== 'all') || {}).sport || 'mlb'
  g.sections[g.sections.length - 1].link = ledgerLink(sport, 'Every pick, graded')
  return buildCard({ sport: null, title: `🧾 ${dayWords(day)}, graded`, description: `${g.hit} of ${g.of} hit. Hits and misses, every pick.`, sections: g.sections, at: at || Date.now(), maxSections: 6 })
}
export function gradedText({ day, rows }) {
  const g = gradedParts(rows)
  if (!g) return ''
  return [`🧾 ${dayWords(day)}, graded`, `${g.hit} of ${g.of} hit.`, '', ...g.sections.flatMap((s) => [s.name, ...s.lines, ''])].join('\n').trim()
}
