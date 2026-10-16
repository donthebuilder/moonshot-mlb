// THE DAILY MEMBERS BRIEFING (MEMBERS_FOLDS_ON, 2026-10-16, Donovan: "ONE briefing per day"). Pure: the words only; the poster is lib/card/post.js postDay.
//
// Today #members gets card_members_<sport> per sport, card_members_day (+ _2.._4), the bot's tonight's-edge post and per-sport board posts. With the switch ON the
// one briefing is THE DAY at the first lock, a section per sport:
//   - every Card leg: market and stored line, price, the status word (lib/callStatus STATUS_WORD via statusWord) and the ONE-LINE WHY the lock stored with it
//     (leg.why, written at lock from lib/mlb/boardReason.js / lib/nfl/boardReason.js / the NHL percentile line; a leg with no clean why gets none, never an invented one)
//   - the Two-Man (its two legs, each with its why), the Double and the Long Shots (as THE DAY always had them)
//   - BEST LOOKS: the day's three highest-percentile straights across the sports, by name only (the "tonight's edge" slot)
// A window that locks later is an UPDATE: only the legs not shown yet, in a short "(added)" post. A leg that was already shown is never repeated.
// No link in the text, no model chance printed (a percentile line is a rank), never "lock" in the free sense: this text is #members only and is never given to X.
import { buildCard, dayWords, ledgerLink } from '../dash/discordCard.js'
import { CARD_WORDS, isSameGameRule } from './core.js'
import { dayParts, exposureLine, legMarket, legLine, statusWord, whyWords, twoManKind, slateWords, sportLabel, dayPrice, prettyDay, HEAD } from './text.js'

const glyph = (n) => [...String(n)].length
const ONE_LINE = 150      // a why is one line: cut on a word with an ellipsis past this (Discord fields are 1,024 each)

const oneLine = (why) => {
  const t = String(why == null ? '' : why).replace(/\s+/g, ' ').trim()
  if (!t) return null
  if (glyph(t) <= ONE_LINE) return t
  const cut = [...t].slice(0, ONE_LINE - 1).join('')
  return `${cut.replace(/\s+\S*$/, '').trimEnd() || cut}…`
}

/** Lines of one sport's section: [{ line, why }] (the why is dropped from the bottom up when the section is too long for one Discord field). */
function sportItems(sport, rs, prices) {
  const items = []
  const sts = rs.filter((x) => x.product === 'straight').sort((a, b) => a.slot - b.slot)
  for (const r of sts) {
    const l = r.legs[0]
    items.push({ line: `${r.slot}. ${legLine(l)} · ${legMarket(sport, l)} · ${statusWord(l)} · ${dayPrice(l, prices.get(`${sport}|${l.player_id}`))}`, why: oneLine(whyWords(sport, l.why)) })
  }
  const two = rs.find((x) => x.product === 'two_man')
  if (two) {
    const [a, b] = two.legs
    items.push({ line: `Two-Man (${two.stake}u, ${twoManKind(two)}): ${a.name} + ${b.name}`, why: null })
    for (const l of [a, b]) { const w = oneLine(whyWords(sport, l.why)); if (w) items.push({ line: null, why: `${l.name}: ${w}` }) }
    if (isSameGameRule(two.rule)) items.push({ line: '*Same-game legs are correlated; the two prices multiplied overstates a real same-game price.*', why: null })
  }
  return items
}
/** Items to text, `max` glyphs: a why line is dropped from the bottom up, never a leg and never half a line. */
function fitItems(items, max) {
  const keep = items.map(() => true)
  const render = () => items.flatMap((it, i) => [it.line, keep[i] && it.why ? `   ${it.why}` : null]).filter(Boolean).join('\n')
  for (let i = items.length - 1; i >= 0 && glyph(render()) > max; i -= 1) if (items[i].line === null || items[i].why) keep[i] = false
  return render()
}

/** The day's best looks: the three highest-percentile bot straights across the sports (ties to the earlier game), names only. Needs at least two straights. */
export function bestLooks(rows) {
  const st = (rows || []).filter((r) => r.lane === 'bot' && r.product === 'straight' && r.legs?.[0])
  if (st.length < 2) return []
  const pct = (r) => (Number.isFinite(r.legs[0].board_pct) ? r.legs[0].board_pct : -Infinity)
  return st.slice().sort((a, b) => (pct(b) - pct(a)) || (Date.parse(a.legs[0].start_at) - Date.parse(b.legs[0].start_at)) || String(a.sport).localeCompare(String(b.sport)) || a.slot - b.slot)
    .slice(0, 3).map((r) => `${r.legs[0].name} (${HEAD[r.sport] || r.sport}, ${legMarket(r.sport, r.legs[0])}, ${statusWord(r.legs[0])})`)
}

/**
 * The briefing's sections and exposure line. `rows` = the rows to show in THIS post, `all` = the whole day's locked rows (exposure line; best looks over the first post's rows).
 * { sections: [{ name, lines:[text] }], exposure }
 */
export function briefingParts({ day, rows, all = null, prices = new Map(), update = false }) {
  const bot = (rows || []).filter((r) => r.lane === 'bot')
  const sections = []
  for (const sport of ['nhl', 'nfl', 'mlb']) {
    const rs = bot.filter((r) => r.sport === sport && (r.product === 'straight' || r.product === 'two_man'))
    if (!rs.length || !CARD_WORDS[sport]) continue
    const sts = rs.filter((x) => x.product === 'straight').length
    const two = rs.some((x) => x.product === 'two_man')
    sections.push({ name: `${sportLabel(sport, day)} · ${sts} straight${sts === 1 ? '' : 's'}${two ? ' + Two-Man' : ''}${slateWords(rs) ? ` · ${slateWords(rs)}` : ''}${update ? ' (added)' : ''}`, text: fitItems(sportItems(sport, rs, prices), 960) })
  }
  // the Double and the Long Shots: exactly THE DAY's own sections
  const base = dayParts({ day, rows, all, prices })
  const sportCount = ['nhl', 'nfl', 'mlb'].filter((s) => bot.some((r) => r.sport === s && (r.product === 'straight' || r.product === 'two_man'))).length
  for (const s of base.sections.slice(sportCount)) sections.push({ name: s.name, text: s.lines.join('\n') })
  if (!update) { const looks = bestLooks(bot); if (looks.length) sections.push({ name: 'Best looks of the day', text: looks.map((x, i) => `${i + 1}. ${x}`).join('\n') }) }
  return { sections, exposure: exposureLine(all || rows, day) }
}

const HEAD_NOTE = 'Each Card is set before its own first game; nothing here is edited afterwards.'

/** The briefing as a Discord embed (#members only). null when there is nothing to show. */
export function briefingEmbed({ day, rows, all = null, prices = new Map(), update = false, at = null }) {
  const { sections, exposure } = briefingParts({ day, rows, all, prices, update })
  if (!sections.length) return null
  const lead = (rows.find((r) => CARD_WORDS[r.sport]) || {}).sport || 'mlb'
  const out = sections.map((s) => ({ name: s.name, lines: [s.text] }))
  out[out.length - 1].link = ledgerLink(lead, 'Every call, graded in the ledger')
  return buildCard({ sport: null, title: `\u{1F4C5} The Day${update ? ' (added)' : ''} · ${dayWords(day)}`, description: [exposure, update ? 'Added since the last post. Everything above it stands.' : HEAD_NOTE].filter(Boolean).join('\n'), sections: out, at: at || Date.now(), maxSections: 7 })
}

/** The plain text of the briefing (the stored post text and the fallback when an embed cannot be sent). */
export function briefingText({ day, rows, all = null, prices = new Map(), update = false }) {
  const { sections, exposure } = briefingParts({ day, rows, all, prices, update })
  if (!sections.length) return ''
  return [`\u{1F4C5} THE DAY${update ? ' (added)' : ''} · ${prettyDay(day)}`, '', ...(exposure ? [exposure, ''] : []), ...sections.flatMap((s) => [s.name, s.text, ''])].join('\n').trim()
}
