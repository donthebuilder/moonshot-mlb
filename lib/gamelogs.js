// Per-player game logs from the MLB StatsAPI → PropFinder-style threshold
// rates. Same live-context lane as situational.js: fetched on demand when a
// modal opens, cached for the session, display-only (nothing here scores).
//
// Each market is a bar a bettor actually plays: 1+ hit, 2+ TB, 1+ HR,
// 1+ run, 1+ RBI. For each we compute cleared/games over L5 / L10 / L20 and
// the full season, plus the CURRENT STREAK — consecutive most-recent games
// clearing the bar, negative meaning consecutive misses.

const cache = new Map()
const season = () => { const d = new Date(); return d.getMonth() < 2 ? d.getFullYear() - 1 : d.getFullYear() }

export const MARKETS = [
  { key: 'hit', label: '1+ Hit',  test: (g) => g.h >= 1 },
  { key: 'tb2', label: '2+ TB',   test: (g) => g.tb >= 2 },
  { key: 'hr',  label: '1+ HR',   test: (g) => g.hr >= 1 },
  // HRR = hits + runs + RBI combined, the sportsbook "H+R+RBI" line — and the
  // same lane as the bot's HRR pick category, so the pick and the prop rhyme.
  { key: 'hrr', label: '1+ HRR',  test: (g) => (g.h + g.r + g.rbi) >= 1 },
  { key: 'run', label: '1+ Run',  test: (g) => g.r >= 1 },
  { key: 'rbi', label: '1+ RBI',  test: (g) => g.rbi >= 1 },
  // Walks (2026-08-12, Donovan: add batter walks to the props grid).
  // baseOnBalls rides the same gameLog payload as everything else here —
  // no new fetch, same as K props below.
  { key: 'bb',  label: '1+ BB',   test: (g) => g.bb >= 1 },
  // K props (2026-08-08): the batter-strikeout lane, added to help TARGET
  // PITCHERS — a lineup full of high-K1 bats is a strikeout-prop night for
  // the arm, and a low-K bat is the under. strikeOuts rides the same
  // gameLog payload (no fields filter on that fetch — verified present).
  { key: 'k1',  label: '1+ K',    test: (g) => g.k >= 1 },
]

// Prior season, aggregated per market — the "2025" tile PF shows. One extra
// fetch, cached with the rest.
export async function lastSeasonRates(pid) {
  const key = 'ls:' + pid
  if (cache.has(key)) return cache.get(key)
  const p = fetch(`https://statsapi.mlb.com/api/v1/people/${pid}/stats?stats=gameLog&group=hitting&season=${season() - 1}`)
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => {
      const gs = (j?.stats?.[0]?.splits || []).map((s2) => {
        const st = s2?.stat || {}
        return { h: +st.hits || 0, tb: +st.totalBases || 0, hr: +st.homeRuns || 0, r: +st.runs || 0, rbi: +st.rbi || 0, ab: +st.atBats || 0, k: +st.strikeOuts || 0, bb: +st.baseOnBalls || 0 }
      }).filter((g) => g.ab > 0 || g.bb > 0)
      if (!gs.length) return null
      const out = {}
      MARKETS.forEach((m) => { out[m.key] = { ok: gs.filter(m.test).length, n: gs.length } })
      // Raw games ride along so the grid can recompute last season against
      // ANY line (2+ TB, 3+ HRR…), not just the 1+ defaults baked in here.
      out._games = gs
      return out
    })
    .catch(() => null)
  cache.set(key, p)
  return p
}

export async function thresholdRates(pid) {
  if (!pid) return null
  if (cache.has(pid)) return cache.get(pid)
  const p = fetch(`https://statsapi.mlb.com/api/v1/people/${pid}/stats?stats=gameLog&group=hitting&season=${season()}`)
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => {
      const splits = j?.stats?.[0]?.splits || []
      // Most recent LAST in the API; normalise to most-recent-first, and
      // drop games with 0 AB and 0 BB (pinch-run cameos aren't chances).
      // FIXED 2026-08-12: the comment always said "0 AB and 0 BB" but the
      // filter below only ever checked AB, so a rare all-walks game (0 AB,
      // 1+ BB — exactly what a 1+ BB prop bettor cares about) was silently
      // dropped. Now the filter matches what it always claimed to do, which
      // matters more now that BB is a real market below.
      const games = splits.map((s) => {
        const st = s?.stat || {}
        return {
          h: Number(st.hits) || 0, tb: Number(st.totalBases) || 0,
          k: Number(st.strikeOuts) || 0,
          hr: Number(st.homeRuns) || 0, r: Number(st.runs) || 0,
          rbi: Number(st.rbi) || 0, ab: Number(st.atBats) || 0,
          bb: Number(st.baseOnBalls) || 0, pa: Number(st.plateAppearances) || 0,
          date: String(s?.date || '').slice(5),
          // FULL DATE RIDES ALONG (2026-08-10, for lib/funFacts.js). `date` is
          // sliced to MM-DD for the timeline labels, which is fine for display
          // and useless for anything that needs a weekday or a month boundary:
          // a MM-DD string has no year, so it can't be parsed into a real date.
          // `iso` is the split's own `date` field untouched (YYYY-MM-DD) — the
          // same value, one slice earlier. Nothing else changes.
          iso: String(s?.date || ''),
          opp: s?.opponent?.abbreviation || s?.opponent?.name || '',
          oppId: s?.opponent?.id || null,
          gamePk: s?.game?.gamePk || null,
          home: s?.isHome === true,
        }
      }).filter((g) => g.ab > 0 || g.bb > 0).reverse()
      if (!games.length) return null
      const windows = { L5: 5, L10: 10, L20: 20, Szn: games.length }
      const out = {}
      MARKETS.forEach((m) => {
        const row = { streak: 0 }
        Object.entries(windows).forEach(([w, size]) => {
          const win = games.slice(0, size)
          row[w] = { ok: win.filter(m.test).length, n: win.length }
        })
        // streak: + consecutive clears from most recent, − consecutive misses
        const first = m.test(games[0])
        let k = 0
        for (const g of games) { if (m.test(g) === first) k++; else break }
        row.streak = first ? k : -k
        out[m.key] = row
      })
      return { markets: out, games: games.length, log: games.slice(0, 20), logAll: games }
    })
    .catch(() => null)
  cache.set(pid, p)
  return p
}

// League-wide staff quality, one cached fetch for the whole session — feeds
// the timeline tint in the prop grid. Verified live 2026-08-05: /teams/stats
// returns all 30 staffs with ops/homeRunsPer9 keyed by team.id, and the
// gameLog opponent object carries that same id. Softness = where a staff's
// OPS-against sits in the league range, 0 = stingiest, 1 = most generous.
export async function staffQuality() {
  const key = 'staffq'
  if (cache.has(key)) return cache.get(key)
  const p = fetch(`https://statsapi.mlb.com/api/v1/teams/stats?season=${season()}&group=pitching&stats=season&sportIds=1`)
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => {
      const splits = j?.stats?.[0]?.splits || []
      if (!splits.length) return null
      const rows = splits.map((s) => ({
        id: s?.team?.id,
        name: s?.team?.name || '',
        ops: parseFloat(s?.stat?.ops) || null,
        hr9: parseFloat(s?.stat?.homeRunsPer9) || null,
      })).filter((t) => t.id && t.ops != null)
      if (!rows.length) return null
      const sorted = [...rows].sort((a, b) => a.ops - b.ops) // stingiest first
      const out = {}
      sorted.forEach((t, i) => {
        out[t.id] = {
          ops: t.ops, hr9: t.hr9, name: t.name,
          rank: i + 1, // 1 = toughest staff to hit
          soft: sorted.length > 1 ? i / (sorted.length - 1) : 0.5,
        }
      })
      return out
    })
    .catch(() => null)
  cache.set(key, p)
  return p
}

// Which ARM started against him, per game — powers the L/R filter in the
// props grid. Verified live 2026-08-06: schedule accepts a comma list of
// gamePks with hydrate=probablePitcher (opposing side's starter by team id),
// and /people batches pitchHand. Fetched lazily the first time the filter is
// touched, cached per player. Starter's arm, not per-PA — that's the bulk of
// his plate appearances, and the caption says so.
export async function starterHands(pid) {
  const key = 'sh:' + pid
  if (cache.has(key)) return cache.get(key)
  const p = (async () => {
    const data = await thresholdRates(pid)
    const games = (data?.logAll || []).filter((g) => g.gamePk && g.oppId)
    if (!games.length) return null
    const oppByPk = {}
    games.forEach((g) => { oppByPk[g.gamePk] = g.oppId })
    const pks = [...new Set(games.map((g) => g.gamePk))]
    const pitcherByPk = {}
    for (let i = 0; i < pks.length; i += 40) {
      const chunk = pks.slice(i, i + 40).join(',')
      const j = await fetch(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&gamePks=${chunk}&hydrate=probablePitcher&fields=dates,games,gamePk,teams,home,away,probablePitcher,id,team`)
        .then((r) => (r.ok ? r.json() : null)).catch(() => null)
      ;(j?.dates || []).forEach((d) => (d.games || []).forEach((gm) => {
        const opp = oppByPk[gm.gamePk]
        const side = gm?.teams?.away?.team?.id === opp ? gm.teams.away : gm?.teams?.home?.team?.id === opp ? gm.teams.home : null
        if (side?.probablePitcher?.id) pitcherByPk[gm.gamePk] = side.probablePitcher.id
      }))
    }
    const ids = [...new Set(Object.values(pitcherByPk))]
    if (!ids.length) return null
    const hand = {}
    for (let i = 0; i < ids.length; i += 60) {
      const j = await fetch(`https://statsapi.mlb.com/api/v1/people?personIds=${ids.slice(i, i + 60).join(',')}&fields=people,id,pitchHand,code`)
        .then((r) => (r.ok ? r.json() : null)).catch(() => null)
      ;(j?.people || []).forEach((x) => { if (x?.id && x?.pitchHand?.code) hand[x.id] = x.pitchHand.code })
    }
    const out = {}
    Object.entries(pitcherByPk).forEach(([pk, pid2]) => { if (hand[pid2]) out[pk] = hand[pid2] })
    return Object.keys(out).length ? out : null
  })().catch(() => null)
  cache.set(key, p)
  return p
}

// Team-id → abbreviation, one tiny cached fetch. The gameLog opponent object
// has no abbreviation field in the wild (it fell back to full names, which the
// timeline truncated into garbage like "Athle Athle") — this is the fix.
// Verified live 2026-08-06: 30 teams, id + abbreviation.
export async function teamAbbrs() {
  const key = 'abbrs'
  if (cache.has(key)) return cache.get(key)
  const p = fetch('https://statsapi.mlb.com/api/v1/teams?sportId=1&fields=teams,id,abbreviation')
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => {
      const out = {}
      ;(j?.teams || []).forEach((t) => { if (t.id && t.abbreviation) out[t.id] = t.abbreviation })
      return Object.keys(out).length ? out : null
    })
    .catch(() => null)
  cache.set(key, p)
  return p
}

// American odds → break-even probability, for the paste-a-line verdict.
export function impliedPct(odds) {
  const o = Number(odds)
  if (!Number.isFinite(o) || o === 0) return null
  return o >= 100 ? 100 / (o + 100) * 100 : o <= -100 ? (-o) / (-o + 100) * 100 : null
}
export function fairOdds(rate) {
  if (!(rate > 0) || rate >= 1) return '—'
  return rate >= 0.5 ? `-${Math.round((100 * rate) / (1 - rate))}` : `+${Math.round((100 * (1 - rate)) / rate)}`
}
