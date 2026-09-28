'use client'
import { C, NUM_FONT, TYPE } from '../lib/theme'

// THE HERO, ONCE (2026-09-28, DAY-AWARE-OPENERS-PLAN; CLAUDE.md: MOONSHOT's
// components are the base). MOONSHOT's home hero -- lifted out of
// components/tabs/Home.js unchanged, style for style -- so TUDDY and LAMP open
// the same way: the edition eyebrow + date, a two-tone headline that says the
// day, what's on and its state (lib/dayLine.js), the day line, the edition
// chip + one useful fact, then the page's own chips and rundown (children).
// `accent` / `grad` / `ink` are the product's; MOONSHOT passes nothing and
// renders exactly as before.
export default function DayHero({
  icon, eyebrow, live = false,
  lead, accentText, dayText,
  chip, sub,
  children,
  accent = C.orange, grad = ['#f97316', '#FCD34D'],
  headingLevel = 'h1',
  theme = null,      // the product's own greys (LAMP's surfaces are darker); MOONSHOT's by default
}) {
  const H = headingLevel
  const T = theme || C
  return (
    <div style={{
      position: 'relative', overflow: 'hidden',
      background: `linear-gradient(150deg, ${T.bg2}, ${hexA(grad[0], 0.07)} 60%, ${hexA(grad[1], 0.05)})`,
      border: `1px solid ${T.border}`, borderRadius: 18,
      padding: '18px 18px 16px', marginBottom: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        {icon ? <span style={{ fontSize: 16 }}>{icon}</span> : null}
        <span style={{ fontSize: TYPE.label, color: T.text3, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', fontFamily: NUM_FONT }}>
          {eyebrow}
        </span>
        {live && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5, marginLeft: 4,
            fontSize: TYPE.label, fontWeight: 900, color: T.green, letterSpacing: '.1em', fontFamily: NUM_FONT,
            border: `1px solid ${T.green}55`, background: `${T.green}14`, borderRadius: 999, padding: '2px 9px',
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: T.green, animation: 'homePulse 1.6s infinite' }} />
            LIVE
          </span>
        )}
      </div>
      <H style={{ fontSize: TYPE.display, fontWeight: 900, letterSpacing: '-.03em', margin: '0 0 4px', lineHeight: 1.15 }}>
        {lead}
        {accentText ? (
          <>{' '}
            <span style={{ background: `linear-gradient(90deg, ${grad[0]}, ${grad[1]})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              {accentText}
            </span>
          </>
        ) : null}
        {dayText ? <span style={{ display: 'block', fontSize: 14, fontWeight: 800, color: T.text2, letterSpacing: 0, marginTop: 4 }}>{dayText}</span> : null}
      </H>
      {(chip || sub) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 10px', flexWrap: 'wrap' }}>
          {chip ? <span style={{ fontSize: TYPE.label, fontWeight: 900, letterSpacing: '.16em', fontFamily: NUM_FONT, color: accent, border: `1px solid ${accent}55`, background: `${accent}12`, borderRadius: 3, padding: '2px 7px' }}>{chip}</span> : null}
          {sub ? <span style={{ fontSize: TYPE.body, color: T.text3, fontFamily: NUM_FONT }}>{sub}</span> : null}
        </div>
      )}
      {children}
    </div>
  )
}

// '#f97316' -> 'rgba(249,115,22,a)'; the hero's wash takes the product's pair.
function hexA(hex, a) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''))
  if (!m) return `rgba(249,115,22,${a})`
  const v = parseInt(m[1], 16)
  return `rgba(${v >> 16},${(v >> 8) & 255},${v & 255},${a})`
}
