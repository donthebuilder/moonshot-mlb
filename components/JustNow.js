'use client'
import { useEffect, useMemo, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { playerId } from '../lib/player'
import { fetchLiveSlate } from '../lib/liveSlate'
import { fetchSkinEvents } from '../lib/livePitches'

// 📻 JUST NOW — what happened to the names you have skin on.
//
// 2026-08-10, Donovan: "no context on what just happened. A homer, a
// strikeout, a hard-hit out — the page doesn't tell you the outcome of the
// at-bat you were just watching."
//
// The rail above tells you who is up. This tells you how it ended, for your
// picks and your watchlist only. See fetchSkinEvents() in lib/livePitches.js
// for why it is scoped that way and what the alternative cost.
//
// THE LOUD OUT IS THE POINT. A 108mph lineout goes into the box score as an
// out, and it is not the same as an out — it is the single most useful thing
// this feed can say, because it is the one thing you cannot learn from any
// other surface on the site. Exit velocity rides along whenever the play had
// a tracked ball, and anything at 100+ gets its own colour even when the
// result was a failure.
//
// 2026-08-13 — the slate-wide question ("who's squaring the ball up hardest,
// anywhere") briefly lived here as a second mode on this same rail. Donovan,
// a message later: "a whole new reconstruction... i don't like how the top
// of the page looks." One header silently meaning two different things on a
// toggle was part of that mess — this rail asks one question again ("what
// happened to MY guys") and the slate-wide one now has its own dedicated
// section, BattedBallLog, right above this. See that file for the reasoning
// on why it's a separate component and not a mode here.
//
// 2026-08-13, second pass, Donovan: "i dont like the design of the page how
// its like side ways" → confirmed target: this rail's horizontal scroll.
// WRAPS now instead, same ParkBoard cap+expand idiom as LiveAtBats right
// above it — this list is scoped to picks + watchlist so it's usually short,
// but a heavy skin night shouldn't turn into a wall either.
const DEFAULT_SHOWN = 6

const TONE_COL = {
  hr: '#f97316', xbh: '#FCD34D', hot: '#fb7185',
  on: '#4ade80', out: '#8b8b95', k: '#f87171',
}

// The league's event names are written for a box score, not for a glance.
const SHORT = (e) => String(e || '')
  .replace(/^Home Run$/i, 'HOME RUN')
  .replace(/^Strikeout.*/i, 'struck out')
  .replace(/^Groundout$/i, 'grounded out')
  .replace(/^Flyout$/i, 'flied out')
  .replace(/^Lineout$/i, 'lined out')
  .replace(/^Pop Out$/i, 'popped out')
  .replace(/^Forceout$/i, 'forced out')
  .replace(/^Field Error$/i, 'reached on error')
  .replace(/^Hit By Pitch$/i, 'hit by pitch')
  .replace(/^Sac Fly$/i, 'sac fly')
  .toLowerCase()
  .replace(/^home run$/, 'HOME RUN')

export default function JustNow({ players = [], watchIds, onPlayerClick, limit = 10 }) {
  const [rows, setRows] = useState([])
  const [showAll, setShowAll] = useState(false)

  // The ids worth spending a feed call on: designated picks and the
  // watchlist. Recomputed from the slate rather than stored, so a pick that
  // changes on a bot run is picked up without any bookkeeping here.
  const ids = useMemo(() => {
    const s = new Set()
    players.forEach((p) => {
      const tagged = String(p?.game_pick_role || '').trim()
      const watched = watchIds?.has(playerId(p))
      if (tagged || watched) s.add(Number(p?.player_id ?? p?.id))
    })
    return s
  }, [players, watchIds])

  const byId = useMemo(() => {
    const m = new Map()
    players.forEach((p) => m.set(Number(p?.player_id ?? p?.id), p))
    return m
  }, [players])

  useEffect(() => {
    // Nothing to poll for with no picks or watchlist — a rail that can never
    // have rows costs nothing to skip.
    if (!ids.size) { setRows([]); return undefined }
    let alive = true
    let t = null
    const pull = async () => {
      const snap = await fetchLiveSlate().catch(() => null)
      if (!alive || !snap) return
      const ev = await fetchSkinEvents(snap, ids, limit).catch(() => [])
      if (!alive) return
      setRows(ev)
      const anyLive = snap.games?.some((g) => g.state === 'Live')
      clearInterval(t)
      // 45s matches the feed cache, so this never asks for bytes it would be
      // handed from cache anyway. Idle when nothing is live — there is no
      // "just now" before first pitch.
      t = setInterval(() => { if (!document.hidden) pull() }, anyLive ? 45000 : 180000)
    }
    pull()
    return () => { alive = false; clearInterval(t) }
  }, [ids, limit])

  if (!rows.length) return null
  const visRows = showAll ? rows : rows.slice(0, DEFAULT_SHOWN)

  // TABLE, NOT CARDS (2026-08-14 restructure — Donovan: "the just now and
  // all that... should look better and more precise like how that chart is
  // at the bottom of the screen"). Same row grammar as At The Plate's
  // contact-tonight section: micro header, hairline separators, mono
  // numbers right-aligned, the loud thing in colour. The card version's
  // hard-won lessons carry over: name scans first, the 100+ mph out keeps
  // its own colour, and every row still opens his card.
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 5, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12.5, fontWeight: 900 }}>📻 Just now</span>
        <span style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT }}>
          finished at-bats — your picks and watchlist only
        </span>
      </div>

      <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: '7px 12px' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', paddingBottom: 3, borderBottom: `1px solid ${C.border}` }}>
          <span style={{ width: 34, flexShrink: 0, fontSize: 8, color: C.text3, fontFamily: NUM_FONT }}>INN</span>
          <span style={{ flex: 1, minWidth: 0, fontSize: 8, color: C.text3, fontFamily: NUM_FONT }}>PLAYER</span>
          <span style={{ flex: 1.1, minWidth: 0, fontSize: 8, color: C.text3, fontFamily: NUM_FONT }}>RESULT</span>
          <span style={{ width: 44, textAlign: 'right', flexShrink: 0, fontSize: 8, color: C.text3, fontFamily: NUM_FONT }}>EV</span>
        </div>
        {visRows.map((r, i) => {
          const col = TONE_COL[r.tone] || C.text3
          const p = byId.get(r.id) || null
          return (
            <div
              key={r.key}
              onClick={() => p && onPlayerClick?.(p)}
              className={p ? 'tap-row' : undefined}
              title={`${r.name} — ${r.event}${r.pitcher ? ` off ${r.pitcher}` : ''} · ${r.half} ${r.inning}${r.ev ? ` · ${Math.round(r.ev)}mph off the bat` : ''}`}
              style={{
                display: 'flex', gap: 8, alignItems: 'center', padding: '3.5px 0',
                cursor: p ? 'pointer' : 'default', minWidth: 0,
                borderBottom: i < visRows.length - 1 ? '1px solid rgba(255,255,255,.04)' : 'none',
              }}
            >
              <span style={{ width: 34, flexShrink: 0, fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT }}>
                {/^top/i.test(r.half) ? 'T' : 'B'}{r.inning}
              </span>
              <span style={{
                flex: 1, minWidth: 0, fontSize: 11, fontWeight: 700, color: C.text,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>{r.name}</span>
              <span style={{
                flex: 1.1, minWidth: 0, fontSize: 10, fontWeight: r.tone === 'hr' ? 900 : 700, color: col,
                fontFamily: NUM_FONT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                letterSpacing: '.02em',
              }}>{r.icon} {SHORT(r.event)}</span>
              <span style={{
                width: 44, textAlign: 'right', flexShrink: 0, fontSize: 10, fontFamily: NUM_FONT,
                fontWeight: (r.ev || 0) >= 100 ? 800 : 400,
                color: (r.ev || 0) >= 100 ? '#fb7185' : r.ev ? C.text2 : C.text3,
              }}>{r.ev ? Math.round(r.ev) : '·'}</span>
            </div>
          )
        })}
        {!showAll && rows.length > DEFAULT_SHOWN && (
          <button type="button" onClick={() => setShowAll(true)} style={{
            display: 'block', width: '100%', marginTop: 6, cursor: 'pointer',
            fontSize: 10, fontWeight: 800, color: C.text2, fontFamily: NUM_FONT,
            background: 'transparent', border: `1px dashed ${C.border2}`, borderRadius: 8,
            padding: '5px 10px', letterSpacing: '.02em',
          }}>Show all {rows.length} ▾</button>
        )}
      </div>
    </div>
  )
}
