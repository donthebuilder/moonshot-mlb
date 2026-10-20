// THE NBA ADAPTER for the shared player model (components/player/index.js has the interface). BUCKETS' words for
// the verdict (the word and the score are tonight's points board, locked rows once his game locks) and its
// one-row stat strip. Pure: the page hands in what it already holds. Nothing is invented: a man with no game
// tonight gets the short off-slate line, not a made-up word.

const num = (v) => { const x = Number(v); return v != null && v !== '' && Number.isFinite(x) ? x : null }

const gradedRows = (calls) => (calls || []).filter((r) => r.actual != null && r.hit != null && !r.void_reason)
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`

/** His LOCKED record, graded rows only (a row with a result and no void), in games: how many games the locked record holds on him, how many of them he was
 *  CALLED in (any BUCKETS market, the 0c rule), and in how many of those a called market cleared. null with no graded row. */
export function nbaRecord(calls) {
  const rows = gradedRows(calls)
  if (!rows.length) return null
  const games = new Set(rows.map((r) => r.game_date))
  const calledRows = rows.filter((r) => r.status === 'called')
  const calledGames = new Set(calledRows.map((r) => r.game_date))
  const clearedGames = new Set(calledRows.filter((r) => r.hit).map((r) => r.game_date))
  return { games: games.size, called: calledGames.size, cleared: clearedGames.size }
}

/** 'Record on him: 12 games, 3 called, 2 cleared.' (MOONSHOT's mlbRecordLine, in games) from the graded locked rows (data.calls); null with none. */
export function nbaRecordLine(calls) {
  const r = nbaRecord(calls)
  if (!r) return null
  return `Record on him: ${plural(r.games, 'game')}, ${r.called} called${r.called ? `, ${r.cleared} cleared` : ''}.`
}

/** 'Last week: 2 of 3 cleared' -- his called, graded rows in the 7 days to `today` (YYYY-MM-DD); null when he had none. */
export function nbaLastLine(calls, today) {
  const t = Date.parse(`${today}T12:00:00Z`)
  if (!Number.isFinite(t)) return null
  const wk = gradedRows(calls).filter((r) => r.status === 'called' && Date.parse(`${r.game_date}T12:00:00Z`) > t - 7 * 864e5 && Date.parse(`${r.game_date}T12:00:00Z`) <= t)
  if (!wk.length) return null
  return `Last week: ${wk.filter((r) => r.hit).length} of ${wk.length} cleared`
}

// Each leg of the points board that, in the top fifth of tonight's players, is a fact worth a chip. The percentile is the board's own (row.pct).
const TOP_FIFTH = 80
const SIGNAL_LEGS = [
  ['ptsPg', 'Top-fifth scorer', 'Points a game in the top fifth of tonight’s players.'],
  ['minPg', 'Big minutes', 'Minutes a game in the top fifth of tonight’s players.'],
  ['fgaPg', 'Volume shooter', 'Shots a game in the top fifth of tonight’s players.'],
  ['ftaPg', 'Draws fouls', 'Free-throw attempts a game in the top fifth of tonight’s players.'],
  ['oppPts', 'Soft defense', 'His opponent allows points at a rate in the top fifth of tonight’s defenses.'],
]

/** The flags the board asserts about him, real ones only: the row's lock state, his place tonight, a leg in the top fifth, starter, the injury report. */
export function nbaSignals(row) {
  if (!row) return []
  const chips = [{ t: row.locked ? 'LOCKED' : 'LOCKS AT TIP', explain: row.locked ? 'His game has tipped: this is the last write before tip, the locked record.' : 'His game has not tipped. The board can still move until it locks before tip.' }]
  if (num(row.nightRank) != null && num(row.nightOf) != null) chips.push({ t: `#${row.nightRank} of ${row.nightOf} tonight` })
  if (row.starter === true) chips.push({ t: 'Starter' })
  for (const [leg, t, explain] of SIGNAL_LEGS) if (num(row.pct?.[leg]) != null && row.pct[leg] >= TOP_FIFTH) chips.push({ t, explain })
  if (row.injury) chips.push({ t: `Report: ${row.injury}`, warn: true })
  return chips
}

/** 'BUCKETS' pick' word, MOONSHOT's "bot's pick: HR" line: the market he is CALLED in on the board shown, else the pass. */
export function nbaPickWord(row, marketLabel = 'PTS 25+') {
  return row && row.status === 'called' ? marketLabel : 'no call tonight'
}

/** The props for <VerdictBlock sport="nba" />. `whyLine` is the board row's own sentence (or the off-board reason). */
export function nbaVerdict({ board, row, whyLine, calls, today = null }) {
  if (!board) return { offSlate: 'Reading tonight’s board…' }
  if (!row) {
    return {
      offSlate: 'No game on tonight’s points board.',
      offSlateHelp: 'The board ranks the players in tonight’s games. With no game there is no BUCKETS word and no score for him until his club plays.',
      recordLine: nbaRecordLine(calls),
      lastLine: today ? nbaLastLine(calls, today) : null,
    }
  }
  return {
    status: row.status,
    score: row.score ?? null,
    scoreLabel: 'PTS',
    why: [whyLine].filter(Boolean),
    watch: row.injury ? `Injury report: ${row.injury}` : null,
    signals: nbaSignals(row),
    recordLine: nbaRecordLine(calls),
    lastLine: today ? nbaLastLine(calls, today) : null,
    help: 'The word and the score are tonight’s points board. The score is a 0-100 rank among tonight’s players, not a probability.',
  }
}

/** The one-row stat strip: per-game minutes and shooting from his season line, then next game's projected points when one exists. */
export function nbaStatRow({ line, xpts, seasonWord, stale }) {
  if (!line) return []
  const w = `${seasonWord || 'this season'}${stale ? ' (last season)' : ''}`
  const f1 = (v) => (num(v) == null ? null : Number(v).toFixed(1))
  const items = [
    { id: 'pts', label: 'PTS', text: f1(line.pts), title: `Points a game, ${w}.` },
    { id: 'reb', label: 'REB', text: f1(line.reb), title: `Rebounds a game, ${w}.` },
    { id: 'ast', label: 'AST', text: f1(line.ast), title: `Assists a game, ${w}.` },
    { id: 'min', label: 'MPG', text: f1(line.min), title: `Minutes a game, ${w}.` },
    { id: 'xpts', label: 'xPTS', text: f1(xpts?.xpts), title: 'Projected points next game: minutes x points a minute x opponent. A measured projection, not a probability.' },
    { id: 'tpm', label: '3PM', text: f1(line.tpm), title: `Threes made a game, ${w}.` },
  ]
  // five boxes, as MOONSHOT's row: a number he has no value for drops out and the next one fills in (never a dash)
  return items.filter((s) => s.text != null).slice(0, 5)
}
