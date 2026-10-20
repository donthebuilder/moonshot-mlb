// 🏅 TUDDY'S AWARD RACES: THE MODEL (2026-10-20, Donovan: "who's gonna win ... MVP ... we need those models being ran").
// BUCKETS' recipe (lib/nba/awardModel.js) for football. Pure: no fetches, so the fit script and the site read the same math.
//
// THE SHAPE. One AP award = a pool of players in one season and a SHARE for each that sums to 1 over the pool: a softmax of a
// weighted sum of his numbers, each a z-score WITHIN THAT SEASON'S POOL (lib/awardCore.js). The weights are FITTED on real
// voting: the AP's vote points for every player who got a vote (as Pro-Football-Reference lists them), seasons 2012-2025;
// everyone else in the pool got 0. His numbers are nflverse's weekly player stats (the feed hist_nfl is built from) and the
// club's record is nflverse's game results. The fit and its hold-out numbers: scripts/fit-nfl-awards.mjs and its commit.
//
// POSITION IS IN THE DATA, NOT A RULE. MVP and OPOY share one pool of passers, runners and catchers; "he is a quarterback" is a
// feature and the fit decides how much it counts (MVP: a lot). DPOY and DROY pool the defence the same way.
//
// EARLY SEASON = MOSTLY LAST SEASON, MEASURED. 17 games is a short season, so his line this season is shrunk toward last
// season's by BLEND_GAMES games, and the spread is widened by a temperature MEASURED AT THAT WEEK on past seasons (each
// season's lines through week W against its final vote): AWARD_FITS[award].TW. A share is a model's read, never a book's price.

import { zScore, softmax } from '../awardCore'

export { zScore, softmax }
export const AWARDS_MODEL_VERSION = 'nfl-awards-v1'
export const SEASON_GAMES = 17

const num = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0 }

/** A CSV text -> objects keyed by its header (quoted cells with commas allowed). */
export function parseCsv(text) {
  const rows = []
  let row = [], cell = '', q = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++ } else q = false } else cell += ch }
    else if (ch === '"') q = true
    else if (ch === ',') { row.push(cell); cell = '' }
    else if (ch === '\n' || ch === '\r') {
      if (cell !== '' || row.length) { row.push(cell); rows.push(row); row = []; cell = '' }
      if (ch === '\r' && text[i + 1] === '\n') i++
    } else cell += ch
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row) }
  const head = rows.shift() || []
  return rows.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])))
}

// the season totals each race reads, from nflverse's weekly columns
const SUM = {
  att: 'attempts', passYds: 'passing_yards', passTd: 'passing_tds', int: 'passing_interceptions',
  car: 'carries', rushYds: 'rushing_yards', rushTd: 'rushing_tds', rec: 'receptions', recYds: 'receiving_yards', recTd: 'receiving_tds',
  epaPass: 'passing_epa', epaRush: 'rushing_epa', epaRec: 'receiving_epa',
  sacks: 'def_sacks', qbHits: 'def_qb_hits', tfl: 'def_tackles_for_loss', defInt: 'def_interceptions', pd: 'def_pass_defended',
  ff: 'def_fumbles_forced', solo: 'def_tackles_solo', ast: 'def_tackle_assists', defTd: 'def_tds',
}

/**
 * Season lines from nflverse's weekly rows (regular season, weeks <= throughWeek): Map id -> { id, name, pos, group, team, gp,
 * headshot, ...per-game numbers }. team = the club of his latest week (a traded player is his new club's).
 */
export function seasonLines(weekRows, throughWeek = 99) {
  const acc = new Map()
  for (const w of weekRows) {
    if (w.season_type !== 'REG' || Number(w.week) > throughWeek || !w.player_id) continue
    let a = acc.get(w.player_id)
    if (!a) { a = { id: w.player_id, name: w.player_display_name || w.player_name, pos: w.position, group: w.position_group, headshot: w.headshot_url || null, gp: 0, wk: 0, t: {} }; acc.set(w.player_id, a) }
    a.gp++
    if (Number(w.week) >= a.wk) { a.wk = Number(w.week); a.team = w.team }
    for (const [k, col] of Object.entries(SUM)) a.t[k] = (a.t[k] || 0) + num(w[col])
  }
  const out = new Map()
  for (const a of acc.values()) {
    const g = a.gp, pg = (k) => (a.t[k] || 0) / g
    out.set(a.id, {
      id: a.id, name: a.name, pos: a.pos, group: a.group, team: a.team, gp: g, headshot: a.headshot,
      att: pg('att'), passYds: pg('passYds'), passTd: pg('passTd'), int: pg('int'),
      rushYds: pg('rushYds'), rushTd: pg('rushTd'), recYds: pg('recYds'), recTd: pg('recTd'), rec: pg('rec'),
      epa: pg('epaPass') + pg('epaRush') + pg('epaRec'),
      sacks: pg('sacks'), qbHits: pg('qbHits'), tfl: pg('tfl'), defInt: pg('defInt'), pd: pg('pd'), ff: pg('ff'),
      tkl: pg('solo') + pg('ast'), defTd: pg('defTd'),
    })
  }
  return out
}

/**
 * Club records from nflverse's games (regular season, weeks <= throughWeek, scored games only):
 * { [team]: { g, w, t, pa } } -> with `prev` (last season's), winPct and points allowed a game shrunk toward last season's by
 * CLUB_PRIOR games, and defVsLeague = points a game below the league (higher = better defence).
 */
export const CLUB_PRIOR = 4
// nflverse's results keep a moved club's old code (STL, SD, OAK); its player stats use today's
const FRANCHISE = { STL: 'LA', SD: 'LAC', OAK: 'LV' }
export function clubRecords(gameRows, season, throughWeek = 99, prev = null) {
  const c = {}
  const add = (code, pf, pa) => {
    const tm = FRANCHISE[code] || code
    const x = (c[tm] ||= { g: 0, w: 0, t: 0, pa: 0 }); x.g++; x.pa += pa; if (pf > pa) x.w++; else if (pf === pa) x.t++ }
  for (const r of gameRows) {
    if (Number(r.season) !== season || r.game_type !== 'REG' || Number(r.week) > throughWeek || r.home_score === '' || r.away_score === '') continue
    const hs = Number(r.home_score), as = Number(r.away_score)
    add(r.home_team, hs, as); add(r.away_team, as, hs)
  }
  for (const tm of Object.keys(prev || {})) c[tm] ||= { g: 0, w: 0, t: 0, pa: 0 }
  for (const [tm, x] of Object.entries(c)) {
    const p = prev?.[tm]
    const pPct = p?.g ? (p.w + 0.5 * p.t) / p.g : 0.5
    const pPa = p?.g ? p.pa / p.g : null
    const K = prev ? CLUB_PRIOR : 0
    x.games = x.g
    x.winPct = x.g + K ? (x.w + 0.5 * x.t + K * pPct) / (x.g + K) : 0.5
    x.paPg = pPa != null ? (x.pa + K * pPa) / (x.g + K) : x.g ? x.pa / x.g : null
  }
  const rated = Object.values(c).filter((x) => x.paPg != null)
  const lg = rated.reduce((t, x) => t + x.paPg, 0) / (rated.length || 1)
  for (const x of Object.values(c)) x.defVsLeague = x.paPg == null ? null : lg - x.paPg
  return c
}

const OFF = new Set(['QB', 'RB', 'WR', 'TE'])
const DEF = new Set(['DL', 'LB', 'DB'])

// POSITION GROUPS for "how good among his own position": wideouts and tight ends are one group (both catch the ball)
const POS_GROUP = { QB: 'QB', RB: 'RB', WR: 'REC', TE: 'REC', DL: 'DL', LB: 'LB', DB: 'DB' }
/**
 * Adds, to each row's features, the same number as a z-score among the pool's players OF HIS POSITION GROUP (key + 'Pos'):
 * 4,500 passing yards and 1,800 scrimmage yards are both "best at his job". rows: [{ group, f }].
 */
export function positionZ(rows, keys) {
  const by = {}
  for (const r of rows) (by[POS_GROUP[r.group] || r.group] ||= []).push(r)
  for (const list of Object.values(by)) for (const k of keys) {
    const xs = list.map((r) => r.f[k]).filter((x) => x != null && Number.isFinite(x))
    const m = xs.length ? xs.reduce((t, x) => t + x, 0) / xs.length : 0
    const sd = xs.length > 1 ? Math.sqrt(xs.reduce((t, x) => t + (x - m) ** 2, 0) / (xs.length - 1)) || 1 : 1
    for (const r of list) r.f[k + 'Pos'] = r.f[k] == null ? null : (r.f[k] - m) / sd
  }
  return rows
}

/** The raw numbers every race reads, from one season line (per game) + his club. gpFrac: his games over his club's games. */
export function rawFeatures(l, club) {
  return {
    isQB: l.group === 'QB' ? 1 : 0, isRB: l.group === 'RB' ? 1 : 0, isDL: l.group === 'DL' ? 1 : 0, isLB: l.group === 'LB' ? 1 : 0,
    passYds: num(l.passYds), passTd: num(l.passTd),
    scrimYds: num(l.rushYds) + num(l.recYds), scrimTd: num(l.rushTd) + num(l.recTd),
    yds: num(l.passYds) + num(l.rushYds) + num(l.recYds),
    td: num(l.passTd) + num(l.rushTd) + num(l.recTd),
    int: num(l.int),
    epa: num(l.epa),
    sacks: num(l.sacks), qbHits: num(l.qbHits), tfl: num(l.tfl), defInt: num(l.defInt), pd: num(l.pd), ff: num(l.ff), tkl: num(l.tkl),
    teamWin: club?.winPct ?? null,
    teamDef: club?.defVsLeague ?? null,
    gpFrac: l.gpFrac ?? null,
  }
}

// who can get a vote: a big enough season to be judged (per game, so it reads the same in week 6 as in week 18)
const offPool = (minFrac) => (l) => OFF.has(l.group) && (l.gpFrac ?? 0) >= minFrac
  && (l.group === 'QB' ? l.att >= 15 : num(l.rushYds) + num(l.recYds) >= 25)
const defPool = (minFrac) => (l) => DEF.has(l.group) && (l.gpFrac ?? 0) >= minFrac
  && (l.tkl >= 2 || l.sacks >= 0.2 || l.defInt >= 0.1)
const OFF_FEATS = ['isQB', 'isRB', 'ydsPos', 'tdPos', 'int', 'epa', 'teamWin', 'gpFrac']
const DEF_FEATS = ['sacks', 'qbHits', 'tfl', 'defInt', 'pd', 'ff', 'tkl', 'teamDef', 'teamWin', 'gpFrac']
// rookies on defence: ranked inside their position group (chosen by leaving one 2012-19 season out: log loss 3.22 vs 6.66)
const DROY_FEATS = ['sacksPos', 'defIntPos', 'qbHitsPos', 'tflPos', 'ff', 'teamDef', 'gpFrac']
// the numbers positionZ ranks inside each position group
export const POS_KEYS = ['yds', 'td', 'epa', 'sacks', 'tfl', 'defInt', 'pd', 'tkl', 'qbHits']

// THE FIVE AP AWARDS (pfr: the voting table's id on Pro-Football-Reference's awards_<season> page)
export const AWARD_DEFS = {
  mvp: { side: 'off', label: 'MVP', title: 'Most Valuable Player', pfr: 'voting_apmvp', pool: offPool(0.4), feats: OFF_FEATS },
  opoy: { side: 'off', label: 'OPOY', title: 'Offensive Player of the Year', pfr: 'voting_apopoy', pool: offPool(0.4), feats: OFF_FEATS },
  dpoy: { side: 'def', label: 'DPOY', title: 'Defensive Player of the Year', pfr: 'voting_apdpoy', pool: defPool(0.4), feats: DEF_FEATS },
  oroy: { side: 'off', label: 'OROY', title: 'Offensive Rookie of the Year', pfr: 'voting_aporoy', rookies: true, pool: offPool(0.3), feats: OFF_FEATS },
  droy: { side: 'def', label: 'DROY', title: 'Defensive Rookie of the Year', pfr: 'voting_apdroy', rookies: true, pool: defPool(0.3), feats: DROY_FEATS },
}

const BLEND_KEYS = ['att', 'passYds', 'passTd', 'int', 'rushYds', 'rushTd', 'recYds', 'recTd', 'rec', 'epa', 'sacks', 'qbHits', 'tfl', 'defInt', 'pd', 'ff', 'tkl', 'defTd']

/**
 * His line this season shrunk toward last season's by k games (after k games his own season counts half); gpFrac likewise.
 * A rookie has no last season: his line is his own. No games yet: last season's line (basisLast).
 */
export const BLEND_GAMES = 3
export function blendLine(cur, prev, clubGames, k = BLEND_GAMES) {
  const curFrac = cur && clubGames ? Math.min(1, cur.gp / clubGames) : 0
  const prevFrac = prev ? Math.min(1, prev.gp / SEASON_GAMES) : null
  if (!prev) return cur ? { ...cur, gpFrac: curFrac } : null
  if (!cur) return { ...prev, gp: 0, gpFrac: prevFrac, basisLast: true }
  const g = clubGames ? cur.gp : 0
  const a = g + k > 0 ? g / (g + k) : 0
  const out = { ...cur }
  for (const key of BLEND_KEYS) out[key] = a * num(cur[key]) + (1 - a) * num(prev[key])
  out.gpFrac = clubGames ? a * curFrac + (1 - a) * prevFrac : prevFrac
  return out
}

/** The temperature at week `wk` (games a club has played): linear between the weeks it was measured at (TW), Tend at season's end. */
export function temperatureAtWeek(wk, TW, Tend = 1) {
  const pts = Object.entries({ ...TW, [SEASON_GAMES]: Tend }).map(([w, t]) => [Number(w), t]).sort((a, b) => a[0] - b[0])
  if (wk <= pts[0][0]) return pts[0][1]
  for (let i = 1; i < pts.length; i++) if (wk <= pts[i][0]) { const [w0, t0] = pts[i - 1], [w1, t1] = pts[i]; return t0 + ((t1 - t0) * (wk - w0)) / (w1 - w0) }
  return Tend
}

// THE FITTED WEIGHTS (scripts/fit-nfl-awards.mjs, all seasons 2012-2025; features chosen by leaving one 2012-19 season out).
//   w   the weights, in AWARD_DEFS[award].feats order
//   T   season's-end temperature: how far the shares spread on a season the fit has not seen (each season left out of its own fit)
//   k   the blend: games of last season his line leans on (measured at weeks 3 and 6 on 2012-19; offence: none)
//   TW  the temperature measured at week W (each past season's lines through week W against its final vote)
//   held  the HOLD-OUT (fit 2012-19, scored 2020-25, six seasons): [winner No. 1, winner in the top 3] at week W and at the end
export const AWARD_FITS = {
  mvp: { w: [3.1, 1.237, 0.723, 1.212, -1.312, 0.414, 1.653, 1.799], T: 1.1, k: 0, TW: { 0: 3.1, 3: 2.3, 6: 2, 9: 1.8, 12: 1.6 }, held: { end: [1, 5], 0: [0, 3], 3: [1, 2], 6: [0, 2], 9: [1, 3], 12: [2, 5] } },
  opoy: { w: [1.894, 0.607, 3.081, 0.874, -2.587, -1.097, 1.099, 2.922], T: 2.05, k: 0, TW: { 0: 4.45, 3: 2.5, 6: 2.5, 9: 2.4, 12: 2.3 }, held: { end: [5, 6], 0: [0, 1], 3: [2, 3], 6: [1, 5], 9: [2, 5], 12: [4, 6] } },
  dpoy: { w: [1.136, 1.06, 0.178, 0.508, 0.709, 0.637, 0.807, 0.883, 1.023, 1.203], T: 3.65, k: 6, TW: { 0: 5.2, 3: 4.45, 6: 4.9, 9: 4.25, 12: 3.95 }, held: { end: [3, 5], 0: [1, 2], 3: [1, 4], 6: [1, 4], 9: [2, 5], 12: [2, 5] }, weak: true },
  oroy: { w: [1.068, 0.638, 1.926, 1.049, -1.244, 0.571, -0.049, 1.668], T: 1.95, k: 0, TW: { 3: 4.95, 6: 3.8, 9: 2.75, 12: 2.2 }, held: { end: [3, 5], 3: [3, 4], 6: [4, 4], 9: [3, 4], 12: [3, 5] } },
  droy: { w: [-0.835, 1.463, -0.247, 0.882, 0.288, 0.427, 2.514], T: 2.35, k: 0, TW: { 3: 5.6, 6: 4.6, 9: 2.85, 12: 2.8 }, held: { end: [1, 4], 3: [0, 1], 6: [0, 2], 9: [2, 3], 12: [2, 4] } },
}

/** The hold-out record for the week the season is at (the last week measured at or before it), in words. */
export function measuredAt(award, wk) {
  const h = AWARD_FITS[award].held
  const w = Object.keys(h).filter((x) => x !== 'end').map(Number).filter((x) => x <= wk).sort((a, b) => b - a)[0]
  const [n1, n3] = wk >= SEASON_GAMES || w == null ? h.end : h[w]
  const at = wk >= SEASON_GAMES || w == null ? 'at season\'s end' : w === 0 ? 'before week 1' : `at week ${w}`
  const end = wk >= SEASON_GAMES ? '' : ` (season's end: ${h.end[1]} of 6)`
  return `Held out 2020-25, ${at}: winner No. 1 in ${n1} of 6, top 3 in ${n3} of 6${end}.${AWARD_FITS[award].weak ? ' The weakest race: no better than sacks alone.' : ''}`
}
