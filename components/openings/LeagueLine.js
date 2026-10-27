'use client'
// THE LEAGUE'S NUMBER, ONE LINE (2026-10-27, Donovan: "what's the percentage of them getting the tip, and then ... their first basket
// percentage"). The page header's note and stat are hidden on a phone, so the league baseline sits in the page body: the share of games the
// side with the first move (won the tip or faceoff, got the ball, batted first) also made the first score, with the count under it.
export default function LeagueLine({ label, league, C, NUM_FONT, accent }) {
  if (!league?.n) return null
  return (
    <div role="status" style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', font: `700 11px/1.4 ${NUM_FONT}`, color: C.text2 }}>
      <span style={{ letterSpacing: '.08em', color: C.text3 }}>LEAGUE</span>
      <span>{label}</span>
      <b style={{ color: accent, font: `900 15px/1 ${NUM_FONT}` }}>{Math.round(league.pct)}%</b>
      <span style={{ color: C.text3 }}>{`${league.w.toLocaleString()} of ${league.n.toLocaleString()} games`}</span>
    </div>
  )
}
