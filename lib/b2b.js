'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
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

// ── DAY-OFF TRACKING (2026-08-30, Donovan: "i also like to track day offs...
// instead of back to back... add that as well, also run the data on the
// percentage") ───────────────────────────────────────────────────────────
//
// Calendar-day gap between a proven setup homer and the slate being viewed.
// 1 = literal back-to-back (played the very next day); 2 = one day off (or a
// scheduled travel/off day) in between; 3+ = more than one missed game. Plain
// date-string subtraction, both sides already YYYY-MM-DD, so this is exact
// regardless of timezone.
const dayGap = (setupDateStr, dateKey) => {
  const a = new Date(`${setupDateStr}T00:00:00Z`)
  const b = new Date(`${dateKey}T00:00:00Z`)
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null
  return Math.round((b - a) / 864e5)
}

// VALIDATED, 2026-08-30: 70 dated files from the graded archive (April through
// tonight), chaining every confirmed homer (merged_homers — real, graded
// outcomes, not a model guess) forward to that same player's next appearance
// in the archive, and checking whether he went deep again there. Two things
// worth saying plainly about this number before it goes on a card:
//
//   1. The archive only carries the bot's own ~50 daily picks, so "his next
//      appearance in the archive" undercounts — a hitter who wasn't picked
//      again isn't in the data at all, whatever he actually did. The rates
//      below are therefore conditioned on "reappeared as a pick", not on
//      every real game. That is a real ceiling on what this can claim.
//   2. Sample sizes past a 2-day gap are thin (34 / 19 / 13 opportunities)
//      and are NOT included as a validated rate for that reason — reported
//      only for the two buckets with real sample size.
//
// Result: gap=1 (true back-to-back) 60/437 = 13.7%. gap=2 (one day off)
// 19/131 = 14.5%. The two are statistically indistinguishable at this sample
// size — there is no evidence a day off in between helps OR hurts an encore
// chase. Both comfortably clear the baseline (every graded slot, any day):
// 816/5411 = 15.1% -- wait, that baseline is ABOVE both b2b numbers, which is
// the honest result and worth stating as such rather than rounding it into a
// "beats the field" claim it didn't earn. (See
// claude/moonshot-b2b-dayoff-validation-2026-08-30.md for the full run.)
export const B2B_VALIDATED = {
  backToBack: { hits: 60, n: 437, pct: 13.7 },
  oneDayOff: { hits: 19, n: 131, pct: 14.5 },
  baseline: { hits: 816, n: 5411, pct: 15.1 },
}


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
      // 1. our own graded file — one request, and it's already deduped.
      //
      // ROUND 6 (2026-08-29, user report: "only showed two people when there
      // was more on the slate that was possible"). This file only grades the
      // bot's own ~50 designated picks from that day, NOT every hitter who
      // played — it is an accuracy record for the board, not a league-wide HR
      // log. So `collect(j)` was always a strict undercount of who actually
      // went deep, and the `if (s.size) return` below made it worse: the
      // league fallback below was written for "a night the bot had trouble"
      // (an empty graded set), but a PARTIAL graded set (some picks homered,
      // most non-picks did too but aren't in the file) is not empty, so the
      // early return fired anyway and the league call — the one source that
      // actually has every homer — never ran. Fixed by always querying both
      // and taking the union: the graded file's entries are still proven (as
      // real as the league's), so unioning only ever ADDS verified players,
      // never removes one.
      let s = new Set()
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
        if (j && dateOk) s = collect(j)
      } catch { /* fall through to the league */ }

      // 2. the league's own boxscores for that date — always fetched now,
      // not just when #1 comes back empty, because #1 alone is never the
      // full slate.
      const s2 = await homersFromLeague(setupDate)
      const merged = new Set([...s, ...(s2 || [])])
      if (!alive) return
      setSetupHr(merged.size ? merged : (s.size ? s : null))
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
export function backToBack(players = [], setupHr, sortBy = null, dateKey = null) {
  const fetchVerified = setupHr instanceof Set

  // "BACK TO BACK" MEANS BACK-TO-BACK GAMES, NOT BACK-TO-BACK CALENDAR DATES
  // (2026-08-30, Donovan: "back to back mean back to back games"). Everything
  // above anchors the setup proof to exactly one calendar day — the one
  // before `dateKey` — fetched from a league/graded source. That's right for
  // "did anyone homer yesterday", but it silently excludes the hitter whose
  // last actual game was two or three days back because of an off day, a
  // rainout, or a getaway day between series: he never played "yesterday",
  // so no fetch could ever put him in setupHr, even though tonight really is
  // his very next game since that homer — a genuine back-to-back-GAMES chase.
  //
  // The bot already tracks exactly this, per player, off his real game log:
  // last_game_date / last_game_hr (see compute_blank_profile in
  // mlb_dashboard.py) is HIS most recently played game, whatever date that
  // actually falls on — it isn't a "yesterday" guess. The only guard needed
  // is the one this whole file exists to enforce (Round 1): a slate rebuilt
  // after an early game can stamp last_game_date with TODAY, which is not a
  // setup for tonight, it IS tonight. Requiring last_game_date to fall
  // strictly before the slate being viewed rules that out.
  const ownGameProof = (p) => {
    if (!dateKey) return false
    const lgd = String(p?.last_game_date || '')
    return !!lgd && lgd < dateKey && Number(p?.last_game_hr) > 0
  }

  const verified = fetchVerified || !!dateKey
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
  // day that would set up an encore (fetch proof), or on his own last played
  // game before this slate (own-row proof) — either way he is on the slate in
  // front of you. That IS the back-to-back watch.
  //
  // The field keeps one job, the only one it does well — VETO. If it says he
  // has played one or more games since his last homer, then whatever happened
  // on the setup date is no longer his most recent game (a doubleheader
  // nightcap, say), and he isn't chasing anything. Missing or 0 doesn't veto,
  // because absence of the field is not evidence against a proven homer.
  const list = players
    .filter((p) => {
      const pid = Number(p?.player_id ?? p?.id)
      const proven = (fetchVerified && setupHr.has(pid)) || ownGameProof(p)
      if (!proven) return false
      // ── THE VETO ONLY APPLIES TO AN UN-ROLLED FIELD (2026-08-31) ────
      //
      // Donovan: "i feel like the b2b thing does the thing where if the
      // game isnt live or went off the player dissa peras. dont do that."
      //
      // He is describing a real mechanism, and it is this line. Every one
      // of the bot's "since his last game" fields ROLLS FORWARD the moment
      // that player's own game tonight completes -- last_game_date becomes
      // today and games_since_last_hr becomes 1. Measured on tonight's
      // published slate at 10pm UTC: last_game_date is already stamped
      // 2026-08-30 (the slate's own date) on 184 of 251 rows, and of the 19
      // hitters carrying last_game_hr > 0 only 7 still pass `lgd < dateKey`.
      // The other twelve did not stop being encore chases. Their rows just
      // aged out from under the panel.
      //
      // So the field is only evidence while it is still describing the
      // state BEFORE this slate. Once it has rolled it is describing
      // tonight, and tonight is the thing being watched -- it cannot also
      // be the thing that disqualifies the watch. The veto's one real job
      // (a doubleheader nightcap, where he genuinely has played since)
      // still works, because in that case the field rolled for a reason
      // this test can see.
      const lgd = String(p?.last_game_date || '')
      const rolled = !!lgd && lgd >= String(dateKey || '')
      if (rolled) return true
      const since = Number(p?.games_since_last_hr)
      return !Number.isFinite(since) || since <= 0
    })
    .map((p) => {
      // Fetch proof is keyed to exactly one calendar day (the day before
      // dateKey for a today/past slate; today itself for a tomorrow slate),
      // so a fetch-proven player is a gap of 1 by construction. Own-row proof
      // carries a real last_game_date, so compute the actual gap from it.
      // A ROLLED last_game_date CANNOT MEASURE THE GAP EITHER. It reads as
      // the slate's own date, so dayGap() returns 0 and the hitter lands in
      // the strict back-to-back row wearing a gap that says he homered
      // today. Only an un-rolled date measures anything; otherwise fall
      // back to the fetch proof's construction, which is exactly 1 by
      // definition (its setup date is the day before this slate).
      const lgd = String(p?.last_game_date || '')
      const usable = !!lgd && dateKey && lgd < String(dateKey)
      const ownGap = usable ? dayGap(lgd, dateKey) : null
      const gap = ownGap != null && ownGap >= 1 ? ownGap : 1
      return { ...p, _b2bGapDays: gap }
    })
  if (sortBy) list.sort((a, b) => sortBy(b) - sortBy(a))
  return { list, verified: true }
}

// ── THE WATCH IS A FACT ABOUT THE SLATE, NOT A LIVE QUERY (2026-08-31) ──────
//
// Donovan: "both are mnissing names and updates... i feel like the b2b thing
// does the thing where if the game isnt live or went off the player dissa
// peras. dont do that. makesure that wehn the player hits the home run it
// shows it but also dont have it show the players who only hit a home run
// today."
//
// Three requests, and they are the same request. backToBack() above answers
// "is this hitter, right now, chasing an encore" against a payload whose
// fields roll forward player by player as tonight's games finish. That makes
// the panel a MOVING window: full at noon, thinning through the evening, and
// emptiest at exactly the hour the encores are actually happening. The fixes
// above stop the two fields from disqualifying anyone, but they cannot help
// with the other half of it -- a hitter whose row leaves `players` entirely
// (scratched, subbed, or dropped when the slate rebuilds) has nothing left to
// test.
//
// So the list is ACCUMULATED for the slate. Once a hitter has been verified as
// an encore chase on this date, he stays on the watch for this date, and his
// row is refreshed from the live slate on every render so his score and his
// HOMERED AGAIN badge stay current. He can only ever be added by proof, and
// the proof is always about a game BEFORE this slate -- so "shows it when he
// homers" and "don't show the ones who only homered today" are both structural
// here rather than a rule someone has to remember.
//
// The store is keyed by dateKey and resets when the day picker moves, so
// yesterday's chases never leak onto tonight's card.
//
// Written as: derive from the ref during render, WRITE to it in an effect.
// The render output unions the fresh list with the remembered one, so it never
// depends on the write having already happened -- which is what makes this
// safe under StrictMode's double render and concurrent re-renders.
export function useBackToBack(players = [], setupHr, sortBy = null, dateKey = null) {
  const seen = useRef({ key: null, byId: new Map() })
  if (seen.current.key !== dateKey) seen.current = { key: dateKey, byId: new Map() }

  const fresh = useMemo(
    () => backToBack(players, setupHr, null, dateKey),
    [players, setupHr, dateKey],
  )

  useEffect(() => {
    if (!fresh.verified) return
    fresh.list.forEach((p) => {
      const id = Number(p?.player_id ?? p?.id)
      if (id) seen.current.byId.set(id, p)
    })
  }, [fresh])

  return useMemo(() => {
    const live = new Map()
    ;(players || []).forEach((p) => {
      const id = Number(p?.player_id ?? p?.id)
      if (id) live.set(id, p)
    })
    const out = new Map()
    const add = (p) => {
      const id = Number(p?.player_id ?? p?.id)
      if (!id || out.has(id)) return
      // Prefer tonight's row so the HR score and every live field are
      // current; keep the gap that was measured when he qualified, because
      // the field it was measured from has since rolled.
      const row = live.get(id) || p
      out.set(id, { ...row, _b2bGapDays: p._b2bGapDays ?? 1 })
    }
    fresh.list.forEach(add)
    seen.current.byId.forEach(add)
    const list = [...out.values()]
    if (sortBy) list.sort((a, b) => sortBy(b) - sortBy(a))
    return { list, verified: fresh.verified || out.size > 0 }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fresh, players, sortBy])
}
