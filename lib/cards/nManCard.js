// HIS N-MAN CARD (server only, JSX): the admin's 3-to-6-man ticket in the approved baseball-card look, 1080 x 1350. A foil frame, the title (ADMIN'S 6-MAN, or the name he
// gave the card), a grid of the N players (2 columns x up to 3 rows: silo headshot, name, club logo + role, the market line, the price pill), the COMBINED price big on its
// plate ("best prices, multiplied"; "NOT ALL PRICED" when a leg has no stored price: never a shorter ticket's price), the serial and the date, and the footer.
// GRADED (`d.graded`): the same card with each leg's mark (a filled box with a check = CASHED, a hollow box with a cross = MISSED, a dash = DID NOT PLAY) and the ticket's
// own word (CASHED / MISSED / VOID) on the plate, in the slab's pattern (lib/cards/slabCard.js): a win and a miss are the same size, weight and layout; only the mark differs.
// EVERY box of text is measured with the real fonts (lib/cards/fit.js: step down through fixed sizes, wrap to two lines, then an ellipsis; never below the 22px floor) and
// every box has a FIXED size, so nothing overlaps its neighbour and the footer is never pushed. scripts/check-nman-card.mjs renders 2..6 legs with long names and prices and
// asserts it. Data: lib/cards/nManData.js. No link, no probability, status words only from lib/callStatus.
import { Frame, assets, renderPng, sizeOf, fs, alpha, field, foil, Face, Logo, matchup, DISPLAY, INK, INK2, DIM, RULE, CHASSIS } from './cardKit'
import { initMetrics, textWidth, fitLine, fitBlock, ellipsize } from './fit'
import { SPORT_ACCENT } from '../sportAccent'
import { outcomeWord } from './outcome'
import { SharedStamp, SHARED_H } from './stampStrip'
import { sharedStampOfCard } from './situationData'

const D = { family: DISPLAY, weight: 900, upper: true }       // the display face, as fit.js names it
const B = { family: 'Inter', weight: 800 }
const LINE_H = 1.04

// ── THE LAYOUT (px at the 1080 x 1350 design). One place, so the fixed boxes add up to the frame. ──
const FRAME_W = 1028
const FRAME_H = 1298
const HEADER_H = 84
const TITLE_H = 100                        // the title's fixed box (two lines of the smallest two-line size, or one of the largest)
const TITLE_BLOCK = TITLE_H + 24 + 4       // + the plate's padding and border
const GRID_H = 824                         // the grid's fixed box; the tiles centre inside it
const COMBO_H = 170
const FOOT_H = 64
const GAP = 14
const SIDE = 28
const TILE_W = (FRAME_W - 2 * SIDE - 16) / 2           // 478
const PAD = 12
const FACE_W = 150
const COL_W = TILE_W - 2 * PAD - FACE_W - 14           // the right column of a tile: 290
const NAME_STEPS = { 3: [40, 36, 32, 28, 26, 24, 22], 2: [52, 46, 42, 38, 34, 30, 26, 24, 22] }
const NAME_BOX = { 3: 88, 2: 116 }
const TITLE_STEPS_1 = [84, 72, 62, 54, 46]
const TITLE_STEPS_2 = [44, 40, 38, 34, 30, 26, 22]
const SERIAL_W = 280
export const NMAN_LAYOUT = Object.freeze({ FRAME_W, FRAME_H, HEADER_H, TITLE_H, GRID_H, COMBO_H, FOOT_H, GAP, SIDE, TILE_W, PAD, FACE_W, COL_W, NAME_BOX, SERIAL_W, MIN: 22 })

/** How the grid is cut: 2 columns, rows = ceil(n / 2), and the tile height for that many rows (a tile is as tall as the grid allows, never taller than 396). */
export function gridOf(n, trim = 0) {
  const rows = Math.max(1, Math.min(3, Math.ceil(n / 2)))
  const tileH = Math.min(396, Math.floor((GRID_H - trim - (rows - 1) * GAP) / rows))
  return { rows, tileH, tier: rows >= 3 ? 3 : 2 }
}

/** The title: the largest fixed step that fits one line, else two lines at the largest step that fits both, else the floor with an ellipsis. */
export function fitTitle(label, maxW) {
  const one = fitLine(label, { ...D, sizes: TITLE_STEPS_1, maxW, id: 'nman title' })
  if (one.fits) return { size: one.size, lines: [String(label).toUpperCase()] }
  const two = fitBlock(label, { ...D, sizes: TITLE_STEPS_2, maxW, maxLines: 2, id: 'nman title 2' })
  return { size: two.size, lines: two.lines.map((l) => String(l).toUpperCase()), cut: !two.fits }
}

/** A leg's name: up to two lines in the display face, stepped down through the tile's sizes; the last resort is the floor with an ellipsis. */
export function fitLegName(name, tier) {
  const r = fitBlock(name, { ...D, sizes: NAME_STEPS[tier], maxW: COL_W, maxLines: 2, id: 'nman name' })
  return { size: r.size, lines: r.lines.map((l) => String(l).toUpperCase()), cut: !r.fits }
}

/**
 * The price pill's words for a leg's { best, books }, the longest form that fits `maxW`: "+160 best · 6 books", then "+160 best · 6 bk", then "+160 best".
 * Returns { price, rest, sizes: [priceSize, restSize], w } or null when the leg has no stored price (the pill then says "no price").
 */
export function pillOf(price, maxW = COL_W) {
  if (!price || !price.best || !(price.books >= 1)) return null
  const n = price.books
  const forms = [` best · ${n} book${n === 1 ? '' : 's'}`, ` best · ${n} bk`, ' best']
  const chrome = 2 * 14 + 4 + 8                           // the pill's padding, border and the gap between its two spans
  for (const form of forms) {
    for (const [a, b] of [[28, 24], [26, 22]]) {
      const w = textWidth(price.best, { family: 'Inter', weight: 900, size: a }) + textWidth(form, { family: 'Inter', weight: 700, size: b }) + chrome
      if (w <= maxW) return { price: price.best, rest: form.trim(), sizes: [a, b], w }
    }
  }
  const w = textWidth(price.best, { family: 'Inter', weight: 900, size: 26 }) + chrome
  return { price: price.best, rest: '', sizes: [26, 22], w }
}

/** A body-face line stepped down through `sizes`; at the smallest it is cut with an ellipsis. { size, text } */
export function fit1(text, sizes, maxW, weight = 800) {
  const f = fitLine(text, { family: 'Inter', weight, sizes, maxW, id: 'nman line' })
  return { size: f.size, text: f.fits ? String(text) : ellipsize(String(text), { family: 'Inter', weight, size: f.size, maxW }) }
}
/** One line cut with an ellipsis to the width, in the body face. */
const line1 = (text, size, maxW, weight = 800) => ellipsize(String(text ?? ''), { family: 'Inter', weight, size, maxW })

const Mark = ({ outcome, accent, color, size = 26 }) => {
  const s = size
  if (outcome === 'cashed') return (
    <div style={{ display: 'flex', width: s, height: s, borderRadius: 5, background: accent, alignItems: 'center', justifyContent: 'center' }}>
      <svg width={s - 8} height={s - 8} viewBox="0 0 20 20"><path d="M3 10.5 L8 15.5 L17 5" fill="none" stroke={CHASSIS.bg} strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </div>
  )
  if (outcome === 'missed') return (
    <div style={{ display: 'flex', width: s, height: s, borderRadius: 5, border: `3px solid ${color}`, alignItems: 'center', justifyContent: 'center' }}>
      <svg width={s - 12} height={s - 12} viewBox="0 0 20 20"><path d="M4 4 L16 16 M16 4 L4 16" fill="none" stroke={color} strokeWidth="3.4" strokeLinecap="round" /></svg>
    </div>
  )
  return <div style={{ display: 'flex', width: s, height: 6, background: color }} />
}

function Lines({ lines, size, h, align = 'flex-start' }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: align, height: h, overflow: 'hidden' }}>
      {lines.map((l, k) => (
        <span key={k} style={{ display: 'flex', fontFamily: DISPLAY, fontSize: size, fontWeight: 900, lineHeight: LINE_H, textTransform: 'uppercase', transform: 'skewX(-8deg)', whiteSpace: 'nowrap' }}>{l}</span>
      ))}
    </div>
  )
}

function Tile({ leg, g, accent, graded }) {
  const m = leg.m
  const name = fitLegName(m.name, g.tier)
  const posNum = [m.pos, m.number != null ? `#${m.number}` : null].filter(Boolean).join(' · ')
  const posW = posNum ? textWidth(posNum, { ...B, weight: 600, size: 22 }) + 4 : 0
  const logoW = m.logo ? 28 + 8 : 0
  const matchW = COL_W - logoW - (posW ? posW + 8 : 0)
  const match = line1(matchup(m), 24, matchW, 800)
  const mk = line1(leg.market || '', 22, COL_W, 600)
  const pill = pillOf(leg.price)
  const out = graded ? leg.outcome : null
  return (
    <div style={{ display: 'flex', width: TILE_W, height: g.tileH, borderRadius: 14, border: `3px solid ${alpha(accent, 0.7)}`, overflow: 'hidden', position: 'relative', background: `radial-gradient(circle at 25% 40%, ${alpha(m.tone || accent, 0.42)} 0%, ${alpha(accent, 0.07)} 62%, ${alpha(CHASSIS.bg, 0.4)} 100%)` }}>
      <div style={{ display: 'flex', position: 'absolute', left: 0, bottom: 0, width: FACE_W + PAD, height: g.tileH - 6 }}>
        {m.logo ? <div style={{ display: 'flex', position: 'absolute', left: -50, top: 10, opacity: 0.14 }}><Logo m={m} size={260} /></div> : null}
        <div style={{ display: 'flex', position: 'absolute', left: PAD, bottom: 0 }}><Face m={m} w={FACE_W} h={Math.min(g.tileH - 6, 372)} accent={accent} /></div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 6, position: 'absolute', left: PAD + FACE_W + 14, top: 0, width: COL_W, height: g.tileH - 6 }}>
        <Lines lines={name.lines} size={name.size} h={NAME_BOX[g.tier]} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 32, width: COL_W, overflow: 'hidden' }}>
          {m.logo ? <Logo m={m} size={28} /> : null}
          <span style={{ display: 'flex', fontSize: fs(24), fontWeight: 800, whiteSpace: 'nowrap' }}>{match}</span>
          {posNum ? <span style={{ display: 'flex', fontSize: fs(22), fontWeight: 600, color: DIM, whiteSpace: 'nowrap' }}>{posNum}</span> : null}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', height: 28, width: COL_W, overflow: 'hidden' }}>
          <span style={{ display: 'flex', fontSize: fs(22), fontWeight: 600, color: INK2, whiteSpace: 'nowrap' }}>{mk}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', height: 46, width: COL_W }}>
          {out ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, border: `2px solid ${alpha(INK, 0.3)}`, background: alpha(CHASSIS.bg, 0.7), padding: '4px 14px', borderRadius: 10 }}>
              <Mark outcome={out} accent={accent} color={INK2} />
              <span style={{ fontSize: fs(24), fontWeight: 800, letterSpacing: 2, color: INK, whiteSpace: 'nowrap' }}>{outcomeWord(out)}</span>
            </div>
          ) : pill ? (
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, border: `2px solid ${alpha(accent, 0.6)}`, borderRadius: 10, padding: '4px 14px', background: alpha(accent, 0.1) }}>
              <span style={{ fontSize: fs(pill.sizes[0]), fontWeight: 900, color: accent, whiteSpace: 'nowrap' }}>{pill.price}</span>
              {pill.rest ? <span style={{ fontSize: fs(pill.sizes[1]), fontWeight: 700, color: INK2, whiteSpace: 'nowrap' }}>{pill.rest}</span> : null}
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', border: `2px solid ${alpha(INK, 0.22)}`, borderRadius: 10, padding: '4px 14px' }}>
              <span style={{ fontSize: fs(22), fontWeight: 700, color: DIM, whiteSpace: 'nowrap' }}>no price</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function nManDesign(d, grain, mark) {
  const accent = SPORT_ACCENT[d.sport]
  const n = d.legs.length
  const shared = d.shared ? String(d.shared) : ''
  const g = gridOf(n, shared ? SHARED_H : 0)   // the shared stamp line takes its room from the grid box (the tiles keep their content)
  const title = fitTitle(d.label, d.serial ? 912 - SERIAL_W : 912)
  const cells = []
  for (let i = 0; i < n; i += 2) cells.push(d.legs.slice(i, i + 2))
  const graded = d.graded
  const comboText = d.combined.text
  const big = comboText ? fitLine(comboText, { family: DISPLAY, weight: 900, sizes: [112, 100, 88, 76, 64], maxW: 470, id: 'nman combined' }) : null
  const partial = !d.combined.all
  // the plate's two lines at the left, each measured to its 400px box
  const l1 = fit1(graded ? `${graded.landed} of ${graded.of} legs landed` : d.rule, graded ? [24, 22] : [28, 26, 24, 22], 400, 800)
  const l2 = fit1(graded ? d.rule : partial ? `${d.combined.priced} of ${d.combined.n} legs have a stored price` : 'best prices, multiplied', [24, 22], 400, 600)
  return (
    <Frame accent={accent} tone={null} grain={grain}>
      <div style={{ display: 'flex', position: 'absolute', left: 20, top: 20, width: FRAME_W + 12, height: FRAME_H + 12, borderRadius: 27, background: foil(accent) }} />
      <div style={{ display: 'flex', position: 'absolute', left: 26, top: 26, width: FRAME_W, height: FRAME_H, flexDirection: 'column', overflow: 'hidden', borderRadius: 22, background: field(accent, null) }}>
        {grain ? <img src={grain} width={FRAME_W} height={FRAME_H} style={{ position: 'absolute', left: 0, top: 0, opacity: 0.9 }} /> : null}
        <div style={{ display: 'flex', alignItems: 'center', height: HEADER_H, padding: '0 34px', gap: 22 }}>
          <span style={{ fontSize: fs(30), fontWeight: 800, letterSpacing: 6, color: INK2, whiteSpace: 'nowrap' }}>{`${d.brandName} · THE CARD`}</span>
          <div style={{ display: 'flex', flexGrow: 1, height: 2, background: alpha(accent, 0.5) }} />
          <span style={{ fontSize: fs(30), fontWeight: 800, color: INK2, whiteSpace: 'nowrap' }}>{d.dayWord}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', margin: `0 ${SIDE}px`, padding: '12px 28px', height: TITLE_BLOCK + (shared ? SHARED_H : 0), borderRadius: 14, border: `2px solid ${alpha(accent, 0.75)}`, background: `linear-gradient(90deg, ${alpha(accent, 0.2)} 0%, ${alpha(accent, 0.04)} 100%)` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: TITLE_H }}>
            <Lines lines={title.lines} size={title.size} h={TITLE_H} />
            {d.serial ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0 }}>
                <span style={{ fontSize: fs(22), fontWeight: 800, letterSpacing: 3, color: DIM, whiteSpace: 'nowrap' }}>{d.serial.caption}</span>
                <span style={{ fontFamily: DISPLAY, fontSize: 46, fontWeight: 900, lineHeight: 1, color: accent, whiteSpace: 'nowrap' }}>{`${d.serial.n} of ${d.serial.of}`}</span>
              </div>
            ) : null}
          </div>
          {shared ? <SharedStamp text={shared} accent={accent} maxW={FRAME_W - 2 * SIDE - 56 - 4} /> : null}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: GAP, height: GRID_H - (shared ? SHARED_H : 0), margin: `${GAP}px ${SIDE}px 0 ${SIDE}px` }}>
          {cells.map((row, r) => (
            <div key={r} style={{ display: 'flex', gap: 16, height: g.tileH }}>
              {row.map((leg, k) => <Tile key={`${leg.m.playerId}-${k}`} leg={leg} g={g} accent={accent} graded={Boolean(graded)} />)}
              {row.length === 1 ? <div style={{ display: 'flex', width: TILE_W }} /> : null}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: `${GAP}px ${SIDE}px 0 ${SIDE}px`, padding: '0 28px', height: COMBO_H, borderRadius: 14, border: `2px solid ${alpha(accent, 0.75)}`, background: `linear-gradient(90deg, ${alpha(accent, 0.2)} 0%, ${alpha(accent, 0.04)} 100%)` }}>
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 4, width: 400 }}>
            {graded ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Mark outcome={graded.result === 'void' ? 'dnp' : graded.result} accent={accent} color={INK} size={34} />
                <span style={{ fontFamily: DISPLAY, fontSize: 76, fontWeight: 900, lineHeight: 1, color: INK, whiteSpace: 'nowrap' }}>{outcomeWord(graded.result)}</span>
              </div>
            ) : null}
            <span style={{ fontSize: fs(l1.size), fontWeight: 800, color: INK2, whiteSpace: 'nowrap' }}>{l1.text}</span>
            <span style={{ fontSize: fs(l2.size), fontWeight: 600, color: DIM, whiteSpace: 'nowrap' }}>{l2.text}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center', width: 500, height: COMBO_H - 24 }}>
            {comboText && !partial ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                <span style={{ fontSize: fs(22), fontWeight: 800, letterSpacing: 3, color: DIM, whiteSpace: 'nowrap' }}>{graded ? 'BEST PRICES, MULTIPLIED' : 'COMBINED PRICE'}</span>
                <span style={{ fontFamily: DISPLAY, fontSize: big.size, fontWeight: 900, lineHeight: 1, color: accent, whiteSpace: 'nowrap', transform: 'skewX(-8deg)' }}>{comboText}</span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                <span style={{ fontSize: fs(22), fontWeight: 800, letterSpacing: 3, color: DIM, whiteSpace: 'nowrap' }}>COMBINED PRICE</span>
                <span style={{ fontFamily: DISPLAY, fontSize: 56, fontWeight: 900, lineHeight: 1.05, color: INK2, whiteSpace: 'nowrap', transform: 'skewX(-8deg)' }}>NOT ALL PRICED</span>
              </div>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'space-between', height: FOOT_H, padding: '0 34px', borderTop: `2px solid ${RULE}`, gap: 20 }}>
          <span style={{ fontSize: fs(24), fontWeight: 800, color: INK2, letterSpacing: 2, whiteSpace: 'nowrap' }}>{`${d.brandName} · DASH Network`}</span>
          <span style={{ fontSize: fs(24), fontWeight: 600, color: DIM, whiteSpace: 'nowrap' }}>{`one ${d.market} market · graded in public`}</span>
        </div>
      </div>
    </Frame>
  )
}

/** PNG bytes of the N-man card at `width` px (4:5). */
export async function renderNMan(d, { width } = {}) {
  const { fonts, grain, mark } = await assets()
  initMetrics(fonts)
  if (d.shared === undefined) d = { ...d, shared: await sharedStampOfCard(d) }   // ONE shared stamp line: a fact true for every leg (shared opponent or same round), else none
  const size = sizeOf(width)
  return renderPng(nManDesign(d, grain, mark), size, { card: 'nman', design: nManDesign(d, null, mark) })
}
