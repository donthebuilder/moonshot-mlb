// THE TWO-MAN DUAL CARD (server only, JSX): the dual-signature collectible, for the Card's Two-Man (the bot's, and Donovan's hand-picked lane
// with the same layout and its own label). Two portraits on a slight diagonal, a name plate and the matchup under each, the DASH mark between
// them, each leg's one strongest stat strip (the stored words the Card prints), the slot label, the stored combined price (only when BOTH legs
// have one), the date and the card's REAL sequence number in its lane's record. Every slot with nothing real behind it is left off, never filled.
// Data: lib/cards/dualData.js (stored card_calls rows). No link, no probability, status words only from lib/callStatus STATUS_WORD.
import { Frame, assets, renderPng, sizeOf, fs, fitName, alpha, Face, Logo, matchup, DISPLAY, INK, INK2, DIM, RULE, CHASSIS } from './cardKit'
import { SPORT_ACCENT } from '../sportAccent'
import { STATUS_WORD } from '../callStatus'

const WIN_W = 470
const WIN_H = 600
const SHIFT = 44          // the second portrait sits lower: the diagonal

/** A strip of words cut on a word boundary at `max` characters (an ellipsis only when something was cut). */
export function clampWords(text, max = 100) {
  const t = String(text || '').replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t
  const cut = t.slice(0, max - 1)
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), 20)).replace(/[\s.,;·]+$/, '')}…`
}

function Leg({ m, accent, top }) {
  const posNum = [m.pos, m.number != null ? `#${m.number}` : null].filter(Boolean).join('  ·  ')
  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: WIN_W, marginTop: top }}>
      <div style={{ display: 'flex', position: 'relative', width: WIN_W, height: WIN_H, overflow: 'hidden', borderRadius: 14, border: `3px solid ${alpha(accent, 0.7)}`, background: `radial-gradient(circle at 50% 40%, ${alpha(m.tone || accent, 0.5)} 0%, ${alpha(accent, 0.08)} 65%, ${alpha(CHASSIS.bg, 0.4)} 100%)` }}>
        {m.logo ? <div style={{ display: 'flex', position: 'absolute', right: -70, top: 40, opacity: 0.16 }}><Logo m={m} size={420} /></div> : null}
        <div style={{ display: 'flex', position: 'absolute', left: 0, bottom: 0 }}><Face m={m} w={WIN_W - 6} h={WIN_H - 6} accent={accent} /></div>
        <div style={{ display: 'flex', position: 'absolute', left: 14, top: 14 }}>
          <span style={{ fontSize: fs(24), fontWeight: 800, letterSpacing: 3, color: m.status === 'called' ? CHASSIS.bg : INK, background: m.status === 'called' ? accent : alpha(CHASSIS.bg, 0.72), border: `2px solid ${m.status === 'called' ? accent : alpha(INK, 0.3)}`, padding: '4px 14px', whiteSpace: 'nowrap' }}>{STATUS_WORD[m.status] || STATUS_WORD.off}</span>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', padding: '10px 6px 0 6px' }}>
        <span style={{ fontFamily: DISPLAY, fontSize: fitName(m.name, 66, WIN_W - 56), fontWeight: 900, lineHeight: 1.05, textTransform: 'uppercase', transform: 'skewX(-8deg)', whiteSpace: 'nowrap', height: 74, alignItems: 'center', display: 'flex' }}>{m.name}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 44 }}>
          <Logo m={m} size={38} />
          <span style={{ fontSize: fs(28), fontWeight: 800, whiteSpace: 'nowrap' }}>{matchup(m)}</span>
          {posNum ? <span style={{ fontSize: fs(24), fontWeight: 600, color: DIM, whiteSpace: 'nowrap' }}>{posNum}</span> : null}
        </div>
        <div style={{ display: 'flex', height: 92, paddingTop: 6, borderTop: `2px solid ${RULE}`, marginTop: 4 }}>
          {m.why ? <span style={{ fontSize: fs(24), fontWeight: 600, color: INK2, lineHeight: 1.25 }}>{clampWords(m.why, 96)}</span> : null}
        </div>
      </div>
    </div>
  )
}

export function dualDesign(d, grain, mark) {
  const accent = SPORT_ACCENT[d.sport]
  const [a, b] = d.legs
  return (
    <Frame accent={accent} tone={null} grain={grain}>
      <div style={{ display: 'flex', position: 'absolute', left: 26, top: 26, width: 1028, height: 1298, border: `3px solid ${alpha(accent, 0.55)}`, borderRadius: 22, flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', height: 84, padding: '0 34px', gap: 22 }}>
          <span style={{ fontSize: fs(30), fontWeight: 800, letterSpacing: 6, color: INK2, whiteSpace: 'nowrap' }}>{`${d.brandName} · THE CARD`}</span>
          <div style={{ display: 'flex', flexGrow: 1, height: 2, background: alpha(accent, 0.5) }} />
          <span style={{ fontSize: fs(30), fontWeight: 800, color: INK2, whiteSpace: 'nowrap' }}>{d.dayWord}</span>
        </div>
        <div style={{ display: 'flex', position: 'relative', justifyContent: 'space-between', padding: '0 28px' }}>
          <Leg m={a.m} accent={accent} top={0} />
          <Leg m={b.m} accent={accent} top={SHIFT} />
          <div style={{ display: 'flex', position: 'absolute', left: 1022 / 2 - 64, top: Math.round(WIN_H / 2 - 64 + SHIFT / 2), width: 128, height: 128, borderRadius: 64, alignItems: 'center', justifyContent: 'center', background: CHASSIS.bg, border: `5px solid ${accent}` }}>
            {mark ? <img src={mark} width={78} height={78} /> : <span style={{ fontFamily: DISPLAY, fontSize: 44, fontWeight: 900, color: accent }}>DASH</span>}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', margin: '14px 28px 0 28px', padding: '18px 28px', borderRadius: 14, border: `2px solid ${alpha(accent, 0.75)}`, background: `linear-gradient(90deg, ${alpha(accent, 0.2)} 0%, ${alpha(accent, 0.04)} 100%)` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontFamily: DISPLAY, fontSize: fitName(d.label, 84, d.serial ? 560 : 900), fontWeight: 900, lineHeight: 1, textTransform: 'uppercase', transform: 'skewX(-8deg)', whiteSpace: 'nowrap', color: INK }}>{d.label}</span>
            {d.serial ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                <span style={{ fontSize: fs(22), fontWeight: 800, letterSpacing: 3, color: DIM }}>{d.serial.caption}</span>
                <span style={{ fontFamily: DISPLAY, fontSize: 56, fontWeight: 900, lineHeight: 1, color: accent }}>{`${d.serial.n} of ${d.serial.of}`}</span>
              </div>
            ) : null}
          </div>
          <span style={{ fontSize: fs(30), fontWeight: 800, color: INK2, marginTop: 8, whiteSpace: 'nowrap' }}>{d.rule}</span>
          {d.price ? <span style={{ fontSize: fs(32), fontWeight: 800, color: accent, marginTop: 8, whiteSpace: 'nowrap' }}>{`about ${d.price} best, the two prices multiplied`}</span> : null}
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
