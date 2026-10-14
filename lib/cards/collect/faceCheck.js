// THE FACE-BRIGHTNESS CHECK (server only): nothing on a card may darken the player. For a rendered card it measures the mean luminance of the FACE BOX (the per-source box in
// lib/cards/portrait/*.js, mapped onto the card by lib/cards/collect/collectCard.js faceRectOnCard) and compares it with the same box on the RAW photo as the source sent it.
// A box is a fixed fraction of the picture (head and upper face), not face detection: it is a stable yardstick, the same for the raw and the finished card.
import { faceMean } from '../portrait/enhance'
import { faceRectOnCard } from './collectCard'

const bytesOf = (dataUri) => Buffer.from(String(dataUri).split(',')[1] || '', 'base64')

/** Mean luminance (0-255) of a rectangle of a rendered card PNG (full 1000 x 1400), or null. */
export async function cardRegionMean(png, rect) {
  if (!rect) return null
  const sharp = (await import('sharp')).default
  const { data, info } = await sharp(png).removeAlpha().extract({ left: rect.x, top: rect.y, width: rect.w, height: rect.h }).raw().toBuffer({ resolveWithObject: true })
  let sum = 0
  for (let i = 0; i < data.length; i += info.channels) sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]
  return sum / (data.length / info.channels)
}

/**
 * @param model   the collect model (lib/cards/collect/collectData.js)
 * @param tier    the tier drawn
 * @param png     the card PNG at the DESIGN size (renderCollect without width)
 * @param rawUri  the raw photo as a data URI (resolvePortrait's rawDataUri)
 * @returns { raw, card, ratio } or null when the card wears a placeholder
 */
export async function faceBrightness(model, tier, png, rawUri) {
  const rect = faceRectOnCard(model, tier)
  if (!rect || !model.portraitFace || !rawUri) return null
  const raw = await faceMean(bytesOf(rawUri), model.portraitFace)
  const card = await cardRegionMean(png, rect)
  if (raw == null || card == null) return null
  return { raw: Math.round(raw * 10) / 10, card: Math.round(card * 10) / 10, ratio: Math.round((card / raw) * 1000) / 1000, rect }
}
