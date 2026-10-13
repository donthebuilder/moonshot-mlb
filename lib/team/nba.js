// 🏀 THE NBA (BUCKETS) TEAM PAGE, AS DATA (2026-10-10). Pure: payloads in, a view out (the contract is lib/team/contract.js).
//
//   payload  /api/buckets/team: the roster with season lines and injuries, the standing, the schedule
//   deep     /api/buckets/teamdeep: ranks of 30, the read season's results (splits' source), next-game context, our graded calls
//   board    /api/buckets/board: tonight's board (the status words are the model's own, passed through, never re-derived)
// Gated like the rest of BUCKETS: the routes answer 404 until BUCKETS_PUBLIC=on, so this view is only ever built behind that switch.
//
// SPLITS. ESPN publishes no team-splits feed for the NBA (probed: team statistics carry season totals only), so the splits are the
// standings' own record strings (home, road, last ten) plus OUR game results of the read season, each table naming which. Every row
// carries its games (G), and win % carries a Wilson 95% range. Rest and back-to-backs are NUMBERS WITH THEIR n, never a lean.
// Season rule (lib/nba/season.js): preseason / offseason read the last completed season, labelled "LAST SEASON".
import { nbaTeam, nbaLogo, NBA_TEAMS } from '../nba/teams'
import { sectionsOf } from './registry'
import { callsSummary, rankWord, resultWord, windowLabel, emptySection, cardsSection } from './contract'
import { STAT_COLS, lineRow } from './statLines'
import { wilson } from '../interval'
import { STATUS_WORD } from '../callStatus'

const SPORT = 'nba'
export const NBA_CLUBS = NBA_TEAMS.map((t) => t[0])
const n = (v) => (v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null)
const f = (v, dp = 1) => (n(v) == null ? '—' : Number(v).toFixed(dp))
const ord = (k) => rankWord({ rank: k })
const meta = (id) => sectionsOf(SPORT).find((s) => s.id === id)
const MARKET_WORD = { pts: 'Points', reb: 'Rebounds', ast: 'Assists', '3pm': 'Threes', pra: 'Pts+Reb+Ast', first: 'First basket', dd: 'Double-double', td: 'Triple-double' }

// ── header ──────────────────────────────────────────────────────────────────
const gameLine = (g) => g && ({ gameId: g.id, date: String(g.start || '').slice(0, 10), startUtc: g.start, home: g.home, opp: g.opp, venue: null, result: g.result, us: g.us, them: g.them, outcome: g.seasonType === 1 ? 'PRE' : null, state: g.state })
export function nbaHeader(code, ctx) {
  const { payload, deep } = ctx
  const t = nbaTeam(code)
  const st = deep?.standing || payload?.standing || null
  const sched = deep?.schedule || payload?.schedule || []
  const finals = sched.filter((g) => g.state === 'final')
  const live = sched.find((g) => g.state === 'live') || null
  const next = sched.find((g) => g.state === 'pre') || null
  const season = deep?.season || (payload ? { label: payload.seasonLabel, stale: payload.stale } : null)
  const rec = st ? `${st.w}-${st.l}` : null
  const conf = t ? (t.conf === 'E' ? 'East' : 'West') : null
  const placed = st?.seed != null ? `${ord(st.seed)} seed in the ${conf}` : null
  return {
    sport: SPORT, code: t?.abbrev || String(code || '').toUpperCase(), name: t ? `${t.place} ${t.nick}` : null, nickname: t?.nick || null, known: Boolean(t), logo: t ? nbaLogo(t.abbrev) : null,
    eyebrow: t ? `BUCKETS · TEAM · ${t.conf === 'E' ? 'EASTERN' : 'WESTERN'} · ${String(t.div).toUpperCase()}` : 'BUCKETS · TEAM',
    seasonLabel: season?.label || null, stale: Boolean(season?.stale), record: rec, points: null, diff: null, standing: placed,
    chips: [rec && { value: rec, label: season?.stale ? `${season.label} FINAL` : 'RECORD' }, st?.diff != null && { value: String(st.diff), label: 'DIFF / G' }].filter(Boolean),
    summary: st ? [rec + (season?.stale ? ` (${season.label})` : ''), placed, st.streak && st.streak !== '-' && `Streak ${st.streak}`, st.home && `Home ${st.home}`, st.road && `Road ${st.road}`, st.last10 && `Last 10 ${st.last10}`, st.ppg != null && `${f(st.ppg)}–${f(st.oppg)} a game`].filter(Boolean) : null,
    splits: null, streak: st?.streak || null,
    live: gameLine(live), next: gameLine(next), last: gameLine(finals[finals.length - 1] || null), last5: finals.slice(-5).map(gameLine),
  }
}

// ── PLAYERS ─────────────────────────────────────────────────────────────────
const PLAYER_COLS = [
  { key: 'name', label: 'Player', w: 156, heat: false, sticky: true, bold: true, group: 'Player', link: 'player', linkKey: 'id' },
  { key: 'pos', label: 'Pos', w: 40, heat: false, mono: true, group: 'Player' },
  { key: 'jersey', label: '#', w: 36, heat: false, mono: true, group: 'Player' },
  { key: 'age', label: 'Age', w: 40, heat: false, mono: true, group: 'Player' },
  { key: 'inj', label: 'Avail.', w: 90, heat: false, group: 'Player', title: 'The injury report designation ESPN lists for him, when there is one.' },
  { key: 'gp', label: 'GP', w: 38, heat: false, group: 'Season' }, { key: 'min', label: 'MIN', w: 46, dp: 1, group: 'Season' },
  { key: 'pts', label: 'PTS', w: 46, dp: 1, primary: true, group: 'Season' }, { key: 'reb', label: 'REB', w: 46, dp: 1, group: 'Season' }, { key: 'ast', label: 'AST', w: 46, dp: 1, group: 'Season' }, { key: 'tpm', label: '3PM', w: 46, dp: 1, group: 'Season' },
]
function playersSection(code, ctx) {
  const m = meta('roster')
  const { payload, board } = ctx
  if (!payload?.players?.length) return emptySection('roster', m.label, 'NO ROSTER YET', `Needs ${m.needs}.`)
  const status = new Map((board?.rows || []).filter((r) => r.team === code).map((r) => [String(r.playerId), r.status]))
  const rows = payload.players.map((p) => ({ ...p, _key: p.id, inj: (p.injuries || []).filter(Boolean).join(', '), status: status.get(String(p.id)) || null }))
  const withLine = rows.filter((r) => r.onStats).length
  const called = rows.filter((r) => r.status === 'called').length; const onBoard = rows.filter((r) => r.status === 'board').length
  return {
    id: 'roster', label: m.label, n: rows.length, state: 'ok', window: windowLabel({ seasonLabel: payload.seasonLabel, stale: payload.stale, n: withLine, unit: 'players with a line' }),
    status: board ? `${called} ${STATUS_WORD.called} · ${onBoard} ${STATUS_WORD.board}` : null,
    blocks: [
      { type: 'slot', slot: 'injuries', props: { clubs: [code] } },
      { type: 'table', id: 'players', title: `Players · ${rows.length}`, caption: 'The roster with each player’s season line, his availability and tonight’s board word. Each row opens the player.', rows, columns: PLAYER_COLS, initialSort: { key: 'pts', dir: 'desc' }, maxRows: 10, heat: 'standouts', rowOpen: 'player', playerKey: 'id', statusKey: 'status' },
      { type: 'note', text: `A blank line is a player with no games for this club in ${payload.seasonLabel}. ${board ? '' : 'Tonight’s board word is not loaded yet, so the status column is empty. '}A position is the one ESPN lists; no depth role is published, so none is shown.` },
    ],
  }
}

// ── SCHEDULE ────────────────────────────────────────────────────────────────
const GAME_COLS = [
  { key: 't', label: 'Date', w: 92, heat: false, numeric: false, sticky: true, plain: true, kind: 'day', group: 'Game' },
  { key: 'oppText', label: 'Opponent', w: 100, heat: false, numeric: false, group: 'Game', link: 'team', linkKey: 'opp' },
  { key: 'resultTxt', label: 'Result', w: 100, heat: false, numeric: false, kind: 'result', group: 'Result' },
  { key: 'type', label: 'Type', w: 84, heat: false, numeric: false, group: 'Result' },
]
const TYPE = { 1: 'Preseason', 2: '', 3: 'Playoffs', 5: 'Play-in' }
function scheduleSection(code, ctx) {
  const m = meta('schedule')
  const sched = ctx.deep?.schedule || ctx.payload?.schedule || []
  if (!sched.length) return emptySection('schedule', m.label, 'NO SCHEDULE', `Needs ${m.needs}.`)
  const rows = sched.map((g) => ({ _key: g.id, gameId: g.id, t: Date.parse(g.start), date: String(g.start || '').slice(0, 10), startUtc: g.start, opp: g.opp, oppText: `${g.home ? 'vs' : '@'} ${g.opp}`, pre: g.seasonType === 1, type: TYPE[g.seasonType] || '',
    resultTxt: g.state === 'final' && g.result ? `${g.result} ${g.us}–${g.them}` : g.state === 'live' ? `LIVE ${g.us ?? 0}–${g.them ?? 0}` : null, done: g.state === 'final' }))
  const done = rows.filter((r) => r.done).sort((a, b) => b.t - a.t); const ahead = rows.filter((r) => !r.done).sort((a, b) => a.t - b.t)
  const blocks = []
  if (ahead.length) blocks.push({ type: 'table', id: 'sched-ahead', title: `Upcoming · ${ahead.length}`, caption: 'Upcoming games, soonest first. Each row opens the game.', rows: ahead, columns: GAME_COLS, initialSort: { key: 't', dir: 'asc' }, maxRows: 5, heat: 'sorted', rowOpen: 'game', bareTable: true })
  if (done.length) blocks.push({ type: 'table', id: 'sched-done', title: `Results · ${done.length}`, caption: 'Finished games, latest first. Each row opens the game.', rows: done, columns: GAME_COLS, initialSort: { key: 't', dir: 'desc' }, maxRows: 5, heat: 'sorted', rowOpen: 'game', bareTable: true })
  const label = ctx.deep?.season ? `${ctx.deep.season.cur - 1}-${String(ctx.deep.season.cur).slice(2)}` : ctx.payload?.seasonLabel
  return { id: 'schedule', label: m.label, n: rows.length, state: 'ok', window: windowLabel({ seasonLabel: label, part: 'schedule incl. preseason', n: rows.length }), blocks }
}

// ── STATS & RANKS ───────────────────────────────────────────────────────────
function statsSection(code, ctx) {
  const m = meta('stats')
  const lines = (ctx.deep?.lines || []).filter((l) => l.value != null)
  if (!lines.length) return emptySection('stats', m.label, 'NO TEAM NUMBERS YET', `Needs ${m.needs}. ESPN’s team statistics did not answer for enough clubs to rank this one.`)
  const s = ctx.deep.season; const gp = ctx.deep.standing ? (ctx.deep.standing.w || 0) + (ctx.deep.standing.l || 0) : null
  const blocks = []
  for (const g of ['Offence', 'Defence', 'Overall']) {
    const rs = lines.filter((l) => l.group === g)
    if (rs.length) blocks.push({ type: 'table', id: `stats-${g.toLowerCase()}`, title: g, caption: `${g}: this club's number, the league mean and its rank of 30 (1 = best, so fewest allowed or lost).`, rows: rs.map(lineRow), columns: STAT_COLS, initialSort: { key: 'pct', dir: 'desc' }, maxRows: 6, heat: 'standouts', rowOpen: null })
  }
  if (ctx.shots) blocks.push({ type: 'slot', slot: 'shots', props: {} })
  blocks.push({ type: 'note', text: 'Per-game numbers from ESPN’s season team statistics and the standings. Pace and offensive / defensive rating are not published to the site, so they are not shown. A percentile is the share of the other 29 clubs this club is better than; it describes the season so far.' })
  return { id: 'stats', label: m.label, n: gp, state: 'ok', window: windowLabel({ seasonLabel: s.label, stale: s.stale, n: gp }), blocks }
}

// ── SPLITS (standings' records + our game results) ──────────────────────────
const SPLIT_COLS = [
  { key: 'label', label: 'Split', w: 168, plain: true, heat: false, numeric: false, sticky: true, bold: true, group: 'Split' },
  { key: 'src', label: 'Source', w: 80, heat: false, numeric: false, group: 'Split' },
  { key: 'g', label: 'G', w: 38, heat: false, group: 'Record' }, { key: 'w', label: 'W', w: 38, heat: false, group: 'Record' }, { key: 'l', label: 'L', w: 38, heat: false, group: 'Record' },
  { key: 'pct', label: 'Win %', w: 56, dp: 1, primary: true, group: 'Record' }, { key: 'range', label: '95% range', w: 90, heat: false, numeric: false, group: 'Record' },
  { key: 'ppg', label: 'PTS', w: 50, dp: 1, group: 'Points a game' }, { key: 'oppg', label: 'OPP', w: 50, dp: 1, invert: true, group: 'Points a game' }, { key: 'diff', label: 'DIFF', w: 54, dp: 1, signed: true, group: 'Points a game' },
]
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 864e5)
const MONTHS = ['October', 'November', 'December', 'January', 'February', 'March', 'April']
export function splitRow(label, src, gs) {
  const g = gs.length; const w = gs.filter((x) => x.result === 'W').length; const l = g - w
  const r = g ? wilson(w, g) : null
  const avg = (k) => (g ? gs.reduce((a, x) => a + x[k], 0) / g : null)
  const ppg = avg('us'); const oppg = avg('them')
  return { _key: `${src}-${label}`, label, src, g, w, l, pct: g ? Math.round((1000 * w) / g) / 10 : null, range: r ? `${Math.round(r[0])}–${Math.round(r[1])}%` : '—', ppg, oppg, diff: g ? ppg - oppg : null }
}
export function restOf(results) {
  const rest = new Map(); results.forEach((g, i) => { if (i > 0) rest.set(g.id, daysBetween(results[i - 1].date, g.date) - 1) })
  return rest
}
function splitsSection(code, ctx) {
  const m = meta('splits')
  const d = ctx.deep
  const res = d?.results || []
  if (!res.length) return emptySection('splits', m.label, 'NO GAMES IN THE READ SEASON', d ? `Splits need finished regular-season games for ${d.season?.label || 'the read season'}.` : `Needs ${m.needs}.`)
  const rest = restOf(res)
  const monthOf = (g) => new Date(`${g.date}T12:00:00Z`).toLocaleString('en-US', { month: 'long', timeZone: 'UTC' })
  const me = nbaTeam(code)
  const OUR = 'Our log'
  const T = (id, title, caption, rows, maxRows = 4) => (rows.filter((r) => r.g > 0).length ? { type: 'table', id, title, caption: `${caption} Source: ${[...new Set(rows.filter((r) => r.g > 0).map((r) => r.src))].join(' and ')}, ${d.season.label} regular season. G is the games behind each row; the range is a 95% Wilson range on win %.`, rows: rows.filter((r) => r.g > 0), columns: SPLIT_COLS, initialSort: null, maxRows, heat: 'standouts', rowOpen: null } : null)
  const blocks = [
    T('split-ha', 'Home / Away', 'The club’s record and scoring at home and on the road.', [splitRow('Home', OUR, res.filter((g) => g.home)), splitRow('Away', OUR, res.filter((g) => !g.home))]),
    T('split-recent', 'Recent', 'The most recent games.', [splitRow('Last 10', OUR, res.slice(-10)), splitRow('Last 5', OUR, res.slice(-5))]),
    T('split-month', 'By month', 'The club’s record by calendar month.', MONTHS.map((mo) => splitRow(mo, OUR, res.filter((g) => monthOf(g) === mo)))),
    T('split-opp', 'Opponent', 'Against its own division and each conference.', [splitRow(`vs ${me?.div || 'division'}`, OUR, res.filter((g) => g.sameDiv)), splitRow(`vs ${me?.conf === 'E' ? 'East' : 'West'}`, OUR, res.filter((g) => g.sameConf)), splitRow(`vs ${me?.conf === 'E' ? 'West' : 'East'}`, OUR, res.filter((g) => !g.sameConf))]),
    T('split-rest', 'Rest', 'By days since the club’s previous game. The numbers are shown with their games; nothing here reads rest as a lean.', [splitRow('Back-to-back', OUR, res.filter((g) => rest.get(g.id) === 0)), splitRow('1 day off', OUR, res.filter((g) => rest.get(g.id) === 1)), splitRow('2+ days off', OUR, res.filter((g) => (rest.get(g.id) ?? -1) >= 2))], 3),
    T('split-margin', 'Margin', 'How close the games were.', [splitRow('Within 5 points', OUR, res.filter((g) => Math.abs(g.us - g.them) <= 5)), splitRow('15+ point margin', OUR, res.filter((g) => Math.abs(g.us - g.them) >= 15))], 3),
  ].filter(Boolean)
  const st = d.standing
  if (st && (st.home || st.road || st.last10)) blocks.push({ type: 'note', text: `ESPN’s standings carry the same records as strings: home ${st.home || '—'}, road ${st.road || '—'}, last ten ${st.last10 || '—'}. ESPN publishes no team-splits feed for the NBA, so months, opponents, rest and margin come from the club’s own results.` })
  blocks.push({ type: 'note', text: 'Quarter, half, lineup and shot-location team splits are not published to the site, so none are shown. A split with a few games is a few games.' })
  return { id: 'splits', label: m.label, n: res.length, state: 'ok', window: windowLabel({ seasonLabel: d.season.label, stale: d.season.stale, n: res.length }), blocks }
}

// ── OUR CALLS ───────────────────────────────────────────────────────────────
const CALL_COLS = [
  { key: 'date', label: 'Date', w: 92, heat: false, numeric: false, sticky: true, plain: true, kind: 'day', group: 'Call' },
  { key: 'name', label: 'Player', w: 150, heat: false, numeric: false, bold: true, group: 'Call', link: 'player', linkKey: 'playerId' },
  { key: 'marketTxt', label: 'Market', w: 90, heat: false, numeric: false, group: 'Call' },
  { key: 'oppText', label: 'Opponent', w: 86, heat: false, numeric: false, group: 'Call', link: 'team', linkKey: 'opp' },
  { key: 'word', label: 'Result', w: 110, heat: false, numeric: false, group: 'Graded' }, { key: 'actual', label: 'Actual', w: 52, heat: false, group: 'Graded' },
]
const SUMC = [
  { key: 'scope', label: 'Market', w: 150, heat: false, numeric: false, sticky: true, plain: true, group: 'Market' },
  { key: 'n', label: 'Graded', w: 60, heat: false, group: 'Calls' }, { key: 'hit', label: 'Hit', w: 44, group: 'Calls' },
  { key: 'rate', label: 'Rate %', w: 62, dp: 1, primary: true, group: 'Calls' }, { key: 'range', label: '95% range', w: 98, heat: false, numeric: false, group: 'Calls' },
]
function callsSection(code, ctx) {
  const m = meta('calls')
  const c = ctx.deep?.calls
  if (!c) return emptySection('calls', m.label, 'GRADED LOG NOT AVAILABLE', `Needs ${m.needs}. It could not be read just now.`)
  if (!c.length) return emptySection('calls', m.label, 'NO CALLS ON THIS CLUB YET', `No ${code} player has a graded CALLED pick in ${ctx.deep.season.label} yet. A call is fixed before tip and graded after the game.`)
  const rows = c.slice().sort((a, b) => (a.date < b.date ? 1 : -1))
  const keys = [...new Set(rows.map((r) => `${r.market}|${r.version}`))]
  const sums = keys.map((k) => { const [market, version] = k.split('|'); const s = callsSummary(rows.filter((r) => r.market === market && r.version === version)); return { _key: k, scope: `${MARKET_WORD[market] || market} (${version})`, n: s.n, hit: s.hit, rate: s.rate, range: s.range ? `${s.range[0]}–${s.range[1]}%` : '—' } })
  const total = callsSummary(rows)
  return { id: 'calls', label: m.label, n: total.n, state: 'ok', window: windowLabel({ seasonLabel: ctx.deep.season.label, stale: ctx.deep.season.stale, n: total.n, unit: 'graded calls' }), blocks: [
    { type: 'table', id: 'calls-sum', title: 'Hit rate of our calls on this club', caption: 'CALLED picks on this club’s players, graded after the game, by market and model version. Never pooled across markets or versions.', rows: sums, columns: SUMC, initialSort: { key: 'n', dir: 'desc' }, maxRows: 4, heat: 'sorted', rowOpen: null, bareTable: true },
    { type: 'table', id: 'calls-last', title: `Last ${Math.min(10, rows.length)} calls`, caption: 'The most recent CALLED picks on this club, with the graded result. Each row opens the player.', rows: rows.slice(0, 10).map((r, i) => ({ _key: `${r.gameId}-${r.playerId}-${r.market}-${i}`, date: r.date, name: r.name, playerId: r.playerId, marketTxt: MARKET_WORD[r.market] || r.market, opp: r.opp, oppText: `vs ${r.opp}`, word: resultWord(r.result), actual: r.result === 'void' ? null : r.actual })), columns: CALL_COLS, initialSort: { key: 'date', dir: 'desc' }, maxRows: 5, heat: 'sorted', rowOpen: 'player', playerKey: 'playerId', bareTable: true },
    { type: 'note', text: 'Information only: how the board’s past CALLED picks on this club’s players turned out. Each rate carries its sample and a 95% range; a small sample is a wide range. Did not play is not a miss and not in the rate.' },
  ] }
}

// ── NEXT GAME ───────────────────────────────────────────────────────────────
const VS_COLS = (a, b) => [
  { key: 'measure', label: 'Measure', w: 130, plain: true, heat: false, numeric: false, sticky: true, group: 'Measure' },
  { key: 'us', label: a, w: 104, heat: false, numeric: false, group: 'Attack' }, { key: 'them', label: b, w: 104, heat: false, numeric: false, group: 'Defence' },
]
function matchupSection(code, ctx) {
  const m = meta('matchup')
  const nx = ctx.deep?.next
  if (!nx) return emptySection('matchup', m.label, 'NO GAME AHEAD', ctx.deep ? `${code} has no scheduled game left on the club schedule.` : `Needs ${m.needs}.`)
  const g = nx.game; const opp = g.opp
  const mine = Object.fromEntries((ctx.deep.lines || []).map((l) => [l.key, l])); const theirs = Object.fromEntries((ctx.deep.oppLines || []).map((l) => [l.key, l]))
  const cell = (l) => (!l || l.value == null ? '—' : `${f(l.value, l.dp)} · ${l.rank ? ord(l.rank.rank) : '—'}`)
  const pair = (label, a, b) => (mine[a]?.value != null && theirs[b]?.value != null ? { _key: `${a}-${b}`, measure: label, us: cell(mine[a]), them: cell(theirs[b]) } : null)
  const att = [pair('Points / game', 'pts', 'opp'), pair('Rebounds: offensive vs defensive', 'or', 'dr')].filter(Boolean)
  const rev = (() => { const a = theirs.pts; const b = mine.opp; return a?.value != null && b?.value != null ? [{ _key: 'rev', measure: 'Points / game', us: cell(a), them: cell(b) }] : [] })()
  const blocks = []
  const away = g.home ? opp : code; const home = g.home ? code : opp
  blocks.push({ type: 'slot', slot: 'injuries', props: { clubs: [away, home] } })
  if (nx.model) {
    const mm = nx.model
    blocks.push({ type: 'table', id: 'mu-model', title: 'Team model: expected points', caption: 'The team model’s expected points for each side: points scored and allowed a game, shrunk toward last season early in the year, home court and the second night of a back-to-back. An expected number, not a pick and not a probability.', rows: [mm.away, mm.home].map((s) => ({ _key: s.abbrev, club: s.abbrev, pts: s.pts, rest: mm.rest?.[s === mm.away ? 'away' : 'home'] ?? null })), columns: [
      { key: 'club', label: 'Club', w: 90, plain: true, heat: false, numeric: false, sticky: true, group: 'Side', link: 'team', linkKey: 'club' }, { key: 'pts', label: 'Exp. points', w: 84, dp: 1, primary: true, group: 'Model' }, { key: 'rest', label: 'Days off', w: 70, heat: false, group: 'Model', title: 'Days since the club’s previous game; 0 is the second night of a back-to-back.' },
    ], initialSort: null, maxRows: 2, heat: 'sorted', rowOpen: null, bareTable: true })
    const t = nx.totals
    blocks.push({ type: 'note', text: `Expected total ${f(mm.total, 1)} points${mm.basis ? ` (${mm.basis})` : ''}. ${t ? `Stored before tip: projection ${f(t.projected, 1)}, line ${f(t.line, 1)} (${t.source === 'book' ? 'the book total' : 'our own number'}), rank ${t.rank} of ${t.of} on the slate${t.called ? `, ${STATUS_WORD.called}` : ''}.` : 'No Top Totals number was stored for this game.'}` })
  } else blocks.push({ type: 'note', text: 'No team-model number for this game yet: it needs both clubs’ results in ESPN’s club schedules.' })
  if (att.length) blocks.push({ type: 'table', id: 'mu-attack', title: `${code} offence vs ${opp} defence`, caption: `${code}'s scoring against ${opp}'s defence: the number and its rank of 30 (1 = best).`, rows: att, columns: VS_COLS(`${code} (O)`, `${opp} (D)`), initialSort: null, maxRows: 3, heat: 'sorted', rowOpen: null, bareTable: true })
  if (rev.length) blocks.push({ type: 'table', id: 'mu-defence', title: `${opp} offence vs ${code} defence`, caption: `${opp}'s scoring against ${code}'s defence, the same way round.`, rows: rev, columns: VS_COLS(`${opp} (O)`, `${code} (D)`), initialSort: null, maxRows: 2, heat: 'sorted', rowOpen: null, bareTable: true })
  return { id: 'matchup', label: m.label, n: null, state: 'ok', gameId: g.id, window: `${g.state === 'live' ? 'Game in progress' : 'Next game'} · ${String(g.start).slice(0, 10)} · ${g.home ? 'vs' : '@'} ${opp}${g.seasonType === 1 ? ' · preseason' : ''}`, blocks }
}

const BUILDERS = { cards: (code) => cardsSection(SPORT, code), roster: playersSection, schedule: scheduleSection, stats: statsSection, splits: splitsSection, calls: callsSection, matchup: matchupSection }

/** @returns {{ sport, header, sections }} -- sections in registry order, each 'ok' or an honest 'empty'. */
export function buildNbaTeam({ team, payload = null, deep = null, board = null, shots = false }) {
  const t = nbaTeam(team)
  const code = t ? t.abbrev : String(team || '').toUpperCase()
  const ctx = { payload, deep, board, shots }
  const header = nbaHeader(code, ctx)
  const sections = sectionsOf(SPORT).map((s) => (BUILDERS[s.id] ? BUILDERS[s.id](code, ctx) : emptySection(s.id, s.label, 'NOT BUILT', `Needs ${s.needs}.`)))
  return { sport: SPORT, header, sections }
}
