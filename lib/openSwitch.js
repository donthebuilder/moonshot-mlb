// THE ONE OPEN SWITCH FOR A HIDDEN SPORT (2026-10-12, Donovan: "no NBA posts anywhere until BUCKETS is public").
// BUCKETS (nba) is hidden until BUCKETS_PUBLIC=on. Every SERVER poster (X, Discord, #members, push) that can
// name a hidden sport asks this one function; the site's own gate (lib/nba/gate.js bucketsPublic) answers from it
// too, so the site and the posters cannot disagree. Pure: no imports, so any module (including the ones that
// must not pull in the request-bound supabase client) can use it.
//
//   isSportOpen('nba')       false until BUCKETS_PUBLIC=on; true for every sport that is not hidden
//   hiddenSportOfKind(kind)  'nba' for a post kind that names BUCKETS (nba30, nba_top_totals, writeup_nba_<game>,
//                            nba_poll_*, card_*_nba ...), else null. The same patterns as lib/dash/xPolicy sportOfKind.
//   mayPost({ sport, kind, sportKey })  false when ANY of the three names a sport that is still hidden.
//
// scripts/check-buckets-no-leak.mjs holds this: a static scan of every poster module and a fake-send run with the
// switch off and on. A new poster path for a sport that can be hidden goes through mayPost() or it fails there.
const HIDDEN = Object.freeze({
  nba: () => /^on$/i.test(String(process.env.BUCKETS_PUBLIC || process.env.NEXT_PUBLIC_BUCKETS_PUBLIC || '').trim()),
})

export const HIDDEN_SPORTS = Object.freeze(Object.keys(HIDDEN))

/** True when this sport may be posted / shown: it is not a hidden sport, or its switch is on. */
export const isSportOpen = (sport) => !HIDDEN[sport] || Boolean(HIDDEN[sport]())

/** BUCKETS' own switch, by name. */
export const bucketsOpen = () => isSportOpen('nba')

/** The hidden sport a post kind names, or null. */
export function hiddenSportOfKind(kind) {
  const k = String(kind || '')
  // nba / buckets as a whole word of the kind: nba30, nba_top_totals, writeup_nba_<game>, nba_poll_*, card_*_nba, list_nba_*
  if (/(^|_)(nba|buckets)(_|\d|$)/.test(k) || /^nba/.test(k)) return 'nba'
  return null
}

/** May a post that names this sport / kind / sportKey go out? False when any of them names a hidden sport that is not open. */
export function mayPost({ sport = null, kind = null, sportKey = null } = {}) {
  for (const s of [sport, sportKey, hiddenSportOfKind(kind)]) if (s && !isSportOpen(s)) return false
  return true
}
