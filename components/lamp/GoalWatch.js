'use client'
import { useMemo } from 'react'
import { C, NUM_FONT } from '../../lib/nhl/theme'
import WatchBox from '../WatchBox'
import MobileFold from '../MobileFold'
import { useLampHotSticks } from '../../lib/nhl/useLamp'

// ── GOAL WATCH (2026-09-28, MLB-PARITY-BOARDS plan "ADDED 09-28") ──────────
// MOONSHOT's B2B WATCH box (components/WatchBox.js), LAMP's rows. Everyone
// here is a skater on tonight's board (status CALLED / ON THE BOARD); each
// row is a fact, disjoint so no name sits in two:
//   GOAL IN 2+ STRAIGHT  a goal in each of his last two games   (hot sticks'
//   SCORED LAST GAME     a goal in his last game, not above     spark, the
//                                                                league's own
//                                                                game rows)
//   2ND NIGHT OF A B2B   his club played yesterday (the board's spots.b2b)
// Hot sticks only has the new season once a skater has three games in it;
// before that it serves last April, and "scored last game" about April is
// not a fact about October -- so the two goal rows wait and the box says so.
// A card turns green "✓ SCORED AGAIN" when his game is graded with a goal
// (the board row's goals). No hit-rate claim: LAMP has no graded archive yet.
const CAP = 10

export function goalWatchLists(flat, hot) {
  const spark = new Map()
  if (hot && !hot.stale) for (const h of hot.rows || []) spark.set(String(h.id), h.spark || [])
  const byScore = (a, b) => (b.r.score ?? 0) - (a.r.score ?? 0)
  const goalsIn = (x, i) => Number(spark.get(String(x.r.playerId))?.[i]?.[0]) > 0
  const two = flat.filter((x) => goalsIn(x, 0) && goalsIn(x, 1)).sort(byScore)
  const twoIds = new Set(two.map((x) => x.r.playerId))
  const last = flat.filter((x) => goalsIn(x, 0) && !twoIds.has(x.r.playerId)).sort(byScore)
  const mine = (x) => { const s = x.g.spots; if (!s) return null; return x.g.game.home.abbrev === x.r.team ? s.home : s.away }
  const b2b = flat.filter((x) => Boolean(mine(x)?.b2b)).sort(byScore)
  return { two, last, b2b }
}

export default function GoalWatch({ flat = [], onOpenPlayer, date = null }) {
  // form as of the board's own night: games strictly before it (2026-10-06)
  const { data: hot, loading } = useLampHotSticks({ date })
  const { two, last, b2b } = useMemo(() => goalWatchLists(flat, hot), [flat, hot])
  if (!flat.length) return null
  const items = (list, hitText = '✓ SCORED AGAIN') => list.slice(0, CAP).map(({ r, g }) => ({
    key: `${g.game.id}|${r.playerId}`, tile: r.team, name: r.name,
    line: `goal score ${Math.round(r.score ?? 0)}`,
    hit: Boolean(g.graded && r.dressed !== false && Number(r.goals) > 0), hitText,
    onClick: () => onOpenPlayer?.(r.playerId),
  }))
  const label = (words, list) => `${words}${list.length > CAP ? ` · top ${CAP} of ${list.length}` : ''}`
  const waiting = hot?.stale
  const total = two.length + last.length
  // Folded on a phone like MOONSHOT's B2B Watch; open on a desktop.
  return (
    <MobileFold title="🔁 Goal Watch" count={total || b2b.length || null} accent={C.ice} rememberKey="fold_goalwatch_v1"
      summary={[two.length && `${two.length} goal in 2+ straight`, last.length && `${last.length} scored last game`, b2b.length && `${b2b.length} on a back-to-back`].filter(Boolean).join(' · ') || (waiting ? 'fills once this season has games' : 'nobody on a run tonight')}>
    <WatchBox logoSport="nhl"
      icon="🔁" title="GOAL WATCH" accent={C.ice} theme={C} numFont={NUM_FONT} ariaLabel="Goal watch"
      status={loading && !hot ? 'checking last games…' : waiting ? 'goal rows fill once this season has games' : total ? `${total} scored last time out` : 'nobody on the board scored last time out'}
      note="facts, not picks"
      rows={[
        { key: 'two', label: label('🔥 goal in 2+ straight', two), items: items(two) },
        { key: 'last', label: label('🚨 scored last game', last), items: items(last) },
        { key: 'b2b', label: label('🔁 2nd night of a back-to-back', b2b), accent: C.blue, items: items(b2b, '✓ SCORED TONIGHT') },
      ]}
      footer={waiting
        ? 'Goal rows fill once a skater has three games this season. The back-to-back row is tonight\u2019s schedule.'
        : 'Facts, not picks. A card turns green when he scores again tonight.'}
    />
    </MobileFold>
  )
}
