// ASK FOR AN ACCOUNT WHEN IT DOES SOMETHING (funnel step 3, 2026-09-26).
// The site stays free and open; nothing is walled. Two moments earn the ask:
// a signed-out ★ (the star still works, on this device) and switching alerts
// on (the switches save here; the push needs an account). The seams that
// record those -- lib/dash/follow.js follow() and lib/dash/alerts.js
// setAlertMaster(true) -- call nudge(); components/AccountNudge.js listens
// and decides whether to show anything (signed out, not already shown this
// session). No listener mounted, no effect.
export const NUDGE_EVENT = 'dash-nudge'

/** reason: 'follow' | 'alerts' */
export function nudge(reason) {
  try { window.dispatchEvent(new CustomEvent(NUDGE_EVENT, { detail: { reason } })) } catch { /* server or old engine */ }
}
