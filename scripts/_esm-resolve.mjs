// Lets plain node import the site's extensionless ESM (`../nfl/dataSource`)
// outside of Next. Usage: node --import ./scripts/_esm-resolve.mjs <script>
import { register } from 'node:module'
register(new URL('data:text/javascript,' + encodeURIComponent(`
import { existsSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
export async function resolve(spec, ctx, next) {
  try { return await next(spec, ctx) } catch (e) {
    if (spec.startsWith('.') || spec.startsWith('/')) {
      const base = spec.startsWith('.') ? fileURLToPath(new URL(spec, ctx.parentURL)) : spec
      for (const ext of ['.js', '.mjs', '/index.js']) if (existsSync(base + ext)) return next(pathToFileURL(base + ext).href, ctx)
    }
    throw e
  }
}`)), import.meta.url)
