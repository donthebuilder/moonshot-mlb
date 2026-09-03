// SHARE CARD v2 — a poster, not a screenshot of a table.
//
// 2026-08-15, Donovan, holding the v1 export: "can you make this better…
// something more creative for the export share card." v1 was twelve identical
// rows — correct, and completely anonymous. v2 is built like the site's own
// front page: the #1 hitter gets a headliner block with a ghost numeral (the
// same watermark language the game cards wear), every team wears a colored
// monogram chip (his call on logos was "didn't really want to" — agreed:
// trademarked art, an outside fetch, and visual noise; a color says the team
// without any of that), and the whole thing sits on a warm ember field with
// the MOONSHOT wordmark, so a repost is an ad for the site.
//
// Still canvas, still zero dependencies, still downloads instantly.

import { nameOf, teamOf, oppOf, hrScore, n } from '../lib/player'
import { hr9Color } from '../lib/hr9'

const pickOf = (p) => String(p?.game_pick_role || '').split('/')[0].trim().toUpperCase()

// Primary team colors — recognition without trademarks. Chip text flips dark
// on light colors (PIT gold, MIA blue) via luminance.
export const TEAM_COLORS = {
  ARI: '#A71930', ATH: '#003831', ATL: '#CE1141', BAL: '#DF4601', BOS: '#BD3039',
  CHC: '#0E3386', CIN: '#C6011F', CLE: '#00385D', COL: '#333366', CWS: '#3E3A38',
  DET: '#0C2340', HOU: '#EB6E1F', KC: '#004687', LAA: '#BA0021', LAD: '#005A9C',
  MIA: '#00A3E0', MIL: '#12284B', MIN: '#002B5C', NYM: '#002D72', NYY: '#1C2841',
  PHI: '#E81828', PIT: '#FDB827', SD: '#2F241D', SEA: '#0C2C56', SF: '#FD5A1E',
  STL: '#C41E3A', TB: '#092C5C', TEX: '#003278', TOR: '#134A8E', WSH: '#AB0003',
  WSN: '#AB0003', OAK: '#003831',
}
const teamColor = (abbr) => TEAM_COLORS[String(abbr || '').toUpperCase()] || '#3f3f46'
const inkOn = (hex) => {
  const m = /^#([0-9a-f]{6})$/i.exec(hex || '')
  if (!m) return '#fff'
  const v = parseInt(m[1], 16)
  const lum = 0.299 * (v >> 16) + 0.587 * ((v >> 8) & 255) + 0.114 * (v & 255)
  return lum > 150 ? '#111114' : '#fff'
}

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace'
const SANS = 'system-ui, -apple-system, sans-serif'

function ellipsize(g, text, max) {
  if (g.measureText(text).width <= max) return text
  let t = text
  while (t.length > 2 && g.measureText(t + '…').width > max) t = t.slice(0, -1)
  return t + '…'
}

function monogram(g, x, midY, abbr) {
  const col = teamColor(abbr)
  g.font = `800 10px ${MONO}`
  const w = Math.max(34, g.measureText(abbr).width + 14)
  g.fillStyle = col
  g.beginPath(); g.roundRect(x, midY - 10, w, 20, 6); g.fill()
  g.fillStyle = inkOn(col)
  g.textAlign = 'center'
  g.fillText(abbr, x + w / 2, midY + 1)
  g.textAlign = 'left'
  return w
}

function botChip(g, x, midY, tag) {
  g.font = `800 10px ${MONO}`
  const label = `🤖 ${tag}`
  const w = g.measureText(label).width + 16
  g.fillStyle = 'rgba(249,115,22,0.16)'
  g.beginPath(); g.roundRect(x, midY - 10, w, 20, 6); g.fill()
  g.strokeStyle = 'rgba(249,115,22,0.45)'; g.lineWidth = 1
  g.beginPath(); g.roundRect(x + 0.5, midY - 9.5, w - 1, 19, 6); g.stroke()
  g.fillStyle = '#f97316'
  g.fillText(label, x + 8, midY + 1)
  return w
}

function scoreBar(g, x, midY, w, score, strong = false) {
  const h = strong ? 9 : 7
  g.fillStyle = 'rgba(255,255,255,0.07)'
  g.beginPath(); g.roundRect(x, midY - h / 2, w, h, h / 2); g.fill()
  const fillW = Math.max(6, w * Math.min(1, score / 100))
  const grad = g.createLinearGradient(x, 0, x + w, 0)
  grad.addColorStop(0, '#f97316'); grad.addColorStop(1, strong ? '#FCD34D' : '#fb923c')
  g.fillStyle = grad
  g.beginPath(); g.roundRect(x, midY - h / 2, fillW, h, h / 2); g.fill()
}

export function downloadShareCard(items = [], { title = 'MY WATCHLIST' } = {}) {
  const sorted = [...items].sort((a, b) => hrScore(b) - hrScore(a))
  const hero = sorted[0]
  const rows = sorted.slice(1, 12)

  const W = 760
  const headH = 88
  const heroH = hero ? 132 : 0
  const rowH = 43
  const footH = 46
  const H = headH + heroH + rows.length * rowH + footH

  const c = document.createElement('canvas')
  const scale = 2
  c.width = W * scale; c.height = H * scale
  const g = c.getContext('2d')
  g.scale(scale, scale)
  g.textBaseline = 'middle'

  // ── field: near-black with two warm glows, so it reads MOONSHOT at a glance
  g.fillStyle = '#0a0a0d'; g.fillRect(0, 0, W, H)
  let rg = g.createRadialGradient(90, 0, 0, 90, 0, 560)
  rg.addColorStop(0, 'rgba(249,115,22,0.16)'); rg.addColorStop(1, 'rgba(249,115,22,0)')
  g.fillStyle = rg; g.fillRect(0, 0, W, H)
  rg = g.createRadialGradient(W, H, 0, W, H, 620)
  rg.addColorStop(0, 'rgba(239,68,68,0.10)'); rg.addColorStop(1, 'rgba(239,68,68,0)')
  g.fillStyle = rg; g.fillRect(0, 0, W, H)

  // ── header ────────────────────────────────────────────────────────────
  g.fillStyle = '#f97316'
  g.beginPath(); g.roundRect(24, 22, 44, 44, 11); g.fill()
  g.fillStyle = '#fff'; g.font = `900 16px ${MONO}`
  g.textAlign = 'center'; g.fillText('HR', 46, 45); g.textAlign = 'left'

  g.fillStyle = '#f4f4f5'; g.font = `900 19px ${SANS}`
  g.fillText('DASH NETWORK', 82, 36)
  const wmW = g.measureText('DASH NETWORK').width
  g.fillStyle = '#f97316'; g.font = `900 12px ${MONO}`
  g.fillText('🌙 MOONSHOT · ' + title, 84 + wmW + 10, 37)
  g.fillStyle = '#a1a1aa'; g.font = `600 11px ${MONO}`
  g.fillText(`${new Date().toLocaleDateString()} · ${items.length} hitters · HR score, the bot's own ranking`, 82, 58)

  // date chip, right side
  g.font = `800 11px ${MONO}`
  const nite = 'TONIGHT'
  const nw = g.measureText(nite).width + 20
  g.strokeStyle = 'rgba(249,115,22,0.5)'; g.lineWidth = 1
  g.beginPath(); g.roundRect(W - 24 - nw, 32, nw, 24, 12); g.stroke()
  g.fillStyle = '#f97316'; g.textAlign = 'center'
  g.fillText(nite, W - 24 - nw / 2, 45); g.textAlign = 'left'

  g.strokeStyle = 'rgba(255,255,255,0.07)'
  g.beginPath(); g.moveTo(0, headH - 0.5); g.lineTo(W, headH - 0.5); g.stroke()

  // ── the headliner — #1 gets the front-page treatment ──────────────────
  if (hero) {
    const y0 = headH
    // ghost numeral, the game cards' own watermark language
    g.fillStyle = 'rgba(249,115,22,0.09)'
    g.font = `900 128px ${MONO}`
    g.textAlign = 'right'; g.fillText('1', W - 18, y0 + heroH / 2 + 8); g.textAlign = 'left'

    g.fillStyle = '#f97316'; g.font = `800 9.5px ${MONO}`
    g.fillText('T H E   H E A D L I N E R', 26, y0 + 22)

    g.fillStyle = '#f4f4f5'; g.font = `900 27px ${SANS}`
    const heroName = ellipsize(g, nameOf(hero), 420)
    g.fillText(heroName, 24, y0 + 47)
    const hnW = g.measureText(heroName).width

    let hx = 24 + hnW + 12
    hx += monogram(g, hx, y0 + 47, teamOf(hero)) + 6
    g.fillStyle = '#71717a'; g.font = `700 11px ${MONO}`
    g.fillText(`vs ${oppOf(hero)}`, hx, y0 + 48)

    // his mini line — the numbers a bettor asks for first
    const bits = []
    if (n(hero?.season_hr, 0) > 0) bits.push(`SZN ${n(hero.season_hr, 0)} HR`)
    if (n(hero?.last5_hr, 0) > 0) bits.push(`L5 ${n(hero.last5_hr, 0)} HR`)
    const iso = n(hero?.season_iso, NaN)
    if (Number.isFinite(iso)) bits.push(`ISO ${iso.toFixed(3).replace(/^0/, '')}`)
    const gs = n(hero?.games_since_last_hr, NaN)
    if (Number.isFinite(gs)) bits.push(gs === 0 ? 'WENT YARD LAST GAME' : `${gs}G SINCE HR`)
    g.fillStyle = '#a1a1aa'; g.font = `700 10.5px ${MONO}`
    g.fillText(bits.join('   ·   '), 26, y0 + 72)

    const pk = pickOf(hero)
    if (pk) botChip(g, 26 + g.measureText(bits.join('   ·   ')).width + 16, y0 + 71, pk)

    // full-width bar + the big number
    const score = hrScore(hero)
    g.fillStyle = '#f97316'; g.font = `900 34px ${MONO}`
    g.textAlign = 'right'; g.fillText(score.toFixed(0), W - 26, y0 + 103); g.textAlign = 'left'
    const numW = g.measureText(score.toFixed(0)).width + 44
    scoreBar(g, 26, y0 + 103, W - 26 - numW - 26, score, true)

    g.strokeStyle = 'rgba(249,115,22,0.25)'
    g.beginPath(); g.moveTo(0, y0 + heroH - 0.5); g.lineTo(W, y0 + heroH - 0.5); g.stroke()
  }

  // ── the board, ranks 2–12 ─────────────────────────────────────────────
  rows.forEach((p, i) => {
    const rank = i + 2
    const yTop = headH + heroH + i * rowH
    if (i % 2 === 0) { g.fillStyle = 'rgba(255,255,255,0.024)'; g.fillRect(0, yTop, W, rowH) }
    const mid = yTop + rowH / 2

    g.fillStyle = rank <= 3 ? '#FCD34D' : '#71717a'
    g.font = `800 12px ${MONO}`
    g.textAlign = 'right'; g.fillText(String(rank), 40, mid); g.textAlign = 'left'

    monogram(g, 52, mid, teamOf(p))

    g.fillStyle = '#f4f4f5'; g.font = `800 15px ${SANS}`
    g.fillText(ellipsize(g, nameOf(p), 208), 96, mid)

    g.fillStyle = '#71717a'; g.font = `600 10.5px ${MONO}`
    g.fillText(`vs ${oppOf(p)}`, 312, mid + 1)

    const pk = pickOf(p)
    if (pk) botChip(g, 392, mid, pk)

    const score = hrScore(p)
    scoreBar(g, 500, mid, 172, score)
    g.fillStyle = '#f97316'; g.font = `900 14px ${MONO}`
    g.textAlign = 'right'; g.fillText(score.toFixed(0), W - 24, mid); g.textAlign = 'left'
  })

  // ── footer ────────────────────────────────────────────────────────────
  const fy = H - footH / 2
  g.fillStyle = '#52525b'; g.font = `600 10px ${MONO}`
  const more = items.length > 12 ? `+ ${items.length - 12} more on the list · ` : ''
  g.fillText(`${more}🤖 = the bot's designated pick tonight`, 24, fy)
  g.fillStyle = '#a1a1aa'; g.font = `800 10px ${MONO}`
  g.textAlign = 'right'
  g.fillText('DASH NETWORK · MOONSHOT', W - 24, fy)
  g.textAlign = 'left'
  g.fillStyle = '#f97316'; g.fillRect(0, H - 3, W, 3)

  const a = document.createElement('a')
  a.download = `watchlist_${new Date().toLocaleDateString('en-CA')}.png`
  a.href = c.toDataURL('image/png')
  a.click()
}

// ── 🎴 THE PLAYER CARD (2026-08-15, Donovan: "a single player card would be
// cool too, just has to look nice and useful") ────────────────────────────
//
// One hitter, poster-sized: who he is, the bot's call graded on HIS market
// (same coherence rule The Read enforces — a Skip HR never wears a grade),
// every score as a bar, the bat vs the arm side by side, and the one block
// no other site can print — HIS HOMER SIGNATURE, the five shape bands his
// season homers actually take (lib/hrShape's own colors, hr_shape_profile
// straight off the slate row). Zero fetches; everything is already on `p`.

import { compactRole, gradeFor, bestBet } from '../lib/scoring'
import { clean } from '../lib/player'

const BANDS = [
  ['wall_scraper', 'WALL', '#9ca3af'],
  ['laser', 'LASER', '#22d3ee'],
  ['standard', 'STD', '#a1a1aa'],
  ['moonshot', 'MOON', '#a78bfa'],
  ['no_doubter', 'NODBT', '#fb923c'],
]

const ORD1 = ['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th']

function kvRow(g, x, y, w, label, value, valCol = '#f4f4f5') {
  g.fillStyle = '#71717a'; g.font = `700 10px ${MONO}`
  g.textAlign = 'left'; g.fillText(label, x, y)
  g.fillStyle = valCol; g.font = `800 12px ${MONO}`
  g.textAlign = 'right'; g.fillText(value, x + w, y)
  g.textAlign = 'left'
  g.strokeStyle = 'rgba(255,255,255,0.05)'
  g.beginPath(); g.moveTo(x, y + 11); g.lineTo(x + w, y + 11); g.stroke()
}

export function downloadPlayerCard(p, { jersey = null } = {}) {
  if (!p) return
  const score = hrScore(p)
  const role = compactRole(p)
  const skipHr = /skip/i.test(role)
  const roleType = /hit/i.test(role) && !skipHr ? 'hit'
    : /hrr/i.test(role) ? 'hrr'
    : /(tb|contact)/i.test(role) ? 'tb'
    : 'hr'
  const grade = gradeFor(p, roleType)
  const bet = bestBet(p, roleType)

  const prof = p?.hr_shape_profile || {}
  const sigN = n(prof?.n, 0)
  const hasSig = sigN > 0

  const W = 680
  const headH = 80
  const idH = 104
  const scoreH = 84
  const colH = 158
  const sigH = hasSig ? 84 : 0
  const footH = 42
  const H = headH + idH + scoreH + colH + sigH + footH

  const c = document.createElement('canvas')
  const scale = 2
  c.width = W * scale; c.height = H * scale
  const g = c.getContext('2d')
  g.scale(scale, scale)
  g.textBaseline = 'middle'

  // field — same ember language as the list card
  g.fillStyle = '#0a0a0d'; g.fillRect(0, 0, W, H)
  let rg = g.createRadialGradient(80, 0, 0, 80, 0, 520)
  rg.addColorStop(0, 'rgba(249,115,22,0.17)'); rg.addColorStop(1, 'rgba(249,115,22,0)')
  g.fillStyle = rg; g.fillRect(0, 0, W, H)
  rg = g.createRadialGradient(W, H, 0, W, H, 560)
  rg.addColorStop(0, 'rgba(239,68,68,0.10)'); rg.addColorStop(1, 'rgba(239,68,68,0)')
  g.fillStyle = rg; g.fillRect(0, 0, W, H)

  // header
  g.fillStyle = '#f97316'
  g.beginPath(); g.roundRect(22, 19, 42, 42, 10); g.fill()
  g.fillStyle = '#fff'; g.font = `900 15px ${MONO}`
  g.textAlign = 'center'; g.fillText('HR', 43, 41); g.textAlign = 'left'
  g.fillStyle = '#f4f4f5'; g.font = `900 18px ${SANS}`
  g.fillText('DASH NETWORK', 76, 33)
  const wmW2 = g.measureText('DASH NETWORK').width
  g.fillStyle = '#f97316'; g.font = `900 11.5px ${MONO}`
  g.fillText('🌙 MOONSHOT · PLAYER CARD', 78 + wmW2 + 10, 34)
  g.fillStyle = '#a1a1aa'; g.font = `600 10.5px ${MONO}`
  g.fillText(`${new Date().toLocaleDateString()} · DASH NETWORK`, 76, 54)
  g.font = `800 10.5px ${MONO}`
  const nite = 'TONIGHT'
  const nw2 = g.measureText(nite).width + 20
  g.strokeStyle = 'rgba(249,115,22,0.5)'; g.lineWidth = 1
  g.beginPath(); g.roundRect(W - 22 - nw2, 29, nw2, 23, 12); g.stroke()
  g.fillStyle = '#f97316'; g.textAlign = 'center'
  g.fillText(nite, W - 22 - nw2 / 2, 41); g.textAlign = 'left'
  g.strokeStyle = 'rgba(255,255,255,0.07)'
  g.beginPath(); g.moveTo(0, headH - 0.5); g.lineTo(W, headH - 0.5); g.stroke()

  // ── identity ──────────────────────────────────────────────────────────
  const y1 = headH
  // ghost score — the watermark IS his number tonight
  g.fillStyle = 'rgba(249,115,22,0.08)'
  g.font = `900 118px ${MONO}`
  g.textAlign = 'right'; g.fillText(score.toFixed(0), W - 14, y1 + idH / 2 + 6); g.textAlign = 'left'

  g.fillStyle = '#f97316'; g.font = `800 9px ${MONO}`
  g.fillText('T O N I G H T ’ S   C A S E   F O R', 24, y1 + 20)

  g.fillStyle = '#f4f4f5'; g.font = `900 30px ${SANS}`
  const nm = ellipsize(g, `${jersey != null ? `#${jersey} ` : ''}${nameOf(p)}`, 440)
  g.fillText(nm, 22, y1 + 44)
  const nmW = g.measureText(nm).width
  let ix = 22 + nmW + 12
  ix += monogram(g, ix, y1 + 44, teamOf(p)) + 8

  const spot = n(p?.lineup_spot, NaN)
  const bats = clean(p?.bats || p?.handedness, '')
  g.fillStyle = '#a1a1aa'; g.font = `700 10.5px ${MONO}`
  const idBits = [`vs ${oppOf(p)}`]
  if (bats && bats !== '—') idBits.push(`${bats}HB`)
  if (Number.isFinite(spot) && spot >= 1 && spot <= 9) idBits.push(`hitting ${ORD1[spot]}`)
  const gs2 = n(p?.games_since_last_hr, NaN)
  if (Number.isFinite(gs2)) idBits.push(gs2 === 0 ? 'went yard last game' : `${gs2}g since a homer`)
  g.fillText(idBits.join('  ·  '), 24, y1 + 70)

  // the bot's call, coherent with The Read: role chip + grade on HIS market
  let cx = 24
  cx += botChip(g, cx, y1 + 90, role.toUpperCase()) + 8
  if (!skipHr) {
    g.font = `800 10px ${MONO}`
    const gl = `GRADE ${grade}`
    const gw = g.measureText(gl).width + 16
    g.strokeStyle = 'rgba(252,211,77,0.5)'; g.lineWidth = 1
    g.beginPath(); g.roundRect(cx, y1 + 80, gw, 20, 6); g.stroke()
    g.fillStyle = '#FCD34D'; g.fillText(gl, cx + 8, y1 + 91)
    cx += gw + 8
    g.fillStyle = '#71717a'; g.font = `700 10px ${MONO}`
    g.fillText(`best play ${String(bet).toUpperCase()}`, cx + 2, y1 + 91)
  } else {
    g.fillStyle = '#71717a'; g.font = `700 10px ${MONO}`
    g.fillText('no homer case tonight — the bot passes', cx + 2, y1 + 91)
  }

  // ── the scores ────────────────────────────────────────────────────────
  const y2 = y1 + idH
  g.strokeStyle = 'rgba(249,115,22,0.22)'
  g.beginPath(); g.moveTo(0, y2 + 0.5); g.lineTo(W, y2 + 0.5); g.stroke()

  g.fillStyle = '#71717a'; g.font = `800 8.5px ${MONO}`
  g.fillText('HR SCORE', 24, y2 + 18)
  g.fillStyle = '#f97316'; g.font = `900 30px ${MONO}`
  g.fillText(score.toFixed(0), 24, y2 + 40)
  const bigW = g.measureText(score.toFixed(0)).width
  scoreBar(g, 24 + bigW + 14, y2 + 40, 250, score, true)

  // the other four, as labeled mini bars
  const minis = [
    ['HIT', hitScore2(p)], ['HRR', n(p?.hrr_score, 0)], ['TB', n(p?.contact_score, 0)], ['OVR', n(p?.overall_score, 0)],
  ]
  const mx0 = 24, my = y2 + 66, mw = (W - 48 - 3 * 14) / 4
  minis.forEach(([lab, v], i) => {
    const x = mx0 + i * (mw + 14)
    g.fillStyle = '#71717a'; g.font = `800 8.5px ${MONO}`
    g.fillText(lab, x, my)
    g.fillStyle = '#e4e4e7'; g.font = `900 11px ${MONO}`
    g.textAlign = 'right'; g.fillText(v ? v.toFixed(0) : '—', x + mw, my); g.textAlign = 'left'
    scoreBar(g, x, my + 12, mw, v || 0)
  })

  // ── the bat | the arm ─────────────────────────────────────────────────
  const y3 = y2 + scoreH + 6
  const colW = (W - 48 - 26) / 2
  const rx = 24 + colW + 26

  g.fillStyle = '#f4f4f5'; g.font = `900 11px ${MONO}`
  g.fillText('🔨 THE BAT', 24, y3 + 8)
  g.fillText('🥎 THE ARM', rx, y3 + 8)

  const brl = n(p?.recent_barrel_rate, NaN)
  const hh = n(p?.recent_hard_hit_rate, NaN)
  const mev = n(p?.hr_shape_components?.max_ev, NaN)
  const mds = n(p?.hr_shape_components?.max_distance, NaN)
  const iso2 = n(p?.season_iso, NaN)
  let ly = y3 + 30
  const bat = [
    ['Barrel % (recent)', Number.isFinite(brl) ? `${Math.round(brl * 100)}%` : '—', Number.isFinite(brl) && brl >= 0.12 ? '#f97316' : '#f4f4f5'],
    ['Hard-hit % (recent)', Number.isFinite(hh) ? `${Math.round(hh * 100)}%` : '—', Number.isFinite(hh) && hh >= 0.45 ? '#f97316' : '#f4f4f5'],
    ['Best recent ball', Number.isFinite(mds) && mds > 0 ? `${Math.round(mds)} ft${Number.isFinite(mev) && mev > 0 ? ` · ${mev.toFixed(0)} mph` : ''}` : '—', Number.isFinite(mds) && mds >= 400 ? '#f97316' : '#f4f4f5'],
    ['Season', `${n(p?.season_hr, 0)} HR${Number.isFinite(iso2) ? ` · ISO ${iso2.toFixed(3).replace(/^0/, '')}` : ''}`, '#f4f4f5'],
    ['Last 5', `${n(p?.last5_hr, 0)} HR · ${n(p?.last5_hits, 0)} H · ${n(p?.last5_xbh, 0)} XBH`, n(p?.last5_hr, 0) >= 2 ? '#f97316' : '#f4f4f5'],
  ]
  bat.forEach(([l, v, col]) => { kvRow(g, 24, ly, colW, l, v, col); ly += 25 })

  const hr9 = n(p?.pitcher_hr9, NaN)
  const whip2 = n(p?.pitcher_whip, NaN)
  const weakSide = clean(p?.pitcher_weak_side || p?.weak_side, '')
  const hisSide = weakSide && bats && ((weakSide === 'LHB' && bats === 'L') || (weakSide === 'RHB' && bats === 'R'))
  const parkF = n(p?.park_hr_factor, NaN)
  let ry = y3 + 30
  const arm = [
    ['Pitcher', `${clean(p?.pitcher_name, 'TBD')}${clean(p?.pitcher_throws, '') && clean(p?.pitcher_throws, '') !== '—' ? ` (${clean(p?.pitcher_throws, '')}HP)` : ''}`, '#f4f4f5'],
    ['HR/9', Number.isFinite(hr9) ? hr9.toFixed(2) : '—', hr9Color(hr9, '#f4f4f5')],
    ['WHIP', Number.isFinite(whip2) ? whip2.toFixed(2) : '—', Number.isFinite(whip2) && whip2 >= 1.4 ? '#f97316' : '#f4f4f5'],
    ['Weak vs', weakSide ? `${weakSide}${hisSide ? ' — his side ✓' : ''}` : '—', hisSide ? '#f97316' : '#f4f4f5'],
    ['Park', Number.isFinite(parkF) ? `${clean(p?.venue_name, '').split(' ').slice(0, 3).join(' ') || 'tonight'} · ${parkF >= 1.05 ? '+' : ''}${Math.round(100 * (parkF - 1))}% HR` : clean(p?.venue_name, '—'), Number.isFinite(parkF) && parkF >= 1.05 ? '#f97316' : '#f4f4f5'],
  ]
  arm.forEach(([l, v, col]) => { kvRow(g, rx, ry, colW, l, ellipsize(g, v, colW - 70), col); ry += 25 })

  // ── his homer signature ───────────────────────────────────────────────
  if (hasSig) {
    const y4 = y3 + colH - 6
    g.strokeStyle = 'rgba(255,255,255,0.07)'
    g.beginPath(); g.moveTo(24, y4 + 0.5); g.lineTo(W - 24, y4 + 0.5); g.stroke()

    g.fillStyle = '#f4f4f5'; g.font = `900 11px ${MONO}`
    g.fillText('💥 HIS HOMER SIGNATURE', 24, y4 + 18)
    g.fillStyle = '#71717a'; g.font = `600 9.5px ${MONO}`
    const la = Number.isFinite(n(prof?.la_lo, NaN)) && Number.isFinite(n(prof?.la_hi, NaN))
      ? ` · his homers leave at ${Math.round(prof.la_lo)}–${Math.round(prof.la_hi)}°` : ''
    g.fillText(`${sigN} tracked HR${sigN === 1 ? '' : 's'} this season${la}${sigN < 4 ? ' · thin sample' : ''}`, 190, y4 + 18)

    // the stacked band bar — clipped to its own rounded shape, with a
    // 2px breath between segments so it reads as bands, not a smear
    const bx = 24, bw = W - 48, by = y4 + 34, bh = 13
    g.save()
    g.beginPath(); g.roundRect(bx, by, bw, bh, 6); g.clip()
    g.fillStyle = 'rgba(255,255,255,0.06)'
    g.fillRect(bx, by, bw, bh)
    let acc = 0
    BANDS.forEach(([key, , col]) => {
      const ct = n(prof?.[key], 0)
      if (!ct) return
      const segW = (ct / sigN) * bw
      g.fillStyle = col
      g.fillRect(bx + acc, by, Math.max(0, segW - 2), bh)
      acc += segW
    })
    g.restore()
    // legend
    let lx = 24
    BANDS.forEach(([key, short, col]) => {
      const ct = n(prof?.[key], 0)
      if (!ct) return
      g.fillStyle = col
      g.beginPath(); g.arc(lx + 4, y4 + 62, 4, 0, Math.PI * 2); g.fill()
      g.fillStyle = '#a1a1aa'; g.font = `700 9.5px ${MONO}`
      const t = `${short} ${ct}`
      g.fillText(t, lx + 12, y4 + 62)
      lx += 12 + g.measureText(t).width + 16
    })
  }

  // footer — legend ellipsized against the URL's real width so the two can
  // never collide (v1 of this card shipped them overlapping)
  const fy2 = H - footH / 2
  g.font = `800 10px ${MONO}`
  const url = 'DASH NETWORK · MOONSHOT'
  const urlW = g.measureText(url).width
  g.fillStyle = '#52525b'; g.font = `600 9.5px ${MONO}`
  g.fillText(ellipsize(g, "scores are the bot's own 0–100 rankings, not probabilities", W - 24 - urlW - 42), 24, fy2)
  g.fillStyle = '#a1a1aa'; g.font = `800 10px ${MONO}`
  g.textAlign = 'right'; g.fillText(url, W - 22, fy2); g.textAlign = 'left'
  g.fillStyle = '#f97316'; g.fillRect(0, H - 3, W, 3)

  const a = document.createElement('a')
  const slug = String(nameOf(p) || 'player').toLowerCase().replace(/[^a-z0-9]+/g, '-')
  a.download = `${slug}_${new Date().toLocaleDateString('en-CA')}.png`
  a.href = c.toDataURL('image/png')
  a.click()
}

// hit score without importing the whole scoring surface twice — the slate's
// own field, same one the boards rank on.
function hitScore2(p) { return n(p?.hit_score, 0) }

// ── SIX MORE EXPORTS (2026-08-23) — Donovan: "boards tab games tab yeah
// track record and any other sneaky places maybe like pools and pairs so i
// can easily share them or share updates on it, maybe pitcher modal and
// storylines too, all those." Same rule as the two cards above: canvas only,
// zero dependencies, zero fetches — every card below draws from data its own
// tab already has sitting in scope, nothing re-fetched or recomputed that the
// site didn't already compute for the screen itself.
//
// The shared chrome (field glow, header wordmark, footer rule, save-as-PNG)
// got pulled into small helpers here because a sixth, seventh and eighth
// copy of the same ~30 lines stopped being worth it. The two cards above are
// left exactly as they were rather than retrofitted onto these helpers —
// "don't touch what already ships" — so there's a little duplication between
// this section and the one above it, on purpose.

const HEAD_H = 88

function posterField(g, W, H) {
  g.fillStyle = '#0a0a0d'; g.fillRect(0, 0, W, H)
  let rg = g.createRadialGradient(90, 0, 0, 90, 0, Math.max(W, H) * 0.85)
  rg.addColorStop(0, 'rgba(249,115,22,0.16)'); rg.addColorStop(1, 'rgba(249,115,22,0)')
  g.fillStyle = rg; g.fillRect(0, 0, W, H)
  rg = g.createRadialGradient(W, H, 0, W, H, Math.max(W, H) * 0.9)
  rg.addColorStop(0, 'rgba(239,68,68,0.10)'); rg.addColorStop(1, 'rgba(239,68,68,0)')
  g.fillStyle = rg; g.fillRect(0, 0, W, H)
}

function posterHeader(g, W, label, sub) {
  g.fillStyle = '#f97316'
  g.beginPath(); g.roundRect(24, 22, 44, 44, 11); g.fill()
  g.fillStyle = '#fff'; g.font = `900 16px ${MONO}`
  g.textAlign = 'center'; g.fillText('HR', 46, 45); g.textAlign = 'left'
  g.fillStyle = '#f4f4f5'; g.font = `900 19px ${SANS}`
  g.fillText('DASH NETWORK', 82, 36)
  const wmW = g.measureText('DASH NETWORK').width
  g.fillStyle = '#f97316'; g.font = `900 12px ${MONO}`
  g.fillText('🌙 MOONSHOT · ' + label, 84 + wmW + 10, 37)
  g.fillStyle = '#a1a1aa'; g.font = `600 11px ${MONO}`
  g.fillText(sub, 82, 58)
  g.strokeStyle = 'rgba(255,255,255,0.07)'
  g.beginPath(); g.moveTo(0, HEAD_H - 0.5); g.lineTo(W, HEAD_H - 0.5); g.stroke()
}

function posterFooter(g, W, H, note) {
  const fy = H - 23
  g.fillStyle = '#52525b'; g.font = `600 10px ${MONO}`
  g.fillText(note, 24, fy)
  g.fillStyle = '#a1a1aa'; g.font = `800 10px ${MONO}`
  g.textAlign = 'right'
  g.fillText('DASH NETWORK · MOONSHOT', W - 24, fy)
  g.textAlign = 'left'
  g.fillStyle = '#f97316'; g.fillRect(0, H - 3, W, 3)
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

const slug = (s) => String(s || 'card').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'card'
const todayStamp = () => new Date().toLocaleDateString('en-CA')

// A labelled bar row — label left, value right, a bar tinted to the caller's
// own colour underneath, an optional sub-line under that. scoreBar() above
// is always orange (by design, for the two cards that use it); Track Record
// wants each category to keep ITS OWN colour, same as ReportCard.js draws it
// on the site, so this is a small separate drawer rather than a scoreBar
// option nobody else needed.
function barRow(g, x, y, w, { label, value, sub, pct, color = '#f97316' }) {
  g.fillStyle = '#a1a1aa'; g.font = `800 10.5px ${MONO}`
  g.fillText(label, x, y)
  g.fillStyle = color; g.font = `900 13px ${MONO}`
  g.textAlign = 'right'; g.fillText(value, x + w, y); g.textAlign = 'left'
  const h = 8
  g.fillStyle = 'rgba(255,255,255,0.07)'
  g.beginPath(); g.roundRect(x, y + 10, w, h, h / 2); g.fill()
  const fillW = Math.max(6, w * Math.min(1, Math.max(0, pct) / 100))
  g.fillStyle = color
  g.beginPath(); g.roundRect(x, y + 10, fillW, h, h / 2); g.fill()
  if (sub) {
    g.fillStyle = '#71717a'; g.font = `600 9.5px ${MONO}`
    g.fillText(sub, x, y + 30)
  }
}

// ── 📊 BOARD CARD — the Charts tab's ranked list as a poster. Same
// headliner-plus-rows shape as the watchlist card above; the only real
// difference is the score comes from whatever `scoreOf` the caller passes
// (RankedBoard.js hands in `(p) => scoreFor(p, type)`) instead of always
// being hrScore, because the Boards tab ranks five different ways and the
// card should show whichever one is actually on screen.
export function downloadBoardCard(ranked = [], { title = 'THE BOARD', sub = '', type = 'hr', scoreOf } = {}) {
  const score = typeof scoreOf === 'function' ? scoreOf : (p) => hrScore(p)
  const sorted = [...ranked]
  const hero = sorted[0]
  const rows = sorted.slice(1, 12)
  const W = 760, heroH = hero ? 132 : 0, rowH = 43, footH = 46
  const H = HEAD_H + heroH + rows.length * rowH + footH
  const { c, g } = newPoster(W, H)
  posterHeader(g, W, title, `${new Date().toLocaleDateString()} · ${ranked.length} ranked${sub ? ' · ' + sub : ''}`)

  if (hero) {
    const y0 = HEAD_H
    g.fillStyle = 'rgba(249,115,22,0.09)'
    g.font = `900 128px ${MONO}`
    g.textAlign = 'right'; g.fillText('1', W - 18, y0 + heroH / 2 + 8); g.textAlign = 'left'
    g.fillStyle = '#f97316'; g.font = `800 9.5px ${MONO}`
    g.fillText('#1 ON THE BOARD', 26, y0 + 22)
    g.fillStyle = '#f4f4f5'; g.font = `900 27px ${SANS}`
    const heroName = ellipsize(g, nameOf(hero), 420)
    g.fillText(heroName, 24, y0 + 47)
    const hnW = g.measureText(heroName).width
    let hx = 24 + hnW + 12
    hx += monogram(g, hx, y0 + 47, teamOf(hero)) + 6
    g.fillStyle = '#71717a'; g.font = `700 11px ${MONO}`
    g.fillText(`vs ${oppOf(hero)}`, hx, y0 + 48)
    const pk = pickOf(hero)
    if (pk) botChip(g, 26, y0 + 71, pk)
    const s = score(hero)
    g.fillStyle = '#f97316'; g.font = `900 34px ${MONO}`
    g.textAlign = 'right'; g.fillText(s.toFixed(0), W - 26, y0 + 103); g.textAlign = 'left'
    const numW = g.measureText(s.toFixed(0)).width + 44
    scoreBar(g, 26, y0 + 103, W - 26 - numW - 26, s, true)
    g.strokeStyle = 'rgba(249,115,22,0.25)'
    g.beginPath(); g.moveTo(0, y0 + heroH - 0.5); g.lineTo(W, y0 + heroH - 0.5); g.stroke()
  }

  rows.forEach((p, i) => {
    const rank = i + 2
    const yTop = HEAD_H + heroH + i * rowH
    if (i % 2 === 0) { g.fillStyle = 'rgba(255,255,255,0.024)'; g.fillRect(0, yTop, W, rowH) }
    const mid = yTop + rowH / 2
    g.fillStyle = rank <= 3 ? '#FCD34D' : '#71717a'
    g.font = `800 12px ${MONO}`
    g.textAlign = 'right'; g.fillText(String(rank), 40, mid); g.textAlign = 'left'
    monogram(g, 52, mid, teamOf(p))
    g.fillStyle = '#f4f4f5'; g.font = `800 15px ${SANS}`
    g.fillText(ellipsize(g, nameOf(p), 208), 96, mid)
    g.fillStyle = '#71717a'; g.font = `600 10.5px ${MONO}`
    g.fillText(`vs ${oppOf(p)}`, 312, mid + 1)
    const pk = pickOf(p)
    if (pk) botChip(g, 392, mid, pk)
    const s = score(p)
    scoreBar(g, 500, mid, 172, s)
    g.fillStyle = '#f97316'; g.font = `900 14px ${MONO}`
    g.textAlign = 'right'; g.fillText(s.toFixed(0), W - 24, mid); g.textAlign = 'left'
  })

  posterFooter(g, W, H, `🤖 = the bot's designated pick tonight · scores are this board's own ${type.toUpperCase()} ranking`)
  savePoster(c, `board-${slug(type)}_${todayStamp()}.png`)
}

// ── 🎮 GAME CARD — one matchup off the Slate tab. Every designated pick in
// that game, ranked by hrScore, with the graded line (actual_hr /
// actual_hits) swapped in for the score bar once the game has results —
// same field, same row, it just knows more by the time you check back.
export function downloadGameCard(gm = {}, { onlyPicks = true } = {}) {
  const players = Array.isArray(gm.players) ? gm.players : []
  const picks = players
    .filter((p) => !onlyPicks || String(p?.game_pick_role || '').trim())
    .sort((a, b) => hrScore(b) - hrScore(a))
    .slice(0, 12)

  const away = gm.away || '—', home = gm.home || '—'
  let timeStr = ''
  try { timeStr = gm.game_time ? new Date(gm.game_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '' } catch { /* no game_time */ }

  const W = 720, rowH = 44, dividerH = 46, footH = 46
  const H = HEAD_H + dividerH + Math.max(1, picks.length) * rowH + footH
  const { c, g } = newPoster(W, H)
  posterHeader(g, W, 'GAME CARD', `${new Date().toLocaleDateString()}${timeStr ? ' · ' + timeStr : ''} · ${gm.lineup_confirmed ? 'lineups in' : 'projected'}`)

  const y0 = HEAD_H
  let ax = 24
  ax += monogram(g, ax, y0 + 30, away) + 8
  g.fillStyle = '#f4f4f5'; g.font = `900 26px ${SANS}`
  g.fillText(away, ax, y0 + 30)
  ax += g.measureText(away).width + 12
  g.fillStyle = '#71717a'; g.font = `700 16px ${SANS}`
  g.fillText('@', ax, y0 + 30)
  ax += g.measureText('@').width + 12
  ax += monogram(g, ax, y0 + 30, home) + 8
  g.fillStyle = '#f4f4f5'; g.font = `900 26px ${SANS}`
  g.fillText(home, ax, y0 + 30)

  g.strokeStyle = 'rgba(255,255,255,0.07)'
  g.beginPath(); g.moveTo(0, y0 + dividerH - 0.5); g.lineTo(W, y0 + dividerH - 0.5); g.stroke()

  if (!picks.length) {
    g.fillStyle = '#71717a'; g.font = `700 13px ${SANS}`
    g.fillText('No designated picks in this game.', 24, y0 + dividerH + rowH / 2)
  }

  picks.forEach((p, i) => {
    const yTop = y0 + dividerH + i * rowH
    if (i % 2 === 0) { g.fillStyle = 'rgba(255,255,255,0.024)'; g.fillRect(0, yTop, W, rowH) }
    const mid = yTop + rowH / 2
    monogram(g, 24, mid, teamOf(p))
    g.fillStyle = '#f4f4f5'; g.font = `800 14.5px ${SANS}`
    g.fillText(ellipsize(g, nameOf(p), 190), 68, mid)
    const pk = pickOf(p)
    if (pk) botChip(g, 266, mid, pk)
    const graded = n(p?.actual_hr, 0) > 0 || n(p?.actual_hits, 0) > 0
    if (graded) {
      const bits = []
      if (n(p.actual_hr, 0) > 0) bits.push(`${n(p.actual_hr, 0)} HR`)
      if (n(p.actual_hits, 0) > 0) bits.push(`${n(p.actual_hits, 0)} H`)
      g.fillStyle = '#4ade80'; g.font = `900 12px ${MONO}`
      g.textAlign = 'right'; g.fillText('✅ ' + bits.join(' · '), W - 24, mid); g.textAlign = 'left'
    } else {
      const s = hrScore(p)
      scoreBar(g, 380, mid, 150, s)
      g.fillStyle = '#f97316'; g.font = `900 13px ${MONO}`
      g.textAlign = 'right'; g.fillText(s.toFixed(0), W - 24, mid); g.textAlign = 'left'
    }
  })

  posterFooter(g, W, H, "🤖 = the bot's designated pick · ✅ = graded, live")
  savePoster(c, `game-${slug(away)}-${slug(home)}_${todayStamp()}.png`)
}

// ── 🧾 TRACK RECORD CARD — the Results tab's season report card as a
// poster: the pooled record, own bar, per category. Takes the SAME numbers
// ReportCard.js already computed (its `model.rows` plus the season /
// since-lock totals) rather than re-deriving any of it from `backtest` a
// second time — one source of truth, this only draws it.
const TR_LABEL_COLOR = { TOP: '#FCD34D', HR: '#FB923C', HIT: '#60A5FA', HRR: '#22d3ee', CONTACT: '#A78BFA' }
export function downloadTrackRecordCard({ rows = [], seasonOk = 0, seasonN = 0, seasonPct = null,
  lockOk = 0, lockN = 0, lockPct = null, lockNights = 0, days = 0 } = {}) {
  const W = 700, rowH = 52, dividerH = 58, footH = 46
  const H = HEAD_H + dividerH + rows.length * rowH + footH
  const { c, g } = newPoster(W, H)
  posterHeader(g, W, 'TRACK RECORD',
    `${new Date().toLocaleDateString()} · ${days} graded day${days === 1 ? '' : 's'} · every category, its own bar`)

  const y0 = HEAD_H
  g.fillStyle = '#71717a'; g.font = `800 9.5px ${MONO}`
  g.fillText('SEASON, EVERY PICK', 24, y0 + 20)
  g.fillStyle = '#f4f4f5'; g.font = `900 30px ${MONO}`
  const seasonStr = seasonN ? `${seasonOk}/${seasonN}` : '—'
  g.fillText(seasonStr, 24, y0 + 46)
  const swid = g.measureText(seasonStr).width
  if (seasonPct != null) {
    g.fillStyle = seasonPct >= 45 ? '#4ade80' : '#f97316'; g.font = `900 18px ${MONO}`
    g.fillText(`${seasonPct.toFixed(1)}%`, 24 + swid + 12, y0 + 46)
  }
  if (lockN) {
    g.fillStyle = '#4ade80'; g.font = `800 9.5px ${MONO}`
    g.textAlign = 'right'; g.fillText('✅ SINCE THE LOCK', W - 24, y0 + 20)
    g.fillStyle = '#f4f4f5'; g.font = `900 22px ${MONO}`
    g.fillText(`${lockOk}/${lockN}${lockPct != null ? ` · ${lockPct.toFixed(1)}%` : ''}`, W - 24, y0 + 46)
    g.textAlign = 'left'
  }
  g.strokeStyle = 'rgba(255,255,255,0.07)'
  g.beginPath(); g.moveTo(0, y0 + dividerH - 0.5); g.lineTo(W, y0 + dividerH - 0.5); g.stroke()

  rows.forEach((r, i) => {
    const yTop = y0 + dividerH + i * rowH
    const cat = r.cat || {}
    const label = String(cat.label || '').toUpperCase()
    const color = TR_LABEL_COLOR[label] || cat.color || '#f97316'
    barRow(g, 24, yTop + 20, W - 48, {
      label, color,
      value: r.base != null ? `${r.base.toFixed(1)}%` : '—',
      sub: `${r.ok}/${r.n} · grade ${r.grade?.g || '—'}`,
      pct: r.base || 0,
    })
  })

  posterFooter(g, W, H, lockNights
    ? `locked ${lockNights} night${lockNights === 1 ? '' : 's'} — every locked pick froze at first pitch`
    : 'own-bar rate, pooled across every graded night')
  savePoster(c, `track-record_${todayStamp()}.png`)
}

// ── 🎱 POOLS CARD — the Combos tab's group tickets, tonight's or
// live-graded, as one shareable image. Each pool prints its label, its bar
// (need N of M) once grading applies, and its roster — the same "who's
// actually in it" Results already shows for graded pools, now on the
// pregame list too.
export function downloadPoolsCard(pools = [], { title = "TONIGHT'S POOLS", graded = false } = {}) {
  const list = pools.slice(0, 8)
  const rowHeights = list.map((pl) => 54 + Math.ceil(Math.max(1, (pl.players || []).length) / 3) * 16)
  const W = 720, footH = 46
  const H = HEAD_H + 20 + rowHeights.reduce((a, b) => a + b, 8) + footH
  const { c, g } = newPoster(W, H)
  posterHeader(g, W, title, `${new Date().toLocaleDateString()} · ${pools.length} pool${pools.length === 1 ? '' : 's'}${graded ? ' · grading live' : ''}`)

  let y = HEAD_H + 20
  list.forEach((pl, i) => {
    const rh = rowHeights[i]
    const hit = n(pl.hr_count, 0)
    const tot = Math.max(1, n(pl.total_count ?? (pl.players || []).length, 0))
    const bar = n(pl.bar, Math.min(2, tot))
    const col = graded ? (hit >= bar ? '#4ade80' : hit > 0 ? '#f97316' : '#3f3f46') : '#f97316'
    g.fillStyle = `${col}10`
    g.strokeStyle = `${col}55`; g.lineWidth = 1
    g.beginPath(); g.roundRect(24, y, W - 48, rh - 8, 10); g.fill(); g.stroke()

    g.fillStyle = '#f4f4f5'; g.font = `800 12px ${SANS}`
    g.fillText(ellipsize(g, String(pl.label || pl.name || pl.kind || 'Pool'), graded ? W - 220 : W - 160), 36, y + 18)
    if (graded) {
      g.fillStyle = col; g.font = `900 11px ${MONO}`
      g.textAlign = 'right'; g.fillText(`${hit}/${tot} · need ${bar}`, W - 36, y + 18); g.textAlign = 'left'
    } else {
      g.fillStyle = '#71717a'; g.font = `700 10px ${MONO}`
      g.textAlign = 'right'; g.fillText(String(pl.kind || ''), W - 36, y + 18); g.textAlign = 'left'
    }

    const members = pl.players || []
    const homered = new Set((pl.homer_names || []).map((x) => String(x || '').toLowerCase()))
    const colW = (W - 72) / 3
    members.forEach((m, j) => {
      const cx = j % 3, ry = Math.floor(j / 3)
      const hitM = graded && homered.has(String(m?.name || '').toLowerCase())
      g.fillStyle = hitM ? '#4ade80' : '#a1a1aa'; g.font = `${hitM ? '800' : '600'} 10px ${MONO}`
      g.fillText(`${hitM ? '💥 ' : ''}${ellipsize(g, String(m?.name || '—'), colW - 14)}`, 36 + cx * colW, y + 34 + ry * 16)
    })
    y += rh
  })

  posterFooter(g, W, H, graded
    ? "💥 = homered · needs the pool's own bar to clear, not everyone"
    : "the bot's group tickets for tonight — grading appears live once games start")
  savePoster(c, `pools_${todayStamp()}.png`)
}

// ── 🔗 PAIRS CARD — "by the record" pairs, ranked on their measured
// both-homer rate. Same leaderboard shape as the board/watchlist cards,
// with two names sharing a row instead of one, and the measured rate
// standing in for the score.
export function downloadPairsCard(pairs = [], { title = 'PAIRS BY THE RECORD', baseline = null } = {}) {
  const list = pairs.slice(0, 10)
  const W = 720, rowH = 54, footH = 46
  const H = HEAD_H + 14 + Math.max(1, list.length) * rowH + footH
  const { c, g } = newPoster(W, H)
  posterHeader(g, W, title, `${new Date().toLocaleDateString()} · measured both-homer rate${baseline != null ? ` · random pair ${baseline}%` : ''}`)

  let y = HEAD_H + 14
  if (!list.length) {
    g.fillStyle = '#71717a'; g.font = `700 13px ${SANS}`
    g.fillText('No pairs clear a measured bar right now.', 24, y + rowH / 2)
  }
  list.forEach((p, i) => {
    if (i % 2 === 0) { g.fillStyle = 'rgba(255,255,255,0.024)'; g.fillRect(0, y, W, rowH) }
    const mid = y + rowH / 2
    g.fillStyle = i < 3 ? '#FCD34D' : '#71717a'
    g.font = `800 12px ${MONO}`
    g.textAlign = 'right'; g.fillText(String(i + 1), 40, mid); g.textAlign = 'left'

    let nx = 52
    ;[p.a, p.b].forEach((pl, k) => {
      nx += monogram(g, nx, mid, teamOf(pl)) + 6
      g.fillStyle = '#f4f4f5'; g.font = `800 12.5px ${SANS}`
      const nm = ellipsize(g, nameOf(pl), 130)
      g.fillText(nm, nx, mid)
      nx += g.measureText(nm).width + 14
      if (k === 0) { g.fillStyle = '#71717a'; g.font = `700 11px ${MONO}`; g.fillText('+', nx - 10, mid) }
    })

    const rate = n(p.rate, 0)
    scoreBar(g, 480, mid, 130, rate)
    g.fillStyle = '#f97316'; g.font = `900 15px ${MONO}`
    g.textAlign = 'right'; g.fillText(`${rate.toFixed(1)}%`, W - 24, mid); g.textAlign = 'left'
    y += rowH
  })

  posterFooter(g, W, H, 'measured across every graded night — not a model output')
  savePoster(c, `pairs_${todayStamp()}.png`)
}

// ── ⚾ PITCHER CARD — the pitcher modal, exported. Same identity block and
// tile-grid language the modal already draws — PitcherModal.js's own
// `tiles` array (label/value/tone) is passed straight in, so this can never
// print a number, or a hot/cold call, that disagrees with what's on screen.
export function downloadPitcherCard({ name, team, opp, throws, weakSide, tiles = [], topBat = null } = {}) {
  const W = 660
  const idH = 96
  const tileRows = Math.ceil(Math.max(1, tiles.length) / 4)
  const tileH = tileRows * 56 + 16
  const batH = topBat ? 60 : 0
  const footH = 42
  const H = HEAD_H + idH + tileH + batH + footH
  const { c, g } = newPoster(W, H)
  posterHeader(g, W, 'PITCHER CARD', `${new Date().toLocaleDateString()} · DASH NETWORK`)

  const y0 = HEAD_H
  g.fillStyle = '#f97316'; g.font = `800 9px ${MONO}`
  g.fillText('T O N I G H T ' + String.fromCharCode(8217) + ' S   S T A R T E R', 24, y0 + 20)
  g.fillStyle = '#f4f4f5'; g.font = `900 28px ${SANS}`
  const nm = ellipsize(g, name || 'Unknown', 400)
  g.fillText(nm, 22, y0 + 46)
  const nmW = g.measureText(nm).width
  let ix = 22 + nmW + 12
  ix += monogram(g, ix, y0 + 46, team) + 8
  g.fillStyle = '#a1a1aa'; g.font = `700 10.5px ${MONO}`
  const idBits = [opp ? `vs ${opp}` : null, throws ? `${throws}HP` : null, weakSide ? `bleeds vs ${weakSide}` : null].filter(Boolean)
  g.fillText(idBits.join('  ·  '), 24, y0 + 70)
  g.strokeStyle = 'rgba(255,255,255,0.07)'
  g.beginPath(); g.moveTo(0, y0 + idH - 0.5); g.lineTo(W, y0 + idH - 0.5); g.stroke()

  const y1 = y0 + idH
  const tw = (W - 48 - 3 * 10) / 4
  tiles.forEach((t, i) => {
    const col = i % 4, row = Math.floor(i / 4)
    const x = 24 + col * (tw + 10), ty = y1 + 10 + row * 56
    const tint = t.tone === 'hot' ? '#f97316' : t.tone === 'cold' ? '#60a5fa' : '#e4e4e7'
    g.fillStyle = 'rgba(255,255,255,0.03)'
    g.strokeStyle = t.tone ? `${tint}55` : 'rgba(255,255,255,0.08)'; g.lineWidth = 1
    g.beginPath(); g.roundRect(x, ty, tw, 48, 8); g.fill(); g.stroke()
    g.fillStyle = '#71717a'; g.font = `800 8.5px ${MONO}`
    g.fillText(String(t.label || ''), x + 10, ty + 16)
    g.fillStyle = tint; g.font = `900 16px ${MONO}`
    g.fillText(String(t.value ?? '—'), x + 10, ty + 36)
  })

  if (topBat) {
    const y2 = y1 + tileH
    g.strokeStyle = 'rgba(255,255,255,0.07)'
    g.beginPath(); g.moveTo(0, y2 - 6 + 0.5); g.lineTo(W, y2 - 6 + 0.5); g.stroke()
    g.fillStyle = '#71717a'; g.font = `800 9px ${MONO}`
    g.fillText('THE BAT THIS ARSENAL SPLIT IS BUILT AROUND', 24, y2 + 12)
    g.fillStyle = '#f4f4f5'; g.font = `800 13px ${SANS}`
    g.fillText(ellipsize(g, nameOf(topBat), 300), 24, y2 + 32)
    const s = hrScore(topBat)
    g.fillStyle = '#f97316'; g.font = `900 14px ${MONO}`
    g.textAlign = 'right'; g.fillText(s.toFixed(0), W - 24, y2 + 32); g.textAlign = 'left'
  }

  posterFooter(g, W, H, 'hot = good for the bats facing him · cold = his strength')
  savePoster(c, `pitcher-${slug(name)}_${todayStamp()}.png`)
}

// ── 📖 STORYLINES CARD — tonight's matchup lines as a poster. Each line is
// the SAME sentence the panel renders (m.parts, flattened to plain text),
// so the card can never say something the site itself doesn't.
export function downloadStorylinesCard(mlines = [], { title = 'STORYLINES', note = '' } = {}) {
  const list = mlines.slice(0, 10)
  const W = 720, rowH = 40, footH = 46
  const H = HEAD_H + 14 + Math.max(1, list.length) * rowH + footH
  const { c, g } = newPoster(W, H)
  posterHeader(g, W, title, `${new Date().toLocaleDateString()}${note ? ' · ' + note : ''} · ${list.length} line${list.length === 1 ? '' : 's'}`)

  let y = HEAD_H + 14
  if (!list.length) {
    g.fillStyle = '#71717a'; g.font = `700 13px ${SANS}`
    g.fillText('No storylines in this one — just baseball.', 24, y + rowH / 2)
  }
  list.forEach((m, i) => {
    if (i % 2 === 0) { g.fillStyle = 'rgba(255,255,255,0.024)'; g.fillRect(0, y, W, rowH) }
    const mid = y + rowH / 2
    g.font = '13px sans-serif'
    g.fillText('⚾', 22, mid)
    const text = (m.parts || []).map((x) => x.text).join('')
    g.fillStyle = '#e4e4e7'; g.font = `600 12px ${SANS}`
    g.fillText(ellipsize(g, text, W - 60), 44, mid)
    y += rowH
  })

  posterFooter(g, W, H, 'counted from published game logs — not modelled')
  savePoster(c, `storylines_${todayStamp()}.png`)
}
