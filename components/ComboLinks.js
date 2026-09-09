'use client'
import { C, NUM_FONT } from '../lib/theme'

// ══ THE THREE COMBO SURFACES, LINKED (2026-09-01) ════════════════════════════
//
// Pairs (the bot's picks), the Builder (yours, around an anchor) and the
// Watchlist's "Pairs within your list" (yours, among saved men) grew in three
// sessions and never pointed at each other. Donovan, asked whether to unify
// them: "keep three, cross-link, trim Pairs' prose." So: one row, drawn on
// all three, naming the other two. Hash routes, because Dashboard already
// listens for them — no prop threading through four components.
const ALL = [
  ['pairs', '🔗 Bot pairs', 'the bot’s own pairs and pools, ranked on the record'],
  ['builder', '🧰 Builder', 'build a pair or pool around any hitter'],
  ['watch', '⭐ Your list', 'every two-man combo among the hitters you saved'],
]

export default function ComboLinks({ here }) {
  const others = ALL.filter(([k]) => k !== here)
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', margin: '0 0 10px', fontFamily: NUM_FONT }}>
      <span style={{ fontSize: 8.5, color: C.text3, textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 800 }}>also</span>
      {others.map(([k, label, title]) => (
        <a key={k} href={`#tab=${k}`} title={title} style={{
          fontSize: 9.5, fontWeight: 800, color: C.cyan, textDecoration: 'none',
          border: `1px solid ${C.cyan}44`, borderRadius: 999, padding: '2px 9px', background: `${C.cyan}0d`,
        }}>{label} →</a>
      ))}
    </div>
  )
}
