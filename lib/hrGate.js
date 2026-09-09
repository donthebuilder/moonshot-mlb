'use client'

// ⛔ vs 🥇 — WHEN THE BOT TELLS YOU TWO OPPOSITE THINGS ABOUT ONE HITTER
//
// 2026-08-15, Donovan, twice in one message because the first version did not
// land: "if the top pick is homerun why give someone a skip hr if that is the
// bench mark" — and "why is the top scoring based on [HR] if the pick as a top
// didn't have that tag."
//
// HE IS RIGHT, AND THE OBVIOUS FIX WOULD HAVE BEEN WRONG. Both halves matter.
//
// ── THE INCOHERENCE IS REAL ─────────────────────────────────────────────────
//
// The TOP badge is graded on a HOME RUN. lib/liveSlate.js's pickCleared() gives
// TOP the same bar as HR, CATEGORY_LINE.TOP is 0.5 on batter_home_runs, and the
// archive grades it that way (TOP cleared 21.3%, 172/807, over 62 nights).
//
// Meanwhile `best_bet_type` can read "Avoid for HR" and `true_avoid_hr` can be
// set on the SAME player, from a different code path. bots/mlb_dashboard.py's
// build_game_pick_role_map() ranks TOP and HR on an ISO-led power score with a
// season_pa >= 15 gate and an ISO floor — and NO avoid filter, while
// true_avoid_hr gates six other surfaces in that same file (the pools, the
// ranked lists, top30). So the per-game slots are the one place the flag was
// never consulted, and the site ends up printing "🥇 TOP" and "Skip for HR"
// on one card. That is the site giving contradictory instructions, and it is
// exactly what he saw.
//
// ── AND THE FLAG IS BACKWARDS ON THESE PLAYERS ──────────────────────────────
//
// Measured over the graded archive (52 nights carrying best_bet_type, 4,971
// tracked hitters, judgeable = he batted):
//
//   Among TOP picks:  flagged "Avoid for HR"   18/55  = 32.7%  homered
//                     not flagged             124/631 = 19.7%  homered
//                     two-proportion z = 2.30 (significant at 95%)
//
//   Among HR picks:   flagged  11/56 = 19.6%   ·   not flagged  99/627 = 15.8%
//
//   Across every tracked hitter, the tag barely separates at all:
//     "Avoid for HR" 133/951 = 14.0%   vs   no tag 245/1584 = 15.5%
//     (the tag that DOES separate is "HR" itself: 153/665 = 23.0%)
//
// So filtering the avoid-flagged players out of TOP — the intuitive fix, and
// the one his question points at — would have deleted the best-performing TOP
// picks in the archive. The flag is not identifying men who fail to homer. It
// keys on HR-shape gates (missing confirmations, thin samples, contact-profile
// cautions); when a genuinely elite power bat trips one of those gates, the
// tag fires and the power is still there. The TOP selector, ranking on ISO and
// recent homers, is finding precisely those bats.
//
// ── SO THE FIX IS THE LABEL, NOT THE SELECTOR ───────────────────────────────
//
// Nothing here changes who gets picked. What it changes is that a card may no
// longer print an instruction that contradicts its own badge. When a hitter
// holds a home-run badge AND carries the gate flag, the flag stops being
// rendered as advice ("Skip for HR" is advice) and starts being rendered as
// what it measurably is: a flag whose record on these players runs the other
// way. NOTHING IS HIDDEN — the flag still appears, with its reason and now
// with its record. It just stops pretending to be the recommendation.

const s = (v) => String(v ?? '').trim()

/** Does the bot's own HR gate flag this hitter? */
export function hasHrGate(p) {
  if (!p) return false
  if (p.true_avoid_hr === true) return true
  const bet = s(p.best_bet_type)
  return /^avoid\b/i.test(bet)
}

/** Roles this hitter is designated in, uppercased. */
export function rolesOf(p) {
  return s(p?.game_pick_role).split('/').map((x) => x.trim().toUpperCase()).filter(Boolean)
}

/**
 * Is he wearing a badge whose bar is a HOME RUN? TOP and HR are the two, and
 * they are the only two — HIT, HRR and CONTACT have their own bars and a
 * "skip the home run" note beside them is not a contradiction at all, it is
 * useful and must keep printing exactly as it does today.
 */
export function holdsHrBar(p) {
  const r = rolesOf(p)
  return r.includes('TOP') || r.includes('HR')
}

// The measured record, kept in one place so no surface can quote a stale
// version of it. Counts, not rates — the rate is derived at the call site so
// the two can never drift apart.
export const GATE_ON_TOP = { k: 18, n: 55, elseK: 124, elseN: 631, z: 2.30 }
export const GATE_ON_HR = { k: 11, n: 56, elseK: 99, elseN: 627 }
export const GATE_OVERALL = { k: 133, n: 951, baseK: 245, baseN: 1584 }
const pct = (k, n) => (n ? Math.round((1000 * k) / n) / 10 : null)

/**
 * How a surface should present this hitter's HR gate.
 *
 * Returns null when there is nothing to resolve — no gate, or a gate on a
 * player who holds no home-run badge (that case is untouched: it renders the
 * way it always has).
 *
 * When it does return, `mode` is always 'contested':
 *   label   — a NEUTRAL chip label. Never an instruction, because the badge
 *             beside it is already the instruction.
 *   line    — one sentence stating the conflict and the measured record.
 *   title   — the same, for a tooltip.
 */
export function hrGateVerdict(p) {
  if (!hasHrGate(p) || !holdsHrBar(p)) return null
  const roles = rolesOf(p)
  const isTop = roles.includes('TOP')
  const rec = isTop ? GATE_ON_TOP : GATE_ON_HR
  const badge = isTop ? 'TOP' : 'HR'
  const mine = pct(rec.k, rec.n)
  const other = pct(rec.elseK, rec.elseN)
  const reason = s(p.trap_reason) || s(p.risk_reason) || s(p.confidence_penalty_reason)
  return {
    mode: 'contested',
    badge,
    label: 'HR gate flagged',
    reason,
    stat: rec,
    title:
      `The bot's HR gate flagged him, and the bot also made him tonight's ${badge} pick — whose bar is a home run. `
      + `Measured over the graded archive, ${badge} picks carrying this flag homered ${rec.k} of ${rec.n} (${mine}%) `
      + `against ${rec.elseK} of ${rec.elseN} (${other}%) for the ones without it. `
      + `On a ${badge} pick the flag has not meant fewer homers.`,
    line:
      `The HR gate flagged him and the bot made him the ${badge} pick anyway — a bar he can only clear by going deep. `
      + `That reads like a contradiction and the archive says take the badge: ${badge} picks carrying this flag homered `
      + `${rec.k} of ${rec.n} (${mine}%), against ${rec.elseK} of ${rec.elseN} (${other}%) for those without it.`,
  }
}
