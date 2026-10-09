// A team or game link names the team or game in its address, and a cold load of that address
// opens that tab (nav audit 10-08). Held for MLB / NFL / NHL / NBA.   node scripts/check-team-game-urls.mjs
import './_esm-resolve.mjs'
import { readFileSync } from 'node:fs'
const { teamHref, gameHref, SPORT_KEYS, isHiddenSport } = await import('../lib/routes.js')
const { resolveColdTab } = await import('../lib/shellRoute.js')
let bad = 0
const say = (ok, msg) => { if (!ok) bad++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`) }
const hashOf = (href) => new URLSearchParams(String(href).split('#')[1] || '')
const CLUB = { mlb: 'LAD', nfl: 'KC', nhl: 'TBL', nba: 'BOS' }
for (const sport of ['mlb', 'nfl', 'nhl', 'nba']) {
  const club = CLUB[sport]
  const t = teamHref(sport, club)
  if (isHiddenSport(sport)) { say(t === null, `${sport}: hidden product gets no team link (${t})`) } else {
    const h = hashOf(t)
    say(t && t.startsWith('/app#') && h.get('sport') === sport && h.get('tab') === 'team' && h.get('team') === club, `${sport}: teamHref names the club -> ${t}`)
    const cold = resolveColdTab(sport, `#${t.split('#')[1]}`, 'home')
    say(cold.tab === 'team', `${sport}: a cold load of ${t} opens the team tab (got ${cold.tab})`)
  }
  const g = gameHref(sport, '401772510')
  const gh = hashOf(g)
  say(gh.get('sport') === sport && gh.get('game') === '401772510' && Boolean(gh.get('tab')), `${sport}: gameHref names the game -> ${g}`)
  const gcold = resolveColdTab(sport, g, 'home')
  say(gcold.tab === gh.get('tab'), `${sport}: a cold load of ${g} opens ${gh.get('tab')} (got ${gcold.tab})`)
}
// the places a club code sat inside a player's tap are their own link now
const src = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')
say(/teamCode: i === 0 \? null : teamOf\(p\)/.test(src('components/BotPicksStrip.js')), 'MOONSHOT Home picks: the club code rides as teamCode, so it links to the club')
say(/<TeamTap abbr=\{p\.teamCode \?\? p\.team\} sport=\{sport\}>/.test(src('components/headline/HeadlinePicks.js')), 'HeadlinePicks: the club code is a TeamTap (a link on /start too)')
say(/a\.small && a\.smallTeam && <small><TeamTap/.test(src('components/ledger/LedgerBlocks.js')), 'Look-out chips: the club code is its own link, outside the player tap')
for (const f of ['components/HomerLedger.js', 'lib/sports/nfl/ledger.js', 'lib/sports/nhl/ledger.js', 'lib/sports/nba/ledger.js']) say(/smallTeam:/.test(src(f)), `${f}: look-out chips pass smallTeam`)
say(/openGame\(c\.gameId\)/.test(src('components/nfl/NflHeadlineStrip.js')), 'NFL Home: a game card opens THAT game (game=<id>), not the bare Games tab')
say(/gameId: gameIdOf\(games, top\)/.test(src('lib/nfl/headlines.js')), 'NFL Home: the matchup on a pick card carries its game id')
process.exit(bad ? 1 : 0)
