// ODDS SNAPSHOT ROWS (odds plan step 1). One SGO event -> the odds_snap rows
// for our markets only: the `yn-yes` side of each player's market, one row
// per book that listed it. Prices are stored as SGO gave them (American, as
// integers). `fair_odds` / `open_odds` / `open_fair_odds` are SGO's
// market-wide numbers for that player (the no-vig "market fair price" and
// the opening line) -- the feed has no per-book opener -- so they repeat on
// every book's row. A book with no parsable price is not a row.
import { easternDate } from '../data'

// league -> [market key in odds_snap, SGO statID]. NHL (step 2, 2026-09-27):
// confirmed on the first regular-season game (FLA@CAR 09-29) --
// points-<PLAYER>-game-yn-yes is "<Name> Any Goals Yes/No" ("points" is
// SGO's word for goals in hockey).
export const MARKETS = {
  NFL: { sport: 'nfl', market: 'td', stat: 'touchdowns' },
  MLB: { sport: 'mlb', market: 'hr', stat: 'batting_homeRuns' },
  NHL: { sport: 'nhl', market: 'goal', stat: 'points' },
  // BUCKETS (2026-10-03): no yes/no market of its own yet (first basket isn't
  // listed -- recheck ~10-18), so odds_snap takes nothing; its prices are the
  // over/under lines lib/odds/lines.js EXTRA.NBA keeps. Listed only once
  // BUCKETS is open (app/api/odds/tick): before that it spends no objects.
  NBA: { sport: 'nba', market: 'first', stat: 'firstBasket' },
}
export const LEAGUES = Object.keys(MARKETS)
/** The leagues the tick reads and the month planner counts: every one, except
 *  BUCKETS' while it is closed (its games would inflate the projection and
 *  could switch CLOSE off for the other three). `open` = bucketsPublic(). */
export const activeLeagues = (open) => LEAGUES.filter((L) => L !== 'NBA' || open)

const american = (v) => {
  const n = Number(String(v ?? '').replace(/^\+/, ''))
  return Number.isInteger(n) && n !== 0 ? n : null
}

export const startsAt = (ev) => ev?.status?.startsAt || null
export const gameDate = (ev) => easternDate(Date.parse(startsAt(ev)))

/** { rows, players, matched } for one event and one snapshot kind. */
export function snapRows(ev, snap, takenAt, match) {
  const m = MARKETS[ev.leagueID]
  if (!m) return { rows: [], players: 0, matched: 0 }
  const re = new RegExp(`^${m.stat}-(.+)-game-yn-yes$`)
  const rows = []
  let players = 0
  let matched = 0
  for (const [oddID, o] of Object.entries(ev.odds || {})) {
    const hit = re.exec(oddID)
    if (!hit) continue
    const sgoId = o.playerID || hit[1]
    // touchdowns-home-/away- are the TEAM's market, not a player's: skip.
    const sp = ev.players?.[sgoId]
    if (!sp) continue
    const ours = match ? match(sp, ev) : null
    players += 1
    if (ours) matched += 1
    const side = ['home', 'away'].find((s) => ev.teams?.[s]?.teamID === sp.teamID)
    for (const [book, b] of Object.entries(o.byBookmaker || {})) {
      const odds = american(b.odds)
      if (odds == null) continue
      rows.push({
        sport: m.sport, event_id: ev.eventID, game_date: gameDate(ev), starts_at: startsAt(ev), snap, taken_at: takenAt,
        market: m.market, odd_id: oddID, sgo_player_id: sgoId, player_name: sp.name || null,
        team: side ? ev.teams[side].names?.short || null : null, our_player_id: ours,
        book, odds, available: b.available !== false, book_updated_at: b.lastUpdatedAt || null,
        fair_odds: american(o.fairOdds), open_odds: american(o.openBookOdds), open_fair_odds: american(o.openFairOdds),
      })
    }
  }
  return { rows, players, matched }
}
