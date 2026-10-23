// 🏀 FIRST BASKET v2, ITS ONE LEG (2026-10-22). Server only. The backtest (claude/FIRST-BASKET-BACKTEST-2026-10-22.txt,
// walk-forward over 2025-26): the best single signal was his share of his club's shots in the first 3 minutes (top pick 15.3%
// vs 13.4% for v1's whole-game shot share), and the club that wins the tip scores first ~64% of the time. So v2 ranks the ten
// starters on ONE number:
//
//   firstOdds = (his first-3-minute shots / his club's, in the games he played)
//             x (his club's chance to score first: the tip split, weighted by the two clubs' tip records via log5)
//
// It is a rank input, never printed as a chance (NBA prints no model probability). The sums come from one SQL call
// (supabase/migrations/202610221400_opening_legs.sql, public.opening_legs) over finished games only, so nothing here can see
// tonight. A man with fewer than MIN_GP openings on file is unscored, with the reason.
export const MIN_GP = 10
const TIP_MIN = 10

/** One read for the night: { players: Map(id -> {gp, share, firstShots, firstFg}), tipRate(team), split } or null. */
export async function readOpeningLegs(db, { seasons, teams }) {
  if (!db || !teams?.length) return null
  const { data, error } = await db.rpc('opening_legs', { p_sport: 'nba', p_seasons: seasons, p_teams: [...new Set(teams)] })
  if (error) throw new Error(`opening_legs: ${error.message}`)
  const players = new Map((data?.players || []).map((p) => [String(p.player_id), {
    gp: Number(p.gp) || 0, share: Number(p.club_w1_att) > 0 ? Number(p.w1_att) / Number(p.club_w1_att) : null,
    firstShots: Number(p.first_shots) || 0, firstFg: Number(p.first_fg) || 0,
  }]))
  const tips = new Map((data?.teams || []).map((t) => [t.team, { n: Number(t.tips) || 0, w: Number(t.tips_won) || 0 }]))
  const n = Number(data?.split?.n) || 0, w = Number(data?.split?.w) || 0
  return {
    players,
    tipRate: (team) => { const t = tips.get(team); return t && t.n >= TIP_MIN ? t.w / t.n : 0.5 },
    split: n >= 50 ? w / n : 0.6,
  }
}

/** His club's chance to score first tonight from the two clubs' tip records (log5) and the league's tip split. */
export function scoreFirstOdds(L, team, opp) {
  const a = L.tipRate(team), b = L.tipRate(opp)
  const d = a * (1 - b) + b * (1 - a)
  const pTip = d ? (a * (1 - b)) / d : 0.5
  return L.split * pTip + (1 - L.split) * (1 - pTip)
}

/** The v2 legs for one candidate (a starter): { ok, firstOdds, openGp, w1Share, clubFirst } or the reason he is unscored. */
export function firstV2Legs(L, c) {
  if (!c.starter) return { ok: false, reason: 'not a listed starter (first basket is the ten starters only)' }
  const p = L?.players.get(String(c.playerId ?? c.id))
  if (!p || p.gp < MIN_GP || p.share == null) return { ok: false, reason: `fewer than ${MIN_GP} game openings on file (${p?.gp || 0})` }
  const clubFirst = scoreFirstOdds(L, c.team, c.opp)
  return { ok: true, gp: p.gp, openGp: p.gp, w1Share: p.share, clubFirst, firstOdds: p.share * clubFirst }
}
