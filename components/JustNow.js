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
    if (!ids.size) return undefined
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
                  flex: '0 0 auto', width: 168, textAlign: 'left',
                  cursor: p ? 'pointer' : 'default',
                  background: r.tone === 'hr' ? `${col}14` : C.bg2,
                  border: `1px solid ${r.tone === 'hr' || r.tone === 'hot' ? `${col}66` : C.border}`,
                  borderRadius: 10, padding: '6px 9px 7px', minWidth: 0,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, fontFamily: NUM_FONT }}>
                  <span style={{ fontSize: 10 }}>{r.icon}</span>
                  <span style={{ fontSize: 8.5, color: C.text3 }}>
                    {/^top/i.test(r.half) ? '▲' : '▼'}{r.inning}
                  </span>
                  {r.ev ? (
                    <span style={{ marginLeft: 'auto', fontSize: 9, fontWeight: 800, color: r.ev >= 100 ? '#fb7185' : C.text3 }}>
                      {Math.round(r.ev)}
                    </span>
                  ) : null}
                </div>
                <div style={{
                  fontSize: 11.5, fontWeight: 800, whiteSpace: 'nowrap',
                  overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 1,
                }}>{r.name}</div>
                <div style={{
                  fontSize: 9, fontWeight: r.tone === 'hr' ? 900 : 700, color: col,
                  fontFamily: NUM_FONT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>{SHORT(r.event)}</div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
