// Every Franchise league page hand-writes its own desktop tab row. There is no
// shared component for it - LeagueMobileNav is the phone bar and is
// display:none above the breakpoint - so the eight rows drifted apart:
// Settings was linked from Draft, Matchup, League and Wire, and missing from
// Team, Trades, Feed and Coach. A commissioner on the wrong tab simply could
// not see the way into the control room.
//
// Rather than refactor eight pages into one component (a much larger change
// than the bug warrants, in files another session may be editing), this pins
// the invariant: every roomNav must offer the same destinations in the same
// order, with exactly one of them marked active.
//
// The four missing links were fixed in d1d6155; this is the guard that keeps
// them fixed. Written by the 09-03 findings session and reproduced from its
// handoff, which is where it would otherwise have been lost.
import fs from 'node:fs'
import path from 'node:path'

const base = 'app/fantasy/league/[leagueId]'
const pages = ['', 'team', 'matchup', 'league', 'wire', 'trades', 'feed', 'coach']
const EXPECTED = ['Draft', 'Team', 'Matchup', 'League', 'Wire', 'Trades', 'Feed', 'Coach', 'Settings']

let bad = 0
for (const dir of pages) {
  const file = path.join(base, dir, 'page.js')
  if (!fs.existsSync(file)) { console.log(`MISS ${file} does not exist`); bad++; continue }
  const src = fs.readFileSync(file, 'utf8')
  const nav = src.match(/<nav [^>]*className=\{styles\.roomNav\}>[\s\S]*?<\/nav>/)
  if (!nav) { console.log(`MISS ${file} has no roomNav`); bad++; continue }
  const labels = [...nav[0].matchAll(/>([A-Z][a-z]+)<\/(?:Link|a)>/g)].map((m) => m[1])
  const active = [...nav[0].matchAll(/roomActive\}>([A-Z][a-z]+)</g)].map((m) => m[1])
  const name = dir || 'draft'
  if (labels.join(',') !== EXPECTED.join(',')) {
    console.log(`MISS ${name}: ${labels.join(' ')}\n     want: ${EXPECTED.join(' ')}`)
    bad++
  } else if (active.length !== 1) {
    console.log(`MISS ${name}: ${active.length} active entries, want exactly 1`)
    bad++
  }
}
console.log(bad
  ? `\n${bad} league nav(s) out of step - a tab is unreachable from somewhere`
  : `\nok   all ${pages.length} league navs offer the same ${EXPECTED.length} destinations`)
process.exit(bad ? 1 : 0)
