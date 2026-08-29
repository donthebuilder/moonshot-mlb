import { pickSplit, HITTING_FIELDS } from './seasonSplit'

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
      // ── EVERYTHING THE SPRAY CHART AND THE FILTERS NEED (2026-08-29) ──
      // Donovan: a player on the slate showed "no detail file published" and
      // the EV Log fell back to a live Savant pull while the spray chart and
      // the pitch tab just said nothing — "all stats and spray chart, ev and
      // pitch log should come up ... still tag it as not on the bot, but all
      // the stats need to be shown."
      //
      // The fallback existed; it just did not carry enough of a row for the
      // other panels to use it. hc_x / hc_y are what SprayField plots — it
      // was already reading them out of this CSV to compute the spray angle
      // and then throwing them away. The rest are the same flags
      // spray_cache.py writes, derived here from the same columns Savant
      // publishes, so a live row and a cached row are the same shape.
      //
      // DERIVED, AND ONLY WHERE THE DERIVATION IS THE PUBLISHED DEFINITION:
      // hard-hit is 95+, a barrel is Savant's own launch_speed_angle 6, the
      // distance tiers are the raw hit distance. Nothing here is modelled and
      // nothing is guessed — a field Savant does not publish stays absent
      // rather than being filled in.
      const dist = parseFloat(col(row, 'hit_distance_sc'))
      const ev2 = Number.isFinite(ev) ? ev : null
      const events = String(col(row, 'events'))
      const side = ang == null ? '' : (
        Math.abs(ang) <= 12 ? 'center' : (pulled ? 'pull' : 'oppo')
      )
      // Five outfield slices from the spray angle, matching the LF..RF lanes
      // the cached rows carry. Negative is to the left from the batter's box.
      const lane = ang == null ? '' : (
        ang < -24 ? 'LF' : ang < -8 ? 'LCF' : ang <= 8 ? 'CF' : ang <= 24 ? 'RCF' : 'RF'
      )
      return {
        date: col(row, 'game_date'),
        pitcher: names[col(row, 'pitcher')] || '—',
        arm: String(col(row, 'p_throws')).toUpperCase(),
        pitch_type: col(row, 'pitch_type'),
        pitch_name: col(row, 'pitch_name') || col(row, 'pitch_type'),
        ev: ev2,
        launch_angle: parseFloat(col(row, 'launch_angle')) || null,
        la: parseFloat(col(row, 'launch_angle')) || null,
        distance: Number.isFinite(dist) ? dist : null,
        pitch_velocity: parseFloat(col(row, 'release_speed')) || null,
        // The coordinates the spray chart plots. Kept as numbers; SprayField's
        // toPolar() does the rest exactly as it does for a cached row.
        hc_x: parseFloat(col(row, 'hc_x')) || null,
        hc_y: parseFloat(col(row, 'hc_y')) || null,
        lane,
        spray_side: side,
        is_barrel: String(col(row, 'launch_speed_angle')) === '6' ? 1 : 0,
        is_hard_hit: Number.isFinite(ev) && ev >= 95 ? 1 : 0,
        is_hr: events === 'home_run' ? 1 : 0,
        is_xbh: /^(double|triple|home_run)$/.test(events) ? 1 : 0,
        is_350_plus: Number.isFinite(dist) && dist >= 350 ? 1 : 0,
        is_375_plus: Number.isFinite(dist) && dist >= 375 ? 1 : 0,
        is_400_plus: Number.isFinite(dist) && dist >= 400 ? 1 : 0,
        event: events.replace(/_/g, ' '),
        result: events.replace(/_/g, ' '),
        bb_type: bb,
        trajectory: bb,
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
    const j = await fetch(`https://statsapi.mlb.com/api/v1/people/${pid}/stats?stats=season&group=hitting&fields=stats,splits,team,gameType,stat,${HITTING_FIELDS}`)
      .then((r) => (r.ok ? r.json() : null))
    // Same traded-player trap as the milestones — see lib/seasonSplit.js.
    const s = pickSplit(j?.stats?.[0])
    if (!s) return null
    return { avg: s.avg, hr: s.homeRuns, pa: s.plateAppearances, ops: s.ops, slg: s.slg, obp: s.obp }
  } catch { return null }
}

// ── 🔴 LIVE ARSENAL FOR A PITCHER WITH NO DETAIL FILE (2026-08-29) ──────────
//
// The batter side got this treatment in Pass 11: no published file ⇒ pull
// live and say so. The pitcher side kept its dead end ("No detail file
// published for this starter, so the arsenal ... unavailable"). Same cure:
// the same statcast_search CSV, player_type=pitcher, which returns EVERY
// PITCH he has thrown this season — so unlike the batter fallback this one
// CAN compute usage% (denominator: all pitches) and whiff% (denominator:
// swings, from the CSV's own `description` values), alongside the
// batted-ball damage columns.
//
// Honesty rules, same as the batter fallback: only fields whose true
// denominator is in this export are computed. xwOBA, K%, BA and wOBA need
// plate-appearance accounting this per-pitch export doesn't carry — they
// stay null and render as em-dashes, never as zeroes.
//
// Rows come out in the EXACT shape MatchupPitcher's arsenal mapper produces,
// so the chart, the duel and the table render them with zero special-casing.
const SWING = /^(swinging_strike|swinging_strike_blocked|foul|foul_tip|hit_into_play)/
const WHIFF = /^swinging_strike/

export async function savantPitcherArsenal(pid) {
  if (!pid) return null
  const key = `arsenal:${pid}`
  if (_cache.has(key)) return _cache.get(key)
  try {
    const url = 'https://baseballsavant.mlb.com/statcast_search/csv?all=true&type=details&player_type=pitcher'
      + `&pitchers_lookup%5B%5D=${pid}&season=${new Date().getFullYear()}&min_pas=0`
    const r = await fetch(url)
    if (!r.ok) { _cache.set(key, null); return null }
    const grid = parseCsv(await r.text())
    if (grid.length < 2) { _cache.set(key, null); return null }
    const H = {}
    grid[0].forEach((h, i) => { H[h] = i })
    const col = (row, name) => row[H[name]] ?? ''

    const mk = () => ({ n: 0, swings: 0, whiffs: 0, bbe: 0, hr: 0, evSum: 0, evN: 0, hard: 0, brl: 0 })
    const packs = { ALL: {}, L: {}, R: {} }
    let total = { ALL: 0, L: 0, R: 0 }
    grid.slice(1).forEach((row) => {
      const code = String(col(row, 'pitch_type')).trim()
      if (!code || code === 'nan') return
      const stand = String(col(row, 'stand')).toUpperCase()
      const sides = ['ALL', ...(stand === 'L' || stand === 'R' ? [stand] : [])]
      const desc = String(col(row, 'description'))
      const inPlay = String(col(row, 'type')) === 'X'
      const ev = parseFloat(col(row, 'launch_speed'))
      const hr = String(col(row, 'events')) === 'home_run'
      sides.forEach((s) => {
        const a = packs[s][code] || (packs[s][code] = mk())
        a.n += 1
        total[s] += 1
        if (SWING.test(desc)) a.swings += 1
        if (WHIFF.test(desc)) a.whiffs += 1
        if (inPlay) {
          a.bbe += 1
          if (hr) a.hr += 1
          if (Number.isFinite(ev)) {
            a.evSum += ev; a.evN += 1
            if (ev >= 95) a.hard += 1
          }
          if (String(col(row, 'launch_speed_angle')) === '6') a.brl += 1
        }
      })
    })

    const shape = (side) => Object.entries(packs[side])
      .map(([code, a]) => ({
        _key: code,
        code,
        pitch: code, // MatchupPitcher renames via PITCH_NAMES; the code is the fallback
        usage: total[side] ? (100 * a.n) / total[side] : 0,
        seen: a.n,
        bbe: a.bbe,
        hr: a.hr,
        hrRate: a.bbe ? (100 * a.hr) / a.bbe : 0,
        ev: a.evN ? a.evSum / a.evN : null,
        hard: a.bbe ? (100 * a.hard) / a.bbe : null,
        barrel: a.bbe ? (100 * a.brl) / a.bbe : null,
        whiffPct: a.swings ? (100 * a.whiffs) / a.swings : null,
        // Not derivable from a per-pitch export — absent, never zero.
        xwoba: null, kPct: null, ba: null, woba: null,
        _live: true,
      }))
      .filter((x) => x.usage > 0)
      .sort((x, y) => y.usage - x.usage)

    const out = total.ALL >= 50
      ? { overall: shape('ALL'), vsL: shape('L'), vsR: shape('R'), pitches: total.ALL }
      : null // under 50 pitches all season is noise dressed as an arsenal
    _cache.set(key, out)
    return out
  } catch {
    _cache.set(key, null)
    return null
  }
}
