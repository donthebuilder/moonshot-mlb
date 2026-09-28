// OPEN A THING ON ANOTHER TAB (2026-09-27, CLICK-EVERYTHING-PLAN). A name,
// team or game tapped on one tab opens its page on another: the target is left
// here (sessionStorage, this tab only) and the receiving tab takes it once on
// mount. Private mode or no storage -> the tab just opens, nothing breaks.
export function leaveTarget(key, value) {
  try { window.sessionStorage.setItem(`open_${key}`, String(value)) } catch { /* no storage */ }
}
export function takeTarget(key) {
  try { const v = window.sessionStorage.getItem(`open_${key}`); if (v != null) window.sessionStorage.removeItem(`open_${key}`); return v } catch { return null }
}
