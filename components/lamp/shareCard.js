// THE LAMP SHARE CARDS (fix15, 2026-10-08): three downloads on the same card kit MOONSHOT and TUDDY use
// (lib/cards/kit.js, lib/cards/cards.js -- 1080 x 1350, one frame, the face, the club, the status word from
// lib/callStatus.js STATUS_WORD, the footer "DASH . LAMP"). Thin wrappers: each reshapes the data its tab
// already holds into a card and saves the PNG. Nothing is derived here that the screen did not already show --
// the score, the night rank, the status, the rates, the season line, the form and the team model's expected
// goals are the board row's own fields.
//   downloadLampPlayerCard   one skater              (the player page header)
//   downloadLampBoardCard    the top of the ranking  (Rankings, beside Filters / Ledger / Watchlist)
//   downloadLampGameCard     one game                (the Slate's game panel)
import { statPlayerCard, rankedCard } from '../../lib/cards/cards'
import { savePng, slug, stamp } from '../../lib/cards/kit'
import { nhlMug, fmtSec, fmt2 } from '../../lib/nhl/format'

// "7:00 PM EDT": the puck drop in the viewer's own zone, labelled once (components/lamp/ui.js does the same; this file stays free of JSX so the card harness can run it)
const dropWord = (utc) => { try { return new Date(utc).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }) } catch { return '' } }
const fail = (what) => (e) => { console.error(`LAMP share card (${what}) failed`, e) }
const POS = { C: 'Centre', L: 'Left wing', R: 'Right wing', D: 'Defence' }
const fin = (v) => (v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null)
const dp = (v, d) => (fin(v) == null ? null : Number(v).toFixed(d))
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`

// the rates a goal score is made of: shots, goals and ice time a game (the board row's legs), else his season line
function tilesOf(row, fr) {
  const gp = fin(fr?.gp)
  const spg = fin(row?.legs?.shotsPg) ?? (gp > 0 && fin(fr?.shots) != null ? fr.shots / gp : null)
  const gpg = fin(row?.legs?.goalsPg) ?? (gp > 0 && fin(fr?.g) != null ? fr.g / gp : null)
  const toi = fin(row?.legs?.toi) ?? fin(fr?.toi)
  const ppg = fin(row?.ppg) ?? fin(fr?.ppg)
  return [
    { label: 'SHOTS / GP', value: dp(spg, 2) },
    { label: 'GOALS / GP', value: dp(gpg, 2) },
    { label: 'ICE TIME', value: toi == null ? null : fmtSec(toi) },
    { label: 'PP GOALS', value: ppg == null ? null : String(ppg) },
  ]
}

/** One skater, off the player page. p = the player file, row = his row on tonight's goal board (or null), g = his board game (or null). */
export async function downloadLampPlayerCard({ p, row = null, g = null, fr = null, l5 = null, l10 = null, drought = null, where = '', board = false, seasonLabel = '', day = '' } = {}) {
  if (!p) return
  try {
    const status = row ? row.status : (board ? 'off' : null)
    const graded = Boolean(g?.graded && row)
    // the result once his game is graded: a goal wears the accent, a miss is outlined grey, a scratch is VOID
    const result = !graded ? null : row.dressed === false ? { word: 'VOID', hit: null }
      : row.hit === true ? { word: 'GOAL', hit: true, actual: fin(row.goals), actualLabel: 'GOALS' }
        : row.hit === false ? { word: 'MISS', hit: false, actual: fin(row.goals) ?? 0, actualLabel: 'GOALS' } : null
    // the page's own count (his game log) first, so the card agrees with the screen it came from; the board's as-of-tonight count if the log has none
    const dr = fin(drought) ?? fin(row?.form?.drought)
    const drPlus = fin(drought) == null && Boolean(row?.form?.droughtPlus)
    const facing = row?.context?.oppGoalie ? String(row.context.oppGoalie?.name || row.context.oppGoalie) : null
    const oppGa = fin(row?.context?.oppGaPg)
    const lines = [
      fr ? { label: seasonLabel ? `${seasonLabel} season` : 'This season', value: [fin(fr.g) != null ? `${fr.g} G` : null, fin(fr.a) != null ? `${fr.a} A` : null, fin(fr.pts) != null ? `${fr.pts} PTS` : null, fin(fr.gp) != null ? `${fr.gp} GP` : null].filter(Boolean).join(' · ') } : null,
      l5 != null || l10 != null ? { label: 'Goals, recent form', value: [l5 != null ? `L5 ${l5}` : null, l10 != null ? `L10 ${l10}` : null].filter(Boolean).join(' · '), hot: (l5 ?? 0) >= 3 } : null,
      dr != null ? { label: 'Since his last goal', value: dr === 0 ? 'scored last game' : `${plural(dr, 'game')}${drPlus ? '+' : ''}` } : null,
      oppGa != null || facing ? { label: 'Opposing net', value: [facing, oppGa != null ? `${fmt2(oppGa)} GA/G` : null].filter(Boolean).join(' · ') } : null,
    ].filter(Boolean)
    const card = await statPlayerCard('nhl', {
      label: 'Player card', day: day || '', name: p.name, team: p.team, where, id: p.id, photo: p.headshot, number: p.number,
      bits: [POS[p.pos] || p.pos, p.shoots ? `shoots ${p.shoots}` : null],
      status, score: fin(row?.score), scoreLabel: 'GOAL SCORE', rank: fin(row?.context?.nightRank), rankOf: fin(row?.context?.nightOf),
      tiles: tilesOf(row, fr), lines, result, pool: 'skaters',
    })
    savePng(card.c, `${slug(p.name, 'player')}_${stamp(day)}.png`)
  } catch (e) { fail('player')(e) }
}

const MARKET_WORD = { GOAL: 'GOAL', SOG: 'SHOTS 3+', PTS: 'POINTS 1+', AST: 'ASSISTS 1+' }
const RESULT_WORD = { GOAL: 'G', SOG: 'SOG', PTS: 'PTS', AST: 'AST' }
const countOf = (row, market) => { const n = market === 'GOAL' ? row.goals : row.value; return Number.isFinite(n) ? n : null }

// one board row for the ranked list; the game's own state decides whether a result goes on it
function rowOf(r, g, rank, market) {
  const base = { rank, name: r.name, team: r.team, opp: r.opp, where: `${r.home ? 'vs' : '@'} ${r.opp}`, photo: nhlMug(g.game.season, r.team, r.playerId), status: r.status, score: r.score }
  if (!g.graded || r.status === 'off') return base
  if (r.dressed === false) return { ...base, result: { text: 'VOID', hot: false }, miss: true }
  const n = countOf(r, market)
  if (n == null) return base
  return { ...base, result: { text: r.hit ? `${n} ${RESULT_WORD[market] || ''}`.trim() : 'MISS', hot: Boolean(r.hit) }, miss: !r.hit }
}
const leadLine = (r) => {
  const bits = []
  if (fin(r.legs?.shotsPg) != null) bits.push(`${fmt2(r.legs.shotsPg)} S/GP`)
  if (fin(r.legs?.goalsPg) != null) bits.push(`${fmt2(r.legs.goalsPg)} G/GP`)
  if (fin(r.legs?.toi) != null) bits.push(`${fmtSec(r.legs.toi)} TOI`)
  if (fin(r.ppg) != null) bits.push(`${r.ppg} PP G`)
  return bits.join('  ·  ')
}

/** The top of the ranking, as the table has it. items = [{ r, g }] in the order the table shows (best score first). */
export async function downloadLampBoardCard(items = [], { market = 'GOAL', date = '', total = null } = {}) {
  try {
    const ranked = items.filter((x) => x?.r && x.r.score != null)
    if (!ranked.length) return
    const [first, ...rest] = ranked
    const word = MARKET_WORD[market] || market
    const card = await rankedCard('nhl', {
      label: `Rankings · ${word}`, day: date, sub: `${total ?? ranked.length} ranked · LAMP's own ${word} score`,
      lead: { ...rowOf(first.r, first.g, 1, market), scoreLabel: `${word} SCORE`, line: leadLine(first.r) },
      rows: rest.map((x, i) => rowOf(x.r, x.g, i + 2, market)), total: total ?? ranked.length,
    })
    savePng(card.c, `rankings-${slug(word)}_${stamp(date)}.png`)
  } catch (e) { fail('rankings')(e) }
}

/** One game: the two clubs, the team model's expected goals for each, and the skaters on the board (the calls first). */
export async function downloadLampGameCard(g, { date = '' } = {}) {
  if (!g?.game) return
  try {
    const away = g.game.away.abbrev, home = g.game.home.abbrev
    const st = g.game.state
    const when = st === 'final' ? `FINAL ${g.game.away.score ?? 0}–${g.game.home.score ?? 0}` : st === 'live' ? (g.game.statusLine || 'LIVE') : dropWord(g.game.startUtc)
    const p = g.proj
    const proj = p && Number.isFinite(p.away?.goals) && Number.isFinite(p.home?.goals)
      ? { label: 'EXPECTED GOALS' /* allow-probability: the team model's projected count of goals (lib/nhl/teamProj.js), not a probability */, away: p.away.goals.toFixed(1), home: p.home.goals.toFixed(1), total: Number.isFinite(p.total) ? p.total.toFixed(1) : null } : null
    const on = g.rows.filter((r) => r.status !== 'off' && r.score != null)
      .sort((a, b) => (a.status === 'called' ? 0 : 1) - (b.status === 'called' ? 0 : 1) || (b.score ?? 0) - (a.score ?? 0)).slice(0, 6)
    const card = await rankedCard('nhl', {
      label: 'Game card', day: date || g.game.date || '', sub: `${away} @ ${home} · ${g.locked ? 'calls locked' : g.setting ? 'calls setting' : 'a preview, not a call yet'}`,
      banner: { away, home, when, proj }, rows: on.map((r, i) => rowOf(r, g, i + 1, 'GOAL')), total: on.length,
      empty: 'No skater in this game has played enough NHL games to be on the board.',
    })
    savePng(card.c, `game-${slug(away)}-${slug(home)}_${stamp(date || g.game.date)}.png`)
  } catch (e) { fail('game')(e) }
}
