// HRS AT TONIGHT'S PARK (2026-08-08, Donovan: "id like to know if the player
// has hrs in the park they're playing in tonight").
//
// The league has no byVenue stat type (probed live — empty), so this is
// assembled from two endpoints that ARE verified:
//   gameLog     per-game homeRuns + game.gamePk (season and last season)
//   schedule    gamePks batch → venue name per game (verified 2026-08-08)
// Join on gamePk, filter to tonight's venue name, sum. Two seasons of road
// games at one park is a handful of dates — the display must say the sample
// out loud, and callers should treat this as color, never a score input.

const _cache = new Map() // `${pid}|${venue}` -> result

async function seasonLog(pid, season) {
  const j = await fetch(`https://statsapi.mlb.com/api/v1/people/${pid}/stats?stats=gameLog&group=hitting&season=${season}&fields=stats,splits,stat,homeRuns,plateAppearances,game,gamePk`)
    .then((r) => (r.ok ? r.json() : null)).catch(() => null)
  return (j?.stats?.[0]?.splits || [])
    .map((sp) => ({
      pk: sp?.game?.gamePk,
      hr: Number(sp?.stat?.homeRuns) || 0,
      pa: Number(sp?.stat?.plateAppearances) || 0,
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
      if (g?.gamePk && g?.venue?.name) out[g.gamePk] = g.venue.name
    }))
  }
  return out
}

// → { hr, games, pa, seasons: 'YYYY–YY' } for this hitter at this venue,
// this season + last. null on any failure — show nothing over guessing.
export async function venueRecord(pid, venueName) {
  if (!pid || !venueName) return null
  const key = `${pid}|${venueName}`
  if (_cache.has(key)) return _cache.get(key)
  try {
    const y = new Date().getFullYear()
    const [cur, prev] = await Promise.all([seasonLog(pid, y), seasonLog(pid, y - 1)])
    const all = [...cur, ...prev]
    if (!all.length) { _cache.set(key, null); return null }
    const vmap = await venuesFor([...new Set(all.map((x) => x.pk))])
    const here = all.filter((x) => vmap[x.pk] === venueName)
    const res = {
      hr: here.reduce((a, x) => a + x.hr, 0),
      games: here.length,
      pa: here.reduce((a, x) => a + x.pa, 0),
      seasons: `${y - 1}–${String(y).slice(2)}`,
    }
    _cache.set(key, res)
    return res
  } catch {
    return null
  }
}
