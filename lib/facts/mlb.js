// THE BOT'S OWN HISTORY, AS A FACT (BATCH-FACT-ENGINE, 2026-10-02). Our data,
// nobody else has it: a hitter on tonight's slate, what happened when MOONSHOT
// called him vs when it didn't, on the clean pregame record (lib/botOnHim.js).
// Only a cut with n >= TWEET_MIN_N games is a fact; below that it stays on the
// player card. "Homered in 8 of 13" counts GAMES; the home runs ride beside it
// (Alonso: 8 games, 10 HR -- two 2-HR nights).
import { botOnHimAll, TWEET_MIN_N } from '../botOnHim'
import { dataUrl } from '../dataSource'

const CALLS = ['TOP', 'HR', 'HIT', 'HRR', 'CONTACT']
const day = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
const sum = (P, keys) => keys.reduce((a, k) => { const c = P.roles[k]?.all; return c ? { g: a.g + c.g, hrG: a.hrG + c.hrG, hr: a.hr + c.hr } : a }, { g: 0, hrG: 0, hr: 0 })

/** Tonight's bot-history facts: players on `date`'s slate. */
export async function mlbBotFacts(date, through) {
  const [all, slate] = await Promise.all([
    botOnHimAll(through),
    fetch(dataUrl('current/today_slim.json'), { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
  ])
  const rows = Array.isArray(slate) ? slate : slate?.players || slate?.rows || []
  const tonight = new Set(rows.filter((r) => String(r.game_time || '').length).map((r) => String(r.player_id)))
  return botFactsFor(all, tonight, date, through)
}

/** The facts for these players (pure: the summary + who plays). */
export function botFactsFor(all, pids, date, through) {
  const out = []
  for (const pid of pids) {
    const P = all.players[pid]
    if (!P) continue
    const called = sum(P, CALLS)
    const not = sum(P, ['WATCH', 'NONE'])
    const base = (x) => (x.g ? x.hrG / x.g : 0)
    if (called.g >= TWEET_MIN_N && base(called) >= 0.4) {
      out.push({
        sport: 'mlb', family: 'bot_called', brand: 'MOONSHOT', basis: 'Picks locked before each game', date, id: `mlb:bot:called:${pid}:${through}`,
        player: P.name, team: P.team, called, not, since: day(all.since), proves: [],
        source: `MOONSHOT clean pregame record (por_rows + outcome_log), ${all.since} to ${through}`,
        why: `homered in ${called.hrG} of ${called.g} games when called`, score: 45 + Math.round(100 * base(called)) / 4,
      })
    }
    if (not.g >= TWEET_MIN_N && called.g === 0 && not.hrG >= 4) {
      out.push({
        sport: 'mlb', family: 'bot_blind_spot', brand: 'MOONSHOT', basis: 'Picks locked before each game', date, id: `mlb:bot:blind:${pid}:${through}`,
        player: P.name, team: P.team, not, since: day(all.since), proves: [],
        source: `MOONSHOT clean pregame record (por_rows + outcome_log), ${all.since} to ${through}`,
        why: `never called in ${not.g} games, homered in ${not.hrG}`, score: 42 + not.hrG,
      })
    }
  }
  return out.sort((a, b) => b.score - a.score)
}
