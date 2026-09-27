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

const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))
const PART_WORD = { full: 'full name', first: 'first name', last: 'last name' }

/** Every base-cipher value of his name that equals `target`: [{ part, cipher, value }]. */
function nameHits(name, target) {
  const g = gematria(name)
  if (!g || target == null) return []
  const out = []
  for (const part of ['full', 'first', 'last']) for (const c of BASE_CIPHERS) if (g[part]?.[c]?.value === target) out.push({ part, cipher: c, value: target })
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

export const LANES = [
  // ── NAMES & LETTERS ────────────────────────────────────────────────────
  { key: 'gem_date', label: 'Name = tonight\'s date', group: 'NAMES & LETTERS', needs: ['name'],
    compute: (p, { date }) => {
      const dn = dateNumbers(date); if (!dn) return []
      return [['full', dn.full], ['short', dn.short], ['md', dn.md]].flatMap(([k, v]) => nameHits(p.name, v).map((h) => ({ value: v, matchedTo: `date ${k} ${v}`, text: `${hitText(h)}; tonight's ${k} date number is ${v}` })))
    } },
  { key: 'gem_jersey', label: 'Name = his jersey', group: 'NAMES & LETTERS', needs: ['name', 'jersey'],
    compute: (p) => (num(p.jersey) ? nameHits(p.name, num(p.jersey)).map((h) => ({ value: h.value, matchedTo: `jersey ${p.jersey}`, text: `${hitText(h)}, his jersey is #${p.jersey}` })) : []) },
  { key: 'gem_next', label: 'Name = his next number', group: 'NAMES & LETTERS', needs: ['name', 'next'],
    compute: (p) => (num(p.next) ? nameHits(p.name, num(p.next)).map((h) => ({ value: h.value, matchedTo: `next ${p.next}`, text: `${hitText(h)}; his next is #${p.next}` })) : []) },
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
  { key: 'fib_name', label: 'Name value is Fibonacci', group: 'NUMBERS', needs: ['name'],
    compute: (p) => { const g = gematria(p.name); if (!g?.full) return []; return BASE_CIPHERS.filter((c) => isFib(g.full[c].value) && g.full[c].value > 8).map((c) => ({ value: g.full[c].value, matchedTo: 'fibonacci', text: `full name = ${g.full[c].value} in ${CIPHERS[c].label}, a Fibonacci number` })) } },
  { key: 'fib_pair', label: 'Next number and the date are Fibonacci neighbours', group: 'NUMBERS', needs: ['next'],
    compute: (p, { date }) => { const n = num(p.next); const dn = dateNumbers(date); if (!n || !dn) return []; return [['full', dn.full], ['short', dn.short]].filter(([, v]) => fibNeighbours(n, v)).map(([k, v]) => ({ value: n, matchedTo: `date ${k} ${v}`, text: `his next #${n} and tonight's ${k} number ${v} sit side by side in the Fibonacci sequence` })) } },
]

/** Every lane that matched for one player tonight: [{ lane, label, group, value, matchedTo, text }]. */
export function matchLanes(p, ctx) {
  const out = []
  for (const lane of LANES) {
    if (lane.needs.some((f) => p?.[f] === null || p?.[f] === undefined || p?.[f] === '')) continue
    for (const m of lane.compute(p, ctx)) out.push({ lane: lane.key, label: lane.label, group: lane.group, ...m })
  }
  return out
}

/** Which lanes this player could be checked on (the denominator): keys whose needs he has. */
export const eligibleLanes = (p) => LANES.filter((l) => !l.needs.some((f) => p?.[f] === null || p?.[f] === undefined || p?.[f] === '')).map((l) => l.key)
