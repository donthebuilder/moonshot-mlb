// LONGSHOTS (2026-09-27, Donovan: "have these ready for all sports now that
// we have odds"). Server only.
//
// Every player whose market price is long (the median book at or past the
// sport's line below) beside what our own model says about him -- the
// question "who does the model like that the books price as a longshot?".
//
//   price   odds_snap, the NEWEST snapshot we hold for him that date (list,
//           then lock, then close): best book, median book, book count, when
//           it was taken. Never a price we didn't read.
//   model   each product's own score and CALLED / ON THE BOARD, as that
//           product publishes it -- never re-derived here:
//             MLB  the dated slate (slate_<date>_slim.json): hr_score; status
//                  from lib/callStatus.js on game_pick_role
//             NFL  nfl_week.json: scores.TD; CALLED = the week's TD card
//                  (nfl_results_<season>_wNN.json card.TD.rungs)
//             NHL  LAMP's board for the date (lib/nhl/boardRead.js): score,
//                  status as locked or previewed
//
// Sorted by model score. A price is not a pick and a score is not a
// probability: the page says both.
import { unstable_cache } from 'next/cache'
import { readPaged } from '../record/paged'
import { pricesFromRows } from './priceAtLock'
import { callStatus, boardOfRows } from '../callStatus'
import { readBoard } from '../nhl/boardRead'
import { easternToday } from '../data'

const DATA = 'https://raw.githubusercontent.com/donthebuilder/MLB-HR-DASHBOARD-STREAMLIT/data/public/data/current'
// "Long", per market: an anytime TD at +300 is 25%; a home run is rarely
// shorter than +250, so its long end starts later; a goal sits between.
export const LONG_AT = { nfl: 300, mlb: 500, nhl: 350 }
export const MARKET_WORD = { nfl: 'anytime TD', mlb: 'home run', nhl: 'anytime goal' }

// The bot's own numbers for each row, as each product publishes them.
// kind: 'num' (dp places), 'pct' (0-1 shown as %), 'mmss' (seconds), 'text'.
export const STAT_COLUMNS = {
  mlb: [
    { key: 'hr', label: 'HR', dp: 0, title: 'Season home runs' },
    { key: 'iso', label: 'ISO', dp: 3, title: 'Season isolated power' },
    { key: 'l10hr', label: 'L10 HR', dp: 0, title: 'Home runs, last 10 games' },
    { key: 'brl', label: 'BRL% L10', kind: 'pct', dp: 1, title: 'Barrel rate, last 10 games' },
    { key: 'since', label: 'G SINCE HR', dp: 0, title: 'Games since his last home run' },
    { key: 'spot', label: 'SPOT', dp: 0, title: 'Lineup spot' },
    { key: 'sp', label: 'VS SP', kind: 'text', w: 120, title: 'Opposing starter -- tap for his card', link: 'pitcher', linkId: 'spId' },
    { key: 'sphr9', label: 'SP HR/9', dp: 2, title: 'Opposing starter\u2019s home runs per 9' },
    { key: 'park', label: 'PARK', dp: 2, title: 'Park home-run factor (1.00 = average)' },
  ],
  nfl: [
    { key: 'td', label: 'TD', dp: 0, title: 'Touchdowns this season' },
    { key: 'xtd', label: 'xTD/G', dp: 2, title: 'Expected touchdowns per game from field position' },
    { key: 'tdpg', label: 'TD/G', dp: 2, title: 'Actual touchdowns per game' },
    { key: 'rz', label: 'RZ/G', dp: 1, title: 'Red-zone touches per game' },
    { key: 'gl', label: 'GL/G', dp: 1, title: 'Goal-line touches per game' },
    { key: 'tgt', label: 'TGT%', kind: 'pct', dp: 1, title: 'Share of team targets' },
    { key: 'since', label: 'G SINCE TD', dp: 0, title: 'Games since his last touchdown' },
  ],
  nhl: [
    { key: 'gpg', label: 'G/GP', dp: 2, title: 'Goals per game (the model\u2019s pooled window)' },
    { key: 'sogpg', label: 'SOG/GP', dp: 2, title: 'Shots on goal per game' },
    { key: 'toi', label: 'TOI', kind: 'mmss', title: 'Ice time per game' },
    { key: 'ppg', label: 'PP G', dp: 0, title: 'Power-play goals this season' },
    { key: 'oppga', label: 'OPP GA/GP', dp: 2, title: 'Opponent goals against per game' },
  ],
}
const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))

const getJson = async (url) => {
  try { const r = await fetch(url, { next: { revalidate: 600 } }); return r.ok ? await r.json() : null } catch { return null }
}

/** The first game date with a priced game that hasn't started yet. */
export async function nextPricedDate(db, sport) {
  const { data, error } = await db.from('odds_snap').select('game_date').eq('sport', sport).gte('game_date', easternToday())
    .gt('starts_at', new Date().toISOString()).order('game_date', { ascending: true }).limit(1)
  // A failed read is an outage, not "no prices" (audit 05 #12): thrown, the
  // route answers 502 uncached instead of caching "No prices" for 15-45 min.
  if (error) throw new Error(`odds_snap next date: ${error.message}`)
  return data?.[0]?.game_date || null
}

// READ ONCE PER NEW SNAPSHOT (2026-09-28, egress audit). The prices below
// were read from odds_snap on every CDN miss of /api/odds/longshots -- on all
// three home tabs -- ~30-100 MB/day for data that moves a few times a day.
// Same pattern as lib/odds/latest.js: a two-query freshness stamp (newest
// taken_at + exact count, no rows), and the entries in Next's shared Data
// Cache keyed on it. Nothing stale can be served: a new snapshot is a new key.
async function priceStamp(db, sport, date) {
  const f = (q) => q.eq('sport', sport).eq('game_date', date).not('our_player_id', 'is', null)
  const [top, cnt] = await Promise.all([
    f(db.from('odds_snap').select('taken_at')).order('taken_at', { ascending: false }).limit(1),
    f(db.from('odds_snap').select('taken_at', { count: 'exact', head: true })),
  ])
  if (top.error || cnt.error) throw new Error(`odds_snap freshness: ${(top.error || cnt.error).message}`)
  return `${top.data?.[0]?.taken_at || '-'}#${cnt.count ?? 0}`
}

async function latestPrices(db, sport, date) {
  const stamp = await priceStamp(db, sport, date)
  const build = async () => [...(await readLatestPrices(db, sport, date))]
  let entries
  try {
    entries = await unstable_cache(build, ['longshots-prices-v1', sport, date, stamp], { revalidate: 86400 })()
  } catch (e) {
    if (!/incrementalCache|static generation store|outside a request/i.test(String(e?.message))) throw e
    entries = await build()
  }
  return new Map(entries)
}

/** Newest snapshot per player for one date -> Map(id -> price). */
async function readLatestPrices(db, sport, date) {
  const { data, error } = await readPaged(() => db.from('odds_snap')
    .select('sport, event_id, game_date, our_player_id, book, odds, available, fair_odds, open_odds, taken_at, snap, starts_at')
    .eq('sport', sport).eq('game_date', date).not('our_player_id', 'is', null)
    .order('event_id', { ascending: true }).order('odd_id', { ascending: true }).order('book', { ascending: true }).order('snap', { ascending: true }))
  if (error) throw new Error(`odds_snap: ${error.message}`)
  const newest = new Map()
  for (const r of data) {
    const k = r.our_player_id
    if (!newest.has(k) || r.taken_at > newest.get(k)) newest.set(k, r.taken_at)
  }
  const rows = data.filter((r) => r.taken_at === newest.get(r.our_player_id))
  const { prices } = pricesFromRows(rows)
  const snapOf = new Map(rows.map((r) => [r.our_player_id, { snap: r.snap, starts_at: r.starts_at }]))
  const out = new Map()
  for (const [k, v] of prices) {
    const id = k.split(':')[2]
    out.set(id, { ...v, ...snapOf.get(id) })
  }
  return out
}

async function mlbModel(date) {
  const rows = await getJson(`${DATA}/slate_${date}_slim.json`)
  if (!Array.isArray(rows)) return null
  const m = new Map()
  // the rated board's size, for the top-third rule (0g D3)
  const boardOf = boardOfRows(rows)
  for (const r of rows) {
    if (r?.player_id == null || !Number.isFinite(Number(r.hr_score))) continue
    m.set(String(r.player_id), {
      name: r.name, team: r.team, opp: r.opponent, pos: null, score: Number(r.hr_score),
      status: callStatus({ role: r.game_pick_role, board_rank: r.board_rank, board_of: boardOf, on_board: true }), rank: r.board_rank ?? null,
      note: r.lineup_confirmed === false ? 'lineup not confirmed' : null,
      stats: {
        hr: num(r.season_hr), iso: num(r.season_iso), l10hr: num(r.last10_hr), brl: num(r.l10_barrel_rate),
        since: num(r.games_since_last_hr), spot: num(r.lineup_spot), sp: r.pitcher_name || null, spId: num(r.pitcher_id),
        sphr9: num(r.pitcher_hr9), park: num(r.park_hr_factor),
      },
    })
  }
  return m
}

async function nflModel() {
  const wk = await getJson(`${DATA}/nfl_week.json`)
  if (!wk?.players) return null
  const res = await getJson(`${DATA}/nfl_results_${wk.season}_w${String(wk.week).padStart(2, '0')}.json`)
  const card = new Map((res?.card?.TD?.rungs || []).map((r) => [String(r.player_id), r.rank]))
  const m = new Map()
  for (const p of wk.players) {
    if (p.on_bye || p.low_sample || !Number.isFinite(Number(p.scores?.TD))) continue
    m.set(String(p.player_id), {
      name: p.name, team: p.team, opp: p.opp, pos: p.position, score: Number(p.scores.TD),
      status: card.has(String(p.player_id)) ? 'called' : 'board', rank: card.get(String(p.player_id)) ?? null,
      note: p.questionable ? 'questionable' : null,
      injury: p.injury_status || null,   // the posts drop a man listed OUT (lib/dash/longshotsPost)
      stats: {
        td: num(p.season_td), xtd: num(p.stats?.xTD), tdpg: num(p.stats?.TD), rz: num(p.stats?.RZ), gl: num(p.stats?.GL),
        tgt: num(p.stats?.['TGT%']), since: num(p.games_since_last_td),
      },
    })
  }
  return m
}

async function nhlModel(date) {
  const b = await readBoard(date, { net: false }).catch(() => null)
  if (!b?.games) return null
  const m = new Map()
  for (const g of b.games) {
    for (const r of g.rows || []) {
      if (!Number.isFinite(Number(r.score))) continue
      m.set(String(r.playerId), {
        name: r.name, team: r.team, opp: r.opp, pos: r.pos, score: Number(r.score),
        status: r.status, rank: r.rank ?? null, note: r.preview ? 'board not locked yet' : null,
        stats: {
          gpg: num(r.legs?.goalsPg), sogpg: num(r.legs?.shotsPg), toi: num(r.legs?.toi), ppg: num(r.ppg), oppga: num(r.context?.oppGaPg),
        },
      })
    }
  }
  return m
}

const MODEL = { mlb: mlbModel, nfl: nflModel, nhl: nhlModel }

/**
 * @returns {{ sport, date, market, longAt, priced, modelled, rows, reason? }}
 */
export async function readLongshots(db, { sport, date = null }) {
  const day = date || (await nextPricedDate(db, sport))
  const base = { sport, market: MARKET_WORD[sport], longAt: LONG_AT[sport], statColumns: STAT_COLUMNS[sport] }
  if (!day) return { ...base, date: null, priced: 0, modelled: 0, rows: [], reason: 'no prices yet' }
  const [prices, model] = await Promise.all([latestPrices(db, sport, day), MODEL[sport](day)])
  if (!model) return { ...base, date: day, priced: prices.size, modelled: 0, rows: [], reason: 'model not published for this date' }
  const rows = []
  let modelled = 0
  for (const [id, p] of prices) {
    const m = model.get(id)
    if (!m) continue
    modelled += 1
    if (p.median < LONG_AT[sport]) continue
    rows.push({ id, ...m, median: p.median, best: p.best, bestBook: p.best_book, books: p.books, fair: p.fair, open: p.open, takenAt: p.taken_at, snap: p.snap, startsAt: p.starts_at })
  }
  rows.sort((a, b) => b.score - a.score || a.median - b.median)
  return { ...base, date: day, priced: prices.size, modelled, rows }
}
