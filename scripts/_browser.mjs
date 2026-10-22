// WHERE THE BROWSER IS, FOR EVERY BROWSER CHECK (2026-10-21, KNOWN-ISSUES #22). The checks named the Mac's Chrome and Brave and nothing else,
// so a cloud or Linux session couldn't run check-clickable or check-copy (both in the push gate) without a hand-edited copy. Each script
// keeps its own order of Mac browsers, so nothing changes on the Mac; EXTRA_PATHS are tried after them: CHROME_PATH, then the usual Linux
// installs, then any Playwright-downloaded Chromium.
import { existsSync, readdirSync } from 'node:fs'

export const MAC_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
export const MAC_BRAVE = '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'

const playwrightChromes = () => {
  const roots = [process.env.PLAYWRIGHT_BROWSERS_PATH, '/opt/pw-browsers', `${process.env.HOME || ''}/.cache/ms-playwright`].filter(Boolean)
  const out = []
  for (const r of roots) {
    let dirs = []
    try { dirs = readdirSync(r).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse() } catch { continue }
    for (const d of dirs) out.push(`${r}/${d}/chrome-linux/chrome`, `${r}/${d}/chrome-linux64/chrome`)
  }
  return out
}

/** Tried after a script's own Mac paths. */
export const EXTRA_PATHS = [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', ...playwrightChromes()].filter(Boolean)

/** The first browser that exists from `candidates` (falsy entries skipped), then EXTRA_PATHS; undefined when none. */
export function findBrowser(candidates = []) {
  return [...candidates, ...EXTRA_PATHS].filter(Boolean).find((p) => existsSync(p))
}
