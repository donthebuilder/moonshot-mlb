// Every Franchise league page used to hand-write its own desktop tab row.
// There was no shared component - LeagueMobileNav is the phone bar and is
// display:none above the breakpoint - so the eight rows drifted apart:
// Settings was linked from Draft, Matchup, League and Wire and shown to
// everybody from Team, Trades, Feed and Coach, and the nav's aria-label was
// on six of the nine.
//
// The earlier version of this script pinned the invariant across eight copies
// because refactoring them into one component was judged a larger change than
// the bug warranted. That refactor has now happened (#83/#74): the copies are
// gone and components/fantasy/LeagueNav.js owns the list, the order and the
// commissioner gate. So the thing worth checking changed shape. It is no
// longer "do eight lists agree" -- they cannot disagree -- it is:
//
//   · every league page renders <LeagueNav>, and none has grown its own nav
//     back;
//   · each passes an `active` key the component actually knows about, since a
//     typo there silently makes the current page a link to itself and leaves
//     no tab marked current;
//   · each passes `role`, without which the commissioner gate is always shut
//     and the control room becomes unreachable from that page.
import fs from 'node:fs'
import path from 'node:path'

const base = 'app/fantasy/league/[leagueId]'
const pages = { '': 'draft', team: 'team', matchup: 'matchup', league: 'league', wire: 'wire', trades: 'trades', feed: 'feed', coach: 'coach' }

const navSrc = fs.readFileSync('components/fantasy/LeagueNav.js', 'utf8')
const KEYS = new Set([...navSrc.matchAll(/\[\s*'([a-z]+)',\s*'[^']*',\s*'[A-Z]/g)].map((m) => m[1]))
KEYS.add('settings')
if (KEYS.size < 9) { console.log(`MISS LeagueNav.js parsed only ${KEYS.size} destinations`); process.exit(1) }

let bad = 0
for (const [dir, key] of Object.entries(pages)) {
  const file = path.join(base, dir, 'page.js')
  if (!fs.existsSync(file)) { console.log(`MISS ${file} does not exist`); bad++; continue }
  const src = fs.readFileSync(file, 'utf8')
  if (/<nav [^>]*className=\{styles\.roomNav\}>/.test(src)) {
    console.log(`MISS ${key}: hand-written roomNav is back -- use <LeagueNav>`); bad++; continue
  }
  const tag = src.match(/<LeagueNav\b[^>]*\/>/)
  if (!tag) { console.log(`MISS ${key}: no <LeagueNav>`); bad++; continue }
  const active = tag[0].match(/active="([a-z]+)"/)?.[1]
  if (!active) { console.log(`MISS ${key}: <LeagueNav> has no active=`); bad++; continue }
  if (!KEYS.has(active)) { console.log(`MISS ${key}: active="${active}" is not a destination LeagueNav knows`); bad++; continue }
  if (active !== key) { console.log(`MISS ${key}: marks "${active}" as the current tab`); bad++; continue }
  if (!/role=\{/.test(tag[0])) { console.log(`MISS ${key}: <LeagueNav> gets no role -- Settings can never show`); bad++ }
}
console.log(bad
  ? `\n${bad} league nav(s) out of step - a tab is unreachable from somewhere`
  : `\nok   all ${Object.keys(pages).length} league pages render the one shared nav`)
process.exit(bad ? 1 : 0)
