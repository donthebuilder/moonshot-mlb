// CARD HARNESS (fix14, 2026-10-08). Serves the repo's own ES modules to a real
// browser (Chrome/Brave via playwright-core) so the canvas cards run exactly as
// they do on the site, with no bundler and no new dependency. Extensionless
// imports ('../lib/player') are resolved the way webpack resolves them; .json
// files are served as modules. Nothing is written to the repo.
//   import { withCards } from './_card-harness.mjs'
//   await withCards(async ({ run }) => { const r = await run(`...module code returning a value...`) })
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve, extname } from 'node:path'

const ROOT = resolve(new URL('..', import.meta.url).pathname)
const MIME = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'text/javascript', '.png': 'image/png', '.html': 'text/html' }

const isFile = async (p) => { try { return (await stat(p)).isFile() } catch { return false } }
async function resolveSpec(fromFile, spec) {
  const base = resolve(dirname(fromFile), spec)
  for (const c of [base, `${base}.js`, `${base}.json`, join(base, 'index.js')]) if (await isFile(c)) return c
  return null
}
// rewrite relative import specifiers to explicit, root-relative URLs
async function rewrite(src, file) {
  const re = /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])(\.{1,2}\/[^'"]+)\2/g
  const out = []
  let last = 0
  for (const m of src.matchAll(re)) {
    const abs = await resolveSpec(file, m[3])
    out.push(src.slice(last, m.index))
    out.push(abs ? `${m[1]}${m[2]}${abs.slice(ROOT.length)}${m[2]}` : m[0])
    last = m.index + m[0].length
  }
  out.push(src.slice(last))
  return out.join('')
}

export async function startServer() {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://x')
      if (url.pathname === '/__blank') { res.setHeader('content-type', 'text/html'); res.end('<!doctype html><meta charset="utf-8"><script>window.process={env:{}}</script><body style="margin:0;background:#000">'); return }
      // the same-origin path next.config.js rewrites to the NHL's asset host (it sends no CORS header)
      const nhle = /^\/cdn\/nhle\/((?:mugs|logos)\/.+)$/.exec(url.pathname)
      if (nhle) {
        const up = await fetch(`https://assets.nhle.com/${nhle[1]}`).catch(() => null)
        if (!up || !up.ok) { res.statusCode = 404; res.end('nf'); return }
        res.setHeader('content-type', up.headers.get('content-type') || 'application/octet-stream')
        res.end(Buffer.from(await up.arrayBuffer()))
        return
      }
      let file = join(ROOT, decodeURIComponent(url.pathname))
      if (!file.startsWith(ROOT)) { res.statusCode = 404; res.end('nf'); return }
      // Next serves public/ at the site root; so does the harness
      if (!(await isFile(file))) file = join(ROOT, 'public', decodeURIComponent(url.pathname))
      if (!(await isFile(file))) { res.statusCode = 404; res.end('nf'); return }
      const ext = extname(file)
      res.setHeader('content-type', MIME[ext] || 'application/octet-stream')
      res.setHeader('access-control-allow-origin', '*')
      if (ext === '.json') { res.end(`export default ${await readFile(file, 'utf8')}`); return }
      if (ext === '.js' || ext === '.mjs') { res.end(await rewrite(await readFile(file, 'utf8'), file)); return }
      res.end(await readFile(file))
    } catch (e) { res.statusCode = 500; res.end(String(e)) }
  })
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok))
  return { server, base: `http://127.0.0.1:${server.address().port}` }
}

const BROWSERS = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser', '/usr/bin/google-chrome', '/usr/bin/chromium']

/** fn({ run, page, base }); run(code) evaluates module-style code in the page (top-level await ok) and returns its JSON value. */
export async function withCards(fn) {
  const req = createRequire(`${ROOT}/package.json`)
  const { chromium } = req('playwright-core')
  const executablePath = BROWSERS.find((p) => existsSync(p))
  if (!executablePath) throw new Error('No Chrome/Brave found')
  const { server, base } = await startServer()
  const browser = await chromium.launch({ executablePath, headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } })
    page.on('pageerror', (e) => console.error('[page error]', e.message))
    await page.goto(`${base}/__blank`)
    const run = (code) => page.evaluate(async ({ code, base }) => {
      const AsyncFn = Object.getPrototypeOf(async function () {}).constructor
      const imp = (p) => import(`${base}${p}`)
      return await new AsyncFn('imp', code)(imp)
    }, { code, base })
    return await fn({ run, page, base })
  } finally {
    await browser.close()
    server.close()
  }
}
