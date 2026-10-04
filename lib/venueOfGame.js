// THE PARK EACH GAME WAS PLAYED IN, ONCE PER SESSION (2026-10-04 perf audit).
// lib/venueHr.js (hitter at this park) and lib/pitcherVenueHr.js (arm at this
// park) each looked the same gamePks up again for every player -- the MLB
// Slate tab sent ~80 schedule calls. One map, keyed by gamePk, holding the
// in-flight promise so concurrent callers share a request. Same endpoint and
// fields both used (verified 2026-08-08):
//   /api/v1/schedule?sportId=1&gamePks=…&fields=dates,games,gamePk,venue,id,name
const _byPk = new Map() // gamePk -> Promise<{ id, name } | null>

/** { [gamePk]: { id, name } } for the gamePks the schedule knows. */
export async function venuesFor(pks) {
  const want = [...new Set(pks.map(Number).filter(Boolean))]
  const missing = want.filter((pk) => !_byPk.has(pk))
  for (let i = 0; i < missing.length; i += 40) {
    const batch = missing.slice(i, i + 40)
    const got = fetch(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&gamePks=${batch.join(',')}&fields=dates,games,gamePk,venue,id,name`)
      .then((r) => (r.ok ? r.json() : null)).catch(() => null)
      .then((j) => {
        const m = {}
        ;(j?.dates || []).forEach((d) => (d.games || []).forEach((g) => {
          if (g?.gamePk && g?.venue?.name) m[g.gamePk] = { id: g.venue.id ?? null, name: g.venue.name }
        }))
        return m
      })
    // A failed batch is forgotten, so the next caller asks again.
    for (const pk of batch) _byPk.set(pk, got.then((m) => { if (!m[pk]) _byPk.delete(pk); return m[pk] || null }))
  }
  const out = {}
  await Promise.all(want.map(async (pk) => { const v = await _byPk.get(pk); if (v) out[pk] = v }))
  return out
}
