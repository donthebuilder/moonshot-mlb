'use client'
import { C as MLB_C, NUM_FONT as MLB_NUM } from '../../lib/theme'
import { alpha } from '../../lib/scales'

// THE POWER PAGE'S FRAME, SHARED (2026-09-29, Donovan: "did we ever do the
// player powers for all the sports?"). Lifted out of MOONSHOT's
// components/tabs/Power.js markup for markup: ONE LEAD (the strongest read of
// the night, argued in a sentence with its numbers inside it, the rest one
// tap behind a fold), then ONE BOARD behind a lens row whose active pill is
// the board's title. The sport supplies the sentences and the boards; the
// look is MOONSHOT's. Defaults are MOONSHOT's theme, so its page is unchanged.

export function Para({ children, dim, theme = MLB_C }) {
  const C = theme
  return <p style={{ margin: '0 0 7px', fontSize: 12.5, lineHeight: 1.72, color: dim ? C.text3 : C.text2, maxWidth: 760 }}>{children}</p>
}

export function Num({ children, color, theme = MLB_C, numFont = MLB_NUM }) {
  return <b style={{ color: color || theme.text, fontFamily: numFont, fontWeight: 800 }}>{children}</b>
}

/** "1.9 standard deviations clear of <field> and 4.0 points clear of the next name". */
export function ConvictionClause({ conv, field, theme = MLB_C, numFont = MLB_NUM, unit = 'points' }) {
  const C = theme
  if (!conv || !Number.isFinite(conv.z)) return null
  const strong = conv.z >= 0.8
  return (
    <>
      , <Num theme={theme} numFont={numFont}>{conv.z.toFixed(1)}</Num> standard deviation{conv.z === 1 ? '' : 's'}{' '}
      {strong ? 'clear of' : 'above'} {field}
      {strong && conv.gap != null && <> and <Num theme={theme} numFont={numFont}>{conv.gap.toFixed(1)}</Num> {unit} clear of the next name</>}
      {!strong && (
        <span style={{ color: C.text3 }}> — close enough to the next name that this is an ordering, not a separation</span>
      )}
    </>
  )
}

/** The lead card: kicker, the name (tap for his card), then the argument. */
export function PowerLead({ color, kicker, name, meta, onName, children, theme = MLB_C, numFont = MLB_NUM }) {
  const C = theme
  return (
    <section style={{
      marginBottom: 18, maxWidth: 780, borderRadius: 18,
      border: `1px solid ${alpha(color, 0.26)}`,
      background: `linear-gradient(158deg, ${alpha(color, 0.1)}, ${C.bg2} 60%)`,
      padding: '16px 18px 15px',
    }}>
      <div style={{
        fontSize: 9, fontFamily: numFont, fontWeight: 900, letterSpacing: '.14em',
        textTransform: 'uppercase', color, marginBottom: 5,
      }}>
        {kicker}
      </div>
      <h2 style={{ margin: '0 0 8px', fontSize: 27, fontWeight: 900, letterSpacing: '-.02em', lineHeight: 1.1 }}>
        <span onClick={onName} style={{ cursor: onName ? 'pointer' : 'default' }}>{name}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: C.text3, fontFamily: numFont }}> {meta}</span>
      </h2>
      {children}
    </section>
  )
}

const COUNT = { 2: 'two', 3: 'three', 4: 'four', 5: 'five' }

/** One board, several lenses: the pill is the board's title, the active
 *  lens's one-line answer rides the row. lenses: [{ k, label, tag, color }]. */
export function LensRow({ lenses, value, onChange, theme = MLB_C, btn }) {
  const C = theme
  const lens = lenses.find((l) => l.k === value) || lenses[0]
  return (
    <div style={{ display: 'flex', gap: 6, marginTop: 4, marginBottom: 12, flexWrap: 'wrap', alignItems: 'baseline' }}>
      {lenses.map((l) => (
        <button key={l.k} onClick={() => onChange(l.k)} style={btn(l.color, value === l.k)}>
          {l.label}
        </button>
      ))}
      <span style={{ fontSize: 10.5, color: C.text3, marginLeft: 2 }}>
        {COUNT[lenses.length] || lenses.length} lenses on one
        question — {lens.tag}
      </span>
    </div>
  )
}
