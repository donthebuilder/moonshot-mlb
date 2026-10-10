// THE STORIES ONE PLAYER IS CARRYING THIS WEEK (2026-09-29, queue batch 13),
// for the storyline strip on a watchlist card. Nothing is computed here: each
// line is one of lib/nfl/storylines.js's own findings (the same rules the
// Storylines page prints), regrouped by player, with no page limits.
// Birthdays are left out on purpose: storylines.birthdays() keys on the UTC
// date, not the Eastern game day (logged as a finding, not fixed here).
import { scoredLastTimeOut, dueByTheNumbers, revengeGames, milestoneCountdowns, milestoneStreaks, VERB, fmtBar } from './storylines'

const ALL = { limit: 9999 }

export function storiesByPlayer(data, logs) {
  const out = new Map()
  const add = (p, item) => {
    const k = String(p.player_id)
    if (!out.has(k)) out.set(k, [])
    out.get(k).push(item)
  }
  if (!data?.players?.length) return out
  if (logs) {
    for (const r of milestoneStreaks(logs, data)) {
      const verb = VERB[r.marketKey] ? VERB[r.marketKey](fmtBar(r.marketBar)) : r.marketKey
      add(r.player, { key: `streak-${r.marketKey}`, icon: '📈', text: `${r.streak} straight: ${verb.replace(/^(gone for|scored|caught|carried it|thrown for) /, '')}`,
        title: `Has ${verb} in ${r.streak} straight games — about a ${Math.round(r.chance * 100)}% run at his own rate.` })
    }
  }
  for (const r of scoredLastTimeOut(data, ALL)) {
    add(r.player, { key: 'lasttime', icon: '🔥', text: 'scored last time out', title: `Scored in his most recent game; ${r.seasonTd} this season.` })
  }
  for (const r of dueByTheNumbers(data, ALL)) {
    add(r.player, { key: 'due', icon: '📐', text: `${r.xtd.toFixed(2)} xTD vs ${r.actual.toFixed(2)} TD a game`,
      title: 'Expected touchdowns a game from where his chances happen, next to what he has scored. A description of the gap, not a forecast.' })
  }
  if (logs) {
    for (const r of revengeGames(data, logs, ALL)) {
      add(r.player, { key: 'revenge', icon: '😤', text: `vs his old team (${r.oldGames} g, ${r.tdsThere} TD there)`,
        title: `Faces ${r.oldTeam}, who he played ${r.oldGames} logged games for (${r.seasons.join(', ')}).` })
    }
    for (const r of milestoneCountdowns(data, logs, ALL)) {
      add(r.player, { key: `mile-${r.stat}`, icon: '🎯', text: `${r.gap} ${r.stat === 'touchdowns' && r.gap === 1 ? 'touchdown' : r.stat} from ${r.next}`,
        title: `${r.have} ${r.stat} this season in ${r.games} games; ${r.next} is ${r.gap} away.` })
    }
  }
  return out
}
