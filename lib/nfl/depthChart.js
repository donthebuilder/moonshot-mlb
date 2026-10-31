// 🏈 THE TRUE DEPTH CHART (2026-10-31; NOW.md: "NOBODY is moved up a role by guess (Donovan: the next WR1 is not always the WR2). TODO: read the TRUE depth chart").
// ESPN publishes each club's depth chart (site.api.espn.com/apis/site/v2/sports/football/nfl/teams/<id>/depthcharts): the OFFENSE chart lists a line per slot, in the
// order the club uses (wr1 / wr2 / wr3 each have their own backups; the TE and RB lines are single). So when a starter is out, the man who steps up is the NEXT name on
// THAT slot's line (WR2's backup, not WR3), skipping anyone ESPN itself marks injured. Pure: no fetch, no React. Labels only: no score, status or model row changes.
import { nameKey } from '../injuries/lookup'

const OFFENSE = /WR/                                  // the chart named "3WR 1TE" (and the other WR-count sets): the one with the receivers
const SLOT_WORD = { qb: 'QB', rb: 'RB', te: 'TE', wr1: 'WR1', wr2: 'WR2', wr3: 'WR3', fb: 'FB' }

/** ESPN's depthcharts JSON -> { [slot]: [{ name, key, hurt }] } for the skill slots, in depth order. {} when the shape is not there. */
export function parseDepth(json) {
  const chart = (json?.depthchart || []).find((c) => OFFENSE.test(String(c?.name || '')))
  const out = {}
  for (const [slot, v] of Object.entries(chart?.positions || {})) {
    if (!SLOT_WORD[slot]) continue
    out[slot] = (v?.athletes || []).map((a) => ({ name: a.displayName, key: nameKey(a.displayName), hurt: Array.isArray(a.injuries) && a.injuries.length > 0 })).filter((a) => a.name)
  }
  return out
}

/**
 * Who steps up when `name` is out: the next man on his slot's line who ESPN does not list injured. { slot: 'WR2', role: 'WR2', next: 'George Mingo' } or null
 * (not on the offense chart, last on his line, or everybody behind him is listed hurt: nothing is guessed).
 */
export function nextUp(depth, name) {
  const k = nameKey(name)
  for (const [slot, line] of Object.entries(depth || {})) {
    const i = line.findIndex((a) => a.key === k)
    if (i < 0) continue
    const next = line.slice(i + 1).find((a) => !a.hurt)
    return next ? { slot, role: SLOT_WORD[slot], next: next.name } : null
  }
  return null
}
