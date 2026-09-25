// 🏒 WHAT THE FRONT DOOR KNOWS ABOUT HOCKEY TONIGHT — a few dozen bytes.
// One league call (score/{date}) for the counts and one select for the
// LOCKED calls. No preview here on purpose: the front door prints calls,
// and a preview is not a call (the Board page is where a preview lives,
// stamped). Before the first lock the door says when the board locks;
// after it, the #1 called in each locked game; after grading, whether he
// scored. Null from the caller's .catch() when the feed is down — the
// front door renders the product card without the number, same rule as
// the other two products (lib/dash/pulse.js).
import { easternToday } from '../data'
import { scoreFor } from './api'
import { reduceScoreDay, gameTypeLabel } from './reduce'
import { readLocked, LOCK_WINDOW_MS } from './boardRead'

export async function nhlPulse(date = easternToday()) {
  const day = reduceScoreDay(await scoreFor(date))
  const games = day.games.filter((g) => g.scheduleState === 'OK')
  let calls = []; let lockedGames = 0; let gradedGames = 0; let dbReady = false
  try {
    const { db, locked, games: meta } = await readLocked(date)
    dbReady = db
    const lockedIds = new Set(meta.filter((m) => m.locked_at).map((m) => Number(m.game_id)))
    lockedGames = lockedIds.size
    gradedGames = meta.filter((m) => m.graded_at).length
    calls = games.filter((g) => lockedIds.has(g.id)).map((g) => {
      const top = locked.filter((r) => Number(r.game_id) === g.id && r.status === 'called').sort((a, b) => a.rank_in_game - b.rank_in_game)[0]
      return top ? {
        gameId: g.id, away: g.away.abbrev, home: g.home.abbrev, playerId: top.player_id, name: top.name, team: top.team, opp: top.opp,
        score: top.score, graded: top.graded_at != null, hit: top.hit, goals: top.goals, dressed: top.dressed,
      } : null
    }).filter(Boolean)
  } catch (e) {
    console.error(`[lamp pulse] ${e?.message}`)
  }
  const firstStart = games.map((g) => g.startUtc).filter(Boolean).sort()[0] || null
  return {
    date,
    label: day.gameTypes.length === 1 ? gameTypeLabel(day.gameTypes[0]) : day.gameTypes.length ? 'MIXED SLATE' : null,
    games: games.length, live: day.live, final: day.final, pre: day.pre,
    firstStart, locksFromUtc: firstStart ? new Date(Date.parse(firstStart) - LOCK_WINDOW_MS).toISOString() : null,
    lockedGames, gradedGames, dbReady, calls,
  }
}
