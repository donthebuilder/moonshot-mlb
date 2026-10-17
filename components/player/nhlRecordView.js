// THE NHL "LAMP ON HIM" TABLE, for components/BotOnHim.js's shared frame (kept apart from nhlAdapter.js, which stays pure: scripts import it under node).
// One row per word LAMP's goal board has given him (CALLED / ON THE BOARD / NOT ON THE BOARD, from lib/callStatus), scored games beside games, and the same
// split by model version (v2 / v3 / v4, each under its own rules, never pooled). Source: /api/lamp/record?player= (graded dressed games, counts only).
import { STATUS_WORD } from '../../lib/callStatus'
import CallStatusBadge from '../CallStatusBadge'
import { C, NUM_FONT } from '../../lib/nhl/theme'

const v = (k) => String(k).replace(/^lamp-goal-/, '')
const day = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
const cell = (c) => (c?.g ? `${c.scored}/${c.g}` : '—')

/** The `view` for components/BotOnHim.js: one row per word LAMP has given him, scored games beside games, and the same split by model version. */
export function nhlBotView(rec) {
  const P = rec?.player
  if (!P || !P.games) return null
  const versions = [...new Set(Object.keys(P.byVersion || {}))].sort()
  const rows = ['called', 'board', 'off'].filter((k) => P.byStatus[k].g > 0).map((k) => {
    const row = { _id: k, k, word: STATUS_WORD[k], job: k === 'called' ? 'score a goal' : '', g: P.byStatus[k].g, scored: P.byStatus[k].scored, goals: P.byStatus[k].goals }
    for (const ver of versions) row[`v_${ver}`] = cell(P.byVersion[ver]?.[k])
    return row
  })
  const columns = [
    { key: 'word', label: 'Word', group: 'Word', sticky: true, heat: false, w: 118, fmt: (_, r) => <span style={{ display: 'grid', gap: 2, justifyItems: 'start', lineHeight: 1.2 }}><CallStatusBadge status={r.k} size={10} /> {r.job ? <span style={{ fontSize: 10, color: C.text3 }}>job: {r.job}</span> : null}</span> },
    { key: 'g', label: 'G', group: 'All games', w: 34, heat: false, numeric: true, title: 'Games he dressed for, graded, under that word' },
    { key: 'scored', label: 'Scored', group: 'All games', w: 52, heat: false, numeric: true, title: 'Games he scored in' },
    { key: 'goals', label: 'Goals', group: 'All games', w: 46, heat: false, numeric: true },
    ...versions.map((ver) => ({ key: `v_${ver}`, label: v(ver), group: 'Scored / games by model version', w: 54, heat: false, title: `Games he scored in / games, under LAMP's ${v(ver)} rules` })),
  ]
  const help = 'Each word LAMP’s goal board has given him, judged on whether he scored. Counts, not chances: a lead, not a fact. Each model version is read under its own rules and never pooled.'
  return {
    brand: 'LAMP', C, NUM_FONT, helpLabel: 'Word record', help,
    headline: `${P.games} ${P.games === 1 ? 'game' : 'games'} on the clean pregame record, ${day(P.since)}–${day(P.through)}`,
    badges: [], rows, columns, hint: 'Swipe for the model versions', caption: help,
  }
}
