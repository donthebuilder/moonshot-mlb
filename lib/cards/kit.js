// THE CARD KIT (fix14, 2026-10-08). Donovan: "those downloadable PNG cards:
// either make them visually better or have them removed."
//
// Every downloadable card is built from the pieces in this file and nothing
// else: ONE frame (1080 x 1350, the field, the accent bar), ONE header (the
// DASH mark, "<sport emoji> LABEL IN CAPS", the card's date), ONE stat row,
// ONE proof-line list, ONE status chip and ONE footer ("DASH . PRODUCT", words
// only: no URL, no hashtag). The sport's words, emoji and accent come from the
// registry (lib/routes.js BRAND, lib/sportAccent.js) through cardBrand(); no
// sport ternary lives here.
//
// RULES THE KIT ENFORCES, so no card can drift from them:
//   - nothing is drawn under 24px (the card is 1080 wide; a phone shows it at
//     about a third of that). text() raises a smaller size to 24 and logs it.
//   - a line that is too wide SHRINKS to fit, to 24px at the narrowest; only
//     then does it get an ellipsis, and that is logged in card.log.clipped so
//     scripts/check-cards.mjs can fail a card that clipped a real name.
//   - every word of status is STATUS_WORD (lib/callStatus.js), passed in as a
//     status key; this file never spells CALLED / ON THE BOARD / NOT ON THE BOARD.
//   - colour: the product's one accent, the chassis greys. No red, no green.
//     A card for a miss is built from the greys, not the accent.
//
// Browser-only at runtime (canvas, Image). scripts/check-cards.mjs runs it in a
// real browser. Imports carry their .js so the harness and webpack agree.
import { BRAND, sportKey } from '../routes.js'
import { SPORT_ACCENT } from '../sportAccent.js'
import { CHASSIS, NUM_FONT } from '../design/tokens.js'
import { STATUS_WORD } from '../callStatus.js'
import { mlbTeamLogo, teamPrimary } from '../mlbTeams.js'
import { nflTeamLogo } from '../nfl/nflAssets.js'
import { nhlLogo } from '../nhl/teams.js'
import { nbaLogo } from '../nba/teams.js'

export const W = 1080
export const H = 1350
export const M = 56                 // side margin
export const MIN_PX = 24            // the type floor, at 1080 wide
export const HEAD_H = 150
export const FOOT_H = 84
export const SANS = 'system-ui, -apple-system, "Segoe UI", sans-serif'
export const NUM = NUM_FONT

const slugOf = (s, fb = 'card') => String(s || fb).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || fb
export const slug = slugOf

/** #rrggbb -> rgba(). Tokens are hex; the card needs them with an alpha. */
export function alpha(hex, a) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''))
  if (!m) return `rgba(255,255,255,${a})`
  const v = parseInt(m[1], 16)
  return `rgba(${v >> 16},${(v >> 8) & 255},${v & 255},${a})`
}

// per product, looked up by the registry's sport key (never a ternary). `plate`:
// the picture is the club's full-colour mark, drawn on a light disc so a navy or
// brown club still reads on the black card; the -dark variants (light marks made
// for a dark page) go straight on the card.
// The league's own NHL asset host answers with no CORS header, so a picture straight from it would taint
// the canvas (or never load). next.config.js proxies it under /cdn/nhle (same origin, clean canvas).
export const viaOrigin = (url) => String(url || '').replace(/^https:\/\/assets\.nhle\.com\//, '/cdn/nhle/') || null
const LOGO_OF = {
  mlb: { url: (t) => mlbTeamLogo(t, 160), plate: true },
  nfl: { url: (t) => nflTeamLogo(t, 80, true), plate: false },
  nhl: { url: (t) => viaOrigin(nhlLogo(t, true)), plate: false },
  nba: { url: (t) => nbaLogo(t, true), plate: false },
}
export const logoUrl = (sport, team) => (team ? LOGO_OF[sportKey(sport)]?.url(team) || null : null)
export const logoPlate = (sport) => Boolean(LOGO_OF[sportKey(sport)]?.plate)

/** The product's words and colours, all read off the registries. */
export function cardBrand(sport) {
  const k = sportKey(sport)
  const b = BRAND[k]
  return {
    sport: k, name: b.name, league: b.league, icon: b.icon,
    accent: SPORT_ACCENT[k] || CHASSIS.text,
    bg: CHASSIS.bg, panel: CHASSIS.bg2, panel2: CHASSIS.bg3,
    ink: CHASSIS.text, ink2: CHASSIS.text2, dim: CHASSIS.text3, rule: CHASSIS.border2,
  }
}

// ── images ─────────────────────────────────────────────────────────────────
const _imgs = new Map()
/** Load a picture for the canvas, or null. crossOrigin keeps the canvas
 *  exportable; a host that refuses CORS just yields null (the card draws its
 *  monogram instead of failing the download). */
export function loadImage(url, { timeout = 5000 } = {}) {
  if (!url) return Promise.resolve(null)
  if (_imgs.has(url)) return _imgs.get(url)
  const p = new Promise((done) => {
    const img = new Image()
    const t = setTimeout(() => done(null), timeout)
    img.crossOrigin = 'anonymous'
    img.onload = () => { clearTimeout(t); done(img.naturalWidth ? img : null) }
    img.onerror = () => { clearTimeout(t); done(null) }
    img.src = url
  })
  _imgs.set(url, p)
  return p
}

// ── the card ───────────────────────────────────────────────────────────────
/**
 * @param {string} sport  registry key (mlb | nfl | nhl | nba)
 * @param {{label:string, day?:string, sub?:string, mark?:HTMLImageElement|null}} head
 */
export function newCard(sport, { label, day = '', sub = '', mark = null } = {}) {
  const brand = cardBrand(sport)
  const c = document.createElement('canvas')
  c.width = W; c.height = H
  const g = c.getContext('2d')
  g.textBaseline = 'middle'
  const card = { c, g, brand, log: { texts: [], clipped: [], raised: [] }, label, day, sub, mark }

  // the field: one black, the product's accent lit from the top left and, quieter, bottom right
  g.fillStyle = brand.bg; g.fillRect(0, 0, W, H)
  let rg = g.createRadialGradient(120, 0, 0, 120, 0, 980)
  rg.addColorStop(0, alpha(brand.accent, 0.20)); rg.addColorStop(1, alpha(brand.accent, 0))
  g.fillStyle = rg; g.fillRect(0, 0, W, H)
  rg = g.createRadialGradient(W, H, 0, W, H, 900)
  rg.addColorStop(0, alpha(brand.accent, 0.10)); rg.addColorStop(1, alpha(brand.accent, 0))
  g.fillStyle = rg; g.fillRect(0, 0, W, H)

  header(card)
  footer(card)
  return card
}

/** Measure at a size without drawing. */
function widthAt(g, str, size, weight, family) {
  g.font = `${weight} ${size}px ${family}`
  return g.measureText(str).width
}

/**
 * Draw one line of text. Shrinks to fit maxW (never under 24px), then
 * ellipsizes and logs. Returns { w, size } so the next piece can sit beside it.
 * opts: size, weight, color, align ('left'|'right'|'center'), maxW, family ('sans'|'num'), min
 */
export function text(card, str, x, y, opts = {}) {
  const { g } = card
  const { weight = 700, color = card.brand.ink, align = 'left', maxW = null, family = 'sans' } = opts
  let size = opts.size || 28
  const fam = family === 'num' ? NUM : SANS
  const min = Math.max(MIN_PX, opts.min || MIN_PX)
  let s = String(str ?? '')
  if (size < MIN_PX) { card.log.raised.push({ text: s, size }); size = MIN_PX }
  let w = widthAt(g, s, size, weight, fam)
  if (maxW != null && w > maxW) {
    while (size > min && w > maxW) { size -= 1; w = widthAt(g, s, size, weight, fam) }
    if (w > maxW) {
      let t = s
      while (t.length > 1 && widthAt(g, `${t}…`, size, weight, fam) > maxW) t = t.slice(0, -1)
      card.log.clipped.push({ text: s, shown: `${t}…`, maxW })
      s = `${t}…`; w = widthAt(g, s, size, weight, fam)
    }
  }
  g.font = `${weight} ${size}px ${fam}`
  g.fillStyle = color
  g.textAlign = align
  g.fillText(s, x, y)
  g.textAlign = 'left'
  const x0 = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x
  card.log.texts.push({ text: s, x0, x1: x0 + w, y0: y - size * 0.5, y1: y + size * 0.5, size, maxW, w })
  return { w, size }
}

/** Wrap to at most `lines` lines at one size; shrinks the size before it drops words. */
export function wrapText(card, str, x, y, { maxW, size = 32, weight = 700, color = card.brand.ink, lines = 2, lead = 1.25, family = 'sans', min = MIN_PX } = {}) {
  const { g } = card
  const fam = family === 'num' ? NUM : SANS
  const words = String(str ?? '').split(/\s+/).filter(Boolean)
  let sz = size
  const lay = (s) => {
    g.font = `${weight} ${s}px ${fam}`
    const out = []
    let cur = ''
    for (const w of words) {
      const t = cur ? `${cur} ${w}` : w
      if (g.measureText(t).width <= maxW || !cur) cur = t
      else { out.push(cur); cur = w }
    }
    if (cur) out.push(cur)
    return out
  }
  let L = lay(sz)
  while (L.length > lines && sz > min) { sz -= 1; L = lay(sz) }
  if (L.length > lines) { // still too long: keep the first `lines`, ellipsize the last
    const keep = L.slice(0, lines)
    card.log.clipped.push({ text: String(str), shown: `${keep.join(' ')}…`, maxW })
    keep[lines - 1] = `${keep[lines - 1]}…`
    L = keep
  }
  L.forEach((ln, i) => text(card, ln, x, y + i * sz * lead, { size: sz, weight, color, maxW: maxW + 1, family }))
  return { lines: L.length, size: sz, h: L.length * sz * lead }
}

// ── the header / footer ────────────────────────────────────────────────────
function header(card) {
  const { g, brand, label, day, sub, mark } = card
  const size = 76, x = M, y = 37
  if (mark) {
    g.save(); g.beginPath(); g.roundRect(x, y, size, size, 18); g.clip(); g.drawImage(mark, x, y, size, size); g.restore()
  } else {
    g.fillStyle = brand.accent; g.beginPath(); g.roundRect(x, y, size, size, 18); g.fill()
  }
  const tx = x + size + 24
  const right = W - M
  const dayW = day ? text(card, day, right, 64, { size: 28, weight: 700, color: brand.ink2, align: 'right', family: 'num' }).w : 0
  text(card, `${brand.icon} ${String(label).toUpperCase()}`, tx, 62, { size: 34, weight: 800, color: brand.accent, maxW: right - tx - (dayW ? dayW + 24 : 0) })
  if (sub) text(card, sub, tx, 102, { size: 26, weight: 600, color: brand.dim, maxW: right - tx })
  g.strokeStyle = brand.rule; g.lineWidth = 2
  g.beginPath(); g.moveTo(0, HEAD_H - 1); g.lineTo(W, HEAD_H - 1); g.stroke()
}

function footer(card) {
  const { g, brand } = card
  g.strokeStyle = brand.rule; g.lineWidth = 2
  g.beginPath(); g.moveTo(0, H - FOOT_H + 1); g.lineTo(W, H - FOOT_H + 1); g.stroke()
  text(card, `DASH · ${brand.name}`, M, H - FOOT_H / 2 - 1, { size: 28, weight: 800, color: brand.ink2 })
  g.fillStyle = brand.accent; g.fillRect(0, H - 8, W, 8)
}

// ── pieces ─────────────────────────────────────────────────────────────────
/** CALLED / ON THE BOARD / NOT ON THE BOARD, from STATUS_WORD. status null draws nothing. */
export function statusChip(card, status, x, y, { size = 26, align = 'left', quiet = false } = {}) {
  const word = STATUS_WORD[status]
  if (!word) return 0
  const { g, brand } = card
  g.font = `900 ${size}px ${SANS}`
  const padX = 18, h = size + 22
  const w = g.measureText(word).width + padX * 2 + word.length * 1.2
  const x0 = align === 'right' ? x - w : x
  // quiet: a CALLED that did not come in is drawn in the outline look, never the filled accent
  const called = status === 'called' && !quiet
  g.fillStyle = called ? brand.accent : alpha(brand.ink, 0.05)
  g.beginPath(); g.roundRect(x0, y - h / 2, w, h, 10); g.fill()
  if (!called) { g.strokeStyle = status === 'off' ? alpha(brand.ink, 0.22) : alpha(brand.ink, 0.5); g.lineWidth = 2; g.beginPath(); g.roundRect(x0 + 1, y - h / 2 + 1, w - 2, h - 2, 9); g.stroke() }
  g.letterSpacing = '1.2px'
  text(card, word, x0 + padX, y + 1, { size, weight: 900, color: called ? brand.bg : status === 'off' ? brand.dim : brand.ink, family: 'sans' })
  g.letterSpacing = '0px'
  return w
}

/** A round face on the product's dark panel; initials when there is no photo. */
export function face(card, img, cx, cy, d, { name = '', team = '', ring = null, gray = false, tint = null } = {}) {
  const { g, brand } = card
  const r = d / 2
  g.save()
  g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.clip()
  g.fillStyle = brand.panel2; g.fillRect(cx - r, cy - r, d, d)
  if (img) {
    if (gray) g.filter = 'grayscale(1) brightness(0.9)'
    // photos are square cut-outs: fit the square, anchored to the top (the face), not stretched
    g.drawImage(img, cx - r, cy - r, d, d)
    g.filter = 'none'
  } else {
    g.fillStyle = tint || alpha(teamPrimary(team), 0.55); g.fillRect(cx - r, cy - r, d, d)
    const ini = String(name).split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase()
    g.font = `900 ${Math.round(d * 0.38)}px ${SANS}`; g.fillStyle = brand.ink; g.textAlign = 'center'
    g.fillText(ini || '?', cx, cy + 2); g.textAlign = 'left'
  }
  g.restore()
  if (ring) { g.strokeStyle = ring; g.lineWidth = 6; g.beginPath(); g.arc(cx, cy, r + 1, 0, Math.PI * 2); g.stroke() }
}

/** A club logo, on a light disc when the product's marks need one; the club code on a quiet chip when there is no picture. */
export function logo(card, img, x, y, d, team = '', { plate = false } = {}) {
  const { g, brand } = card
  if (img && plate) {
    g.fillStyle = alpha(brand.ink, 0.94); g.beginPath(); g.arc(x + d / 2, y + d / 2, d / 2, 0, Math.PI * 2); g.fill()
    const i = d * 0.14
    g.drawImage(img, x + i, y + i, d - 2 * i, d - 2 * i)
    return d
  }
  if (img) { g.drawImage(img, x, y, d, d); return d }
  g.fillStyle = alpha(brand.ink, 0.08); g.beginPath(); g.roundRect(x, y, d, d, 14); g.fill()
  g.font = `900 ${Math.round(d * 0.34)}px ${SANS}`; g.fillStyle = brand.ink; g.textAlign = 'center'
  g.fillText(String(team || '').slice(0, 3).toUpperCase(), x + d / 2, y + d / 2 + 1); g.textAlign = 'left'
  return d
}

/** A thin bar, value 0-100. */
export function bar(card, x, y, w, pct, { h = 14, color = card.brand.accent } = {}) {
  const { g, brand } = card
  g.fillStyle = alpha(brand.ink, 0.09); g.beginPath(); g.roundRect(x, y - h / 2, w, h, h / 2); g.fill()
  const fw = Math.max(h, w * Math.min(1, Math.max(0, pct) / 100))
  g.fillStyle = color; g.beginPath(); g.roundRect(x, y - h / 2, fw, h, h / 2); g.fill()
}

/** The ONE stat row: a row of tiles, small label over a big value. tiles: [{label, value, hot}] */
export function statRow(card, tiles, y, { cols = tiles.length, h = 132, gap = 16 } = {}) {
  const { g, brand } = card
  const n = Math.min(cols, tiles.length)
  const tw = (W - 2 * M - (n - 1) * gap) / n
  tiles.forEach((t, i) => {
    const col = i % n, row = Math.floor(i / n)
    const x = M + col * (tw + gap), ty = y + row * (h + gap)
    g.fillStyle = alpha(brand.ink, 0.045); g.beginPath(); g.roundRect(x, ty, tw, h, 16); g.fill()
    g.strokeStyle = t.hot ? alpha(brand.accent, 0.6) : alpha(brand.ink, 0.10); g.lineWidth = 2
    g.beginPath(); g.roundRect(x + 1, ty + 1, tw - 2, h - 2, 15); g.stroke()
    text(card, String(t.label), x + 20, ty + 32, { size: 24, weight: 800, color: brand.dim, maxW: tw - 40 })
    text(card, String(t.value ?? '—'), x + 20, ty + 84, { size: 46, weight: 900, color: t.hot ? brand.accent : brand.ink, maxW: tw - 40, family: 'num' })
  })
  return Math.ceil(tiles.length / n) * (h + gap) - gap
}

/** The ONE proof list: 2-4 short lines, label dim on the left, value bold on the right. [{label, value, hot}] */
export function proofLines(card, lines, y, { rowH = 70, size = 32 } = {}) {
  const { g, brand } = card
  lines.forEach((ln, i) => {
    const my = y + i * rowH + rowH / 2
    g.strokeStyle = alpha(brand.ink, 0.09); g.lineWidth = 2
    g.beginPath(); g.moveTo(M, y + i * rowH); g.lineTo(W - M, y + i * rowH); g.stroke()
    const vw = text(card, String(ln.value), W - M, my, { size, weight: 800, color: ln.hot ? brand.accent : brand.ink, align: 'right', maxW: 560, family: 'sans' }).w
    text(card, String(ln.label), M, my, { size: Math.max(28, size - 4), weight: 600, color: brand.dim, maxW: W - 2 * M - vw - 24 })
  })
  return lines.length * rowH
}


/** The card's one quiet note, bottom of the body, above the footer: two lines at most. */
export function note(card, str, { lines = 2 } = {}) {
  const y = H - FOOT_H - 26 - (lines - 1) * 15
  return wrapText(card, str, M, y - (lines - 1) * 15, { maxW: W - 2 * M, size: 26, weight: 600, color: card.brand.dim, lines, lead: 1.3 })
}

/** The PNG, as a download. The card's one export path. */
export function savePng(canvas, filename) {
  const a = document.createElement('a')
  a.download = filename
  a.href = canvas.toDataURL('image/png')
  a.click()
}

/** The card's own date line: 'Oct 8' from an ISO day (the game's own date), else the viewer's today. */
export function dayWord(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''))
  const d = m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12)) : new Date()
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(m ? { timeZone: 'UTC' } : {}) })
}
export const stamp = (iso) => (/^\d{4}-\d{2}-\d{2}/.test(String(iso || '')) ? String(iso).slice(0, 10) : new Date().toLocaleDateString('en-CA'))

/** The DASH mark (same-origin, so it never taints the canvas). */
export const loadMark = () => loadImage('/dash-network-mark-128.png')
