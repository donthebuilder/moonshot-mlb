// THE HOMER CARD — the share card, rendered on the server.
//
// Donovan (09-05): "is it possible to get the player's card image that we
// already export by button push?" Not that exact PNG: components/shareCard.js
// draws it with the browser's Canvas 2D, and a cron has no browser. What a
// cron does have is next/og (satori + resvg, already inside Next — no new
// dependency), so this is the same poster language rebuilt for it: ember
// field, DASH NETWORK header, ghost numeral, team monogram, the call, the
// price, the footer. Same TEAM_COLORS, same orange, same words.
//
// One shape, 1200x675 — the size X and Discord both show edge to edge.
//
// Used twice: app/api/dash/homers/card serves it at a public URL (Discord
// embeds that; the /called page can link it), and the cron renders it
// in-process to upload to X as the post's image.
//
// EMOJI come from twemoji, which next/og fetches from a CDN by default. FONTS:
// Inter 400/800 fetched once per instance from Google Fonts; if that fetch
// fails the card falls back to next/og's bundled Geist Regular and still
// renders — a missing bold weight is not a missing card.

import { ImageResponse } from 'next/og'
import { fmtOdds, matchupWord, roleWord } from './homerFeed'

// Same table as components/shareCard.js TEAM_COLORS. Copied, not imported:
// that file is a browser module (it reaches for `document`), and a server
// route must not pull it in.
const TEAM_COLORS = {
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

// ── fonts ──────────────────────────────────────────────────────────────────
let _fonts = null
async function loadFonts() {
  if (_fonts) return _fonts
  try {
    const css = await fetch('https://fonts.googleapis.com/css2?family=Inter:wght@400;800&display=swap', {
      // No UA → Google serves plain TTF urls, which satori can read.
      headers: { 'User-Agent': '' },
    }).then((r) => r.text())
    const urls = [...css.matchAll(/font-weight:\s*(\d+);[^}]*?src:\s*url\(([^)]+)\)/g)]
    const out = []
    for (const [, weight, url] of urls) {
      const data = await fetch(url).then((r) => r.arrayBuffer())
      out.push({ name: 'Inter', data, weight: Number(weight), style: 'normal' })
    }
    _fonts = out.length ? out : []
  } catch {
    _fonts = []
  }
  return _fonts
}

const prettyDay = (iso) => {
  const d = new Date(`${iso}T12:00:00Z`)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

/**
 * The card for one homer_feed row. Returns an ImageResponse (a Response whose
 * body is the PNG). `site` is the bare host shown in the footer.
 */
export async function homerCard(row, { site = 'dashnetwork.app' } = {}) {
  const fonts = await loadFonts()
  const family = fonts.length ? 'Inter' : undefined
  const W = 1200
  const H = 675
  const name = String(row?.name || 'Unknown')
  const team = String(row?.team || '').toUpperCase()
  const col = teamColor(team)
  const score = row?.hr_score != null && Number.isFinite(Number(row.hr_score)) ? Math.round(Number(row.hr_score)) : null
  const called = Boolean(row?.role)
  const roles = String(row?._roles || row?.role || '')
  const call = called
    ? `ON THE BOT — ${roleWord(row.role).toUpperCase()}${roles.includes('/') ? ` (${roles})` : ''}`
    : row?.on_board ? 'RATED, NOT PICKED' : 'NOT ON THE BOARD'
  const rank = row?.board_rank ? `#${row.board_rank} on the board` : ''
  const glyph = called ? '⭐' : row?.on_board ? '⚪' : '💥'
  const odds = Number(row?.odds_over)
  const book = String(row?.odds_book || '')
  const hasOdds = Number.isFinite(odds) && odds !== 0 && book
  const where = [row?.inning, matchupWord(row)].filter(Boolean).join('  ·  ')
  const nth = Number(row?.hr_n) > 1 ? `${row.hr_n} TONIGHT` : ''
  const orange = '#f97316'

  return new ImageResponse(
    (
      <div style={{
        width: W, height: H, display: 'flex', flexDirection: 'column',
        background: 'radial-gradient(circle at 8% 0%, rgba(249,115,22,0.18) 0%, rgba(249,115,22,0) 48%), radial-gradient(circle at 100% 100%, rgba(239,68,68,0.12) 0%, rgba(239,68,68,0) 50%), #0a0a0d',
        color: '#f4f4f5', position: 'relative',
        ...(family ? { fontFamily: family } : {}),
      }}>
        {/* header */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '30px 40px 0 40px', gap: 16 }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: orange, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 22, fontWeight: 800 }}>HR</div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
              <span style={{ fontSize: 26, fontWeight: 800 }}>DASH NETWORK</span>
              <span style={{ fontSize: 16, fontWeight: 800, color: orange, letterSpacing: 1 }}>🌙 MOONSHOT · HOME RUN</span>
            </div>
            <span style={{ fontSize: 15, color: '#a1a1aa' }}>{`${prettyDay(String(row?.day || ''))} · every call graded in public`}</span>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
            {nth ? <span style={{ fontSize: 14, fontWeight: 800, color: orange, border: `1px solid ${orange}`, borderRadius: 999, padding: '6px 14px' }}>{nth}</span> : null}
            <span style={{ fontSize: 14, fontWeight: 800, color: orange, border: '1px solid rgba(249,115,22,0.5)', borderRadius: 999, padding: '6px 14px' }}>TONIGHT</span>
          </div>
        </div>
        <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '22px 0 0 0' }} />

        {/* ghost numeral */}
        {score != null ? (
          <div style={{ display: 'flex', position: 'absolute', right: 34, top: 96, fontSize: 300, fontWeight: 800, color: 'rgba(249,115,22,0.10)', lineHeight: 1 }}>{String(score)}</div>
        ) : null}

        {/* identity */}
        <div style={{ display: 'flex', flexDirection: 'column', padding: '48px 40px 0 40px' }}>
          <span style={{ fontSize: 16, letterSpacing: 6, color: '#a1a1aa' }}>H O M E   R U N</span>
          <span style={{ fontSize: 88, fontWeight: 800, lineHeight: 1.05, marginTop: 6 }}>{name}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 18 }}>
            {team ? (
              <span style={{ background: col, color: inkOn(col), fontSize: 18, fontWeight: 800, borderRadius: 10, padding: '6px 14px' }}>{team}</span>
            ) : null}
            <span style={{ fontSize: 24, color: '#d4d4d8' }}>{where}</span>
          </div>
        </div>

        {/* the call */}
        <div style={{ display: 'flex', flexDirection: 'column', margin: '44px 40px 0 40px', padding: '24px 28px', borderRadius: 18, background: called ? 'rgba(249,115,22,0.14)' : 'rgba(255,255,255,0.05)', border: `1px solid ${called ? 'rgba(249,115,22,0.55)' : 'rgba(255,255,255,0.10)'}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={{ fontSize: 34 }}>{glyph}</span>
            <span style={{ fontSize: 30, fontWeight: 800, color: called ? orange : '#e4e4e7' }}>{call}</span>
          </div>
          <div style={{ display: 'flex', gap: 28, marginTop: 10, fontSize: 20, color: '#a1a1aa' }}>
            {rank ? <span>{rank}</span> : null}
            {score != null ? <span>{`HR score ${score}`}</span> : null}
            {hasOdds ? <span style={{ color: '#f4f4f5' }}>{`HR ${fmtOdds(odds)} · ${book} · pregame price`}</span> : null}
          </div>
        </div>

        {/* footer */}
        <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', padding: '0 40px 22px 40px', fontSize: 16, color: '#71717a' }}>
          <span>{`${site}/called — was he on the bot before the ball left?`}</span>
          <span style={{ marginLeft: 'auto', color: '#a1a1aa', fontWeight: 800 }}>DASH NETWORK · MOONSHOT</span>
        </div>
        <div style={{ height: 6, background: orange }} />
      </div>
    ),
    { width: W, height: H, fonts: fonts.length ? fonts : undefined },
  )
}
