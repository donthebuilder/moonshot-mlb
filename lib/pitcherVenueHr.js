// HOMERS THIS ARM HAS GIVEN UP IN THIS BUILDING (2026-08-09).
//
// The other half of the matchup sentence. lib/venueHr.js answers "does the
// hitter go deep here"; nobody could answer "does the guy on the mound give
// them up here", which is the clause that makes the line land:
//   "…and Gore has given up 3 in two starts here".
//
// Built exactly the way venueHr is, because it's the same join and the same
// two verified endpoints — there is no byVenue split on the league API:
//
//   VERIFIED LIVE 2026-08-09
//   /api/v1/people/{id}/stats?stats=gameLog&group=pitching&season=YYYY
//     &fields=stats,splits,stat,homeRuns,inningsPitched,battersFaced,date,game,gamePk
//   → {"stats":[{"splits":[
//        {"stat":{"homeRuns":0,"inningsPitched":"6.0","battersFaced":18},
//         "game":{"gamePk":778555}}, …]}]}
//   So the PITCHING game log does carry homeRuns per game. It is confirmed,
//   not assumed — nothing below runs on a field we haven't seen.
//
//   /api/v1/schedule?sportId=1&gamePks=…&fields=dates,games,gamePk,venue,id,name
//   → {"dates":[{"games":[{"gamePk":778555,"venue":{"id":3309,"name":"Nationals Park"}}]}, …]}
//
// MATCH BY VENUE ID, same lesson venueHr learned the hard way: park renames
// (Minute Maid → Daikin) silently zeroed a name compare. Tonight's gamePk
// rides in the same schedule batch and its venue id is the target; the
// normalized name is only a fallback when no gamePk is available.
//
// STARTS vs APPEARANCES: the sentence says "starts", so it only counts them.
// gameLog carries gamesStarted per row, which is 1 for a start and 0 for a
// relief outing — so a reliever's mop-up innings can't be sold as a start.
// Both counts come back and the caller picks the honest word.
//
// Cached per pitcher+venue for the session, so nine hitters in the same game
// share one pull.

const _cache = new Map() // `${pid}|${venue}|${gamePk}` -> result

async function seasonLog(pid, season) {
  const j = await fetch(`https://statsapi.mlb.com/api/v1/people/${pid}/stats?stats=gameLog&group=pitching&season=${season}&fields=stats,splits,stat,homeRuns,battersFaced,gamesStarted,date,game,gamePk`)
    .then((r) => (r.ok ? r.json() : null)).catch(() => null)
  return (j?.stats?.[0]?.splits || [])
    .map((sp) => ({
      pk: sp?.game?.gamePk,
      date: String(sp?.date || ''),
      hr: Number(sp?.stat?.homeRuns) || 0,
      bf: Number(sp?.stat?.battersFaced) || 0,
      started: Number(sp?.stat?.gamesStarted) === 1,
    }))
    .filter((x) => x.pk)
}

async function venuesFor(pks) {
  const out = {}
  for (let i = 0; i < pks.length; i += 40) {
    const batch = pks.slice(i, i + 40)
    const j = await fetch(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&gamePks=${batch.join(',')}&fields=dates,games,gamePk,venue,id,name`)
      .then((r) => (r.ok ? r.json() : null)).catch(() => null)
    ;(j?.dates || []).forEach((d) => (d.games || []).forEach((g) => {
      if (g?.gamePk && g?.venue?.name) out[g.gamePk] = { id: g.venue.id ?? null, name: g.venue.name }
    }))
  }
  return out
}

const _norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '')

// → { hr, games, starts, hrInStarts, bf, seasons, log } for this pitcher at
// this venue, this season + last. null on any failure — a storyline that
// can't be sourced doesn't get written.
export async function pitcherVenueRecord(pid, venueName, gamePk = null) {
  if (!pid || !venueName) return null
  const key = `${pid}|${venueName}|${gamePk || ''}`
  if (_cache.has(key)) return _cache.get(key)
  try {
    const y = new Date().getFullYear()
    const [cur, prev] = await Promise.all([seasonLog(pid, y), seasonLog(pid, y - 1)])
    const all = [...cur, ...prev]
    if (!all.length) { _cache.set(key, null); return null }
    const pks = [...new Set(all.map((x) => x.pk))]
    if (gamePk) pks.push(Number(gamePk))
    const vmap = await venuesFor(pks)
    const targetId = gamePk ? (vmap[Number(gamePk)]?.id ?? null) : null
    const here = all.filter((x) => {
      const v = vmap[x.pk]
      if (!v) return false
      if (targetId != null && v.id != null) return v.id === targetId
      return _norm(v.name) === _norm(venueName)
    }).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    const starts = here.filter((x) => x.started)
    const res = {
      hr: here.reduce((a, x) => a + x.hr, 0),
      games: here.length,
      starts: starts.length,
      hrInStarts: starts.reduce((a, x) => a + x.hr, 0),
      bf: here.reduce((a, x) => a + x.bf, 0),
      seasons: `${y - 1}–${String(y).slice(2)}`,
      log: here,
      // his own pace over the same window, so "3 here" can be read against
      // whether he gives up 3 anywhere — same two seasons, no extra fetch
      hrAll: all.reduce((a, x) => a + x.hr, 0),
      gamesAll: all.length,
    }
    _cache.set(key, res)
    return res
  } catch {
    return null
  }
}
