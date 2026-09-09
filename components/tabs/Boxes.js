'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { C, NUM_FONT } from '../../lib/theme'
import { playerId, mlbId, nameOf } from '../../lib/player'
import { dedupeGraded } from '../../lib/graded'
import { Empty } from '../ui'
import { scheduleFor, fullBox, forget, slateDay } from '../../lib/boxscore'
import { fetchLiveSlate, pickCleared } from '../../lib/liveSlate'
import { primaryRole } from '../../lib/verdict'
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

// ── WHAT MOONSHOT HAS RIDING ON THIS GAME (2026-08-31) ──────────────────────
//
// Donovan: "update the box scores page make it better and more intuitive."
//
// The page was a competent generic box-score viewer and that was exactly the
// problem: nothing on it knew it was part of MOONSHOT. Fourteen cards in
// schedule order, identical to each other, and the one question a person
// actually opens this page with — "how are MY names doing" — could only be
// answered by opening every card and reading two nine-man tables per game.
//
// Every slate row publishes `game_pk`, and it is the same number the league's
// schedule uses, so the join is exact and needs nothing fetched. Each card now
// says up front how many of the bot's designated picks are in that game, how
// many of your watchlist names are, and — once a graded file exists — how many
// have cleared and how many have gone deep. Then the list SORTS by it, so a
// live game with three of your names is never buried under four finals.
//
// Counts only, plus at most three names. This is a strip on a collapsed card,
// not a second board; the full detail is one tap away and always was.
function StakeStrip({ stake, compact = false }) {
  if (!stake || (!stake.picks.length && !stake.watched.length)) return null
  const bits = []
  if (stake.picks.length) bits.push({ k: 'p', txt: `${stake.picks.length} pick${stake.picks.length === 1 ? '' : 's'}`, tone: C.orange })
  if (stake.hr) bits.push({ k: 'hr', txt: `${stake.hr} HR`, tone: '#4ade80' })
  if (stake.graded) bits.push({ k: 'c', txt: `${stake.cleared}/${stake.graded} cleared`, tone: stake.cleared ? '#4ade80' : C.text3 })
  if (stake.watched.length) bits.push({ k: 'w', txt: `★ ${stake.watched.length}`, tone: C.yellow })
  const names = [...stake.watched, ...stake.picks].slice(0, compact ? 2 : 3)
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
      marginTop: 5, paddingTop: 5, borderTop: `1px dashed ${C.border}`,
    }}>
      {bits.map((b) => (
        <span key={b.k} style={{
          fontFamily: NUM_FONT, fontSize: 8.5, fontWeight: 900, letterSpacing: '.04em',
          padding: '1.5px 6px', borderRadius: 5, whiteSpace: 'nowrap',
          border: `1px solid ${b.tone}44`, background: `${b.tone}12`, color: b.tone,
        }}>{b.txt}</span>
      ))}
      {names.length > 0 && (
        <span style={{ fontSize: 9, color: C.text3, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {names.join(' · ')}{(stake.picks.length + stake.watched.length) > names.length ? ' …' : ''}
        </span>
      )}
    </div>
  )
}

function GameCard({ g, open, onToggle, watchIds, onPlayerClick, stake }) {
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

      {/* Outside the click row so it can wrap on a phone without pushing the
          score column around. */}
      <div style={{ padding: '0 13px 8px' }}><StakeStrip stake={stake} /></div>

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

// `results` is optional and BOTH mounts do not yet pass it. The Games tab
// does; the Home tab's mount is left alone in this pass on purpose, because
// components/tabs/Home.js is already being changed by SHIP-PASS-19 and two
// scripts pinned to the same file is exactly how a pass ends up unapplyable
// (see the pass-16 note). Without it the two graded chips simply do not
// render — the picks and watchlist counts, which are the useful half, come
// off the slate and need nothing fetched.
export default function Boxes({ watchIds, onPlayerClick, players = [], results = null }) {
  const [day, setDay] = useState(() => slateDay(0))
  const [games, setGames] = useState(undefined)
  // A SET, not a single pk (2026-08-31). One-open-at-a-time meant comparing
  // two games was a close, a scroll and a re-open, and the box you closed had
  // to be re-fetched to come back. Games are independent things; there is no
  // reason opening one should shut another.
  const [open, setOpen] = useState(() => new Set())
  const [sortBy, setSortBy] = useState('yours')
  const [q, setQ] = useState('')

  useEffect(() => {
    let alive = true
    setGames(undefined)
    setOpen(new Set())
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

  // ── THE JOIN (2026-08-31) ───────────────────────────────────────────────
  //
  // game_pk is published on every slate row AND is the league's own schedule
  // id, so this is an exact key match with nothing fetched and nothing
  // guessed. A name-or-team match would have been the obvious shortcut and is
  // the one that breaks on a doubleheader, where two games share both teams.
  // ── #49: 0 CLEARED ON EVERY GAME WHILE THE STRIP SAID 12 ─────────────────
  //
  // Five games reading "0/4 cleared" -- including one showing 2 HR and one
  // showing 1 HR -- under a live strip reading "picks 12/71 cleared · 15 HR".
  // Both numbers were computed honestly and from different places. The strip
  // reads the LIVE lines and asks lib/liveSlate's pickCleared(); this page
  // read the GRADED results file, which during a live slate has not been
  // written yet, so every per-game counter sat at zero all night and only
  // caught up the next morning.
  //
  // The two now share one source. The live snapshot is authoritative while it
  // has a line for a pick (it is the same cached fetch the strip uses -- see
  // fetchLiveSlate's TTL, so this costs no extra request), and the graded file
  // fills in behind it once the night is over and the live feed has dropped
  // the game.
  const [liveLines, setLiveLines] = useState(null)
  useEffect(() => {
    let alive = true
    const pull = () => fetchLiveSlate().then((snap) => { if (alive) setLiveLines(snap?.lines || null) }).catch(() => {})
    pull()
    const id = setInterval(() => { if (!document.hidden) pull() }, 60000)
    return () => { alive = false; clearInterval(id) }
  }, [])

  const stakes = useMemo(() => {
    const out = new Map()
    const touch = (pk) => {
      const k = Number(pk)
      if (!k) return null
      if (!out.has(k)) out.set(k, { picks: [], watched: [], hr: 0, cleared: 0, graded: 0 })
      return out.get(k)
    }
    // Player ids whose count came from the live feed, so the graded pass below
    // cannot add them a second time.
    const countedLive = new Set()
    ;(players || []).forEach((p) => {
      const e = touch(p?.game_pk)
      if (!e) return
      const isPick = String(p?.game_pick_role || '').trim()
      if (isPick) e.picks.push(nameOf(p))
      if (watchIds?.has(playerId(p))) e.watched.push(nameOf(p))
      if (!isPick || !liveLines) return
      const id = Number(p?.player_id ?? p?.id)
      const line = liveLines[id]
      if (!line) return
      const role = primaryRole(p)
      const verdict = pickCleared(role, line)
      // null means the bar is not judgeable yet (no at-bat), which is not the
      // same as a miss -- it stays out of the denominator, exactly as the
      // strip treats it.
      if (verdict === null) return
      countedLive.add(id)
      e.graded += 1
      if (verdict === true) e.cleared += 1
      if (Number(line.hr) > 0) e.hr += 1
    })
    // The graded half is optional on purpose: on most of any given day there
    // is no graded file for the date on screen, and a card that renders
    // "0/0 cleared" against a slate nobody has graded yet is worse than a card
    // that says nothing. Absent results simply drop these two chips.
    if (results && (!results.date || !day || String(results.date) === String(day))) {
      const byId = new Map()
      ;(players || []).forEach((p) => {
        const id = Number(p?.player_id ?? p?.id)
        if (id) byId.set(id, Number(p?.game_pk) || null)
      })
      dedupeGraded(results?.graded_slots || results?.results || []).forEach((r) => {
        const e = touch(byId.get(Number(r?.player_id)))
        if (!e) return
        if (countedLive.has(Number(r?.player_id))) return
        e.graded += 1
        if (Number(r?.actual_hr) > 0) e.hr += 1
        if (r?.hit === true || r?.cleared === true || r?.result === 'HIT' || Number(r?.cleared) > 0) e.cleared += 1
      })
    }
    return out
  }, [players, watchIds, results, day, liveLines])

  // ── ORDER BY WHAT YOU CAME HERE FOR ─────────────────────────────────────
  //
  // Schedule order is the league's answer to "what order did these start in",
  // which is nobody's question on this page. Default is YOURS FIRST: a live
  // game you have names in, then any live game, then a game you have names in,
  // then everything still to come, then the finals. Start time is still one
  // tap away for anyone who wants the league's own order back.
  const shown = useMemo(() => {
    let list = games || []
    const needle = q.trim().toLowerCase()
    if (needle) {
      list = list.filter((g) => [g.away?.name, g.away?.abbr, g.home?.name, g.home?.abbr, g.venue]
        .some((t) => String(t || '').toLowerCase().includes(needle)))
    }
    if (sortBy === 'time') return list
    const rank = (g) => {
      const st = stakes.get(Number(g.pk))
      const mine = st ? st.picks.length + st.watched.length : 0
      if (g.live) return mine ? 0 : 1
      if (!g.final && !g.postponed) return mine ? 2 : 3
      return mine ? 4 : 5
    }
    return [...list].sort((a, b) => {
      const d = rank(a) - rank(b)
      if (d) return d
      const sa = stakes.get(Number(a.pk)); const sb = stakes.get(Number(b.pk))
      const ma = sa ? sa.picks.length + sa.watched.length : 0
      const mb = sb ? sb.picks.length + sb.watched.length : 0
      return mb - ma
    })
  }, [games, q, sortBy, stakes])

  const live = games?.filter((g) => g.live).length || 0
  const done = games?.filter((g) => g.final).length || 0
  const mineCount = useMemo(() => (games || [])
    .filter((g) => { const s2 = stakes.get(Number(g.pk)); return s2 && (s2.picks.length || s2.watched.length) })
    .length, [games, stakes])

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, flexWrap: 'wrap', marginBottom: 4 }}>
        <span style={{ fontSize: 14, fontWeight: 900 }}>📋 Boxes</span>
        {games && (
          <span style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT }}>
            {games.length} game{games.length === 1 ? '' : 's'}
            {live ? ` · ${live} live` : ''}{done ? ` · ${done} final` : ''}
            {mineCount ? ` · ${mineCount} with your names` : ''}
          </span>
        )}
      </div>
      <div style={{ fontSize: 11, color: C.text2, lineHeight: 1.6, maxWidth: 760, marginBottom: 10 }}>
        Every game on the date, and the full box under any of them — both lineups, both staffs,
        live or final. Click a game to open it; open as many as you like. Each card says what
        the bot has designated in that game and which of your watchlist names are in it, so the
        games you care about sort to the top instead of sitting in schedule order.
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

      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 9, color: C.text3, textTransform: 'uppercase', letterSpacing: '.07em' }}>Order</span>
        <button onClick={() => setSortBy('yours')} style={chip(sortBy === 'yours')}>Yours first</button>
        <button onClick={() => setSortBy('time')} style={chip(sortBy === 'time')}>Start time</button>
        <input
          value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Filter by team or park…"
          style={{
            fontSize: 10.5, padding: '4px 10px', borderRadius: 999, minWidth: 168,
            border: `1px solid ${C.border}`, background: 'transparent', color: C.text2, outline: 'none',
          }}
        />
        {q && (
          <button onClick={() => setQ('')} style={{
            background: 'transparent', border: 0, cursor: 'pointer', color: C.text3, fontSize: 11,
          }}>clear</button>
        )}
        {games && games.length > 1 && (
          <button
            onClick={() => setOpen(open.size ? new Set() : new Set(shown.filter((g) => g.live || g.final).map((g) => g.pk)))}
            style={{
              marginLeft: 'auto', padding: '3px 11px', borderRadius: 999, cursor: 'pointer',
              fontSize: 10, fontWeight: 800, fontFamily: NUM_FONT,
              border: `1px solid ${C.border}`, background: 'transparent', color: C.text3,
            }}
          >{open.size ? 'Collapse all' : 'Expand all played'}</button>
        )}
      </div>

      {games === undefined ? (
        <div style={{ fontSize: 11, color: C.text3, fontFamily: NUM_FONT, padding: 14 }}>Loading the schedule…</div>
      ) : !games ? (
        <Empty text="Couldn't reach the league's schedule. Try again in a moment." />
      ) : !games.length ? (
        <Empty text={`No games on ${day}.`} />
      ) : (
        !shown.length ? (
          <Empty text={`No game on ${day} matches “${q}”.`} />
        ) : shown.map((g) => (
          <GameCard key={g.pk} g={g} open={open.has(g.pk)}
            onToggle={(pk) => setOpen((prev) => {
              const next = new Set(prev)
              if (next.has(pk)) next.delete(pk); else next.add(pk)
              return next
            })}
            watchIds={watchedIds}
            stake={stakes.get(Number(g.pk))}
            onPlayerClick={openPlayer} />
        ))
      )}
    </div>
  )
}
