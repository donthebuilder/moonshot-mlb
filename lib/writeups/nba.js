// THE GAME WRITE-UP, BASKETBALL (2026-10-09, Donovan: "each sport, each game write-ups or quick calls for goals,
// touchdowns and triple double / double double"). BUCKETS' calls for the two game-log markets -- the CALLED
// player for each club on the DOUBLE-DOUBLE board and on the TRIPLE-DOUBLE board (lib/nba/model.js dd / td) --
// turned into the write-up's shape (lib/writeups/nhl.js is the template): why each is the look, what could go
// wrong, the game around them, each side's real status.
//
// PURE: ({ game, rows: { dd, td }, lineupKnown }) -> write-up JSON. `game` is a games[] entry of readNbaBoard,
// `rows` that game's rows on each market's board (lib/nba/boardRead.js shape). Every line is { t, src, v } with
// the printed values, for the checker (lib/facts/check.js). A missing field writes no line. POLICY: a BUCKETS
// score is a rank among the night's players, not a probability, and nothing here prints one; what prints is
// his COUNT of double-doubles / triple-doubles in his own game log (the rate is those two numbers divided) and the
// rank. Nothing is invented: a stat the row does not carry writes nothing.
import { STATUS_WORD } from '../callStatus'

const num = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))
const txt = (v) => (v == null ? '' : String(v).trim())
const line = (t, src, ...v) => ({ t, src, v: v.filter((x) => x != null) })

export const NBA_FOOTER = 'Called before tip. Not betting advice.'
export const MARKET_WORD = { dd: 'double-double', td: 'triple-double' }
const MARKETS = ['dd', 'td']
export const NBA_TEMPLATE = ['THE CALL', 'BUCKETS', 'THE GAME', 'WHY', 'WATCH OUT', 'BOTTOM LINE', 'TOP', 'BUCKET', 'DOUBLE-DOUBLE', 'TRIPLE-DOUBLE',
  'PG', 'SG', 'SF', 'PF', 'C', 'G', 'F', 'ET', 'AM', 'PM', 'NBA', 'Score', 'of']

const etTime = (iso) => {
  const t = Date.parse(iso || '')
  return Number.isFinite(t) ? `${new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })} ET` : ''
}

/** The reasons a called man is the look, in his own numbers (up to 4). */
export function nbaWhy(r, market) {
  const out = []
  const L = r.legs || {}, P = r.pct || {}, X = r.ctx || {}
  const n = num(X.logGames)
  const dd = num(X.ddGames), td = num(X.tdGames)
  if (market === 'dd' && dd != null && n != null && n > 0) out.push(line(`${dd} double-double${dd === 1 ? '' : 's'} in his last ${n} games, ${Math.round((100 * dd) / n)}%`, 'ctx.ddGames / logGames', dd, n, Math.round((100 * dd) / n)))
  if (market === 'td' && td != null && n != null && n > 0) {
    out.push(line(`${td} triple-double${td === 1 ? '' : 's'} in his last ${n} games, ${Math.round((100 * td) / n)}%`, 'ctx.tdGames / logGames', td, n, Math.round((100 * td) / n)))
  }
  const rec = market === 'dd' ? num(L.ddRecent) : null
  if (rec != null && num(P.ddRecent) != null && P.ddRecent >= 60) out.push(line(`${Math.round(rec * 10)} of his last 10 games were double-doubles`, 'legs.ddRecent', Math.round(rec * 10), 10))
  const min = num(L.minPg)
  if (min != null && num(P.minPg) != null && P.minPg >= 70) out.push(line(`${min.toFixed(1)} minutes a game`, 'legs.minPg', min.toFixed(1)))
  return out.slice(0, 4)
}

/** What could go wrong, from the row's own flags (up to 2). */
export function nbaWatch(r, { lineupKnown = true } = {}) {
  const out = []
  const X = r.ctx || {}
  const inj = txt(r.injury).toLowerCase()
  if (inj) out.push(line(`listed ${inj}`, 'injury'))
  if (lineupKnown === false) out.push(line('the lineup is not posted yet', 'lineupsKnown'))
  const w = num(X.prevWeight), gc = num(X.gpCur)
  if (w != null && w >= 0.5 && gc != null) out.push(line(`mostly last season's numbers: ${gc} game${gc === 1 ? '' : 's'} this season`, 'ctx.prevWeight / gpCur', gc))
  const n = num(X.logGames)
  if (n != null && n < 30) out.push(line(`his rate rests on ${n} games`, 'ctx.logGames', n))
  return out.slice(0, 2)
}

/**
 * One NBA game's write-up, or null when neither market has a CALLED man in it.
 * @param game   a games[] entry of readNbaBoard(date, market)
 * @param rows   { dd: [rows of this game on the dd board], td: [...] }
 */
export function buildNbaWriteup({ game, rows = {}, lineupKnown = true } = {}) {
  const g = game
  if (!g?.id) return null
  const teams = [g.away?.abbrev, g.home?.abbrev].filter(Boolean)
  const called = (m) => (rows[m] || []).filter((r) => r.status === 'called' && num(r.score) != null)
  const by = new Map()
  for (const m of MARKETS) {
    for (const r of called(m)) {
      const id = String(r.playerId)
      const p = by.get(id) || { r, markets: [] }
      p.markets.push({ market: m, word: MARKET_WORD[m], role: r.role === 'TOP' ? 'TOP' : 'BUCKET', score: String(Math.round(num(r.score))), rank: num(r.nightRank), of: num(r.nightOf), row: r })
      by.set(id, p)
    }
  }
  const best = (p) => Math.max(...p.markets.map((x) => num(x.score) ?? 0))
  const players = [...by.values()]
    .sort((a, b) => (b.markets.some((x) => x.role === 'TOP') ? 1 : 0) - (a.markets.some((x) => x.role === 'TOP') ? 1 : 0) || best(b) - best(a))
    .map((p) => {
      const r = p.r
      // round-robin across his markets, so a man called for both reads his triple-double case too, not only the first market's lines
      const lists = p.markets.map((m) => nbaWhy(m.row, m.market))
      const why = [], seen = new Set()
      for (let i = 0; i < 4; i += 1) for (const list of lists) if (list[i] && !seen.has(list[i].t)) { seen.add(list[i].t); why.push(list[i]) }
      return {
        player_id: String(r.playerId), name: txt(r.name), team: txt(r.team), opp: txt(r.opp), position: txt(r.pos),
        role: p.markets.some((x) => x.role === 'TOP') ? 'TOP' : 'BUCKET', status: 'called', status_word: STATUS_WORD.called,
        markets: p.markets.map(({ row, ...x }) => x), score: String(best(p)),
        why: why.slice(0, 4), watch: nbaWatch(r, { lineupKnown }), injury: txt(r.injury) || null,
        src: 'buckets board rows[] status called (dd / td)',
      }
    })
  if (!players.length) return null
  const noCall = teams.filter((t) => !players.some((p) => p.team === t)).map((t) => ({ team: t, status: 'off', status_word: STATUS_WORD.off }))
  const game_ = []
  if (g.venue) game_.push(line(txt(g.venue), 'game.venue'))
  const words = [...new Set(players.flatMap((p) => p.markets.map((m) => m.word)))]
  const bottom = [
    ...players.flatMap((p) => p.markets.map((m) => line(`${p.name} is ${STATUS_WORD.called} for the ${m.word}${m.role === 'TOP' ? ', the game\'s top call' : `, ${p.team}'s call`}.`, 'rows[].status / role'))),
    ...noCall.map((n) => line(`${n.team}: no call.`, 'rows[].status')),
  ]
  return {
    sport: 'nba', game_id: String(g.id), kickoff: g.start, away: g.away?.abbrev, home: g.home?.abbrev, away_name: g.away?.abbrev, home_name: g.home?.abbrev,
    when: etTime(g.start), locked: Boolean(g.locked), markets: words,
    header: line(`${players.map((p) => p.name).join(' + ')}: why ${players.length > 1 ? 'they\'re' : 'he\'s'} the ${words.join(' and ')} look${players.length > 1 ? 's' : ''}`, 'rows[].name'),
    game: game_, players, noCall, bottom, footer: NBA_FOOTER,
    built_from: { board: 'buckets board (readNbaBoard dd, td)' },
  }
}

/** A game's two boards -> the builder's input, from readNbaBoard() responses. */
export function nbaGameInput(boards, gameId) {
  const d = boards?.dd || boards?.td
  const game = (d?.games || []).find((x) => String(x.id) === String(gameId))
  if (!game) return null
  const mine = (m) => (boards[m]?.rows || []).filter((r) => String(r.gameId) === String(gameId))
  const lockedSet = new Set([...(boards.dd?.lockedGames || []), ...(boards.td?.lockedGames || [])].map(String))
  return { game: { ...game, locked: lockedSet.has(String(gameId)) }, rows: { dd: mine('dd'), td: mine('td') }, lineupKnown: (d.lineupsKnown || []).map(String).includes(String(gameId)) }
}
