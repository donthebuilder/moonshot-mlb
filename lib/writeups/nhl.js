// THE GAME WRITE-UP, HOCKEY (2026-10-05, Donovan: "build the shit"). LAMP's calls -- one CALLED
// skater per club on the goal board -- turned into the write-up's shape (build.js / mlb.js): why
// each is the look, what could go wrong, the game around them, each side's real status.
//
// PURE: (one readBoard games[] entry of the GOAL board) -> write-up JSON. Every line is
// { t, src, v } with the printed values, for the checker (lib/facts/check.js). A missing field
// writes no line. POLICY (2026-10-06): the board's goal chance (goalGameProbability) is LOGGED, never
// PRINTED until the calibration gate is met; a LAMP score is a rank, not a probability. What prints is
// the rank and its band (rankBand below).
import { STATUS_WORD } from '../callStatus'
import { weakSentence } from '../nhl/goalieWeak'

const num = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))
const txt = (v) => (v == null ? '' : String(v).trim())
const line = (t, src, ...v) => ({ t, src, v: v.filter((x) => x != null) })
const ord = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th')}`
// a percentile prints 1st..99th (100th reads as a typo)
const pctl = (v) => ord(Math.min(99, Math.max(1, Math.round(v))))
const mmss = (sec) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`

export const NHL_FOOTER = 'Called before puck drop. Not betting advice.'
const POS = { C: 'C', L: 'LW', R: 'RW', D: 'D' }

function nhlWhy(r, side, opp, goalieWeak = null) {
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
  const four = out.slice(0, 4)
  // WHERE HIS GOALIE IS WEAK (2026-10-10): one plain sentence, only for the CONFIRMED starter (context.oppGoalie is set only when
  // the club has named him), only when his sample clears the floor (lib/nhl/goalieWeak.js WEAK_FLOOR: 8 starts or 150 shots against
  // this season, 20+ shots and 2+ goals in the zone) and only when the zone read answered. Information, not a forecast.
  const gw = weakLine(X.oppGoalie, goalieWeak)
  return gw ? [...four, gw] : four
}

/** The goalie-weak-spot line for a confirmed starter, or null: no starter, no read, under the floor, or no zone above the league. */
export function weakLine(oppGoalie, goalieWeak) {
  if (!oppGoalie || oppGoalie.confirmed !== true) return null
  const id = String(oppGoalie.playerId ?? oppGoalie.id ?? '')
  const w = goalieWeak?.[id]
  if (!id || !w || w.state !== 'ok' || !w.spots?.length) return null
  const spot = w.spots[0]
  const lgPct = Math.round(spot.lg * 1000) / 10
  const l = line(weakSentence(txt(oppGoalie.name), spot).replace(/[.]$/, ''), 'goalieweak.spots[0] (lamp_goalie_zones / lamp_league_zones)', String(spot.ga), String(spot.sa), String(lgPct))
  l.names = [txt(oppGoalie.name)]
  return l
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

/** The plain band a night rank sits in, from the rank alone: { n: 5, word: 'top 5%' } | null (below the top half). */
export function rankBand(rank, of) {
  const r = num(rank), o = num(of)
  if (r == null || o == null || o <= 0 || r < 1) return null
  const f = r / o
  const b = f <= 0.01 ? [1, 'top 1%'] : f <= 0.05 ? [5, 'top 5%'] : f <= 0.1 ? [10, 'top 10%'] : f <= 0.25 ? [null, 'top quarter'] : f <= 0.5 ? [null, 'top half'] : null
  return b ? { n: b[0], word: b[1] } : null
}

/** Expected goals in a game (SORTING ONLY -- the featured pick; never printed) (the featured rule): the board's goal chances as Poisson rates, summed. */
export function nhlExpectedGoals(rows = []) {
  return rows.reduce((a, r) => { const p = num(r?.context?.goalGameProbability); return a + (p != null && p > 0 && p < 1 ? -Math.log(1 - p) : 0) }, 0)
}

/**
 * One NHL game's write-up.
 * @param bg  one games[] entry of readBoard(date, { market: 'GOAL' })
 * @param inputs  optional: { goalieWeak: { [goalieId]: readWeak payload } } (lib/nhl/goalieWeakRead.js), read by the caller for the confirmed starters
 */
export function buildNhlWriteup(bg, inputs = {}) {
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
      return {
        player_id: String(r.playerId), name: txt(r.name), team: txt(r.team), opp: txt(r.opp), position: POS[r.pos] || txt(r.pos),
        role: X.role === 'TOP' ? 'TOP' : 'GOAL', status: r.status, status_word: STATUS_WORD[r.status],
        score: num(r.score) != null ? String(Math.round(num(r.score))) : null, rank: num(X.nightRank), of: num(X.nightOf),
        band: rankBand(X.nightRank, X.nightOf),
        why: nhlWhy(r, sideOf(r.team), oppOf(r.team), inputs?.goalieWeak), watch: nhlWatch(r, sideOf(r.team)),
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

// ════════════════════════════════════════════════════════════════════════════
// THE FULL WRITE-UP, HOCKEY DEPTH (2026-10-07, Donovan: "needs more depth,
// nerded out, but it has to make sense and use real stats only"). The football
// twin is lib/writeups/nfl.js. Behind THE FULL WRITE-UP; the basics above stay as they were.
//
// PURE: (a board row, its game, the inputs the page fetched) -> sections of lines.
// Every line is { t, src, v, calc }: the sentence, the field it came from, every number
// it prints, and the recipe of each number we worked out ({ op, dp, args, out }: a per-60
// rate, a share, a rank). Every printed number goes through R() (a field as it is) or
// d() (a recipe in DERIVE), which is how it lands in `v`. scripts/writeups/test-nhl-depth.mjs
// fails if a sentence prints a digit that is not in its own `v` (a typed-in number), if a
// raw `v` is not in the input, if a recipe's args are not in the input or its `out` is not
// what DERIVE gives, or if a thin sample still wrote a line. Nothing is random; a missing
// or thin field writes NO line. Never a printed model probability (check-no-printed-probability):
// the shot model's summed value is worded through XG_WORDS, a measured sum over many shots.
//
// AS OF: the board's rows (legs, pct, context, form) are the lock's; szn is null once the
// game has started. Everything read as of NOW (shot maps, goalies, special teams) is used
// only while the game is 'pre', so a finished game never reads itself back.
//
//   inp = { shots, against: { [club]: payload }, goalies, zones: { [goalieId]: payload }, special, goalieK }
//     shots     /api/lamp/shots?player=   (lib/nhl/shotMap.js readShotMap)
//     against   /api/lamp/shots?against=  the shots a club allowed
//     goalies   /api/lamp/goalies         { season, goalies: [{ id, name, team, gp, gs, svPct, sa }] }
//     zones     /api/lamp/goaliezones     { available, goalie: { ga, sa, zones }, league: { zones } }
//     special   /api/lamp/specialteams    { stale, teams: [{ abbrev, gp, ppPct, ppOppPg, pkPct, shPg }] }
//     goalieK   the xG model's goalie shrink (lib/nhl/xgLampXgV1.js goalie.k)
const XG_WORDS = 'expected goals' // allow-probability: a measured shot value summed over many shots, not a probability

export const MIN = {
  toi: 600,         // seconds a game before a per-hour rate is read
  shots: 100,       // shots on goal behind a finishing / attempts line
  slot: 40,         // shots on goal behind a location or shot-type line
  recentGp: 3,      // games behind a "last N" line
  seasonGp: 5,      // games behind this season's line
  club: 20,         // club games behind a defence line
  clubSog: 200,     // shots allowed behind a defence location line
  gs: 8,            // starts behind a goalie line
  goalieSa: 300,    // shots faced behind a goalie quality line
  spGp: 10,         // games behind a special teams line
  gap: 40,          // shots in a zone behind a "beatable from" line
  group: 6,         // skaters in a position group behind a rank line
}

// the recipes: every number we work out goes through one of these, and the test re-runs them
export const DERIVE = {
  id: (a) => a,
  per60: (n, sec) => (n * 3600) / sec,
  mins: (sec) => Math.floor(Math.round(sec) / 60),
  secs: (sec) => Math.round(sec) % 60,
  pct: (a, b) => (100 * a) / b,
  pct100: (a) => 100 * a,
  ratio: (a, b) => a / b,
  share: (a, ...all) => (100 * a) / all.reduce((s, x) => s + x, 0),
  perClubGame: (n, games) => n / (2 * games),
  round: (a) => Math.round(a),
  pctl: (v) => Math.min(99, Math.max(1, Math.round(v))),   // a percentile prints 1st..99th
  rank: (x, ...others) => 1 + others.filter((o) => o > x).length,
  count: (...all) => all.length,
  // goals the league's own rate gives for a goalie's shots: args are (his shots in a zone, the league's goals there, the league's shots there), zone after zone
  expGa: (...t) => { let s = 0; for (let i = 0; i < t.length; i += 3) s += (t[i] * t[i + 1]) / t[i + 2]; return s },
  factor: (ga, xga, k) => (ga + k) / (xga + k),
}
export const roundTo = (v, dp) => Math.round(v * 10 ** dp) / 10 ** dp
let RAW = [], CALC = []
/** a field printed as it is */
const R = (x) => { RAW.push(x); return x }
/** a number worked out; its recipe is kept */
const d = (op, dp, ...args) => { const out = roundTo(DERIVE[op](...args), dp); CALC.push({ op, dp, args, out }); return out }
/** a printed number with its decimals (a recipe of identity) */
const p = (x, dp) => d('id', dp, x).toFixed(dp)
/** the line: every number the sentence printed is in v */
const dline = (t, src) => { const out = { t, src, v: [...RAW, ...CALC.map((c) => c.out)], calc: CALC }; RAW = []; CALC = []; return out }
const reset = () => { RAW = []; CALC = [] }

const mmss2 = (sec) => `${d('mins', 0, sec)}:${String(d('secs', 0, sec)).padStart(2, '0')}`
const days = (n) => `${R(n)} day${n === 1 ? '' : 's'}`
const grp = (pos) => (pos === 'D' ? 'D' : 'F')
const GRP_WORD = { F: 'forwards', D: 'defencemen' }
const ZONE_WORDS = { crease: 'the crease', inner_slot: 'the inner slot', slot: 'the slot', l_circle: 'the left circle', r_circle: 'the right circle', l_point: 'the left point', r_point: 'the right point', perimeter: 'behind the net' }

/** the club's busiest goalie in a goalies payload (most starts); null under the gate */
export function busiestGoalie(goalies, club) {
  const list = (goalies?.goalies || []).filter((g) => g.team === club && num(g.gs) != null)
  list.sort((a, b) => (b.gs - a.gs) || ((b.gp ?? 0) - (a.gp ?? 0)) || String(a.name).localeCompare(String(b.name)))
  const g = list[0]
  return g && g.gs >= MIN.gs && num(g.svPct) != null && num(g.sa) != null ? g : null
}

/** a goalie's shots against the league's rate in the same zones: { ga, sa, trip, worst } or null (thin, or the zone SQL has not run) */
export function goalieZoneRead(zones) {
  if (!zones?.available || !zones.goalie || !zones.league) return null
  const ga = num(zones.goalie.ga), sa = num(zones.goalie.sa)
  if (ga == null || sa == null || sa < MIN.goalieSa) return null
  const trip = []
  let worst = null
  for (const [key, z] of Object.entries(zones.goalie.zones || {})) {
    const l = zones.league.zones?.[key]
    if (!l || !num(l.sa) || num(z.sa) == null || num(z.ga) == null) continue
    trip.push(z.sa, l.ga, l.sa)
    if (z.sa >= MIN.gap) {
      const gap = z.ga / z.sa - l.ga / l.sa
      if (!worst || gap > worst.gap) worst = { key, gap, sa: z.sa, ga: z.ga, lgGa: l.ga, lgSa: l.sa }
    }
  }
  return trip.length ? { ga, sa, trip, worst } : null
}

function goalieLines(opp, inp, ago) {
  const g = busiestGoalie(inp.goalies, opp)
  if (!g) return []
  const out = [dline(`${g.name} has started the most games in ${opp}'s net ${ago}: ${R(g.gs)} starts, ${d('pct100', 1, g.svPct).toFixed(1)}% of ${R(g.sa)} shots saved. Tonight's starter is not posted`, 'goalies[].gs / svPct / sa')]
  const zr = goalieZoneRead(inp.zones?.[g.id])
  if (zr && num(inp.goalieK) != null) {
    const xga = d('expGa', 1, ...zr.trip)
    const f = d('factor', 2, zr.ga, xga, inp.goalieK)
    out.push(dline(`${g.name} let in ${R(zr.ga)} goals on ${R(zr.sa)} shots where the league's own rate from the same spots gives ${xga.toFixed(1)}; shrunk toward average, he counts as ${f.toFixed(2)} of an average goalie's goals allowed (lower is better)`, 'goaliezones.goalie / league zones, goalie k'))
    if (zr.worst && zr.worst.gap > 0.02) {
      const w = zr.worst
      out.push(dline(`${g.name} is most beatable from ${ZONE_WORDS[w.key] || w.key}: ${R(w.ga)} goals on ${R(w.sa)} shots, ${d('pct', 1, w.ga, w.sa).toFixed(1)}% against the league's ${d('pct', 1, w.lgGa, w.lgSa).toFixed(1)}%`, 'goaliezones.goalie.zones / league.zones'))
    }
  }
  return out
}

function specialLines(team, opp, inp, ago) {
  const T = (a) => (inp.special?.teams || []).find((t) => t.abbrev === a)
  const me = T(team), them = T(opp)
  const out = []
  if (me && them && me.gp >= MIN.spGp && them.gp >= MIN.spGp && num(me.ppPct) != null && num(them.pkPct) != null) {
    out.push(dline(`${team}'s power play converts ${d('pct100', 1, me.ppPct).toFixed(1)}% ${ago}${num(me.ppOppPg) != null ? `, ${p(me.ppOppPg, 1)} power plays a game` : ''}; ${opp}'s penalty kill stops ${d('pct100', 1, them.pkPct).toFixed(1)}%`, 'specialteams.teams[].ppPct / ppOppPg / pkPct'))
  }
  if (me && them && me.gp >= MIN.spGp && them.gp >= MIN.spGp && num(them.shPg) != null && num(me.shPg) != null) {
    out.push(dline(`${opp} take ${p(them.shPg, 1)} penalties a game and ${team} take ${p(me.shPg, 1)}`, 'specialteams.teams[].shPg'))
  }
  return out
}

function restLines(bg) {
  const g = bg.game
  const part = (ab, s) => (s ? (s.b2b ? `${ab} played last night` : num(s.rest) != null ? `${ab} ${days(s.rest)} of rest` : null) : null)
  const a = part(g.away?.abbrev, bg.spots?.away), h = part(g.home?.abbrev, bg.spots?.home)
  if (!a || !h) { reset(); return [] }
  return [dline(`${a}; ${h}`, 'spots.rest / b2b')]
}

/**
 * One skater's depth sections.
 * @param r    a board row (readBoard GOAL games[].rows[])
 * @param bg   its game (readBoard games[])
 * @param inp  the fetched inputs (see the top of this block), all optional
 * @param opts { game: true } leaves out what the game's own sections carry (goalie, rest, special teams)
 * @returns [{ key, title, lines: [{ t, src, v, calc }] }]
 */
export function nhlDepth(r, bg, inp = {}, opts = {}) {
  const g = bg?.game
  if (!r?.playerId || !g?.id) return []
  reset()
  const pre = g.state === 'pre'                       // as-of-now reads only before puck drop
  const L = r.legs || {}, P = r.pct || {}, X = r.context || {}
  const sh = pre ? inp.shots : null
  const ago = sh?.stale ? 'last season' : 'this season'
  const A = sh?.all
  const out = []
  const add = (key, title, lines) => { const l = lines.filter(Boolean); if (l.length) out.push({ key, title, lines: l }) }
  const mates = (bg.rows || []).filter((x) => x.team === r.team && grp(x.pos) === grp(r.pos) && num(x.legs?.toi) != null)
  const inGroup = mates.length >= MIN.group && mates.some((x) => x.playerId === r.playerId)

  // ── role and usage ──
  const role = []
  const toi = num(L.toi)
  if (toi != null && toi >= MIN.toi) {
    role.push(dline(`${mmss2(toi)} of ice time a game${num(P.toi) != null ? `, ${ord(d('pctl', 0, P.toi))} percentile among tonight's skaters` : ''}`, 'legs.toi / pct.toi'))
    if (inGroup) {
      const rk = d('rank', 0, toi, ...mates.filter((x) => x.playerId !== r.playerId).map((x) => x.legs.toi))
      const n = d('count', 0, ...mates.map((x) => x.legs.toi))
      role.push(dline(`${ord(rk)} in ice time among the ${n} ${GRP_WORD[grp(r.pos)]} we score for ${r.team}${rk <= (grp(r.pos) === 'D' ? 2 : 3) ? `, the top ${grp(r.pos) === 'D' ? 'pair' : 'line'}'s minutes` : ''}`, 'legs.toi, same club and position group on the board'))
    }
  }
  if (A && num(A.attempts) >= MIN.shots && num(A.byStrength?.pp) != null) {
    role.push(dline(`${R(A.byStrength.pp)} of his ${R(A.attempts)} shot attempts ${ago} came on the power play (${d('pct', 1, A.byStrength.pp, A.attempts).toFixed(1)}%)`, 'shots.all.byStrength.pp / attempts'))
  }
  add('role', 'ROLE AND USAGE', role)

  // ── shot profile ──
  const prof = []
  const spg = num(L.shotsPg)
  if (spg != null && toi != null && toi >= MIN.toi) {
    const gp = num(L.gpPooled)
    prof.push(dline(`${p(spg, 1)} shots a game, ${d('per60', 1, spg, toi).toFixed(1)} per hour of ice time${gp != null ? `, over the ${d('round', 0, gp)} games the board counts` : ''}`, 'legs.shotsPg / toi / gpPooled'))
    if (inGroup && mates.every((x) => num(x.legs?.shotsPg) != null)) {
      const rk = d('rank', 0, spg, ...mates.filter((x) => x.playerId !== r.playerId).map((x) => x.legs.shotsPg))
      const n = d('count', 0, ...mates.map((x) => x.legs.shotsPg))
      prof.push(dline(`${ord(rk)} of ${n} ${r.team} ${GRP_WORD[grp(r.pos)]} in shots a game`, 'legs.shotsPg, same club and position group'))
    }
  }
  if (A && num(A.sog) >= MIN.shots) {
    prof.push(dline(`${ago === 'last season' ? 'Last season' : 'This season'}: ${R(A.attempts)} attempts, ${R(A.sog)} on net, ${R(A.blocked)} blocked, ${R(A.misses)} missed`, 'shots.all.attempts / sog / blocked / misses'))
  }
  if (A && num(A.sog) >= MIN.slot && num(A.slotShare) != null) {
    const lg = num(sh.league?.slotShare)
    prof.push(dline(`${d('pct100', 0, A.slotShare)}% of his shots on goal came from the slot${lg != null ? ` (the league's ${d('pct100', 0, lg)}%)` : ''}${num(A.distSog) != null ? `; the average shot on goal came from ${R(A.distSog)} feet out` : ''}`, 'shots.all.slotShare / league.slotShare / distSog'))
  }
  if (A?.types && num(A.sog) >= MIN.slot) {
    const top = Object.entries(A.types).filter(([, t]) => num(t.att) != null).sort((a, b) => b[1].att - a[1].att)[0]
    if (top && top[1].att >= 20) {
      const all = Object.values(A.types).map((t) => t.att)
      prof.push(dline(`His most common shot is the ${top[0].replace('-', ' ')}: ${R(top[1].att)} attempts, ${d('share', 0, top[1].att, ...all)}% of those that were not blocked, ${R(top[1].g)} goals`, 'shots.all.types'))
    }
  }
  if (A?.xg && num(A.xg.sog) >= MIN.shots && num(A.xg.total) != null && num(A.xg.goals) != null) {
    prof.push(dline(`${R(A.xg.goals)} goals on ${R(A.xg.sog)} shots on goal where the shot model's ${XG_WORDS} came to ${p(A.xg.total, 1)}, ${d('ratio', 2, A.xg.total, A.xg.sog).toFixed(2)} a shot`, 'shots.all.xg'))
  }
  add('shots', 'SHOT PROFILE', prof)

  // ── recent form against the season ──
  const form = []
  const F = r.form
  if (F && num(F.gp5) >= MIN.recentGp && num(F.l5) != null) {
    const wide = num(F.gp10) > F.gp5 && F.gp10 >= 5 && num(F.l10) != null
    form.push(dline(`${R(F.l5)} goal${F.l5 === 1 ? '' : 's'} in his last ${R(F.gp5)} games${wide ? `, ${R(F.l10)} in his last ${R(F.gp10)}` : ''}`, 'form.l5 / gp5 / l10 / gp10'))
  }
  const z = r.szn
  if (z && num(z.gp) >= MIN.seasonGp && num(z.g) != null && num(L.goalsPg) != null) {
    form.push(dline(`${R(z.g)} goals in ${R(z.gp)} games this season, ${d('ratio', 2, z.g, z.gp).toFixed(2)} a game, against ${p(L.goalsPg, 2)} a game over the games the board counts`, 'szn.g / gp, legs.goalsPg'))
  }
  if (F && num(F.drought) >= 3 && num(F.drought_n) != null) form.push(dline(`${F.droughtPlus ? 'At least ' : ''}${R(F.drought)} games since his last goal`, 'form.drought / droughtPlus'))
  else if (F && F.drought === 0 && num(F.drought_n) >= 1) form.push(dline('Scored in his most recent game', 'form.drought'))
  if (A && !sh.stale && num(sh.last10?.games) >= 5 && num(A.games) >= 15 && num(sh.last10.sog) != null) {
    form.push(dline(`${d('ratio', 1, sh.last10.sog, sh.last10.games).toFixed(1)} shots on goal a game over his last ${R(sh.last10.games)}, against ${d('ratio', 1, A.sog, A.games).toFixed(1)} for the season`, 'shots.last10 / shots.all sog / games'))
  }
  add('form', 'RECENT FORM AGAINST THE SEASON', form)

  // ── the defence he faces ──
  const opp = r.opp
  const AG = pre ? inp.against?.[opp] : null
  const aAgo = AG?.stale ? 'last season' : 'this season'
  const def = []
  if (AG?.all && num(AG.all.games) >= MIN.club && num(AG.all.sog) != null && num(AG.league?.sog) != null && num(AG.league?.games) > 0) {
    def.push(dline(`${opp} allowed ${d('ratio', 1, AG.all.sog, AG.all.games).toFixed(1)} shots on goal a game ${aAgo}; the league average is ${d('perClubGame', 1, AG.league.sog, AG.league.games).toFixed(1)}`, 'shots.against.all.sog / games, league.sog / games'))
  }
  if (AG?.all && num(AG.all.sog) >= MIN.clubSog && num(AG.all.slotShare) != null && num(AG.league?.slotShare) != null) {
    def.push(dline(`${d('pct100', 0, AG.all.slotShare)}% of the shots on goal they allow come from the slot (the league's ${d('pct100', 0, AG.league.slotShare)}%)`, 'shots.against.all.slotShare / league.slotShare'))
  }
  if (AG?.all?.xg && num(AG.all.xg.sog) >= MIN.clubSog && num(AG.all.games) >= MIN.club) {
    def.push(dline(`The shot model values the shots ${opp} allow at ${d('ratio', 1, AG.all.xg.total, AG.all.games).toFixed(1)} ${XG_WORDS} a game ${aAgo}`, 'shots.against.all.xg.total / games'))
  }
  const ga = num(X.oppGaPg)
  if (ga != null && (num(L.gpCur) ?? 0) >= 10) def.push(dline(`${opp} allow ${p(ga, 2)} goals a game`, 'context.oppGaPg'))
  add('defence', 'THE DEFENCE HE FACES', def)

  if (!opts.game) {
    add('goalie', 'THE GOALIE HE FACES', pre && inp.goalies ? goalieLines(opp, inp, goalieAgo(inp, g)) : [])
    add('rest', 'REST', restLines(bg))
    add('special', 'SPECIAL TEAMS', pre ? specialLines(r.team, opp, inp, inp.special?.stale ? 'last season' : 'this season') : [])
  }
  reset()
  return out
}
const goalieAgo = (inp, g) => (inp.goalies?.season && g?.season && inp.goalies.season < g.season ? 'last season' : 'this season')

/** The game's own sections: rest, special teams for both clubs, the goalie each club most likely starts. */
export function nhlGameDepth(bg, inp = {}) {
  const g = bg?.game
  if (!g?.id) return []
  reset()
  const pre = g.state === 'pre'
  const a = g.away?.abbrev, h = g.home?.abbrev
  const out = []
  const add = (key, title, lines) => { const l = lines.filter(Boolean); if (l.length) out.push({ key, title, lines: l }) }
  add('grest', 'REST', restLines(bg))
  const sp = inp.special?.stale ? 'last season' : 'this season'
  add('gspecial', 'SPECIAL TEAMS', pre ? [...specialLines(a, h, inp, sp), ...specialLines(h, a, inp, sp)] : [])
  add('ggoalie', 'GOALIES', pre && inp.goalies ? [...goalieLines(h, inp, goalieAgo(inp, g)), ...goalieLines(a, inp, goalieAgo(inp, g))] : [])
  reset()
  return out
}
