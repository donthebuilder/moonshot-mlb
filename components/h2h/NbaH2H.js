'use client'
import HeadToHead from './HeadToHead'
import BucketsTable from '../buckets/BucketsTable'
import { EmptyState, Kicker } from '../buckets/ui'
import { C, NUM_FONT } from '../../lib/nba/theme'

// BUCKETS' HEAD TO HEAD (2026-10-13): the shared component in BUCKETS' own table (BucketsTable) and accent. Only the BUCKETS
// game page imports it, and /api/h2h answers 404 for sport=nba until BUCKETS is open (lib/nba/gate.js).
const UI = { Table: BucketsTable, EmptyState, Kicker }
const THEME = { C, NUM_FONT, accent: C.purple }
export default function NbaH2H(props) { return <HeadToHead sport="nba" ui={UI} theme={THEME} {...props} /> }
