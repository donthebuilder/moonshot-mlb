'use client'
import { useEffect, useRef, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { notify, requestPermission, ensureWorker, installHint, canNotify } from '../lib/notify'
import { nameOf, playerId as pidOf } from '../lib/player'
import { fetchLiveSlate, pickCleared, fetchHrContext } from '../lib/liveSlate'

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

export default function MiniWire({ players = [], watchIds, tab, mode = 'today', onGo, onPlayerClick }) {
  // TOMORROW MODE (2026-08-08): the wire is a TONIGHT instrument. Grading
  // tomorrow's picks against tonight's boxscores by shared player_id would
  // be silent nonsense — dark is the honest state.
  //
  // MOVED BELOW THE HOOKS (2026-08-09): this early return sat ABOVE every
  // useState/useEffect in the file — a Rules of Hooks violation that makes
  // React throw "rendered fewer hooks than expected" the moment you flip
  // Today↔Tomorrow with the wire mounted. The guard now lives at the render
  // boundary, where it's just a display decision. `isTomorrow` also gates
  // the polling effect so tomorrow mode still does no work.
  const isTomorrow = mode === 'tomorrow'
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
    if (!canNotify()) return
    // iOS grants nothing to a plain tab — say so instead of appearing broken.
    const hint = installHint()
    if (hint) {
      addToasts([{ key: `ios:${Date.now()}`, icon: '📲', pri: 0, p: null, text: hint }])
      return
    }
    const perm = await requestPermission()
    if (perm === 'granted') {
      setNotif('on'); notifRef.current = 'on'
      try { localStorage.setItem('wire_notif', 'on') } catch {}
      // Self-verifying arm (2026-08-06): "did it work?" answers itself — a
      // demo toast fires instantly, and the same event hits the OS so you
      // see both channels the moment you opt in.
      addToasts([{ key: `test:${Date.now()}`, icon: '🔔', pri: 0, p: null,
        text: 'Armed — 💥 homers and 🎤 "your pick is batting NOW" reach you even while you\'re looking at the site. Bar clears, on-deck and K-alerts wait until the tab is hidden.' }])
    }
  }
  // Register early when permission is already granted, so the first alert of
  // the night doesn't have to wait on the worker installing.
  useEffect(() => { if (canNotify() && Notification.permission === 'granted') ensureWorker() }, [])

  const prevRef = useRef(null)     // previous lines, for the diff
  const firedRef = useRef(new Set()) // dedupe keys across refreshes

  // 📱 QUIETER ON A PHONE (2026-08-09, Donovan: "the on-screen notifications
  // on the phone may be too much" — while the OS notifications are the part
  // he loves).
  //
  // The two channels are deliberately NOT treated the same here. A stack of
  // four toasts is a corner of a desktop monitor and most of a phone screen:
  // at 340px wide and ~44px tall each, four of them plus the gaps cover
  // roughly 200px starting 74px down, which on a 390x844 phone is the entire
  // top third of the page — over the header, the tabs and the first rows of
  // whatever you were reading. That is the complaint.
  //
  // So on a phone the ON-SCREEN stack drops to two and clears faster. The OS
  // notification path below is untouched: same permission flow, same events,
  // same priority gates, same three-per-batch cap. Nothing about which events
  // notify changes on any device.
  const narrowRef = useRef(false)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined
    // pointer:coarse catches a big phone or a tablet in landscape, which the
    // width query alone would miss and which has the same problem.
    const mq = window.matchMedia('(max-width: 700px), (pointer: coarse)')
    const apply = () => { narrowRef.current = mq.matches }
    apply()
    if (mq.addEventListener) { mq.addEventListener('change', apply); return () => mq.removeEventListener('change', apply) }
    mq.addListener(apply)
    return () => mq.removeListener(apply)
  }, [])

  // ── CONTEXT ON EVERY BOMB (2026-08-08, the Real-app lesson). The base
  // toast fires instantly off the boxscore diff; HALF A SECOND later the
  // same toast upgrades in place with the statcast line and the story:
  // "💥 Olson GOES YARD — 434ft at 108mph · his 33rd · back-to-back
  // nights". One targeted feed call per fresh homer, never polled. If the
  // feed hasn't written hitData yet, the base toast simply stands — the
  // context is garnish, never a gate. ──
  const enrichHr = (key, gamePk, batterId, p, line) => {
    if (!gamePk) return
    fetchHrContext(gamePk, batterId).then((ctx) => {
      const bits = []
      if (ctx?.dist) bits.push(`${Math.round(ctx.dist)}ft${ctx.ev ? ` at ${Math.round(ctx.ev)}mph` : ''}`)
      else if (ctx?.ev) bits.push(`${Math.round(ctx.ev)}mph off the bat`)
      const szn = Number(p?.season_hr)
      if (Number.isFinite(szn) && szn >= 0 && line?.hr) {
        const nth = szn + line.hr
        if (nth > 0) bits.push(`his ${nth}${nth % 10 === 1 && nth % 100 !== 11 ? 'st' : nth % 10 === 2 && nth % 100 !== 12 ? 'nd' : nth % 10 === 3 && nth % 100 !== 13 ? 'rd' : 'th'}`)
      }
      if (Number(p?.games_since_last_hr) === 0 && line?.hr === 1) bits.push('back-to-back nights 🔁')
      if (!bits.length) return
      setToasts((ts) => ts.map((t) => t.key === key ? { ...t, text: `${t.text} — ${bits.join(' · ')}` } : t))
    }).catch(() => {})
  }

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
    const narrow = narrowRef.current
    // ON-SCREEN stack only. Four on a desktop, two on a phone.
    setToasts((cur) => [...items, ...cur].slice(0, narrow ? 2 : 4))
    // Bell on → homers and skin-on events also reach the OS. Originally this
    // only fired with the tab HIDDEN; in practice (2026-08-06) that read as
    // "I accepted notifications and got nothing" while watching the site —
    // so homers by picks/watchlist now notify regardless of tab visibility,
    // and everything else still waits for the tab to be in the background.
    if (notifRef.current === 'on' && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      const hidden = typeof document !== 'undefined' && document.hidden
      // AT THE PLATE NOTIFIES ALWAYS (2026-08-09, Donovan: "if a pick is at
      // the plate I need a noti"). pri 0.5 is the 🎤 up-now event; it used to
      // require a hidden tab, which meant the one alert with a SHELF LIFE —
      // he can only act on it during the at-bat — was the one most likely to
      // be withheld. Homers (0) and up-now (0.5) now always reach the OS;
      // everything else still waits for the tab to be in the background.
      // Through the SERVICE WORKER now, not `new Notification` (lib/notify).
      // The page API is unreliable on Android and dies when the phone freezes
      // the tab — which is precisely the case these alerts exist for.
      items.filter((t) => t.pri <= 0.5 || (hidden && t.pri <= 2)).slice(0, 3).forEach((t) => {
        notify({ title: `${t.icon} Moonshot`, body: t.text, tag: t.key, silent: t.pri > 0.5 })
      })
    }
    // Dwell. Shorter on a phone, and homers still get roughly double
    // everything else because a homer is the one you want to actually read.
    // The OS notification stays on the lock screen either way, so a toast
    // that clears early on a phone loses nothing.
    items.forEach((t) => setTimeout(() => {
      setToasts((cur) => cur.filter((x) => x.key !== t.key))
    }, t.pri === 0 ? (narrow ? 9000 : 15000) : (narrow ? 5000 : 9000)))
  }

  useEffect(() => {
    let alive = true
    let timer = null
    if (isTomorrow) return () => { alive = false }
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
          if (now.hr > was.hr) {
            const hrKey = `${id}:hr:${now.hr}${now.d2}${now.d3}${now.k}${now.tb}`
            fire('hr', '💥', `${nameOf(p)} GOES YARD${now.hr > 1 ? ` — that's ${now.hr}` : ''}${role ? ` · ${role} pick ✓` : ''}`, 0)
            enrichHr(hrKey, now.pk, id, p, now)
          }
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
          enrichHr(key, now.pk, id, p, now)
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
            if (!firedRef.current.has(key)) {
              firedRef.current.add(key)
              // name the arm and the count-of-outs context so the alert is
              // actionable on a phone lock screen without opening the site
              const arm = String(p?.pitcher_name || '').split(' ').slice(-1)[0]
              out.push({
                key, icon: '🎤', p, pri: 0.5,
                text: `UP NOW — ${nameOf(p)} (${who}) batting${arm ? ` vs ${arm}` : ''} · ${g.half}${g.inning}`,
              })
            }
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

      // CADENCE (2026-08-09): 90s was fine for homers — they stay true — but
      // an at-bat lasts ~3-4 minutes, so a 90s poll could surface "UP NOW"
      // after he'd already swung. 35s while anything is live keeps the
      // at-the-plate alert inside the window it's actionable in. Still only
      // polls a visible tab; still one call for the whole slate.
      const anyLive = s.games?.some((g) => g.state === 'Live')
      clearInterval(timer)
      if (anyLive) timer = setInterval(() => { if (!document.hidden) pull() }, 35000)
    }
    pull()
    return () => { alive = false; clearInterval(timer) }
    // players/watchIds are read fresh each pull via closure re-creation on change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players, watchIds])

  if (isTomorrow) return null   // render boundary — hooks above all ran
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
        <div style={{
          display: 'flex', alignItems: 'baseline', gap: 10, width: '100%',
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
          <button
            onClick={onGo}
            title="Open the full Live Wire on the Scoreboard"
            style={{
              fontSize: 9, color: '#4ade80', fontFamily: NUM_FONT, fontWeight: 800,
              cursor: 'pointer', background: 'transparent',
              border: '1px solid rgba(74,222,128,.3)', borderRadius: 6, padding: '2px 8px',
            }}
          >open wire →</button>
        </div>
      )}
    </>
  )
}
