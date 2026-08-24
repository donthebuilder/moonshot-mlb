// NFL SHARE CARD (2026-08-24) — the last piece of "bring NFL to parity with
// MLB." Mirrors components/shareCard.js's downloadPlayerCard: a poster for
// ONE pick, canvas-based, zero dependencies, downloads instantly. NOT a port
// of the MLB file's full eight-export surface — this repo doesn't have MLB's
// season-long player database (season_hr, last5_hr, hr_shape_profile, ...)
// behind an NFL pick, and MLB's Board/Pools/Pairs/Storylines/Track-Record
// posters all lean on that richer per-player row or a whole-tab dataset this
// scope was explicitly told not to reach for. What NFL's Picks and
// Accountability tabs actually hand around is a compact "rung" — name, team,
// opp, position, market, rank, bar, plus a score before kickoff or an
// actual/hit/void line after — so that's the one shape this file draws.
//
// PREGAME vs GRADED is decided by the DATA, not by two separate functions —
// same mechanism downloadGameCard uses on the MLB side (the score bar swaps
// for a graded ✅/❌ readout the moment `actual_hr`/`actual_hits` shows up on
// a player). Here: pass a `score` and the card reads as a pregame case: pass
// `hit` (true/false/null-for-void) and it reads as a graded result instead.
// One function, one call site shape, no drift between "here's who we like"
// and "here's how it hit."
//
// Branding is NflHeader.js's own, not reinvented: the green→cyan GRADIENT,
// the "TD" logo box (MLB's is "HR"), the C token palette from
// lib/nfl/theme.js. No NFL team colors exist anywhere in this codebase and
// this file doesn't invent a 32-team hex table to fill that gap — team
// identity prints as plain text next to a neutral bordered chip, the same
// chip language components/ui.js already uses everywhere else on the site.
//
// NOT BUILT HERE: any network call, any social-platform posting, any
// automatic trigger. This produces a PNG on the visitor's own machine when
// THEY click a button. See lib/nfl/shareCaption.js for the text half of this
// same pair.

import { C, gradeFor } from '../../lib/nfl/theme'

const MONO = "'Roboto Mono','SF Mono','Cascadia Mono',Menlo,Consolas,monospace"
const SANS = 'system-ui, -apple-system, sans-serif'

// Mirrors Accountability.js's own MARKET_COLOR — kept in lockstep by hand,
// same discipline that file's MARKET_OUTCOME_TEXT comment already calls out
// for itself. Seven markets, seven accents, all drawn from lib/nfl/theme.js.
const MARKET_COLOR = {
  TD: C.green,
  REC_YDS: C.cyan,
  REC: C.lime,
  RUSH_YDS: C.blue,
  RUSH_ATT: C.purple,
  PASS_YDS: C.orange,
  KICK_PTS: C.yellow,
}

const HEAD_H = 84

function ellipsize(g, text, max) {
  const t0 = String(text ?? '')
  if (g.measureText(t0).width <= max) return t0
  let t = t0
  while (t.length > 2 && g.measureText(t + '…').width > max) t = t.slice(0, -1)
  return t + '…'
}

// Field: near-black with two accent glows — the same "MOONSHOT front page"
// language as the MLB card, in the NFL green/cyan pair instead of orange/red.
function posterField(g, W, H) {
  g.fillStyle = C.bg; g.fillRect(0, 0, W, H)
  let rg = g.createRadialGradient(90, 0, 0, 90, 0, Math.max(W, H) * 0.85)
  rg.addColorStop(0, 'rgba(34,197,94,0.16)'); rg.addColorStop(1, 'rgba(34,197,94,0)')
  g.fillStyle = rg; g.fillRect(0, 0, W, H)
  rg = g.createRadialGradient(W, H, 0, W, H, Math.max(W, H) * 0.9)
  rg.addColorStop(0, 'rgba(34,211,238,0.12)'); rg.addColorStop(1, 'rgba(34,211,238,0)')
  g.fillStyle = rg; g.fillRect(0, 0, W, H)
}

function posterHeader(g, W, label, sub) {
  const grad = g.createLinearGradient(22, 0, 66, 0)
  grad.addColorStop(0, C.green); grad.addColorStop(1, C.cyan)
  g.fillStyle = grad
  g.beginPath(); g.roundRect(22, 20, 44, 44, 11); g.fill()
  g.fillStyle = '#052e16'; g.font = `900 15px ${MONO}`
  g.textAlign = 'center'; g.fillText('TD', 44, 43); g.textAlign = 'left'

  g.fillStyle = C.text; g.font = `900 21px ${SANS}`
  g.fillText('MOONSHOT', 80, 34)
  const wmW = g.measureText('MOONSHOT').width
  g.fillStyle = C.green; g.font = `900 12px ${MONO}`
  g.fillText('🏈 ' + label, 82 + wmW + 10, 35)
  g.fillStyle = C.text3; g.font = `600 11px ${MONO}`
  g.fillText(sub, 80, 56)
  g.strokeStyle = C.border
  g.beginPath(); g.moveTo(0, HEAD_H - 0.5); g.lineTo(W, HEAD_H - 0.5); g.stroke()
}

function posterFooter(g, W, H, note) {
  const fy = H - 23
  g.fillStyle = C.text3; g.font = `600 10px ${MONO}`
  g.fillText(note, 22, fy)
  g.fillStyle = C.text2; g.font = `800 10px ${MONO}`
  g.textAlign = 'right'
  g.fillText('moonshot-mlb.vercel.app', W - 22, fy)
  g.textAlign = 'left'
  g.fillStyle = C.green; g.fillRect(0, H - 3, W, 3)
}

function newPoster(W, H) {
  const c = document.createElement('canvas')
  const scale = 2
  c.width = W * scale; c.height = H * scale
  const g = c.getContext('2d')
  g.scale(scale, scale)
  g.textBaseline = 'middle'
  posterField(g, W, H)
  return { c, g }
}

function savePoster(c, filename) {
  const a = document.createElement('a')
  a.download = filename
  a.href = c.toDataURL('image/png')
  a.click()
}

const slug = (s) => String(s || 'pick').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'pick'
const todayStamp = () => new Date().toLocaleDateString('en-CA')

// A neutral team/position chip — no invented team colors, same bordered-pill
// language components/ui.js's chipStyle() already renders in the DOM.
function chip(g, x, midY, text, color = C.text2) {
  g.font = `800 10px ${MONO}`
  const w = Math.max(30, g.measureText(text).width + 14)
  g.fillStyle = `${color}22`
  g.beginPath(); g.roundRect(x, midY - 10, w, 20, 6); g.fill()
  g.strokeStyle = `${color}55`; g.lineWidth = 1
  g.beginPath(); g.roundRect(x + 0.5, midY - 9.5, w - 1, 19, 6); g.stroke()
  g.fillStyle = color
  g.textAlign = 'center'; g.fillText(text, x + w / 2, midY + 1); g.textAlign = 'left'
  return w
}

function scoreBar(g, x, midY, w, score, color) {
  const h = 9
  g.fillStyle = 'rgba(255,255,255,0.07)'
  g.beginPath(); g.roundRect(x, midY - h / 2, w, h, h / 2); g.fill()
  const fillW = Math.max(6, w * Math.min(1, Math.max(0, score) / 100))
  const grad = g.createLinearGradient(x, 0, x + w, 0)
  grad.addColorStop(0, C.green); grad.addColorStop(1, color || C.cyan)
  g.fillStyle = grad
  g.beginPath(); g.roundRect(x, midY - h / 2, fillW, h, h / 2); g.fill()
}

// ── 🎫 THE PICK CARD — one rung, poster-sized. `pick` is the same compact
// shape both Picks.js (a rung, pregame) and Accountability.js (a graded
// card row) already carry — see the shape note below. Nothing here is
// re-derived from a season database; every field on the card is a field the
// caller already had on screen.
//
// Shape of `pick`:
//   name, team, opp, position   — who, and against whom
//   market, marketLabel         — which of the seven markets (theme.js MARKETS)
//   rank, bar                   — this rung's position on the card, and its bar
//   questionable, low_sample    — the same flags Picks.js already renders
//   score                       — 0–100, PREGAME mode when present
//   hit, actual, void, grade    — GRADED mode when `hit` is present (true/
//                                 false/null-for-void); `actual` is the
//                                 stat line that graded it, `grade` the
//                                 letter grade published on the card
//   tag, tagColor               — optional small chip, e.g. "BOT PICK" or
//                                 "YOUR PICK · LOCK" (Picks.js's own
//                                 conviction colors) — omitted if not passed
export function downloadNflPickCard(pick = {}) {
  const graded = pick.hit === true || pick.hit === false || pick.void === true
  const marketColor = MARKET_COLOR[pick.market] || C.green

  const W = 640
  const idH = 96
  const resultH = 108
  const footH = 42
  const H = HEAD_H + idH + resultH + footH
  const { c, g } = newPoster(W, H)

  const label = graded ? 'RESULT CARD' : 'PICK CARD'
  const sub = `${new Date().toLocaleDateString()}${pick.marketLabel ? ' · ' + pick.marketLabel : ''}${pick.rank ? ` · rung ${pick.rank} of 5` : ''}`
  posterHeader(g, W, label, sub)

  // ── identity ─────────────────────────────────────────────────────────
  const y0 = HEAD_H
  // ghost watermark — the pregame score, or a check/cross once it's graded
  g.fillStyle = graded
    ? (pick.hit === true ? 'rgba(34,197,94,0.10)' : pick.hit === false ? 'rgba(248,113,113,0.10)' : 'rgba(139,139,149,0.10)')
    : 'rgba(34,197,94,0.09)'
  g.font = `900 108px ${MONO}`
  const ghost = graded ? (pick.hit === true ? '✓' : pick.hit === false ? '✗' : '–') : (Number.isFinite(pick.score) ? Math.round(pick.score).toString() : '—')
  g.textAlign = 'right'; g.fillText(ghost, W - 16, y0 + idH / 2 + 6); g.textAlign = 'left'

  g.fillStyle = marketColor; g.font = `800 9px ${MONO}`
  g.fillText(graded ? 'H O W   I T   H I T' : 'T H E   C A S E   F O R', 24, y0 + 18)

  g.fillStyle = C.text; g.font = `900 27px ${SANS}`
  const nm = ellipsize(g, pick.name || 'Unknown', 380)
  g.fillText(nm, 22, y0 + 42)
  const nmW = g.measureText(nm).width
  let ix = 22 + nmW + 12
  if (pick.position) ix += chip(g, ix, y0 + 42, pick.position, C.text2) + 6
  if (pick.team) ix += chip(g, ix, y0 + 42, pick.team, C.text2) + 6

  g.fillStyle = C.text3; g.font = `700 10.5px ${MONO}`
  const idBits = [pick.opp ? `vs ${pick.opp}` : null]
  if (pick.questionable) idBits.push('Q')
  if (pick.low_sample) idBits.push('backfilled, thin sample')
  g.fillText(idBits.filter(Boolean).join('  ·  '), 24, y0 + 64)

  let cx = 24
  if (pick.marketLabel) cx += chip(g, cx, y0 + 82, pick.marketLabel.toUpperCase(), marketColor) + 8
  if (pick.tag) chip(g, cx, y0 + 82, String(pick.tag).toUpperCase(), pick.tagColor || C.cyan)

  // ── the result ───────────────────────────────────────────────────────
  const y1 = y0 + idH
  g.strokeStyle = `${marketColor}38`
  g.beginPath(); g.moveTo(0, y1 + 0.5); g.lineTo(W, y1 + 0.5); g.stroke()

  if (!graded) {
    g.fillStyle = C.text3; g.font = `800 8.5px ${MONO}`
    g.fillText('SCORE', 24, y1 + 22)
    const scoreTxt = Number.isFinite(pick.score) ? Math.round(pick.score).toString() : '—'
    g.fillStyle = marketColor; g.font = `900 34px ${MONO}`
    g.fillText(scoreTxt, 24, y1 + 48)
    const numW = g.measureText(scoreTxt).width
    if (pick.grade) {
      const gr = gradeFor(pick.score)
      const gl = pick.grade
      g.font = `800 13px ${MONO}`
      const gw = g.measureText(gl).width + 16
      g.strokeStyle = `${gr.color}66`; g.lineWidth = 1
      g.beginPath(); g.roundRect(24 + numW + 14, y1 + 36, gw, 22, 7); g.stroke()
      g.fillStyle = gr.color; g.fillText(gl, 24 + numW + 22, y1 + 48)
    }
    scoreBar(g, 24, y1 + 74, W - 48, pick.score || 0, marketColor)
    if (Number.isFinite(pick.bar)) {
      g.fillStyle = C.text3; g.font = `600 10px ${MONO}`
      g.fillText(`market bar ${pick.bar}`, 24, y1 + 92)
    }
  } else {
    const tone = pick.hit === true ? C.green : pick.hit === false ? C.red : C.text3
    const word = pick.hit === true ? 'HIT' : pick.hit === false ? 'MISS' : 'VOID'
    const icon = pick.hit === true ? '✅' : pick.hit === false ? '❌' : '—'
    g.fillStyle = tone; g.font = `900 30px ${MONO}`
    g.fillText(`${icon} ${word}`, 24, y1 + 34)
    const lineBits = []
    if (Number.isFinite(pick.actual)) lineBits.push(`actual ${pick.actual}`)
    if (Number.isFinite(pick.bar)) lineBits.push(`bar ${pick.bar}`)
    g.fillStyle = C.text2; g.font = `700 13px ${MONO}`
    g.fillText(lineBits.join(' · ') || (pick.void ? 'no line — cut, inactive, or a bye' : ''), 24, y1 + 62)
    if (pick.grade) {
      g.fillStyle = C.text3; g.font = `600 10.5px ${MONO}`
      g.fillText(`called pregame at grade ${pick.grade}`, 24, y1 + 84)
    }
  }

  posterFooter(g, W, H, graded
    ? 'graded against the market’s own published bar — see Accountability for the full card'
    : 'not a probability — the bot’s own 0–100 ranking for this market')
  savePoster(c, `${graded ? 'result' : 'pick'}-${slug(pick.market)}-${slug(pick.name)}_${todayStamp()}.png`)
}
