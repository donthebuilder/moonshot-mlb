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

  g.fillStyle = '#f4f4f5'; g.font = `900 21px ${SANS}`
  g.fillText('MOONSHOT', 82, 36)
  const wmW = g.measureText('MOONSHOT').width
  g.fillStyle = '#f97316'; g.font = `900 12px ${MONO}`
  g.fillText('🌙 ' + title, 84 + wmW + 10, 37)
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
  g.fillText('moonshot-mlb.vercel.app', W - 24, fy)
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
  g.fillStyle = '#f4f4f5'; g.font = `900 20px ${SANS}`
  g.fillText('MOONSHOT', 76, 33)
  const wmW2 = g.measureText('MOONSHOT').width
  g.fillStyle = '#f97316'; g.font = `900 11.5px ${MONO}`
  g.fillText('🌙 PLAYER CARD', 78 + wmW2 + 10, 34)
  g.fillStyle = '#a1a1aa'; g.font = `600 10.5px ${MONO}`
  g.fillText(`${new Date().toLocaleDateString()} · moonshot-mlb.vercel.app`, 76, 54)
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
    ['HR/9', Number.isFinite(hr9) ? hr9.toFixed(2) : '—', Number.isFinite(hr9) && hr9 >= 1.3 ? '#f97316' : Number.isFinite(hr9) && hr9 <= 0.85 ? '#60a5fa' : '#f4f4f5'],
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
  const url = 'moonshot-mlb.vercel.app'
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
