'use client'

// 🏈 NFL STANDINGS (2026-09-26, shell-parity step 3). TUDDY's bar takes
// LAMP's shape (Board · Scores · Schedule · Standings · Players · Leaders,
// Donovan 09-25), and TUDDY had no standings page. This is its data.
//
// SOURCE: the public NFL standings feed, read in the browser -- the same
// family of public feed lib/nfl/liveSlate.js reads the scoreboard from, and
// it answers any origin (access-control-allow-origin: *), so no server route
// and no stored data. Cached here ten minutes; standings move once a game.
//
// NO LOGOS, NO OTHER SITE'S LABELS (Donovan, 09-26). The feed's team rows
// carry `logos` and `links`; they are dropped here and never reach a page.
// Teams are TUDDY's own codes (the feed's WSH is TUDDY's WAS) so the text
// team mark, the colours and the players filter all line up. Division and
// conference names are the league's own words.
const URL_ = 'https://site.web.api.espn.com/apis/v2/sports/football/nfl/standings?level=3'
const TTL_MS = 10 * 60 * 1000
const CODE = { WSH: 'WAS' }

let _snap = null
let _at = 0
let _inflight = null

const stat = (e, name) => {
  const s = (e.stats || []).find((x) => x.name === name || x.type === name)
  return s ? s : null
}
const num = (e, name) => { const s = stat(e, name); return s && Number.isFinite(Number(s.value)) ? Number(s.value) : null }
const txt = (e, name) => { const s = stat(e, name); return s ? String(s.displayValue ?? s.summary ?? '') : '' }

/** Feed JSON → { conferences: [{ name, abbr, divisions: [{ name, teams }] }] } */
export function reduceNflStandings(json) {
  const conferences = (json?.children || []).map((conf) => ({
    name: String(conf.name || ''),
    abbr: String(conf.abbreviation || ''),
    divisions: (conf.children || []).map((div) => ({
      name: String(div.name || ''),
      teams: (div.standings?.entries || []).map((e) => {
        const raw = String(e.team?.abbreviation || '').toUpperCase()
        return {
          abbr: CODE[raw] || raw,
          place: String(e.team?.location || ''),
          nickname: String(e.team?.name || ''),
          w: num(e, 'wins'), l: num(e, 'losses'), t: num(e, 'ties'),
          pct: num(e, 'winPercent'),
          pf: num(e, 'pointsFor'), pa: num(e, 'pointsAgainst'), diff: num(e, 'differential'),
          strk: txt(e, 'streak'),
          home: txt(e, 'Home'), road: txt(e, 'Road'),
          div: txt(e, 'vs. Div.'), conf: txt(e, 'vs. Conf.'),
          seed: num(e, 'playoffSeed'),
        }
      }),
    })),
  }))
  return { conferences }
}

/** The shared snapshot; callers inside the TTL get the last one. */
export function fetchNflStandings({ force = false } = {}) {
  if (!force && _snap && Date.now() - _at < TTL_MS) return Promise.resolve(_snap)
  if (_inflight) return _inflight
  _inflight = fetch(URL_)
    .then((r) => { if (!r.ok) throw new Error(`standings ${r.status}`); return r.json() })
    .then((j) => { _snap = { ...reduceNflStandings(j), fetchedAt: new Date().toISOString() }; _at = Date.now(); return _snap })
    .finally(() => { _inflight = null })
  return _inflight
}
