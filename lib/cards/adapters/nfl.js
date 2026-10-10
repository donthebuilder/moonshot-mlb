// TUDDY (NFL) CARD ADAPTER (server only). Real records only:
//   front  the week file's player: stats (RZ, GL, xTD ...) and components.TD (0-100 ranks, the same bars ScoreAnatomy draws) among THIS WEEK's
//          players; the board rank from lib/nfl/tdFeed.js boardRankFor; the status is lib/callStatus tdCallStatus through lib/card/sources.js.
//   back   nfl_logs.json (lib/nfl/dataSource nflLogPaths): his games, summed per season. The file holds ONLY the seasons it holds
//          (today 2025 and 2026): the back shows exactly those and SAYS so; the TOTAL row is the sum of the seasons shown (no career line
//          and no playoff games exist in the file, so no playoffs row is drawn).
import { loadCandidates } from '../../card/sources'
import { CARD_WORDS } from '../../card/core'
import { fetchNfl, nflLogPaths, nflSlatePaths, nflSlateLooksReal } from '../../nfl/dataSource'
import { boardRankFor } from '../../nfl/tdFeed'
import { nflHeadshot } from '../../nfl/nflAssets'
import { nflTones } from '../../nfl/teamColors'
import { inline, ord } from '../cardKit'
import { brandOf, statusOf, statusWordOf, callLineOf, prettyDay } from '../model'
import { logoFor, f0, bornWord, num } from './common'

const sport = 'nfl'

async function identity(leg, { week } = {}) {
  const w = week || await fetchNfl(nflSlatePaths(), nflSlateLooksReal).catch(() => null)
  const p = (w?.players || []).find((x) => String(x.player_id) === String(leg.player_id))
  const team = leg.team || p?.team || ''
  const logo = team ? await logoFor(sport, team) : { src: '', plate: false }
  return { face: await inline(p?.espn_id ? nflHeadshot(String(p.espn_id), 480, 480) : null), logo: logo.src, logoPlate: logo.plate, tone: team ? nflTones(team)[0] : null, number: num(p?.jersey_number), pos: leg.pos || p?.position || null, team }
}

/** The tiles of one week-file player. Pure (the test feeds it a TEST player). */
export function statsOf(p) {
  const td = p?.components?.TD || {}
  const s = p?.stats || {}
  const f = (v, d = 1) => (num(v) == null ? null : num(v).toFixed(d))
  const stats = []
  if (f(s.RZ) != null) stats.push({ label: 'RED-ZONE TOUCHES', value: f(s.RZ), unit: '/G', pct: num(td.f_rz_opp) })
  if (f(s.GL) != null) stats.push({ label: 'GOAL-LINE TOUCHES', value: f(s.GL), unit: '/G', pct: num(td.f_gl_opp) })
  if (f(s.xTD, 2) != null) stats.push({ label: 'EXPECTED TD', value: f(s.xTD, 2), unit: '/G', pct: num(td.f_xtd) })
  const touches = (num(s.CAR) || 0) + (num(s.TGT) || 0)
  if (touches > 0) stats.push({ label: 'CARRIES + TARGETS', value: touches.toFixed(1), unit: '/G', pct: num(td.f_touches) })
  if (num(td.f_snap_pct) != null) stats.push({ label: 'SNAP SHARE', value: ord(td.f_snap_pct), unit: 'RANK', pct: num(td.f_snap_pct) })
  if (num(p?.season_td) != null) stats.push({ label: 'TDS THIS SEASON', value: String(num(p.season_td)) })
  return stats
}

async function modelFor(win, id, { now = Date.now() } = {}) {
  const cands = await loadCandidates(sport, win, now, { all: true })
  if (!cands.ok) return null
  const c = cands.cands.find((x) => String(x.player_id) === String(id))
  if (!c) return null
  const week = await fetchNfl(nflSlatePaths(), nflSlateLooksReal).catch(() => null)
  const p = (week?.players || []).find((x) => String(x.player_id) === String(id))
  const br = week ? boardRankFor(week, c.player_id) : null
  const status = statusOf(c.status)
  const ident = await identity(c, { week })
  return {
    sport, brand: brandOf(sport), status, statusWord: statusWordOf(status),
    name: c.name, team: c.team, teamName: c.team, club: '', opp: c.opp, home: null,
    pos: c.pos, number: ident.number, role: c.role,
    face: ident.face, logo: ident.logo, logoPlate: ident.logoPlate, tone: ident.tone,
    score: num(c.score), scoreWord: 'TD SCORE', stats: statsOf(p), statNote: p?.carryover ? "last season's per-game rate (too few games this season); percentile among this week's players" : "percentile among this week's players, this season's games", poolWord: "this week's players",
    rankLine: br ? [`#${br.rank} OF ${br.of} ON THE BOARD`] : [],
    callLine: callLineOf({ status, role: '', market: CARD_WORDS.nfl.market }),
    why: c.why, price: null, day: win.card_date, dayWord: prettyDay(win.card_date), game: { id: c.game_id, date: c.game_date }, playerId: String(c.player_id),
  }
}

/** The back's rows from a player's game log. Pure; exported for the test. */
export function backFromLog(m, games, p, slateSeason = null) {
  const qb = m.pos === 'QB'
  const bio = [['POSITION', m.pos], ['TEAM', m.team], ['NUMBER', m.number != null ? `#${m.number}` : null], ['BORN', bornWord(p?.birth_date, '')]].filter(([, v]) => v)
  const cols = qb
    ? [['YEAR', 1.2, 'season'], ['TEAM', 1.2, 'tm'], ['G', 1, 'g'], ['PASS YDS', 1.7, 'payd'], ['CAR', 1, 'car'], ['RUSH YDS', 1.7, 'ruyd'], ['TD', 1, 'td']]
    : [['YEAR', 1.2, 'season'], ['TEAM', 1.2, 'tm'], ['G', 1, 'g'], ['CAR', 1, 'car'], ['RUSH YDS', 1.7, 'ruyd'], ['REC', 1, 'rec'], ['REC YDS', 1.6, 'recyd'], ['TD', 1, 'td']]
  const seasons = [...new Set(games.map((g) => g.s))].sort()
  const sum = (arr, k) => arr.reduce((a, g) => a + (num(g[k]) || 0), 0)
  const mk = (arr, season, tm) => ({ season, tm, g: String(arr.length), payd: f0(sum(arr, 'g_payd')), car: f0(sum(arr, 'g_car')), ruyd: f0(sum(arr, 'g_ruyd')), rec: f0(sum(arr, 'g_rec')), recyd: f0(sum(arr, 'g_recyd')), td: f0(sum(arr, 'g_td')) })
  const rows = seasons.map((s) => { const a = games.filter((g) => g.s === s); return mk(a, String(s), a[a.length - 1]?.tm || '') })
  const slate = num(slateSeason); const cur = slate ? rows.find((r) => r.season === String(slate)) : null
  const span = rows.length ? (rows.length === 1 ? rows[0].season : `${rows[0].season} to ${rows[rows.length - 1].season}`) : ''
  return {
    bio, cols, rows, title: 'SEASONS ON FILE', career: rows.length ? mk(games, `TOTAL (${rows.length})`, '') : null, playoffs: null,
    seasonsShown: rows.map((r) => r.season),
    // THE CURRENT ROW (2026-10-10): the slate's season is the row to read first, and the note names it (or says there is none yet), so a
    // back never reads as last season's by default
    note: rows.length ? `Only ${span} ${rows.length === 1 ? 'is' : 'are'} on file; no earlier seasons. TOTAL is the sum of those.${slate ? (cur ? ` ${slate} is this season: ${cur.g} ${cur.g === '1' ? 'game' : 'games'} so far.` : ` No ${slate} games on file yet.`) : ''}` : 'No game log on file for this player.', source: 'nfl_logs.json games, summed per season',
  }
}

async function backOf(m) {
  const [logs, week] = await Promise.all([fetchNfl(nflLogPaths()).catch(() => null), fetchNfl(nflSlatePaths(), nflSlateLooksReal).catch(() => null)])
  const p = (week?.players || []).find((x) => String(x.player_id) === String(m.playerId))
  return backFromLog(m, logs?.logs?.[m.playerId]?.log || [], p, week?.season)
}

export default { sport, modelFor, backOf, identity }
