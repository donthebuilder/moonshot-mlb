// WATCHLIST, GAME BY GAME (2026-09-23).
//
// Donovan: "group by start time games then teams for the watch list." A saved
// list is worked the way the night is played -- earliest first pitch first,
// and inside a game, one team's hitters together. Shared by the on-page
// table, the card view and the Discord copy so the three can never disagree
// about the order.
//
// The MLB slate row carries game_pk, game_time (UTC ISO), team and opponent.
// It has no home/away, so a game is labelled by the teams on it, not "@".
import { nameOf, teamOf, oppOf, hrScore } from './player'

const ET = { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' }

export function gameTimeOf(p) {
  const t = new Date(p?.game_time || 0).getTime()
  return Number.isFinite(t) && t > 0 ? t : Infinity   // unknown start sorts last, never first
}

export function gameKeyOf(p) {
  return String(p?.game_pk || [teamOf(p), oppOf(p)].sort().join('-') || 'unknown')
}

/** "7:05 PM ET", or "TBD" when the slate has no start time. */
export function startLabel(p) {
  const t = gameTimeOf(p)
  return Number.isFinite(t) ? `${new Date(t).toLocaleTimeString('en-US', ET)} ET` : 'TBD'
}

/** Sort comparator: start time, then game, then team, then HR score (best first). */
export function byGameThenTeam(a, b) {
  return gameTimeOf(a) - gameTimeOf(b)
    || gameKeyOf(a).localeCompare(gameKeyOf(b))
    || teamOf(a).localeCompare(teamOf(b))
    || hrScore(b) - hrScore(a)
}

/**
 * Nested groups for rendering: [{ key, time, label, teams: [{ team, players }] }]
 * in play order. `label` names both clubs, e.g. "1:10 PM ET · DET vs WSH".
 */
export function groupByGame(items) {
  const games = new Map()
  for (const p of [...items].sort(byGameThenTeam)) {
    const key = gameKeyOf(p)
    if (!games.has(key)) games.set(key, { key, time: gameTimeOf(p), start: startLabel(p), clubs: new Set(), teams: new Map() })
    const g = games.get(key)
    g.clubs.add(teamOf(p)); if (oppOf(p)) g.clubs.add(oppOf(p))
    if (!g.teams.has(teamOf(p))) g.teams.set(teamOf(p), [])
    g.teams.get(teamOf(p)).push(p)
  }
  return [...games.values()].map((g) => ({
    key: g.key,
    time: g.time,
    label: `${g.start} · ${[...g.clubs].filter(Boolean).sort().join(' vs ')}`,
    teams: [...g.teams.entries()].map(([team, players]) => ({ team, players })),
  }))
}

/** One Discord block per game: a bold header, then one line per team. */
export function discordGameBlocks(items, markPick) {
  return groupByGame(items).map((g) => [
    `**${g.label}**`,
    ...g.teams.map(({ team, players }) =>
      `${team}: ${players.map((p) => `${nameOf(p)} ${Math.round(hrScore(p))}${markPick(p) ? ' ⭐' : ''}`).join(', ')}`),
  ].join('\n') + '\n')
}
