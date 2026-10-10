// MOONSHOT (MLB) CARD ADAPTER (server only). Real records only:
//   front  the bot's board row (lib/card/sources.js loadCandidates, all: true; the status is lib/callStatus callStatus on his pregame role,
//          never re-derived). The BARS rank against the season-level hitter POOL (lib/cards/mlbPool.js), not tonight's thin board; the
//          card's stat note names the pool. A pool too thin to use draws no bar.
//   back   statsapi yearByYear + career + people (the host lib/card/sources.js reads); a traded year uses the aggregate row (the
//          lib/seasonSplit.js rule: the row with no team), never the first club's partial line; a year with no aggregate and several clubs is left out.
import { loadCandidates } from '../../card/sources'
import { CARD_WORDS } from '../../card/core'
import { roleWord } from '../../dash/homerFeed'
import { mlbHeadshot, teamPrimary, teamFullName, teamCodeFromName } from '../../mlbTeams'
import { inline } from '../cardKit'
import { brandOf, statusOf, statusWordOf, callLineOf, prettyDay } from '../model'
import { loadMlbPool, poolPct, poolWords } from '../mlbPool'
import { logoFor, f0, bornWord, num } from './common'

const sport = 'mlb'
const API = 'https://statsapi.mlb.com/api/v1'
const jget = (u) => fetch(u).then((r) => (r.ok ? r.json() : null)).catch(() => null)

async function identity(leg) {
  const logo = leg.team ? await logoFor(sport, leg.team) : { src: '', plate: false }
  return { face: await inline(mlbHeadshot(String(leg.player_id), 480, { strict: true })), logo: logo.src, logoPlate: logo.plate, tone: leg.team ? teamPrimary(leg.team) : null, number: null, pos: leg.pos || null, team: leg.team || '' }
}

/** The stat tiles of one board row, bars from `pool`. Pure (the test feeds it a TEST pool and a TEST row). */
export function statsOf(r, pool) {
  const id = String(r.player_id)
  const stats = []
  if (num(r.season_hr) != null) stats.push({ label: 'SEASON HR', value: String(num(r.season_hr)), sub: num(r.season_pa) ? `in ${num(r.season_pa)} PA` : null })
  if (num(r.hr_per_pa) != null) stats.push({ label: 'HR / PA', value: `${(num(r.hr_per_pa) * 100).toFixed(1)}%`, pct: poolPct(pool, 'hr_per_pa', r.hr_per_pa, id), sub: num(r.pa_per_hr) ? `1 per ${num(r.pa_per_hr).toFixed(1)} PA` : null })
  if (num(r.season_iso) != null) stats.push({ label: 'ISO', value: num(r.season_iso).toFixed(3).replace(/^0/, ''), pct: poolPct(pool, 'season_iso', r.season_iso, id) })
  if (num(r.recent_barrel_rate) != null) stats.push({ label: 'RECENT BARREL %', value: `${Math.round(num(r.recent_barrel_rate) * 100)}%`, pct: poolPct(pool, 'recent_barrel_rate', r.recent_barrel_rate, id) })
  if (num(r.recent_hard_hit_rate) != null) stats.push({ label: 'RECENT HARD-HIT %', value: `${Math.round(num(r.recent_hard_hit_rate) * 100)}%`, pct: poolPct(pool, 'recent_hard_hit_rate', r.recent_hard_hit_rate, id) })
  if (num(r.season_max_ev) != null) stats.push({ label: 'MAX EXIT VELO', value: num(r.season_max_ev).toFixed(1), unit: 'MPH', pct: poolPct(pool, 'season_max_ev', r.season_max_ev, id) })
  return stats
}

async function modelFor(win, id, { now = Date.now() } = {}) {
  const cands = await loadCandidates(sport, win, now, { all: true })
  if (!cands.ok) return null
  const c = cands.cands.find((x) => String(x.player_id) === String(id))
  if (!c) return null
  const r = c._raw
  const pool = await loadMlbPool(win.card_date)
  const note = poolWords(pool)
  const status = statusOf(c.status)
  const logo = await logoFor(sport, r.team)
  return {
    sport, brand: brandOf(sport), status, statusWord: statusWordOf(status),
    name: r.name, team: r.team, teamName: teamFullName(r.team) || r.team, club: teamFullName(r.team) || '', opp: r.opponent || r.opp, home: null,
    pos: null, bats: r.bats || null, number: num(r.jersey_number), role: c.role,
    face: await inline(mlbHeadshot(String(r.player_id), 480, { strict: true })), logo: logo.src, logoPlate: logo.plate, tone: teamPrimary(r.team),
    score: num(r.hr_score), scoreWord: 'HR SCORE', stats: statsOf(r, pool),
    statNote: note ? `percentile vs ${note}` : '', poolWord: pool && pool.n >= 40 ? `${pool.n} hitters on the bot's slates` : 'the board',
    rankLine: num(r.board_rank) && num(r.board_of) ? [`#${r.board_rank} OF ${r.board_of} ON THE BOARD`] : [],
    callLine: callLineOf({ status, role: c.role ? roleWord(c.role) : '', market: CARD_WORDS.mlb.market }),
    why: c.why, price: null, day: win.card_date, dayWord: prettyDay(win.card_date), game: { id: c.game_id, date: c.game_date }, playerId: String(r.player_id),
  }
}

async function backOf(m) {
  const id = m.playerId
  const [yy, car, post, ppl] = await Promise.all([
    jget(`${API}/people/${id}/stats?stats=yearByYear&group=hitting&gameType=R`),
    jget(`${API}/people/${id}/stats?stats=career&group=hitting&gameType=R`),
    jget(`${API}/people/${id}/stats?stats=career&group=hitting&gameType=P`),
    jget(`${API}/people/${id}`),
  ])
  const p = ppl?.people?.[0]
  const bio = [
    ['HT / WT', [p?.height, p?.weight ? `${p.weight} lb` : null].filter(Boolean).join(' · ')],
    ['BATS / THROWS', p?.batSide?.code ? `${p.batSide.code} / ${p.pitchHand?.code || '—'}` : null],
    ['BORN', bornWord(p?.birthDate, [p?.birthCity, p?.birthStateProvince || p?.birthCountry].filter(Boolean).join(', '))],
    ['DEBUT', p?.mlbDebutDate ? bornWord(p.mlbDebutDate, '') : null],
  ].filter(([, v]) => v)
  const cols = [['YEAR', 1.2, 'season'], ['TEAM', 1.4, 'tm'], ['G', 1.2, 'g'], ['AB', 1.3, 'ab'], ['H', 1.2, 'h'], ['HR', 1.0, 'hr'], ['RBI', 1.1, 'rbi'], ['AVG', 1.15, 'avg'], ['OBP', 1.15, 'obp'], ['SLG', 1.15, 'slg'], ['OPS', 1.15, 'ops']]
  const line = (s, season, tm) => ({ season, tm, g: f0(s.gamesPlayed), ab: f0(s.atBats), r: f0(s.runs), h: f0(s.hits), hr: f0(s.homeRuns), rbi: f0(s.rbi), avg: s.avg || '—', obp: s.obp || '—', slg: s.slg || '—', ops: s.ops || '—' })
  const splits = yy?.stats?.[0]?.splits || []
  const rows = []
  for (const y of [...new Set(splits.map((s) => s.season))].sort()) {
    const ofYear = splits.filter((s) => s.season === y)
    const agg = ofYear.find((s) => !s.team)
    const clubs = ofYear.filter((s) => s.team)
    const one = agg || (clubs.length === 1 ? clubs[0] : null)
    if (!one) continue
    rows.push(line(one.stat, y, clubs.length > 1 ? `${clubs.length}TM` : teamCodeFromName(clubs[0]?.team?.name) || ''))
  }
  const c = car?.stats?.[0]?.splits?.[0]?.stat
  const pc = post?.stats?.[0]?.splits?.[0]?.stat
  return {
    bio, cols, rows, title: 'CAREER STATS', career: c ? line(c, 'TOTALS', '') : null, playoffs: pc ? line(pc, 'PLAYOFFS', '') : null,
    seasonsShown: rows.map((r) => r.season), note: rows.length ? `Totals and playoffs are the league's own, all seasons.${rows.length > 6 ? ` Last 6 of ${rows.length} seasons shown.` : ''}` : '', source: 'statsapi yearByYear / career',
  }
}

export default { sport, modelFor, backOf, identity }
