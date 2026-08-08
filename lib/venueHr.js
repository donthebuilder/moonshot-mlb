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
      if (g?.gamePk && g?.venue?.name) out[g.gamePk] = { id: g.venue.id ?? null, name: g.venue.name }
    }))
  }
  return out
}

const _norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '')

// → { hr, games, pa, seasons: 'YYYY–YY' } for this hitter at this venue,
// this season + last. null on any failure — show nothing over guessing.
//
// MATCH BY VENUE ID, NOT NAME (2026-08-08, Donovan: "some of the HRs at
// tonight's park aren't loading"). The old exact-string compare silently
// found 0 games whenever the slate's venue_name didn't equal the schedule's
// current name — park RENAMES alone break it (Minute Maid → Daikin), plus
// punctuation/casing drift. Now: tonight's gamePk rides along in the same
// schedule batch, its venue ID becomes the target, and history matches on
// ID. Names are only a normalized fallback when no gamePk is available.
export async function venueRecord(pid, venueName, gamePk = null) {
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
    })
    // HIS OWN PACE, same window (2026-08-08, Donovan: "need more on that
    // stat"). The raw count can't be read alone — .19 HR/gm from a 35-HR guy
    // is him being himself, from a 15-HR guy it means the park plays UP for
    // him. Both rates come from the exact same two seasons of gameLog, so
    // the comparison is apples to apples by construction, no extra fetch.
    const hr = here.reduce((a, x) => a + x.hr, 0)
    const hrAll = all.reduce((a, x) => a + x.hr, 0)
    const rate = here.length ? hr / here.length : null
    const rateAll = all.length ? hrAll / all.length : null
    const res = {
      hr,
      games: here.length,
      pa: here.reduce((a, x) => a + x.pa, 0),
      seasons: `${y - 1}–${String(y).slice(2)}`,
      rate,                       // HR per game AT this park
      rateAll,                    // HR per game everywhere, same window
      gamesAll: all.length,
      hrAll,
      // park rate ÷ his own rate — >1 the park plays up for him
      vsSelf: rate != null && rateAll > 0 ? rate / rateAll : null,
    }
    _cache.set(key, res)
    return res
  } catch {
    return null
  }
}
