// THE HOMER CARD — the share card, rendered on the server.
//
// Donovan (09-05): "is it possible to get the player's card image that we
// already export by button push?" Not that exact PNG: components/shareCard.js
// draws it with the browser's Canvas 2D, and a cron has no browser. What a
// cron does have is next/og (satori + resvg, already inside Next — no new
// dependency), so this is the same poster language rebuilt for it: ember
// field, DASH NETWORK header, ghost numeral, team monogram, the call, the
// price, 🔨 THE BAT / 🥎 THE ARM with the same numbers the site's card
// prints, the hook lines, the footer.
//
// Two cards, one shape (1200x675 — what X and Discord show edge to edge):
//   homerCard(row)                        one home run
//   recapCard(day, rows, history)         the night: called / total, ten bars
//
// Everything is read off the homer_feed row. Nothing is recomputed.
//
// SATORI RULES LEARNED THE HARD WAY (2026-09-05): every <div> with more than
// one child, or a single non-string child, needs display:flex; a span with
// mixed `text {expr} text` children trips the same check — use one template
// string; `fontFamily: undefined` throws — omit the key. EMOJI come from
// twemoji, which next/og fetches from a CDN by default. FONTS: Inter 400/800
// fetched once per instance from Google Fonts, Geist Regular as the fallback.

import { ImageResponse } from 'next/og'
import { captureFrom, fmtOdds, matchupWord, roleWord } from './homerFeed'

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
const ORANGE = '#f97316'
const INK = '#f4f4f5'
const DIM = '#a1a1aa'
// Under-the-lights, not a flat gradient: two warm towers up top (the
// orange one stronger, stage-left), a cool rim light low-right (a night
// sky, not a second stadium light), and a dim red ember bottom-left so the
// card is never lit from only one direction. #07070a instead of #0a0a0d --
// slightly further from grey so the accent colors (team, orange) carry more
// of the contrast.
const FIELD = [
  'radial-gradient(circle at 8% -8%, rgba(249,115,22,0.26) 0%, rgba(249,115,22,0) 42%)',
  'radial-gradient(circle at 96% -10%, rgba(249,115,22,0.13) 0%, rgba(249,115,22,0) 36%)',
  'radial-gradient(circle at 92% 112%, rgba(59,102,178,0.16) 0%, rgba(59,102,178,0) 46%)',
  'radial-gradient(circle at 2% 108%, rgba(239,68,68,0.10) 0%, rgba(239,68,68,0) 40%)',
  '#07070a',
].join(', ')

const teamColor = (abbr) => TEAM_COLORS[String(abbr || '').toUpperCase()] || '#3f3f46'
const inkOn = (hex) => {
  const m = /^#([0-9a-f]{6})$/i.exec(hex || '')
  if (!m) return '#fff'
  const v = parseInt(m[1], 16)
  const lum = 0.299 * (v >> 16) + 0.587 * ((v >> 8) & 255) + 0.114 * (v & 255)
  return lum > 150 ? '#111114' : '#fff'
}
const fin = (v) => v != null && v !== '' && Number.isFinite(Number(v))
const pct = (v) => (fin(v) ? `${Math.round(Number(v) * 100)}%` : null)
const iso = (v) => (fin(v) ? Number(v).toFixed(3).replace(/^0/, '') : null)

// ── fonts ──────────────────────────────────────────────────────────────────
//
// TWO FAMILIES (2026-09-07). Inter is an interface face and the card read like
// a dashboard because of it. Big Shoulders Display 900 is a condensed display
// face -- it carries the name line, the headline and the big numerals, and
// nothing else. Body copy, table rows and the hook lines stay Inter: a
// condensed face is bad below about 20px, and THE BAT / THE ARM rows are
// exactly that size.
//
// It is an upright face, so the forward lean is transform: skewX(-8deg) at
// each use. VERIFIED IN SATORI, not assumed -- it emits
// matrix(1.00,0.00,-0.14,1.00,...), and 0.14 is tan(8°). Both skewX(-8deg)
// and skew(-8deg, 0deg) work.
//
// Read off disk rather than fetched. Inter below still comes from Google Fonts
// on a cold render, which is a network call inside the tick's 60s budget --
// worth moving to disk too, not done here.
//
// SIL Open Font License. Free for commercial use, which this account is.
const DISPLAY = 'Shoulders'
let _display = null
async function loadDisplay() {
  if (_display !== null) return _display
  try {
    const { readFile } = await import('node:fs/promises')
    const b = await readFile(`${process.cwd()}/public/fonts/BigShouldersDisplay-900.ttf`)
    _display = [{ name: DISPLAY, data: b, weight: 900, style: 'normal' }]
  } catch {
    // Missing file must never cost a post: satori falls back to Inter, the
    // card renders upright and plain, and the homer still goes out.
    _display = []
  }
  return _display
}

let _fonts = null
async function loadFonts() {
  if (_fonts) return _fonts
  try {
    const css = await fetch('https://fonts.googleapis.com/css2?family=Inter:wght@400;800&display=swap', {
      headers: { 'User-Agent': '' },     // no UA → plain TTF urls, which satori can read
    }).then((r) => r.text())
    const urls = [...css.matchAll(/font-weight:\s*(\d+);[^}]*?src:\s*url\(([^)]+)\)/g)]
    const out = []
    for (const [, weight, url] of urls) {
      const data = await fetch(url).then((r) => r.arrayBuffer())
      out.push({ name: 'Inter', data, weight: Number(weight), style: 'normal' })
    }
    _fonts = out
  } catch {
    _fonts = []
  }
  return _fonts
}

// ── the mark ───────────────────────────────────────────────────────────────
// The DN mark, inlined as a data URI rather than fetched by URL. Satori will
// happily take an absolute https:// src, but that is a network call on every
// card render inside the tick's 60s budget, with a silent blank box when it
// is slow. Read once off disk, cached for the life of the instance, and it
// cannot fail at render time. public/dash-network-mark-128.png is a 12KB
// downscale of dash-network-icon-master.png (1254px, 900KB) -- the master is
// 70x more bytes than 54 CSS pixels can show.
let _mark = null
async function loadMark() {
  if (_mark !== null) return _mark
  try {
    const { readFile } = await import('node:fs/promises')
    const b = await readFile(`${process.cwd()}/public/dash-network-mark-128.png`)
    _mark = `data:image/png;base64,${b.toString('base64')}`
  } catch {
    // Never let a missing file kill a post -- Header falls back to the
    // original HR tile.
    _mark = ''
  }
  return _mark
}

const prettyDay = (iso8601) => {
  const d = new Date(`${iso8601}T12:00:00Z`)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

async function frame(children, fonts, height = 675, accent = null) {
  return new ImageResponse(
    (
      <div style={{
        width: 1200, height, display: 'flex', flexDirection: 'column',
        background: FIELD, color: INK, position: 'relative',
        ...(fonts.length ? { fontFamily: 'Inter' } : {}),
      }}>
        {/* the one thing every other card lacks: HIS team, at a glance,
            before a single word is read. Only homerCard passes this. */}
        {accent ? <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 8, background: accent, display: 'flex' }} /> : null}
        {children}
      </div>
    ),
    { width: 1200, height, fonts: fonts.length ? fonts : undefined },
  )
}

function Header({ label, sub, pills = [] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '26px 40px 0 40px', gap: 16 }}>
        {_mark
          ? <img src={_mark} width={54} height={54} style={{ borderRadius: 14, border: '1px solid rgba(249,115,22,0.45)' }} />
          : <div style={{ width: 54, height: 54, borderRadius: 14, background: `linear-gradient(160deg, #fb923c 0%, ${ORANGE} 55%, #c2410c 100%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 20, fontWeight: 800, boxShadow: '0 1px 0 rgba(255,255,255,0.25) inset, 0 10px 22px rgba(249,115,22,0.35)' }}>HR</div>}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
            <span style={{ fontSize: 24, fontWeight: 800, letterSpacing: -0.5 }}>DASH NETWORK</span>
            <span style={{ fontSize: 15, fontWeight: 800, color: ORANGE, letterSpacing: 1 }}>{`🌙 MOONSHOT · ${label}`}</span>
          </div>
          <span style={{ fontSize: 14, color: DIM }}>{sub}</span>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          {pills.map((p) => (
            <span key={p} style={{ fontSize: 13, fontWeight: 800, color: ORANGE, border: '1px solid rgba(249,115,22,0.55)', borderRadius: 999, padding: '5px 13px', background: 'rgba(249,115,22,0.08)' }}>{p}</span>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', height: 1, background: 'linear-gradient(90deg, rgba(249,115,22,0.55) 0%, rgba(255,255,255,0.08) 35%, rgba(255,255,255,0.08) 100%)', marginTop: 18 }} />
    </div>
  )
}

function Footer({ site, note }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', marginTop: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '0 40px 16px 40px', fontSize: 14, color: '#71717a' }}>
        <span>{note || `${site}/called · CALLED IT — was he on the bot before the ball left?`}</span>
        <span style={{ marginLeft: 'auto', color: DIM, fontWeight: 800 }}>DASH NETWORK · MOONSHOT</span>
      </div>
      <div style={{ display: 'flex', height: 6, background: `linear-gradient(90deg, #9a3412 0%, ${ORANGE} 50%, #fb923c 100%)` }} />
    </div>
  )
}

/** One labelled value, the shape kvRow() draws on the site's card. */
function KV({ label, value, hot }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 17, lineHeight: 1.5, padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {hot ? <div style={{ width: 5, height: 5, borderRadius: 3, background: ORANGE, display: 'flex' }} /> : <div style={{ width: 5, height: 5, display: 'flex' }} />}
        <span style={{ color: DIM }}>{label}</span>
      </div>
      <span style={{ color: hot ? ORANGE : INK, fontWeight: hot ? 800 : 400 }}>{value}</span>
    </div>
  )
}

/**
 * The card for one homer_feed row. Returns an ImageResponse (a Response whose
 * body is the PNG). `site` is the bare host shown in the footer.
 */
export async function homerCard(row, { site = 'dashnetwork.vercel.app' } = {}) {
  const [base, , display] = await Promise.all([loadFonts(), loadMark(), loadDisplay()])
  const fonts = [...base, ...display]
  const name = String(row?.name || 'Unknown')
  const team = String(row?.team || '').toUpperCase()
  const col = teamColor(team)
  const score = fin(row?.hr_score) ? Math.round(Number(row.hr_score)) : null
  const called = Boolean(row?.role)
  const roles = String(row?._roles || row?.role || '')
  const call = called
    ? `ON THE BOT — ${roleWord(row.role).toUpperCase()}${roles.includes('/') ? ` (${roles})` : ''}`
    : row?.on_board ? 'ON THE BOARD — NO CALL' : 'NOT ON THE BOARD'
  // THE PICK EMBLEM (2026-09-07). Donovan: "instead of the player just put
  // the pick type emoji and if it just a board pick use a specific emoji."
  // One glyph per role rather than one for "called at all", so the badge says
  // WHICH call it was at a glance. Falls through to the robot for a role that
  // is not in this table -- ROLE_WORD has TOP15/HIT/CONTACT/TB/WATCH too, and
  // a new one must never render blank.
  const PICK_GLYPH = { TOP: '⭐', HR: '💣', HRR: '🎯', HIT: '🥎', CONTACT: '🥎', TB: '🥎', TOP15: '🔥', WATCH: '👁' }
  const roleKey = String(row?.role || '').toUpperCase()
  const glyph = called ? (PICK_GLYPH[roleKey] || '🤖') : row?.on_board ? '👀' : '💥'
  // Short badge word. roleWord gives "TOP pick"; the badge has no room for
  // the noun and the emblem already says it is a pick.
  const badgeWord = called
    ? roleWord(row.role).replace(/\s*pick$/i, '').toUpperCase()
    : row?.on_board ? 'ON THE BOARD' : 'OFF THE BOARD'
  const odds = Number(row?.odds_over)
  const book = String(row?.odds_book || '')
  const hasOdds = Number.isFinite(odds) && odds !== 0 && book
  const where = [row?.inning, matchupWord(row)].filter(Boolean).join('  ·  ')
  const nth = Number(row?.hr_n) > 1 ? `${row.hr_n} TONIGHT` : ''
  const s = row?.stats || {}
  const hooks = (Array.isArray(row?.hooks) ? row.hooks : []).slice(0, 3)

  // 🔨 THE BAT — same rows, same thresholds as the site's card
  const bat = []
  if (fin(s.season_hr)) bat.push({ label: 'Season', value: `${Number(s.season_hr) + Number(row?.hr_n || 1)} HR${iso(s.season_iso) ? ` · ISO ${iso(s.season_iso)}` : ''}`, hot: false })
  if (fin(s.last5_hr) || fin(s.last5_hits)) bat.push({ label: 'Last 5', value: `${Number(s.last5_hr) || 0} HR · ${Number(s.last5_hits) || 0} H · ${Number(s.last5_xbh) || 0} XBH`, hot: Number(s.last5_hr) >= 2 })
  if (pct(s.barrel)) bat.push({ label: 'Barrel % (recent)', value: pct(s.barrel), hot: Number(s.barrel) >= 0.12 })
  if (pct(s.hard_hit)) bat.push({ label: 'Hard-hit % (recent)', value: pct(s.hard_hit), hot: Number(s.hard_hit) >= 0.45 })
  if (fin(s.max_distance) && Number(s.max_distance) > 0) bat.push({ label: 'Best recent ball', value: `${Math.round(Number(s.max_distance))} ft${fin(s.max_ev) ? ` · ${Math.round(Number(s.max_ev))} mph` : ''}`, hot: Number(s.max_distance) >= 400 })

  // 🥎 THE ARM
  const arm = []
  if (s.pitcher) arm.push({ label: 'Pitcher', value: `${s.pitcher}${s.pitcher_throws && s.pitcher_throws !== '—' ? ` (${s.pitcher_throws}HP)` : ''}`, hot: false })
  if (fin(s.pitcher_hr9)) arm.push({ label: 'HR/9', value: Number(s.pitcher_hr9).toFixed(2), hot: Number(s.pitcher_hr9) >= 1.5 })
  if (fin(s.pitcher_whip)) arm.push({ label: 'WHIP', value: Number(s.pitcher_whip).toFixed(2), hot: Number(s.pitcher_whip) >= 1.4 })
  if (s.weak_side) {
    const his = (s.weak_side === 'LHB' && s.bats === 'L') || (s.weak_side === 'RHB' && s.bats === 'R')
    arm.push({ label: 'Weak vs', value: `${s.weak_side}${his ? ' — his side ✓' : ''}`, hot: his })
  }
  if (fin(s.park_factor)) arm.push({ label: 'Park', value: `${(s.venue || 'tonight').split(' ').slice(0, 3).join(' ')} · ${Number(s.park_factor) >= 1.05 ? '+' : ''}${Math.round(100 * (Number(s.park_factor) - 1))}% HR`, hot: Number(s.park_factor) >= 1.05 })
  const hasStats = bat.length + arm.length > 0

  return frame([
      <Header label="CALLED IT" sub={`${prettyDay(String(row?.day || ''))} · every home run, graded in public`} pills={[called && Number(row?.odds_over) >= 700 ? `🎯 LONGSHOT ${fmtOdds(row.odds_over)}` : '', nth, 'TONIGHT'].filter(Boolean)} key="h" />,

      // his team, washed into the corner behind the score -- the card reads
      // as HIS before it reads as a number. Same color as the left edge bar.
      <div key="wash" style={{ display: 'flex', position: 'absolute', right: 0, top: 0, width: 480, height: 340, background: `radial-gradient(circle at 100% 0%, ${col}30 0%, ${col}00 68%)` }} />,

      // THE EMBLEM. Was a 176px ghost numeral at 14% opacity that nobody could
      // read, and the score/rank/odds were a row of 17px dim text nobody read
      // either. Donovan: "the moonshot score and #2 on the board and odds text
      // is not seen." Now it is a bordered badge in the corner the eye goes to
      // first, carrying the pick type, the score and the rank together.
      <div key="emblem" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'absolute', right: 40, top: 92, width: 208, padding: '16px 12px 14px 12px', borderRadius: 16, border: `1px solid ${called ? 'rgba(249,115,22,0.55)' : 'rgba(255,255,255,0.14)'}`, background: called ? 'rgba(249,115,22,0.09)' : 'rgba(255,255,255,0.04)' }}>
        <span style={{ fontSize: 40, lineHeight: 1 }}>{glyph}</span>
        <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: 2, marginTop: 8, color: called ? ORANGE : '#d4d4d8' }}>{badgeWord}</span>
        {score != null ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 10, paddingTop: 10, width: '100%', borderTop: `1px solid ${called ? 'rgba(249,115,22,0.30)' : 'rgba(255,255,255,0.12)'}` }}>
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 3, color: DIM }}>MOONSHOT SCORE</span>
            <span style={{ fontFamily: DISPLAY, fontSize: 62, fontWeight: 900, lineHeight: 1, color: ORANGE, transform: 'skewX(-8deg)' }}>{String(score)}</span>
          </div>
        ) : null}
        {row?.board_rank ? <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1.6, color: DIM, marginTop: 6 }}>{`#${row.board_rank} ON THE BOARD`}</span> : null}
      </div>,

      // identity
      <div key="id" style={{ display: 'flex', alignItems: 'flex-end', padding: '22px 268px 0 40px', gap: 22 }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: 14, letterSpacing: 6, color: DIM }}>H O M E   R U N</span>
          <span style={{ fontFamily: DISPLAY, fontSize: 76, fontWeight: 900, lineHeight: 0.98, marginTop: 4, transform: 'skewX(-8deg)', letterSpacing: -1 }}>{name}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingBottom: 10 }}>
          {team ? <span style={{ background: col, color: inkOn(col), fontSize: 16, fontWeight: 800, borderRadius: 9, padding: '5px 12px', boxShadow: `0 6px 16px ${col}55` }}>{team}</span> : null}
          <span style={{ fontSize: 21, color: '#d4d4d8' }}>{where}</span>
        </div>
      </div>,

      // the call
      <div key="call" style={{ display: 'flex', alignItems: 'center', gap: 22, margin: '16px 268px 0 40px', padding: '14px 22px', borderRadius: 14, background: called ? 'linear-gradient(90deg, rgba(249,115,22,0.20) 0%, rgba(249,115,22,0.05) 100%)' : 'rgba(255,255,255,0.05)', border: `1px solid ${called ? 'rgba(249,115,22,0.55)' : 'rgba(255,255,255,0.10)'}` }}>
        <span style={{ fontSize: 28 }}>{glyph}</span>
        <span style={{ fontSize: 24, fontWeight: 800, color: called ? ORANGE : '#e4e4e7' }}>{call}</span>
        {hasOdds ? (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, marginLeft: 'auto' }}>
            <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: 2, color: DIM }}>HR</span>
            <span style={{ fontFamily: DISPLAY, fontSize: 34, fontWeight: 900, lineHeight: 1, color: INK, transform: 'skewX(-8deg)' }}>{fmtOdds(odds)}</span>
            <span style={{ fontSize: 15, fontWeight: 800, color: DIM }}>{book}</span>
          </div>
        ) : null}
      </div>,

      // the bat | the arm — each column header now sits on its own hairline,
      // reading as a mini table rather than two bolded labels floating loose
      hasStats ? (
        <div key="stats" style={{ display: 'flex', gap: 40, margin: '18px 40px 0 40px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
            <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: 1, paddingBottom: 6, marginBottom: 6, borderBottom: '1px solid rgba(255,255,255,0.10)' }}>🔨 THE BAT</span>
            {bat.map((r) => <KV key={r.label} {...r} />)}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
            <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: 1, paddingBottom: 6, marginBottom: 6, borderBottom: '1px solid rgba(255,255,255,0.10)' }}>🥎 THE ARM</span>
            {arm.map((r) => <KV key={r.label} {...r} />)}
          </div>
        </div>
      ) : null,

      // the hooks — what only MOONSHOT tracks. Boxed now (2026-09-07): pair
      // history and Shape Score moved up to be the two most-likely-to-survive
      // hooks in postText's tweet, so the card gives them a frame to match.
      hooks.length ? (
        <div key="hooks" style={{ display: 'flex', flexDirection: 'column', margin: '16px 40px 0 40px', padding: '12px 18px', gap: 5, borderRadius: 12, background: 'rgba(249,115,22,0.07)', border: '1px solid rgba(249,115,22,0.22)' }}>
          {hooks.map((h) => <span key={h} style={{ fontSize: 17, color: ORANGE, fontWeight: 600 }}>{h}</span>)}
        </div>
      ) : null,

      <Footer site={site} key="f" />,
  ], fonts, 675, col)
}

/**
 * The night's card: called / total, the by-role split, ten nights of bars,
 * and the names the bot had. `rows` are tonight's homer_feed rows; `history`
 * is every row from the last ten days (day, role) for the bars.
 */
export async function recapCard(day, rows = [], history = [], { site = 'dashnetwork.vercel.app' } = {}) {
  const [base, , display] = await Promise.all([loadFonts(), loadMark(), loadDisplay()])
  const fonts = [...base, ...display]
  const c = captureFrom(rows)
  const roles = Object.entries(c.byRole).sort((a, b) => b[1] - a[1])
  const called = rows.filter((r) => r?.role).sort((a, b) => (a.board_rank || 999) - (b.board_rank || 999)).slice(0, 8)

  const days = []
  for (let i = 9; i >= 0; i -= 1) {
    const d = new Date(`${day}T12:00:00Z`)
    d.setUTCDate(d.getUTCDate() - i)
    const iso8601 = d.toISOString().slice(0, 10)
    const cc = captureFrom(history.filter((r) => r.day === iso8601))
    days.push({ day: iso8601, ...cc })
  }
  const span = days.reduce((a, d) => ({ called: a.called + d.called, total: a.total + d.total }), { called: 0, total: 0 })
  const spanPct = span.total ? Math.round((100 * span.called) / span.total) : null

  return frame([
      <Header label="CALLED IT · THE NIGHT" sub={`${prettyDay(day)} · every home run, graded in public`} pills={['RECAP']} key="h" />,

      <div key="body" style={{ display: 'flex', padding: '26px 40px 0 40px', gap: 32 }}>
        {/* headline */}
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, position: 'relative' }}>
          <div style={{ display: 'flex', position: 'absolute', left: -20, top: -10, width: 260, height: 200, background: 'radial-gradient(circle, rgba(249,115,22,0.18) 0%, rgba(249,115,22,0) 70%)' }} />
          <span style={{ fontSize: 14, letterSpacing: 6, color: DIM }}>T H E   B O T   C A L L E D</span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginTop: 4 }}>
            <span style={{ fontSize: 120, fontWeight: 800, color: ORANGE, lineHeight: 1 }}>{String(c.called)}</span>
            <span style={{ fontFamily: DISPLAY, fontSize: 44, color: DIM, transform: 'skewX(-8deg)' }}>{`of ${c.total} home runs`}</span>
          </div>
          <span style={{ fontSize: 26, marginTop: 8 }}>{`${c.pct ?? 0}% tonight${c.rated ? ` · ${c.rated} more on the board, no call` : ''}${c.off ? ` · ${c.off} off the board` : ''}`}</span>
          <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
            {roles.map(([r, n]) => (
              <span key={r} style={{ fontSize: 15, fontWeight: 800, color: ORANGE, border: '1px solid rgba(249,115,22,0.55)', borderRadius: 999, padding: '5px 13px', background: 'rgba(249,115,22,0.08)' }}>{`🤖 ${roleWord(r).toUpperCase()} ${n}`}</span>
            ))}
          </div>
          {called.length ? (
            <span style={{ fontSize: 17, color: '#d4d4d8', marginTop: 18, lineHeight: 1.4 }}>
              {called.map((r) => `${r.name}${r.team ? ` (${r.team})` : ''}`).join('  ·  ')}
            </span>
          ) : null}
        </div>

        {/* ten nights — boxed as its own panel now, so the two halves of
            the card read as two tiles rather than one loose column drifting
            off the headline's edge */}
        <div style={{ display: 'flex', flexDirection: 'column', width: 380, padding: '18px 20px', borderRadius: 16, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: 1 }}>LAST 10 NIGHTS</span>
            {spanPct != null ? <span style={{ fontSize: 15, color: ORANGE, fontWeight: 800 }}>{`${span.called} / ${span.total} · ${spanPct}%`}</span> : null}
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 280, marginTop: 14 }}>
            {days.map((d) => (
              <div key={d.day} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, height: '100%', justifyContent: 'flex-end' }}>
                <span style={{ fontSize: 12, color: DIM, marginBottom: 4 }}>{d.total ? `${d.pct}%` : '—'}</span>
                {d.day === day ? <div style={{ width: 6, height: 6, borderRadius: 3, background: ORANGE, display: 'flex', marginBottom: 4 }} /> : null}
                <div style={{ display: 'flex', width: '100%', height: `${Math.max(2, d.pct || 0)}%`, background: d.day === day ? `linear-gradient(180deg, #fb923c 0%, ${ORANGE} 100%)` : 'rgba(249,115,22,0.35)', borderRadius: 4 }} />
                <span style={{ fontSize: 11, color: d.day === day ? INK : DIM, fontWeight: d.day === day ? 800 : 400, marginTop: 6 }}>{d.day.slice(5).replace('-', '/')}</span>
              </div>
            ))}
          </div>
        </div>
      </div>,

      <Footer key="f" site={site} note={`${site}/called · CALLED IT — tonight's list, and every night before it`} />,
  ], fonts)
}

/**
 * The pregame card: the bot's HR calls for the night, with the price. The
 * most-seen post of the day; every called homer will quote it.
 */
export async function pregameCard(day, picks = [], { site = 'dashnetwork.vercel.app' } = {}) {
  const [base, , display] = await Promise.all([loadFonts(), loadMark(), loadDisplay()])
  const fonts = [...base, ...display]
  // Bumped from 5 to 10 (2026-09-06, Donovan) -- ten rows no longer fit the
  // old 675px frame at the old row size, so both shrink together: tighter
  // padding and smaller type per row, a taller canvas to hold all ten
  // without clipping the last few.
  const list = (Array.isArray(picks) ? picks : []).slice(0, 10)
  const ROWS_HEIGHT = 760
  return frame([
    <Header label="CALLED IT · TONIGHT'S CALLS" sub={`${prettyDay(day)} · posted before first pitch`} pills={['PREGAME']} key="h" />,

    <div key="body" style={{ display: 'flex', flexDirection: 'column', padding: '18px 40px 0 40px' }}>
      <span style={{ fontSize: 14, letterSpacing: 6, color: DIM }}>THE BOT’S HR CALLS</span>
      <div style={{ display: 'flex', flexDirection: 'column', marginTop: 8 }}>
        {list.map((p, i) => {
          const col = teamColor(p.team)
          const price = p.odds_over && p.odds_book ? `${fmtOdds(p.odds_over)} · ${p.odds_book}` : ''
          const podium = i < 3
          return (
            <div key={p.player_id || i} style={{
              display: 'flex', alignItems: 'center', gap: 16, padding: '8px 10px', marginTop: i ? 2 : 0,
              borderRadius: 10, background: i % 2 ? 'rgba(255,255,255,0.025)' : 'transparent',
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34,
                borderRadius: 9, fontSize: podium ? 18 : 17, fontWeight: 800,
                color: podium ? '#fff' : ORANGE,
                background: podium ? `linear-gradient(160deg, #fb923c 0%, ${ORANGE} 100%)` : 'rgba(249,115,22,0.10)',
              }}>{String(i + 1)}</div>
              <span style={{ fontSize: 26, fontWeight: 800, width: 350 }}>{String(p.name || '')}</span>
              {p.team ? <span style={{ background: col, color: inkOn(col), fontSize: 14, fontWeight: 800, borderRadius: 8, padding: '3px 10px' }}>{String(p.team)}</span> : null}
              <span style={{ fontSize: 16, color: '#d4d4d8', width: 290, whiteSpace: 'nowrap' }}>{p.opponent ? `vs ${p.opponent}${p.pitcher ? ` · ${p.pitcher}` : ''}` : ''}</span>
              <span style={{ marginLeft: 'auto', fontSize: 16, color: DIM, whiteSpace: 'nowrap' }}>{p.hr_score != null ? `MOONSHOT Score ${Math.round(Number(p.hr_score))}` : ''}</span>
              <span style={{
                width: 150, justifyContent: 'center', display: 'flex', fontSize: 17, fontWeight: 800, whiteSpace: 'nowrap',
                color: price ? INK : DIM, padding: price ? '5px 0' : 0,
                borderRadius: 999, background: price ? 'rgba(249,115,22,0.14)' : 'transparent',
                border: price ? '1px solid rgba(249,115,22,0.35)' : 'none',
              }}>{price || '—'}</span>
            </div>
          )
        })}
      </div>
    </div>,

    <Footer key="f" site={site} note={`${site}/called · CALLED IT — 🤖 = called it, graded live below as they land`} />,
  ], fonts, ROWS_HEIGHT)
}

/**
 * A simple one-headline card for a single callout that doesn't need a
 * table -- pairs to watch, tonight's longest call, the month's breakdown
 * (2026-09-06, Donovan: "make sure some of these are getting cards"). Same
 * header/footer as every other card; the body is just a headline and
 * whatever detail lines the caller passes, sized for a handful of lines.
 */
export async function statCard(day, { pill = '', label = '', headline = '', lines = [] } = {}, { site = 'dashnetwork.vercel.app' } = {}) {
  const [base, , display] = await Promise.all([loadFonts(), loadMark(), loadDisplay()])
  const fonts = [...base, ...display]
  const detail = (Array.isArray(lines) ? lines : []).filter(Boolean)
  return frame([
    <Header label={label} sub={prettyDay(day)} pills={pill ? [pill] : []} key="h" />,

    <div key="body" style={{ display: 'flex', flexDirection: 'column', padding: '50px 50px 0 50px', flex: 1, justifyContent: 'center' }}>
      <span style={{ fontFamily: DISPLAY, fontSize: 52, fontWeight: 900, lineHeight: 1.12, transform: 'skewX(-8deg)' }}>{String(headline || '')}</span>
      <div style={{ display: 'flex', flexDirection: 'column', marginTop: 28, gap: 14 }}>
        {detail.map((l, i) => (
          <span key={i} style={{ fontSize: 24, color: DIM }}>{String(l)}</span>
        ))}
      </div>
    </div>,

    <Footer key="f" site={site} />,
  ], fonts)
}
