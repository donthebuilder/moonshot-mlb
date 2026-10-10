// THE CARD'S WORDS (2026-10-10). Pure: the texts, by audience.
//
//   xCardText       THE X POST, before the first game. It names ONLY the lead straight (the highest percentile on its own board) and, when he
//                   entered one, Inside Line Two-Man with his note. The other straights and the bot's Two-Man are never in it (they are #members).
//   membersCardText THE #MEMBERS CARD: the whole Card and the bot's Two-Man, each leg with its market, its stored line and price, and the one-line why.
//                   Goes through lib/dash/membersPost postMembers only (never X, never a free channel).
//   resultText      THE FREE RESULT, after the grade: every leg's outcome, hits and misses alike.
//   longShot*       THE LONG SHOT OF THE DAY, the one plus-money pick that IS public: plain and honest, X + the free channel; its result wins AND misses.
//   double*         THE DOUBLE: the ticket is members only (inside THE DAY); the free text is its result only.
//   dayEmbed/dayText THE DAY, #members, one post a day: every sport's Card in one embed, the exposure line, the Double and the Long Shots;
//                   a follow-up (never an edit) when a later window locks.
//   todayText       THE FREE X LINE: "Today's Card: ..." naming only the lead straight; no price, no why, no other leg.
// The X rules hold in all of them: no link, no hashtag, never "lock" / "guaranteed" / "nuke", no "winners". A model chance is never printed.
import { STATUS_WORD } from '../callStatus.js'
import { buildCard, dayWords, ledgerLink } from '../dash/discordCard.js'
import { BRAND } from '../routes.js'
import { CARD_WORDS, CARD_RULE_TEXT, STAKE, MARKETS, MIN_LONG_SHOTS, SAME_GAME_NOTE, LONG_SHOT_NOTE, CARD_RULE, fmtAmerican, rowPrice, legPriceOf, marketWords, leadStraight } from './core.js'

const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
export const prettyDay = (d) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(d || '')); return m ? `${MONTH[Number(m[2]) - 1]} ${Number(m[3])}` : '' }
const HEAD = { mlb: 'MLB', nfl: 'NFL', nhl: 'NHL' }
const glyph = (n) => [...String(n)].length
const fits = (t, hard) => glyph(t) + 4 <= hard   // the repo's own margin (lib/totals/core.js totalsPostText)

/** "Name · AAA vs BBB" (a leg's one line). */
export const legLine = (l) => `${l.name || l.player_id} · ${l.team || '?'} vs ${l.opp || '?'}`
/** CALLED or ON THE BOARD, from the leg's stored status (the word comes from lib/callStatus STATUS_WORD). */
export const statusWord = (l) => STATUS_WORD[l?.status === 'board' ? 'board' : 'called']
/** The market of a leg in words, with its stored line when it has one ("shots on goal over 2.5"); the sport's anytime market otherwise. */
export const legMarket = (sport, l) => (l?.market && MARKETS[sport]?.[l.market] ? marketWords(sport, l.market, l.line) : CARD_WORDS[sport]?.market || '')
/** The words that must never reach a public post of ours. */
export const PUBLIC_BANNED = [/https?:\/\//i, /#[A-Za-z]/, /\block(?:ed|s|ing)?\b/i, /guarantee/i, /\bwinners?\b/i, /\bnuke/i]
/** True when `text` is clean of every banned shape. */
export const cleanPublic = (text) => !PUBLIC_BANNED.some((re) => re.test(String(text || '')))
const units = (u) => `${Math.round(u * 100) / 100}`

/**
 * THE X POST. `straight` = the lead straight's leg, `donovan` = { legs:[a,b], note } (his row), either may be null.
 * `exclude` = player ids the repeat guard says were named too recently (a name is left out, never replaced by another straight).
 * Returns { text, named: [ids the text names] } or { text: '' } when nothing is left to say.
 */
export function xCardText({ sport, day, straight = null, donovan = null, exclude = new Set(), hardLimit = 280 }) {
  const w = CARD_WORDS[sport]
  if (!w) return { text: '', named: [] }
  const ex = exclude instanceof Set ? exclude : new Set(exclude || [])
  const s = straight && !ex.has(String(straight.player_id)) ? straight : null
  // Inside Line Two-Man goes out whole or not at all: a note about two men whose names cannot be shown (not cleared, or named too recently) says nothing
  const d = donovan && donovan.legs?.length === 2 && !donovan.legs.some((l) => ex.has(String(l.player_id))) ? donovan : null
  if (!s && !d) return { text: '', named: [] }
  const build = (note, withWhy = true) => [
    `\u{1F3AF} THE CARD · ${HEAD[sport]} · ${prettyDay(day)}`,
    ...(s ? [`Straight: ${legLine(s)} (${legMarket(sport, s)}) · ${statusWord(s)}`, ...(withWhy && s.why ? [s.why] : [])] : []),
    ...(d ? ["", `Inside Line Two-Man: ${d.legs[0].name} + ${d.legs[1].name}`, ...(note ? [note] : [])] : []),
  ].join('\n')
  const lines = d?.note ? String(d.note).split('\n') : []
  // the note is his words; when the post is too long it loses its last lines, then is cut, never the names
  // one data line under the lead straight (his why line); it is dropped before any of Donovan's words are
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

/** The price of a leg in words: the one the lock froze with it (a volume pick: at its line), else the newest stored anytime price. */
const legPriceWords = (l, p) => {
  const f = legPriceOf(l)
  if (f) return `${fmtAmerican(f.median)} median${l.price?.books ? ` across ${l.price.books} book${l.price.books === 1 ? '' : 's'}` : ''}`
  return p ? `${fmtAmerican(p.best)} best${p.median != null && p.median !== p.best ? `, ${fmtAmerican(p.median)} median` : ''}${p.books ? ` (${p.books} book${p.books === 1 ? '' : 's'})` : ''}` : 'no price on file yet'
}
const twoManKind = (r) => (r.rule === CARD_RULE.two_man_same_game ? 'same game' : 'different games')
const slateWords = (rows) => { const g = rows?.find((r) => r.window_games)?.window_games; return g ? `${g} game${g === 1 ? '' : 's'}` : null }

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
    items.push({ line: `${r.slot}. ${legLine(l)} · ${statusWord(l)} · ${legMarket(sport, l)} · ${STAKE.straight} unit · ${legPriceWords(l, prices.get(String(l.player_id)))}`, why: l.why || null })
  }
  if (two) {
    const [a, b] = two.legs
    const pa = prices.get(String(a.player_id)); const pb = prices.get(String(b.player_id))
    const both = rowPrice(two, [pa, pb])
    items.push({
      line: `TWO-MAN: ${a.name} + ${b.name} · ${twoManKind(two)} · ${two.stake} unit · ${both ? `about ${fmtAmerican(both.best)} best (the two prices multiplied; your book's parlay price will differ)` : 'no price on file for both legs yet'}`,
      why: [a, b].map((l) => (l.why ? `${l.name}: ${l.why}` : null)).filter(Boolean).join(' | ') || null,
    })
    if (two.rule === CARD_RULE.two_man_same_game) items.push({ line: SAME_GAME_NOTE, why: null })
  }
  const head = [`\u{1F3AF} THE CARD · ${HEAD[sport]} members · ${prettyDay(day)}${slateWords(rows) ? ` · ${slateWords(rows)}` : ''}`, `${CARD_RULE_TEXT.straight} ${CARD_RULE_TEXT.grade}`, '']
  const keep = items.map(() => true)
  const build = () => [...head, ...items.map((it, i) => (keep[i] && it.why ? `${it.line}\n   ${it.why}` : it.line))].join('\n')
  for (let i = items.length - 1; i >= 0 && glyph(build()) > max; i -= 1) keep[i] = false
  const text = build()
  return { text: glyph(text) <= max ? text : '', payload: { sport, day, rows: rows.map((r) => ({ product: r.product, slot: r.slot, legs: r.legs.map((l) => ({ player_id: l.player_id, name: l.name })) })) } }
}

const MARK = { hit: '✓', miss: '✗', void: '–', push: '=' }
const words = { hit: 'hit', miss: 'missed', void: 'void (did not play)', push: 'pushed (landed on the line)' }

/**
 * THE FREE RESULT. `rows` = every graded row of the card (bot + Donovan; the Long Shot and the Double have their own results). Hits and misses alike.
 * '' when the card is not all graded. Names are kept, then dropped from the Donovan line and the straights to fit.
 */
export function resultText({ sport, day, rows, hardLimit = 280 }) {
  const w = CARD_WORDS[sport]
  const all = (rows || []).filter((r) => r.product !== 'long_shot' && r.product !== 'double')
  if (!w || !all.length || all.some((r) => r.result == null)) return { text: '', named: [] }
  const straights = all.filter((r) => r.lane === 'bot' && r.product === 'straight').sort((a, b) => a.slot - b.slot)
  const two = all.find((r) => r.lane === 'bot' && r.product === 'two_man')
  const don = all.find((r) => r.lane === 'donovan')
  const graded = straights.filter((r) => r.result === 'hit' || r.result === 'miss')
  const hits = graded.filter((r) => r.result === 'hit').length
  const side = (n, word) => (n ? ` (${n} ${word})` : '')
  const build = (level) => {
    const out = [`\u{1F4CB} THE CARD · ${HEAD[sport]} · ${prettyDay(day)} · results`]
    if (straights.length) {
      out.push(`Straights: ${graded.length ? `${hits} of ${graded.length} hit` : 'none graded'}${side(straights.filter((r) => r.result === 'void').length, 'void')}${side(straights.filter((r) => r.result === 'push').length, 'pushed')}`)
      if (level < 2) out.push(straights.map((r) => `${MARK[r.result]} ${r.legs[0].name}`).join('  '))
    }
    if (two) out.push(`Two-Man: ${level < 2 ? `${two.legs[0].name} + ${two.legs[1].name}, ` : ''}${words[two.result]}`)
    if (don) out.push(`Inside Line Two-Man: ${level < 1 ? `${don.legs[0].name} + ${don.legs[1].name}, ` : ''}${words[don.result]}`)
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

// ── THE LONG SHOT OF THE DAY (public) ────────────────────────────────────────────────────────────────────────────────────
/**
 * The pregame Long Shot post: plain and honest. The market, the stored median price, and that most of these miss.
 * `leg` = the long_shot row's leg. '' without a name or a price.
 */
export function longShotText({ sport, day, leg, hardLimit = 280 }) {
  const f = legPriceOf(leg)
  if (!CARD_WORDS[sport] || !leg?.name || !f) return { text: '', named: [] }
  const t = [`\u{1F3AF} LONG SHOT OF THE DAY · ${HEAD[sport]} · ${prettyDay(day)}`, `${legLine(leg)} (${CARD_WORDS[sport].market}) at ${fmtAmerican(f.median)}, the median price on file.`, LONG_SHOT_NOTE].join('\n')
  return fits(t, hardLimit) ? { text: t, named: [String(leg.player_id)] } : { text: '', named: [] }
}
/** The Long Shot record sentence for a post: a count only until MIN_LONG_SHOTS are graded; K of N after. `rec` = recordOf for the long_shot product. */
export function longShotRecordLine(rec) {
  const total = (rec?.graded || 0) + (rec?.voids || 0) + (rec?.pushes || 0)
  if (!rec || !total) return null
  if (rec.graded < MIN_LONG_SHOTS) return `${total} long shot${total === 1 ? '' : 's'} so far. Counts only until ${MIN_LONG_SHOTS} are graded.`
  return `${rec.hits} of ${rec.graded} long shots landed so far${rec.units ? `, ${rec.units.median >= 0 ? '+' : '−'}${Math.abs(rec.units.median).toFixed(1)} units at the median price` : ''}.`
}
const lsVerb = (row) => (row.result === 'hit' ? 'Landed' : row.result === 'miss' ? 'Missed' : 'Void (did not play)')
/** The next-day result: the pick, did it land, wins AND misses, and the record line. `row` is graded. */
export function longShotResultText({ sport, day, row, rec = null, hardLimit = 280 }) {
  if (!row || row.result == null || !CARD_WORDS[sport]) return { text: '', named: [] }
  const l = row.legs[0]
  const head = `\u{1F4CB} LONG SHOT OF THE DAY · ${HEAD[sport]} · ${prettyDay(day)} · result`
  for (const lines of [[head, `${l.name}: ${lsVerb(row)}.`, longShotRecordLine(rec)], [head, `${l.name}: ${lsVerb(row)}.`]]) {
    const t = lines.filter(Boolean).join('\n')
    if (fits(t, hardLimit)) return { text: t, named: [String(l.player_id)] }
  }
  return { text: '', named: [] }
}
/** The free Discord card for the Long Shot (the post's text, laid out). */
export function longShotEmbed({ sport, day, leg, at = null }) {
  const f = legPriceOf(leg)
  if (!CARD_WORDS[sport] || !leg?.name || !f) return null
  return buildCard({
    sport, title: `\u{1F3AF} Long shot of the day · ${HEAD[sport]} · ${dayWords(day)}`, description: `${CARD_WORDS[sport].market}, ${fmtAmerican(f.median)} median`,
    sections: [{ name: leg.name, lines: [`${leg.team || '?'} vs ${leg.opp || '?'}`, LONG_SHOT_NOTE], link: ledgerLink(sport, 'Every long shot, graded in the ledger') }], at: at || Date.now(),
  })
}
export function longShotResultEmbed({ sport, day, row, rec = null, at = null }) {
  const t = longShotResultText({ sport, day, row, rec })
  if (!t.text) return null
  return buildCard({ sport, title: `\u{1F4CB} Long shot of the day · ${HEAD[sport]} · ${dayWords(day)} · result`, description: CARD_WORDS[sport].market, sections: [{ name: row.legs[0].name, lines: [lsVerb(row), longShotRecordLine(rec)].filter(Boolean), link: ledgerLink(sport, 'Every long shot, graded in the ledger') }], at: at || Date.now() })
}

// ── THE DOUBLE (members ticket; free result) ─────────────────────────────────────────────────────────────────────────────
/** The Double's free result: the two names and what happened, wins and misses alike. `row` is graded. */
export function doubleResultText({ day, row, hardLimit = 280 }) {
  if (!row || row.result == null) return { text: '', named: [] }
  const [a, b] = row.legs
  const lr = row.leg_results || []
  const one = (l, i) => `${MARK[lr[i]?.result] || ''} ${l.name} (${HEAD[l.sport] || ''})`.trim()
  const t = [`\u{1F4CB} THE DOUBLE · ${prettyDay(day)} · result`, `${one(a, 0)}   ${one(b, 1)}`, row.result === 'hit' ? 'Both legs landed.' : row.result === 'void' ? 'Void (a player did not play).' : 'It missed: both legs had to land.'].join('\n')
  return fits(t, hardLimit) ? { text: t, named: [String(a.player_id), String(b.player_id)] } : { text: '', named: [] }
}
export function doubleResultEmbed({ day, row, at = null }) {
  const t = doubleResultText({ day, row })
  if (!t.text) return null
  const lr = row.leg_results || []
  return buildCard({
    sport: null, title: `\u{1F4CB} The Double · ${dayWords(day)} · result`, description: 'Two sports, both legs must land.',
    sections: [{ name: row.result === 'hit' ? 'Both legs landed' : row.result === 'void' ? 'Void' : 'Missed', lines: row.legs.map((l, i) => `${MARK[lr[i]?.result] || ''} ${l.name} (${HEAD[l.sport] || ''})`.trim()), link: ledgerLink('mlb', 'Every call, graded in the ledger') }], at: at || Date.now(),
  })
}

// ── THE DAY (#members) ───────────────────────────────────────────────────────────────────────────────────────────────────────
const DAY_NAMED = { nfl: true }      // football has several windows a week: its label carries the weekday (NFL Sunday)
const sportLabel = (sport, day) => `${HEAD[sport]}${DAY_NAMED[sport] ? ` ${WEEKDAY[new Date(`${day}T12:00:00Z`).getUTCDay()]}` : ''}`
/** The stake the day's rows put at risk, by product: { straights, twoMan, double, longShot, total }. Donovan's lane is his own and not in it. */
export function exposureOf(rows) {
  const out = { straights: 0, twoMan: 0, double: 0, longShot: 0, total: 0 }
  for (const r of rows || []) {
    if (r.lane !== 'bot') continue
    const k = r.product === 'straight' ? 'straights' : r.product === 'two_man' ? 'twoMan' : r.product === 'double' ? 'double' : r.product === 'long_shot' ? 'longShot' : null
    if (k) { out[k] += Number(r.stake) || 0; out.total += Number(r.stake) || 0 }
  }
  return out
}
/** "Today: NHL 3 + Two-Man, NFL Sunday 2 + Two-Man, the Double, 2 Long Shots: 8.5 units" for the rows given. */
export function exposureLine(rows, day) {
  const bot = (rows || []).filter((r) => r.lane === 'bot')
  const parts = []
  for (const sport of ['nhl', 'nfl', 'mlb']) {
    const rs = bot.filter((r) => r.sport === sport)
    const s = rs.filter((r) => r.product === 'straight').length
    const t = rs.some((r) => r.product === 'two_man')
    if (s || t) parts.push(`${sportLabel(sport, day)} ${[s ? `${s}` : null, t ? 'Two-Man' : null].filter(Boolean).join(' + ')}`)
  }
  if (bot.some((r) => r.product === 'double')) parts.push('the Double')
  const nls = bot.filter((r) => r.product === 'long_shot').length
  if (nls) parts.push(`${nls} Long Shot${nls === 1 ? '' : 's'}`)
  if (!parts.length) return null
  return `Today: ${parts.join(', ')}: ${units(exposureOf(bot).total)} units`
}
const dayPrice = (l, p) => { const f = legPriceOf(l) || (p ? { median: p.median ?? p.best } : null); return f?.median != null ? fmtAmerican(f.median) : 'no price yet' }

/**
 * THE DAY's sections and lines from the day's rows. `prices` = Map(`${sport}|${player_id}` -> newest stored anytime price) for legs with no frozen price.
 * `rows` = every row to show in THIS post (a follow-up passes only the newly locked ones, with `all` = the whole day for the exposure line).
 */
export function dayParts({ day, rows, all = null, prices = new Map() }) {
  const bot = (rows || []).filter((r) => r.lane === 'bot')
  const sections = []
  for (const sport of ['nhl', 'nfl', 'mlb']) {
    const rs = bot.filter((r) => r.sport === sport && (r.product === 'straight' || r.product === 'two_man'))
    if (!rs.length) continue
    const lines = []
    const sts = rs.filter((x) => x.product === 'straight').sort((a, b) => a.slot - b.slot)
    for (const r of sts) {
      const l = r.legs[0]
      lines.push(`${r.slot}. ${l.name} (${l.team || '?'} vs ${l.opp || '?'}) · ${legMarket(sport, l)} · ${statusWord(l)} · ${dayPrice(l, prices.get(`${sport}|${l.player_id}`))}`)
    }
    const two = rs.find((x) => x.product === 'two_man')
    if (two) lines.push(`Two-Man (${two.stake}u, ${twoManKind(two)}): ${two.legs[0].name} + ${two.legs[1].name}`)
    if (two?.rule === CARD_RULE.two_man_same_game) lines.push('*Same-game legs are correlated; the two prices multiplied overstates a real same-game price.*')
    sections.push({ name: `${sportLabel(sport, day)} · ${sts.length} straight${sts.length === 1 ? '' : 's'}${two ? ' + Two-Man' : ''}${slateWords(rs) ? ` · ${slateWords(rs)}` : ''}`, lines })
  }
  const dbl = bot.find((r) => r.product === 'double')
  const dd = (rows || []).find((r) => r.lane === 'donovan' && r.product === 'double')      // Donovan's own Double, free to show once ITS lock has passed
  if (dbl || dd) {
    const lines = []
    if (dbl) {
      const [a, b] = dbl.legs
      const both = rowPrice(dbl, dbl.legs.map((l) => legPriceOf(l)))
      lines.push(`${a.name} (${HEAD[a.sport] || ''}) + ${b.name} (${HEAD[b.sport] || ''})`, `${both ? `about ${fmtAmerican(both.median)} (the two prices multiplied; your book's price will differ)` : 'no price for both legs'}. Both must land.`)
    }
    if (dd) lines.push(`Inside Line Double: ${dd.legs.map((l) => `${l.name} (${HEAD[l.sport] || ''})`).join(' + ')}${dd.note ? ` · ${String(dd.note).replace(/\n/g, ' ')}` : ''}`)
    sections.push({ name: `The Double (${STAKE.double}u)`, lines })
  }
  const lss = bot.filter((r) => r.product === 'long_shot').sort((a, b) => String(a.sport).localeCompare(String(b.sport)))
  if (lss.length) sections.push({ name: `Long Shot${lss.length === 1 ? '' : 's'} of the day`, lines: [...lss.map((r) => `${HEAD[r.sport]}: ${r.legs[0].name} (${r.legs[0].team || '?'} vs ${r.legs[0].opp || '?'}), ${CARD_WORDS[r.sport].market} at ${fmtAmerican(legPriceOf(r.legs[0])?.median)}`), LONG_SHOT_NOTE] })
  return { sections, exposure: exposureLine(all || rows, day) }
}

/**
 * THE DAY as a Discord embed (#members only). `update` = a follow-up for windows that locked after the first post: it shows only the new cards
 * and the running exposure. The one ledger link sits on the last section.
 */
export function dayEmbed({ day, rows, all = null, prices = new Map(), update = false, at = null }) {
  const { sections, exposure } = dayParts({ day, rows, all, prices })
  if (!sections.length) return null
  const last = sections[sections.length - 1]
  last.link = ledgerLink((rows.find((r) => CARD_WORDS[r.sport]) || {}).sport || 'mlb', 'Every call, graded in the ledger')
  return buildCard({ sport: null, title: `\u{1F4C5} The Day${update ? ' (update)' : ''} · ${dayWords(day)}`, description: [exposure, 'Each Card is set before its own first game; nothing here is edited afterwards.'].filter(Boolean).join('\n'), sections, at: at || Date.now(), maxSections: 5 })
}
/** The plain text of THE DAY (the stored post text and the fallback when an embed cannot be sent). */
export function dayText({ day, rows, all = null, prices = new Map(), update = false }) {
  const { sections, exposure } = dayParts({ day, rows, all, prices })
  if (!sections.length) return ''
  return [`\u{1F4C5} THE DAY${update ? ' (update)' : ''} · ${prettyDay(day)}`, exposure, '', ...sections.flatMap((s) => [s.name, ...s.lines, ''])].filter((x) => x != null).join('\n').trim()
}

// ── THE FREE X LINE ──────────────────────────────────────────────────────────────────────────────────────────────────────────
/** "Today's Card: <lead straight>" naming ONLY the day's lead straight: no price, no why, no other leg. `lead` = { sport, leg }. */
export function todayText({ day, lead, hardLimit = 280 }) {
  const l = lead?.leg
  if (!l?.name || !CARD_WORDS[lead.sport]) return { text: '', named: [] }
  const t = `Today's Card · ${prettyDay(day)}: ${l.name} (${l.team || '?'} vs ${l.opp || '?'}), ${legMarket(lead.sport, l)}. ${HEAD[lead.sport]}.`
  return fits(t, hardLimit) ? { text: t, named: [String(l.player_id)] } : { text: '', named: [] }
}
/** The day's lead straights across the sports' Cards, best first: the highest board percentile, ties to the scorer slot, then the earlier game. */
export function dayLead(rowsBySport) {
  const leads = Object.entries(rowsBySport || {}).map(([sport, rows]) => ({ sport, row: leadStraight(rows) })).filter((x) => x.row)
  const pct = (x) => (Number.isFinite(x.row.legs[0].board_pct) ? x.row.legs[0].board_pct : -Infinity)
  leads.sort((a, b) => (pct(b) - pct(a)) || (a.row.slot - b.row.slot) || (Date.parse(a.row.legs[0].start_at) - Date.parse(b.row.legs[0].start_at)) || a.sport.localeCompare(b.sport))
  return leads.map((x) => ({ sport: x.sport, leg: x.row.legs[0] }))
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
/** A volume pick's frozen price as a line: the line it is graded against and the median price at the lock. */
const frozenLine = (l) => { const f = legPriceOf(l); return f ? `over ${l.line} at ${fmtAmerican(f.median)} median${l.price?.books ? ` across ${l.price.books} books` : ''}` : 'no price on file yet' }
/** NHL's stored why line is "shots Nth · goals Nth · ice time Nth percentile tonight": percentiles among tonight's skaters (lib/nhl/goalModel.js). Anything else is printed as stored. */
const WHY_SHAPE = { nhl: /^shots (\S+) · goals (\S+) · ice time (\S+) percentile tonight$/ }   // the sports whose stored why line is a percentile line we can name the set of
const RULE_NOTE = { nfl: ' (CALLED or ON THE BOARD)' }   // football keeps ON THE BOARD eligibility
const whyWords = (sport, why) => {
  if (!why) return null
  const m = WHY_SHAPE[sport]?.exec(why) || null
  return m ? `Among tonight's skaters: shots ${m[1]}, goals ${m[2]}, ice time ${m[3]} percentile` : why
}
// the approved line, with the number of straights the slate earned and, only when the card has one, the sentence for a shots / yards / hits pick
const RULE_LINE = (sport, n, volume) => `*Top ${n} by ${BRAND[sport].name} ranking score${RULE_NOTE[sport] || ''}, one per game.${volume ? ' A shots, yards or hits pick is an over at its stored line, ranked on its own board.' : ''} Both Two-Man legs must land; a player who does not play voids it.*`

/**
 * THE #MEMBERS CARD as an embed, in the approved copy (Donovan 2026-10-10): one field per straight ("1. Player": club vs opponent and the
 * status word, the market with its stored line and price, the why), one for the bot's Two-Man, then one italic rule line and the ledger link.
 * Goes through lib/dash/membersPost.js postMembers only. null when there is no card.
 */
export function membersCardEmbed({ sport, day, rows, prices = new Map(), at = null }) {
  const w = CARD_WORDS[sport]
  const straights = (rows || []).filter((r) => r.lane === 'bot' && r.product === 'straight').sort((a, b) => a.slot - b.slot)
  const two = (rows || []).find((r) => r.lane === 'bot' && r.product === 'two_man') || null
  if (!w || !straights.length) return null
  const sections = straights.map((r) => {
    const l = r.legs[0]
    const volume = l.market && l.market !== 'anytime' && Number.isFinite(l.line)
    return { name: `${r.slot}. ${l.name || l.player_id}`, lines: [`${l.team || '?'} vs ${l.opp || '?'} · **${statusWord(l)}**${volume ? ` · ${legMarket(sport, l)}` : ''}`, volume ? frozenLine(l) : priceLine(prices.get(String(l.player_id))), whyWords(sport, l.why)] }
  })
  if (two) {
    const [a, b] = two.legs
    const both = rowPrice(two, [prices.get(String(a.player_id)), prices.get(String(b.player_id))])
    sections.push({ name: `Two-Man (${two.stake} unit)`, lines: [
      `${a.name} + ${b.name}, ${twoManKind(two)}`,
      both ? `about ${fmtAmerican(both.best)} best (the two prices multiplied; your book's parlay price will differ)` : 'no price on file for both legs yet',
      ...(two.rule === CARD_RULE.two_man_same_game ? [`*${SAME_GAME_NOTE}*`] : []),
    ] })
  }
  const last = sections[sections.length - 1]
  const volume = straights.some((r) => r.legs[0].market && r.legs[0].market !== 'anytime')
  last.lines = [...last.lines, RULE_LINE(sport, straights.length, volume)]
  last.link = ledgerLink(sport, 'Full rules in the ledger')
  // the approved line: the market, the unit, "set before the first game" (a card with shots / yards / hits picks names each market)
  const markets = [...new Set(straights.map((r) => legMarket(sport, { market: r.legs[0].market })))]
  return buildCard({ sport, title: `\u{1F3AF} The Card · ${HEAD[sport]} · ${dayWords(day)}`, description: `${markets.join(' and ')}, ${STAKE.straight} unit each. Picks are set before the first game.`, sections, at: at || Date.now() })
}

/**
 * THE FREE RESULT as an embed. Names appear only for the rows resultText's own free text names (its `named`), so the card never
 * says more than the public text would. null when resultText says there is nothing to post.
 */
export function resultEmbed({ sport, day, rows, at = null }) {
  const t = resultText({ sport, day, rows })
  if (!t.text) return null
  const all = (rows || []).filter((r) => r.product !== 'long_shot' && r.product !== 'double')
  const named = new Set(t.named)
  const showable = (r) => r.legs.every((l) => named.has(String(l.player_id)))
  const straights = all.filter((r) => r.lane === 'bot' && r.product === 'straight').sort((a, b) => a.slot - b.slot)
  const two = all.find((r) => r.lane === 'bot' && r.product === 'two_man')
  const don = all.find((r) => r.lane === 'donovan')
  const graded = straights.filter((r) => r.result === 'hit' || r.result === 'miss')
  const hits = graded.filter((r) => r.result === 'hit').length
  const voids = straights.filter((r) => r.result === 'void').length
  const pushes = straights.filter((r) => r.result === 'push').length
  const sections = []
  if (straights.length) sections.push({ name: 'Straights', lines: [`${graded.length ? `${hits} of ${graded.length} hit` : 'none graded'}${voids ? ` (${voids} void)` : ''}${pushes ? ` (${pushes} pushed)` : ''}`, ...straights.filter(showable).map((r) => `${MARK[r.result]} ${r.legs[0].name}`)] })
  if (two) sections.push({ name: 'Two-Man', lines: [`${showable(two) ? `${two.legs[0].name} + ${two.legs[1].name}, ` : ''}${words[two.result]}`] })
  if (don) sections.push({ name: "Inside Line Two-Man", lines: [`${showable(don) ? `${don.legs[0].name} + ${don.legs[1].name}, ` : ''}${words[don.result]}`] })
  const last = sections[sections.length - 1]
  last.lines = [...last.lines, `*${CARD_RULE_TEXT.grade}*`]
  last.link = ledgerLink(sport, 'Full record in the ledger.')
  return buildCard({ sport, title: `\u{1F4CB} The Card · ${HEAD[sport]} · ${dayWords(day)} · results`, description: CARD_WORDS[sport].market, sections, at: at || Date.now() })
}
