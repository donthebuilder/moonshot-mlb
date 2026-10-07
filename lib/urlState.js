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

// ── A CARD'S VIEW IS IN THE ADDRESS (Donovan, 2026-10-06) ───────────────────
//
// A card that has tabs (MOONSHOT's player card, TUDDY's) writes the tab it is
// on as `view=<name>` (Overview = no view=), so a refresh or a shared link
// reopens the same tab. Choosing a tab PUSHES an entry, so Back steps back
// through the views; the entries a card owns are counted on history.state --
//   { [marker]: 1 }              the entry that opened the card
//   { [viewsKey]: n }            n view entries pushed on top of it
// -- so closing the card steps back over all of them in one go
// (closeOpenedStack) instead of leaving the card open on its first view.

/** The card's own markers off the current entry (null when it has none), so a
 *  replace keeps them instead of writing state: null over them. */
export function cardKeep(marker, viewsKey) {
  try {
    const s = window.history.state
    if (!s || (!s[marker] && !s[viewsKey])) return null
    const out = {}
    if (s[marker]) out[marker] = s[marker]
    if (s[viewsKey]) out[viewsKey] = s[viewsKey]
    return out
  } catch { return null }
}

/** The state for a PUSHED view entry: the card's markers, one view deeper. */
export function cardViewPush(marker, viewsKey) {
  const keep = cardKeep(marker, viewsKey) || {}
  return { ...keep, [viewsKey]: (Number(keep[viewsKey]) || 0) + 1 }
}

/** closeOpened for a card that may have pushed views. A card opened by a link
 *  has no marker of its own: stepping back over its views lands on the card
 *  again, so `fallback` (which closes it) runs once that address is applied. */
export function closeOpenedStack(marker, viewsKey, fallback) {
  try {
    const s = window.history.state || {}
    const views = Number(s[viewsKey]) || 0
    if (s[marker]) { window.history.go(-(views + 1)); return }
    if (views) {
      const done = () => { window.removeEventListener('hashchange', done); fallback() }
      window.addEventListener('hashchange', done)
      window.history.go(-views)
      return
    }
  } catch { /* fall through */ }
  fallback()
}
