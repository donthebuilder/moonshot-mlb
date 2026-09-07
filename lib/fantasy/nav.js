// ONE TABLE FOR EVERY FRANCHISE NAVIGATION (2026-09-07)
//
// Franchise had the same drift MOONSHOT had before lib/routes.js: the desktop
// rail (components/fantasy/LeagueNav.js) and the phone bar
// (app/fantasy/league/[leagueId]/LeagueMobileNav.js) each spelled out their own
// list, in their own order, with their own labels. Labels and order live here
// now, and both navs read them, so the product cannot disagree with itself
// about what its own pages are called.
//
// LABELS, 2026-09-07. Donovan: "make the nav names better too."
//   · "Team" -> "My Team". There are ten teams in a league; only one is yours,
//     and after tonight you can open anyone's. The word had to say which.
//   · "Wire" -> "Add/Drop". Wire is fantasy jargon that means nothing to a
//     first-time player, and it is the page you reach for when you want a
//     player off your roster -- which Donovan says should be easier to find.
//     The tab now says what you go there to do.
//   · "Draft" -> "Draft Board", and it leaves the phone bar. It was the first
//     stop on the bar all season and the draft happens once.
//   · "Settings" -> "Commissioner". It is the control room, not preferences,
//     and only a commissioner ever sees it.
//
// THE BAR IS FOUR STOPS PLUS MORE, which is MOONSHOT's shape (five slots, the
// fifth opening a sheet that carries everything). Nine tabs in one row on a
// 390px phone gives every one of them ~43px and no room for a word under the
// icon. The four on the bar are the ones you touch on a normal week: set a
// lineup, see the game, check the table, work the wire.

export const FRANCHISE_NAV = {
  team:     { path: '/team',     icon: '▣', label: 'My Team',    blurb: 'Set your lineup and see your roster.' },
  matchup:  { path: '/matchup',  icon: '⚔', label: 'Matchup',    blurb: "This week's game, and every other game in the league." },
  league:   { path: '/league',   icon: '▤', label: 'League',     blurb: 'Standings, power rankings and the weekly recap.' },
  wire:     { path: '/wire',     icon: '⚡', label: 'Add/Drop',   blurb: 'Free agents, waiver claims, and dropping a player.' },
  coach:    { path: '/coach',    icon: '✦', label: 'DASH Coach', blurb: 'What the model would change about your lineup.' },
  trades:   { path: '/trades',   icon: '⇄', label: 'Trades',     blurb: 'Offer a deal, answer one, see the league history.' },
  feed:     { path: '/feed',     icon: '◎', label: 'Feed',       blurb: 'League chat and every transaction as it happens.' },
  draft:    { path: '',          icon: '◈', label: 'Draft Board', blurb: 'The board, pick by pick, and who took whom.' },
  settings: { path: '/settings', icon: '⚙', label: 'Commissioner', blurb: 'League rules, invites and the control room.' },
}

/** The four that earn a slot on the phone bar. */
export const FRANCHISE_BAR = ['team', 'matchup', 'league', 'wire']

/** Everything else, in the order the More sheet lists it. `settings` is
 *  appended by the caller only for a commissioner. */
export const FRANCHISE_MORE = ['coach', 'trades', 'feed', 'draft']

/** Desktop rail order — every stop, one row, unchanged in spirit. */
export const FRANCHISE_RAIL = ['draft', 'team', 'matchup', 'league', 'wire', 'trades', 'feed', 'coach']

export const franchiseHref = (leagueId, key) =>
  `/fantasy/league/${leagueId}${FRANCHISE_NAV[key]?.path ?? ''}`
