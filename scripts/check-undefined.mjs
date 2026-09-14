// check-undefined.mjs — AST rewrite (2026-09-14)
//
// The old version blanked out comments/strings with four sequential regexes
// before scanning. A raw apostrophe inside a double-quoted JSX attribute or
// in JSX prose text ("don't", "it's") reads to the single-quote pass as an
// opening quote and corrupts everything after it in the file — both false
// positives and false negatives, silently. It also only globbed
// components/*.js + components/tabs/*.js, missing all 42 files under
// components/nfl/** (all of TUDDY).
//
// This version parses real ASTs with Next's own bundled babel toolchain
// (no new dependency), so quotes/comments are handled correctly by
// construction, and walks every .js file under components/**.
//
// Two checks now, both against a closed universe of "things this repo
// defines and could import":
//   1. (original) a bare function call whose name is exported from lib/*.js
//      but never imported/declared in this file.
//   2. (new) a capitalized JSX tag whose name matches a components/**/*.js
//      filename but was never imported/declared in this file — this is the
//      exact shape of the real ChartFrame production crash from this
//      session (a component used in JSX with no import at all).
//
// Both checks use the same "bound" set: every name this file imports or
// declares anywhere (imports, destructuring, function/class/catch bindings).
// Not scope-aware, same as the original — a name bound anywhere in the file
// counts as bound everywhere in it. That was true of the old regex version
// too; tightening it is a separate, riskier change and not what this pass
// is for.

import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'
import parserPkg from 'next/dist/compiled/babel/parser.js'
import traversePkg from 'next/dist/compiled/babel/traverse.js'

const { parse } = parserPkg
const traverse = traversePkg.default || traversePkg

const SKIP_NAMES = new Set(['C', 'n', 'arr', 'obj', 'clean', 'num'])

function parseFile(file) {
  const src = fs.readFileSync(file, 'utf8')
  try {
    return parse(src, {
      sourceType: 'module',
      plugins: ['jsx'],
      errorRecovery: true,
    })
  } catch (e) {
    console.error(`WARN  ${file}: parse failed (${e.message.split('\n')[0]}) — skipped`)
    return null
  }
}

// Recursively collect every name a binding pattern introduces: identifiers,
// object/array destructuring (incl. nested, defaults, rest), function params.
function collectPatternNames(node, out) {
  if (!node) return
  switch (node.type) {
    case 'Identifier':
      out.add(node.name)
      break
    case 'ObjectPattern':
      for (const prop of node.properties) {
        if (prop.type === 'RestElement') collectPatternNames(prop.argument, out)
        else collectPatternNames(prop.value, out)
      }
      break
    case 'ArrayPattern':
      for (const el of node.elements) if (el) collectPatternNames(el, out)
      break
    case 'AssignmentPattern':
      collectPatternNames(node.left, out)
      break
    case 'RestElement':
      collectPatternNames(node.argument, out)
      break
    default:
      break
  }
}

// Every name this file imports or declares anywhere — the "is this handled"
// universe for both checks.
function collectBoundNames(ast) {
  const bound = new Set()
  traverse(ast, {
    ImportDefaultSpecifier(p) { bound.add(p.node.local.name) },
    ImportSpecifier(p) { bound.add(p.node.local.name) },
    ImportNamespaceSpecifier(p) { bound.add(p.node.local.name) },
    VariableDeclarator(p) { collectPatternNames(p.node.id, bound) },
    FunctionDeclaration(p) {
      if (p.node.id) bound.add(p.node.id.name)
      for (const param of p.node.params) collectPatternNames(param, bound)
    },
    FunctionExpression(p) {
      if (p.node.id) bound.add(p.node.id.name)
      for (const param of p.node.params) collectPatternNames(param, bound)
    },
    ArrowFunctionExpression(p) {
      for (const param of p.node.params) collectPatternNames(param, bound)
    },
    ClassDeclaration(p) { if (p.node.id) bound.add(p.node.id.name) },
    ClassExpression(p) { if (p.node.id) bound.add(p.node.id.name) },
    CatchClause(p) { if (p.node.param) collectPatternNames(p.node.param, bound) },
  })
  return bound
}

// Bare function calls: foo(...) where callee is a plain identifier.
function collectCalledNames(ast) {
  const called = new Set()
  traverse(ast, {
    CallExpression(p) {
      if (p.node.callee.type === 'Identifier') called.add(p.node.callee.name)
    },
  })
  return called
}

// Capitalized JSX tags: <Foo /> or <Foo.Bar />  (root object for member form).
function collectJsxRootNames(ast) {
  const jsx = new Set()
  traverse(ast, {
    JSXOpeningElement(p) {
      const name = p.node.name
      let root = null
      if (name.type === 'JSXIdentifier') root = name.name
      else if (name.type === 'JSXMemberExpression') {
        let obj = name.object
        while (obj.type === 'JSXMemberExpression') obj = obj.object
        if (obj.type === 'JSXIdentifier') root = obj.name
      }
      if (root && /^[A-Z]/.test(root)) jsx.add(root)
    },
  })
  return jsx
}

// Top-level export names from a lib/*.js file: export function Foo / export
// const Foo = ... (same shape the original regex looked for).
function collectExportNames(ast) {
  const names = []
  traverse(ast, {
    ExportNamedDeclaration(p) {
      const decl = p.node.declaration
      if (!decl) return
      if (decl.type === 'FunctionDeclaration' && decl.id) {
        names.push(decl.id.name)
      } else if (decl.type === 'VariableDeclaration') {
        for (const d of decl.declarations) {
          const set = new Set()
          collectPatternNames(d.id, set)
          for (const n of set) names.push(n)
        }
      }
    },
  })
  return names
}

// ── build the two closed universes ──────────────────────────────────────

const libExports = new Map() // name -> lib file
for (const f of execSync('ls lib/*.js').toString().trim().split('\n').filter(Boolean)) {
  const ast = parseFile(f)
  if (!ast) continue
  for (const name of collectExportNames(ast)) {
    if (SKIP_NAMES.has(name)) continue
    libExports.set(name, f)
  }
}

const componentFiles = execSync('find components -name "*.js" -type f')
  .toString().trim().split('\n').filter(Boolean)

// PascalCase filename -> component file(s). Several MLB/NFL pairs share a
// name (Home.js, Pairs.js, Watchlist.js, ...) by design — one file per
// sport, same name — so a name can map to more than one file.
const componentExports = new Map()
for (const f of componentFiles) {
  const base = path.basename(f, '.js')
  if (!/^[A-Z]/.test(base)) continue
  const list = componentExports.get(base) || []
  list.push(f)
  componentExports.set(base, list)
}

function nearestCandidate(name, fromFile) {
  const candidates = componentExports.get(name) || []
  if (candidates.length <= 1) return candidates[0]
  const fromDir = path.dirname(fromFile)
  const sameDir = candidates.find((c) => path.dirname(c) === fromDir)
  return sameDir ? `${sameDir} (also: ${candidates.filter((c) => c !== sameDir).join(', ')})` : candidates.join(' or ')
}

// ── scan every component file ───────────────────────────────────────────

let bad = 0
for (const f of componentFiles) {
  const ast = parseFile(f)
  if (!ast) continue

  const bound = collectBoundNames(ast)
  const selfName = path.basename(f, '.js')

  const called = collectCalledNames(ast)
  const missingLib = [...called].filter((n) => libExports.has(n) && !bound.has(n))

  const jsxRoots = collectJsxRootNames(ast)
  const missingComponent = [...jsxRoots].filter(
    (n) => n !== selfName && componentExports.has(n) && !bound.has(n)
  )

  if (missingLib.length || missingComponent.length) {
    bad++
    for (const n of missingLib) {
      console.log(`MISS  ${f} calls ${n}() without importing it (defined in ${libExports.get(n)})`)
    }
    for (const n of missingComponent) {
      console.log(`MISS  ${f} uses <${n}> without importing it (defined in ${nearestCandidate(n, f)})`)
    }
  }
}

console.log(
  bad
    ? `\n${bad} file(s) with an undefined lib call or unimported component — these throw at runtime`
    : `\nok   every lib helper and local component used is imported (${libExports.size} lib names, ${componentExports.size} components, ${componentFiles.length} files checked)`
)
process.exit(bad ? 1 : 0)
