// 🏒 THE NHL TEAM PAGE, AS DATA (2026-10-10). Pure: payloads in, a view out (the contract is lib/team/contract.js).
//
//   payload  /api/lamp/team          standing, roster, season lines, the club schedule
//   deep     /api/lamp/teamdeep      league ranks, goalie xG, our calls, the next game's context
//   board    /api/lamp/board         tonight's board (the status words come from scoreNight, passed through, never re-derived)
//   form     /api/lamp/hotsticks     every skater's last 5 / last 10 (the Hot Sticks read, shared)
//
// Any of the four may be null (a feed delayed, a table not run yet): the sections that need it say so and name the data.
// Every section carries its window (the season, the part of it, the sample) so no number is read as another season's.
import { nhlTeam, nhlLogo, NHL_TEAMS } from '../nhl/teams'
import { arenaOf } from '../nhl/arenas'
import { sectionsOf } from './registry'
import { h2hTeamSection, rankWord, resultWord, windowLabel, emptySection, cardsSection } from './contract'
import { STAT_COLS, lineRow, txt } from './statLines'
import { clubShares, roundShare } from '../shares'
import { NHL_SHARE_COLS } from '../nhl/boardColumns'

const SPORT = 'nhl'
const n = (v) => (v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null)
const rec = (w, l, o) => `${w ?? 0}-${l ?? 0}-${o ?? 0}`
const ord = (k) => rankWord({ rank: k })
const f = (v, dp = 1) => (n(v) == null ? '—' : Number(v).toFixed(dp))

export const NHL_CLUBS = NHL_TEAMS.map((t) => t[0])

// ── the header ──────────────────────────────────────────────────────────────
const resultOfGame = (g) => (g.result === 'SOL' ? 'OTL' : g.result)
const gameLine = (g) => ({
  gameId: g.id, date: g.date, startUtc: g.startUtc, home: g.home, opp: g.opponent?.abbrev || null, venue: g.venue || null,
  result: resultOfGame(g), us: g.us?.score ?? null, them: g.opponent?.score ?? null, outcome: g.outcome || null, state: g.state, preseason: g.gameType === 1,
})

export function nhlHeader(team, payload, deep) {
  const t = nhlTeam(team)
  const s = payload?.standing || null
  const games = payload?.schedule?.games || []
  const played = games.filter((g) => g.state === 'final' && g.scheduleState === 'OK')
  const upcoming = games.filter((g) => g.state !== 'final' && g.scheduleState === 'OK')
  const live = games.find((g) => g.state === 'live') || null
  const stale = Boolean(payload?.standingStale)
  const confWord = t?.conference === 'E' ? 'East' : t?.conference === 'W' ? 'West' : null
  return {
    sport: SPORT, code: t?.abbrev || String(team || '').toUpperCase(), name: t?.name || null, nickname: t?.nickname || null,
    known: Boolean(t), logo: t ? nhlLogo(t.abbrev) : null,
    eyebrow: t ? `LAMP · TEAM · ${t.conference === 'E' ? 'EASTERN' : 'WESTERN'} · ${String(t.division).toUpperCase()}` : 'LAMP · TEAM',
    seasonLabel: payload?.standingSeason || deep?.season?.label || null, stale,
    record: s ? rec(s.w, s.l, s.otl) : null, points: s?.pts ?? null, diff: s?.diff ?? null,
    standing: s ? `${s.divRank != null ? ord(s.divRank) : '—'} in the ${s.divName}${s.confRank != null && confWord ? ` · ${ord(s.confRank)} in the ${confWord}` : ''}` : null,
    splits: s ? { home: rec(s.home.w, s.home.l, s.home.otl), road: rec(s.road.w, s.road.l, s.road.otl), l10: rec(s.l10.w, s.l10.l, s.l10.otl), gf: s.gf, ga: s.ga } : null,
    streak: s?.streak || null,
    live: live ? gameLine(live) : null,
    next: upcoming[0] ? gameLine(upcoming[0]) : null,
    last: played.length ? gameLine(played[played.length - 1]) : null,
    last5: played.slice(-5).map(gameLine),   // oldest to newest, left to right
  }
}

// ── columns, shared ─────────────────────────────────────────────────────────
const SKATER_COLS = [
  { key: 'number', label: '#', w: 34, heat: false, group: 'Player', fmt: (v) => (v == null ? '' : v) },
  { key: 'name', label: 'Player', w: 158, heat: false, sticky: true, bold: true, group: 'Player', link: 'player' },
  { key: 'pos', label: 'Pos', w: 38, heat: false, group: 'Player' },
  { key: 'age', label: 'Age', w: 38, heat: false, group: 'Player' },
  { key: 'gp', label: 'GP', w: 36, heat: false, group: 'Season' },
  { key: 'g', label: 'G', w: 34, group: 'Season' }, { key: 'a', label: 'A', w: 34, group: 'Season' }, { key: 'pts', label: 'PTS', w: 42, primary: true, group: 'Season' },
  { key: 'plusMinus', label: '+/-', w: 40, group: 'Season', signed: true }, { key: 'pim', label: 'PIM', w: 40, heat: false, group: 'Season' },
  { key: 'shots', label: 'S', w: 36, group: 'Season' }, { key: 'shPct', label: 'S%', w: 42, group: 'Season', kind: 'pct1' },
  { key: 'toi', label: 'TOI', w: 48, group: 'Season', kind: 'toi' }, { key: 'ppg', label: 'PPG', w: 40, group: 'Season' }, { key: 'gwg', label: 'GWG', w: 42, group: 'Season' },
  // SHARE OF CLUB (lib/shares.js, the board's own definitions): his ice time, shots and goals as a percent of this club's skaters
  ...NHL_SHARE_COLS.filter((c) => c.key !== 'sh_gp').map((c) => ({ ...c, group: 'Role & usage' })),
  { key: 'g5', label: 'L5 G', w: 42, group: 'Form' }, { key: 'sog5', label: 'L5 S', w: 42, group: 'Form' },
  { key: 'g10', label: 'L10 G', w: 46, group: 'Form' }, { key: 'sog10', label: 'L10 S', w: 46, group: 'Form' },
]
const GOALIE_COLS = [
  { key: 'number', label: '#', w: 34, heat: false, group: 'Goalie', fmt: (v) => (v == null ? '' : v) },
  { key: 'name', label: 'Goalie', w: 158, heat: false, sticky: true, bold: true, group: 'Goalie', link: 'player' },
  { key: 'age', label: 'Age', w: 38, heat: false, group: 'Goalie' },
  { key: 'gp', label: 'GP', w: 36, heat: false, group: 'Season' }, { key: 'gs', label: 'GS', w: 36, heat: false, group: 'Season' },
  { key: 'w', label: 'W', w: 34, group: 'Season' }, { key: 'l', label: 'L', w: 34, invert: true, group: 'Season' }, { key: 'otl', label: 'OTL', w: 40, heat: false, group: 'Season' },
  { key: 'gaa', label: 'GAA', w: 46, invert: true, dp: 2, group: 'Season' }, { key: 'svPct', label: 'SV%', w: 48, group: 'Season', kind: 'pct3', primary: true },
  { key: 'so', label: 'SO', w: 34, group: 'Season' }, { key: 'sa', label: 'SA', w: 42, heat: false, group: 'Season' },
]
const GSAX_COLS = [
  { key: 'xsa', label: 'xG SA', w: 50, heat: false, group: 'xG faced', title: 'Shots on goal at a goalie in the club-game xG table' },
  { key: 'xga', label: 'xGA', w: 48, kind: 'n1', heat: false, group: 'xG faced' },
  { key: 'xga_g', label: 'GA', w: 38, heat: false, group: 'xG faced' },
  { key: 'gsax', label: 'GSAx', w: 52, dp: 1, signed: true, primary: true, group: 'xG faced' },
]

// ── ROSTER ──────────────────────────────────────────────────────────────────
function rosterSection(team, payload, deep, board, form) {
  const meta = sectionsOf(SPORT).find((s) => s.id === 'roster')
  if (!payload?.roster?.length) return emptySection('roster', meta.label, 'NO ROSTER YET', `Needs ${meta.needs}.`)
  const stats = payload.stats
  const byId = new Map((stats?.skaters || []).concat(stats?.goalies || []).map((x) => [x.id, x]))
  const formUsable = Boolean(form?.rows?.length) && !form.stale && (!stats?.seasonLabel || form.seasonLabel === stats.seasonLabel)
  const formBy = new Map((formUsable ? form.rows : []).map((x) => [Number(x.id), x]))
  const status = new Map()
  for (const g of board?.games || []) for (const r of g.rows || []) if (r.team === team) status.set(Number(r.playerId), { status: r.status, rank: r.rank, score: r.score })
  const age = (ymd) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd || ''); if (!m) return null; const now = new Date(); let a = now.getUTCFullYear() - +m[1]; if (now.getUTCMonth() + 1 < +m[2] || (now.getUTCMonth() + 1 === +m[2] && now.getUTCDate() < +m[3])) a -= 1; return a }
  // the club page's lines are this club's only (a man traded in-season counts the games with this club): numerator and denominator on one page
  const shareBy = clubShares((stats?.skaters || []).map((s) => ({ id: s.id, gp: s.gp, toi: s.toi, shots: s.shots, g: s.g })))
  const rows = (group) => payload.roster.filter((r) => r.group === group).map((r) => {
    const line = byId.get(r.id) || {}
    const sh = shareBy.get(String(r.id)) || {}
    const h = formBy.get(Number(r.id)) || {}
    const st = status.get(Number(r.id))
    return { ...line, id: r.id, _key: r.id, number: r.number, name: r.name, pos: r.pos, age: age(r.birthDate), status: st?.status || null, sh_toi: roundShare(sh.toi), sh_shots: roundShare(sh.shots), sh_goals: roundShare(sh.goals), g5: h.g5 ?? null, sog5: h.sog5 ?? null, g10: h.g10 ?? null, sog10: h.sog10 ?? null }
  })
  const fwd = rows('forwards'); const def = rows('defensemen'); const gk = rows('goalies')
  const withLine = [...fwd, ...def, ...gk].filter((r) => r.gp != null).length
  const stale = Boolean(payload.statsStale)
  const onBoard = board ? [...status.values()].filter((s) => s.status === 'called' || s.status === 'board').length : null
  const blocks = []
  for (const [title, rs, cols, sort] of [['Forwards', fwd, SKATER_COLS, 'pts'], ['Defence', def, SKATER_COLS, 'pts'], ['Goalies', gk, GOALIE_COLS, 'gp']]) {
    if (rs.length) blocks.push({ type: 'table', id: `roster-${title.toLowerCase()}`, title: `${title} · ${rs.length}`, caption: `${title}: season line, last 5 and last 10, and tonight's board status. Each row opens the player.`, rows: rs, columns: cols, initialSort: { key: sort, dir: 'desc' }, maxRows: 10, heat: 'standouts', rowOpen: 'player', statusKey: title === 'Goalies' ? null : 'status' })
  }
  blocks.push({ type: 'note', text: `A blank line is a player with no NHL games for this club that season (a new signing, a call-up). L5 / L10 come from the league's per-game report and need three games in the last five weeks. ${board ? '' : 'Tonight’s board status is not loaded yet, so the status column is empty. '}${formUsable ? '' : 'Last 5 / last 10 is left blank until this season\u2019s per-game report has games for it.'}`.trim() })
  return {
    id: 'roster', label: meta.label, n: payload.roster.length, state: 'ok',
    window: windowLabel({ seasonLabel: stats?.seasonLabel, stale, n: withLine, unit: 'players with a line' }),
    status: board ? `${onBoard} on tonight's board` : null, blocks,
  }
}

// ── SCHEDULE ────────────────────────────────────────────────────────────────
const GAME_COLS = [
  { key: 't', label: 'Date', plain: true, w: 92, heat: false, numeric: false, sticky: true, kind: 'day', group: 'Game' },
  { key: 'oppText', label: 'Opponent', w: 104, heat: false, numeric: false, group: 'Game', link: 'team', linkKey: 'opp' },
  { key: 'resultTxt', label: 'Result', w: 126, heat: false, numeric: false, kind: 'result', group: 'Result' },
  { key: 'venue', label: 'Arena', w: 150, heat: false, numeric: false, group: 'Where' },
]
function gameRow(g, team) {
  const done = g.state === 'final'
  const word = resultOfGame(g)
  return {
    _key: g.id, gameId: g.id, t: Date.parse(g.startUtc || g.date), date: g.date, startUtc: g.startUtc, opp: g.opponent.abbrev, oppText: `${g.home ? 'vs' : '@'} ${g.opponent.abbrev}`,
    pre: g.gameType === 1, live: g.state === 'live', done,
    resultTxt: done ? `${word} ${g.us?.score ?? '–'}–${g.opponent?.score ?? '–'}${g.outcome && g.outcome !== 'REG' ? ` (${g.outcome})` : ''}` : g.state === 'live' ? `LIVE ${g.us?.score ?? 0}–${g.opponent?.score ?? 0}` : null,
    venue: g.venue || (g.home ? arenaOf(team)?.name : null) || null,
  }
}
function scheduleSection(team, payload) {
  const meta = sectionsOf(SPORT).find((s) => s.id === 'schedule')
  const games = (payload?.schedule?.games || []).filter((g) => g.scheduleState === 'OK')
  if (!games.length) return emptySection('schedule', meta.label, 'NO SCHEDULE', `Needs ${meta.needs}.`)
  const done = games.filter((g) => g.state === 'final').map((g) => gameRow(g, team)).sort((a, b) => b.t - a.t)
  const ahead = games.filter((g) => g.state !== 'final').map((g) => gameRow(g, team)).sort((a, b) => a.t - b.t)
  const blocks = []
  if (ahead.length) blocks.push({ type: 'table', id: 'sched-ahead', title: `Upcoming · ${ahead.length}`, caption: 'Upcoming games, soonest first. Each row opens the game.', rows: ahead, columns: GAME_COLS, initialSort: { key: 't', dir: 'asc' }, maxRows: 6, heat: 'sorted', rowOpen: 'game', bareTable: true })
  if (done.length) blocks.push({ type: 'table', id: 'sched-done', title: `Results · ${done.length}`, caption: 'Finished games, latest first. Each row opens the game.', rows: done, columns: GAME_COLS, initialSort: { key: 't', dir: 'desc' }, maxRows: 6, heat: 'sorted', rowOpen: 'game', bareTable: true })
  return { id: 'schedule', label: meta.label, n: games.length, state: 'ok', window: windowLabel({ seasonLabel: payload.schedule?.seasonLabel, part: 'schedule incl. preseason', n: games.length }), blocks }
}

// ── STATS & RANKS ───────────────────────────────────────────────────────────
function statsSection(deep) {
  const meta = sectionsOf(SPORT).find((s) => s.id === 'stats')
  const lines = (deep?.lines || []).filter((l) => l.value != null)
  if (!lines.length) return emptySection('stats', meta.label, 'NO TEAM NUMBERS YET', `Needs ${meta.needs}. No club has a game in the league report for ${deep?.season?.label || 'this season'}.`)
  const blocks = []
  for (const g of ['Offence', 'Defence', 'Overall']) {
    const rs = lines.filter((l) => l.group === g)
    if (rs.length) blocks.push({ type: 'table', id: `stats-${g.toLowerCase()}`, title: g, caption: `${g}: this club's number, the league mean, and its rank of 32 (1 = best, so fewest against).`, rows: rs.map(lineRow), columns: STAT_COLS, initialSort: { key: 'pct', dir: 'desc' }, maxRows: 8, heat: 'standouts', rowOpen: null, valueDp: true })
  }
  const xgMissing = !deep?.xg?.available
  blocks.push({ type: 'note', text: `Per-game numbers from the league's team report${xgMissing ? '' : ' and our club-game xG table (xG counts shots on goal at a goalie, empty net left off)'}. ${xgMissing ? 'xG for and against need the club-game xG table (lamp_team_game_xg); it has no rows for this season yet, so those two lines are not shown. ' : ''}A percentile is the share of the other 31 clubs this club is better than on that stat; it describes the season so far, with the games played shown above.` })
  return { id: 'stats', label: meta.label, n: deep?.gp ?? null, state: 'ok', window: windowLabel({ seasonLabel: deep?.season?.label, stale: deep?.season?.stale, n: deep?.gp ?? null }), blocks }
}

// ── OUR CALLS ───────────────────────────────────────────────────────────────
const VER_COLS = [
  { key: 'version', label: 'Model version', plain: true, w: 150, heat: false, numeric: false, sticky: true, group: 'Model' },
  { key: 'n', label: 'Graded', w: 60, heat: false, group: 'Calls' },
  { key: 'hit', label: 'Hit', w: 44, group: 'Calls' },
  { key: 'rate', label: 'Rate %', w: 62, dp: 1, primary: true, group: 'Calls' },
  { key: 'range', label: '95% range', w: 98, heat: false, numeric: false, group: 'Calls' },
]
const CALL_COLS = [
  { key: 'date', label: 'Date', plain: true, w: 88, heat: false, numeric: false, sticky: true, kind: 'day', group: 'Call' },
  { key: 'name', label: 'Skater', w: 150, heat: false, numeric: false, bold: true, group: 'Call', link: 'player', linkKey: 'playerId' },
  { key: 'oppText', label: 'Opponent', w: 90, heat: false, numeric: false, group: 'Call', link: 'team', linkKey: 'opp' },
  { key: 'word', label: 'Result', w: 112, heat: false, numeric: false, group: 'Graded' },
  { key: 'goals', label: 'Goals', w: 52, heat: false, group: 'Graded' },
]
function callsSection(team, deep) {
  const meta = sectionsOf(SPORT).find((s) => s.id === 'calls')
  const c = deep?.calls
  const w = windowLabel({ seasonLabel: deep?.season?.label, stale: deep?.season?.stale, n: c?.total ?? 0, unit: 'CALLED picks' })
  if (!c || !c.available) return emptySection('calls', meta.label, 'GOAL LOG NOT AVAILABLE', `Needs ${meta.needs}. It could not be read just now.`)
  if (!c.total) return emptySection('calls', meta.label, 'NO CALLS ON THIS CLUB YET', `No skater of ${team} has been CALLED on the regular-season board in ${deep?.season?.label || 'this season'} yet. Calls are fixed before puck drop and graded after the game.`, w)
  const blocks = [
    { type: 'table', id: 'calls-version', title: 'Hit rate of our calls on this club', caption: 'CALLED picks on this club’s skaters, graded after the game, by model version. Never pooled across versions.', rows: c.versions.map((v) => ({ _key: v.version, version: `${v.version}${v.current ? ' (current)' : ''}`, n: v.n, hit: v.hit, rate: v.rate, range: v.range ? `${v.range[0]}–${v.range[1]}%` : '—' })), columns: VER_COLS, initialSort: { key: 'n', dir: 'desc' }, maxRows: 4, heat: 'sorted', rowOpen: null, bareTable: true },
    { type: 'table', id: 'calls-last', title: `Last ${c.last.length} calls`, caption: 'The most recent CALLED picks on this club, with the graded result. Each row opens the skater.', rows: c.last.map((r) => ({ _key: `${r.gameId}-${r.playerId}`, date: r.date, name: r.name, playerId: r.playerId, opp: r.opp, oppText: `vs ${r.opp}`, word: resultWord(r.result), goals: r.result === 'void' || !r.result ? null : r.goals })), columns: CALL_COLS, initialSort: { key: 'date', dir: 'desc' }, maxRows: 5, heat: 'sorted', rowOpen: 'player', playerKey: 'playerId', bareTable: true },
    { type: 'note', text: 'Information only: this is how the board’s past CALLED picks on this club’s skaters turned out. Each rate carries its sample and a 95% range; a small sample is a wide range. Did not play is a skater who was not in the lineup; it is not a miss and not in the rate. ' + `On this club: ${c.dnp} did not play, ${c.pending} not graded yet.`  },
  ]
  return { id: 'calls', label: meta.label, n: c.graded, state: 'ok', window: w, blocks }
}

// ── NEXT GAME ───────────────────────────────────────────────────────────────
const VS_COLS = (a, b) => [
  { key: 'measure', label: 'Measure', plain: true, w: 134, heat: false, numeric: false, sticky: true, group: 'Measure' },
  { key: 'us', label: a, w: 104, heat: false, numeric: false, group: 'Club' },
  { key: 'them', label: b, w: 104, heat: false, numeric: false, group: 'Opponent' },
]
function matchupSection(team, deep) {
  const meta = sectionsOf(SPORT).find((s) => s.id === 'matchup')
  const nx = deep?.next
  if (!nx) return emptySection('matchup', meta.label, 'NO GAME AHEAD', deep ? `${team} has no scheduled game left on the club schedule.` : `Needs ${meta.needs}.`)
  const opp = nx.game.opp
  const mine = Object.fromEntries((deep.lines || []).map((l) => [l.key, l]))
  const theirs = Object.fromEntries((nx.oppLines || []).map((l) => [l.key, l]))
  const cell = (l) => (!l || l.value == null ? '—' : `${txt(l, l.value)} · ${l.rank ? rankWord(l.rank) : '—'}`)
  const pair = (label, a, b) => (mine[a]?.value != null || theirs[b]?.value != null ? { _key: `${a}-${b}`, measure: label, us: cell(mine[a]), them: cell(theirs[b]) } : null)
  const attack = [pair('Goals / game', 'gfPg', 'gaPg'), pair('Shots / game', 'sfPg', 'saPg'), pair('xG / game', 'xgPg', 'xgaPg'), pair('Power play vs kill %', 'ppPct', 'pkPct')].filter(Boolean)
  const defend = [pair('Goals / game', 'gaPg', 'gfPg'), pair('Shots / game', 'saPg', 'sfPg'), pair('xG / game', 'xgaPg', 'xgPg'), pair('Kill vs power play %', 'pkPct', 'ppPct')].filter(Boolean)
  const blocks = []
  if (attack.length) blocks.push({ type: 'table', id: 'mu-attack', title: `${team} attack vs ${opp} defense`, caption: `${team}'s attack against ${opp}'s defence: the number and its rank of 32 (1 = best).`, rows: attack.map((r) => ({ ...r })), columns: VS_COLS(`${team} (O)`, `${opp} (D)`), initialSort: null, maxRows: 5, heat: 'sorted', rowOpen: null, bareTable: true })
  if (defend.length) blocks.push({ type: 'table', id: 'mu-defence', title: `${opp} attack vs ${team} defense`, caption: `${opp}'s attack against ${team}'s defense, the same way round.`, rows: defend.map((r) => ({ ...r, us: r.us, them: r.them })), columns: VS_COLS(`${opp} (O)`, `${team} (D)`), initialSort: null, maxRows: 5, heat: 'sorted', rowOpen: null, bareTable: true })
  // the team model's expected goals and the stored line
  const p = nx.proj
  if (p) {
    const src = p.source === 'xg' ? 'our club-game xG model' : 'a plain goals-per-game rate from the standings (the xG table has no rows for these clubs yet)'
    blocks.push({ type: 'table', id: 'mu-model', title: 'Team model: expected goals', caption: 'The team model’s expected goals for each side. An expected number, not a pick and not a probability.', rows: [p.away, p.home].map((s) => ({ _key: s.team, club: s.team, goals: s.goals, shots: s.shots ?? null, games: s.games ?? null })), columns: [
      { key: 'club', label: 'Club', plain: true, w: 90, heat: false, numeric: false, sticky: true, group: 'Side', link: 'team', linkKey: 'club' },
      { key: 'goals', label: 'Exp. goals', w: 76, dp: 2, primary: true, group: 'Model' }, { key: 'shots', label: 'Exp. shots', w: 76, dp: 1, group: 'Model' }, { key: 'games', label: 'Games in window', w: 100, heat: false, group: 'Model' },
    ], initialSort: null, maxRows: 2, heat: 'sorted', rowOpen: null, bareTable: true })
    blocks.push({ type: 'note', text: `Expected total ${f(p.total, 2)} goals, from ${src}. ${nx.book ? `The line stored before puck drop: ${f(nx.book.line, 1)} (${nx.book.source === 'book' ? 'the book total' : 'our own number'}).` : 'No line was stored for this game.'}` })
  } else {
    blocks.push({ type: 'note', text: `No team-model number for this game yet: it needs the club-game xG table (lamp_team_game_xg) or this season's standings.` })
  }
  const g = nx.game
  // the opposing net: the opponent's side of the game
  blocks.push({ type: 'weak', game: { id: g.id, date: g.date, away: g.away, home: g.homeAbbrev, season: g.season, state: g.state }, sides: [g.home ? 'away' : 'home'], label: `${opp} GOALIE WEAK SPOTS` })
  return { id: 'matchup', label: meta.label, n: null, state: 'ok', window: `${g.state === 'live' ? 'Game in progress' : 'Next game'} · ${g.date} · ${g.home ? 'vs' : '@'} ${opp}${g.venue ? ` · ${g.venue}` : ''}`, gameId: g.id, blocks }
}

// ── TRENDS ──────────────────────────────────────────────────────────────────
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 864e5)
const TREND_COLS = [
  { key: 'split', label: 'Split', plain: true, w: 156, heat: false, numeric: false, sticky: true, bold: true, group: 'Split' },
  { key: 'gp', label: 'GP', w: 40, heat: false, group: 'Record' },
  { key: 'recTxt', label: 'W-L-OTL', w: 78, heat: false, numeric: false, group: 'Record' },
  { key: 'pPct', label: 'Pts %', w: 56, dp: 1, primary: true, group: 'Record' },
  { key: 'gf', label: 'GF', w: 40, group: 'Goals' }, { key: 'ga', label: 'GA', w: 40, invert: true, group: 'Goals' },
]
function trendRow(label, gs) {
  if (!gs.length) return { _key: label, split: label, gp: 0, recTxt: '—', pPct: null, gf: null, ga: null }
  const w = gs.filter((g) => g.result === 'W').length
  const otl = gs.filter((g) => g.result === 'OTL' || g.result === 'SOL').length
  const l = gs.length - w - otl
  return { _key: label, split: label, gp: gs.length, recTxt: `${w}-${l}-${otl}`, pPct: Math.round((1000 * (2 * w + otl)) / (2 * gs.length)) / 10, gf: gs.reduce((a, g) => a + (g.us?.score || 0), 0), ga: gs.reduce((a, g) => a + (g.opponent?.score || 0), 0) }
}
function trendsSection(team, payload) {
  const meta = sectionsOf(SPORT).find((s) => s.id === 'trends')
  const all = (payload?.schedule?.games || []).filter((g) => g.scheduleState === 'OK')
  const reg = all.filter((g) => g.gameType === 2)
  const done = reg.filter((g) => g.state === 'final' && g.us?.score != null).sort((a, b) => String(a.startUtc).localeCompare(String(b.startUtc)))
  if (!done.length) return emptySection('trends', meta.label, 'NO REGULAR-SEASON GAMES PLAYED', `Splits need finished regular-season games on the club schedule (${payload?.schedule?.seasonLabel || 'this season'}); preseason is left out.`)
  const t = nhlTeam(team)
  const oppIs = (g) => nhlTeam(g.opponent?.abbrev)
  // rest: calendar days since the club's previous game (any type), 0 = back-to-back
  const sortedAll = all.slice().sort((a, b) => String(a.startUtc).localeCompare(String(b.startUtc)))
  const restOf = new Map()
  sortedAll.forEach((g, i) => { if (i > 0 && sortedAll[i - 1].date && g.date) restOf.set(g.id, daysBetween(sortedAll[i - 1].date, g.date) - 1) })
  const rows = [
    trendRow('Home', done.filter((g) => g.home)), trendRow('Away', done.filter((g) => !g.home)),
    trendRow('Last 10', done.slice(-10)),
    trendRow(`vs ${t?.division || 'division'}`, done.filter((g) => oppIs(g)?.division === t?.division)),
    trendRow(`vs ${t?.conference === 'E' ? 'East' : 'West'}`, done.filter((g) => oppIs(g)?.conference === t?.conference)),
    trendRow(`vs ${t?.conference === 'E' ? 'West' : 'East'}`, done.filter((g) => oppIs(g) && oppIs(g).conference !== t?.conference)),
    trendRow('Back-to-back', done.filter((g) => restOf.get(g.id) === 0)),
    trendRow('1+ days off', done.filter((g) => (restOf.get(g.id) ?? -1) >= 1)),
  ].filter((r) => r.gp > 0 || ['Home', 'Away', 'Last 10'].includes(r.split))
  return {
    id: 'trends', label: meta.label, n: done.length, state: 'ok',
    window: windowLabel({ seasonLabel: payload.schedule?.seasonLabel, n: done.length }),
    blocks: [
      { type: 'table', id: 'trend-splits', title: 'Splits', caption: 'The club’s regular-season record by split, with the games behind each.', rows, columns: TREND_COLS, initialSort: null, maxRows: 8, heat: 'standouts', rowOpen: null },
      { type: 'note', text: 'Rest is shown as a count only. Our look at back-to-backs found no reliable lean either way, so nothing here reads it as one. Each row is the games behind it; a row with a few games is a few games.' },
    ],
  }
}

// ── GOALIES ─────────────────────────────────────────────────────────────────
// The club's goalies, one table: season line (GP, GS, W-L-OTL, GAA, SV%), the xG faced line, and tonight's CONFIRMED
// starter when the board has this club's game. Then the club's rest as numbers (a count and its games, no lean), then
// each goalie's weak zones and his injury chip (the slot, components/lamp/TeamGoalies.js), then the club's Out list.
// Starters: the board's own (lib/nhl/goalieSource -> boardRead); 'expected' is never shown as a starter.
const STARTER_COL = { key: 'starter', label: 'Tonight', w: 82, heat: false, group: 'Goalie', title: 'CONFIRMED = the club has named him as tonight’s starter (ESPN, via the board). Blank = not named, or this club has no game on the board.' }
const REST_COLS = [
  { key: 'next', label: 'Next game', w: 120, heat: false, sticky: true, bold: true, group: 'Club rest' },
  { key: 'rest', label: 'Days off', w: 62, heat: false, group: 'Club rest', title: 'Calendar days between the club’s previous game and its next one. 0 is a back-to-back.' },
  { key: 'g7', label: 'GP 7d', w: 54, heat: false, group: 'Club rest', title: 'Club games in the 7 days before the next game' },
  { key: 'g14', label: 'GP 14d', w: 58, heat: false, group: 'Club rest', title: 'Club games in the 14 days before the next game' },
]
function clubRest(payload) {
  const all = (payload?.schedule?.games || []).filter((g) => g.scheduleState === 'OK' && g.date).sort((a, b) => String(a.startUtc).localeCompare(String(b.startUtc)))
  const ix = all.findIndex((g) => g.state !== 'final')
  if (ix < 0) return null
  const nxt = all[ix]; const prev = ix > 0 ? all[ix - 1] : null
  const within = (days) => all.filter((g, i) => i < ix && daysBetween(g.date, nxt.date) <= days).length
  return { next: `${nxt.home ? 'vs' : '@'} ${nxt.opponent?.abbrev || '—'} · ${nxt.date}`, rest: prev ? daysBetween(prev.date, nxt.date) - 1 : null, g7: within(7), g14: within(14) }
}
function boardStarter(team, board) {
  const bg = (board?.games || []).find((g) => g.game?.home?.abbrev === team || g.game?.away?.abbrev === team)
  if (!bg) return { onBoard: false, id: null }
  const e = bg.starters?.[bg.game.home.abbrev === team ? 'home' : 'away'] || null
  const id = e && e.confirmed === true ? String(e.playerId ?? e.id ?? '') : ''
  return { onBoard: true, id: /^\d{7}$/.test(id) ? id : null }
}
function goaliesSection(team, payload, deep, board) {
  const meta = sectionsOf(SPORT).find((s) => s.id === 'goalies')
  const stats = payload?.stats
  const roster = payload?.roster || []
  const gsax = new Map((deep?.goalies || []).map((g) => [Number(g.id), g]))
  const start = boardStarter(team, board)
  const goalies = roster.filter((r) => r.group === 'goalies').map((r) => {
    const line = (stats?.goalies || []).find((x) => x.id === r.id) || {}
    const x = gsax.get(Number(r.id)) || {}
    return { ...line, id: r.id, _key: r.id, number: r.number, name: r.name, starter: start.id && String(r.id) === start.id ? 'CONFIRMED' : '', xsa: x.sa ?? null, xga: x.xga ?? null, xga_g: x.ga ?? null, gsax: x.gsax ?? null }
  }).sort((a, b) => (b.gs ?? b.gp ?? -1) - (a.gs ?? a.gp ?? -1))
  if (!goalies.length) return emptySection('goalies', meta.label, 'NO GOALIES ON THE ROSTER FEED YET', `Needs ${meta.needs}.`)
  const cols = [...GOALIE_COLS.slice(0, 2), ...(start.onBoard ? [STARTER_COL] : []), ...GOALIE_COLS.slice(2), ...(goalies.some((g) => g.xsa != null) ? GSAX_COLS : [])]
  const blocks = [{ type: 'table', id: 'gk-goalies', title: `Goalies · ${goalies.length}`, caption: 'The club’s goalies: season line, tonight’s confirmed starter, and the expected-goals line from our club-game table. Each row opens the goalie.', rows: goalies, columns: cols, initialSort: { key: 'gp', dir: 'desc' }, maxRows: 6, heat: 'standouts', rowOpen: 'player' }]
  const rest = clubRest(payload)
  if (rest) blocks.push({ type: 'table', id: 'gk-rest', title: 'Club rest before the next game', caption: 'Days off and games played, as counts. Our look at back-to-backs found no reliable lean either way, so nothing here reads it as one.', rows: [{ _key: 'rest', ...rest }], columns: REST_COLS, initialSort: null, maxRows: 2, heat: 'none', rowOpen: null })
  const season = payload?.season?.id ?? null
  blocks.push({ type: 'slot', slot: 'goalieReads', props: { team, season, goalies: goalies.filter((g) => /^\d{7}$/.test(String(g.id))).slice(0, 4).map((g) => ({ id: String(g.id), name: g.name, team })) } })
  blocks.push({ type: 'slot', slot: 'injuries', props: { clubs: [team] } })
  blocks.push({ type: 'note', text: `${start.onBoard ? 'The starter is the one the club has named (CONFIRMED); an unnamed starter is left blank, never guessed.' : 'This club has no game on the board right now, so no starter is shown.'} GSAx is the xG a goalie faced minus the goals he allowed, over shots on goal at a goalie (empty-net goals left off): a positive number is fewer goals than those shots usually bring. It is a measure of the games played, with the shots behind it shown.` + (deep && !deep.xg?.available ? ' The xG lines need the club-game xG table (lamp_team_game_xg), which has no rows for this season yet.' : '') })
  return { id: 'goalies', label: meta.label, n: goalies.length, state: 'ok', window: windowLabel({ seasonLabel: deep?.season?.label || stats?.seasonLabel, stale: deep?.season?.stale ?? payload?.statsStale, n: deep?.gp ?? null }), blocks }
}

// ── SPECIAL TEAMS ───────────────────────────────────────────────────────────
function specialSection(team, payload, deep) {
  const meta = sectionsOf(SPORT).find((s) => s.id === 'special')
  const stats = payload?.stats
  const st = (deep?.lines || []).filter((l) => ['ppPct', 'ppOpp', 'ppGpg', 'pkPct', 'shPg'].includes(l.key) && l.value != null)
  if (!st.length) return emptySection('special', meta.label, 'NO SPECIAL-TEAMS DATA YET', `Needs ${meta.needs}.`)
  const blocks = [{ type: 'table', id: 'sp-special', title: 'Special teams', caption: 'Power play and penalty kill: the club’s number, the league mean and the rank of 32.', rows: st.map(lineRow), columns: STAT_COLS, initialSort: { key: 'pct', dir: 'desc' }, maxRows: 5, heat: 'standouts', rowOpen: null, valueDp: true }]
  return { id: 'special', label: meta.label, n: st.length, state: 'ok', window: windowLabel({ seasonLabel: deep?.season?.label || stats?.seasonLabel, stale: deep?.season?.stale ?? payload?.statsStale, n: deep?.gp ?? null }), blocks }
}

/**
 * @returns {{ header, sections }} -- sections in registry order, each 'ok' or an honest 'empty'.
 */
export function buildNhlTeam({ team, payload = null, deep = null, board = null, form = null }) {
  const code = String(team || '').toUpperCase()
  const header = nhlHeader(code, payload, deep)
  const builders = {
    roster: () => rosterSection(code, payload, deep, board, form),
    schedule: () => scheduleSection(code, payload),
    stats: () => statsSection(deep),
    calls: () => callsSection(code, deep),
    matchup: () => matchupSection(code, deep),
    trends: () => trendsSection(code, payload),
    goalies: () => goaliesSection(code, payload, deep, board),
    special: () => specialSection(code, payload, deep),
    h2h: () => h2hTeamSection(SPORT, code),
    cards: () => cardsSection(SPORT, code),
  }
  const sections = sectionsOf(SPORT).map((s) => builders[s.id]())
  return { sport: SPORT, header, sections }
}
