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

export const SPORT_WATCH = {
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
    row.nights.push({ date: n.date, pk: s.pk })
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
    row.nights.forEach(({ date, pk }) => {
      const games = log.get(date) || []
      // His game that night: the saved game when we know it (a doubleheader
      // has two), else the first game that date.
      const g = (pk && games.find((x) => x.pk === String(pk))) || games[0] || null
      acc.saved += 1
      if (!g || !g.played) { acc.void += 1; acc.games.push({ date, played: false }); return }
      acc.starts += 1
      acc.games.push({ date, played: true, line: g.line })
      S.bars.forEach((b) => {
        const hit = Boolean(b.ok(g.line))
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
