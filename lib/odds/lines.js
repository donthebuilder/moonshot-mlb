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
// NHL: names read off the first regular-season game (FLA@CAR 09-29, read
// 09-27): shots_onGoal, assists, goals+assists (hockey's "points" -- SGO's own
// `points` is GOALS, the odds_snap market), goalie_saves.
import { MARKETS, startsAt, gameDate } from './snap'
import { MIN_BAR } from '../card/rules'

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
    // BATCH-MODEL-V2 M5 (2026-10-03): the combos, ids confirmed on a live event
    // (IND @ WAS). Captured from the snapshot already fetched -- no extra SGO objects.
    pass_rush_yds: 'passing+rushing_yards',   // QB
    rush_rec_yds: 'rushing+receiving_yards',  // RB / WR
  },
  // BUCKETS' five book markets (statIDs confirmed 10-02 on a preseason event)
  NBA: {
    pts: 'points',
    reb: 'rebounds',
    ast: 'assists',
    '3pm': 'threePointersMade',
    pra: 'points+rebounds+assists',
  },
  NHL: {
    sog: 'shots_onGoal',                   // Hot sticks, the board's shots leg
    ast: 'assists',
    pts: 'goals+assists',
    saves: 'goalie_saves',
  },
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

// ALTERNATE RUNGS (Donovan, 2026-10-30: "the baseline of our lines should be how the players are picked for the basketball"). BUCKETS' Card bars are
// points 25+, rebounds 10+, assists 8+, threes 4+, PRA 35+ (lib/card/rules.js MIN_BAR), but the books' MAIN line is usually lower (23.5 points), so the
// Card had no rung at the bar and tracked the man instead. The same SGO object already lists each book's altLines; this keeps the rungs AT AND ABOVE
// the bar (the lowest ALT_RUNGS of them), one odds_lines row each, odd_id `<oddID>@<line>` (lib/odds/twoPlus.js precedent), price = the median across
// the books listing that rung. No extra call, no table change. A player whose main line is under ALT_MIN_SHARE of the bar is a bench man: skipped.
// lib/card/sources.js loadLines reads every rung in the newest snapshot and chooseRung takes the lowest that clears the bar.
export const ALT_RUNGS = 3
export const ALT_MIN_SHARE = 0.6
const impliedOf = (a) => (a > 0 ? 100 / (a + 100) : -a / (-a + 100))
const americanOf = (p) => (p >= 0.5 ? -Math.round((100 * p) / (1 - p)) : Math.round((100 * (1 - p)) / p))
const medianOf = (xs) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }

/** [{ line, odds, best, books }] for the alternate over rungs at or above the market's bar, lowest first, at most ALT_RUNGS. Pure. */
export function altRungs(o, sport, market) {
  const bar = MIN_BAR[sport]?.[market]
  const main = numOrNull(o.bookOverUnder)
  if (bar == null || main == null || main < bar * ALT_MIN_SHARE) return []
  const byLine = new Map()
  for (const b of Object.values(o.byBookmaker || {})) {
    if (b?.available === false) continue
    for (const a of Array.isArray(b?.altLines) ? b.altLines : []) {
      if (a?.available === false) continue
      const line = numOrNull(a?.overUnder ?? a?.line); const odds = american(a?.odds)
      if (line == null || odds == null || Math.floor(line) + 1 < bar || line === main) continue
      ;(byLine.get(line) || byLine.set(line, []).get(line)).push(odds)
    }
  }
  return [...byLine.entries()].sort((a, b) => a[0] - b[0]).slice(0, ALT_RUNGS)
    .map(([line, list]) => ({ line, odds: americanOf(medianOf(list.map(impliedOf))), best: Math.max(...list), books: list.length }))
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
    if (ev.leagueID === 'NBA') {
      const base = rows[rows.length - 1]
      for (const r of altRungs(o, m.sport, market)) rows.push({ ...base, odd_id: `${oddID}@${r.line}`, line: r.line, odds: r.odds, fair_line: null, fair_odds: null, open_line: null, open_odds: null, best_line: r.line, best_odds: r.best, best_book: null, books: r.books })
    }
  }
  return { rows, players: seen.size, matched }
}
