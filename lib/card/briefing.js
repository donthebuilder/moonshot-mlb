// THE DAILY MEMBERS BRIEFING (MEMBERS_FOLDS_ON, 2026-10-16, Donovan: "ONE briefing per day"). Pure: the words only; the poster is lib/card/post.js postDay.
//
// THE DAY at the first lock, a section per product, then a short "More picks" post when a later window locks (only the picks not shown yet,
// never a repeat).
//
// PLAIN WORDS (2026-10-23, Donovan: "I didn't even know what I was looking at" on THE DAY (added) of Oct 22; "plain words, drop units and the
// CALLED / ON THE BOARD tags in members posts"). One pick per line: who, the bet as a bettor says it, the price; under it one short why
// (lib/card/plain.js). No units, no status word, no "straight", no fine print. The stored why is the only why: a pick with none gets none.
// No model chance printed (a percentile is a rank). This text is #members only and is never given to X.
import { buildCard, dayWords, ledgerLink } from '../dash/discordCard.js'
import { CARD_WORDS, rowPrice, legPriceOf, fmtAmerican } from './core.js'
import { prettyDay, HEAD } from './text.js'
import { ICON, PRODUCT, betWords, priceWords, whyPlain, who } from './plain.js'

const glyph = (n) => [...String(n)].length
const FIELD_MAX = 1000      // a Discord field holds 1,024
export const SPORT_ORDER = ['nhl', 'nfl', 'nba', 'mlb']

const pickLine = (sport, l, prices) => {
  const price = priceWords(l, prices.get(`${sport}|${l.player_id}`))
  return `**${who(l)}** ${betWords(sport, l)}${price ? ` · ${price}` : ''}`
}

/** One product's lines: [{ line, why }]. A why is dropped from the bottom up when the section is too long for one Discord field, never a pick. */
function sportItems(sport, rs, prices) {
  const items = []
  for (const r of rs.filter((x) => x.product === 'straight').sort((a, b) => a.slot - b.slot)) {
    const l = r.legs[0]
    items.push({ line: pickLine(sport, l, prices), why: whyPlain(l.why) })
  }
  const two = rs.find((x) => x.product === 'two_man')
  if (two) {
    const [a, b] = two.legs
    const same = betWords(sport, a) === betWords(sport, b)
    const bets = same ? `${a.name} + ${b.name}, both ${betWords(sport, a)}` : `${a.name} ${betWords(sport, a)} + ${b.name} ${betWords(sport, b)}`
    items.push({ line: `🤝 **Two-Man:** ${bets}`, why: null })
    for (const l of [a, b]) { const w = whyPlain(l.why); if (w) items.push({ line: null, why: `${l.name}: ${w.charAt(0).toLowerCase()}${w.slice(1)}` }) }
  }
  return items
}
function fitItems(items, max) {
  const keep = items.map(() => true)
  const render = () => items.flatMap((it, i) => [it.line, keep[i] && it.why ? it.why : null]).filter(Boolean).join('\n')
  for (let i = items.length - 1; i >= 0 && glyph(render()) > max; i -= 1) if (items[i].why) keep[i] = false
  return render()
}

/** "LAMP · 12 games" or, for one game, "TUDDY · CHI vs NE". */
function sectionName(sport, rs) {
  const g = rs.find((r) => r.window_games)?.window_games
  const l = rs.find((r) => r.product === 'straight')?.legs?.[0] || rs[0]?.legs?.[0]
  const where = g === 1 && l?.team && l?.opp ? `${l.team} vs ${l.opp}` : g ? `${g} game${g === 1 ? '' : 's'}` : ''
  return `${ICON[sport]} ${PRODUCT[sport]}${where ? ` · ${where}` : ''}`
}

/** The Double and the Long Shots, in the same plain words. */
function extraSections(rows) {
  const out = []
  const dbl = rows.find((r) => r.lane === 'bot' && r.product === 'double')
  if (dbl?.legs?.length === 2) {
    const both = rowPrice(dbl, dbl.legs.map((l) => legPriceOf(l)))
    out.push({ name: '🔗 The Double', text: `${dbl.legs.map((l) => `**${l.name}** (${HEAD[l.sport] || ''}) ${betWords(l.sport, l)}`).join(' + ')}\n${both ? `About ${fmtAmerican(both.median)}. ` : ''}Both must hit.` })
  }
  const dd = rows.find((r) => r.lane === 'donovan' && r.product === 'double')
  if (dd?.legs?.length) out.push({ name: "🔗 Donovan's Double", text: `${dd.legs.map((l) => `**${l.name}** (${HEAD[l.sport] || ''})`).join(' + ')}${dd.note ? `\n${String(dd.note).replace(/\n/g, ' ')}` : ''}` })
  const lss = rows.filter((r) => r.lane === 'bot' && r.product === 'long_shot').sort((a, b) => SPORT_ORDER.indexOf(a.sport) - SPORT_ORDER.indexOf(b.sport))
  if (lss.length) {
    const lines = lss.map((r) => { const l = r.legs[0]; const p = priceWords(l); return `**${who(l)}** ${betWords(r.sport, l)}${p ? ` · ${p}` : ''}` })
    out.push({ name: `🎲 Long shot${lss.length === 1 ? '' : 's'}`, text: `${lines.join('\n')}\nMost of these miss.` })
  }
  return out
}

/**
 * The briefing's sections. `rows` = the rows to show in THIS post. `all` and `prices` as before (`all` is no longer printed: the units line is gone).
 * { sections: [{ name, text }] }
 */
export function briefingParts({ rows, prices = new Map() } = {}) {
  const bot = (rows || []).filter((r) => r.lane === 'bot')
  const sections = []
  for (const sport of SPORT_ORDER) {
    const rs = bot.filter((r) => r.sport === sport && (r.product === 'straight' || r.product === 'two_man'))
    if (!rs.length || !CARD_WORDS[sport]) continue
    sections.push({ name: sectionName(sport, rs), text: fitItems(sportItems(sport, rs, prices), FIELD_MAX) })
  }
  sections.push(...extraSections(rows || []))
  return { sections }
}

const title = (day, update) => (update ? `➕ More picks · ${dayWords(day)}` : `📅 Today's picks · ${dayWords(day)}`)
const lead = (update) => (update ? 'For the games that start later.' : 'More picks get added as games lock. Every pick is graded the next morning.')

/** The briefing as a Discord embed (#members only). null when there is nothing to show. */
export function briefingEmbed({ day, rows, prices = new Map(), update = false, at = null }) {
  const { sections } = briefingParts({ rows, prices })
  if (!sections.length) return null
  const sport = ((rows || []).find((r) => CARD_WORDS[r.sport]) || {}).sport || 'mlb'
  const out = sections.map((s) => ({ name: s.name, lines: [s.text] }))
  out[out.length - 1].link = ledgerLink(sport, 'Every pick, graded')
  return buildCard({ sport: null, title: title(day, update), description: lead(update), sections: out, at: at || Date.now(), maxSections: 7 })
}

/** The plain text of the briefing (the stored post text and the fallback when an embed cannot be sent). */
export function briefingText({ day, rows, prices = new Map(), update = false }) {
  const { sections } = briefingParts({ rows, prices })
  if (!sections.length) return ''
  return [`${update ? '➕ More picks' : "📅 Today's picks"} · ${prettyDay(day)}`, '', lead(update), '', ...sections.flatMap((s) => [s.name, s.text, ''])].join('\n').trim()
}
