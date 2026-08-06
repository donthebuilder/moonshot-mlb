// Signal-pill styling, shared by every surface that renders the bot's
// signal_pills strings (Games pick cards, Bot board, Results).
//
// The bot publishes up to three pills per row and they encode three different
// KINDS of signal — but the site was painting them all the same flat grey, so
// "HRW 62 🔥" and "#2 Lineup" read as interchangeable noise. Each family now
// wears its own colour, matched to the score colours the rest of the site
// already uses (HR orange, HIT blue, etc.), so a card's pills scan as
// weather / form / matchup at a glance without reading a single one.
//
// Families, from the bot's own enrich_signal_pills_and_best_non_hr():
//   HRW …            weather-adjusted HR score      → yellow (OVR family)
//   L5:/L7: …HR      recent homers                  → green  (form, hot)
//   Brl / IHR / BBE  quality-of-contact             → orange (power family)
//   Weak vs / PMix / P-HR9 / Weak P   the matchup   → cyan   (pitcher-facing)
//   #n Lineup        lineup slot                    → violet
// Anything unrecognised falls back to neutral grey — new bot pills degrade
// gracefully instead of crashing the card.

const FAMILIES = [
  { re: /^HRW\b/, color: '#FCD34D', title: 'HR-Weather: the HR score with tonight’s park and weather folded in. 🔥 strong, ⚡ volatile-hot, ✔️ sweet spot, ❄️ cold.' },
  { re: /^L[57]:/, color: '#4ade80', title: 'Recent form — home runs in his last 5 or 7 games.' },
  { re: /^(Brl|IHR|BBE)/, color: '#FB923C', title: 'Quality of contact — barrel rate, ideal-HR contact, or batted-ball power.' },
  { re: /^(Weak vs|PMix|P-HR9|#\d+ Weak P)/, color: '#22d3ee', title: 'The matchup — tonight’s pitcher is exploitable for this hitter: his weak side, a pitch-mix he crushes, or a homer-prone arm.' },
  { re: /^#\d+ Lineup/, color: '#A78BFA', title: 'Lineup slot — hitting at the top means more plate appearances tonight.' },
]

export function pillMeta(pill) {
  const s = String(pill || '')
  for (const fam of FAMILIES) {
    if (fam.re.test(s)) return { color: fam.color, title: fam.title }
  }
  // Hex, not rgba — pillStyle appends alpha digits to build the tint.
  return { color: '#9ca3af', title: '' }
}

// One ready-made style so the three call sites can't drift apart.
export function pillStyle(pill, numFont) {
  const { color } = pillMeta(pill)
  return {
    fontSize: 9.5, fontWeight: 700, fontFamily: numFont,
    color, background: `${color}14`,
    border: `1px solid ${color}55`,
    borderRadius: 999, padding: '2px 8px', whiteSpace: 'nowrap',
  }
}
