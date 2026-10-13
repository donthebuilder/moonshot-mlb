// Renders the poster stress set (scripts/poster-fixtures.mjs) to PNG files, for reading BEFORE and AFTER a text change.
//   node --no-warnings --import ./scripts/proto-cards/_loader.mjs scripts/render-poster-stress.mjs <outDir> [name-prefix ...]
import { mkdirSync, writeFileSync } from 'node:fs'
import { FX } from './poster-fixtures.mjs'

const out = process.argv[2]
if (!out) { console.error('usage: render-poster-stress.mjs <outDir> [name-prefix ...]'); process.exit(2) }
const only = process.argv.slice(3)
mkdirSync(out, { recursive: true })
let bad = 0
for (const [name, fn] of Object.entries(FX)) {
  if (only.length && !only.some((o) => name.startsWith(o))) continue
  try {
    const res = await fn()
    const buf = res instanceof Uint8Array || Buffer.isBuffer(res) ? Buffer.from(res) : Buffer.from(await res.arrayBuffer())
    writeFileSync(`${out}/${name}.png`, buf)
    console.log(name, buf.length)
  } catch (e) { bad += 1; console.log(`FAIL ${name}: ${e?.message || e}\n  ${String(e?.stack || '').split('\n').slice(1, 4).join('\n  ')}`) }
}
process.exit(bad ? 1 : 0)
