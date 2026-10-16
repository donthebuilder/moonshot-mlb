// PHONE APP OR FULL SITE: THE REMEMBERED CHOICE (2026-10-16, Phase 2; Donovan: "if they want to use the desktop side just have a button, same if on desktop").
// 'phone' | 'full' in localStorage; no choice yet = decided by the screen (PHONE_MAX wide or narrower = the phone app). Nothing here is read on the
// server: the choice is per device, and a wrong guess costs one redirect. The phone shell is behind NEXT_PUBLIC_PHONE_SHELL=on until it is filled in.
export const PHONE_MAX = 760
const KEY = 'dash_view_v1'
export const phoneShellOn = () => String(process.env.NEXT_PUBLIC_PHONE_SHELL || '').toLowerCase() === 'on'
export function getViewChoice() {
  try { const v = localStorage.getItem(KEY); return v === 'phone' || v === 'full' ? v : null } catch { return null }
}
export function setViewChoice(v) {
  try { localStorage.setItem(KEY, v === 'phone' ? 'phone' : 'full') } catch { /* private window: the choice lasts this visit only */ }
}
/** What this device should open: its saved choice, else the screen's. */
export const wantedView = () => getViewChoice() || (typeof window !== 'undefined' && window.innerWidth <= PHONE_MAX ? 'phone' : 'full')
