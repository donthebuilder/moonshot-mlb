// WHICH TAB A COLD OPEN LANDS ON (2026-09-29, SportShell step 2). The rule
// TUDDY's and LAMP's shells each carried a copy of (NflDashboard,
// LampDashboard), written once and pure so a node check can hold it:
//
//   - The LIVE hash answers when it names this sport. A sport switch INTO
//     this product from a page it doesn't have (LAMP's Schedule into TUDDY)
//     must not land on the stale module-load snapshot's tab.
//   - The live hash naming this sport with a tab it doesn't know, while the
//     snapshot names one it does: the snapshot's tab (a deep link the MLB
//     shell rewrote on the way in).
//   - The live hash naming another sport (or none): the snapshot's tab.
//
// Returns resolveTab()'s answer ({ tab, status, asked }).
import { resolveTab } from './routes'

export function resolveColdTab(sport, liveHash, snapTab) {
  let t = null
  let liveIsUs = false
  try {
    const live = new URLSearchParams(String(liveHash || '').replace(/^#/, ''))
    if (live.get('sport') === sport) { liveIsUs = true; t = live.get('tab') }
  } catch { /* ignore */ }
  if (!liveIsUs) t = snapTab
  else if (t && resolveTab(sport, t).status === 'missing' && snapTab && resolveTab(sport, snapTab).status !== 'missing') t = snapTab
  return resolveTab(sport, t)
}
