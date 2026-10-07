// lib/shellRoute.js resolveColdTab, held to the cases its comment names
// (SportShell step 2, 2026-09-29). node scripts/check-shell-route.mjs
import './_esm-resolve.mjs'
const { resolveColdTab } = await import('../lib/shellRoute.js')
const cases = [
  // [sport, live hash, snapshot tab, expected tab, why]
  ['nfl', '#sport=nfl&tab=leaders', 'home', 'leaders', 'live hash names TUDDY: it answers'],
  ['nfl', '#sport=nhl&tab=schedule', 'games', 'games', 'live hash is another sport: snapshot'],
  ['nfl', '#sport=nfl&tab=nosuchtab', 'research', 'research', 'live tab unknown, snapshot known: snapshot'],
  // MOONSHOT: the old Boards page is Rankings (2026-10-06); its old keys open it
  ['mlb', '#sport=mlb&tab=board', 'home', 'fullboard', 'old Boards link opens Rankings'],
  ['mlb', '#sport=mlb&tab=boards', 'home', 'fullboard', 'TUDDY\'s word for it opens Rankings'],
  ['mlb', '#sport=mlb&tab=hitshrr', 'home', 'fullboard', 'the pre-consolidation key opens Rankings'],
  ['mlb', '#sport=mlb&tab=pitchermap', 'home', 'pitchers', 'the removed Pitcher map opens the Pitchers page'],
  ['mlb', '#sport=mlb&tab=fullboard', 'home', 'fullboard', 'Rankings opens Rankings'],
  ['nhl', '#sport=nhl&tab=standings', 'home', 'standings', 'LAMP live hash answers'],
  ['nhl', '', 'leaders', 'leaders', 'no live hash: snapshot'],
]
let bad = 0
for (const [sport, live, snap, want, why] of cases) {
  const got = resolveColdTab(sport, live, snap)
  const ok = got.tab === want
  if (!ok) bad++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${sport} ${live || '(none)'} snap=${snap} -> ${got.tab} (${got.status})  ${why}`)
}
const miss = resolveColdTab('nfl', '#sport=nfl&tab=nosuchtab', null)
console.log(`${miss.status === 'missing' ? 'ok  ' : 'FAIL'} unknown tab with no snapshot answers missing (asked=${miss.asked})`)
if (miss.status !== 'missing') bad++
process.exit(bad ? 1 : 0)
