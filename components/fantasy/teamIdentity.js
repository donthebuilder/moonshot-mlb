// Team identity — the C4 "de-bland" pass, decided 2026-08-29: owners pick
// their own color and monogram (Donovan's call: "pick their own"). Fourteen
// teams of plain text was the single biggest reason Franchise read as bland.
//
// Two layers on purpose:
//   · a team that has picked gets exactly what it picked;
//   · a team that hasn't yet STILL gets a stable, deterministic color and
//     its initials — hashed from the team id — so standings, matchups and
//     the wire are colorful on day one, and nothing shifts when a real pick
//     later replaces the hash.
//
// Shared by the TeamMark component, the identity form on the Team page, and
// the server action that validates a save. No 'use client'/'use server'
// pragma: this is plain data + pure functions, importable from both.

export const TEAM_COLORS = [
  ['#f97316', 'Ember'],
  ['#eab308', 'Gold'],
  ['#84cc16', 'Turf'],
  ['#22c55e', 'Green'],
  ['#2dd4bf', 'Teal'],
  ['#38bdf8', 'Sky'],
  ['#818cf8', 'Indigo'],
  ['#a78bfa', 'Violet'],
  ['#e879f9', 'Magenta'],
  ['#f472b6', 'Pink'],
  ['#f43f5e', 'Red'],
  ['#94a3b8', 'Steel'],
]

const HEX = /^#[0-9a-fA-F]{6}$/

export function isValidTeamColor(value) {
  return HEX.test(String(value || ''))
}

export function cleanMonogram(value) {
  // Letters and digits only, up to 3, stored uppercase. "8" and "JJ" and
  // "G4I" are all fine; emoji and spaces are not a monogram.
  return String(value || '').replace(/[^0-9a-zA-Z]/g, '').slice(0, 3).toUpperCase()
}

// A stable color for teams that haven't picked one. Hash the immutable team
// id, not the (renamable) name, so a rename never recolors the team.
export function fallbackColor(teamId) {
  const s = String(teamId || '')
  let hash = 0
  for (let i = 0; i < s.length; i += 1) hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0
  return TEAM_COLORS[Math.abs(hash) % TEAM_COLORS.length][0]
}

export function fallbackMonogram(name) {
  const words = String(name || '').trim().split(/\s+/).filter(Boolean)
  const letters = words.length >= 2
    ? words[0][0] + words[1][0]
    : String(words[0] || '?').slice(0, 2)
  return letters.toUpperCase()
}

export function teamColor(team) {
  return isValidTeamColor(team?.color) ? team.color : fallbackColor(team?.id)
}

export function teamMonogram(team) {
  return cleanMonogram(team?.monogram) || fallbackMonogram(team?.name)
}
