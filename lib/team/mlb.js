// ⚾ THE MLB TEAM PAGE, AS DATA (2026-10-10). Pure: payloads in, a view out (the contract is lib/team/contract.js).
//
//   players  tonight's board rows MOONSHOT already loaded (every model number; the board's word from lib/callStatus)
//   server   /api/mlb/team (lib/mlb/teamRead.js): standing + record splits, schedule, ranks, ESPN + MLB splits, venues, starters, calls, totals
//
// SPLITS (Donovan: "team splits just like how ESPN has them"). One chip, three views (Batting / Pitching / Record & park), each
// table labelled with where its numbers came from: ESPN's team splits where ESPN has the split, MLB's situational splits where
// ESPN lacks it, the standings' record splits, and OUR schedule log for ballparks and rest. A split no feed carries is not in a
// table: the view names it as missing. Every row carries its games (G) and the at-bats behind each rate, with a Wilson 95% range
// on AVG / opponent AVG. No call words, no strong / weak labels, no leans. Nothing is estimated.
import { teamKey, teamFullName, MLB_TEAMS } from '../mlbTeams'
import { boardRowContext, boardRow, withBoardColumns } from '../boardColumns'
import { callStatus, boardOfRows, STATUS_WORD } from '../callStatus'
import { sectionsOf } from './registry'
import { callsSummary, rankWord, resultWord, windowLabel, emptySection } from './contract'
import { STAT_COLS, lineRow } from './statLines'
import { wilson } from '../interval'
import { teamFigures, stripLines } from '../record/byTeam'
import { rangeText } from '../mlb/teamSplitsCore'

const SPORT = 'mlb'
export const MLB_CLUBS = Object.keys(MLB_TEAMS)
const n = (v) => (v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null)
const f = (v, dp = 1) => (n(v) == null ? '—' : Number(v).toFixed(dp))
const ord = (k) => rankWord({ rank: k })
const meta = (id) => sectionsOf(SPORT).find((s) => s.id === id)
const MONTHS = ['March', 'April', 'May', 'June', 'July', 'August', 'September', 'October']

// ── the header ──────────────────────────────────────────────────────────────
const gameLine = (g) => g && ({ gameId: g.pk, date: g.date, startUtc: g.startUtc, home: g.home, opp: g.opp, venue: g.venue, result: g.result, us: g.us, them: g.them, outcome: null, state: g.state === 'Live' ? 'live' : g.state === 'Final' ? 'final' : 'pre' })
export function mlbHeader(code, ctx) {
  const { server } = ctx
  const st = server?.standing || null
  const sched = server?.schedule || []
  const played = sched.filter((g) => g.state === 'Final' && g.result)
  const live = sched.find((g) => g.state === 'Live') || null
  const next = sched.find((g) => g.state !== 'Final' && g.state !== 'Live') || null
  const rec = st ? `${st.w}-${st.l}` : null
  const name = teamFullName(code) || null
  const lg = st?.divName ? String(st.divName).replace('American League', 'AL').replace('National League', 'NL') : null
  return {
    sport: SPORT, code, name, nickname: name ? name.split(' ').pop() : null, known: Boolean(name), logo: name ? `https://a.espncdn.com/i/teamlogos/mlb/500/${String(code === 'CWS' ? 'chw' : code === 'ATH' ? 'oak' : code).toLowerCase()}.png` : null,
    eyebrow: lg ? `MOONSHOT · TEAM · ${lg.toUpperCase()}` : 'MOONSHOT · TEAM',
    seasonLabel: server?.season ? String(server.season) : null, stale: Boolean(server?.stale),
    record: rec, points: null, diff: null, standing: st ? `${ord(st.divRank)} in the ${lg}` : null,
    chips: [rec && { value: rec, label: server?.stale ? `${server.season} FINAL` : 'RECORD' }, st?.diff != null && { value: `${st.diff > 0 ? '+' : ''}${st.diff}`, label: 'RUN DIFF' }].filter(Boolean),
    summary: st ? [rec + (server?.stale ? ` (${server.season})` : ''), `${ord(st.divRank)} in the ${lg}`, st.gb != null && st.gb !== '-' && `${st.gb} GB`, st.streak && `Streak ${st.streak}`, `Runs ${st.rs}-${st.ra}`].filter(Boolean) : null,
    splits: null, streak: st?.streak || null,
    live: gameLine(live), next: gameLine(next), last: gameLine(played[played.length - 1] || null), last5: played.slice(-5).map(gameLine),
  }
}

// ── HITTERS (tonight's board) ───────────────────────────────────────────────
const OWN = [
  { key: 'name', label: 'Player', w: 168, heat: false, sticky: true, bold: true, group: 'Hitter', link: 'player', linkKey: 'pid' },
  { key: 'role', label: 'Role', w: 110, heat: false, group: 'Hitter' },
  { key: 'spot', label: 'Spot', w: 44, heat: false, mono: true, group: 'Hitter' },
  { key: 'inj', label: 'Avail.', w: 56, heat: false, group: 'Hitter', title: 'Out / injured list from the shared injury report, when listed.' },
  { key: 'facing', label: 'Facing', w: 130, heat: false, group: 'Tonight' },
]
function hittersSection(code, ctx) {
  const m = meta('roster')
  const all = ctx.players || []
  const mine = all.filter((p) => teamKey(p?.team) === code)
  if (!mine.length) return emptySection('roster', m.label, 'NOT ON TONIGHT’S BOARD', all.length ? 'No hitter from this club is on tonight’s slate: an off day, or the lineup isn’t posted yet.' : `Needs ${m.needs}.`)
  const rctx = boardRowContext(all)
  const boardOf = boardOfRows(all)
  const rows = mine.map((p, i) => {
    const b = boardRow(p, i, rctx)
    const status = callStatus({ role: p.game_pick_role, board_rank: p.board_rank, board_of: boardOf })
    return { ...b, _raw: p, pid: `${p.player_id}-${p.game_pk}`, name: p.name, role: p.game_pick_role || '', spot: p.lineup_spot ?? null, inj: '', facing: p.pitcher_name || '', status, game_pk: p.game_pk }
  }).sort((a, b) => (n(a.rank) ?? 999) - (n(b.rank) ?? 999))
  const columns = withBoardColumns(OWN, { onWatch: null, dhOn: false })
  const called = rows.filter((r) => r.status === 'called').length; const onBoard = rows.filter((r) => r.status === 'board').length
  return {
    id: 'roster', label: m.label, n: rows.length, state: 'ok', window: windowLabel({ seasonLabel: String(ctx.server?.season || ''), part: 'tonight’s board', n: rows.length, unit: 'hitters' }),
    status: `${called} ${STATUS_WORD.called} · ${onBoard} ${STATUS_WORD.board}`,
    blocks: [
      { type: 'slot', slot: 'injuries', props: { clubs: [code] } },
      { type: 'table', id: 'hitters', title: `Tonight on the board · ${rows.length}`, caption: 'His club’s hitters on tonight’s slate, every model number. Each row opens the hitter.', rows, columns, initialSort: { key: 'rank', dir: 'asc' }, maxRows: 10, heat: 'standouts', rowOpen: 'player', playerKey: 'pid', statusKey: 'status' },
    ],
  }
}

// ── SCHEDULE ────────────────────────────────────────────────────────────────
const GAME_COLS = [
  { key: 't', label: 'Date', w: 92, heat: false, numeric: false, sticky: true, plain: true, kind: 'day', group: 'Game' },
  { key: 'oppText', label: 'Opponent', w: 100, heat: false, numeric: false, group: 'Game', link: 'team', linkKey: 'opp' },
  { key: 'resultTxt', label: 'Result', w: 100, heat: false, numeric: false, kind: 'result', group: 'Result' },
  { key: 'sp', label: 'Their starter', w: 130, heat: false, numeric: false, group: 'Pitchers', link: 'pitcher', linkKey: 'spId' },
  { key: 'venue', label: 'Ballpark', w: 140, heat: false, numeric: false, group: 'Where' },
]
function scheduleRows(server) {
  return (server?.schedule || []).map((g) => ({
    _key: g.pk, gameId: g.pk, t: Date.parse(g.startUtc || g.date), date: g.date, startUtc: g.startUtc, opp: g.opp, oppText: `${g.home ? 'vs' : '@'} ${g.opp}`,
    resultTxt: g.state === 'Final' ? (g.result ? `${g.result} ${g.us}–${g.them}` : g.detail) : g.state === 'Live' ? `LIVE ${g.us ?? 0}–${g.them ?? 0}` : null,
    sp: g.themPitcher?.name || '', spId: g.themPitcher?.id || null, venue: g.venue, done: g.state === 'Final', type: g.type,
  }))
}
function scheduleSection(code, ctx) {
  const m = meta('schedule')
  const rows = scheduleRows(ctx.server)
  if (!rows.length) return emptySection('schedule', m.label, 'NO SCHEDULE', `Needs ${m.needs}.`)
  const done = rows.filter((r) => r.done).sort((a, b) => b.t - a.t); const ahead = rows.filter((r) => !r.done).sort((a, b) => a.t - b.t)
  const blocks = []
  if (ahead.length) blocks.push({ type: 'table', id: 'sched-ahead', title: `Upcoming · ${ahead.length}`, caption: 'Upcoming games, soonest first, with the opposing probable starter. Each row opens the game.', rows: ahead, columns: GAME_COLS, initialSort: { key: 't', dir: 'asc' }, maxRows: 5, heat: 'sorted', rowOpen: 'game', bareTable: true })
  if (done.length) blocks.push({ type: 'table', id: 'sched-done', title: `Results · ${done.length}`, caption: 'Finished games, latest first. Each row opens the game.', rows: done, columns: GAME_COLS, initialSort: { key: 't', dir: 'desc' }, maxRows: 5, heat: 'sorted', rowOpen: 'game', bareTable: true })
  return { id: 'schedule', label: m.label, n: rows.length, state: 'ok', window: windowLabel({ seasonLabel: String(ctx.server.season), stale: ctx.server.stale, part: 'season incl. postseason', n: rows.length }), blocks }
}

// ── STATS & RANKS ───────────────────────────────────────────────────────────
function statsSection(code, ctx) {
  const m = meta('stats')
  const lines = (ctx.server?.lines || []).filter((l) => l.value != null)
  if (!lines.length) return emptySection('stats', m.label, 'NO TEAM NUMBERS YET', `Needs ${m.needs}.`)
  const blocks = []
  for (const g of ['Offence', 'Pitching', 'Overall']) {
    const rs = lines.filter((l) => l.group === g)
    if (rs.length) blocks.push({ type: 'table', id: `stats-${g.toLowerCase()}`, title: g, caption: `${g}: this club's number, the league mean and its rank of 30 (1 = best, so fewest allowed).`, rows: rs.map(lineRow), columns: STAT_COLS, initialSort: { key: 'pct', dir: 'desc' }, maxRows: 6, heat: 'standouts', rowOpen: null })
  }
  blocks.push({ type: 'note', text: 'Per-game and rate numbers from MLB’s team stats, regular season. Bullpen numbers are in Splits (starters vs bullpen). A home-run park factor is not published to the site, so none is shown. A percentile is the share of the other 29 clubs this club is better than; it describes the season so far.' })
  const gp = ctx.server.standing?.gp ?? null
  return { id: 'stats', label: m.label, n: gp, state: 'ok', window: windowLabel({ seasonLabel: String(ctx.server.season), stale: ctx.server.stale, n: gp }), blocks }
}

// ── SPLITS ──────────────────────────────────────────────────────────────────
// [label, ESPN split name, MLB sit code]. Batting and pitching use the same list; "vs" reads the other side's hand.
const GROUPS = {
  ha: ['Home / Away', [['Home', 'Home', 'h'], ['Away', 'Away', 'a']]],
  vs: ['Opponent type', [['L', 'vs. Left', 'vl'], ['R', 'vs. Right', 'vr'], ['vs AL', null, 'val'], ['vs NL', null, 'vnl']]],
  dn: ['Day / Night', [['Day games', 'Day', 'd'], ['Night games', 'Night', 'n']]],
  mo: ['By month', MONTHS.map((mo, i) => [mo, mo, String(i + 3)])],
  sit: ['Runners and outs', [['Bases empty', 'None on', 'r0'], ['Runners on', 'Runners on', 'ron'], ['Scoring position', 'Scoring Posn', 'risp'], ['Scoring position, 2 outs', null, 'risp2'], ['Bases loaded', null, 'r123'], ['No outs', null, 'o0'], ['One out', null, 'o1'], ['Two outs', null, 'o2']]],
  sc: ['Score', [['Leading', null, 'sah'], ['Trailing', null, 'sbh'], ['Tied', null, 'sti']]],
  inn: ['Innings', [['Innings 1–3', null, 'i1-3'], ['Innings 4–6', null, 'i4-6'], ['Innings 7–9', null, 'i7-9'], ['Extra innings', null, 'ix']]],
  sf: ['Surface', [['On grass', null, 'g'], ['On turf', null, 't']]],
  rl: ['Starters and bullpen', [['Starters', null, 'sp'], ['Bullpen', null, 'rp']]],
}
const VS_LABEL = { bat: { L: 'vs left-handed pitchers', R: 'vs right-handed pitchers' }, pit: { L: 'vs left-handed batters', R: 'vs right-handed batters' } }

const BAT_COLS = [
  { key: 'label', label: 'Split', w: 168, plain: true, heat: false, numeric: false, sticky: true, bold: true, group: 'Split' },
  { key: 'src', label: 'Source', w: 54, heat: false, numeric: false, group: 'Split' },
  { key: 'g', label: 'G', w: 38, heat: false, group: 'Games' }, { key: 'pa', label: 'PA', w: 48, heat: false, group: 'Games' },
  { key: 'ab', label: 'AB', w: 48, heat: false, group: 'Counting' }, { key: 'h', label: 'H', w: 44, heat: false, group: 'Counting' }, { key: 'hr', label: 'HR', w: 40, heat: false, group: 'Counting' },
  { key: 'r', label: 'R', w: 40, heat: false, group: 'Counting' }, { key: 'rbi', label: 'RBI', w: 42, heat: false, group: 'Counting' }, { key: 'bb', label: 'BB', w: 40, heat: false, group: 'Counting' }, { key: 'so', label: 'SO', w: 42, heat: false, group: 'Counting' }, { key: 'sb', label: 'SB', w: 40, heat: false, group: 'Counting' },
  { key: 'avg', label: 'AVG', w: 52, kind: 'avg3', group: 'Rates' }, { key: 'obp', label: 'OBP', w: 52, kind: 'avg3', group: 'Rates' }, { key: 'slg', label: 'SLG', w: 52, kind: 'avg3', group: 'Rates' }, { key: 'ops', label: 'OPS', w: 54, kind: 'avg3', primary: true, group: 'Rates' },
  { key: 'range', label: 'AVG 95% range', w: 100, heat: false, numeric: false, group: 'Range' },
]
const PIT_COLS = [
  { key: 'label', label: 'Split', w: 168, plain: true, heat: false, numeric: false, sticky: true, bold: true, group: 'Split' },
  { key: 'src', label: 'Source', w: 54, heat: false, numeric: false, group: 'Split' },
  { key: 'g', label: 'G', w: 38, heat: false, group: 'Games' }, { key: 'ip', label: 'IP', w: 56, heat: false, group: 'Games' },
  { key: 'h', label: 'H', w: 44, heat: false, group: 'Counting' }, { key: 'r', label: 'R', w: 42, heat: false, group: 'Counting' }, { key: 'er', label: 'ER', w: 42, heat: false, group: 'Counting' }, { key: 'hr', label: 'HR', w: 40, heat: false, group: 'Counting' }, { key: 'bb', label: 'BB', w: 40, heat: false, group: 'Counting' }, { key: 'k', label: 'K', w: 42, heat: false, group: 'Counting' },
  { key: 'era', label: 'ERA', w: 52, kind: 'n2', invert: true, primary: true, group: 'Rates' }, { key: 'whip', label: 'WHIP', w: 52, kind: 'n2', invert: true, group: 'Rates' }, { key: 'oba', label: 'Opp AVG', w: 60, kind: 'avg3', invert: true, group: 'Rates' },
  { key: 'range', label: 'Opp AVG 95% range', w: 116, heat: false, numeric: false, group: 'Range' },
]
const SRC = { espn: 'ESPN', mlb: 'MLB' }

function splitTable(side, groupKey, sp) {
  const [title, defs] = GROUPS[groupKey]
  if (side === 'bat' && groupKey === 'rl') return { missing: [] }
  const rows = []; const missing = []
  for (const [raw, espnName, code] of defs) {
    const label = raw === 'L' || raw === 'R' ? VS_LABEL[side][raw] : raw
    let line = null; let src = null
    const e = espnName && sp?.espn?.rows?.[espnName]?.[side]
    if (e && n(e.g) != null) { line = e; src = 'espn' }
    else { const mrow = code && sp?.mlb?.[side]?.[code]; if (mrow) { line = mrow; src = 'mlb' } }
    if (!line) { missing.push(label); continue }
    const range = rangeText(line.h, line.ab)
    rows.push({ _key: `${side}-${code}`, label, src: SRC[src], ...line, range: range || '—' })
  }
  return { title, rows, missing, srcs: [...new Set(rows.map((r) => r.src))] }
}

const sideBlocks = (side, sp, year) => {
  const blocks = []; const miss = []
  const keys = side === 'bat' ? ['ha', 'vs', 'dn', 'mo', 'sit', 'sc', 'inn', 'sf'] : ['ha', 'vs', 'dn', 'mo', 'rl', 'sit', 'sc', 'inn', 'sf']
  for (const gk of keys) {
    const t = splitTable(side, gk, sp)
    if (t.missing?.length) miss.push(...t.missing)
    if (!t.rows?.length) continue
    blocks.push({ type: 'table', id: `split-${side}-${gk}`, view: side, title: `${t.title}`, caption: `${side === 'bat' ? 'Batting' : 'Pitching'}, ${t.title.toLowerCase()}. ${year} regular season. Source: ${t.srcs.map((s) => (s === 'ESPN' ? 'ESPN team splits' : 'MLB situational splits')).join(' and ')}. G is the games behind each row; the range is a 95% Wilson range on ${side === 'bat' ? 'AVG (hits over at-bats)' : 'opponent AVG (hits over at-bats against)'}.`, rows: t.rows, columns: side === 'bat' ? BAT_COLS : PIT_COLS, initialSort: null, maxRows: 4, heat: 'standouts', rowOpen: null })
  }
  if (miss.length) blocks.push({ type: 'note', view: side, text: `Not carried by either feed, so not shown: ${[...new Set(miss)].join(', ')}.` })
  return blocks
}

const REC_COLS = [
  { key: 'label', label: 'Split', w: 168, plain: true, heat: false, numeric: false, sticky: true, bold: true, group: 'Split' },
  { key: 'src', label: 'Source', w: 70, heat: false, numeric: false, group: 'Split' },
  { key: 'g', label: 'G', w: 40, heat: false, group: 'Record' }, { key: 'w', label: 'W', w: 40, heat: false, group: 'Record' }, { key: 'l', label: 'L', w: 40, heat: false, group: 'Record' },
  { key: 'pct', label: 'Win %', w: 56, dp: 1, primary: true, group: 'Record' }, { key: 'range', label: '95% range', w: 90, heat: false, numeric: false, group: 'Record' },
  { key: 'rs', label: 'RS', w: 44, heat: false, group: 'Runs' }, { key: 'ra', label: 'RA', w: 44, heat: false, group: 'Runs' },
]
const recRow = (label, src, w, l, extra = {}) => { const g = w + l; const r = g ? wilson(w, g) : null; return { _key: `${src}-${label}`, label, src, g, w, l, pct: g ? Math.round((1000 * w) / g) / 10 : null, range: r ? `${Math.round(r[0])}–${Math.round(r[1])}%` : '—', ...extra } }
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 864e5)

export function logSplits(server) {
  const fin = (server?.schedule || []).filter((g) => g.state === 'Final' && g.result && g.type === 'R').sort((a, b) => String(a.startUtc).localeCompare(String(b.startUtc)))
  const all = (server?.schedule || []).slice().sort((a, b) => String(a.startUtc).localeCompare(String(b.startUtc)))
  const prev = new Map(); all.forEach((g, i) => { if (i > 0) prev.set(g.pk, all[i - 1].date) })
  const agg = (gs) => ({ w: gs.filter((g) => g.result === 'W').length, l: gs.filter((g) => g.result === 'L').length, rs: gs.reduce((a, g) => a + (g.us || 0), 0), ra: gs.reduce((a, g) => a + (g.them || 0), 0) })
  const byPark = new Map()
  for (const g of fin) { const k = g.venue || '—'; if (!byPark.has(k)) byPark.set(k, { venueId: g.venueId, gs: [] }); byPark.get(k).gs.push(g) }
  const parks = [...byPark.entries()].map(([venue, v]) => ({ venue, venueId: v.venueId, ...agg(v.gs), g: v.gs.length })).sort((a, b) => b.g - a.g)
  const dayOff = fin.filter((g) => prev.has(g.pk) && daysBetween(prev.get(g.pk), g.date) >= 2)
  const noOff = fin.filter((g) => prev.has(g.pk) && daysBetween(prev.get(g.pk), g.date) === 1)
  return { last5: fin.slice(-5), parks, dayOff, noOff, agg }
}

function splitsSection(code, ctx) {
  const m = meta('splits')
  const sv = ctx.server
  if (!sv?.splits?.espn && !sv?.splits?.mlb && !sv?.standing?.records?.length) return emptySection('splits', m.label, 'NO SPLITS DATA', `Needs ${m.needs}. Neither ESPN’s team splits nor MLB’s situational splits answered.`)
  const year = sv.season
  const views = [{ key: 'bat', label: 'Batting' }, { key: 'pit', label: 'Pitching' }, { key: 'park', label: 'Record & park' }]
  const blocks = []
  if (sv.splits?.espn || sv.splits?.mlb) { blocks.push(...sideBlocks('bat', sv.splits, year), ...sideBlocks('pit', sv.splits, year)) }
  else { blocks.push({ type: 'note', view: 'bat', text: 'ESPN’s and MLB’s splits feeds did not answer just now, so no batting splits are shown.' }, { type: 'note', view: 'pit', text: 'ESPN’s and MLB’s splits feeds did not answer just now, so no pitching splits are shown.' }) }
  // record & park
  const L = logSplits(sv)
  const rec = (sv.standing?.records || []).map((r) => recRow(r.label, 'MLB standings', r.w, r.l))
  if (L.last5.length) { const a = L.agg(L.last5); rec.push(recRow('Last 5', 'Our log', a.w, a.l, { rs: a.rs, ra: a.ra })) }
  if (rec.length) blocks.push({ type: 'table', id: 'split-record', view: 'park', title: 'Record splits', caption: `The club's record by split, ${year} regular season. Source: MLB standings record splits (and our schedule log for the last 5). Wins and losses are the games behind each row; the range is a 95% Wilson range on win %. A split is a description of games played.`, rows: rec, columns: REC_COLS, initialSort: null, maxRows: 5, heat: 'standouts', rowOpen: null })
  else blocks.push({ type: 'note', view: 'park', text: 'MLB’s record splits are not available just now.' })
  if (L.parks.length) {
    const rows = L.parks.map((p) => { const v = sv.venues?.[p.venueId] || null; return { ...recRow(p.venue, 'Our log', p.w, p.l, { rs: p.rs, ra: p.ra }), roof: v?.roof || '—', turf: v?.turf ? (/turf/i.test(v.turf) ? 'Turf' : v.turf) : '—' } })
    blocks.push({ type: 'table', id: 'split-parks', view: 'park', title: 'By ballpark', caption: `The club's regular-season record in each ballpark it has played, with the roof and surface from MLB's venue file. Source: our schedule log. A park with one or two games is one or two games.`, rows, columns: [REC_COLS[0], { key: 'roof', label: 'Roof', w: 84, heat: false, numeric: false, group: 'Park' }, { key: 'turf', label: 'Surface', w: 70, heat: false, numeric: false, group: 'Park' }, ...REC_COLS.slice(2)], initialSort: null, maxRows: 5, heat: 'standouts', rowOpen: null })
  } else blocks.push({ type: 'note', view: 'park', text: 'By-ballpark records need finished regular-season games on the schedule.' })
  if (L.dayOff.length || L.noOff.length) {
    const rows = [['After a day off', L.dayOff], ['On consecutive days', L.noOff]].filter(([, g]) => g.length).map(([label, gs]) => { const a = L.agg(gs); return recRow(label, 'Our log', a.w, a.l, { rs: a.rs, ra: a.ra }) })
    blocks.push({ type: 'table', id: 'split-rest', view: 'park', title: 'Rest', caption: 'Record by days since the club’s previous game: after a day off, and on consecutive days. Information only; nothing here reads rest as a lean. Source: our schedule log.', rows, columns: REC_COLS, initialSort: null, maxRows: 3, heat: 'sorted', rowOpen: null })
  }
  blocks.push({ type: 'note', view: 'park', text: 'Split sources are named on every table. Starting-pitcher hand, rest days of the starter and a by-park batting line are not carried by either feed, so they are not shown.' })
  return { id: 'splits', label: m.label, n: sv.standing?.gp ?? null, state: 'ok', window: windowLabel({ seasonLabel: String(year), stale: sv.stale, n: sv.standing?.gp ?? null }), views, blocks }
}

// ── OUR CALLS ───────────────────────────────────────────────────────────────
const CALL_COLS = [
  { key: 'date', label: 'Date', w: 92, heat: false, numeric: false, sticky: true, plain: true, kind: 'day', group: 'Call' },
  { key: 'name', label: 'Hitter', w: 150, heat: false, numeric: false, bold: true, group: 'Call', link: 'player', linkKey: 'player_id' },
  { key: 'role', label: 'Lane', w: 70, heat: false, numeric: false, group: 'Call' },
  { key: 'word', label: 'Result', w: 90, heat: false, numeric: false, group: 'Graded' },
]
const SUM_COLS = [
  { key: 'scope', label: 'Calls on this club', w: 170, heat: false, numeric: false, sticky: true, plain: true, group: 'Window' },
  { key: 'n', label: 'Graded', w: 60, heat: false, group: 'Calls' }, { key: 'hit', label: 'Hit', w: 44, group: 'Calls' },
  { key: 'rate', label: 'Rate %', w: 62, dp: 1, primary: true, group: 'Calls' }, { key: 'range', label: '95% range', w: 98, heat: false, numeric: false, group: 'Calls' },
]
// THIS WEEK AND LAST, from the same helper as the record's club table (lib/record/byTeam.js): the team page and the record agree by construction
function weekNote(sport, code, rows, ctx) {
  if (!ctx?.today) return []
  const f = teamFigures(rows, sport, code, ctx)
  return [{ type: 'note', text: stripLines(f, { what: 'called picks on this club' }).filter((l) => l.key !== 'season').map((l) => l.text).join(' ') }]
}
function callsSection(code, ctx) {
  const m = meta('calls')
  const c = ctx.server?.calls
  if (!c) return emptySection('calls', m.label, 'LOCKED RECORD NOT AVAILABLE', `Needs ${m.needs}. It could not be read just now.`)
  const picks = (c.picks || []).slice().sort((a, b) => (a.game_date < b.game_date ? 1 : -1))
  if (!picks.length) return emptySection('calls', m.label, 'NO CALLS ON THIS CLUB', `No ${code} hitter has a graded home-run call in the locked record yet. A call is fixed before first pitch and graded after the game.`)
  const rows = picks.map((p) => ({ ...p, result: p.result }))
  const s = callsSummary(rows)
  const first = picks[picks.length - 1].game_date
  return { id: 'calls', label: m.label, n: s.n, state: 'ok', window: windowLabel({ seasonLabel: String(ctx.server.season), part: `regular season, locked calls since ${first}`, n: s.n, unit: 'graded calls' }), blocks: [
    { type: 'table', id: 'calls-sum', title: 'Hit rate of our home-run calls on this club', caption: 'The TOP and HR calls on this club’s hitters, stamped before first pitch and graded after the game: the one locked record the front door and /called read.', rows: [{ _key: 'sum', scope: `${ctx.server.season} locked calls`, n: s.n, hit: s.hit, rate: s.rate, range: s.range ? `${s.range[0]}–${s.range[1]}%` : '—' }], columns: SUM_COLS, initialSort: null, maxRows: 2, heat: 'sorted', rowOpen: null, bareTable: true },
    { type: 'table', id: 'calls-last', title: `Last ${Math.min(10, rows.length)} calls`, caption: 'The most recent home-run calls on this club’s hitters, with the graded result.', rows: rows.slice(0, 10).map((r, i) => ({ _key: `${r.game_date}-${r.player_id}-${i}`, date: r.game_date, name: r.name, player_id: r.player_id, role: r.role, word: resultWord(r.result) })), columns: CALL_COLS, initialSort: { key: 'date', dir: 'desc' }, maxRows: 5, heat: 'sorted', rowOpen: null, bareTable: true },
    ...weekNote('mlb', code, rows.map((r) => ({ ...r, date: r.game_date })), { today: c.today }),
    { type: 'note', text: 'Information only: how the home-run calls on this club’s hitters turned out. A rate carries its sample and a 95% range; a few calls is a wide range.' },
  ] }
}

// ── NEXT GAME ───────────────────────────────────────────────────────────────
const VS_COLS = (a, b) => [
  { key: 'measure', label: 'Measure', w: 120, plain: true, heat: false, numeric: false, sticky: true, group: 'Measure' },
  { key: 'us', label: a, w: 104, heat: false, numeric: false, group: 'Attack' }, { key: 'them', label: b, w: 104, heat: false, numeric: false, group: 'Defence' },
]
const SP_COLS = [
  { key: 'side', label: 'Club', w: 60, plain: true, heat: false, numeric: false, sticky: true, group: 'Starter', link: 'team', linkKey: 'club' },
  { key: 'name', label: 'Starter', w: 150, heat: false, numeric: false, bold: true, group: 'Starter', link: 'pitcher', linkKey: 'id' },
  { key: 'hand', label: 'Throws', w: 54, heat: false, numeric: false, group: 'Starter' },
  { key: 'gs', label: 'GS', w: 38, heat: false, group: 'Season' }, { key: 'ip', label: 'IP', w: 54, heat: false, group: 'Season' }, { key: 'era', label: 'ERA', w: 50, kind: 'n2', invert: true, primary: true, group: 'Season' }, { key: 'whip', label: 'WHIP', w: 50, kind: 'n2', invert: true, group: 'Season' }, { key: 'hr', label: 'HR', w: 40, group: 'Season' },
]
function matchupSection(code, ctx) {
  const m = meta('matchup')
  const sv = ctx.server
  const sched = sv?.schedule || []
  const g = sched.find((x) => x.state === 'Live') || sched.find((x) => x.state !== 'Final') || null
  if (!g) return emptySection('matchup', m.label, 'NO GAME AHEAD', sv ? `${code} has no game left on the schedule.` : `Needs ${m.needs}.`)
  const opp = g.opp; const blocks = []
  const mine = Object.fromEntries((sv.lines || []).map((l) => [l.key, l])); const theirs = Object.fromEntries((sv.oppLines || []).map((l) => [l.key, l]))
  const cell = (l) => (!l || l.value == null ? '—' : `${f(l.value, l.dp)} · ${l.rank ? ord(l.rank.rank) : '—'}`)
  const pair = (label, a, b) => (mine[a]?.value != null && theirs[b]?.value != null ? { _key: `${a}-${b}`, measure: label, us: cell(mine[a]), them: cell(theirs[b]) } : null)
  const att = [pair('Runs / game', 'rg', 'ra'), pair('Home runs / game', 'hrg', 'hr9'), pair('OPS vs ERA', 'ops', 'era')].filter(Boolean)
  const st = sv.starters
  if (st && (st.us || st.them)) {
    const rows = [['us', code, st.us], ['them', opp, st.them]].filter(([, , p]) => p).map(([k, club, p]) => ({ _key: k, club, side: club, id: p.id, name: p.name, hand: p.hand || '—', gs: p.gs, ip: p.ip, era: p.era, whip: p.whip, hr: p.hr }))
    blocks.push({ type: 'table', id: 'mu-sp', title: 'Probable starters', caption: 'The two probable starting pitchers and their season line (MLB). A probable is not a confirmed starter until the lineup posts.', rows, columns: SP_COLS, initialSort: null, maxRows: 2, heat: 'sorted', rowOpen: null, bareTable: true })
  } else blocks.push({ type: 'note', text: 'No probable starters are posted for this game yet.' })
  if (att.length) blocks.push({ type: 'table', id: 'mu-attack', title: `${code} offence vs ${opp} pitching`, caption: `${code}'s offence against ${opp}'s pitching: the number and its rank of 30 (1 = best).`, rows: att, columns: VS_COLS(`${code} (O)`, `${opp} (P)`), initialSort: null, maxRows: 3, heat: 'sorted', rowOpen: null, bareTable: true })
  const rev = [(() => { const a = theirs.rg; const b = mine.ra; return a?.value != null && b?.value != null ? { _key: 'rev', measure: 'Runs / game', us: cell(a), them: cell(b) } : null })(), (() => { const a = theirs.hrg; const b = mine.hr9; return a?.value != null && b?.value != null ? { _key: 'rev2', measure: 'Home runs / game', us: cell(a), them: cell(b) } : null })()].filter(Boolean)
  if (rev.length) blocks.push({ type: 'table', id: 'mu-defence', title: `${opp} offence vs ${code} pitching`, caption: `${opp}'s offence against ${code}'s pitching, the same way round.`, rows: rev, columns: VS_COLS(`${opp} (O)`, `${code} (P)`), initialSort: null, maxRows: 3, heat: 'sorted', rowOpen: null, bareTable: true })
  const park = sv.venues?.[g.venueId]
  blocks.push({ type: 'note', text: `Ballpark: ${g.venue || 'not listed'}${park ? ` (${[park.roof && `${park.roof} roof`, park.turf].filter(Boolean).join(', ')})` : ''}. ${g.dayNight ? `A ${g.dayNight} game.` : ''}` })
  const t = sv.totals
  blocks.push({ type: 'note', text: t ? `Top Totals, stored before first pitch: projection ${f(t.projected, 2)} home runs, line ${f(t.line, 1)} (${t.source === 'book' ? 'the book total' : 'our own number'}), rank ${t.rank} of ${t.of} on the slate${t.called ? `, ${STATUS_WORD.called}` : ''}. An expected count, not a pick and not a probability.` : 'No Top Totals number was stored for this game.' })
  return { id: 'matchup', label: m.label, n: null, state: 'ok', gameId: g.pk, window: `${g.state === 'Live' ? 'Game in progress' : 'Next game'} · ${g.date} · ${g.home ? 'vs' : '@'} ${opp}${g.venue ? ` · ${g.venue}` : ''}`, blocks }
}

const BUILDERS = { roster: hittersSection, schedule: scheduleSection, stats: statsSection, splits: splitsSection, calls: callsSection, matchup: matchupSection }

/** @returns {{ sport, header, sections }} -- sections in registry order, each 'ok' or an honest 'empty'. */
export function buildMlbTeam({ team, players = null, server = null }) {
  const code = teamKey(team) || String(team || '').toUpperCase()
  const ctx = { players, server }
  const header = mlbHeader(code, ctx)
  const sections = sectionsOf(SPORT).map((s) => (BUILDERS[s.id] ? BUILDERS[s.id](code, ctx) : emptySection(s.id, s.label, 'NOT BUILT', `Needs ${s.needs}.`)))
  return { sport: SPORT, header, sections }
}
