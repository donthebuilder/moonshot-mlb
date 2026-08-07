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
  // Browser notifications (2026-08-06): opt-in via the bell. When the tab is
  // hidden and permission is granted, toasts also fire as real OS
  // notifications — the Notification API is pure client-side, no server.
  const [notif, setNotif] = useState(() => {
    try {
      return typeof Notification !== 'undefined' && Notification.permission === 'granted'
        && localStorage.getItem('wire_notif') === 'on' ? 'on' : 'off'
    } catch { return 'off' }
  })
  const notifRef = useRef(notif)
  useEffect(() => { notifRef.current = notif }, [notif])
  const toggleNotif = async () => {
    if (notif === 'on') { setNotif('off'); try { localStorage.setItem('wire_notif', 'off') } catch {} ; return }
    if (typeof Notification === 'undefined') return
    const perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission()
    if (perm === 'granted') {
      setNotif('on'); notifRef.current = 'on'
      try { localStorage.setItem('wire_notif', 'on') } catch {}
      // Self-verifying arm (2026-08-06): "did it work?" answers itself — a
      // demo toast fires instantly, and the same event hits the OS so you
      // see both channels the moment you opt in.
      addToasts([{ key: `test:${Date.now()}`, icon: '🔔', pri: 0, p: null,
        text: 'Armed — homers, due-ups, bar clears and K-alerts pop here, and reach your desktop when this tab is hidden.' }])
    }
  }
  const prevRef = useRef(null)     // previous lines, for the diff
  const firedRef = useRef(new Set()) // dedupe keys across refreshes

  // MANUAL TOAST (2026-08-06): fire the site's own on-screen notification
  // from the browser console — built for streaming, where the site IS the
  // screen. Open devtools and: moonToast('hi 👋')  or  moonToast('big night
  // coming', '🔥'). Local to this browser only (no server, on purpose); it
  // rides the exact same toast + OS-notification pipeline as the real ones.
  useEffect(() => {
    window.moonToast = (text, icon = '👋') => {
      addToasts([{ key: `manual:${Date.now()}`, icon, text: String(text || 'hi'), p: null, pri: 0 }])
    }
    return () => { delete window.moonToast }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const addToasts = (items) => {
    if (!items.length) return
    setToasts((cur) => [...items, ...cur].slice(0, 4))
    // Bell on → homers and skin-on events also reach the OS. Originally this
    // only fired with the tab HIDDEN; in practice (2026-08-06) that read as
    // "I accepted notifications and got nothing" while watching the site —
    // so homers by picks/watchlist now notify regardless of tab visibility,
    // and everything else still waits for the tab to be in the background.
    if (notifRef.current === 'on' && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      const hidden = typeof document !== 'undefined' && document.hidden
      items.filter((t) => t.pri === 0 || (hidden && t.pri <= 2)).slice(0, 3).forEach((t) => {
        try { new Notification(`${t.icon} Moonshot`, { body: t.text, tag: t.key, silent: t.pri > 0 }) } catch {}
      })
    }
    items.forEach((t) => setTimeout(() => {
      setToasts((cur) => cur.filter((x) => x.key !== t.key))
    }, t.pri === 0 ? 15000 : 9000))
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
        const slateIds = new Map(players.map((p) => [Number(p?.player_id ?? p?.id), p]))
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
          // Big-bases night: 4+ TB crossing, only when it wasn't a fresh
          // homer doing the crossing (that toast already fired louder).
          if (now.tb >= 4 && was.tb < 4 && now.hr === was.hr) {
            fire('tb4', '🧨', `${nameOf(p)} is piling bases — ${now.tb} TB (${now.h}-${now.ab})`, 1)
          }
        })
        // ── EVERY slate homer toasts (2026-08-06). The wire chip updated but
        // no toast fired because the hitter wasn't a pick — which read as a
        // miss, not a filter. Homers are loud enough to earn a toast from
        // ANYONE on the slate; picks/watchlist keep priority styling + OS
        // notifications, everyone else is the quiet gray version. ──
        Object.entries(s.lines).forEach(([idStr, now]) => {
          const id = Number(idStr)
          const was = prev[id]
          if (!was || !(now.hr > was.hr)) return
          const p = slateIds.get(id)
          if (p && (primaryRole(p) || (watchIds || new Set()).has(pidOf(p)))) return // already handled above, full volume
          const key = `${id}:anyhr:${now.hr}`
          if (firedRef.current.has(key)) return
          firedRef.current.add(key)
          out.push({ key, icon: '💥', p: p || null, pri: 3,
            text: `${p ? nameOf(p) : (now.name || 'Someone')} goes deep${now.hr > 1 ? ` — that's ${now.hr}` : ''}` })
        })

        // ── DUE-UP: your pick is at the plate / on deck, right now ──
        const gameOf = {}
        s.games.forEach((g) => { gameOf[g.pk] = g })
        relevant.forEach((p) => {
          const id = Number(p?.player_id ?? p?.id)
          const g = gameOf[Number(p?.game_pk)]
          if (!g || g.state !== 'Live') return
          const role = primaryRole(p)
          const who = role ? `${role} pick` : 'watchlist'
          const slot = `${g.inning}${g.half}`
          if (g.upBatter === id) {
            const key = `${id}:up:${slot}`
            if (!firedRef.current.has(key)) { firedRef.current.add(key); out.push({ key, icon: '🎤', text: `UP NOW — ${nameOf(p)} (${who}) at the plate`, p, pri: 0.5 }) }
          } else if (g.onDeck === id) {
            const key = `${id}:od:${slot}`
            if (!firedRef.current.has(key)) { firedRef.current.add(key); out.push({ key, icon: '⏳', text: `${nameOf(p)} (${who}) is on deck`, p, pri: 1.5 }) }
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
          // TOP-right (2026-08-06, on request) — where the eye actually goes
          // for news. Offset clears the sticky header.
          position: 'fixed', right: 14, top: 74, zIndex: 300,
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
          <style>{'@keyframes wireToastIn { from { transform: translateY(-8px); opacity: 0 } to { transform: none; opacity: 1 } }'}</style>
        </div>
      )}

      {/* Scoreboard gets the bell alone — the full wire panel is right there,
          but the notifications toggle was unreachable on the landing tab,
          which is why "I accepted notis" never actually armed anything. */}
      {tab === 'scoreboard' && live.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
          <button onClick={toggleNotif} style={{
            display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer',
            background: notif === 'on' ? 'rgba(74,222,128,.08)' : 'transparent',
            border: `1px solid ${notif === 'on' ? 'rgba(74,222,128,.35)' : C.border}`,
            borderRadius: 999, padding: '3px 11px',
          }}>
            <span style={{ fontSize: 12 }}>{notif === 'on' ? '🔔' : '🔕'}</span>
            <span style={{ fontSize: 9.5, fontWeight: 700, fontFamily: NUM_FONT, color: notif === 'on' ? '#4ade80' : C.text3 }}>
              {notif === 'on' ? 'notifications on' : 'turn on notifications'}
            </span>
          </button>
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
          <span className="live-pulse" style={{ fontSize: 10.5, fontWeight: 900, color: '#4ade80' }}>📡 LIVE</span>
          <span style={{ fontSize: 10, color: C.text2, fontFamily: NUM_FONT }}>
            {live.length} game{live.length > 1 ? 's' : ''}
            {picks.length > 0 && <> · picks <b style={{ color: cleared ? '#4ade80' : C.text2 }}>{cleared}/{picks.length}</b> cleared</>}
            {hr > 0 && <> · <b style={{ color: C.orange }}>{hr} HR</b></>}
          </span>
          <span
            onClick={(e) => { e.stopPropagation(); toggleNotif() }}
            title={notif === 'on'
              ? 'Browser notifications ON — homers, due-ups and K-alerts reach you even with this tab in the background. Click to mute.'
              : 'Click to get browser notifications when this tab is in the background — homers, your pick due up, K-alerts. Opt-in, nothing leaves your device.'}
            style={{ marginLeft: 'auto', fontSize: 12, cursor: 'pointer', opacity: notif === 'on' ? 1 : 0.55 }}
          >{notif === 'on' ? '🔔' : '🔕'}</span>
          <span style={{ fontSize: 9, color: C.text3, fontFamily: NUM_FONT }}>open wire →</span>
        </button>
      )}
    </>
  )
}
