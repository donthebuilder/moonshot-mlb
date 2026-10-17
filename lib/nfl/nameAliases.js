// NFL odds-name -> slate-name aliases + the initials join key (2026-10-17).
// SAME rows as the bot's bots/nfl/name_aliases.json (scripts/check-nfl-aliases.mjs
// compares them when the bot checkout is present). Each row was reviewed: one
// player, same team, the book spells him differently from the slate. EXACT only,
// never a nearest name. normName (lib/format.js) is NOT changed: it is shared by
// MLB and its three copies key the published by_name; the initials rule lives
// here as a JOIN key only ("c j williams" and "cj williams" meet; nothing that
// matched before can move).
import { normName } from '../format'

export const NFL_NAME_ALIASES = [
  { odds: "Cameron Ward", ours: "Cam Ward", team: "TEN" },
  { odds: "Cameron Skattebo", ours: "Cam Skattebo", team: "NYG" },
  { odds: "Chigoziem Okonkwo", ours: "Chig Okonkwo", team: "WAS" },
  { odds: "Joshua Palmer", ours: "Josh Palmer", team: "BUF" },
  { odds: "Kenneth Gainwell", ours: "Kenny Gainwell", team: "TB" },
  { odds: "Andres Borregales", ours: "Andy Borregales", team: "NE" },
  { odds: "Drew Ogletree", ours: "Andrew Ogletree", team: "IND" },
  { odds: "Zonovan Knight", ours: "Bam Knight", team: "ARI" },
  { odds: "Michael Sturdivant", ours: "J. Michael Sturdivant", team: "GB" },
  { odds: "Hollywood Brown", ours: "Marquise Brown", team: "PHI" },
]

/** Adjacent single-letter tokens fuse: "a j brown" -> "aj brown". Input is already normName'd. */
export function joinKey(norm) {
  const out = []
  for (const t of String(norm || '').split(' ').filter(Boolean)) {
    if (t.length === 1 && out.length && out[out.length - 1].initials) out[out.length - 1].s += t
    else out.push({ s: t, initials: t.length === 1 })
  }
  return out.map((x) => x.s).join(' ')
}

const IDX = new WeakMap()
function indexOf(odds) {
  let m = IDX.get(odds)
  if (!m) {
    m = new Map()
    for (const k of Object.keys(odds.by_name || {})) {
      const jk = joinKey(k)
      m.set(jk, m.has(jk) ? null : k) // two odds names share a join key: ambiguous, never picked
    }
    IDX.set(odds, m)
  }
  return m
}

/** The odds by_name entry for one of our players, or null. Exact name, then initials key, then the reviewed alias (team must agree). */
export function oddsByName(odds, player) {
  const bn = odds?.by_name
  if (!bn || !player) return null
  const norm = normName(player.name || player.player_name)
  if (bn[norm]) return bn[norm]
  const idx = indexOf(odds)
  const jk = joinKey(norm)
  if (idx.get(jk)) return bn[idx.get(jk)]
  const team = String(player.team || '').toUpperCase()
  for (const a of NFL_NAME_ALIASES) {
    if (joinKey(normName(a.ours)) !== jk || (team && team !== a.team)) continue
    const k = bn[normName(a.odds)] ? normName(a.odds) : idx.get(joinKey(normName(a.odds)))
    if (k) return bn[k]
  }
  return null
}

/** Lines that are a club's special teams, not a player ("BUF Bills ST", "SF ST", "Saints ST"). */
export const isTeamLine = (name) => /\bST$/i.test(String(name || '').trim())
