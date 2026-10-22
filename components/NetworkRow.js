'use client'
import { useEffect, useMemo, useState } from 'react'
import { ALL_SPORT_KEYS, BRAND, appHref } from '../lib/routes'
import { SPORT_ACCENT } from '../lib/sportAccent'
import { sharedJSON } from '../lib/sharedRead'

// ACROSS THE NETWORK (2026-10-22, Donovan: the MOONSHOT / TUDDY / LAMP lines under the tape "could be put somewhere else", and BUCKETS
// was missing). The other products' day, one small tile each, at the foot of a Home: name in its own accent, its games and how many
// are live or final (the same /api/stories read the tape made). Every public product but this one; a hidden one stays hidden.
export default function NetworkRow({ sport, theme: C, numFont }) {
  const others = useMemo(() => ALL_SPORT_KEYS.filter((k) => k !== sport && !BRAND[k]?.hidden), [sport])
  const [data, setData] = useState({})
  useEffect(() => {
    let alive = true
    for (const k of others) sharedJSON(`/api/stories?sport=${k}`).then((j) => { if (alive && j) setData((d) => ({ ...d, [k]: j })) }).catch(() => {})
    return () => { alive = false }
  }, [others])
  if (!others.length) return null
  const line = (k) => {
    const g = data[k]?.games
    if (!g) return '…'
    if (!g.length) return 'no games'
    const live = g.filter((x) => x.state === 'live').length, fin = g.filter((x) => x.state === 'final').length
    return [`${g.length} ${g.length === 1 ? 'game' : 'games'}`, live ? `${live} live` : null, fin ? `${fin} final` : null].filter(Boolean).join(' · ')
  }
  return (
    <section aria-label="Across the network">
      <div style={{ font: `900 10px/1 ${numFont}`, letterSpacing: '.12em', color: C.text3, margin: '0 0 6px' }}>ACROSS THE NETWORK</div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${others.length}, minmax(0, 1fr))`, gap: 6 }}>
        {others.map((k) => (
          <a key={k} href={appHref(k, 'home')} style={{ border: `1px solid color-mix(in srgb, ${SPORT_ACCENT[k]} 35%, ${C.border})`, borderRadius: 12, padding: '9px 10px', textDecoration: 'none', display: 'grid', gap: 3, minHeight: 52, boxSizing: 'border-box',
            background: `linear-gradient(160deg, color-mix(in srgb, ${SPORT_ACCENT[k]} 14%, transparent), ${C.bg2} 70%)` }}>
            <span style={{ font: `900 11px/1 ${numFont}`, letterSpacing: '.06em', color: SPORT_ACCENT[k] }}>{BRAND[k]?.icon} {BRAND[k]?.name} ›</span>
            <span style={{ fontSize: 11, color: C.text2 }}>{line(k)}</span>
          </a>
        ))}
      </div>
    </section>
  )
}
