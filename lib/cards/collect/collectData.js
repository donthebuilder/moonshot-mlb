// THE COLLECTIBLE CARD'S MODEL (server only, no JSX): a validated moment data row -> the model lib/cards/collect/collectCard.js draws. It reuses buildSpecialModel (every word on
// the card is the special card's, from the stored event) and adds the three things the collectible needs: the VERIFIED portrait (lib/cards/portrait), the real deterministic
// card id (lib/cards/rulesV2.js) and the issue slot, which reads PREVIEW until the issuance table exists. Read-only: nothing here writes or posts.
import { subjectOf, buildSpecialModel, identityOf } from '../specialData'
import { resolvePortrait, placeholderFor } from '../portrait'
import { cardIdOf, RULES_VERSION, tierOf } from '../rulesV2'

/** The picture mode a sport's collect card asks for first (a table, not a branch): MLB has a tag-free action photograph; the others draw headshots. */
const DEFAULT_MODE = { mlb: 'action' }

/**
 * @param key   a moment key (lib/cards/moments.js)
 * @param row   its data row
 * @param opts  test: true  = a TEST row: no portrait is fetched (a made-up skater never wears a real man's face), the card prints TEST DATA
 *              styleOnly: true = the look is drawn for a tier the event did not earn (previews of the frame); the card says so on its face
 *              portrait: false = skip the portrait fetch (offline checks)
 *              mode: 'action' | 'headshot' (MLB defaults to its action photograph, falling back to the silo headshot); enhance: false draws the picture as the source sent it
 * @returns { model, portrait, earned, id } or null when the row is not that moment
 */
export async function collectModel(key, row, { test = false, styleOnly = false, portrait = true, mode = null, enhance = true } = {}) {
  const who = subjectOf(key, row)
  if (!who) return null
  const earned = tierOf(key, row)
  if (!earned) return null
  const id = cardIdOf({ sport: who.sport, key, row })
  let pr = { ok: false, reason: test ? 'test row: no real portrait' : 'not asked', placeholder: placeholderFor(who.sport, who.name) }
  if (!test && portrait) pr = await resolvePortrait({ sport: who.sport, playerId: who.playerId, team: who.team, name: who.name }, { mode: mode || DEFAULT_MODE[who.sport] || 'headshot', enhance })
  // number, position and the club mark come from the sport's own adapter; its (unvalidated) face is discarded: only the validated portrait is ever drawn
  const ident = test ? {} : await identityOf(who.sport, { player_id: who.playerId, team: who.team, pos: null })
  const model = buildSpecialModel(key, row, { ident: { ...ident, face: pr.ok ? pr.dataUri : '' }, test })
  if (!model) return null
  model.placeholder = pr.ok ? null : pr.placeholder
  model.portraitMode = pr.ok ? pr.mode : null
  model.collect = {
    cardId: id?.cardId || null, slotId: id?.slotId || null, rulesVersion: RULES_VERSION, issue: 'PREVIEW', styleOnly,
    portrait: pr.ok ? { provider: pr.provider, mode: pr.mode, sourceUrl: pr.sourceUrl, verified: pr.verified, width: pr.width, height: pr.height, enhanced: pr.enhanced, metadata: pr.metadata, fellBackFrom: pr.fellBackFrom } : { placeholder: true, reason: pr.reason },
  }
  return { model, portrait: pr, earned, id }
}
