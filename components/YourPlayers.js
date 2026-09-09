'use client'

// ⭐ YOUR PLAYERS — the answer to "highlighted players get lost on this site".
//
// 2026-09-03, Donovan: "when you have players highlighted I feel like they get
// lost, whether that's behind stats or... when you're looking for the
// highlighted players there needs to be a section that just shows all your
// highlights. As soon as you highlight players they need to just go somewhere
// on the site so you can actually look at every player that's been
// highlighted."
//
// WHAT WAS ACTUALLY WRONG. The list existed. `FollowingStrip` has been on Home
// since 2026-08-28 and it renders every followed man — as a row of NAME CHIPS.
// A name and a dim/lit dot, and nothing else. So on a night when four of your
// guys are batting and two have already gone deep, the section that is
// supposed to be about them tells you their names, which you already knew, and
// you go and hunt through the board anyway. It was not that they had nowhere
// to live; it was that where they lived said nothing.
//
// This says the thing you opened the site to find out, per man, in one line:
// what he has done tonight, where his game is, and whether the bot had him.
// Sorted so the ones that can still change are at the top, because the whole
// point of a live section is that the live part is the part you look at.
//
// TWO LISTS, ONE SECTION. ★ (tonight's star, pruned with the slate) and
// FOLLOW (durable, never pruned) have always been separate stores on purpose —
// see lib/dash/follow.js. Keeping them in two sections would be showing him
// the seam in his own data. They are unioned here and the row says which it
// came from, so un-starring still does not unfollow and nothing about either
// store changes.
//
// NO NEW POLLER. fetchLiveSlate is the shared, TTL-cached snapshot MiniWire is
// already pulling on this page; asking it again is free until the TTL expires
// and then costs the one request that was going to happen anyway.

import { useEffect, useMemo, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { useFollowing } from '../lib/dash/follow'
import { useDashAccount } from '../lib/dash/sync'
import { fetchLiveSlate } from '../lib/liveSlate'
import { nameOf, teamOf, oppOf, mlbId, playerId as rowKey } from '../lib/player'

const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0)

/** Half-inning as a person says it. Same wording as the push sender. */
function inningWord(g) {
  const i = n(g?.inning)
  if (!i) return ''
  const half = /^top|^middle/i.test(String(g?.half || '')) ? 'top' : 'bot'
  const s = i % 100 >= 11 && i % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][i % 10] || 'th'
  return `${half} ${i}${s}`
}

/**
 * Which of the watchlist's own bars tonight's line has cleared.
 *
 * Deliberately the SAME three-deep, de-overlapped list lib/dash/pushRules.js
 * puts in a notification body: a man whose alert said "HR · multi-hit" must
 * not read "HR · hit · XBH · multi-hit · HRR" on the page the alert opened.
 * Two surfaces disagreeing about what cleared is worse than either being
 * terse.
 */
function barsCleared(l) {
  const h = n(l?.h)
  const out = []
  if (n(l?.hr) >= 1) out.push('HR')
  else if (n(l?.d2) + n(l?.d3) >= 1) out.push('XBH')
  if (h >= 2) out.push('multi-hit')
  if (h + n(l?.r) + n(l?.rbi) >= 2) out.push('HRR')
  if (!out.length && h >= 1) out.push('hit')
  if (!out.length && n(l?.tb) >= 2) out.push('2TB')
  return out.slice(0, 3)
}

// Rank, not just a label. Live first because it can still change; then the
// men who have not batted yet, because they still can; then tonight's
// finished lines; then everyone who is not playing at all. Inside a bucket,
// the loudest night first.
const RANK = { live: 0, pre: 1, final: 2, off: 3 }

// ── COLLAPSED BY DEFAULT ────────────────────────────────────────────────────
//
// 2026-09-03, Donovan: "i want the your players on the home page to be
// collapsable or like show only little and can open big — right now it takes
// up a large portion of the home page esp when you have a lot of players you
// follow."
//
// He is right, and the reason is structural: this list has no natural ceiling.
// Following is DURABLE and never pruned (lib/dash/follow.js), so it only ever
// grows, and a man followed in May still takes a row in September. Every other
// block on Home is bounded by the slate; this one is bounded by how long he
// has used the site.
//
// THE RULE THAT MAKES COLLAPSING SAFE: a collapsed section must never hide the
// thing you opened it for. So the cap is a FLOOR, not a limit — anyone whose
// night is still changing (live) or who has already done something (a homer)
// is shown regardless of where he falls. Collapsing can only ever hide men who
// are finished, not yet playing, or not on tonight's board at all.
//
// 2026-09-05, Donovan, with a screenshot of 32 live rows filling Home: "make
// sure it only shows 3 players max for the preview, it takes up the whole
// page." He is right again, and the floor rule above is exactly why: on a
// full slate nearly everyone he follows is live, so "the first five plus
// anyone live" was the whole list. The floor became the page.
//
// So the preview is now a HARD CAP of three. What survives from the floor
// idea is the RANKING, not the exemption: rows are already sorted live-first,
// homers-first, loudest-first, so the three that show are the three that
// matter most tonight, and the header still counts every live man and every
// homer across the whole list so nothing is hidden twice. One tap opens the
// rest.
const COLLAPSED_N = 3
const OPEN_KEY = 'dash_yourplayers_open_v1'
// A SECOND, SEPARATE STATE, and the distinction is the whole point.
//   OPEN_KEY  — show every row, or the first few plus anyone live/deep
//   SHUT_KEY  — the section itself is closed
// Donovan: "the your player need to be colapable." It was not: the header was
// static and the only control expanded a list that never went below five rows
// plus anybody live. So on a night with a live man it could not be made small,
// which is the same complaint that started this section ("the live tracker
// takes up the screen every time I open the page") arriving from the other
// side. The header is the toggle now.
const SHUT_KEY = 'dash_yourplayers_shut_v1'

// Per-device, and deliberately NOT synced to the account. lib/dash/sync.js
// already draws this line — theme, nav position and quiet mode stay local
// because they describe a device rather than a person, and how much of a list
// fits on screen is the same kind of fact. A phone and a desktop should be
// allowed to disagree about it.
const readShut = () => {
  try { return window.localStorage.getItem(SHUT_KEY) === '1' } catch { return false }
}
const writeShut = (v) => {
  try { window.localStorage.setItem(SHUT_KEY, v ? '1' : '0') } catch { /* private mode */ }
}
const readOpen = () => {
  try { return window.localStorage.getItem(OPEN_KEY) === '1' } catch { return false }
}
const writeOpen = (v) => {
  try { window.localStorage.setItem(OPEN_KEY, v ? '1' : '0') } catch { /* private mode */ }
}

export default function YourPlayers({ players = [], onPlayerClick = null, watchIds = null, collapsible = true }) {
  const { rows: followed, unfollow } = useFollowing('mlb')
  const account = useDashAccount()
  const [snap, setSnap] = useState(null)
  // Starts closed on the server and on the first client render, then adopts
  // the stored choice in an effect. Reading localStorage during render would
  // make the server's HTML and the client's first pass disagree, which is the
  // hydration mismatch lib/theme.js's applyTheme() comment documents at
  // length — the one that can take the whole root down.
  const [open, setOpen] = useState(false)
  const [shut, setShut] = useState(false)
  useEffect(() => { setOpen(readOpen()); setShut(readShut()) }, [])
  const toggle = () => setOpen((v) => { writeOpen(!v); return !v })
  const toggleShut = () => setShut((v) => { writeShut(!v); return !v })

  useEffect(() => {
    let alive = true
    const pull = () => fetchLiveSlate().then((s) => { if (alive && s) setSnap(s) }).catch(() => {})
    pull()
    // 45s, and never while the tab is hidden — the same cadence and the same
    // guard as every other live surface on this page. The TTL cache means two
    // components on the same tick share one request.
    const t = setInterval(() => { if (!document.hidden) pull() }, 45000)
    return () => { alive = false; clearInterval(t) }
  }, [])

  const rows = useMemo(() => {
    // ── KEYED ON THE LEAGUE'S ID, NOT THE ROW KEY ──────────────────────────
    //
    // A trap worth naming, because it is invisible until a star goes missing.
    // lib/player.js exports TWO identities: `playerId(p)` is a composite ROW
    // key ("571448-778234", man + game) and `mlbId(p)` is the league's numeric
    // id. The star store is keyed on the composite -- that is what makes stars
    // game-scoped and prunable -- while the follow store and every live feed
    // are keyed on the numeric one. Joining the two lists on either key alone
    // silently drops the other list.
    //
    // So the numeric id is the identity here, and the star set is translated
    // into it by walking tonight's rows rather than by parsing the composite
    // string. A starred man is on the slate by construction (stars are pruned
    // with it), so nothing is lost.
    const bySlate = new Map((players || []).map((p) => [String(mlbId(p) || ''), p]).filter(([k]) => k))
    const games = new Map((snap?.games || []).map((g) => [Number(g.pk), g]))
    const lines = snap?.lines || {}

    // The union. A starred man who is not followed still belongs here -- he is
    // highlighted, which is the word Donovan used and the only test that
    // matters.
    const ids = new Map()
    followed.forEach((r) => ids.set(String(r.id), { id: String(r.id), name: r.name, team: r.team, followed: true, starred: false }))
    if (watchIds && watchIds.size) {
      (players || []).forEach((p) => {
        if (!watchIds.has(rowKey(p))) return
        const k = String(mlbId(p) || '')
        if (!k) return
        const had = ids.get(k)
        if (had) { had.starred = true; return }
        ids.set(k, { id: k, name: nameOf(p), team: teamOf(p), followed: false, starred: true })
      })
    }

    return [...ids.values()].map((r) => {
      const p = bySlate.get(r.id) || null
      const line = lines[r.id] || lines[Number(r.id)] || null
      const g = line ? games.get(Number(line.pk)) : (p ? games.get(Number(p.game_pk)) : null)
      const onBoard = !!p

      // WHY `settled` AND NOT `state === 'Final'`. A postponed or suspended
      // game is stopped, not finished, and calling its empty line "final"
      // would tell you his night is over when it has not started. Same rule
      // the grader uses.
      let status = 'off'
      if (line && line.settled) status = 'final'
      else if (line && n(line.ab) + n(line.h) > 0) status = 'live'
      else if (g && g.state === 'Live') status = 'live'
      else if (onBoard || g) status = 'pre'

      const bars = line ? barsCleared(line) : []
      return {
        ...r,
        p,
        line,
        g,
        onBoard,
        status,
        bars,
        hr: n(line?.hr),
        role: String(p?.game_pick_role || '').split('/').filter(Boolean)[0] || '',
        matchup: p ? `${teamOf(p)} ${oppOf(p) ? `vs ${oppOf(p)}` : ''}`.trim() : (r.team || ''),
      }
    }).sort((a, b) => (RANK[a.status] - RANK[b.status])
      || (b.hr - a.hr)
      || (n(b.line?.tb) - n(a.line?.tb))
      || String(a.name).localeCompare(String(b.name)))
  }, [followed, watchIds, players, snap])

  if (!rows.length) {
    return (
      <div style={wrap}>
        <div style={head}>
          <b style={title}>★ Your players</b>
          <span style={note}>nobody yet</span>
        </div>
        <p style={{ ...note, margin: '6px 0 0', lineHeight: 1.6 }}>
          Star a player anywhere on the board and he lands here, with tonight&apos;s line
          beside him. Stars clear with the slate; following doesn&apos;t.
        </p>
      </div>
    )
  }

  const liveN = rows.filter((r) => r.status === 'live').length
  const hrN = rows.reduce((a, r) => a + r.hr, 0)

  // The cap, in one line: the first COLLAPSED_N by rank. `rows` is ranked
  // live-first then homers-first, so the preview is the three loudest nights
  // and the header carries the totals for everyone behind the fold.
  // collapsible={false} is still honoured for any caller that wants the
  // whole list, but no page passes it any more: You.js dropped it on
  // 2026-09-05 because the full list on a phone "makes the scroll too much".
  const shown = (open || !collapsible) ? rows : rows.slice(0, COLLAPSED_N)
  const restN = rows.length - shown.length
  const hidden = rows.slice(shown.length)
  const hiddenLive = hidden.filter((r) => r.status === 'live').length
  const hiddenHr = hidden.filter((r) => r.hr > 0).length

  // WHY THE COUNTS STAY IN THE HEADER WHEN IT IS SHUT. This section exists
  // because starred players were getting lost. A closed section that says
  // nothing would lose them again, more quietly — so the header keeps the
  // whole list's summary, including anyone live and anything that has gone
  // deep, and those stay in colour. Shut means "not now", never "don't tell
  // me". It is the same rule the row slice already follows: the counts
  // describe the WHOLE list, not the visible part, so a homer is never hidden
  // twice.
  const summary = (
    <span style={note}>
      {rows.length}{' '}
      {liveN ? <>· <b style={{ color: C.green }}>{liveN} live</b> </> : null}
      {hrN ? <>· <b style={{ color: C.orange }}>{hrN} HR tonight</b> </> : null}
      {shut && collapsible ? null : <>· {account.signedIn ? 'saved to your account' : 'saved on this device'}</>}
    </span>
  )

  // The watchlist tab passes collapsible={false} — that page IS this list, and
  // a header that could hide it would make the dedicated view the weaker of
  // the two.
  if (collapsible && shut) {
    return (
      <div style={{ ...wrap, padding: '8px 12px' }}>
        <h2 style={{ margin: 0, fontSize: 'inherit', fontWeight: 'inherit' }}>
          <button type="button" onClick={toggleShut} aria-expanded={false}
            style={{ ...head, width: '100%', background: 'transparent', border: 0, padding: 0, cursor: 'pointer', textAlign: 'left', font: 'inherit', color: 'inherit' }}>
            <b style={title}>★ Your players</b>
            {summary}
            <span style={{ marginLeft: 'auto', fontSize: 10, color: C.orange, fontFamily: NUM_FONT, fontWeight: 800 }}>▾</span>
          </button>
        </h2>
      </div>
    )
  }

  return (
    <div style={wrap}>
      {collapsible ? (
        <h2 style={{ margin: 0, fontSize: 'inherit', fontWeight: 'inherit' }}>
          <button type="button" onClick={toggleShut} aria-expanded
            style={{ ...head, width: '100%', background: 'transparent', border: 0, padding: 0, cursor: 'pointer', textAlign: 'left', font: 'inherit', color: 'inherit' }}>
            <b style={title}>★ Your players</b>
            {summary}
            <span style={{ marginLeft: 'auto', fontSize: 10, color: C.orange, fontFamily: NUM_FONT, fontWeight: 800 }}>▴</span>
          </button>
        </h2>
      ) : (
        <div style={head}>
          <b style={title}>★ Your players</b>
          {summary}
        </div>
      )}

      <div style={{ display: 'grid', gap: 1, marginTop: 7 }}>
        {shown.map((r) => (
          <div
            key={r.id}
            className="quiet-tile yp-row"
            role="button"
            tabIndex={0}
            onClick={() => r.p && onPlayerClick?.(r.p)}
            onKeyDown={(e) => { if (e.key === 'Enter' && r.p) onPlayerClick?.(r.p) }}
            title={r.p ? 'Open his card' : 'Not on tonight’s board — nothing to open'}
            style={{
              display: 'flex', alignItems: 'baseline', gap: 9, padding: '6px 9px',
              borderRadius: 8, cursor: r.p ? 'pointer' : 'default',
              opacity: r.status === 'off' ? 0.5 : 1,
            }}
          >
            <span style={{
              width: 5, height: 5, borderRadius: '50%', flexShrink: 0,
              background: r.status === 'live' ? C.green : r.status === 'pre' ? C.orange : 'transparent',
              border: r.status === 'final' || r.status === 'off' ? `1px solid ${C.text3}` : 'none',
            }} className={r.status === 'live' ? 'live-pulse' : undefined} />

            <span style={{ fontSize: 12, fontWeight: 800, color: C.text, flexShrink: 0 }}>{r.name}</span>

            {r.role && (
              <span style={{
                fontSize: 8.5, fontWeight: 900, fontFamily: NUM_FONT, color: C.orange,
                letterSpacing: '.06em', flexShrink: 0,
              }}>{r.role}</span>
            )}

            <span style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT, flexShrink: 0 }}>
              {r.matchup}
            </span>

            {/* THE LINE. This is the whole reason the section was rebuilt, so
                it gets the weight: the numbers are the same size as the name
                and the context around them is grey. */}
            {/* yp-line: one line with the name on a monitor, its own line
                under it on a phone — see MobileCSS. */}
            <span className="yp-line" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0, flexWrap: 'wrap' }}>
              {r.bars.length > 0 && (
                <span style={{ fontSize: 9, fontWeight: 800, color: C.green, fontFamily: NUM_FONT }}>
                  {r.bars.join(' · ')}
                </span>
              )}
              {r.line ? (
                <span style={{ fontSize: 11.5, fontWeight: 700, color: C.text, fontFamily: NUM_FONT, whiteSpace: 'nowrap' }}>
                  {n(r.line.h)}-{n(r.line.ab)}
                  {r.hr > 0 && <b style={{ color: C.orange }}>{' '}{r.hr} HR</b>}
                  {n(r.line.tb) > 0 && <span style={{ color: C.text3 }}>{' '}{n(r.line.tb)} TB</span>}
                </span>
              ) : (
                <span style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT, whiteSpace: 'nowrap' }}>
                  {r.status === 'off' ? 'not on tonight’s board'
                    : r.p?.lineup_spot ? `batting #${r.p.lineup_spot}`
                      : 'yet to bat'}
                </span>
              )}
              <span style={{ fontSize: 9, color: C.text3, fontFamily: NUM_FONT, whiteSpace: 'nowrap' }}>
                {r.status === 'live' ? (inningWord(r.g) || 'live')
                  : r.status === 'final' ? 'final'
                    : r.status === 'pre' && r.g?.statusLabel ? r.g.statusLabel
                      : ''}
              </span>
              {/* Unfollow only removes him from the DURABLE list, and only
                  shows for men who are on it. A starred-only man is cleared by
                  the slate on his own and has no × to press, which is the
                  behaviour the two stores already had. */}
              {r.followed && (
                <button
                  type="button"
                  className="yp-x"
                  aria-label={`Stop following ${r.name}`}
                  title="Stop following"
                  onClick={(e) => { e.stopPropagation(); unfollow(r.id) }}
                  style={{
                    flexShrink: 0, width: 22, height: 22, display: 'flex',
                    alignItems: 'center', justifyContent: 'center', padding: 0,
                    background: 'transparent', border: 'none', borderRadius: 6,
                    color: C.text3, fontSize: 13, lineHeight: 1, cursor: 'pointer',
                  }}
                >×</button>
              )}
            </span>
          </div>
        ))}
      </div>

      {collapsible && (restN > 0 || open) && (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          style={{
            width: '100%', marginTop: 6, padding: '6px 9px',
            background: 'transparent', border: `1px solid ${C.border}`,
            borderRadius: 8, cursor: 'pointer',
            fontSize: 10, fontWeight: 800, fontFamily: NUM_FONT,
            color: C.text3, letterSpacing: '.04em',
          }}
        >
          {open
            ? 'Show less'
            /* Name what is behind the fold. With a hard cap the fold CAN hide
               live men and homers, so the button says how many of each rather
               than promising it hid nothing — the counts come from the whole
               list minus the three on show. */
            : `Show ${restN} more${hiddenLive || hiddenHr
                ? ` — ${[hiddenLive ? `${hiddenLive} live` : '', hiddenHr ? `${hiddenHr} with a HR` : ''].filter(Boolean).join(', ')}`
                : ''}`}
        </button>
      )}
    </div>
  )
}

const wrap = {
  background: C.scrim, border: `1px solid ${C.border2}`, borderRadius: 12,
  padding: '10px 12px 11px', marginBottom: 16,
}
const head = { display: 'flex', alignItems: 'baseline', gap: 9, flexWrap: 'wrap' }
const title = { fontSize: 11, fontWeight: 900, color: C.text, letterSpacing: '.04em' }
const note = { fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT }
