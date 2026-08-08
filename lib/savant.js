// 🔴 LIVE STATCAST FALLBACK (2026-08-08, Donovan: "players not on the bot —
// their season stats need to populate as best as possible, esp EV Log").
//
// The bot's spray cache only builds files for slate players. For everyone
// else the EV Log was a dead end — until we VERIFIED (live, from the site's
// own origin, 2026-08-08) that Baseball Savant's statcast_search CSV is
// CORS-open: status 200, full pitch-level rows, straight from the browser.
// So a non-slate player's log now pulls LIVE from Statcast on demand.
//
// Shape contract: rows come out in the exact schema the bot's pitch files
// use, so EVLog renders them with zero special-casing. Fields the CSV
// doesn't carry are computed honestly (barrel = Savant's own
// launch_speed_angle === 6, hard hit = 95+, pull from hc_x geometry) and
// the UI labels the source as a live pull.

const _cache = new Map()

// minimal CSV parser that survives quoted fields with commas
function parseCsv(text) {
  const rows = []
  let row = [], cell = '', inQ = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQ) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++ } else inQ = false }
      else cell += ch
    } else if (ch === '"') inQ = true
    else if (ch === ',') { row.push(cell); cell = '' }
    else if (ch === '\n' || ch === '\r') {
      if (cell !== '' || row.length) { row.push(cell); rows.push(row); row = []; cell = '' }
      if (ch === '\r' && text[i + 1] === '\n') i++
    } else cell += ch
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row) }
  return rows
}

// standard Savant hit-coordinate spray angle; negative = pulled for a RHB
function sprayAngle(hcX, hcY) {
  const x = Number(hcX), y = Number(hcY)
  if (!Number.isFinite(x) || !Number.isFinite(y) || y >= 198.27) return null
  return (Math.atan((x - 125.42) / (198.27 - y)) * 180) / Math.PI
}

async function pitcherNames(ids) {
  if (!ids.length) return {}
  try {
    const j = await fetch(`https://statsapi.mlb.com/api/v1/people?personIds=${ids.slice(0, 200).join(',')}&fields=people,id,fullName`)
      .then((r) => (r.ok ? r.json() : null))
    const m = {}
    ;(j?.people || []).forEach((p) => { m[p.id] = p.fullName })
    return m
  } catch { return {} }
}

// → rows in the bot pitch-file schema, newest first. [] on any failure.
// Uses the `season` param, not a date range — probed live (2026-08-08):
// season=2026 returned 1,246 rows for the test batter while some narrow
// date-range windows came back empty. Trust the query that provably works.
export async function savantBattedBalls(pid) {
  if (!pid) return []
  const key = String(pid)
  if (_cache.has(key)) return _cache.get(key)
  try {
    const url = 'https://baseballsavant.mlb.com/statcast_search/csv?all=true&type=details&player_type=batter'
      + `&batters_lookup%5B%5D=${pid}&season=${new Date().getFullYear()}&min_pas=0`
    const r = await fetch(url)
    if (!r.ok) { _cache.set(key, []); return [] }
    const grid = parseCsv(await r.text())
    if (grid.length < 2) { _cache.set(key, []); return [] }
    const H = {}
    grid[0].forEach((h, i) => { H[h] = i })
    const col = (row, name) => row[H[name]] ?? ''

    const raw = grid.slice(1).filter((row) => col(row, 'type') === 'X')
    const pids = [...new Set(raw.map((row) => col(row, 'pitcher')).filter(Boolean))]
    const names = await pitcherNames(pids)

    const rows = raw.map((row) => {
      const ev = parseFloat(col(row, 'launch_speed'))
      const bb = String(col(row, 'bb_type'))
      const stand = String(col(row, 'stand')).toUpperCase()
      const ang = sprayAngle(col(row, 'hc_x'), col(row, 'hc_y'))
      const air = /fly|line|popup/i.test(bb)
      const pulled = ang != null && (stand === 'R' ? ang < -12 : stand === 'L' ? ang > 12 : false)
      return {
        date: col(row, 'game_date'),
        pitcher: names[col(row, 'pitcher')] || '—',
        arm: String(col(row, 'p_throws')).toUpperCase(),
        pitch_type: col(row, 'pitch_type'),
        ev: Number.isFinite(ev) ? ev : null,
        launch_angle: parseFloat(col(row, 'launch_angle')) || null,
        distance: parseFloat(col(row, 'hit_distance_sc')) || null,
        pitch_velocity: parseFloat(col(row, 'release_speed')) || null,
        is_barrel: String(col(row, 'launch_speed_angle')) === '6' ? 1 : 0,
        is_hard_hit: Number.isFinite(ev) && ev >= 95 ? 1 : 0,
        is_hr: col(row, 'events') === 'home_run' ? 1 : 0,
        event: String(col(row, 'events')).replace(/_/g, ' '),
        bb_type: bb,
        stand,
        is_pull_air: pulled && air ? 1 : 0,
        zone: parseInt(col(row, 'zone'), 10) || null,
      }
    }).sort((a, b) => String(b.date).localeCompare(String(a.date)))

    _cache.set(key, rows)
    return rows
  } catch {
    _cache.set(key, [])
    return []
  }
}

// live season hitting line for the Overview fallback — any player, one call
export async function liveSeasonStats(pid) {
  if (!pid) return null
  try {
    const j = await fetch(`https://statsapi.mlb.com/api/v1/people/${pid}/stats?stats=season&group=hitting&fields=stats,splits,stat,avg,homeRuns,plateAppearances,ops,slg,obp`)
      .then((r) => (r.ok ? r.json() : null))
    const s = j?.stats?.[0]?.splits?.[0]?.stat
    if (!s) return null
    return { avg: s.avg, hr: s.homeRuns, pa: s.plateAppearances, ops: s.ops, slg: s.slg, obp: s.obp }
  } catch { return null }
}
