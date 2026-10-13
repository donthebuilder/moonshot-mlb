// THE NBA CARD ADAPTER'S PURE HALF (no JSX, no fetch): which of a player's rows goes on his card, his stat tiles, the back's rows. Split out so a check can run it
// without the card drawing code (scripts/check-buckets-parity.mjs).
import { NBA_MARKETS } from '../../nba/model'
import { LEG_LABEL, fmtLeg } from '../../nba/legs'
import { num } from '../model'

const MARKET_ORDER = ['pts', 'reb', 'ast', '3pm', 'pra', 'dd', 'td']

/** The row to put on the card: his CALLED rows first (the higher score), else his highest-scored row in any market. Pure. */
export function bestRow(markets, id) {
  let best = null
  for (const m of MARKET_ORDER) {
    const r = (markets?.[m] || []).find((x) => String(x.playerId) === String(id) && Number.isFinite(x.score))
    if (!r) continue
    const rank = (r.status === 'called' ? 2 : r.status === 'board' ? 1 : 0) * 1000 + r.score
    if (!best || rank > best.rank) best = { rank, market: m, row: r }
  }
  return best
}

/** The tiles of one scored row: its market's legs with their value and percentile among tonight's players. Pure. */
export function statsOf(market, row) {
  return (NBA_MARKETS[market]?.legs || [])
    .filter((l) => row.legs?.ok !== false && num(row.legs?.[l]) != null)
    .slice(0, 6)
    .map((l) => ({ label: LEG_LABEL[l] || l, value: fmtLeg(l, row.legs[l]), pct: num(row.pct?.[l]) == null ? null : Math.round(num(row.pct[l])) }))
}

/** The back's rows from the two seasons' per-game lines. Pure; exported for the test. */
export function backFromLines({ lines, bio }) {
  const cols = [['SEASON', 1.5, 'season'], ['GP', 1, 'gp'], ['MIN', 1.1, 'min'], ['PTS', 1.1, 'pts'], ['REB', 1.1, 'reb'], ['AST', 1.1, 'ast'], ['3PM', 1.1, 'tpm'], ['FGA', 1.1, 'fga']]
  const f1 = (v) => (num(v) == null ? '—' : num(v).toFixed(1))
  const rows = lines.filter((l) => l.line).map((l) => ({
    season: l.season, gp: num(l.line.gp) == null ? '—' : String(Math.round(l.line.gp)), min: f1(l.line.min), pts: f1(l.line.pts), reb: f1(l.line.reb), ast: f1(l.line.ast), tpm: f1(l.line.tpm), fga: f1(l.line.fga),
  }))
  return {
    bio, cols, rows, title: 'PER GAME', career: null, playoffs: null, seasonsShown: rows.map((r) => r.season),
    note: rows.length ? "Per-game averages in the league's own regular-season table, the two seasons the model reads. No career or playoff line is kept." : 'No per-game line on file for him yet.',
    source: 'ESPN league statistics (byathlete)',
  }
}

