// 🧱 Wall dimensions vs pull side (audit #7, 2026-08-08).
//
// venues?hydrate=fieldInfo VERIFIED live before this file existed: every MLB
// venue returns leftLine / leftCenter / center / rightCenter / rightLine in
// feet (Yankee 314 RF line, Oracle 309 RF line confirmed in the probe). One
// call, cached for the session — park walls don't move mid-slate.
//
// "Short side" is stated as a league PERCENTILE computed from this same
// payload, not against a hand-typed league average — the data grades itself.

const URL = 'https://statsapi.mlb.com/api/v1/venues?sportId=1&hydrate=fieldInfo'

let _cache = null
export async function fetchWalls() {
  if (_cache) return _cache
  try {
    const r = await fetch(URL)
    if (!r.ok) return null
    const j = await r.json()
    const byName = new Map()
    const all = []
    ;(j?.venues || []).forEach((v) => {
      const f = v?.fieldInfo
      if (!f || f.leftLine == null || f.rightLine == null) return
      const rec = {
        id: v.id, name: v.name,
        leftLine: f.leftLine, leftCenter: f.leftCenter ?? null,
        center: f.center ?? null, rightCenter: f.rightCenter ?? null,
        rightLine: f.rightLine,
      }
      byName.set(norm(v.name), rec)
      all.push(rec)
    })
    _cache = { byName, all }
    return _cache
  } catch { return null }
}

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '')

// pct of league parks whose same-side line is SHORTER than this one (0 = the
// shortest porch in baseball, 100 = the deepest)
const pctile = (all, key, val) => {
  const vals = all.map((v) => v[key]).filter((x) => x != null)
  if (!vals.length || val == null) return null
  return Math.round((100 * vals.filter((x) => x < val).length) / vals.length)
}

// bats 'L' | 'R' | 'S', venueName string →
//   { side, line, gap, linePct, word } | null
export async function pullWallFor(bats, venueName) {
  const walls = await fetchWalls()
  if (!walls) return null
  const v = walls.byName.get(norm(venueName))
  if (!v) return null
  const b = String(bats || '').toUpperCase().slice(0, 1)
  if (!b || b === '?') return null
  // LHB pulls to RIGHT field; RHB to LEFT; switch = both, take the shorter
  const sides = b === 'L' ? [['RF', v.rightLine, v.rightCenter, 'rightLine']]
    : b === 'R' ? [['LF', v.leftLine, v.leftCenter, 'leftLine']]
    : [['LF', v.leftLine, v.leftCenter, 'leftLine'], ['RF', v.rightLine, v.rightCenter, 'rightLine']]
  const best = sides.map(([side, line, gap, key]) => ({
    side, line, gap, linePct: pctile(walls.all, key, line),
  })).sort((a, b2) => (a.line ?? 999) - (b2.line ?? 999))[0]
  if (!best || best.line == null) return null
  const word = best.linePct == null ? ''
    : best.linePct <= 20 ? 'short porch'
    : best.linePct >= 80 ? 'deep wall'
    : 'league-normal'
  return { ...best, word }
}
