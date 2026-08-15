'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { C, NUM_FONT } from '../../lib/theme'
import { playerId, mlbId } from '../../lib/player'
import { Empty } from '../ui'
import { scheduleFor, fullBox, forget, slateDay } from '../../lib/boxscore'
import { BattingBox, PitchingBox, LineScore } from '../BoxTable'

// 📋 BOXES — every game, live or finished, with the whole box under it.
//
// 2026-08-15, Donovan: "there needs to be a place we can see last nights box
// score and the games going on either live or after they are finished."
//
// This site could grade a pick against a boxscore and could tell you who was
// at the plate, and could not show you a box score. Every live number on the
// board came from one and none of them were readable as a game.
//
// THE DATE IS THE FIRST CONTROL, because "last night" is the most common
// question and it was the one thing the site could not answer at all — every
// live surface here fetches a yesterday..today window and then filters
// yesterday out once those games go Final.
//
// ONE BOX AT A TIME. The schedule for a date is one request; a box is one more
// and only for the game you open. lib/boxscore.js has the note on why this
// doesn't ride the sitewide live poll.

const chip = (on) => ({
  padding: '3px 11px', borderRadius: 999, cursor: 'pointer', fontSize: 10,
  fontWeight: 800, fontFamily: NUM_FONT, whiteSpace: 'nowrap',
  border: `1px solid ${on ? C.orange : C.border}`,
  background: on ? 'rgba(249,115,22,.14)' : 'transparent',
  color: on ? C.orange : C.text3,
})

function statusLine(g) {
  if (g.postponed) return { text: g.detail || 'Postponed', tone: '#a1a1aa' }
  if (g.suspended) return { text: g.detail || 'Suspended', tone: '#60A5FA' }
  if (g.live) {
    const half = /top/i.test(g.inningState) ? '▲' : /bot/i.test(g.inningState) ? '▼' : ''
    return { text: `${half}${g.inning ?? ''} · ${g.outs} out`, tone: '#4ade80' }
  }
  if (g.final) return { text: 'Final', tone: C.text3 }
  const t = g.startTime ? new Date(g.startTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : ''
  return { text: t || 'Scheduled', tone: C.text3 }
}

function GameCard({ g, open, onToggle, watchIds, onPlayerClick }) {
  const [box, setBox] = useState(undefined)
  const st = statusLine(g)
  const started = g.live || g.final || g.suspended

  const load = useCallback((fresh) => {
    if (fresh) forget(g.pk)
    setBox(undefined)
    fullBox(g.pk, { live: g.live }).then((b) => setBox(b || null)).catch(() => setBox(null))
  }, [g.pk, g.live])

  useEffect(() => {
    if (!open || !started) return undefined
    load(false)
    if (!g.live) return undefined
    // A live box is worth re-pulling while you're looking at it; a final one
    // never changes, so it is fetched once and cached for ten minutes.
    const t = setInterval(() => { if (!document.hidden) load(true) }, 30000)
    return () => clearInterval(t)
  }, [open, started, g.live, load])

  const winner = g.final && g.away.score != null && g.home.score != null
    ? (g.away.score > g.home.score ? 'away' : g.home.score > g.away.score ? 'home' : null)
    : null

  return (
    <div style={{
      border: `1px solid ${open ? `${C.orange}55` : C.border}`, borderRadius: 12,
      background: open ? 'rgba(249,115,22,.03)' : C.bg2, marginBottom: 8, overflow: 'hidden',
    }}>
      <div onClick={() => onToggle(g.pk)} className="tap-row" style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '9px 13px', cursor: 'pointer',
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {[['away', g.away], ['home', g.home]].map(([side, t]) => (
            <div key={side} style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{
                fontSize: 12.5, fontWeight: winner === side ? 900 : 600,
                color: winner && winner !== side ? C.text3 : C.text,
                minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>{t.name || t.abbr}</span>
              {t.record && (
                <span style={{ fontFamily: NUM_FONT, fontSize: 8.5, color: C.text3 }}>
                  {t.record.wins}-{t.record.losses}
                </span>
              )}
              <span style={{
                marginLeft: 'auto', fontFamily: NUM_FONT, fontSize: 15,
                fontWeight: 900, minWidth: 26, textAlign: 'right',
                color: t.score == null ? C.text3 : winner === side ? C.orange : C.text,
              }}>{t.score ?? '–'}</span>
            </div>
          ))}
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0, minWidth: 78 }}>
          <div style={{ fontFamily: NUM_FONT, fontSize: 10, fontWeight: 800, color: st.tone }}>{st.text}</div>
          {g.final && (g.decisions.win || g.decisions.save) && (
            <div style={{ fontFamily: NUM_FONT, fontSize: 8.5, color: C.text3, marginTop: 2 }}>
              {g.decisions.win ? `W ${g.decisions.win.split(' ').slice(-1)[0]}` : ''}
              {g.decisions.save ? ` · S ${g.decisions.save.split(' ').slice(-1)[0]}` : ''}
            </div>
          )}
          {!started && (g.away.probable || g.home.probable) && (
            <div style={{ fontFamily: NUM_FONT, fontSize: 8.5, color: C.text3, marginTop: 2 }}>
              {g.away.probable.split(' ').slice(-1)[0]} / {g.home.probable.split(' ').slice(-1)[0]}
            </div>
          )}
        </div>
        <span style={{ color: C.text3, fontSize: 11, flexShrink: 0 }}>{open ? '▾' : '▸'}</span>
      </div>

      {open && (
        <div style={{ padding: '0 13px 12px', borderTop: `1px solid ${C.border}` }}>
          {!started ? (
            <div style={{ fontSize: 11, color: C.text3, padding: '10px 0', lineHeight: 1.6 }}>
              Hasn&apos;t started. {g.venue ? `${g.venue}. ` : ''}
              {g.away.probable && g.home.probable
                ? `${g.away.probable} vs ${g.home.probable}.`
                : 'Probables not posted yet.'}
            </div>
          ) : box === undefined ? (
            <div style={{ fontSize: 10.5, color: C.text3, fontFamily: NUM_FONT, padding: '10px 0' }}>Loading the box…</div>
          ) : !box ? (
            <div style={{ fontSize: 10.5, color: C.orange, padding: '10px 0' }}>
              The league didn&apos;t return a box for this game.
            </div>
          ) : (
            <div style={{ paddingTop: 10 }}>
              <LineScore game={g} />
              <div className="box-cols" style={{
                display: 'grid', gap: 18,
                gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 380px), 1fr))',
              }}>
                {[['away', g.away], ['home', g.home]].map(([side, t]) => (
                  <div key={side} style={{ minWidth: 0 }}>
                    <BattingBox side={box[side]} title={t.name || t.abbr}
                      highlight={watchIds} onPlayerClick={onPlayerClick} />
                    <PitchingBox side={box[side]} />
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 9, color: C.text3, marginTop: 9, lineHeight: 1.5 }}>
                Straight off the league&apos;s own boxscore. Indented names came in for the man above
                them. {g.live ? 'Refreshing every 30s while this card is open. ' : ''}
                {watchIds?.size ? 'Orange rows are hitters on your watchlist. ' : ''}
                Click a batter to open his card.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function Boxes({ watchIds, onPlayerClick, players = [] }) {
  const [day, setDay] = useState(() => slateDay(0))
  const [games, setGames] = useState(undefined)
  const [open, setOpen] = useState(null)

  useEffect(() => {
    let alive = true
    setGames(undefined)
    setOpen(null)
    scheduleFor(day).then((g) => { if (alive) setGames(g || null) }).catch(() => { if (alive) setGames(null) })
    return () => { alive = false }
  }, [day])

  // Re-poll the SCHEDULE (scores and states, one request) while anything is
  // live. The box under an open card has its own faster timer.
  useEffect(() => {
    if (!games?.some((g) => g.live)) return undefined
    const t = setInterval(() => {
      if (document.hidden) return
      scheduleFor(day).then((g) => g && setGames(g)).catch(() => {})
    }, 30000)
    return () => clearInterval(t)
  }, [games, day])

  const today = slateDay(0)
  const yday = slateDay(-1)

  // WATCHLIST HIGHLIGHTING NEEDS A TRANSLATION, and skipping it is the exact
  // bug scripts/check-ids.mjs exists for: watchIds is keyed on playerId(),
  // the COMPOSITE "600036-811003", while a boxscore row carries the league's
  // bare numeric id. Handing the set straight to the table would highlight
  // nobody, silently, forever. So the slate is the bridge — it has both.
  const watchedIds = useMemo(() => {
    const out = new Set()
    if (!watchIds?.size) return out
    ;(players || []).forEach((p) => {
      if (watchIds.has(playerId(p))) {
        const id = mlbId(p)
        if (id) out.add(id)
      }
    })
    return out
  }, [players, watchIds])
  const openPlayer = useCallback((p) => {
    if (!onPlayerClick || !p?.id) return
    const row = (players || []).find((x) => Number(x?.player_id ?? x?.id) === Number(p.id))
    // A hitter who isn't on tonight's slate has no row to open — the modal
    // needs one. Say nothing rather than opening an empty card.
    if (row) onPlayerClick(row)
  }, [onPlayerClick, players])

  const live = games?.filter((g) => g.live).length || 0
  const done = games?.filter((g) => g.final).length || 0

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, flexWrap: 'wrap', marginBottom: 4 }}>
        <span style={{ fontSize: 14, fontWeight: 900 }}>📋 Boxes</span>
        {games && (
          <span style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT }}>
            {games.length} game{games.length === 1 ? '' : 's'}
            {live ? ` · ${live} live` : ''}{done ? ` · ${done} final` : ''}
          </span>
        )}
      </div>
      <div style={{ fontSize: 11, color: C.text2, lineHeight: 1.6, maxWidth: 760, marginBottom: 10 }}>
        Every game on the date, and the full box under any of them — both lineups, both staffs,
        live or final. Click a game to open it.
      </div>

      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
        <button onClick={() => setDay(today)} style={chip(day === today)}>Today</button>
        <button onClick={() => setDay(yday)} style={chip(day === yday)}>Last night</button>
        <input
          type="date" value={day} max={today}
          onChange={(e) => e.target.value && setDay(e.target.value)}
          style={{
            fontFamily: NUM_FONT, fontSize: 10.5, padding: '3px 9px', borderRadius: 999,
            border: `1px solid ${C.border}`, background: 'transparent', color: C.text2,
            colorScheme: 'dark', outline: 'none',
          }}
        />
        <span style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT, marginLeft: 4 }}>
          {new Date(`${day}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
        </span>
      </div>

      {games === undefined ? (
        <div style={{ fontSize: 11, color: C.text3, fontFamily: NUM_FONT, padding: 14 }}>Loading the schedule…</div>
      ) : !games ? (
        <Empty text="Couldn't reach the league's schedule. Try again in a moment." />
      ) : !games.length ? (
        <Empty text={`No games on ${day}.`} />
      ) : (
        games.map((g) => (
          <GameCard key={g.pk} g={g} open={open === g.pk}
            onToggle={(pk) => setOpen(open === pk ? null : pk)}
            watchIds={watchedIds}
            onPlayerClick={openPlayer} />
        ))
      )}
    </div>
  )
}
