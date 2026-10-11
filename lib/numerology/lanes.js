// 🔢 THE LANES, AS DATA (2026-09-27, BATCH-NUMEROLOGY steps 2-5).
//
// Every lane is { key, label, group, needs, compute(p, ctx) -> matches[] }.
// Pages, the player card and the posts read this list, so a new lane shows
// up everywhere at once. A lane whose field is missing SITS OUT for that
// player (compute returns []) -- never a 0, never a guess.
//
// A player is the adapter shape (lib/numerology/adapters.js):
//   { name, jersey, birthDate, next }   next = his next HR / TD / goal
// ctx: { date }  -- the GAME's own date.
//
// MATCHES ARE EXACT. A name value equals a date number, his jersey or his
// next number. Roots are their own, looser lanes and say so.
//
// NOT BUILT (step 5: the field isn't in what the pages load, so the lane is
// dropped until it is): career number (career HR/TD/goal + 1), draft round
// and pick, debut year, the opposing starter's jersey, the team's game
// number, team-name gematria. Each needs a new per-player fetch or a bot
// field first.
import { digitRoot, dateNumbers, universal, personal, lifePathOf, isFib, fibNeighbours } from './core'
import { gematria, BASE_CIPHERS, CIPHERS, letters } from './gematria'

// CIPHER LANES (2026-10-10). The four name lanes (gem_date, gem_jersey, gem_next, fib_name) used to test ALL four
// base ciphers inside ONE lane: "a match" meant ordinal OR full reduction OR reverse ordinal OR reverse reduction,
// on the full, first or last name. Those combined lanes stay (their recorded history is never rewritten) and are
// labelled "any cipher". Each cipher now ALSO has its own lane, with its own record, so the scoreboard can say which
// cipher (if any) is doing anything, and so a lane that only looks hot because it is a max over four ciphers shows.
// Defaults: ordinal, full reduction, reverse ordinal and reverse reduction are ON (full reduction already was: it was
// one of the four inside the combined lane). Sumerian is OFF and has no lane (CIPHERS.sumerian.optional).
export const LANE_CIPHERS = BASE_CIPHERS.filter((c) => !CIPHERS[c].optional)
export const CIPHER_WORD = { ordinal: 'ordinal', fullReduction: 'full reduction', reverseOrdinal: 'reverse ordinal', reverseReduction: 'reverse reduction' }
export const CIPHER_SHORT = { ordinal: 'ord', fullReduction: 'red', reverseOrdinal: 'rev', reverseReduction: 'rev red' }

const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))
const PART_WORD = { full: 'full name', first: 'first name', last: 'last name' }

/** Every base-cipher value of his name that equals `target`: [{ part, cipher, value }]. */
function nameHits(name, target, ciphers = BASE_CIPHERS) {
  const g = gematria(name)
  if (!g || target == null) return []
  const out = []
  for (const part of ['full', 'first', 'last']) for (const c of ciphers) if (g[part]?.[c]?.value === target) out.push({ part, cipher: c, value: target })
  return out
}
const hitText = (h) => `${PART_WORD[h.part]} = ${h.value} in ${CIPHERS[h.cipher].label}`

/** Days between his birthday (this year) and the date, signed; null without a birth month/day. */
function birthdayOffset(birthDate, date) {
  const b = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(birthDate || '')); const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || ''))
  if (!b || !d) return null
  const y = Number(d[1])
  const on = (yy) => Date.UTC(yy, Number(b[2]) - 1, Number(b[3]))
  const today = Date.UTC(y, Number(d[2]) - 1, Number(d[3]))
  const cands = [on(y - 1), on(y), on(y + 1)].map((t) => Math.round((today - t) / 864e5))
  return cands.reduce((best, x) => (Math.abs(x) < Math.abs(best) ? x : best))
}
export function ageOn(birthDate, date) {
  const b = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(birthDate || '')); const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || ''))
  if (!b || !d) return null
  let age = Number(d[1]) - Number(b[1])
  if (Number(d[2]) < Number(b[2]) || (Number(d[2]) === Number(b[2]) && Number(d[3]) < Number(b[3]))) age -= 1
  return age
}

// the four name lanes, one builder each: `ciphers` = which ciphers it tests (all four = the combined lane)
const gemDate = (ciphers) => (p, { date }) => {
  const dn = dateNumbers(date); if (!dn) return []
  return [['full', dn.full], ['short', dn.short], ['md', dn.md]].flatMap(([k, v]) => nameHits(p.name, v, ciphers).map((h) => ({ value: v, matchedTo: `date ${k} ${v}`, text: `${hitText(h)}; tonight's ${k} date number is ${v}` })))
}
const gemJersey = (ciphers) => (p) => (num(p.jersey) ? nameHits(p.name, num(p.jersey), ciphers).map((h) => ({ value: h.value, matchedTo: `jersey ${p.jersey}`, text: `${hitText(h)}, his jersey is #${p.jersey}` })) : [])
const gemNext = (ciphers) => (p) => (num(p.next) ? nameHits(p.name, num(p.next), ciphers).map((h) => ({ value: h.value, matchedTo: `next ${p.next}`, text: `${hitText(h)}; his next is #${p.next}` })) : [])
const fibName = (ciphers) => (p) => { const g = gematria(p.name); if (!g?.full) return []; return ciphers.filter((c) => isFib(g.full[c].value) && g.full[c].value > 8).map((c) => ({ value: g.full[c].value, matchedTo: 'fibonacci', text: `full name = ${g.full[c].value} in ${CIPHERS[c].label}, a Fibonacci number` })) }

// [family key, combined label, group, needs, builder, short tag]
const NAME_FAMILIES = [
  ['gem_date', 'Name = tonight\'s date', 'NAMES & LETTERS', ['name'], gemDate, 'name=date'],
  ['gem_jersey', 'Name = his jersey', 'NAMES & LETTERS', ['name', 'jersey'], gemJersey, 'name=#'],
  ['gem_next', 'Name = his next number', 'NAMES & LETTERS', ['name', 'next'], gemNext, 'name=next'],
  ['fib_name', 'Name value is Fibonacci', 'NUMBERS', ['name'], fibName, 'name fib'],
]
/** The combined ("any cipher") lane of a family, then one lane per cipher: same needs, same hit rule, one cipher. */
const familyLanes = ([key, label, group, needs, build]) => [
  { key, label: `${label} · any cipher`, group, needs, family: key, cipher: 'any', compute: build(BASE_CIPHERS) },
  ...LANE_CIPHERS.map((c) => ({ key: `${key}_${c}`, label: `${label} · ${CIPHER_WORD[c]}`, group, needs, family: key, cipher: c, compute: build([c]) })),
]
const byFamily = Object.fromEntries(NAME_FAMILIES.map((f) => [f[0], familyLanes(f)]))

export const LANES = [
  // ── NAMES & LETTERS ────────────────────────────────────────────────────
  ...byFamily.gem_date, ...byFamily.gem_jersey, ...byFamily.gem_next,
  { key: 'initials_team', label: 'Initials spell his team', group: 'NAMES & LETTERS', needs: ['name', 'team'],
    compute: (p) => { const L = letters(p.name); const t = String(p.team || '').toUpperCase(); return L && t && L.initials.length >= 2 && t.startsWith(L.initials) ? [{ value: L.initials, matchedTo: `team ${t}`, text: `his initials ${L.initials} open ${t}` }] : [] } },
  { key: 'initials_opp', label: 'Initials spell the opponent', group: 'NAMES & LETTERS', needs: ['name', 'opp'],
    compute: (p) => { const L = letters(p.name); const t = String(p.opp || '').toUpperCase(); return L && t && L.initials.length >= 2 && t.startsWith(L.initials) ? [{ value: L.initials, matchedTo: `opp ${t}`, text: `his initials ${L.initials} open tonight's opponent ${t}` }] : [] } },
  { key: 'letters_date', label: 'Letter count = a date number', group: 'NAMES & LETTERS', needs: ['name'],
    compute: (p, { date }) => { const L = letters(p.name); const dn = dateNumbers(date); if (!L || !dn) return []; return [['md', dn.md], ['day', dn.dayOfYear]].filter(([, v]) => v === L.letters).map(([k, v]) => ({ value: v, matchedTo: `date ${k} ${v}`, text: `${L.letters} letters in his name; tonight's ${k} number is ${v}` })) } },
  // ── DATE (universal / personal) ────────────────────────────────────────
  { key: 'personal_universal', label: 'Personal day = Universal Day', group: 'DATE', needs: ['birthDate'],
    compute: (p, { date }) => { const pe = personal(p.birthDate, date); const u = universal(date); return pe && u && pe.day.root === u.day.root ? [{ value: pe.day.root, matchedTo: `universal day ${u.day.value}`, text: `his personal day is ${pe.day.value}, the Universal Day is ${u.day.value}` }] : [] } },
  { key: 'path_universal', label: 'Life path = Universal Day', group: 'DATE', needs: ['birthDate'],
    compute: (p, { date }) => { const lp = lifePathOf(p.birthDate); const u = universal(date); return lp && u && lp === u.day.root ? [{ value: lp, matchedTo: `universal day ${u.day.value}`, text: `his life path is ${lp}, the Universal Day is ${u.day.value}` }] : [] } },
  { key: 'jersey_universal', label: 'Jersey root = Universal Day', group: 'DATE', needs: ['jersey'],
    compute: (p, { date }) => { const j = num(p.jersey); const u = universal(date); return j && u && digitRoot(j) === u.day.root ? [{ value: digitRoot(j), matchedTo: `universal day ${u.day.value}`, text: `#${j} reduces to ${digitRoot(j)}, the Universal Day is ${u.day.value}` }] : [] } },
  { key: 'birthday_week', label: 'Birthday week', group: 'DATE', needs: ['birthDate'],
    compute: (p, { date }) => { const off = birthdayOffset(p.birthDate, date); if (off == null || Math.abs(off) > 3) return []; const age = ageOn(p.birthDate, date); return [{ value: off, matchedTo: 'birthday +/- 3 days', text: off === 0 ? `his birthday is today${age != null ? ` (${age})` : ''}` : `his birthday was/is ${Math.abs(off)} day${Math.abs(off) === 1 ? '' : 's'} ${off > 0 ? 'ago' : 'away'}` }] } },
  // ── FIBONACCI (exact values, never reduced) ────────────────────────────
  { key: 'fib_next', label: 'Next number is Fibonacci', group: 'NUMBERS', needs: ['next'],
    compute: (p) => (num(p.next) && isFib(num(p.next)) ? [{ value: num(p.next), matchedTo: 'fibonacci', text: `his next is #${p.next}, a Fibonacci number` }] : []) },
  { key: 'fib_jersey', label: 'Jersey is Fibonacci', group: 'NUMBERS', needs: ['jersey'],
    compute: (p) => (num(p.jersey) && isFib(num(p.jersey)) ? [{ value: num(p.jersey), matchedTo: 'fibonacci', text: `#${p.jersey} is a Fibonacci number` }] : []) },
  ...byFamily.fib_name,
  { key: 'fib_pair', label: 'Next number and the date are Fibonacci neighbours', group: 'NUMBERS', needs: ['next'],
    compute: (p, { date }) => { const n = num(p.next); const dn = dateNumbers(date); if (!n || !dn) return []; return [['full', dn.full], ['short', dn.short]].filter(([, v]) => fibNeighbours(n, v)).map(([k, v]) => ({ value: n, matchedTo: `date ${k} ${v}`, text: `his next #${n} and tonight's ${k} number ${v} sit side by side in the Fibonacci sequence` })) } },
]

/** The short tag each lane wears in the Ledger (same style as the chips there: '#→3', 'day 9'); the full label is the tap/title text. */
export const LANE_SHORT = {
  gem_date: 'name=date', gem_jersey: 'name=#', gem_next: 'name=next', initials_team: 'initials=team', initials_opp: 'initials=opp',
  letters_date: 'letters=date', personal_universal: 'day=UD', path_universal: 'path=UD', jersey_universal: '#→UD', birthday_week: 'bday wk',
  fib_next: 'next fib', fib_jersey: '#fib', fib_name: 'name fib', fib_pair: 'fib pair',
}
// the combined lane keeps its tag + 'any'; each cipher lane wears its family tag + the cipher
for (const [fam, , , , , tag] of NAME_FAMILIES) {
  LANE_SHORT[fam] = `${tag} · any`
  for (const c of LANE_CIPHERS) LANE_SHORT[`${fam}_${c}`] = `${tag} · ${CIPHER_SHORT[c]}`
}

/** Every lane that matched for one player tonight: [{ lane, label, group, value, matchedTo, text }]. */
export function matchLanes(p, ctx) {
  const out = []
  for (const lane of LANES) {
    if (lane.needs.some((f) => p?.[f] === null || p?.[f] === undefined || p?.[f] === '')) continue
    for (const m of lane.compute(p, ctx)) out.push({ lane: lane.key, family: lane.family || lane.key, cipher: lane.cipher || null, label: lane.label, short: LANE_SHORT[lane.key] || lane.label, group: lane.group, ...m })
  }
  return out
}

/** Which lanes this player could be checked on (the denominator): keys whose needs he has. */
export const eligibleLanes = (p) => LANES.filter((l) => !l.needs.some((f) => p?.[f] === null || p?.[f] === undefined || p?.[f] === '')).map((l) => l.key)

/**
 * What a surface that LISTS a man's matches should show (HisNumbers, the Ledger's HIS LANES, tonight's players on
 * the lanes). A cipher lane that matched makes its "any cipher" sibling redundant (same hit, one level up), so the
 * sibling is dropped and the man is listed under the cipher that did it. Recording keeps every lane (matchLanes).
 */
export function displayLanes(matches) {
  const withCipher = new Set((matches || []).filter((m) => m.cipher && m.cipher !== 'any').map((m) => m.family))
  return (matches || []).filter((m) => !(m.cipher === 'any' && withCipher.has(m.family)))
}
