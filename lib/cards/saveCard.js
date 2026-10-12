// THE SHARE BUTTONS' ONE EXIT (browser only). Every 📸 download used to draw its own canvas in the browser (lib/cards/kit.js, retired 2026-10-12);
// now the picture is the SERVER card (lib/cards/shareCards.js, the baseball-card look) and the file the user gets is that PNG at 1080 x 1350.
// A button builds a URL with `shareUrl` / `playerUrl` and hands it to `downloadCard`, which fetches it and saves the bytes as a file. When the
// server has no card for it (the sport has none, the day is not on a card window, a source is down) the reason is said in a small notice instead of
// failing silently. Nothing here reads or invents data: it only moves bytes.
import { CHASSIS } from '../design/tokens'

const slugOf = (s, fb = 'card') => String(s || fb).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || fb
export const slug = slugOf
export const stamp = (iso) => (/^\d{4}-\d{2}-\d{2}/.test(String(iso || '')) ? String(iso).slice(0, 10) : new Date().toLocaleDateString('en-CA'))

/** The game's own day (ET, as the site keys every slate) from a game timestamp: a night game crosses midnight UTC, the file name must not. */
export const gameDay = (ts) => { try { const t = new Date(ts); return Number.isFinite(t.getTime()) ? t.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }) : '' } catch { return '' } }

const qs = (o) => Object.entries(o).filter(([, v]) => v !== null && v !== undefined && v !== '').map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')
/** /api/card/share?kind=...&sport=...  (ranked | game | pitcher | pick | record; see lib/cards/shareData.js for each kind's parameters). */
export const shareUrl = (params) => `/api/card/share?${qs(params)}`
/** /api/card/image?sport&id&side  (the player's own front or back, the same card the live CALLED alerts use). */
export const playerUrl = ({ sport, id, side = 'front', date = null }) => `/api/card/image?${qs({ sport, id, side, date })}`

let _t = null
/** A short notice above the bottom bar (role=status), gone after a few seconds. Never blocks a tap. */
export function notice(text) {
  try {
    if (typeof document === 'undefined') return
    let el = document.getElementById('card-notice')
    if (!el) {
      el = document.createElement('div')
      el.id = 'card-notice'
      el.setAttribute('role', 'status')
      el.setAttribute('aria-live', 'polite')
      Object.assign(el.style, {
        position: 'fixed', left: '16px', right: '16px', bottom: 'calc(env(safe-area-inset-bottom, 0px) + 84px)', zIndex: '2147483000', margin: '0 auto', maxWidth: '420px',
        padding: '10px 14px', borderRadius: '10px', fontSize: '14px', lineHeight: '1.35', fontWeight: '700', textAlign: 'center', pointerEvents: 'none',
        background: CHASSIS.bg2, color: CHASSIS.text, border: `1px solid ${CHASSIS.border2}`,
      })
      document.body.appendChild(el)
    }
    el.textContent = text
    el.style.display = 'block'
    clearTimeout(_t)
    _t = setTimeout(() => { el.style.display = 'none' }, 4500)
  } catch { /* a notice is a courtesy */ }
}

/** Fetch a server card and save it as `filename`. Resolves true when a file was saved. */
export async function downloadCard(url, filename) {
  try {
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) {
      let why = ''
      try { why = (await res.json())?.detail || '' } catch { /* not JSON */ }
      notice(res.status === 404 ? `No card for this right now${why ? `: ${why}` : '.'}` : 'The card is delayed. Try again in a minute.')
      return false
    }
    const blob = await res.blob()
    const href = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.download = filename
    a.href = href
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(href), 4000)
    return true
  } catch (e) {
    console.error('share card failed', e)
    notice('The card could not be made. Check your connection and try again.')
    return false
  }
}
