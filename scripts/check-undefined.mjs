// A TARGETED check for the exact bug that just shipped: a component uses a
// helper that lives in lib/, and never imports it. esbuild --bundle catches a
// missing MODULE but not a missing NAME — `nameOf(pl)` with no import bundles
// clean and throws in the browser. Broad free-variable analysis was far too
// noisy (CSS `rgba`, `minmax`, useState setters, prose inside comments), so
// this asks one precise question instead:
//
//   for every name exported by lib/*.js, does any component CALL it without
//   importing it?
//
// Low noise by construction — it only ever looks at names we control.
import fs from 'node:fs'
import { execSync } from 'node:child_process'
import path from 'node:path'

const libExports = new Map()          // name -> source file
for (const f of execSync('ls lib/*.js').toString().trim().split('\n')) {
  const src = fs.readFileSync(f, 'utf8')
  for (const m of src.matchAll(/^export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm)) libExports.set(m[1], f)
  for (const m of src.matchAll(/^export\s+const\s+([A-Za-z_$][\w$]*)/gm)) libExports.set(m[1], f)
}
// Names too generic to attribute safely (a component may define its own).
for (const skip of ['C','n','arr','obj','clean','num']) libExports.delete(skip)

const strip = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/gm, '$1 ')   // the m flag matters: without it ^ only matches the start of the whole file, so every line comment survived and its prose got scanned
  .replace(/`(?:[^`\\]|\\.)*`/g, '``')
  .replace(/'(?:[^'\\]|\\.)*'/g, "''")
  .replace(/"(?:[^"\\]|\\.)*"/g, '""')

let bad = 0
for (const f of execSync('ls components/*.js components/tabs/*.js').toString().trim().split('\n')) {
  const raw = fs.readFileSync(f, 'utf8')
  const src = strip(raw)
  const imported = new Set()
  for (const m of raw.matchAll(/^import\s+(?:([A-Za-z_$][\w$]*)\s*,?\s*)?(?:\{([^}]*)\})?\s*from/gm)) {
    if (m[1]) imported.add(m[1].trim())
    if (m[2]) m[2].split(',').forEach((x) => { const nm = x.split(' as ').pop().trim(); if (nm) imported.add(nm) })
  }
  // Dynamic imports bind by destructuring, not by an import statement:
  //     import('../lib/savant').then(({ liveSeasonStats }) => liveSeasonStats(id))
  // Those are correctly imported and must not be flagged.
  for (const m of raw.matchAll(/import\([^)]*\)[\s\S]{0,80}?\{([^}]*)\}/g)) {
    m[1].split(',').forEach((x) => { const nm = x.split(':').pop().trim(); if (nm) imported.add(nm) })
  }
  const local = new Set()
  for (const m of src.matchAll(/(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g)) local.add(m[1])
  const missing = new Set()
    // NO WHITESPACE before the paren. `pick (🌙)` is JSX prose; `pick(x)` is a
  // call. Allowing the space made the label "Stake / pick (🌙)" look like an
  // undefined function.
  for (const m of src.matchAll(/(?<![.\w$])([A-Za-z_$][\w$]*)\(/g)) {
    const id = m[1]
    if (libExports.has(id) && !imported.has(id) && !local.has(id)) missing.add(id)
  }
  if (missing.size) {
    bad += missing.size
    console.log(`MISS ${path.basename(f)} uses ${[...missing].map((x) => `${x} (${libExports.get(x)})`).join(', ')} without importing it`)
  }
}
console.log(bad ? `\n${bad} undefined lib identifier(s) — these throw at runtime` : `\nok   every lib helper a component calls is imported (${libExports.size} names checked)`)
process.exit(bad ? 1 : 0)
