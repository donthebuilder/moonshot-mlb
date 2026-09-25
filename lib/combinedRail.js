'use client'
import { scheduleFor, slateDay } from './boxscore'
import { fetchNflLive } from './nfl/liveSlate'
import { defaultMlbState } from '../components/ScoreRail'
import MlbTeamMark from '../components/MlbTeamMark'
import NflTeamMark from '../components/nfl/NflTeamMark'
import { TeamMark as LampTeamMark, fmtPuckDrop } from '../components/lamp/ui'
import { sportKey } from './routes'

// ONE RAIL, BOTH SPORTS (round 10, 2026-09-17). Donovan, quoting the round 5
// ScoreRail bullet: "still not full match i want exact match plus its not
// showing the bsasbll game ... merge it over to moon shot ... i just want
// the hader to be seamleass acrre those whole site." Asked which "exact
// match" he meant for THIS component specifically (round 9 already fixed
// the header) -- merge both sports into one rail, or keep two visually-
// identical-but-separate rails. He picked the merge (AskUserQuestion).
//
// components/ScoreRail.js itself stays the single-sport-generic component
// round 5's shell-out made it -- it still only knows one thing about a
// second sport: an optional `sport` tag on each game object, used to pick
// the right TeamMark and to route a foreign tile's tap to `onSwitchSport`
// instead of `onNavigate`. Everything that actually KNOWS both sports exist
// lives here, so neither product's own Home.js has to duplicate it and
// ScoreRail.js never has to import anything sport-specific itself.
//
// No new network calls either page didn't already make somewhere on itself:
// scheduleFor() is MOONSHOT's own long-standing schedule fetch (this file's
// own default before round 5's shell-out); fetchNflLive() is the shared,
// TTL-cached snapshot NflYourPlayers, the header ticker, and TUDDY's own
// rail adapter already poll on every NFL page load. Per rule #16, nothing
// here invents a number -- a guest-sport game shows only what its own
// fetch actually returned (score, state), never a picks record, since
// neither Home page has the other product's picks data loaded.

/**
 * A raw NFL game -- TUDDY's own `data.games` rows, or fetchNflLive()'s own
 * `.games` array; both carry the identical field names (game_id, away,
 * home, away_score, home_score, state, period, clock, kickoff -- verified
 * against lib/headlines.js's own read of fetchNflLive()) -- turned into
 * ScoreRail's own game shape. Was inline inside components/nfl/tabs/
 * Home.js's `nflFetchGames`; pulled out here so a second call site (the
 * MOONSHOT-side fetch below) can build the identical shape from a
 * DIFFERENT source without a second, drifting copy of the mapping.
 */
export function toRailGame(g) {
  return {
    pk: g.game_id,
    sport: 'nfl',
    live: g.state === 'in',
    final: !!(g.completed || g.state === 'post'),
    postponed: false,
    suspended: false,
    startTime: g.kickoff,
    away: { abbr: g.away, score: g.away_score },
    home: { abbr: g.home, score: g.home_score },
    _period: g.period,
    _clock: g.clock,
  }
}

/** scheduleFor()'s own MLB game shape, tagged -- the shape itself is
 * untouched, this only adds the one field the merged rail dispatches on. */
export function toMlbRailGames(games) {
  return (games || []).map((g) => ({ ...g, sport: 'mlb' }))
}

/** Both sports' game lists, one array, time-ordered -- so the rail reads
 * like one evening/week instead of "all baseball, then all football." */
export function mergeGamesSorted(lists) {
  const merged = [].concat(...lists)
  merged.sort((a, b) => String(a.startTime || '').localeCompare(String(b.startTime || '')))
  return merged
}

/**
 * MOONSHOT's Home page has no NFL data of its own loaded -- MLB comes from
 * its own long-standing scheduleFor() call, NFL from the shared live
 * snapshot every NFL page already polls. Either half degrading to an empty
 * list on a failed fetch never breaks the other.
 */
export function fetchCombinedGamesForMlbHome() {
  const mlbPromise = scheduleFor(slateDay(0)).then(toMlbRailGames).catch(() => [])
  const nflPromise = fetchNflLive().then((snap) => (snap?.games || []).map(toRailGame)).catch(() => [])
  return Promise.all([mlbPromise, nflPromise]).then(mergeGamesSorted)
}

// NFL's own Q#/clock/F/kickoff text -- the exact ternary components/nfl/
// tabs/Home.js's own `nflRenderState` always ran, now shared instead of a
// second copy per rule #21.
function nflState(g) {
  if (g.final) return 'F'
  if (g.live) {
    const q = g._period ? `Q${g._period}` : ''
    return g._clock ? `${q} ${g._clock}`.trim() : (q || 'LIVE')
  }
  // Matches components/nfl/tabs/Home.js's own former local `kickoff()`
  // exactly (weekday included -- TUDDY's pregame state reads "Sun, 1:00
  // PM", not just a bare time) -- this is that same formatting, not a
  // fresh guess, so a merged rail's NFL tiles read identically to before.
  if (!g.startTime) return 'TBD'
  try {
    return new Date(g.startTime).toLocaleString('en-US', {
      weekday: 'short', hour: 'numeric', minute: '2-digit',
    })
  } catch { return 'TBD' }
}

// LAMP's tile, for when an NHL game joins this rail (none does yet -- LAMP's
// Home runs its own). Contract, same as toRailGame's for NFL: `_period` is
// already the league's own word (lib/nhl/reduce.js periodLabel: '2nd', 'OT',
// 'SO') and `_clock` the time remaining. Pregame is LAMP's own puck-drop time.
function nhlState(g) {
  if (g.final) return 'F'
  if (g.live) return `${g._period || ''} ${g._clock || ''}`.trim() || 'LIVE'
  return g.startTime ? fmtPuckDrop(g.startTime) : 'TBD'
}

// ONE SPORT LIST (Batch 1, 2026-09-25). Both tables below were `sport ===
// 'nfl' ? … : mlb`, so an NHL tile would have rendered baseball's inning
// arrow and an MLB logo. Keyed by the registry now (lib/routes.js sportKey);
// an unknown sport is still MOONSHOT, as it always was.
const STATE = { mlb: defaultMlbState, nfl: nflState, nhl: nhlState }

/**
 * Same state-text dispatch `computeByGame`'s own per-game pk lookup already
 * relies on (`g.sport`) -- MLB's own ▲/▼inning/F/time ternary (ScoreRail.js's
 * own long-standing default, exported round 10 instead of duplicated here),
 * NFL's and NHL's above.
 */
export function combinedRenderState(g) {
  return STATE[sportKey(g.sport)](g)
}

// LAMP's mark takes `abbrev`; the rail's contract is `abbr`. One adapter here
// rather than teaching ScoreRail a third prop name.
const NhlRailMark = ({ abbr, size }) => <LampTeamMark abbrev={abbr} size={size} />
const MARKS = { mlb: MlbTeamMark, nfl: NflTeamMark, nhl: NhlRailMark }

/**
 * Dispatches to whichever sport's team mark the CURRENT game belongs to.
 * ScoreRail.js passes `sport={g.sport || sport}` per game (round 10), so a
 * merged rail can mix both without either product's own call site needing
 * to know or care which game is which. MlbTeamMark and NflTeamMark
 * (components/nfl/NflTeamMark.js -- NOT components/fantasy/NflTeamMark.js,
 * a different component for FRANCHISE's roster badges) already share the
 * exact same {abbr, size, dim, style} contract on purpose (see NflTeamMark's
 * own header comment), so dispatching is a straight pass-through either way.
 */
export function CombinedTeamMark({ sport, ...props }) {
  const Mark = MARKS[sportKey(sport)]
  return <Mark {...props} />
}
