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

// ALTERNATE OVER RUNGS (2026-10-11, Card lines spec). The Card's 100+ yards, 300+ passing and 7+ catches straights need a stored price at a HIGH
// line; the main line is usually 40-90. Where the feed lists a book's alternate lines (byBookmaker[book].altLines, or odds[oddID].altLines) the
// rungs below are kept, one row per (player, market, rung), under `<market>_alt` so every reader of the main market (the graded-line join, the
// latest-odds board, the shadow record) still sees exactly one row per player. The Card's loadLines reads both. Insert-only like the rest.
// A rung is stored only for a line listed in the table below (bounded rows), at the price the median book gives for THAT line.
export const ALT_RUNGS = {
  NFL: { rec_yds: [79.5, 99.5], rush_yds: [79.5, 99.5], pass_yds: [299.5], rec: [6.5] },
}
export const ALT_SUFFIX = '_alt'

// 2+ MARKETS (2026-10-11): the over 1.5 of the anytime stat (TD / HR / goals). Same shape as a yards line (consensus line 1.5 + median price).
// Only an over/under bet at 1.5 -- the yes/no anytime market is odds_snap's and is never read here.
export const TWO_PLUS = {
  NFL: { td2: 'touchdowns' },
  MLB: { hr2: 'batting_homeRuns' },
  NHL: { goals2: 'points' },
}
export const TWO_LINE = 1.5

const median = (xs) => {
  const a = xs.filter((x) => Number.isFinite(x)).sort((x, y) => x - y)
  if (!a.length) return null
  const m = a.length >> 1
  return a.length % 2 ? a[m] : Math.round((a[m - 1] + a[m]) / 2)
}
const sameLine = (a, b) => a != null && b != null && Math.abs(a - b) < 1e-9

/** Every listed line of one over/under market -> [{ line, odds (median across books), best_odds, best_book, books }], from the books' alternate lines. Pure. */
export function altLineRungs(o) {
  const per = new Map()   // line -> [{ book, odds }]
  const add = (book, line, odds) => {
    if (line == null || odds == null) return
    if (!per.has(line)) per.set(line, [])
    per.get(line).push({ book, odds })
  }
  for (const [book, b] of Object.entries(o.byBookmaker || {})) {
    if (b?.available === false) continue
    for (const a of b?.altLines || []) {
      if (a?.available === false) continue
      add(book, numOrNull(a.overUnder ?? a.line), american(a.odds))
    }
  }
  for (const a of o.altLines || []) {
    for (const [book, b] of Object.entries(a?.byBookmaker || {})) { if (b?.available !== false) add(book, numOrNull(a.overUnder ?? a.bookOverUnder), american(b.odds)) }
  }
  return [...per].map(([line, list]) => {
    const best = list.reduce((x, y) => (y.odds > x.odds ? y : x))
    return { line, odds: median(list.map((x) => x.odds)), best_odds: best.odds, best_book: best.book, books: list.length }
  }).sort((x, y) => x.line - y.line)
}

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
  // alternate rungs + the 2+ markets, from the same event object (no extra fetch)
  const rungsWanted = ALT_RUNGS[ev.leagueID] || {}
  const twoWanted = new Map(Object.entries(TWO_PLUS[ev.leagueID] || {}).map(([k, stat]) => [stat, k]))
  for (const [oddID, o] of Object.entries(ev.odds || {})) {
    if (o.periodID !== 'game' || !o.playerID || o.betTypeID !== 'ou' || o.sideID !== 'over') continue
    const sp = ev.players?.[o.playerID]
    if (!sp) continue
    const market = byStat.get(o.statID)
    const two = twoWanted.get(o.statID)
    if (!(market && rungsWanted[market]) && !two) continue
    const ours = match ? match(sp, ev) : null
    const side = ['home', 'away'].find((s) => ev.teams?.[s]?.teamID === sp.teamID)
    const base = {
      sport: m.sport, event_id: ev.eventID, game_date: gameDate(ev), starts_at: startsAt(ev), snap, taken_at: takenAt,
      stat: o.statID, bet: 'ou', side: 'over',
      sgo_player_id: o.playerID, player_name: sp.name || null, team: side ? ev.teams[side].names?.short || null : null, our_player_id: ours,
      fair_line: null, fair_odds: null, open_line: null, open_odds: null,
    }
    const alts = altLineRungs(o)
    if (market && rungsWanted[market]) {
      for (const r of alts) {
        if (!rungsWanted[market].some((w) => sameLine(w, r.line)) || r.odds == null) continue
        if (sameLine(r.line, numOrNull(o.bookOverUnder))) continue   // the main line is already the main row
        rows.push({ ...base, market: market + ALT_SUFFIX, odd_id: `${oddID}#${r.line}`, line: r.line, odds: r.odds, best_line: r.line, best_odds: r.best_odds, best_book: r.best_book, books: r.books })
      }
    }
    if (two) {
      // the 1.5 over: the main line when the book's consensus line is 1.5, else an alternate at 1.5
      const mainLine = numOrNull(o.bookOverUnder)
      if (sameLine(mainLine, TWO_LINE) && american(o.bookOdds) != null) {
        const best = bestBook('ou', o.byBookmaker)
        const books = Object.values(o.byBookmaker || {}).filter((b) => b?.available !== false && american(b.odds) != null).length
        if (books) rows.push({ ...base, market: two, odd_id: oddID, line: mainLine, odds: american(o.bookOdds), fair_line: numOrNull(o.fairOverUnder), fair_odds: american(o.fairOdds), open_line: numOrNull(o.openBookOverUnder), open_odds: american(o.openBookOdds), best_line: best?.line ?? null, best_odds: best?.odds ?? null, best_book: best?.book ?? null, books })
      } else {
        const r = alts.find((x) => sameLine(x.line, TWO_LINE))
        if (r && r.odds != null) rows.push({ ...base, market: two, odd_id: `${oddID}#${r.line}`, line: r.line, odds: r.odds, best_line: r.line, best_odds: r.best_odds, best_book: r.best_book, books: r.books })
      }
    }
  }
  return { rows, players: seen.size, matched }
}
