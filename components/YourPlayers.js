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
import YourPlayersView, { KEYS } from './YourPlayersView'
import { fetchLiveSlate } from '../lib/liveSlate'
import { nameOf, teamOf, oppOf, mlbId, playerId as rowKey } from '../lib/player'
import { onLiveRefresh } from '../lib/liveRefresh'

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

const COLLAPSED_N = 3

// The section is components/YourPlayersView.js (2026-10-03), shared with
// TUDDY and LAMP; this is MOONSHOT's data for it -- the follow and star union,
// tonight's live line, the bars it cleared, and how his line reads.
export default function YourPlayers({ players = [], onPlayerClick = null, watchIds = null, collapsible = true, onUnstar = null, previewN = COLLAPSED_N }) {
  const { rows: followed } = useFollowing('mlb')
  const [snap, setSnap] = useState(null)

  useEffect(() => {
    let alive = true
    const pull = () => fetchLiveSlate().then((s) => { if (alive && s) setSnap(s) }).catch(() => {})
    pull()
    const t = onLiveRefresh(pull)   // LIVE ON YOUR TAP (2026-10-02): no timer -- a ↻ or a return to the tab (lib/liveRefresh.js)
    return () => { alive = false; t() }
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
      // on tonight's slate (R2: was onBoard, which read like the board's status word)
      const onSlate = !!p

      // WHY `settled` AND NOT `state === 'Final'`. A postponed or suspended
      // game is stopped, not finished, and calling its empty line "final"
      // would tell you his night is over when it has not started. Same rule
      // the grader uses.
      let status = 'off'
      if (line && line.settled) status = 'final'
      else if (line && n(line.ab) + n(line.h) > 0) status = 'live'
      else if (g && g.state === 'Live') status = 'live'
      else if (onSlate || g) status = 'pre'

      const bars = line ? barsCleared(line) : []
      return {
        ...r,
        p,
        line,
        g,
        onSlate,
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

  const drawn = rows.map((r) => ({
    ...r,
    lineNode: (
      <>
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
      </>
    ),
    clock: (
      <>
                {r.status === 'live' ? (inningWord(r.g) || 'live')
                  : r.status === 'final' ? 'final'
                    : r.status === 'pre' && r.g?.statusLabel ? r.g.statusLabel
                      : ''}
      </>
    ),
  }))

  return (
    <YourPlayersView sport="mlb" rows={drawn} onPlayerClick={onPlayerClick} collapsible={collapsible}
      onUnstar={onUnstar} previewN={previewN} keys={KEYS.mlb} />
  )
}
