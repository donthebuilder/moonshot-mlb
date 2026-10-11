// ⚾ THE CLUB'S SPLITS, PURE (2026-10-10, Donovan: "team splits just like how ESPN has them"). No fetch, no clock.
// Two public feeds, each normalised to the same line so a table does not care which one answered:
//   ESPN     site.api.espn.com .../baseball/mlb/teams/<id>/statistics?seasontype=2  -> results.splits[] (batting + pitching)
//   MLB      statsapi.mlb.com .../teams/<id>/stats?stats=statSplits&sitCodes=...     -> stats[0].splits[] (hitting / pitching)
//   LOG      the club's own schedule results (home, ballpark, rest) -- built in lib/mlb/teamRead.js, not here
// A split that no feed carries is NOT in the result (the view names it as missing); nothing is filled in or estimated.
import { wilson } from '../interval'

const num = (v) => (v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null)
/** "123.1" innings -> outs (the league writes thirds as .1 / .2). */
export const outsOf = (ip) => { if (ip == null) return null; const [w, f = '0'] = String(ip).split('.'); const o = Number(w) * 3 + Number(f); return Number.isFinite(o) ? o : null }
export const ipOf = (outs) => (outs == null ? null : `${Math.floor(outs / 3)}.${outs % 3}`)

// ── ESPN ────────────────────────────────────────────────────────────────────
const firstBy = (cat, abbr) => num(cat?.stats?.find((s) => s.abbreviation === abbr)?.value)
function espnLine(cats) {
  const b = (cats || []).find((c) => c.name === 'batting'); const p = (cats || []).find((c) => c.name === 'pitching')
  return {
    bat: b ? { g: firstBy(b, 'G'), pa: firstBy(b, 'PA'), ab: firstBy(b, 'AB'), h: firstBy(b, 'H'), r: firstBy(b, 'R'), hr: firstBy(b, 'HR'), rbi: firstBy(b, 'RBI'), bb: firstBy(b, 'BB'), so: firstBy(b, 'SO'), sb: firstBy(b, 'SB'), avg: firstBy(b, 'AVG'), obp: firstBy(b, 'OBP'), slg: firstBy(b, 'SLG'), ops: firstBy(b, 'OPS') } : null,
    pit: p ? { g: firstBy(p, 'G'), ip: p.stats.find((s) => s.abbreviation === 'IP')?.displayValue ?? null, h: firstBy(p, 'H'), r: firstBy(p, 'R'), er: firstBy(p, 'ER'), hr: firstBy(p, 'HR'), bb: firstBy(p, 'BB'), k: firstBy(p, 'K'), era: firstBy(p, 'ERA'), whip: firstBy(p, 'WHIP'), oba: firstBy(p, 'OBA'), ab: firstBy(p, 'AB') } : null,
  }
}
/** ESPN statistics JSON -> { total, rows: { [split name]: line } }. */
export function espnRows(json) {
  const out = { total: json?.results?.stats ? espnLine(json.results.stats.categories) : null, rows: {} }
  for (const s of json?.results?.splits || []) out.rows[s.name] = espnLine(s.categories)
  return out
}

// ── MLB StatsAPI ────────────────────────────────────────────────────────────
function batLine(s) {
  return { g: num(s.gamesPlayed), pa: num(s.plateAppearances), ab: num(s.atBats), h: num(s.hits), r: num(s.runs), hr: num(s.homeRuns), rbi: num(s.rbi), bb: num(s.baseOnBalls), so: num(s.strikeOuts), sb: num(s.stolenBases), avg: num(s.avg), obp: num(s.obp), slg: num(s.slg), ops: num(s.ops),
    hbp: num(s.hitByPitch) ?? 0, sf: num(s.sacFlies) ?? 0, tb: num(s.totalBases) }
}
function pitLine(s) {
  return { g: num(s.gamesPlayed), ip: s.inningsPitched ?? null, h: num(s.hits), r: num(s.runs), er: num(s.earnedRuns), hr: num(s.homeRuns), bb: num(s.baseOnBalls), k: num(s.strikeOuts), era: num(s.era), whip: num(s.whip), oba: num(s.avg), ab: num(s.atBats) }
}
/** One group's statSplits JSON -> { [sit code]: line } (hitting -> bat, pitching -> pit). */
export function mlbRows(json, group) {
  const out = {}
  for (const sp of json?.stats?.[0]?.splits || []) {
    const code = sp.split?.code
    if (!code || !sp.stat) continue
    out[code] = group === 'hitting' ? batLine(sp.stat) : pitLine(sp.stat)
  }
  return out
}

// ── sums (inning groups) ────────────────────────────────────────────────────
const fixed = (v, d = 3) => (Number.isFinite(v) ? Number(v.toFixed(d)) : null)
/** Add batting lines (the counting stats), recompute the rates from the sums. G is not summed (a game spans innings): null. */
export function sumBat(lines) {
  const L = lines.filter(Boolean)
  if (!L.length || L.some((l) => l.ab == null)) return null
  const s = (k) => L.reduce((a, l) => a + (l[k] ?? 0), 0)
  const ab = s('ab'); const h = s('h'); const bb = s('bb'); const hbp = s('hbp'); const sf = s('sf'); const tb = s('tb')
  const obp = ab + bb + hbp + sf > 0 ? (h + bb + hbp) / (ab + bb + hbp + sf) : null; const slg = ab > 0 && L.every((l) => l.tb != null) ? tb / ab : null
  return { g: null, pa: s('pa'), ab, h, r: s('r'), hr: s('hr'), rbi: s('rbi'), bb, so: s('so'), sb: s('sb'), avg: ab > 0 ? fixed(h / ab) : null, obp: fixed(obp), slg: fixed(slg), ops: obp != null && slg != null ? fixed(fixed(obp) + fixed(slg)) : null, hbp, sf, tb }
}
export function sumPit(lines) {
  const L = lines.filter(Boolean)
  if (!L.length || L.some((l) => l.ip == null)) return null
  const s = (k) => L.reduce((a, l) => a + (l[k] ?? 0), 0)
  const outs = L.reduce((a, l) => a + outsOf(l.ip), 0); const ip = outs / 3
  const ab = s('ab'); const h = s('h'); const bb = s('bb')
  return { g: null, ip: ipOf(outs), h, r: s('r'), er: s('er'), hr: s('hr'), bb, k: s('k'), era: ip > 0 ? fixed((9 * s('er')) / ip, 2) : null, whip: ip > 0 ? fixed((bb + h) / ip, 2) : null, oba: ab > 0 ? fixed(h / ab) : null, ab }
}

// ── the Wilson range on a rate ──────────────────────────────────────────────
/** 95% range of AVG (batting: h / ab) or OBA (pitching: h / ab faced), as ".221–.257"; null with no at-bats. */
export function rangeText(h, ab) {
  const w = h != null && ab > 0 ? wilson(h, ab) : null
  const f = (p) => (p / 100).toFixed(3).replace(/^0/, '')
  return w ? `${f(w[0])}–${f(w[1])}` : null
}

// ── the record splits out of the standings row ──────────────────────────────
/** records.splitRecords / divisionRecords / leagueRecords -> [{ key, label, w, l }] in print order. */
export function recordSplits(rec) {
  const sp = Object.fromEntries((rec?.splitRecords || []).map((r) => [r.type, r]))
  const row = (key, label, r) => (r ? { key, label, w: r.wins, l: r.losses } : null)
  const out = [
    row('home', 'Home', sp.home), row('away', 'Away', sp.away),
    row('vsL', 'vs left-handed pitchers', sp.left), row('vsR', 'vs right-handed pitchers', sp.right),
    row('day', 'Day games', sp.day), row('night', 'Night games', sp.night),
    row('grass', 'On grass', sp.grass), row('turf', 'On turf', sp.turf),
    row('oneRun', 'One-run games', sp.oneRun), row('extra', 'Extra innings', sp.extraInning), row('l10', 'Last 10', sp.lastTen),
  ]
  for (const d of rec?.divisionRecords || []) out.push(row(`div-${d.division?.id}`, `vs ${String(d.division?.name || '').replace('American League', 'AL').replace('National League', 'NL')}`, d))
  for (const l of rec?.leagueRecords || []) out.push(row(`lg-${l.league?.id}`, `vs ${l.league?.name === 'American League' ? 'AL' : l.league?.name === 'National League' ? 'NL' : l.league?.name}`, l))
  return out.filter(Boolean)
}
