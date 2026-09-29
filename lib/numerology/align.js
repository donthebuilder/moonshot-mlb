// THE ALIGNMENT ENGINE, ONE COPY (2026-09-29, numerology parity). Moved out
// of lib/alignments.js (MOONSHOT) where lib/nfl/alignments.js carried a
// verbatim port that differed only in which score it sorted by. Every sport
// builds its own rows ({ pid, name, axes, parts, ... } -- its axesOf) and
// hands this the score to rank by; the arithmetic, the expected counts and
// the honesty numbers are the same function for all of them.

export function alignedWithBy(root, rows = [], scoreOf = () => 0) {
  if (!(root >= 1 && root <= 9)) return null
  let axisTotal = 0
  const members = []
  rows.forEach((a) => {
    const keys = Object.entries(a.axes).filter(([, v]) => v != null)
    axisTotal += keys.length
    const hit = keys.filter(([, v]) => v === root).map(([k]) => k)
    if (hit.length) members.push({ a, keys: hit, strength: hit.length })
  })
  members.sort((x, y) => (y.strength - x.strength) || (scoreOf(y.a) - scoreOf(x.a)))
  // Every axis has a 1-in-9 chance of landing on any given root if the numbers
  // were arbitrary, which for jerseys and birthdays they very nearly are.
  const expectedMemberships = axisTotal / 9
  // P(at least two of a man's k axes land on this root), summed over the
  // slate — the honest baseline for "how many two-axis hits should tonight
  // have anyway", which is the number people mistake for a finding.
  const expectedTwoPlus = rows.reduce((sum, a) => {
    const k = Object.values(a.axes).filter((v) => v != null).length
    if (k < 2) return sum
    const q = 8 / 9
    const pNone = q ** k
    const pOne = k * (1 / 9) * (q ** (k - 1))
    return sum + (1 - pNone - pOne)
  }, 0)
  // ── NUMBERS FIRST, THEN THE BOT (2026-08-31) ──────────────────────────
  //
  // Donovan: "those predctions are base on the numbers first then how they
  // socred on the bot to help with predicting if that makes since."
  //
  // It makes complete sense, and it is the only ordering that can be defended.
  // The reduction is arithmetic — it SELECTS a set and claims nothing about
  // whether the men in it can hit. The bot's HR score is the part of this site
  // that has been graded against sixty nights of results. So the numbers
  // narrow, and the thing with a track record ranks what is left. Neither is
  // asked to do the other's job.
  //
  // Which makes one number worth computing and printing: the MEDIAN bot score
  // inside the aligned set against the median across the whole slate. If the
  // reduction were quietly selecting better bats, that gap would show. It is
  // the test of his own idea, run on his own data, and it is returned here so
  // the UI cannot show the list without it.
  const med = (xs) => {
    const a = xs.filter((v) => Number.isFinite(v)).sort((x, y) => x - y)
    if (!a.length) return null
    const m = Math.floor(a.length / 2)
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2
  }
  const twoPlusMembers = members.filter((m) => m.strength >= 2)
  return {
    root,
    members,
    total: members.length,
    twoPlus: twoPlusMembers.length,
    expectedMemberships,
    expectedTwoPlus,
    // The same aligned set, re-sorted by the only number here with a graded
    // record behind it. Strength stays on the chip so you can see which men
    // are carrying it twice and which three times.
    byBotScore: [...twoPlusMembers].sort((x, y) => (scoreOf(y.a) - scoreOf(x.a)) || (y.strength - x.strength)),
    medianScoreAligned: med(twoPlusMembers.map((m) => scoreOf(m.a))),
    medianScoreSlate: med(rows.map((a) => scoreOf(a))),
  }
}

/**
 * The whole slate, aligned: clubs (per root 1-9, with the arithmetic share),
 * braids (a player whose own axes agree) and name families (surnames at 2+,
 * first names at 3+). `rows` are already built by the sport's axesOf.
 */
export function alignModel(rows = [], scoreOf = () => 0) {

  const clubs = new Map()   // root -> { root, members: [{a, axisKeys}], count }
  for (let r = 1; r <= 9; r += 1) clubs.set(r, { root: r, members: [], count: 0 })
  rows.forEach((a) => {
    const byRoot = new Map()
    Object.entries(a.axes).forEach(([k, v]) => {
      if (v == null) return
      if (!byRoot.has(v)) byRoot.set(v, [])
      byRoot.get(v).push(k)
    })
    byRoot.forEach((axisKeys, root) => {
      const c = clubs.get(root)
      if (!c) return
      c.members.push({ a, axisKeys })
      c.count += axisKeys.length
    })
  })
  const totalMemberships = [...clubs.values()].reduce((s, c) => s + c.count, 0)

  // Braids: a hitter whose own numbers agree with each other.
  const braids = rows
    .map((a) => {
      const tally = new Map()
      Object.entries(a.axes).forEach(([k, v]) => {
        if (v == null) return
        if (!tally.has(v)) tally.set(v, [])
        tally.get(v).push(k)
      })
      let best = null
      tally.forEach((keys, root) => {
        if (keys.length >= 2 && (!best || keys.length > best.keys.length)) best = { root, keys }
      })
      return best ? { a, root: best.root, keys: best.keys, strength: best.keys.length } : null
    })
    .filter(Boolean)
    .sort((x, y) => (y.strength - x.strength) || (scoreOf(y.a) - scoreOf(x.a)))

  // Name families across the slate. Surnames at 2+, first names at 3+ —
  // pairs of a common first name are arithmetic, not a pattern.
  const first = new Map(); const last = new Map()
  const SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'v'])
  const seen = new Set()
  rows.forEach((a) => {
    if (!a.parts) return
    const key = `${a.parts.firstKey}|${a.parts.lastKey}`
    if (seen.has(key)) return   // doubleheader rows are one man
    seen.add(key)
    const push = (m, k) => { if (!k || SUFFIXES.has(k)) return; if (!m.has(k)) m.set(k, []); m.get(k).push(a) }
    push(first, a.parts.firstKey)
    push(last, a.parts.lastKey)
  })
  const names = []
  first.forEach((list, k) => { if (list.length >= 3) names.push({ kind: 'first', key: k, list }) })
  last.forEach((list, k) => { if (list.length >= 2) names.push({ kind: 'last', key: k, list }) })
  names.sort((x, y) => y.list.length - x.list.length)

  return { rows, clubs: [...clubs.values()], totalMemberships, braids, names }
}
