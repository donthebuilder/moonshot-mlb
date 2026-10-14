// THE PORTRAIT ADAPTER (server only). Donovan's brief of 2026-10-14, section 4: a card wears a REAL, VERIFIED portrait of the right athlete, or an intentional
// per-sport placeholder. NEVER another athlete. One interface, one adapter per source already in the code (nhl.js, mlb.js, nfl.js).
//
//   resolvePortrait({ sport, playerId, team, name? }, { get? })  ->
//     { ok:true,  provider, sport, playerId, team, sourceUrl, identityUrl, contentType, bytes, width, height, dataUri, verified:{ id, team, name }, rights }
//     { ok:false, placeholder:{ kind, sport, initials }, reason, provider, rights }
//
// THE CONTRACT an adapter fulfils (see nhl.js for the model):
//   provider       the source's name, recorded on every card ("nhl-assets-mugs")
//   rights         { productionReady:false, status, terms:[urls read], note }  -- NO adapter is production-ready until access, rights, limits and real image quality
//                  are all verified (brief section 10). productionReady is false for all three today, and the render route is preview only.
//   plan(ref)      { identityUrl, imageUrl } built from the STABLE ID (never a name), or null when the id is not one this source understands
//   identify(ref, json)   asks the source's OWN identity record -> { id, name, team, imageUrl }: the id, club and name it says are what we check against
//   urlOk(url, ref)       the image URL must carry the same id (and club, where the path has one) as the ref
// resolvePortrait then fetches the picture WITHOUT following redirects (a redirect is how a source hands back a default silhouette), and refuses anything that is
// not an image of a sane size. A mismatch on id, club or name anywhere is a PLACEHOLDER with the reason, never a guess and never someone else.
import { auditMetadata } from './metadata'
import { enhancePortrait } from './enhance'
import nhl from './nhl'
import mlb from './mlb'
import nfl from './nfl'

export const ADAPTERS = { nhl, mlb, nfl }
export const MIN_BYTES = 3000
/** The picture kinds a sport can draw, in rotation order: its headshot first, then any extra clean photographs (MLB: action, hero, studio). */
export const kindsOf = (sport) => (ADAPTERS[sport] ? ['headshot', ...Object.keys(ADAPTERS[sport].kinds || {})] : [])
export const MIN_SIDE = 200
const TTL = 6 * 3600e3
const _cache = new Map()

const initialsOf = (name) => String(name || '').split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase()
/** The intentional placeholder of a sport: a monogram on the sport's crest (drawn by the card; no photo, no silhouette of anyone). */
export const placeholderFor = (sport, name) => ({ kind: 'monogram', sport, initials: initialsOf(name) })
const no = (ref, adapter, reason) => ({ ok: false, reason, provider: adapter?.provider || null, rights: adapter?.rights || null, placeholder: placeholderFor(ref?.sport, ref?.name) })

const timed = async (url, init = {}, timeout = 6000) => {
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), timeout)
  try { return await fetch(url, { ...init, signal: ctl.signal, headers: { 'User-Agent': 'DASHNetwork/1.0 (+https://dashnetwork.vercel.app)', ...(init.headers || {}) } }) } finally { clearTimeout(t) }
}
/** The default fetchers (injectable for tests): JSON from an official identity URL; the picture, redirects NOT followed. */
export const defaultGet = {
  json: async (url) => { const r = await timed(url, { headers: { Accept: 'application/json' } }); if (!r.ok) throw new Error(`identity ${r.status}`); return r.json() },
  image: async (url) => {
    const r = await timed(url, { redirect: 'manual' })
    const bytes = r.status === 200 ? Buffer.from(await r.arrayBuffer()) : Buffer.alloc(0)
    return { status: r.status, contentType: (r.headers.get('content-type') || '').split(';')[0], location: r.headers.get('location') || '', bytes }
  },
}

const sameTeam = (a, b) => String(a || '').trim().toUpperCase() === String(b || '').trim().toUpperCase()
/** Loose but safe: the stored name and the source's name share a last word (accents, case and Jr / Sr ignored). A mismatch is a placeholder. */
export const nameMatches = (a, b) => {
  const last = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z\s-]/g, '').trim().split(/\s+/).filter((w) => w && !/^(jr|sr|ii|iii|iv)$/.test(w)).at(-1)
  return Boolean(last(a)) && last(a) === last(b)
}

export async function resolvePortrait(ref, { get = defaultGet, now = Date.now(), cache = true, mode = 'headshot', enhance = true } = {}) {
  const adapter = ADAPTERS[ref?.sport]
  if (!adapter) return no(ref, null, 'no portrait adapter for this sport')
  if (!ref.playerId || !ref.team) return no(ref, adapter, 'needs a stable player id and a club to verify')
  const key = `${ref.sport}:${ref.playerId}:${String(ref.team).toUpperCase()}:${mode}:${enhance ? 'e' : 'r'}`
  const hit = cache ? _cache.get(key) : null
  if (hit && now - hit.at < TTL) return hit.v
  const v = await resolveUncached(ref, adapter, get, { mode, enhance })
  if (cache) { if (_cache.size > 500) _cache.clear(); _cache.set(key, { at: now, v }) }
  return v
}

/** Fetch one candidate picture and put it through every gate: status, type, size, METADATA (no copyright / credit / agency tag), then the brightener. Returns { ok, ... } or { ok:false, reason }. */
async function takePicture(url, profile, get, enhance, layout) {
  let img
  try { img = await get.image(url) } catch (e) { return { ok: false, reason: `picture fetch failed (${e?.message || e})` } }
  if (img.status !== 200) return { ok: false, reason: img.status >= 300 && img.status < 400 ? `picture redirects (${img.status}: a default image, not this athlete)` : `picture answered ${img.status}` }
  if (!/^image\//.test(img.contentType)) return { ok: false, reason: `not an image (${img.contentType || 'no type'})` }
  if (img.bytes.length < MIN_BYTES) return { ok: false, reason: `picture too small (${img.bytes.length} bytes)` }
  const audit = auditMetadata(img.bytes)
  if (!audit.clean) return { ok: false, reason: `picture carries copyright / credit metadata or cannot be audited (${audit.findings.map((f) => `${f.where}: ${f.match}`).join('; ')})`, audit }
  let width = null, height = null
  try {
    const meta = await (await import('sharp')).default(img.bytes).metadata()
    width = meta.width || null; height = meta.height || null
  } catch { /* sharp unavailable: size not checked */ }
  if (width != null && Math.min(width, height) < MIN_SIDE) return { ok: false, reason: `picture too small (${width}x${height})` }
  let bytes = img.bytes, contentType = img.contentType, enhanced = null
  if (enhance) {
    const e = await enhancePortrait(img.bytes, profile)
    if (e) { bytes = e.bytes; contentType = e.contentType; enhanced = { profile: e.profile, ...e.stats } }
  }
  // a studio photograph has an opaque backdrop: its own colour (the two top corners) is returned so the card can extend it past the picture's edges
  let bg = null
  if (layout === 'studio') {
    try {
      const sharp = (await import('sharp')).default
      const { data } = await sharp(bytes).extract({ left: 0, top: 0, width: Math.min(16, width), height: Math.min(16, height) }).removeAlpha().raw().toBuffer({ resolveWithObject: true })
      let r = 0, g = 0, b = 0
      const n = data.length / 3
      for (let i = 0; i < data.length; i += 3) { r += data[i]; g += data[i + 1]; b += data[i + 2] }
      bg = [r, g, b].map((v) => Math.round(v / n))
    } catch { bg = null }
  }
  return { ok: true, bytes, rawBytes: img.bytes, rawType: img.contentType, contentType, width, height, enhanced, audit, bg }
}

async function resolveUncached(ref, adapter, get, { mode, enhance }) {
  const plan = adapter.plan(ref)
  if (!plan) return no(ref, adapter, 'no id this source understands')
  let who
  try { who = await adapter.identify(ref, get.json) } catch (e) { return no(ref, adapter, `identity lookup failed (${e?.message || e})`) }
  if (!who) return no(ref, adapter, 'the source has no such athlete')
  // IDENTITY: the source's own id, club and (when we have it) name must all agree with what the card says. Done ONCE, before any picture of either mode is touched.
  if (String(who.id) !== String(ref.playerId)) return no(ref, adapter, `id mismatch (asked ${ref.playerId}, source says ${who.id})`)
  if (!sameTeam(who.team, ref.team)) return no(ref, adapter, `club mismatch (card says ${ref.team}, source says ${who.team || 'none'})`)
  if (ref.name && who.name && !nameMatches(ref.name, who.name)) return no(ref, adapter, `name mismatch (card says ${ref.name}, source says ${who.name})`)
  // the candidates, best first: the action photograph when asked for and the source has one, then the headshot
  const tries = []
  const kind = adapter.kinds && adapter.kinds[mode]
  if (kind) { const kp = kind.plan(ref); if (kp?.imageUrl && kind.urlOk(kp.imageUrl, ref)) tries.push({ mode, url: kp.imageUrl, profile: kind.profile, layout: kind.layout, face: kind.face }) }
  const imageUrl = who.imageUrl || plan.imageUrl
  if (imageUrl && adapter.urlOk(imageUrl, ref, plan)) tries.push({ mode: 'headshot', url: imageUrl, profile: adapter.profile, layout: 'cutout', face: adapter.face })
  if (!tries.length) return no(ref, adapter, "the picture URL does not carry this athlete's id and club")
  const skipped = []
  for (const t of tries) {
    const got = await takePicture(t.url, t.profile, get, enhance, t.layout)
    if (!got.ok) { skipped.push({ mode: t.mode, reason: got.reason }); continue }
    return {
      ok: true, provider: adapter.provider, sport: ref.sport, playerId: String(ref.playerId), team: String(ref.team).toUpperCase(), mode: t.mode, layout: t.layout, fullBleed: t.layout === 'bleed', face: t.face, bg: got.bg, sourceUrl: t.url, identityUrl: plan.identityUrl,
      contentType: got.contentType, bytes: got.bytes.length, width: got.width, height: got.height, dataUri: `data:${got.contentType};base64,${got.bytes.toString('base64')}`,
      rawDataUri: `data:${got.rawType};base64,${got.rawBytes.toString('base64')}`,
      enhanced: got.enhanced, metadata: { clean: true, format: got.audit.format, segments: got.audit.chunks }, fellBackFrom: skipped.length ? skipped : null,
      verified: { id: true, team: true, name: Boolean(ref.name && who.name) }, rights: adapter.rights,
    }
  }
  return no(ref, adapter, skipped.map((s) => `${s.mode}: ${s.reason}`).join(' | '))
}
export const _resetPortraitCache = () => _cache.clear()
