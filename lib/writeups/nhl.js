// THE GAME WRITE-UP, HOCKEY (2026-10-05, Donovan: "build the shit"). LAMP's calls -- one CALLED
// skater per club on the goal board -- turned into the write-up's shape (build.js / mlb.js): why
// each is the look, what could go wrong, the game around them, each side's real status.
//
// PURE: (one readBoard games[] entry of the GOAL board) -> write-up JSON. Every line is
// { t, src, v } with the printed values, for the checker (lib/facts/check.js). A missing field
// writes no line. The goal chance is the board's own Poisson-on-goals-per-game number and is
// labelled as that -- never called a calibrated probability.
import { STATUS_WORD } from '../callStatus'

const num = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))
const txt = (v) => (v == null ? '' : String(v).trim())
const line = (t, src, ...v) => ({ t, src, v: v.filter((x) => x != null) })
const ord = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th')}`
// a percentile prints 1st..99th (100th reads as a typo)
const pctl = (v) => ord(Math.min(99, Math.max(1, Math.round(v))))
const mmss = (sec) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`

export const NHL_FOOTER = 'Called before puck drop. Not betting advice.'
const POS = { C: 'C', L: 'LW', R: 'RW', D: 'D' }

function nhlWhy(r, side, opp) {
  const out = []
  const L = r.legs || {}, P = r.pct || {}, X = r.context || {}
  const s = num(L.shotsPg), sp = num(P.shotsPg)
  if (s != null && sp != null && sp >= 60) out.push(line(`${s.toFixed(1)} shots a game, the ${pctl(sp)} percentile tonight`, 'legs.shotsPg / pct.shotsPg', s.toFixed(1), pctl(sp)))
  const g = num(L.goalsPg), gp = num(P.goalsPg)
  if (g != null && gp != null && gp >= 60) out.push(line(`${g.toFixed(2)} goals a game, the ${pctl(gp)} percentile tonight`, 'legs.goalsPg / pct.goalsPg', g.toFixed(2), pctl(gp)))
  const toi = num(L.toi), tp = num(P.toi)
  if (toi != null && tp != null && tp >= 70) out.push(line(`${mmss(toi)} of ice time a game`, 'legs.toi', mmss(toi)))
  const ppg = num(r.ppg)
  const pk = num(opp?.pkPct)
  if (ppg != null && ppg >= 2) out.push(line(`${ppg} power-play goals this season${pk != null && pk < 0.78 ? `; ${txt(r.opp)} kill ${(100 * pk).toFixed(1)}% of penalties` : ''}`, 'ppg / spots.pkPct', String(ppg), pk != null && pk < 0.78 ? (100 * pk).toFixed(1) : null))
  const ga = num(X.oppGaPg)
  // goals allowed only once the season is 10 games old (his own games stand in for it): a one-game GA/G is noise
  if (ga != null && ga >= 3.3 && (num(L.gpCur) ?? 0) >= 10) out.push(line(`${txt(r.opp)} allow ${ga.toFixed(2)} goals a game`, 'context.oppGaPg', ga.toFixed(2)))
  return out.slice(0, 4)
}

function nhlWatch(r, side) {
  const out = []
  const L = r.legs || {}, P = r.pct || {}, X = r.context || {}
  if (side?.b2b) out.push(line(`${txt(r.team)} played last night`, 'spots.b2b'))
  if (X.lineupKnown === false) out.push(line('the lineup is not posted yet', 'context.lineupKnown'))
  const w = num(L.prevWeight), gc = num(L.gpCur)
  if (w != null && w >= 0.5 && gc != null) out.push(line(`mostly last season's numbers: ${gc} game${gc === 1 ? '' : 's'} this season`, 'legs.prevWeight / legs.gpCur', String(gc)))
  if (X.rookie) out.push(line('a rookie, so little NHL history behind the numbers', 'context.rookie'))
  const tp = num(P.toi)
  if (tp != null && tp < 50) out.push(line('ice time under the night\'s median', 'pct.toi'))
  return out.slice(0, 2)
}

const etTime = (iso) => {
  const t = Date.parse(iso || '')
  return Number.isFinite(t) ? `${new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })} ET` : ''
}

/** Expected goals in a game (the featured rule): the board's goal chances as Poisson rates, summed. */
export function nhlExpectedGoals(rows = []) {
  return rows.reduce((a, r) => { const p = num(r?.context?.goalGameProbability); return a + (p != null && p > 0 && p < 1 ? -Math.log(1 - p) : 0) }, 0)
}

/**
 * One NHL game's write-up.
 * @param bg  one games[] entry of readBoard(date, { market: 'GOAL' })
 */
export function buildNhlWriteup(bg) {
  const g = bg?.game
  if (!g?.id) return null
  const rows = bg.rows || []
  const teams = [g.away?.abbrev, g.home?.abbrev].filter(Boolean)
  const sideOf = (t) => (t === g.away?.abbrev ? bg.spots?.away : bg.spots?.home)
  const oppOf = (t) => (t === g.away?.abbrev ? bg.spots?.home : bg.spots?.away)
  const best = (t) => rows.filter((r) => r.team === t && r.status === 'called').sort((a, b) => (num(b.score) ?? 0) - (num(a.score) ?? 0))[0] || null
  const players = teams.map(best).filter(Boolean)
    .sort((a, b) => (a.context?.role === 'TOP' ? -1 : 0) - (b.context?.role === 'TOP' ? -1 : 0) || (num(b.score) ?? 0) - (num(a.score) ?? 0))
    .map((r) => {
      const X = r.context || {}
      const p = num(X.goalGameProbability)
      return {
        player_id: String(r.playerId), name: txt(r.name), team: txt(r.team), opp: txt(r.opp), position: POS[r.pos] || txt(r.pos),
        role: X.role === 'TOP' ? 'TOP' : 'GOAL', status: r.status, status_word: STATUS_WORD[r.status],
        score: num(r.score) != null ? String(Math.round(num(r.score))) : null, rank: num(X.nightRank), of: num(X.nightOf),
        chance: p != null ? String(Math.round(100 * p)) : null,
        why: nhlWhy(r, sideOf(r.team), oppOf(r.team)), watch: nhlWatch(r, sideOf(r.team)),
        src: 'lamp board rows[] status called',
      }
    })
  const noCall = teams.filter((t) => !players.some((p) => p.team === t)).map((t) => {
    const b = rows.filter((r) => r.team === t).sort((a, c) => (a.rank ?? 999) - (c.rank ?? 999))[0]
    return b ? { team: t, name: txt(b.name), player_id: String(b.playerId), status: b.status || 'off', status_word: STATUS_WORD[b.status || 'off'] } : { team: t, name: null, status: 'off', status_word: STATUS_WORD.off }
  })
  const game = []
  if (g.venue) game.push(line(txt(g.venue), 'game.venue'))
  const st = (t, s) => (s && num(s.ppPct) != null && num(s.pkPct) != null ? `${t} power play ${(100 * s.ppPct).toFixed(1)}%, penalty kill ${(100 * s.pkPct).toFixed(1)}%` : null)
  const sts = [st(g.away?.abbrev, bg.spots?.away), st(g.home?.abbrev, bg.spots?.home)].filter(Boolean)
  if (sts.length) game.push(line(sts.join('; '), 'spots.ppPct / pkPct', ...[bg.spots?.away, bg.spots?.home].flatMap((s) => (s && num(s.ppPct) != null && num(s.pkPct) != null ? [(100 * s.ppPct).toFixed(1), (100 * s.pkPct).toFixed(1)] : []))))
  const xg = nhlExpectedGoals(rows)
  if (xg > 0) game.push(line(`the board's goal chances add up to ${xg.toFixed(1)} expected goals`, 'sum of context.goalGameProbability (Poisson)', xg.toFixed(1)))
  const bottom = [
    ...players.map((p) => line(`${p.name} is ${p.status_word}${p.role === 'TOP' ? ', the game\'s top call' : `, ${p.team}'s call`}.`, 'rows[].status / context.role')),
    ...noCall.map((n) => line(n.name ? `${n.team}: no call. ${n.name}, their top board spot, is ${n.status_word}.` : `${n.team}: no call.`, 'rows[].rank')),
  ]
  return {
    sport: 'nhl', game_id: String(g.id), kickoff: g.startUtc, away: g.away?.abbrev, home: g.home?.abbrev, away_name: g.away?.abbrev, home_name: g.home?.abbrev,
    when: etTime(g.startUtc), locked: Boolean(bg.locked || bg.setting), xg: Number(xg.toFixed(2)),
    header: line(`${players.map((p) => p.name).join(' + ') || 'No call'}: why ${players.length > 1 ? 'they\'re' : 'he\'s'} the goal looks`, 'rows[].name'),
    game, players, noCall, bottom, footer: NHL_FOOTER,
    built_from: { board: 'lamp board (readBoard GOAL)' },
  }
}
