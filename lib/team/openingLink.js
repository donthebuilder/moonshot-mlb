// A COLD LINK'S TEAM-PAGE PARAMS (2026-10-10). MOONSHOT's shell rewrites the hash from scratch on its first change, so
// #sport=mlb&tab=team&team=NYY&sec=splits&sv=pit can lose team= / sec= / sv= before the team page has read them. The page reads
// each key ONCE from the address it was opened with (lib/sport.js keeps it), when the live address no longer has it. Once: a
// later visit to the tab is never pinned to the opening link.
import { initialHashParams } from '../sport'
import { writeParam } from '../useShellRoute'

const used = new Set()
export function openingParam(key) {
  if (used.has(key)) return ''
  used.add(key)
  try {
    const h = initialHashParams()
    const v = h.get('tab') === 'team' ? h.get(key) || '' : ''
    // put it back in the live address (after the shell's rewrite), so a later hashchange reads it instead of resetting the page
    if (v && key !== 'team' && typeof window !== 'undefined') setTimeout(() => writeParam(key, v), 400)
    return v
  } catch { return '' }
}
