'use client'
import { PillRow } from './Filters'
import { useHashLens } from '../lib/useHashLens'

// ONE PAGE, TWO VIEWS (2026-10-17, Donovan: "keep going on the simplify audit"): the way Odds carries Longshots
// (components/OddsWithLongshots.js) and Power carries Hot streaks. `views` is [{ key, label, node }], the first one the
// default (it writes nothing to the address); the others ride `lens=<key>`, so a link, a reload and Back all agree.
// A retired page key (#tab=schedule, #tab=scores) is an alias that lands on the host with its lens set
// (lib/routes.js ALIAS_PARAMS). Only the chosen view is mounted, so the other one fetches and polls nothing.
export default function PageViews({ views, label = 'View' }) {
  const keys = views.map((v) => v.key)
  const [view, setView] = useHashLens(keys, keys[0])
  const on = views.find((v) => v.key === view) || views[0]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <PillRow tall label={label} value={on.key} onChange={setView} options={views.map(({ key, label: l }) => ({ key, label: l }))} />
      {on.node}
    </div>
  )
}
