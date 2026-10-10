// THE PLAYER CARD KIT (server only; JSX, so scripts load it through scripts/proto-cards/_loader.mjs and the
// rest of the site reaches it only through lib/cards/cardImage.js, which imports it lazily).
// Production home of the primitives the approved prototypes (lib/cards/proto/*, kept untouched beside this) drew:
// the three fonts and the cream poster palette from lib/dash/homerCard.js, the accent from lib/sportAccent.js, the
// chassis greys from lib/design/tokens.js, the status words from lib/callStatus.js. NOTHING here names a sport: the
// per-sport words and numbers arrive in a card MODEL (lib/cards/model.js) built by an adapter (lib/cards/adapters/*).
//
// SIZE. A card is designed once at 1080 x 1350 (the phone feed's 4:5). frame() takes the width and height asked for
// and scales that one design to it, so a thumbnail and a full card are the same drawing. The type floor is 22px AT 1080
// wide (the same share of the width at any size); lintType() re-checks every text node against it.
import { ImageResponse } from 'next/og'
import { loadFonts, loadDisplay, loadMark, loadGrain, DISPLAY, INK, DIM, RULE } from '../dash/homerCard'
import { CHASSIS } from '../design/tokens'
import { alpha } from './kit'

export { DISPLAY, INK, DIM, RULE, alpha, CHASSIS }
export const INK2 = CHASSIS.text2
/** The design size, and the type floor at that size. */
export const BASE = { w: 1080, h: 1350 }
export const MIN_TYPE = 22
export const fs = (n) => Math.max(MIN_TYPE, n)
/** The sizes the routes may ask for: the design size and its 4:5 scales (a width in px; the height follows). */
export const sizeOf = (w) => {
  const width = Math.max(270, Math.min(1080, Math.round(Number(w) || BASE.w)))
  return { w: width, h: Math.round((width * BASE.h) / BASE.w) }
}

let _assets = null
export async function assets() {
  if (_assets) return _assets
  const [base, display, mark, grain] = await Promise.all([loadFonts(), loadDisplay(), loadMark(), loadGrain()])
  _assets = { fonts: [...base, ...display], mark, grain }
  return _assets
}

// ── pictures: fetched once, inlined as data URIs so a render has no network step and a miss is just "no picture" ──
const _img = new Map()
export async function inline(url, { timeout = 6000 } = {}) {
  if (!url) return ''
  if (_img.has(url)) return _img.get(url)
  let out = ''
  try {
    const ctl = new AbortController()
    const t = setTimeout(() => ctl.abort(), timeout)
    const res = await fetch(url, { signal: ctl.signal })
    clearTimeout(t)
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer())
      const type = (res.headers.get('content-type') || '').split(';')[0] || (/\.svg(\?|$)/.test(url) ? 'image/svg+xml' : 'image/png')
      if (buf.length > 200 && /^image\//.test(type)) out = `data:${type};base64,${buf.toString('base64')}`
    }
  } catch { /* no picture: the card draws its monogram / club code */ }
  if (_img.size > 400) _img.clear()
  _img.set(url, out)
  return out
}

/** A name in the display face, shrunk until it fits maxW (Big Shoulders is ~0.46em a letter, upper case). */
export const fitName = (name, size, maxW) => {
  const n = String(name || '').length || 1
  return Math.max(40, Math.min(size, Math.floor(maxW / (n * 0.46))))
}

export const field = (accent, tone) => [
  `radial-gradient(circle at 8% -8%, ${alpha(accent, 0.26)} 0%, ${alpha(accent, 0)} 46%)`,
  `radial-gradient(circle at 96% 108%, ${alpha(tone || accent, 0.2)} 0%, ${alpha(tone || accent, 0)} 50%)`,
  CHASSIS.bg,
].join(', ')

/** The CALLED rarity: a foil strip. Used ONLY when the status is 'called' (the callers gate on it). */
export const foil = (accent) => `linear-gradient(100deg, ${accent} 0%, ${alpha(INK, 0.95)} 22%, ${accent} 44%, ${alpha(INK, 0.7)} 66%, ${accent} 84%, ${alpha(INK, 0.9)} 100%)`

export const Bar = ({ pct, w, h = 12, color, accent }) => (
  <div style={{ display: 'flex', width: w, height: h, borderRadius: h / 2, background: alpha(INK, 0.1) }}>
    <div style={{ display: 'flex', width: `${Math.max(4, Math.min(100, pct))}%`, height: h, borderRadius: h / 2, background: color || accent }} />
  </div>
)

/** The product's own standout rule (CLAUDE.md, DenseTable skin v2): top ~20% glow in the accent, bottom ~20% recede. */
export const heat = (pct, accent) => (pct == null ? { c: INK, hot: false } : pct >= 80 ? { c: accent, hot: true } : pct <= 20 ? { c: DIM, hot: false } : { c: INK, hot: false })

export const ord = (p) => { const n = Math.round(p); const r = n % 100; return `${n}${r >= 11 && r <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'}` }

export function Stat({ s, w, accent, big = 60 }) {
  const h = heat(s.pct, accent)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: w, padding: '12px 18px 14px 18px', borderRadius: 14, background: alpha(INK, 0.05), border: `2px solid ${h.hot ? alpha(accent, 0.75) : alpha(INK, 0.12)}` }}>
      <span style={{ fontSize: fs(22), fontWeight: 800, color: DIM, letterSpacing: 0.4, whiteSpace: 'nowrap' }}>{s.label}</span>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 4 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontFamily: DISPLAY, fontSize: big, fontWeight: 900, lineHeight: 1, color: h.c }}>{s.value}</span>
          {s.unit ? <span style={{ fontSize: fs(22), fontWeight: 800, color: DIM }}>{s.unit}</span> : null}
        </div>
        {s.pct != null ? <span style={{ fontSize: fs(24), fontWeight: 800, color: h.c }}>{ord(s.pct)}</span> : null}
      </div>
      {s.pct != null ? (
        <div style={{ display: 'flex', marginTop: 10 }}><Bar pct={s.pct} w={w - 40} h={12} color={h.hot ? accent : alpha(INK, 0.55)} accent={accent} /></div>
      ) : s.sub ? (
        <span style={{ fontSize: fs(22), fontWeight: 600, color: INK2, marginTop: 8, whiteSpace: 'nowrap' }}>{s.sub}</span>
      ) : <span style={{ display: 'flex', height: 0 }} />}
    </div>
  )
}

/** A face: the photo, or a monogram on the club's tone / the accent when there is none. */
export function Face({ m, w, h, accent, radius = 0 }) {
  if (m.face) return <img src={m.face} width={w} height={h} style={{ objectFit: 'cover', borderRadius: radius }} />
  const ini = String(m.name || '').split(/\s+/).filter(Boolean).map((x) => x[0]).slice(0, 2).join('').toUpperCase()
  return (
    <div style={{ display: 'flex', width: w, height: h, alignItems: 'center', justifyContent: 'center', borderRadius: radius || Math.min(w, h) / 2, background: alpha(m.tone || accent, 0.4) }}>
      <span style={{ fontFamily: DISPLAY, fontSize: Math.round(Math.min(w, h) * 0.42), fontWeight: 900, color: INK }}>{ini || '?'}</span>
    </div>
  )
}

/** The club logo (light plate when the product's marks need one); the club code in a chip when there is none. */
export function Logo({ m, size, team = m.team, src = m.logo, plate = m.logoPlate }) {
  if (src && plate) return (
    <div style={{ display: 'flex', width: size, height: size, borderRadius: size / 2, background: alpha(INK, 0.94), alignItems: 'center', justifyContent: 'center' }}>
      <img src={src} width={Math.round(size * 0.72)} height={Math.round(size * 0.72)} />
    </div>
  )
  if (src) return <img src={src} width={size} height={size} />
  return (
    <div style={{ display: 'flex', width: size, height: size, borderRadius: 12, background: alpha(INK, 0.1), alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ fontSize: fs(Math.round(size * 0.34)), fontWeight: 800, color: INK }}>{String(team || '').slice(0, 3)}</span>
    </div>
  )
}

/** The price, only when one is stored WITH its book count: '+110 best · 3 books'. Anything else draws nothing, and nothing moves. */
export const Price = ({ price, accent, size = 54 }) => {
  if (!price || !price.best || !(price.books >= 1)) return null
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
      <span style={{ fontFamily: DISPLAY, fontSize: size, fontWeight: 900, lineHeight: 1, color: accent, transform: 'skewX(-8deg)' }}>{price.best}</span>
      <span style={{ fontSize: fs(24), fontWeight: 800, color: INK }}>{`best · ${price.books} book${price.books === 1 ? '' : 's'}`}</span>
      {price.test ? <span style={{ fontSize: fs(22), fontWeight: 800, color: DIM, border: `2px solid ${alpha(INK, 0.3)}`, borderRadius: 8, padding: '1px 8px' }}>TEST PRICE</span> : null}
    </div>
  )
}

export const Foot = ({ m, right, h = 64 }) => (
  <div style={{ display: 'flex', flexDirection: 'column' }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: h, padding: '0 34px', borderTop: `2px solid ${RULE}` }}>
      <span style={{ fontSize: fs(24), fontWeight: 800, color: INK2, letterSpacing: 1 }}>{`${m.brand.name} · DASH Network`}</span>
      <span style={{ fontSize: fs(24), fontWeight: 600, color: DIM }}>{right}</span>
    </div>
  </div>
)

export const matchup = (m) => `${m.team} ${m.home === false ? '@' : 'vs'} ${m.opp}`
export const posLine = (m) => [m.pos, m.bats ? `Bats ${m.bats}` : null, m.number != null ? `#${m.number}` : null].filter(Boolean).join('  ·  ')

/** Every text node's effective font size (own, else the nearest ancestor's, else the 16px default) against the floor. Returns the offenders. */
export function lintType(node, inherited = 16, out = [], path = '') {
  if (node == null || typeof node === 'boolean') return out
  if (typeof node === 'string' || typeof node === 'number') {
    if (String(node).trim() && inherited < MIN_TYPE) out.push({ text: String(node).slice(0, 40), size: inherited, path })
    return out
  }
  if (Array.isArray(node)) { node.forEach((n) => lintType(n, inherited, out, path)); return out }
  const { type, props = {} } = node
  if (typeof type === 'function') return lintType(type(props), inherited, out, `${path}/${type.name}`)
  const size = props.style?.fontSize ?? inherited
  lintType(props.children, size, out, `${path}/${type}`)
  return out
}
/** The type-floor offenders found by the last renders in this process (scripts/check-player-cards.mjs reads and clears it). */
export const LINT = []

/**
 * THE FRAME. The root of every card: the design (BASE, 1080 x 1350) drawn once. A smaller 4:5 size is the SAME drawing, scaled down
 * by renderPng (sharp, Lanczos) after it is drawn, so a thumbnail and a full card can never differ in layout.
 */
export function Frame({ accent, tone, grain, children }) {
  return (
    <div style={{ width: BASE.w, height: BASE.h, display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden', background: field(accent, tone), color: INK, fontFamily: 'Inter' }}>
      {grain ? <img src={grain} width={BASE.w} height={BASE.h} style={{ position: 'absolute', left: 0, top: 0, opacity: 0.9 }} /> : null}
      {children}
    </div>
  )
}

/** Lint the design, render it at the design size, scale to `size` when smaller, return PNG bytes. */
export async function renderPng(el, size, { card = 'front', design = el } = {}) {
  LINT.push(...lintType(design).map((x) => ({ ...x, card })))
  const { fonts } = await assets()
  const res = new ImageResponse(el, { width: BASE.w, height: BASE.h, fonts })
  const full = Buffer.from(await res.arrayBuffer())
  if (size.w >= BASE.w) return full
  try {
    const sharp = (await import('sharp')).default
    return await sharp(full).resize(size.w, size.h, { kernel: 'lanczos3' }).png().toBuffer()
  } catch (e) { console.error(`[cards] no scaler (${e?.message || e}): the full-size card is returned`); return full }
}

/** The target mark (the closing banner and the evidence panel): three rings and a dot, one colour. */
export const Target = ({ size = 64, color = INK }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
    <circle cx="32" cy="32" r="26" fill="none" stroke={color} strokeWidth="3" />
    <circle cx="32" cy="32" r="15" fill="none" stroke={color} strokeWidth="3" />
    <circle cx="32" cy="32" r="5" fill={color} />
    <path d="M32 2 V12 M32 52 V62 M2 32 H12 M52 32 H62" stroke={color} strokeWidth="3" />
  </svg>
)
