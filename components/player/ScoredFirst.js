'use client'
import { useEffect, useState } from 'react'
import { STATUS_WORD } from '../../lib/callStatus'

// SCORED FIRST, ON A PLAYER'S CARD (2026-10-20, Donovan on the parity grid: "the first-pitch split no equivalents?"). MOONSHOT's
// first-pitch split is baseball's; the other three sports' twin is the first score of the game -- the first touchdown (TUDDY), the
// first goal (LAMP), the first basket (BUCKETS). One line, MultiLine's shape: "Scored first in 2 games this season (last: Oct 12,
// P1 4:12) · 1 CALLED", nothing at all when he has none. Counted from the event feeds the Ledger's First scorers read
// (lib/ledger/firstScorers.js via /api/ledger/first?player=); the status is the one each row was stored with. Never a chance.
const shortDay = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

export default function ScoredFirst({ sport, playerId, word = 'Scored first', color, textColor }) {
  const [games, setGames] = useState(null)
  useEffect(() => {
    if (!playerId) return undefined
    let alive = true
    fetch(`/api/ledger/first?sport=${sport}&player=${encodeURIComponent(playerId)}`).then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive) setGames(j?.games || []) }).catch(() => {})
    return () => { alive = false }
  }, [sport, playerId])
  if (!games?.length) return null
  const last = games[0]
  const called = games.filter((g) => g.status === 'called').length
  return (
    <div data-scored-first={sport} style={{ marginTop: 6, fontSize: 11.5, lineHeight: 1.45, color: textColor }}>
      <b style={{ color }}>1st</b> {word} in {games.length} game{games.length === 1 ? '' : 's'} this season (last: {shortDay(last.day)}{last.when ? `, ${last.when}` : ''}){called ? ` · ${called} ${STATUS_WORD.called}` : ''}
    </div>
  )
}
