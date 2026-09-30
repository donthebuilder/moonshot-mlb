// A TAPPED NOTIFICATION, ROUTED (2026-09-29, SportShell step 1). public/sw.js
// focuses this tab and posts { type: 'dash-open', url } with the notification's
// address. The shell writes that address's hash and lets its own hashchange
// routing do the rest -- one routing path, not two. A hash that is already
// current fires no hashchange, so `apply` runs directly for that case.
//
// Written once here; MOONSHOT, TUDDY and LAMP each carried (or lacked) a copy.
// LAMP had none, so a LAMP push tapped while LAMP was open went nowhere.
//
// Returns the cleanup for a useEffect.
export function listenForWorkerOpen(apply) {
  if (typeof navigator === 'undefined') return () => {}
  const fromWorker = (ev) => {
    const d = ev?.data
    if (!d || d.type !== 'dash-open' || typeof d.url !== 'string') return
    const i = d.url.indexOf('#')
    if (i < 0) return
    const next = d.url.slice(i)
    if (window.location.hash === next) apply()
    else window.location.hash = next
  }
  navigator.serviceWorker?.addEventListener?.('message', fromWorker)
  return () => navigator.serviceWorker?.removeEventListener?.('message', fromWorker)
}
