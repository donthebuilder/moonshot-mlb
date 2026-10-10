// Module hooks for _loader.mjs: extensionless resolution + SWC for files that contain JSX.
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'

const req = createRequire(`${process.cwd()}/package.json`)
let swc = null
const getSwc = () => (swc ||= req('next/dist/build/swc'))

export async function resolve(spec, ctx, next) {
  try { return await next(spec, ctx) } catch (e) {
    if (spec.startsWith('.') || spec.startsWith('/')) {
      const base = spec.startsWith('.') ? fileURLToPath(new URL(spec, ctx.parentURL)) : spec
      for (const ext of ['.js', '.mjs', '/index.js']) if (existsSync(base + ext)) return next(pathToFileURL(base + ext).href, ctx)
    }
    // a bare deep import with no exports map: try .js
    if (!spec.startsWith('.') && !spec.startsWith('/') && !spec.startsWith('node:') && spec.includes('/') && !spec.endsWith('.js')) {
      try { return await next(`${spec}.js`, ctx) } catch { /* the original error below */ }
    }
    throw e
  }
}

export async function load(url, ctx, next) {
  if (url.startsWith('file:') && (url.endsWith('.js') || url.endsWith('.jsx')) && !url.includes('/node_modules/')) {
    const file = fileURLToPath(url)
    const src = readFileSync(file, 'utf8')
    const s = await getSwc()
    if (!s._ready) { await s.loadBindings(); s._ready = true }
    const out = await s.transform(src, {
      filename: file, sourceMaps: false,
      jsc: { parser: { syntax: 'ecmascript', jsx: true }, transform: { react: { runtime: 'automatic' } }, target: 'es2022' },
      module: { type: 'es6' },
    })
    return { format: 'module', shortCircuit: true, source: out.code }
  }
  return next(url, ctx)
}
