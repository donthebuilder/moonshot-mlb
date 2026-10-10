// A /app LINK IN THE `?sport=` SHAPE (F-02). /called and /start take
// /called?sport=nfl; /app only ever read the hash, so /app?sport=nfl opened
// MOONSHOT. proxy.js redirects that shape to the hash form the shells already
// read (so refresh, Back and a shared link all see one address). A link that
// already carries a hash is left alone: the hash wins. Pure.
const KEYS = ['sport', 'tab', 'lv', 'view', 'm', 'game', 'date', 'team', 'p', 'player', 'week', 'day', 'fteam', 'fgame']

/** @returns {{ search: string, hash: string }|null} the address to send them to, or null when nothing needs doing */
export function appQueryRedirect(search, hash) {
  try {
    const live = new URLSearchParams(String(hash || '').replace(/^#/, ''))
    if (live.get('sport') || live.get('tab')) return null
    const q = new URLSearchParams(String(search || '').replace(/^\?/, ''))
    if (!q.get('sport') && !q.get('tab')) return null
    const out = new URLSearchParams()
    for (const k of KEYS) { const v = q.get(k); if (v) out.set(k, v); q.delete(k) }
    const rest = q.toString()   // utm_* and the like stay in the query
    return { search: rest ? `?${rest}` : '', hash: out.toString() }
  } catch { return null }
}

/** The hash a /app query maps to (no '#'), or null. */
export const queryToHash = (search, hash) => appQueryRedirect(search, hash)?.hash || null
