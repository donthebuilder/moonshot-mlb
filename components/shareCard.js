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
