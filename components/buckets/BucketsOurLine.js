'use client'
import OurLineTable from '../game/OurLineTable'
import { C, NUM_FONT } from '../../lib/nba/theme'
import { Kicker } from './ui'

// 🏀 BUCKETS' "OUR LINE" (2026-10-19): the shared table (components/game/OurLineTable.js) in BUCKETS' theme and kicker,
// with "who's out" in the words once both clubs' rotations are counted. Info only: no CALLED, no %.
export { OUR_LINE_WORDS, fmtSpread } from '../game/OurLineTable'

export default function BucketsOurLine({ line, onOpenTeam, onOpenPlayer }) {
  const counted = line?.out?.away != null && line?.out?.home != null
  return <OurLineTable line={line} sport="nba" theme={{ C, NUM_FONT }} accent={C.purple} Kicker={Kicker}
    reads={`Ratings, rest, home court${counted ? ' and who’s out' : ''}`} onOpenTeam={onOpenTeam} onOpenPlayer={onOpenPlayer} />
}
