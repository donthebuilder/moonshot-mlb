'use client'
import { useMemo } from 'react'
import { C, NUM_FONT } from '../../lib/nba/theme'
import WatchBox from '../WatchBox'
import MobileFold from '../MobileFold'
import { useBucketsHot, useBucketsScores } from '../../lib/nba/useBuckets'
import { shiftDay } from './ui'

// ── BUCKET WATCH -- MOONSHOT's B2B WATCH box (components/WatchBox.js), LAMP's
// Goal Watch shape, BUCKETS' rows. Everyone here is on tonight's points board;
// each row is a fact, disjoint so no name sits in two:
//   25+ IN 2+ STRAIGHT  his last two games (his ESPN game log, hot hands)
//   25+ LAST GAME       his last game, not above
//   2ND NIGHT OF A B2B  his club played yesterday (yesterday's scoreboard)
// Before this season has games the logs are last season's, and "25 last game"
// about April is not a fact about October -- so the two log rows wait and the
// box says so. A card turns green when his game is graded with 25+. No
// hit-rate claim.
const CAP = 10

export default function BucketWatch({ rows = [], date = null, onOpenPlayer }) {
  const hot = useBucketsHot(date)
  const yday = useBucketsScores(shiftDay(date || new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }), -1))
  const lists = useMemo(() => {
    const on = rows.filter((r) => r.score != null && r.status !== 'off')
    const byScore = (a, b) => (b.score ?? 0) - (a.score ?? 0)
    const log = new Map(hot.data && !hot.data.stale ? hot.data.rows.map((h) => [String(h.playerId), h]) : [])
    const lastPts = (r) => { const s = log.get(String(r.playerId))?.spark || []; return s.length ? s[s.length - 1] : null }
    const two = on.filter((r) => (log.get(String(r.playerId))?.run25 || 0) >= 2).sort(byScore)
    const twoIds = new Set(two.map((r) => r.playerId))
    const last = on.filter((r) => !twoIds.has(r.playerId) && (lastPts(r) ?? 0) >= 25).sort(byScore)
    const played = new Set((yday.data?.games || []).flatMap((g) => [g.away.abbrev, g.home.abbrev]))
    const b2b = on.filter((r) => played.has(r.team)).sort(byScore)
    return { two, last, b2b }
  }, [rows, hot.data, yday.data])
  if (!rows.length) return null
  const { two, last, b2b } = lists
  const items = (list, hitText = '✓ 25+ AGAIN') => list.slice(0, CAP).map((r) => ({
    key: `${r.gameId}|${r.playerId}`, tile: r.team, name: r.name, line: `points score ${Math.round(r.score ?? 0)}`,
    hit: r.hit === true, hitText, onClick: () => onOpenPlayer?.(r.playerId),
  }))
  const label = (words, list) => `${words}${list.length > CAP ? ` · top ${CAP} of ${list.length}` : ''}`
  const waiting = hot.data?.stale
  const total = two.length + last.length
  return (
    <MobileFold title="🔁 Bucket Watch" count={total || b2b.length || null} accent={C.purple} rememberKey="fold_bucketwatch_v1"
      summary={[two.length && `${two.length} with 25+ in 2+ straight`, last.length && `${last.length} with 25+ last game`, b2b.length && `${b2b.length} on a back-to-back`].filter(Boolean).join(' · ') || (waiting ? 'fills once this season has games' : 'nobody on a run tonight')}>
      <WatchBox icon="🔁" title="BUCKET WATCH" accent={C.purple} theme={C} numFont={NUM_FONT} ariaLabel="Bucket watch"
        status={hot.loading && !hot.data ? 'checking last games…' : waiting ? 'the 25+ rows fill once this season has games' : total ? `${total} scored 25+ last time out` : 'nobody on the board scored 25+ last time out'}
        note="facts from each player's game log and yesterday's schedule · no hit-rate claim"
        rows={[
          { key: 'two', label: label('🔥 25+ in 2+ straight', two), items: items(two) },
          { key: 'last', label: label('🏀 25+ last game', last), items: items(last) },
          { key: 'b2b', label: label('🔁 2nd night of a back-to-back', b2b), accent: C.blue, items: items(b2b, '✓ 25+ TONIGHT') },
        ]}
        footer={waiting
          ? `The 25+ rows read each player's last games. Until this season gives him some, they stay empty rather than call ${hot.data?.seasonLabel ? `${hot.data.seasonLabel}'s` : 'last season’s'} final games his "last game". The back-to-back row is the schedule.`
          : 'Every row is a fact from his game log and the schedule, not a pick. No hit rate is claimed. A card turns green when his game is graded with 25+.'} />
    </MobileFold>
  )
}
