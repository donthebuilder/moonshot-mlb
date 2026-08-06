'use client'
import { useEffect, useRef, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { clean } from '../lib/player'

// 🎥 GAME COCKPIT — per-at-bat depth for the ONE game you're locked into.
//
// The wire tells you the slate; this tells you the game: count and outs
// right now, who's up / on deck / in the hole with pick badges, and the
// last several plate appearances with the ball off the bat (EV / distance)
// where it was tracked. Scoped hard on purpose — the full live feed is a
// heavy object, so it loads for ONE gamePk, only while this panel is open,
// 30s opt-in auto or the button. Self-hides pregame and postgame.

const FIELDS = 'gameData,status,abstractGameState,liveData,linescore,currentInning,isTopInning,inningState,outs,balls,strikes,offense,batter,onDeck,inHole,id,fullName,plays,allPlays,currentPlay,result,event,description,about,inning,halfInning,matchup,playEvents,isPitch,hitData,launchSpeed,launchAngle,totalDistance'

const primaryRole = (p) => String(p?.game_pick_role || '').split('/')[0].trim().toUpperCase()

export default function GameCockpit({ game, onPlayerClick }) {
  const gamePk = game?.game_pk
  const gp = game?.players || []
  const [data, setData] = useState(undefined)
  const [auto, setAuto] = useState(true)
  const timer = useRef(null)

  const pull = async () => {
    if (!gamePk) return
    const j = await fetch(`https://statsapi.mlb.com/api/v1.1/game/${gamePk}/feed/live?fields=${FIELDS}`)
      .then((r) => (r.ok ? r.json() : null)).catch(() => null)
    setData(j || null)
  }
  useEffect(() => { setData(undefined); pull() }, [gamePk])
  useEffect(() => {
    clearInterval(timer.current)
    const live = data?.gameData?.status?.abstractGameState === 'Live'
    if (auto && live) timer.current = setInterval(() => { if (!document.hidden) pull() }, 30000)
    return () => clearInterval(timer.current)
  }, [auto, data?.gameData?.status?.abstractGameState, gamePk])

  if (!gamePk || data === undefined || data === null) return null
  const state = data?.gameData?.status?.abstractGameState
  if (state !== 'Live') return null   // the cockpit is a live instrument only

  const ls = data?.liveData?.linescore || {}
  const plays = data?.liveData?.plays?.allPlays || []
  const cur = data?.liveData?.plays?.currentPlay
  const roleOf = {}
  gp.forEach((p) => { const id = Number(p?.player_id ?? p?.id); if (id) roleOf[id] = { role: primaryRole(p), p } })
  const badge = (id) => {
    const r = roleOf[Number(id)]
    return r?.role ? ` · 🤖 ${r.role}` : ''
  }
  const clickFor = (id) => { const r = roleOf[Number(id)]; if (r?.p) onPlayerClick?.(r.p) }

  const done = plays.filter((pl) => pl?.result?.event).slice(-7).reverse()
  const curPitches = (cur?.playEvents || []).filter((e) => e?.isPitch).length

  return (
    <div style={{
      background: 'linear-gradient(155deg, rgba(74,222,128,.05), rgba(9,9,11,.6))',
      border: '1px solid rgba(74,222,128,.28)', borderRadius: 11, padding: '9px 13px', marginBottom: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, flexWrap: 'wrap', marginBottom: 7 }}>
        <span style={{ fontSize: 11.5, fontWeight: 900, color: '#4ade80' }}>🎥 Cockpit · LIVE</span>
        <span style={{ fontSize: 10.5, fontFamily: NUM_FONT, color: C.text }}>
          {ls.inningState || (ls.isTopInning ? 'Top' : 'Bot')} {ls.currentInning ?? '?'} ·{' '}
          {ls.outs ?? 0} out{(ls.outs ?? 0) === 1 ? '' : 's'} · count {ls.balls ?? 0}-{ls.strikes ?? 0}
        </span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button onClick={() => setAuto((v) => !v)} style={{
            fontSize: 9, fontWeight: 700, fontFamily: NUM_FONT, cursor: 'pointer', borderRadius: 6, padding: '2px 8px',
            border: `1px solid ${auto ? '#4ade80' : C.border}`, background: auto ? 'rgba(74,222,128,.12)' : 'transparent',
            color: auto ? '#4ade80' : C.text3,
          }}>{auto ? '● auto 30s' : '○ auto'}</button>
          <button onClick={pull} style={{
            fontSize: 9, fontWeight: 700, fontFamily: NUM_FONT, cursor: 'pointer', borderRadius: 6, padding: '2px 8px',
            border: `1px solid ${C.border}`, background: 'transparent', color: C.text3,
          }}>↻</button>
        </span>
      </div>

      {/* at the plate / waiting — the due-up read, in order */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 10.5, fontFamily: NUM_FONT, marginBottom: 8 }}>
        {ls?.offense?.batter && (
          <span onClick={() => clickFor(ls.offense.batter.id)} style={{ cursor: roleOf[ls.offense.batter.id] ? 'pointer' : 'default' }}>
            <b style={{ color: '#4ade80' }}>🎤 {clean(ls.offense.batter.fullName, '?')}</b>
            <span style={{ color: C.text3 }}>{badge(ls.offense.batter.id)}{curPitches ? ` · pitch ${curPitches + 1}` : ''}</span>
          </span>
        )}
        {ls?.offense?.onDeck && (
          <span onClick={() => clickFor(ls.offense.onDeck.id)} style={{ color: C.text2, cursor: roleOf[ls.offense.onDeck.id] ? 'pointer' : 'default' }}>
            ⏳ {clean(ls.offense.onDeck.fullName, '?')}<span style={{ color: C.text3 }}>{badge(ls.offense.onDeck.id)}</span>
          </span>
        )}
        {ls?.offense?.inHole && (
          <span style={{ color: C.text3 }}>
            ³ {clean(ls.offense.inHole.fullName, '?')}{badge(ls.offense.inHole.id)}
          </span>
        )}
      </div>

      {/* the last plate appearances, ball-off-the-bat included */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {done.map((pl, i) => {
          const ev = (pl.playEvents || []).map((e) => e?.hitData).find((h) => h?.launchSpeed != null)
          const isHR = /home.?run/i.test(pl?.result?.event || '')
          const isHit = /single|double|triple/i.test(pl?.result?.event || '')
          const bid = pl?.matchup?.batter?.id
          return (
            <div key={i} onClick={() => clickFor(bid)} style={{
              display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 10, fontFamily: NUM_FONT,
              padding: '2px 6px', borderRadius: 5, minWidth: 0,
              background: isHR ? 'rgba(74,222,128,.08)' : 'transparent',
              cursor: roleOf[bid] ? 'pointer' : 'default',
            }}>
              <span style={{ color: C.text3, width: 26, flexShrink: 0 }}>{pl?.about?.halfInning === 'top' ? 'T' : 'B'}{pl?.about?.inning}</span>
              <span style={{ fontWeight: 700, color: isHR ? '#4ade80' : isHit ? C.text : C.text2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
                {clean(pl?.matchup?.batter?.fullName, '?').split(' ').slice(-1)[0]}
                <span style={{ color: C.orange, fontWeight: 800 }}>{badge(bid)}</span>
              </span>
              <span style={{ color: isHR ? '#4ade80' : isHit ? C.text2 : C.text3, whiteSpace: 'nowrap' }}>
                {isHR ? '💥 ' : ''}{String(pl?.result?.event || '').toLowerCase()}
              </span>
              {ev && (
                <span style={{ marginLeft: 'auto', color: Number(ev.launchSpeed) >= 95 ? C.orange : C.text3, flexShrink: 0 }}>
                  {Number(ev.launchSpeed).toFixed(1)} mph{ev.totalDistance ? ` · ${Number(ev.totalDistance).toFixed(0)} ft` : ''}
                </span>
              )}
            </div>
          )
        })}
      </div>
      <div style={{ fontSize: 8.5, color: C.text3, marginTop: 6, lineHeight: 1.45 }}>
        Last {done.length} plate appearances, newest first — EV and carry shown where tracked, orange when 95+.
        🤖 marks tonight&apos;s picks. One game, one feed, refreshed every 30s while open.
      </div>
    </div>
  )
}
