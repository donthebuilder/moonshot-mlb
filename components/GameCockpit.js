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

// NOTE (2026-08-09): `fields` is a WHITELIST — anything not named here is
// stripped by the server. That's exactly how the due-up alert stayed dead for
// weeks (offense/batter were never requested). This list is the cockpit's own
// keys only; the live charts on At the Plate fetch their own field list
// through lib/livePitches.
const FIELDS = 'gameData,status,abstractGameState,teams,abbreviation,liveData,linescore,currentInning,isTopInning,inningState,outs,balls,strikes,offense,batter,onDeck,inHole,first,second,third,home,away,runs,id,fullName,plays,allPlays,currentPlay,result,event,description,about,inning,halfInning,matchup,playEvents,isPitch,hitData,launchSpeed,launchAngle,totalDistance'

const primaryRole = (p) => String(p?.game_pick_role || '').split('/')[0].trim().toUpperCase()

// Result → plain words + a color that MEANS something (2026-08-08, "make
// better and more intuitive"): green = on base, red-dim = out, blue = free
// pass. The raw feed says "grounded_into_double_play"; a human says GIDP.
const RESULT_STYLE = [
  [/home.?run/i,            { icon: '💥', word: 'HOMER', col: '#4ade80', bold: true }],
  [/triple/i,               { icon: '●', word: 'triple', col: '#4ade80' }],
  [/double(?!.?play)/i,     { icon: '●', word: 'double', col: '#4ade80' }],
  [/single/i,               { icon: '●', word: 'single', col: '#4ade80' }],
  [/intent.?walk/i,         { icon: '◦', word: 'IBB', col: '#60a5fa' }],
  [/walk|hit.?by.?pitch/i,  { icon: '◦', word: 'walk', col: '#60a5fa' }],
  [/strikeout|struck/i,     { icon: '✕', word: 'K', col: 'rgba(248,113,113,.75)' }],
  [/double.?play|gidp/i,    { icon: '✕', word: 'GIDP', col: 'rgba(248,113,113,.75)' }],
  [/sac/i,                  { icon: '·', word: 'sac', col: null }],
  [/error/i,                { icon: '·', word: 'reached on error', col: '#FCD34D' }],
]
const styleFor = (event) => {
  for (const [re, s] of RESULT_STYLE) if (re.test(event || '')) return s
  return { icon: '·', word: String(event || '').toLowerCase().replace(/_/g, ' '), col: null }
}

// Last name only — keeps a loaded-bases line short next to the score and
// count. Same helper as AtThePlate.js's Situation, kept local since the two
// files don't share a component module for this.
const lastOf = (full) => {
  const t = String(full || '').trim()
  return t.split(/\s+/).pop() || t
}

// ◆ = runner on. Second base sits on top — it reads like the field.
//
// 2026-08-18, Donovan: "id like to know who on the base if there are
// runners on." off.first/second/third already carry fullName straight off
// the verified live feed (same object the due-up alert reads) — the diamond
// said THAT a base was occupied but only a hover tooltip ever said WHO. Now
// a small line prints the names beneath the diamond whenever anyone's on;
// nothing prints when the bases are empty, same as before.
function Bases({ off }) {
  const on = (b) => !!(off?.[b]?.id)
  const nameOn = (b) => off?.[b]?.fullName || ''
  const d = (filled) => ({
    width: 7, height: 7, transform: 'rotate(45deg)', borderRadius: 1.5,
    background: filled ? '#FCD34D' : 'transparent',
    border: `1.5px solid ${filled ? '#FCD34D' : 'rgba(255,255,255,.25)'}`,
  })
  const runners = [
    on('first') && ['1B', nameOn('first')],
    on('second') && ['2B', nameOn('second')],
    on('third') && ['3B', nameOn('third')],
  ].filter(Boolean)
  const who = runners.map(([b, nm]) => `${b} ${nm || '?'}`).join(' · ')
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 1, alignItems: 'flex-start' }}>
      <span title={`Bases: ${who || 'empty'}`}
        style={{ display: 'inline-grid', gridTemplateColumns: '9px 9px 9px', gridTemplateRows: '9px 9px', alignItems: 'center', justifyItems: 'center', verticalAlign: 'middle' }}>
        <span /><span style={d(on('second'))} /><span />
        <span style={d(on('third'))} /><span /><span style={d(on('first'))} />
      </span>
      {runners.length > 0 && (
        <span style={{ fontSize: 7.5, color: '#FCD34D', fontFamily: NUM_FONT, whiteSpace: 'nowrap', fontWeight: 700, lineHeight: 1.2 }}>
          {runners.map(([b, nm]) => `${b} ${nm ? lastOf(nm) : '?'}`).join(' · ')}
        </span>
      )}
    </span>
  )
}

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
      background: `linear-gradient(155deg, ${C.green}0d, ${C.bg2})`,
      border: '1px solid rgba(74,222,128,.28)', borderRadius: 11, padding: '9px 13px', marginBottom: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, flexWrap: 'wrap', marginBottom: 7 }}>
        <span style={{ fontSize: 11.5, fontWeight: 900, color: '#4ade80' }}>🔴 Live At-Bats</span>
        {/* the score — somehow missing from a live game panel until now */}
        {(() => {
          const gt = data?.gameData?.teams || {}
          const aR = ls?.teams?.away?.runs, hR = ls?.teams?.home?.runs
          if (aR == null && hR == null) return null
          return (
            <span style={{ fontSize: 11, fontWeight: 900, fontFamily: NUM_FONT, color: C.text }}>
              {gt?.away?.abbreviation || 'AWY'} {aR ?? 0}–{hR ?? 0} {gt?.home?.abbreviation || 'HOM'}
            </span>
          )
        })()}
        <span style={{ fontSize: 10.5, fontFamily: NUM_FONT, color: C.text2, display: 'flex', alignItems: 'center', gap: 7 }}>
          <span>{ls.inningState || (ls.isTopInning ? 'Top' : 'Bot')} {ls.currentInning ?? '?'}</span>
          {/* outs as dots — read at a glance, no words needed */}
          <span title={`${ls.outs ?? 0} out${(ls.outs ?? 0) === 1 ? '' : 's'}`} style={{ letterSpacing: 2, color: '#f87171', fontSize: 9 }}>
            {'●'.repeat(Math.min(3, ls.outs ?? 0))}<span style={{ color: 'rgba(255,255,255,.2)' }}>{'●'.repeat(Math.max(0, 3 - (ls.outs ?? 0)))}</span>
          </span>
          <Bases off={ls?.offense} />
          <span><b style={{ color: C.text }}>{ls.balls ?? 0}-{ls.strikes ?? 0}</b> count</span>
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

      {/* the batter spotlight + who's coming — labeled, in order */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
        {ls?.offense?.batter && (
          <span onClick={() => clickFor(ls.offense.batter.id)} style={{
            display: 'inline-flex', alignItems: 'baseline', gap: 6,
            cursor: roleOf[ls.offense.batter.id] ? 'pointer' : 'default',
            background: 'rgba(74,222,128,.10)', border: '1px solid rgba(74,222,128,.4)',
            borderRadius: 8, padding: '4px 11px',
          }}>
            <span style={{ fontSize: 11 }}>🎤</span>
            <b style={{ fontSize: 12.5, color: C.text }}>{clean(ls.offense.batter.fullName, '?')}</b>
            <span style={{ fontSize: 9.5, color: C.orange, fontWeight: 900, fontFamily: NUM_FONT }}>{badge(ls.offense.batter.id).replace(' · ', '')}</span>
            {curPitches > 0 && <span style={{ fontSize: 9, color: C.text3, fontFamily: NUM_FONT }}>pitch {curPitches + 1}</span>}
          </span>
        )}
        <span style={{ fontSize: 10, fontFamily: NUM_FONT, color: C.text3, display: 'flex', gap: 10 }}>
          {ls?.offense?.onDeck && (
            <span onClick={() => clickFor(ls.offense.onDeck.id)} style={{ cursor: roleOf[ls.offense.onDeck.id] ? 'pointer' : 'default' }}>
              <span style={{ fontSize: 7.5, fontWeight: 900, letterSpacing: '.08em', color: C.text3 }}>NEXT </span>
              <b style={{ color: C.text2 }}>{clean(ls.offense.onDeck.fullName, '?')}</b>{badge(ls.offense.onDeck.id)}
            </span>
          )}
          {ls?.offense?.inHole && (
            <span>
              <span style={{ fontSize: 7.5, fontWeight: 900, letterSpacing: '.08em' }}>THEN </span>
              {clean(ls.offense.inHole.fullName, '?')}{badge(ls.offense.inHole.id)}
            </span>
          )}
        </span>
      </div>

      {/* THE CHARTS LEFT THIS PANEL (2026-08-10, Donovan: "you can remove the
          spray and zone from the live at-bats on the games page"). The cockpit
          is the count / outs / bases / last-PAs instrument and nothing else —
          the zone map and spray chart, now carrying the live feed themselves,
          live on the At the Plate tab where there's room to read them. */}

      {/* the last plate appearances, ball-off-the-bat included */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {done.map((pl, i) => {
          const ev = (pl.playEvents || []).map((e) => e?.hitData).find((h) => h?.launchSpeed != null)
          const st = styleFor(pl?.result?.event)
          const bid = pl?.matchup?.batter?.id
          const evN = ev ? Number(ev.launchSpeed) : null
          const distN = ev?.totalDistance ? Number(ev.totalDistance) : null
          const onBase = st.col === '#4ade80' || st.col === '#60a5fa' || st.col === '#FCD34D'
          return (
            <div key={i} onClick={() => clickFor(bid)} style={{
              display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 10, fontFamily: NUM_FONT,
              padding: '2px 6px', borderRadius: 5, minWidth: 0,
              background: st.bold ? 'rgba(74,222,128,.09)' : 'transparent',
              borderLeft: `2px solid ${onBase ? (st.col + '88') : 'transparent'}`,
              cursor: roleOf[bid] ? 'pointer' : 'default',
            }}>
              <span style={{ color: C.text3, width: 26, flexShrink: 0 }}>{pl?.about?.halfInning === 'top' ? 'T' : 'B'}{pl?.about?.inning}</span>
              <span style={{ fontWeight: 700, color: onBase ? C.text : C.text2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
                {clean(pl?.matchup?.batter?.fullName, '?').split(' ').slice(-1)[0]}
                <span style={{ color: C.orange, fontWeight: 800 }}>{badge(bid)}</span>
              </span>
              <span style={{ color: st.col || C.text3, fontWeight: st.bold ? 900 : 600, whiteSpace: 'nowrap' }}>
                {st.icon} {st.word}
              </span>
              {/* ball off the bat: EV always when tracked; distance only when
                  it MEANS something (200+ ft) — "67 ft" on a chopper was
                  noise wearing a number's clothes */}
              {ev && (
                <span style={{ marginLeft: 'auto', flexShrink: 0, color: evN >= 100 ? '#f87171' : evN >= 95 ? C.orange : C.text3, fontWeight: evN >= 95 ? 800 : 400 }}>
                  {evN.toFixed(1)}{distN >= 200 ? ` · ${distN.toFixed(0)} ft` : ''}
                </span>
              )}
            </div>
          )
        })}
      </div>
      <div style={{ fontSize: 8.5, color: C.text3, marginTop: 6, lineHeight: 1.45 }}>
        Last {done.length} PAs, newest first. <span style={{ color: '#4ade80' }}>Green edge = reached base</span> ·
        ✕ = out · exit velo when tracked (<span style={{ color: C.orange }}>orange 95+</span>, <span style={{ color: '#f87171' }}>red 100+</span>),
        distance only on real carry (200+ ft). ◆ = runner on. 🤖 = tonight&apos;s picks. One game, one feed, 30s refresh while open.
      </div>
    </div>
  )
}
