// THE LABEL LINE AND THE SHAPE OF A FACT POST (X overhaul, 2026-10-09). Pure.
//
// Every fact post is: a label line from the registry (lib/routes.js BRAND) -- '⚾ MOONSHOT · HOT STREAK' --
// then a few short lines, then where the number came from. The brand and the icon are NEVER typed here:
// they are read off BRAND by sport key. The label is the family's own word (below).
import { BRAND, sportKey } from '../routes'

export const LABELS = Object.freeze({
  // player facts (lib/facts/players.js)
  p_streak: 'HOT STREAK', p_form: 'FORM CHECK', p_birthday: 'BIRTHDAY', p_vs_team: 'VS THIS TEAM', p_milestone: 'MILESTONE WATCH', p_vs_starter: 'HEAD TO HEAD',
  // team facts (lib/facts/nfl.js, teams.js) and the bot's own record (lib/facts/mlb.js)
  both_unbeaten: 'UNBEATEN MATCHUP', both_winless: 'WINLESS MATCHUP', team_start_unbeaten: 'PERFECT START', team_start_winless: 'WINLESS START',
  themed_week: 'THEMED WEEK', unbeaten_start: 'PERFECT START', win_streak: 'WIN STREAK', bot_called: 'BY THE NUMBERS', bot_blind_spot: 'BY THE NUMBERS',
})
// where the numbers came from, said short (no digits: the checker only lets a fact's own numbers through)
export const VIA = Object.freeze({
  nfl: 'nflverse schedule', mlb: 'MLB Stats API', nhl: 'NHL api-web', nba: 'ESPN',
})

/** The label line for a fact. */
export const headerOf = (fact) => `${fact.icon} ${fact.brand} · ${fact.label}`

/** The fact with brand / icon / label / via set from the registry. A fact that already carries them keeps them. */
export function decorate(fact) {
  const b = BRAND[sportKey(fact.sport)]
  // a team fact names its clubs, so the repeat guard (same subject, same sport window) can hold the 49ers' 3-0 and 4-0 apart
  const named = fact.named || (Array.isArray(fact.teams) ? fact.teams.map((t) => `team:${fact.sport}:${t.code}`) : [])
  return { ...fact, named, brand: fact.brand || b.name, icon: b.icon, label: fact.label || LABELS[fact.family] || 'FACT', via: fact.via || VIA[fact.sport] || null }
}

/** label line + body lines, as a post (no source line). `body` is lines (strings). */
export function compose(fact, body) {
  // No 'Source: ...' line on any fact post (Donovan 10-10: 'please don't put sources on there'). `via` stays on the fact record for the audit trail only.
  // LAYOUT (Donovan, 2026-10-16: the lines were stacked with no air): label line, a blank line, the fact lines together, a blank line,
  // then the 'Next:' line and what follows it. A fact with no 'Next:' line gets just the blank after the label.
  const rows = body.filter(Boolean)
  const at = rows.findIndex((l) => /^Next:/i.test(String(l).trim()))
  const lines = at > 0
    ? [headerOf(fact), '', ...rows.slice(0, at), '', ...rows.slice(at)]
    : [headerOf(fact), '', ...rows]
  return lines.join('\n')
}
