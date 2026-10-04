// ONE PICKS STORE (R9 #13, 2026-10-04). lib/myPicks.js (MOONSHOT) and
// lib/nfl/myPicks.js (TUDDY) each carried the same read / write of the
// browser's saved picks -- { slates, ledger }, newest-first trimmed -- with
// only the key and the two caps different. The KEYS ARE UNCHANGED
// ('my_picks_v1', 'nfl_my_picks_v1'): nobody's saved picks move or reset.
// Grading stays per sport, in each file.
const EMPTY = { slates: {}, ledger: {} }

/** { read, write } for one product's saved picks. */
export function makePicksStore({ key, ledgerCap, slateCap }) {
  function read() {
    try {
      const raw = JSON.parse(localStorage.getItem(key) || 'null')
      if (!raw || typeof raw !== 'object') return { ...EMPTY }
      return {
        slates: raw.slates && typeof raw.slates === 'object' ? raw.slates : {},
        ledger: raw.ledger && typeof raw.ledger === 'object' ? raw.ledger : {},
      }
    } catch { return { ...EMPTY } }
  }
  function write(store) {
    try {
      // Newest-first trim. Keys sort chronologically as text (YYYY-MM-DD,
      // or a padded week like 2026-W03).
      const trim = (obj, cap) => {
        const keys = Object.keys(obj).sort().slice(-cap)
        const out = {}
        keys.forEach((k) => { out[k] = obj[k] })
        return out
      }
      localStorage.setItem(key, JSON.stringify({
        slates: trim(store.slates || {}, slateCap),
        ledger: trim(store.ledger || {}, ledgerCap),
      }))
    } catch { /* private mode, quota -- a nicety, never a blocker */ }
  }
  return { read, write }
}
