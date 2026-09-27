'use client'
import { useEffect, useState } from 'react'

// THE 2+ CLUB, ON A PLAYER'S PAGE (2026-09-27, BATCH-MULTI-PLAN step 3):
// one line -- "3 multi-HR games this season (last: Sep 12)" -- and nothing
// at all when he has none. Counts rows in multi_games (/api/multi?player=),
// never estimates. `kinds` + `words` come from the caller, so the line has no
// sport branches: { HR: 'multi-HR' } for MOONSHOT, { TD: 'multi-TD',
// PASS_TD: '2+ passing-TD' } for TUDDY, { G: 'multi-goal' } for LAMP.
const shortDay = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

export default function MultiLine({ sport, playerId, words, color, textColor }) {
  const [games, setGames] = useState(null)
  useEffect(() => {
    if (!playerId) return undefined
    let alive = true
    fetch(`/api/multi?sport=${sport}&player=${encodeURIComponent(playerId)}`).then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive) setGames(j?.games || []) }).catch(() => {})
    return () => { alive = false }
  }, [sport, playerId])
  const parts = Object.entries(words || {}).map(([kind, word]) => {
    const g = (games || []).filter((x) => x.kind === kind)
    return g.length ? `${g.length} ${word} game${g.length === 1 ? '' : 's'} this season (last: ${shortDay(g[0].day)})` : null
  }).filter(Boolean)
  if (!parts.length) return null
  return (
    <div style={{ marginTop: 6, fontSize: 11.5, lineHeight: 1.45, color: textColor }}>
      <b style={{ color }}>2+</b> {parts.join(' · ')}
    </div>
  )
}
