// LAMP (NHL) CARD ADAPTER (server only). Real records only:
//   front  lib/nhl/goalBoard.js buildNight rows: legs (shots / goals / ice time per game), pct (their percentile among TONIGHT's skaters,
//          the same words lib/nhl/goalModel.js whyLine prints), the ranks, the status (lib/nhl/goalModel.js scoreNight, never re-derived);
//          the season line is this season's, else last season's (labelled); number + face from the club roster.
//   back   api-web.nhle.com player landing: seasonTotals (NHL regular season) and the league's own careerTotals.
import { buildNight } from '../../nhl/goalBoard'
import { leagueSkaterLines, rosterFor, playerLanding } from '../../nhl/api'
import { reduceRoster } from '../../nhl/reduce'
import { previousSeasonId } from '../../nhl/season'
import { fmtSec, fmt2 } from '../../nhl/format'
import { nhlTeam } from '../../nhl/teams'
import { CARD_WORDS } from '../../card/core'
import { inline } from '../cardKit'
import { brandOf, statusOf, statusWordOf, callLineOf, prettyDay } from '../model'
import { logoFor, f0, signed, bornWord, feet, num } from './common'

const sport = 'nhl'
const seasonWord = (id) => `${String(id).slice(2, 4)}-${String(id).slice(6, 8)}`

const _night = new Map()
async function nightOf(day) {
  const hit = _night.get(day)
  if (hit && Date.now() - hit.at < 60e3) return hit.v
  const v = await buildNight(day)
  if (_night.size > 4) _night.clear()
  _night.set(day, { at: Date.now(), v })
  return v
}
const _roster = new Map()
const rosterOf = async (team) => {
  if (!_roster.has(team)) _roster.set(team, reduceRoster(await rosterFor(team).catch(() => null), team))
  return _roster.get(team)
}

/** The picture + number of one skater (for the day and dual cards): from his club roster. */
async function identity(leg) {
  // a leg with no club (the night receipt stores only his id) is looked up on his player landing: his picture and his current club
  let team = leg.team
  let face = null
  if (!team) {
    const l = await playerLanding(leg.player_id).catch(() => null)
    team = l?.currentTeamAbbrev || ''
    face = l?.headshot || null
  }
  const roster = team ? (await rosterOf(team)).find((x) => String(x.id) === String(leg.player_id)) || null : null
  const logo = team ? await logoFor(sport, team) : { src: '', plate: false }
  return { face: await inline(roster?.headshot || face), logo: logo.src, logoPlate: logo.plate, tone: null, number: roster?.number ?? null, pos: leg.pos || roster?.pos || null, team }
}

async function modelFor(win, id) {
  const night = await nightOf(win.card_date)
  const r = night.rows.find((x) => String(x.playerId) === String(id))
  if (!r || !Number.isFinite(r.score)) return null
  const cur = night.season.current || night.season.id
  const [curLines, prevLines] = await Promise.all([leagueSkaterLines(cur), leagueSkaterLines(previousSeasonId(cur))])
  const line = curLines.get(r.playerId)?.gp > 0 ? { l: curLines.get(r.playerId), word: 'THIS SEASON' } : prevLines.get(r.playerId)?.gp > 0 ? { l: prevLines.get(r.playerId), word: 'LAST SEASON' } : null
  const stats = []
  if (r.legs?.ok) {
    stats.push({ label: 'SHOTS / GP', value: r.legs.shotsPg.toFixed(1), pct: r.pct?.shotsPg })
    stats.push({ label: 'GOALS / GP', value: fmt2(r.legs.goalsPg), pct: r.pct?.goalsPg })
    if (r.legs.toi != null) stats.push({ label: 'ICE TIME', value: fmtSec(r.legs.toi), pct: r.pct?.toi })
  }
  if (line) stats.push({ label: line.word, value: `${line.l.g}-${line.l.a}-${line.l.pts}`, sub: `G-A-P in ${line.l.gp} GP` })
  const g = night.games.find((x) => x.id === r.gameId)
  const status = statusOf(r.status)
  const ident = await identity({ team: r.team, player_id: r.playerId, pos: r.pos })
  return {
    sport, brand: brandOf(sport), status, statusWord: statusWordOf(status),
    name: r.name, team: r.team, teamName: nhlTeam(r.team)?.name || r.team, club: nhlTeam(r.team)?.name || '', opp: r.opp, home: r.home,
    pos: r.pos, number: ident.number, role: r.role || null,
    face: ident.face, logo: ident.logo, logoPlate: ident.logoPlate, tone: null,
    score: r.score, scoreWord: 'LAMP SCORE', stats, statNote: "percentile among tonight's skaters", poolWord: "tonight's skaters",
    rankLine: [r.nightRank ? `#${r.nightRank} OF ${r.nightOf} TONIGHT` : null, r.rank ? `#${r.rank} IN HIS GAME` : null].filter(Boolean),
    callLine: callLineOf({ status, role: r.role === 'TOP' ? 'TOP' : 'GOAL', market: CARD_WORDS.nhl.market }),
    why: null, price: null, day: win.card_date, dayWord: prettyDay(win.card_date), game: g ? { id: g.id, startUtc: g.startUtc, date: g.date || win.card_date } : null, playerId: String(r.playerId),
  }
}

async function backOf(m) {
  const l = await playerLanding(m.playerId).catch(() => null)
  const bio = l ? [
    ['HT / WT', [feet(l.heightInInches), l.weightInPounds ? `${l.weightInPounds} lb` : null].filter(Boolean).join(' · ')],
    ['SHOOTS', l.shootsCatches], ['BORN', bornWord(l.birthDate, l.birthCity?.default)],
    ['DRAFTED', l.draftDetails ? `${l.draftDetails.year} · Rd ${l.draftDetails.round} · #${l.draftDetails.overallPick} ${l.draftDetails.teamAbbrev}` : 'Undrafted'],
  ].filter(([, v]) => v) : []
  const cols = [['YEAR', 1.25, 'season'], ['TEAM', 1.9, 'tm'], ['GP', 0.95, 'gp'], ['G', 0.9, 'g'], ['A', 0.9, 'a'], ['PTS', 1.1, 'pts'], ['+/-', 1, 'pm'], ['SOG', 1.1, 'sog'], ['S%', 1, 'shp'], ['TOI', 1.1, 'toi']]
  const rowOf = (s) => ({ season: seasonWord(s.season), tm: s.teamCommonName?.default || '', gp: f0(s.gamesPlayed), g: f0(s.goals), a: f0(s.assists), pts: f0(s.points), pm: signed(num(s.plusMinus)), sog: f0(s.shots), shp: num(s.shootingPctg) == null ? '—' : (s.shootingPctg * 100).toFixed(1), toi: s.avgToi || '—' })
  const rows = (l?.seasonTotals || []).filter((s) => s.leagueAbbrev === 'NHL' && s.gameTypeId === 2).sort((a, b) => a.season - b.season).map(rowOf)
  const tot = (t, label) => (t ? { ...rowOf({ ...t, season: 0 }), season: label, tm: '' } : null)
  const shown = rows.length
  return {
    bio, cols, rows, title: 'CAREER STATS', career: tot(l?.careerTotals?.regularSeason, 'NHL TOTALS'), playoffs: tot(l?.careerTotals?.playoffs, 'PLAYOFFS'),
    seasonsShown: rows.map((r) => r.season), note: shown ? `Totals and playoffs are the league's own, all seasons.${shown > 6 ? ` Last 6 of ${shown} NHL seasons shown.` : ''}` : '', source: 'NHL player landing (seasonTotals, careerTotals)',
  }
}

export default { sport, modelFor, backOf, identity }
