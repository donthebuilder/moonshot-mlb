// LAMP'S ATTACK SHEET (2026-10-20, Donovan: "how to attack for all sports"; TUDDY's lib/nfl/attackSheet.js is the model).
// How the other club defends, one trait a row with its rank of 32 (1 = the most of that number), each answered by the
// skater on this club who beats it and the number that says so. Client-safe and pure. The club numbers are the team
// page's (/api/lamp/teamdeep `lines`, lib/nhl/teamDeepCore.js statRows: rank 1 = the best club there, flipped here where
// less is better); the skaters are tonight's board rows (lib/nhl/boardRead.js: legs, szn, ppg = power-play goals).
//   shots against   saPg    -> the most shots a game
//   goals against   gaPg    -> the most goals this season
//   chances against xgaPg   -> the best shooting % (20+ shots)
//   penalty kill    pkPct   -> the most power-play goals
//   shorthanded     shPg    -> the most power-play goals (only when they take a lot of penalties)

const fin = (v) => typeof v === 'number' && Number.isFinite(v)
const tierOf = (r, of = 32) => (r == null ? 1 : r <= 8 ? 0 : r > of - 8 ? 2 : 1)
const best = (rows, get, ok = () => true) => rows.map((p) => ({ p, v: get(p) })).filter((x) => fin(x.v) && x.v > 0 && ok(x.p)).sort((a, b) => b.v - a.v)[0] || null

/** deepLines: the defending club's teamdeep `lines`; skaters: board rows; off: the attacking club. */
export function nhlAttackRows(deepLines, skaters, off) {
  const mine = (skaters || []).filter((p) => p?.team === off)
  if (!mine.length || !Array.isArray(deepLines)) return []
  const line = (k) => deepLines.find((l) => l.key === k && fin(l.value) && l.rank?.rank)
  const most = (l) => (l.higherBetter ? l.rank.rank : l.rank.of + 1 - l.rank.rank)
  const out = []
  const add = (k, l, words, val, b, why) => {
    if (!l || !b) return
    const rank = most(l), of = l.rank.of, tier = tierOf(rank, of)
    out.push({ k, word: words[tier], val, rank, of, tier, player: b.p, name: b.p.name, why: why(b) })
  }
  const sa = line('saPg')
  add('shots', sa, ['GIVES UP SHOTS', 'AVERAGE SHOTS AGAINST', 'FEW SHOTS AGAINST'], sa && `${sa.value.toFixed(1)} shots against`,
    best(mine, (p) => p.legs?.shotsPg), (b) => `${b.v.toFixed(1)} shots a game`)
  const ga = line('gaPg')
  add('goals', ga, ['LEAKS GOALS', 'AVERAGE GOALS AGAINST', 'STINGY'], ga && `${ga.value.toFixed(2)} goals against`,
    best(mine, (p) => p.szn?.g), (b) => `${b.v} goals in ${b.p.szn.gp} games`)
  const xa = line('xgaPg')
  add('chances', xa, ['GIVES UP CHANCES', 'SOME CHANCES', 'FEW CHANCES'], xa && `${xa.value.toFixed(2)} xG against`,
    best(mine, (p) => p.szn?.shPct, (p) => Number(p.szn?.s) >= 20), (b) => `shoots ${b.v}% (${b.p.szn.g} on ${b.p.szn.s})`)
  const pk = line('pkPct')
  const pp = best(mine, (p) => p.ppg)
  if (pk) {
    const pkv = pk.value <= 1 ? pk.value * 100 : pk.value
    add('pk', pk, ['STRONG PENALTY KILL', 'AVERAGE PENALTY KILL', 'WEAK PENALTY KILL'], `${pkv.toFixed(1)}% killed`, pp, (b) => `${b.v} power-play ${b.v === 1 ? 'goal' : 'goals'}`)
  }
  const sh = line('shPg')
  if (sh && tierOf(most(sh), sh.rank.of) === 0) add('pim', sh, ['TAKES PENALTIES', 'TAKES PENALTIES', 'TAKES PENALTIES'], `${sh.value.toFixed(2)} times shorthanded`, pp, (b) => `${b.v} power-play ${b.v === 1 ? 'goal' : 'goals'}`)
  return out.sort((a, b) => Math.abs(b.rank - (b.of + 1) / 2) - Math.abs(a.rank - (a.of + 1) / 2))
}
