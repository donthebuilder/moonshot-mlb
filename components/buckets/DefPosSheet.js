'use client'
import { useState } from 'react'
import TeamMark from '../TeamMark'
import Tap from '../Tap'
import { C, NUM_FONT } from '../../lib/nba/theme'
import { WINDOWS, DEF_STATS, posView, posKeyFor } from '../../lib/nba/defPos'
import { useBucketsDefPos } from '../../lib/nba/useBuckets'
import BucketsTable from './BucketsTable'
import { statCell } from './DefPosTable'
import { Kicker, LastSeasonNote, Pills } from './ui'

// row labels as words: a bare "STL" reads as a club code (St. Louis) to the reader and to check-clickable
const WORD = { pts: 'Points', reb: 'Rebounds', ast: 'Assists', tpm: 'Threes', stl: 'Steals', blk: 'Blocks', pra: 'P+R+A' }

// 🛡 D2 · ONE CLUB'S DEFENSE VS ONE POSITION, THREE WINDOWS (2026-10-19, mock D2). Last 5 | last 10 | season side by
// side, value + rank of 30 (1 = gave up the most), so a trend shows without a toggle. The game page draws both clubs
// (DefPosGame); the player page draws his next opponent against his position (DefPosFor).
function Sheet({ t, club, against, pos, words, onOpenTeam }) {
  const rows = DEF_STATS.map(([k]) => ({ _id: k, stat: WORD[k], ...Object.fromEntries(WINDOWS.map(([w]) => [w, t?.[w]?.[club]?.v?.[k]])), ranks: Object.fromEntries(WINDOWS.map(([w]) => [w, t?.[w]?.[club]?.r?.[k]])) }))
  const cols = [
    { key: 'stat', label: 'Allowed', group: 'Stat', w: 80, heat: false, sticky: true, numeric: false },
    ...WINDOWS.map(([w, label]) => ({ key: w, label: label.replace('Last ', 'L'), group: `A game, rank of 30`, w: 64, heat: false, mono: true, fmt: (v, r) => statCell(v, r.ranks?.[w]) })),
  ]
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 6, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, font: `800 12px/1.2 ${NUM_FONT}`, color: C.text2, minHeight: 44 }}>
        <Tap onClick={onOpenTeam ? () => onOpenTeam(club) : null} title={`Open ${club}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 44, color: C.text }}><TeamMark sport="nba" abbr={club} variant="logo" px={20} />{club} D</Tap>
        <span>vs {against ? `${against}'s ` : ''}{words[pos].toLowerCase()}</span>
      </div>
      <BucketsTable rows={rows} columns={cols} heatMode="none" maxHeight={9999} maxRows={rows.length} />
    </div>
  )
}

/** The game page: both clubs' defenses against the other's guards / forwards / centers. */
export function DefPosGame({ date, away, home, onOpenTeam }) {
  const { data } = useBucketsDefPos(date || null)
  const { table, words } = posView(data)
  const [picked, setPos] = useState(null)
  const pos = picked && words[picked] ? picked : Object.keys(words)[0]
  const t = table?.[pos]
  if (!t?.Season?.[away] || !t?.Season?.[home]) return null
  return (
    <section aria-label="Defense vs position" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8, minWidth: 0 }}>
      <Kicker>DEFENSE VS POSITION · {data.seasonLabel}</Kicker>
      {data.stale && <LastSeasonNote label={data.seasonLabel} what="defense-vs-position numbers" />}
      <Pills ariaLabel="Position" value={pos} onChange={setPos} options={Object.keys(words).map((k) => ({ key: k, text: words.PG ? k : words[k].toUpperCase(), title: words[k] }))} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: 12 }}>
        <Sheet t={t} club={home} against={away} pos={pos} words={words} onOpenTeam={onOpenTeam} />
        <Sheet t={t} club={away} against={home} pos={pos} words={words} onOpenTeam={onOpenTeam} />
      </div>
    </section>
  )
}

/** The player page: his next opponent's defense against his position. */
export function DefPosFor({ opp, espnPos, pos5 = null, onOpenTeam }) {
  const { data } = useBucketsDefPos(null)
  const { table, words } = posView(data)
  const pos = posKeyFor(data, espnPos, pos5)
  const t = pos ? table?.[pos] : null
  if (!t?.Season?.[opp]) return null
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 6, minWidth: 0 }}>
      <Kicker>{opp} D VS {words[pos].toUpperCase()}</Kicker>
      {data.stale && <LastSeasonNote label={data.seasonLabel} what="defense-vs-position numbers" />}
      <Sheet t={t} club={opp} pos={pos} words={words} onOpenTeam={onOpenTeam} />
    </div>
  )
}
