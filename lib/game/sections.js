// THE GAME-PAGE SECTION REGISTRY (2026-10-12, stage 1 of the game-page plan). Which sections a sport's game shows, in
// what order, under what name: data, not JSX order. A sport is listed once, here (keyed by lib/routes.js sportKey:
// mlb / nfl / nhl / nba), and a section is one line. Same shape and spirit as lib/team/registry.js.
//
// WHAT THIS DOES AND DOES NOT DO. It ORDERS and NAMES sections (the pill labels, the anchors, the hover words). It does
// not change what a section draws: each sport's component keeps its own renderer per id (a `SECTIONS = { id: () => … }`
// map next to the component) and walks this list. MOONSHOT's Games.js walks it too (stage 2, 2026-10-12): its sections
// moved, unchanged, into a SECTIONS map and render in the registry's order; proven pixel- and DOM-identical by screenshot diff.
//
// TWO SURFACES a sport may have:
//   slate  the open game inside a slate (pills + anchors `gp-<id>-<gameId>`): MLB, NFL, NHL.
//   page   a game on a page of its own (#tab=game&game=<id>): NHL, NBA.
// A surface a sport does not have is { list: [], why } -- it says so; it is never silently absent.
//
// ENTRY: id (the anchor word; also the key of the component's renderer), label (the pill / kicker name), role (the
// shared vocabulary in ROLES below, so "does every sport carry a calls section" is a question the data answers; null =
// sport-only), sub (the hover / caption words under the pills), pill:false (an anchor without a pill), only:'pre' |
// 'started' (drawn only before / after the game starts: the NHL rink sits before the tables until there is a goal),
// empty (the words of the section's named empty state, which its renderer prints when it has nothing).
//
// ADDING A SECTION: one S(...) line in that sport's list, at the place it should sit, and one renderer under the same
// id in the component's SECTIONS map. check-game-sections.mjs fails if either half is missing.

/** The shared words for what a section is FOR. A sport may leave one out; the registry records which (see `lacks`). */
export const ROLES = ['header', 'calls', 'stage', 'players', 'matchup', 'out']

const S = (id, label, role = null, o = {}) => ({ id, label, role, ...o })

export const GAME_SECTIONS = {
  mlb: {
    slate: {
      list: [
        // the ids/labels/subs are MOONSHOT's own words, moved here byte for byte (they were GAME_PANELS / PANEL_SUB in components/tabs/Games.js)
        S('read', 'The read', 'matchup', { sub: 'tonight’s air, both starters written out, and this game’s storylines.' }),
        // Caption updated 2026-08-17 with the default flip: the table leads now, the spot read is the pill. A caption
        // promising the old order would send people hunting for a click that no longer exists.
        // THE POSTSEASON EDITION ROW (2026-10-12): drawn ONLY for a playoff game (schedule gameType F/D/L/W) and only on a slate dated Sep-Nov; every other game
        // renders nothing for it (no wrapper, no height), and it has no pill, so MOONSHOT's pills and DOM are unchanged outside the postseason.
        S('postseason', 'Postseason', null, { pill: false }),
        S('lineups', 'Lineups', 'players', { sub: 'both batting orders 1 through 9 as the full stat table — every column sortable, with the spot read (what this arm has done to each slot, in words) one pill over.' }),
        S('sim', 'Simulator', null, { pill: false }),
        // THE CALL moved down here (2026-10-17): the game's own read, lineups and simulator first, then the write-up; no pill (the Picks pill is the calls)
        S('call', 'The call', null, { pill: false }),
        S('h2h', 'Head-to-head', 'matchup', { sub: 'what these hitters have done against tonight’s starter this season, both sides.' }),
        S('out', 'Out', 'out', { sub: 'who is out for both clubs, from the injury report.' }),
        S('picks', 'Picks', 'calls', { sub: 'MOONSHOT’s designated slots for this game as full cards — score bars, pills, add to slip.' }),
        // 2026-10-13: the CLUBS' head to head (lib/h2h): record, margin, total and meetings of the two clubs over three seasons. No pill on any slate (the pill rows stay as they were, MOONSHOT's byte for byte): the section stacks after the others and the anchor is gp-clubs-<game>. Named 'Club H2H' on MOONSHOT because 'Head-to-head' above is already the hitters'.
        S('clubs', 'Club H2H', null, { pill: false }),
        // 2026-10-20: our spread beside the book's run line and moneyline, info only (no CALLED, no %); no pill, MOONSHOT's pills unchanged
        S('ourline', 'Our line', null, { pill: false }),
      ],
    },
    page: { list: [], why: 'the open game of the slate is the game page (components/tabs/Games.js)' },
    lacks: { header: 'the header is the slate card above the pills', stage: 'no field view inside the game' },
  },
  nfl: {
    slate: {
      list: [
        // OUR CALLS moved down (2026-10-17, Donovan: the write-up was "smack at the top"): the field and the players first, then the calls. Same id, label and anchor.
        S('field', 'The field', 'stage', { sub: 'where this offense attacks, where the other defense is weak, and where they meet; who gets the ball.' }),
        S('players', 'Players', 'players', { sub: 'every scored player in the game, all the numbers.' }),
        S('calls', 'Our calls', 'calls', { sub: "our calls in this game and the game's top touchdown scores." }),
        S('matchup', 'Matchup', 'matchup', { sub: 'the numbers that decide a game, side by side.' }),
        S('ourline', 'Our line', null, { pill: false }),   // 2026-10-20: our spread beside the book's, info only
        S('out', 'Out', 'out', { sub: 'who is out this week for both clubs, from the injury report.' }),
        S('clubs', 'Head to head', null, { pill: false }),
      ],
    },
    page: { list: [], why: 'the open game of the slate is the game page (components/nfl/NflSlate.js)' },
    lacks: { header: 'the header is GameHeader above the pills' },
  },
  nhl: {
    slate: {
      list: [
        S('read', 'The read', 'matchup', { sub: 'goals to expect, power play and penalty kill.' }),
        S('board', 'Every player', 'players', { sub: 'every skater in this game. Scroll the table sideways for more.' }),
        S('calls', 'The calls', 'calls', { sub: 'one skater called per team.' }),
        S('out', 'Out', 'out', { sub: 'who is out for both clubs, from the injury report.' }),
        S('clubs', 'Head to head', null, { pill: false }),
      ],
    },
    // components/lamp/tabs/Game.js, top to bottom. The rink leads the tables before the puck drops (the tables are empty
    // then) and follows the goals once there are some: two entries, one drawn per state.
    page: {
      list: [
        S('header', 'Game', 'header'),
        S('ledger', 'Ledger', 'calls'),
        S('stage-pre', 'The rink', 'stage', { only: 'pre' }),
        S('period', 'By period'),
        S('goals', 'Goals', null, { empty: 'PUCK NOT DROPPED' }),
        S('stage', 'The rink', 'stage', { only: 'started' }),
        S('compare', 'Team comparison', 'matchup'),
        S('attack', 'How to attack them', 'matchup'),   // 2026-10-20 (Donovan: "how to attack for all sports"): TUDDY's attack sheet
        S('ourline', 'Our line', 'matchup'),   // 2026-10-20: our goal margin beside the book's puck line and moneyline, info only
        S('box', 'The box', 'players'),
        S('penalties', 'Penalties'),
        S('stars', 'Three stars'),
        S('clubs', 'Head to head'),
        S('series', 'Season series'),
      ],
    },
    // (the stand-alone game page has no 'out' section yet; the slate's open game does. Adding it is one line here and one renderer.)
    lacks: {},
  },
  nba: {
    // BUCKETS is hidden (BUCKETS_PUBLIC=on); its slate shows one game inline with no section pills
    slate: { list: [], why: 'the slate shows one game inline with no section pills (components/buckets/tabs/Slate.js)' },
    // components/buckets/tabs/Game.js, top to bottom
    page: {
      list: [
        S('header', 'Game', 'header'),
        // 2026-10-12 (BUCKETS parity pass): the calls lead, as they do on MOONSHOT's, TUDDY's and LAMP's games (the line score, the firsts and the numbers follow)
        S('calls', 'Called in this game', 'calls'),
        S('line', 'Line score'),
        S('firsts', 'First field goal and first points'),
        S('expected', 'Expected points', 'matchup'),
        S('attack', 'How to attack them', 'matchup'),   // 2026-10-20: TUDDY's attack sheet, each defense vs position answered by a player
        S('defpos', 'Defense vs position', 'matchup'),   // 2026-10-19 (mock D2): each defense against the other's guards / forwards / centers
        S('ourline', 'Our line', 'matchup'),   // 2026-10-19: our spread beside the book's, info only (no CALLED, no %)
        S('ledger', 'Ledger', 'calls'),
        S('out', 'Out tonight', 'out'),
        S('box', 'Box scores', 'players'),
        S('writeup', 'The call', 'calls'),   // after the game's own numbers (2026-10-17, Donovan: not smack at the top)
        S('shots', 'Every shot', 'stage', { empty: 'NO SHOT LOCATIONS' }),
        S('clubs', 'Head to head'),   // last: it pushes nothing the page had down (2026-10-13)
      ],
    },
    lacks: {},
  },
}

const surface = (sport, which) => (GAME_SECTIONS[sport] || {})[which] || { list: [], why: 'sport not in the registry' }

/** The sections to draw, in order. `state` ('pre' | 'live' | 'final') picks the state-bound entries; omit it to get all. */
export function gameSections(sport, which = 'slate', state = null) {
  const keep = (s) => !state || !s.only || (s.only === 'pre' ? state === 'pre' : state !== 'pre')
  return surface(sport, which).list.filter(keep)
}

/** The pills of a slate's open game: [[id, label], …] (what GamePanelPills takes). Anchor-only entries (pill:false) have none. */
export function panelPairs(sport, which = 'slate') {
  return surface(sport, which).list.filter((s) => s.pill !== false).map((s) => [s.id, s.label])
}

/** The words under / on the pills: { id: sub }. */
export function panelSubs(sport, which = 'slate') {
  return Object.fromEntries(surface(sport, which).list.filter((s) => s.sub).map((s) => [s.id, s.sub]))
}

/** A section of a sport by id (or null). */
export function sectionOf(sport, which, id) {
  return surface(sport, which).list.find((s) => s.id === id) || null
}

/** Why a sport has no list on this surface (null when it has one). */
export function whyNoSurface(sport, which) {
  const x = surface(sport, which)
  return x.list.length ? null : x.why || 'no reason recorded'
}

/** Which shared roles a sport's game carries across both surfaces. */
export function rolesCarried(sport) {
  const s = GAME_SECTIONS[sport] || {}
  return new Set([...(s.slate?.list || []), ...(s.page?.list || [])].map((x) => x.role).filter(Boolean))
}
