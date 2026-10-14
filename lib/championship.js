// CHAMPIONSHIP ODDS: THE READER CONTRACT (2026-10-14, bot task BOT-TASK-CHAMPIONSHIP-ODDS). Pure: no fetch, no React.
//
// The bot (bots/championship/{nfl,nhl,nba}.py in MLB-HR-DASHBOARD-STREAMLIT) publishes one file per sport on the data branch:
//   current/nfl_playoff_odds.json   Super Bowl
//   current/nhl_playoff_odds.json   Stanley Cup
//   current/nba_playoff_odds.json   NBA title (BUCKETS, hidden)
// in the shape MLB's current/playoff_odds.json set, shares 0-1 never percents. This file decides whether a file is READABLE.
// Anything that breaks a rule is "no file": the Home draws nothing (no fold, no placeholder, no number). It never guesses.
//
// The same rules are mirrored in the bot's own validator (bots/championship/common.py validate), so a file the bot
// publishes is a file this accepts. MLB keeps its own reader (components/PennantRace.js) and is not touched.
export const ROUND_KEYS = ['win_round1', 'win_round2', 'win_round3', 'win_round4']
const SHARE_KEYS = ['make_playoffs', 'win_division', 'top_seed', ...ROUND_KEYS, 'win_champion', 'play_in']

/**
 * Per sport: where the file is, what the fold is called, and which columns it shows. A column whose field is missing on
 * every team prints a dash, so a sport without a field (NBA has no divisions) simply leaves the column out.
 * `from` names the field, `label` the header. Round fields are the chance to WIN that round, so "reach round 2" is win_round1.
 */
export const CHAMPIONSHIP = Object.freeze({
  nfl: {
    file: 'current/nfl_playoff_odds.json', teamSport: 'nfl', field: 14, teams: 32,
    title: '🏆 Super Bowl odds', meta: 'playoff field and a Super Bowl pick, simulated', foldId: 'tuddy-sb-odds',
    final: 'Super Bowl', record: (t) => `${t.wins}-${t.losses}${t.ties > 0 ? `-${t.ties}` : ''}`,
    cols: [['win_division', 'Division'], ['top_seed', 'Top seed'], ['win_round3', 'Reach SB']],
    note: 'A single-game bracket is the most random in the four sports: the best team usually does not win it.',
  },
  nhl: {
    file: 'current/nhl_playoff_odds.json', teamSport: 'nhl', field: 16, teams: 32,
    title: '🏆 Stanley Cup odds', meta: 'playoff field and a Stanley Cup pick, simulated', foldId: 'lamp-cup-odds',
    final: 'Stanley Cup', record: (t) => `${t.wins}-${t.losses}${Number.isFinite(Number(t.otl)) ? `-${t.otl}` : ''}`,
    cols: [['win_division', 'Division'], ['win_round1', 'Rd 2'], ['win_round2', 'Rd 3'], ['win_round3', 'Final']],
    note: 'Hockey is close to a coin flip game by game: a 10-15% favourite is what a real Cup race looks like.',
  },
  nba: {
    file: 'current/nba_playoff_odds.json', teamSport: 'nba', field: 16, teams: 30,
    title: '🏆 Title odds', meta: 'playoff field and a title pick, simulated', foldId: 'buckets-title-odds',
    final: 'Title', record: (t) => `${t.wins}-${t.losses}`,
    cols: [['top_seed', 'Top seed'], ['win_round1', 'Rd 2'], ['win_round2', 'Rd 3'], ['win_round3', 'Finals']],
    note: 'Seven-game series favour the better team, so the favourite is bigger here than in the other sports.',
  },
})

/** App-relative path of a sport's file. */
export const championshipFile = (sport) => CHAMPIONSHIP[sport]?.file || null

const isShare = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1

/**
 * Check a parsed file. Returns { ok: true, doc } or { ok: false, why }. `why` is for logs/tests; the page shows nothing.
 * Rules (spec section 1): non-empty method; sims > 0; every share in [0,1]; win_champion sums to 1 (+-0.05);
 * win_round4 equals win_champion; rounds monotone per team; the team list is the full league (never a partial list).
 */
export function readChampionship(sport, doc) {
  const cfg = CHAMPIONSHIP[sport]
  if (!cfg) return { ok: false, why: 'unknown sport' }
  if (!doc || typeof doc !== 'object') return { ok: false, why: 'not an object' }
  if (!String(doc.method || '').trim()) return { ok: false, why: 'no method' }
  if (!(Number(doc.sims) > 0)) return { ok: false, why: 'sims must be > 0' }
  const teams = Array.isArray(doc.teams) ? doc.teams : []
  if (teams.length !== cfg.teams) return { ok: false, why: `expected ${cfg.teams} teams, got ${teams.length}` }
  let champ = 0
  for (const t of teams) {
    if (!t || t.team_id == null || !t.abbr) return { ok: false, why: 'a team has no id or abbr' }
    for (const k of SHARE_KEYS) {
      if (t[k] != null && !isShare(t[k])) return { ok: false, why: `${t.abbr}.${k} is not a 0-1 share (${t[k]})` }
    }
    if (!isShare(t.make_playoffs) || !isShare(t.win_champion)) return { ok: false, why: `${t.abbr} lacks make_playoffs or win_champion` }
    const r = ROUND_KEYS.map((k) => t[k])
    if (r.every((v) => v != null)) {
      if (r.some((v, i) => i < 3 && v < r[i + 1] - 1e-9)) return { ok: false, why: `${t.abbr} rounds not monotone` }
      if (Math.abs(t.win_round4 - t.win_champion) > 1e-6) return { ok: false, why: `${t.abbr} win_round4 != win_champion` }
    }
    champ += t.win_champion
  }
  if (Math.abs(champ - 1) > 0.05) return { ok: false, why: `win_champion sums to ${champ.toFixed(3)}` }
  return { ok: true, doc }
}

/**
 * The lock rule: a team the standings feed marks clinched prints 100% to make the field and a team marked eliminated
 * prints 0, whatever the simulation said. Without a `race` block nothing is locked (and the panel has no "Now" column).
 */
export function applyRace(t) {
  const race = t.race && typeof t.race === 'object' ? t.race : null
  const clinched = Boolean(race && String(race.clinch || '').trim())
  const out = Boolean(race && race.eliminated)
  const locked = clinched ? 'in' : out ? 'out' : ''
  return { ...t, locked, make_playoffs: locked === 'in' ? 1 : locked === 'out' ? 0 : t.make_playoffs }
}

/** "<1%" under 1%, ">99%" at 99.5%+, whole percents between; "-" for a missing or zero value. */
export function pctWords(v) {
  const n = Number(v)
  if (!Number.isFinite(n) || n <= 0) return '—'
  if (n < 0.01) return '<1%'
  if (n >= 0.995) return '>99%'
  return `${Math.round(n * 100)}%`
}

/** Teams worth listing: anyone with a real chance of the field, in title-chance order. */
export function listed(teams, max = 16) {
  return [...teams]
    .sort((a, b) => (b.win_champion - a.win_champion) || (b.make_playoffs - a.make_playoffs))
    .filter((t) => t.make_playoffs > 0.005 || t.locked === 'in')
    .slice(0, max)
}
