// THE FOUR's ranking and its record, plain JS (2026-09-27, The Four like The
// Six). The ranking moved here from components/BotPicksStrip.js -- unchanged,
// history and all in that file -- so a server route can grade it night by
// night. The strip still calls it (pickBuckets there = rankBuckets here with
// its own CATEGORIES), so the site's Four and the graded Four are one rule.
import { hrScore, hitScore, prodScore, tbScore } from './player'

// Each category ranks on ITS OWN scale (see BotPicksStrip.js CATEGORIES).
export const FOUR_SCORES = { HR: hrScore, HIT: hitScore, HRR: prodScore, CONTACT: tbScore }
export const FOUR_ROLES = ['HR', 'HIT', 'HRR', 'CONTACT']

/**
 * The buckets, three deep, ranked on each category's own scale, three
 * DIFFERENT men per bucket (first appearance wins; `_slateGames` counts his
 * rows). `cats`: [{ role, score, ... }] -- extra fields ride through.
 * Moved verbatim from BotPicksStrip.js pickBuckets (its comment block stays
 * there).
 */
export function rankBuckets(players = [], cats = FOUR_ROLES.map((role) => ({ role, score: FOUR_SCORES[role] }))) {
  return cats.map((cat) => {
    const pool = players.filter(
      (p) => String(p?.game_pick_role || '').split('/').map((s) => s.trim()).includes(cat.role),
    )
    const sorted = [...pool].sort((a, b) => cat.score(b) - cat.score(a))

    const keyOf = (p) => (p?.player_id != null && p.player_id !== ''
      ? `id:${p.player_id}`
      : `nm:${String(p?.name || '').toLowerCase()}|${String(p?.team || '')}`)

    const games = new Map()
    for (const p of sorted) {
      const k = keyOf(p)
      if (!k || k === 'nm:|') continue
      games.set(k, (games.get(k) || 0) + 1)
    }

    const seen = new Set()
    const picks = []
    for (const p of sorted) {
      if (picks.length >= 3) break
      const k = keyOf(p)
      if (seen.has(k)) continue
      seen.add(k)
      picks.push(Object.assign(Object.create(Object.getPrototypeOf(p) || Object.prototype), p, {
        _slateGames: games.get(k) || 1,
      }))
    }
    return { ...cat, picks, poolSize: pool.length, peopleSize: seen.size ? games.size : 0 }
  })
}

// ── THE RECORD ─────────────────────────────────────────────────────────────
// Each category's bar, from the box score (the words are PLATE_BAR's):
//   HR 1+ HR · HIT 1+ hit · HRR 2+ H+R+RBI · CONTACT 2+ total bases.
const n0 = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0)
export const FOUR_BAR = {
  HR: (s) => n0(s.actual_hr) >= 1,
  HIT: (s) => n0(s.actual_hits) >= 1,
  HRR: (s) => n0(s.actual_hits) + n0(s.actual_runs) + n0(s.actual_rbi) >= 2,
  CONTACT: (s) => n0(s.actual_tb) >= 2,
}
// Didn't play (no AB, no walk) or the bot voided it: not a miss, not a pick.
const played = (s) => !(s?.fair_test_void === true) && (n0(s?.actual_ab) > 0 || n0(s?.actual_bb) > 0)

/**
 * One pick's grade on its category's bar: true / false, or null when it isn't
 * settled (row not final, didn't play, voided). The Four's ✓/✗ on a done
 * slate (2026-09-28) -- the same bar and the same "played" rule as the record.
 */
export function fourGrade(role, s) {
  // is_final ships as 1/0 (and true/false in older files); only a settled row grades.
  if (!s || !(s.is_final === true || Number(s.is_final) === 1) || !played(s) || !FOUR_BAR[role]) return null
  return FOUR_BAR[role](s)
}

/**
 * One graded night -> each category's #1 and whether he cleared his bar.
 * The night's graded_slots carry one row per pick per category (pick_type),
 * so each category ranks only its own rows -- a TOP row's grade is not a HIT
 * grade. Rows not final are skipped (the night isn't settled).
 * -> { HR: { name, hit: true|false } | null, ... }
 */
export function fourOfNight(slots = []) {
  const out = {}
  for (const role of FOUR_ROLES) {
    const rows = slots.filter((s) => String(s?.pick_type || '').toUpperCase() === role && s?.is_final !== false)
    const [bucket] = rankBuckets(rows.map((s) => ({ ...s, game_pick_role: role })), [{ role, score: FOUR_SCORES[role] }])
    const lead = bucket.picks[0]
    out[role] = lead && played(lead) ? { name: lead.name, player_id: lead.player_id, hit: FOUR_BAR[role](lead) } : null
  }
  return out
}

/**
 * Nights (newest first) -> per category { hit, n, nights, from, to }: "N of M
 * over K nights". K = nights that had a graded #1 in that category.
 * nights: [{ date, slots }].
 */
export function fourRecord(nights = []) {
  const rec = Object.fromEntries(FOUR_ROLES.map((r) => [r, { hit: 0, n: 0, nights: 0, from: null, to: null }]))
  for (const { date, slots } of nights) {
    const four = fourOfNight(slots)
    for (const role of FOUR_ROLES) {
      const x = four[role]
      if (!x) continue
      const r = rec[role]
      r.n += 1; r.nights += 1; if (x.hit) r.hit += 1
      if (!r.to || date > r.to) r.to = date
      if (!r.from || date < r.from) r.from = date
    }
  }
  return rec
}
