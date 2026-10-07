'use client'
import PageHeader from '../../PageHeader'
import FollowingStrip from '../../FollowingStrip'
import WatchRecord from '../../watch/WatchRecord'
import { C, NUM_FONT } from '../../../lib/nhl/theme'

// ⭐ LAMP WATCHLIST (2026-09-29, parity item 6: "WATCHLIST on LAMP"). Built
// from the pieces MOONSHOT's and TUDDY's watchlists already use -- the
// Following strip (your skaters, one tap to their file) and "Your nights,
// graded" (components/watch/WatchRecord.js) with LAMP's own bars: goal,
// point, 3+ shots on goal. A skater is yours for a night when you follow him
// and his club plays (lib/nhl/useLampSaves.js).
export default function Watchlist({ onOpenPlayer }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <PageHeader eyebrow="LAMP · WATCHLIST" title="Your skaters"
        note="Watch a skater from his file and he lands here for his next game; the watch clears after it. Every night you watched him counts below, graded off his own game log."
        theme={C} numFont={NUM_FONT} accent={C.ice} />
      <FollowingStrip sport="nhl" accent={C.ice} emptyText="Open any skater’s file and tap ☆ Watch — he lands here for his next game, and that night counts below." onPlayerClick={(row) => onOpenPlayer?.(row.id)} />
      <WatchRecord sport="nhl" theme={C} accent={C.ice} onOpen={(r) => onOpenPlayer?.(r.id)} />
    </div>
  )
}
