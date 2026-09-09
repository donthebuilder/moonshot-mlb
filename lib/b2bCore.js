// BACK-TO-BACK WATCH -- the plain, server-safe half.
//
// SPLIT OUT 2026-09-08. lib/b2b.js carries 'use client' for its two hooks
// (useSetupHomers, useBackToBack), which Next.js's production runtime
// enforces as a hard server/client boundary -- calling ANY export from that
// file on the server throws, even a plain function with no hook inside it.
// backToBack() itself has never touched React; it only reads dayGap() and
// its own arguments. It lived in lib/b2b.js anyway because it started there,
// and that was silently fine in local dev/build, right up until it shipped
// as a server-side tweet source (app/api/dash/homers/tick/route.js) and
// every call crashed the whole cron tick in Vercel's actual production
// runtime: "Attempted to call backToBack() from the server but backToBack is
// on the client." lib/b2b.js re-exports both of these so its existing
// client-component importers (Home.js, Storylines.js, Pairs.js, HitsHRR.js)
// don't need to change.
const dayGap = (setupDateStr, dateKey) => {
  const a = new Date(`${setupDateStr}T00:00:00Z`)
  const b = new Date(`${dateKey}T00:00:00Z`)
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null
  return Math.round((b - a) / 864e5)
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
