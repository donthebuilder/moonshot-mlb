// lib/shellRoute.js resolveColdTab, held to the cases its comment names
// (SportShell step 2, 2026-09-29). node scripts/check-shell-route.mjs
import './_esm-resolve.mjs'
const { resolveColdTab } = await import('../lib/shellRoute.js')
const cases = [
  // [sport, live hash, snapshot tab, expected tab, why]
  ['nfl', '#sport=nfl&tab=leaders', 'home', 'leaders', 'live hash names TUDDY: it answers'],
  ['nfl', '#sport=nhl&tab=schedule', 'games', 'games', 'live hash is another sport: snapshot'],
  ['nfl', '#sport=nfl&tab=nosuchtab', 'boards', 'boards', 'live tab unknown, snapshot known: snapshot'],
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
