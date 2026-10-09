// THE NBA ADAPTER for the shared player model (components/player/index.js has the interface). BUCKETS' words for
// the verdict (the word and the score are tonight's points board, locked rows once his game locks) and its
// one-row stat strip. Pure: the page hands in what it already holds. Nothing is invented: a man with no game
// tonight gets the short off-slate line, not a made-up word.

const num = (v) => { const x = Number(v); return v != null && v !== '' && Number.isFinite(x) ? x : null }

/** 'Record on him: 3 called, 1 cleared.' from his locked board rows (data.calls); null with no called row. */
export function nbaRecordLine(calls) {
  const called = (calls || []).filter((r) => r.status === 'called' && !r.void_reason)
  if (!called.length) return null
  const done = called.filter((r) => r.actual != null)
  const hit = done.filter((r) => r.hit).length
  return `Record on him: ${called.length} called${done.length ? `, ${hit} cleared` : ''}.`
}

/** The props for <VerdictBlock sport="nba" />. `whyLine` is the board row's own sentence (or the off-board reason). */
export function nbaVerdict({ board, row, whyLine, calls }) {
  if (!board) return { offSlate: 'Reading tonight’s board…' }
  if (!row) {
    return {
      offSlate: 'No game on tonight’s points board.',
      offSlateHelp: 'The board ranks the players in tonight’s games. With no game there is no BUCKETS word and no score for him until his club plays.',
      recordLine: nbaRecordLine(calls),
    }
  }
  const chips = [{ t: row.locked ? 'LOCKED' : 'PREVIEW' }]
  if (num(row.nightRank) != null && num(row.nightOf) != null) chips.push({ t: `#${row.nightRank} of ${row.nightOf} tonight` })
  return {
    status: row.status,
    score: row.score ?? null,
    scoreLabel: 'PTS',
    why: [whyLine].filter(Boolean),
    watch: row.injury ? `Injury report: ${row.injury}` : null,
    signals: chips,
    recordLine: nbaRecordLine(calls),
    help: 'The word and the score are tonight’s points board. The score is a 0-100 rank among tonight’s players, not a probability.',
  }
}

/** The one-row stat strip: per-game minutes and shooting from his season line, then next game's projected points when one exists. */
export function nbaStatRow({ line, xpts, seasonWord, stale }) {
  if (!line) return []
  const w = `${seasonWord || 'this season'}${stale ? ' (last season)' : ''}`
  const f1 = (v) => (num(v) == null ? null : Number(v).toFixed(1))
  const tp = num(line.tpaTot) ? ((100 * Number(line.tpTot)) / Number(line.tpaTot)).toFixed(1) : null
  const items = [
    { id: 'min', label: 'MPG', text: f1(line.min), title: `Minutes a game, ${w}.` },
    { id: 'fga', label: 'FGA', text: f1(line.fga), title: `Field-goal attempts a game, ${w}.` },
    { id: 'tpm', label: '3PM', text: f1(line.tpm), title: `Threes made a game, ${w}.` },
    { id: 'tp', label: '3P%', text: tp, title: `Three-point percentage, ${w}.` },
    { id: 'fta', label: 'FTA', text: f1(line.fta), title: `Free-throw attempts a game, ${w}.` },
    { id: 'xpts', label: 'xPTS', text: f1(xpts?.xpts), title: 'Projected points next game: minutes x points a minute x opponent. A measured projection, not a probability.' },
  ]
  return items.filter((s) => s.text != null)
}
