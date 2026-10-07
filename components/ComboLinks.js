'use client'
import { C, NUM_FONT } from '../lib/theme'
import { hashParams } from '../lib/urlState'

// ══ THE THREE COMBO SURFACES, LINKED (2026-09-01) ════════════════════════════
//
// Pairs (the bot's picks), the Builder (yours, around an anchor) and the
// Watchlist's "Pairs within your list" (yours, among saved men) grew in three
// sessions and never pointed at each other. Donovan, asked whether to unify
// them: "keep three, cross-link, trim Pairs' prose." So: one row, drawn on
// all three, naming the other two. Hash routes, because Dashboard already
// listens for them — no prop threading through four components.
const ALL = [
  ['pairs', '🔗 MOONSHOT pairs', 'MOONSHOT’s own pairs and pools, ranked on the record'],
  ['builder', '🧰 Builder', 'build a pair or pool around any hitter'],
  ['watch', '⭐ Your list', 'every two-man combo among the hitters you saved'],
]

export default function ComboLinks({ here }) {
  const others = ALL.filter(([k]) => k !== here)
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', margin: '0 0 10px', fontFamily: NUM_FONT }}>
      <span style={{ fontSize: 8.5, color: C.text3, textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 800 }}>also</span>
      {others.map(([k, label, title]) => (
        // ONLY THE TAB CHANGES (0g B2, 2026-10-01): the bare #tab=k replaced the
        // whole hash -- sport, day=tmrw and the team / game filters vanished, so
        // "Builder ->" on Tomorrow's slate landed on Today. A tap now keeps the
        // rest of the address; the href stays for a no-script open.
        <a key={k} href={`#tab=${k}`} title={title}
          onClick={(e) => { e.preventDefault(); const h = hashParams(); h.set('tab', k); window.location.hash = h.toString() }}
          style={{
          fontSize: 9.5, fontWeight: 800, color: C.cyan, textDecoration: 'none',
          border: `1px solid ${C.cyan}44`, borderRadius: 999, padding: '2px 9px', background: `${C.cyan}0d`,
        }}>{label} →</a>
      ))}
    </div>
  )
}
