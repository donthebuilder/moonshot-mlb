'use client'
import { useSport } from '../lib/sport'
import Dashboard from './Dashboard'
import NflDashboard from './nfl/NflDashboard'

// One switch, two dashboards.
//
// Kept as its own file rather than a branch inside Dashboard so the MLB shell
// stays exactly what it was — this is additive, and a season's worth of MLB
// work shouldn't gain a conditional at the top of it to make room for August.

export default function SportRoot() {
  const sport = useSport()
  return sport === 'nfl' ? <NflDashboard /> : <Dashboard />
}
