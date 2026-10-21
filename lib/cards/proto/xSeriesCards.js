// X SERIES PICTURES: PROTOTYPES (server only, JSX; nothing imports this from app/, nothing deploys). Donovan, 2026-10-20: "lets build proto
// types" for the Film Room card and both versions of The Five. Drawn with the site's own card pieces: next/og ImageResponse (the renderer
// every card uses), the fonts / grain / mark / cream ink from lib/cards/assets.js, each product's accent from lib/sportAccent.js, DASH
// orange from lib/theme.js, the status words from lib/callStatus.js, the product words from lib/routes.js BRAND.
//
//   filmRoomPoster   1200 x 675, the EDITORIAL poster language (CALLED IT graphics: paper, condensed display caps, black / cream / DASH
//                    orange, one diagram). One per topic; the diagram is the topic's own (the three buckets, a dot field of the real
//                    week, the #1 ladder, the +550, the timeline). No emoji (satori has no emoji font): words and shapes only.
//   fivePoster       1200 x 675, the dark card chassis: five rows, each in its product's accent, face + name + club + board rank + the why.
// Type floor 22px. No link, no hashtag, no model chance (a rank is "#6 of 405", never a percent).
import { ImageResponse } from 'next/og'
import { loadFonts, loadDisplay, loadMark, DISPLAY, INK, DIM, PANEL } from '../assets'
import { SPORT_ACCENT } from '../../sportAccent'
import { C } from '../../theme'
import { CHASSIS } from '../../design/tokens'
import { STATUS_WORD } from '../../callStatus'
import { BRAND } from '../../routes'
import { alpha } from '../color'

export const SIZE = { w: 1200, h: 675 }
const ORANGE = C.orange
const PAPER = INK                 // the cream, as the poster's paper
const BLACK = PANEL
const fs = (n) => Math.max(22, n)

let _a = null
async function assets() {
  if (_a) return _a
  const [base, display, mark] = await Promise.all([loadFonts(), loadDisplay(), loadMark()])
  _a = { fonts: [...base, ...display], mark }
  return _a
}
async function png(el) {
  const { fonts } = await assets()
  return Buffer.from(await new ImageResponse(el, { width: SIZE.w, height: SIZE.h, fonts }).arrayBuffer())
}

// ── shared pieces ─────────────────────────────────────────────────────────────────────────────────────────────────────────
const Display = ({ size, color = BLACK, children, skew = true, spacing = 0, style = {} }) => (
  <div style={{ display: 'flex', fontFamily: DISPLAY, fontWeight: 900, fontSize: size, lineHeight: 0.92, color, letterSpacing: spacing, ...(skew ? { transform: 'skewX(-8deg)' } : {}), ...style }}>{children}</div>
)
const Body = ({ size = 24, color = BLACK, weight = 400, children, style = {} }) => (
  <div style={{ display: 'flex', fontFamily: 'Inter', fontWeight: weight, fontSize: fs(size), lineHeight: 1.25, color, ...style }}>{children}</div>
)
// the halftone: a field of dots that fades left to right (the vintage print screen), drawn as one SVG
const Halftone = ({ w, h, color, step = 18 }) => {
  const dots = []
  for (let y = step / 2; y < h; y += step) for (let x = step / 2; x < w; x += step) {
    const r = (step / 2.4) * (x / w)
    if (r > 0.6) dots.push(<circle key={`${x}-${y}`} cx={x} cy={y} r={r.toFixed(1)} fill={color} />)
  }
  return <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} xmlns="http://www.w3.org/2000/svg">{dots}</svg>
}

// ── THE FILM ROOM POSTER ──────────────────────────────────────────────────────────────────────────────────────────────────
const LEFT_W = 600
const RIGHT_W = SIZE.w - LEFT_W - 96 - 48     // the page's two side pads and the gap between the columns

function Diagram({ topic, data }) {
  if (topic.key === 'called') {
    const rows = [
      { word: STATUS_WORD.called, what: 'We picked him. Before the game. In public.', fill: ORANGE, ink: BLACK, line: ORANGE },
      { word: STATUS_WORD.board, what: 'He made our board. Not a pick.', fill: 'transparent', ink: BLACK, line: BLACK },
      { word: STATUS_WORD.off, what: 'We never had him.', fill: 'transparent', ink: DIM, line: DIM },
    ]
    return (
      <div style={{ display: 'flex', flexDirection: 'column', width: RIGHT_W, gap: 18 }}>
        {rows.map((r) => (
          <div key={r.word} style={{ display: 'flex', flexDirection: 'column', border: `4px solid ${r.line}`, background: r.fill, padding: '14px 20px' }}>
            <Display size={40} color={r.ink} skew={false} spacing={1}>{r.word}</Display>
            <Body size={22} color={r.ink} style={{ marginTop: 6 }}>{r.what}</Body>
          </div>
        ))}
        <Body size={22} weight={800} color={BLACK}>{`Only ${STATUS_WORD.called} counts as ours.`}</Body>
      </div>
    )
  }
  if (topic.key === 'miss') {
    // one dot per real call of the last 7 nights (landed = filled orange); past 140 calls one dot is two (or more), and the legend says so
    const made = data?.made || 0
    const per = made > 140 ? Math.ceil(made / 140) : 1
    const n = Math.ceil(made / per)
    const lit = Math.round((data?.cashed || 0) / per)
    const D = made > 70 ? 22 : 30
    const dots = Array.from({ length: n }, (_, i) => i < lit)
    return (
      <div style={{ display: 'flex', flexDirection: 'column', width: RIGHT_W }}>
        {made ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, width: RIGHT_W }}>
            {dots.map((hit, i) => <div key={i} style={{ display: 'flex', width: D, height: D, borderRadius: D / 2, background: hit ? ORANGE : 'transparent', border: `3px solid ${hit ? ORANGE : BLACK}` }} />)}
          </div>
        ) : <Display size={120} color={ORANGE}>READ</Display>}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 22 }}>
          <div style={{ display: 'flex', width: 26, height: 26, borderRadius: 13, background: ORANGE }} /><Body size={24} weight={800}>landed</Body>
          <div style={{ display: 'flex', width: 26, height: 26, borderRadius: 13, border: `4px solid ${BLACK}`, marginLeft: 18 }} /><Body size={24} weight={800}>missed</Body>
        </div>
        <Body size={22} color={BLACK} style={{ marginTop: 10 }}>{made ? (per > 1 ? `Every call of the last 7 nights (one dot = ${per} calls).` : 'One dot = one call of the last 7 nights.') : 'A call is a read. Not a promise.'}</Body>
      </div>
    )
  }
  if (topic.key === 'rank') {
    const ladder = ['#1', '#2', '#3', '#4']
    return (
      <div style={{ display: 'flex', flexDirection: 'column', width: RIGHT_W }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16 }}>
          {ladder.map((r, i) => (
            <div key={r} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', width: 82, height: 220 - i * 40, background: i === 0 ? ORANGE : 'transparent', border: `4px solid ${i === 0 ? ORANGE : BLACK}` }}>
              <Display size={44} color={BLACK} skew={false} style={{ marginBottom: 10 }}>{r}</Display>
            </div>
          ))}
        </div>
        <Display size={52} color={BLACK} style={{ marginTop: 26 }}>MOST LIKELY</Display>
        <Display size={52} color={DIM} style={{ marginTop: 8, textDecoration: 'line-through', textDecorationColor: ORANGE }}>LIKELY</Display>
      </div>
    )
  }
  if (topic.key === 'longshot') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', width: RIGHT_W }}>
        <Display size={200} color={ORANGE}>+550</Display>
        <Display size={48} color={BLACK} style={{ marginTop: 6 }}>OR LONGER</Display>
        <div style={{ display: 'flex', width: RIGHT_W - 40, height: 6, background: BLACK, marginTop: 22 }} />
        <Body size={26} weight={800} style={{ marginTop: 16 }}>Most of these miss.</Body>
        <Body size={22} style={{ marginTop: 4 }}>The price says it. So do we.</Body>
      </div>
    )
  }
  // grading: the timeline
  const steps = [['POSTED', 'before the game'], ['GAME STARTS', 'the call can’t change'], ['FINAL', 'the box score'], ['GRADED', 'hit or miss, in public']]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: RIGHT_W }}>
      {steps.map(([w, s], i) => (
        <div key={w} style={{ display: 'flex', alignItems: 'stretch' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 40 }}>
            <div style={{ display: 'flex', width: 30, height: 30, borderRadius: 15, background: i === steps.length - 1 ? ORANGE : BLACK }} />
            {i < steps.length - 1 ? <div style={{ display: 'flex', width: 5, height: 52, background: BLACK }} /> : null}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', marginLeft: 18 }}>
            <Display size={38} color={i === steps.length - 1 ? ORANGE : BLACK} skew={false} spacing={1}>{w}</Display>
            <Body size={22} color={BLACK}>{s}</Body>
          </div>
        </div>
      ))}
    </div>
  )
}

const last = (name) => String(name || '').trim().split(/\s+/).slice(-1)[0].toUpperCase()
/** The bottom bar's words: a short caps stat line from the same real numbers as the post (null = the series line). */
export function cardLine(topic, d) {
  if (!d) return null
  if (topic.key === 'called' && d.made) return `LAST 7 NIGHTS  ·  ${d.made} CALLS  ·  ${d.cashed} LANDED  ·  EVERY ONE GRADED`
  if (topic.key === 'miss' && d.made) return `LAST 7 NIGHTS  ·  ${d.cashed} LANDED  ·  ${d.missed} MISSED  ·  ALL IN THE RECORD`
  if (topic.key === 'rank' && d.names.length) return `LAST 7 NIGHTS  ·  WE HAD: ${d.names.slice(0, 3).map(last).join(', ')}${d.names.length > 3 ? ` +${d.names.length - 3}` : ''}`
  if (topic.key === 'longshot' && d.tuesday) return `LAST LONGSHOT TUESDAY  ·  ${d.tuesday.landed} OF ${d.tuesday.graded} LANDED`
  if (topic.key === 'grading' && d.sportLines.length) return `LAST 7 NIGHTS  ·  ${d.sportLines.map((l) => l.split(' · ')[0].replace(/\s+/g, ' ').toUpperCase()).join('  ·  ')}`
  return null
}

/** One Film Room picture. `topic` = lib/posts/filmRoom.js TOPICS[i], `n` = its number in the series, `data` = filmData(), `realLine` = the post's real line or null. */
export async function filmRoomPoster({ topic, n = 1, data = null }) {
  const line = cardLine(topic, data)
  const { mark } = await assets()
  const title = topic.title.replace(/"/g, '')
  const deck = { called: 'Three words. Only one of them is ours.', miss: 'A call is a read. It is not a promise.', rank: 'The top of the board, and what it does not say.', longshot: 'The price, and what it is telling you.', grading: 'Posted before. Graded after. Nothing changes in between.' }[topic.key]
  const big = title.length > 22 ? 84 : 104
  const el = (
    <div style={{ display: 'flex', flexDirection: 'column', width: SIZE.w, height: SIZE.h, background: PAPER, position: 'relative', overflow: 'hidden', fontFamily: 'Inter' }}>
      <div style={{ display: 'flex', position: 'absolute', right: 0, top: 70 }}><Halftone w={520} h={470} color={alpha(BLACK, 0.08)} /></div>
      {/* the masthead */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 70, background: BLACK, padding: '0 48px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <Display size={44} color={PAPER} skew={false} spacing={4}>FILM ROOM</Display>
          <div style={{ display: 'flex', width: 4, height: 34, background: ORANGE }} />
          <Body size={22} weight={800} color={ORANGE} style={{ letterSpacing: 3 }}>{`NO. ${n} · WEDNESDAY`}</Body>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {mark ? <img src={mark} width={40} height={40} /> : null}
          <Body size={22} weight={800} color={PAPER} style={{ letterSpacing: 2 }}>CALLED IT</Body>
        </div>
      </div>
      {/* the page */}
      <div style={{ display: 'flex', flex: 1, padding: '40px 48px 0 48px', gap: 48 }}>
        <div style={{ display: 'flex', flexDirection: 'column', width: LEFT_W }}>
          <Display size={big} color={BLACK}>{title}</Display>
          <div style={{ display: 'flex', width: 160, height: 10, background: ORANGE, marginTop: 26 }} />
          <Body size={28} weight={800} color={BLACK} style={{ marginTop: 22, maxWidth: LEFT_W - 40 }}>{deck}</Body>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-start' }}><Diagram topic={topic} data={data} /></div>
      </div>
      {/* the real line (the week's own numbers), or the series line */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 74, background: BLACK, padding: '0 48px' }}>
        <Display size={32} color={PAPER} skew={false} spacing={1}>{line || 'EVERY CALL, GRADED. MISSES INCLUDED.'}</Display>
        <Body size={22} color={alpha(PAPER, 0.7)} style={{ whiteSpace: 'nowrap', marginLeft: 24 }}>DASH Network</Body>
      </div>
    </div>
  )
  return png(el)
}

// ── THE FIVE POSTER ───────────────────────────────────────────────────────────────────────────────────────────────────────
const Face = ({ src, name, accent, size }) => (src
  ? <img src={src} width={size} height={size} style={{ borderRadius: size / 2, objectFit: 'cover', background: alpha(accent, 0.18), border: `3px solid ${accent}` }} />
  : <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: size, height: size, borderRadius: size / 2, border: `3px solid ${accent}`, color: accent, fontFamily: DISPLAY, fontWeight: 900, fontSize: 28 }}>{String(name || '?').split(' ').map((p) => p[0]).join('').slice(0, 2)}</div>)

/**
 * One The Five picture. `rows` = [{ sport, name, team, rank, of, why, face }] (five or fewer), `label` = the variant's line under the title,
 * `day` = the label's date words ("Weekend of Oct 24").
 */
export async function fivePoster({ rows, label, day }) {
  const { mark } = await assets()
  const ROW_H = 92
  const el = (
    <div style={{ display: 'flex', flexDirection: 'column', width: SIZE.w, height: SIZE.h, background: CHASSIS.bg || '#0b0b0c', color: INK, fontFamily: 'Inter', padding: '30px 48px 0 48px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 22 }}>
          <Display size={84} color={INK}>THE FIVE</Display>
          <div style={{ display: 'flex', flexDirection: 'column', marginBottom: 8 }}>
            <Body size={22} weight={800} color={ORANGE} style={{ letterSpacing: 3 }}>{day.toUpperCase()}</Body>
            <Body size={22} color={DIM}>{label}</Body>
          </div>
        </div>
        {mark ? <img src={mark} width={52} height={52} style={{ marginBottom: 10 }} /> : null}
      </div>
      <div style={{ display: 'flex', width: SIZE.w - 96, height: 3, background: alpha(INK, 0.18), marginTop: 14 }} />
      <div style={{ display: 'flex', flexDirection: 'column', marginTop: 6 }}>
        {rows.map((r, i) => {
          const acc = SPORT_ACCENT[r.sport] || ORANGE
          return (
            <div key={`${r.sport}-${r.name}`} style={{ display: 'flex', alignItems: 'center', height: ROW_H, borderBottom: `2px solid ${alpha(INK, 0.1)}` }}>
              <Display size={60} color={acc} style={{ width: 66 }}>{String(i + 1)}</Display>
              <Face src={r.face} name={r.name} accent={acc} size={68} />
              <div style={{ display: 'flex', flexDirection: 'column', marginLeft: 20, width: 560 }}>
                <Display size={42} color={INK} skew={false}>{r.name.toUpperCase()}</Display>
                <Body size={22} color={DIM} style={{ marginTop: 4 }}>{r.why}</Body>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', marginLeft: 'auto' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ display: 'flex', padding: '2px 10px', background: alpha(acc, 0.16), border: `2px solid ${acc}` }}><Body size={22} weight={800} color={acc}>{BRAND[r.sport]?.name || r.sport}</Body></div>
                  <Body size={22} weight={800} color={INK}>{r.team}</Body>
                </div>
                <Body size={22} color={INK} style={{ marginTop: 6 }}>{`#${r.rank} of ${r.of} on our board`}</Body>
              </div>
            </div>
          )
        })}
      </div>
      <div style={{ display: 'flex', marginTop: 'auto', marginBottom: 18, justifyContent: 'space-between' }}>
        <Body size={22} color={DIM}>{`${STATUS_WORD.called} before each game. Graded after.`}</Body>
        <Body size={22} color={DIM}>DASH Network</Body>
      </div>
    </div>
  )
  return png(el)
}
