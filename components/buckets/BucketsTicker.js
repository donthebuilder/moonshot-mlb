'use client'
import { useMemo, useRef } from 'react'
import TickerPill from '../TickerPill'
import { useAutoScroll } from '../../lib/headlines'
import { useBucketsBoard, useBucketsLeaders } from '../../lib/nba/useBuckets'
import { C, NUM_FONT } from '../../lib/nba/theme'
import { fmtDay } from './ui'
import { localTime } from '../../lib/localTime'

// 🏀 BUCKETS' MOVING HEADER -- LampTicker's shape (MOONSHOT's order: player
// bites, the slate, then the scores) on the same TickerPill and auto-scroll.
// Every pill is a field from a route; a pill whose field isn't there doesn't
// render (no estimate, no placeholder). Taps: a player opens his page, an NBA
// score its game, another sport's score switches product.
export default function BucketsTicker({ date = null, scores, liveScores, onOpenPlayer, onOpenGame }) {
  const board = useBucketsBoard(date)
  const leaders = useBucketsLeaders()
  const trackRef = useRef(null)
  useAutoScroll(trackRef, { speed: 55 })

  const items = useMemo(() => {
    const out = []
    const on = date ? ` · ${fmtDay(date).toUpperCase()}` : ''
    const top = (board.data?.rows || []).filter((r) => r.score != null).sort((a, b) => (a.nightRank ?? 9999) - (b.nightRank ?? 9999))[0]
    if (top) out.push({ k: 'top', icon: '🎯', label: `${top.locked ? "PTS BOARD'S #1" : "PTS BOARD'S #1 · PREVIEW"}${on}`, value: `${top.name} ${top.score}`, color: C.purple, title: 'Highest score on the night’s points board. PREVIEW until his game locks — a preview is not a call.', onClick: () => onOpenPlayer?.(top.playerId) })
    const pl = leaders.data?.categories?.find((c) => c.key === 'pts')?.leaders?.[0]
    if (pl) out.push({ k: 'ppg', icon: '🏀', label: `SCORING LEADER${leaders.data.seasonLabel ? ` · ${leaders.data.seasonLabel}` : ''}`, value: `${pl.name} ${pl.value}`, color: C.text, title: 'League points-per-game leader.', onClick: () => onOpenPlayer?.(pl.id) })
    const day = scores?.data
    if (day?.games) {
      out.push({ k: 'games', label: `GAMES${on}`, value: String(day.games.length), color: C.text2, title: 'Games on the day.' })
      if (day.live) out.push({ k: 'live', label: 'LIVE', value: String(day.live), color: C.rim, live: true, title: 'Games in progress.' })
    }
    for (const g of liveScores?.data?.games || []) {
      const a = g.away?.abbrev, h = g.home?.abbrev
      if (!a || !h) continue
      const score = `${a} ${g.away.score ?? 0} – ${g.home.score ?? 0} ${h}`
      if (g.state === 'live') out.push({ k: `nba-${g.id}`, icon: '🏀', label: g.detail || 'live', value: score, color: C.rim, live: true, onClick: () => onOpenGame?.(g.id) })
      else if (g.state === 'final') out.push({ k: `nba-${g.id}`, icon: '🏀', label: 'F', value: score, color: C.text3, onClick: () => onOpenGame?.(g.id) })
      else if (g.start) out.push({ k: `nba-${g.id}`, icon: '🏀', label: localTime(g.start), value: `${a} @ ${h}`, color: C.text3, onClick: () => onOpenGame?.(g.id) })
    }
    return out
  }, [date, board.data, leaders.data, scores?.data, liveScores?.data, onOpenPlayer, onOpenGame])

  if (!items.length) return null
  const Pill = ({ it, echo }) => <TickerPill sport={it.sport || 'nba'} label={it.label} value={it.value} icon={it.icon} color={it.color} live={it.live} title={it.title} echo={echo} onClick={it.onClick} theme={C} numFont={NUM_FONT} />
  return (
    <div className="hdr-scorebug buckets-ticker" ref={trackRef}
      style={{ overflowX: 'auto', overflowY: 'hidden', scrollbarWidth: 'none', lineHeight: 1, maxWidth: '100%',
        WebkitMaskImage: 'linear-gradient(90deg, transparent, black 10px, black calc(100% - 22px), transparent)', maskImage: 'linear-gradient(90deg, transparent, black 10px, black calc(100% - 22px), transparent)' }}>
      <div className="hdr-ticker-track" style={{ display: 'flex', width: 'max-content' }}>
        {items.map((it) => <Pill key={it.k} it={it} />)}
        {items.map((it) => <Pill key={`${it.k}-echo`} it={it} echo />)}
      </div>
    </div>
  )
}
