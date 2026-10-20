// 🏅 MOONSHOT'S AWARD RACES: THE MODEL (2026-10-20, Donovan: "who's gonna win ... MVP ... we need those models being ran").
// Pure: no fetches, so the fit script (scripts/fit-mlb-awards.mjs) and the site read the same math. BUCKETS' recipe
// (lib/nba/awardModel.js) on baseball: one race = one league's pool in one season, a share per player from a softmax of his
// numbers z-scored within that pool (lib/awardCore.js), weights fitted on real BBWAA voting (Baseball-Reference award pages:
// points won / all points, every vote-getter; everyone else in the pool 0), AL and NL 2012-2025, every input from the MLB
// Stats API season lines and standings -- the same reads the site makes live.
//
// WHAT A SHARE IS. "The share of the vote these lines carry if the ballots were cast on them", fitted so the winner gets as
// much of it as he really did. A model's read, never a book's price. No WAR and no fielding: the Stats API has neither, so a
// glove-first season is under-read (the page's method line says the model sees the box score).

import { softmax, zScore } from '../awardCore'

export const AWARDS_MODEL_VERSION = 'mlb-awards-v1'
export const SEASON_GAMES = 162
export const LEAGUE = { 103: 'AL', 104: 'NL' }

const num = (v) => { const x = Number(v); return Number.isFinite(x) ? x : null }
/** "201.1" innings -> 201.333 */
export const innings = (v) => { const s = String(v ?? ''); const [a, b] = s.split('.'); const w = Number(a); return Number.isFinite(w) ? w + (Number(b) || 0) / 3 : null }

/**
 * One season's lines from the Stats API's two season reads (stats?stats=season&group=hitting|pitching&playerPool=ALL),
 * merged by player (a two-way player is one man). A player traded during the season is one row with his last club.
 * -> Map id -> { id, name, teamId, league, pos, pa, ops, hr, sb, ip, er, so, bb, hbp, hrA, w, sv }
 */
export function parseLines(hitting, pitching) {
  const out = new Map()
  const at = (s) => {
    const id = String(s.player?.id)
    if (!out.has(id)) out.set(id, { id, name: s.player?.fullName, teamId: s.team?.id ?? null, league: LEAGUE[s.league?.id] || null, pos: null })
    return out.get(id)
  }
  for (const s of hitting?.stats?.[0]?.splits || []) {
    const r = at(s), t = s.stat || {}
    Object.assign(r, { pos: s.position?.abbreviation || null, pa: num(t.plateAppearances) || 0, ops: num(t.ops), hr: num(t.homeRuns) || 0, sb: num(t.stolenBases) || 0, games: num(t.gamesPlayed) || 0 })
  }
  for (const s of pitching?.stats?.[0]?.splits || []) {
    const r = at(s), t = s.stat || {}
    Object.assign(r, { ip: innings(t.inningsPitched) || 0, er: num(t.earnedRuns) || 0, so: num(t.strikeOuts) || 0, bb: num(t.baseOnBalls) || 0, hbp: num(t.hitByPitch) || 0, hrA: num(t.homeRuns) || 0, w: num(t.wins) || 0, sv: num(t.saves) || 0, gs: num(t.gamesStarted) || 0 })
  }
  for (const r of out.values()) { r.pa ??= 0; r.ip ??= 0; r.hr ??= 0; r.sb ??= 0 }
  return out
}

/** The league's own run environment that season: OPS per PA, ERA, and FIP's constant (so FIP reads on ERA's scale). */
export function leagueConsts(lines) {
  let pa = 0, opsPa = 0, ip = 0, er = 0, fipRaw = 0
  for (const r of lines.values()) {
    if (r.pa > 0 && r.ops != null) { pa += r.pa; opsPa += r.ops * r.pa }
    if (r.ip > 0) { ip += r.ip; er += r.er; fipRaw += 13 * r.hrA + 3 * (r.bb + r.hbp) - 2 * r.so }
  }
  const era = ip ? (9 * er) / ip : null
  return { ops: pa ? opsPa / pa : null, era, fipC: ip ? era - fipRaw / ip : null }
}

/** The raw numbers every race reads. club = { winPct }. */
export function rawFeatures(r, lg, club) {
  const fip = r.ip > 0 ? (13 * r.hrA + 3 * (r.bb + r.hbp) - 2 * r.so) / r.ip + lg.fipC : null
  return {
    // runs of OPS above the league's, over his plate appearances (a box-score stand-in for batting runs)
    batRuns: r.pa > 0 && r.ops != null && lg.ops != null ? r.pa * (r.ops - lg.ops) : 0,
    hr: r.hr || 0, sb: r.sb || 0,
    // a premium position: catcher, shortstop, second base, centre field (no fielding numbers, so the position stands in)
    mid: ['C', 'SS', '2B', 'CF'].includes(r.pos) && r.pa > 0 ? 1 : 0,
    // runs saved against the league's ERA, and against it by FIP (strikeouts, walks, homers: what the pitcher owns)
    pitchRuns: r.ip > 0 && lg.era != null ? (r.ip * (lg.era - (9 * r.er) / r.ip)) / 9 : 0,
    fipRuns: fip != null ? (r.ip * (lg.era - fip)) / 9 : 0,
    so: r.so || 0, w: r.w || 0, sv: r.sv || 0, ip: r.ip || 0,
    teamWin: club?.winPct ?? null,
    // a pitcher (not a two-way man): lets the fit set how far a pitcher starts behind a hitter, since his batting numbers are 0
    pitcher: r.ip > 0 && r.pa < 100 ? 1 : 0,
  }
}

// THE THREE BBWAA AWARDS, each league its own race. pool(r, f): who can get a vote, f = the share of a full season played
// (thresholds scale with it: 2020 was 60 games, and early in a season the lines are short). feats: the fitted inputs in
// order; the FIRST is the one-number baseline the fit script scores against.
export const AWARD_DEFS = {
  mvp: {
    label: 'MVP', title: 'Most Valuable Player', br: 'MVP',
    pool: (r, f) => r.pa >= 300 * f || r.ip >= 120 * f,
    feats: ['batRuns', 'pitchRuns', 'teamWin', 'pitcher'],
  },
  cy: {
    label: 'Cy Young', title: 'Cy Young', br: 'CYA',
    pool: (r, f) => r.ip >= 40 * f,
    feats: ['pitchRuns', 'fipRuns', 'so', 'w', 'ip', 'sv', 'teamWin'],
  },
  roy: {
    label: 'ROY', title: 'Rookie of the Year', br: 'ROY', rookies: true,
    pool: (r, f) => r.pa >= 100 * f || r.ip >= 30 * f,
    feats: ['roleVal', 'pitcher'],
  },
}

/**
 * STANDOUT WITHIN HIS ROLE (f.roleVal): a hitter's batting runs z-scored among the pool's hitters, a pitcher's pitching runs
 * among its pitchers (a two-way man takes the better). Without it a hitter's and a pitcher's numbers sit on different scales
 * with zeros for the other role, and the fit swung from all-hitters to all-pitchers with the years it saw (ROY).
 * Mutates and returns rows (each with .f).
 */
export function addRoleVal(rows) {
  const zOf = (list, k) => {
    const xs = list.map((r) => r.f[k]); const m = xs.reduce((t, x) => t + x, 0) / (xs.length || 1)
    const sd = Math.sqrt(xs.reduce((t, x) => t + (x - m) ** 2, 0) / Math.max(1, xs.length - 1)) || 1
    return (x) => (x - m) / sd
  }
  const P = (r) => r.f.pitcher || r.f.ip >= 20   // a position player's mop-up inning is not a pitching line
  const hit = rows.filter((r) => !r.f.pitcher), pit = rows.filter(P)
  const zh = zOf(hit, 'batRuns'), zp = zOf(pit, 'pitchRuns')
  for (const r of rows) r.f.roleVal = Math.max(r.f.pitcher ? -Infinity : zh(r.f.batRuns), P(r) ? zp(r.f.pitchRuns) : -Infinity)
  return rows
}

/** Shares for one race: rows [{ ..., f }] -> the same rows with `share`, summing to 1. */
export function shareRace(rows, key, T = 1) {
  const fit = AWARD_FITS[key]
  const z = zScore(addRoleVal(rows), AWARD_DEFS[key].feats)
  const p = softmax(z, fit.w, T)
  return rows.map((r, i) => ({ ...r, share: p[i] }))
}

/**
 * EARLY SEASON = MOSTLY LAST SEASON. Counting lines on a full-season pace, shrunk toward last season's full line by `k` club
 * games (k = 30 on opening day, fading to 0 by the last day: after ~25 games his own pace counts half, and the final read is
 * his own line, the one the fit was made on). A rookie has no last season: his line is his own pace.
 * Rates (OPS, ERA) blend by the same weight, so a hot April is a nudge, not a takeover.
 */
export const BLEND_GAMES = 30
export function blendLine(cur, prev, clubGames, k = BLEND_GAMES) {
  const pace = clubGames > 0 ? SEASON_GAMES / clubGames : 0
  if (!prev) return cur && pace ? scale(cur, pace) : null
  // no games this season = a pace of nothing, so a man hurt all year fades out as his club's games pile up
  const a = clubGames + k > 0 ? clubGames / (clubGames + k) : 0
  const c = cur ? scale(cur, pace) : null
  const out = { ...prev, ...cur }
  for (const key of ['pa', 'hr', 'sb', 'ip', 'er', 'so', 'bb', 'hbp', 'hrA', 'w', 'sv']) out[key] = a * (c?.[key] || 0) + (1 - a) * (prev[key] || 0)
  out.ops = cur?.ops == null ? prev.ops : prev.ops == null ? cur.ops : a * cur.ops + (1 - a) * prev.ops
  return out
}
function scale(r, m) {
  const o = { ...r }
  for (const key of ['pa', 'hr', 'sb', 'ip', 'er', 'so', 'bb', 'hbp', 'hrA', 'w', 'sv']) o[key] = (r[key] || 0) * m
  return o
}

/**
 * Clubs for a read: win share this season shrunk toward last season's by BLEND_GAMES, the shrink fading to nothing as the
 * season ends (frac 1 = the final table, the lines the fit was made on). cur/prev: Map teamId -> { games, winPct, ... }.
 */
export function blendClubs(cur, prev, frac) {
  const k = BLEND_GAMES * (1 - Math.min(1, frac))
  const out = new Map()
  for (const id of new Set([...cur.keys(), ...prev.keys()])) {
    const c = cur.get(id), p = prev.get(id)
    const g = c?.games || 0, a = g + k > 0 ? g / (g + k) : 1
    out.set(id, { ...p, ...c, games: g, winPct: p && c ? a * c.winPct + (1 - a) * p.winPct : (c?.winPct ?? p?.winPct ?? null) })
  }
  return out
}

/**
 * Everyone a race can read: this season's line on a 162-game pace, shrunk toward last season's (a rookie's is his own).
 * teamOf(id, curLine, prevLine) -> his club's id now. clubs: blendClubs(). Each person carries .club and .league.
 */
export function racePeople({ cur, prev, rookies, clubs, teamOf, frac }) {
  const k = BLEND_GAMES * (1 - Math.min(1, frac))
  const people = []
  for (const id of new Set([...cur.keys(), ...prev.keys()])) {
    const c = cur.get(id) || null, p = prev.get(id) || null
    const teamId = teamOf(id, c, p)
    const club = clubs.get(teamId)
    if (!club?.league) continue
    const rookie = rookies.has(id)
    const line = rookie ? blendLine(c, null, club.games) : blendLine(c, p, club.games, k)
    if (!line) continue
    people.push({ ...line, id, name: c?.name || p?.name, teamId, team: club.abbr, league: club.league, rookie, club })
  }
  return people
}

// THE FITTED WEIGHTS (scripts/fit-mlb-awards.mjs: weights from all of 2012-2025, AL and NL; hold-out numbers in its output and
// the commit). IN-SEASON: the same weights on the blended lines, spread by a temperature fitted at two checkpoints (through
// 30 April, ~26 games a club; through 30 June, ~81), straight lines between them and down to 1 at the season's end.
// openAt: the median club games before the race is drawn, the checkpoint where its held-out read first beat an even split
// over the pool (last season's lines alone did not, for any of the three: MVP picked 2 of 12, Cy Young 1 of 12).
export const AWARD_FITS = {
  mvp: {
    w: [2.014, 0.757, 0.507, -1.528], openAt: 25, Ts: [[0.161, 2.45], [0.499, 2.15], [1, 1]],
    measured: { end: 'Held out 2020-25 on final lines: winner No. 1 in 11 of 12, top 3 in 12 of 12.', mid: 'Held out 2021-25 at the halfway mark: winner No. 1 in 7 of 10; through April, 3 of 10.' },
  },
  cy: {
    w: [1.219, 0.381, 0.528, 0.536, 0.783, 0.495, -0.025], openAt: 25, Ts: [[0.161, 1.8], [0.499, 1.55], [1, 1]],
    measured: { end: 'Held out 2020-25 on final lines: winner No. 1 in 8 of 12, top 3 in 11 of 12.', mid: 'Held out 2021-25 at the halfway mark: winner No. 1 in 3 of 10, top 3 in 6 of 10.' },
  },
  roy: {
    w: [1.63, -0.283], openAt: 80, Ts: [[0.499, 1.15], [1, 1]],
    measured: { end: 'Held out 2020-25 on final lines: winner No. 1 in 6 of 12, top 3 in 10 of 12.', mid: 'Held out 2021-25 at the halfway mark: winner No. 1 in 2 of 10, top 3 in 4 of 10.' },
  },
}

/** The temperature for a race at `frac` of the season: the fitted checkpoints, straight lines between (flat before the first). */
export function temperatureFor(key, frac) {
  const Ts = AWARD_FITS[key].Ts
  if (frac <= Ts[0][0]) return Ts[0][1]
  for (let i = 1; i < Ts.length; i++) {
    const [f0, t0] = Ts[i - 1], [f1, t1] = Ts[i]
    if (frac <= f1) return t0 + ((t1 - t0) * (frac - f0)) / (f1 - f0)
  }
  return 1
}
