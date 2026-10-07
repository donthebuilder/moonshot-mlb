'use client'

// 🏈 THE TUDDY WIRE — football's live feed, and the reason NFL alerts can
// exist at all.
//
// MOONSHOT has had a wire since 2026-08-06 (components/MiniWire.js): poll the
// league's live feed, diff it, toast what changed for the names you have skin
// in. TUDDY had no equivalent because it had no live feed — the bot's
// nfl_results.json is a graded file with a `graded_at` stamp, so anything
// built on it arrives when the bot next runs, which is a report, not an alert.
// lib/nfl/liveSlate.js is that feed now; this is the diff on top of it.
//
// WHOSE EVENTS FIRE. Pinned (this week's stars) plus followed (the durable
// list, lib/dash/follow.js). Deliberately NOT everyone on the slate: football
// scores are rarer than home runs and a league-wide feed would be a scoreboard,
// which ESPN already is. The one thing this can tell you that a scoreboard
// can't is that YOUR guy just scored.
//
// THREE EVENTS, matching the three alert categories in lib/dash/alerts.js:
//   · nfltd    — his touchdown count went up
//   · nflbar   — he crossed the bar on a market he is scored in
//   · nflkick  — his game flipped from pre to in
//
// THE BAR IS THE BOT'S, ALWAYS. Read off the slate's own `markets[].bar`
// (published by bots/nfl/nfl_scoring.py), never re-derived here. If the bot
// moves REC_YDS from 40 to 45, this moves with it and nothing needs editing.
//
// POLLING IS CONSERVATIVE ON PURPOSE. Nothing runs unless a game on this
// slate is actually in progress or about to start, nothing runs while the tab
// is hidden past one final tick, and each tick is one scoreboard call plus one
// summary per live game. Sunday afternoon costs about fifteen requests a
// minute across the whole league; Tuesday costs nothing at all.

import { useEffect, useRef, useState } from 'react'

import { C } from '../../lib/nfl/theme'
import { C as MLB_C } from '../../lib/theme'
import WireToasts from '../WireToasts'
import { fetchNflLive, gameFor, lineFor, marketValue, tdsIn } from '../../lib/nfl/liveSlate'
import { worthPolling as slateWorthPolling } from '../../lib/nfl/liveMerge'
import { useNflWatchlist } from '../../lib/nfl/watchlist'
import { useFollowing } from '../../lib/dash/follow'
import { alertPrefs, alertWanted } from '../../lib/dash/alerts'
import { notify } from '../../lib/notify'

const POLL_MS = 45000

// ON SCREEN, MOONSHOT'S NOTICES (2026-09-28). This used to draw its own stack
// in the bottom corner, at z 300 under the bottom dock (z 390): on desktop the
// dock covered it completely, and on a notched phone it ran 14px under the
// bar. It now draws through MOONSHOT's stack (components/WireToasts.js):
// top-right under the header, clear of the dock, with the X, MOONSHOT's
// budget (one on a phone, three on a desktop) and MOONSHOT's dwell. The
// surface and shadow are MOONSHOT's; the highlight is TUDDY's green.
const WIRE_LOOK = {
  hiBg: `linear-gradient(135deg, ${C.green}29, ${MLB_C.scrim})`, bg: MLB_C.scrim,
  hiBorder: `${C.green}80`, warnBorder: `${C.text3}66`, border: C.border2,
  shadow: MLB_C.shadow, text: C.text, text2: C.text2,
}

export default function NflWire({ data, onPlayerClick }) {
  const { pins } = useNflWatchlist(data)
  const { rows: followed } = useFollowing('nfl')
  const [toasts, setToasts] = useState([])
  // MiniWire's phone test, so both wires agree on what a phone is.
  const narrowRef = useRef(false)
  const [narrow, setNarrow] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined
    const mq = window.matchMedia('(max-width: 700px), (pointer: coarse)')
    const apply = () => { narrowRef.current = mq.matches; setNarrow(mq.matches) }
    apply()
    if (mq.addEventListener) { mq.addEventListener('change', apply); return () => mq.removeEventListener('change', apply) }
    mq.addListener(apply)
    return () => mq.removeListener(apply)
  }, [])
  const prevRef = useRef(null)
  const firedRef = useRef(new Set())

  // Everyone this wire cares about, resolved to the slate row (which carries
  // the scores that say WHICH markets he is even a candidate in).
  const players = data?.players || []
  const wanted = new Map()
  const add = (id) => {
    const row = players.find((p) => String(p.player_id) === String(id))
    if (row) wanted.set(String(id), row)
  }
  pins.forEach((pin) => add(pin.player_id))
  followed.forEach((row) => add(row.id))

  const bars = {}
  ;(data?.markets || []).forEach((m) => { if (m?.key) bars[m.key] = Number(m.bar) })

  const wantedKey = [...wanted.keys()].sort().join(',')

  useEffect(() => {
    if (!wanted.size) return undefined
    let alive = true
    let timer = null

    const push = (items) => {
      if (!items.length) return
      const phone = narrowRef.current
      setToasts((cur) => [...items, ...cur].slice(0, phone ? 1 : 3))
      const prefs = alertPrefs()
      if (prefs.on && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        const hidden = typeof document !== 'undefined' && document.hidden
        items.filter((t) => alertWanted(prefs, t, hidden)).slice(0, 3).forEach((t) => {
          notify({ title: `${t.icon} ${t.text}`, body: 'TUDDY', tag: t.key, url: '/app#sport=nfl&tab=watchlist' }) // the news is line 1 on a lock screen
        })
      }
      items.forEach((t) => setTimeout(() => {
        setToasts((cur) => cur.filter((x) => x.key !== t.key))
      }, t.pri === 0 ? (phone ? 5000 : 8000) : (phone ? 3500 : 5000)))
    }

    const tick = async () => {
      const snap = await fetchNflLive().catch(() => null)
      if (!alive || !snap) return
      const prev = prevRef.current
      const out = []

      for (const [id, player] of wanted) {
        const game = gameFor(snap, player)
        const line = lineFor(snap, player)

        // KICKOFF — state changed, which needs a previous snapshot to know.
        if (prev && game) {
          const was = prev.games.find((g) => g.game_id === game.game_id)
          if (was && was.state === 'pre' && game.state === 'in') {
            const key = `${game.game_id}:kick`
            if (!firedRef.current.has(key)) {
              firedRef.current.add(key)
              out.push({ key, kind: 'nflkick', pri: 1, icon: '🏈', player,
                text: `${game.away} @ ${game.home} is under way — ${player.name} is on your list` })
            }
          }
        }

        if (!line) continue
        const wasLine = prev ? lineFor(prev, player) : null

        // TOUCHDOWN. Fires on the first snapshot he has one even without a
        // previous line: a tab opened at halftime should say he has scored,
        // and the fired-key set makes that exactly once.
        const tds = tdsIn(line)
        if (tds > (wasLine ? tdsIn(wasLine) : 0)) {
          // Scoped to the GAME, not to the player. See the note above.
          const key = `${line.game_id || 'g'}:${id}:td:${tds}`
          if (!firedRef.current.has(key)) {
            firedRef.current.add(key)
            out.push({ key, kind: 'nfltd', pri: 0, icon: '🏈', player,
              text: `${player.name} SCORES${tds > 1 ? ` — that's ${tds}` : ''}` })
          }
        }

        // BARS. Only markets he is actually scored in — a receiver crossing
        // the passing-yards bar is not a thing anyone asked to hear about.
        for (const market of Object.keys(player.scores || {})) {
          const bar = bars[market]
          if (!Number.isFinite(bar)) continue
          const now = marketValue(line, market)
          if (now === null) continue
          const before = wasLine ? marketValue(wasLine, market) : 0
          if (now >= bar && (before === null || before < bar)) {
            const key = `${line.game_id || 'g'}:${id}:${market}:${bar}`
            if (firedRef.current.has(key)) continue
            firedRef.current.add(key)
            out.push({ key, kind: 'nflbar', pri: 1, icon: '✓', player,
              text: `${player.name} clears ${market.replace('_', ' ').toLowerCase()} — ${now} (bar ${bar})` })
          }
        }
      }

      prevRef.current = snap
      // Loudest first: on a phone only the first one shows (a TD beats a bar).
      push(out.sort((a, b) => a.pri - b.pri))
    }


    // Only poll when there is something to poll for.
    // One test, shared with the tabs' poller (lib/nfl/liveMerge.js) so the
    // Wire and the Live page can never disagree about whether football is on.
    const worthPolling = () => slateWorthPolling(data?.games)

    const loop = () => {
      if (!worthPolling()) return
      if (typeof document !== 'undefined' && document.hidden) return
      tick()
    }

    loop()
    timer = setInterval(loop, POLL_MS)
    return () => { alive = false; clearInterval(timer) }
    // wantedKey rather than the Map: a new Map identity every render would
    // restart the poller on every keystroke elsewhere on the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantedKey, data])

  const drop = (t) => setToasts((cur) => cur.filter((x) => x.key !== t.key))
  return (
    <WireToasts
      toasts={toasts}
      narrow={narrow}
      look={WIRE_LOOK}
      onOpen={(t) => { if (t.player) onPlayerClick?.(t.player, 'TD'); drop(t) }}
      onDismiss={drop}
    />
  )
}
