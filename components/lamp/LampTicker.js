'use client'
import { useMemo, useRef } from 'react'
import TickerPill from '../TickerPill'
import { useAutoScroll, useLiveScores } from '../../lib/headlines'
import { useLampBoard, useLampLeaders } from '../../lib/nhl/useLamp'
import { rankNight } from '../../lib/nhl/goalModel'
import { setSport } from '../../lib/sport'
import { C, NUM_FONT } from '../../lib/nhl/theme'
import { fmtDay } from './ui'

// 🏒 LAMP'S MOVING HEADER (2026-09-26, shell-parity step 1). The row MOONSHOT
// and TUDDY carry above their rails, in MOONSHOT's order -- player bites,
// the slate, BUILT, then the scores -- drawn with the same TickerPill and the
// same auto-scroll. Every pill is a field; its tooltip names the field; a
// pill whose field isn't there doesn't render (no estimate, no placeholder).
//
//   THE BOARD'S #1   /api/lamp/board   -> rankNight(games)[0] (name, score);
//                    PREVIEW until his game locks
//   GOALS LEADER     /api/lamp/leaders -> skaters.goals[0]
//   GAMES/LIVE/FINAL /api/lamp/scores  -> games.length, live, final
//   BUILT            /api/lamp/board   -> newest games[].lockedAt, else
//                    fetchedAt, labelled which one it is
//   scores           /api/lamp/scores  -> games[] (state, abbrevs, score,
//                    periodLabel, clock, startUtc); MLB and NFL from
//                    useLiveScores (the feed the other two tickers read)
//
// Taps: a skater opens his page, an NHL score its game, another sport's
// score switches product (setSport, same as the other two headers).
const hm = (iso) => { try { return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) } catch { return '' } }

export default function LampTicker({ date = null, scores, liveScores, onOpenPlayer, onOpenGame }) {
  const board = useLampBoard(date)
  const leaders = useLampLeaders()
  const others = useLiveScores({ nfl: true, nhl: false })
  const trackRef = useRef(null)
  useAutoScroll(trackRef, { speed: 55 })

  const items = useMemo(() => {
    const out = []
    // The board and the day's counts follow the header's day; the score pills
    // stay on what's live now. A picked day says so on its pills.
    const on = date ? ` · ${fmtDay(date).toUpperCase()}` : ''
    const games = board.data?.games || []
    const top = rankNight(games)[0]
    if (top) {
      out.push({
        k: 'top', icon: '🎯', label: `${top.stamp === 'preview' ? "THE BOARD'S #1 · PREVIEW" : "THE BOARD'S #1"}${on}`, value: `${top.name} ${top.score}`,
        color: C.ice, title: 'Highest score on the night’s board (/api/lamp/board, rankNight). PREVIEW until his game locks — a preview is not a call.',
        onClick: () => onOpenPlayer?.(top.playerId),
      })
    }
    const gl = leaders.data?.skaters?.goals?.[0]
    if (gl) {
      out.push({
        k: 'goals', icon: '🚨', label: `GOALS LEADER${leaders.data.seasonLabel ? ` · ${leaders.data.seasonLabel}` : ''}`, value: `${gl.name} ${gl.value}`,
        color: C.text, title: 'League goals leader, regular season (/api/lamp/leaders skaters.goals[0]).',
        onClick: () => onOpenPlayer?.(gl.id),
      })
    }
    const day = scores?.data
    if (day?.games) {
      out.push({ k: 'games', label: `GAMES${on}`, value: String(day.games.length), color: C.text2, title: 'Games on the day (/api/lamp/scores games).' })
      if (day.live) out.push({ k: 'live', label: 'LIVE', value: String(day.live), color: C.lamp, live: true, title: 'Games in progress (/api/lamp/scores live).' })
      if (day.final) out.push({ k: 'final', label: 'FINAL', value: String(day.final), color: C.text2, title: 'Games finished (/api/lamp/scores final).' })
    }
    const locks = games.map((g) => g.lockedAt).filter(Boolean).sort()
    if (locks.length) out.push({ k: 'built', label: 'LOCKED', value: hm(locks[locks.length - 1]), color: C.teal, title: `Newest lock on the board (/api/lamp/board games[].lockedAt): ${locks.length} of ${games.length} games locked.` })
    else if (board.data?.fetchedAt && games.length) out.push({ k: 'built', label: 'PREVIEW AS OF', value: hm(board.data.fetchedAt), color: C.amber, title: 'No game has locked yet — the board is a preview as of this read (/api/lamp/board fetchedAt).' })

    for (const g of liveScores?.data?.games || []) {
      const a = g.away?.abbrev; const h = g.home?.abbrev
      if (!a || !h) continue
      const score = `${a} ${g.away.score ?? 0} – ${g.home.score ?? 0} ${h}`
      if (g.state === 'live') out.push({ k: `nhl-${g.id}`, icon: '🏒', label: `${g.periodLabel || ''} ${g.clock || ''}`.trim() || 'live', value: score, color: C.lamp, live: true, onClick: () => onOpenGame?.(g.id) })
      else if (g.state === 'final') out.push({ k: `nhl-${g.id}`, icon: '🏒', label: 'F', value: score, color: C.text3, onClick: () => onOpenGame?.(g.id) })
      else if (g.state === 'pre' && g.startUtc) out.push({ k: `nhl-${g.id}`, icon: '🏒', label: hm(g.startUtc), value: `${a} @ ${h}`, color: C.text3, onClick: () => onOpenGame?.(g.id) })
    }
    for (const i of others.items) {
      if (i.kind !== 'score') continue
      out.push({ k: i.k, icon: i.icon, label: i.sub || (i.live ? 'live' : i.pregame ? 'soon' : 'F'), value: i.text, color: i.live ? C.teal : C.text3, live: i.live, onClick: () => setSport(i.sport) })
    }
    return out
  }, [date, board.data, leaders.data, scores?.data, liveScores?.data, others.items, onOpenPlayer, onOpenGame])

  if (!items.length) return null
  const Pill = ({ it, echo }) => (
    <TickerPill label={it.label} value={it.value} icon={it.icon} color={it.color} live={it.live} title={it.title} echo={echo} onClick={it.onClick} theme={C} numFont={NUM_FONT} />
  )
  return (
    <div className="hdr-scorebug lamp-ticker" ref={trackRef}
      style={{ overflowX: 'auto', overflowY: 'hidden', scrollbarWidth: 'none', lineHeight: 1, maxWidth: '100%',
        WebkitMaskImage: 'linear-gradient(90deg, transparent, black 10px, black calc(100% - 22px), transparent)', maskImage: 'linear-gradient(90deg, transparent, black 10px, black calc(100% - 22px), transparent)' }}>
      <div className="hdr-ticker-track" style={{ display: 'flex', width: 'max-content' }}>
        {items.map((it) => <Pill key={it.k} it={it} />)}
        {items.map((it) => <Pill key={`${it.k}-echo`} it={it} echo />)}
      </div>
    </div>
  )
}
