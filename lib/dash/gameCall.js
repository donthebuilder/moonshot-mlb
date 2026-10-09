// THE CALL, ONE PER POSTSEASON GAME (2026-09-28, X-POSTSEASON-POSTING-PLAN
// steps 3, 6, 7, 9, 10). Pure: the tick route decides WHEN; this decides
// WHO and WHAT.
//
//   who      the top CALLED hitter in each game (TOP > HR > HRR > HIT >
//            CONTACT, then the model's score for that role)
//   when     only once BOTH lineups in the game are confirmed (step 7)
//   what     "THE CALL": the player, the bar he is graded on in plain words
//            (step 9/10 -- "1+ home run", never a bare "HRR"), the ONE
//            number that makes the case and the ONE reason it could fail,
//            both from fields on his row (step 6). No failure reason on the
//            row -> no problem line; nothing is invented.
import { isCalledRole } from '../callStatus'
import { boardCompare } from '../boardOrder'

const txt = (v) => (v == null ? '' : String(v).trim())
const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))
const avg3 = (v) => (v == null ? '' : v.toFixed(3).replace(/^0\./, '.'))
const pct = (v) => `${Math.round(v * (v <= 1 ? 100 : 1))}%`
const ORD = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th')}`

export const ROLE_ORDER = ['TOP', 'HR', 'HRR', 'HIT', 'CONTACT']
// Plain words, the bar he is graded on (same table as lib/myPicks.js BAR).
export const PLAIN_BAR = { TOP: '1+ home run', HR: '1+ home run', HRR: '2+ of hits, runs and RBI', HIT: '1+ hit', CONTACT: '2+ total bases' }

/** His call role: the first of TOP/HR/HRR/HIT/CONTACT his row carries. */
export function callRole(row) {
  const roles = txt(row?.game_pick_role).toUpperCase().split('/').map((x) => x.trim())
  return ROLE_ORDER.find((r) => roles.includes(r)) || null
}

const scoreFor = (row, role) => num(role === 'HIT' ? row?.hit_score : role === 'HRR' ? (row?.hrr_score ?? row?.prod_score) : role === 'CONTACT' ? (row?.tb_score ?? row?.contact_score) : row?.hr_score) ?? 0

/** The side he hits from against tonight's arm ('L' | 'R' | null). */
export function battingSide(row) {
  const bats = txt(row?.bats).toUpperCase()
  const thr = txt(row?.pitcher_throws).toUpperCase()
  if (bats === 'L' || bats === 'R') return bats
  if (bats === 'S' && (thr === 'L' || thr === 'R')) return thr === 'L' ? 'R' : 'L'
  return null
}

/** One entry per game_pk that has a CALLED hitter: { game_pk, row, role, bar, confirmed, time }. */
export function gameCalls(rows) {
  const byGame = new Map()
  for (const r of Array.isArray(rows) ? rows : []) {
    const pk = txt(r?.game_pk)
    if (!pk) continue
    if (!byGame.has(pk)) byGame.set(pk, [])
    byGame.get(pk).push(r)
  }
  const out = []
  for (const [pk, list] of byGame) {
    const called = list.filter((r) => isCalledRole(r?.game_pick_role) && callRole(r))
    if (!called.length) continue
    called.sort((a, b) => ROLE_ORDER.indexOf(callRole(a)) - ROLE_ORDER.indexOf(callRole(b)) || boardCompare(a, b) || scoreFor(b, callRole(b)) - scoreFor(a, callRole(a)))
    const row = called[0]
    const role = callRole(row)
    // Both lineups confirmed: every row of both teams in this game says so.
    const confirmed = list.length > 0 && list.every((r) => r?.lineup_confirmed === true)
    out.push({ game_pk: pk, row, role, bar: PLAIN_BAR[role], confirmed, time: txt(row?.game_time) || null })
  }
  return out.sort((a, b) => Date.parse(a.time || 0) - Date.parse(b.time || 0))
}

/** The ONE number that makes the case, from his row. Never null for a called row. */
export function callCase(row, role) {
  const side = battingSide(row)
  const thr = txt(row?.pitcher_throws).toUpperCase()
  const handWord = thr === 'L' ? 'left-handed' : thr === 'R' ? 'right-handed' : ''
  const arm = txt(row?.pitcher_name)
  const sideWord = side === 'L' ? 'lefties' : side === 'R' ? 'righties' : 'hitters'
  if (role === 'TOP' || role === 'HR') {
    const hr9 = side ? num(row?.[`pitcher_hr9_vs_${side.toLowerCase()}hb`]) : null
    if (arm && hr9 != null && hr9 >= 1.3) return `${arm} has allowed ${hr9.toFixed(2)} home runs per 9 innings to ${sideWord}.`
    const iso = handWord ? num(row?.[thr === 'L' ? 'iso_vs_lhp' : 'iso_vs_rhp']) : null
    if (iso != null && iso >= 0.2) return `He has a ${avg3(iso)} ISO (extra-base power) against ${handWord} pitching.`
    const shr = num(row?.season_hr)
    if (shr != null) return `${shr} home runs this season.`
  }
  if (role === 'HIT' || role === 'HRR' || role === 'CONTACT') {
    const a = handWord ? num(row?.[thr === 'L' ? 'avg_vs_lhp' : 'avg_vs_rhp']) : null
    if (a != null && a >= 0.27) return `He hits ${avg3(a)} against ${handWord} pitching.`
    const sa = num(row?.season_avg)
    if (sa != null) return `He hits ${avg3(sa)} this season.`
  }
  const rank = num(row?.board_rank)
  return rank != null ? `#${rank} on tonight's board.` : ''
}

/** The ONE reason it could fail, from his row -- or null (then say nothing). */
export function callProblem(row) {
  const thr = txt(row?.pitcher_throws).toUpperCase()
  const handWord = thr === 'L' ? 'left-handed' : thr === 'R' ? 'right-handed' : ''
  const arm = txt(row?.pitcher_name)
  const k = num(row?.season_k_rate)
  if (k != null && k >= 0.27) return `He strikes out ${pct(k)} of the time.`
  const a = handWord ? num(row?.[thr === 'L' ? 'avg_vs_lhp' : 'avg_vs_rhp']) : null
  if (a != null && a > 0 && a < 0.22) return `He hits ${avg3(a)} against ${handWord} pitching.`
  const pk = num(row?.pitcher_k_rate)
  if (arm && pk != null && pk >= 0.27) return `${arm} strikes out ${pct(pk)} of the hitters he faces.`
  const spot = num(row?.lineup_spot)
  if (spot != null && spot >= 7) return `He bats ${ORD(spot)}, so fewer trips to the plate.`
  return null
}

const etTime = (iso) => {
  const t = Date.parse(iso || '')
  return Number.isFinite(t) ? `${new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })} ET` : ''
}

/** The post. */
export function gameCallText(call, { tail = '' } = {}) {
  const r = call.row
  const matchup = [txt(r?.team), txt(r?.opponent)].filter(Boolean).join(' vs ')
  const problem = callProblem(r)
  return [
    `⚾ THE CALL · ${matchup}${call.time ? ` · ${etTime(call.time)}` : ''}`,
    '',
    `${txt(r?.name).toUpperCase()} — ${call.bar}`,
    `The case: ${callCase(r, call.role)}`,
    problem ? `The problem: ${problem}` : null,
    '',
    'Locked before first pitch. Graded against exactly that.',
    tail || null,
  ].filter((x) => x !== null).join('\n').replace(/\n{3,}/g, '\n\n').trim()
}
