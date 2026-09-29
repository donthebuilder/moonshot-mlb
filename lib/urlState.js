// ONE WAY TO WRITE THE ADDRESS (2026-09-27, audit 00A root fix 1).
//
// Every shell used to call history.replaceState inline (Dashboard.js,
// NflDashboard.js, LampDashboard.js, lib/sport.js), so no in-app step ever
// added a history entry: Back from a player card, a tab or a sport switch
// left the site. The rule, now in one place:
//   push    when you OPENED something -- a tab, a player card, a sport --
//           so Back returns to where you were
//   replace for everything else (filters, a card closing, tidy-ups)
// The shells' existing hashchange handlers already route from the address,
// so Back / Forward need no new code: the address changes, they follow.
//
// State passed to the history API is ours or null, never
// window.history.state -- that carries Next's internal __NA flag, and Next's
// patched replaceState then skips syncing its router with the new URL
// (next/dist/client/components/app-router.js).

export const hashParams = () => {
  try { return new URLSearchParams(String(window.location.hash || '').replace(/^#/, '')) } catch { return new URLSearchParams() }
}

/**
 * Write `params` as the hash. No-op when the address already says it.
 * `push: true` adds a history entry; `state` rides it (e.g. { dashCard: 1 }
 * marks "this entry opened a card", so closing it can step back instead).
 * Returns true when the address changed.
 */
export function writeHash(params, { push = false, state = null } = {}) {
  if (typeof window === 'undefined') return false
  const s = params.toString()
  const url = s ? `#${s}` : window.location.pathname + window.location.search
  const now = String(window.location.hash || '')
  if (s ? now === `#${s}` : !now || now === '#') return false
  try {
    if (push) window.history.pushState(state, '', url)
    else window.history.replaceState(state, '', url)
    return true
  } catch { return false }
}

/**
 * Close something this entry opened: if the current entry was pushed to open
 * it (history.state[marker]), step back -- the hashchange handler then closes
 * it -- so Back later doesn't land on the same page twice. Otherwise run the
 * fallback (a card opened by a cold link has no entry of its own to pop).
 */
export function closeOpened(marker, fallback) {
  try {
    if (window.history.state && window.history.state[marker]) { window.history.back(); return }
  } catch { /* fall through */ }
  fallback()
}
