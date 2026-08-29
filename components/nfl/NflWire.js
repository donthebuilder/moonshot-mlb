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

import { C, NUM_FONT } from '../../lib/nfl/theme'
import { fetchNflLive, gameFor, lineFor, marketValue, tdsIn } from '../../lib/nfl/liveSlate'
import { useNflWatchlist } from '../../lib/nfl/watchlist'
import { useFollowing } from '../../lib/dash/follow'
import { alertPrefs, alertWanted } from '../../lib/dash/alerts'
import { notify } from '../../lib/notify'

const POLL_MS = 45000
// Start watching a little before kickoff so the "his game just started" alert
// is early rather than a minute late.
const PREGAME_WINDOW_MS = 20 * 60 * 1000

export default function NflWire({ data, onPlayerClick }) {
  const { pins } = useNflWatchlist(data)
  const { rows: followed } = useFollowing('nfl')
  const [toasts, setToasts] = useState([])
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
      setToasts((cur) => [...items, ...cur].slice(0, 3))
      const prefs = alertPrefs()
      if (prefs.on && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        const hidden = typeof document !== 'undefined' && document.hidden
        items.filter((t) => alertWanted(prefs, t, hidden)).slice(0, 3).forEach((t) => {
          notify({ title: `${t.icon} DASH · Tuddy`, body: t.text, tag: t.key, url: '/app#sport=nfl&tab=watchlist' })
        })
      }
      items.forEach((t) => setTimeout(() => {
        setToasts((cur) => cur.filter((x) => x.key !== t.key))
      }, t.kind === 'nfltd' ? 15000 : 9000))
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
              out.push({ key, kind: 'nflkick', icon: '🏈', player,
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
          const key = `${id}:td:${tds}`
          if (!firedRef.current.has(key)) {
            firedRef.current.add(key)
            out.push({ key, kind: 'nfltd', icon: '🏈', player,
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
            const key = `${id}:${market}:${bar}`
            if (firedRef.current.has(key)) continue
            firedRef.current.add(key)
            out.push({ key, kind: 'nflbar', icon: '✓', player,
              text: `${player.name} clears ${market.replace('_', ' ').toLowerCase()} — ${now} (bar ${bar})` })
          }
        }
      }

      prevRef.current = snap
      push(out)
    }

    // Only poll when there is something to poll for.
    const worthPolling = () => {
      const games = data?.games || []
      if (!games.length) return false
      const now = Date.now()
      return games.some((g) => {
        if (g.state === 'in') return true
        if (g.completed || g.state === 'post') return false
        const t = g.kickoff ? new Date(g.kickoff).getTime() : NaN
        return Number.isFinite(t) && t - now < PREGAME_WINDOW_MS
      })
    }

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

  if (!toasts.length) return null

  return (
    <div className="tuddy-wire" aria-live="polite">
      {toasts.map((t) => (
        <button key={t.key} type="button" onClick={() => t.player && onPlayerClick?.(t.player, 'TD')}>
          <i>{t.icon}</i><span>{t.text}</span>
        </button>
      ))}
      <style jsx>{`
        .tuddy-wire{position:fixed;z-index:300;right:12px;bottom:max(12px,env(safe-area-inset-bottom));display:flex;flex-direction:column;gap:6px;max-width:min(360px,calc(100vw - 24px))}
        .tuddy-wire button{display:flex;align-items:center;gap:9px;padding:10px 12px;border:1px solid ${C.border2};border-radius:12px;background:${C.bg2};color:${C.text};box-shadow:0 16px 44px rgba(0,0,0,.55);text-align:left;cursor:pointer}
        .tuddy-wire i{font-size:16px;font-style:normal}
        .tuddy-wire span{font-family:${NUM_FONT};font-size:11px;font-weight:700;line-height:1.35}
        @media(max-width:760px){.tuddy-wire{left:12px;right:12px;bottom:82px;max-width:none}}
      `}</style>
    </div>
  )
}
