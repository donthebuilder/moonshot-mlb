// THE COLLECTIBLE CARD'S MODEL (server only, no JSX): a validated moment data row -> the model lib/cards/collect/collectCard.js draws. It reuses buildSpecialModel (every word on
// the card is the special card's, from the stored event) and adds the three things the collectible needs: the VERIFIED portrait (lib/cards/portrait), the real deterministic
// card id (lib/cards/rulesV2.js) and the issue slot, which reads PREVIEW until the issuance table exists. Read-only: nothing here writes or posts.
import { subjectOf, buildSpecialModel, identityOf } from '../specialData'
import { createHash } from 'node:crypto'
import { resolvePortrait, placeholderFor, kindsOf } from '../portrait'
import { TIERS } from '../moments'
import { VIEWS } from './collectCard'
import { cardIdOf, RULES_VERSION, tierOf } from '../rulesV2'

/** A number from a string, the same every time (the first 32 bits of its sha256). */
const num = (s) => parseInt(createHash('sha256').update(String(s)).digest('hex').slice(0, 8), 16)
/**
 * WHICH PHOTOGRAPH AND WHICH VIEW (Donovan 2026-10-14: the four tiers of one player must not all wear the same picture), a pure function of the CARD ID and the tier drawn:
 *   kind  rotates through the sport's clean photographs (MLB: headshot silo, action, hero, studio; NHL and NFL have one), starting at hash(card id) and stepping one per tier;
 *   view  rotates through VIEWS (zoom, shift, how far the photo drops, the side the light comes from, the backlight's colour) the same way.
 * Same card id and tier, same answer, always. Every kind still passes the identity check and the metadata gate (lib/cards/portrait).
 */
export function variantFor({ sport, cardId, tier }) {
  const kinds = kindsOf(sport)
  const t = Math.max(0, TIERS.indexOf(tier))
  const seed = String(cardId || 'no-id')
  return { kind: kinds.length ? kinds[(num(`kind:${seed}`) + t) % kinds.length] : 'headshot', view: VIEWS[(num(`view:${seed}`) + t) % VIEWS.length] }
}

/**
 * @param key   a moment key (lib/cards/moments.js)
 * @param row   its data row
 * @param opts  test: true  = a TEST row: no portrait is fetched (a made-up skater never wears a real man's face), the card prints TEST DATA
 *              styleOnly: true = the look is drawn for a tier the event did not earn (previews of the frame); the card says so on its face
 *              portrait: false = skip the portrait fetch (offline checks)
 *              mode: a picture kind to force ('headshot', or for MLB 'action' | 'hero' | 'studio'; default = variantFor(card id, tier)); tier: the tier being drawn (default the earned one; it steps the variant); enhance: false draws the picture as the source sent it
 * @returns { model, portrait, earned, id } or null when the row is not that moment
 */
export async function collectModel(key, row, { test = false, styleOnly = false, portrait = true, mode = null, enhance = true, tier = null } = {}) {
  const who = subjectOf(key, row)
  if (!who) return null
  const earned = tierOf(key, row)
  if (!earned) return null
  const id = cardIdOf({ sport: who.sport, key, row })
  const variant = variantFor({ sport: who.sport, cardId: id?.cardId, tier: tier || earned })
  let pr = { ok: false, reason: test ? 'test row: no real portrait' : 'not asked', placeholder: placeholderFor(who.sport, who.name) }
  if (!test && portrait) pr = await resolvePortrait({ sport: who.sport, playerId: who.playerId, team: who.team, name: who.name }, { mode: mode || variant.kind, enhance })
  // number, position and the club mark come from the sport's own adapter; its (unvalidated) face is discarded: only the validated portrait is ever drawn
  const ident = test ? {} : await identityOf(who.sport, { player_id: who.playerId, team: who.team, pos: null })
  const model = buildSpecialModel(key, row, { ident: { ...ident, face: pr.ok ? pr.dataUri : '' }, test })
  if (!model) return null
  model.placeholder = pr.ok ? null : pr.placeholder
  model.rawUri = pr.ok ? pr.rawDataUri : null   // the photo as the source sent it (for the face-brightness check)
  model.portraitMode = pr.ok ? pr.mode : null
  model.portraitLayout = pr.ok ? pr.layout : null
  model.portraitFace = pr.ok ? pr.face : null
  model.portraitBg = pr.ok ? pr.bg : null
  model.view = variant.view
  model.collect = {
    variant: { kind: variant.kind, view: variant.view },
    priceSource: key === 'long_shot_cashed' ? row.price_source || null : null,
    cardId: id?.cardId || null, slotId: id?.slotId || null, rulesVersion: RULES_VERSION, issue: 'PREVIEW', styleOnly,
    portrait: pr.ok ? { provider: pr.provider, mode: pr.mode, sourceUrl: pr.sourceUrl, verified: pr.verified, width: pr.width, height: pr.height, enhanced: pr.enhanced, metadata: pr.metadata, fellBackFrom: pr.fellBackFrom } : { placeholder: true, reason: pr.reason },
  }
  return { model, portrait: pr, earned, id }
}
