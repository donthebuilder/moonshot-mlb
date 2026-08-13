'use client'
import { useEffect, useMemo, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { playerId } from '../lib/player'
import { fetchLiveSlate } from '../lib/liveSlate'
import { fetchSkinEvents, fetchHardHitLog } from '../lib/livePitches'

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
// 🔥 HARDEST HIT toggle (2026-08-13, Donovan: "add like a rolling ev log of
// the hard hits of the live games and todays games"). Same rail, same card,
// a second mode: instead of "what happened to MY guys," it asks "who's
// squaring the ball up hardest, anywhere on the slate" — every live AND
// final game today, not just picks/watchlist. See fetchHardHitLog() for why
// that's fine to pay for here when the identical unscoped cost was rejected
// for the mode above — "most of it about strangers" was a complaint there
// and is the entire point here. Off by default, so nobody's page gets
// busier who doesn't tap it.
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
  const [mode, setMode] = useState('skin')
  const [rows, setRows] = useState([])
  // Whether today's slate has anything live or final yet — separate from
  // rows.length so the toggle stays reachable even when the CURRENT mode
  // happens to have zero rows (e.g. nobody's gone 95+ yet tonight).
  const [hasGames, setHasGames] = useState(false)

  // The ids worth spending a feed call on in skin mode: designated picks and
  // the watchlist. Recomputed from the slate rather than stored, so a pick
  // that changes on a bot run is picked up without any bookkeeping here.
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
    // Skin mode still costs nothing to skip with no picks or watchlist —
    // no reason to poll for a rail that can never have rows. Hard-hit mode
    // has no such out: it was never about who YOU have skin on.
    if (mode === 'skin' && !ids.size) { setRows([]); return undefined }
    let alive = true
    let t = null
    const pull = async () => {
      const snap = await fetchLiveSlate().catch(() => null)
      if (!alive || !snap) return
      setHasGames((snap.games || []).some((g) => g.state === 'Live' || g.state === 'Final'))
      const ev = mode === 'hardhit'
        ? await fetchHardHitLog(snap, limit).catch(() => [])
        : await fetchSkinEvents(snap, ids, limit).catch(() => [])
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
  }, [mode, ids, limit])

  if (!rows.length && !hasGames) return null

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12.5, fontWeight: 900 }}>
          {mode === 'hardhit' ? '🔥 Hardest hit' : '📻 Just now'}
        </span>
        <span style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT }}>
          {mode === 'hardhit'
            ? '95+ mph off the bat — every live and final game tonight'
            : 'finished at-bats — your picks and watchlist only'}
        </span>
        <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
          <button onClick={() => setMode('skin')} style={{
            fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 999, cursor: 'pointer',
            border: `1px solid ${mode === 'skin' ? C.orange : C.border2}`,
            background: mode === 'skin' ? 'rgba(249,115,22,.12)' : 'transparent',
            color: mode === 'skin' ? C.orange : C.text3,
          }}>📻 Mine</button>
          <button onClick={() => setMode('hardhit')} style={{
            fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 999, cursor: 'pointer',
            border: `1px solid ${mode === 'hardhit' ? '#fb7185' : C.border2}`,
            background: mode === 'hardhit' ? 'rgba(251,113,133,.12)' : 'transparent',
            color: mode === 'hardhit' ? '#fb7185' : C.text3,
          }}>🔥 Hardest hit</button>
        </div>
      </div>

      {!rows.length ? (
        <div style={{ fontSize: 10, color: C.text3, fontStyle: 'italic' }}>
          {mode === 'hardhit' ? 'Nothing at 95+ yet tonight.' : 'Nothing finished yet for your picks or watchlist.'}
        </div>
      ) : (
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
      )}
    </div>
  )
}
