'use client'
import { useEffect, useState } from 'react'
import CardSwipe from '../CardSwipe'
import { C, TYPE } from '../../lib/theme'
import { membersUrl } from '../../lib/members'
import { useSportTheme } from '../SportTheme'

// TONIGHT'S CALLS AS A SWIPE DECK (2026-10-18, PHONE-PARITY item 9a): /m's deck on the site. Drawn only while its Fold is open (the Fold renders nothing shut), so a
// closed section costs no request. The list is /api/phone/calls: the member hiding happens on the server, like /m and the front door.
export default function TonightsCalls({ sport = 'mlb' }) {
  const { accent } = useSportTheme()   // the product's own colour (MOONSHOT: the same orange as before)
  const [data, setData] = useState(null)   // null = loading, { items, hidden } = answered
  useEffect(() => {
    let alive = true
    fetch(`/api/phone/calls?sport=${sport}`, { cache: 'no-store' }).then((r) => r.json()).then((j) => { if (alive) setData(j) }).catch(() => { if (alive) setData({ items: [], hidden: 0 }) })
    return () => { alive = false }
  }, [sport])
  if (!data) return <div style={{ fontSize: TYPE.body, color: C.text3, padding: '8px 2px' }}>Loading tonight’s calls…</div>
  if (!data.items.length) return <div style={{ fontSize: TYPE.body, color: C.text3, padding: '8px 2px' }}>No calls locked yet. They post with the board and lock before the game.</div>
  return (
    <div style={{ maxWidth: 480, margin: '0 auto' }}>
      <CardSwipe sport={sport} items={data.items} />
      {data.hidden > 0 && (
        <p style={{ margin: '8px 2px 0', fontSize: TYPE.body, color: C.text2, lineHeight: 1.4 }}>
          {data.hidden} more called {data.hidden === 1 ? 'pick is' : 'picks are'} for members.{' '}
          <a href={membersUrl()} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44, color: accent }}>See membership</a>
        </p>
      )}
    </div>
  )
}
