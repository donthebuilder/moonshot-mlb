// EVERY MARKET WE SCORE, AT LOCK (2026-09-27, Donovan: "next"). Server only.
//
// An SGO event object carries its whole board -- ~1,000 MLB and ~1,500 NFL
// prices a game -- and costs one object whichever markets we keep. odds_snap
// keeps the anytime HR / TD / goal market book by book. This keeps the OTHER
// markets our products score, one COMPACT row per player per market, at the
// lock snapshot only (the price the record is judged against):
//   consensus line + price (SGO's bookOverUnder / bookOdds), the feed's fair
//   and opening line + price, the best book's line + price, and how many
//   books listed it.
// Only the side our models rate: 'yes' on a yes/no market, 'over' on an
// over/under. ~5k rows a MLB day, ~3k a NFL week -- vs ~75k a day for every
// book on every side, which the database can't carry.
//
// NHL: the regular season's market names are confirmed on the first game
// (09-29); until then NHL keeps only its goal market (odds_snap).
import { MARKETS, startsAt, gameDate } from './snap'

// our market key -> SGO statID, per league. Keys are the products' own words.
export const EXTRA = {
  MLB: {
    hits: 'batting_hits',                  // HIT board
    hrr: 'batting_hits+runs+rbi',          // HRR board
    tb: 'batting_totalBases',              // contact / total bases
    sb: 'batting_stolenBases',             // steal board
    k: 'pitching_strikeouts',              // pitchers
  },
  NFL: {
    rec_yds: 'receiving_yards',
    rec: 'receiving_receptions',
    rush_yds: 'rushing_yards',
    rush_att: 'rushing_attempts',
    pass_yds: 'passing_yards',
    kick_pts: 'kicking_totalPoints',
  },
  NHL: {},
}
const SIDE = { yn: 'yes', ou: 'over' }

const american = (v) => {
  const n = Number(String(v ?? '').replace(/^\+/, ''))
  return Number.isInteger(n) && n !== 0 ? n : null
}
const numOrNull = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))

/** Best book for the side: yes = longest price; over = lowest line, then longest price. Pure. */
export function bestBook(bet, byBookmaker) {
  let best = null
  for (const [book, b] of Object.entries(byBookmaker || {})) {
    if (b?.available === false) continue
    const odds = american(b.odds)
    if (odds == null) continue
    const line = numOrNull(b.overUnder)
    const better = !best
      || (bet === 'ou' && line != null && best.line != null && line < best.line)
      || ((bet !== 'ou' || line === best.line) && odds > best.odds)
    if (better) best = { book, odds, line }
  }
  return best
}

/** { rows, players, matched } of compact extra-market rows for one event. Pure. */
export function linesRows(ev, snap, takenAt, match) {
  const m = MARKETS[ev.leagueID]
  const want = EXTRA[ev.leagueID] || {}
  const byStat = new Map(Object.entries(want).map(([k, stat]) => [stat, k]))
  const rows = []
  const seen = new Set()
  let matched = 0
  for (const [oddID, o] of Object.entries(ev.odds || {})) {
    const market = byStat.get(o.statID)
    if (!market || o.periodID !== 'game' || !o.playerID || o.sideID !== SIDE[o.betTypeID]) continue
    const sp = ev.players?.[o.playerID]
    if (!sp) continue
    const ours = match ? match(sp, ev) : null
    if (!seen.has(o.playerID)) { seen.add(o.playerID); if (ours) matched += 1 }
    const books = Object.values(o.byBookmaker || {}).filter((b) => b?.available !== false && american(b.odds) != null).length
    if (!books) continue
    const best = bestBook(o.betTypeID, o.byBookmaker)
    const side = ['home', 'away'].find((s) => ev.teams?.[s]?.teamID === sp.teamID)
    rows.push({
      sport: m.sport, event_id: ev.eventID, game_date: gameDate(ev), starts_at: startsAt(ev), snap, taken_at: takenAt,
      market, stat: o.statID, bet: o.betTypeID, side: o.sideID, odd_id: oddID,
      sgo_player_id: o.playerID, player_name: sp.name || null, team: side ? ev.teams[side].names?.short || null : null, our_player_id: ours,
      line: numOrNull(o.bookOverUnder), odds: american(o.bookOdds),
      fair_line: numOrNull(o.fairOverUnder), fair_odds: american(o.fairOdds),
      open_line: numOrNull(o.openBookOverUnder), open_odds: american(o.openBookOdds),
      best_line: best?.line ?? null, best_odds: best?.odds ?? null, best_book: best?.book ?? null, books,
    })
  }
  return { rows, players: seen.size, matched }
}
