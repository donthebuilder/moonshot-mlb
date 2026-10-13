// THE POSTER KIT (server only, JSX): the 1200 x 675 landscape variant of the baseball-card look (lib/cards/cardKit.js).
// Donovan, 2026-10-12: "everything should be the baseball card look, even the one for the games". The X / Discord poster size is KEPT
// (1200 x 675, so no post changes); what changes is the drawing: the same frame (dark ground, thin accent border, rounded corners), the
// FOIL STRIP across the top used ONLY when the status is CALLED, the letter-spaced status word + rule + label, the portrait over a
// faded club-logo watermark, the oversized slanted display-caps name, the club logo + matchup, ruled metric tiles, a closing status
// banner and the quiet footer "BRAND . DASH Network". Every primitive is cardKit's (foil, field, Logo, Face, Target, the fonts and
// the grain); this file only lays them out landscape. NOTHING here names a sport: the accent, the words and the numbers arrive from the
// poster that calls it (lib/dash/homerCard.js, lib/nhl/goalCard.js, lib/nfl/tdCard.js, lib/nfl/spotlightCard.js).
//
// THE TEXT SYSTEM (Donovan, 2026-10-12, "these need to be better as far as text optimizations"). Every text box here is MEASURED with
// the real fonts (lib/cards/fit.js) before it is drawn, so a value can never crowd its label, a name can never run off its box and a
// column can never push the footer out of the frame. One type scale, in fixed sizes, stepped down and never below the floor:
//
//   kicker (the status word)   30 / 800, letter-spaced           banner line          display 38 -> 22
//   right label / chip         26 / 22                           row label            22 (never cut)
//   hero name                  display 96 -> 52, else 2 lines    row value            24 -> 22, then stacked, then wrapped
//   tile number                display 36-56 -> 28               footer               24
//
// FLOOR. cardKit's 22px (at its 1080 design) is applied at this canvas's own size: every text node is >= 22px, and lintType()
// re-checks each poster as it renders (offenders land in cardKit's LINT list). Display NUMERALS and names step below 22 never; the
// hero name steps down to 36 only in its two-line form (it is a headline, not body copy).
// SAFE MARGIN. X shows the 1200 x 675 in a 16:9 card and rounds / overlays its edges: text sits 48px or more from the left and right
// edges (frame inset 14 + border 3 + POSTER.pad 31).
// VERTICAL BUDGET. The frame's body is a fixed height; a poster plans its column's heights (fit.js lineH) and drops its optional lines
// (the hook bullets) rather than let the column grow. vlog() records the plan for scripts/check-poster-fit.mjs.
import { ImageResponse } from 'next/og'
import { assets as kitAssets, inline, field, foil, alpha, fs, lintType, LINT, Logo, Face, Target, DISPLAY, INK, INK2, DIM, RULE, CHASSIS, BODY_FACE } from './cardKit'
import { logoFor } from './adapters/common'
import { mlbHeadshot } from '../mlbTeams'
import { nflHeadshot } from '../nfl/nflAssets'
import { headshotIdFor } from '../nfl/headshotIds'
import { initMetrics, textWidth, fitLine, fitBlock, ellipsize, lineH, LH, splitName, initialName, logFit, FIT_LOG } from './fit'

export { alpha, fs, Logo, Face, Target, DISPLAY, INK, INK2, DIM, RULE, CHASSIS, inline, logoFor, mlbHeadshot, textWidth, fitLine, fitBlock, ellipsize, lineH, FIT_LOG, logFit }

/** The fonts, mark and grain (cardKit's), and the font metrics the fit system measures with: every poster calls this first. */
export async function assets() {
  const a = await kitAssets()
  initMetrics(a.fonts)
  return a
}

/** The poster size (the X / Discord image), the frame inset, the fixed bands and the text inset from the frame. A poster taller than 675 (the pregame list) gives its own h. */
/** The portrait column's width (the face, the score plate): wide enough for the plate's "MOONSHOT SCORE" at the floor size. */
export const PORTRAIT_W = 252
export const POSTER = { w: 1200, h: 675, inset: 14, foil: 8, top: 44, foot: 46, pad: 31 }
/** The body's height inside the frame (the border is 3px a side). */
export const bodyH = (h = POSTER.h) => h - 2 * POSTER.inset - POSTER.foil - POSTER.top - POSTER.foot - 6
export const bodyW = POSTER.w - 2 * POSTER.inset - 6
/** The width a line of text can use across the whole body, inside the text inset. */
export const lineW = bodyW - 2 * POSTER.pad

const D = { family: DISPLAY, weight: 900 }                 // the display face, as fit.js names it
const alts = (x) => (Array.isArray(x) ? x : [x]).filter((v) => v != null && v !== '')

/** "Jan 2, 2026" from a game's own date (the date key, never a wall clock). */
export const prettyDay = (iso8601) => {
  if (!/^\d{4}-\d{2}-\d{2}/.test(String(iso8601 || ''))) return ''
  const d = new Date(`${iso8601}T12:00:00Z`)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

/** A finite number as text, else ''. The posters never print NaN / undefined / Infinity. */
export const num = (v, f = (x) => String(x)) => (v != null && v !== '' && Number.isFinite(Number(v)) ? f(Number(v)) : '')

/** The vertical plan of a column, for the check: what it uses against what the body gives it. */
export const vlog = (id, used, avail) => logFit({ id, kind: 'v', used, avail, ok: used <= avail })

/** Lint the design, draw it at 1200 x h and return the ImageResponse (a Response whose body is the PNG): what every poster function returns. */
export async function renderPoster(el, { h = POSTER.h, poster = 'poster' } = {}) {
  const off = lintType(el)
  if (off.length) LINT.push(...off.map((x) => ({ ...x, card: poster })))
  const { fonts } = await kitAssets()
  return new ImageResponse(el, { width: POSTER.w, height: h, fonts: fonts.length ? fonts : undefined })
}

/** A club's logo and whether it sits on a light plate, ready for <Logo m={...} />. */
export const clubOf = async (sport, team) => {
  const l = team ? await logoFor(sport, team) : { src: '', plate: false }
  return { team: String(team || ''), logo: l.src, logoPlate: l.plate }
}

/** A player's face as a data URI ('' when it cannot be fetched in 4s: the poster draws a monogram). */
export const faceOf = (url) => inline(url, { timeout: 4000 })
/** A TUDDY player's face (the gsis id through the headshot table; '' when there is no id or no photo). */
export const nflFace = (gsisId) => { const id = headshotIdFor(String(gsisId || '')); return id ? faceOf(nflHeadshot(id, 240, 240)) : '' }
export const mlbFace = (playerId) => (/^\d+$/.test(String(playerId || '')) ? faceOf(mlbHeadshot(String(playerId), 480, { strict: true })) : '')

// ── THE FRAME ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
const chipText = (t) => ellipsize(t, { size: 22, weight: 800, ls: 2, maxW: 340 })
const chipW = (t) => textWidth(chipText(t), { size: 22, weight: 800, ls: 2 }) + 32

/** The top bar's plan: the first combination of (letter-spacing, chips kept, right label) that fits one line; the rule gets what is left. */
export function headPlan(word, chips, right) {
  const avail = lineW
  const words = alts(word).map(String)
  const w0 = words[words.length - 1] || ''
  const rights = alts(right).length ? alts(right) : ['']
  for (const ls of [8, 5, 3]) {
    for (const wd of words) {
      const ww = textWidth(wd, { size: 30, weight: 800, ls })
      for (const cs of [chips, chips.slice(0, 1), []]) {
        const cw = cs.reduce((a, c) => a + chipW(c) + 20, 0)
        for (const r of rights) {
          const rw = r ? textWidth(r, { size: 26, weight: 800, ls: 3 }) + 20 : 0
          if (ww + 20 + 40 + cw + rw <= avail) { logFit({ id: 'head', kind: 'row', w: ww + 20 + 40 + cw + rw, maxW: avail, ok: true, text: wd }); return { word: wd, ls, chips: cs, right: r } }
        }
      }
    }
  }
  const t = ellipsize(w0, { size: 30, weight: 800, ls: 3, maxW: avail - 60 })
  logFit({ id: 'head', kind: 'row', w: textWidth(t, { size: 30, weight: 800, ls: 3 }), maxW: avail, ok: true, truncated: true, text: w0 })
  return { word: t, ls: 3, chips: [], right: '' }
}

/** The footer's plan: the brand on the left, the first right-hand alternative that fits beside it (else the last, cut). */
export function footPlan(brand, footRight) {
  const left = `${brand} · DASH Network`
  const lw = textWidth(left, { size: 24, weight: 800, ls: 2 })
  const rs = alts(footRight)
  for (const r of rs) {
    const rw = textWidth(r, { size: 24, weight: 600 })
    if (lw + 40 + 20 + rw <= lineW) { logFit({ id: 'foot', kind: 'row', w: lw + 20 + rw, maxW: lineW, ok: true, text: r }); return { left, right: r } }
  }
  const last = rs[rs.length - 1] || ''
  const r = ellipsize(last, { size: 24, weight: 600, maxW: lineW - lw - 60 })
  logFit({ id: 'foot', kind: 'row', w: lw + 20 + textWidth(r, { size: 24, weight: 600 }), maxW: lineW, ok: true, truncated: r !== last, text: last })
  return { left, right: r }
}

/**
 * `word`    the letter-spaced word top left (the status word on a call poster, the product's kind word on the others)
 * `called`  true ONLY when the poster says CALLED: it alone gets the foil strip and the accent word
 * `chips`   short accent pills beside the label (a long-shot price, "2 TONIGHT")
 * `right`   the label top right (the event: HOME RUN, GOAL, TOUCHDOWN ...): a string, or alternatives longest first
 * `brand`   the product name in the footer; `footRight` the date (and the product's own sub line): a string, or alternatives longest first
 */
export function Poster({ accent, tone, grain, called = false, word, chips = [], right = '', brand, footRight = '', h = POSTER.h, children }) {
  const iw = POSTER.w - 2 * POSTER.inset
  const ih = h - 2 * POSTER.inset
  const hp = headPlan(word, chips.filter(Boolean), right)
  const fp = footPlan(brand, footRight)
  return (
    <div style={{ width: POSTER.w, height: h, display: 'flex', position: 'relative', overflow: 'hidden', background: field(accent, tone), color: INK, fontFamily: BODY_FACE }}>
      {grain ? <img src={grain} width={POSTER.w} height={h} style={{ position: 'absolute', left: 0, top: 0, opacity: 0.9 }} /> : null}
      <div style={{ display: 'flex', flexDirection: 'column', position: 'absolute', left: POSTER.inset, top: POSTER.inset, width: iw, height: ih, border: `3px solid ${alpha(accent, 0.55)}`, borderRadius: 22, overflow: 'hidden' }}>
        {called ? <div style={{ display: 'flex', height: POSTER.foil, background: foil(accent) }} /> : <div style={{ display: 'flex', height: POSTER.foil }} />}
        <div style={{ display: 'flex', alignItems: 'center', height: POSTER.top, padding: `0 ${POSTER.pad}px`, gap: 20 }}>
          <span style={{ fontSize: 30, fontWeight: 800, letterSpacing: hp.ls, color: called ? accent : INK2, whiteSpace: 'nowrap' }}>{hp.word}</span>
          <div style={{ display: 'flex', flexGrow: 1, height: 2, background: alpha(accent, called ? 0.5 : 0.2) }} />
          {hp.chips.map((c) => <Chip key={c} text={c} accent={accent} />)}
          {hp.right ? <span style={{ fontSize: 26, fontWeight: 800, letterSpacing: 3, color: INK2, whiteSpace: 'nowrap' }}>{hp.right}</span> : null}
        </div>
        <div style={{ display: 'flex', width: bodyW, height: bodyH(h), overflow: 'hidden' }}>{children}</div>
        <div style={{ display: 'flex', alignItems: 'center', height: POSTER.foot, padding: `0 ${POSTER.pad}px`, gap: 20 }}>
          <span style={{ fontSize: 24, fontWeight: 800, color: INK2, letterSpacing: 2, whiteSpace: 'nowrap' }}>{fp.left}</span>
          <div style={{ display: 'flex', flexGrow: 1, height: 2, background: RULE }} />
          <span style={{ fontSize: 24, fontWeight: 600, color: DIM, whiteSpace: 'nowrap' }}>{fp.right}</span>
        </div>
      </div>
    </div>
  )
}

export const Chip = ({ text, accent }) => (
  <span style={{ display: 'flex', fontSize: 22, fontWeight: 800, letterSpacing: 2, color: accent, border: `2px solid ${alpha(accent, 0.6)}`, borderRadius: 999, padding: '1px 14px', whiteSpace: 'nowrap' }}>{chipText(text)}</span>
)

// ── THE PORTRAIT COLUMN ─────────────────────────────────────────────────────────────────────────────────────────────────────
/** The score plate's plan: the word (letter-spacing relaxed, then the shorter word), the number stepped down to fit, the caption on up to two lines. */
export function platePlan({ word, value, caption }, w) {
  const inner = w - 2 - 16
  let wordOut = ''
  let wls = 1.5
  const ws = alts(word)
  outer: for (const wd of ws) for (const ls of [1.5, 0.5, 0]) { if (textWidth(wd, { size: 22, weight: 800, ls }) <= inner) { wordOut = wd; wls = ls; break outer } }
  if (!wordOut && ws.length) { wordOut = ellipsize(ws[ws.length - 1], { size: 22, weight: 800, maxW: inner }); wls = 0 }
  logFit({ id: 'plate-word', kind: 'info', text: wordOut })
  const v = String(value)
  const vf = fitLine(v, { sizes: [64, 56, 48, 42, 36, 32], maxW: inner - 12, id: 'plate-value', ...D })
  let cap = null
  // an explicit caption (`{ lines: [...] }`): each line is its own, cut to the plate if it must be
  if (caption && Array.isArray(caption.lines)) {
    const ls = caption.lines.filter(Boolean).map((l) => ellipsize(String(l), { size: 22, weight: 800, maxW: inner }))
    cap = ls.length ? { lines: ls, size: 22, w: Math.max(...ls.map((l) => textWidth(l, { size: 22, weight: 800 }))), fits: true } : null
    if (cap) logFit({ id: 'plate-caption', kind: 'line', text: ls.join(' / '), size: 22, w: cap.w, maxW: inner, ok: cap.w <= inner })
  }
  for (const c of cap ? [] : alts(caption)) {
    const r = fitBlock(c, { sizes: [22], maxW: inner, maxLines: 1, quiet: true, weight: 800 })
    if (r.fits) { cap = r; break }
  }
  if (!cap && alts(caption).length) cap = fitBlock(alts(caption)[0], { sizes: [22], maxW: inner, maxLines: 2, quiet: true, weight: 800 })
  if (cap && !(caption && Array.isArray(caption.lines))) logFit({ id: 'plate-caption', kind: 'block', text: cap.lines.join(' / '), size: 22, w: cap.w, maxW: inner, ok: cap.w <= inner, truncated: !cap.fits })
  const h = 12 + (wordOut ? lineH(22) : 0) + vf.size + (cap ? lineH(22, cap.lines.length) : 0)
  return { wordOut, wls, vsize: vf.size, value: v, cap, h: Math.max(96, h), inner }
}

/** The left column: the face over a faded club-logo watermark, a quiet tag top left, and a score plate along the bottom. */
export function Portrait({ m, w, h, accent, tag, plate }) {
  const wm = Math.round(w * 1.15)
  const pp = plate ? platePlan(plate, w) : null
  const tagText = alts(tag).length ? fitAlts(tag, { sizes: [22], weight: 800, ls: 1, maxW: w - 2 - 14 - 32 - 14, id: 'tag' }).text : ''
  return (
    <div style={{ display: 'flex', position: 'relative', width: w, height: h, flexShrink: 0, overflow: 'hidden', borderRight: `2px solid ${alpha(accent, 0.45)}`, background: `radial-gradient(circle at 50% 38%, ${alpha(m.tone || accent, 0.42)} 0%, ${alpha(accent, 0.08)} 66%, ${alpha(CHASSIS.bg, 0.3)} 100%)` }}>
      {m.logo ? <div style={{ display: 'flex', position: 'absolute', right: -Math.round(w * 0.28), top: Math.round(h * 0.06), opacity: 0.16 }}><Logo m={m} size={wm} /></div> : null}
      <div style={{ display: 'flex', position: 'absolute', left: 0, bottom: pp ? pp.h : 0 }}><Face m={m} w={w - 2} h={w - 2} accent={accent} /></div>
      {tagText ? (
        <span style={{ display: 'flex', position: 'absolute', left: 14, top: 14, fontSize: 22, fontWeight: 800, letterSpacing: 1, color: INK, background: alpha(CHASSIS.bg, 0.72), borderStyle: 'solid', borderWidth: '2px 2px 2px 6px', borderColor: `${alpha(INK, 0.22)} ${alpha(INK, 0.22)} ${alpha(INK, 0.22)} ${alpha(accent, 0.9)}`, padding: '3px 12px', whiteSpace: 'nowrap' }}>{tagText}</span>
      ) : null}
      {pp ? <ScorePlate pp={pp} accent={accent} w={w} hot={plate.hot !== false} /> : null}
    </div>
  )
}

/** The score plate: a quiet word, the number in the display face in the accent, and the caption (one or two lines). */
export function ScorePlate({ pp, accent, w, hot = true }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'absolute', left: 0, bottom: 0, width: w - 2, height: pp.h, background: alpha(CHASSIS.bg, 0.8), borderTop: `2px solid ${alpha(accent, 0.5)}` }}>
      {pp.wordOut ? <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: pp.wls, lineHeight: LH, color: INK2, whiteSpace: 'nowrap' }}>{pp.wordOut}</span> : null}
      <span style={{ fontFamily: DISPLAY, fontSize: pp.vsize, fontWeight: 900, lineHeight: 1, color: hot ? accent : INK, transform: 'skewX(-8deg)', whiteSpace: 'nowrap' }}>{pp.value}</span>
      {pp.cap ? pp.cap.lines.map((l, i) => <span key={i} style={{ fontSize: 22, fontWeight: 800, lineHeight: LH, color: INK2, textAlign: 'center', whiteSpace: 'nowrap' }}>{l}</span>) : null}
    </div>
  )
}

// ── THE NAME, THE MATCHUP ───────────────────────────────────────────────────────────────────────────────────────────────────
/**
 * The hero name's plan. One line, stepped down from `size` to 52; else two balanced lines (44 / 40 / 36 when the box is tall enough);
 * else his initial and surname; else cut. The display face leans (skewX -8), so each size reserves `size * 0.16` for the lean.
 */
export function namePlan(name, { size = 96, maxW, h = 80, id = 'name' }) {
  const s = String(name || '').trim() || 'Unknown'
  const f = { ...D, upper: true }
  const slack = (z) => Math.ceil(z * 0.16)
  const steps = [size]
  for (let z = size - 8; z >= 52; z -= 8) steps.push(z)
  const one = (text) => { for (const z of steps) { const w = textWidth(text, { ...f, size: z }) + slack(z); if (w <= maxW) return { lines: [text], size: z, w } } return null }
  const rec = (p, extra = {}) => { logFit({ id, kind: 'name', text: s, size: p.size, w: p.w, maxW, ok: p.w <= maxW, ...extra }); return p }
  let p = one(s)
  if (p) return rec(p)
  for (const z of [44, 40, 36]) {
    if (z * 2 > h) continue
    const parts = splitName(s, { ...f, size: z })
    if (parts.length !== 2) continue
    const w = Math.max(textWidth(parts[0], { ...f, size: z }), textWidth(parts[1], { ...f, size: z })) + slack(z)
    if (w <= maxW) return rec({ lines: parts, size: z, w })
  }
  p = one(initialName(s))
  if (p) return rec(p, { shortened: true })
  const z = 52
  const t = ellipsize(s, { ...f, size: z, maxW: maxW - slack(z) })
  return rec({ lines: [t], size: z, w: textWidth(t, { ...f, size: z }) + slack(z) }, { truncated: true })
}

/** The slanted display-caps name: one line stepped down to fit maxW, two lines when it must be. Always exactly h tall. */
export function NameLine({ name, size = 96, maxW, h = 92 }) {
  const p = namePlan(name, { size, maxW: maxW || bodyW, h })
  return (
    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: h, width: maxW }}>
      {p.lines.map((l, i) => <span key={i} style={{ display: 'flex', fontFamily: DISPLAY, fontSize: p.size, fontWeight: 900, lineHeight: p.lines.length > 1 ? 1 : 1.02, textTransform: 'uppercase', transform: 'skewX(-8deg)', letterSpacing: -0.5, whiteSpace: 'nowrap' }}>{l}</span>)}
    </div>
  )
}

/** The club logo, the matchup in the body face, and quiet extra words (a string, or alternatives longest first), fitted to maxW. */
export function MatchLine({ m, text, extra, size = 44, maxW }) {
  const full = maxW || lineW
  const room = full - size - 14
  const tf = fitLine(String(text || ''), { sizes: [34, 30, 26, 22], maxW: room, weight: 800, id: 'match' })
  const t = tf.fits ? String(text || '') : ellipsize(String(text || ''), { size: 22, weight: 800, maxW: room })
  const left = room - textWidth(t, { size: tf.size, weight: 800 }) - 14
  const ex = left >= 90 && alts(extra).length ? fitAlts(extra, { sizes: [26, 24, 22], maxW: left, weight: 600, id: 'match-extra' }) : null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, height: size + 4, width: full }}>
      <Logo m={m} size={size} />
      <span style={{ fontSize: tf.size, fontWeight: 800, whiteSpace: 'nowrap' }}>{t}</span>
      {ex ? <span style={{ fontSize: ex.size, fontWeight: 600, color: DIM, whiteSpace: 'nowrap' }}>{ex.text}</span> : null}
    </div>
  )
}

// ── TEXT THAT IS NOT A ROW: a fitted line or block ──────────────────────────────────────────────────────────────────────────
/** A fitted block of text: the plan (fit.js fitBlock) and a box exactly as tall as its lines. */
export function planText(text, o) { return fitBlock(String(text ?? ''), { maxLines: 1, weight: 800, ...o }) }
export function Lines({ plan, weight = 800, color = INK, ls = 0, upper = false, align = 'flex-start', family, skew = false, gap = 0 }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: align, gap }}>
      {plan.lines.map((l, i) => <span key={i} style={{ display: 'flex', ...(family ? { fontFamily: family } : {}), fontSize: plan.size, fontWeight: weight, lineHeight: LH, color, letterSpacing: ls, textTransform: upper ? 'uppercase' : 'none', ...(skew ? { transform: 'skewX(-8deg)' } : {}), whiteSpace: 'nowrap' }}>{l}</span>)}
    </div>
  )
}
export const planH = (plan) => lineH(plan.size, plan.lines.length)

// ── LABEL / VALUE ROWS ──────────────────────────────────────────────────────────────────────────────────────────────────────
const KV = { padX: 12, gap: 14, border: 2 }
const labelOf = (r) => alts(r.label)

/**
 * One row's plan inside `innerW`. The LABEL is never cut (it may be shortened: `label` can list alternatives, longest first). Order:
 *   1 label + value on one line at 24, then 22 (each label alternative in turn);
 *   2 label + main value on one line, the `sub` (the park's HR factor) on a second line;
 *   3 the label on its own line and the value under it, full width, at 24 then 22;
 *   4 the value wrapped onto two lines under the label at 22, the last line cut with an ellipsis if it must be.
 */
export function rowPlan(r, innerW, { pad = 2, sizes = [24, 22] } = {}) {
  const label0 = labelOf(r)[0]
  const value = String(r.value ?? '')
  const sub = r.sub ? String(r.sub) : ''
  const joined = sub ? `${value} · ${sub}` : value
  const W = (t, size, weight = 800) => textWidth(t, { size, weight })
  const L = (l) => W(l, 22, 600)
  for (const label of labelOf(r)) {
    for (const size of sizes) {
      if (L(label) + KV.gap + W(joined, size) <= innerW) return done({ mode: 'line', label, size, text: joined })
    }
  }
  if (sub) {
    for (const size of sizes) {
      if (L(label0) + KV.gap + W(value, size) <= innerW && W(sub, 22) <= innerW) return done({ mode: 'split', label: label0, size, text: value, sub })
    }
  }
  if (sub) {
    // the value on its own line(s) under the label, the sub on a line of its own after it
    const vb = fitBlock(value, { sizes, maxW: innerW, maxLines: 2, id: `row:${label0}`, weight: 800 })
    return done({ mode: 'stack', label: label0, size: vb.size, lines: [...vb.lines, sub], truncated: !vb.fits })
  }
  for (const size of sizes) {
    if (W(joined, size) <= innerW) return done({ mode: 'stack', label: label0, size, lines: [joined] })
  }
  const b = fitBlock(joined, { sizes: [22], maxW: innerW, maxLines: 2, id: `row:${label0}`, weight: 800 })
  return done({ mode: 'stack', label: label0, size: 22, lines: b.lines, truncated: !b.fits })

  function done(p) {
    const lines = p.mode === 'line' ? lineH(p.size) : p.mode === 'split' ? lineH(p.size) + lineH(22) : lineH(22) + lineH(p.size, p.lines.length)
    const plan = { ...p, hot: !!r.hot, h: lines + 2 * pad, labelW: p.mode === 'line' || p.mode === 'split' ? L(p.label) + 2 : 0 }
    const w = p.mode === 'line' ? L(p.label) + KV.gap + W(p.text, p.size) : p.mode === 'split' ? L(p.label) + KV.gap + W(p.text, p.size) : Math.max(...(p.lines || []).map((x) => W(x, p.size)), L(p.label))
    logFit({ id: `row:${label0}`, kind: 'row', text: `${label0}: ${joined}`, size: p.size, w, maxW: innerW, ok: w <= innerW, truncated: !!p.truncated, mode: p.mode })
    return plan
  }
}

/** The table's natural width: the widest "label + value at 22" among its rows (the value's main text only: a sub line wraps under it). */
export function kvNatural(rows) {
  let n = 0
  for (const r of rows) {
    const need = textWidth(labelOf(r)[labelOf(r).length - 1], { size: 22, weight: 600 }) + KV.gap + textWidth(String(r.value ?? ''), { size: 22, weight: 800 })
    n = Math.max(n, need)
  }
  return Math.ceil(n) + 2 * KV.padX + 2 * KV.border + 2
}

/** Share `avail` px among tables side by side (gap px apart): each gets its natural width when all can, else the shortfall is shared by need. */
export function splitWidths(naturals, avail, gap = 12) {
  const n = naturals.length
  const room = avail - gap * (n - 1)
  const base = Math.floor(room / n)
  const w = naturals.map((x) => Math.min(x, base))
  let rem = room - w.reduce((a, b) => a + b, 0)
  const def = naturals.map((x, i) => x - w[i])
  const dsum = def.reduce((a, b) => a + b, 0)
  if (dsum > 0 && rem > 0) {
    const give = Math.min(rem, dsum)
    for (let i = 0; i < n; i += 1) w[i] += Math.floor((give * def[i]) / dsum)
    rem = room - w.reduce((a, b) => a + b, 0)
  }
  for (let i = 0; rem > 0; i = (i + 1) % n, rem -= 1) w[i] += 1
  return w
}

/**
 * Tables side by side share ONE value size: each is planned at 24 / 22, then every row is planned again at the smallest size any row
 * needed, so the rows of a poster read on one baseline scale. Returns the plans (same order as `groups`).
 */
export function kvPlans(groups, widths, { pad = 2 } = {}) {
  const first = groups.map((g, i) => kvPlan(g, widths[i], { pad }))
  const size = Math.min(24, ...first.flatMap((p) => p.rows.filter((r) => r.mode !== 'stack' || r.lines.length === 1).map((r) => r.size)))
  if (size >= 24) return first
  return groups.map((g, i) => kvPlan(g, widths[i], { pad, sizes: [size] }))
}

const TITLE_H = lineH(22) + 8
/** A table's plan at width w: every row planned, and the whole height. */
export function kvPlan(rows, w, { pad = 2, title = true, sizes } = {}) {
  const inner = w - 2 * KV.border - 2 * KV.padX
  const rs = rows.map((r) => rowPlan(r, inner, { pad, ...(sizes ? { sizes } : {}) }))
  const h = 2 * KV.border + (title ? TITLE_H : 0) + rs.reduce((a, r) => a + r.h, 0) + Math.max(0, rs.length - 1) * 2
  return { w, rows: rs, h, title }
}

/** A titled table of label / value rows (label quiet, value in the body face, accent when `hot`), drawn from its plan. */
export function KVTable({ title, plan, accent, head }) {
  const { w, rows } = plan
  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: w, height: plan.h, flexShrink: 0, borderRadius: 12, border: `2px solid ${alpha(INK, 0.14)}`, background: alpha(INK, 0.04), overflow: 'hidden' }}>
      {title ? <span style={{ display: 'flex', alignItems: 'center', height: TITLE_H - 2, fontSize: 22, fontWeight: 800, letterSpacing: 3, lineHeight: LH, color: head || DIM, padding: `0 ${KV.padX + 2}px`, borderBottom: `2px solid ${alpha(INK, 0.14)}`, whiteSpace: 'nowrap' }}>{title}</span> : null}
      {rows.map((r, i) => {
        const color = r.hot ? accent : INK
        const box = { display: 'flex', flexDirection: 'column', justifyContent: 'center', height: r.h, padding: `0 ${KV.padX}px`, borderBottom: i < rows.length - 1 ? `2px solid ${alpha(INK, 0.08)}` : 'none', boxSizing: 'content-box' }
        const label = <span style={{ display: 'flex', fontSize: 22, fontWeight: 600, lineHeight: LH, color: INK2, whiteSpace: 'nowrap' }}>{r.label}</span>
        if (r.mode === 'stack') {
          return (
            <div key={`${r.label}-${i}`} style={box}>
              {label}
              {r.lines.map((l, j) => <span key={j} style={{ display: 'flex', fontSize: r.size, fontWeight: 800, lineHeight: LH, color, whiteSpace: 'nowrap' }}>{l}</span>)}
            </div>
          )
        }
        return (
          <div key={`${r.label}-${i}`} style={box}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: KV.gap }}>
              {label}
              <span style={{ display: 'flex', fontSize: r.size, fontWeight: 800, lineHeight: LH, color, whiteSpace: 'nowrap' }}>{r.text}</span>
            </div>
            {r.mode === 'split' ? <span style={{ display: 'flex', alignSelf: 'flex-end', fontSize: 22, fontWeight: 800, lineHeight: LH, color, whiteSpace: 'nowrap' }}>{r.sub}</span> : null}
          </div>
        )
      })}
    </div>
  )
}

// ── METRIC TILES ────────────────────────────────────────────────────────────────────────────────────────────────────────────
const TILE = { padX: 16, padT: 6, padB: 8 }
/**
 * The tiles' plan at `w` each (the tile's own width, the rule on its left included): every number steps down to fit, then they all share the
 * smallest size so a row reads as one scale; a label that cannot fit wraps onto a second line (all tiles keep the taller height).
 */
export function tilesPlan(tiles, w, big, { tight = false } = {}) {
  const padT = tight ? 3 : TILE.padT
  const padB = tight ? 3 : TILE.padB
  const inner = w - 2 - 2 * TILE.padX
  let size = big
  const labels = tiles.map((t) => fitBlock(String(t.label), { sizes: [22], maxW: inner, maxLines: 2, id: `tile:${t.label}`, weight: 800, ls: 0.4 }))
  for (const t of tiles) {
    const unitW = t.unit ? textWidth(String(t.unit), { size: 22, weight: 700 }) + 6 : 0
    for (let b = big; b >= 22; b -= 4) {
      const vw = textWidth(String(t.value), { ...D, size: b }) + Math.ceil(b * 0.14) + unitW
      if (vw <= inner) { size = Math.min(size, b); break }
      if (b - 4 < 22) size = Math.min(size, 22)
    }
  }
  const out = tiles.map((t) => {
    const unitW = t.unit ? textWidth(String(t.unit), { size: 22, weight: 700 }) + 6 : 0
    const vw = textWidth(String(t.value), { ...D, size }) + Math.ceil(size * 0.14) + unitW
    logFit({ id: `tile:${t.label}`, kind: 'tile', text: String(t.value), size, w: vw, maxW: inner, ok: vw <= inner })
    return t
  })
  const nl = Math.max(...labels.map((l) => l.lines.length))
  return { tiles: out, labels, size, nl, padT, padB, h: padT + lineH(22, nl) + size + padB }
}

/** One tile, from a plan. */
function TileBox({ t, label, tp, accent, w }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', width: w, height: tp.h, flexShrink: 0, padding: `${tp.padT}px ${TILE.padX}px ${tp.padB}px ${TILE.padX}px`, borderLeft: `2px solid ${alpha(INK, 0.14)}` }}>
      {label.lines.map((l, i) => <span key={i} style={{ display: 'flex', fontSize: 22, fontWeight: 800, color: DIM, letterSpacing: 0.4, lineHeight: LH, whiteSpace: 'nowrap' }}>{l}</span>)}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, height: tp.size + (tp.nl - label.lines.length) * lineH(22) }}>
        <span style={{ fontFamily: DISPLAY, fontSize: tp.size, fontWeight: 900, lineHeight: 1, color: t.hot === false ? INK : accent, whiteSpace: 'nowrap', transform: 'skewX(-8deg)' }}>{String(t.value)}</span>
        {t.unit ? <span style={{ fontSize: 22, fontWeight: 700, color: DIM, whiteSpace: 'nowrap' }}>{t.unit}</span> : null}
      </div>
    </div>
  )
}

/** A row of tiles under one rule across width `w` (each tile the same width). Returns the tile row; its height is tileRowH(tp). */
export const tileRowPlan = (tiles, w, big = 52) => tilesPlan(tiles, Math.floor(w / tiles.length), big)
export const tileRowH = (tp) => tp.h + 4
export function TileRow({ tiles, w, accent, plan }) {
  const tw = Math.floor(w / tiles.length)
  const tp = plan || tilesPlan(tiles, tw, 52)
  return (
    <div style={{ display: 'flex', width: w, height: tileRowH(tp), borderTop: `2px solid ${RULE}`, borderBottom: `2px solid ${RULE}` }}>
      {tiles.map((t, i) => <TileBox key={t.label} t={t} label={tp.labels[i]} tp={tp} accent={accent} w={tw} />)}
    </div>
  )
}

/** A fixed-width column of tiles in a ruled box (the ball column): `h` tall, the tiles spaced down it. */
export function TileCol({ tiles, w, h, accent, big = 36 }) {
  const tp = tilesPlan(tiles, w, big, { tight: true })
  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: w, height: h, flexShrink: 0, justifyContent: 'space-around', borderRadius: 12, border: `2px solid ${alpha(INK, 0.14)}`, background: alpha(INK, 0.04) }}>
      {tiles.map((t, i) => <TileBox key={t.label} t={{ ...t, hot: true }} label={tp.labels[i]} tp={tp} accent={accent} w={w - 4} />)}
    </div>
  )
}
/** The height a tile column needs (its tiles, no spacing). */
export const tileColH = (tiles, w, big = 36) => { const tp = tilesPlan(tiles, w, big, { tight: true }); return tp.h * tiles.length + 4 }

// ── THE CLOSING BANNER AND THE PRICE ────────────────────────────────────────────────────────────────────────────────────────
/** A quiet right-hand word for a banner (a plan like oddsPlan's: its width and its node). */
export function quietRight(text, { size = 22, ls = 4, color } = {}) {
  const w = textWidth(text, { size, weight: 800, ls })
  return { w, node: <span style={{ fontSize: size, fontWeight: 800, letterSpacing: ls, color, whiteSpace: 'nowrap' }}>{text}</span> }
}

/** A price block for a banner, fitted to maxW: a small word, the price in the display face in the accent (stepped down), the book (cut with an ellipsis, last). */
export function oddsPlan({ word, value, book, accent }, maxW) {
  const val = String(value)
  const ww = word ? textWidth(word, { size: 22, weight: 800, ls: 2 }) + 10 : 0
  const tries = []
  for (const vs of [48, 42, 36, 32]) tries.push({ vs, word: true })
  for (const vs of [48, 42, 36, 32]) tries.push({ vs, word: false })
  for (const t of tries) {
    const vw = textWidth(val, { ...D, size: t.vs }) + Math.ceil(t.vs * 0.14)
    const wW = t.word ? ww : 0
    const bookMax = Math.min(260, maxW - wW - vw - 10)
    const bw = book ? textWidth(String(book), { size: 24, weight: 800 }) : 0
    if (book && bookMax < Math.min(bw, 90)) continue
    if (!book && wW + vw > maxW) continue
    const b = book ? ellipsize(String(book), { size: 24, weight: 800, maxW: bookMax }) : ''
    const w = wW + vw + (b ? 10 + textWidth(b, { size: 24, weight: 800 }) : 0)
    logFit({ id: 'odds', kind: 'row', text: `${val} ${b}`, size: t.vs, w, maxW, ok: w <= maxW })
    return {
      w,
      node: (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          {t.word && word ? <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: 2, color: INK }}>{word}</span> : null}
          <span style={{ fontFamily: DISPLAY, fontSize: t.vs, fontWeight: 900, lineHeight: 1, color: accent, transform: 'skewX(-8deg)' }}>{val}</span>
          {b ? <span style={{ fontSize: 24, fontWeight: 800, color: INK, whiteSpace: 'nowrap' }}>{b}</span> : null}
        </div>
      ),
    }
  }
  const vw = textWidth(val, { ...D, size: 32 })
  logFit({ id: 'odds', kind: 'row', text: val, size: 32, w: vw, maxW, ok: vw <= maxW })
  return { w: vw, node: <span style={{ fontFamily: DISPLAY, fontSize: 32, fontWeight: 900, lineHeight: 1, color: accent, transform: 'skewX(-8deg)' }}>{val}</span> }
}

/**
 * The closing status banner, `w` wide: the target mark, the line in the display face (a string, or alternatives longest first; the
 * display size steps 38 -> 22, then the last alternative is cut), and an optional right-hand plan ({ w, node }) that keeps its width.
 * `rightMax` is how wide the right-hand block may be (oddsPlan's maxW): ask for it with bannerRoom().
 */
export const bannerRoom = (w, line, rightPad = 0) => {
  const content = w - 48
  const lineMin = Math.min(textWidth(alts(line)[alts(line).length - 1] || '', { ...D, size: 30, upper: true }), 380)
  return content - 56 - 18 - lineMin - rightPad
}
export function Banner({ accent, called, line, right, h = 64, w }) {
  const edge = called ? accent : alpha(INK, 0.35)
  const ring = alpha(called ? accent : INK, called ? 0.4 : 0.14)
  const content = w - 48
  const room = content - 56 - (right ? right.w + 18 : 0)
  const ls = alts(line)
  let pick = null
  ls.forEach((t, i) => {
    if (pick) return
    const floor = i === ls.length - 1 ? 22 : 30
    for (const size of [38, 34, 30, 26, 22]) {
      if (size < floor) break
      if (textWidth(t, { ...D, size, upper: true }) <= room) { pick = { t, size }; return }
    }
  })
  if (!pick) { const t = ls[ls.length - 1] || ''; pick = { t: ellipsize(t, { ...D, size: 22, upper: true, maxW: room }), size: 22, truncated: true } }
  logFit({ id: 'banner', kind: 'row', text: pick.t, size: pick.size, w: textWidth(pick.t, { ...D, size: pick.size, upper: true }), maxW: room, ok: true, truncated: !!pick.truncated })
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: w, height: h, flexShrink: 0, padding: '0 20px 0 18px', gap: 18, background: called ? `linear-gradient(90deg, ${alpha(accent, 0.2)} 0%, ${alpha(accent, 0.04)} 100%)` : alpha(INK, 0.05), borderStyle: 'solid', borderWidth: '2px 2px 2px 8px', borderColor: `${ring} ${ring} ${ring} ${edge}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <Target size={40} color={called ? accent : INK2} />
        <span style={{ fontFamily: DISPLAY, fontSize: pick.size, fontWeight: 900, lineHeight: 1.05, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{pick.t}</span>
      </div>
      {right ? right.node : null}
    </div>
  )
}

/** A bullet line (a square in the accent, then the words), fitted: `size` down to the floor, then wrapped onto up to `maxLines`, then cut. */
export const bulletPlan = (text, { size = 24, maxW, maxLines = 1, id = 'bullet' }) => fitBlock(String(text ?? ''), { sizes: size > 22 ? [size, 22] : [22], maxW: maxW - 21, maxLines, id, weight: 800 })
export function Bullet({ text, accent, color = INK, size = 24, maxW, maxLines = 1, plan }) {
  const p = plan || bulletPlan(text, { size, maxW: maxW || lineW, maxLines })
  return (
    <div style={{ display: 'flex', alignItems: p.lines.length > 1 ? 'flex-start' : 'center', gap: 12 }}>
      <div style={{ display: 'flex', width: 9, height: 9, background: accent, marginTop: p.lines.length > 1 ? Math.round((lineH(p.size) - 9) / 2) : 0 }} />
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {p.lines.map((l, i) => <span key={i} style={{ fontSize: p.size, fontWeight: 800, lineHeight: LH, color, whiteSpace: 'nowrap' }}>{l}</span>)}
      </div>
    </div>
  )
}
export const bulletH = (p) => lineH(p.size, p.lines.length)

/** A row of "label over value" cells (`grow` shares the width), each value stepped down to fit its cell. */
export function cellsPlan(cells, w, big = 30) {
  const total = cells.reduce((a, c) => a + (c.grow || 1), 0)
  const out = cells.map((c) => {
    const cw = Math.floor((w * (c.grow || 1)) / total)
    const inner = cw - 2 - 32
    const lab = fitBlock(String(c.label), { sizes: [22], maxW: inner, maxLines: 1, id: `cell:${c.label}`, weight: 800, ls: 0.4 })
    const val = fitBlock(String(c.value), { sizes: [big, 28, 26, 24, 22].filter((s, i, a) => a.indexOf(s) === i && s <= big), maxW: inner, maxLines: 1, id: `cell-value:${c.label}`, weight: 800 })
    return { ...c, cw, lab, val }
  })
  const vs = Math.min(...out.map((c) => c.val.size))
  return { cells: out, h: 12 + lineH(22) + lineH(vs) }
}
export function CellRow({ plan, accent }) {
  return (
    <div style={{ display: 'flex', height: plan.h }}>
      {plan.cells.map((c) => (
        <div key={c.label} style={{ display: 'flex', flexDirection: 'column', width: c.cw, flexShrink: 0, padding: '6px 16px', borderLeft: `2px solid ${alpha(INK, 0.14)}` }}>
          <span style={{ fontSize: 22, fontWeight: 800, color: DIM, letterSpacing: 0.4, lineHeight: LH, whiteSpace: 'nowrap' }}>{c.lab.lines[0]}</span>
          <span style={{ fontSize: c.val.size, fontWeight: 800, lineHeight: LH, color: c.hot ? accent : INK, whiteSpace: 'nowrap' }}>{c.val.lines[0]}</span>
        </div>
      ))}
    </div>
  )
}

// ── SMALL FITTERS FOR THE FREE-FORM POSTERS ─────────────────────────────────────────────────────────────────────────────────
/** A display-caps line stepped down through `sizes` to fit maxW (the lean is reserved), cut with an ellipsis at the last size. { text, size }. */
export function displayFit(text, { sizes, maxW, id = 'display' }) {
  const s = String(text ?? '')
  const f = { ...D, upper: true }
  for (const size of sizes) {
    const w = textWidth(s, { ...f, size }) + Math.ceil(size * 0.16)
    if (w <= maxW) { logFit({ id, kind: 'line', text: s, size, w, maxW, ok: true }); return { text: s, size } }
  }
  const size = sizes[sizes.length - 1]
  const t = ellipsize(s, { ...f, size, maxW: maxW - Math.ceil(size * 0.16) })
  logFit({ id, kind: 'line', text: s, size, w: textWidth(t, { ...f, size }) + Math.ceil(size * 0.16), maxW, ok: true, truncated: t !== s })
  return { text: t, size }
}

/** The first of `texts` (longest first) that fits `maxW` on one line at one of `sizes` (body face); the last one, cut, when none does. { text, size }. */
export function fitAlts(texts, { sizes, maxW, id = 'alt', weight = 800, ls = 0 }) {
  const list = alts(texts)
  for (const t of list) {
    for (const size of sizes) {
      const w = textWidth(t, { size, weight, ls })
      if (w <= maxW) { logFit({ id, kind: 'line', text: t, size, w, maxW, ok: true }); return { text: t, size } }
    }
  }
  const size = sizes[sizes.length - 1]
  const last = list[list.length - 1] || ''
  const t = ellipsize(last, { size, weight, ls, maxW })
  logFit({ id, kind: 'line', text: last, size, w: textWidth(t, { size, weight, ls }), maxW, ok: true, truncated: t !== last })
  return { text: t, size }
}

/**
 * A line with a left part and a right part inside `w`: the RIGHT part (its alternatives, longest first) is fitted first, the LEFT gets
 * the rest (stepped down, then cut). Each part is { texts, sizes, weight, color }. Returns { node, h }.
 */
export function splitLine({ left, right, w, gap = 16, id = 'split' }) {
  const r = right ? fitAlts(right.texts, { sizes: right.sizes, maxW: Math.floor(w * 0.6), id: `${id}-r`, weight: right.weight || 800 }) : null
  const rw = r ? textWidth(r.text, { size: r.size, weight: right.weight || 800 }) : 0
  const l = left ? fitAlts(left.texts, { sizes: left.sizes, maxW: w - rw - (r ? gap : 0), id: `${id}-l`, weight: left.weight || 800 }) : null
  const size = Math.max(l?.size || 0, r?.size || 0)
  return {
    h: lineH(size || 22),
    node: (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap, width: w }}>
        {l ? <span style={{ display: 'flex', fontSize: l.size, fontWeight: left.weight || 800, lineHeight: LH, color: left.color || INK, whiteSpace: 'nowrap' }}>{l.text}</span> : <span />}
        {r ? <span style={{ display: 'flex', fontSize: r.size, fontWeight: right.weight || 800, lineHeight: LH, color: right.color || INK, whiteSpace: 'nowrap' }}>{r.text}</span> : null}
      </div>
    ),
  }
}
