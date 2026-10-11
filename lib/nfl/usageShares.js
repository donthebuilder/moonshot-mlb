// TUDDY'S SHARE-OF-TEAM FIELDS (2026-10-11). Pure. The week file (nfl_week.json) carries each player's own numbers; the SHARES live in
// nfl_matchup.json, and this puts them on the player once (beside withRoles), so every table that reads a week-file player gets them:
//
//   snaps[player_id]            { snap_pct, recent_pct, trend, games, side:'offense' }   season share of his OFFENSE's snaps, the last three
//                               games' share, and recent minus season in points. Offence only: no defensive snap counts are published.
//   usage[team][player_id]      { tgt_share, car_share, rz_tgt_share, rz_car_share }      percent of the club's targets / carries /
//                               red-zone targets / red-zone carries. PRESENT ONLY IN THE COMMITTED SNAPSHOT TODAY: the live
//                               nfl_matchup.json does not carry it (checked 2026-10-11), so those columns stay empty and are dropped by
//                               the table until the bot publishes them (.claude-notes/SHARE-DATA-SPEC.md).
//   week stats["TGT%"]          his share of his club's targets over his stats window (a fraction): already the TGT% column, now in the
//                               usage group.
// Not published, so not shown: carry share and red-zone share on the live file, air-yards share, defensive snap share.
import { roundShare, fmtShare, fmtPoints, trendGlyph } from '../shares'

const fin = (v) => (v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null)

/** One player's usage fields from the matchup payload, or null when it holds nothing for him. */
export function usageOf(matchup, playerId, team = null) {
  const id = String(playerId ?? '')
  if (!id || !matchup) return null
  const s = matchup.snaps?.[id]
  const snap = s && (s.side == null || s.side === 'offense') ? s : null
  const u = (team && matchup.usage?.[team]?.[id]) || null
  const out = {}
  if (snap && fin(snap.snap_pct) != null) {
    out.snap = roundShare(snap.snap_pct)
    const rec = fin(snap.recent_pct); if (rec != null) out.snapRecent = roundShare(rec)
    const tr = fin(snap.trend); if (tr != null) out.snapTrend = Math.round(tr * 10) / 10
    const g = fin(snap.games); if (g != null) out.snapGames = g
  }
  if (u) {
    for (const [k, key] of [['car_share', 'carShare'], ['rz_tgt_share', 'rzTgtShare'], ['rz_car_share', 'rzCarShare']]) { const x = fin(u[k]); if (x != null) out[key] = roundShare(x) }
  }
  return Object.keys(out).length ? out : null
}

/** The slate with `usage` on every player the matchup holds a share for. Same object back when none. */
export function withUsageShares(slate, matchup) {
  if (!slate?.players || !matchup) return slate
  let changed = false
  const players = slate.players.map((p) => {
    const usage = usageOf(matchup, p.player_id, p.team)
    if (!usage) return p
    changed = true
    return { ...p, usage }
  })
  return changed ? { ...slate, players } : slate
}

/** The card back's rows for one player: [{ label, value }] text, only for the shares the files hold. Same words as the table's columns. */
export function nflShareRows(p) {
  const u = p?.usage || {}
  const tg = fin(p?.stats?.['TGT%'])
  const rows = []
  if (fin(u.snap) != null) rows.push({ label: `SNAP SHARE${fin(u.snapGames) != null ? ` (${u.snapGames} G)` : ''}`, value: fmtShare(u.snap) })
  if (fin(u.snapRecent) != null) rows.push({ label: 'SNAP SHARE, LAST 3', value: `${fmtShare(u.snapRecent)}${fin(u.snapTrend) != null ? ` ${trendGlyph(u.snapTrend)} ${fmtPoints(u.snapTrend)}` : ''}` })
  if (tg != null) rows.push({ label: 'TARGET SHARE', value: fmtShare(Math.abs(tg) <= 1 ? tg * 100 : tg) })
  if (fin(u.carShare) != null) rows.push({ label: 'CARRY SHARE', value: fmtShare(u.carShare) })
  if (fin(u.rzTgtShare) != null) rows.push({ label: 'RED-ZONE TARGET SHARE', value: fmtShare(u.rzTgtShare) })
  if (fin(u.rzCarShare) != null) rows.push({ label: 'RED-ZONE CARRY SHARE', value: fmtShare(u.rzCarShare) })
  return rows
}
