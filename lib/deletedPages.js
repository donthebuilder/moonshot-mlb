// PAGES THAT WERE DELETED, AND WHERE THEIR OLD ADDRESSES LAND (2026-10-07, Donovan's cleanup call).
//   Derby          the home-run derby board: gone. Its job (who is likely to go deep) is the Rankings board.
//   Parlay Builder gone as a page; what helped people pair players lives on the bet slip (components/props/BetSlip.js:
//                  the pair hints, the same-game and measured-rule reads, the suggested partners), on the Props page.
// The Ledger lab and Score bands were folded into The Ledger earlier (lib/ledger/views.js: Archive, Record > Bands).
// Every old key, and the words people type for it, is an ALIAS on every sport, so a bookmark or a shared link
// never 404s. Spread into each sport's alias map in lib/routes.js (and lib/nhl, lib/nba); held by
// scripts/check-deleted-aliases.mjs.
export const DERBY_KEYS = ['derby', 'homerderby', 'home-run-derby', 'hrderby']
export const BUILDER_KEYS = ['builder', 'pairbuilder', 'pair-builder', 'parlaybuilder', 'parlay-builder', 'ticketbuilder', 'slip', 'betslip', 'bet-slip']
/** Each sport's landing tab for the two (the tab that exists on THAT sport). */
export const DELETED_LANDING = {
  mlb: { derby: 'fullboard', builder: 'props' },
  nfl: { derby: 'research', builder: 'picks' },
  nhl: { derby: 'fullboard', builder: 'board' },
  nba: { derby: 'fullboard', builder: 'board' },
}
/** The alias entries for one sport. */
export const deletedAliases = (sport) => {
  const to = DELETED_LANDING[sport] || DELETED_LANDING.mlb
  return {
    ...Object.fromEntries(DERBY_KEYS.map((k) => [k, to.derby])),
    ...Object.fromEntries(BUILDER_KEYS.map((k) => [k, to.builder])),
  }
}
