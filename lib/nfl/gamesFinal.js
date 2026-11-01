// ARE ALL OF A DAY'S GAMES OVER? (batch 3, 2026-10-26.) nfl_results (Monday's grade of Sunday's board) is an event-mode kind, so no hour gate keeps it
// back: it went out at 00:00:35 ET on 10-12, 10-19 and 10-26, while the night's game could still be on and its touchdowns still arriving in nfl_td_feed.
// It now waits until every game of the day it grades is final. `games` = lib/nfl/liveSlate.js fetchNflGamesOn() rows ({ state, completed }); null = the
// schedule could not be read, which is a hold, never "nothing to wait for". Pure.
export function dayIsFinal(games) {
  if (!Array.isArray(games)) return { ok: false, why: 'schedule unreadable' }
  if (!games.length) return { ok: false, why: 'no games read for the day' }
  const open = games.filter((g) => !(g?.state === 'post' || g?.completed === true))
  return open.length ? { ok: false, why: `${open.length} of ${games.length} games not final` } : { ok: true, why: '' }
}
