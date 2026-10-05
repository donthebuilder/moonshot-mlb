// THE GAME WRITE-UP, BASEBALL (2026-10-05, Donovan: "if the write-up shows the same person ...
// and is just a longer post, of course. build it"). The per-game CALL post (lib/dash/gameCall)
// made long: the SAME headliner gameCalls() picks -- the top CALLED hitter in the game -- then
// the other side's top called hitter, each with why he is the look, what could go wrong and the
// bar he is graded on, in NFL's write-up shape (build.js) so text.js renders and checks it.
//
// PURE: (board rows of one game) -> write-up JSON. Every line is { t, src, v }: the words, the
// field they came from, and the printed values -- the checker (lib/facts/check.js) allows a number
// only if it is one of them. A line whose field is missing is not written; nothing is filled in.
import { gameCalls, callRole, battingSide, PLAIN_BAR, ROLE_ORDER } from '../dash/gameCall'
import { callStatus, STATUS_WORD, isCalledRole } from '../callStatus'
import { boardCompare } from '../boardOrder'

const num = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))
const txt = (v) => (v == null ? '' : String(v).trim())
const line = (t, src, ...v) => ({ t, src, v: v.filter((x) => x != null) })
const avg3 = (v) => v.toFixed(3).replace(/^0\./, '.')
const pctS = (v) => String(Math.round(v * (v <= 1 ? 100 : 1)))
const ord = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th')}`
const fx = (v, dp) => (num(v) == null ? null : num(v).toFixed(dp))

// the old CALL post's last line stays (appended after the check: 'first' is a word the checker guards)
export const MLB_FOOTER = 'Locked before first pitch. Graded against exactly that. Not betting advice.'
// the score each call is graded on (same table as lib/dash/gameCall scoreFor)
const SCORE = { TOP: 'hr_score', HR: 'hr_score', HRR: 'hrr_score', HIT: 'hit_score', CONTACT: 'contact_score' }
const scoreOf = (row, role) => num(role === 'HRR' ? (row?.hrr_score ?? row?.prod_score) : role === 'CONTACT' ? (row?.tb_score ?? row?.contact_score) : row?.[SCORE[role]])

function handWords(row) {
  const thr = txt(row?.pitcher_throws).toUpperCase()
  return { thr, hand: thr === 'L' ? 'left-handed' : thr === 'R' ? 'right-handed' : '', side: battingSide(row) }
}

function mlbWhy(row, role) {
  const out = []
  const { thr, hand, side } = handWords(row)
  const arm = txt(row?.pitcher_name)
  const sideWord = side === 'L' ? 'lefties' : side === 'R' ? 'righties' : null
  const power = role === 'TOP' || role === 'HR'
  if (power) {
    const hr9 = side ? num(row?.[`pitcher_hr9_vs_${side.toLowerCase()}hb`]) : null
    if (arm && sideWord && hr9 != null && hr9 >= 1.3) out.push(line(`${arm} has allowed ${fx(hr9, 2)} home runs per 9 innings to ${sideWord}`, `pitcher_hr9_vs_${side.toLowerCase()}hb`, fx(hr9, 2), '9'))
    const iso = hand ? num(row?.[thr === 'L' ? 'iso_vs_lhp' : 'iso_vs_rhp']) : null
    if (iso != null && iso >= 0.2) out.push(line(`a ${avg3(iso)} ISO (extra-base power) against ${hand} pitching`, thr === 'L' ? 'iso_vs_lhp' : 'iso_vs_rhp', avg3(iso)))
    const shr = num(row?.season_hr)
    if (shr != null && shr > 0) out.push(line(`${shr} home runs this season`, 'season_hr', String(shr)))
    const l10 = num(row?.last10_hr)
    if (l10 != null && l10 >= 1) out.push(line(`${l10} home run${l10 === 1 ? '' : 's'} in his last 10 games`, 'last10_hr', String(l10), '10'))
    const wx = num(row?.weather?.hr_effect_pct)
    if (wx != null && wx >= 3) out.push(line(`the weather adds ${wx}% to home-run carry`, 'weather.hr_effect_pct', String(wx)))
  } else {
    const a = hand ? num(row?.[thr === 'L' ? 'avg_vs_lhp' : 'avg_vs_rhp']) : null
    if (a != null && a >= 0.27) out.push(line(`he hits ${avg3(a)} against ${hand} pitching`, thr === 'L' ? 'avg_vs_lhp' : 'avg_vs_rhp', avg3(a)))
    const h7 = num(row?.last7_hits)
    if (h7 != null && h7 >= 7) out.push(line(`${h7} hits in his last 7 games`, 'last7_hits', String(h7), '7'))
    if (role === 'HRR') {
      const rr = (num(row?.last7_runs) ?? 0) + (num(row?.last7_rbi) ?? 0)
      if (num(row?.last7_runs) != null && rr >= 6) out.push(line(`${rr} runs + RBI in his last 7 games`, 'last7_runs + last7_rbi', String(rr), '7'))
    }
    if (role === 'CONTACT') {
      const x10 = num(row?.last10_xbh)
      if (x10 != null && x10 >= 3) out.push(line(`${x10} extra-base hits in his last 10 games`, 'last10_xbh', String(x10), '10'))
      const iso = hand ? num(row?.[thr === 'L' ? 'iso_vs_lhp' : 'iso_vs_rhp']) : null
      if (iso != null && iso >= 0.18) out.push(line(`a ${avg3(iso)} ISO against ${hand} pitching`, thr === 'L' ? 'iso_vs_lhp' : 'iso_vs_rhp', avg3(iso)))
    }
    const spot = num(row?.lineup_spot)
    if (spot != null && spot <= 3) out.push(line(`he bats ${ord(spot)}, so more trips to the plate`, 'lineup_spot', ord(spot)))
    const sa = num(row?.season_avg)
    if (sa != null && out.length < 2) out.push(line(`he hits ${avg3(sa)} this season`, 'season_avg', avg3(sa)))
  }
  // the matchup itself, when he has seen this arm enough
  const pa = num(row?.bvp_pa), ab = num(row?.bvp_ab), h = num(row?.bvp_hits), hr = num(row?.bvp_hr)
  if (arm && pa != null && pa >= 10 && ab && h != null && (h / ab >= 0.3 || (power && hr >= 1))) {
    out.push(line(`${h} for ${ab} against ${arm}${hr ? `, ${hr} home run${hr === 1 ? '' : 's'}` : ''}`, 'bvp_hits / bvp_ab / bvp_hr', String(h), String(ab), hr ? String(hr) : null))
  }
  return out.slice(0, 4)
}

// the reasons it could fail -- lib/dash/gameCall callProblem's rules, plus park and the matchup
function mlbWatch(row, role) {
  const out = []
  const { thr, hand } = handWords(row)
  const arm = txt(row?.pitcher_name)
  const k = num(row?.season_k_rate)
  if (k != null && k >= 0.27) out.push(line(`he strikes out ${pctS(k)}% of the time`, 'season_k_rate', pctS(k)))
  const a = hand ? num(row?.[thr === 'L' ? 'avg_vs_lhp' : 'avg_vs_rhp']) : null
  if (a != null && a > 0 && a < 0.22) out.push(line(`he hits ${avg3(a)} against ${hand} pitching`, thr === 'L' ? 'avg_vs_lhp' : 'avg_vs_rhp', avg3(a)))
  const pk = num(row?.pitcher_k_rate)
  if (arm && pk != null && pk >= 0.27) out.push(line(`${arm} strikes out ${pctS(pk)}% of the hitters he faces`, 'pitcher_k_rate', pctS(pk)))
  const spot = num(row?.lineup_spot)
  if (spot != null && spot >= 7) out.push(line(`he bats ${ord(spot)}, so fewer trips to the plate`, 'lineup_spot', ord(spot)))
  const park = num(row?.park_hr_factor)
  if ((role === 'TOP' || role === 'HR') && park != null && park <= 0.92) out.push(line(`the park plays ${pctS(1 - park)}% under average for home runs`, 'park_hr_factor', pctS(1 - park)))
  const pa = num(row?.bvp_pa), ab = num(row?.bvp_ab), h = num(row?.bvp_hits)
  if (arm && pa != null && pa >= 10 && ab && h != null && h / ab < 0.15) out.push(line(`${h} for ${ab} against ${arm}`, 'bvp_hits / bvp_ab', String(h), String(ab)))
  return out.slice(0, 2)
}

const etTime = (iso) => {
  const t = Date.parse(iso || '')
  return Number.isFinite(t) ? `${new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })} ET` : ''
}

/** The top called hitter for each team in one game's rows, the headliner (gameCalls' pick) first. */
export function mlbSides(rows) {
  const called = rows.filter((r) => isCalledRole(r?.game_pick_role) && callRole(r))
    .sort((a, b) => ROLE_ORDER.indexOf(callRole(a)) - ROLE_ORDER.indexOf(callRole(b)) || boardCompare(a, b) || (scoreOf(b, callRole(b)) ?? 0) - (scoreOf(a, callRole(a)) ?? 0))
  const head = gameCalls(rows)[0]?.row || null
  const out = head ? [head] : []
  for (const r of called) if (!out.some((x) => txt(x.team) === txt(r.team))) out.push(r)
  return out.slice(0, 2)
}

/**
 * One MLB game's write-up.
 * @param rows  every board row for ONE game_pk (today_slim rows)
 */
export function buildMlbWriteup(rows = []) {
  const list = (rows || []).filter(Boolean)
  if (!list.length) return null
  const sides = mlbSides(list)
  if (!sides.length) return null
  const first = sides[0]
  const teams = [...new Set(list.map((r) => txt(r.team)).filter(Boolean))]
  const players = sides.map((r, i) => {
    const role = callRole(r)
    const status = callStatus({ role: r.game_pick_role })
    const sc = scoreOf(r, role)
    return {
      player_id: String(r.player_id), name: txt(r.name), team: txt(r.team), opp: txt(r.opponent), role, headliner: i === 0,
      status, status_word: STATUS_WORD[status], bar: PLAIN_BAR[role],
      score: sc == null ? null : sc.toFixed(1), scoreName: role === 'TOP' || role === 'HR' ? 'HR score' : role === 'HIT' ? 'hit score' : role === 'HRR' ? 'HRR score' : 'contact score',
      rank: num(r.board_rank), of: num(r.board_of), spot: num(r.lineup_spot) != null ? ord(num(r.lineup_spot)) : null,
      arm: txt(r.pitcher_name) || null, throws: txt(r.pitcher_throws).toUpperCase() || null,
      why: mlbWhy(r, role), watch: mlbWatch(r, role),
      src: 'today_slim.json game_pick_role',
    }
  })
  // the other side with no called hitter: its best board row, its REAL status (never filled in)
  const noCall = teams.filter((t) => !players.some((p) => p.team === t)).map((t) => {
    const best = list.filter((r) => txt(r.team) === t).sort(boardCompare)[0]
    if (!best) return { team: t, name: null, status: 'off', status_word: STATUS_WORD.off }
    const st = callStatus({ role: best.game_pick_role, board_rank: best.board_rank, board_of: best.board_of })
    return { team: t, name: txt(best.name), player_id: String(best.player_id), rank: num(best.board_rank), of: num(best.board_of), status: st, status_word: STATUS_WORD[st] }
  })
  const game = []
  const wx = first.weather?.has_data && first.weather?.display ? txt(first.weather.display) : null
  if (wx) game.push(line(wx, 'weather.display'))
  const arms = sides.map((r) => (txt(r.pitcher_name) ? `${txt(r.pitcher_name)} pitches to ${txt(r.team)}` : null)).filter(Boolean)
  if (arms.length) game.push(line(arms.join('; '), 'pitcher_name'))
  const bottom = [
    ...players.map((p) => line(`${p.name} is ${p.status_word}: ${p.bar}${p.headliner ? ', the game’s call' : `, ${p.team}’s call`}.`, 'game_pick_role')),
    ...noCall.map((n) => line(n.name ? `${n.team}: no call. ${n.name}, their top board spot, is ${n.status_word}.` : `${n.team}: no call.`, 'board_rank')),
  ]
  return {
    sport: 'mlb', game_id: String(first.game_pk), kickoff: txt(first.game_time) || null, away: txt(first.team), home: txt(first.opponent),
    away_name: txt(first.team), home_name: txt(first.opponent), when: etTime(first.game_time), locked: list.every((r) => r?.lineup_confirmed === true),
    header: line(`${players.map((p) => p.name).join(' + ')}: why ${players.length > 1 ? 'they’re' : 'he’s'} the call`, 'game_pick_role'),
    game, players, noCall, bottom, footer: MLB_FOOTER,
    built_from: { board: 'today_slim.json' },
  }
}
