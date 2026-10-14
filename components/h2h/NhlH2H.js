'use client'
import HeadToHead from './HeadToHead'
import LampTable from '../lamp/LampTable'
import { EmptyState, Kicker } from '../lamp/ui'
import { C, NUM_FONT } from '../../lib/nhl/theme'

// LAMP's HEAD TO HEAD (2026-10-13): the shared component in LAMP's own table (LampTable) and accent.
const UI = { Table: LampTable, EmptyState, Kicker }
const THEME = { C, NUM_FONT, accent: C.ice }
export default function NhlH2H(props) { return <HeadToHead sport="nhl" ui={UI} theme={THEME} {...props} /> }
