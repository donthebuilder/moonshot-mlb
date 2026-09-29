'use client'
import { C as MLB_C, NUM_FONT as MLB_NUM, TYPE } from '../lib/theme'

// THE STORYLINE STRIP (2026-09-29, queue batch 13: "storyline strip (new
// shared component), 1 line per card on phone"). The facts a card's player
// is carrying this week -- scored last time out, due by the numbers, a
// milestone in reach, a revenge game -- as ONE line. It never wraps: on a
// phone the extra facts scroll sideways inside the line instead of adding a
// second one, so a card costs exactly one line more, and only when there is
// something to say (no stories = nothing rendered).
//
// items: [{ key, icon, text, title, tone }] — the sport decides the words;
// every item is a fact computed elsewhere, never written here.
export default function StorylineStrip({ items, theme = MLB_C, numFont = MLB_NUM, style }) {
  const C = theme
  if (!items?.length) return null
  return (
    <div className="dense-scroll rail" style={{
      display: 'flex', gap: 10, overflowX: 'auto', whiteSpace: 'nowrap',
      fontFamily: numFont, fontSize: TYPE.micro, fontWeight: 800, lineHeight: 1.3,
      scrollbarWidth: 'none', ...style,
    }}>
      {items.map((it) => (
        <span key={it.key} title={it.title || it.text} style={{ flex: '0 0 auto', color: it.tone || C.text2 }}>
          {it.icon ? `${it.icon} ` : ''}{it.text}
        </span>
      ))}
    </div>
  )
}
