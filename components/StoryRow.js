'use client'

// ONE ROW FOR EVERY STORYLINES LINE (HISTORY WATCH 2 step 1, 2026-09-27).
// Donovan: "why are they two different text?" -- MOONSHOT's Storylines drew
// History Watch, the storyline rows and the countdowns three different ways.
// Now all of them are this: icon · the sentence (names bold, numbers in the
// mono font) · an optional right-aligned tag. It is the storyline row's own
// look, lifted out of Storylines.js unchanged, so MOONSHOT does not move;
// History Watch on TUDDY and LAMP picks it up through HistoryWatch.js.
//
// className="tap-row" floors a tappable row at 44px on a touch device (the
// 2026-08-10 phone pass); a row with no onClick is a plain div.
export default function StoryRow({ icon, children, onClick = null, title, tag = null, theme: C, expanded, style = {} }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick || undefined}
      className={onClick ? 'tap-row' : undefined}
      aria-expanded={expanded}
      title={title}
      style={{
        display: 'flex', gap: 8, alignItems: 'baseline', width: '100%',
        font: 'inherit', fontSize: 11, lineHeight: 1.55, textAlign: 'left',
        padding: '3px 0', border: 'none', background: 'transparent',
        cursor: onClick ? 'pointer' : 'default', color: C.text2,
        ...style,
      }}
    >
      <span style={{ flexShrink: 0 }}>{icon}</span>
      <span style={{ minWidth: 0, flex: '1 1 auto' }}>{children}</span>
      {tag ? <span style={{ flexShrink: 0, marginLeft: 6, fontSize: 9.5, color: C.text3, whiteSpace: 'nowrap' }}>{tag}</span> : null}
    </Tag>
  )
}

/** A sentence with every number (counts, years) in the mono font, orange. */
export function Numbered({ text, theme: C, numFont }) {
  return String(text || '').split(/(\d[\d,]*)/).map((x, j) => (/^\d/.test(x)
    ? <b key={j} style={{ fontFamily: numFont, color: C.orange }}>{x}</b>
    : <span key={j}>{x}</span>))
}
