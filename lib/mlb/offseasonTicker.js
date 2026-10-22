// MOONSHOT'S TICKER IN THE OFFSEASON (2026-10-21, KNOWN-ISSUES #18). The header strip is built from the board on screen, and after the
// World Series that board is the last slate, so the strip would have rolled "MOONSHOT'S #1 ...", "Expected HRs", "prev lineups" and a
// "built 9 days ago" pill all winter. In the OFFSEASON (lib/mlb/phase.js, the one MLB state) the slate pills step aside for what is true
// now: the word, and the fall league's games today (or its next one) while it plays. Any other state: null, and the strip is as before.
// Pure; the header hands in the phase (lib/mlb/usePhase.js).
const dayWord = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' })
const club = (t) => t?.abbrev || t?.name || ''
export const FALL_PILLS = 3

/** The offseason pills, or null outside the offseason. Each: { k, label, value, color?, nav, title }. */
export function offseasonItems(phase, { muted = null } = {}) {
  if (!phase || phase.phase !== 'OFFSEASON') return null
  const items = [{ k: 'off', label: 'MLB', value: 'Offseason', nav: 'home', title: "The season is in the books. MOONSHOT's 2026 record, the receipts and the homer ledger stay up all winter." }]
  if (phase.lane === 'FALL') {
    const games = (phase.laneGames || []).filter((g) => club(g.away) && club(g.home))
    for (const g of games.slice(0, FALL_PILLS)) items.push({ k: `fall-${g.pk}`, label: 'fall league', value: `${club(g.away)} @ ${club(g.home)}`, nav: 'home', title: `Arizona Fall League today: ${g.away.name || club(g.away)} at ${g.home.name || club(g.home)}. Not part of the MOONSHOT record.` })
    if (games.length > FALL_PILLS) items.push({ k: 'fall-more', label: 'fall league', value: `+${games.length - FALL_PILLS} more`, nav: 'home', title: "Today's fall league games are on MOONSHOT's Home." })
    if (!games.length && phase.next) items.push({ k: 'fall-next', label: 'next fall game', value: dayWord(phase.next.date), ...(muted ? { color: muted } : {}), nav: 'home', title: `No fall league games today. Next: ${dayWord(phase.next.date)}, ${phase.next.away?.name || club(phase.next.away)} at ${phase.next.home?.name || club(phase.next.home)}.` })
  }
  return items
}
