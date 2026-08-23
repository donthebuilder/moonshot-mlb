// 🔤 NAME ECHOES — the names that rhyme with each other on a night.
//
// 2026-08-16. Donovan, verbatim: "all track common names or names that vibe
// together like bobby witt tommy white 2 sylablas or like bryce and brice
// bryce edlfergid does thsat make sense like maybe all the j names are going .
// just secetian patterns like austin riley riley greene or pete alson pete
// crow /pca"
//
// Decoded into the five things he actually named, all of them about the
// hitters who went deep tonight and nothing else:
//
//   pete alonso / pete crow-armstrong    two hitters, one first name
//   austin riley / riley greene          one man's first name is another
//                                        man's surname — his most specific
//                                        example, and the one that has to work
//   bryce / brice                        near-miss spellings, so equality is
//                                        not enough; this needs fuzzy matching
//   bobby witt / tommy white             cadence — two-syllable first name,
//                                        one-syllable surname, twice over
//   "all the j names are going"          an initial running hotter than it
//                                        should
//
// WHAT THIS FILE ANSWERS: given tonight's homer hitters (and, ideally, every
// hitter who batted tonight), which of those echoes are actually there — and
// for each one, HOW OFTEN A NIGHT LIKE THIS PRODUCES IT BY ACCIDENT.
//
// ── THE HARD PART IS NOT FINDING ECHOES. IT IS REFUSING MOST OF THEM. ───────
//
// A slate is ~25 homers. Twenty-five names will ALWAYS contain a shared
// initial, usually a repeated first name, and frequently a rhyme. A panel that
// prints whatever it found and calls it a pattern is the exact thing this site
// exists not to be — it is the horoscope version of the Homer Ledger's
// numerology strip, and that strip only earns its place because it says out
// loud that ~25 numbers over a range of fifty cluster by arithmetic alone.
//
// So the correction is the feature, not a disclaimer bolted underneath it.
// Three rules, and they are load-bearing:
//
//   1. EVERY ECHO CARRIES ITS DENOMINATOR. "3 of the 24 hitters who homered
//      tonight," never "3 Petes!". A count without the pool it came from is
//      the oldest way to lie with a true number.
//
//   2. EVERY ECHO IS MEASURED AGAINST THE NIGHT'S OWN BASELINE. The caller
//      passes `population` — every hitter who batted tonight, ~200-300 names.
//      We then draw random 24-name slates out of that pool a thousand-odd
//      times and ask how often the accident happens. Three J-names out of 24
//      is nothing if 12% of the league's bats are a J; it is something if 3%
//      are. This is the whole reason the second argument exists, and a caller
//      who skips it gets a degraded, clearly-labelled result (see UNBASELINED).
//
//   3. THE CORRECTION FOR "WE LOOKED AT EVERYTHING" IS BUILT INTO THE NULL.
//      We check 26 first initials, 26 surname initials, every first name,
//      every surname, every syllable shape, and every pair of names. Testing
//      that many things and reporting the winner is how you manufacture a
//      finding. So the null distribution is the distribution of THE BEST THING
//      THE SAME SEARCH FINDS IN A RANDOM NIGHT — the search gets to cheat
//      exactly as hard on fake nights as it does on the real one. A p-value
//      out of that is honest about the searching.
//
// ── WHAT CLEARS THE BAR ─────────────────────────────────────────────────────
//
// Two numbers come out of the null for every echo, and BOTH ship:
//
//   p      within its own family, corrected for every cell/pair that family
//          searched. "An initial cluster this far above its own league rate
//          turns up on 3% of random nights." This is what the gate uses:
//          p <= ALPHA (0.05) or the echo is dropped and never rendered.
//
//   pAny   across ALL SIX families at once — how often a random night throws
//          up SOMETHING at least this striking, by any of the six lenses.
//          This is the number that answers "but you'd always find something",
//          and it is nearly always much larger than p. It is not a gate; it is
//          printed, because a reader who sees "1 night in 20 for this kind,
//          but 1 night in 4 for something" can discount the panel correctly
//          and a reader who only sees the first cannot.
//
// Gating on the per-family p rather than pAny is a deliberate choice with a
// cost: six families at 0.05 means roughly one night in four shows a line.
// Gating on pAny instead would show a line about one night in twenty and
// would, most nights, hide a genuinely odd cross-name pair because some
// unrelated initial cluster was also mildly odd. The compromise is: gate per
// family, print pAny next to it, cap the panel at three echoes, and never let
// the panel imply the echo means anything. Change ALPHA here, not at the
// call site, if that balance turns out wrong.
//
// ── MEASURED, NOT ASSERTED (2026-08-16) ─────────────────────────────────────
//
// 300 pure-noise nights: 24 names drawn at random out of a 240-bat slate of
// real MLB hitters, so by construction there is nothing to find in any of
// them. What each panel would have shown:
//
//   this file, as gated       46 of 300 nights (15.3%)
//                             initial 14 · cross-name 13 · near-miss 10 ·
//                             shared-first 8 · cadence 7 · shared-last 2
//                             — about 5% per family, which is ALPHA, six times
//   "2+ share a first name
//    or 3+ share an initial"  300 of 300 nights (100%)
//
// That second line is the ten-minute version of this feature, and it is the
// reason the null exists: it would have printed a pattern every single night
// of a season in which there were none. The gated version still speaks on
// roughly one night in six, which is why pAny is printed on every line — on
// those nights it typically reads 1-in-6 to 1-in-12, and it is telling the
// truth about itself.
//
// Two calibration checks worth keeping:
//   · J is 15.8% of that slate's first names, so 3, 4, 5, 6 and even 8 J-names
//     out of 24 all show NOTHING. It takes 10 (p=0.026) before the panel will
//     say a word about the J names — which is exactly the correction Donovan's
//     own "maybe all the j names are going" needs.
//   · D is 3.3% of the same slate, and 5 D-names out of 24 clears at p=0.005.
//     Same count, different letter, opposite verdict. No fixed threshold can
//     do that.
//
// The harness that produced these numbers is not in the repo (it is a
// throwaway node script; there is no test runner here). Re-derive rather than
// trust: findNameEchoes is pure, so 300 random draws from any slate and a
// tally of what comes back reproduces the table above in about five seconds.
//
// ── WHAT I REJECTED, AND WHY ────────────────────────────────────────────────
//
//   A FIXED THRESHOLD ("3+ shared initials is a pattern"). This is what the
//   feature would be if you built it in ten minutes, and it is wrong in both
//   directions at once: three J-names is boring (J is a huge initial) and
//   three Q-names would be astounding, and a fixed count cannot tell them
//   apart. Donovan's own sentence — "maybe all the j names are going" — is
//   precisely the case a fixed threshold gets wrong.
//
//   A BAKED-IN TABLE OF LEAGUE NAME FREQUENCIES. It would make the baseline
//   work without the caller passing anything, and it would be invented data
//   that silently rots. The night's own batters are the honest denominator and
//   the caller already has them.
//
//   SCORING, WEIGHTING, OR ANY FEED INTO A PICK. Nothing in this file is read
//   by the model, the pick logic, or any ranking. A name has never thrown a
//   pitch. Same rule lib/funFacts.js sets for itself: a thing to notice that
//   starts moving a number stops being a thing to notice.
//
//   PHONETIC MATCHING (soundex/metaphone) for the near-miss family. Soundex
//   collapses Bryce and Brice correctly and also collapses a great many pairs
//   nobody would ever hear as an echo (it is deaf to vowels entirely), so it
//   would fire constantly and mean less. One-character edit distance is a
//   narrower claim and it is the claim Donovan actually described.
//
//   FUZZY CROSS-NAME (first name ≈ someone's surname). Austin Riley / Riley
//   Greene is exact; loosening it to edit distance 1 crosses two already-loose
//   families and would be the least defensible thing in the file.
//
//   BIRTH NAMES, NICKNAMES, ACCENT-BLIND MERGING BEYOND STRIPPING DIACRITICS.
//   "Pete" and "Peter" are one edit apart in the near-miss family and that is
//   the only relationship we assert between them.
//
// ── UNBASELINED MODE ────────────────────────────────────────────────────────
//
// If the caller passes no population (or too small a one to draw from), we
// cannot compute any of the above, so:
//   · the initial family and the cadence family are DROPPED ENTIRELY — both
//     are claims about a rate, and there is no rate without a baseline;
//   · the four structural families still report, every echo is flagged
//     `baselined: false`, and its note says plainly that we can tell you the
//     names repeat but not whether repeating is unusual.
// This is a fallback, not a mode to design for. Pass the slate.

// ── ALPHA, and the size of the null ─────────────────────────────────────────
// TRIALS sets the resolution of every p in this file: nothing can be reported
// below 1/(TRIALS+1). 1200 draws of 24 names, six families each, is a few tens
// of milliseconds once per slate inside a useMemo — small enough to sit in a
// render, large enough that a 1-in-100 echo is distinguishable from a 1-in-20.
export const ALPHA = 0.05
export const TRIALS = 1200
// Below this the pool is too close to the homer list itself for a draw to mean
// anything — sampling 24 names out of 30 reproduces the observed night almost
// exactly, so every p collapses to 1 and every echo silently vanishes. Better
// to declare no baseline than to serve a meaningless one.
const MIN_POP = 60
const MIN_POP_RATIO = 2.5

// ── NAME PARSING ────────────────────────────────────────────────────────────
//
// Suffixes are dropped before the surname is taken, or Bobby Witt Jr.'s
// surname is "Jr" and the cross-name family never sees "Witt". Diacritics are
// folded (José → jose) so a spelling difference in the feed is not read as a
// different name; everything else about the string is left alone.
//
// Multi-word surnames (Elly De La Cruz) keep all their words: the key is
// "delacruz", the initial is D. Splitting them would invent a surname nobody
// has. A one-token name gets an empty surname and simply sits out the families
// that need one, rather than borrowing the first name as a stand-in.
const SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'v'])

const fold = (s) => String(s == null ? '' : s)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z\s'.-]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()

/**
 * Split a display name into the pieces every family below matches on.
 * Returns null for anything with no usable letters, so callers can filter
 * rather than match against an empty string (which would make every nameless
 * row an echo of every other nameless row).
 */
export function nameParts(raw) {
  const folded = fold(raw)
  if (!folded) return null
  const tokens = folded.split(' ')
    .map((t) => t.replace(/\.$/, ''))
    .filter((t) => t && !SUFFIXES.has(t))
  if (!tokens.length) return null
  const first = tokens[0]
  const lastWords = tokens.slice(1)
  const key = (s) => s.replace(/[^a-z]/g, '')
  const firstKey = key(first)
  const lastKey = key(lastWords.join(''))
  if (!firstKey) return null
  const p = {
    display: String(raw || '').trim(),
    firstKey,
    lastKey,                      // '' when the feed gave us one token only
    firstWord: first,
    lastWords,
    firstInitial: firstKey[0],
    lastInitial: lastKey ? lastKey[0] : '',
    firstSyl: countSyllables(first),
    lastSyl: lastWords.length ? lastWords.reduce((a, w) => a + countSyllables(w), 0) : 0,
  }
  // The bucket keys are built ONCE, here, and cached on the parsed name. The
  // null below re-buckets a sampled night 1200 times over four lenses; doing
  // the string work in that loop instead of here was measurably the most
  // expensive thing in the file (134ms → 40ms for one slate on a 240-bat pool).
  p.cells = cellsOf(p)
  return p
}

// ── SYLLABLE COUNTING IS APPROXIMATE, AND HERE IS WHERE IT BREAKS ───────────
//
// English syllable counting from spelling alone is not a solved problem and
// this is the ordinary vowel-group heuristic: count runs of vowels (y counts),
// drop a silent trailing e, keep a trailing consonant+le as its own syllable,
// never return less than one. Hyphenated words are counted per part by the
// caller (Crow-Armstrong = 1 + 2).
//
// It gets Donovan's examples right — bobby 2, witt 1, tommy 2, white 1, riley
// 2, greene 1, alonso 3, bryce 1, brice 1, turang 2, harper 2 — and it is
// wrong often enough that it must never carry a claim by itself:
//
//   ADJACENT VOWELS ACROSS A SYLLABLE BREAK read as one group. Suárez folds to
//   "suarez" and counts 3 (su-a-rez) where it is said as 2; Julio counts 3 and
//   is 3, so the rule cannot even be applied consistently.
//   NON-ENGLISH SPELLINGS fare worst of all — Yastrzemski counts 4 against a
//   spoken 3, and the heuristic has no idea what to do with a consonant run.
//   SILENT E IS A GUESS. It is right for White and Bryce and wrong for any
//   name where the e is pronounced.
//
// Because of that, the cadence family below can never report on syllable
// agreement alone: a cadence group only renders when its members ALSO agree on
// something you can see in the spelling (see CADENCE_CORROBORATION).
export function countSyllables(word) {
  const w = fold(word).replace(/[^a-z-]/g, '')
  if (!w) return 0
  if (w.includes('-')) return w.split('-').reduce((a, p) => a + countSyllables(p), 0)
  let s = w.replace(/e$/, '')
  if (!s) s = w
  const groups = s.match(/[aeiouy]+/g)
  let count = groups ? groups.length : 0
  if (/[^aeiouy]le$/.test(w)) count += 1
  return Math.max(1, count)
}

// One-character edit distance, and ONLY one — a substitution, an insertion or
// a deletion. Written as a direct scan rather than a full Levenshtein matrix
// because it runs a few hundred thousand times inside the null and because the
// question is binary: is this Bryce/Brice, or is it two unrelated names.
// Equality returns false: identical names are the shared-name family's job,
// not this one.
function isOneEdit(a, b) {
  if (a === b) return false
  const [s, t] = a.length <= b.length ? [a, b] : [b, a]
  if (t.length - s.length > 1) return false
  let i = 0
  while (i < s.length && s[i] === t[i]) i += 1
  if (s.length === t.length) {
    for (let j = i + 1; j < s.length; j += 1) if (s[j] !== t[j]) return false
    return true
  }
  for (let j = i; j < s.length; j += 1) if (s[j] !== t[j + 1]) return false
  return true
}

// Short names are excluded from the near-miss family: at three letters almost
// everything is one edit from something else (Jon/Jan/Jos/Ron), so the family
// would fire on noise and drown the real Bryce/Brice case.
const NEAR_MIN_LEN = 4

// ── HYPERGEOMETRIC TAIL ─────────────────────────────────────────────────────
// P(at least k of this cell land in a draw of N from a pool of M holding m of
// them). Exact, not normal-approximated: the counts here are 2 and 3, which is
// exactly where a normal approximation is worst. Log-factorials are cached the
// first time a pool size is seen.
let LOG_FACT = [0]
function logFact(x) {
  for (let i = LOG_FACT.length; i <= x; i += 1) LOG_FACT[i] = LOG_FACT[i - 1] + Math.log(i)
  return LOG_FACT[x]
}
const logChoose = (a, b) => (b < 0 || b > a ? -Infinity : logFact(a) - logFact(b) - logFact(a - b))
function hyperTail(M, m, N, k) {
  if (k <= 0) return 1
  if (m < k || N < k) return 0
  const lo = Math.max(k, N - (M - m))
  const hi = Math.min(m, N)
  const den = logChoose(M, N)
  let s = 0
  for (let i = lo; i <= hi; i += 1) s += Math.exp(logChoose(m, i) + logChoose(M - m, N - i) - den)
  return Math.min(1, Math.max(0, s))
}

// Deterministic PRNG (mulberry32) seeded off the night's own names. This
// matters for the UI, not for the statistics: an unseeded null would give a
// slightly different p on every re-render and the panel would flicker between
// showing and hiding an echo that sits near the threshold. Same slate, same
// answer, every time.
function seedFrom(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}
function mulberry32(a) {
  let t = a
  return () => {
    t = (t + 0x6d2b79f5) | 0
    let x = Math.imul(t ^ (t >>> 15), 1 | t)
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}

// ── THE SIX FAMILIES ────────────────────────────────────────────────────────
//
// Each family is one of Donovan's five readings (the shared-name reading
// splits into first names and surnames, which are different coincidences).
// Two shapes of family, because they need different nulls:
//
//   CELL families put every hitter in exactly one bucket per lens and ask
//   whether any bucket is overfull. Buckets have wildly different base rates —
//   J is a common initial, Q is not — so the per-bucket figure is an exact
//   hypergeometric tail against the pool, and the family's strength is the
//   SMALLEST of those (a min-p search, which is what the null then corrects).
//
//   PAIR families ask about relationships between two hitters, which no
//   per-hitter bucket can express. Their strength is simply how many such
//   pairs the night contains.
export const FAMILIES = ['cross-name', 'shared-first', 'shared-last', 'near-miss', 'cadence', 'initial']

// Cadence: the syllable shape of a name, "2-1" for Bobby Witt. Only names with
// both halves present get a shape.
const shapeOf = (p) => (p.lastKey && p.firstSyl && p.lastSyl ? `${p.firstSyl}-${p.lastSyl}` : null)

// The four CELL lenses, and the buckets one hitter falls in under each. Called
// once per name, from nameParts, and cached on the parsed object as `.cells`.
const CELL_LENSES = ['shared-first', 'shared-last', 'cadence', 'initial']
function cellsOf(p) {
  const s = shapeOf(p)
  return {
    'shared-first': p.firstKey ? [`f:${p.firstKey}`] : [],
    'shared-last': p.lastKey ? [`l:${p.lastKey}`] : [],
    cadence: s ? [`c:${s}`] : [],
    // BOTH initials, on purpose. "All the j names are going" is ambiguous
    // between Jose/Josh and Judge/Jung, and the min-p null makes checking both
    // lenses free — searching 52 cells instead of 26 raises the bar the winner
    // has to clear rather than doubling the false alarms.
    initial: [
      ...(p.firstInitial ? [`i:f:${p.firstInitial}`] : []),
      ...(p.lastInitial ? [`i:l:${p.lastInitial}`] : []),
    ],
  }
}

// Pair predicates. Both take two parsed names and answer yes/no.
const pairHit = {
  // Austin Riley / Riley Greene. Ordered both ways, deduped to one hit per
  // unordered pair. Self-matches (a man whose first name is his own surname)
  // are excluded — that is one person, not an echo.
  'cross-name': (a, b) => (
    (!!a.firstKey && a.firstKey === b.lastKey && a.firstKey !== a.lastKey)
    || (!!b.firstKey && b.firstKey === a.lastKey && b.firstKey !== b.lastKey)
  ),
  // Bryce / Brice, and the same test on surnames.
  'near-miss': (a, b) => (
    (a.firstKey.length >= NEAR_MIN_LEN && b.firstKey.length >= NEAR_MIN_LEN && isOneEdit(a.firstKey, b.firstKey))
    || (a.lastKey.length >= NEAR_MIN_LEN && b.lastKey.length >= NEAR_MIN_LEN && isOneEdit(a.lastKey, b.lastKey))
  ),
}

// ── ONE PAIR AT A TIME (2026-08-23) ─────────────────────────────────────────
//
// Everything above works on a SET: it buckets a night and asks whether any
// bucket is fuller than chance. Donovan wants the other question, which is the
// matching game he actually plays: "same first name — if one goes the other
// might go. Brice / Bryce Eldridge. Luis Rob / Luis Torrens. Pete and Pete
// Alonso. Names that rhyme, same jersey numbers, the syllable thing."
//
// That is pairwise, and it is asked of ONE homer against ONE hitter who has
// not gone yet — so it needs the predicates, not the null. Same definitions,
// exported rather than re-implemented, because a second copy of "one letter
// apart" that drifts from this one is worse than no second copy.
//
// CADENCE IS GATED BY THE CALLER, deliberately. A 2-1 shape (Bobby Witt) fits
// a large share of every slate, so as a PAIR reason it would fire on dozens of
// men a night and drown the ones that mean something. findNameEchoes can
// afford it because the null prices it; a pair cannot, so `cadenceOk` is
// passed in by whoever knows how rare tonight's shape is.
export function pairEcho(a, b, opts = {}) {
  if (!a || !b) return ''
  if (a.firstKey && a.firstKey === b.firstKey) return 'the same first name'
  if (a.lastKey && a.lastKey === b.lastKey) return 'the same surname'
  if (pairHit['near-miss'](a, b)) return 'a name one letter apart'
  if (pairHit['cross-name'](a, b)) return "a first name that is the other's surname"
  if (opts.cadenceOk) {
    const sa = shapeOf(a); const sb = shapeOf(b)
    if (sa && sa === sb) return `the same ${sa.replace('-', '-then-')} syllable shape`
  }
  return ''
}

/** The syllable shape of a parsed name, or null — so a caller can count how
 *  common tonight's shapes are before letting cadence count as a pair. */
export const cadenceShape = (p) => shapeOf(p)

// Strength of a set of parsed names, per family. Larger = more extreme, for
// every family, so the null can be read the same way everywhere.
//   cell families:  -log(min hypergeometric tail over the cells present)
//   pair families:  the number of qualifying pairs
function cellStrength(list, lens, pool) {
  const counts = new Map()
  for (let i = 0; i < list.length; i += 1) {
    const keys = list[i].cells[lens]
    for (let j = 0; j < keys.length; j += 1) counts.set(keys[j], (counts.get(keys[j]) || 0) + 1)
  }
  let best = 1
  let bestKey = null
  counts.forEach((k, cell) => {
    if (k < 2) return                       // one of anything is not an echo
    const m = pool.cellPop.get(cell) || 0
    if (m < k) return                       // pool disagrees with the draw; skip rather than guess
    const p = poolTail(pool, m, k)
    if (p < best) { best = p; bestKey = cell }
  })
  return { strength: best >= 1 ? 0 : -Math.log(best), p: best, cell: bestKey }
}
// Memoised tail for one call: the pool size and the draw size are fixed for a
// whole slate, so the only things that vary are (how many the pool holds, how
// many landed) and those repeat constantly across 1200 draws.
function poolTail(pool, m, k) {
  const key = `${m}:${k}`
  let v = pool.tails.get(key)
  if (v === undefined) { v = hyperTail(pool.M, m, pool.N, k); pool.tails.set(key, v) }
  return v
}
function pairStrength(list, fam) {
  const hits = []
  for (let i = 0; i < list.length; i += 1) {
    for (let j = i + 1; j < list.length; j += 1) {
      if (pairHit[fam](list[i], list[j])) hits.push([list[i], list[j]])
    }
  }
  return { strength: hits.length, hits }
}
// The same question, precomputed. Every pair of names IN THE POOL is tested
// once up front and the answers live in an M×M bit matrix, so a trial only
// looks up 276 bytes instead of running 552 edit-distance scans. One build of
// ~29,000 comparisons replaces ~660,000 of them across the null, and it is
// what takes a slate from ~80ms to ~25ms — enough to matter inside a render.
function pairMatrix(poolList, fam) {
  const M = poolList.length
  const mat = new Uint8Array(M * M)
  for (let i = 0; i < M; i += 1) {
    for (let j = i + 1; j < M; j += 1) {
      if (pairHit[fam](poolList[i], poolList[j])) { mat[i * M + j] = 1; mat[j * M + i] = 1 }
    }
  }
  return mat
}
function pairCount(drawIdx, mat, M) {
  let c = 0
  for (let i = 0; i < drawIdx.length; i += 1) {
    const row = drawIdx[i] * M
    for (let j = i + 1; j < drawIdx.length; j += 1) c += mat[row + drawIdx[j]]
  }
  return c
}

// ── CADENCE CORROBORATION ───────────────────────────────────────────────────
// The syllable count is approximate (see countSyllables above), so a cadence
// group is only ever NAMED when at least two of its members also agree on
// something visible in the spelling: the same last letter of the first name
// (Bobby / Tommy) or the same first letter of the surname (Witt / White).
// This is a DISPLAY filter, not part of the p — the p is honestly about how
// unusual that many names of that shape is, and the filter's job is to stop a
// shaky count being the only thing on offer.
//
// THE CORROBORATION HAS TO BE A SECOND FACT, NOT THE SAME ONE TWICE. Pete
// Alonso and Pete Crow-Armstrong "both have first names ending in e", and
// Bryce and Brice do too — but only because they are the same name and a
// one-letter variant, which the shared-first and near-miss families already
// say better. A pair whose names are identical or one edit apart is therefore
// skipped here, so cadence only ever fires on genuinely different names that
// happen to move the same way: Bobby Witt and Tommy White.
function corroborate(group) {
  for (let i = 0; i < group.length; i += 1) {
    for (let j = i + 1; j < group.length; j += 1) {
      const a = group[i]
      const b = group[j]
      const sameName = a.firstKey === b.firstKey || isOneEdit(a.firstKey, b.firstKey)
      const sameSurname = a.lastKey === b.lastKey || isOneEdit(a.lastKey, b.lastKey)
      if (sameName || sameSurname) continue
      // Name-free text on purpose: it goes into `detail`, which the component
      // renders beside its own list of names, and repeating them reads badly.
      if (a.firstKey.slice(-1) === b.firstKey.slice(-1)) {
        return `two of the first names end in “${a.firstKey.slice(-1)}”`
      }
      if (a.lastInitial && a.lastInitial === b.lastInitial) {
        return `two of the surnames start with ${a.lastInitial.toUpperCase()}`
      }
    }
  }
  return null
}

const joinNames = (names) => {
  if (names.length <= 1) return names[0] || ''
  if (names.length === 2) return names.join(' and ')
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`
}
const oneIn = (p) => (p == null ? null : Math.round(1 / p))
const chanceWords = (p, trials) => {
  if (p == null) return ''
  if (p <= 1 / (trials + 1)) return `fewer than 1 night in ${trials}`
  const k = oneIn(p)
  return k <= 1 ? 'most nights' : `about 1 night in ${k}`
}

/**
 * findNameEchoes(homers, population, opts)
 *
 * homers      [{ name, team, ... }] — the hitters who went deep tonight. One
 *             entry per HITTER; a two-homer night is one name, because the
 *             echo is between people and the denominator has to be people.
 * population  [{ name }] or ['Name'] — every hitter who batted tonight. This
 *             is what makes any of the numbers mean anything; see the header.
 * opts        { alpha, trials, max } — defaults ALPHA / TRIALS / 3.
 *
 * Returns a RANKED ARRAY of echoes that cleared the bar (most surprising
 * first), possibly empty — and empty is the normal, correct answer on most
 * nights. Each echo:
 *
 *   kind      one of FAMILIES
 *   label     three-word tag for a chip ("first name / surname")
 *   names     the display names involved, in the order they were given
 *   count     how many hitters (or pairs) the echo covers
 *   denom     how many hitters homered tonight — always stated
 *   expected  what the pool says you'd expect, for cell echoes; null otherwise
 *   p         corrected chance of this family producing something this strong
 *   pAny      corrected chance of ANY of the six producing something this strong
 *   baselined false when there was no usable population; p/pAny are then null
 *   detail    one sentence with the denominator, WITHOUT the names in it
 *   phrase    the same sentence WITH the names, self-contained for a tooltip
 *   note      the chance sentence, or the no-baseline sentence
 */
export function findNameEchoes(homers, population = [], opts = {}) {
  const alpha = opts.alpha == null ? ALPHA : opts.alpha
  const trials = opts.trials == null ? TRIALS : opts.trials
  const max = opts.max == null ? 3 : opts.max

  // Parse and dedupe the night. Two graded rows for the same man (he was
  // designated in two categories, the thing lib/graded.js exists to fix) must
  // not become "two hitters with the same name" — that would be a
  // self-inflicted echo, and it would be the first one this panel ever showed.
  const seen = new Set()
  const list = []
  ;(Array.isArray(homers) ? homers : []).forEach((h) => {
    const raw = typeof h === 'string' ? h : (h?.name ?? h?.player ?? h?.player_name)
    const p = nameParts(raw)
    if (!p) return
    const k = `${p.firstKey}|${p.lastKey}`
    if (seen.has(k)) return
    seen.add(k)
    list.push(p)
  })
  const denom = list.length
  if (denom < 2) return []

  // The pool. Deduped the same way, and the homer hitters are folded in
  // whether or not the caller included them — a hitter who homered certainly
  // batted, and a pool missing him would make his own name look impossible.
  const poolSeen = new Set()
  const poolList = []
  const addPool = (raw) => {
    const p = nameParts(raw)
    if (!p) return
    const k = `${p.firstKey}|${p.lastKey}`
    if (poolSeen.has(k)) return
    poolSeen.add(k)
    poolList.push(p)
  }
  ;(Array.isArray(population) ? population : []).forEach((x) => addPool(typeof x === 'string' ? x : (x?.name ?? x?.player ?? x?.player_name)))
  list.forEach((p) => addPool(p.display))

  const baselined = poolList.length >= MIN_POP && poolList.length >= denom * MIN_POP_RATIO
  const pool = { M: poolList.length, N: denom, cellPop: new Map(), tails: new Map() }
  if (baselined) {
    logFact(pool.M)                          // size the factorial cache once
    poolList.forEach((p) => {
      CELL_LENSES.forEach((lens) => {
        p.cells[lens].forEach((k) => pool.cellPop.set(k, (pool.cellPop.get(k) || 0) + 1))
      })
    })
  }

  // ── OBSERVED ──────────────────────────────────────────────────────────────
  const observed = {}
  FAMILIES.forEach((fam) => {
    if (pairHit[fam]) observed[fam] = pairStrength(list, fam)
    else if (baselined) observed[fam] = cellStrength(list, fam, pool)
    else observed[fam] = { strength: 0, p: 1, cell: null }
  })

  // Candidate echoes, before any gate. Built here so the null can be skipped
  // entirely on the (common) night where nothing at all lines up.
  const byCell = (lens) => {
    const groups = new Map()
    list.forEach((p) => p.cells[lens].forEach((k) => {
      if (!groups.has(k)) groups.set(k, [])
      groups.get(k).push(p)
    }))
    return [...groups.entries()].filter(([, g]) => g.length >= 2).sort((a, b) => b[1].length - a[1].length)
  }

  const candidates = []

  // 1. cross-name — his most specific example, so it leads the structural order
  if (observed['cross-name'].hits.length) {
    const hits = observed['cross-name'].hits
    const names = [...new Set(hits.flat().map((p) => p.display))]
    const pairText = hits.map(([a, b]) => `${a.display} and ${b.display}`)
    candidates.push({
      kind: 'cross-name', fam: 'cross-name', label: 'first name / surname',
      names, count: hits.length, expected: null,
      detail: hits.length === 1
        ? `One hitter's first name is another's surname, among the ${denom} who homered tonight.`
        : `${hits.length} pairs where one hitter's first name is another's surname, among the ${denom} who homered tonight.`,
      phrase: `${joinNames(pairText)} — a first name that is somebody else's surname, among the ${denom} hitters who homered tonight.`,
    })
  }

  // 2. shared first name — Pete and Pete
  byCell('shared-first').forEach(([cell, g]) => {
    const nm = g[0].firstWord.replace(/^./, (c) => c.toUpperCase())
    candidates.push({
      kind: 'shared-first', fam: 'shared-first', label: 'same first name', cell,
      names: g.map((p) => p.display), count: g.length,
      expected: baselined ? (denom * (pool.cellPop.get(cell) || 0)) / pool.M : null,
      detail: `${g.length} of the ${denom} hitters who homered tonight are called ${nm}.`,
      phrase: `${joinNames(g.map((p) => p.display))} — ${g.length} of the ${denom} hitters who homered tonight are called ${nm}.`,
    })
  })

  // 3. shared surname
  byCell('shared-last').forEach(([cell, g]) => {
    const nm = g[0].lastWords.map((w) => w.replace(/^./, (c) => c.toUpperCase())).join(' ')
    candidates.push({
      kind: 'shared-last', fam: 'shared-last', label: 'same surname', cell,
      names: g.map((p) => p.display), count: g.length,
      expected: baselined ? (denom * (pool.cellPop.get(cell) || 0)) / pool.M : null,
      detail: `${g.length} of the ${denom} hitters who homered tonight share the surname ${nm}.`,
      phrase: `${joinNames(g.map((p) => p.display))} — ${g.length} of the ${denom} hitters who homered tonight share the surname ${nm}.`,
    })
  })

  // 4. near-miss spelling — Bryce and Brice
  if (observed['near-miss'].hits.length) {
    const hits = observed['near-miss'].hits
    const names = [...new Set(hits.flat().map((p) => p.display))]
    const pairText = hits.map(([a, b]) => `${a.display} and ${b.display}`)
    candidates.push({
      kind: 'near-miss', fam: 'near-miss', label: 'one letter apart',
      names, count: hits.length, expected: null,
      detail: hits.length === 1
        ? `Two of the ${denom} hitters who homered tonight carry names one letter apart.`
        : `${hits.length} pairs among the ${denom} hitters who homered tonight carry names one letter apart.`,
      phrase: `${joinNames(pairText)} — names one letter apart, among the ${denom} hitters who homered tonight.`,
    })
  }

  // 5. cadence — Bobby Witt, Tommy White. Only when the spelling corroborates
  //    the syllable count (see CADENCE CORROBORATION above).
  byCell('cadence').forEach(([cell, g]) => {
    const why = corroborate(g)
    if (!why) return
    const [fs, ls] = cell.slice(2).split('-')
    const shape = `${fs}-syllable first name, ${ls}-syllable surname`
    candidates.push({
      kind: 'cadence', fam: 'cadence', label: 'same cadence', cell,
      names: g.map((p) => p.display), count: g.length,
      expected: baselined ? (denom * (pool.cellPop.get(cell) || 0)) / pool.M : null,
      detail: `${g.length} of the ${denom} hitters who homered tonight scan the same way — ${shape} — and ${why}.`,
      phrase: `${joinNames(g.map((p) => p.display))} — ${g.length} of the ${denom} hitters who homered tonight scan the same way (${shape}), and ${why}.`,
      approxSyllables: true,
    })
  })

  // 6. hot initial — "all the j names are going"
  byCell('initial').forEach(([cell, g]) => {
    if (g.length < 3) return                 // a raw floor under the statistics:
    // two of anything is never "an initial running hot", however small the pool
    // rate is. The p can be tiny for a rare letter and the sentence would still
    // be silly.
    const [, side, letter] = cell.split(':')
    const where = side === 'f' ? 'first names' : 'surnames'
    candidates.push({
      kind: 'initial', fam: 'initial', label: `${letter.toUpperCase()} ${side === 'f' ? 'first names' : 'surnames'}`, cell,
      names: g.map((p) => p.display), count: g.length,
      expected: baselined ? (denom * (pool.cellPop.get(cell) || 0)) / pool.M : null,
      detail: `${g.length} of the ${denom} hitters who homered tonight have ${where} starting with ${letter.toUpperCase()}.`,
      phrase: `${joinNames(g.map((p) => p.display))} — ${g.length} of the ${denom} hitters who homered tonight have ${where} starting with ${letter.toUpperCase()}.`,
    })
  })

  if (!candidates.length) return []

  // ── THE NULL ──────────────────────────────────────────────────────────────
  //
  // Draw `denom` names out of the pool, `trials` times, and run the exact same
  // six searches on each fake night. Two things come out:
  //
  //   per-family:  how often a random night's BEST result in that family is at
  //                least as strong as tonight's. This already contains the
  //                correction for 52 initials / every first name / every pair,
  //                because the fake night's search is allowed to pick its own
  //                winner too.
  //   global:      how often a random night's best result in ANY family beats
  //                tonight's family p. This is the "you'd always find
  //                something" number, and it is the honest headline.
  //
  // The trial's own family p is computed with itself included in the count.
  // That is the standard (1 + #{as extreme}) / (T + 1) convention, mildly
  // conservative, and it guarantees no p is ever reported as exactly zero.
  if (!baselined) {
    // STRUCTURAL FAMILIES ONLY, no chance figures, everything flagged.
    //
    // The initial family is dropped outright: "5 of 24 are J names" is a claim
    // about a rate and there is no rate here, so the sentence could only ever
    // be misleading. Cadence survives the cut — not because its rate is known
    // (it isn't) but because the corroboration rule means the thing we'd print
    // is a fact you can see in the spelling (both first names end in y, both
    // surnames start with W) rather than a count against an unknown baseline.
    // Ordered by how specific the coincidence is rather than by any p, because
    // there is no p: a first name that is somebody else's surname is a much
    // narrower thing to have happened than two men sharing a first name.
    const order = { 'cross-name': 0, 'shared-last': 1, 'near-miss': 2, 'cadence': 3, 'shared-first': 4 }
    return candidates
      .filter((c) => c.fam in order)
      .sort((a, b) => (order[a.fam] - order[b.fam]) || (b.count - a.count))
      .slice(0, max)
      .map((c) => ({
        ...c, denom, p: null, pAny: null, baselined: false,
        note: 'No slate to measure against tonight, so this says the names line up and nothing about whether that is unusual — with ~25 homers, some of them always do.',
      }))
  }

  const strengths = {}
  FAMILIES.forEach((f) => { strengths[f] = new Float64Array(trials) })
  const mats = { 'cross-name': pairMatrix(poolList, 'cross-name'), 'near-miss': pairMatrix(poolList, 'near-miss') }
  const rand = mulberry32(seedFrom(list.map((p) => `${p.firstKey}.${p.lastKey}`).sort().join('|') + `#${pool.M}`))
  const idx = poolList.map((_, i) => i)
  const draw = new Array(denom)
  const drawIdx = new Int32Array(denom)
  for (let t = 0; t < trials; t += 1) {
    // Partial Fisher-Yates: shuffle only the first `denom` slots, which is a
    // draw without replacement. The array is left shuffled between trials on
    // purpose — re-seeding or restoring it would cost more than it buys and
    // a partially shuffled deck is still uniformly random for the next draw.
    for (let i = 0; i < denom; i += 1) {
      const j = i + Math.floor(rand() * (pool.M - i))
      const tmp = idx[i]; idx[i] = idx[j]; idx[j] = tmp
      drawIdx[i] = idx[i]
      draw[i] = poolList[idx[i]]
    }
    for (let f = 0; f < FAMILIES.length; f += 1) {
      const fam = FAMILIES[f]
      strengths[fam][t] = mats[fam] ? pairCount(drawIdx, mats[fam], pool.M) : cellStrength(draw, fam, pool).strength
    }
  }
  // Sorted copies, so "how many trials were at least this strong" is a binary
  // search rather than a scan — this is called once per candidate and once per
  // trial per family.
  const sorted = {}
  FAMILIES.forEach((f) => { sorted[f] = Float64Array.from(strengths[f]).sort() })
  const atLeast = (f, s) => {
    const a = sorted[f]
    let lo = 0
    let hi = a.length
    while (lo < hi) { const mid = (lo + hi) >> 1; if (a[mid] >= s) hi = mid; else lo = mid + 1 }
    return a.length - lo
  }
  const famP = (f, s) => (1 + atLeast(f, s)) / (trials + 1)
  // Each fake night's own best (smallest) family p — the null for "something,
  // anything, at least this striking".
  const globalMin = new Float64Array(trials)
  for (let t = 0; t < trials; t += 1) {
    let best = 1
    FAMILIES.forEach((f) => { const p = famP(f, strengths[f][t]); if (p < best) best = p })
    globalMin[t] = best
  }
  const globalSorted = Float64Array.from(globalMin).sort()
  const anyP = (p) => {
    let lo = 0
    let hi = globalSorted.length
    while (lo < hi) { const mid = (lo + hi) >> 1; if (globalSorted[mid] > p) hi = mid; else lo = mid + 1 }
    return (1 + lo) / (trials + 1)
  }

  const scored = candidates.map((c) => {
    // A cell candidate is judged on ITS OWN cell's tail, not the family's best
    // — two candidates in one family (say two different repeated first names)
    // are different claims and the weaker one must not inherit the stronger
    // one's p.
    let strength = observed[c.fam].strength
    if (c.cell) {
      const m = pool.cellPop.get(c.cell) || 0
      const tail = m >= c.count ? poolTail(pool, m, c.count) : 1
      strength = tail >= 1 ? 0 : -Math.log(tail)
    }
    const p = famP(c.fam, strength)
    return { ...c, denom, p, pAny: anyP(p), baselined: true }
  })

  return scored
    .filter((c) => c.p <= alpha)
    .sort((a, b) => (a.p - b.p) || (b.count - a.count))
    .slice(0, max)
    .map((c) => ({
      ...c,
      note: c.expected == null
        ? `${chanceWords(c.p, trials)} throws up an echo of this kind, drawing ${denom} names at random from tonight's ${pool.M} bats.`
        : `Tonight's ${pool.M} bats say expect about ${c.expected.toFixed(1)}; there are ${c.count}. ${chanceWords(c.p, trials).replace(/^./, (x) => x.toUpperCase())} runs this far over.`,
    }))
}
