// THE 3D LOOK SWITCH (2026-10-22, PREPLAY). ?look=<name> in the address picks a
// look for the 3D views while it is being judged; no value = the shipped look.
// 'tracking': the Next Gen Stats / tracking-broadcast look (Donovan: "I want
// that to look like Next Gen Stats ... showing the people their spots on the
// floor that they good at ... something quick that won't take a lot to render").
/** The ?look= value, or '' (never throws: SSR, sandboxed frames). */
export function lookParam() {
  try { return typeof window === 'undefined' ? '' : (new URLSearchParams(window.location.search).get('look') || '') } catch { return '' }
}
