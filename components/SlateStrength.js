'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { hrScore } from '../lib/player'
import { groupGames } from '../lib/data'
import { rampColor, inkFor } from './Heatmap'

// 📐 SLATE STRENGTH — what an average score is worth TONIGHT.
//
// 2026-08-10, Donovan: "I also want a score on the scoreboard of the players'
// average scores — does that make sense?"
//
// It does, and it answers a question the site has never answered: a hitter's
// HR score is 61 — is that good? Every score on this site is ranked against
// the slate it came from, so 61 means one thing on a fifteen-game Coors night
// and another on a six-game Tuesday. The number was always relative and the
// reference point was never shown.
//
// WHY THE MEAN ALONE WOULD BE A BAD ANSWER, and what is here instead.
//
// A mean over a whole slate barely moves night to night — every slate has a
// long tail of eighth and ninth hitters, and averaging them in flattens the
// thing you are trying to see. Two numbers fix that:
//
//   MEDIAN, not just mean. The mean is pulled by the tail; the median is the
//   actual middle of the board, which is what "is 61 good" is really asking.
//   When the two disagree, the gap tells you the slate is top-heavy.
//
//   TOP 10, because you never bet the median. The average of the ten best
//   bats is the number that says whether tonight has anything worth playing.
//
// PER GAME, the same trap in miniature and worse. A lineup mean is dragged by
// the bottom of the order, so a game with two elite bats and seven weak ones
// averages the same as nine mediocre ones — and those are completely
// different games to bet. Every row therefore carries BOTH its lineup average
// and its top-3 average, and the table sorts on top-3 by default because that
// is the one that separates them.

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
const median = (xs) => {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
const topN = (xs, k) => [...xs].sort((a, b) => b - a).slice(0, k)

export default function SlateStrength({ players = [], onGameClick }) {
  const [sortKey, setSortKey] = useState('top3')

  const stats = useMemo(() => {
    const all = players.map(hrScore).filter((v) => Number.isFinite(v) && v > 0)
    if (all.length < 5) return null
    const games = groupGames(players).map((g) => {
      const scores = (g.players || []).map(hrScore).filter((v) => Number.isFinite(v) && v > 0)
      const t3 = topN(scores, 3)
      return {
        key: g.game_pk || `${g.away}@${g.home}`,
        label: `${g.away} @ ${g.home}`,
        pk: g.game_pk,
        n: scores.length,
        avg: mean(scores),
        top3: mean(t3),
        best: t3[0] || 0,
      }
    }).filter((g) => g.n >= 6)
    return {
      n: all.length,
      avg: mean(all),
      med: median(all),
      top10: mean(topN(all, 10)),
      lo: Math.min(...all),
      hi: Math.max(...all),
      games,
    }
  }, [players])

  if (!stats) return null
  const games = [...stats.games].sort((a, b) => b[sortKey] - a[sortKey])
  // Colour every game against the SPREAD OF GAMES, not against the player
  // scale — nine-hitter averages live in a much narrower band than individual
  // scores do, and ramping them on the player range would paint every game the
  // same shade. Same rule the heat map follows everywhere: scale to what is on
  // screen.
  const vals = games.map((g) => g[sortKey])
  const gLo = Math.min(...vals, 0)
  const gHi = Math.max(...vals, 1)

  const Stat = ({ label, value, tip, accent }) => (
    <div title={tip} style={{ cursor: 'help', minWidth: 0 }}>
      <div style={{
        fontSize: 8, letterSpacing: '.06em', textTransform: 'uppercase',
        color: C.text3, fontFamily: NUM_FONT, whiteSpace: 'nowrap',
      }}>{label}</div>
      <div style={{
        fontFamily: NUM_FONT, fontSize: 15, fontWeight: 900,
        color: accent || C.text, lineHeight: 1.15,
      }}>{value}</div>
    </div>
  )

  return (
    <div>
      <div style={{
        display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start',
        padding: '9px 13px', marginBottom: 9,
        background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 11,
      }}>
        <Stat label="Bats scored" value={stats.n}
          tip="Hitters on tonight's slate carrying an HR score." />
        <Stat label="Median" value={stats.med.toFixed(1)} accent={C.text}
          tip="The actual middle of tonight's board. This is the number to compare a hitter against — half the slate is above it, half below." />
        <Stat label="Average" value={stats.avg.toFixed(1)} accent={C.text2}
          tip="The mean across every scored bat. Sits below the median when the slate is bottom-heavy; the gap between the two is the shape of the night." />
        <Stat label="Top 10 avg" value={stats.top10.toFixed(1)} accent={C.orange}
          tip="The average of tonight's ten best bats — whether this slate has anything worth playing at all." />
        <Stat label="Range" value={`${stats.lo.toFixed(0)}–${stats.hi.toFixed(0)}`}
          tip="Lowest and highest scored bat tonight. Every colour on the site is scaled between these two." />
      </div>

      <div style={{ display: 'flex', gap: 5, alignItems: 'baseline', marginBottom: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 9, color: C.text3, textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 800 }}>
          Rank games by
        </span>
        {[['top3', 'Best 3 bats', 'The average of a game’s three best scores. Sorts on this by default — it is the number that separates a game with real bats from nine mediocre ones.'],
          ['avg', 'Whole lineup', 'The average across every scored bat in the game. Dragged down by the bottom of the order, which is why it is not the default.'],
          ['best', 'Single best', 'Just the top bat in the game.']].map(([k, label, why]) => (
            <button key={k} type="button" title={why} onClick={() => setSortKey(k)}
              style={{
                padding: '2px 9px', borderRadius: 999, cursor: 'pointer', fontSize: 9.5, fontWeight: 700,
                border: `1px solid ${sortKey === k ? C.orange : C.border}`,
                background: sortKey === k ? 'rgba(249,115,22,.12)' : 'transparent',
                color: sortKey === k ? C.orange : C.text3,
              }}>{label}</button>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {games.map((g) => {
          const bg = rampColor(g[sortKey], gLo, gHi)
          return (
            <div key={g.key} onClick={() => onGameClick?.(g.pk)}
              className="tap-row"
              title={`${g.label} — ${g.n} bats scored · lineup average ${g.avg.toFixed(1)} · best three average ${g.top3.toFixed(1)} · top bat ${g.best.toFixed(1)}`}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '3px 6px',
                borderRadius: 6, cursor: onGameClick ? 'pointer' : 'default', minWidth: 0,
              }}>
              <span style={{
                fontFamily: NUM_FONT, fontSize: 11, fontWeight: 800, flex: 1, minWidth: 0,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: C.text2,
              }}>{g.label}</span>
              <span style={{ fontFamily: NUM_FONT, fontSize: 9, color: C.text3, width: 34, textAlign: 'right', flexShrink: 0 }}>
                {g.n} bats
              </span>
              {/* The two numbers side by side, always — reading the pair is the
                  point. A game where they are far apart is top-heavy. */}
              <span title="Whole lineup average" style={{
                fontFamily: NUM_FONT, fontSize: 10.5, color: C.text3, width: 30, textAlign: 'right', flexShrink: 0,
              }}>{g.avg.toFixed(1)}</span>
              <span style={{
                fontFamily: NUM_FONT, fontSize: 11, fontWeight: 800,
                background: bg || C.bg3, color: bg ? inkFor(bg) : C.text3,
                padding: '2px 7px', borderRadius: 5, minWidth: 38, textAlign: 'center', flexShrink: 0,
              }}>{g[sortKey].toFixed(1)}</span>
            </div>
          )
        })}
      </div>

      <div style={{ fontSize: 9, color: C.text3, marginTop: 7, lineHeight: 1.55 }}>
        Every score on this site is ranked against the slate it came from, so this is the
        reference the rest of the board is missing: <b style={{ color: C.text2 }}>compare a hitter
        to the median</b>, not to 50. The left number on each game row is its whole-lineup average
        and the coloured one is whatever you sorted by — when they are far apart, that game is two
        good bats and seven passengers, which is a different game to play than a deep one.
        Games with fewer than six scored bats are left out rather than shown on thin evidence.
      </div>
    </div>
  )
}
