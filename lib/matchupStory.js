// ⚾ THE MATCHUP STORYLINE ENGINE (2026-08-09).
//
// WHY IT EXISTS. The storyline panel used to lead with slate-wide trivia —
// most homers on the slate, most career homers — and Donovan killed it:
// "most hr on the slate and most career hrs is not what I'm looking for."
// They were true and useless. A storyline has to be about TONIGHT'S MATCHUP.
//
// THE SHAPE HE ASKED FOR, in his words:
//   "Alonso has 4 HR in his last 6 at Citi and Gore has given up 3 in two
//    starts here"
// THIS hitter · THIS park · THIS arm, with a real count on BOTH sides of the
// "and". That last part is the whole spec, and it is enforced below: a line
// with only a batter clause, or only a pitcher clause, is not this sentence
// and is not returned.
//
// WHERE EVERY NUMBER COMES FROM — nothing is modelled, estimated or invented:
//   batter at this park   lib/venueHr.js venueRecord() — hitting gameLog
//                         (this season + last) joined to schedule gamePks for
//                         venue IDs. lastNHere() slices his last N games here.
//   pitcher at this park   lib/pitcherVenueHr.js pitcherVenueRecord() — the
//                         same join on the PITCHING gameLog, whose per-game
//                         homeRuns and gamesStarted fields were verified live
//                         before anything was built on them (see that file).
//   bvp_pa / bvp_ab / bvp_hits / bvp_hr   straight off the slate row, free.
//   pitcher_l3_hr9        straight off the slate row, free.
//
// THE HONESTY RULES, which are the point:
//   1. A clause is written only when its sample exists. "his last 6 games
//      here" requires SIX games here — lastNHere() returns null otherwise and
//      the clause is dropped rather than quietly rescaled to four.
//   2. Both sides or nothing. No batter clause, or no pitcher clause → null.
//   3. Nothing is padded to make a sentence. When a hitter has no history in
//      the building and the arm has never pitched there, that's a night with
//      no line for him, and the caller shows nothing.
//   4. The window is stated. Both records cover this season + last, and the
//      returned object carries `seasons` so the UI can put it in a tooltip.
//   5. Every number in `parts` is tagged 'num' so the UI can render it in the
//      mono font — the reader can see exactly which claims are counted.
//
// COST CONTROL. Each resolved player is up to 4 people/stats calls plus the
// schedule batches, and a pitcher's record is cached per pitcher+venue so the
// nine hitters in one game share a single pull. Callers should hand this a
// SHORT list of candidates (rank() below does that cheaply, off slate fields
// alone) rather than a whole slate.

import { venueRecord, lastNHere } from './venueHr'
import { pitcherVenueRecord } from './pitcherVenueHr'

const num = (v, d = null) => { const x = Number(v); return Number.isFinite(x) ? x : d }
const nameOf = (p) => String(p?.name || p?.player || p?.player_name || '').trim()

// Suffix-aware last name: "Bobby Witt Jr." → "Witt", never a bare "Jr.".
const SUFFIX = /^(jr\.?|sr\.?|ii|iii|iv|v)$/i
export function armName(full) {
  const parts = String(full || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return ''
  let last = parts.pop()
  if (SUFFIX.test(last) && parts.length) last = parts.pop()
  return last
}

// SHORT PARK NAME, conservatively. "Citi Field" → "Citi" is how people say
// it; "Great American Ball Park" → "Great American Ball" is not. So the
// trailing generic is dropped ONLY when exactly one word is left standing,
// and Stadium is never dropped (nobody says "at Yankee").
const PARK_TAIL = /\s+(field|park|ballpark)$/i
export function shortPark(venueName) {
  const v = String(venueName || '').trim()
  if (!v) return ''
  const stripped = v.replace(PARK_TAIL, '').trim()
  if (stripped && stripped !== v && !/\s/.test(stripped)) return stripped
  return v
}

const plural = (n2, word) => `${word}${n2 === 1 ? '' : 's'}`

// ── the cheap pre-rank ───────────────────────────────────────────────────────
// Which players are even worth spending API calls on. Slate fields only, no
// network. Deliberately generous: it decides who we LOOK at, and the honesty
// gate below decides who actually gets a sentence.
export function candidateScore(p) {
  if (!p) return -1
  if (!num(p.player_id) || !num(p.pitcher_id) || !String(p.venue_name || '').trim()) return -1
  let s = num(p.hr_score, 0) || 0
  if (num(p.bvp_hr, 0) >= 1) s += 25
  if (num(p.bvp_pa, 0) >= 8) s += 8
  if (num(p.pitcher_l3_hr9, 0) >= 1.5) s += 12
  if (num(p.games_since_last_hr, 99) === 0) s += 8
  return s
}

// ── one player ───────────────────────────────────────────────────────────────
// → null, or { pid, player, text, parts, strength, seasons, venue, arm, bat, pit }
export async function matchupStory(p) {
  const pid = num(p?.player_id ?? p?.id)
  const arm = num(p?.pitcher_id)
  const venue = String(p?.venue_name || '').trim()
  const who = nameOf(p)
  const armLast = armName(p?.pitcher_name)
  if (!pid || !arm || !venue || !who || !armLast) return null

  const gamePk = p?.game_pk ?? null
  const [bat, pit] = await Promise.all([
    venueRecord(pid, venue, gamePk).catch(() => null),
    pitcherVenueRecord(arm, venue, gamePk).catch(() => null),
  ])

  const park = shortPark(venue)
  const parts = [{ type: 'name', text: who }]
  let strength = 0

  // ── BATTER SIDE ────────────────────────────────────────────────────────────
  // Preference order, each gated on its own sample:
  //   1. "N HR in his last 6 games at Citi"  (needs 6+ games there AND a homer)
  //   2. "N HR in M games at Citi"           (needs a homer there)
  //   3. "N HR in M lifetime PA off Gore"    (needs bvp_hr ≥ 1)
  // A hitter with zero homers here and none off the arm gets no batter clause,
  // which means no line — "0 HR at Citi" is a fact, not a storyline.
  let batOk = false
  let namedArm = false      // did the batter clause already say his name
  const win = lastNHere(bat, 6)
  if (win && win.hr >= 1) {
    parts.push({ type: 'text', text: ' has ' }, { type: 'num', text: `${win.hr} HR` },
      { type: 'text', text: ' in his last ' }, { type: 'num', text: '6' },
      { type: 'text', text: ' games at ' }, { type: 'text', text: park, park: true })
    strength += win.hr * 12 + 8
    batOk = true
  } else if (bat && bat.games >= 2 && bat.hr >= 1) {
    parts.push({ type: 'text', text: ' has ' }, { type: 'num', text: `${bat.hr} HR` },
      { type: 'text', text: ' in ' }, { type: 'num', text: `${bat.games}` },
      { type: 'text', text: ` ${plural(bat.games, 'game')} at ` }, { type: 'text', text: park, park: true })
    strength += bat.hr * 10
    batOk = true
  } else if (num(p?.bvp_hr, 0) >= 1 && num(p?.bvp_pa, 0) >= 4) {
    const h = num(p.bvp_hits, 0), ab = num(p.bvp_ab, null) ?? num(p.bvp_pa, 0)
    parts.push({ type: 'text', text: ' is ' }, { type: 'num', text: `${h}-for-${ab}` },
      { type: 'text', text: ' with ' }, { type: 'num', text: `${num(p.bvp_hr, 0)} HR` },
      { type: 'text', text: ` lifetime off ${armLast}` })
    strength += num(p.bvp_hr, 0) * 9
    batOk = true
    namedArm = true
  }
  if (!batOk) return null
  // Don't say "Gore" twice in one sentence — if the batter clause already
  // named him, the pitcher clause takes the pronoun.
  const arm2 = namedArm ? 'he' : armLast

  // ── PITCHER SIDE ───────────────────────────────────────────────────────────
  // Starts are counted as starts (gamesStarted === 1 on the log), so a
  // reliever's two innings here are never sold as "two starts". The zero
  // clause is allowed, but only from three or more starts — one clean start
  // is not evidence of anything.
  let pitOk = false
  if (pit && pit.starts >= 1 && pit.hrInStarts >= 1) {
    const n2 = pit.starts
    parts.push({ type: 'text', text: ` and ${arm2} has given up ` },
      { type: 'num', text: `${pit.hrInStarts} HR` },
      { type: 'text', text: ' in ' }, { type: 'num', text: `${n2}` },
      { type: 'text', text: ` ${plural(n2, 'start')} here` })
    strength += pit.hrInStarts * 10 + 6
    pitOk = true
  } else if (pit && pit.games >= 2 && pit.hr >= 1) {
    parts.push({ type: 'text', text: ` and ${arm2} has given up ` },
      { type: 'num', text: `${pit.hr} HR` },
      { type: 'text', text: ' in ' }, { type: 'num', text: `${pit.games}` },
      { type: 'text', text: ` ${plural(pit.games, 'appearance')} here` })
    strength += pit.hr * 8
    pitOk = true
  } else if (pit && pit.starts >= 3 && pit.hrInStarts === 0) {
    parts.push({ type: 'text', text: ` and ${arm2} hasn’t allowed one in ` },
      { type: 'num', text: `${pit.starts}` }, { type: 'text', text: ' starts here' })
    strength += 4
    pitOk = true
  } else if (num(p?.pitcher_l3_hr9, null) != null && num(p.pitcher_l3_hr9, 0) >= 1.5) {
    parts.push({ type: 'text', text: ` and ${arm2} is at ` },
      { type: 'num', text: num(p.pitcher_l3_hr9, 0).toFixed(2) },
      { type: 'text', text: ' HR/9 over his last three starts' })
    strength += Math.min(12, num(p.pitcher_l3_hr9, 0) * 4)
    pitOk = true
  }
  if (!pitOk) return null

  parts.push({ type: 'text', text: '.' })
  return {
    pid,
    player: p,
    parts,
    text: parts.map((x) => x.text).join(''),
    strength,
    venue,
    park,
    arm: armLast,
    seasons: bat?.seasons || pit?.seasons || '',
    bat: bat || null,
    pit: pit || null,
  }
}

// ── the slate ────────────────────────────────────────────────────────────────
// Resolves the top `look` candidates, small batches at a time so a slate can't
// fire a hundred parallel requests, and returns the surviving lines sorted by
// strength. `limit` caps what comes back.
export async function matchupStories(players = [], { look = 18, limit = 5, batch = 4 } = {}) {
  const cands = players
    .map((p) => ({ p, s: candidateScore(p) }))
    .filter((x) => x.s >= 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, look)
  const out = []
  for (let i = 0; i < cands.length; i += batch) {
    const got = await Promise.all(cands.slice(i, i + batch).map((x) => matchupStory(x.p).catch(() => null)))
    got.forEach((r) => { if (r) out.push(r) })
  }
  // one line per player — a hitter can appear on the slate more than once
  const seen = new Set()
  return out
    .sort((a, b) => b.strength - a.strength)
    .filter((r) => (seen.has(r.pid) ? false : (seen.add(r.pid), true)))
    .slice(0, limit)
}
