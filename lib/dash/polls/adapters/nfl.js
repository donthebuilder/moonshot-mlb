// TUDDY's poll adapter (X overhaul stage 3 piece 2). A player is nameable when he is on this ET
// day's slate, his game has not kicked off, and he is not OUT / inactive / IR / suspended
// (lib/nfl/tweetFeed.yetToPlay applies nflNamingProblem). The bars are the bot's own (nfl_logs.json
// `bars`: the market's standard line), the counts are his real games.
import { fetchNfl, nflSlatePaths, nflSlateLooksReal, nflLogPaths } from '../../../nfl/dataSource'
import { yetToPlay } from '../../../nfl/tweetFeed'
import { kickoffFor } from '../../../nfl/kickoff'
import { seriesFor, streakBoard, streakMarkets } from '../../../nfl/streaks'
import { namesFromPostPayload, num, rankFromCounts, storedPayload, txt } from './shared'

const CHECKED = 12
// the market a position is asked about, and how the bar reads in words
const MARKET_FOR = { WR: 'REC_YDS', TE: 'REC_YDS', RB: 'RUSH_YDS', QB: 'PASS_YDS' }
const WORDS = { REC_YDS: 'receiving yards', RUSH_YDS: 'rushing yards', PASS_YDS: 'passing yards' }

/** Pure: the week file -> { players, pending, raw } for this ET day, TD score first. */
export function nflPlayersFrom({ data, day, now = Date.now() }) {
  const raw = new Map()
  const players = yetToPlay(data, { now, day }).map((p) => {
    const id = txt(p.player_id)
    raw.set(id, p)
    return { id, name: txt(p.name), team: txt(p.team), opp: txt(p.opp) || null, startMs: kickoffFor(data?.games, p), rank: null, score: num(p?.scores?.TD), pos: txt(p.position) }
  }).filter((p) => p.id && p.name)
  return { players: players.sort((a, b) => (b.score ?? 0) - (a.score ?? 0)), pending: [], raw }
}

/** Pure: his real games against the market's standard bar (nfl_logs.json bars). */
export function nflBarsFrom({ logs, players }) {
  const out = []
  for (const p of players) {
    const mk = MARKET_FOR[p.pos]
    const spec = mk && logs?.bars?.[mk]
    if (!spec || !WORDS[mk]) continue
    const [field, bar] = spec
    const threshold = Number(bar)
    if (!Number.isInteger(threshold) || threshold < 1) continue
    const series = seriesFor(logs, p.id, field, 10)
    if (series.length < 5) continue
    out.push({ id: p.id, label: `${threshold}+ ${WORDS[mk]}`, threshold, cleared: series.filter((g) => g.v >= threshold).length, of: series.length })
  }
  return out
}

/** Pure: a touchdown in each of his last games (the TD market's own bar), floor 3. */
export function nflStreaksFrom({ logs, players, raw }) {
  const td = streakMarkets(logs).find((m) => m.key === 'TD')
  if (!td) return []
  const rows = players.map((p) => raw.get(p.id)).filter(Boolean)
  return streakBoard(logs, rows, td.field, td.bar, 'over', 30, 'TD')
    .filter((r) => r.streak >= 3)
    .map((r) => ({ id: txt(r.player.player_id), what: 'a touchdown', whatKey: 'td', n: r.streak, min: 3 }))
}

export function createNflPollAdapter({ day, now = Date.now(), db = null, data: given = null } = {}) {   // `data`: a week file the caller already read (the fact engine)
  let _slate = null, _logs, _data = null
  const slate = async () => {
    if (_slate) return _slate
    const data = given || await fetchNfl(nflSlatePaths(), nflSlateLooksReal).catch(() => null)
    if (!data) return (_slate = { active: false, why: 'no week file', players: [], pending: [] })
    _data = data
    const s = nflPlayersFrom({ data, day, now })
    return (_slate = { active: s.players.length > 0, why: s.players.length ? undefined : 'no NFL game left today', ...s })
  }
  const logs = async () => (_logs !== undefined ? _logs : (_logs = await fetchNfl(nflLogPaths()).catch(() => null)))
  return {
    sport: 'nfl',
    slate,
    // the week file and the game logs behind the slate (the fact engine's birthdays, vs-team and milestones read them)
    data: async () => { await slate(); return _data },
    logs,
    bars: async () => { const s = await slate(); const l = await logs(); return l ? nflBarsFrom({ logs: l, players: s.players.slice(0, CHECKED) }) : [] },
    streaks: async () => { const s = await slate(); const l = await logs(); return l ? nflStreaksFrom({ logs: l, players: s.players.slice(0, 40), raw: s.raw }) : [] },
    called: async () => namesFromPostPayload(await storedPayload(db, day, 'nfl_board')),
    // STORED results only: nfl_td_feed rows for the poll's day (yards parsed from the play text); longest wins
    async results(guess) {
      if (!db || !guess?.players?.length) return { known: false, ranking: [] }
      const { data, error } = await db.from('nfl_td_feed').select('gsis_id, yards').eq('day', guess.day).in('gsis_id', guess.players.map((p) => String(p.id)))
      if (error) { console.error(`[polls] nfl results: ${error.message}`); return { known: false, ranking: [] } }
      const best = new Map()
      for (const r of data || []) { const y = num(r.yards); if (y != null && y > 0) best.set(String(r.gsis_id), Math.max(best.get(String(r.gsis_id)) || 0, y)) }
      const ranking = rankFromCounts(guess.players, best)
      return { known: ranking.length > 0, ranking }
    },
  }
}
