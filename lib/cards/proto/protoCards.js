// TRADING-CARD PROTOTYPES: THE DRAWING HALF (server only, prototype; nothing imports this from app/).
// next/og ImageResponse, the same renderer as the homer, goal and TD cards. Built FROM their pieces:
// lib/dash/homerCard.js (the three fonts: Inter, Big Shoulders Display; the DN mark; the grain; the
// cream INK / DIM / PANEL / RULE poster palette; the skewX(-8deg) display type), the product's accent
// from lib/sportAccent.js, the chassis greys from lib/design/tokens.js, STATUS_WORD from
// lib/callStatus.js, the words from lib/routes.js BRAND. Faces and logos arrive as data URIs from
// lib/cards/proto/protoData.js (a miss is a monogram / club code, never a blank).
//
// Two sizes: PORTRAIT 1080x1350 (the phone feed) and LANDSCAPE 1200x675 (X / Discord). Type floor:
// 22px on the 1080-wide card, 24px on the 1200-wide one (the same share of the width), enforced by
// fs() and re-checked by scripts/proto-cards/render.mjs. No link, no hashtag, no printed model number
// beyond the board's own 0-100 score (a rank, not a chance).
import { ImageResponse } from 'next/og'
import { loadFonts, loadDisplay, loadMark, loadGrain, DISPLAY, INK, DIM, PANEL, RULE } from '../../dash/homerCard'
import { SPORT_ACCENT } from '../../sportAccent'
import { CHASSIS } from '../../design/tokens'
import { STATUS_WORD } from '../../callStatus'
import { alpha } from '../kit'
import { ord } from './protoData'

export const SIZE = { p: { w: 1080, h: 1350 }, l: { w: 1200, h: 675 } }
const MIN = { p: 22, l: 24 }
const fs = (o, n) => Math.max(MIN[o], n)
const INK2 = CHASSIS.text2

let _assets = null
async function assets() {
  if (_assets) return _assets
  const [base, display, mark, grain] = await Promise.all([loadFonts(), loadDisplay(), loadMark(), loadGrain()])
  _assets = { fonts: [...base, ...display], mark, grain }
  return _assets
}

// ── small pieces ───────────────────────────────────────────────────────────
const field = (accent, tone) => [
  `radial-gradient(circle at 8% -8%, ${alpha(accent, 0.26)} 0%, ${alpha(accent, 0)} 46%)`,
  `radial-gradient(circle at 96% 108%, ${alpha(tone || accent, 0.2)} 0%, ${alpha(tone || accent, 0)} 50%)`,
  CHASSIS.bg,
].join(', ')

/** A name in the display face, shrunk until it fits maxW (Big Shoulders is ~0.44em a letter, upper case). */
const fitName = (name, size, maxW) => {
  const n = String(name || '').length || 1
  return Math.max(40, Math.min(size, Math.floor(maxW / (n * 0.46))))
}

const Bar = ({ pct, w, h = 12, color, accent }) => (
  <div style={{ display: 'flex', width: w, height: h, borderRadius: h / 2, background: alpha(INK, 0.1) }}>
    <div style={{ display: 'flex', width: `${Math.max(4, Math.min(100, pct))}%`, height: h, borderRadius: h / 2, background: color || accent }} />
  </div>
)

/** The product's own standout rule (CLAUDE.md, DenseTable skin v2): top ~20% glow in the accent, bottom ~20% recede. */
const heat = (pct, accent) => (pct == null ? { c: INK, hot: false } : pct >= 80 ? { c: accent, hot: true } : pct <= 20 ? { c: DIM, hot: false } : { c: INK, hot: false })

function Stat({ s, o, w, accent, big = 60 }) {
  const h = heat(s.pct, accent)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: w, padding: '12px 18px 14px 18px', borderRadius: 14, background: alpha(INK, 0.05), border: `2px solid ${h.hot ? alpha(accent, 0.75) : alpha(INK, 0.12)}` }}>
      <span style={{ fontSize: fs(o, 22), fontWeight: 800, color: DIM, letterSpacing: 0.4, whiteSpace: 'nowrap' }}>{s.label}</span>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 4 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontFamily: DISPLAY, fontSize: big, fontWeight: 900, lineHeight: 1, color: h.c }}>{s.value}</span>
          {s.unit ? <span style={{ fontSize: fs(o, 22), fontWeight: 800, color: DIM }}>{s.unit}</span> : null}
        </div>
        {s.pct != null ? <span style={{ fontSize: fs(o, 24), fontWeight: 800, color: h.c }}>{ord(s.pct)}</span> : null}
      </div>
      {s.pct != null ? (
        <div style={{ display: 'flex', marginTop: 10 }}><Bar pct={s.pct} w={w - 40} h={12} color={h.hot ? accent : alpha(INK, 0.55)} accent={accent} /></div>
      ) : s.sub ? (
        <span style={{ fontSize: fs(o, 22), fontWeight: 600, color: INK2, marginTop: 8, whiteSpace: 'nowrap' }}>{s.sub}</span>
      ) : <span style={{ display: 'flex', height: 0 }} />}
    </div>
  )
}

/** A round/square face: the photo, or a monogram on the club's tone / the accent when there is none. */
function Face({ m, w, h, accent, radius = 0 }) {
  if (m.face) return <img src={m.face} width={w} height={h} style={{ objectFit: 'cover', borderRadius: radius }} />
  const ini = String(m.name || '').split(/\s+/).filter(Boolean).map((x) => x[0]).slice(0, 2).join('').toUpperCase()
  return (
    <div style={{ display: 'flex', width: w, height: h, alignItems: 'center', justifyContent: 'center', borderRadius: radius || Math.min(w, h) / 2, background: alpha(m.tone || accent, 0.4) }}>
      <span style={{ fontFamily: DISPLAY, fontSize: Math.round(Math.min(w, h) * 0.42), fontWeight: 900, color: INK }}>{ini || '?'}</span>
    </div>
  )
}

/** The club logo (light plate when the product's marks need one); the club code in a chip when there is none. */
function Logo({ m, size, o, team = m.team, src = m.logo, plate = m.logoPlate }) {
  if (src && plate) return (
    <div style={{ display: 'flex', width: size, height: size, borderRadius: size / 2, background: alpha(INK, 0.94), alignItems: 'center', justifyContent: 'center' }}>
      <img src={src} width={Math.round(size * 0.72)} height={Math.round(size * 0.72)} />
    </div>
  )
  if (src) return <img src={src} width={size} height={size} />
  return (
    <div style={{ display: 'flex', width: size, height: size, borderRadius: 12, background: alpha(INK, 0.1), alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ fontSize: fs(o, Math.round(size * 0.34)), fontWeight: 800, color: INK }}>{String(team || '').slice(0, 3)}</span>
    </div>
  )
}

const matchup = (m) => `${m.team} ${m.home === true ? 'vs' : m.home === false ? '@' : 'vs'} ${m.opp}`
const posLine = (m) => [m.pos, m.bats ? `Bats ${m.bats}` : null, m.number != null ? `#${m.number}` : null].filter(Boolean).join('  ·  ')

/** The price, only when one is stored: '+110 best' (the Card's own words). null draws nothing, and nothing moves. */
const Price = ({ price, o, accent, size = 54 }) => {
  if (!price) return null
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
      <span style={{ fontFamily: DISPLAY, fontSize: size, fontWeight: 900, lineHeight: 1, color: accent, transform: 'skewX(-8deg)' }}>{price.best}</span>
      <span style={{ fontSize: fs(o, 24), fontWeight: 800, color: INK }}>{`best${price.books ? ` · ${price.books} book${price.books === 1 ? '' : 's'}` : ''}`}</span>
      {price.test ? <span style={{ fontSize: fs(o, 22), fontWeight: 800, color: DIM, border: `2px solid ${alpha(INK, 0.3)}`, borderRadius: 8, padding: '1px 8px' }}>TEST PRICE</span> : null}
    </div>
  )
}

const Foot = ({ m, o, right, h = 64 }) => (
  <div style={{ display: 'flex', flexDirection: 'column' }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: h, padding: '0 34px', borderTop: `2px solid ${RULE}` }}>
      <span style={{ fontSize: fs(o, 24), fontWeight: 800, color: INK2, letterSpacing: 1 }}>{`${m.brand.name} · DASH Network`}</span>
      <span style={{ fontSize: fs(o, 24), fontWeight: 600, color: DIM }}>{right}</span>
    </div>
  </div>
)

/** Every text node's effective font size (own, else the nearest ancestor's, else the 16px default) against the floor. Returns the offenders. */
export function lintType(node, o, inherited = 16, out = [], path = '') {
  if (node == null || typeof node === 'boolean') return out
  if (typeof node === 'string' || typeof node === 'number') {
    if (String(node).trim() && inherited < MIN[o]) out.push({ text: String(node).slice(0, 40), size: inherited, path })
    return out
  }
  if (Array.isArray(node)) { node.forEach((n) => lintType(n, o, inherited, out, path)); return out }
  const { type, props = {} } = node
  if (typeof type === 'function') return lintType(type(props), o, inherited, out, `${path}/${type.name}`)
  const size = props.style?.fontSize ?? inherited
  lintType(props.children, o, size, out, `${path}/${type}`)
  return out
}
export const LINT = []

async function render(el, o) {
  LINT.push(...lintType(el, o).map((x) => ({ ...x, o })))
  const { fonts } = await assets()
  const res = new ImageResponse(el, { width: SIZE[o].w, height: SIZE[o].h, fonts })
  return Buffer.from(await res.arrayBuffer())
}
const Root = ({ o, accent, tone, grain, children }) => (
  <div style={{ width: SIZE[o].w, height: SIZE[o].h, display: 'flex', flexDirection: 'column', position: 'relative', background: field(accent, tone), color: INK, fontFamily: 'Inter' }}>
    {grain ? <img src={grain} width={SIZE[o].w} height={SIZE[o].h} style={{ position: 'absolute', left: 0, top: 0, opacity: 0.9 }} /> : null}
    {children}
  </div>
)

const noteOf = (m) => ({ nhl: "bars: percentile among tonight's skaters", mlb: "bars: percentile on tonight's board", nfl: "bars: rank among this week's players" }[m.sport] || '')
const foil = (accent) => `linear-gradient(100deg, ${accent} 0%, ${alpha(INK, 0.95)} 22%, ${accent} 44%, ${alpha(INK, 0.7)} 66%, ${accent} 84%, ${alpha(INK, 0.9)} 100%)`

// ═══ DIRECTION A: the classic collectible ═════════════════════════════════
// A thick frame in the product's accent, a foil strip across the top (the CALLED rarity), the art window
// with the club's logo as a watermark and his face, the name plate, the stat strip, the call banner.
export async function playerCardA(m, o = 'p') {
  const { grain } = await assets()
  const accent = SPORT_ACCENT[m.sport]
  const called = m.status === 'called'
  const six = m.stats.length > 4
  const P = o === 'p'
  const stats = P ? m.stats.slice(0, 6) : m.stats.slice(0, 4)
  const W = SIZE[o].w, H = SIZE[o].h
  const inset = P ? 40 : 18, bw = P ? 14 : 10
  const innerW = W - 2 * inset - 2 * bw
  const foilEl = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: P ? 76 : 52, padding: '0 30px', background: called ? foil(accent) : alpha(INK, 0.1) }}>
      <span style={{ fontSize: fs(o, P ? 34 : 28), fontWeight: 800, letterSpacing: 8, color: called ? CHASSIS.bg : INK2 }}>{STATUS_WORD[m.status]}</span>
      <span style={{ fontSize: fs(o, P ? 30 : 26), fontWeight: 800, letterSpacing: 3, color: called ? CHASSIS.bg : INK2 }}>{posLine(m)}</span>
    </div>
  )
  const score = m.score != null ? (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'absolute', right: 26, top: 24, padding: '12px 20px 10px 20px', borderRadius: 8, background: alpha(CHASSIS.bg, 0.72), border: `2px solid ${alpha(accent, called ? 0.7 : 0.3)}` }}>
      <span style={{ fontSize: fs(o, 22), fontWeight: 800, letterSpacing: 3, color: INK }}>{m.scoreWord}</span>
      <span style={{ fontFamily: DISPLAY, fontSize: P ? 96 : 76, fontWeight: 900, lineHeight: 1, color: accent, transform: 'skewX(-8deg)' }}>{String(Math.round(m.score))}</span>
    </div>
  ) : null
  const rank = m.rankLine.length ? (
    <div style={{ display: 'flex', flexDirection: 'column', position: 'absolute', left: 26, top: 24, gap: 8 }}>
      {m.rankLine.slice(0, P ? 2 : 1).map((t) => (
        <span key={t} style={{ fontSize: fs(o, 24), fontWeight: 800, letterSpacing: 1.5, color: INK, background: alpha(CHASSIS.bg, 0.72), border: `2px solid ${alpha(INK, 0.2)}`, borderRadius: 8, padding: '5px 14px', alignSelf: 'flex-start' }}>{t}</span>
      ))}
    </div>
  ) : null
  const art = (aw, ah) => (
    <div style={{ display: 'flex', position: 'relative', width: aw, height: ah, overflow: 'hidden', background: `radial-gradient(circle at 50% 38%, ${alpha(m.tone || accent, 0.5)} 0%, ${alpha(accent, 0.1)} 62%, ${alpha(CHASSIS.bg, 0.4)} 100%)`, borderBottom: `3px solid ${alpha(accent, 0.6)}` }}>
      <div style={{ display: 'flex', position: 'absolute', right: -Math.round(ah * 0.12), top: -Math.round(ah * 0.06), opacity: 0.2 }}><Logo m={m} size={Math.round(ah * 1.1)} o={o} /></div>
      <div style={{ display: 'flex', position: 'absolute', left: Math.round((aw - ah) / 2), bottom: 0 }}><Face m={m} w={ah} h={ah} accent={accent} /></div>
      {rank}
      {score}
    </div>
  )
  const nameSize = fitName(m.name, P ? 108 : 92, innerW * (P ? 0.92 : 0.5) - 40)
  const plate = (
    <div style={{ display: 'flex', flexDirection: 'column', padding: P ? '16px 34px 12px 34px' : '10px 24px 8px 24px' }}>
      <span style={{ fontFamily: DISPLAY, fontSize: nameSize, fontWeight: 900, lineHeight: 1, textTransform: 'uppercase', transform: 'skewX(-8deg)', letterSpacing: -0.5, whiteSpace: 'nowrap' }}>{m.name}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: P ? 10 : 6 }}>
        <Logo m={m} size={P ? 52 : 40} o={o} />
        <span style={{ fontSize: fs(o, P ? 32 : 26), fontWeight: 800 }}>{matchup(m)}</span>
        <span style={{ fontSize: fs(o, P ? 28 : 24), fontWeight: 600, color: DIM }}>{m.club || ''}</span>
      </div>
    </div>
  )
  const tileW = P ? (six ? (innerW - 68 - 24) / 3 : (innerW - 68 - 36) / 4) : (innerW * 0.5 - 24 - 12) / 2
  const grid = (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: P ? 12 : 12, padding: P ? '0 34px' : '0' }}>
      {stats.map((s) => <Stat key={s.label} s={s} o={o} w={tileW} accent={accent} big={P ? (six ? 56 : 60) : 50} />)}
    </div>
  )
  const banner = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: P ? '0 34px' : '0 24px', padding: P ? '0 22px' : '0 16px', height: P ? 92 : 64, alignSelf: 'stretch', flexGrow: 1, maxHeight: P ? 92 : 64, borderRadius: 10, background: called ? `linear-gradient(90deg, ${alpha(accent, 0.28)} 0%, ${alpha(accent, 0.06)} 100%)` : alpha(INK, 0.06), border: `2px solid ${called ? alpha(accent, 0.65) : alpha(INK, 0.14)}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <span style={{ fontSize: fs(o, P ? 28 : 24), fontWeight: 800, letterSpacing: 3, color: called ? CHASSIS.bg : INK, background: called ? accent : 'transparent', border: called ? 'none' : `2px solid ${alpha(INK, 0.5)}`, borderRadius: 8, padding: '6px 16px' }}>{STATUS_WORD[m.status]}</span>
        <span style={{ fontSize: fs(o, P ? 30 : 26), fontWeight: 800, color: called ? accent : INK }}>{m.callLine}</span>
      </div>
      <Price price={m.price} o={o} accent={accent} size={P ? 56 : 44} />
    </div>
  )
  const headRow = P ? (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 34px 10px 34px' }}>
      <span style={{ fontSize: fs(o, 24), fontWeight: 800, letterSpacing: 3, color: INK2 }}>THE NUMBERS</span>
      <span style={{ fontSize: fs(o, 22), fontWeight: 600, color: DIM }}>{noteOf(m)}</span>
    </div>
  ) : null
  const dayWord = m.dayWord
  let body
  if (P) {
    const artH = six ? 420 : 560
    body = (
      <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
        {foilEl}
        {art(innerW, artH)}
        {plate}
        {headRow}
        {grid}
        <div style={{ display: 'flex', flexGrow: 1, alignItems: 'center', paddingTop: 14, paddingBottom: 14 }}>{banner}</div>
        <Foot m={m} o={o} right={dayWord} />
      </div>
    )
  } else {
    const aw = 440
    body = (
      <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
        {foilEl}
        <div style={{ display: 'flex', flexGrow: 1 }}>
          {art(aw, innerW > 0 ? SIZE.l.h - 2 * inset - 2 * bw - 52 - 62 : 400)}
          <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, width: innerW - aw, justifyContent: 'space-between' }}>
            {plate}
            <div style={{ display: 'flex', padding: '0 24px' }}>{grid}</div>
            <div style={{ display: 'flex', paddingBottom: 12 }}>{banner}</div>
          </div>
        </div>
        <Foot m={m} o={o} right={`${dayWord}  ·  ${noteOf(m)}`} h={50} />
      </div>
    )
  }
  const el = (
    <Root o={o} accent={accent} tone={m.tone} grain={grain}>
      <div style={{ display: 'flex', position: 'absolute', left: inset, top: inset, width: W - 2 * inset, height: H - 2 * inset, borderRadius: P ? 40 : 26, border: `${bw}px solid ${accent}`, background: `linear-gradient(180deg, ${PANEL} 0%, ${CHASSIS.bg} 100%)`, overflow: 'hidden' }}>
        <div style={{ display: 'flex', width: '100%', borderRadius: P ? 28 : 16, border: `3px solid ${alpha(INK, 0.16)}` }}>{body}</div>
      </div>
    </Root>
  )
  return render(el, o)
}

// ═══ DIRECTION B: the modern broadcast card ═══════════════════════════════
// Left stat column over the logo watermark, the face big on the right, a slanted lower-third name slab,
// the call strip underneath. Same data, same words; a different look to choose between.
export async function playerCardB(m, o = 'p') {
  const { grain } = await assets()
  const accent = SPORT_ACCENT[m.sport]
  const called = m.status === 'called'
  const P = o === 'p'
  const W = SIZE[o].w, H = SIZE[o].h
  const stats = m.stats.slice(0, 4)
  const colW = P ? 360 : 380
  const sh = P ? 150 : 116
  const nameSize = fitName(m.name, P ? 120 : 96, P ? W - 120 : W - colW - 120)
  const tag = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <span style={{ fontSize: fs(o, P ? 34 : 28), fontWeight: 800, letterSpacing: 7, color: called ? CHASSIS.bg : INK, background: called ? foil(accent) : alpha(INK, 0.12), padding: '8px 26px', transform: 'skewX(-8deg)' }}>{STATUS_WORD[m.status]}</span>
      <span style={{ fontSize: fs(o, P ? 30 : 26), fontWeight: 800, color: called ? accent : INK }}>{m.callLine}</span>
    </div>
  )
  const col = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, position: 'absolute', left: P ? 36 : 30, top: P ? 150 : 96, width: colW }}>
      {stats.map((s) => {
        const h = heat(s.pct, accent)
        return (
          <div key={s.label} style={{ display: 'flex', flexDirection: 'column', height: sh, padding: '10px 16px', background: alpha(CHASSIS.bg, 0.74), borderLeft: `8px solid ${h.hot ? accent : alpha(INK, 0.3)}` }}>
            <span style={{ fontSize: fs(o, 22), fontWeight: 800, color: DIM, letterSpacing: 0.4, whiteSpace: 'nowrap' }}>{s.label}</span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontFamily: DISPLAY, fontSize: P ? 70 : 54, fontWeight: 900, lineHeight: 1.05, color: h.c }}>{s.value}</span>
              {s.unit ? <span style={{ fontSize: fs(o, 22), fontWeight: 800, color: DIM }}>{s.unit}</span> : null}
            </div>
            {s.pct != null ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Bar pct={s.pct} w={colW - 32 - 16 - 80} h={12} color={h.hot ? accent : alpha(INK, 0.55)} accent={accent} />
                <span style={{ fontSize: fs(o, 24), fontWeight: 800, color: h.c }}>{ord(s.pct)}</span>
              </div>
            ) : <span style={{ fontSize: fs(o, 22), fontWeight: 600, color: INK2, whiteSpace: 'nowrap' }}>{s.sub || ''}</span>}
          </div>
        )
      })}
    </div>
  )
  const faceSize = P ? 760 : 600
  const slabTop = P ? 880 : 440
  const el = (
    <Root o={o} accent={accent} tone={m.tone} grain={grain}>
      <div style={{ display: 'flex', position: 'absolute', left: P ? -170 : -120, top: P ? 130 : 20, opacity: 0.12 }}><Logo m={m} size={P ? 900 : 640} o={o} /></div>
      <div style={{ display: 'flex', position: 'absolute', right: P ? -30 : 20, top: P ? 130 : 30 }}><Face m={m} w={faceSize} h={faceSize} accent={accent} /></div>
      <div style={{ display: 'flex', position: 'absolute', left: 0, top: 0, width: W, height: 8, background: foil(accent) }} />
      <div style={{ display: 'flex', position: 'absolute', left: P ? 36 : 30, top: P ? 40 : 24 }}>{tag}</div>
      <div style={{ display: 'flex', position: 'absolute', right: P ? 36 : 30, top: P ? 46 : 28 }}>
        <Price price={m.price} o={o} accent={accent} size={P ? 56 : 46} />
      </div>
      {col}
      {m.score != null ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', position: 'absolute', right: P ? 36 : 30, top: P ? 130 : 96 }}>
          <span style={{ fontSize: fs(o, 22), fontWeight: 800, letterSpacing: 3, color: INK }}>{m.scoreWord}</span>
          <span style={{ fontFamily: DISPLAY, fontSize: P ? 110 : 84, fontWeight: 900, lineHeight: 1, color: accent, transform: 'skewX(-8deg)' }}>{String(Math.round(m.score))}</span>
          {m.rankLine[0] ? <span style={{ fontSize: fs(o, 24), fontWeight: 800, color: INK }}>{m.rankLine[0]}</span> : null}
        </div>
      ) : null}
      <div style={{ display: 'flex', position: 'absolute', left: P ? -40 : -30, right: P ? 120 : 300, top: slabTop, height: P ? 170 : 96, background: `linear-gradient(90deg, ${accent} 0%, ${alpha(accent, 0.72)} 100%)`, transform: 'skewX(-8deg)', alignItems: 'center', paddingLeft: P ? 80 : colW - 20 }}>
        <span style={{ fontFamily: DISPLAY, fontSize: nameSize, fontWeight: 900, lineHeight: 1, color: CHASSIS.bg, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{m.name}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, position: 'absolute', left: P ? 36 : colW + 30, top: slabTop + (P ? 190 : 108) }}>
        <Logo m={m} size={P ? 60 : 44} o={o} />
        <span style={{ fontSize: fs(o, P ? 34 : 28), fontWeight: 800 }}>{matchup(m)}</span>
        <span style={{ fontSize: fs(o, P ? 30 : 26), fontWeight: 600, color: INK2 }}>{posLine(m)}</span>
      </div>
      {P ? (
        <div style={{ display: 'flex', position: 'absolute', left: 36, right: 36, top: 1180, justifyContent: 'space-between' }}>
          <span style={{ fontSize: fs(o, 24), fontWeight: 600, color: DIM }}>{noteOf(m)}</span>
          <span style={{ fontSize: fs(o, 24), fontWeight: 600, color: DIM }}>{m.dayWord}</span>
        </div>
      ) : null}
      <div style={{ display: 'flex', position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: P ? 70 : 46, padding: '0 36px', borderTop: `2px solid ${RULE}`, background: alpha(CHASSIS.bg, 0.8) }}>
          <span style={{ fontSize: fs(o, 24), fontWeight: 800, color: INK2, letterSpacing: 1 }}>{`${m.brand.name} · DASH Network`}</span>
          <span style={{ fontSize: fs(o, 24), fontWeight: 600, color: DIM }}>{P ? '' : `${m.dayWord}  ·  ${noteOf(m)}`}</span>
        </div>
        <div style={{ display: 'flex', height: 8, background: accent }} />
      </div>
    </Root>
  )
  return render(el, o)
}

// ═══ THE GAME CARD (NHL): the matchup and tonight's two calls ═══════════════
export async function gameCard(g, o = 'p') {
  const { grain } = await assets()
  const accent = SPORT_ACCENT[g.sport]
  const P = o === 'p'
  const W = SIZE[o].w
  const side = (m, big) => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: P ? 460 : 340 }}>
      <Logo m={m} size={big} o={o} />
      <span style={{ fontFamily: DISPLAY, fontSize: P ? 76 : 58, fontWeight: 900, lineHeight: 1, textTransform: 'uppercase', marginTop: 10, transform: 'skewX(-8deg)' }}>{m.nick}</span>
      <span style={{ fontSize: fs(o, 24), fontWeight: 600, color: DIM, marginTop: 4 }}>{m.sub}</span>
    </div>
  )
  const call = (m) => {
    const sel = m.stats.slice(0, 3)
    return (
      <div style={{ display: 'flex', flexDirection: 'column', width: P ? 560 : 540, borderRadius: 16, border: `2px solid ${alpha(accent, 0.6)}`, background: alpha(INK, 0.045), overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 18px', background: foil(accent) }}>
          <span style={{ fontSize: fs(o, 24), fontWeight: 800, letterSpacing: 6, color: CHASSIS.bg }}>{STATUS_WORD[m.status]}</span>
          <span style={{ fontSize: fs(o, 24), fontWeight: 800, letterSpacing: 2, color: CHASSIS.bg }}>{m.role === 'TOP' ? 'TOP' : 'GOAL'}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 18px 4px 18px' }}>
          <Face m={m} w={P ? 112 : 118} h={P ? 112 : 118} accent={accent} radius={P ? 56 : 59} />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontFamily: DISPLAY, fontSize: fitName(m.name, P ? 60 : 52, P ? 300 : 330), fontWeight: 900, lineHeight: 1, textTransform: 'uppercase', transform: 'skewX(-8deg)', whiteSpace: 'nowrap' }}>{m.name}</span>
            <span style={{ fontSize: fs(o, 26), fontWeight: 700, color: INK2, marginTop: 6 }}>{posLine(m)}</span>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '8px 18px 16px 18px' }}>
          {sel.map((s) => {
            const h = heat(s.pct, accent)
            return (
              <div key={s.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: fs(o, 22), fontWeight: 800, color: DIM, width: P ? 170 : 170 }}>{s.label}</span>
                <span style={{ fontFamily: DISPLAY, fontSize: 40, fontWeight: 900, color: h.c, width: 100, display: 'flex' }}>{s.value}</span>
                <Bar pct={s.pct ?? 0} w={P ? 130 : 130} h={10} color={h.hot ? accent : alpha(INK, 0.55)} accent={accent} />
                <span style={{ fontSize: fs(o, 24), fontWeight: 800, color: h.c, width: 70, display: 'flex', justifyContent: 'flex-end' }}>{s.pct != null ? ord(s.pct) : ''}</span>
              </div>
            )
          })}
        </div>
      </div>
    )
  }
  const el = (
    <Root o={o} accent={accent} grain={grain}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: P ? 96 : 64, padding: '0 36px', borderBottom: `2px solid ${RULE}` }}>
        <span style={{ fontSize: fs(o, P ? 34 : 28), fontWeight: 800, letterSpacing: 5, color: accent }}>{`${g.brand.name} · TONIGHT'S GAME`}</span>
        <span style={{ fontSize: fs(o, P ? 30 : 26), fontWeight: 700, color: INK2 }}>{`${g.dayWord}  ·  ${g.when}`}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around', padding: P ? '24px 20px 14px 20px' : '14px 20px 10px 20px' }}>
        {side(g.away, P ? 170 : 150)}
        <span style={{ fontFamily: DISPLAY, fontSize: P ? 90 : 64, fontWeight: 900, color: DIM }}>@</span>
        {side(g.home, P ? 170 : 150)}
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', padding: P ? '6px 0 14px 0' : '0 0 8px 0' }}>
        <span style={{ fontSize: fs(o, P ? 30 : 26), fontWeight: 800, letterSpacing: 5, color: INK2 }}>TONIGHT'S TWO CALLS</span>
      </div>
      <div style={{ display: 'flex', flexDirection: P ? 'column' : 'row', alignItems: 'center', justifyContent: 'center', gap: P ? 14 : 24 }}>
        {g.calls.map((m) => <div key={m.playerId} style={{ display: 'flex' }}>{call(m)}</div>)}
      </div>
      <div style={{ display: 'flex', position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: P ? 70 : 46, padding: '0 36px', borderTop: `2px solid ${RULE}` }}>
          <span style={{ fontSize: fs(o, 24), fontWeight: 800, color: INK2, letterSpacing: 1 }}>{`${g.brand.name} · DASH Network`}</span>
          <span style={{ fontSize: fs(o, 24), fontWeight: 600, color: DIM }}>{noteOf(g.calls[0])}</span>
        </div>
        <div style={{ display: 'flex', height: 8, background: accent, width: W }} />
      </div>
    </Root>
  )
  return render(el, o)
}

// ═══ THE CARD: the day's lineup card (three straights + the Two-Man) ═══════
// Four slots. An empty slot says so in words (the Card never pads); a Two-Man that does not exist says why not.
export async function dayCard(d, o = 'p') {
  const { grain } = await assets()
  const accent = SPORT_ACCENT[d.sport]
  const P = o === 'p'
  const W = SIZE[o].w
  const slots = [0, 1, 2].map((i) => d.straights[i] || null)

  const Mini = ({ m, size, nameMax, nameBase }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <div style={{ display: 'flex', position: 'relative', width: size, height: size, borderRadius: size / 2, overflow: 'hidden', background: alpha(m.tone || accent, 0.3), border: `3px solid ${alpha(accent, 0.7)}` }}>
        <div style={{ display: 'flex', position: 'absolute', left: 0, bottom: 0 }}><Face m={m} w={size} h={size} accent={accent} /></div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <span style={{ fontFamily: DISPLAY, fontSize: fitName(m.name, nameBase, nameMax), fontWeight: 900, lineHeight: 1, textTransform: 'uppercase', transform: 'skewX(-8deg)', whiteSpace: 'nowrap' }}>{m.name}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
          <Logo m={m} size={P ? 36 : 30} o={o} />
          <span style={{ fontSize: fs(o, P ? 28 : 24), fontWeight: 800 }}>{matchup(m)}</span>
          <span style={{ fontSize: fs(o, P ? 26 : 24), fontWeight: 700, color: m.status === 'called' ? accent : INK2 }}>{STATUS_WORD[m.status]}</span>
        </div>
      </div>
    </div>
  )
  const slotHead = (label, stake) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: fs(o, P ? 26 : 24), fontWeight: 800, letterSpacing: 4, color: accent }}>{label}</span>
      <span style={{ fontSize: fs(o, P ? 24 : 24), fontWeight: 700, color: DIM }}>{stake}</span>
    </div>
  )
  const whyLine = (t) => (t ? <span style={{ fontSize: fs(o, P ? 24 : 24), fontWeight: 600, color: INK2, whiteSpace: 'nowrap' }}>{t}</span> : null)
  const frameStyle = { display: 'flex', flexDirection: 'column', gap: 10, padding: P ? '14px 24px' : '12px 18px', borderRadius: 14, border: `2px solid ${alpha(accent, 0.45)}`, background: alpha(INK, 0.045) }
  const empty = (label, why) => (
    <div style={{ ...frameStyle, borderStyle: 'dashed', border: `2px dashed ${alpha(INK, 0.22)}`, background: 'transparent', justifyContent: 'center' }}>
      {slotHead(label, '')}
      <span style={{ fontSize: fs(o, P ? 28 : 24), fontWeight: 700, color: DIM }}>{why}</span>
    </div>
  )
  const rowH = P ? 224 : 0
  const straightEl = (s, i) => {
    const label = `STRAIGHT ${i + 1}`
    if (!s) return <div key={label} style={{ display: 'flex', flexDirection: 'column', ...(P ? { height: rowH } : {}), justifyContent: 'center' }}>{empty(label, 'No further call in a different game')}</div>
    return (
      <div key={label} style={{ ...frameStyle, ...(P ? { height: rowH } : {}), justifyContent: 'center' }}>
        {slotHead(label, `${s.stake} unit`)}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Mini m={s.m} size={P ? 104 : 88} nameMax={P ? 380 : 200} nameBase={P ? 62 : 44} />
          <Price price={s.price} o={o} accent={accent} size={P ? 52 : 40} />
        </div>
        {P ? whyLine(s.m.why || s.why) : null}
      </div>
    )
  }
  const twoEl = d.two ? (
    <div style={{ ...frameStyle, ...(P ? { height: 300 } : {}), justifyContent: 'center', border: `2px solid ${alpha(accent, 0.8)}`, background: `linear-gradient(90deg, ${alpha(accent, 0.18)} 0%, ${alpha(accent, 0.04)} 100%)` }}>
      {slotHead('TWO-MAN', `${d.two.stake} unit · different games`)}
      {d.two.legs.map((l) => (
        <div key={l.m.playerId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Mini m={l.m} size={P ? 84 : 76} nameMax={P ? 380 : 200} nameBase={P ? 52 : 38} />
          <Price price={l.price} o={o} accent={accent} size={P ? 44 : 36} />
        </div>
      ))}
    </div>
  ) : empty('TWO-MAN', 'No pair from two different games')

  const head = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: P ? 120 : 64, padding: '0 36px', borderBottom: `2px solid ${RULE}`, background: foil(accent) }}>
      <span style={{ fontFamily: DISPLAY, fontSize: P ? 72 : 46, fontWeight: 900, color: CHASSIS.bg, textTransform: 'uppercase', transform: 'skewX(-8deg)' }}>{`THE CARD · ${d.league}`}</span>
      <span style={{ fontSize: fs(o, P ? 34 : 28), fontWeight: 800, color: CHASSIS.bg }}>{d.dayWord}</span>
    </div>
  )
  const foot = (
    <div style={{ display: 'flex', position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: P ? 70 : 46, padding: '0 36px', borderTop: `2px solid ${RULE}` }}>
        <span style={{ fontSize: fs(o, 24), fontWeight: 800, color: INK2, letterSpacing: 1 }}>{`${d.brandName} · DASH Network`}</span>
        <span style={{ fontSize: fs(o, 24), fontWeight: 600, color: DIM }}>{`one ${d.market} market · graded in public`}</span>
      </div>
      <div style={{ display: 'flex', height: 8, background: accent, width: W }} />
    </div>
  )
  const el = P ? (
    <Root o={o} accent={accent} grain={grain}>
      {head}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '22px 36px 0 36px' }}>
        {slots.map((s, i) => straightEl(s, i))}
        {twoEl}
      </div>
      {foot}
    </Root>
  ) : (
    <Root o={o} accent={accent} grain={grain}>
      {head}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '14px 24px 0 24px' }}>
        <div style={{ display: 'flex', gap: 10 }}>
          {slots.map((s, i) => <div key={i} style={{ display: 'flex', flexDirection: 'column', width: (W - 48 - 20) / 3 }}>{straightEl(s, i)}</div>)}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>{twoEl}</div>
      </div>
      {foot}
    </Root>
  )
  return render(el, o)
}
