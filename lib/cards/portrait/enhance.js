// THE PORTRAIT BRIGHTENER (server only, sharp): the league cut-outs are dull under the card's dark ground, so a verified portrait is lifted before it is drawn:
//   1. a modest gamma lift (midtones only: black and white stay put, so nothing clips),
//   2. local contrast ("clarity"): the picture minus a wide blur, weighted to the midtones and capped, so skin and jersey texture read without halos,
//   3. a gentle saturation lift.
// NO geometry is touched (no resize, crop, warp or sharpen of features): the face is exactly the face the source gave. The transparent edge of a cut-out is handled with
// premultiplied (alpha-weighted) blurring, so the silhouette gets no dark halo. Tuned per source below; `stats` reports the mean brightness before / after and how many
// pixels sit at the clip points, which check-portrait.mjs asserts (the lift is real, and nothing clips that did not already).
export const PROFILES = {
  // NHL mug: 336 px, transparent, flat studio light on a dark jersey
  nhl_mug:    { gamma: 1.22, clarity: 0.34, radius: 0.045, sat: 1.10, lift: 0 },
  // MLB silo: 480 px, transparent, already crisper
  mlb_silo:   { gamma: 1.14, clarity: 0.30, radius: 0.045, sat: 1.07, lift: 0 },
  // ESPN headshot: 600 x 436, transparent, slightly soft
  espn_nfl:   { gamma: 1.18, clarity: 0.32, radius: 0.045, sat: 1.08, lift: 0 },
  // MLB action photo: a finished 900 x 1350 photograph, so only a light touch
  mlb_action: { gamma: 1.05, clarity: 0.20, radius: 0.03, sat: 1.04, lift: 0 },
}

// the highlight knee: above KNEE a channel is compressed (tanh) so a lifted bright area keeps its detail and never reaches the clip point; values at or below it pass unchanged
const KNEE = 222, SPAN = 30
const soft = (v) => (v <= KNEE ? (v < 3 ? 3 : v) :KNEE + SPAN * Math.tanh((v - KNEE) / SPAN))
const clamp8 = (v) => Math.round(Math.min(254, soft(v)))

/** @returns {{ bytes: Buffer, contentType: string, profile: string, stats: { before: number, after: number, clipBefore: number, clipAfter: number } } | null} null when sharp or the picture fails (the caller keeps the original). */
export async function enhancePortrait(bytes, profileName) {
  const p = PROFILES[profileName]
  if (!p) return null
  try {
    const sharp = (await import('sharp')).default
    const src = sharp(bytes)
    const meta = await src.metadata()
    const { width: w, height: h } = meta
    const hasAlpha = Boolean(meta.hasAlpha)
    const { data: rgba } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const n = w * h
    const A = new Float32Array(n)
    for (let i = 0; i < n; i += 1) A[i] = rgba[i * 4 + 3] / 255
    // premultiplied RGB and alpha, blurred together: the blurred colour is the alpha-weighted average, so transparent pixels contribute nothing
    const sigma = Math.max(2, Math.round(Math.min(w, h) * p.radius))
    const pre = Buffer.alloc(n * 3)
    for (let i = 0; i < n; i += 1) for (let c = 0; c < 3; c += 1) pre[i * 3 + c] = Math.round(rgba[i * 4 + c] * A[i])
    const blurRgb = await sharp(pre, { raw: { width: w, height: h, channels: 3 } }).blur(sigma).raw().toBuffer()
    const aBuf = Buffer.alloc(n)
    for (let i = 0; i < n; i += 1) aBuf[i] = Math.round(A[i] * 255)
    // sharp hands a blurred single-channel buffer back as 3 channels: read it with its own channel count
    const blurAo = await sharp(aBuf, { raw: { width: w, height: h, channels: 1 } }).blur(sigma).raw().toBuffer({ resolveWithObject: true })
    const blurA = blurAo.data, aCh = blurAo.info.channels
    const lut = new Uint8Array(256)
    for (let v = 0; v < 256; v += 1) lut[v] = Math.round(255 * Math.pow(v / 255, 1 / p.gamma))
    const out = Buffer.alloc(n * 4)
    let sumB = 0, sumA = 0, clipB = 0, clipA = 0, cnt = 0
    for (let i = 0; i < n; i += 1) {
      const a = rgba[i * 4 + 3]
      out[i * 4 + 3] = a
      if (a < 8) continue
      const ba = Math.max(blurA[i * aCh] / 255, 1 / 255)
      const r0 = rgba[i * 4], g0 = rgba[i * 4 + 1], b0 = rgba[i * 4 + 2]
      const lumB = 0.2126 * r0 + 0.7152 * g0 + 0.0722 * b0
      if (a > 200) { sumB += lumB; cnt += 1; if (r0 >= 253 || g0 >= 253 || b0 >= 253 || (r0 <= 2 && g0 <= 2 && b0 <= 2)) clipB += 1 }
      const px = [r0, g0, b0]
      const lifted = px.map((v) => lut[v])
      // clarity: the lifted value plus a capped, midtone-weighted fraction of (value - local mean)
      const lum = 0.2126 * lifted[0] + 0.7152 * lifted[1] + 0.0722 * lifted[2]
      const mid = Math.max(0.25, 1 - Math.abs(lum - 128) / 150)
      const done = lifted.map((v, c) => {
        const local = Math.min(255, blurRgb[i * 3 + c] / ba)
        const d = Math.max(-38, Math.min(38, (v - lut[Math.round(local)]) * p.clarity * mid * 2))
        return v + d
      })
      // saturation about the pixel's own grey (no hue shift, no brightness change)
      const grey = 0.2126 * done[0] + 0.7152 * done[1] + 0.0722 * done[2]
      for (let c = 0; c < 3; c += 1) out[i * 4 + c] = clamp8(grey + (done[c] - grey) * p.sat)
      if (a > 200) {
        const r1 = out[i * 4], g1 = out[i * 4 + 1], b1 = out[i * 4 + 2]
        sumA += 0.2126 * r1 + 0.7152 * g1 + 0.0722 * b1
        if (r1 >= 253 || g1 >= 253 || b1 >= 253 || (r1 <= 2 && g1 <= 2 && b1 <= 2)) clipA += 1
      }
    }
    const img = sharp(out, { raw: { width: w, height: h, channels: 4 } })
    const png = hasAlpha
    const bytesOut = png ? await img.png({ compressionLevel: 6 }).toBuffer() : await img.removeAlpha().jpeg({ quality: 92, chromaSubsampling: '4:4:4' }).toBuffer()
    return { bytes: bytesOut, contentType: png ? 'image/png' : 'image/jpeg', profile: profileName, stats: { before: Math.round(sumB / Math.max(1, cnt)), after: Math.round(sumA / Math.max(1, cnt)), clipBefore: clipB / Math.max(1, cnt), clipAfter: clipA / Math.max(1, cnt) } }
  } catch (e) {
    return null
  }
}
