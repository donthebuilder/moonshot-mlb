'use client'
import { useEffect, useMemo, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { nameOf, teamOf, oppOf, clean, n, playerId, mlbId } from '../lib/player'
import { pickBuckets } from './BotPicksStrip'
import { fetchLiveSlate, pickCleared, lineupStatus } from '../lib/liveSlate'
import { Empty } from './ui'

// 🎯 THE PICKS — the page the Bot tab should have been.
//
// 2026-08-10, Donovan: "there's no dedicated page to just showing the bot
// picks. We have the bot page but it's kinda just unusable — in a sense good
// that it's there but it does nothing."
//
// He is right and the reason is one line of state: Bot.js opened on
// `view: 'sheet'`, a raw text dump of mlb_breakdown_today.txt. The picks were
// real and were one click away under "Board", behind a 40-row table. A tab
// called The Bot that lands on a wall of monospace does nothing, exactly as
// described.
//
// WHAT A PICKS PAGE OWES YOU that the strip on Scoreboard does not:
//
//   1. THE BAR. Every category is graded on a different thing — HR needs a
//      homer, HRR needs 2 of (H + R + RBI), CONTACT needs 2 total bases. The
//      strip never said so, so four cards looked like four of the same bet.
//   2. WHERE IT STANDS TONIGHT. Cleared, still live, or done and missed —
//      against that bar, from the boxscore, updating while games run.
//   3. WHETHER HE IS EVEN PLAYING. The card that posts at 4pm can scratch a
//      pick, and until today nothing on this site said so.
//
// The BUCKETS are not re-derived here. pickBuckets() is exported from
// BotPicksStrip and both surfaces call it, because two surfaces naming
// different hitters as "the bot's pick" is a failure this project has already
// had once.

// What each category actually has to do. Same rules pickCleared() grades on —
// written out for the reader rather than left implicit in a function.
const BAR = {
  HR: '1+ home run',
  TOP: '1+ home run',
  HIT: '1+ hit',
  HRR: '2+ of hits, runs, RBI',
  CONTACT: '2+ total bases',
}

// The counting stats that decide each bar, so the live line shows the numbers
// being graded rather than a generic box line.
const SHOWN = {
  HR: (l) => [['HR', l.hr], ['AB', l.ab]],
  TOP: (l) => [['HR', l.hr], ['AB', l.ab]],
  HIT: (l) => [['H', l.h], ['AB', l.ab]],
  HRR: (l) => [['H', l.h], ['R', l.r], ['RBI', l.rbi]],
  CONTACT: (l) => [['TB', l.tb], ['H', l.h]],
}

function StatusPill({ state, label, title }) {
  const col = state === 'won' ? '#4ade80' : state === 'lost' ? '#f87171'
    : state === 'live' ? '#38bdf8' : state === 'out' ? '#f87171' : C.text3
  return (
    <span title={title} style={{
      fontFamily: NUM_FONT, fontSize: 9, fontWeight: 800, letterSpacing: '.04em',
      padding: '1.5px 7px', borderRadius: 999, whiteSpace: 'nowrap',
      border: `1px solid ${col}66`, background: `${col}1a`, color: col,
    }}>{label}</span>
  )
}

function PickRow({ p, cat, lead, snap, onPlayerClick }) {
  // mlbId, not Number(playerId) — see lib/player.js. This was NaN on the
  // first build, so every pick showed a blank status all night.
  const id = mlbId(p)
  const line = snap?.lines?.[id] || null
  const lu = lineupStatus(snap, id, p?.game_pk, p?.lineup_spot)
  const cleared = pickCleared(cat.role, line)
  const done = line ? (line.settled || line.state === 'Final') : false

  // FOUR STATES, and the difference between them is the point. "Still live"
  // and "missed" are not the same row, and neither is "he never played".
  const state = lu.scratched ? 'out'
    : cleared === true ? 'won'
      : cleared === false && done ? 'lost'
        : line ? 'live' : 'pre'
  const label = { out: 'SCRATCHED', won: 'CLEARED', lost: 'MISSED', live: 'LIVE', pre: '' }[state]

  const score = cat.score(p)
  return (
    <div
      onClick={() => onPlayerClick?.(p)}
      className="tap-row"
      style={{
        display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, cursor: 'pointer',
        padding: lead ? '7px 0 6px' : '4px 0',
        borderTop: lead ? 'none' : `1px solid ${C.border}`,
        opacity: state === 'out' ? 0.55 : 1,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, minWidth: 0 }}>
          <span style={{
            fontSize: lead ? 14 : 11.5, fontWeight: lead ? 900 : 700,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            textDecoration: state === 'out' ? 'line-through' : 'none',
          }}>{nameOf(p)}</span>
          {label && <StatusPill state={state} label={label}
            title={{
              out: 'Not in tonight’s posted lineup.',
              won: `Cleared its bar: ${BAR[cat.role] || ''}.`,
              lost: `Game over and the bar was not cleared: ${BAR[cat.role] || ''}.`,
              live: 'His game is running and the bar is still reachable.',
            }[state]} />}
          {lu.moved && <span title={`Batting ${lu.slot} tonight — the bot had him at #${p?.lineup_spot}`}
            style={{ fontFamily: NUM_FONT, fontSize: 8.5, color: C.orange }}>#{p?.lineup_spot}→{lu.slot}</span>}
        </div>
        <div style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {teamOf(p)} vs {oppOf(p)} · #{clean(p?.lineup_spot, '?')} · {clean(p?.pitcher_name, 'TBD')}
          {line ? (
            <>
              {' · '}
              {(SHOWN[cat.role] || SHOWN.HR)(line).map(([k, v], i) => (
                <span key={k} style={{ color: v > 0 ? C.text2 : C.text3 }}>
                  {i ? ' ' : ''}<b style={{ color: v > 0 && k !== 'AB' ? cat.color : undefined }}>{v}</b> {k}
                </span>
              ))}
            </>
          ) : null}
        </div>
      </div>
      <span title={`${cat.label} score — ranked on this category's own scale, not on HR score`}
        style={{
          fontFamily: NUM_FONT, fontSize: lead ? 16 : 12, fontWeight: 900,
          color: cat.color, flexShrink: 0,
        }}>{Number.isFinite(score) ? score.toFixed(1) : '—'}</span>
    </div>
  )
}

export default function PickBoard({ players = [], onPlayerClick }) {
  const [snap, setSnap] = useState(null)

  // Same shared 15s cache every other live surface uses; the cadence follows
  // the night rather than sitting at one number, for the reason the game cards
  // learned earlier today — a score moves every half inning, a lineup does not.
  useEffect(() => {
    let alive = true
    let t = null
    const pull = () => fetchLiveSlate().then((s) => {
      if (!alive || !s) return
      setSnap(s)
      const anyLive = s.games?.some((x) => x.state === 'Live')
      clearInterval(t)
      t = setInterval(() => { if (!document.hidden) pull() }, anyLive ? 30000 : 120000)
    }).catch(() => {})
    pull()
    return () => { alive = false; clearInterval(t) }
  }, [])

  const four = useMemo(() => pickBuckets(players), [players])

  // Tonight's running count, over the LEAD pick of each category — the one the
  // bot would be judged on. Counting all twelve would flatter the record by
  // grading three names in a bucket that only ever recommended one.
  const tally = useMemo(() => {
    let won = 0; let lost = 0; let live = 0; let out = 0
    four.forEach((f) => {
      const p = f.picks[0]
      if (!p) return
      const id = mlbId(p)
      const line = snap?.lines?.[id] || null
      const lu = lineupStatus(snap, id, p?.game_pk, p?.lineup_spot)
      const c = pickCleared(f.role, line)
      const done = line ? (line.settled || line.state === 'Final') : false
      if (lu.scratched) out += 1
      else if (c === true) won += 1
      else if (c === false && done) lost += 1
      else if (line) live += 1
    })
    return { won, lost, live, out }
  }, [four, snap])

  if (!four.some((f) => f.picks.length)) {
    return <Empty text="No designated picks on this slate yet — the bot tags them when it builds the board." />
  }

  const graded = tally.won + tally.lost
  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap',
        padding: '8px 13px', marginBottom: 10,
        background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 11,
      }}>
        <span style={{ fontSize: 12, fontWeight: 900 }}>🎯 Tonight&apos;s picks</span>
        {graded > 0 && (
          <span style={{ fontFamily: NUM_FONT, fontSize: 13, fontWeight: 900, color: tally.won > tally.lost ? '#4ade80' : C.text2 }}>
            {tally.won}/{graded}
          </span>
        )}
        <span style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT }}>
          {tally.live ? `${tally.live} still live · ` : ''}
          {tally.out ? `${tally.out} scratched · ` : ''}
          one lead pick per category, graded against its own bar
        </span>
      </div>

      <div className="bot-picks-grid" style={{
        display: 'grid', gap: 9,
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))',
      }}>
        {four.map((f) => (
          <div key={f.role} style={{
            background: `linear-gradient(155deg, ${f.color}1c, ${f.color}06)`,
            border: `1px solid ${f.color}44`,
            borderRadius: 12, padding: '9px 12px 10px', minWidth: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 2 }}>
              <span style={{ fontSize: 12 }}>{f.icon}</span>
              <span style={{ fontSize: 11, fontWeight: 900, color: f.color, letterSpacing: '.03em' }}>{f.label}</span>
              <span style={{ fontSize: 9.5, color: C.text3 }}>{f.blurb}</span>
            </div>
            {/* THE BAR, stated. Four cards that look identical but are graded
                on four different things is the single most confusing thing
                about this set, and it was never written down anywhere. */}
            <div title="What this pick has to do tonight to count as cleared — the same rule the archive grades on."
              style={{
                fontFamily: NUM_FONT, fontSize: 9, color: C.text2, marginBottom: 6,
                paddingBottom: 5, borderBottom: `1px solid ${C.border}`,
              }}>
              needs <b style={{ color: f.color }}>{BAR[f.role] || '—'}</b>
              <span style={{ color: C.text3 }}> · {f.poolSize} tagged</span>
            </div>
            {f.picks.map((p, i) => (
              <PickRow key={playerId(p)} p={p} cat={f} lead={i === 0} snap={snap} onPlayerClick={onPlayerClick} />
            ))}
          </div>
        ))}
      </div>

      <div style={{ fontSize: 9, color: C.text3, marginTop: 9, lineHeight: 1.55 }}>
        The category is the bot&apos;s own <code>game_pick_role</code>; inside it, ranking is by that
        category&apos;s own score — HR score for the HR picks, hit score for the hit picks — because
        ranking them all on HR score would just hand you the biggest power bats and defeat the
        split. Three deep, not one: across the graded archive #1 and #2 sit in the same quartile, so
        a single name implies a precision the record doesn&apos;t support — and one name dies the
        moment he&apos;s scratched. The record at the top counts the LEAD pick of each category only;
        counting all twelve would flatter it by grading three names in a bucket that recommended one.
      </div>
    </div>
  )
}
