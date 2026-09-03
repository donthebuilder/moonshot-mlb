'use client'
import { useEffect, useRef, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { notify, requestPermission, ensureWorker, installHint, canNotify } from '../lib/notify'
import { alertPrefs, alertWanted, setAlertMaster, ALERTS_EVENT } from '../lib/dash/alerts'
import { nameOf, playerId as pidOf } from '../lib/player'
import { fetchLiveSlate, pickCleared, fetchHrContext, lineupStatus } from '../lib/liveSlate'
import LiveWire from './LiveWire'

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

// ── CLICKING THE WIRE STOPS MOVING YOU (2026-08-22, pass 2) ────────────────
//
// Donovan: "Live Wire: clicking it takes you back to Rundown — I don't like
// that. It should stay where it is."
//
// The strip's one button called onGo, which is setTab('scoreboard'). So the
// live layer that exists precisely BECAUSE it follows you around the site
// answered a click by leaving the page you were on — and there was no way
// back except the tab bar. If you were mid-read on Combos, the wire cost you
// your place to tell you one thing.
//
// It now OPENS IN PLACE: the same full <LiveWire> panel, rendered under the
// strip, on whatever tab you are standing on. `onGo` survives as a secondary
// link for when Rundown is genuinely where you want to be — nothing was
// removed, the default just stopped being the destructive one.
export default function MiniWire({
  players = [], watchIds, tab, mode = 'today', onGo, onPlayerClick,
  // Passed through to the in-place panel so it renders the same wire the
  // Rundown does rather than a degraded copy of it.
  results = null, odds = null,
}) {
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
  // ⚠️ HYDRATION (fixed 2026-08-09, repo bug scan). This was a lazy useState
  // initializer that read Notification.permission and localStorage. Both of
  // those run on the SERVER during SSR, where neither exists — the try/catch
  // stopped the crash but not the real problem: the server rendered 'off' and
  // the client rendered 'on', so React hydrated a tree that didn't match the
  // HTML and silently discarded it.
  //
  // Every other per-device flag on this site already does it the right way and
  // says so in a comment ("set in an effect rather than read during render, so
  // the server and the first client render agree"). This one didn't. Same
  // pattern now: start 'off', correct it after mount.
  const [notif, setNotif] = useState('off')
  // Open-in-place, per session. Not persisted: the wire opening itself on
  // every tab change would be the same intrusion as navigating away.
  const [wireOpen, setWireOpen] = useState(false)
  useEffect(() => {
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted'
          && localStorage.getItem('wire_notif') === 'on') setNotif('on')
    } catch { /* private mode, or no Notification API */ }
  }, [])
  const notifRef = useRef(notif)
  useEffect(() => { notifRef.current = notif }, [notif])
  // The /dash Alerts panel writes the same master switch. Without this the
  // bell would keep showing its old face until a reload.
  useEffect(() => {
    const sync = () => setNotif(alertPrefs().on ? 'on' : 'off')
    window.addEventListener(ALERTS_EVENT, sync)
    return () => window.removeEventListener(ALERTS_EVENT, sync)
  }, [])
  const toggleNotif = async () => {
    // Through setAlertMaster so the bell and the /dash Alerts panel are the
    // same switch rather than two that disagree.
    if (notif === 'on') { setNotif('off'); setAlertMaster(false); return }
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
      setAlertMaster(true)
      // Self-verifying arm (2026-08-06): "did it work?" answers itself — a
      // demo toast fires instantly, and the same event hits the OS so you
      // see both channels the moment you opt in.
      addToasts([{ key: `test:${Date.now()}`, icon: '🔔', pri: 0, p: null,
        text: 'Armed. Homers and "your pick is up now" reach you even while you\'re looking at the site. Bar clears, on-deck and K-alerts wait until the tab is hidden. Choose which ones on DASH Home → Alerts.' }])
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
  // A REF CANNOT MOVE A RENDER (2026-08-23). narrowRef exists for the toast
  // BUDGET, which is read inside an effect, so a ref was right for it. The
  // gate below is read while RENDERING, and a ref that changes never
  // re-renders anything — so the samemedia query is also kept in state.
  const [narrow, setNarrow] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined
    // pointer:coarse catches a big phone or a tablet in landscape, which the
    // width query alone would miss and which has the same problem.
    const mq = window.matchMedia('(max-width: 700px), (pointer: coarse)')
    const apply = () => { narrowRef.current = mq.matches; setNarrow(mq.matches) }
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
      // TWO CLAIMS REMOVED (2026-08-15), both of them numbers this toast
      // cannot actually support:
      //
      //   "his 33rd"  was season_hr + tonight's homers. HomerLedger.js:162
      //   documents why that is wrong and asks statsapi for the real total
      //   instead: the slate republishes thirteen times a day, so season_hr is
      //   NOT reliably a pre-game count, and adding tonight's to it counts the
      //   same swing twice. The ledger and this toast could name different
      //   numbers for the same homer, and the toast was the wrong one.
      //
      //   "back-to-back nights 🔁"  was the raw games_since_last_hr field,
      //   which means "his most recent game" — today, on a slate rebuilt after
      //   an early window. lib/b2b.js is the verified version and needs a
      //   graded proof file this component doesn't fetch.
      //
      // Distance and exit velocity below are measured, come from the play
      // itself, and stay.
      if (!bits.length) return
      setToasts((ts) => ts.map((t) => t.key === key ? { ...t, text: `${t.text} · ${bits.join(' · ')}` } : t))
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

  // ── WHERE A TOAST'S OS NOTIFICATION LANDS (2026-09-03) ────────────────────
  //
  // Same fix as lib/dash/pushRules.js, on the other channel. These fire from
  // the open tab; the ones from the cron fire from the server; both used to
  // hand the operating system a link to the BOARD, so tapping "Jordan Walker
  // goes yard" put you on Home to go and find him.
  //
  // `#p=<id>` opens his card (components/Dashboard.js), `&view=spray` opens it
  // on the 3D spray -- which is the whole point for a batted ball and exactly
  // wrong for an on-deck notice, so only the ball events ask for it.
  const toastUrl = (t) => {
    const pid = t?.p ? String(t.p?.player_id ?? t.p?.id ?? '') : ''
    if (!pid) return '/app#sport=mlb&tab=home'
    const ball = t?.kind === 'hr' || t?.kind === 'anyhr' || t?.kind === 'd2' || t?.kind === 'd3' || t?.kind === 'tb4'
    return `/app#sport=mlb&p=${encodeURIComponent(pid)}${ball ? '&view=spray' : ''}`
  }

  const addToasts = (items) => {
    if (!items.length) return
    const narrow = narrowRef.current
    // ON-SCREEN stack. THREE on a desktop, ONE on a phone (2026-09-03,
    // Donovan: "the desktop ones are a little overbearing... it's another
    // point of five people saying it's a lot going on"). Four stacked cards
    // in the corner of a monitor is a second interface; three is a feed. On a
    // phone the previous two could still cover a third of the screen, and the
    // second one was always the less important of the pair anyway -- `out` is
    // sorted by priority before it gets here, so ONE is the loudest thing
    // that happened, not an arbitrary survivor.
    setToasts((cur) => [...items, ...cur].slice(0, narrow ? 1 : 3))
    // Bell on → homers and skin-on events also reach the OS. Originally this
    // only fired with the tab HIDDEN; in practice (2026-08-06) that read as
    // "I accepted notifications and got nothing" while watching the site —
    // so homers by picks/watchlist now notify regardless of tab visibility,
    // and everything else still waits for the tab to be in the background.
    if (notifRef.current === 'on' && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      const hidden = typeof document !== 'undefined' && document.hidden
      // WHICH of these reach the OS is a setting now (/dash → Alerts, stored
      // on the account). alertWanted keeps the rule this block already had —
      // homers and at-the-plate arrive with the tab open, everything else
      // waits for a hidden tab — and adds the one thing that was missing: a
      // category you switched off never fires. An unknown kind falls back to
      // the old priority test, so a new event type upstream is noisy rather
      // than silently swallowed.
      const prefs = alertPrefs()
      // AT THE PLATE NOTIFIES ALWAYS (2026-08-09, Donovan: "if a pick is at
      // the plate I need a noti"). pri 0.5 is the 🎤 up-now event; it used to
      // require a hidden tab, which meant the one alert with a SHELF LIFE —
      // he can only act on it during the at-bat — was the one most likely to
      // be withheld. Homers (0) and up-now (0.5) now always reach the OS;
      // everything else still waits for the tab to be in the background.
      // Through the SERVICE WORKER now, not `new Notification` (lib/notify).
      // The page API is unreliable on Android and dies when the phone freezes
      // the tab — which is precisely the case these alerts exist for.
      items.filter((t) => alertWanted(prefs, t, hidden)).slice(0, 3).forEach((t) => {
        notify({ title: `${t.icon} MOONSHOT`, body: t.text, tag: t.key, silent: t.pri > 0.5, url: toastUrl(t) })
      })
    }
    // Dwell. HALVED 2026-09-03 ("they stay on the screen a little bit too
    // persistent"). Fifteen seconds for a homer on a desktop was a third of a
    // half-inning of a card sitting over the page; eight is long enough to
    // read two lines twice. Homers still get roughly double everything else,
    // because a homer is the one you actually want to read. Nothing is lost
    // by clearing early: the OS notification stays on the lock screen, the
    // wire panel keeps the full feed, and there is an X now for the ones you
    // are done with before the timer is.
    items.forEach((t) => setTimeout(() => {
      setToasts((cur) => cur.filter((x) => x.key !== t.key))
    }, t.pri === 0 ? (narrow ? 5000 : 8000) : (narrow ? 3500 : 5000)))
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
            // `kind` rides along now — the alert settings (lib/dash/alerts.js)
            // switch categories on and off by kind, and priority alone can't
            // tell a cleared bar from a strikeout script.
            out.push({ key, icon, text, p, pri, kind })
          }
          if (now.hr > was.hr) {
            const hrKey = `${id}:hr:${now.hr}${now.d2}${now.d3}${now.k}${now.tb}`
            fire('hr', '💥', `${nameOf(p)} goes yard${now.hr > 1 ? `, ${now.hr} tonight` : ''}${role ? ` · ${role} pick ✓` : ''}`, 0)
            enrichHr(hrKey, now.pk, id, p, now)
          }
          else {
            const clearedNow = role && pickCleared(role, now) === true && pickCleared(role, was) !== true
            if (now.d3 > was.d3) fire('d3', '🔥', `${nameOf(p)} triples${clearedNow ? ` · ${role} bar cleared ✓` : ''}`, 1)
            else if (now.d2 > was.d2) fire('d2', '⚡', `${nameOf(p)} doubles${clearedNow ? ` · ${role} bar cleared ✓` : ` · ${now.tb} TB`}`, 1)
            else if (clearedNow) fire('clr', '✓', `${nameOf(p)} clears the ${role} bar (${now.h}-${now.ab}${now.tb > 1 ? `, ${now.tb} TB` : ''})`, 1)
          }
          if (role && now.k >= 2 && was.k < 2 && now.h === 0) {
            fire('k', '⚠️', `${nameOf(p)} (${role} pick) is 0-${now.ab} with ${now.k} K · the strikeout script`, 2)
          }
          // Big-bases night: 4+ TB crossing, only when it wasn't a fresh
          // homer doing the crossing (that toast already fired louder).
          if (now.tb >= 4 && was.tb < 4 && now.hr === was.hr) {
            fire('tb4', '🧨', `${nameOf(p)} is piling bases · ${now.tb} TB (${now.h}-${now.ab})`, 1)
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
          out.push({ key, icon: '💥', p: p || null, pri: 3, kind: 'anyhr',
            text: `${p ? nameOf(p) : (now.name || 'Someone')} goes deep${now.hr > 1 ? `, ${now.hr} tonight` : ''}` })
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
                // 🎤 retired 2026-09-03 (Donovan: "I don't like the
                // microphone"). ⚾ says the same thing without the karaoke.
                key, icon: '⚾', p, pri: 0.5, kind: 'up',
                text: `${nameOf(p)} is up now (${who})${arm ? ` vs ${arm}` : ''} · ${g.half}${g.inning}`,
              })
            }
          } else if (g.onDeck === id) {
            const key = `${id}:od:${slot}`
            if (!firedRef.current.has(key)) { firedRef.current.add(key); out.push({ key, icon: '⏳', text: `${nameOf(p)} (${who}) is on deck`, p, pri: 1.5 }) }
          }
        })
        // ── LINEUP CARD POSTED (2026-08-10) ──────────────────────────
        //
        // Donovan: "make sure the live wire and games can update the lineups."
        // This is the alert with the shortest shelf life on the site — a
        // scratch is only useful BEFORE you bet, and it lands two or three
        // hours before first pitch, which is exactly when the wire used to be
        // asleep (see the cadence note below).
        //
        // Fires at most once per player per slot, so a card that gets entered
        // in pieces doesn't toast nine times. Scratches outrank everything
        // except a homer, because they are the one event you can still act on.
        relevant.forEach((p) => {
          const id = Number(p?.player_id ?? p?.id)
          const role = primaryRole(p)
          const who = role ? `${role} pick` : 'watchlist'
          const lu = lineupStatus(s, id, p?.game_pk, p?.lineup_spot)
          if (!lu.posted) return
          if (lu.scratched) {
            const key = `${id}:scratched`
            if (firedRef.current.has(key)) return
            firedRef.current.add(key)
            out.push({
              key, icon: '🚫', p, pri: 0.2,
              text: `${nameOf(p)} (${who}) is not in tonight's lineup · bot had him #${p?.lineup_spot ?? '?'}`,
            })
          } else if (lu.moved) {
            const key = `${id}:slot:${lu.slot}`
            if (firedRef.current.has(key)) return
            firedRef.current.add(key)
            out.push({
              key, icon: '↕', p, pri: 1.4,
              text: `${nameOf(p)} (${who}) is batting #${lu.slot} tonight · bot had #${p?.lineup_spot}`,
            })
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
      //
      // AND IT ONLY POLLED WHEN SOMETHING WAS LIVE (fixed 2026-08-10). Before
      // first pitch this pulled exactly once, on mount, and then stopped — so
      // the whole pre-game window, which is when lineup cards post and when a
      // scratch is still worth knowing, had no cadence at all. Games in
      // Preview now poll every three minutes: slow enough that it costs
      // almost nothing (the pre-game boxscores are cached for four minutes on
      // their own clock), fast enough to catch a card going up.
      const anyLive = s.games?.some((g) => g.state === 'Live')
      const anyPregame = s.games?.some((g) => g.state === 'Preview' && !g.postponed)
      clearInterval(timer)
      if (anyLive) timer = setInterval(() => { if (!document.hidden) pull() }, 35000)
      // 60s, not 180s (2026-08-11). A scratch is the alert with the shortest
      // shelf life on the site and it was the slowest to arrive. NOTE the
      // coupling the 180s version missed: the pre-game boxscores this reads
      // are cached on their OWN clock in liveSlate (PREGAME_TTL), so polling
      // faster than that TTL buys nothing — both had to come down together,
      // and they did. Costs one schedule call a minute on a visible tab.
      else if (anyPregame) timer = setInterval(() => { if (!document.hidden) pull() }, 60000)
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
      {/* ── THE WIRE STAYS SHUT ON A PHONE UNTIL YOU OPEN IT (2026-08-23) ──
          Donovan: "leave live wire auto closed until open, especially on
          mobile — some things just take up the whole screen."
          The wire PANEL already defaulted closed. What was covering the phone
          was this stack: fixed at top 74, up to 340px wide, which on a 390px
          screen lands squarely on the tab bar — so "UP NOW — Sal Stewart
          batting" sat on top of Home / Charts / Props while he was trying to
          read the page. Unasked-for furniture over the navigation.
          On a narrow or touch screen the toasts now only appear once the wire
          is OPEN — i.e. once he has said he wants the live feed on screen.
          Nothing is lost while it is shut: the strip carries a count of what
          has fired, and opening the wire shows it. Desktop is untouched: there
          the stack sits in a corner of a monitor, which is what it was
          designed for. When it does show on a phone it now clears the tab bar
          rather than covering it. */}
      {toasts.length > 0 && (!narrow || wireOpen) && (
        <div
          role="log"
          aria-live="polite"
          aria-label="Live wire"
          style={{
          // TOP-right (2026-08-06, on request) — where the eye actually goes
          // for news. Offset clears the sticky header.
          position: 'fixed', right: narrow ? 8 : 14, top: narrow ? 122 : 74, zIndex: 300,
          display: 'flex', flexDirection: 'column', gap: 7,
          maxWidth: narrow ? 'calc(100vw - 16px)' : 'min(340px, 90vw)',
        }}>
          {toasts.map((t) => (
            <div key={t.key}
              onClick={() => { onPlayerClick?.(t.p); setToasts((cur) => cur.filter((x) => x.key !== t.key)) }}
              style={{
                display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer',
                background: t.pri === 0 ? `linear-gradient(135deg, ${C.green}29, ${C.scrim})` : C.scrim,
                border: `1px solid ${t.pri === 0 ? 'rgba(74,222,128,.5)' : t.pri === 2 ? 'rgba(248,113,113,.4)' : C.border2}`,
                borderRadius: 10, padding: '8px 12px',
                boxShadow: `0 8px 28px ${C.shadow}`,
                animation: 'wireToastIn .18s ease-out',
              }}>
              <span style={{ fontSize: 14, flexShrink: 0, lineHeight: 1.4 }}>{t.icon}</span>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: C.text, lineHeight: 1.4, flex: 1, minWidth: 0 }}>{t.text}</span>
              {/* ── AN X (2026-09-03) ────────────────────────────────────
                  "they need a little X button and can disappear faster."
                  The card body still opens the player, which is the reason
                  most of these get clicked -- so the dismiss has to be its
                  own target and has to stopPropagation, or closing a toast
                  would open a modal on the way out. 28px is the smallest
                  square a thumb hits reliably; it is a bigger hit area than
                  it looks, deliberately, because a control you miss twice is
                  worse than no control. */}
              <button
                type="button"
                aria-label="Dismiss"
                onClick={(e) => { e.stopPropagation(); setToasts((cur) => cur.filter((x) => x.key !== t.key)) }}
                style={{
                  flexShrink: 0, width: 28, height: 28, marginTop: -4, marginRight: -6,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'transparent', border: 0, borderRadius: 8,
                  color: C.text2, fontSize: 15, lineHeight: 1, cursor: 'pointer', padding: 0,
                }}
              >×</button>
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

      {/* ── THE STRIP, AND WHERE IT IS REDUNDANT (2026-08-29) ──────────────
          Hidden on the Scoreboard because the full wire lives there — and now
          on Home too. Donovan: "the live wire shows twice on the top of the
          page, i dont like that." He is right, and it was two components
          saying the same thing: Home mounts <ScoreRail>, which is every game,
          its score, its state and how the bot's picks in that game are doing
          — a superset of this one-line strip, sitting directly beneath it.
          Two live bars stacked at the top of the busiest page on the site.

          The strip is worth keeping everywhere else: that is the entire point
          of a live layer that follows you around. It just has nothing to add
          on the two pages that already carry the fuller version. */}
      {tab !== 'scoreboard' && tab !== 'home' && live.length > 0 && (
        <div
          // #94: the whole point of this bar is that it changes, and it changed
          // silently -- there was no aria-live region anywhere on a site whose
          // subject is live. polite, not assertive: it should be read at the
          // next pause, never cut across what someone is already hearing.
          role="status"
          aria-live="polite"
          aria-atomic="true"
          style={{
          display: 'flex', alignItems: 'baseline', gap: 10, width: '100%',
          background: 'linear-gradient(90deg, rgba(74,222,128,.06), rgba(74,222,128,.015))',
          border: '1px solid rgba(74,222,128,.22)', borderRadius: 9,
          padding: '4px 12px', marginBottom: 10, textAlign: 'left',
        }}>
          <span className="live-pulse" style={{ fontSize: 10.5, fontWeight: 900, color: '#4ade80' }}>📡 LIVE</span>
          {/* ── TWO LIVE WIRES, ONE ABOVE THE OTHER (2026-09-03) ────────────
              Donovan, on the Picks tab: "you see how it shows two live wires,
              I don't like that."
              He is right and it is this row's fault. Open the wire and
              LiveWire renders its OWN header directly underneath — and that
              header already carries the live count, the cleared count and the
              homer count, which is three of the four facts this strip prints,
              plus hits-vs-typical, which this strip does not have. So the
              summary was being said twice, worse the first time.
              Closed, this strip is the summary and the way in. OPEN, it keeps
              only what LiveWire has no equivalent of -- the OS-notification
              bell and the way back out -- and shuts up about the numbers. */}
          {!wireOpen && (
          <span style={{ fontSize: 10, color: C.text2, fontFamily: NUM_FONT }}>
            {live.length} game{live.length > 1 ? 's' : ''}
            {/* #32: these counters are scoped to games that are STILL LIVE, so
                they go DOWN as games finish -- a cleared count and a homer count
                that fall during the night read as data loss to anyone watching.
                The behaviour is right; it was never labelled. */}
            {picks.length > 0 && <> · picks <b style={{ color: cleared ? '#4ade80' : C.text2 }}>{cleared}/{picks.length}</b> cleared</>}
            {hr > 0 && <> · <b style={{ color: C.orange }}>{hr} HR</b></>}
            {picks.length > 0 && (
              <span
                style={{ color: C.text3 }}
                title="Counted across the games that are still in progress. A game that finishes takes its picks and its homers out of both numbers, so these can fall as the night goes on."
              > · in games still live</span>
            )}
            {narrow && !wireOpen && toasts.length > 0 && (
              <> · <b style={{ color: '#4ade80' }}>{toasts.length} new</b></>
            )}
          </span>
          )}
          <span
            onClick={(e) => { e.stopPropagation(); toggleNotif() }}
            title={notif === 'on'
              ? 'Browser notifications ON — homers, due-ups and K-alerts reach you even with this tab in the background. Click to mute.'
              : 'Click to get browser notifications when this tab is in the background — homers, your pick due up, K-alerts. Opt-in, nothing leaves your device.'}
            style={{ marginLeft: 'auto', fontSize: 12, cursor: 'pointer', opacity: notif === 'on' ? 1 : 0.55 }}
          >{notif === 'on' ? '🔔' : '🔕'}</span>
          <button
            onClick={(e) => { e.stopPropagation(); setWireOpen((v) => !v) }}
            title={wireOpen
              ? 'Close the wire — it keeps running either way'
              : 'Open the full Live Wire here, without leaving this tab'}
            style={{
              fontSize: 9, color: C.orange, fontFamily: NUM_FONT, fontWeight: 800,
              cursor: 'pointer', background: 'transparent',
              border: `1px solid ${C.orange}55`, borderRadius: 6, padding: '2px 8px',
            }}
          >{wireOpen ? 'close ▴' : 'open wire ▾'}</button>
          {onGo && (
            <button
              onClick={(e) => { e.stopPropagation(); onGo() }}
              title="Open the wire on the Live page instead — this one does move you"
              style={{
                fontSize: 9, color: C.text3, fontFamily: NUM_FONT, fontWeight: 700,
                cursor: 'pointer', background: 'transparent', border: 'none',
                padding: '2px 2px', textDecoration: 'underline dotted',
              }}
            >on Live →</button>
          )}
        </div>
      )}

      {/* The wire, in place. Same component the Rundown mounts. */}
      {tab !== 'scoreboard' && tab !== 'home' && wireOpen && live.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <LiveWire
            players={players}
            results={results}
            watchIds={watchIds}
            mode={mode}
            odds={odds}
            onPlayerClick={onPlayerClick}
          />
        </div>
      )}
    </>
  )
}
