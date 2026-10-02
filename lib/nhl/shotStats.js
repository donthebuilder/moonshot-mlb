// THE SHOT MAP'S NUMBERS, ON SCREEN (BATCH-3D-V2 1c). One line, read off the
// SAME filtered list the rink draws, so the 2D line above the rink and the 3D
// dock's stats line can never disagree:
//   ATT 200 · GOALS 9 · ON NET 87 · SH% 9.4 · SLOT 41% (league 37%)
// The feed's `sog` result already excludes goals (ANA live: 9 + 87 + 58 + 46 =
// 200), so ON NET is saves only and SH% = goals / (goals + on net). The slot
// share is the shot map's own (lib/nhl/shotMap.js SLOT): shots on goal from the
// slot over all shots on goal, the league's from the same function.
// Under a result filter (Goal only, say) SH% would be 100.0 and the slot share
// would be goals' against the league's shots', so SH% shows '—' and the
// league note drops (Cowork review 10-02, items 2 + 4).
// Shot rows are positional: [x, y, result, ...] (lib/nhl/shotMap.js recent).
import { SLOT } from './shotMapShape'

const inSlot = (sh) => sh[0] >= SLOT.x0 && sh[0] <= SLOT.x1 && Math.abs(sh[1]) <= SLOT.y
const pct1 = (n, d) => (d ? Math.round((1000 * n) / d) / 10 : null)

export function shotLine(shots = [], league = null, { resultOn = false } = {}) {
  const att = shots.length
  const goals = shots.filter((s) => s[2] === 'goal').length
  const saves = shots.filter((s) => s[2] === 'sog').length
  const net = shots.filter((s) => s[2] === 'goal' || s[2] === 'sog')
  const slot = net.length ? Math.round((100 * net.filter(inSlot).length) / net.length) : null
  const lg = !resultOn && league?.slotShare != null ? Math.round(league.slotShare * 100) : null
  return [
    { k: 'ATT', v: att },
    { k: 'GOALS', v: goals, goal: true },
    { k: 'ON NET', v: saves, title: 'Shots on goal the goalie stopped (goals counted apart)' },
    { k: 'SH%', v: !resultOn && pct1(goals, goals + saves) != null ? pct1(goals, goals + saves).toFixed(1) : null, title: 'Goals over goals + shots on net' },
    { k: 'SLOT', v: slot != null ? `${slot}%` : null, sub: lg != null ? `league ${lg}%` : null, title: 'Shots on goal from the slot (faceoff dots to the goal line, between the dots), as a share of all shots on goal' },
  ]
}
