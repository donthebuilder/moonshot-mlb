'use client'
import { FLAT_CHIP_CLASS, flatChip } from '../../lib/chips'

// 🎚 SPLIT CHIPS -- the filter row over a player's bars (lib/barFilters.js). Flat chips (lib/chips), wrapped, no pop-out.
// A tap picks a chip (the other in its group lets go); a second tap clears it. "Clear" shows once anything is picked.
// Sport-free: the caller passes the chips, the picked map and its theme.
export default function SplitChips({ chips = [], picked = {}, onChange, C, NUM_FONT, accent, label = 'Filter his games' }) {
  const any = Object.values(picked).some(Boolean)
  const toggle = (c) => onChange({ ...picked, [c.group]: picked[c.group] === c.key ? null : c.key })
  return (
    <div role="group" aria-label={label} style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
      {chips.map((c, i) => {
        const on = picked[c.group] === c.key
        const gap = i > 0 && chips[i - 1].group !== c.group
        return (
          <button key={`${c.group}:${c.key}`} type="button" className={FLAT_CHIP_CLASS} aria-pressed={on} title={c.title || ''} onClick={() => toggle(c)}
            style={{ ...flatChip(on, accent, C, NUM_FONT), marginLeft: gap ? 4 : 0 }}>{c.text}</button>
        )
      })}
      {any ? (
        <button type="button" className={FLAT_CHIP_CLASS} onClick={() => onChange({})} style={{ ...flatChip(false, accent, C, NUM_FONT), color: C.text3, borderStyle: 'dashed' }}>Clear</button>
      ) : null}
    </div>
  )
}
