// NFL odds-name aliases (2026-10-17). TEST data only, no network.
//   node --import ./scripts/_esm-resolve.mjs scripts/check-nfl-aliases.mjs
// 1. initials key + reviewed aliases resolve (same team), a wrong team / nearest name does not
// 2. an exact match is never displaced; normName itself is unchanged
// 3. the site's table equals the bot's bots/nfl/name_aliases.json (skipped when the bot checkout is absent)
import { existsSync, readFileSync } from 'node:fs'
const { oddsByName, joinKey, isTeamLine, NFL_NAME_ALIASES } = await import('../lib/nfl/nameAliases.js')
const { normName, quoteFor } = await import('../lib/nfl/oddsMatch.js')
let bad = 0
const fail = (m) => { console.log(`FAIL ${m}`); bad += 1 }
const eq = (a, b, m) => { if (a !== b) fail(`${m}: got ${JSON.stringify(a)}, wanted ${JSON.stringify(b)}`) }

eq(normName('A.J. Brown'), 'a j brown', 'normName unchanged')
eq(joinKey('a j brown'), 'aj brown', 'initials fuse')
eq(joinKey('j michael sturdivant'), 'j michael sturdivant', 'one initial stays')
eq(isTeamLine('BUF Bills ST'), true, 'ST line'); eq(isTeamLine('SF ST'), true, 'ST line 2'); eq(isTeamLine('Saints ST'), true, 'ST line 3')
eq(isTeamLine('Justin Tucker'), false, 'a player is not an ST line')

const q = (n) => ({ player_anytime_td: { line: 0.5, over: 100, name: n } })
const odds = { by_name: { 'd j moore': q('D.J. Moore'), 'cameron ward': q('Cameron Ward'), 'kenny gainwell': q('Kenny Gainwell'), 'kenneth gainwell': q('Kenneth Gainwell') } }
eq(oddsByName(odds, { name: 'DJ Moore', team: 'BUF' })?.player_anytime_td?.name, 'D.J. Moore', 'initials meet')
eq(oddsByName(odds, { name: 'Cam Ward', team: 'TEN' })?.player_anytime_td?.name, 'Cameron Ward', 'alias, right team')
eq(oddsByName(odds, { name: 'Cam Ward', team: 'DAL' }), null, 'alias, wrong team')
eq(oddsByName(odds, { name: 'Cam Wardle', team: 'TEN' }), null, 'no nearest name')
eq(oddsByName(odds, { name: 'Kenny Gainwell', team: 'TB' })?.player_anytime_td?.name, 'Kenny Gainwell', 'exact beats alias')
eq(quoteFor(odds, { player_id: 'x', name: 'Cam Ward', team: 'TEN' }, 'TD')?.name, 'Cameron Ward', 'quoteFor uses the alias')

const seen = new Set()
for (const a of NFL_NAME_ALIASES) {
  if (!a.odds || !a.ours || !a.team) fail(`incomplete row ${JSON.stringify(a)}`)
  if (normName(a.odds) === normName(a.ours)) fail(`pointless alias ${a.odds}`)
  if (seen.has(normName(a.odds))) fail(`duplicate odds name ${a.odds}`)
  seen.add(normName(a.odds))
}

const BOT = '/home/user/MLB-HR-DASHBOARD-STREAMLIT/bots/nfl/name_aliases.json'
if (!existsSync(BOT)) console.log(`NOTE bot table not present at ${BOT}: site/bot identity check skipped`)
else {
  const rows = JSON.parse(readFileSync(BOT, 'utf8')).aliases
  const key = (r) => `${r.odds}|${r.ours}|${r.team}`
  eq(JSON.stringify(rows.map(key)), JSON.stringify(NFL_NAME_ALIASES.map(key)), 'site table equals bot name_aliases.json')
}
console.log(bad ? `${bad} FAILED` : 'check-nfl-aliases: OK')
process.exit(bad ? 1 : 0)
