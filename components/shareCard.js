// SHARE CARD — render the watchlist as a PNG for posting.
//
// Canvas, no dependencies, drawn in the site's own dark-orange language so a
// screenshot of the card is recognisably the site. Called from the Watchlist
// header; downloads immediately.

import { nameOf, teamOf, oppOf, hrScore } from '../lib/player'

const pickOf = (p) => String(p?.game_pick_role || '').split('/')[0].trim().toUpperCase()

export function downloadShareCard(items = []) {
  const rows = [...items].sort((a, b) => hrScore(b) - hrScore(a)).slice(0, 12)
  const W = 720
  const rowH = 44
  const headH = 92
  const footH = 40
  const H = headH + rows.length * rowH + footH

  const c = document.createElement('canvas')
  const scale = 2                     // retina-crisp
  c.width = W * scale; c.height = H * scale
  const g = c.getContext('2d')
  g.scale(scale, scale)

  // bg
  g.fillStyle = '#09090b'; g.fillRect(0, 0, W, H)
  const grad = g.createLinearGradient(0, 0, W, 0)
  grad.addColorStop(0, 'rgba(249,115,22,0.14)'); grad.addColorStop(1, 'rgba(239,68,68,0.05)')
  g.fillStyle = grad; g.fillRect(0, 0, W, headH)

  // header
  g.fillStyle = '#f97316'
  g.beginPath(); g.roundRect(24, 24, 44, 44, 10); g.fill()
  g.fillStyle = '#fff'; g.font = '900 17px ui-monospace, monospace'
  g.textBaseline = 'middle'; g.textAlign = 'center'
  g.fillText('HR', 46, 47)
  g.textAlign = 'left'
  g.fillStyle = '#f4f4f5'; g.font = '900 21px system-ui, sans-serif'
  g.fillText('MY WATCHLIST', 82, 40)
  g.fillStyle = '#a1a1aa'; g.font = '600 12px ui-monospace, monospace'
  g.fillText(`${new Date().toLocaleDateString()} · ${items.length} hitters · moonshot-mlb.vercel.app`, 82, 62)

  // rows
  rows.forEach((p, i) => {
    const yTop = headH + i * rowH
    if (i % 2 === 0) { g.fillStyle = 'rgba(255,255,255,0.025)'; g.fillRect(0, yTop, W, rowH) }
    const mid = yTop + rowH / 2

    g.fillStyle = '#71717a'; g.font = '700 12px ui-monospace, monospace'
    g.fillText(String(i + 1).padStart(2, ' '), 24, mid)

    g.fillStyle = '#f4f4f5'; g.font = '800 16px system-ui, sans-serif'
    g.fillText(nameOf(p), 54, mid)

    g.fillStyle = '#71717a'; g.font = '600 11px ui-monospace, monospace'
    g.fillText(`${teamOf(p)} vs ${oppOf(p)}`, 300, mid)

    const pk = pickOf(p)
    if (pk) {
      g.fillStyle = 'rgba(249,115,22,0.16)'
      const wTag = g.measureText(pk).width + 26
      g.beginPath(); g.roundRect(430, mid - 10, wTag, 20, 5); g.fill()
      g.fillStyle = '#f97316'; g.font = '800 10px ui-monospace, monospace'
      g.fillText(`🤖 ${pk}`, 438, mid + 1)
    }

    // score bar + number
    const score = hrScore(p)
    g.fillStyle = 'rgba(255,255,255,0.07)'
    g.beginPath(); g.roundRect(540, mid - 4, 110, 8, 4); g.fill()
    g.fillStyle = '#f97316'
    g.beginPath(); g.roundRect(540, mid - 4, Math.max(6, 110 * Math.min(1, score / 100)), 8, 4); g.fill()
    g.fillStyle = '#f97316'; g.font = '900 14px ui-monospace, monospace'
    g.textAlign = 'right'; g.fillText(score.toFixed(0), W - 24, mid); g.textAlign = 'left'
  })

  // footer
  g.fillStyle = '#52525b'; g.font = '600 10px ui-monospace, monospace'
  g.fillText('HR score is the site’s ISO-adjusted ranking · 🤖 = the bot’s designated pick tonight', 24, H - footH / 2)

  const a = document.createElement('a')
  a.download = `watchlist_${new Date().toISOString().slice(0, 10)}.png`
  a.href = c.toDataURL('image/png')
  a.click()
}
