// TAP TO EXPLAIN, FOR THINGS THAT MOVE (2026-09-27). A ticker pill lives on a
// strip that scrolls itself, so a popover anchored to it would sail away.
// Its explanation goes to one fixed panel instead (components/ExplainToast.js,
// mounted once in the app shell). Anything can call explain().
export const EXPLAIN_EVENT = 'dash-explain'

export function explain(label, text) {
  if (!text) return
  try { window.dispatchEvent(new CustomEvent(EXPLAIN_EVENT, { detail: { label: String(label || ''), text: String(text) } })) } catch { /* old engine */ }
}
