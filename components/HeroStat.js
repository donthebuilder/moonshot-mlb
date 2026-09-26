import { C as MLB_C, NUM_FONT as MLB_NUM, TYPE } from '../lib/theme'

// ── THE HERO'S STAT PILL, SHARED (2026-09-26) ───────────────────────────────
// MOONSHOT's Home `Stat`, moved as it was (MOONSHOT's look is the reference)
// so LAMP's hero uses the same pill (.claude-notes/BATCH-LAMP-SHELL-PLAN.md
// step 2). Label, value, optional sub; `theme`/`numFont` default to MOONSHOT's.
export default function HeroStat({ label, value, sub, col = null, title, theme = null, numFont = null }) {
  const C = theme || MLB_C
  const NUM_FONT = numFont || MLB_NUM
  return (
    <span title={title} style={{
      display: 'flex', alignItems: 'baseline', gap: 5, minWidth: 0,
      border: `1px solid ${C.border}`, background: 'rgba(255,255,255,.025)',
      borderRadius: 8, padding: '4px 9px', cursor: title ? 'inherit' : 'inherit',
    }}>
      <span style={{
        fontSize: TYPE.label, color: C.text3, letterSpacing: '.06em', fontFamily: NUM_FONT,
        flexShrink: 0,
      }}>{label}</span>
      <b style={{
        fontSize: TYPE.body, color: col || C.text, fontFamily: NUM_FONT, minWidth: 0,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{value}</b>
      {sub && (
        <span style={{
          fontSize: TYPE.micro, color: C.text3, fontFamily: NUM_FONT, minWidth: 0,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{sub}</span>
      )}
    </span>
  )
}
