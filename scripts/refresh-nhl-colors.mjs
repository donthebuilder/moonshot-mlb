// NHL CLUB COLOURS (2026-10-23, LAMP's bubble-dome hockey: the figures wear their clubs' colours). ESPN's NHL team list
// (site.api.espn.com .../hockey/nhl/teams, the club's own primary and alternate colour) -> lib/data/nhlClubColors.json,
// keyed by the league's abbreviation (LAMP's). ESPN sends no CORS header on this list, so the browser can't read it; run
// this when a club changes its colours:   node scripts/refresh-nhl-colors.mjs
import { writeFileSync } from 'node:fs'
const ALIAS = { NJ: 'NJD', SJ: 'SJS', LA: 'LAK', TB: 'TBL', UTAH: 'UTA' }   // ESPN -> the league's own abbreviation
const r = await fetch('https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/teams')
if (!r.ok) { console.error(`ESPN answered ${r.status}: nothing written`); process.exit(1) }
const teams = (await r.json())?.sports?.[0]?.leagues?.[0]?.teams?.map((t) => t.team) || []
if (teams.length < 32) { console.error(`only ${teams.length} clubs: nothing written`); process.exit(1) }
const clubs = {}
for (const t of teams) clubs[ALIAS[t.abbreviation] || t.abbreviation] = { color: t.color ? `#${t.color}` : null, alt: t.alternateColor ? `#${t.alternateColor}` : null }
writeFileSync(new URL('../lib/data/nhlClubColors.json', import.meta.url), `${JSON.stringify({ source: 'ESPN NHL teams (site.api.espn.com)', fetched: new Date().toISOString().slice(0, 10), clubs }, null, 1)}\n`)
console.log(`wrote ${Object.keys(clubs).length} clubs`)
