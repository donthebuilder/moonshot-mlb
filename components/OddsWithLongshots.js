'use client'
import { PillRow } from './Filters'
import { useHashLens } from '../lib/useHashLens'

// 🎯 LONGSHOTS IS A LENS ON ODDS (2026-10-17, Donovan: "sure"). Longshots was the Odds table filtered by price against
// the model's score, on its own page and its own More row. Now the Odds page carries it as a second view: the same
// two components, each product passing its own (components/Longshots.js is untouched, '+' slip column included).
// `lens=longshots` rides the address; #tab=longshots is an alias that lands here with it on (lib/routes.js
// ALIAS_PARAMS), so appHref(sport, 'longshots') and every post link keep working. Only the chosen view is mounted.
const VIEWS = ['odds', 'longshots']
const OPTIONS = [{ key: 'odds', label: 'Odds' }, { key: 'longshots', label: 'Longshots' }]

export default function OddsWithLongshots({ odds, longshots }) {
  const [view, setView] = useHashLens(VIEWS, 'odds')
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <PillRow tall label="View" value={view} onChange={setView} options={OPTIONS} />
      {view === 'longshots' ? longshots : odds}
    </div>
  )
}
