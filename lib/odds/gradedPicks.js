// GRADED PICKS, PRICED (odds plan step 3 prep, 2026-09-27). Server only.
//
// Every graded pick -- hits AND misses, which is what an ROI needs -- in one
// shape, joined to its lock price (lib/odds/priceAtLock.js). Grading is
// reused, never redone (the plan's rule):
//
//   MLB  graded_results_<date>.json on the bot's data branch: graded_slots,
//        one per pick category (lib/graded.js explains the doubles). One HR
//        price per PLAYER, so slots merge per player: his roles joined, got_hr
//        OR'd. Status from lib/callStatus.js on those roles. `hrCall` marks the
//        TOP / HR roles -- the calls whose market IS the home run (see
//        lib/dash/mlbhr.js mayClaimHomer); a HIT or CONTACT call's HR price is
//        in the table but is not that call's own market.
//        Not final = not graded. No plate appearance = void.
//   NFL  nfl_results_<season>_wNN.json: card.TD.rungs, the week's designated
//        TD calls, hit true/false (null = not graded yet). CALLED only -- the
//        week's full board is not archived with its scores, so there is no
//        ON THE BOARD population to grade. Five calls a week.
//   NHL  lamp_goal_log via lib/record/nhl.js readNhlRecords (graded, regular
//        season and playoffs; preseason stays out, the record's own rule).
//
// THE JOIN. MLB and NHL: sport + the game's own date + our player id. NFL's
// results file carries no game date, so a call is joined to the one lock
// price that player has in the seven days up to the file's graded_at; two
// prices in that window = ambiguous, left unpriced.
import { callStatus } from '../callStatus'
import { readNhlRecords } from '../record/nhl'
import { readLockPrices, priceKey } from './priceAtLock'

const DATA = 'https://raw.githubusercontent.com/donthebuilder/MLB-HR-DASHBOARD-STREAMLIT/data/public/data/current'
const HR_CALL = /\b(TOP|HR)\b/

const getJson = async (url) => {
  try {
    const r = await fetch(url, { cache: 'no-store' })
    return r.ok ? await r.json() : null
  } catch { return null }
}
const days = (since, until) => {
  const out = []
  for (let t = Date.parse(`${since}T12:00:00Z`); t <= Date.parse(`${until}T12:00:00Z`); t += 864e5) out.push(new Date(t).toISOString().slice(0, 10))
  return out
}

/** Pure: one graded file -> one pick per player. Exported for tests. */
export function mlbPicksFromGraded(date, payload) {
  const by = new Map()
  for (const s of payload?.graded_slots || []) {
    if (s?.player_id == null) continue
    const id = String(s.player_id)
    const p = by.get(id) || { sport: 'mlb', game_date: date, player_id: id, name: s.name, team: s.team, roles: new Set(), final: true, pa: 0, hr: 0 }
    for (const r of String(s.game_pick_role || '').split('/')) if (r.trim()) p.roles.add(r.trim().toUpperCase())
    p.final = p.final && Boolean(s.is_final)
    p.pa = Math.max(p.pa, Number(s.plate_appearances) || 0)
    p.hr = Math.max(p.hr, Number(s.actual_hr) || 0, s.got_hr ? 1 : 0)
    by.set(id, p)
  }
  return [...by.values()].map((p) => {
    const role = [...p.roles].join('/')
    return {
      sport: 'mlb', game_date: p.game_date, player_id: p.player_id, name: p.name, team: p.team, role,
      status: callStatus({ role, on_board: true }),   // on the graded sheet = on the board
      hrCall: HR_CALL.test(role),
      result: !p.final ? null : p.pa === 0 ? 'void' : p.hr > 0 ? 'hit' : 'miss',
    }
  })
}

/** Pure: one NFL results file -> its TD calls. */
export function nflPicksFromResults(payload) {
  const graded = String(payload?.graded_at || '').slice(0, 10) || null
  return (payload?.card?.TD?.rungs || []).map((r) => ({
    sport: 'nfl', game_date: null, graded_date: graded, week: payload.week, player_id: String(r.player_id), name: r.name, team: r.team,
    status: 'called', result: r.hit === true ? 'hit' : r.hit === false ? 'miss' : null,
  }))
}

/**
 * Every graded pick for `sport` between two dates, each with `price` (or
 * null when no lock price exists). Also returns the join's own counts.
 * NFL takes { season, weeks: [1, 2, ...] } instead of dates for the files.
 */
export async function pricedPicks(db, { sport, since, until, season = null, weeks = [] }) {
  const lock = await readLockPrices(db, { sport, since, until })
  if (lock.error) return { picks: [], error: lock.error }
  let picks = []
  if (sport === 'mlb') {
    for (const d of days(since, until)) {
      // eslint-disable-next-line no-await-in-loop
      const g = await getJson(`${DATA}/graded_results_${d}.json`)
      if (g) picks.push(...mlbPicksFromGraded(d, g))
    }
    for (const p of picks) p.price = lock.prices.get(priceKey('mlb', p.game_date, p.player_id)) || null
  } else if (sport === 'nhl') {
    const { rows, error } = await readNhlRecords(db, { since, until })
    if (error) return { picks: [], error }
    picks = rows.map((r) => ({ sport: 'nhl', game_date: r.game_date, player_id: String(r.player_id), name: r.name, team: r.team, status: r.status, result: r.result }))
    for (const p of picks) p.price = lock.prices.get(priceKey('nhl', p.game_date, p.player_id)) || null
  } else if (sport === 'nfl') {
    for (const w of weeks) {
      // eslint-disable-next-line no-await-in-loop
      const f = await getJson(`${DATA}/nfl_results_${season}_w${String(w).padStart(2, '0')}.json`)
      if (f) picks.push(...nflPicksFromResults(f))
    }
    const byPlayer = new Map()
    for (const [k, v] of lock.prices) {
      const [, date, id] = k.split(':')
      if (!byPlayer.has(id)) byPlayer.set(id, [])
      byPlayer.get(id).push({ date, ...v })
    }
    for (const p of picks) {
      const lo = p.graded_date ? new Date(Date.parse(`${p.graded_date}T12:00:00Z`) - 7 * 864e5).toISOString().slice(0, 10) : null
      const inWeek = (byPlayer.get(p.player_id) || []).filter((x) => lo && x.date > lo && x.date <= p.graded_date)
      p.price = inWeek.length === 1 ? inWeek[0] : null
      if (inWeek.length === 1) p.game_date = inWeek[0].date
    }
  }
  const graded = picks.filter((p) => p.result === 'hit' || p.result === 'miss')
  return {
    picks,
    counts: { picks: picks.length, graded: graded.length, priced: graded.filter((p) => p.price).length, ambiguous: lock.ambiguous },
    error: null,
  }
}
