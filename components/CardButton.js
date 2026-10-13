'use client'
// THE 📸 BUTTON for the cards LAMP and BUCKETS download (fix15, 2026-10-08). One 44 x 44 icon button in the
// product's own theme: it draws the card (the page hands it a function (lib/cards/saveCard.js downloadCard)
// that builds the PNG), shows it is working while it does, and never blocks the page. A hidden product
// (BUCKETS until it opens, lib/routes.js isHiddenSport) has no button at all.
import { useState } from 'react'
import { useSportOpen } from '../lib/useVisibleSports'
import { useSportTheme } from './SportTheme'

export default function CardButton({ sport, onDownload, label = 'Download this as an image', style = null }) {
  const { C, accent } = useSportTheme()
  const [busy, setBusy] = useState(false)
  const open = useSportOpen(sport)
  if (open !== true) return null
  const go = async (e) => {
    e.stopPropagation()
    if (busy) return
    setBusy(true)
    try { await onDownload() } finally { setBusy(false) }
  }
  return (
    <button type="button" onClick={go} disabled={busy} title={label} aria-label={label} aria-busy={busy}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto', boxSizing: 'border-box',
        minWidth: 44, minHeight: 44, padding: 0, borderRadius: 8, cursor: busy ? 'progress' : 'pointer', fontSize: 18, lineHeight: 1,
        border: `1px solid ${C.border2}`, background: 'transparent', color: accent, opacity: busy ? 0.5 : 1, ...(style || {}),
      }}>
      <span aria-hidden="true">{'\u{1F4F8}'}</span>
    </button>
  )
}
