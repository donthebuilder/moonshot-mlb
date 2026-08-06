// Team bullpen stats, live from the MLB StatsAPI — the `rp` (Reliever)
// situation split at TEAM level, verified against a real 2026 response
// (NYY pen: 407.1 IP, 0.91 HR/9) before this file was written.
//
// WHY THIS EXISTS. Home runs don't stop when the starter leaves — a third or
// more of a game's innings belong to the pen, late homers off relievers are
// routine (the Márquez / McCann / Arenado late-game kind of night), and
// nothing in the payload describes relief pitching at all. This is the
// site-side half of the bullpen story: the pen's aggregate HR/9, ERA and SLG
// against, per team, cached for the session. The bot-side half (per-reliever
// freshness, handedness mix, batter-vs-relief splits) is specced in
// BOT-DATA-REQUESTS.md #18 — those need per-game reliever logs the site
// can't reasonably assemble client-side.

const TEAM_IDS = {
  ARI: 109, ATL: 144, BAL: 110, BOS: 111, CHC: 112, CIN: 113, CLE: 114,
  COL: 115, CWS: 145, DET: 116, HOU: 117, KC: 118, LAA: 108, LAD: 119,
  MIA: 146, MIL: 158, MIN: 142, NYM: 121, NYY: 147, ATH: 133, OAK: 133,
  PHI: 143, PIT: 134, SD: 135, SEA: 136, SF: 137, STL: 138, TB: 139,
  TEX: 140, TOR: 141, WSH: 120,
}

const cache = new Map()

const season = () => {
  const d = new Date()
  return d.getMonth() < 2 ? d.getFullYear() - 1 : d.getFullYear()
}

export async function penStats(teamAbbrev) {
  const ab = String(teamAbbrev || '').toUpperCase().trim()
  const id = TEAM_IDS[ab]
  if (!id) return null
  if (cache.has(ab)) return cache.get(ab)
  const p = fetch(`https://statsapi.mlb.com/api/v1/teams/${id}/stats?stats=statSplits&group=pitching&season=${season()}&sitCodes=rp`)
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => {
      const s = j?.stats?.[0]?.splits?.[0]?.stat
      if (!s) return null
      return {
        hr9: parseFloat(s.homeRunsPer9) || null,
        era: parseFloat(s.era) || null,
        slg: parseFloat(s.slg) || null,
        ip: s.inningsPitched || null,
      }
    })
    .catch(() => null)
  cache.set(ab, p)
  return p
}

// Fetch pens for a set of teams at once; resolves to Map(abbrev -> stats).
export async function penStatsFor(teams) {
  const uniq = [...new Set(teams.map((t) => String(t || '').toUpperCase().trim()).filter((t) => TEAM_IDS[t]))]
  const out = new Map()
  await Promise.all(uniq.map(async (t) => { out.set(t, await penStats(t)) }))
  return out
}
