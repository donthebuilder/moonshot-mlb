'use client'
import HeadToHead from './HeadToHead'
import NflTable from '../nfl/NflTable'
import { Empty } from '../ui'
import { C, NUM_FONT } from '../../lib/nfl/theme'

// TUDDY's HEAD TO HEAD (2026-10-13): the shared component in TUDDY's own table (NflTable) and accent.
const Kick = ({ children }) => <div style={{ font: `900 11px/1 ${NUM_FONT}`, letterSpacing: '.16em', color: C.green, margin: '0 0 8px' }}>{children}</div>
const UI = { Table: NflTable, EmptyState: Empty, Kicker: Kick }
const THEME = { C, NUM_FONT, accent: C.green }
export default function NflH2H(props) { return <HeadToHead sport="nfl" ui={UI} theme={THEME} {...props} /> }
