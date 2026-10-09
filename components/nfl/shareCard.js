// THE TUDDY PICK CARD (fix14, 2026-10-08): one NFL pick, pregame or graded, on
// the same card kit as MOONSHOT's (lib/cards: 1080 x 1350, one frame, one
// header, one footer, the product's accent, his face and his club's logo).
// PREGAME vs GRADED is still decided by the DATA: a `hit` (true / false /
// null-for-void) makes it a result card, otherwise it is the pregame case.
//
// Shape of `pick`:
//   name, team, opp, position   who, and against whom
//   espnId                      his photo (the player row's espn_id), when there is one
//   market, marketLabel         which of the seven markets (lib/nfl/theme.js MARKETS)
//   rank, bar                   this rung's position on the card, and the market's bar
//   questionable, low_sample    the flags Picks.js already renders
//   status                      'called' | 'board' | 'off' when the caller knows it (lib/callStatus)
//   score                       0-100, pregame mode when present
//   hit, actual, void, grade    graded mode when `hit` is present; `actual` the stat that graded it
import { pickCard } from '../../lib/cards/cards'
import { savePng, slug, stamp } from '../../lib/cards/kit'

export async function downloadNflPickCard(pick = {}) {
  const graded = pick.hit === true || pick.hit === false || pick.void === true
  try {
    const card = await pickCard('nfl', pick)
    savePng(card.c, `${graded ? 'result' : 'pick'}-${slug(pick.market, 'pick')}-${slug(pick.name, 'pick')}_${stamp(pick.day || '')}.png`)
  } catch (e) { console.error('pick card failed', e) }
}
