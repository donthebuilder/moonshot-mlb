// THE POSTER KIT (server only, JSX): the 1200 x 675 landscape variant of the baseball-card look (lib/cards/cardKit.js).
// Donovan, 2026-10-12: "everything should be the baseball card look, even the one for the games". The X / Discord poster size is KEPT
// (1200 x 675, so no post changes); what changes is the drawing: the same frame (dark ground, thin accent border, rounded corners), the
// FOIL STRIP across the top used ONLY when the status is CALLED, the letter-spaced status word + rule + label, the portrait over a
// faded club-logo watermark, the oversized slanted display-caps name, the club logo + matchup, ruled metric tiles, a closing status
// banner and the quiet footer "BRAND . DASH Network". Every primitive is cardKit's (foil, field, fitName's rule, Logo, Face, Target, the
// fonts and the grain); this file only lays them out landscape. NOTHING here names a sport: the accent, the words and the numbers arrive
// from the poster that calls it (lib/dash/homerCard.js, lib/nhl/goalCard.js, lib/nfl/tdCard.js, lib/nfl/spotlightCard.js).
//
// TYPE FLOOR. cardKit's floor (22px, at its 1080 design) is applied at this canvas's own size: every text node is >= 22px (fs()), and
// lintType() re-checks each poster as it renders (offenders land in cardKit's LINT list, which the snapshot script prints).
import { ImageResponse } from 'next/og'
import { assets, inline, field, foil, alpha, fs, lintType, LINT, Logo, Face, Target, DISPLAY, INK, INK2, DIM, RULE, CHASSIS, BODY_FACE } from './cardKit'
import { logoFor } from './adapters/common'
import { mlbHeadshot } from '../mlbTeams'
import { nflHeadshot } from '../nfl/nflAssets'
import { headshotIdFor } from '../nfl/headshotIds'

export { alpha, fs, Logo, Face, Target, DISPLAY, INK, INK2, DIM, RULE, CHASSIS, assets, logoFor, inline, mlbHeadshot }

/** The poster size (the X / Discord image), the frame inset and the fixed bands. A poster taller than 675 (the pregame list) gives its own h. */
export const POSTER = { w: 1200, h: 675, inset: 14, foil: 8, top: 44, foot: 46 }
/** The body's height inside the frame (the border is 3px a side). */
export const bodyH = (h = POSTER.h) => h - 2 * POSTER.inset - POSTER.foil - POSTER.top - POSTER.foot - 6
export const bodyW = POSTER.w - 2 * POSTER.inset - 6

/** A display-caps name shrunk until it fits maxW (Big Shoulders is ~0.46em a letter, upper case), never below `min`. */
export const fitDisplay = (name, size, maxW, min = 40) => {
  const n = String(name || '').length || 1
  return Math.max(min, Math.min(size, Math.floor(maxW / (n * 0.46))))
}

/** "Jan 2, 2026" from a game's own date (the date key, never a wall clock). */
export const prettyDay = (iso8601) => {
  if (!/^\d{4}-\d{2}-\d{2}/.test(String(iso8601 || ''))) return ''
  const d = new Date(`${iso8601}T12:00:00Z`)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

/** Lint the design, draw it at 1200 x h and return the ImageResponse (a Response whose body is the PNG): what every poster function returns. */
export async function renderPoster(el, { h = POSTER.h, poster = 'poster' } = {}) {
  const off = lintType(el)
  if (off.length) LINT.push(...off.map((x) => ({ ...x, card: poster })))
  const { fonts } = await assets()
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
/**
 * `word`    the letter-spaced word top left (the status word on a call poster, the product's kind word on the others)
 * `called`  true ONLY when the poster says CALLED: it alone gets the foil strip and the accent word
 * `chips`   short accent pills beside the label (a long-shot price, "2 TONIGHT")
 * `right`   the label top right (the event: HOME RUN, GOAL, TOUCHDOWN ...)
 * `brand`   the product name in the footer; `footRight` the date (and the product's own sub line)
 */
export function Poster({ accent, tone, grain, called = false, word, chips = [], right = '', brand, footRight = '', h = POSTER.h, children }) {
  const iw = POSTER.w - 2 * POSTER.inset
  const ih = h - 2 * POSTER.inset
  return (
    <div style={{ width: POSTER.w, height: h, display: 'flex', position: 'relative', overflow: 'hidden', background: field(accent, tone), color: INK, fontFamily: BODY_FACE }}>
      {grain ? <img src={grain} width={POSTER.w} height={h} style={{ position: 'absolute', left: 0, top: 0, opacity: 0.9 }} /> : null}
      <div style={{ display: 'flex', flexDirection: 'column', position: 'absolute', left: POSTER.inset, top: POSTER.inset, width: iw, height: ih, border: `3px solid ${alpha(accent, 0.55)}`, borderRadius: 22, overflow: 'hidden' }}>
        {called ? <div style={{ display: 'flex', height: POSTER.foil, background: foil(accent) }} /> : <div style={{ display: 'flex', height: POSTER.foil }} />}
        <div style={{ display: 'flex', alignItems: 'center', height: POSTER.top, padding: '0 22px', gap: 20 }}>
          <span style={{ fontSize: fs(30), fontWeight: 800, letterSpacing: 8, color: called ? accent : INK2, whiteSpace: 'nowrap' }}>{word}</span>
          <div style={{ display: 'flex', flexGrow: 1, height: 2, background: alpha(accent, called ? 0.5 : 0.2) }} />
          {chips.map((c) => <Chip key={c} text={c} accent={accent} />)}
          <span style={{ fontSize: fs(26), fontWeight: 800, letterSpacing: 3, color: INK2, whiteSpace: 'nowrap' }}>{right}</span>
        </div>
        <div style={{ display: 'flex', flexGrow: 1 }}>{children}</div>
        <div style={{ display: 'flex', alignItems: 'center', height: POSTER.foot, padding: '0 22px', gap: 20 }}>
          <span style={{ fontSize: fs(24), fontWeight: 800, color: INK2, letterSpacing: 2, whiteSpace: 'nowrap' }}>{`${brand} · DASH Network`}</span>
          <div style={{ display: 'flex', flexGrow: 1, height: 2, background: RULE }} />
          <span style={{ fontSize: fs(24), fontWeight: 600, color: DIM, whiteSpace: 'nowrap' }}>{footRight}</span>
        </div>
      </div>
    </div>
  )
}

export const Chip = ({ text, accent }) => (
  <span style={{ display: 'flex', fontSize: fs(22), fontWeight: 800, letterSpacing: 2, color: accent, border: `2px solid ${alpha(accent, 0.6)}`, borderRadius: 999, padding: '1px 14px', whiteSpace: 'nowrap' }}>{text}</span>
)

// ── THE PORTRAIT COLUMN ─────────────────────────────────────────────────────────────────────────────────────────────────────
/** The left column: the face over a faded club-logo watermark, a quiet tag top left, and a score plate along the bottom. */
export function Portrait({ m, w, h, accent, tag, plate }) {
  const wm = Math.round(w * 1.15)
  return (
    <div style={{ display: 'flex', position: 'relative', width: w, height: h, flexShrink: 0, overflow: 'hidden', borderRight: `2px solid ${alpha(accent, 0.45)}`, background: `radial-gradient(circle at 50% 38%, ${alpha(m.tone || accent, 0.42)} 0%, ${alpha(accent, 0.08)} 66%, ${alpha(CHASSIS.bg, 0.3)} 100%)` }}>
      {m.logo ? <div style={{ display: 'flex', position: 'absolute', right: -Math.round(w * 0.28), top: Math.round(h * 0.06), opacity: 0.16 }}><Logo m={m} size={wm} /></div> : null}
      <div style={{ display: 'flex', position: 'absolute', left: 0, bottom: plate ? (plate.h || 116) : 0 }}><Face m={m} w={w - 2} h={w - 2} accent={accent} /></div>
      {tag ? (
        <span style={{ display: 'flex', position: 'absolute', left: 14, top: 14, fontSize: fs(22), fontWeight: 800, letterSpacing: 1, color: INK, background: alpha(CHASSIS.bg, 0.72), borderStyle: 'solid', borderWidth: '2px 2px 2px 6px', borderColor: `${alpha(INK, 0.22)} ${alpha(INK, 0.22)} ${alpha(INK, 0.22)} ${alpha(accent, 0.9)}`, padding: '3px 12px', whiteSpace: 'nowrap' }}>{tag}</span>
      ) : null}
      {plate ? <ScorePlate {...plate} accent={accent} w={w} /> : null}
    </div>
  )
}

/** The score plate: a quiet word, the number in the display face in the accent, and one caption line. */
export function ScorePlate({ word, value, caption, accent, w, hot = true, h = 116 }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'absolute', left: 0, bottom: 0, width: w - 2, height: h, background: alpha(CHASSIS.bg, 0.8), borderTop: `2px solid ${alpha(accent, 0.5)}` }}>
      {word ? <span style={{ fontSize: fs(22), fontWeight: 800, letterSpacing: 1.5, color: INK2, whiteSpace: 'nowrap' }}>{word}</span> : null}
      <span style={{ fontFamily: DISPLAY, fontSize: 64, fontWeight: 900, lineHeight: 1, color: hot ? accent : INK, transform: 'skewX(-8deg)', whiteSpace: 'nowrap' }}>{String(value)}</span>
      {caption ? <span style={{ fontSize: fs(22), fontWeight: 700, color: INK2, textAlign: 'center', padding: '0 8px' }}>{caption}</span> : null}
    </div>
  )
}

// ── THE RIGHT COLUMN'S PIECES ───────────────────────────────────────────────────────────────────────────────────────────────
/** The slanted display-caps name, one line, stepped down to fit maxW. */
export const NameLine = ({ name, size = 96, maxW, h = 92 }) => (
  <span style={{ display: 'flex', alignItems: 'center', height: h, fontFamily: DISPLAY, fontSize: fitDisplay(name, size, maxW), fontWeight: 900, lineHeight: 1.02, textTransform: 'uppercase', transform: 'skewX(-8deg)', letterSpacing: -0.5, whiteSpace: 'nowrap' }}>{String(name || '')}</span>
)

/** The club logo, the matchup in the body face, and quiet extra words. */
export const MatchLine = ({ m, text, extra, size = 44 }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 14, height: size + 4 }}>
    <Logo m={m} size={size} />
    <span style={{ fontSize: fs(34), fontWeight: 800, whiteSpace: 'nowrap' }}>{text}</span>
    {extra ? <span style={{ fontSize: fs(26), fontWeight: 600, color: DIM, whiteSpace: 'nowrap' }}>{extra}</span> : null}
  </div>
)

/** A ruled metric tile: label, the number in the display face (accent when `hot`), an optional unit. */
export function Tile({ label, value, unit, hot, accent, big = 56, w, grow = true }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', ...(grow ? { flexGrow: 1, flexBasis: 0 } : {}), ...(w ? { width: w } : {}), padding: '6px 16px 8px 16px', borderLeft: `2px solid ${alpha(INK, 0.14)}` }}>
      <span style={{ fontSize: fs(22), fontWeight: 800, color: DIM, letterSpacing: 0.4, lineHeight: 1.1 }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontFamily: DISPLAY, fontSize: big, fontWeight: 900, lineHeight: 1.05, color: hot ? accent : INK, whiteSpace: 'nowrap', transform: 'skewX(-8deg)' }}>{String(value)}</span>
        {unit ? <span style={{ fontSize: fs(22), fontWeight: 700, color: DIM, whiteSpace: 'nowrap' }}>{unit}</span> : null}
      </div>
    </div>
  )
}

/** A row of tiles under one rule. */
export const TileRow = ({ children }) => (
  <div style={{ display: 'flex', borderTop: `2px solid ${RULE}`, borderBottom: `2px solid ${RULE}` }}>{children}</div>
)

/** A titled table of label / value rows (label quiet, value in the body face, accent when `hot`). */
export function KVTable({ title, rows, accent, grow = 1, head }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flexGrow: grow, flexBasis: 0, borderRadius: 12, border: `2px solid ${alpha(INK, 0.14)}`, background: alpha(INK, 0.04), overflow: 'hidden' }}>
      {title ? <span style={{ display: 'flex', fontSize: fs(22), fontWeight: 800, letterSpacing: 3, color: head || DIM, padding: '5px 16px', borderBottom: `2px solid ${alpha(INK, 0.14)}`, whiteSpace: 'nowrap' }}>{title}</span> : null}
      {rows.map((r, i) => (
        <div key={r.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, padding: '3px 16px', borderBottom: i < rows.length - 1 ? `2px solid ${alpha(INK, 0.08)}` : 'none' }}>
          <span style={{ display: 'flex', fontSize: fs(22), fontWeight: 600, color: INK2, whiteSpace: 'nowrap' }}>{r.label}</span>
          <span style={{ display: 'flex', fontSize: fs(22), fontWeight: 800, color: r.hot ? accent : INK, whiteSpace: 'nowrap' }}>{r.value}</span>
        </div>
      ))}
    </div>
  )
}

/** The closing status banner: the target mark, the line in the display face, and an optional price block on the right. */
export function Banner({ accent, called, line, right, h = 64, maxW = 520 }) {
  const edge = called ? accent : alpha(INK, 0.35)
  const ring = alpha(called ? accent : INK, called ? 0.4 : 0.14)
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: h, padding: '0 20px 0 18px', gap: 18, background: called ? `linear-gradient(90deg, ${alpha(accent, 0.2)} 0%, ${alpha(accent, 0.04)} 100%)` : alpha(INK, 0.05), borderStyle: 'solid', borderWidth: '2px 2px 2px 8px', borderColor: `${ring} ${ring} ${ring} ${edge}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <Target size={40} color={called ? accent : INK2} />
        <span style={{ fontFamily: DISPLAY, fontSize: fitDisplay(line, 38, maxW, 22), fontWeight: 900, lineHeight: 1.05, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{line}</span>
      </div>
      {right || null}
    </div>
  )
}

/** A price block for a banner: a small word, the price in the display face in the accent, and the book. */
export const Odds = ({ word, value, book, accent }) => (
  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
    {word ? <span style={{ fontSize: fs(22), fontWeight: 800, letterSpacing: 2, color: INK }}>{word}</span> : null}
    <span style={{ fontFamily: DISPLAY, fontSize: 48, fontWeight: 900, lineHeight: 1, color: accent, transform: 'skewX(-8deg)' }}>{value}</span>
    {book ? <span style={{ fontSize: fs(24), fontWeight: 800, color: INK, whiteSpace: 'nowrap' }}>{book}</span> : null}
  </div>
)

/** A bullet line (a square in the accent, then the words). */
export const Bullet = ({ text, accent, color = INK, size = 24 }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
    <div style={{ display: 'flex', width: 9, height: 9, background: accent }} />
    <span style={{ fontSize: fs(size), fontWeight: 800, color, whiteSpace: 'nowrap' }}>{text}</span>
  </div>
)

/** A small quiet caption over a value: the "label / value" cell of a panel. */
export const Cell = ({ label, value, accent, hot, grow = 1, big = 30 }) => (
  <div style={{ display: 'flex', flexDirection: 'column', flexGrow: grow, flexBasis: 0, padding: '6px 16px', borderLeft: `2px solid ${alpha(INK, 0.14)}` }}>
    <span style={{ fontSize: fs(22), fontWeight: 800, color: DIM, letterSpacing: 0.4, whiteSpace: 'nowrap' }}>{label}</span>
    <span style={{ fontSize: fs(big), fontWeight: 800, color: hot ? accent : INK, whiteSpace: 'nowrap' }}>{value}</span>
  </div>
)
