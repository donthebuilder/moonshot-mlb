// THE TWO-MAN DUAL CARD (server only, JSX): the dual-signature collectible, for the Card's Two-Man (the bot's, and the admin's hand-picked lane
// with the same layout and its own label). Two portraits on a slight diagonal, a name plate, the matchup and the leg's stored price under each, the DASH mark
// between them, each leg's one strongest stat strip (the stored words the Card prints), the card's title (ADMIN'S TWO-MAN, or the name he gave it), the stored
// combined price (only when BOTH legs have one), the date and the card's REAL sequence number in its lane's record. Every slot with nothing real behind it
// is left off, never filled.
// Data: lib/cards/dualData.js (stored card_calls rows). No link, no probability, status words only from lib/callStatus STATUS_WORD.
import { Frame, assets, renderPng, sizeOf, fs, alpha, Face, Logo, matchup, DISPLAY, INK, INK2, DIM, RULE, CHASSIS } from './cardKit'
import { SPORT_ACCENT } from '../sportAccent'
import { STATUS_WORD } from '../callStatus'

const WIN_W = 470
const WIN_H = 560
const SHIFT = 44          // the second portrait sits lower: the diagonal

// ── THE TYPE SCALE (2026-10-12, "clean it up, you see how bad the card is text sizing wise"). One scale, every size >= the 22px floor (cardKit MIN_TYPE):
//    title 84..46 (fixed steps, then two lines) / name 64..40 (fixed steps, then two lines) / matchup 26 / price pill 28 + 24 / stat strip 24 / footer 24.
//    Every box that holds text has a FIXED height, so the baselines of the two legs line up whatever the names are; nothing overlaps its neighbour.
const EM = 0.48                                   // a letter of the display face, upper case, in ems: a little wider than measured, so a fit is a fit
const NAME_STEPS = [64, 56, 50, 44]
const NAME_STEPS_2 = [48, 44, 40]
const TITLE_STEPS = [84, 72, 62, 54, 46]
const TITLE_STEPS_2 = [44, 40, 38]
export const widthOf = (text, size) => Math.ceil(String(text).length * EM * size) + Math.round(size * 0.12)   // + the skew's lean

/** Split on the space (or after a hyphen) that balances the two halves. null when there is nothing to split at. */
function splitBalanced(text) {
  const t = String(text)
  const cuts = []
  for (let k = 1; k < t.length - 1; k += 1) {
    if (t[k] === ' ') cuts.push([k, 0])
    else if (t[k] === '-' && t[k + 1] !== ' ') cuts.push([k + 1, 1])
  }
  if (!cuts.length) return null
  const mid = t.length / 2
  cuts.sort((x, y) => (Math.abs(x[0] - mid) - Math.abs(y[0] - mid)) || (x[1] - y[1]))
  const k = cuts[0][0]
  return [t.slice(0, k).trim(), t.slice(k).trim()]
}
/**
 * FIT A DISPLAY LINE: the largest fixed step that fits on one line; else two lines (split where it balances) at the largest step that fits both; else the
 * smallest step with a line cut short by an ellipsis (never clipped mid-letter, never below the last step). Pure.
 * @returns {{ lines: string[], size: number }}
 */
export function fitDisplay(text, maxW, steps, steps2) {
  const t = String(text || '').replace(/\s+/g, ' ').trim().toUpperCase()
  for (const size of steps) if (widthOf(t, size) <= maxW) return { lines: [t], size }
  const two = splitBalanced(t)
  if (two) for (const size of steps2) if (two.every((l) => widthOf(l, size) <= maxW)) return { lines: two, size }
  const size = steps2[steps2.length - 1]
  const cut = (l) => (widthOf(l, size) <= maxW ? l : `${l.slice(0, Math.max(3, Math.floor((maxW - Math.round(size * 0.12)) / (EM * size)) - 1)).trim()}…`)
  return { lines: (two || [t]).map(cut), size }
}
export const fitName = (name, maxW = WIN_W - 24) => fitDisplay(name, maxW, NAME_STEPS, NAME_STEPS_2)
export const fitTitle = (label, maxW) => fitDisplay(label, maxW, TITLE_STEPS, TITLE_STEPS_2)

/** A strip of words cut on a word boundary at `max` characters (an ellipsis only when something was cut). */
export function clampWords(text, max = 100) {
  const t = String(text || '').replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t
  const cut = t.slice(0, max - 1)
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), 20)).replace(/[\s.,;·]+$/, '')}…`
}

const NAME_H = 100       // two lines of the smallest two-line size, or one line of the largest, centred: the same box for both legs
const MATCH_H = 44
const PRICE_H = 54
const WHY_H = 92         // three lines of the 24px strip; the strip is cut at about two and a half so it never needs more
const WHY_MAX = 84
const TITLE_H = 92
export const LINE_H = 1.04
export const DUAL_LAYOUT = Object.freeze({ WIN_W, WIN_H, SHIFT, NAME_H, MATCH_H, PRICE_H, WHY_H, TITLE_H, NAME_MAXW: WIN_W - 24 })

function DisplayLines({ f, h }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-start', height: h, overflow: 'hidden' }}>
      {f.lines.map((l, k) => (
        <span key={k} style={{ display: 'flex', fontFamily: DISPLAY, fontSize: f.size, fontWeight: 900, lineHeight: LINE_H, textTransform: 'uppercase', transform: 'skewX(-8deg)', whiteSpace: 'nowrap' }}>{l}</span>
      ))}
    </div>
  )
}

function Leg({ m, price, accent, top }) {
  const posNum = [m.pos, m.number != null ? `#${m.number}` : null].filter(Boolean).join(' · ')
  const hasPrice = price && price.best && price.books >= 1
  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: WIN_W, marginTop: top }}>
      <div style={{ display: 'flex', position: 'relative', width: WIN_W, height: WIN_H, overflow: 'hidden', borderRadius: 14, border: `3px solid ${alpha(accent, 0.7)}`, background: `radial-gradient(circle at 50% 40%, ${alpha(m.tone || accent, 0.5)} 0%, ${alpha(accent, 0.08)} 65%, ${alpha(CHASSIS.bg, 0.4)} 100%)` }}>
        {m.logo ? <div style={{ display: 'flex', position: 'absolute', right: -70, top: 40, opacity: 0.16 }}><Logo m={m} size={420} /></div> : null}
        <div style={{ display: 'flex', position: 'absolute', left: 0, bottom: 0 }}><Face m={m} w={WIN_W - 6} h={WIN_H - 6} accent={accent} /></div>
        <div style={{ display: 'flex', position: 'absolute', left: 14, top: 14 }}>
          <span style={{ fontSize: fs(24), fontWeight: 800, letterSpacing: 3, color: m.status === 'called' ? CHASSIS.bg : INK, background: m.status === 'called' ? accent : alpha(CHASSIS.bg, 0.72), border: `2px solid ${m.status === 'called' ? accent : alpha(INK, 0.3)}`, padding: '4px 14px', whiteSpace: 'nowrap' }}>{STATUS_WORD[m.status] || STATUS_WORD.off}</span>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', padding: '6px 6px 0 6px', width: WIN_W }}>
        <DisplayLines f={fitName(m.name)} h={NAME_H} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: MATCH_H, width: WIN_W - 12, overflow: 'hidden' }}>
          {m.logo ? <Logo m={m} size={36} /> : null}
          <span style={{ display: 'flex', flexShrink: 1, minWidth: 0, fontSize: fs(26), fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{matchup(m)}</span>
          {posNum ? <span style={{ display: 'flex', flexShrink: 0, fontSize: fs(24), fontWeight: 600, color: DIM, whiteSpace: 'nowrap' }}>{posNum}</span> : null}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', height: PRICE_H }}>
          {hasPrice ? (
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, border: `2px solid ${alpha(accent, 0.6)}`, borderRadius: 10, padding: '4px 14px', background: alpha(accent, 0.1) }}>
              <span style={{ fontSize: fs(28), fontWeight: 900, color: accent, whiteSpace: 'nowrap' }}>{price.best}</span>
              <span style={{ fontSize: fs(24), fontWeight: 700, color: INK2, whiteSpace: 'nowrap' }}>{`best · ${price.books} book${price.books === 1 ? '' : 's'}`}</span>
            </div>
          ) : null}
        </div>
        <div style={{ display: 'flex', height: WHY_H, paddingTop: 6, borderTop: `2px solid ${RULE}`, overflow: 'hidden' }}>
          {m.why ? <span style={{ fontSize: fs(24), fontWeight: 600, color: INK2, lineHeight: 1.22 }}>{clampWords(m.why, WHY_MAX)}</span> : null}
        </div>
      </div>
    </div>
  )
}

export function dualDesign(d, grain, mark) {
  const accent = SPORT_ACCENT[d.sport]
  const [a, b] = d.legs
  const title = fitTitle(d.label, d.serial ? 580 : 940)
  return (
    <Frame accent={accent} tone={null} grain={grain}>
      <div style={{ display: 'flex', position: 'absolute', left: 26, top: 26, width: 1028, height: 1298, border: `3px solid ${alpha(accent, 0.55)}`, borderRadius: 22, flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', height: 84, padding: '0 34px', gap: 22 }}>
          <span style={{ fontSize: fs(30), fontWeight: 800, letterSpacing: 6, color: INK2, whiteSpace: 'nowrap' }}>{`${d.brandName} · THE CARD`}</span>
          <div style={{ display: 'flex', flexGrow: 1, height: 2, background: alpha(accent, 0.5) }} />
          <span style={{ fontSize: fs(30), fontWeight: 800, color: INK2, whiteSpace: 'nowrap' }}>{d.dayWord}</span>
        </div>
        <div style={{ display: 'flex', position: 'relative', justifyContent: 'space-between', padding: '0 28px' }}>
          <Leg m={a.m} price={a.price} accent={accent} top={0} />
          <Leg m={b.m} price={b.price} accent={accent} top={SHIFT} />
          <div style={{ display: 'flex', position: 'absolute', left: 1022 / 2 - 64, top: Math.round(WIN_H / 2 - 64 + SHIFT / 2), width: 128, height: 128, borderRadius: 64, alignItems: 'center', justifyContent: 'center', background: CHASSIS.bg, border: `5px solid ${accent}` }}>
            {mark ? <img src={mark} width={78} height={78} /> : <span style={{ fontFamily: DISPLAY, fontSize: 44, fontWeight: 900, color: accent }}>DASH</span>}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', margin: '12px 28px 0 28px', padding: '12px 28px 14px 28px', borderRadius: 14, border: `2px solid ${alpha(accent, 0.75)}`, background: `linear-gradient(90deg, ${alpha(accent, 0.2)} 0%, ${alpha(accent, 0.04)} 100%)` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: TITLE_H }}>
            <DisplayLines f={title} h={TITLE_H} />
            {d.serial ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0 }}>
                <span style={{ fontSize: fs(22), fontWeight: 800, letterSpacing: 3, color: DIM, whiteSpace: 'nowrap' }}>{d.serial.caption}</span>
                <span style={{ fontFamily: DISPLAY, fontSize: 46, fontWeight: 900, lineHeight: 1, color: accent, whiteSpace: 'nowrap' }}>{`${d.serial.n} of ${d.serial.of}`}</span>
              </div>
            ) : null}
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', height: 72, marginTop: 6 }}>
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 2 }}>
              <span style={{ fontSize: fs(28), fontWeight: 800, color: INK2, whiteSpace: 'nowrap' }}>{d.rule}</span>
              {d.price ? <span style={{ fontSize: fs(24), fontWeight: 600, color: DIM, whiteSpace: 'nowrap' }}>best prices, the two multiplied</span> : null}
            </div>
            {d.price ? <span style={{ fontFamily: DISPLAY, fontSize: 76, fontWeight: 900, lineHeight: 1, color: accent, whiteSpace: 'nowrap', transform: 'skewX(-8deg)' }}>{d.price}</span> : null}
          </div>
        </div>
        <div style={{ display: 'flex', position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'space-between', height: 64, padding: '0 34px', borderTop: `2px solid ${RULE}`, gap: 20 }}>
          <span style={{ fontSize: fs(24), fontWeight: 800, color: INK2, letterSpacing: 2, whiteSpace: 'nowrap' }}>{`${d.brandName} · DASH Network`}</span>
          <span style={{ fontSize: fs(24), fontWeight: 600, color: DIM, whiteSpace: 'nowrap' }}>{`one ${d.market} market · graded in public`}</span>
        </div>
      </div>
    </Frame>
  )
}

/** PNG bytes of the dual card at `width` px (4:5). */
export async function renderDual(d, { width } = {}) {
  const { grain, mark } = await assets()
  const size = sizeOf(width)
  return renderPng(dualDesign(d, grain, mark), size, { card: 'dual', design: dualDesign(d, null, mark) })
}
