// THE COLLECTIBLE CARD'S MODEL (server only, no JSX): a validated moment data row -> the model lib/cards/collect/collectCard.js draws. It reuses buildSpecialModel (every word on
// the card is the special card's, from the stored event) and adds the three things the collectible needs: the VERIFIED portrait (lib/cards/portrait), the real deterministic
// card id (lib/cards/rulesV2.js) and the issue slot, which reads PREVIEW until the issuance table exists. Read-only: nothing here writes or posts.
import { subjectOf, buildSpecialModel, identityOf } from '../specialData'
import { resolvePortrait, placeholderFor } from '../portrait'
import { cardIdOf, RULES_VERSION, tierOf } from '../rulesV2'

/**
 * @param key   a moment key (lib/cards/moments.js)
 * @param row   its data row
 * @param opts  test: true  = a TEST row: no portrait is fetched (a made-up skater never wears a real man's face), the card prints TEST DATA
 *              styleOnly: true = the look is drawn for a tier the event did not earn (previews of the frame); the card says so on its face
 *              portrait: false = skip the portrait fetch (offline checks)
 * @returns { model, portrait, earned, id } or null when the row is not that moment
 */
export async function collectModel(key, row, { test = false, styleOnly = false, portrait = true } = {}) {
  const who = subjectOf(key, row)
  if (!who) return null
  const earned = tierOf(key, row)
  if (!earned) return null
  const id = cardIdOf({ sport: who.sport, key, row })
  let pr = { ok: false, reason: test ? 'test row: no real portrait' : 'not asked', placeholder: placeholderFor(who.sport, who.name) }
  if (!test && portrait) pr = await resolvePortrait({ sport: who.sport, playerId: who.playerId, team: who.team, name: who.name })
  // number, position and the club mark come from the sport's own adapter; its (unvalidated) face is discarded: only the validated portrait is ever drawn
  const ident = test ? {} : await identityOf(who.sport, { player_id: who.playerId, team: who.team, pos: null })
  const model = buildSpecialModel(key, row, { ident: { ...ident, face: pr.ok ? pr.dataUri : '' }, test })
  if (!model) return null
  model.placeholder = pr.ok ? null : pr.placeholder
  model.collect = {
    cardId: id?.cardId || null, slotId: id?.slotId || null, rulesVersion: RULES_VERSION, issue: 'PREVIEW', styleOnly,
    portrait: pr.ok ? { provider: pr.provider, sourceUrl: pr.sourceUrl, verified: pr.verified, width: pr.width, height: pr.height } : { placeholder: true, reason: pr.reason },
  }
  return { model, portrait: pr, earned, id }
}
