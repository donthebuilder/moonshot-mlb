'use client'
import { useEffect, useState } from 'react'
import { BRAND } from '../../lib/routes'
import { SPORT_ACCENT } from '../../lib/sportAccent'
import { useVisibleSports } from '../../lib/useVisibleSports'
import { useLiveScores } from '../../lib/headlines'
import { setSport } from '../../lib/sport'

// THE PHONE'S PRODUCT SWITCHER (2026-10-06, audit X2). The phone header had
// no way to change sport short of More; the desktop header names the other
// products as small pills (HeaderShell, hidden under 760px). This is the
// phone's: one compact segmented control, MOONSHOT / TUDDY / LAMP (+ BUCKETS
// for a visitor who may see it, lib/useVisibleSports), the current product lit
// in its own accent (lib/sportAccent). It is the same pattern /start and
// /called draw (components/header/PublicHeader.js), here as buttons because
// on /app a sport is a state flip, not a navigation (lib/sport.js setSport).
//
// The current segment is the product's home button (what the wordmark was).
//
// BUCKETS never lights this dot: it has no live feed in the ticker (useLiveScores carries mlb,
// nfl and nhl only), so liveBy.nba stays empty. That is deliberate (2026-10-07, audit X3):
// no new polling for a dot. Leave it unlit.
// A small dot on another product's segment says that product has a game on
// right now ("live elsewhere"). That is where the other sports' scores went
// when each ticker stopped carrying them (lib/headlines.js ownSport). It
// asks only for the OTHER sports' feeds (the product's own ticker already
// holds its own), and only on a phone, where this control is on screen.
export default function SportSwitch({ sport, onHome }) {
  const visible = useVisibleSports()
  const [phone, setPhone] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia?.('(max-width: 760px)')
    if (!mq) return undefined
    const read = () => setPhone(mq.matches)
    read()
    mq.addEventListener?.('change', read)
    return () => mq.removeEventListener?.('change', read)
  }, [])
  const feed = useLiveScores({ mlb: phone && sport !== 'mlb', nfl: phone && sport !== 'nfl', nhl: phone && sport !== 'nhl' })
  const liveBy = {}
  for (const i of feed.items) if (i.live && i.kind === 'score') liveBy[i.sport] = (liveBy[i.sport] || 0) + 1

  return (
    <nav className="hdr-switch" aria-label="Switch product">
      {visible.map((k) => {
        const b = BRAND[k]
        const here = k === sport
        const n = here ? 0 : liveBy[k] || 0
        const col = SPORT_ACCENT[k]
        return (
          <button key={k} type="button" className={here ? 'hdr-sw on' : 'hdr-sw'} style={{ '--sw': col }}
            aria-current={here ? 'page' : undefined}
            title={here ? `${b.name} home` : `Switch to ${b.name} · ${b.league}${n ? ` — ${n} live now` : ''}`}
            aria-label={here ? `${b.name} home` : `Switch to ${b.name} · ${b.league}${n ? `, ${n} live now` : ''}`}
            onClick={() => (here ? onHome?.() : setSport(k))}>
            {b.name}
            {n > 0 && <i className="hdr-sw-live" aria-hidden="true" />}
          </button>
        )
      })}
    </nav>
  )
}
