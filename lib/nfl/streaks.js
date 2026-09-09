// 🔥 STREAKS — who is hot, or cold, at a bar YOU pick.
//
// The NFL sibling of MOONSHOT's Runs page. Boards ranks the whole slate by
// the model's score; this ignores the model and asks the raw game log one
// question: how many games in a row has he landed on the same side of this
// number? Hot at the top for the play, or flipped for the fade.
//
// Reads nfl_logs.json exactly as PropsGrid/HitRate do -- `logs.bars` maps a
// market to its log column and the bot's bar, `logs.logs[id].log` is the
// per-game rows (season, week, opp, team, g_*). Nothing here needs a bot run:
// change the bar and the whole board re-grades in the browser.
//
// A streak is counted from the most recent game backwards and stops at the
// first game on the other side. A player with no games in the window is not
// on the board at all -- an empty log is not a zero-game streak.

const WINDOW = 30

// ── VOLUME, OR A REASON (Donovan, 2026-09-05) ────────────────────────────────
//
// The first cold board was every zero-target tight end at "28 straight under
// 40 receiving yards" -- true, and worthless. A streak is only a streak if
// the man is actually being asked the question. So a row needs one of:
//   · VOLUME  -- enough usage over his last eight to make the number mean
//               something (the column and the floor are per market);
//   · a REASON to look anyway, and the reason is printed on the row:
//       rising  -- his usage over the last three is well above the five
//                  before them: an injury ahead of him, a role change,
//                  a depth-chart move. The proxy for "moved up".
//       bot     -- the bot scores him 60+ in this market this week, so the
//                  model thinks he is live regardless of the old log.
// A questionable tag rides on the row when the slate says so; it is not a
// reason to show him, it is a reason to be careful.
const USAGE = {
  TD: { cols: ['g_rec', 'g_car'], floor: 4 },        // touches a game
  REC_YDS: { cols: ['g_rec'], floor: 2.5 },          // catches a game
  REC: { cols: ['g_rec'], floor: 2.5 },
  RUSH_YDS: { cols: ['g_car'], floor: 6 },
  RUSH_ATT: { cols: ['g_car'], floor: 6 },
  PASS_YDS: { cols: ['g_payd'], floor: 120 },         // started, basically
  KICK_PTS: { cols: ['g_kick'], floor: 3 },
}
const avg = (rows, cols) => rows.length ? rows.reduce((a, r) => a + cols.reduce((b, c) => b + (Number(r[c]) || 0), 0), 0) / rows.length : 0

/** Usage read for one player in one market, off the raw log. */
export function usageFor(logs, playerId, market, window = WINDOW) {
  const spec = USAGE[market] || USAGE.TD
  const log = logs?.logs?.[String(playerId)]?.log
  if (!Array.isArray(log) || !log.length) return { recent: 0, prior: 0, rising: false, volume: false }
  const rows = [...log].sort(ord).slice(-window)
  const last8 = rows.slice(-8)
  const last3 = rows.slice(-3)
  const prior5 = rows.slice(-8, -3)
  const recent = avg(last8, spec.cols)
  const a3 = avg(last3, spec.cols)
  const a5 = avg(prior5, spec.cols)
  // Rising means he is AT the floor now and was clearly below it before --
  // a real role change, not 2.0 catches becoming 2.6.
  const rising = prior5.length >= 3 && a3 >= spec.floor && a5 < spec.floor * 0.6 && a3 >= 1.5 * a5
  return { recent, prior: a5, rising, volume: recent >= spec.floor, floor: spec.floor }
}

/** Why a row is on the board. Empty array = plain volume. */
export function reasonsFor(logs, player, market) {
  const u = usageFor(logs, player.player_id, market)
  const out = []
  if (u.rising) out.push('rising')
  if (Number.isFinite(player.scores?.[market]) && player.scores[market] >= 60) out.push('bot')
  return { usage: u, reasons: out, show: u.volume || out.length > 0 }
}

const ord = (a, b) => (a.s - b.s) || (a.w - b.w)

/** Market keys this log file can speak to, in the bot's order. */
export function streakMarkets(logs) {
  return Object.entries(logs?.bars || {}).map(([key, [field, bar]]) => ({ key, field, bar: Number(bar) }))
}

/** Values for one market, oldest → newest, capped to the window. */
export function seriesFor(logs, playerId, field, window = WINDOW) {
  const log = logs?.logs?.[String(playerId)]?.log
  if (!Array.isArray(log) || !log.length) return []
  return [...log].sort(ord).slice(-window).map((row) => ({
    s: row.s, w: row.w, opp: row.opp, v: Number(row[field]) || 0,
  }))
}

/** Consecutive games, newest first, on `side` of `bar`. */
export function activeStreak(series, bar, side) {
  let n = 0
  for (let i = series.length - 1; i >= 0; i--) {
    const over = series[i].v >= bar
    if (over === (side === 'over')) n++
    else break
  }
  return n
}

/**
 * Every slate player with a log, ranked by active streak on the chosen side.
 * @param {object} logs   nfl_logs.json
 * @param {Array}  players the slate's players (names live here, not in the log)
 * @param {string} field  log column, from streakMarkets()
 * @param {number} bar    the line you chose
 * @param {'over'|'under'} side
 */
export function streakBoard(logs, players, field, bar, side = 'over', window = WINDOW, market = null) {
  const out = []
  for (const p of Array.isArray(players) ? players : []) {
    const series = seriesFor(logs, p.player_id, field, window)
    if (!series.length) continue
    const why = market ? reasonsFor(logs, p, market) : { usage: null, reasons: [], show: true }
    if (!why.show) continue
    const streak = activeStreak(series, bar, side)
    const hits = series.filter((r) => r.v >= bar).length
    out.push({
      player: p,
      streak,
      games: series.length,
      hits,
      rate: hits / series.length,
      last8: series.slice(-8),
      lastV: series[series.length - 1].v,
      usage: why.usage,
      reasons: why.reasons,
      questionable: Boolean(p.questionable),
    })
  }
  out.sort((a, b) => (b.streak - a.streak) || ((side === 'over' ? b.rate - a.rate : a.rate - b.rate)) || (b.games - a.games))
  return out
}

/** Line chips around the bot's bar, in units that make sense for the market. */
export function barChoices(market, bar) {
  const b = Number(bar) || 0
  if (market === 'TD') return [1, 2]
  if (market === 'REC' || market === 'RUSH_ATT') return [b - 2, b - 1, b, b + 1, b + 2].filter((x) => x > 0)
  if (market === 'KICK_PTS') return [b - 3, b, b + 3, b + 6].filter((x) => x > 0)
  const step = market === 'PASS_YDS' ? 25 : 10
  return [b - 2 * step, b - step, b, b + step, b + 2 * step].filter((x) => x > 0)
}
