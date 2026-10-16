'use client'
import { useEffect, useRef, useState } from 'react'

// The card on the landing page. If the card cannot be drawn (the share route answers 404 for a day with no data
// or a card that no longer exists) nothing broken is shown: the page keeps the record and the sign-up button.
// A cold card is drawn on demand and can take a few seconds, so the frame holds its 4:5 shape and says what is happening
// instead of leaving a blank gap (the sign-up button below does not jump when the picture lands).
export default function CardLandingImage({ src, alt }) {
  const [bad, setBad] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const ref = useRef(null)
  // the image can finish before React attaches onLoad (server-rendered, cached)
  useEffect(() => { if (ref.current?.complete && ref.current.naturalWidth > 0) setLoaded(true) }, [])
  if (bad) return null
  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: 420, margin: '0 auto', aspectRatio: '4 / 5', borderRadius: 14, overflow: 'hidden', border: loaded ? 'none' : '1px solid rgba(128,128,128,0.25)' }}>
      {!loaded && (
        <div role="status" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 24, fontSize: 14, opacity: 0.7 }}>
          Drawing tonight&apos;s card…
        </div>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img ref={ref} src={src} alt={alt} width={720} height={900} fetchPriority="high" decoding="async"
        onLoad={() => setLoaded(true)} onError={() => setBad(true)}
        style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover', opacity: loaded ? 1 : 0, transition: 'opacity .2s' }} />
    </div>
  )
}
