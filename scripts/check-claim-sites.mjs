// A CLAIM THAT FAILS MUST SAY SO (2026-09-07).
//
// Every once-a-day post in the homer feed claims a row before it posts:
// upsert with ignoreDuplicates, and if a row comes back it is yours. Six call
// sites were written out longhand and five read only `data`, discarding
// `error`. When homer_feed_posts_kind_check refused four of the kinds the code
// was using, those five sites did exactly what a slow news night does --
// nothing, quietly, with the route still answering 200. Pairs to watch, the
// longest call, numerology and the monthly recap never posted for a full day
// and nothing anywhere said why.
//
// This asks one question of every supabase write in the app and lib:
//
//   does any `const { data ... } = await <a .upsert/.update/.insert call>`
//   forget to destructure `error`?
//
// Low noise by construction: it only looks at destructuring assignments whose
// right-hand side actually contains a write call. Reads are none of its
// business -- a failed read degrades visibly, a failed write goes silent.
import fs from 'node:fs'
import path from 'node:path'

const roots = ['app', 'lib']
const files = []
const walk = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p) }
    else if (/\.(js|mjs)$/.test(e.name)) files.push(p)
  }
}
for (const r of roots) if (fs.existsSync(r)) walk(r)

// `const { ... } = await ...` up to the terminating newline-with-no-open-paren.
// Written as a small scanner rather than a regex: these calls span six lines
// and a chained builder is not a regular language.
const problems = []
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8')
  const lines = src.split('\n')
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*const\s*\{[^}]*\bdata\b/.test(lines[i])) continue
    if (!/=\s*await\b/.test(lines[i])) continue
    // Gather the statement: this line plus continuations that are chained
    // builder calls or an argument list still open.
    let stmt = lines[i]
    let j = i
    while (j + 1 < lines.length && /^\s*[.)\]}]|^\s*\w+:/.test(lines[j + 1])) {
      stmt += '\n' + lines[++j]
      if (/\.select\(|\)$|\.maybeSingle\(\)|\.single\(\)/.test(lines[j]) && !/^\s*\./.test(lines[j + 1] || '')) break
    }
    const isWrite = /\.(upsert|insert|update|delete)\(/.test(stmt)
    if (!isWrite) continue
    const head = stmt.slice(0, stmt.indexOf('}') + 1)
    if (/\berror\b/.test(head)) continue
    problems.push(`${f}:${i + 1}  ${lines[i].trim()}`)
  }
}

if (problems.length) {
  console.error('check-claim-sites: a supabase WRITE discards its error —')
  console.error('a claim that cannot be written will look exactly like a slow news night.\n')
  for (const p of problems) console.error('  ' + p)
  console.error('\nDestructure `error`, log it, and treat it as "did not claim".')
  process.exit(1)
}
console.log(`check-claim-sites: ok (${files.length} files, every supabase write reads its error)`)
