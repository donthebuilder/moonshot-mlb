// 🏈 THE THIRTY-TWO, WITH THEIR OWN COLOURS.
//
// Lifted verbatim out of components/fantasy/NflTeamMark.js on 2026-08-31.
// Nothing about the values changed; what changed is that a render component
// is no longer the place thirty-four club palettes live.
//
// THIS IS THE NFL TWIN OF lib/mlbTeams.js, and it keeps that file's two rules
// without restating them at length:
//
//   1. A TEAM COLOUR IS AN IDENTITY, NOT A DATA COLOUR. Nothing here may
//      shade a value, fill a bar, or rank anything. The moment a club hue
//      lands on a number the site has two colour systems saying different
//      things in the same cell. Marks, chips and labels only.
//   2. ONE ENTRY PER CLUB, keyed by the abbreviation the roster rows already
//      use. Single-valued by construction — the thing check-scales exists to
//      enforce for every other concept in the repo.
//
// [primary, secondary]. FA is the free-agent slot, deliberately colourless.

export const NFL_TEAM_TONES = {
  ARI:['#97233f','#ffb612'], ATL:['#a71930','#000000'], BAL:['#241773','#9e7c0c'], BUF:['#00338d','#c60c30'],
  CAR:['#0085ca','#101820'], CHI:['#0b162a','#c83803'], CIN:['#fb4f14','#000000'], CLE:['#311d00','#ff3c00'],
  DAL:['#003594','#869397'], DEN:['#fb4f14','#002244'], DET:['#0076b6','#b0b7bc'], GB:['#203731','#ffb612'],
  HOU:['#03202f','#a71930'], IND:['#002c5f','#a2aaad'], JAX:['#006778','#d7a22a'], KC:['#e31837','#ffb81c'],
  LV:['#000000','#a5acaf'], LAC:['#0080c6','#ffc20e'], LA:['#003594','#ffa300'], LAR:['#003594','#ffa300'],
  MIA:['#008e97','#fc4c02'], MIN:['#4f2683','#ffc62f'], NE:['#002244','#c60c30'], NO:['#101820','#d3bc8d'],
  NYG:['#0b2265','#a71930'], NYJ:['#125740','#ffffff'], PHI:['#004c54','#a5acaf'], PIT:['#101820','#ffb612'],
  SF:['#aa0000','#b3995d'], SEA:['#002244','#69be28'], TB:['#d50a0a','#ff7900'], TEN:['#0c2340','#4b92db'],
  WAS:['#5a1414','#ffb612'], FA:['#343434','#777777'],
}

/** [primary, secondary] for a club code; the free-agent pair for anything unknown. */
export function nflTones(team) {
  return NFL_TEAM_TONES[String(team || 'FA').toUpperCase()] || NFL_TEAM_TONES.FA
}
