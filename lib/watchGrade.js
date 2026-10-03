'use client'

// ⭐ WHAT YOUR SAVED PLAYERS DID FOR YOU (2026-09-29).
//
// Reads lib/watchNights.js (who was on your list, night by night) and grades
// each of those nights off the player's own game log from the league -- not
// the bot's graded file, which only ever held the ~90 hitters the bot tracked.
// So any saved name counts, and a night counts whether or not the page was
// open that night.
//
// Two questions, per player and for the list:
//   · does he come through -- each bar the site grades on, k of n starts;
//   · was he profitable for you -- 1 unit on each bar at that night's pregame
//     price, settled, on the nights a price exists. Prices come from the True
//     Price archive (odds_history.json: [date, price, cleared] per player per
//     market line). Nights without a price sit out of the units and the page
//     says how many were priced -- never a made-up price.
//
// VOID, NOT MISS: saved but didn't play (no game that date, or no plate
// appearance / snap / shift) is void, the same rule the bot grades itself by.

// ── one adapter per sport ──────────────────────────────────────────────────
// log(id, seasons) -> Map(date -> [games]) (+ .name, the league's name for
// him) where a game is
//   { pk, date, played, line: {...} }
// bars: [{ key, label, ok(line), price: 'market|line' | null }]

const MLB_TYPES = 'R,F,D,L,W'   // regular season + every postseason round

const logCache = new Map()
async function mlbLog(id, seasons) {
  const out = new Map()
  out.name = ''
  for (const season of seasons) {
    const key = `mlb:${id}:${season}`
    if (!logCache.has(key)) {
      logCache.set(key, fetch(`https://statsapi.mlb.com/api/v1/people/${encodeURIComponent(id)}/stats?stats=gameLog&group=hitting&season=${season}&gameType=${MLB_TYPES}`)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null))
    }
    const j = await logCache.get(key)
    for (const s of j?.stats?.[0]?.splits || []) {
      if (!out.name && s.player?.fullName) out.name = s.player.fullName
      const st = s.stat || {}
      const g = {
        pk: String(s.game?.gamePk ?? ''),
        date: String(s.date || ''),
        played: Number(st.plateAppearances) > 0,
        line: {
          ab: Number(st.atBats) || 0, h: Number(st.hits) || 0, hr: Number(st.homeRuns) || 0,
          tb: Number(st.totalBases) || 0, r: Number(st.runs) || 0, rbi: Number(st.rbi) || 0,
          xbh: (Number(st.doubles) || 0) + (Number(st.triples) || 0) + (Number(st.homeRuns) || 0),
        },
      }
      if (!out.has(g.date)) out.set(g.date, [])
      out.get(g.date).push(g)
    }
  }
  return out
}

// TUDDY: the published season-to-date game log (nfl_logs.json, one file for
// every rated player) and ITS OWN bars (logs.bars: TD 1+, rec yds 40+ ...), the
// same ones the card grades on. A game is keyed 'season:week' -- the log has no
// dates -- which is the pk TUDDY's saves carry.
let nflLogsPromise = null
const nflLogs = () => {
  if (!nflLogsPromise) {
    nflLogsPromise = import('./nfl/dataSource').then(({ nflLogPaths }) => fetch(nflLogPaths()[0]))
      .then((r) => (r.ok ? r.json() : null)).catch(() => null)
  }
  return nflLogsPromise
}
async function nflLog(id) {
  const j = await nflLogs()
  const out = new Map()
  out.bars = j?.bars || null
  for (const g of j?.logs?.[String(id)]?.log || []) {
    const pk = `${g.s}:${g.w}`
    out.set(pk, [{ pk, date: pk, played: true, line: g }])
  }
  return out
}
const NFL_MARKETS = [['TD', 'TD', 'scored'], ['REC_YDS', 'Rec yds', 'cleared the receiving-yards bar'], ['REC', 'Rec', 'cleared the receptions bar'], ['RUSH_YDS', 'Rush yds', 'cleared the rushing-yards bar'], ['RUSH_ATT', 'Carries', 'cleared the carries bar'], ['PASS_YDS', 'Pass yds', 'cleared the passing-yards bar'], ['KICK_PTS', 'Kick pts', 'cleared the kicking-points bar']]

// LAMP: the skater's own game log through /api/lamp/player (the league's
// player/{id}/game-log for the featured season, edge-cached), one call per
// saved skater. A row is a game he dressed for; the saved game id matches it.
async function nhlLog(id) {
  const key = `nhl:${id}`
  if (!logCache.has(key)) {
    logCache.set(key, fetch(`/api/lamp/player?id=${encodeURIComponent(id)}`).then((r) => (r.ok ? r.json() : null)).catch(() => null))
  }
  const j = await logCache.get(key)
  const out = new Map()
  out.name = j?.name || ''
  for (const r of j?.log?.rows || []) {
    const g = { pk: String(r.gameId ?? ''), date: String(r.date || ''), played: true, line: { g: Number(r.g) || 0, a: Number(r.a) || 0, pts: Number(r.pts) || 0, shots: Number(r.shots) || 0 } }
    if (!out.has(g.date)) out.set(g.date, [])
    out.get(g.date).push(g)
  }
  return out
}

// BUCKETS (2026-10-03): his game log off /api/buckets/player (ESPN's), regular
// season and playoffs. A night is keyed by the game's own ET date.
async function nbaLog(id) {
  const key = `nba:${id}`
  if (!logCache.has(key)) {
    logCache.set(key, fetch(`/api/buckets/player?id=${encodeURIComponent(id)}`).then((r) => (r.ok ? r.json() : null)).catch(() => null))
  }
  const j = await logCache.get(key)
  const out = new Map()
  out.name = j?.card?.name || ''
  for (const r of j?.log || []) {
    if (r.seasonType !== 2 && r.seasonType !== 3) continue
    let date = ''
    try { date = new Date(r.date).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }) } catch { /* no date, no night */ }
    const g = { pk: String(r.id ?? ''), date, played: (Number(r.min) || 0) > 0, line: { pts: Number(r.pts) || 0, reb: Number(r.reb) || 0, ast: Number(r.ast) || 0, tpm: Number(r.tpm) || 0 } }
    if (!out.has(g.date)) out.set(g.date, [])
    out.get(g.date).push(g)
  }
  return out
}

export const SPORT_WATCH = {
  nba: {
    noun: 'player',
    log: nbaLog,
    // BUCKETS' own bars (lib/nba/model.js NBA_MARKETS). No archived NBA prices yet.
    bars: [
      { key: 'pts', label: 'PTS 25+', word: 'scored 25+', ok: (l) => l.pts >= 25, price: null },
      { key: 'reb', label: 'REB 10+', word: 'had 10+ rebounds', ok: (l) => l.reb >= 10, price: null },
      { key: 'ast', label: 'AST 8+', word: 'had 8+ assists', ok: (l) => l.ast >= 8, price: null },
      { key: '3pm', label: '3PM 4+', word: 'made 4+ threes', ok: (l) => l.tpm >= 4, price: null },
    ],
    lineText: (l) => `${l.pts} pts, ${l.reb} reb, ${l.ast} ast`,
  },
  mlb: {
    noun: 'hitter',
    log: mlbLog,
    // The four bars the bot is graded on (lib/liveSlate.js pickCleared), each
    // priced at the True Price archive's line for that bar.
    bars: [
      { key: 'hr', label: 'HR', word: 'homered', ok: (l) => l.hr >= 1, price: 'batter_home_runs|0.5' },
      { key: 'hit', label: 'Hit', word: 'got a hit', ok: (l) => l.h >= 1, price: 'batter_hits|0.5' },
      { key: 'hrr', label: 'H+R+RBI 2+', word: 'reached 2+ H+R+RBI', ok: (l) => l.h + l.r + l.rbi >= 2, price: 'batter_hits_runs_rbis|1.5' },
      { key: 'tb', label: '2+ TB', word: 'reached 2+ total bases', ok: (l) => l.tb >= 2, price: 'batter_total_bases|1.5' },
    ],
    // What a start line reads like in a tooltip.
    lineText: (l) => `${l.h}-${l.ab}${l.hr ? `, ${l.hr} HR` : ''}${l.r ? `, ${l.r} R` : ''}${l.rbi ? `, ${l.rbi} RBI` : ''}`,
  },
  nhl: {
    noun: 'skater',
    log: nhlLog,
    // LAMP's own markets: the goal board, a point, and the SHOTS 3+ board.
    // No archived LAMP prices yet, so nothing is priced.
    bars: [
      { key: 'goal', label: 'Goal', word: 'scored', ok: (l) => l.g >= 1, price: null },
      { key: 'point', label: 'Point', word: 'had a point', ok: (l) => l.pts >= 1, price: null },
      { key: 'sog3', label: '3+ SOG', word: 'had 3+ shots on goal', ok: (l) => l.shots >= 3, price: null },
    ],
  },
  nfl: {
    noun: 'player',
    log: nflLog,
    // His week's game is the saved 'season:week'.
    find: (log, date, pk) => (pk && log.get(String(pk))?.[0]) || null,
    // Bars come from the log file itself; `ok` reads the bar's stat key.
    // No archived TUDDY prices exist yet, so no bar is priced.
    bars: NFL_MARKETS.map(([key, label, word]) => ({ key, label, word, price: null, ok: null })),
    barOk: (log, key, line) => {
      const b = log.bars?.[key]
      return Array.isArray(b) ? Number(line?.[b[0]]) >= Number(b[1]) : null
    },
  },
}

// ── prices ─────────────────────────────────────────────────────────────────
/** American odds -> profit on a 1-unit stake that wins. */
export const winUnits = (american) => {
  const a = Number(american)
  if (!Number.isFinite(a) || a === 0) return null
  return a > 0 ? a / 100 : 100 / -a
}

/** { pid: { 'market|line': Map(date -> { price, got }) } } from odds_history.json. */
export function priceIndex(hist) {
  const out = {}
  Object.entries(hist?.players || {}).forEach(([pid, p]) => {
    Object.entries(p?.markets || {}).forEach(([key, b]) => {
      const m = new Map()
      ;(Array.isArray(b?.log) ? b.log : []).forEach((e) => {
        if (Array.isArray(e) && e.length >= 3) m.set(String(e[0]), { price: Number(e[1]), got: Number(e[2]) > 0 })
      })
      if (m.size) (out[pid] ||= {})[key] = m
    })
  })
  return out
}

// ── the grade ──────────────────────────────────────────────────────────────
/**
 * nights: lib/watchNights.savedNights(sport) -- [{ date, saves: [{ id, pk, name, team }] }]
 * prices: priceIndex(odds_history) or null
 * today:  the ET date; tonight and later are still to play and sit out.
 *
 * Returns { players: [...], list: {...}, nights, first, last } where each
 * player row is { id, name, team, saved, starts, void, bars: { key: { k, n } },
 * units: { key: { u, n } }, games: [{ date, line, played }] } and `list` is the
 * same shape summed over every saved night.
 */
export async function gradeSaved(sport, nights, { prices = null, today = '' } = {}) {
  const S = SPORT_WATCH[sport]
  if (!S) return null
  const past = nights.filter((n) => !today || n.date < today)
  const byId = new Map()
  past.forEach((n) => n.saves.forEach((s) => {
    if (!byId.has(s.id)) byId.set(s.id, { id: s.id, name: s.name, team: s.team, nights: [] })
    const row = byId.get(s.id)
    if (!row.name && s.name) row.name = s.name
    if (!row.team && s.team) row.team = s.team
    row.nights.push({ date: n.date, pk: s.pk, mk: s.mk || null })
  }))

  const blank = () => ({
    saved: 0, starts: 0, void: 0,
    bars: Object.fromEntries(S.bars.map((b) => [b.key, { k: 0, n: 0 }])),
    units: Object.fromEntries(S.bars.map((b) => [b.key, { u: 0, n: 0 }])),
  })
  const list = blank()
  const players = []

  await Promise.all([...byId.values()].map(async (row) => {
    const seasons = [...new Set(row.nights.map((n) => n.date.slice(0, 4)))]
    const log = await S.log(row.id, seasons)
    // A night seeded from the old record carries no name; the league's log does.
    const acc = { id: row.id, name: row.name || log.name || `#${row.id}`, team: row.team, ...blank(), games: [] }
    row.nights.forEach(({ date, pk, mk }) => {
      // His game that night: the saved game when we know it (a doubleheader
      // has two), else the first game that date. A sport can say otherwise
      // (TUDDY: the saved season:week).
      const games = log.get(date) || []
      const g = S.find ? S.find(log, date, pk) : ((pk && games.find((x) => x.pk === String(pk))) || games[0] || null)
      acc.saved += 1
      if (!g || !g.played) { acc.void += 1; acc.games.push({ date, played: false }); return }
      acc.starts += 1
      acc.games.push({ date, played: true, line: g.line })
      // Only the bars he is graded on: the markets he had a score in when he
      // was saved (TUDDY), else every bar (MOONSHOT's hitters all face all four).
      S.bars.forEach((b) => {
        if (Array.isArray(mk) && !mk.includes(b.key)) return
        const ok = S.barOk ? S.barOk(log, b.key, g.line) : b.ok(g.line)
        if (ok == null) return
        const hit = Boolean(ok)
        acc.bars[b.key].n += 1
        if (hit) acc.bars[b.key].k += 1
        const q = b.price && prices?.[row.id]?.[b.price]?.get(date)
        const w = q ? winUnits(q.price) : null
        if (w != null) {
          acc.units[b.key].n += 1
          // Settled on what he actually did; the archive's own flag agrees
          // unless the box score was corrected after it was written.
          acc.units[b.key].u += hit ? w : -1
        }
      })
    })
    players.push(acc)
  }))

  players.forEach((p) => {
    list.saved += p.saved; list.starts += p.starts; list.void += p.void
    S.bars.forEach((b) => {
      list.bars[b.key].k += p.bars[b.key].k; list.bars[b.key].n += p.bars[b.key].n
      list.units[b.key].u += p.units[b.key].u; list.units[b.key].n += p.units[b.key].n
    })
  })
  players.sort((a, b) => b.starts - a.starts || String(a.name).localeCompare(String(b.name)))
  return {
    players,
    list,
    nights: past.length,
    first: past[0]?.date || null,
    last: past[past.length - 1]?.date || null,
  }
}
