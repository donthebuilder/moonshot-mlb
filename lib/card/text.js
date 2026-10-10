// THE CARD'S WORDS (2026-10-10). Pure: three texts, three audiences.
//
//   xCardText       THE X POST, before the first game. It names ONLY the #1 straight and, when he entered one, Donovan's Two-Man with his
//                   note. The other two straights and the bot's Two-Man are never in it (they are the #members card).
//   membersCardText THE #MEMBERS CARD: the whole Card and the bot's Two-Man, each leg with its stored price and the one-line why.
//                   Goes through lib/dash/membersPost postMembers only (never X, never a free channel).
//   resultText      THE FREE RESULT, after the grade: every leg's outcome, hits and misses alike.
// The X rules hold in all three: no link, no hashtag, never "lock" / "guaranteed", no "winners". A model chance is never printed.
import { STATUS_WORD } from '../callStatus.js'
import { buildCard, dayWords, ledgerLink } from '../dash/discordCard.js'
import { BRAND } from '../routes.js'
import { CARD_WORDS, CARD_RULE_TEXT, STAKE, fmtAmerican, rowPrice } from './core.js'

const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const prettyDay = (d) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(d || '')); return m ? `${MONTH[Number(m[2]) - 1]} ${Number(m[3])}` : '' }
const HEAD = { mlb: 'MLB', nfl: 'NFL', nhl: 'NHL' }
const glyph = (n) => [...String(n)].length
const fits = (t, hard) => glyph(t) + 4 <= hard   // the repo's own margin (lib/totals/core.js totalsPostText)

/** "Name · AAA vs BBB" (a leg's one line). */
export const legLine = (l) => `${l.name || l.player_id} · ${l.team || '?'} vs ${l.opp || '?'}`
/** CALLED or ON THE BOARD, from the leg's stored status (the word comes from lib/callStatus STATUS_WORD). */
export const statusWord = (l) => STATUS_WORD[l?.status === 'board' ? 'board' : 'called']
/** The words that must never reach a public post of ours. */
export const PUBLIC_BANNED = [/https?:\/\//i, /#[A-Za-z]/, /\block(?:ed|s|ing)?\b/i, /guarantee/i, /\bwinners?\b/i]
/** True when `text` is clean of every banned shape. */
export const cleanPublic = (text) => !PUBLIC_BANNED.some((re) => re.test(String(text || '')))

/**
 * THE X POST. `straight` = the #1 straight's leg, `donovan` = { legs:[a,b], note } (his row), either may be null.
 * `exclude` = player ids the repeat guard says were named too recently (a name is left out, never replaced by another straight).
 * Returns { text, named: [ids the text names] } or { text: '' } when nothing is left to say.
 */
export function xCardText({ sport, day, straight = null, donovan = null, exclude = new Set(), hardLimit = 280 }) {
  const w = CARD_WORDS[sport]
  if (!w) return { text: '', named: [] }
  const ex = exclude instanceof Set ? exclude : new Set(exclude || [])
  const s = straight && !ex.has(String(straight.player_id)) ? straight : null
  // Donovan's Two-Man goes out whole or not at all: a note about two men whose names cannot be shown (not cleared, or named too recently) says nothing
  const d = donovan && donovan.legs?.length === 2 && !donovan.legs.some((l) => ex.has(String(l.player_id))) ? donovan : null
  if (!s && !d) return { text: '', named: [] }
  const build = (note, withWhy = true) => [
    `\u{1F3AF} THE CARD · ${HEAD[sport]} · ${prettyDay(day)}`,
    ...(s ? [`Straight #1: ${legLine(s)} (${w.market}) · ${statusWord(s)}`, ...(withWhy && s.why ? [s.why] : [])] : []),
    ...(d ? ["", `Donovan's Two-Man: ${d.legs[0].name} + ${d.legs[1].name}`, ...(note ? [note] : [])] : []),
  ].join('\n')
  const lines = d?.note ? String(d.note).split('\n') : []
  // the note is his words; when the post is too long it loses its last lines, then is cut, never the names
  // one data line under the #1 straight (his why line); it is dropped before any of Donovan's words are
  for (const withWhy of [true, false]) for (let k = lines.length; k >= 0; k -= 1) {
    const t = build(lines.slice(0, k).join('\n'), withWhy)
    if (withWhy && k < lines.length) continue
    if (fits(t, hardLimit)) return { text: t, named: [...(s ? [String(s.player_id)] : []), ...(d ? d.legs.map((l) => String(l.player_id)) : [])] }
  }
  if (d && lines.length) {
    const room = hardLimit - 4 - glyph(build('', false))
    if (room > 12) {
      const cut = [...lines.join(' ')].slice(0, room - 2).join('').trimEnd() + '…'
      const t = build(cut, false)
      if (fits(t, hardLimit)) return { text: t, named: [...(s ? [String(s.player_id)] : []), ...d.legs.map((l) => String(l.player_id))] }
    }
  }
  return { text: '', named: [] }
}

const legPriceWords = (p) => (p ? `${fmtAmerican(p.best)} best${p.median != null && p.median !== p.best ? `, ${fmtAmerican(p.median)} median` : ''}${p.books ? ` (${p.books} book${p.books === 1 ? '' : 's'})` : ''}` : 'no price on file yet')

/**
 * THE #MEMBERS CARD. `rows` = the bot's rows for the card (straights + two_man), `prices` = Map(player_id -> { best, median, books } | undefined)
 * the newest stored anytime prices. A Discord message is cut at 1,900: why lines are dropped from the bottom up, never half a line.
 */
export function membersCardText({ sport, day, rows, prices = new Map(), max = 1900 }) {
  const w = CARD_WORDS[sport]
  const straights = (rows || []).filter((r) => r.lane === 'bot' && r.product === 'straight').sort((a, b) => a.slot - b.slot)
  const two = (rows || []).find((r) => r.lane === 'bot' && r.product === 'two_man') || null
  if (!w || !straights.length) return { text: '', payload: {} }
  const items = []
  for (const r of straights) {
    const l = r.legs[0]
    items.push({ line: `${r.slot}. ${legLine(l)} · ${statusWord(l)} · ${w.market} · ${STAKE.straight} unit · ${legPriceWords(prices.get(String(l.player_id)))}`, why: l.why || null })
  }
  if (two) {
    const [a, b] = two.legs
    const pa = prices.get(String(a.player_id)); const pb = prices.get(String(b.player_id))
    const both = rowPrice(two, [pa, pb])
    items.push({
      line: `TWO-MAN: ${a.name} + ${b.name} · different games · ${two.stake} unit · ${both ? `about ${fmtAmerican(both.best)} best (the two prices multiplied; your book's parlay price will differ)` : 'no price on file for both legs yet'}`,
      why: [a, b].map((l) => (l.why ? `${l.name}: ${l.why}` : null)).filter(Boolean).join(' | ') || null,
    })
  }
  const head = [`\u{1F3AF} THE CARD · ${HEAD[sport]} members · ${prettyDay(day)}`, `${CARD_RULE_TEXT.straight} ${CARD_RULE_TEXT.grade}`, '']
  const keep = items.map(() => true)
  const build = () => [...head, ...items.map((it, i) => (keep[i] && it.why ? `${it.line}\n   ${it.why}` : it.line))].join('\n')
  for (let i = items.length - 1; i >= 0 && glyph(build()) > max; i -= 1) keep[i] = false
  const text = build()
  return { text: glyph(text) <= max ? text : '', payload: { sport, day, rows: rows.map((r) => ({ product: r.product, slot: r.slot, legs: r.legs.map((l) => ({ player_id: l.player_id, name: l.name })) })) } }
}

const MARK = { hit: '✓', miss: '✗', void: '–' }
const words = { hit: 'hit', miss: 'missed', void: 'void (did not play)' }

/**
 * THE FREE RESULT. `rows` = every graded row of the card (bot + Donovan). Hits and misses alike. null/'' when the card is not all graded.
 * Names are kept, then dropped from the Donovan line and the straights to fit.
 */
export function resultText({ sport, day, rows, hardLimit = 280 }) {
  const w = CARD_WORDS[sport]
  const all = rows || []
  if (!w || !all.length || all.some((r) => r.result == null)) return { text: '', named: [] }
  const straights = all.filter((r) => r.lane === 'bot' && r.product === 'straight').sort((a, b) => a.slot - b.slot)
  const two = all.find((r) => r.lane === 'bot' && r.product === 'two_man')
  const don = all.find((r) => r.lane === 'donovan')
  const graded = straights.filter((r) => r.result !== 'void')
  const hits = graded.filter((r) => r.result === 'hit').length
  const build = (level) => {
    const out = [`\u{1F4CB} THE CARD · ${HEAD[sport]} · ${prettyDay(day)} · results`]
    if (straights.length) {
      out.push(`Straights: ${graded.length ? `${hits} of ${graded.length} hit` : 'none graded'}${straights.length > graded.length ? ` (${straights.length - graded.length} void)` : ''}`)
      if (level < 2) out.push(straights.map((r) => `${MARK[r.result]} ${r.legs[0].name}`).join('  '))
    }
    if (two) out.push(`Two-Man: ${level < 2 ? `${two.legs[0].name} + ${two.legs[1].name}, ` : ''}${words[two.result]}`)
    if (don) out.push(`Donovan's Two-Man: ${level < 1 ? `${don.legs[0].name} + ${don.legs[1].name}, ` : ''}${words[don.result]}`)
    return out.join('\n')
  }
  for (const level of [0, 1, 2]) {
    const t = build(level)
    if (fits(t, hardLimit)) {
      const named = level === 0 ? all.flatMap((r) => r.legs.map((l) => String(l.player_id)))
        : level === 1 ? [...straights, ...(two ? [two] : [])].flatMap((r) => r.legs.map((l) => String(l.player_id))) : []
      return { text: t, named: [...new Set(named)] }
    }
  }
  return { text: '', named: [] }
}

// ── THE CARD AS A DASH DISCORD CARD (2026-10-10, lib/dash/discordCard.js) ────────────────────────────────────────────────
// Same facts as the texts above, laid out in named sections. The texts stay (X, the stored row, the naming guards).

/** The line under a pick that says what the stored price is, in the approved copy; "no price on file yet" when none. */
const priceLine = (p) => {
  if (!p) return 'no price on file yet'
  const at = p.at && Number.isFinite(Date.parse(p.at)) ? ` (priced ${new Date(p.at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })} ET)` : ''
  const best = fmtAmerican(p.best)
  if (p.books === 1) return `${best} at one book${at}`
  if (p.books > 1 && p.median != null && p.median !== p.best) return `${best} best, ${fmtAmerican(p.median)} median across ${p.books} books${at}`
  if (p.books > 1) return `${best} best across ${p.books} books${at}`
  return `${best} best${at}`
}
/** NHL's stored why line is "shots Nth · goals Nth · ice time Nth percentile tonight": percentiles among tonight's skaters (lib/nhl/goalModel.js). Anything else is printed as stored. */
const WHY_SHAPE = { nhl: /^shots (\S+) · goals (\S+) · ice time (\S+) percentile tonight$/ }   // the sports whose stored why line is a percentile line we can name the set of
const RULE_NOTE = { nfl: ' (CALLED or ON THE BOARD)' }   // football keeps ON THE BOARD eligibility
const whyWords = (sport, why) => {
  if (!why) return null
  const m = WHY_SHAPE[sport]?.exec(why) || null
  return m ? `Among tonight's skaters: shots ${m[1]}, goals ${m[2]}, ice time ${m[3]} percentile` : why
}
const RULE_LINE = (sport) => `*Top 3 by ${BRAND[sport].name} ranking score${RULE_NOTE[sport] || ''}, one per game. Both Two-Man legs must land; a player who does not play voids it.*`

/**
 * THE #MEMBERS CARD as an embed, in the approved copy (Donovan 2026-10-10): one field per straight ("1. Player": club vs opponent and the
 * status word, the stored price, the why), one for the bot's Two-Man, then one italic rule line and the ledger link. Goes through
 * lib/dash/membersPost.js postMembers only. null when there is no card.
 */
export function membersCardEmbed({ sport, day, rows, prices = new Map(), at = null }) {
  const w = CARD_WORDS[sport]
  const straights = (rows || []).filter((r) => r.lane === 'bot' && r.product === 'straight').sort((a, b) => a.slot - b.slot)
  const two = (rows || []).find((r) => r.lane === 'bot' && r.product === 'two_man') || null
  if (!w || !straights.length) return null
  const sections = straights.map((r) => {
    const l = r.legs[0]
    return { name: `${r.slot}. ${l.name || l.player_id}`, lines: [`${l.team || '?'} vs ${l.opp || '?'} · **${statusWord(l)}**`, priceLine(prices.get(String(l.player_id))), whyWords(sport, l.why)] }
  })
  if (two) {
    const [a, b] = two.legs
    const both = rowPrice(two, [prices.get(String(a.player_id)), prices.get(String(b.player_id))])
    sections.push({ name: `Two-Man (${two.stake} unit)`, lines: [
      `${a.name} + ${b.name}, different games`,
      both ? `about ${fmtAmerican(both.best)} best (the two prices multiplied; your book's parlay price will differ)` : 'no price on file for both legs yet',
    ] })
  }
  const last = sections[sections.length - 1]
  last.lines = [...last.lines, RULE_LINE(sport)]
  last.link = ledgerLink(sport, 'Full rules in the ledger')
  return buildCard({ sport, title: `\u{1F3AF} The Card · ${HEAD[sport]} · ${dayWords(day)}`, description: `${w.market}, ${STAKE.straight} unit each. Picks are set before the first game.`, sections, at: at || Date.now() })
}

/**
 * THE FREE RESULT as an embed. Names appear only for the rows resultText's own free text names (its `named`), so the card never
 * says more than the public text would. null when resultText says there is nothing to post.
 */
export function resultEmbed({ sport, day, rows, at = null }) {
  const t = resultText({ sport, day, rows })
  if (!t.text) return null
  const all = rows || []
  const named = new Set(t.named)
  const showable = (r) => r.legs.every((l) => named.has(String(l.player_id)))
  const straights = all.filter((r) => r.lane === 'bot' && r.product === 'straight').sort((a, b) => a.slot - b.slot)
  const two = all.find((r) => r.lane === 'bot' && r.product === 'two_man')
  const don = all.find((r) => r.lane === 'donovan')
  const graded = straights.filter((r) => r.result !== 'void')
  const hits = graded.filter((r) => r.result === 'hit').length
  const sections = []
  if (straights.length) sections.push({ name: 'Straights', lines: [`${graded.length ? `${hits} of ${graded.length} hit` : 'none graded'}${straights.length > graded.length ? ` (${straights.length - graded.length} void)` : ''}`, ...straights.filter(showable).map((r) => `${MARK[r.result]} ${r.legs[0].name}`)] })
  if (two) sections.push({ name: 'Two-Man', lines: [`${showable(two) ? `${two.legs[0].name} + ${two.legs[1].name}, ` : ''}${words[two.result]}`] })
  if (don) sections.push({ name: "Donovan's Two-Man", lines: [`${showable(don) ? `${don.legs[0].name} + ${don.legs[1].name}, ` : ''}${words[don.result]}`] })
  const last = sections[sections.length - 1]
  last.lines = [...last.lines, `*${CARD_RULE_TEXT.grade}*`]
  last.link = ledgerLink(sport, 'Full record in the ledger.')
  return buildCard({ sport, title: `\u{1F4CB} The Card · ${HEAD[sport]} · ${dayWords(day)} · results`, description: CARD_WORDS[sport].market, sections, at: at || Date.now() })
}
