// POLICY GUARD (2026-10-06): LAMP (NHL) and BUCKETS (NBA) never PRINT a model probability. A score is
// a rank, not a probability; goalGameProbability is LOGGED but not shown until the calibration gate
// (lib/nhl/goalModel.js) is met. Greps the NHL/NBA sources for the banned shapes and fails with file:line.
//   node --import ./scripts/_esm-resolve.mjs scripts/check-no-printed-probability.mjs
// Allowed: comments, "not a probability" disclaimers, and the logged-only files below. A deliberate
// exception on one line: add the marker  allow-probability  to it.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const DIRS = ['components/lamp', 'components/buckets', 'lib/nhl', 'lib/nba', 'app/api/lamp', 'app/api/buckets']
const FILES = ['lib/writeups/nhl.js', 'lib/writeups/text.js', 'components/GameWriteupBlock.js']
// the model value may be read/written here (it is logged, never rendered)
const LOGGED_ONLY = new Set(['lib/nhl/goalModel.js', 'lib/nhl/goalBoard.js', 'lib/nhl/boardRead.js', 'lib/writeups/nhl.js'])
const BANNED = [
  [/goal chance/i, "'goal chance' in a string"],
  [/\d\s*%\s*chance|chance of (?:a |scoring|\d)/i, "'N% chance' / 'chance of' as a printed number"],
  [/\$\{[^}]*\.chance\b/, 'a .chance field interpolated into text'],
  [/expected goals/i, "'expected goals' in a string (a summed model probability)"],
  [/\bprobabilit(?:y|ies)\b(?!\s*(?:gate|source))/i, "'probability' in a string (disclaimers 'not a probability' excepted)"],
  [/goalGameProbability/, 'goalGameProbability read outside the logged-only files'],
]
const DISCLAIM = /not a chance of|not (?:a |an )?(?:calibrated )?(?:model )?probabilit|never (?:a )?probabilit|isn.t a probabilit|no probabilit|calibration/i

const walk = (d) => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : /\.(js|jsx|mjs)$/.test(n) ? [p] : [] })
const files = [...DIRS.flatMap((d) => { try { return walk(join(ROOT, d)) } catch { return [] } }), ...FILES.map((f) => join(ROOT, f))]
let bad = 0
for (const f of files) {
  const rel = relative(ROOT, f)
  let text; try { text = readFileSync(f, 'utf8') } catch { continue }
  let inBlock = false
  text.split('\n').forEach((raw, i) => {
    let ln = raw
    if (inBlock) { if (ln.includes('*/')) { inBlock = false; ln = ln.slice(ln.indexOf('*/') + 2) } else return }
    if (/^\s*\/\*/.test(ln) && !ln.includes('*/')) { inBlock = true; return }
    if (/^\s*(\/\/|\*|\/\*)/.test(ln)) return
    if (ln.includes('allow-probability')) return
    ln = ln.replace(/\s\/\/ .*$/, '')
    for (const [re, why] of BANNED) {
      if (!re.test(ln)) continue
      if (re.source === 'goalGameProbability' && LOGGED_ONLY.has(rel)) continue
      if (DISCLAIM.test(ln)) continue
      console.log(`ERROR ${rel}:${i + 1}  ${why}\n      ${raw.trim().slice(0, 160)}`); bad++
    }
  })
}
console.log(bad ? `\n${bad} printed-probability violation(s)` : `OK: no printed model probability in ${files.length} NHL/NBA files`)
process.exit(bad ? 1 : 0)
