'use client'
import { useEffect, useState } from 'react'
import { dataUrl } from './dataSource'
import { dedupeGraded } from './graded'

// 🔁 BACK-TO-BACK WATCH — one implementation, because it has been wrong three
// times and every time it was wrong in a different place.
//
// THE CLAIM: "he homered his last game — tonight is the encore try."
//
// WHY IT KEPT BREAKING. The slate field `games_since_last_hr === 0` does NOT
// mean "he homered yesterday". It means "he homered in his most recent game",
// and on a slate rebuilt after the 12:05 window has already finished, his most
// recent game is TODAY. So a hitter who went deep this afternoon joins the
// back-to-back watch on the strength of the very homer he just hit, and the
// panel tells you he's chasing an encore he already had.
//
// Round 1 (2026-08-09): a stale results_live.json handed out ✅s for the setup
// homer itself. Fixed with a date gate.
// Round 2 (2026-08-09): the setup homer had to be proven from YESTERDAY's own
// graded file, not inferred from a field.
// Round 3 (2026-08-10, user report — Chourio, who had not gone deep the night
// before): two holes left. Tomorrow slates skipped verification entirely, and
// a missing proof file meant "show everything" rather than "show nothing".
// Round 4 (2026-08-09, this file): Home's "Tonight's angles" was still reading
// the raw field with no verification at all — the fix had been applied to the
// Storylines panel only, so the same wrong claim was still on the front page.
//
// THE RULE, now in exactly one place:
//   · The setup homer must be PROVEN from a graded file, by player_id.
//   · The proof source follows the slate: a tomorrow slate is set up by
//     TODAY's live results; a today slate by YESTERDAY's graded file.
//   · No proof, no render. Not "render unverified" — a back-to-back watch
//     nobody can stand behind is worse than none, because the whole value of
//     these panels is that their claims are checkable.

const bust = (u) => `${u}${u.includes('?') ? '&' : '?'}t=${Date.now()}`

const collect = (j) => {
  const s = new Set()
  // One row per player first: a hitter designated in two categories publishes
  // two rows, and mid-grading they can disagree. See lib/graded.js.
  dedupeGraded(j?.graded_slots || j?.results || []).forEach((r) => {
    const pid = Number(r?.player_id)
    if (pid && Number(r?.actual_hr) > 0) s.add(pid)
  })
  return s
}

/**
 * The set of player_ids who homered in the game that would SET UP a
 * back-to-back on the slate being viewed.
 *
 * @returns undefined while loading · null when unproven · Set when verified
 */
export function useSetupHomers(dateKey) {
  const [setupHr, setSetupHr] = useState(undefined)
  useEffect(() => {
    let alive = true
    setSetupHr(undefined)
    if (!dateKey) { setSetupHr(null); return undefined }
    const today = new Date().toLocaleDateString('en-CA')
    const isTmrw = dateKey > today

    if (isTmrw) {
      // Tomorrow: the setup homer is TODAY's, so today's live results are the
      // proof. That file holds the last graded slate until a new one starts,
      // hence the date gate.
      fetch(bust(dataUrl('current/results_live.json')))
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => {
          if (!alive) return
          if (!j || String(j.date || '') !== today) { setSetupHr(null); return }
          setSetupHr(collect(j))
        })
        .catch(() => { if (alive) setSetupHr(null) })
    } else {
      // Today: yesterday's graded file, relative to the slate on screen — not
      // to the wall clock, so the day picker stays honest.
      const d = new Date(new Date(`${dateKey}T12:00:00Z`).getTime() - 864e5).toISOString().slice(0, 10)
      fetch(bust(dataUrl(`current/graded_results_${d}.json`)))
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => { if (alive) setSetupHr(j ? collect(j) : null) })
        .catch(() => { if (alive) setSetupHr(null) })
    }
    return () => { alive = false }
  }, [dateKey])
  return setupHr
}

/**
 * The verified back-to-back list. Empty until the setup homers are proven —
 * `verified` tells a caller whether an empty list means "nobody" or "we
 * couldn't check", so the two can be worded differently.
 */
export function backToBack(players = [], setupHr, sortBy = null) {
  const verified = setupHr instanceof Set
  if (!verified) return { list: [], verified: false }
  const list = players
    .filter((p) => Number(p?.games_since_last_hr) === 0)
    .filter((p) => setupHr.has(Number(p?.player_id ?? p?.id)))
  if (sortBy) list.sort((a, b) => sortBy(b) - sortBy(a))
  return { list, verified: true }
}
