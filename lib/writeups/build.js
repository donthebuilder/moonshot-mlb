// THE GAME WRITE-UP (BATCH-GAME-WRITEUP, 2026-10-04). One game's calls turned
// into a story: two players, why each is the look, what could go wrong, the
// price against the model's measured hit rate, and the status words kept
// straight. Donovan, after the Hubbard/LaPorta post: "each game should have
// that, just like how baseball has the call ... auto".
//
// PURE: (inputs) -> write-up JSON. No fetch, no clock, no storage. Every line
// is { t, src, v }: the words, the field they came from, and the values they
// print -- the checker (lib/facts/check.js, via text.js) allows a number in
// the post only if it is one of those values. The writer may reorder or cut a
// line; it may never add one, and no line exists without a source field.
//
// Calls are the game calls (nfl_game_calls.json: TOP + the other side's TD
// call, locked at kickoff), not a second pick system. A side with no call is
// named from no_call[] with its real status -- never filled in.
import { tdPool } from '../nfl/tdPool'
import { gradeFor } from '../nfl/theme'
import { quoteFor, impliedPct } from '../nfl/oddsMatch'
import { tdCallStatus, STATUS_WORD } from '../callStatus'
import { nflDepth } from './nfl'
import { buildMlbWriteup } from './mlb'
import { buildNhlWriteup } from './nhl'

export const FOOTER = 'Not betting advice. These are the model’s numbers, not a guarantee.'

const num = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))
const fx = (v, dp) => (num(v) == null ? null : Number(num(v).toFixed(dp)))   // the printed value, as a number
const line = (t, src, ...v) => ({ t, src, v: v.filter((x) => x != null) })
const median = (xs) => { const s = xs.filter((x) => x != null).sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null }
const ord = (n) => `${n}${['th', 'st', 'nd', 'rd'][(n % 100 > 10 && n % 100 < 14) || n % 10 > 3 ? 0 : n % 10]}`

/** Kickoff in Eastern time: 'Sun 4:25 PM ET'. */
export function kickoffLabel(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const s = d.toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: '2-digit' })
  return `${s.replace(',', '')} ET`
}

// ── NFL ─────────────────────────────────────────────────────────────────────

// the four WATCH-OUT rules (plan section 3) + the injury flag the file carries.
// Each reads one field; none can be written by hand.
function nflWatch(p, { tier, quote, implied, logs, pool, medians, gameTeams }) {
  const out = []
  if (p.questionable || /questionable|doubtful/i.test(String(p.injury_status || ''))) {
    out.push(line('listed questionable on the injury report', 'nfl_week.json players[].questionable / injury_status'))
  }
  // 1. the price asks more than this call tier has delivered (measured, from the record)
  if (implied != null && tier && tier.n > 0 && implied > (100 * tier.hit) / tier.n) {
    out.push(line(`the price implies ${implied}%; ${tier.label} calls have scored in ${tier.hit} of ${tier.n} so far`,
      'nfl_odds_latest.json implied + nfl_game_calls_totals.json top/second', implied, tier.hit, tier.n))
  }
  // 2. recent rate weak: a TD in at most 1 of his last 4 games
  const log = (logs?.logs?.[p.player_id]?.log || []).filter((g) => num(g.g_td) != null)
  const l4 = log.slice(-4)
  if (l4.length === 4) {
    const hit = l4.filter((g) => num(g.g_td) >= 1).length
    if (hit <= 1) out.push(line(`a touchdown in ${hit} of his last 4 games`, 'nfl_logs.json logs[].log[].g_td', hit, 4))
  }
  // 3. a teammate in this game ranks higher on the board
  const mine = num(p.scores?.TD)
  const above = pool.rows.find((r) => r.team === p.team && r.player_id !== p.player_id && gameTeams.has(r.team) && num(r.scores?.TD) > mine)
  if (above) out.push(line(`${above.name} ranks higher on the TD board (${fx(above.scores.TD, 1)})`, 'nfl_week.json players[].scores.TD', fx(above.scores.TD, 1)))
  // 4. thin role against his position's median this week
  if (p.position === 'RB') {
    const car = fx(p.stats?.CAR, 1)
    if (car != null && medians.CAR != null && car < medians.CAR) out.push(line(`${car} carries a game, under the RB median of ${medians.CAR}`, 'nfl_week.json players[].stats.CAR', car, medians.CAR))
  } else {
    const ts = p.stats?.['TGT%'] != null ? fx(100 * p.stats['TGT%'], 1) : null
    const med = medians[p.position]
    if (ts != null && med != null && ts < med) out.push(line(`${ts}% target share, under the ${p.position} median of ${med}%`, "nfl_week.json players[].stats['TGT%']", ts, med))
  }
  return out.slice(0, 2)
}

function nflWhy(p, { matchup, weights }) {
  const out = []
  const s = p.stats || {}
  const rz = fx(s.RZ, 1), gl = fx(s.GL, 1), xtd = fx(s.xTD, 2), td = fx(s.TD, 2), tch = fx((num(s.CAR) || 0) + (num(s.TGT) || 0), 1)
  // the model's own order: the TD components by weight x his percentile
  const comps = Object.entries(p.components?.TD || {}).filter(([k, v]) => num(v) != null && weights?.[k])
    .sort((a, b) => b[1] * weights[b[0]] - a[1] * weights[a[0]]).map(([k]) => k)
  for (const k of comps) {
    if (out.length >= 3) break
    if (k === 'f_rz_opp' && rz != null) out.push(line(`${rz} red-zone touches a game`, 'nfl_week.json players[].stats.RZ', rz))
    else if (k === 'f_gl_opp' && gl != null) out.push(line(`${gl} goal-line touches a game`, 'nfl_week.json players[].stats.GL', gl))
    else if (k === 'f_xtd' && xtd != null) out.push(line(`${xtd} expected TDs a game from where he gets the ball${td != null ? ` (${td} actual)` : ''}`, 'nfl_week.json players[].stats.xTD / TD', xtd, td))
    else if (k === 'f_touches' && tch) out.push(line(`${tch} touches a game (carries + targets)`, 'nfl_week.json players[].stats.CAR + TGT', tch))
    else if (k === 'f_snap_pct') out.push(line(`snap share in the ${ord(Math.round(p.components.TD.f_snap_pct))} percentile`, 'nfl_week.json players[].components.TD.f_snap_pct', Math.round(p.components.TD.f_snap_pct)))
    else if (k === 'implied_total') out.push(line(`his team's implied total is in the ${ord(Math.round(p.components.TD.implied_total))} percentile`, 'nfl_week.json players[].components.TD.implied_total', Math.round(p.components.TD.implied_total)))
  }
  if (p.position !== 'RB' && s['TGT%'] != null && out.length < 4) out.push(line(`${fx(100 * s['TGT%'], 1)}% target share`, "nfl_week.json players[].stats['TGT%']", fx(100 * s['TGT%'], 1)))
  const role = matchup?.roles?.[p.player_id]
  const d = role && matchup?.dvp?.season?.[p.opp]?.[role]
  if (d && num(d.td_rank) != null && num(d.g) && d.td_rank <= 12) {
    const r = d.td_rank
    out.push({ ...line(`${p.opp} give up TDs to the ${role} role at the ${ord(r)}-highest rate in the league (${d.g} games)`, `nfl_matchup.json dvp.season.${p.opp}.${role}.td_rank`, r, d.g), names: [role] })
  }
  return out.slice(0, 5)
}

/**
 * One NFL game's write-up.
 * @param game     a games[] entry of nfl_game_calls.json
 * @param inputs   { week (nfl_week.json), totals (nfl_game_calls_totals), matchup, logs, odds }
 */
export function buildNflWriteup(game, { week, totals, matchup, logs, odds } = {}) {
  if (!game?.game_id) return null
  const pool = tdPool(week)
  const byId = new Map((week?.players || []).map((p) => [String(p.player_id), p]))
  const wg = (week?.games || []).find((g) => String(g.game_id) === String(game.game_id)) || {}
  const gameTeams = new Set([game.away, game.home])
  // medians of this week's file, by position: carries for backs, target share for receivers
  const elig = pool.rows.filter((p) => !p.low_sample)
  const medians = {
    CAR: fx(median(elig.filter((p) => p.position === 'RB').map((p) => num(p.stats?.CAR))), 1),
    WR: fx(median(elig.filter((p) => p.position === 'WR').map((p) => (num(p.stats?.['TGT%']) == null ? null : 100 * p.stats['TGT%']))), 1),
    TE: fx(median(elig.filter((p) => p.position === 'TE').map((p) => (num(p.stats?.['TGT%']) == null ? null : 100 * p.stats['TGT%']))), 1),
  }
  const tiers = {
    TOP: totals?.top ? { label: 'TOP', hit: totals.top.hit, n: totals.top.n } : null,
    TD: totals?.second ? { label: 'second', hit: totals.second.hit, n: totals.second.n } : null,
  }

  const players = (game.calls || []).map((c) => {
    const p = byId.get(String(c.player_id)) || { player_id: c.player_id, name: c.name, team: c.team, position: c.position, opp: c.team === game.home ? game.away : game.home }
    const status = tdCallStatus({ on_bot: true })   // a game call is a call: CALLED
    const posRows = pool.rows.filter((r) => r.position === p.position)
    const posRank = posRows.findIndex((r) => String(r.player_id) === String(p.player_id)) + 1
    const q = quoteFor(odds, p, 'TD')
    // the price on offer and what it implies, from the American odds themselves
    const am = num(q?.best_over ?? q?.over)
    const price = am != null ? { odds: am, book: q.best_book || null, implied: impliedPct(am) } : null
    return {
      player_id: String(c.player_id), name: c.name, team: c.team, opp: p.opp, position: c.position,
      role: c.role, status, status_word: STATUS_WORD[status],
      tdScore: fx(c.score, 1), grade: gradeFor(c.score).label, rank: c.slate_rank, of: c.of, posRank: posRank || null, posOf: posRows.length,
      why: nflWhy(p, { matchup, weights: pool.weights }),
      watch: nflWatch(p, { tier: tiers[c.role], quote: q, implied: price?.implied ?? null, logs, pool, medians, gameTeams }),
      price,
      depth: nflDepth(p, matchup),   // the full write-up's football depth (lib/writeups/nfl.js)
      src: 'nfl_game_calls.json games[].calls[]',
    }
  })
  // a side with no call: its best player, with his REAL status (never filled in)
  const noCall = (game.no_call || []).map((n) => {
    const status = tdCallStatus({ td_board: { rank: n.best_rank, of: n.of } })
    return { team: n.team, name: n.best_name, player_id: n.best_player_id ? String(n.best_player_id) : null, rank: n.best_rank, of: n.of, status, status_word: STATUS_WORD[status], src: 'nfl_game_calls.json games[].no_call[]' }
  })

  const pa = (t) => fx(week?.team_defense?.per_game?.[t]?.points_allowed, 1)
  const gameLines = []
  if (wg.venue) gameLines.push(line(wg.indoors ? `${wg.venue} (indoors)` : `${wg.venue}${num(wg.weather_temp_f) != null ? `, ${wg.weather_temp_f}°F` : ''}${wg.weather_condition ? ` ${String(wg.weather_condition).toLowerCase()}` : ''}`,
    'nfl_week.json games[].venue / indoors / weather_*', wg.indoors ? null : num(wg.weather_temp_f)))
  if (pa(game.away) != null && pa(game.home) != null) {
    gameLines.push(line(`${game.away} allow ${pa(game.away)} points a game, ${game.home} allow ${pa(game.home)}`, 'nfl_week.json team_defense.per_game[].points_allowed', pa(game.away), pa(game.home)))
  }

  const bottom = [
    ...players.map((p) => line(`${p.name} is ${p.status_word}${p.role === 'TOP' ? ', the game’s top call' : `, ${p.team}’s call`}.`, 'nfl_game_calls.json calls[].role')),
    ...noCall.map((n) => line(n.status === 'board'
      ? `${n.team}: ${n.name} is ${STATUS_WORD.board}, not called.`
      : `${n.team}: no call. ${n.name ? `${n.name}, their top TD score, is ${n.status_word}.` : ''}`.trim(), 'nfl_game_calls.json no_call[]')),
  ]

  return {
    sport: 'nfl', game_id: String(game.game_id), kickoff: game.kickoff, away: game.away, home: game.home,
    away_name: wg.away_name || game.away, home_name: wg.home_name || game.home,
    when: kickoffLabel(game.kickoff), week: week?.week ?? null, locked: !!game.locked,
    header: line(`${players.map((p) => p.name).join(' + ') || 'No call'}: why ${players.length > 1 ? 'they’re' : 'he’s'} TD looks`, 'nfl_game_calls.json calls[].name'),
    game: gameLines, players, noCall, bottom, footer: FOOTER,
    built_from: { calls: 'nfl_game_calls.json', week: week?.built_at || null, odds: odds?.fetched_at || null, totals: totals?.updated_at || null },
  }
}

// one builder per sport (MLB 2026-10-05: lib/writeups/mlb.js, the per-game CALL post made long; NHL lib/writeups/nhl.js)
const BUILDERS = { nfl: buildNflWriteup, mlb: buildMlbWriteup, nhl: buildNhlWriteup }
export function buildWriteup(sport, game, inputs) {
  return BUILDERS[sport] ? BUILDERS[sport](game, inputs) : null
}
