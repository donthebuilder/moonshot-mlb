'use client'
import { useState } from 'react'

// The card on the landing page. If the card cannot be drawn (the share route answers 404 for a day with no data
// or a card that no longer exists) nothing broken is shown: the page keeps the record and the sign-up button.
export default function CardLandingImage({ src, alt }) {
  const [bad, setBad] = useState(false)
  if (bad) return null
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} width={720} height={900} onError={() => setBad(true)}
      style={{ display: 'block', width: '100%', maxWidth: 420, height: 'auto', aspectRatio: '4 / 5', margin: '0 auto', borderRadius: 14 }} />
  )
}
