'use client'

import { useEffect, useState } from 'react'

// The draft room refreshes itself every few seconds, and ?message= / ?error=
// live in the URL — so a single "Pick locked in" used to sit on screen for the
// rest of the draft, and a one-off error looked permanent. Strip it from the
// URL once it has been read.
export default function DraftBanner({ error, message }) {
  const [visible, setVisible] = useState(Boolean(error || message))

  useEffect(() => {
    setVisible(Boolean(error || message))
    if (!error && !message) return undefined
    const url = new URL(window.location.href)
    url.searchParams.delete('message')
    url.searchParams.delete('error')
    window.history.replaceState(null, '', url.toString())
    const id = setTimeout(() => setVisible(false), error ? 9000 : 4000)
    return () => clearTimeout(id)
  }, [error, message])

  if (!visible) return null
  return (
    <p className={error ? 'draftBannerError' : 'draftBannerMessage'} role="status">
      {error || message}
      <button aria-label="Dismiss" onClick={() => setVisible(false)} type="button">×</button>
    </p>
  )
}
