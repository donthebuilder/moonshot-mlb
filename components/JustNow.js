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

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 5, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12.5, fontWeight: 900 }}>📻 Just now</span>
        <span style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT }}>
          finished at-bats — your picks and watchlist only
        </span>
      </div>

      <div className="rail dense-scroll" style={{ overflowX: 'auto' }}>
        <div style={{ display: 'flex', gap: 7, minWidth: 'max-content', paddingBottom: 2 }}>
          {rows.map((r) => {
            const col = TONE_COL[r.tone] || C.text3
            const p = byId.get(r.id) || null
            return (
              <button
                key={r.key}
                type="button"
                onClick={() => p && onPlayerClick?.(p)}
                title={`${r.name} — ${r.event}${r.pitcher ? ` off ${r.pitcher}` : ''} · ${r.half} ${r.inning}${r.ev ? ` · ${Math.round(r.ev)}mph off the bat` : ''}`}
                style={{
                  flex: '0 0 auto', width: 176, textAlign: 'left',
                  cursor: p ? 'pointer' : 'default',
                  // color HAS to be set here. A <button> does not inherit text
                  // colour — it resets to the UA's `buttontext`, which is
                  // near-black, which on this page is invisible. Every name in
                  // this rail rendered as a dark smudge on the first night it
                  // was live. LiveAtBats set a colour on its name and survived;
                  // this one leaned on inheritance and did not.
                  color: C.text,
                  background: r.tone === 'hr' ? `${col}1a` : C.bg3,
                  border: `1px solid ${r.tone === 'hr' || r.tone === 'hot' ? `${col}77` : C.border2}`,
                  borderRadius: 10, padding: '7px 10px 8px', minWidth: 0,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, fontFamily: NUM_FONT }}>
                  <span style={{ fontSize: 10 }}>{r.icon}</span>
                  <span style={{ fontSize: 9, color: C.text2, fontWeight: 700 }}>
                    {/^top/i.test(r.half) ? '▲' : '▼'}{r.inning}
                  </span>
                  {r.ev ? (
                    <span title={`${Math.round(r.ev)} mph off the bat`}
                      style={{ marginLeft: 'auto', fontFamily: NUM_FONT, fontSize: 9.5, fontWeight: 800,
                        color: r.ev >= 100 ? '#fb7185' : C.text2 }}>
                      {Math.round(r.ev)}<span style={{ fontSize: 7.5, color: C.text3 }}> mph</span>
                    </span>
                  ) : null}
                </div>
                {/* NAME FIRST AND BIGGEST. You scan this rail for a name and
                    then read what happened to him — never the other way round.
                    The first version had them nearly the same size, with the
                    verb in the loud colour and the name in none at all. */}
                <div style={{
                  fontSize: 12.5, fontWeight: 800, whiteSpace: 'nowrap',
                  overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 2,
                  color: C.text, letterSpacing: '-.01em',
                }}>{r.name}</div>
                <div style={{
                  fontSize: 9.5, fontWeight: r.tone === 'hr' ? 900 : 700, color: col,
                  fontFamily: NUM_FONT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  textTransform: r.tone === 'hr' ? 'none' : 'uppercase', letterSpacing: '.02em',
                  marginTop: 1,
                }}>{SHORT(r.event)}</div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
