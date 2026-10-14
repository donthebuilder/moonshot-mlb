// THE CARD ASSETS (server only): the three fonts, the DN mark, the grain and the cream poster palette that EVERY server-drawn card shares
// (the player front / back, the day lineup, the Two-Man dual, the graded slab, and the 1200 x 675 posters: homer / recap / goal / TD).
// Moved here VERBATIM from lib/dash/homerCard.js (2026-10-12, the card-kit consolidation) so the surviving card kit (lib/cards/cardKit.js)
// no longer depends on the old poster module; lib/dash/homerCard.js re-exports every name below, so no caller changes and no pixel does.
// Fonts / mark / grain are read once per instance and a miss is never a failed card (see each loader).

export const INK = '#efe9dd'
export const DIM = '#8f8a83'
export const PANEL = '#12100e'
export const RULE = 'rgba(239,233,221,0.15)'

// ── fonts ──────────────────────────────────────────────────────────────────
//
// TWO FAMILIES (2026-09-07). Inter is an interface face and the card read like
// a dashboard because of it. Big Shoulders Display 900 is a condensed display
// face -- it carries the name line, the headline and the big numerals, and
// nothing else. Body copy, table rows and the hook lines stay Inter: a
// condensed face is bad below about 20px, and THE BAT / THE ARM rows are
// exactly that size.
//
// It is an upright face, so the forward lean is transform: skewX(-8deg) at
// each use. VERIFIED IN SATORI, not assumed -- it emits
// matrix(1.00,0.00,-0.14,1.00,...), and 0.14 is tan(8°). Both skewX(-8deg)
// and skew(-8deg, 0deg) work.
//
// Read off disk rather than fetched. Inter below still comes from Google Fonts
// on a cold render, which is a network call inside the tick's 60s budget --
// worth moving to disk too, not done here.
//
// SIL Open Font License. Free for commercial use, which this account is.
export const DISPLAY = 'Shoulders'
let _display = null
export async function loadDisplay() {
  if (_display !== null) return _display
  try {
    const { readFile } = await import('node:fs/promises')
    const b = await readFile(`${process.cwd()}/public/fonts/BigShouldersDisplay-900.ttf`)
    _display = [{ name: DISPLAY, data: b, weight: 900, style: 'normal' }]
  } catch {
    // Missing file must never cost a post: satori falls back to Inter, the
    // card renders upright and plain, and the homer still goes out.
    _display = []
  }
  return _display
}

let _fonts = null
export async function loadFonts() {
  if (_fonts) return _fonts
  try {
    const css = await fetch('https://fonts.googleapis.com/css2?family=Inter:wght@400;800&display=swap', {
      headers: { 'User-Agent': '' },     // no UA → plain TTF urls, which satori can read
    }).then((r) => r.text())
    const urls = [...css.matchAll(/font-weight:\s*(\d+);[^}]*?src:\s*url\(([^)]+)\)/g)]
    const out = []
    for (const [, weight, url] of urls) {
      const data = await fetch(url).then((r) => r.arrayBuffer())
      out.push({ name: 'Inter', data, weight: Number(weight), style: 'normal' })
    }
    _fonts = out
  } catch {
    _fonts = []
  }
  return _fonts
}

// ── the mark ───────────────────────────────────────────────────────────────
// The DN mark, inlined as a data URI rather than fetched by URL. Satori will
// happily take an absolute https:// src, but that is a network call on every
// card render inside the tick's 60s budget, with a silent blank box when it
// is slow. Read once off disk, cached for the life of the instance, and it
// cannot fail at render time. public/dash-network-mark-128.png is a 12KB
// downscale of dash-network-icon-master.png (1254px, 900KB) -- the master is
// 70x more bytes than 54 CSS pixels can show.
// The grain. 256px, four alpha levels, 36KB -- a full-bleed overlay at 12%,
// stretched not tiled, because at this opacity nobody can see the stretch and
// one <img> is cheaper than a repeat. Same disk-read-and-cache as the mark:
// a missing file means no grain, never a failed card.
let _grain = null
export async function loadGrain() {
  if (_grain !== null) return _grain
  try {
    const { readFile } = await import('node:fs/promises')
    const b = await readFile(`${process.cwd()}/public/card-grunge.png`)
    _grain = `data:image/png;base64,${b.toString('base64')}`
  } catch {
    _grain = ''
  }
  return _grain
}

let _mark = null
export async function loadMark() {
  if (_mark !== null) return _mark
  try {
    const { readFile } = await import('node:fs/promises')
    const b = await readFile(`${process.cwd()}/public/dash-network-mark-128.png`)
    _mark = `data:image/png;base64,${b.toString('base64')}`
  } catch {
    // Never let a missing file kill a post -- Header falls back to the
    // original HR tile.
    _mark = ''
  }
  return _mark
}

// What the loaders above have cached so far (null / '' until a loader has run): the synchronous poster pieces (homerCard's frame / Header)
// draw from these after their card function has awaited the loaders, exactly as they read the module variables before the move.
export const grainNow = () => _grain
export const markNow = () => _mark

// THE HOLO PALETTE (2026-10-12, special cards: lib/cards/specialCard.js). The iridescent hues a foil / holographic card is drawn
// with: the one home for these hex values (no .js file outside this one types them). They are used only as thin gradient bands, the
// edge ring and low-opacity washes over a dark card, never as text, so contrast of the card's own words is not changed by them.
export const HOLO = {
  cyan: '#7fe9ff',
  mint: '#9bffd1',
  lime: '#e4ff8a',
  gold: '#ffd978',
  rose: '#ff9ad5',
  violet: '#b69cff',
  blue: '#7fa8ff',
  white: '#ffffff',
}

// THE COLLECTIBLE FRAME'S STOCKS (2026-10-14, lib/cards/collect/): the printed paper border of a BASE / STAR card and the gold of a LEGEND, drawn in code. The second
// home for hex values beside HOLO: no other .js file types them. Paper and gold are MATERIALS (stock, foil), never a result colour, and are used only for the frame,
// thin rules and the gold wash over a dark card: the card's own words stay INK on the dark field.
export const FOIL = {
  paper: '#e4dac3',      // matte printed stock
  paperEdge: '#b9ab8c',  // the stock's shadowed edge
  silver: '#dde5ee',     // a STAR's single foil strip
  silverEdge: '#8f9bab',
  goldHi: '#fff0b0',     // LEGEND gold foil ramp, highlight to shadow
  gold: '#e8b94a',
  goldMid: '#b88a2c',
  goldDeep: '#6b4a14',
  void: '#07090c',       // the deepest panel behind a stat block
}
