// THE TUDDY PICK CARD (fix14, 2026-10-08): one NFL pick, pregame or graded, on
// the same card kit as MOONSHOT's (lib/cards: 1080 x 1350, one frame, one
// header, one footer, the product's accent, his face and his club's logo).
// PREGAME vs GRADED is still decided by the DATA: a `hit` (true / false /
// null-for-void) makes it a result card, otherwise it is the pregame case.
//
// Shape of `pick`:
//   name, team, opp, position   who, and against whom
//   espnId                      his photo (the player row's espn_id), when there is one
//   market, marketLabel         which of the seven markets (lib/nfl/theme.js MARKETS)
//   rank, bar                   this rung's position on the card, and the market's bar
//   questionable, low_sample    the flags Picks.js already renders
//   status                      'called' | 'board' | 'off' when the caller knows it (lib/callStatus)
//   score                       0-100, pregame mode when present
//   hit, actual, void, grade    graded mode when `hit` is present; `actual` the stat that graded it
import { pickCard, rankedCard } from '../../lib/cards/cards'
import { savePng, slug, stamp } from '../../lib/cards/kit'

export async function downloadNflPickCard(pick = {}) {
  const graded = pick.hit === true || pick.hit === false || pick.void === true
  try {
    const card = await pickCard('nfl', pick)
    savePng(card.c, `${graded ? 'result' : 'pick'}-${slug(pick.market, 'pick')}-${slug(pick.name, 'pick')}_${stamp(pick.day || '')}.png`)
  } catch (e) { console.error('pick card failed', e) }
}

// ── THE RANKINGS CARD AND THE GAME CARD (Wave 8, 2026-10-11; parity rows card.rankings / card.game) ──────────────
// The same kit LAMP's two cards use (lib/cards/cards.js rankedCard): the top of TUDDY's Anytime TD ranking, and one
// game with the clubs, the team model's expected touchdowns and the men on its board. Thin wrappers: each reshapes
// the rows the page already holds. The status word is lib/callStatus's (tdStatusFor/statusOf hands it in); the TD
// score is the board row's own number, said as TUDDY's own ranking and never as a probability. A graded row wears
// its result with the same dignity either way: a touchdown wears the accent, a miss is outlined grey, a man who
// did not play is VOID; nothing is drawn before his game is final. Public-safe: only fields the public board prints.
import { TD_WORD } from '../../lib/nfl/teamTdModel'

const fin = (v) => (v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null)

/** His result once his game is final: { text, hot } | { text:'VOID' } | null before that. results = nfl_results.json (lines by player id). */
export function nflTdResult(p, game, results) {
  if (!game?.completed || !results?.lines) return null
  const line = results.lines[String(p?.player_id)]
  if (!line) return null
  if (!Object.keys(line).length) return { text: 'VOID', hot: false, miss: true }
  const td = fin(line.TD) ?? 0
  return td > 0 ? { text: `${td} TD`, hot: true, miss: false } : { text: 'MISS', hot: false, miss: true }
}

const gameOf = (games, p) => (games || []).find((g) => g.home === p?.team || g.away === p?.team) || null
const whereOf = (g, p) => (g && p?.opp ? `${g.home === p.team ? 'vs' : '@'} ${p.opp}` : p?.opp ? `vs ${p.opp}` : '')

/** One board row for the ranked list. item = { p, status, rank }. */
export function nflRowOf(item, games, results) {
  const { p, status, rank } = item
  const g = gameOf(games, p)
  const res = nflTdResult(p, g, results)
  const base = { rank, name: p.name, team: p.team, opp: p.opp, where: whereOf(g, p), espnId: p.espn_id, id: p.player_id, status, score: fin(p.scores?.TD) }
  return res ? { ...base, result: { text: res.text, hot: res.hot }, miss: res.miss } : base
}

/** The top of the TD ranking as the table has it. items = [{ p, status, rank }] in table order; the first leads the card. */
export async function downloadNflBoardCard(items = [], { games = [], results = null, date = '', total = null, week = null } = {}) {
  try {
    const ranked = items.filter((x) => x?.p && fin(x.p.scores?.TD) != null)
    if (!ranked.length) return
    const [first, ...rest] = ranked
    const card = await rankedCard('nfl', {
      label: 'Rankings · Anytime TD', day: date, sub: `${total ?? ranked.length} ranked${week ? ` · week ${week}` : ''} · TUDDY's own touchdown score`,
      lead: { ...nflRowOf(first, games, results), scoreLabel: 'TD SCORE', line: [first.p.position, first.p.jersey_number ? `#${first.p.jersey_number}` : null].filter(Boolean).join('  ·  ') },
      rows: rest.map((x) => nflRowOf(x, games, results)), total: total ?? ranked.length,
    })
    savePng(card.c, `rankings-anytime-td_${stamp(date)}.png`)
  } catch (e) { console.error('TUDDY share card (rankings) failed', e) }
}

/** One game: the two clubs, the team model's expected touchdowns for each, and the men on the board (the calls first). rows = [{ p, status, rank }]. */
export async function downloadNflGameCard(g, { rows = [], total = null, games = [], results = null, date = '' } = {}) {
  if (!g) return
  try {
    const when = g.completed ? `FINAL ${g.away_score ?? 0}–${g.home_score ?? 0}` : g.state === 'in' ? `${g.away_score ?? 0}–${g.home_score ?? 0} · ${g.detail || 'LIVE'}` : (g.kickoff ? new Date(g.kickoff).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }) : '')
    const proj = total && Number.isFinite(total.awayTd) && Number.isFinite(total.homeTd)
      ? { label: TD_WORD.toUpperCase() /* allow-probability: the team model's projected count of touchdowns (lib/nfl/teamTdModel.js), not a probability */, away: total.awayTd.toFixed(1), home: total.homeTd.toFixed(1), total: Number.isFinite(total.total) ? total.total.toFixed(1) : null } : null
    const on = rows.filter((x) => x?.p && x.status !== 'off' && fin(x.p.scores?.TD) != null)
      .sort((a, b) => (a.status === 'called' ? 0 : 1) - (b.status === 'called' ? 0 : 1) || (fin(b.p.scores.TD) ?? 0) - (fin(a.p.scores.TD) ?? 0)).slice(0, 6)
    const card = await rankedCard('nfl', {
      label: 'Game card', day: date, sub: `${g.away} @ ${g.home}${g.completed ? '' : ' · calls set before kickoff'}`,
      banner: { away: g.away, home: g.home, when, proj }, rows: on.map((x, i) => nflRowOf({ ...x, rank: i + 1 }, games.length ? games : [g], results)), total: on.length,
      empty: 'No player in this game is on the board.',
    })
    savePng(card.c, `game-${slug(g.away)}-${slug(g.home)}_${stamp(date)}.png`)
  } catch (e) { console.error('TUDDY share card (game) failed', e) }
}
