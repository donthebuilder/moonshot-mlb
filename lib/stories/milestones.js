// 🏁 MILESTONE COUNTDOWNS FOR TUDDY, LAMP AND BUCKETS (2026-10-20). Pure, server-safe.
// MOONSHOT's milestone story (lib/stories/mlb.js S_MILES / C_MILES) on the other
// three products, so the Storylines page's Milestone filter, its search and its
// graded record ("reached it") work on every sport, not just MLB.
//
// One rung list per sport: { key, targets, within, word, bar }
//   key      the field on the player's totals entering tonight
//   targets  the round numbers
//   within   how close counts as "in reach" -- one good night, roughly
//   word     what the sentence calls it
//   bar      the field on the graded line (lib/stories/grade.js) that says he
//            got there that night; null = the line doesn't carry it, so the
//            story grades PRODUCTIVE. NFL PASS_TD rides the results lines from bot
//            PR #25; a week graded before that has no PASS_TD, and grade.js falls
//            back to PRODUCTIVE for it rather than a miss
// One story per player: his nearest rung (need / within smallest), as MLB.
// RARITY: 0.45 + 0.35 x (1 - need / within), MLB's formula. A games-played rung
// (within 1: it lands tonight if he plays) is 0.80.
import { story, parts, name, num } from './shape'

const every = (from, to, step) => Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, i) => from + i * step)

export const MILES = {
  // TUDDY: career = hist_nfl (nflverse, 1999 on -- every active career starts after it) + this season;
  // season = this season (lib/history/nfl.js seasonTotals). Lines: RUSH_YDS, REC_YDS, REC, PASS_YDS, TD (rush + rec), PASS_TD.
  nfl: [
    { key: 'rush_yds', scope: 'season', targets: [1000, 1500, 2000], within: 100, word: 'rushing yards this season', bar: 'RUSH_YDS' },
    { key: 'rec_yds', scope: 'season', targets: [1000, 1500], within: 100, word: 'receiving yards this season', bar: 'REC_YDS' },
    { key: 'pass_yds', scope: 'season', targets: [3000, 4000, 5000], within: 300, word: 'passing yards this season', bar: 'PASS_YDS' },
    { key: 'pass_td', scope: 'season', targets: [20, 30, 40], within: 3, word: 'passing TDs this season', bar: 'PASS_TD' },
    { key: 'rush_yds', scope: 'career', targets: every(3000, 20000, 1000), within: 100, word: 'career rushing yards', bar: 'RUSH_YDS' },
    { key: 'rec_yds', scope: 'career', targets: every(3000, 20000, 1000), within: 100, word: 'career receiving yards', bar: 'REC_YDS' },
    { key: 'rec', scope: 'career', targets: every(300, 1500, 100), within: 8, word: 'career catches', bar: 'REC' },
    { key: 'total_td', scope: 'career', targets: every(25, 200, 25), within: 2, word: 'career scrimmage TDs', bar: 'TD' },
    { key: 'pass_yds', scope: 'career', targets: every(10000, 80000, 5000), within: 300, word: 'career passing yards', bar: 'PASS_YDS' },
    { key: 'pass_td', scope: 'career', targets: every(100, 650, 50), within: 3, word: 'career passing TDs', bar: 'PASS_TD' },
  ],
  // LAMP: career = the NHL stats API's own career aggregate (regular season); season = this season.
  // Lines: g, a, pts, gp (the box score).
  nhl: [
    { key: 'goals', scope: 'season', targets: [20, 30, 40, 50, 60], within: 2, word: 'goals this season', bar: 'g' },
    { key: 'points', scope: 'season', targets: [50, 75, 100], within: 3, word: 'points this season', bar: 'pts' },
    { key: 'goals', scope: 'career', targets: every(100, 1000, 100), within: 2, word: 'career goals', bar: 'g' },
    { key: 'assists', scope: 'career', targets: every(200, 2000, 100), within: 2, word: 'career assists', bar: 'a' },
    { key: 'points', scope: 'career', targets: every(300, 3000, 100), within: 3, word: 'career points', bar: 'pts' },
    { key: 'gamesPlayed', scope: 'career', targets: [500, 1000, 1500], within: 1, word: 'career games', bar: 'gp', games: true },
  ],
  // BUCKETS: career = ESPN's career totals (regular season). Lines: pts, reb, ast, tpm, gp.
  nba: [
    { key: 'pts', scope: 'career', targets: every(5000, 45000, 1000), within: 30, word: 'career points', bar: 'pts' },
    { key: 'reb', scope: 'career', targets: every(3000, 25000, 1000), within: 12, word: 'career rebounds', bar: 'reb' },
    { key: 'ast', scope: 'career', targets: every(2000, 16000, 1000), within: 10, word: 'career assists', bar: 'ast' },
    { key: 'tpm', scope: 'career', targets: every(500, 4500, 100), within: 4, word: 'career threes', bar: 'tpm' },
    { key: 'gp', scope: 'career', targets: [500, 1000, 1500], within: 1, word: 'career games', bar: 'gp', games: true },
  ],
}

const fmt = (v) => Number(v).toLocaleString('en-US')

/**
 * Each player's nearest rung.
 * @param people  [{ p, season: {key: n}, career: {key: n} }] -- p is the story base's player
 * @returns [{ p, need, t, m, prox }] nearest first, one per player
 */
export function nearestMilestones(sport, people) {
  const miles = []
  for (const person of people || []) {
    for (const m of MILES[sport] || []) {
      const v = Number(person?.[m.scope]?.[m.key])
      if (!Number.isFinite(v)) continue
      for (const t of m.targets) { const need = t - v; if (need > 0 && need <= m.within) miles.push({ p: person.p, need, t, m, prox: m.games ? 0 : need / m.within }) }
    }
  }
  miles.sort((a, b) => a.prox - b.prox || b.t - a.t)
  const seen = new Set(); const out = []
  for (const x of miles) {
    const id = String(x.p?.id ?? x.p?.player_id ?? x.p?.playerId ?? '')
    if (!id || seen.has(id)) continue
    seen.add(id); out.push(x)
  }
  return out
}

/** One nearest-rung entry -> a story. `base` is the engine's own base (sport, day, game, player). */
// `when`: 'tonight' (one night's slate) or 'this week' (TUDDY's week)
export function milestoneStory(base, x, source, when = 'tonight') {
  const { m, need, t } = x
  const ps = m.games
    ? parts(name(base.name), ' plays game ', num(fmt(t)), ` of his career ${when} — if he's in the lineup`)
    : parts(name(base.name), ' is ', num(fmt(need)), ' away from ', num(fmt(t)), ` ${m.word}`, need === 1 ? ` — could land ${when}` : '')
  return story({ ...base, type: 'milestone', icon: '🏁', rarity: m.games ? 0.8 : 0.45 + 0.35 * (1 - x.prox), source, parts: ps,
    numbers: { need, target: t, word: m.word, key: m.key, scope: m.scope, bar: m.bar } })
}

// ── THE HIT RATE BEHIND A COUNTDOWN (2026-10-20, Donovan: "milestone tap opens the player's hit rate to whatever it's
// showing, or like last 5"). "1 away from 500 points" taps open to: how often he has put up 1+ points a game. Each
// engine hands over his game-by-game values of the rung's own stat; this counts the games that reached the need.
//   rate = { need, word, last: [{ d, opp, v, hit }] (newest first, 5), l5: [hit, n], l10: [hit, n], szn: [hit, n] | null }
// Games-played rungs carry no rate (any game "reaches" it). A value the source doesn't have is dropped, never 0.
const NO_RATE = new Set(['gamesPlayed', 'gp'])
export function hitRate(need, recent = [], season = null) {
  const ok = (g) => Number.isFinite(Number(g?.v))
  const r = (recent || []).filter(ok)
  if (!r.length || !(need > 0)) return null
  const count = (list) => [list.filter((g) => Number(g.v) >= need).length, list.length]
  const s = season ? season.filter(ok) : null
  return {
    need, last: r.slice(0, 5).map((g) => ({ d: g.d || null, opp: g.opp || null, v: Number(g.v), hit: Number(g.v) >= need })),
    l5: count(r.slice(0, 5)), l10: r.length >= 6 ? count(r.slice(0, 10)) : null, szn: s && s.length ? count(s) : null,
  }
}

async function pool(items, n, fn) {
  const out = new Array(items.length); let i = 0
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]).catch(() => null) } }))
  return out
}

/**
 * Give every milestone story its hit rate, in place. `logFor(story)` answers his games for the story's stat:
 * { recent: [{ d, opp, v }] newest first (up to 10, may cross seasons), season: [{ v }] this season } or null.
 */
export async function attachMilestoneRates(stories, logFor) {
  const ms = (stories || []).filter((s) => s.type === 'milestone' && s.numbers?.key && !NO_RATE.has(s.numbers.key) && s.player_id)
  await pool(ms, 6, async (s) => {
    const g = await logFor(s)
    const rate = g ? hitRate(Number(s.numbers.need), g.recent, g.season) : null
    if (rate) s.numbers.rate = rate
  })
  return stories
}
