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

// ── PROOF FROM THE LEAGUE, NOT FROM US (round 5, 2026-08-09) ────────────────
//
// Donovan: "I'm still not seeing the potential B2B for either slate."
//
// The rule was right and the plumbing was too fragile. Both proof sources were
// files the BOT publishes, so the panel inherited every one of the bot's bad
// days — and it had several:
//
//   · TOMORROW SLATE. The proof was results_live.json gated to today's date.
//     That file holds the last graded slate until a new one starts grading, so
//     for most of any given day it is YESTERDAY's date and the gate correctly
//     rejects it — meaning tomorrow's back-to-back watch was structurally
//     unable to render until tonight's games began grading. On 2026-08-09 that
//     file was still stamped July 26, so it could never have rendered at all.
//   · TODAY SLATE. Needs graded_results_{yesterday}.json. Any night the
//     grading job doesn't run, the next day's watch silently disappears.
//
// So: ask the league. One schedule call for the setup date plus one boxscore
// per game gives every player who homered that day, straight from the
// boxscores — the same source the live wire already trusts, with no dependency
// on anything we publish. The graded file is still tried FIRST because it is a
// single cheap request; the league is the fallback that makes the panel work
// on a night the bot had trouble.
//
// The rule itself is unchanged and non-negotiable: no proof, no render.
const SCHED_F = 'dates,games,gamePk,status,abstractGameState'
const BOX_F = 'teams,home,away,players,person,id,stats,batting,homeRuns'

async function homersFromLeague(date) {
  try {
    const sched = await fetch(
      `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${date}&fields=${SCHED_F}`,
    ).then((r) => (r.ok ? r.json() : null))
    const games = (sched?.dates?.[0]?.games || [])
      // Only games that actually happened can prove a homer.
      .filter((g) => ['Live', 'Final'].includes(g?.status?.abstractGameState))
      .map((g) => g.gamePk)
    if (!games.length) return null
    const out = new Set()
    await Promise.all(games.map(async (pk) => {
      const box = await fetch(
        `https://statsapi.mlb.com/api/v1/game/${pk}/boxscore?fields=${BOX_F}`,
      ).then((r) => (r.ok ? r.json() : null)).catch(() => null)
      ;['home', 'away'].forEach((side) => {
        Object.values(box?.teams?.[side]?.players || {}).forEach((pl) => {
          if (Number(pl?.stats?.batting?.homeRuns) > 0) out.add(Number(pl?.person?.id))
        })
      })
    }))
    return out.size ? out : null
  } catch {
    return null
  }
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

    // WHICH DAY SETS UP THE ENCORE. For a tomorrow slate it's today's games;
    // for a today slate it's the day before that slate — relative to the slate
    // on screen, not the wall clock, so the day picker stays honest.
    const setupDate = isTmrw
      ? today
      : new Date(new Date(`${dateKey}T12:00:00Z`).getTime() - 864e5).toISOString().slice(0, 10)

    ;(async () => {
      // 1. our own graded file — one request, and it's already deduped
      const url = isTmrw
        ? dataUrl('current/results_live.json')
        : dataUrl(`current/graded_results_${setupDate}.json`)
      try {
        const j = await fetch(bust(url)).then((r) => (r.ok ? r.json() : null))
        // The live file must be FOR the setup day; a graded file is named for
        // its day, so its own date field only has to agree if it carries one.
        const dateOk = isTmrw
          ? String(j?.date || '') === setupDate
          : (!j?.date || String(j.date) === setupDate)
        if (j && dateOk) {
          const s = collect(j)
          if (s.size) { if (alive) setSetupHr(s); return }
        }
      } catch { /* fall through to the league */ }

      // 2. the league's own boxscores for that date
      const s2 = await homersFromLeague(setupDate)
      if (alive) setSetupHr(s2 || null)
    })()

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

  // THE PROOF LEADS; THE SLATE FIELD ONLY VETOES (2026-08-09, round 5).
  //
  // This used to REQUIRE games_since_last_hr === 0 and then also require the
  // proof. Two independent conditions, and the first one is a bot field that
  // has already been the source of this panel's worst bug — on a slate rebuilt
  // after an early game it means "he homered TODAY", and any night the field
  // goes missing or stale the whole section silently empties. Donovan: "I'm
  // still not seeing the potential B2B for either slate."
  //
  // The proof is the stronger statement anyway: he demonstrably homered on the
  // day that would set up an encore, and he is on the slate in front of you.
  // That IS the back-to-back watch.
  //
  // The field keeps one job, the only one it does well — VETO. If it says he
  // has played one or more games since his last homer, then whatever happened
  // on the setup date is no longer his most recent game (a doubleheader
  // nightcap, say), and he isn't chasing anything. Missing or 0 doesn't veto,
  // because absence of the field is not evidence against a proven homer.
  const list = players.filter((p) => {
    const pid = Number(p?.player_id ?? p?.id)
    if (!setupHr.has(pid)) return false
    const since = Number(p?.games_since_last_hr)
    return !Number.isFinite(since) || since <= 0
  })
  if (sortBy) list.sort((a, b) => sortBy(b) - sortBy(a))
  return { list, verified: true }
}
