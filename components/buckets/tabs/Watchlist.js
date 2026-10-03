'use client'
import PageHeader from '../../PageHeader'
import FollowingStrip from '../../FollowingStrip'
import WatchRecord from '../../watch/WatchRecord'
import { C, NUM_FONT } from '../../../lib/nba/theme'

// ⭐ BUCKETS WATCHLIST -- LAMP's, from the same shared pieces: the Following
// strip and "Your nights, graded" (components/watch/WatchRecord.js) on
// BUCKETS' own bars. A player is yours for a night when you star him and his
// club plays (lib/nba/useBucketsSaves.js).
export default function Watchlist({ onOpenPlayer }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <PageHeader eyebrow="BUCKETS · WATCHLIST" title="Your players" theme={C} numFont={NUM_FONT} accent={C.purple}
        note="Star a player from his file and he lands here for his next game; the star clears after it. Every night you starred him counts below, graded off his own game log." />
      <FollowingStrip sport="nba" accent={C.purple} emptyText="Open any player’s file and tap ☆ Star — he lands here for his next game, and that night counts below." onPlayerClick={(row) => onOpenPlayer?.(row.id)} />
      <WatchRecord sport="nba" theme={C} accent={C.purple} onOpen={(r) => onOpenPlayer?.(r.id)} />
    </div>
  )
}
