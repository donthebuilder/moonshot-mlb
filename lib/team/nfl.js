// 🏈 THE NFL TEAM PAGE, AS DATA (2026-10-10). Pure: payloads in, a view out (the contract is lib/team/contract.js).
//
//   slate     nfl_week.json (withRoles'd): this week's players, games, team_defense per game
//   matchup   nfl_matchup.json (blended: lib/nfl/seasonRule.js): defense vs position, tendencies, pass_game, qb_pressure, snaps, red zone
//   logs      nfl_logs.json: only to run the team touchdown model (lib/nfl/teamTdModel.js)
//   st        the standings feed (lib/nfl/standings.js)
//   server    /api/nfl/team: the club's season schedule, stored Top Totals rows, touchdowns by status
//   archive   the graded weeks (lib/nfl/resultsArchive.js), keyed 2026_w04
//   statusOf  (player) -> 'called' | 'board' | 'off' from lib/nfl/tdStatus.js (the one place that decides it)
//
// EXTENSION POINTS: BUILDERS below is keyed by section id and lib/team/registry.js lists the chips. A 'defense'
// (defensive player stats) or 'tags' (fumble / interception / corner / pass-rush tags) section is one registry line plus
// one entry in BUILDERS; nothing else on this page or the shared one changes. They are not built here.
import { NFL_TEAMS } from '../nfl/teams'
import { nflTeamLogo } from '../nfl/nflAssets'
import { roleLabel } from '../nfl/roles'
import { injuryTag } from '../nfl/injury'
import { defenseSeason } from '../nfl/seasonRule'
import { slateTotals } from '../nfl/teamTdModel'
import { withNflFullSet } from '../nfl/boardColumns'
import { tdCallStatus, STATUS_WORD } from '../callStatus'
import { sectionsOf } from './registry'
import { callsSummary, leagueRank, rankWord, resultWord, windowLabel, emptySection } from './contract'
import { STAT_COLS, lineRow, clubLines } from './statLines'

const SPORT = 'nfl'
export const NFL_CLUBS = NFL_TEAMS.map((t) => t[0])
const NAME = Object.fromEntries(NFL_TEAMS)
const n = (v) => (v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null)
const ord = (k) => rankWord({ rank: k })
const f = (v, dp = 1) => (n(v) == null ? '—' : Number(v).toFixed(dp))
const meta = (id) => sectionsOf(SPORT).find((s) => s.id === id)
const recOf = (r) => (r ? `${r.w ?? 0}-${r.l ?? 0}${r.t ? `-${r.t}` : ''}` : null)

// ── standings helpers ───────────────────────────────────────────────────────
function standingsIndex(st) {
  const out = {}
  for (const conf of st?.conferences || []) for (const div of conf.divisions || []) div.teams.forEach((t, i) => { const abbr = t.abbr === 'LAR' ? 'LA' : t.abbr; out[abbr] = { ...t, abbr, divName: div.name, confAbbr: conf.abbr, confName: conf.name, place: i + 1 } })
  return out
}
const games = (r) => (r ? (r.w || 0) + (r.l || 0) + (r.t || 0) : 0)

// ── the header ──────────────────────────────────────────────────────────────
const gameLine = (g) => g && ({ gameId: g.id, date: g.date, startUtc: g.startUtc, home: g.home, opp: g.opp, venue: g.venue, result: g.result, us: g.us, them: g.them, outcome: null, state: g.state === 'in' ? 'live' : g.state === 'post' ? 'final' : 'pre', week: g.week })
export function nflHeader(code, ctx) {
  const { st, server, slate } = ctx
  const idx = standingsIndex(st)[code] || null
  const sched = (server?.schedule?.games || []).filter((g) => g.type === 2 || g.type === 3)
  const played = sched.filter((g) => g.state === 'post' && g.result)
  const live = sched.find((g) => g.state === 'in') || null
  const next = sched.find((g) => g.state === 'pre') || null
  const name = NAME[code] || null
  const rec = idx ? recOf(idx) : null
  return {
    sport: SPORT, code, name, nickname: name ? name.split(' ').pop() : null, known: Boolean(name), logo: name ? nflTeamLogo(code, 112) : null,
    eyebrow: idx ? `TUDDY · TEAM · ${idx.divName.toUpperCase()}` : 'TUDDY · TEAM',
    seasonLabel: slate?.season ? String(slate.season) : null, stale: false,
    record: rec, points: null, diff: null,
    standing: idx ? `${ord(idx.place)} in the ${idx.divName}` : null,
    chips: [rec && { value: rec, label: 'RECORD' }, idx?.pf != null && { value: `${idx.pf}-${idx.pa}`, label: 'PF-PA' }].filter(Boolean),
    summary: idx ? [`${rec}`, `${ord(idx.place)} in the ${idx.divName}`, idx.home && `Home ${idx.home}`, idx.road && `Road ${idx.road}`, idx.div && `Div ${idx.div}`, idx.conf && `Conf ${idx.conf}`, idx.strk && `Streak ${idx.strk}`].filter(Boolean) : null,
    splits: null, streak: idx?.strk || null,
    live: gameLine(live), next: gameLine(next), last: gameLine(played[played.length - 1] || null), last5: played.slice(-5).map(gameLine),
  }
}

// ── PLAYERS ─────────────────────────────────────────────────────────────────
// groups as objects with an order, so they sit before the board's own groups (scores order 3 and up)
const PG = { player: { key: 'player', label: 'Player', order: 0 }, usage: { key: 'usage', label: 'Usage', order: 2 } }
const OWN_PLAYER_COLS = [
  { key: 'name', label: 'Player', w: 160, heat: false, sticky: true, bold: true, group: PG.player, link: 'player', linkKey: 'player_id' },
  { key: 'role', label: 'Role', w: 54, heat: false, group: PG.player, title: 'Where TUDDY’s depth chart puts him this week. A label, not a forecast.' },
  { key: 'inj', label: 'Avail.', w: 52, heat: false, group: PG.player, title: 'The injury report designation, when there is one.' },
  { key: 'snap', label: 'Snap %', w: 56, dp: 0, group: PG.usage, title: 'Share of his offense’s snaps this season' },
  { key: 'rz_touch', label: 'RZ touch', w: 58, dp: 0, group: PG.usage, title: 'Red-zone touches (rushes and targets) this season' },
  { key: 'rz_td', label: 'RZ TD', w: 50, dp: 0, group: PG.usage },
]
function playersSection(code, ctx) {
  const m = meta('roster')
  const { slate, matchup, statusOf } = ctx
  const mine = (slate?.players || []).filter((p) => p.team === code && !p.on_bye)
  if (!mine.length) return emptySection('roster', m.label, 'NO PLAYERS THIS WEEK', slate ? 'A bye week, or this club has no scored players on the week file.' : `Needs ${m.needs}.`)
  const base = mine.map((p) => {
    const sn = matchup?.snaps?.[p.player_id]; const rz = matchup?.red_zone?.[p.player_id]
    return { _raw: p, _key: p.player_id, player_id: p.player_id, name: p.name, role: roleLabel(p), inj: injuryTag(p) || '', status: statusOf ? statusOf(p) : null,
      snap: sn?.snap_pct ?? null, rz_touch: rz?.touches ?? null, rz_td: rz?.tds ?? null, td: p.scores?.TD ?? null }
  }).sort((a, b) => (b.td ?? -1) - (a.td ?? -1))
  const full = withNflFullSet(base, OWN_PLAYER_COLS, {})
  const called = base.filter((r) => r.status === 'called').length; const onBoard = base.filter((r) => r.status === 'board').length
  return {
    id: 'roster', label: m.label, n: base.length, state: 'ok',
    window: windowLabel({ seasonLabel: String(slate.season), part: slate.label || 'this week', n: base.length, unit: 'players' }),
    status: `${called} ${STATUS_WORD.called} · ${onBoard} ${STATUS_WORD.board}`,
    blocks: [
      { type: 'table', id: 'players', title: `Players · ${base.length}`, caption: 'His club’s players this week: role, availability, usage and every model score. Each row opens the player.', rows: full.rows, columns: full.columns, initialSort: { key: 'td', dir: 'desc' }, maxRows: 12, heat: 'standouts', rowOpen: 'player', playerKey: 'player_id', statusKey: 'status' },
      { type: 'note', text: 'Role is the depth chart TUDDY publishes for the week (RB1, WR2, ...); slot is not published, so it is never shown. A blank usage cell is a player with no snap or red-zone row yet.' },
    ],
  }
}

// ── SCHEDULE ────────────────────────────────────────────────────────────────
const GAME_COLS = [
  { key: 'week', label: 'Wk', w: 40, heat: false, group: 'Game' },
  { key: 't', label: 'Date', w: 92, heat: false, numeric: false, sticky: true, plain: true, kind: 'day', group: 'Game' },
  { key: 'oppText', label: 'Opponent', w: 104, heat: false, numeric: false, group: 'Game', link: 'team', linkKey: 'opp' },
  { key: 'resultTxt', label: 'Result', w: 112, heat: false, numeric: false, kind: 'result', group: 'Result' },
  { key: 'venue', label: 'Stadium', w: 150, heat: false, numeric: false, group: 'Where' },
]
function scheduleRows(server, slate) {
  const inSlate = new Set((slate?.games || []).map((g) => String(g.game_id)))
  return (server?.schedule?.games || []).filter((g) => g.type === 2 || g.type === 3).map((g) => ({
    _key: g.id, gameId: g.id, week: g.week, t: Date.parse(g.startUtc || g.date), date: g.date, startUtc: g.startUtc, opp: g.opp, oppText: `${g.home ? 'vs' : '@'} ${g.opp}`,
    resultTxt: g.state === 'post' ? `${g.result} ${g.us}–${g.them}` : g.state === 'in' ? `LIVE ${g.us ?? 0}–${g.them ?? 0}` : null,
    venue: g.venue, noOpen: !inSlate.has(String(g.id)), done: g.state === 'post',
  }))
}
function scheduleSection(code, ctx) {
  const m = meta('schedule')
  const rows = scheduleRows(ctx.server, ctx.slate)
  if (!rows.length) return emptySection('schedule', m.label, 'NO SCHEDULE', `Needs ${m.needs}.`)
  const done = rows.filter((r) => r.done).sort((a, b) => b.t - a.t); const ahead = rows.filter((r) => !r.done).sort((a, b) => a.t - b.t)
  const bye = ctx.server?.schedule?.bye
  const blocks = []
  if (ahead.length) blocks.push({ type: 'table', id: 'sched-ahead', title: `Upcoming · ${ahead.length}`, caption: 'Upcoming games, soonest first. A game on this week’s slate opens its page.', rows: ahead, columns: GAME_COLS, initialSort: { key: 't', dir: 'asc' }, maxRows: 5, heat: 'sorted', rowOpen: 'game', bareTable: true })
  if (done.length) blocks.push({ type: 'table', id: 'sched-done', title: `Results · ${done.length}`, caption: 'Finished games, latest first. A game on this week’s slate opens its page.', rows: done, columns: GAME_COLS, initialSort: { key: 't', dir: 'desc' }, maxRows: 5, heat: 'sorted', rowOpen: 'game', bareTable: true })
  if (bye) blocks.push({ type: 'note', text: `Bye week: Week ${bye}.` })
  return { id: 'schedule', label: m.label, n: rows.length, state: 'ok', window: windowLabel({ seasonLabel: String(ctx.server.schedule.season || ctx.slate?.season || ''), part: 'season', n: rows.length }), blocks }
}

// ── STATS & RANKS ───────────────────────────────────────────────────────────
function statRowsNfl(st, slate) {
  const idx = standingsIndex(st)
  const byClub = (fn) => Object.fromEntries(NFL_CLUBS.map((c) => [c, fn(c)]))
  const per = (c, k) => { const t = idx[c]; const g = games(t); return t && g > 0 && n(t[k]) != null ? t[k] / g : null }
  const pg = slate?.team_defense?.per_game || {}
  const d = (c, k) => n(pg[c]?.[k])
  const rows = [
    { key: 'pf', group: 'Offence', label: 'Points for / game', dp: 1, higherBetter: true, byClub: byClub((c) => per(c, 'pf')) },
    { key: 'pa', group: 'Defence', label: 'Points against / game', dp: 1, higherBetter: false, byClub: byClub((c) => per(c, 'pa')) },
    { key: 'sacks', group: 'Defence', label: 'Sacks / game', dp: 2, higherBetter: true, byClub: byClub((c) => d(c, 'def_sacks')) },
    { key: 'ints', group: 'Defence', label: 'Interceptions / game', dp: 2, higherBetter: true, byClub: byClub((c) => d(c, 'def_interceptions')) },
    { key: 'frec', group: 'Defence', label: 'Fumble recoveries / game', dp: 2, higherBetter: true, byClub: byClub((c) => d(c, 'def_fumble_recoveries')) },
    { key: 'dtd', group: 'Defence', label: 'Defensive TDs / game', dp: 2, higherBetter: true, byClub: byClub((c) => d(c, 'def_touchdowns')) },
    { key: 'diff', group: 'Overall', label: 'Point difference / game', dp: 1, higherBetter: true, signed: true, byClub: byClub((c) => (per(c, 'pf') != null && per(c, 'pa') != null ? per(c, 'pf') - per(c, 'pa') : null)) },
    { key: 'win', group: 'Overall', label: 'Win %', dp: 1, pct: true, higherBetter: true, byClub: byClub((c) => { const t = idx[c]; const g = games(t); return t && g > 0 ? ((t.w || 0) + 0.5 * (t.t || 0)) / g : null }) },
  ]
  return rows.filter((r) => Object.values(r.byClub).some((v) => v != null))
}
function statsSection(code, ctx) {
  const m = meta('stats')
  const idx = standingsIndex(ctx.st)[code]
  const lines = clubLines(statRowsNfl(ctx.st, ctx.slate), code).filter((l) => l.value != null)
  if (!idx || !lines.length) return emptySection('stats', m.label, 'NO TEAM NUMBERS YET', `Needs ${m.needs}. No game has been played in the standings feed yet.`)
  const blocks = []
  for (const g of ['Offence', 'Defence', 'Overall']) {
    const rs = lines.filter((l) => l.group === g)
    if (rs.length) blocks.push({ type: 'table', id: `stats-${g.toLowerCase()}`, title: g, caption: `${g}: this club's number, the league mean and its rank of 32 (1 = best, so fewest against).`, rows: rs.map(lineRow), columns: STAT_COLS, initialSort: { key: 'pct', dir: 'desc' }, maxRows: 6, heat: 'standouts', rowOpen: null })
  }
  const divTeams = Object.values(standingsIndex(ctx.st)).filter((t) => t.divName === idx.divName).sort((a, b) => a.place - b.place)
  if (divTeams.length > 1) blocks.push({ type: 'table', id: 'stats-division', title: idx.divName, caption: 'The division in the feed\u2019s order. Each row opens that club.', rows: divTeams.map((t) => ({ _key: t.abbr, rank: t.place, team: t.abbr, nickname: t.nickname, rec: recOf(t), pf: t.pf, pa: t.pa, diff: t.diff })), columns: [
    { key: 'rank', label: '#', w: 30, heat: false, group: 'Club' }, { key: 'nickname', label: 'Team', w: 120, plain: true, heat: false, numeric: false, sticky: true, bold: true, group: 'Club', link: 'team', linkKey: 'team' },
    { key: 'rec', label: 'W-L', w: 60, heat: false, numeric: false, group: 'Record' }, { key: 'pf', label: 'PF', w: 46, group: 'Points' }, { key: 'pa', label: 'PA', w: 46, invert: true, group: 'Points' }, { key: 'diff', label: 'Diff', w: 50, signed: true, group: 'Points' },
  ], initialSort: null, maxRows: 4, heat: 'sorted', rowOpen: null, bareTable: true })
  blocks.push({ type: 'note', text: 'Points come from the standings feed, takeaways and sacks from the week file’s team defense (per game over the weeks it lists). Team yards, third-down and special-teams numbers are not published to the site, so they are not shown. A percentile is the share of the other 31 clubs this club is better than; it describes the season so far.' })
  return { id: 'stats', label: m.label, n: games(idx), state: 'ok', window: windowLabel({ seasonLabel: String(ctx.slate?.season || ''), n: games(idx) }), blocks }
}

// ── OUR CALLS ───────────────────────────────────────────────────────────────
const CALL_COLS = [
  { key: 'week', label: 'Wk', w: 40, heat: false, sticky: true, plain: true, group: 'Call' },
  { key: 'name', label: 'Player', w: 150, heat: false, numeric: false, bold: true, group: 'Call', link: 'player', linkKey: 'player_id' },
  { key: 'oppText', label: 'Opponent', w: 88, heat: false, numeric: false, group: 'Call', link: 'team', linkKey: 'opp' },
  { key: 'rank', label: 'Rank', w: 46, heat: false, group: 'Call' },
  { key: 'word', label: 'Result', w: 112, heat: false, numeric: false, group: 'Graded' },
  { key: 'actual', label: 'TDs', w: 44, heat: false, group: 'Graded' },
]
const SUM_COLS = [
  { key: 'scope', label: 'Calls on this club', w: 150, heat: false, numeric: false, sticky: true, plain: true, group: 'Window' },
  { key: 'n', label: 'Graded', w: 60, heat: false, group: 'Calls' }, { key: 'hit', label: 'Hit', w: 44, group: 'Calls' },
  { key: 'rate', label: 'Rate %', w: 62, dp: 1, primary: true, group: 'Calls' }, { key: 'range', label: '95% range', w: 98, heat: false, numeric: false, group: 'Calls' },
]
const TD_COLS = [
  { key: 'day', label: 'Date', w: 92, heat: false, numeric: false, sticky: true, plain: true, kind: 'day', group: 'Touchdown' },
  { key: 'name', label: 'Scorer', w: 150, heat: false, numeric: false, bold: true, group: 'Touchdown', link: 'player', linkKey: 'playerId' },
  { key: 'oppText', label: 'Opponent', w: 88, heat: false, numeric: false, group: 'Touchdown', link: 'team', linkKey: 'opp' },
  { key: 'kind', label: 'Type', w: 70, heat: false, numeric: false, group: 'Touchdown' },
  { key: 'word', label: 'Before the TD', w: 150, heat: false, numeric: false, group: 'The board' },
]
function callsSection(code, ctx) {
  const m = meta('calls')
  const season = Number(ctx.slate?.season) || null
  const rows = []
  for (const [key, p] of Object.entries(ctx.archive || {})) {
    if (!p || p.missing || (season && Number(p.season) !== season) || p.mode === 'preseason') continue
    for (const r of p.card?.TD?.rungs || []) {
      if (r.team !== code) continue
      rows.push({ _key: `${key}-${r.player_id}`, week: Number(p.week), player_id: r.player_id, name: r.name, opp: r.opp, oppText: `vs ${r.opp}`, rank: r.rank ?? null, result: r.void ? 'void' : r.hit === true ? 'hit' : r.hit === false ? 'miss' : null, actual: r.void ? null : n(r.actual), status: tdCallStatus({ on_bot: r }) })
    }
  }
  // this week's calls, not graded yet: the card and the game calls, de-duplicated by player
  const done = new Set(rows.filter((r) => r.week === Number(ctx.slate?.week)).map((r) => r.player_id))
  const oppOf = (t) => { const g = (ctx.slate?.games || []).find((x) => x.home === t || x.away === t); return g ? (g.home === t ? g.away : g.home) : null }
  const pend = new Map()
  for (const r of ctx.picks?.card?.TD?.rungs || []) if (r.team === code && !done.has(r.player_id)) pend.set(r.player_id, r)
  for (const g of ctx.gameCalls?.games || []) for (const c of g.calls || []) if (c.team === code && !done.has(c.player_id) && !pend.has(c.player_id)) pend.set(c.player_id, c)
  for (const r of pend.values()) rows.push({ _key: `now-${r.player_id}`, week: Number(ctx.slate?.week) || null, player_id: r.player_id, name: r.name, opp: r.opp || oppOf(r.team || code), oppText: (r.opp || oppOf(r.team || code)) ? `vs ${r.opp || oppOf(r.team || code)}` : '—', rank: r.rank ?? r.slate_rank ?? null, result: null, actual: null, status: 'called' })
  for (const r of rows) r.word = resultWord(r.result)
  rows.sort((a, b) => (b.week ?? 0) - (a.week ?? 0) || (a.rank ?? 99) - (b.rank ?? 99))
  const w = windowLabel({ seasonLabel: season ? String(season) : null, part: 'regular season', n: rows.length, unit: 'TD calls' })
  const tds = ctx.server?.tds
  const blocks = []
  if (rows.length) {
    const s = callsSummary(rows)
    blocks.push({ type: 'table', id: 'calls-sum', title: 'Hit rate of our TD calls on this club', caption: 'The TD calls (TUDDY’s anytime-TD card and the game calls) on this club’s players, graded after the game.', rows: [{ _key: 'sum', scope: `${season || ''} weeks graded`, n: s.n, hit: s.hit, rate: s.rate, range: s.range ? `${s.range[0]}–${s.range[1]}%` : '—' }], columns: SUM_COLS, initialSort: null, maxRows: 2, heat: 'sorted', rowOpen: null, bareTable: true })
    blocks.push({ type: 'table', id: 'calls-last', title: `Last ${Math.min(10, rows.length)} calls`, caption: 'The most recent TD calls on this club, with the graded result. Each row opens the player.', rows: rows.slice(0, 10), columns: CALL_COLS, initialSort: { key: 'week', dir: 'desc' }, maxRows: 5, heat: 'sorted', rowOpen: 'player', playerKey: 'player_id', bareTable: true })
    blocks.push({ type: 'note', text: `Information only: how the TD calls on this club’s players turned out. A rate carries its sample and a 95% range; a few calls is a wide range. Did not play is not a miss and not in the rate. ${s.pending} not graded yet.` })
  }
  if (tds && tds.length) {
    const c = { called: 0, board: 0, off: 0 }; for (const t of tds) c[t.status] = (c[t.status] || 0) + 1
    blocks.push({ type: 'table', id: 'tds-seen', title: `Touchdowns by this club’s players · ${tds.length}`, caption: 'Each touchdown a player of this club scored, and the word the board gave him before it: CALLED, ON THE BOARD or NOT ON THE BOARD.', rows: tds.map((t, i) => ({ _key: `${t.gameId}-${i}`, day: t.day, date: t.day, name: t.name, playerId: t.playerId, opp: t.opp, oppText: t.opp ? `vs ${t.opp}` : '—', kind: t.kind || t.position || '', word: STATUS_WORD[t.status] || '—', noOpen: !t.playerId })), columns: TD_COLS, initialSort: { key: 'day', dir: 'desc' }, maxRows: 5, heat: 'sorted', rowOpen: 'player', playerKey: 'playerId', bareTable: true })
    blocks.push({ type: 'note', text: `Of ${tds.length} touchdowns: ${c.called} by a ${STATUS_WORD.called} player, ${c.board} ${STATUS_WORD.board}, ${c.off} ${STATUS_WORD.off}. That counts scorers, not calls missed.` })
  }
  if (!blocks.length) return emptySection('calls', m.label, ctx.archive || tds ? 'NO CALLS ON THIS CLUB YET' : 'GRADED WEEKS NOT LOADED', ctx.archive || tds ? `No TD call on a ${code} player has been graded in ${season || 'this season'} yet. Calls are fixed before kickoff and graded after the game.` : `Needs ${m.needs}.`, w)
  return { id: 'calls', label: m.label, n: callsSummary(rows).n, state: 'ok', window: w, blocks }
}

// ── NEXT GAME ───────────────────────────────────────────────────────────────
const VS_COLS = (a, b) => [
  { key: 'measure', label: 'Measure', w: 120, plain: true, heat: false, numeric: false, sticky: true, group: 'Measure' },
  { key: 'us', label: a, w: 100, heat: false, numeric: false, group: 'Club' },
  { key: 'them', label: b, w: 100, heat: false, numeric: false, group: 'Opponent' },
]
const DVP_COLS = [
  { key: 'role', label: 'Role', w: 74, plain: true, heat: false, numeric: false, sticky: true, group: 'Role' },
  { key: 'td', label: 'TD / game', w: 90, heat: false, numeric: false, group: 'Allowed' },
  { key: 'rec', label: 'Rec yds / g', w: 96, heat: false, numeric: false, group: 'Allowed' },
  { key: 'rush', label: 'Rush yds / g', w: 100, heat: false, numeric: false, group: 'Allowed' },
  { key: 'rz', label: 'RZ targets', w: 90, heat: false, numeric: false, group: 'Allowed' },
]
const cellRank = (row, k, dp = 1) => (row && n(row[k]) != null ? `${f(row[k], dp)} · ${n(row[`${k}_rank`]) != null ? ord(row[`${k}_rank`]) : '—'}` : '—')
function matchupSection(code, ctx) {
  const m = meta('matchup')
  const { server, slate, matchup } = ctx
  const sched = (server?.schedule?.games || []).filter((g) => g.type === 2 || g.type === 3)
  const g = sched.find((x) => x.state === 'in') || sched.find((x) => x.state === 'pre') || null
  if (!g) return emptySection('matchup', m.label, 'NO GAME AHEAD', server ? `${code} has no game left on the club schedule.` : `Needs ${m.needs}.`)
  const opp = g.opp
  const blocks = []
  // the team model and the stored line (only a game on the week file has a model number)
  const proj = ctx.logs && slate ? slateTotals(slate, ctx.logs)[g.id] : null
  const tot = server?.totals?.[g.id] || null
  if (proj) {
    const sg = (slate.games || []).find((x) => String(x.game_id) === String(g.id)) || {}
    blocks.push({ type: 'table', id: 'mu-model', title: 'Team model: expected touchdowns', caption: 'The team model\u2019s expected touchdowns by tracked skill players for each side. An expected number, not a pick and not a probability.', rows: [{ _key: 'a', club: sg.away, goals: proj.awayTd }, { _key: 'h', club: sg.home, goals: proj.homeTd }], columns: [
      { key: 'club', label: 'Club', w: 90, plain: true, heat: false, numeric: false, sticky: true, group: 'Side', link: 'team', linkKey: 'club' },
      { key: 'goals', label: 'Exp. TDs', w: 80, dp: 2, primary: true, group: 'Model' },
    ], initialSort: null, maxRows: 2, heat: 'sorted', rowOpen: null, bareTable: true })
    blocks.push({ type: 'note', text: `Expected total ${f(proj.total, 2)} touchdowns by tracked skill players (rushing and receiving), from the team model on this season and last. ${tot ? `Stored before kickoff: projection ${f(tot.projected, 2)}, line ${f(tot.line, 1)} (${tot.source === 'book' ? 'the book total' : 'our own number, counted in tracked skill-player touchdowns'}), rank ${tot.rank} of ${tot.of} on the slate${tot.called ? `, ${STATUS_WORD.called}` : ''}.` : 'No number was stored for this game.'}` })
  } else {
    blocks.push({ type: 'note', text: slate && ctx.logs ? 'No team-model number for this game: it is not on this week’s slate.' : 'No team-model number yet: it needs the week file and the game logs (nfl_logs.json).' })
  }
  // the defense vs position
  const ds = matchup ? defenseSeason(matchup, opp, slate?.season) : null
  const dv = matchup?.dvp?.season?.[opp] || null
  if (dv && ds) {
    const order = matchup.dvp_roles || Object.keys(dv)
    const rs = order.filter((r) => dv[r]).map((r) => ({ _key: r, role: r, td: cellRank(dv[r], 'td'), rec: cellRank(dv[r], 'recyd_g'), rush: cellRank(dv[r], 'rshyd_g'), rz: cellRank(dv[r], 'rz_tgts', 1) }))
    blocks.push({ type: 'table', id: 'mu-dvp', title: `${opp} defense vs position`, caption: `What ${opp}'s defense has allowed to each role, per game, with its rank of 32 (1 = allows the most).`, rows: rs, columns: DVP_COLS, initialSort: null, maxRows: 6, heat: 'sorted', rowOpen: null, bareTable: true })
    blocks.push({ type: 'note', text: `${opp} defense vs position: ${ds.label}${ds.current ? '' : '. Last season is shown because this season has fewer than three games for this defense.'}` })
  } else blocks.push({ type: 'note', text: `No defense-vs-position table for ${opp} yet (needs nfl_matchup.json).` })
  // pass rush and coverage
  const dis = matchup?.disruption_team
  if (dis?.[code] && dis?.[opp]) {
    const P = (c, k) => n(dis[c]?.pressure?.[k])
    const all = (k) => Object.values(dis).map((v) => n(v?.pressure?.[k]))
    const cell = (c, k, hi) => { const v = P(c, k); const r = leagueRank(all(k), v, { higherBetter: hi }); return v == null ? '—' : `${f(v, 1)}% · ${r ? ord(r.rank) : '—'}` }
    blocks.push({ type: 'table', id: 'mu-press', title: 'Pass rush vs protection', caption: 'Pressure each defense creates against pressure each offense allows (percent of dropbacks), with the rank of 32 (1 = best for that unit).', rows: [
      { _key: 'a', measure: `${code} rush vs ${opp} OL`, us: cell(code, 'created_pct', true), them: cell(opp, 'allowed_pct', false) },
      { _key: 'b', measure: `${opp} rush vs ${code} OL`, us: cell(opp, 'created_pct', true), them: cell(code, 'allowed_pct', false) },
    ], columns: VS_COLS('Rush created', 'OL allowed').map((c, i) => (i === 0 ? { ...c, w: 140 } : c)), initialSort: null, maxRows: 2, heat: 'sorted', rowOpen: null, bareTable: true })
  }
  const cor = matchup?.pass_game?.corners?.[opp]
  if (cor?.length) blocks.push({ type: 'table', id: 'mu-corners', title: `${opp} corners`, caption: `${opp}'s cornerbacks by spot (LCB, RCB, nickel): games, passes defended and interceptions, ${matchup.pass_game.corner_season}.`, rows: cor.map((c, i) => ({ _key: `${c.gsis_id}-${i}`, slot: c.slot, name: c.name, games: c.games, pd: c.pd, int: c.int })), columns: [
    { key: 'slot', label: 'Spot', w: 52, plain: true, heat: false, numeric: false, sticky: true, group: 'Corner' }, { key: 'name', label: 'Corner', w: 140, heat: false, numeric: false, bold: true, group: 'Corner' },
    { key: 'games', label: 'GP', w: 40, heat: false, group: 'Season' }, { key: 'pd', label: 'PD', w: 40, group: 'Season' }, { key: 'int', label: 'INT', w: 44, group: 'Season' },
  ], initialSort: null, maxRows: 4, heat: 'standouts', rowOpen: null, bareTable: true })
  const qid = matchup?.qb_pressure?.starter?.[code]; const q = qid ? matchup.qb_pressure.qbs?.[qid] : null
  if (q) blocks.push({ type: 'table', id: 'mu-qb', title: `${code} quarterback under pressure`, caption: `${q.name}, ${matchup.qb_pressure.season}: how often he was pressured, sacked and blitzed. Rank ${matchup.qb_pressure.rank?.[qid] ?? '—'} of ${matchup.qb_pressure.ranked} (1 = pressured most).`, rows: [{ _key: qid, player_id: qid, name: q.name, games: q.games, dropbacks: q.dropbacks, pressure: q.pressure_pct, sacks: q.sacks, hits: q.hits, blitzed: q.blitzed }], columns: [
    { key: 'name', label: 'QB', w: 140, heat: false, numeric: false, bold: true, sticky: true, group: 'QB', link: 'player', linkKey: 'player_id' }, { key: 'games', label: 'GP', w: 40, heat: false, group: 'Season' }, { key: 'dropbacks', label: 'Dropbacks', w: 76, heat: false, group: 'Season' },
    { key: 'pressure', label: 'Pressure %', w: 76, dp: 1, group: 'Pressure' }, { key: 'sacks', label: 'Sacks', w: 50, group: 'Pressure' }, { key: 'hits', label: 'Hits', w: 46, group: 'Pressure' }, { key: 'blitzed', label: 'Blitzed', w: 56, group: 'Pressure' },
  ], initialSort: null, maxRows: 1, heat: 'sorted', rowOpen: null, bareTable: true })
  return { id: 'matchup', label: m.label, n: null, state: 'ok', gameId: g.id, window: `${g.state === 'in' ? 'Game in progress' : 'Next game'} · Week ${g.week} · ${g.date} · ${g.home ? 'vs' : '@'} ${opp}${g.venue ? ` · ${g.venue}` : ''}`, blocks }
}

// ── TRENDS ──────────────────────────────────────────────────────────────────
const TREND_COLS = [
  { key: 'split', label: 'Split', w: 150, plain: true, heat: false, numeric: false, sticky: true, bold: true, group: 'Split' },
  { key: 'gp', label: 'GP', w: 40, heat: false, group: 'Record' },
  { key: 'recTxt', label: 'W-L-T', w: 70, heat: false, numeric: false, group: 'Record' },
  { key: 'pPct', label: 'Win %', w: 56, dp: 1, primary: true, group: 'Record' },
  { key: 'pf', label: 'PF', w: 44, group: 'Points' }, { key: 'pa', label: 'PA', w: 44, invert: true, group: 'Points' },
]
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 864e5)
function trendRow(label, gs) {
  if (!gs.length) return { _key: label, split: label, gp: 0, recTxt: '—', pPct: null, pf: null, pa: null }
  const w = gs.filter((g) => g.result === 'W').length; const t = gs.filter((g) => g.result === 'T').length; const l = gs.length - w - t
  return { _key: label, split: label, gp: gs.length, recTxt: `${w}-${l}${t ? `-${t}` : ''}`, pPct: Math.round((1000 * (w + t / 2)) / gs.length) / 10, pf: gs.reduce((a, g) => a + (g.us || 0), 0), pa: gs.reduce((a, g) => a + (g.them || 0), 0) }
}
function trendsSection(code, ctx) {
  const m = meta('trends')
  const all = (ctx.server?.schedule?.games || []).filter((g) => g.type === 2 || g.type === 3).sort((a, b) => String(a.startUtc).localeCompare(String(b.startUtc)))
  const done = all.filter((g) => g.state === 'post' && g.result)
  if (!done.length) return emptySection('trends', m.label, 'NO GAMES PLAYED', ctx.server ? `Splits need finished regular-season games on the club schedule (${ctx.slate?.season || 'this season'}).` : `Needs ${m.needs}.`)
  const idx = standingsIndex(ctx.st)
  const me = idx[code]
  const rest = new Map(); all.forEach((g, i) => { if (i > 0 && g.date && all[i - 1].date) rest.set(g.id, daysBetween(all[i - 1].date, g.date)) })
  const sameDiv = (g) => me && idx[g.opp]?.divName === me.divName
  const sameConf = (g) => me && idx[g.opp]?.confAbbr === me.confAbbr
  const rows = [
    trendRow('Home', done.filter((g) => g.home)), trendRow('Away', done.filter((g) => !g.home)), trendRow('Last 5', done.slice(-5)),
    me && trendRow(`vs ${me.divName}`, done.filter(sameDiv)), me && trendRow(`vs ${me.confAbbr}`, done.filter(sameConf)), me && trendRow(`vs ${me.confAbbr === 'AFC' ? 'NFC' : 'AFC'}`, done.filter((g) => idx[g.opp] && !sameConf(g))),
    trendRow('6 days or fewer rest', done.filter((g) => rest.has(g.id) && rest.get(g.id) <= 6)), trendRow('8 days or more rest', done.filter((g) => rest.has(g.id) && rest.get(g.id) >= 8)),
  ].filter(Boolean).filter((r) => r.gp > 0 || ['Home', 'Away', 'Last 5'].includes(r.split))
  return { id: 'trends', label: m.label, n: done.length, state: 'ok', window: windowLabel({ seasonLabel: String(ctx.slate?.season || ctx.server.season), n: done.length }), blocks: [
    { type: 'table', id: 'trend-splits', title: 'Splits', caption: 'The club’s record by split, with the games behind each.', rows, columns: TREND_COLS, initialSort: null, maxRows: 8, heat: 'standouts', rowOpen: null },
    { type: 'note', text: 'Rest is days since the club’s previous game, shown as a count with the games behind it. It is information; nothing here reads it as a lean. A row with a few games is a few games.' },
  ] }
}

// ── TENDENCIES & USAGE ──────────────────────────────────────────────────────
const OFF_KEYS = [['shotgun_pct', 'Shotgun %'], ['under_center_pct', 'Under center %'], ['pistol_pct', 'Pistol %'], ['motion_pct', 'Motion %'], ['no_huddle_pct', 'No-huddle %'], ['play_action_pct', 'Play-action %'], ['screen_pct', 'Screen %'], ['rpo_pct', 'RPO %'], ['heavy_box_faced_pct', 'Heavy box faced %']]
const DEF_KEYS = [['box_avg', 'Defenders in the box (avg)'], ['box8_pct', '8+ in the box %'], ['blitz_pct', 'Blitz %'], ['rushers_avg', 'Pass rushers (avg)']]
function tendencyRows(t, side, keys, code) {
  const me = t?.[side]?.[code]; const lg = t?.league?.[side]; const rank = t?.rank?.[side]?.[code]
  if (!me) return []
  const of = Object.keys(t[side]).length
  return keys.filter(([k]) => n(me[k]) != null).map(([k, label]) => ({ _key: `${side}-${k}`, label, val: me[k], valTxt: f(me[k], 1), lgv: lg?.[k], lgTxt: f(lg?.[k], 1), rankN: rank?.[k] ?? null, rankTxt: rank?.[k] != null ? `${ord(rank[k])} of ${of}` : '—', pct: rank?.[k] != null && of > 1 ? Math.round((100 * (of - rank[k])) / (of - 1)) : null }))
}
const SNAP_COLS = [
  { key: 'name', label: 'Player', w: 150, heat: false, numeric: false, sticky: true, bold: true, group: 'Player', link: 'player', linkKey: 'player_id' },
  { key: 'role', label: 'Role', w: 54, heat: false, group: 'Player' }, { key: 'games', label: 'GP', w: 40, heat: false, group: 'Snaps' },
  { key: 'snap', label: 'Snap %', w: 58, dp: 0, primary: true, group: 'Snaps' }, { key: 'recent', label: 'Last 3 %', w: 62, dp: 0, group: 'Snaps' }, { key: 'trend', label: 'Trend', w: 52, dp: 1, signed: true, group: 'Snaps' },
]
const RZ_COLS = [
  { key: 'name', label: 'Player', w: 150, heat: false, numeric: false, sticky: true, bold: true, group: 'Player', link: 'player', linkKey: 'player_id' },
  { key: 'role', label: 'Role', w: 54, heat: false, group: 'Player' }, { key: 'touches', label: 'RZ touches', w: 66, group: 'Red zone' }, { key: 'tds', label: 'TDs', w: 44, group: 'Red zone' }, { key: 'rate', label: 'TD rate %', w: 66, dp: 1, primary: true, group: 'Red zone' },
]
const TGT_COLS = [
  { key: 'name', label: 'Player', w: 150, heat: false, numeric: false, sticky: true, bold: true, group: 'Player', link: 'player', linkKey: 'player_id' },
  { key: 'position', label: 'Pos', w: 40, heat: false, group: 'Player' }, { key: 'games', label: 'GP', w: 40, heat: false, group: 'Targets' }, { key: 'tgt', label: 'Tgt', w: 44, group: 'Targets' }, { key: 'share', label: 'Share %', w: 60, dp: 1, primary: true, group: 'Targets' },
  { key: 'adot', label: 'aDOT', w: 50, dp: 1, group: 'Targets' }, { key: 'rec', label: 'Rec', w: 44, group: 'Targets' }, { key: 'yds', label: 'Yds', w: 48, group: 'Targets' }, { key: 'td', label: 'TD', w: 40, group: 'Targets' },
]
function specialSection(code, ctx) {
  const m = meta('special')
  const { matchup, slate } = ctx
  if (!matchup) return emptySection('special', m.label, 'NO TENDENCY DATA YET', `Needs ${m.needs}.`)
  const t = matchup.tendencies
  const roleOf = (id, pos) => roleLabel({ role: matchup.roles?.[id] && /^(RB|WR|TE)[1-3]$/.test(matchup.roles[id]) ? matchup.roles[id] : null, position: pos })
  const blocks = []
  const off = tendencyRows(t, 'offense', OFF_KEYS, code)
  const def = tendencyRows(t, 'defense', DEF_KEYS, code)
  if (off.length) blocks.push({ type: 'table', id: 'tend-off', title: 'Offence tendencies', caption: 'How the club’s offense plays: the club, the league mean and its rank (1 = highest).', rows: off, columns: STAT_COLS, initialSort: null, maxRows: 5, heat: 'standouts', rowOpen: null })
  if (def.length) blocks.push({ type: 'table', id: 'tend-def', title: 'Defence tendencies', caption: 'How the club’s defense lines up and rushes: the club, the league mean and its rank (1 = highest).', rows: def, columns: STAT_COLS, initialSort: null, maxRows: 4, heat: 'standouts', rowOpen: null })
  const dis = matchup.disruption_team; const cov = matchup.coverage_team
  if (dis?.[code] || cov?.[code]) {
    const lines = []
    const mk = (key, group, label, src, get, hi) => { const byClub = Object.fromEntries(Object.keys(src).map((c) => [c, get(src[c])])); lines.push(...clubLines([{ key, group, label, dp: 1, higherBetter: hi, byClub }], code)) }
    if (dis) { mk('created', 'Defence', 'Pressure created % of dropbacks', dis, (v) => n(v?.pressure?.created_pct), true); mk('allowed', 'Offence', 'Pressure allowed % of dropbacks', dis, (v) => n(v?.pressure?.allowed_pct), false) }
    if (cov) { mk('man', 'Defence', 'Man coverage % (pass plays faced)', cov, (v) => n(v?.man_pct), true); mk('zone', 'Defence', 'Zone coverage %', cov, (v) => n(v?.zone_pct), true) }
    blocks.push({ type: 'table', id: 'tend-press', title: 'Pressure and coverage', caption: 'Pass rush created, pressure allowed and the coverage the defense plays, with the rank of 32 (1 = highest; for pressure allowed, 1 = least).', rows: lines.filter((l) => l.value != null).map(lineRow), columns: STAT_COLS, initialSort: null, maxRows: 4, heat: 'standouts', rowOpen: null })
  }
  const mine = new Map((slate?.players || []).filter((p) => p.team === code).map((p) => [p.player_id, p]))
  const snaps = Object.entries(matchup.snaps || {}).filter(([, s]) => s.team === code && s.side === 'offense').sort((a, b) => (b[1].snap_pct ?? 0) - (a[1].snap_pct ?? 0)).slice(0, 12)
  if (snaps.length) blocks.push({ type: 'table', id: 'use-snaps', title: 'Snap leaders (offence)', caption: 'Share of the offense’s snaps this season, the last three games and the trend. Each row opens the player.', rows: snaps.map(([id, s]) => ({ _key: id, player_id: id, name: s.name, role: roleOf(id, s.position), games: s.games, snap: s.snap_pct, recent: s.recent_pct, trend: s.trend })), columns: SNAP_COLS, initialSort: { key: 'snap', dir: 'desc' }, maxRows: 6, heat: 'standouts', rowOpen: 'player', playerKey: 'player_id' })
  const rz = Object.entries(matchup.red_zone || {}).filter(([id]) => mine.has(id)).sort((a, b) => (b[1].touches ?? 0) - (a[1].touches ?? 0)).slice(0, 10)
  if (rz.length) blocks.push({ type: 'table', id: 'use-rz', title: 'Red-zone usage', caption: 'Red-zone touches, touchdowns and the share that scored, for players on this week’s file. Each row opens the player.', rows: rz.map(([id, r]) => ({ _key: id, player_id: id, name: r.name, role: roleLabel(mine.get(id)), touches: r.touches, tds: r.tds, rate: r.rate })), columns: RZ_COLS, initialSort: { key: 'touches', dir: 'desc' }, maxRows: 5, heat: 'standouts', rowOpen: 'player', playerKey: 'player_id' })
  const tg = matchup.pass_game?.targets?.[code]
  if (tg?.length) blocks.push({ type: 'table', id: 'use-targets', title: 'Target share', caption: `Targets by receiver, ${matchup.pass_game.season}: share of the club’s targets and the average depth of them. Each row opens the player.`, rows: tg.map((p) => ({ _key: p.player_id, ...p })), columns: TGT_COLS, initialSort: { key: 'share', dir: 'desc' }, maxRows: 6, heat: 'standouts', rowOpen: 'player', playerKey: 'player_id' })
  if (!blocks.length) return emptySection('special', m.label, 'NO TENDENCY DATA FOR THIS CLUB', `Needs ${m.needs}. The file has no row for ${code} yet.`)
  const tg0 = t?.offense?.[code]
  return { id: 'special', label: m.label, n: tg0?.games ?? null, state: 'ok', window: windowLabel({ seasonLabel: String(t?.season || matchup.season || ''), stale: Boolean(slate?.season && (t?.season || matchup.season) < slate.season), n: tg0?.games ?? null }), blocks: [...blocks, { type: 'note', text: 'Tendencies need 50 plays before a club is ranked. Snap and red-zone rows come from TUDDY’s weekly files; a missing row is a player it has no data on yet. Nothing here says what will happen.' }] }
}

// ── the builders: keyed by registry id (the extension point) ────────────────
function defenseSection(code, ctx) {
  const m = meta('defense')
  return { id: 'defense', label: m.label, window: `${ctx.slate?.season ?? ''} season`.trim(), n: null, state: 'ok', empty: null, blocks: [{ type: 'slot', slot: 'defense', props: { team: code, matchup: ctx.matchup, slateSeason: ctx.slate?.season ?? null } }] }
}

const BUILDERS = { defense: defenseSection, roster: playersSection, schedule: scheduleSection, stats: statsSection, calls: callsSection, matchup: matchupSection, trends: trendsSection, special: specialSection }

/** @returns {{ sport, header, sections }} -- sections in registry order, each 'ok' or an honest 'empty'. */
export function buildNflTeam({ team, slate = null, matchup = null, logs = null, st = null, server = null, archive = null, picks = null, gameCalls = null, statusOf = null }) {
  const code = String(team || '').toUpperCase()
  const ctx = { slate, matchup, logs, st, server, archive, picks, gameCalls, statusOf }
  const header = nflHeader(code, ctx)
  const sections = sectionsOf(SPORT).map((s) => (BUILDERS[s.id] ? BUILDERS[s.id](code, ctx) : emptySection(s.id, s.label, 'NOT BUILT', `Needs ${s.needs}.`)))
  return { sport: SPORT, header, sections }
}
