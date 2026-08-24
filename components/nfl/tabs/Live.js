'use client'
import { useMemo } from 'react'
import { C, NUM_FONT, gradeFor } from '../../../lib/nfl/theme'

// SUPERSEDED (2026-08-24, same day this shipped): folded into
// components/nfl/tabs/Games.js instead of staying a second tab — no longer
// imported by NflDashboard.js or listed in lib/nfl/theme.js's TABS. Left on
// disk because the writeup below (exact fields ESPN's scoreboard fetch does
// and doesn't carry, what a real live-play feed would need on the bot side)
// is still accurate and worth keeping if this ever wants its own tab again.
//
// 🔴 LIVE — real-time game state for whatever's actually in progress right
// now. The NFL sibling of the MLB side's live layer, and DELIBERATELY ONE
// SMALL COMPONENT where MLB runs six (LiveAtBats 9KB, LiveWire 32KB, JustNow
// 8.7KB, MiniWire 25KB, GameCockpit 14KB, SlatePulse 19KB — collectively a
// lot of surface). This file is the one slice of that pile NFL's data can
// actually support honestly today: the scoreboard.
//
// WHERE THE DATA COMES FROM, EXACTLY: bots/nfl/nfl_espn.py's fetch() hits
// ESPN's public scoreboard JSON and returns one dict per game with
// home_score, away_score, state ('pre' | 'in' | 'post'), detail (ESPN's own
// shortDetail — e.g. "Q3 8:42", already formatted, not separate quarter/clock
// fields), completed, venue and indoors. nfl_bot.py's build_payload() passes
// that list straight through as `"games": upcoming` — nothing strips or
// renames a field between the ESPN call and nfl_week.json. So `state === 'in'`
// really does mean "live right now," which is exactly the field
// NflDashboard.js's own poll-interval effect already reads to decide whether
// to refresh every 45s instead of every 10 minutes — this tab piggybacks on
// a refresh loop that already exists rather than adding a second one.
//
// WHAT'S DELIBERATELY NOT HERE, AND WHY:
//
//   POSSESSION — not a bug, a real gap. nfl_espn.fetch() never parses a
//   `situation`/possession block from ESPN's response at all; the function
//   only reads competitors, status and venue. Showing a possession arrow
//   would mean inventing a field the payload doesn't carry. Left out rather
//   than faked.
//
//   QUARTER/CLOCK AS SEPARATE FIELDS — also not published; `detail` already
//   bundles them as ESPN's own shortDetail string ("Q3 8:42") and that string
//   is shown as-is below rather than parsed apart for no reason.
//
//   A JustNow-EQUIVALENT LIVE PLAY FEED — this is the one the brief asked to
//   be explicit about. nfl_espn.py already HAS a real per-scoring-event
//   function, scoring_plays(game_id) — quarter, clock, team, type, text, and
//   the score after the play, which is genuinely enough to build a MLB-style
//   "just now" rail from. It is simply never called: grep bots/nfl/nfl_bot.py
//   for "scoring_plays" and there is nothing — build_payload() calls
//   nfl_espn.fetch() for the schedule and never nfl_espn.scoring_plays() for
//   any game, live or otherwise, so nothing it would return has ever reached
//   nfl_week.json. To build a real live wire later, the bot side needs: (1)
//   build_payload calling scoring_plays(g["game_id"]) for every game with
//   state 'in' and publishing the result (a new top-level key, e.g.
//   "live_plays": {game_id: [...]}, not folded into the games array); (2) a
//   decision on live-mode refresh cadence — scoring_plays hits ESPN's summary
//   endpoint per game, so calling it on every slate build is a different cost
//   than calling it on a dedicated fast live loop, and nothing about the
//   current bot schedule was inspected as part of this build to say which one
//   it runs on; (3) client-side dedup so a 45s re-poll doesn't replay a whole
//   quarter's plays as "just happened" — MLB's JustNow.js solves that by
//   diffing consecutive snapshots, which is the right shape to copy once (1)
//   and (2) exist. None of that exists today, so this file shows the honest
//   smaller thing instead of a feed with nothing behind it.
//
//   THE OTHER FOUR MLB SURFACES — GameCockpit (single-game count/outs/who's
//   up) needs play-by-play NFL doesn't publish; MiniWire (cross-tab sticky
//   ticker + toasts) and SlatePulse (unconfirmed-lineup countdown + day-over-
//   day pick diff) are both built on MLB-specific concepts (lineup
//   confirmation, a graded-archive diff) that don't have an NFL equivalent
//   wired up yet either. Out of scope for this pass, not forgotten.
//
// TODAY'S COMMITTED SNAPSHOT (public/data/nfl/week.json, the floor this tab
// falls back to before the live bot payload wins) is a 3-game preseason wave
// with every game in state 'pre' — so the honest empty state below is what
// this tab shows most of the time until a real kickoff happens. That's
// expected, not broken.

function ScoreLine({ g }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, fontFamily: NUM_FONT }}>
      <span style={{ fontSize: 13, fontWeight: 800, color: C.text2, minWidth: 34 }}>{g.away}</span>
      <span style={{ fontSize: 26, fontWeight: 900, color: C.text }}>{g.away_score ?? 0}</span>
      <span style={{ fontSize: 13, color: C.text3 }}>–</span>
      <span style={{ fontSize: 26, fontWeight: 900, color: C.text }}>{g.home_score ?? 0}</span>
      <span style={{ fontSize: 13, fontWeight: 800, color: C.text2, minWidth: 34 }}>{g.home}</span>
    </div>
  )
}

// The single top score in this game, either side, so a live card also points
// somewhere useful instead of being score-only. No new data — same `scores`
// object every other tab reads, just the max across everyone on the field.
function TopOnBoard({ players, away, home, onPlayerClick }) {
  const top = players
    .filter((p) => (p.team === away || p.team === home) && !p.low_sample)
    .map((p) => ({ p, s: p.scores?.TD ?? 0 }))
    .sort((a, b) => b.s - a.s)[0]
  if (!top) return null
  const gr = gradeFor(top.s)
  return (
    <button
      onClick={() => onPlayerClick?.(top.p, 'TD')}
      style={{
        display: 'flex', alignItems: 'center', gap: 7, width: '100%', marginTop: 8,
        background: 'rgba(255,255,255,.03)', border: `1px solid ${C.border}`,
        borderRadius: 8, padding: '5px 8px', cursor: onPlayerClick ? 'pointer' : 'default',
        textAlign: 'left',
      }}
    >
      <span style={{ fontSize: 8.5, color: C.text3, letterSpacing: '.06em', textTransform: 'uppercase' }}>Top board</span>
      <span style={{ fontSize: 11, fontWeight: 700, color: C.text, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {top.p.name}
      </span>
      <span style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT }}>{top.p.team}</span>
      <span style={{ fontFamily: NUM_FONT, fontSize: 11, fontWeight: 900, color: gr.color }}>{Math.round(top.s)}</span>
    </button>
  )
}

function LiveCard({ g, players, onPlayerClick }) {
  return (
    <div style={{
      background: `linear-gradient(155deg, rgba(34,211,238,.08), ${C.bg2} 55%)`,
      border: `1px solid rgba(34,211,238,.4)`, borderRadius: 13, padding: '12px 14px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{
          width: 7, height: 7, borderRadius: 999, background: C.cyan,
          boxShadow: `0 0 6px ${C.cyan}`, flexShrink: 0,
        }} />
        <span style={{ fontSize: 9.5, fontWeight: 900, color: C.cyan, letterSpacing: '.08em', fontFamily: NUM_FONT }}>
          LIVE
        </span>
        <span style={{ fontSize: 11, fontWeight: 800, color: C.text2, fontFamily: NUM_FONT }}>
          {g.detail || 'In progress'}
        </span>
        {g.venue && (
          <span style={{ marginLeft: 'auto', fontSize: 9, color: C.text3, textAlign: 'right' }}>
            {g.venue}{g.indoors ? ' · indoors' : ''}
          </span>
        )}
      </div>
      <ScoreLine g={g} />
      <TopOnBoard players={players} away={g.away} home={g.home} onPlayerClick={onPlayerClick} />
    </div>
  )
}

function OtherRow({ g }) {
  let status
  if (g.completed) {
    status = <span style={{ color: C.text3 }}>Final {g.away_score ?? 0}–{g.home_score ?? 0}</span>
  } else {
    let t = g.detail
    if (!t && g.kickoff) {
      try {
        t = new Date(g.kickoff).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })
      } catch { t = 'TBD' }
    }
    status = <span style={{ color: C.text3 }}>{t || 'TBD'}</span>
  }
  return (
    <div style={{
      display: 'flex', alignItems: 'baseline', gap: 8, padding: '5px 0',
      borderTop: `1px solid ${C.border}`, fontSize: 10.5,
    }}>
      <span style={{ fontWeight: 700, color: C.text2, fontFamily: NUM_FONT }}>{g.away} @ {g.home}</span>
      <span style={{ marginLeft: 'auto', fontFamily: NUM_FONT, fontSize: 10 }}>{status}</span>
    </div>
  )
}

export default function Live({ data, onPlayerClick }) {
  const players = data?.players || []
  const gameCount = data?.games?.length || 0

  // data?.games || [] mints a fresh array reference on every render when
  // data.games is absent, so — same fix Accountability.js's ScoreBands and
  // the Pairs.js tab already apply — the fallback lives INSIDE each memo
  // callback rather than as a shared dependency.
  const liveGames = useMemo(() => (data?.games || []).filter((g) => g.state === 'in'), [data])
  const otherGames = useMemo(() => (data?.games || []).filter((g) => g.state !== 'in'), [data])

  if (!gameCount) {
    return (
      <div style={{
        border: `1px dashed ${C.border2}`, borderRadius: 12, padding: 28,
        textAlign: 'center', color: C.text3, fontSize: 12.5,
      }}>
        No games on this slate yet. The bot posts the week when the schedule lands.
      </div>
    )
  }

  return (
    <div>
      <div style={{ fontSize: 11, color: C.text3, marginBottom: 12, lineHeight: 1.6 }}>
        Score, quarter and clock for whatever&apos;s in progress right now — pulled straight from the same
        scoreboard fetch every other live field on the site uses. No possession indicator: the bot doesn&apos;t
        publish one yet (see this file&apos;s header). Refreshes every 45s while anything below is live, same
        interval the rest of the dashboard already polls on.
      </div>

      {liveGames.length > 0 ? (
        <div style={{
          display: 'grid', gap: 10, marginBottom: otherGames.length ? 16 : 0,
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
        }}>
          {liveGames.map((g) => (
            <LiveCard key={g.game_id} g={g} players={players} onPlayerClick={onPlayerClick} />
          ))}
        </div>
      ) : (
        <div style={{
          border: `1px dashed ${C.border2}`, borderRadius: 12, padding: '20px 16px',
          textAlign: 'center', color: C.text3, fontSize: 11.5, marginBottom: otherGames.length ? 14 : 0,
        }}>
          Nothing live right now. {otherGames.length > 0 ? 'This wave’s games are below.' : ''}
        </div>
      )}

      {otherGames.length > 0 && (
        <div>
          <div style={{ fontSize: 9.5, color: C.text3, marginBottom: 2, letterSpacing: '.04em', textTransform: 'uppercase' }}>
            Rest of this wave
          </div>
          {otherGames.map((g) => <OtherRow key={g.game_id} g={g} />)}
        </div>
      )}
    </div>
  )
}
