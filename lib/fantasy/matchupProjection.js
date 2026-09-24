// A PROJECTION THAT KNOWS WHO HE IS PLAYING (2026-09-23).
//
// Donovan: "make the projected points based on the matchup, not just the
// score just averaged."
//
// projectedFantasyPoints() (lib/fantasy/scoring.js) is this season's
// per-game average run through the league's scoring -- after two weeks that
// is two games, and it says the same thing against the best defence in the
// league as the worst. This file leaves that function alone (the draft board,
// replacement levels and season value keep it on purpose) and builds the
// weekly number on top of it.
//
// THE CHAIN, so every number on the page has an origin:
//
//   nfl_week.json stats (per-game this season)                  -> base line
//   xTD (expected TDs, same file)                               -> steadies TD
//   nfl_matchup.json dvp.season[opp][role]                      -> role vs opp
//   nfl_matchup.json field.def_pass vs league_pass (yds/att)    -> QB passing
//   this week's nfl_week_games                                  -> who opp is
//        ↓
//   each stat × its matchup factor -> the same scoring math -> PROJ
//
// HOW MUCH THE MATCHUP MOVES IT. A defence's allowed rate is part defence,
// part schedule and noise, so the raw ratio is regressed halfway to 1
// (MATCHUP_WEIGHT) and clamped (FACTOR_MIN..FACTOR_MAX). The worst matchup in
// football costs a player about a quarter of his line, never half of it.
//
// WHAT IT DOES NOT TOUCH, said rather than hidden: kickers and D/ST (no
// per-opponent signal in the payload), and anyone with no DvP role in the
// payload (deep bench, mostly) -- they get the average line, labelled so.
// The DvP window is `season`: the bot currently publishes last season's full
// table there (g=16), which is the steadier read two weeks into a new one.
import { fetchNfl, nflMatchupLooksReal, nflMatchupPaths } from '../nfl/dataSource'
import { projectedFantasyPoints } from './scoring'

export const MATCHUP_WEIGHT = 0.5
export const FACTOR_MIN = 0.75
export const FACTOR_MAX = 1.3
// xTD is expected touchdowns from usage (targets, red-zone and goal-line
// work). Two games of actual TDs is mostly luck; half and half is steadier.
export const XTD_WEIGHT = 0.5
const WINDOW = 'season'
const MIN_LEAGUE_N = 8
const TTL_MS = 15 * 60 * 1000

let cached = null   // { at, data }
let inFlight = null

/** The DvP payload, fetched at most every 15 minutes per server instance. */
export async function loadMatchupData() {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.data
  if (inFlight) return inFlight
  inFlight = (async () => {
    try {
      const raw = await fetchNfl(nflMatchupPaths(), nflMatchupLooksReal)
      const data = nflMatchupLooksReal(raw) ? raw : null
      if (data) cached = { at: Date.now(), data }
      return data || cached?.data || null
    } catch {
      return cached?.data || null
    } finally {
      inFlight = null
    }
  })()
  return inFlight
}

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null)
const LEAGUE = new WeakMap()

// League average of each (role, stat) cell, and each defence's passing yards
// per attempt against the league's. Computed once per payload.
function leagueTables(matchup) {
  if (LEAGUE.has(matchup)) return LEAGUE.get(matchup)
  const dvp = matchup?.dvp?.[WINDOW] || {}
  const sums = {}
  for (const roles of Object.values(dvp)) {
    for (const [role, row] of Object.entries(roles || {})) {
      for (const stat of ['td', 'recyd_g', 'rshyd_g']) {
        const v = num(row?.[stat]); if (v == null) continue
        const k = `${role}|${stat}`; (sums[k] ||= []).push(v)
      }
    }
  }
  const mean = {}
  for (const [k, vals] of Object.entries(sums)) {
    if (vals.length >= MIN_LEAGUE_N) mean[k] = vals.reduce((a, b) => a + b, 0) / vals.length
  }
  const ypa = (zones) => {
    let yds = 0, att = 0
    for (const z of Object.values(zones || {})) { yds += num(z?.yds) || 0; att += num(z?.att) || 0 }
    return att > 0 ? yds / att : null
  }
  const leagueYpa = ypa(matchup?.field?.league_pass)
  const passYpa = {}
  for (const [team, zones] of Object.entries(matchup?.field?.def_pass || {})) {
    const v = ypa(zones); if (v != null && leagueYpa) passYpa[team] = v / leagueYpa
  }
  const out = { mean, passYpa }
  LEAGUE.set(matchup, out)
  return out
}

const RAMS = { LA: 'LAR', LAR: 'LA' }
function cellFor(matchup, opp, role) {
  const dvp = matchup?.dvp?.[WINDOW] || {}
  return dvp[opp]?.[role] || dvp[RAMS[opp]]?.[role] || null
}

/** Regressed, clamped multiplier from a raw allowed/league ratio. */
export function factorFrom(ratio) {
  if (!Number.isFinite(ratio) || ratio <= 0) return 1
  const f = 1 + MATCHUP_WEIGHT * (ratio - 1)
  return Math.min(FACTOR_MAX, Math.max(FACTOR_MIN, f))
}

/**
 * The matchup factors for one player against one opponent, or null when the
 * payload cannot say anything about him.
 * @returns {{ role, opp, rec, rush, td, pass } | null}
 */
export function matchupFactors(matchup, player, opp) {
  if (!matchup || !player || !opp) return null
  const id = String(player.source_player_id || player.player_id || '')
  const role = matchup.roles?.[id]
  const { mean, passYpa } = leagueTables(matchup)
  const cell = role ? cellFor(matchup, opp, role) : null
  const ratio = (stat) => {
    const v = num(cell?.[stat]); const m = mean[`${role}|${stat}`]
    return v != null && m ? v / m : NaN
  }
  const out = {
    role: role || null, opp,
    rec: factorFrom(ratio('recyd_g')),
    rush: factorFrom(ratio('rshyd_g')),
    td: factorFrom(ratio('td')),
    pass: player.position === 'QB' ? factorFrom(passYpa[opp] ?? passYpa[RAMS[opp]] ?? NaN) : 1,
  }
  if (!cell && out.pass === 1) return null
  return out
}

/**
 * This week's projection for a player: his per-game line, TDs steadied with
 * xTD, each term scaled by the matchup. K and DEF, and anyone the payload has
 * no read on, fall back to projectedFantasyPoints() unchanged.
 *
 * @returns {{ points: number, base: number, factors: object|null }}
 */
export function matchupProjection(player, scoring, { matchup, opp } = {}) {
  const base = projectedFantasyPoints(player, scoring)
  if (!player || ['K', 'DEF'].includes(player.position)) return { points: base, base, factors: null }
  const stats = player?.source_payload?.stats || {}
  const td = num(stats.xTD) != null && num(stats.TD) != null
    ? (1 - XTD_WEIGHT) * num(stats.TD) + XTD_WEIGHT * num(stats.xTD)
    : stats.TD
  const f = matchupFactors(matchup, player, opp)
  const scaled = {
    ...stats,
    TD: td == null ? td : td * (f?.td ?? 1),
    RECYD: stats.RECYD == null ? stats.RECYD : stats.RECYD * (f?.rec ?? 1),
    REC: stats.REC == null ? stats.REC : stats.REC * (f?.rec ?? 1),
    RUYD: stats.RUYD == null ? stats.RUYD : stats.RUYD * (f?.rush ?? 1),
    PAYD: stats.PAYD == null ? stats.PAYD : stats.PAYD * (f?.pass ?? 1),
    PATD: stats.PATD == null ? stats.PATD : stats.PATD * (f?.pass ?? 1),
  }
  const points = projectedFantasyPoints({ ...player, source_payload: { ...player.source_payload, stats: scaled } }, scoring)
  return { points, base, factors: f }
}

/** One short line for a tooltip: why this number moved. */
export function matchupNote({ points, base, factors }) {
  if (!factors) return 'Season per-game average — no matchup read for this player.'
  const d = Math.round((points - base) * 10) / 10
  const who = factors.role ? `${factors.role} vs ${factors.opp}` : `vs ${factors.opp}`
  return `${who}: ${d >= 0 ? '+' : ''}${d} from his ${base.toFixed(1)} per-game average, after what ${factors.opp} allows and his expected TDs.`
}

/**
 * The one thing a page needs: player -> this week's projected points, using
 * the page's own schedule (lib/fantasy/schedule.js teamScheduleFor) for the
 * opponent. Pages pass `matchup` from loadMatchupData(); null degrades to the
 * season average for everyone, never to zero.
 */
export function weeklyProjector(scoring, schedule, matchup) {
  return (player) => {
    if (!player) return null
    const club = String(player.team || '').toUpperCase()
    const opp = schedule?.get?.(club)?.opponent || null
    return matchupProjection(player, scoring, { matchup, opp })
  }
}
