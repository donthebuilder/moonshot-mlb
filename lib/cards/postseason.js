// THE POSTSEASON MODEL (pure: no I/O, no JSX, safe for scripts and the browser). 2026-10-12, Donovan: "post season card editions with players post season stats".
// Every number here is MLB StatsAPI's own, read with gameType=P (lib/cards/postseasonData.js does the reading); this file only shapes and adds them up:
//   postseasonLine(player)   one player's postseason edition: tiles for the front, a back table by round, this postseason's total, career postseason
//   roundSplits(log, group)  his game log (one split per game, each carries its own gameType F / D / L / W) summed by round
//   careerPostseason(stat)   the league's career postseason line
//   seriesEdition(team)      one club's run: series results by round, W-L, leaders, and its players' lines
// WHAT IS NEVER DONE: a rate that the league did not print is computed ONLY from counting stats it did (AVG = H / AB, OBP, SLG, ERA = ER x 27 / outs,
// WHIP); a figure the source does not hold is '—', never a guess; no probability and no model score is printed here (these are results, not calls).
import { BRAND } from '../routes'

// ── rounds ────────────────────────────────────────────────────────────────
/** Game types the schedule and the game log carry for a postseason game, in the order they are played. */
export const ROUNDS = Object.freeze([
  { type: 'F', short: 'WC', name: 'Wild Card Series', word: 'WILD CARD' },
  { type: 'D', short: 'DS', name: 'Division Series', word: 'DIVISION SERIES' },
  { type: 'L', short: 'LCS', name: 'League Championship Series', word: 'LEAGUE CHAMPIONSHIP' },
  { type: 'W', short: 'WS', name: 'World Series', word: 'WORLD SERIES' },
])
export const ROUND_TYPES = ROUNDS.map((r) => r.type)
export const roundOf = (type) => ROUNDS.find((r) => r.type === String(type || '').toUpperCase()) || null
/** 'NLCS' / 'ALDS' / 'AL WC' / 'WORLD SERIES' from a game type and the club's league ('AL' | 'NL'; unknown league = no prefix). */
export function roundTag(type, league) {
  const t = String(type || '').toUpperCase()
  const lg = /^(AL|NL)$/.test(String(league || '')) ? String(league) : ''
  if (t === 'W') return 'WORLD SERIES'
  if (t === 'L') return `${lg}CS`
  if (t === 'D') return `${lg}DS`
  if (t === 'F') return `${lg ? `${lg} ` : ''}WILD CARD`
  return ''
}
/** The short row label of a round on a stat table: 'NLCS', 'ALDS', 'ALWC', 'WS' (no league prefix when the league is unknown: 'CS', 'DS', 'WC'). */
export function rowTag(type, league) {
  const t = String(type || '').toUpperCase()
  const lg = /^(AL|NL)$/.test(String(league || '')) ? String(league) : ''
  return t === 'W' ? 'WS' : t === 'L' ? `${lg}CS` : t === 'D' ? `${lg}DS` : t === 'F' ? `${lg}WC` : ''
}
/** 'AL' | 'NL' from the league name the StatsAPI prints ('American League'), or ''. */
export const leagueCode = (name) => (/^american/i.test(String(name || '')) ? 'AL' : /^national/i.test(String(name || '')) ? 'NL' : '')

// ── number words ──────────────────────────────────────────────────────────
const toN = (v) => { if (v == null || v === '' || v === '-.--' || v === '.---') return null; const n = Number(v); return Number.isFinite(n) ? n : null }
const int = (v) => toN(v) ?? 0
export const dash = '—'
/** Innings as the league writes them ('6.1' = six and a third) to outs. null when it is not an innings string. */
export function outsOf(ip) {
  if (ip == null || ip === '') return null
  const m = /^(\d+)(?:\.([012]))?$/.exec(String(ip).trim())
  return m ? Number(m[1]) * 3 + Number(m[2] || 0) : null
}
/** Outs back to the league's innings string: 19 -> '6.1'. */
export const ipOf = (outs) => (outs == null ? dash : `${Math.floor(outs / 3)}.${outs % 3}`)
/** A batting rate to the league's three digits: 8/19 -> '.421'; 1.605 stays '1.605'; no denominator = '—'. */
export function rate3(num, den) {
  if (!(den > 0)) return dash
  const v = num / den
  return v >= 1 ? v.toFixed(3) : v.toFixed(3).replace(/^0/, '')
}
const rateStr = (v) => { const n = Number(v); if (!Number.isFinite(n)) return dash; return n >= 1 ? n.toFixed(3) : n.toFixed(3).replace(/^0/, '') }
const two = (v) => (Number.isFinite(v) ? v.toFixed(2) : dash)

// ── hitting ───────────────────────────────────────────────────────────────
const HIT_KEYS = ['gamesPlayed', 'plateAppearances', 'atBats', 'runs', 'hits', 'doubles', 'triples', 'homeRuns', 'rbi', 'baseOnBalls', 'strikeOuts', 'hitByPitch', 'sacFlies', 'totalBases', 'stolenBases']
/** Counting stats of one StatsAPI hitting stat object (a game split, a season, a career) as plain integers. */
export const hitCounts = (s) => Object.fromEntries(HIT_KEYS.map((k) => [k, int(s?.[k])]))
/** Several counting objects added up (a round = its games). */
export const addCounts = (list, keys) => Object.fromEntries(keys.map((k) => [k, list.reduce((a, c) => a + (c?.[k] || 0), 0)]))
/** A hitting line for display from counting stats; the rates are computed from them (the league's formulas). */
export function hitLine(c) {
  const ab = c.atBats, h = c.hits, bb = c.baseOnBalls, hbp = c.hitByPitch, sf = c.sacFlies, tb = c.totalBases
  const obpDen = ab + bb + hbp + sf
  const avg = rate3(h, ab), obp = rate3(h + bb + hbp, obpDen), slg = rate3(tb, ab)
  const ops = ab > 0 && obpDen > 0 ? rateStr((h + bb + hbp) / obpDen + tb / ab) : dash
  return { g: String(c.gamesPlayed), pa: String(c.plateAppearances), ab: String(ab), r: String(c.runs), h: String(h), hr: String(c.homeRuns), rbi: String(c.rbi), bb: String(bb), k: String(c.strikeOuts), sb: String(c.stolenBases), avg, obp, slg, ops }
}
/** The league's own printed line for a season / career stat object (used for the TOTAL row: it is the league's number, never ours). */
export function hitLineOf(s) {
  const c = hitCounts(s)
  const mine = hitLine(c)
  return { ...mine, avg: s?.avg && /\d/.test(s.avg) ? s.avg : mine.avg, obp: s?.obp && /\d/.test(s.obp) ? s.obp : mine.obp, slg: s?.slg && /\d/.test(s.slg) ? s.slg : mine.slg, ops: s?.ops && /\d/.test(s.ops) ? s.ops : mine.ops }
}

// ── pitching ──────────────────────────────────────────────────────────────
const PIT_KEYS = ['gamesPlayed', 'gamesStarted', 'wins', 'losses', 'saves', 'holds', 'earnedRuns', 'runs', 'hits', 'baseOnBalls', 'strikeOuts', 'homeRuns', 'battersFaced', 'outs']
export function pitCounts(s) {
  const c = Object.fromEntries(PIT_KEYS.map((k) => [k, int(s?.[k])]))
  const o = outsOf(s?.inningsPitched)
  if (o != null) c.outs = o
  return c
}
/** A pitching line for display; ERA and WHIP computed from the counting stats (ER x 27 / outs, (BB + H) x 3 / outs). */
export function pitLine(c) {
  const o = c.outs
  return {
    g: String(c.gamesPlayed), gs: String(c.gamesStarted), wl: `${c.wins}-${c.losses}`, sv: String(c.saves), hld: String(c.holds), ip: ipOf(o), h: String(c.hits), r: String(c.runs), er: String(c.earnedRuns), bb: String(c.baseOnBalls), k: String(c.strikeOuts), hr: String(c.homeRuns),
    era: o > 0 ? two((c.earnedRuns * 27) / o) : dash, whip: o > 0 ? two(((c.baseOnBalls + c.hits) * 3) / o) : dash,
  }
}
export function pitLineOf(s) {
  const c = pitCounts(s)
  const mine = pitLine(c)
  return { ...mine, era: s?.era && /\d/.test(s.era) ? s.era : mine.era, whip: s?.whip && /\d/.test(s.whip) ? s.whip : mine.whip }
}

// ── the group's columns (the back table) ──────────────────────────────────
// [head, weight, key]: the same shape lib/cards/playerBack.js draws.
export const COLS = Object.freeze({
  hitting: [['RD', 2.2, 'rd'], ['G', 1, 'g'], ['H', 1, 'h'], ['R', 1, 'r'], ['HR', 1, 'hr'], ['RBI', 1.1, 'rbi'], ['BB', 1, 'bb'], ['K', 1, 'k'], ['AVG', 1.3, 'avg'], ['OBP', 1.3, 'obp'], ['SLG', 1.3, 'slg'], ['OPS', 1.4, 'ops']],
  pitching: [['RD', 2.2, 'rd'], ['G', 1, 'g'], ['GS', 1, 'gs'], ['W-L', 1.3, 'wl'], ['SV', 1, 'sv'], ['IP', 1.4, 'ip'], ['H', 1, 'h'], ['ER', 1, 'er'], ['BB', 1, 'bb'], ['K', 1, 'k'], ['ERA', 1.4, 'era'], ['WHIP', 1.4, 'whip']],
})

/**
 * His game log summed by round. `log` = the StatsAPI gameLog splits (each: { date, gameType, stat }), `group` = 'hitting' | 'pitching'.
 * Returns [{ type, short, name, games, line }] for the rounds he played, in playing order. A split with a game type that is not F/D/L/W is ignored.
 */
export function roundSplits(log, group = 'hitting') {
  const keys = group === 'pitching' ? PIT_KEYS : HIT_KEYS
  const cnt = group === 'pitching' ? pitCounts : hitCounts
  const out = []
  for (const r of ROUNDS) {
    const rows = (log || []).filter((s) => String(s?.gameType || '').toUpperCase() === r.type)
    if (!rows.length) continue
    const c = addCounts(rows.map((s) => cnt(s.stat)), keys)
    c.gamesPlayed = rows.length
    out.push({ type: r.type, short: r.short, name: r.name, games: rows.length, counts: c, line: group === 'pitching' ? pitLine(c) : hitLine(c) })
  }
  return out
}

/** The league's career postseason line as a display row (null when he has none). */
export function careerPostseason(stat, group = 'hitting') {
  if (!stat || !(int(stat.gamesPlayed) > 0)) return null
  return group === 'pitching' ? pitLineOf(stat) : hitLineOf(stat)
}

// ── the front's tiles ─────────────────────────────────────────────────────
export function tilesOf(line, group, counts) {
  if (group === 'pitching') {
    return [
      { label: 'ERA', value: line.era, sub: `${line.er} ER in ${line.ip} IP` },
      { label: 'WHIP', value: line.whip, sub: `${counts.hits} H · ${counts.baseOnBalls} BB` },
      { label: 'STRIKEOUTS', value: line.k, sub: `in ${line.g} G` },
      { label: 'INNINGS', value: line.ip, sub: `${line.gs} start${line.gs === '1' ? '' : 's'}` },
      { label: 'W-L', value: line.wl, sub: `${line.sv} save${line.sv === '1' ? '' : 's'}${Number(line.hld) ? ` · ${line.hld} hold${line.hld === '1' ? '' : 's'}` : ''}` },
      { label: 'HOME RUNS ALLOWED', value: line.hr, sub: `${counts.battersFaced} batters faced` },
    ]
  }
  return [
    { label: 'AVG', value: line.avg, sub: `${line.h} for ${line.ab}` },
    { label: 'OPS', value: line.ops, sub: `OBP ${line.obp} · SLG ${line.slg}` },
    { label: 'HOME RUNS', value: line.hr, sub: `in ${line.g} G` },
    { label: 'RBI', value: line.rbi, sub: `${line.r} runs scored` },
    { label: 'HITS', value: line.h, sub: `${counts.doubles} 2B · ${counts.triples} 3B` },
    { label: 'BB / K', value: `${line.bb} / ${line.k}`, sub: `${line.pa} plate appearances` },
  ]
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const dayWord = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || '')); return m ? `${MON[+m[2] - 1]} ${+m[3]}` : '' }
export { dayWord }

/**
 * ONE PLAYER'S POSTSEASON EDITION. `player` is the normalized read of the StatsAPI (lib/cards/postseasonData.js loadPostseasonPlayer; the check
 * script builds one from TEST rows):
 *   { id, name, pos, team (club code), teamName, league 'AL'|'NL'|'', number, season,
 *     bio: [[label, value]], face, logo, logoPlate, tone,                       pictures as data URIs ('' = none)
 *     hitting | pitching: { season: stat|null, log: [split], career: stat|null } }
 * Returns { ok:true, model } or { ok:false, status:404, why } when he has no postseason game in `season` (never an empty card).
 */
export function postseasonLine(player, { group = null } = {}) {
  const p = player || {}
  const has = (g) => int(p[g]?.season?.gamesPlayed) > 0 || (p[g]?.log || []).length > 0
  const pick = group && has(group) ? group : /^P$|^SP$|^RP$/.test(String(p.pos || '')) ? (has('pitching') ? 'pitching' : has('hitting') ? 'hitting' : null) : has('hitting') ? 'hitting' : has('pitching') ? 'pitching' : null
  if (!pick) return { ok: false, status: 404, why: `no postseason games for ${p.name || 'this player'} in ${p.season || 'this season'}` }
  const side = p[pick]
  const log = [...(side.log || [])].sort((a, b) => String(a.date).localeCompare(String(b.date)))
  const rounds = roundSplits(log, pick)
  // the TOTAL row is the league's season line; if the league sent none, it is the sum of the rounds (still real counting stats)
  const sumCounts = addCounts(rounds.map((r) => r.counts), pick === 'pitching' ? PIT_KEYS : HIT_KEYS)
  const total = side.season && int(side.season.gamesPlayed) > 0 ? (pick === 'pitching' ? pitLineOf(side.season) : hitLineOf(side.season)) : (pick === 'pitching' ? pitLine(sumCounts) : hitLine(sumCounts))
  const totalCounts = side.season && int(side.season.gamesPlayed) > 0 ? (pick === 'pitching' ? pitCounts(side.season) : hitCounts(side.season)) : sumCounts
  const career = careerPostseason(side.career, pick)
  const last = log[log.length - 1] || null
  const lastRound = last ? roundOf(last.gameType) : null
  const tag = lastRound ? roundTag(last.gameType, p.league) : ''
  const games = int(side.season?.gamesPlayed) || log.length
  const rows = rounds.map((r) => ({ season: r.short, rd: rowTag(r.type, p.league), ...r.line }))
  const word = pick === 'pitching' ? 'PITCHING' : 'HITTING'
  const model = {
    sport: 'mlb', kind: 'postseason', brand: { sport: 'mlb', name: BRAND.mlb.name, league: BRAND.mlb.league },
    group: pick, id: String(p.id), playerId: String(p.id), name: p.name, pos: p.pos || null, number: toN(p.number), team: p.team, teamName: p.teamName || p.team, club: p.teamName || '', league: p.league || '',
    face: p.face || '', logo: p.logo || '', logoPlate: Boolean(p.logoPlate), tone: p.tone || null,
    season: String(p.season || ''), games, roundTag: tag, roundName: lastRound?.name || '', roundsPlayed: rounds.map((r) => r.short),
    tiles: tilesOf(total, pick, totalCounts), total, career,
    last: last ? { date: last.date, dayWord: dayWord(last.date), opp: last.opponent?.name || '', oppId: last.opponent?.id || null, isHome: last.isHome ?? null, round: tag, summary: String(last.stat?.summary || ''), gamePk: last.game?.gamePk || null, counts: pick === 'pitching' ? pitCounts(last.stat) : hitCounts(last.stat), ip: last.stat?.inningsPitched || null } : null,
    back: {
      bio: (p.bio || []).filter(([, v]) => v), cols: COLS[pick], rows, career, careerLabel: 'CAREER POSTSEASON', title: `${p.season || ''} POSTSEASON ${word}`.trim(),
      totalRow: { season: 'TOTAL', rd: 'TOTAL', ...total }, rowH: rounds.length <= 2 ? 66 : 58, range: rounds.length ? rounds.map((r) => rowTag(r.type, p.league)).join(' · ') : '', kicker: 'POSTSEASON EDITION',
      panelTitle: 'LATEST GAME', panelLine: last ? [dayWord(last.date), last.opponent?.name ? `${last.isHome === false ? '@' : 'vs'} ${last.opponent.name}` : '', last.stat?.summary].filter(Boolean).join(' · ') : '',
      panelSub: tag,
      note: `${p.season || ''} postseason, regular-season games excluded. Career postseason is the league's, every year.`,
    },
    dayWord: dayWord(last?.date) ? `${tag || 'POSTSEASON'} · ${dayWord(last.date)}` : (tag || 'POSTSEASON'),
  }
  return { ok: true, model }
}

// ── the team's run ────────────────────────────────────────────────────────
/**
 * Series results of one club from the postseason schedule. `games` = StatsAPI schedule games (gameType F/D/L/W) that include the club, each
 * { gamePk, officialDate, gameType, seriesDescription, gamesInSeries, status:{abstractGameState}, teams:{away,home:{team:{id,name},score,isWinner}} }.
 * A series is DECIDED when one side has the wins a best-of-N needs (N = gamesInSeries); otherwise it is 'live' with the live count.
 */
export function seriesResults(games, teamId, nameOf = (t) => t?.name || '') {
  const by = new Map()
  for (const g of [...(games || [])].sort((a, b) => String(a.officialDate || a.gameDate).localeCompare(String(b.officialDate || b.gameDate)) || (a.gamePk - b.gamePk))) {
    if (!roundOf(g.gameType)) continue
    const mine = g.teams?.home?.team?.id === teamId ? g.teams.home : g.teams?.away?.team?.id === teamId ? g.teams.away : null
    if (!mine) continue
    const other = mine === g.teams.home ? g.teams.away : g.teams.home
    const key = `${g.gameType}|${g.seriesDescription || ''}|${other.team?.id}`
    const s = by.get(key) || { type: g.gameType, desc: g.seriesDescription || '', oppId: other.team?.id, opp: nameOf(other.team), best: Number(g.gamesInSeries) || null, w: 0, l: 0, played: 0, last: null }
    if (g.status?.abstractGameState === 'Final' && (mine.isWinner === true || mine.isWinner === false)) {
      s.played += 1
      if (mine.isWinner) s.w += 1; else s.l += 1
      s.last = g.officialDate || g.gameDate
    }
    by.set(key, s)
  }
  const need = (best) => (best ? Math.floor(best / 2) + 1 : null)
  return [...by.values()].filter((s) => s.played > 0).map((s) => {
    const n = need(s.best)
    const status = n && s.w >= n ? 'won' : n && s.l >= n ? 'lost' : 'live'
    return { ...s, status, score: `${s.w}-${s.l}`, word: status === 'won' ? `WON ${s.w}-${s.l}` : status === 'lost' ? `LOST ${s.l}-${s.w}` : s.w > s.l ? `LEADS ${s.w}-${s.l}` : s.l > s.w ? `TRAILS ${s.w}-${s.l}` : `TIED ${s.w}-${s.l}` }
  })
}

const tieWord = (n) => (n > 1 ? ` +${n - 1} tied` : '')
/** The leader of a counting stat among `rows` ([{ name, ...counts }]): { name, value, tied } or null when nobody has one. Ties are said, never broken by a guess. */
export function leaderOf(rows, key, { floor = 1 } = {}) {
  const live = (rows || []).filter((r) => (r[key] || 0) >= floor)
  if (!live.length) return null
  const top = Math.max(...live.map((r) => r[key]))
  const lead = live.filter((r) => r[key] === top).sort((a, b) => String(a.name).localeCompare(String(b.name)))
  return { name: lead[0].name, id: lead[0].id, value: top, tied: lead.length - 1, word: `${lead[0].name}${tieWord(lead.length)}` }
}

/**
 * THE TEAM / SERIES EDITION. `team` = { code, name, id, league, logo, logoPlate, tone, season, games:[schedule games], hitters:[{ id, name, ...hit stat }],
 * pitchers:[{ id, name, ...pit stat }] } (players already filtered to the club). Returns { ok, model } or a 404 when the club has no postseason game.
 */
export function seriesEdition(team, nameOf) {
  const t = team || {}
  const series = seriesResults(t.games, t.id, nameOf)
  if (!series.length) return { ok: false, status: 404, why: `no postseason games for ${t.name || 'this club'} in ${t.season || 'this season'}` }
  const wins = series.reduce((a, s) => a + s.w, 0), losses = series.reduce((a, s) => a + s.l, 0)
  const lastS = series[series.length - 1]
  const lg = t.league || ''
  const tagOf = (s) => roundTag(s.type, lg)
  const status = lastS.status === 'lost' ? { key: 'out', word: `OUT IN THE ${tagOf(lastS)}` }
    : lastS.status === 'won' && lastS.type === 'W' ? { key: 'champ', word: 'WORLD SERIES CHAMPIONS' }
    : lastS.status === 'won' ? { key: 'won', word: `WON THE ${tagOf(lastS)}` }
    : { key: 'live', word: `IN THE ${tagOf(lastS)}` }
  const hit = (t.hitters || []).map((p) => ({ id: p.id, name: p.name, ...hitCounts(p.stat), stat: p.stat }))
  const pit = (t.pitchers || []).map((p) => ({ id: p.id, name: p.name, ...pitCounts(p.stat), stat: p.stat }))
  const leaders = [
    ['HOME RUNS', leaderOf(hit, 'homeRuns')], ['RBI', leaderOf(hit, 'rbi')], ['HITS', leaderOf(hit, 'hits')], ['STRIKEOUTS', leaderOf(pit, 'strikeOuts')],
  ].filter(([, l]) => l).map(([label, l]) => ({ label: l.tied ? `${label} (TIED)` : label, name: l.name, id: l.id, value: String(l.value), tied: l.tied, word: l.tied ? `${l.name} +${l.tied}` : l.name }))
  // the table lists run in a stated order (HR, then H, then RBI, then name): it is an order of results, not a ranking of quality
  const topHit = [...hit].sort((a, b) => b.homeRuns - a.homeRuns || b.hits - a.hits || b.rbi - a.rbi || String(a.name).localeCompare(String(b.name))).slice(0, 6)
  const topPit = [...pit].sort((a, b) => b.strikeOuts - a.strikeOuts || b.outs - a.outs || String(a.name).localeCompare(String(b.name))).slice(0, 3)
  const model = {
    sport: 'mlb', kind: 'series', brand: { sport: 'mlb', name: BRAND.mlb.name, league: BRAND.mlb.league },
    team: t.code, teamName: t.name, season: String(t.season || ''), league: lg, logo: t.logo || '', logoPlate: Boolean(t.logoPlate), tone: t.tone || null,
    record: { w: wins, l: losses, word: `${wins}-${losses}` }, status,
    series: series.map((s) => ({ tag: tagOf(s), round: roundOf(s.type).word, opp: s.opp, oppId: s.oppId, word: s.word, status: s.status, games: s.played })),
    leaders,
    hitters: topHit.map((p) => ({ id: p.id, name: p.name, face: p.face || '', ...hitLineOf(p.stat) })),
    pitchers: topPit.map((p) => ({ id: p.id, name: p.name, face: p.face || '', ...pitLineOf(p.stat) })),
    order: 'listed by home runs, then hits, then RBI; pitchers by strikeouts',
    dayWord: `${t.season || ''} POSTSEASON`.trim(),
  }
  return { ok: true, model }
}

