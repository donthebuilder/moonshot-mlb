'use client'
import { useEffect, useRef, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { nameOf, playerId as pidOf } from '../lib/player'
import { fetchLiveSlate, pickCleared } from '../lib/liveSlate'

// 📡 MINI WIRE + TOASTS — the live layer that follows you (2026-08-06).
//
// Strip: one line under the header on every tab but the Scoreboard while
// games run — count, picks cleared, homers. Click → the full wire.
//
// Toasts: pop-up notifications, and DELIBERATELY only for players you have
// skin on — the bot's designated picks and your watchlist. Toasting every
// double across fifteen games trains you to ignore toasts; these fire for:
//   💥 homer (always the loudest)
//   ✓  a pick CLEARING its own bar — which is what a double usually means
//      ("2B — CONTACT bar cleared"), so XBH news arrives as meaning
//   2B/3B by a watched or picked hitter
//   ⚠  strikeouts climbing on a pick (fires once, at the 2nd K hitless)
// Events come from diffing consecutive wire snapshots — zero extra API
// calls. Nothing replays on page load; only NEW events toast. Auto-dismiss
// 9s, newest on top, max 4, click-through to the player.

const primaryRole = (p) => String(p?.game_pick_role || '').split('/')[0].trim().toUpperCase()

export default function MiniWire({ players = [], watchIds, tab, onGo, onPlayerClick }) {
  const [snap, setSnap] = useState(null)
  const [toasts, setToasts] = useState([])
  const prevRef = useRef(null)     // previous lines, for the diff
  const firedRef = useRef(new Set()) // dedupe keys across refreshes

  const addToasts = (items) => {
    if (!items.length) return
    setToasts((cur) => [...items, ...cur].slice(0, 4))
    items.forEach((t) => setTimeout(() => {
      setToasts((cur) => cur.filter((x) => x.key !== t.key))
    }, 9000))
  }

  useEffect(() => {
    let alive = true
    let timer = null
    const pull = async () => {
      const s = await fetchLiveSlate()
      if (!alive || !s) return

      // ── the diff → toasts (skin-in-the-game players only) ──
      const prev = prevRef.current
      if (prev) {
        const watched = watchIds || new Set()
        const relevant = players.filter((p) => primaryRole(p) || watched.has(pidOf(p)))
        const out = []
        relevant.forEach((p) => {
          const id = Number(p?.player_id ?? p?.id)
          const now = s.lines[id]; const was = prev[id]
          if (!now || !was) return
          const role = primaryRole(p)
          const fire = (kind, icon, text, pri) => {
            const key = `${id}:${kind}:${now.hr}${now.d2}${now.d3}${now.k}${now.tb}`
            if (firedRef.current.has(key)) return
            firedRef.current.add(key)
            out.push({ key, icon, text, p, pri })
          }
          if (now.hr > was.hr) fire('hr', '💥', `${nameOf(p)} GOES YARD${now.hr > 1 ? ` — that's ${now.hr}` : ''}${role ? ` · ${role} pick ✓` : ''}`, 0)
          else {
            const clearedNow = role && pickCleared(role, now) === true && pickCleared(role, was) !== true
            if (now.d3 > was.d3) fire('d3', '🔥', `${nameOf(p)} TRIPLES${clearedNow ? ` — ${role} bar cleared ✓` : ''}`, 1)
            else if (now.d2 > was.d2) fire('d2', '⚡', `${nameOf(p)} doubles${clearedNow ? ` — ${role} bar cleared ✓` : ` · ${now.tb} TB`}`, 1)
            else if (clearedNow) fire('clr', '✓', `${nameOf(p)} clears the ${role} bar (${now.h}-${now.ab}${now.tb > 1 ? `, ${now.tb} TB` : ''})`, 1)
          }
          if (role && now.k >= 2 && was.k < 2 && now.h === 0) {
            fire('k', '⚠️', `${nameOf(p)} (${role} pick) is 0-${now.ab} with ${now.k} K — the strikeout script`, 2)
          }
        })
        out.sort((a, b) => a.pri - b.pri)
        addToasts(out.slice(0, 4))
      }
      prevRef.current = s.lines
      setSnap(s)

      const anyLive = s.games?.some((g) => g.state === 'Live')
      clearInterval(timer)
      if (anyLive) timer = setInterval(() => { if (!document.hidden) pull() }, 90000)
    }
    pull()
    return () => { alive = false; clearInterval(timer) }
    // players/watchIds are read fresh each pull via closure re-creation on change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players, watchIds])

  const live = snap?.games?.filter((g) => g.state === 'Live') || []

  // strip numbers
  const picks = players.filter((p) => primaryRole(p))
    .map((p) => ({ role: primaryRole(p), line: snap?.lines?.[Number(p?.player_id ?? p?.id)] }))
    .filter((x) => x.line)
  const cleared = picks.filter((x) => pickCleared(x.role, x.line) === true).length
  const hr = snap ? Object.values(snap.lines).reduce((a, l) => a + (l.hr || 0), 0) : 0

  return (
    <>
      {/* toast stack — fixed, above everything, never blocks the page */}
      {toasts.length > 0 && (
        <div style={{
          position: 'fixed', right: 14, bottom: 14, zIndex: 300,
          display: 'flex', flexDirection: 'column', gap: 7, maxWidth: 'min(340px, 90vw)',
        }}>
          {toasts.map((t) => (
            <div key={t.key}
              onClick={() => { onPlayerClick?.(t.p); setToasts((cur) => cur.filter((x) => x.key !== t.key)) }}
              style={{
                display: 'flex', gap: 8, alignItems: 'baseline', cursor: 'pointer',
                background: t.pri === 0 ? 'linear-gradient(135deg, rgba(74,222,128,.16), rgba(9,9,11,.97))' : 'rgba(9,9,11,.97)',
                border: `1px solid ${t.pri === 0 ? 'rgba(74,222,128,.5)' : t.pri === 2 ? 'rgba(248,113,113,.4)' : C.border2}`,
                borderRadius: 10, padding: '8px 12px',
                boxShadow: '0 8px 28px rgba(0,0,0,.5)',
                animation: 'wireToastIn .18s ease-out',
              }}>
              <span style={{ fontSize: 14, flexShrink: 0 }}>{t.icon}</span>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: C.text, lineHeight: 1.4 }}>{t.text}</span>
            </div>
          ))}
          <style>{'@keyframes wireToastIn { from { transform: translateY(8px); opacity: 0 } to { transform: none; opacity: 1 } }'}</style>
        </div>
      )}

      {/* the strip — hidden on the Scoreboard (full wire lives there) */}
      {tab !== 'scoreboard' && live.length > 0 && (
        <button onClick={onGo} title="Open the full Live Wire on the Scoreboard" style={{
          display: 'flex', alignItems: 'baseline', gap: 10, width: '100%', cursor: 'pointer',
          background: 'linear-gradient(90deg, rgba(74,222,128,.06), rgba(74,222,128,.015))',
          border: '1px solid rgba(74,222,128,.22)', borderRadius: 9,
          padding: '4px 12px', marginBottom: 10, textAlign: 'left',
        }}>
          <span style={{ fontSize: 10.5, fontWeight: 900, color: '#4ade80' }}>📡 LIVE</span>
          <span style={{ fontSize: 10, color: C.text2, fontFamily: NUM_FONT }}>
            {live.length} game{live.length > 1 ? 's' : ''}
            {picks.length > 0 && <> · picks <b style={{ color: cleared ? '#4ade80' : C.text2 }}>{cleared}/{picks.length}</b> cleared</>}
            {hr > 0 && <> · <b style={{ color: C.orange }}>{hr} HR</b></>}
          </span>
          <span style={{ marginLeft: 'auto', fontSize: 9, color: C.text3, fontFamily: NUM_FONT }}>open wire →</span>
        </button>
      )}
    </>
  )
}
