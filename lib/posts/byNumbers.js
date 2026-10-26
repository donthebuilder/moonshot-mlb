// TONIGHT'S CALLS, BY THE NUMBERS (2026-10-21). Donovan, of a roster-only version (two Bryan Hudsons, both #60, neither playing): "a cute post but
// not helpful". So this one STARTS FROM TONIGHT'S BOARD (claude/BATCH-BY-THE-NUMBERS-PLAN-2026-10-21.txt):
//   - only men in today's games, read off the boards the site already computes (LAMP lib/nhl/boardRead.js, BUCKETS lib/nba/boardRead.js), with
//     THE SLATE's rules: a LAMP game counts once its lock is written, a BUCKETS game while it is still ahead, a man listed out never;
//   - a pattern counts only when it lands on men we have a read on (CALLED or ON THE BOARD), at least one of them CALLED;
//   - every man in it carries that read: the board's word, his place, his per-game stat;
//   - nothing qualifies, nothing posts. FOR FUN: never a pick of its own, never in a score. (Measured Oct 21 over 5,043 rostered men: a jersey
//     root equals the life path 11.0% of the time against 11.1% by chance, and a name's gematria equals his jersey exactly as often as shuffled
//     jerseys do. So the post never claims a number means anything: it says what lines up, and the call is the point.)
//
// TODAY'S NUMBERS FIRST (Donovan, 2026-10-24: "make sure it correlates with the actual day of today ... what's the numbers for today, the
// numerological day, and how they align with that"). The post opens on the date's own numbers (lib/numerology: the Universal Day and its chain,
// the date, month + day, the full and the short date) and lists tonight's CALLED men who line up with them: the number on his back IS one of
// today's numbers, or reduces to the day's number, he plays on his birthday, he was born on today's date, or his life path is the day's number
// (dayFinds / pickDay / dayLine). The old pairs below are kept (their tests stand) but no longer post.
//
// WHAT IT FOUND BEFORE 10-24, best first:
//   birthday   a CALLED man playing on his birthday
//   duel       two men in one game wearing the same number, one CALLED at least (the card's hero)
//   twins      two CALLED men, any sports, born the same day of the year (the hero when no duel)
//   name       a man on tonight's board whose full name another player wears (another league, or another club): lib/data/nameTwins.js,
//              written by scripts/refresh-name-twins.mjs from every roster in all four leagues (Donovan, Oct 21: "same name other leagues ...
//              if applicable that day")
//   numbers    two CALLED men tonight wearing the same number, in different games (two sports beats one)
//   date       a CALLED man born on tonight's day of the month
// The hero is the best pair (a duel, else twins, else numbers); then up to three rows, no man twice. A post needs the hero and one row.
//
//   WHEN   any day with games, from LEAD_MS before the night's first start; while LAMP's first game is still to lock it waits, until
//          NHL_LAST_MS before that game (then posts without the unlocked games). Once a day: homer_feed_posts kind by_numbers.
//   WHERE  X and the free feed channel. Undo: BY_NUMBERS_OFF=on.
import { BRAND } from '../routes'
import { ordinal } from '../format'
import { HARD_LIMIT } from '../dash/postLimit'
import { xLen } from './slate'
import { admit, logPosted } from '../dash/xGate'
import { recordPost } from '../dash/xPostLog'
import { hasX, postToDiscord, postToX, uploadImageToX } from '../dash/xPost'
import { knownTaken, markTaken, unmarkTaken } from '../dash/postClaim'
import { mayRetryPost } from '../dash/xFail'
import { nhlGameLocked } from './nhl'
import { nbaTeam } from '../nba/teams'
import { nhlTeam } from '../nhl/teams'
import { nameWords } from '../numerology/gematria'
import { NAME_TWINS } from '../data/nameTwins'
import { universal, dateNumbers, digitRoot, lifePathOf } from '../numerology/core'
import { chain } from '../numerology/dayNumbers'

export const NUM_KIND = 'by_numbers'
export const LEAD_MS = 75 * 60e3         // from 75 minutes before the night's first start (BUCKETS' board is set by then)
export const NHL_LAST_MS = 30 * 60e3     // stop waiting for LAMP's first lock 30 minutes before that puck drop
export const numbersOff = () => /^(on|1|true)$/i.test(String(process.env.BY_NUMBERS_OFF || '').trim())

const txt = (v) => String(v == null ? '' : v).trim()
const num = (v) => { if (v == null || v === '') return null; const n = Number(v); return Number.isFinite(n) ? n : null }
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const isDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(txt(d))
const md = (d) => (isDate(d) ? txt(d).slice(5, 10) : null)
const dom = (d) => (isDate(d) ? Number(txt(d).slice(8, 10)) : null)
/** "10-30" -> "Oct 30". */
export const mdWords = (d) => { const m = md(d); return m ? `${MON[Number(m.slice(0, 2)) - 1]} ${Number(m.slice(3, 5))}` : '' }
const place = (m) => (m.rank > 0 && m.of > 0 ? `#${m.rank} of ${m.of}` : '')

// ── THE MEN: one shape for both boards ─────────────────────────────────────────────────────────────────────────
// { sport, id, name, team, game, gameWords, startMs, status, rank, of, stat, short, number, birthDate }
// `rosters` = Map `${sport}:${id}` -> { number, birthDate } (readRosters below). A man with no roster entry keeps nulls: he can still be in a
// pattern that does not need the missing field, never one that does.

/** BUCKETS' points board -> men. Regular-season games still ahead; a man listed out is left out. Pure. */
export function nbaMen({ board = null, rosters = new Map(), now = Date.now() } = {}) {
  const games = new Map((board?.games || []).filter((g) => g && g.seasonType === 2 && g.state === 'pre' && Date.parse(g.start) > now).map((g) => [String(g.id), g]))
  const out = []
  for (const r of board?.rows || []) {
    const g = games.get(String(r.gameId))
    if (!g || (r.status !== 'called' && r.status !== 'board') || /\bout\b/i.test(txt(r.injury))) continue
    const id = txt(r.playerId)
    if (!id || !txt(r.name)) continue
    const pts = num(r?.legs?.ptsPg)
    const ro = rosters.get(`nba:${id}`) || {}
    const where = (a) => (nbaTeam(a)?.place || a).toUpperCase()
    out.push({
      sport: 'nba', id, name: txt(r.name), team: txt(r.team), game: `nba:${g.id}`, gameWords: `${where(g.away.abbrev)} @ ${where(g.home.abbrev)}`, startMs: Date.parse(g.start),
      status: r.status, rank: num(r.nightRank), of: num(r.nightOf),
      stat: pts > 0 ? `${pts.toFixed(1)} points a game` : '', short: pts > 0 ? `${pts.toFixed(1)} PTS/G` : '',
      number: ro.number ?? null, birthDate: ro.birthDate ?? null,
    })
  }
  return out
}

/** LAMP's goal board -> men. Only games whose lock is written (a preview is not a call), still ahead. Pure. */
export function nhlMen({ games = [], rosters = new Map(), now = Date.now() } = {}) {
  const out = []
  for (const g of games || []) {
    if (!g?.game || (g.game.scheduleState != null && g.game.scheduleState !== 'OK')) continue
    const startMs = Date.parse(g.game.startUtc)
    if (!nhlGameLocked(g) || g.game.state !== 'pre' || !(startMs > now)) continue
    const where = (a) => (nhlTeam(a)?.place || a).toUpperCase()
    for (const r of g.rows || []) {
      if (r.preview || (r.status !== 'called' && r.status !== 'board')) continue
      const id = txt(r.playerId)
      if (!id || !txt(r.name)) continue
      const s = r.szn || {}
      const line = num(s.gp) > 0 && num(s.g) != null ? `${s.g} goals in ${s.gp} games` : ''
      const ro = rosters.get(`nhl:${id}`) || {}
      out.push({
        sport: 'nhl', id, name: txt(r.name), team: txt(r.team), game: `nhl:${g.game.id}`, gameWords: `${where(g.game.away?.abbrev)} @ ${where(g.game.home?.abbrev)}`, startMs,
        status: r.status, rank: num(r.context?.nightRank), of: num(r.context?.nightOf),
        stat: line, short: line ? `${s.g} G in ${s.gp} GP` : '',
        number: ro.number ?? null, birthDate: ro.birthDate ?? null,
      })
    }
  }
  return out
}

// ── THE FINDER (pure) ──────────────────────────────────────────────────────────────────────────────────────────
const share = (m) => (m.rank > 0 && m.of > 0 ? m.rank / m.of : 1)
const calledN = (men) => men.filter((m) => m.status === 'called').length
const keyOf = (m) => `${m.sport}:${m.id}`
const PRI = { birthday: 0, name: 1, twins: 2, duel: 3, numbers: 4, date: 5 }
const LEAGUE = { mlb: 'MLB', nfl: 'NFL', nhl: 'NHL', nba: 'NBA' }
export const nameKeyOf = (name) => nameWords(name).join(' ')
/** The twins list as a Map key -> [{ sport, team, club, number, pos }]. */
export const twinsMap = (list = NAME_TWINS) => new Map((list?.twins || []).map((t) => [t.key, t.list]))

/** Every pattern on tonight's men: [{ type, men, score }] (lower score = better). `day` = the slate date. Pure. */
export function findNumbers(men, { day, twins = twinsMap() } = {}) {
  const ok = (men || []).filter((m) => m && m.name && (m.status === 'called' || m.status === 'board'))
  const called = ok.filter((m) => m.status === 'called')
  const out = []
  const today = md(day), d = dom(day)
  for (const m of called) {
    if (today && md(m.birthDate) === today) out.push({ type: 'birthday', men: [m], score: share(m) })
    else if (d && dom(m.birthDate) === d) out.push({ type: 'date', men: [m], score: share(m) })
  }
  // same number, same game, two clubs, one CALLED at least
  const byNum = new Map()
  for (const m of ok) {
    if (m.number == null || !Number.isInteger(m.number) || m.number < 0 || m.number > 99) continue
    const k = `${m.game}#${m.number}`
    if (!byNum.has(k)) byNum.set(k, [])
    byNum.get(k).push(m)
  }
  for (const list of byNum.values()) {
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j]
      if (a.team === b.team || !calledN([a, b])) continue
      // the CALLED man first, then the better place
      out.push({ type: 'duel', men: [a, b].sort((x, y) => (y.status === 'called') - (x.status === 'called') || share(x) - share(y)), score: share(a) + share(b) - calledN([a, b]) })
    }
  }
  // two CALLED men, two clubs, the same birthday (any year); two sports beats one
  for (let i = 0; i < called.length; i++) for (let j = i + 1; j < called.length; j++) {
    const a = called[i], b = called[j]
    if (a.team === b.team || !md(a.birthDate) || md(a.birthDate) !== md(b.birthDate)) continue
    out.push({ type: 'twins', men: [a, b].sort((x, y) => share(x) - share(y)), score: share(a) + share(b) - (a.sport !== b.sport ? 0.5 : 0) - 2 })
  }
  // two CALLED men in different games wearing the same number
  for (let i = 0; i < called.length; i++) for (let j = i + 1; j < called.length; j++) {
    const a = called[i], b = called[j]
    if (a.game === b.game || a.number == null || a.number !== b.number || !Number.isInteger(a.number)) continue
    out.push({ type: 'numbers', men: [a, b].sort((x, y) => share(x) - share(y)), score: share(a) + share(b) - (a.sport !== b.sport ? 0.5 : 0) - 1.5 })
  }
  // a man on tonight's board whose full name another player wears
  for (const m of ok) {
    const list = twins.get(nameKeyOf(m.name))
    const other = (list || []).find((x) => !(x.sport === m.sport && x.team === m.team))
    if (other) out.push({ type: 'name', men: [m], other, score: share(m) - (m.status === 'called' ? 1 : 0) })
  }
  return out.sort((x, y) => x.score - y.score)
}

// ── TODAY'S NUMBERS (2026-10-24) ────────────────────────────────────────────────────────────────────────────────
const DAY_PRI = { day_exact: 0, birthday: 1, day_root: 2, date: 3, path: 4 }
const WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const anOf = (n) => (n === 8 || n === 11 || n === 18 ? 'an' : 'a')

/**
 * The date's numbers a jersey can match: { udRoot, udChain: [17, 8], list: [{ n, label }] } (numbers 0..99, each once, best label first). Pure.
 * 10/24/2026 -> Universal Day 17 -> 8; the date 24; month + day 34; full date 44 (10 + 24 + 2+0+2+6); short date 60 (10 + 24 + 26).
 */
export function todayNumbers(day) {
  const u = universal(day); const dn = dateNumbers(day)
  if (!u || !dn) return null
  // the Universal Day from its raw digit total, so the post can show how it is made: 1+0+2+4+2+0+2+6 = 17 -> 8
  const [y, mo, dd] = txt(day).split('-')
  const digits = `${mo}${dd}${y}`.split('').map(Number)      // in the order the date is written, month / day / year
  const udChain = chain(digits.reduce((a, b) => a + b, 0))
  const udRoot = u.day.root
  const list = []
  const add = (n, label) => { if (Number.isInteger(n) && n >= 0 && n <= 99 && !list.some((x) => x.n === n)) list.push({ n, label }) }
  add(udRoot, "today's number")
  for (const n of udChain) add(n, `${udChain.join(' → ')}, today's number`)
  add(dom(day), "today's date")
  add(dn.md, 'month + day')
  add(dn.full, 'the full date')
  add(dn.short, 'the short date')
  return { udRoot, udChain, digits, list }
}

/** Tonight's CALLED men who line up with today's numbers: [{ type, men: [m], label, score }], best first, each man once. Pure. */
export function dayFinds(men, { day } = {}) {
  const t = todayNumbers(day)
  if (!t) return []
  const today = md(day), d = dom(day)
  const out = []
  for (const m of (men || []).filter((x) => x && x.name && x.status === 'called')) {
    const j = Number.isInteger(m.number) ? m.number : null
    const exact = j != null ? t.list.find((x) => x.n === j) : null
    let f = null
    if (exact) f = { type: 'day_exact', label: exact.label }
    else if (today && md(m.birthDate) === today) f = { type: 'birthday' }
    else if (j != null && j > 9 && digitRoot(j) === t.udRoot) f = { type: 'day_root', label: `${chain(j).join(' → ')}, today's number` }
    else if (d && dom(m.birthDate) === d) f = { type: 'date' }
    else if (m.birthDate && lifePathOf(m.birthDate) === t.udRoot) f = { type: 'path', label: `life path ${t.udRoot}, today's number` }
    if (f) out.push({ ...f, men: [m], score: share(m) })
  }
  return out.sort((a, b) => DAY_PRI[a.type] - DAY_PRI[b.type] || a.score - b.score)
}

/** The day's post: { day, numbers, rows } with up to `rows` finds, or null when nobody lines up. Pure. */
export function pickDay(finds, { day, rows = 5 } = {}) {
  const numbers = todayNumbers(day)
  return numbers && finds?.length ? { day, numbers, rows: finds.slice(0, rows) } : null
}

/** One man as a line: "🏀 Anthony Edwards (MIN) · #8, today's number". Pure. */
export function dayLine(f) {
  const m = f.men[0]
  const who = `${BRAND[m.sport]?.icon || ''} ${m.name}${m.team ? ` (${m.team})` : ''}`.trim()
  if (f.type === 'day_exact' || f.type === 'day_root') return `${who} · #${m.number}: ${f.label}`
  if (f.type === 'birthday') return `${who} · plays on his birthday tonight`
  if (f.type === 'date') return `${who} · born on the ${ordinal(dom(m.birthDate))}, today's date`
  return `${who} · ${f.label}`
}

/** "Sat Oct 24" from "2026-10-24". */
const dayWords = (day) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(txt(day)); if (!m) return ''; const dt = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])); return `${WEEK[dt.getUTCDay()]} ${MON[+m[2] - 1]} ${+m[3]}` }

/** The hero (best duel, else best twins) and up to `rows` more, no man twice: { hero, rows } or null. Pure. */
export function pickNumbers(finds, { rows = 3 } = {}) {
  const used = new Set()
  const free = (f) => f.men.every((m) => !used.has(keyOf(m)))
  const take = (f) => { f.men.forEach((m) => used.add(keyOf(m))); return f }
  const hero = (finds || []).find((f) => f.type === 'duel') || (finds || []).find((f) => f.type === 'twins') || (finds || []).find((f) => f.type === 'numbers')
  if (!hero) return null
  take(hero)
  // one of each kind first (best kind first), then the best of what is left: a card of four different things, not three of one
  const rest = []
  const sorted = (finds || []).slice().sort((a, b) => PRI[a.type] - PRI[b.type] || a.score - b.score)
  for (const type of Object.keys(PRI)) {
    if (rest.length >= rows) break
    const f = sorted.find((x) => x.type === type && x !== hero && free(x))
    if (f) rest.push(take(f))
  }
  for (const f of sorted) {
    if (rest.length >= rows) break
    if (f !== hero && free(f)) rest.push(take(f))
  }
  rest.sort((a, b) => PRI[a.type] - PRI[b.type] || a.score - b.score)
  return rest.length ? { hero, rows: rest } : null
}

// ── THE POST (pure) ────────────────────────────────────────────────────────────────────────────────────────────
const SURFACE = { nba: 'floor', nhl: 'ice', nfl: 'field', mlb: 'field' }   // the word in 'same ___', by sport
const surface = (m) => SURFACE[m.sport] || 'floor'
/** One find as a sentence. */
export function numbersLine(f) {
  const [a, b] = f.men
  if (f.type === 'duel') {
    const head = `${a.name} #${a.number} vs ${b.name} #${b.number}, same ${surface(a)}.`
    if (calledN(f.men) === 2) return `${head} We called both.`
    const c = a.status === 'called' ? a : b
    return `${head} We called ${c.name}${place(c) ? `: ${place(c)} tonight` : ''}.`
  }
  if (f.type === 'twins') return `${a.name} and ${b.name}: both CALLED tonight, both born ${mdWords(a.birthDate)}.`
  if (f.type === 'numbers') return `${a.name} and ${b.name} both wear #${a.number}, and we called both tonight.`
  if (f.type === 'name') {
    const o = f.other
    const read = a.status === 'called' ? `CALLED tonight${place(a) ? `, ${place(a)}` : ''}` : `on the board tonight${place(a) ? `, ${place(a)}` : ''}`
    const where = o.sport === a.sport ? `the ${o.club}` : `the ${LEAGUE[o.sport]}, ${o.club}`
    return `${a.name}: ${read}. There's another ${a.name} in ${where}${o.number != null ? `, #${o.number}` : ''}.`
  }
  if (f.type === 'birthday') return `${a.name} plays on his birthday tonight. CALLED${place(a) ? `, ${place(a)}` : ''}.`
  const o = ordinal(dom(a.birthDate))
  return `${a.name} was born on the ${o}. Tonight's the ${o}. CALLED${place(a) ? `, ${place(a)}` : ''}.`
}

/** The post: head, the hero, the rows, the ask; rows drop from the end to fit; '' without the hero and one row. Pure. */
export const DISCORD_LIMIT = 1800   // under Discord's 2000
export function numbersText(pick, { limit = HARD_LIMIT } = {}) {
  if (pick?.numbers) {
    // TODAY'S NUMBERS (2026-10-24): the day's number, the date's numbers, then the calls that line up
    const { day, numbers: t } = pick
    const head = `\u{1F522} Today's numbers · ${dayWords(day)}`
    // Donovan 2026-10-24: "just put today's an 8 [day] and then today's numbers", no sum
    const made = `Today is ${anOf(t.udRoot)} ${t.udRoot} day.`
    const all = `Today's numbers: ${t.list.map((x) => x.n).join(' · ')}`
    const ask = 'Which number cashes, network?'
    for (let n = pick.rows.length; n >= 1; n--) {
      const tx = [head, '', made, all, '', "Tonight's calls that line up:", ...pick.rows.slice(0, n).map(dayLine), '', ask].join('\n')
      if (xLen(tx) <= limit) return tx
    }
    return ''
  }
  if (!pick?.hero || !pick.rows?.length) return ''
  const head = "\u{1F522} Tonight's calls, by the numbers"
  const ask = 'Which call cashes, network?'
  for (let n = pick.rows.length; n >= 1; n--) {
    const t = [head, '', numbersLine(pick.hero), '', ...pick.rows.slice(0, n).flatMap((f) => [numbersLine(f), '']), ask].join('\n')
    if (xLen(t) <= limit) return t
  }
  return ''
}

// ── THE CARD (lib/cards/byNumbersCard.js) ──────────────────────────────────────────────────────────────────────
const UP = (s) => txt(s).toUpperCase()
const CLUB_NICK = { nba: (t) => nbaTeam(t)?.nick, nhl: (t) => nhlTeam(t)?.nickname }   // the club's nickname on the card, by sport
const lastOf = (n) => txt(n).split(/\s+/).slice(1).join(' ') || txt(n)
/** The card's words for a pick (faces and logos are added by numbersPicture). Each row: kicker, title, a badge (the number or date the row is
 *  about), and its men, each with his own read line. Pure. */
export function numbersCardWords(pick, { day } = {}) {
  if (pick?.numbers) {
    // TODAY'S NUMBERS: the head is the day's number, the pair is the two best-aligned men, the rows the next three
    const t = pick.numbers
    const read = (x) => [place(x).toUpperCase(), UP(x.short)].filter(Boolean).join(' · ')
    const rows = pick.rows.slice(2, 5).map((f) => {
      const a = f.men[0]
      const badge = f.type === 'day_exact' || f.type === 'day_root' ? { big: `#${a.number}`, small: f.type === 'day_root' ? `${chain(a.number).join(' → ')}` : 'TODAY' }   // short: the badge is narrow
        : f.type === 'path' ? { big: String(t.udRoot), small: 'LIFE PATH' } : { big: UP(mdWords(a.birthDate)), small: f.type === 'birthday' ? 'BIRTHDAY' : 'BORN ON' }
      return { title: UP(a.name), kicker: UP(dayLine(f).split(' · ').slice(1).join(' · ')), badge, men: [{ ...a, line: read(a) }] }
    })
    return { head: `TODAY IS ${UP(anOf(t.udRoot))} ${t.udRoot} DAY`, sub: `TODAY'S NUMBERS ${t.list.map((x) => x.n).join(' · ')}`, rows, asOf: UP(mdWords(pick.day || day)) }
  }
  const h = pick.hero
  const [h0] = h.men
  const head = h.type === 'duel' ? `SAME NUMBER. SAME ${UP(surface(h0))}.` : h.type === 'twins' ? 'SAME BIRTHDAY. BOTH CALLED.' : 'SAME NUMBER. BOTH CALLED.'
  const brands = (men) => [...new Set(men.map((m) => BRAND[m.sport]?.name || ''))].filter(Boolean).join(' + ')
  const sub = h.type === 'duel' ? `${h0.gameWords} · TONIGHT` : h.type === 'twins' ? `BORN ${UP(mdWords(h0.birthDate))} · ${brands(h.men)}` : `#${h0.number} · ${brands(h.men)} · TONIGHT`
  const read = (m) => [place(m).toUpperCase(), UP(m.short)].filter(Boolean).join(' · ')
  const man = (m) => ({ ...m, line: read(m) })
  const names = (f) => (f.men.length === 1 ? UP(f.men[0].name) : f.men.map((m) => UP(lastOf(m.name))).join(' & '))
  const rows = pick.rows.map((f) => {
    const [a] = f.men
    const base = { title: names(f), men: f.men.map(man) }
    if (f.type === 'birthday') return { ...base, kicker: 'BIRTHDAY GAME', badge: { big: UP(mdWords(a.birthDate)), small: 'BIRTHDAY' } }
    if (f.type === 'date') { const o = UP(ordinal(dom(a.birthDate))); return { ...base, kicker: `BORN ON THE ${o}, PLAYS ON THE ${o}`, badge: { big: o, small: 'BORN ON' } } }
    if (f.type === 'twins') return { ...base, kicker: 'BIRTHDAY TWINS', badge: { big: UP(mdWords(a.birthDate)), small: 'BOTH BORN' } }
    if (f.type === 'numbers') return { ...base, kicker: 'SAME NUMBER, BOTH CALLED', badge: { big: `#${a.number}`, small: 'BOTH WEAR' } }
    if (f.type === 'name') { const o = f.other; return { ...base, kicker: `SAME NAME, ${o.sport === a.sport ? 'TWO CLUBS' : 'TWO LEAGUES'}`, badge: { big: LEAGUE[o.sport], small: o.number != null ? `THE OTHER #${o.number}` : 'THE OTHER ONE' } } }
    return { ...base, kicker: `SAME NUMBER, SAME ${UP(surface(a))}`, badge: { big: `#${a.number}`, small: 'SAME GAME' } }
  })
  return { head, sub, rows, asOf: UP(mdWords(day)) }
}

const withTimeout = (p, ms) => { let t; return Promise.race([p, new Promise((res) => { t = setTimeout(() => res(null), ms) })]).finally(() => clearTimeout(t)) }
/** THE PICTURE: PNG bytes or null (never throws; 25 seconds at most). `draw` / `face` / `logo` injectable for the tests. */
export async function numbersPicture({ pick, day, draw = null, face = null, logo = null, timeoutMs = 25000 }) {
  try {
    const render = draw || (await import('../cards/byNumbersCard')).renderByNumbers
    const faceOf = face || (await import('../cards/faceOf')).faceOf
    const logoFor = logo || (await import('../cards/adapters/common')).logoFor
    // the rows' logos sit on a light plate: the club's regular mark there (the dark-card mark is white for some clubs)
    const plateFor = logo || (await import('../cards/adapters/common')).plateLogoFor
    return await withTimeout((async () => {
      const look = async (m) => { const [pic, lg] = await Promise.all([faceOf(m.sport, m.id), logoFor(m.sport, m.team).catch(() => ({ src: '', plate: false }))]); return { face: pic, logo: lg?.src || '', logoPlate: Boolean(lg?.plate), team: m.team, name: m.name } }
      const club = (m) => CLUB_NICK[m.sport]?.(m.team) || m.team
      const w = numbersCardWords(pick, { day })
      const pair = pick.numbers ? pick.rows.slice(0, 2).map((f) => f.men[0]) : pick.hero.men      // TODAY'S NUMBERS: the two best-aligned men
      if (pair.length < 2) return null                                                               // one man lines up: the post goes as text
      const duel = await Promise.all(pair.map(async (m) => ({
        sport: m.sport, brand: BRAND[m.sport]?.name || '', club: club(m), number: m.number ?? '', status: m.status,
        place: place(m).toUpperCase(), stat: m.stat, ...(await look(m)),
      })))
      const onPlate = async (m) => { const [base, pl] = await Promise.all([look(m), plateFor(m.sport, m.team).catch(() => ({ src: '' }))]); return { ...base, logo: pl?.src || base.logo } }
      const rows = await Promise.all(w.rows.map(async (r) => ({ ...r, men: await Promise.all(r.men.map(async (m) => ({ ...(await onPlate(m)), sport: m.sport, status: m.status, line: m.line }))) })))
      return render({ duel, rows, head: w.head, sub: w.sub, asOf: w.asOf })
    })(), timeoutMs)
  } catch (e) { console.error(`[numbers] picture failed: ${e?.message || e}`); return null }
}

// ── TIMING (pure) ──────────────────────────────────────────────────────────────────────────────────────────────
/**
 * Post now, or wait: { go, reason }. `nhlGames` = LAMP's board games, `nbaBoard` = BUCKETS' board, `men` = both boards' men, `now` = ms.
 * Waits until LEAD_MS before the night's first start; waits for LAMP's first lock until NHL_LAST_MS before its first puck drop.
 */
export function numbersTiming({ nhlGames = [], nbaBoard = null, now = Date.now() }) {
  const nbaStarts = (nbaBoard?.games || []).filter((g) => g && g.seasonType === 2 && g.state === 'pre').map((g) => Date.parse(g.start))
  const nhlList = (nhlGames || []).filter((g) => g?.game && g.game.state === 'pre')
  const nhlStarts = nhlList.map((g) => Date.parse(g.game.startUtc))
  const starts = [...nbaStarts, ...nhlStarts].filter((t) => Number.isFinite(t) && t > now)
  if (!starts.length) return { go: false, reason: 'no games still ahead', next: now + 3 * 3600e3 }
  const first = Math.min(...starts)
  if (now < first - LEAD_MS) return { go: false, reason: 'too early', next: first - LEAD_MS }
  const nhlFirst = nhlStarts.filter((t) => t > now).sort((a, b) => a - b)[0]
  const nhlFirstGame = nhlList.find((g) => Date.parse(g.game.startUtc) === nhlFirst)
  if (nhlFirstGame && !nhlGameLocked(nhlFirstGame) && now < nhlFirst - NHL_LAST_MS) return { go: false, reason: 'waiting for LAMP to lock', next: now + RETRY_MS }
  return { go: true, reason: 'ready' }
}

// ── THE READS (impure) ─────────────────────────────────────────────────────────────────────────────────────────
/** Jerseys and birthdays for tonight's clubs only: Map `${sport}:${id}` -> { number, birthDate }. A club that fails is left out (logged). */
export async function readRosters({ nbaBoard = null, nhlGames = [] } = {}) {
  const out = new Map()
  const nbaApi = await import('../nba/api')
  const nhlApi = await import('../nhl/api')
  const { reduceRoster } = await import('../nhl/reduce')
  const nbaClubs = new Set((nbaBoard?.games || []).flatMap((g) => [g.away?.id, g.home?.id]).filter(Boolean).map(String))
  const nhlClubs = new Set((nhlGames || []).flatMap((g) => [g.game?.away?.abbrev, g.game?.home?.abbrev]).filter(Boolean))
  await Promise.all([
    ...[...nbaClubs].map(async (id) => {
      try {
        for (const a of (await nbaApi.rosterFor(id))?.athletes || []) {
          const j = num(a.jersey)
          out.set(`nba:${a.id}`, { number: Number.isInteger(j) && txt(a.jersey) !== '' ? j : null, birthDate: isDate(txt(a.dateOfBirth).slice(0, 10)) ? txt(a.dateOfBirth).slice(0, 10) : null })
        }
      } catch (e) { console.error(`[numbers] BUCKETS roster ${id}: ${e?.message || e}`) }
    }),
    ...[...nhlClubs].map(async (t) => {
      try {
        for (const r of reduceRoster(await nhlApi.rosterFor(t), t)) if (r.id) out.set(`nhl:${r.id}`, { number: num(r.number), birthDate: isDate(r.birthDate) ? r.birthDate : null })
      } catch (e) { console.error(`[numbers] LAMP roster ${t}: ${e?.message || e}`) }
    }),
  ])
  return out
}

/** Both boards for `day` (the same reads THE SLATE makes). A board that fails is that sport left out, logged. */
export async function readBoards(day, { bucketsOn = true } = {}) {
  const [nhl, nba] = await Promise.all([
    import('../nhl/boardRead').then((m) => m.readBoard(day, { market: 'GOAL', net: true, lines: true })).catch((e) => { console.error(`[numbers] LAMP board: ${e?.message || e}`); return null }),
    bucketsOn ? import('../nba/boardRead').then((m) => m.readNbaBoard(day, 'pts')).catch((e) => { console.error(`[numbers] BUCKETS board: ${e?.message || e}`); return null }) : Promise.resolve(null),
  ])
  return { nhlGames: nhl?.games || [], nbaBoard: nba }
}

const RETRY_MS = 5 * 60e3
const _next = new Map()   // day -> the earliest ms the boards are read again (the tick asks every minute; the boards are read a few times a day)
export const _resetNumbersForTests = () => _next.clear()
const later = (day, at) => { if (_next.size > 20) _next.clear(); _next.set(day, at) }

/**
 * One try at a day's BY THE NUMBERS. `read` = async () => { nhlGames, nbaBoard }; `rosters` = async ({ nhlGames, nbaBoard }) => Map (both
 * injectable for the tests). Called every tick; does nothing until due.
 * @returns {Promise<string>} what happened, for the tick's log
 */
export async function postNumbersOnce(db, { day, hooks = '', now = Date.now(), read = null, rosters = null, draw = null, face = null, logo = null } = {}) {
  if (numbersOff()) return 'off'
  if (knownTaken(day, NUM_KIND)) return 'already-posted'
  if (now < (_next.get(day) || 0)) return 'waiting'
  const done = await db.from('homer_feed_posts').select('day').match({ day, kind: NUM_KIND }).maybeSingle()
  if (done?.data) { markTaken(day, NUM_KIND); return 'already-posted' }
  let boards
  try { boards = await (read || (async () => readBoards(day, { bucketsOn: (await import('./slate')).isPublicSport('nba') })))() } catch (e) { later(day, now + RETRY_MS); return `load-failed: ${e?.message || e}` }
  const timing = numbersTiming({ ...boards, now })
  if (!timing.go) { later(day, timing.next || now + RETRY_MS); return `held: ${timing.reason}` }
  const ro = await (rosters || readRosters)(boards)
  // no roster came back: a failed read, tried again (never "nothing lines up", which would close the night)
  if (!ro?.size) { later(day, now + RETRY_MS); return 'load-failed: no roster read' }
  const men = [...nbaMen({ board: boards.nbaBoard, rosters: ro, now }), ...nhlMen({ games: boards.nhlGames, rosters: ro, now })]
  const pick = pickDay(dayFinds(men, { day }), { day })      // today's numbers first (2026-10-24)
  const text = pick ? numbersText(pick, { limit: DISCORD_LIMIT }) : ''   // Discord only (routing: network), so X's 280 does not cut the names
  if (!text) {
    // a night with nothing that lines up on our calls says nothing: claimed, so it is not looked for again all night
    await db.from('homer_feed_posts').upsert([{ day, kind: NUM_KIND, payload: { none: true, men: men.length } }], { onConflict: 'day,kind', ignoreDuplicates: true })
    markTaken(day, NUM_KIND)
    recordPost({ day, kind: NUM_KIND, sport: 'nba', state: 'DROPPED', reason: pick ? 'nothing fits' : 'nothing lines up on tonight’s calls' })
    return 'none'
  }
  // the picture BEFORE the claim: a slow render must never leave a claimed day with nothing sent
  const png = await numbersPicture({ pick, day, draw, face, logo })
  const claim = await db.from('homer_feed_posts').upsert([{ day, kind: NUM_KIND, payload: {} }], { onConflict: 'day,kind', ignoreDuplicates: true }).select('day')
  if (claim.error) { later(day, now + RETRY_MS); console.error(`[numbers] claim failed: ${claim.error.message}`); return 'claim-failed' }
  markTaken(day, NUM_KIND)
  if (!claim.data?.length) return 'already-posted'
  const all = pick.numbers ? pick.rows : [pick.hero, ...pick.rows]
  const ids = [...new Set(all.flatMap((f) => f.men.map((m) => String(m.id))))]
  const patch = { payload: { finds: all.map((f) => ({ type: f.type, men: f.men.map((m) => ({ sport: m.sport, player_id: String(m.id), name: m.name, status: m.status, number: m.number, birth_date: m.birthDate })) })), picture: Boolean(png) } }
  const release = async (why) => {
    const del = await db.from('homer_feed_posts').delete().match({ day, kind: NUM_KIND })
    if (del?.error) { console.error(`[numbers] could not release the claim (${why}): ${del.error.message}`); return false }
    unmarkTaken(day, NUM_KIND)
    later(day, now + RETRY_MS)
    return true
  }
  // X gets its own fit (280: rows drop from the end); Discord the whole list (2026-10-26 review: X was handed the 1800-character Discord text)
  const xText = numbersText(pick)
  if (hasX() && xText) {
    const g = await admit(db, { day, kind: NUM_KIND, ids, repeat: false })
    if (g.state === 'go') {
      const mediaIds = png ? [await uploadImageToX(png)].filter(Boolean) : []
      const r = await postToX(xText, { kind: NUM_KIND, ...(mediaIds.length ? { mediaIds } : {}) })
      if (r.ok && r.id) { patch.x_post_id = r.id; logPosted({ day, kind: NUM_KIND, ids, tweetId: r.id, text: xText }) }
      else {
        console.error(`[numbers] refused: ${r.status} ${r.error}`)
        if (mayRetryPost(r, `${NUM_KIND}|${day}`) && await release(`x ${r.status}`)) return `retry: x ${r.status}`
      }
    } else if (/^daily cap/.test(g.reason || '')) {
      patch.x_post_id = 'skipped'      // X's cap is full for the day and will stay full: X skips it, Discord still gets it (as THE RECEIPT, 2026-10-26)
    } else if (await release(g.reason || g.state)) return `retry: x ${g.reason || g.state}`
  }
  const d = await postToDiscord(text, { kind: NUM_KIND, sportKey: 'nba', ...(png ? { png } : {}) }, hooks)
  if (d.ok) patch.discord_sent = true
  const saved = await db.from('homer_feed_posts').update(patch).match({ day, kind: NUM_KIND })
  if (saved?.error) console.error(`[numbers] posted but the row did not record it: ${saved.error.message}`)
  const onX = patch.x_post_id && patch.x_post_id !== 'skipped'
  return onX ? 'posted' : (patch.discord_sent ? 'posted (discord only)' : 'posted (nowhere)')
}
