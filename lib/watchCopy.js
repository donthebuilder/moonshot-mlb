// THE WATCHLIST AS TEXT, ONE BUILDER FOR LAMP AND BUCKETS (2026-10-28, Donovan: "make sure that we can copy, as a text, the watch list for each
// sport"). MOONSHOT's and TUDDY's Copy List already did this on their own; this is the same text for the two that had none -- a bold header
// per game (earliest start first, "7:05 PM ET"), then one line per club: "NYR: Adam Fox 77 ⭐, Jack Roslovic 71". A man whose club is not playing
// tonight sits last under "No game tonight". Split into Discord-sized parts (lib/discordText.js: 1,900 characters, each with its own "1/2").
// items: [{ name, team, score, star, gameKey, gameLabel, startMs }]  gameKey null = no game tonight. Pure; `now` is only for the date in the title.
import { discordParts } from './discordText'

const ET = { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' }
export const etTime = (ms) => (Number.isFinite(ms) ? `${new Date(ms).toLocaleTimeString('en-US', ET)} ET` : 'TBD')

export function watchCopyParts({ brand, items, starWord = 'CALLED', now = new Date() }) {
  const stamp = now.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })
  const games = new Map()
  for (const it of items || []) {
    const key = it.gameKey || '￿-none'
    if (!games.has(key)) games.set(key, { label: it.gameKey ? `${etTime(it.startMs)} · ${it.gameLabel}` : 'No game tonight', start: it.gameKey && Number.isFinite(it.startMs) ? it.startMs : Infinity, teams: new Map() })
    const g = games.get(key)
    const t = it.team || '—'
    if (!g.teams.has(t)) g.teams.set(t, [])
    g.teams.get(t).push(it)
  }
  const blocks = [...games.values()].sort((a, b) => a.start - b.start || a.label.localeCompare(b.label)).map((g) => [
    `**${g.label}**`,
    ...[...g.teams.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([team, ps]) =>
      `${team}: ${[...ps].sort((a, b) => (b.score ?? -1) - (a.score ?? -1)).map((p) => `${p.name}${Number.isFinite(p.score) ? ` ${Math.round(p.score)}` : ''}${p.star ? ' ⭐' : ''}`).join(', ')}`),
  ].join('\n') + '\n')
  if (!blocks.length) return []
  return discordParts(`**${brand} watchlist · ${stamp}**`, blocks, (items || []).some((p) => p.star) ? `⭐ = ${starWord}` : '')
}
