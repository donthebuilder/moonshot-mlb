// BUCKETS (NBA) CARD ADAPTER (server only; HIDDEN: reached only through routes that ask the BUCKETS gate, see lib/cards/registry.js). Real records only:
//   front  lib/nba/board.js buildNbaNight: the player's row in his best market (a CALLED row first, then the higher score): score, rank tonight, the legs and their
//          percentiles among TONIGHT's players (the same numbers the board shows), the status (lib/nba/model.js scoreNight, never re-derived here); the face from ESPN's
//          headshot, the club mark from lib/nba/teams.js.
//   back   ESPN's league-wide per-game lines (lib/nba/stats.js seasonStats): this season and last, as the model reads them, and his bio (athlete card + birth date).
// Nothing here prints a probability. A player who is not on tonight's board has no card (the route answers 404).
import { buildNbaNight } from '../../nba/board'
import { NBA_MARKETS, whyNba } from '../../nba/model'
import { LEG_LABEL, fmtLeg } from '../../nba/legs'
import { seasonStats } from '../../nba/stats'
import { athleteFor, reduceAthlete, birthDateFor } from '../../nba/api'
import { nbaTeam, nbaHeadshot } from '../../nba/teams'
import { nbaSeason, seasonLabel } from '../../nba/season'
import { inline } from '../cardKit'
import { brandOf, statusOf, statusWordOf, callLineOf, prettyDay } from '../model'
import { logoFor, bornWord } from './common'
import { num } from '../model'

const sport = 'nba'
const MARKET_ORDER = ['pts', 'reb', 'ast', '3pm', 'pra', 'dd', 'td']

const _night = new Map()
async function nightOf(day) {
  const hit = _night.get(day)
  if (hit && Date.now() - hit.at < 60e3) return hit.v
  const v = await buildNbaNight(day)
  if (_night.size > 4) _night.clear()
  _night.set(day, { at: Date.now(), v })
  return v
}

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
    .map((l) => ({ label: LEG_LABEL[l] || l, value: fmtLeg(l, row.legs[l]), pct: num(row.pct?.[l]) }))
}

async function identity(leg) {
  const team = leg.team || ''
  const logo = team ? await logoFor(sport, team) : { src: '', plate: false }
  return { face: await inline(nbaHeadshot(leg.player_id)), logo: logo.src, logoPlate: logo.plate, tone: null, number: null, pos: leg.pos || null, team }
}

async function modelFor(win, id) {
  const night = await nightOf(win.card_date)
  const g0 = new Map((night.games || []).filter((g) => g.seasonType === 2 || g.seasonType === 3).map((g) => [g.id, g]))
  const pick = bestRow(night.markets, id)
  if (!pick || !g0.has(pick.row.gameId)) return null
  const r = pick.row
  const def = NBA_MARKETS[pick.market]
  const g = g0.get(r.gameId)
  const status = statusOf(r.status)
  const ident = await identity({ team: r.team, player_id: r.playerId, pos: r.pos })
  const club = nbaTeam(r.team)?.name || ''
  return {
    sport, brand: brandOf(sport), status, statusWord: statusWordOf(status),
    name: r.name, team: r.team, teamName: club || r.team, club, opp: r.opp, home: r.home, pos: r.pos || null, number: ident.number, role: r.role || null,
    face: ident.face, logo: ident.logo, logoPlate: ident.logoPlate, tone: null,
    score: r.score, scoreWord: `${def.label} SCORE`, stats: statsOf(pick.market, r), statNote: "percentile among tonight's players", poolWord: "tonight's players",
    rankLine: [r.nightRank ? `#${r.nightRank} OF ${r.nightOf} TONIGHT` : null, r.rank ? `#${r.rank} IN HIS GAME` : null].filter(Boolean),
    callLine: callLineOf({ status, role: r.role === 'TOP' ? 'TOP' : 'BUCKET', market: def.label }),
    why: whyNba(pick.market, r), price: null, day: win.card_date, dayWord: prettyDay(win.card_date), game: { id: g.id, startUtc: g.start, date: win.card_date }, playerId: String(r.playerId),
  }
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

async function backOf(m) {
  const sn = await nbaSeason()
  const [cur, prev, ath, born] = await Promise.all([seasonStats(sn.cur).catch(() => null), seasonStats(sn.prev).catch(() => null), athleteFor(m.playerId).then(reduceAthlete).catch(() => null), birthDateFor(m.playerId).catch(() => null)])
  const lines = [
    { season: seasonLabel(sn.prev), line: prev?.athletes?.get(String(m.playerId)) || null },
    { season: seasonLabel(sn.cur), line: cur?.athletes?.get(String(m.playerId)) || null },
  ]
  const bio = [
    ['POSITION', ath?.pos || m.pos], ['TEAM', m.team], ['NUMBER', ath?.jersey ? `#${ath.jersey}` : null],
    ['HT / WT', [ath?.height, ath?.weight].filter(Boolean).join(' · ')], ['BORN', born ? bornWord(born, '') : null],
  ].filter(([, v]) => v)
  return backFromLines({ lines, bio })
}

export default { sport, modelFor, backOf, identity }
