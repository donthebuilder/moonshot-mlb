'use client'
import CallStatusBadge from './CallStatusBadge'
import { useSportTheme } from './SportTheme'
import { TeamTap } from './EntityTap'

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

/** A story engine row's parts ({ t: 'name'|'num'|'text', v }): names bold, numbers mono orange. */
export function StoryParts({ parts, theme: C, numFont }) {
  // numbers in the product's accent, not MOONSHOT orange (0g C3)
  const { accent, themed } = useSportTheme()
  const num = themed ? accent : C.orange
  return (parts || []).map((x, j) => (x.t === 'name'
    // a club code inside a story ("faces IND") is a link to the club through the product's team door (nav audit 10-06)
    ? <b key={j} style={{ color: C.text }}><TeamTap abbr={x.v}>{x.v}</TeamTap></b>
    : x.t === 'num' ? <b key={j} style={{ fontFamily: numFont, color: num }}>{x.v}</b> : <span key={j}>{x.v}</span>))
}

/** The player's board chip beside a story (lib/stories/index.js `board`). */
export function BoardBadge({ b, theme: C, numFont, accent }) {
  if (!b) return null
  return <CallStatusBadge variant="text" status={b.status} score={b.score} theme={C} numFont={numFont} accent={accent} />
}

/** A sentence with every number (counts, years) in the mono font, orange. */
export function Numbered({ text, theme: C, numFont }) {
  const { accent, themed } = useSportTheme()
  const num = themed ? accent : C.orange
  return String(text || '').split(/(\d[\d,]*)/).map((x, j) => (/^\d/.test(x)
    ? <b key={j} style={{ fontFamily: numFont, color: num }}>{x}</b>
    : <span key={j}>{x}</span>))
}
