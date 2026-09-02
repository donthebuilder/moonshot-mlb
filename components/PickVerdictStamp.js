'use client'
import { useEffect, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { fetchLiveSlate, pickCleared } from '../lib/liveSlate'
import { primaryRole } from '../lib/verdict'
// mlbId, NOT playerId. playerId() is the composite "<id>-<game_pk>" row key
// used for dedupe and React keys; the live snapshot's `lines` map is keyed by
// the league's numeric id, which is what every other consumer of it joins on
// (LiveWire, AtThePlate, the Boxes counters). Number() of the composite is
// NaN, which would make this component silently render nothing, forever.
import { mlbId } from '../lib/player'

// ── #59: THE CARD HAD NO POST-GAME STATE, ON A SITE BUILT ON GRADING ────────
//
// Caught with a hitter whose HIT pick had cleared: the EV Log inside the card
// read "Tonight · final" with three batted balls logged, and the card around
// it was still entirely pre-game. HRW 62, #1 Weak P, "bot's pick: HRR + HR
// Sprinkle", an Overview read in the future tense, and a Pitcher panel still
// forecasting "84°, wind blowing out at 5 mph, 13% chance of rain, roof
// open" for a game that had finished. Every other surface on this site
// grades; the card a person actually opens did not.
//
// This is the smallest thing that fixes the headline of that: one stamp above
// the hero, from the same live lines the strip and the Boxes counters read,
// saying what the pick needed and whether it got there. It leads the card
// once there is an outcome, because after first pitch the outcome IS the
// story and everything under it is the reasoning that led to it.
//
// It says nothing before a hitter has batted -- pickCleared returns null on
// zero at-bats, which is "not judgeable yet", not "missed".

const BARS = {
  HR: '1+ home run',
  TOP: '1+ home run',
  HIT: '1+ hit',
  HRR: '2+ hits, runs and RBI combined',
  CONTACT: '2+ total bases',
  TB: '2+ total bases',
}

const lineText = (l) => {
  const bits = [`${l.h}-${l.ab}`]
  if (l.hr) bits.push(`${l.hr} HR`)
  if (l.tb > l.h) bits.push(`${l.tb} TB`)
  if (l.r) bits.push(`${l.r} R`)
  if (l.rbi) bits.push(`${l.rbi} RBI`)
  if (l.k) bits.push(`${l.k} K`)
  return bits.join(' · ')
}

export default function PickVerdictStamp({ player }) {
  const [line, setLine] = useState(null)
  const pid = mlbId(player)

  useEffect(() => {
    if (!pid) return undefined
    let alive = true
    const pull = () => fetchLiveSlate()
      .then((snap) => { if (alive) setLine(snap?.lines?.[pid] || null) })
      .catch(() => {})
    pull()
    const id = setInterval(() => { if (!document.hidden) pull() }, 60000)
    return () => { alive = false; clearInterval(id) }
  }, [pid])

  if (!line) return null

  const role = primaryRole(player)
  const verdict = role ? pickCleared(role, line) : null
  const done = line.state === 'Final' || line.settled === true
  // Nothing to say before he has come to the plate, and nothing to say about a
  // hitter who was never a pick and whose game has not finished.
  if (!done && verdict === null) return null

  const tone = verdict === true ? C.green : verdict === false ? C.red : C.text3
  const head = !role
    ? (done ? 'FINAL' : 'IN PROGRESS')
    : verdict === true ? `${role} PICK CLEARED`
      : verdict === false ? (done ? `${role} PICK MISSED` : `${role} PICK — NOT THERE YET`)
        : `${role} PICK — NOT JUDGEABLE YET`

  return (
    <div
      role="status"
      style={{
        display: 'flex', alignItems: 'baseline', gap: 9, flexWrap: 'wrap',
        border: `1px solid ${tone}55`, background: `${tone}12`,
        borderRadius: 11, padding: '8px 13px', marginBottom: 10,
      }}
    >
      <span style={{ font: `900 9px/1 ${NUM_FONT}`, letterSpacing: '.12em', color: tone }}>
        {verdict === true ? '✓ ' : verdict === false && done ? '✗ ' : ''}{head}
      </span>
      <span style={{ font: `700 10.5px/1.4 ${NUM_FONT}`, color: C.text2 }}>{lineText(line)}</span>
      {role && BARS[role] && (
        <span style={{ fontSize: 9.5, color: C.text3 }}>
          needed {BARS[role]}
        </span>
      )}
      <span style={{ marginLeft: 'auto', font: `800 8.5px/1 ${NUM_FONT}`, color: C.text3, letterSpacing: '.08em' }}>
        {done ? 'GAME FINAL' : 'LIVE'}
      </span>
    </div>
  )
}
