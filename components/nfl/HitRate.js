'use client'
import AgainstTheBar from './AgainstTheBar'
import { propLanesOf } from '../../lib/propLanes'

// HitRate — his last five games against the line, in one sentence.
//
// 2026-10-01 (0e a): the dot strip, its own line chips, the L5/L10/L20 window
// chips and the rate boxes are gone (Donovan: "I actually hate these"). The
// line chips already live under the PropsGrid matrix, and the matrix already
// carries L5/L10/L20/All -- this was the same answer drawn a second time.
// What is left is AgainstTheBar's sentence plus the games it came from.
//
// The reason this beats an average: two 12-catch games and eight 2-catch games
// average the same as ten 4-catch games and are not remotely the same bet. The
// average hides the shape; the games listed under the sentence are the shape.
//
// The LINE IS ADJUSTABLE and re-grades in the browser, which is why the bot
// ships the raw game log rather than a precomputed hit percentage. Moving from
// 3.5 to 4.5 receptions is the actual question a bettor is asking, and it
// shouldn't require another bot run to answer.

// THE ONE LADDER TABLE (2026-10-18): PropsGrid's line chips read these too (they were a second copy, edited twice in one day)
// ... and since 2026-10-22 both live in the one list per sport (lib/propLanes.js): the line chips (presets) and the log field (stat)
export const PRESETS = Object.fromEntries(propLanesOf('nfl').filter((l) => l.presets).map((l) => [l.key, l.presets]))
// Exported for the player file's rates table (NflPlayerModal RatesTable).
export const STAT_KEY = Object.fromEntries(propLanesOf('nfl').filter((l) => l.stat).map((l) => [l.key, l.stat]))

export default function HitRate({ log, market, defaultBar, label = '', span = 5, big = false }) {
  const presets = PRESETS[market] || [defaultBar]
  // The line comes from PropsGrid's own line chips (it remounts this on a
  // chip change); there is no second chip row here any more.
  const line = presets.includes(defaultBar - 0.5) ? defaultBar - 0.5 : presets[Math.floor(presets.length / 2)]
  const key = STAT_KEY[market]
  if (!log?.length || !key) return null
  return (
    <div style={{ marginTop: 12 }}>
      <AgainstTheBar log={log} statKey={key} bar={line} span={span} big={big} head={label ? `${line + 0.5}+ ${label}` : ''} />
    </div>
  )
}
