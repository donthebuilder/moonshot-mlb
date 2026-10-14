'use client'
import HeadToHead from './HeadToHead'
import DenseTable from '../DenseTable'
import { Empty } from '../ui'
import { C, NUM_FONT } from '../../lib/theme'

// MOONSHOT's HEAD TO HEAD (2026-10-13): the shared component in MOONSHOT's own table (DenseTable) and accent.
const Kick = ({ children }) => <div style={{ font: `900 11px/1 ${NUM_FONT}`, letterSpacing: '.16em', color: C.orange, margin: '0 0 8px' }}>{children}</div>
const UI = { Table: DenseTable, EmptyState: Empty, Kicker: Kick }
const THEME = { C, NUM_FONT, accent: C.orange }
export default function MlbH2H(props) { return <HeadToHead sport="mlb" ui={UI} theme={THEME} {...props} /> }
