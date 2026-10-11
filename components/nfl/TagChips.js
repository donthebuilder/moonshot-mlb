'use client'
import { C, NUM_FONT } from '../../lib/nfl/theme'
import { explain } from '../../lib/explain'
import { chipText } from '../../lib/nfl/tags'

// THE TAG CHIP (lib/nfl/tags.js is the one registry). A short neutral label; tapping or hovering it says WHICH number,
// WHICH season and how many games are behind it (lib/explain.js: the same pattern RoleTag and every other
// hover-only meaning uses, so a phone gets it on tap). One look for all of them, TUDDY's colour diet: grey ink, a
// dot that says whose side it is on. Filled accent dot = a soft spot to attack (weak corners, weak pass rush, soft vs
// run); hollow grey dot = a tough spot; yellow dot (the one caution) = a ball-security flag on a player. Colour is a
// hint, the WORDS carry the meaning. Never "will" language: the note says what the games played show.
const TONE = {
  weak_corners: 'soft', weak_pass_rush: 'soft', soft_vs_run: 'soft',
  strong_corners: 'tough', strong_pass_rush: 'tough', run_stuffers: 'tough',
  fumble_prone: 'caution', interception_prone: 'caution',
}
const dotStyle = (tone) => ({
  width: 7, height: 7, borderRadius: 7, flexShrink: 0, boxSizing: 'border-box',
  background: tone === 'soft' ? C.green : tone === 'caution' ? C.yellow : 'transparent',
  border: tone === 'tough' ? `1.5px solid ${C.text3}` : 'none',
})

/** One chip. `onPlayerRow` prefixes a defence tag with its club ("ATL weak corners"). */
export function TagChip({ tag, onPlayerRow = false, style }) {
  const word = chipText(tag, { onPlayerRow })
  const say = (e) => { e.stopPropagation(); explain(word, tag.note) }
  return (
    <span role="button" tabIndex={0} className="tag-chip" title={tag.note} aria-label={`${word}. ${tag.note}`}
      onClick={say} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); say(e) } }}
      style={{
        position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'help', whiteSpace: 'nowrap',
        padding: '3px 8px', borderRadius: 999, border: `1px solid ${C.border2}`, background: 'transparent', color: C.text,
        font: `700 12px/1.3 system-ui, sans-serif`, ...style,
      }}>
      <i aria-hidden="true" style={dotStyle(TONE[tag.key])} />{word}
    </span>
  )
}

/**
 * A row of chips. `tags` = tag objects (lib/nfl/tags.js). `max` caps how many print ("+N" opens as a plain count).
 * Renders nothing when there are none: a tag that does not clear its line is simply absent, never a "no tag" chip.
 * The 44px tap area is a pseudo-element, so the chip stays 22px tall in a table cell and two chips never overlap.
 */
export default function TagChips({ tags = [], onPlayerRow = false, max = 6, gap = 8, style }) {
  if (!tags?.length) return null
  const shown = tags.slice(0, max)
  return (
    <span className="tag-chips" style={{ display: 'inline-flex', flexWrap: 'wrap', alignItems: 'center', gap, rowGap: 10, ...style }}>
      <style>{`.tag-chip::after{content:'';position:absolute;left:-3px;right:-3px;top:-11px;bottom:-11px}`}</style>
      {shown.map((t) => <TagChip key={`${t.key}-${t.team || ''}`} tag={t} onPlayerRow={onPlayerRow} />)}
      {tags.length > shown.length && <span style={{ font: `700 11px/1 ${NUM_FONT}`, color: C.text3 }}>+{tags.length - shown.length}</span>}
    </span>
  )
}
