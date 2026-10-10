// TRADING-CARD PROTOTYPES: THE DATA HALF (server only, prototype; nothing imports this from app/).
// Turns the REAL records the Card and the boards already read into plain "card models" the
// prototype cards (lib/cards/proto/protoCards.js) draw. Nothing is invented: every number is
// copied from, or ranked over, a field the site already prints. A field that is missing is simply
// absent from the model (the card draws no tile for it), never a stand-in.
//
// Where each sport's numbers come from (the same builders the Card and the boards use):
//   NHL   lib/nhl/goalBoard.js buildNight rows: legs (shots/goals/ice time per game), pct (their percentile
//         tonight, the same words lib/nhl/goalModel.js whyLine prints), nightRank, rank in game; the season
//         line is the league report lib/nhl/api.js leagueSkaterLines; number + face from the club roster.
//   MLB   lib/dash/board.js fetchBoardFull (the bot's board rows); percentiles are ranked over TONIGHT'S
//         board with lib/nhl/goalModel.js percentiles (one rank function for the network).
//   NFL   lib/nfl/dataSource.js week file players: stats (RZ, GL, xTD ...) and components.TD (0-100 ranks,
//         the same bars ScoreAnatomy draws); board rank from lib/nfl/tdFeed.js boardRankFor.
//   CARD  lib/card/sources.js loadWindows + loadCandidates, then lib/card/core.js pickStraights/pickTwoMan.
import { loadWindows, loadCandidates } from '../../card/sources'
import { pickStraights, pickTwoMan, STAKE, CARD_WORDS, fmtAmerican } from '../../card/core'
import { buildNight } from '../../nhl/goalBoard'
import { leagueSkaterLines, rosterFor } from '../../nhl/api'
import { reduceRoster } from '../../nhl/reduce'
import { previousSeasonId } from '../../nhl/season'
import { percentiles } from '../../nhl/goalModel'
import { fmtSec, fmt2 } from '../../nhl/format'
import { nhlLogo, nhlTeam } from '../../nhl/teams'
import { fetchBoardFull } from '../../dash/board'
import { fetchNfl, nflSlatePaths, nflSlateLooksReal } from '../../nfl/dataSource'
import { boardRankFor } from '../../nfl/tdFeed'
import { roleWord } from '../../dash/homerFeed'
import { nflHeadshot, nflTeamLogo } from '../../nfl/nflAssets'
import { nflTones } from '../../nfl/teamColors'
import { mlbHeadshot, mlbTeamLogo, teamPrimary, teamFullName } from '../../mlbTeams'
import { BRAND, sportKey } from '../../routes'
import { STATUS_WORD } from '../../callStatus'

const num = (v) => { if (v == null || v === '') return null; const n = Number(v); return Number.isFinite(n) ? n : null }
export const ord = (p) => { const n = Math.round(p); const r = n % 100; return `${n}${r >= 11 && r <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'}` }
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const prettyDay = (d) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(d || '')); return m ? `${MONTH[Number(m[2]) - 1]} ${Number(m[3])}` : '' }

// ── pictures: fetched once, inlined as data URIs so a render has no network step and a miss is just "no picture" ──
const _img = new Map()
export async function inline(url, { timeout = 6000 } = {}) {
  if (!url) return ''
  if (_img.has(url)) return _img.get(url)
  let out = ''
  try {
    const ctl = new AbortController()
    const t = setTimeout(() => ctl.abort(), timeout)
    const res = await fetch(url, { signal: ctl.signal })
    clearTimeout(t)
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer())
      const type = (res.headers.get('content-type') || '').split(';')[0] || (/\.svg(\?|$)/.test(url) ? 'image/svg+xml' : 'image/png')
      if (buf.length > 200) out = `data:${type};base64,${buf.toString('base64')}`
    }
  } catch { /* no picture: the card draws its monogram / club code */ }
  _img.set(url, out)
  return out
}

// the club logo and whether the product's marks need a light plate (lib/cards/kit.js LOGO_OF, same choices)
const LOGO_OF = {
  mlb: { url: (t) => mlbTeamLogo(t, 320), plate: true },
  nfl: { url: (t) => nflTeamLogo(t, 160, true), plate: false },
  nhl: { url: (t) => nhlLogo(t, true), plate: false },
}
export const logoFor = async (sport, team) => ({ src: await inline(LOGO_OF[sport]?.url(team)), plate: Boolean(LOGO_OF[sport]?.plate) })

const brandOf = (sport) => ({ sport, name: BRAND[sportKey(sport)].name, league: BRAND[sportKey(sport)].league })
const statusOf = (s) => (s === 'board' ? 'board' : 'called')

/** price: { best, median, books } as lib/card/store.js stores it, or null. Never made up here. */
export const priceWords = (p) => (p && p.best != null ? { best: fmtAmerican(p.best), books: p.books || null, test: Boolean(p.test) } : null)

// ── NHL ──────────────────────────────────────────────────────────────────────
export async function loadNhl(win, { pickNow }) {
  const [night, cands] = await Promise.all([buildNight(win.card_date), loadCandidates('nhl', win, pickNow)])
  const cur = night.season.current || night.season.id
  const [curLines, prevLines] = await Promise.all([leagueSkaterLines(cur), leagueSkaterLines(previousSeasonId(cur))])
  const gameById = new Map(night.games.map((g) => [g.id, g]))
  const rosters = {}
  const rosterOf = async (team) => (rosters[team] ||= reduceRoster(await rosterFor(team).catch(() => null), team))

  async function modelOf(r) {
    const roster = (await rosterOf(r.team)).find((x) => x.id === r.playerId) || null
    const line = curLines.get(r.playerId)?.gp > 0 ? { l: curLines.get(r.playerId), word: 'THIS SEASON' } : prevLines.get(r.playerId)?.gp > 0 ? { l: prevLines.get(r.playerId), word: 'LAST SEASON' } : null
    const stats = []
    if (r.legs?.ok) {
      stats.push({ label: 'SHOTS / GP', value: r.legs.shotsPg.toFixed(1), pct: r.pct?.shotsPg })
      stats.push({ label: 'GOALS / GP', value: fmt2(r.legs.goalsPg), pct: r.pct?.goalsPg })
      if (r.legs.toi != null) stats.push({ label: 'ICE TIME', value: fmtSec(r.legs.toi), pct: r.pct?.toi })
    }
    if (line) stats.push({ label: line.word, value: `${line.l.g}-${line.l.a}-${line.l.pts}`, sub: `G-A-P in ${line.l.gp} GP` })
    const g = gameById.get(r.gameId)
    const logo = await logoFor('nhl', r.team)
    return {
      sport: 'nhl', brand: brandOf('nhl'), status: statusOf(r.status), statusWord: STATUS_WORD[statusOf(r.status)],
      name: r.name, team: r.team, teamName: nhlTeam(r.team)?.name || r.team, club: nhlTeam(r.team)?.name || '', opp: r.opp, oppName: nhlTeam(r.opp)?.nickname || r.opp, home: r.home,
      pos: r.pos, number: roster?.number ?? null, role: r.role || null,
      face: await inline(roster?.headshot), logo: logo.src, logoPlate: logo.plate, tone: null,
      score: r.score, scoreWord: 'LAMP SCORE', stats,
      rankLine: [r.rank ? `#${r.rank} IN HIS GAME` : null, r.nightRank ? `#${r.nightRank} OF ${r.nightOf} TONIGHT` : null].filter(Boolean),
      callLine: `${r.role === 'TOP' ? 'TOP' : 'GOAL'} · ${CARD_WORDS.nhl.market}`,
      why: null, price: null, day: win.card_date, game: g ? { id: g.id, startUtc: g.startUtc } : null, playerId: String(r.playerId),
    }
  }
  const calledRows = night.rows.filter((r) => r.status === 'called' && Number.isFinite(r.score))
  const byScore = [...calledRows].sort((a, b) => b.score - a.score)
  return { night, cands, modelOf, calledRows: byScore, rowById: (id) => night.rows.find((r) => String(r.playerId) === String(id)) }
}

// ── MLB ──────────────────────────────────────────────────────────────────────
export async function loadMlb(win, { pickNow }) {
  const [cands, board] = await Promise.all([loadCandidates('mlb', win, pickNow), fetchBoardFull('today')])
  const rows = board || []
  const pctOf = (key) => { const p = percentiles(rows.map((r) => num(r[key]))); return new Map(rows.map((r, i) => [String(r.player_id), p[i]])) }
  const P = { hr_per_pa: pctOf('hr_per_pa'), season_iso: pctOf('season_iso'), recent_barrel_rate: pctOf('recent_barrel_rate'), recent_hard_hit_rate: pctOf('recent_hard_hit_rate'), season_max_ev: pctOf('season_max_ev') }
  async function modelOf(c) {
    const r = c._raw || rows.find((x) => String(x.player_id) === String(c.player_id))
    const id = String(r.player_id)
    const stats = []
    if (num(r.season_hr) != null) stats.push({ label: 'SEASON HR', value: String(num(r.season_hr)), sub: num(r.season_pa) ? `in ${num(r.season_pa)} PA` : null })
    if (num(r.hr_per_pa) != null) stats.push({ label: 'HR / PA', value: `${(num(r.hr_per_pa) * 100).toFixed(1)}%`, pct: P.hr_per_pa.get(id), sub: num(r.pa_per_hr) ? `1 per ${num(r.pa_per_hr).toFixed(1)} PA` : null })
    if (num(r.season_iso) != null) stats.push({ label: 'ISO', value: num(r.season_iso).toFixed(3).replace(/^0/, ''), pct: P.season_iso.get(id) })
    if (num(r.recent_barrel_rate) != null) stats.push({ label: 'RECENT BARREL %', value: `${Math.round(num(r.recent_barrel_rate) * 100)}%`, pct: P.recent_barrel_rate.get(id) })
    if (num(r.recent_hard_hit_rate) != null) stats.push({ label: 'RECENT HARD-HIT %', value: `${Math.round(num(r.recent_hard_hit_rate) * 100)}%`, pct: P.recent_hard_hit_rate.get(id) })
    if (num(r.season_max_ev) != null) stats.push({ label: 'MAX EXIT VELO', value: num(r.season_max_ev).toFixed(1), unit: 'MPH', pct: P.season_max_ev.get(id) })
    const logo = await logoFor('mlb', r.team)
    return {
      sport: 'mlb', brand: brandOf('mlb'), status: statusOf(c.status), statusWord: STATUS_WORD[statusOf(c.status)],
      name: r.name, team: r.team, teamName: teamFullName(r.team) || r.team, opp: r.opponent || r.opp, oppName: r.opponent || r.opp, home: null,
      pos: null, bats: r.bats || null, number: num(r.jersey_number), role: c.role,
      face: await inline(mlbHeadshot(id, 480, { strict: true })), logo: logo.src, logoPlate: logo.plate, tone: teamPrimary(r.team),
      score: num(r.hr_score), scoreWord: 'HR SCORE', stats,
      rankLine: num(r.board_rank) && num(r.board_of) ? [`#${r.board_rank} OF ${r.board_of} ON THE BOARD`] : [],
      callLine: `${roleWord(c.role).toUpperCase()} · ${CARD_WORDS.mlb.market}`,
      why: c.why, price: priceWords(num(r.hr_price) ? { best: num(r.hr_price), books: null } : null), day: win.card_date, game: { id: c.game_id }, playerId: id,
    }
  }
  return { cands, rows, modelOf }
}

// ── NFL ──────────────────────────────────────────────────────────────────────
const NFL_BARS = [['RZ', 'f_rz_opp'], ['GL', 'f_gl_opp'], ['xTD', 'f_xtd'], ['TOUCH', 'f_touches'], ['SNAP', 'f_snap_pct']]
export async function loadNfl(win, { pickNow }) {
  const [cands, week] = await Promise.all([loadCandidates('nfl', win, pickNow), fetchNfl(nflSlatePaths(), nflSlateLooksReal)])
  async function modelOf(c) {
    const p = (week.players || []).find((x) => x.player_id === c.player_id)
    const td = p?.components?.TD || {}
    const s = p?.stats || {}
    const f = (v, d = 1) => (num(v) == null ? null : num(v).toFixed(d))
    const stats = []
    if (f(s.RZ) != null) stats.push({ label: 'RED-ZONE TOUCHES', value: f(s.RZ), unit: '/ G', pct: td.f_rz_opp })
    if (f(s.GL) != null) stats.push({ label: 'GOAL-LINE TOUCHES', value: f(s.GL), unit: '/ G', pct: td.f_gl_opp })
    if (f(s.xTD, 2) != null) stats.push({ label: 'EXPECTED TD', value: f(s.xTD, 2), unit: '/ G', pct: td.f_xtd })
    const touches = (num(s.CAR) || 0) + (num(s.TGT) || 0)
    if (touches > 0) stats.push({ label: 'CARRIES + TARGETS', value: touches.toFixed(1), unit: '/ G', pct: td.f_touches })
    if (td.f_snap_pct != null) stats.push({ label: 'SNAP SHARE', value: ord(td.f_snap_pct), unit: 'RANK', pct: td.f_snap_pct })
    if (num(p?.season_td) != null) stats.push({ label: 'TDS THIS SEASON', value: String(num(p.season_td)) })
    const br = boardRankFor(week, c.player_id)
    const logo = await logoFor('nfl', c.team)
    return {
      sport: 'nfl', brand: brandOf('nfl'), status: statusOf(c.status), statusWord: STATUS_WORD[statusOf(c.status)],
      name: c.name, team: c.team, teamName: c.team, opp: c.opp, oppName: c.opp, home: null,
      pos: c.pos, number: num(p?.jersey_number), role: c.role,
      face: await inline(p?.espn_id ? nflHeadshot(String(p.espn_id), 480, 480) : null), logo: logo.src, logoPlate: logo.plate, tone: nflTones(c.team)[0],
      score: num(c.score), scoreWord: 'TD SCORE', stats,
      rankLine: br ? [`#${br.rank} OF ${br.of} ON THE BOARD`] : [],
      callLine: `${CARD_WORDS.nfl.market}`, why: c.why, price: null, day: win.card_date, game: { id: c.game_id }, playerId: String(c.player_id),
    }
  }
  return { cands, week, modelOf }
}

// ── THE CARD (the day's lineup) ──────────────────────────────────────────────
/** The three straights + the Two-Man of a window, exactly as lib/card/core.js picks them. Prices: Map(player_id -> {best,books}) or none. */
export function cardLineup(sport, cands, pickNow, prices = new Map()) {
  const straights = pickStraights(cands, pickNow)
  const two = pickTwoMan(cands, pickNow)
  const w = CARD_WORDS[sport]
  return {
    sport, market: w.market, brandName: w.brand,
    straights: straights.map((c, i) => ({ slot: i + 1, stake: STAKE.straight, c, price: priceWords(prices.get(String(c.player_id))) })),
    two: two ? { stake: STAKE.two_man, legs: two.map((c) => ({ c, price: priceWords(prices.get(String(c.player_id))) })) } : null,
  }
}

export { loadWindows }
