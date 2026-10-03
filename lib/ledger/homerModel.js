// MOONSHOT'S HOMER LEDGER, THE NUMBERS (2026-10-03, out of
// components/HomerLedger.js, where it was a 400-line useMemo). Pure: tonight's
// homer rows + the slate + the league's season totals + the people lookup in,
// the ledger's model out -- cards (one per homer hitter, numbered, tagged),
// homers by lineup spot, repeats, digit roots, name echoes, the alignments and
// "fits tonight's pattern, hasn't gone yet". Moved verbatim; the comments
// that explain each rule moved with it. The component draws, this counts.
import { nameOf, teamOf, n, clean } from '../player'
import { axesOf } from '../alignments'
import { findNameEchoes, nameParts, pairEcho, cadenceShape } from '../namePatterns'
import { digitRoot } from '../numerology/core'

/** 17 -> "17th". */
export const ord = (v) => {
  const k = v % 10, h = v % 100
  return `${v}${k === 1 && h !== 11 ? 'st' : k === 2 && h !== 12 ? 'nd' : k === 3 && h !== 13 ? 'rd' : 'th'}`
}

// "show players who landed that hit and possible align[ment]" — the why
// text under each tag names the other hitter(s), not just a count.
const joinNames = (names) => {
  if (names.length <= 1) return names[0] || ''
  if (names.length === 2) return names.join(' and ')
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`
}

/** rows: tonight's homers (live snapshot + graded); players: the slate; seasonHr: pid -> the league's totals; people: usePeople's Map. */
export function homerModel({ rows, players, seasonHr, people }) {
  if (!rows?.length) return null
  // THE BUG THAT BLANKED EVERY NUMBER (2026-08-09): this keyed the map with
  // playerId(), which returns a COMPOSITE "id-gamePk" string — Number() of
  // that is NaN, so every lookup missed, every season count fell back to
  // "—" and every lineup spot vanished. The graded rows publish the plain
  // numeric player_id; the slate rows carry the same one. Join on it.
  const byId = new Map(players.map((p) => [Number(p?.player_id ?? p?.id), p]))
  const spots = Array(10).fill(0)          // index 1..9
  const cards = []
  let total = 0
  rows.forEach(({ pid, hr, events, liveName, fileName, fileTeam, fileSpot }) => {
    const p = byId.get(pid)
    total += hr
    const spot = Number(p?.lineup_spot ?? fileSpot)
    if (spot >= 1 && spot <= 9) spots[spot] += hr
    // Authoritative first; slate arithmetic only as a marked fallback.
    const numRec = seasonHr?.get(pid) || null
    const exact = numRec?.hr
    const pre = p?.season_hr == null ? null : n(p.season_hr, 0)
    const nth = Number.isFinite(exact) ? exact : (pre == null ? null : pre + hr)
    // EVERY number he reached tonight, not just the last one — a two-homer
    // night from 14 covers 15 AND 16, and 15 is the one worth saying.
    const tonightNums = nth == null ? [] : Array.from({ length: hr }, (_, i) => nth - i).filter((v) => v > 0)
    const round = tonightNums.filter((v) => v % 5 === 0)
    const jersey = numRec?.jersey ?? null
    cards.push({
      pid, p, hr, events: events || [],
      // The live feed carries fullName, so a homer from a hitter the bot
      // never scored renders as a person instead of as "#650968".
      name: p ? nameOf(p) : (clean(liveName, '') || clean(fileName, '') || `#${pid}`),
      team: p ? teamOf(p) : clean(fileTeam, ''),
      spot: spot >= 1 && spot <= 9 ? spot : null,
      nth,
      exact: Number.isFinite(exact),
      tonightNums,
      milestone: round.length > 0,
      roundNum: round[0] ?? null,
      // numerology (2026-08-13) — jersey + birthday, reduced the same way
      // as the homer-count root above. null when the league has no number
      // on file for him (rare) rather than guessed.
      jersey,
      jerseyRoot: jersey != null ? digitRoot(jersey) : null,
      dayRoot: numRec?.dayRoot ?? null,
      lifePath: numRec?.lifePath ?? null,
    })
  })
  // ── ORDERED BY ALIGNMENT, THEN BY THE MILESTONE (2026-09-03) ─────────
  //
  // Donovan: "for the ledger make sure homers are ordered by alignments as
  // best as possible."
  //
  // This strip was sorted on `nth` alone -- 32nd, 28th, 16th, 15th -- which
  // is the SEASON COUNT, and the season count is the one thing on the chip
  // that has nothing to do with why this panel exists. The whole subject of
  // the ledger is who is lining up with the night's numbers; the 🧲 badge is
  // that answer and it was scattered down the row at random while a big
  // meaningless number led.
  //
  // THE SORT HAD TO MOVE, not just change. `c.tags` is not assigned until
  // the alignment pass ~120 lines below this point, so sorting on tag count
  // here would have read undefined on every card and silently degraded to
  // the old nth order -- a change that builds, ships, and does nothing.
  cards.sort((a, b) => (b.nth ?? -1) - (a.nth ?? -1))
  const spotMax = Math.max(...spots.slice(1), 1)
  const placed = spots.slice(1).reduce((a, b) => a + b, 0)
  const topSpot = spots.indexOf(Math.max(...spots.slice(1)))

  // ── THE REPEATS (2026-08-09, Donovan: "if 8 people hit their 17th, does
  // that make sense") — the whole point of the ledger. Two lenses:
  //
  //   SAME NUMBER  three hitters all notching their 17th tonight is the
  //                pattern he's watching for, stated plainly with the names.
  //   DIGIT ROOT   standard numerology: sum the digits until one remains
  //                (17 → 1+7 = 8). The bot already speaks this language —
  //                numerology_score ships on every slate row — so the
  //                ledger reads the night the same way.
  //
  // Both are PATTERN SPOTTING, not evidence, and the strip says so. A
  // slate is ~25 homers over numbers 1–50; clusters happen by arithmetic
  // alone. It's here because it's fun to watch and Donovan wanted the
  // trend visible, not because it predicts anything.
  const numbered = cards.filter((c) => c.nth != null)
  const byNumber = new Map()
  const byRoot = new Map()
  // digitRoot lives at module scope now (2026-08-13) — the fetch effect
  // above needs it too, for jersey/birthday reduction.
  numbered.forEach((c) => {
    if (!byNumber.has(c.nth)) byNumber.set(c.nth, [])
    byNumber.get(c.nth).push(c)
    const r = digitRoot(c.nth)
    if (!byRoot.has(r)) byRoot.set(r, [])
    byRoot.get(r).push(c)
  })
  const repeats = [...byNumber.entries()]
    .filter(([, list]) => list.length >= 2)
    .sort((a, b) => b[1].length - a[1].length)
    .map(([num, list]) => ({ num, list }))
  const roots = [...byRoot.entries()]
    .map(([root, list]) => ({ root, list }))
    .sort((a, b) => b.list.length - a.list.length)
  const topRoot = roots[0] && roots[0].list.length >= 3 ? roots[0] : null

  // ── JERSEY + BIRTHDAY CLUSTERS (2026-08-13) ───────────────────────────
  // Same shape as byNumber/byRoot above, three more lenses: the literal
  // jersey number, its digit root, and the two birthday reductions. Built
  // over ALL cards, not just `numbered` — a jersey and a birthday exist
  // whether or not his season-HR count came back.
  const byJersey = new Map(), byJerseyRoot = new Map(), byDayRoot = new Map(), byLifePath = new Map()
  const bucket = (map, key, c) => { if (key == null) return; if (!map.has(key)) map.set(key, []); map.get(key).push(c) }
  cards.forEach((c) => {
    bucket(byJersey, c.jersey, c)
    bucket(byJerseyRoot, c.jerseyRoot, c)
    bucket(byDayRoot, c.dayRoot, c)
    bucket(byLifePath, c.lifePath, c)
  })
  const topOf = (map, min) => {
    const best = [...map.entries()].map(([root, list]) => ({ root, list })).sort((a, b) => b.list.length - a.list.length)[0]
    return best && best.list.length >= min ? best : null
  }
  // Same >=3 bar as topRoot for the root-level lenses (nine buckets, small
  // sample — a real bar to clear before it's "the" root of the night).
  // Exact jersey number is a much rarer coincidence, so two is enough.
  const topJerseyRoot = topOf(byJerseyRoot, 3)
  const topDayRoot = topOf(byDayRoot, 3)
  const topLifePath = topOf(byLifePath, 3)

  // ── 🧲 WHO IS ALIGNING WITH THE NIGHT (2026-08-09) ────────────────────
  //
  // Donovan: "the ledger is supposed to show people who are aligning with
  // what's going on."
  //
  // The panel had all the raw material — the shared numbers, the hot lineup
  // spot, the digit root — but it printed each as its own separate strip and
  // left you to cross-reference them yourself. The question it should answer
  // in one look is the other way round: WHICH HITTERS TONIGHT SIT INSIDE
  // MORE THAN ONE OF THOSE PATTERNS.
  //
  // Three tags, all computed from what's already here:
  //   #N     his homer number is one several hitters reached tonight
  //   SPOT   he hit from the lineup spot leading the night (3+ homers)
  //   ROOT   his number reduces to the digit root the night keeps landing on
  //
  // Ranked by how many he carries. This is PATTERN SPOTTING and the strip
  // says so — a slate is ~25 homers over numbers 1–50 and nine lineup spots,
  // so overlaps happen by arithmetic alone. It's here because Donovan wants
  // the trend visible while it forms, not because it predicts anything.
  const repeatNums = new Set(repeats.map((r) => r.num))
  const hotSpot = spots[topSpot] >= 3 ? topSpot : null
  const rootNum = topRoot ? topRoot.root : null
  const others = (list, self) => list.filter((x) => x.pid !== self.pid).map((x) => x.name)
  cards.forEach((c) => {
    const tags = []
    if (c.nth != null && repeatNums.has(c.nth)) tags.push({ k: 'num', label: `${ord(c.nth)} club`, why: `${joinNames(others(byNumber.get(c.nth), c))} also reached ${ord(c.nth)} tonight.` })
    if (hotSpot && c.spot === hotSpot) tags.push({ k: 'spot', label: `${ord(hotSpot)} spot`, why: `The ${ord(hotSpot)} spot leads the night with ${spots[hotSpot]} homers.` })
    if (rootNum && c.nth != null && digitRoot(c.nth) === rootNum) tags.push({ k: 'root', label: `root ${rootNum}`, why: `${topRoot.list.length} of tonight's numbered homers reduce to ${rootNum}.` })

    // NUMEROLOGY (2026-08-13) — jersey + birthday, same "Aligning" home as
    // the three above, not a separate section. Two flavors:
    //
    //   OWN    self-alignment, no other hitter needed — his own jersey
    //          number lines up with the homer he just hit. The single
    //          most "aligning" thing this panel can say, so it alone is
    //          enough to earn a spot below (see the `aligned` filter).
    //   jersey/bday   the same cross-hitter clustering as `num`/`root`,
    //          just two more lenses on top of the homer count.
    if (c.jersey != null && c.nth != null && (c.jersey === c.nth || (c.jerseyRoot != null && c.jerseyRoot === digitRoot(c.nth)))) {
      tags.push({
        k: 'own',
        label: `own #${c.jersey}`,
        why: c.jersey === c.nth
          ? `He wears #${c.jersey} — this was his ${ord(c.nth)} homer of the season.`
          : `He wears #${c.jersey} (reduces to ${c.jerseyRoot}), the same root as his ${ord(c.nth)} homer tonight.`,
      })
    }
    const jerseyMates = c.jersey != null ? others(byJersey.get(c.jersey) || [c], c) : []
    if (jerseyMates.length) {
      tags.push({ k: 'jersey', label: `#${c.jersey} too`, why: `${joinNames(jerseyMates)} also wears #${c.jersey} tonight.` })
    } else if (topJerseyRoot && c.jerseyRoot === topJerseyRoot.root) {
      tags.push({ k: 'jroot', label: `#→${topJerseyRoot.root}`, why: `${topJerseyRoot.list.length} jersey numbers tonight reduce to ${topJerseyRoot.root}: ${joinNames(others(topJerseyRoot.list, c))}.` })
    }
    if (topDayRoot && c.dayRoot === topDayRoot.root) {
      tags.push({ k: 'bday', label: `day ${topDayRoot.root}`, why: `${topDayRoot.list.length} birthdays tonight reduce to day-number ${topDayRoot.root}: ${joinNames(others(topDayRoot.list, c))}.` })
    }
    if (topLifePath && c.lifePath === topLifePath.root) {
      tags.push({ k: 'path', label: `path ${topLifePath.root}`, why: `${topLifePath.list.length} life-path numbers tonight land on ${topLifePath.root}: ${joinNames(others(topLifePath.list, c))}.` })
    }
    c.tags = tags
  })

  // Now that every card carries its tags, order the strip by them. Tag
  // count first, the milestone as the tiebreak, so nothing is lost: among
  // men who align equally the biggest number still leads, and an untagged
  // 32nd homer still sits above an untagged 3rd. `own` counts once like any
  // other tag -- the aligned section below already gives it its own
  // privilege, and doubling it here would rank a self-alignment above a man
  // matching three other hitters.
  cards.sort((a, b) => (b.tags?.length || 0) - (a.tags?.length || 0)
    || (b.nth ?? -1) - (a.nth ?? -1))
  // `own` alone qualifies — it doesn't need a second, unrelated tag to be
  // worth showing (see the comment above). Everything else still needs
  // two or more to clear the "more than arithmetic" bar.
  const aligned = cards
    .filter((c) => c.tags.length >= 2 || c.tags.some((t) => t.k === 'own'))
    .sort((a, b) => b.tags.length - a.tags.length)

  // ── WHO LINES UP NEXT (2026-08-17) ─────────────────────────────────────
  // Donovan: "i need the ledger to have some prediction of players that
  // align as well." The alignment strip only ever looked BACKWARD — it
  // tagged men after they homered. This looks at the same three numbers the
  // night is landing on and asks who on the slate, not yet in the ledger,
  // is standing on one of them:
  //   · his NEXT homer (season_hr + 1) reduces to tonight's leading root
  //   · his next homer is a number several hitters already reached tonight
  //   · he bats in the spot leading the night (3+ homers)
  //   · his jersey reduces to tonight's leading root
  // Every reason is stated on the chip. This is the same pattern-watching
  // the strip above discloses — counted, never scored, and the panel says
  // so. Ranked by the bot's HR score among the aligned, because if the
  // night's numbers are calling somebody, the bat still has to answer.
  const homered = new Set(cards.map((c) => c.pid))

  // ── THE NAME LENS, WIRED INTO THE WATCH (2026-08-23) ───────────────────
  // Donovan: "the patterns being seen numerology and gematria and names wise
  // — all the J names are going, who's a J tonight that looks good that can
  // go later or now."
  //
  // findNameEchoes already answers the backward half every night ("5 of the
  // 13 who homered have B surnames") and NamePatterns.js renders it. What it
  // never did was turn around: if the J names are running, WHO ELSE IS A J
  // and still has bats coming. That turn is the whole ask, and it is one
  // function call plus a match, because the echo already knows which letter
  // or which shared name it fired on.
  //
  // The deliberate line from NamePatterns.js still holds: a name never
  // touches a SCORE, and it never becomes a tag on a man who already
  // homered. It lives here, in the watch, where the whole panel is disclosed
  // as pattern-watching and nothing is graded.
  const nameAxes = []
  findNameEchoes(cards, players).forEach((e) => {
    if (e.kind === 'initial') {
      const bits = String(e.cell || '').split(':')
      const side = bits[1]; const letter = bits[2]
      if (!letter) return
      const where = side === 'f' ? 'first names' : 'surnames'
      nameAxes.push({
        letterKey: `${side}:${letter}`,
        chip: `${letter.toUpperCase()} ${side === 'f' ? 'name' : 'surname'}`,
        why: `${e.count} of tonight's homers have ${where} starting with ${letter.toUpperCase()} — ${joinNames(e.names)} — and so does he`,
        test: (parts) => !!parts && String((side === 'f' ? parts.firstKey : parts.lastKey) || '').slice(0, 1) === letter,
      })
    } else if (e.kind === 'shared-first' || e.kind === 'shared-last') {
      // Keyed off the echo's OWN names rather than its cell string, so a
      // change to how cells are spelled upstream can never silently turn
      // this into a match on nothing.
      const last = e.kind === 'shared-last'
      const seed = nameParts(e.names?.[0] || '')
      const key = seed && (last ? seed.lastKey : seed.firstKey)
      if (!key) return
      const shown = String(e.names?.[0] || '').split(' ')
      nameAxes.push({
        chip: last ? `the ${shown[shown.length - 1]}s` : `the ${shown[0]}s`,
        why: `${e.count} hitters sharing that ${last ? 'surname' : 'first name'} went deep tonight — ${joinNames(e.names)} — and he is one too`,
        test: (parts) => !!parts && String((last ? parts.lastKey : parts.firstKey) || '') === key,
      })
    }
  })

  // THE PLAIN HOT INITIAL, BELOW THE STATISTICAL BAR (2026-08-23).
  //
  // findNameEchoes is deliberately strict: it runs a null against the
  // night's own pool and stays silent unless the run is genuinely striking,
  // which is the right bar for a panel that PRINTS A FINDING. It is the
  // wrong bar for a watch. Three J names out of thirteen is exactly what
  // Donovan means by "all the J names are going" and it will usually not
  // clear a p-value — refusing to look at it is not honesty, it is just a
  // different way of being unhelpful.
  //
  // So: if a letter has three or more of tonight's homers and the strict
  // pass did not already fire on that letter, it still becomes an axis —
  // wearing the count, and saying in its own tooltip that a run this size is
  // ordinary. Watched, disclosed, never scored. Same posture as the digit
  // roots two strips up.
  const strictInitials = new Set(nameAxes.map((ax) => ax.letterKey).filter(Boolean))
  ;['f', 'l'].forEach((side) => {
    const tally = new Map()
    cards.forEach((c) => {
      const parts = nameParts(c.name)
      const letter = String((side === 'f' ? parts?.firstKey : parts?.lastKey) || '').slice(0, 1)
      if (!letter) return
      if (!tally.has(letter)) tally.set(letter, [])
      tally.get(letter).push(c.name)
    })
    const best = [...tally.entries()].sort((a, b) => b[1].length - a[1].length)[0]
    if (!best || best[1].length < 3) return
    const [letter, names] = best
    if (strictInitials.has(`${side}:${letter}`)) return
    const where = side === 'f' ? 'first names' : 'surnames'
    nameAxes.push({
      letterKey: `${side}:${letter}`,
      chip: `${letter.toUpperCase()} ${side === 'f' ? 'name' : 'surname'} ${names.length}`,
      why: `${names.length} of tonight's homers have ${where} starting with ${letter.toUpperCase()} — ${joinNames(names)} — and so does he. A run this size is ordinary on a full slate; it is being watched, not counted as evidence`,
      test: (parts) => !!parts && String((side === 'f' ? parts.firstKey : parts.lastKey) || '').slice(0, 1) === letter,
    })
  })

  // ── THE MATCHING GAME (2026-08-23) ────────────────────────────────────
  // Donovan: "same first name — if one goes the other might go. Brice /
  // Bryce Eldridge. Luis Rob / Luis Torrens. Pete and Pete Alonso. Names
  // that rhyme, same jersey numbers, the syllable thing. Almost-matching,
  // like a matching game."
  //
  // The lens above is about the NIGHT (a letter running hot). This one is
  // about a PAIR: one man went deep, and somebody still to bat is his twin
  // on a name or on a number. Different question, different answer, and the
  // pair is the one he actually plays — so the chip names the partner and
  // says what they share.
  //
  // Cadence is gated on rarity: a 2-1 syllable shape fits a big share of any
  // slate, and as a pair reason it would fire on dozens of men a night. Only
  // shapes carried by fewer than an eighth of tonight's bats are allowed to
  // count, which leaves the odd ones (the 1-2s, the 3-1s) doing the work.
  const shapeShare = new Map()
  players.forEach((pl) => {
    const sh = cadenceShape(nameParts(nameOf(pl)))
    if (sh) shapeShare.set(sh, (shapeShare.get(sh) || 0) + 1)
  })
  const rareShape = (sh) => !!sh && (shapeShare.get(sh) || 0) <= Math.max(2, Math.floor(players.length / 8))
  // "↔ Jr." IS NOT A NAME (2026-08-23). The chip took the last word of the
  // partner's name, which for Fernando Tatis Jr. and Luis Robert Jr. is the
  // suffix — so a row of matches all read "↔ Jr." and named nobody. Suffixes
  // are dropped, and a hyphenated surname keeps its first half so
  // Crow-Armstrong does not push the row onto three lines.
  const SUFFIX = /^(jr|sr|ii|iii|iv|v)\.?$/i
  const shortName = (full) => {
    const words = String(full || '').trim().split(/\s+/).filter((w) => !SUFFIX.test(w))
    const last = words[words.length - 1] || String(full || '')
    return last.split('-')[0]
  }
  const homerTwins = cards.map((c) => ({ card: c, parts: nameParts(c.name) })).filter((h) => h.parts)

  // ── WHO LINES UP NEXT (2026-08-17, widened 2026-08-23) ─────────────────
  // The strip above only ever looked BACKWARD — it tagged men after they
  // homered. This asks who on the slate is standing on whatever the night is
  // landing on, and has not gone yet:
  //   · his NEXT homer (season_hr + 1) reduces to tonight's leading root
  //   · his next homer is a number several hitters already reached tonight
  //   · he bats in the spot leading the night
  //   · his jersey reduces to tonight's leading root
  //   · his birth day reduces to the day-number the night keeps landing on
  //   · his life path is the life path the night keeps landing on
  //   · his name carries tonight's running echo (the J names, the Petes)
  // Every reason is stated on the chip. Counted and disclosed, never scored.
  // Ranked by how many axes he sits on, then by the bot's HR score — if the
  // night's numbers are calling somebody, the bat still has to answer.
  const nextUp = []
  if (rootNum || hotSpot || repeatNums.size || nameAxes.length || topDayRoot || topLifePath) {
    players.forEach((pl) => {
      const pid = Number(pl?.player_id)
      if (!pid || homered.has(pid)) return
      const a = axesOf(pl, people)
      const nextHr = n(pl?.season_hr, 0) + 1
      const spot = Number(pl?.lineup_spot)
      const jersey = n(pl?.jersey_number, 0)
      const why = []
      const chips = []
      if (rootNum && digitRoot(nextHr) === rootNum) { chips.push(`root ${rootNum}`); why.push(`his next homer (#${nextHr}) lands on tonight's root ${rootNum}`) }
      if (repeatNums.has(nextHr)) { chips.push(`#${nextHr} again`); why.push(`his next is #${nextHr} — a number already hit ${(repeats.find((r) => r.num === nextHr)?.list.length) || 2}× tonight`) }
      if (hotSpot && spot === hotSpot) { chips.push(`${ord(hotSpot)} spot`); why.push(`bats ${ord(hotSpot)} — the spot leading the night with ${spots[hotSpot]}`) }
      if (rootNum && jersey > 0 && digitRoot(jersey) === rootNum) { chips.push(`#${jersey}→${rootNum}`); why.push(`jersey #${jersey} reduces to tonight's root ${rootNum}`) }
      if (topDayRoot && a.axes.day && a.axes.day === topDayRoot.root) { chips.push(`day ${topDayRoot.root}`); why.push(`born on the ${String(a.birthDate).slice(8, 10)} — day-number ${topDayRoot.root}, where ${topDayRoot.list.length} of tonight's homers sit`) }
      if (topLifePath && a.axes.path && a.axes.path === topLifePath.root) { chips.push(`path ${topLifePath.root}`); why.push(`life path ${topLifePath.root} — the path ${topLifePath.list.length} of tonight's homers land on`) }
      nameAxes.forEach((ax) => { if (ax.test(a.parts)) { chips.push(ax.chip); why.push(ax.why) } })
      // the pair lenses — his twin already went deep tonight
      let twins = 0
      homerTwins.forEach((h) => {
        if (twins >= 2 || h.card.pid === pid) return
        const shared = pairEcho(h.parts, a.parts, { cadenceOk: rareShape(cadenceShape(a.parts)) })
        if (shared) {
          twins += 1
          chips.push(`↔ ${shortName(h.card.name)}`)
          why.push(`${h.card.name} went deep tonight and they share ${shared}`)
          return
        }
        // SAME NUMBER ON THE BACK. Not the digit root the strip above uses —
        // the actual jersey, twice on one slate, which is the version of
        // this he asked for by name.
        const mine = a.jersey || null
        if (mine && Number(h.card.jersey) === Number(mine)) {
          twins += 1
          chips.push(`#${mine} too`)
          why.push(`${h.card.name} wears #${mine} and went deep tonight — so does he`)
        }
      })
      if (!why.length) return
      nextUp.push({ p: pl, pid, name: nameOf(pl), why, chips, count: why.length, hrScore: n(pl?.hr_score, 0) })
    })
    nextUp.sort((a, b) => (b.count - a.count) || (b.hrScore - a.hrScore))
  }

  // topJerseyRoot/topDayRoot/topLifePath carried into the return (2026-08-18)
  // — they used to be local to this memo, only feeding the per-card `tags`
  // above. The archive effect below needs them too, so today's numerology
  // leaders (not just the homer-count root) can be written out for
  // Alignments to read back tomorrow.
  return { cards, spots, spotMax, total, placed, topSpot, repeats, roots, topRoot, numbered, aligned, hotSpot, nextUp: nextUp.slice(0, 20), topJerseyRoot, topDayRoot, topLifePath }
}
