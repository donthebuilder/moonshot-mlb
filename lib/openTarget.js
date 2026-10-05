// OPEN A THING ON ANOTHER TAB (2026-09-27, CLICK-EVERYTHING-PLAN). A name,
// team or game tapped on one tab opens its page on another: the target is left
// here (sessionStorage, this tab only) and the receiving tab takes it once on
// mount. Private mode or no storage -> the tab just opens, nothing breaks.
//
// A tab that is ALREADY open does not remount, so it would never take the target
// (a club tapped while on the Team page changed nothing): leaving one also tells
// any mounted receiver (2026-10-05 scan).
export const TARGET_EVENT = 'dash:target'
export function leaveTarget(key, value) {
  try { window.sessionStorage.setItem(`open_${key}`, String(value)) } catch { /* no storage */ }
  try { window.dispatchEvent(new CustomEvent(TARGET_EVENT, { detail: { key } })) } catch { /* no window */ }
}
/** Drop a target nobody took (the address was changed by hand or by Back, and is newer). */
export function dropTarget(key) {
  try { window.sessionStorage.removeItem(`open_${key}`) } catch { /* no storage */ }
}
// THE ADDRESS IS A REAL LINK TOO (2026-09-27, audit 00A root fix 1 stage
// 2b): a game / pitcher in the hash (#...&tab=games&game=<pk>) opens it on a
// cold load, refresh or Back; the receiving tab writes its selection back to
// the hash (lib/urlState). A fresh in-app hand-off (sessionStorage, taken
// once) is newer than whatever the address carried, so it wins when present.
export function takeTarget(key) {
  try {
    const fromHash = new URLSearchParams(String(window.location.hash || '').replace(/^#/, '')).get(key)
    const v = window.sessionStorage.getItem(`open_${key}`)
    if (v != null) window.sessionStorage.removeItem(`open_${key}`)
    return v ?? fromHash
  } catch { return null }
}
