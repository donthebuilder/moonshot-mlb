'use client'
import AttackSheet from './AttackSheet'
import { useLampTeamDeep, useLampBoard } from '../../lib/nhl/useLamp'
import { nhlAttackRows } from '../../lib/nhl/attackSheet'
import { C as NHL_C, NUM_FONT as NHL_FONT, ACCENT as NHL_ACCENT } from '../../lib/nhl/theme'
import { Kicker as LampKicker } from '../lamp/ui'
import { useBucketsDefPos, useBucketsBoard } from '../../lib/nba/useBuckets'
import { nbaAttackRows } from '../../lib/nba/attackSheet'
import { C as NBA_C, NUM_FONT as NBA_FONT, ACCENT as NBA_ACCENT } from '../../lib/nba/theme'
import { Kicker as BucketsKicker } from '../buckets/ui'
import { useAvailable } from '../injuries/useAvailable'

// HOW TO ATTACK THEM on LAMP's and BUCKETS' game pages (2026-10-20, Donovan: "how to attack for all sports"): the data
// each sport's builder needs, read through the hooks those pages already use, into the one AttackSheet.
// OUT MEN NEVER ANSWER A ROW (2026-10-24): the pool loses tonight's out / IL / doubtful men BEFORE a builder picks its
// best, so the next man at that spot takes the row (components/injuries/useAvailable).

/** LAMP: each club's defense (rank of 32, the team page's numbers) against the other club's skaters on tonight's board. */
export function LampAttack({ date, away, home, onOpenPlayer }) {
  const { data: da } = useLampTeamDeep(away)
  const { data: dh } = useLampTeamDeep(home)
  const { data: board } = useLampBoard(date || null)
  const avail = useAvailable()
  const skaters = avail((board?.games || []).flatMap((g) => g.rows || []))
  const deepOf = (club) => (club === away ? da : dh)?.lines
  return (
    <AttackSheet sport="nhl" teams={[away, home]} C={NHL_C} NUM_FONT={NHL_FONT} accent={NHL_ACCENT} Kicker={LampKicker}
      rowsFor={(off, def) => nhlAttackRows(deepOf(def), skaters, off)} turn={() => 'attack'} head={(def) => `${def} DEFENSE · RANK OF 32`}
      onPick={onOpenPlayer ? (p) => onOpenPlayer(p.playerId) : null}
      note="Shoot, crash the net, win the power play: the usual answer to that trait; the skater and his number are real. Rank 1 = the most of that number." />
  )
}

/** BUCKETS: each club's defense against guards / forwards / centers (rank of 30), answered by the other club's player there. */
export function BucketsAttack({ date, away, home, onOpenPlayer }) {
  const { data: defPos } = useBucketsDefPos(date || null)
  const avail = useAvailable()
  const raw = { pts: useBucketsBoard(date || null, 'pts').data, reb: useBucketsBoard(date || null, 'reb').data, ast: useBucketsBoard(date || null, 'ast').data, '3pm': useBucketsBoard(date || null, '3pm').data }
  const boards = Object.fromEntries(Object.entries(raw).map(([k, b]) => [k, b ? { ...b, rows: avail(b.rows || []) } : b]))
  return (
    <AttackSheet sport="nba" teams={[away, home]} C={NBA_C} NUM_FONT={NBA_FONT} accent={NBA_ACCENT} Kicker={BucketsKicker}
      rowsFor={(off, def) => nbaAttackRows(defPos, boards, off, def)} turn={() => 'attack'} head={(def) => `${def} DEFENSE · RANK OF 30`}
      onPick={onOpenPlayer ? (p) => onOpenPlayer(p.playerId) : null}
      note={`What each defense allows a game to a position${defPos?.seasonLabel ? `, ${defPos.seasonLabel}` : ''}; rank 1 = allows the most. The player and his number are real.`} />
  )
}
