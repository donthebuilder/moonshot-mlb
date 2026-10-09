// THE BUCKETS SHARE CARDS (fix15, 2026-10-08): the same three downloads LAMP has, on the same card kit
// (lib/cards/kit.js, lib/cards/cards.js -- 1080 x 1350, the face, the club, the status word from
// lib/callStatus.js STATUS_WORD, the footer "DASH . BUCKETS"). Thin wrappers over data the tab already holds:
// the board row's score, night rank and status, the player's per-game PTS / REB / AST, the projected points
// (lib/nba/expectedPoints.js -- a measured projection of a box-score count, shown as xPTS) and the team model's
// expected points for a game (lib/nba/teamModel.js). The buttons exist only once BUCKETS is public
// (components/CardButton.js reads lib/routes.js isHiddenSport).
//   downloadBucketsPlayerCard   one player              (the player page header)
//   downloadBucketsBoardCard    the top of the ranking  (Rankings, beside Filters / Ledger / Watchlist)
//   downloadBucketsGameCard     one game                (the Slate's game panel)
import { statPlayerCard, rankedCard } from '../../lib/cards/cards'
import { savePng, slug, stamp } from '../../lib/cards/kit'
import { NBA_MARKETS, LEG_LABEL, fmtLeg, ACTUAL_WORD } from '../../lib/nba/legs'
import { EXPECTED_POINTS_WORDS } from '../../lib/nba/teamModel'

// "7:00 PM EDT": the tip in the viewer's own zone, labelled once (components/buckets/ui.js does the same; this file stays free of JSX so the card harness can run it)
const tipWord = (iso) => { try { return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }) } catch { return '' } }
const fail = (what) => (e) => { console.error(`BUCKETS share card (${what}) failed`, e) }
const fin = (v) => (v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null)
const d1 = (v) => (fin(v) == null ? null : Number(v).toFixed(1))
const mean = (rows, k) => { const xs = rows.map((r) => fin(r[k])).filter((v) => v != null); return xs.length ? xs.reduce((t, v) => t + v, 0) / xs.length : null }

/** One player, off the player page. card = the athlete card, lines = his season lines, row = his row on tonight's points board (or null). */
export async function downloadBucketsPlayerCard({ card, row = null, game = null, season = null, last5 = [], xpts = null, where = '', board = false, rankOf = null, seasonWord = '', day = '' } = {}) {
  if (!card) return
  try {
    const status = row ? row.status : (board ? 'off' : null)
    const graded = Boolean(row && game?.state === 'final')
    const result = !graded ? null : row.voidReason ? { word: 'VOID', hit: null }
      : row.hit === true ? { word: 'HIT', hit: true, actual: fin(row.actual), actualLabel: ACTUAL_WORD.pts }
        : row.hit === false ? { word: 'MISS', hit: false, actual: fin(row.actual), actualLabel: ACTUAL_WORD.pts } : null
    const hasX = fin(xpts?.xpts) != null
    const l5 = last5.length >= 3 ? last5 : []
    const lines = [
      season ? { label: seasonWord ? `${seasonWord} per game` : 'This season', value: [fin(season.gp) != null ? `${season.gp} GP` : null, d1(season.min) ? `${d1(season.min)} MIN` : null].filter(Boolean).join(' · ') } : null,
      l5.length ? { label: `Last ${l5.length} games`, value: [d1(mean(l5, 'pts')) && `${d1(mean(l5, 'pts'))} PTS`, d1(mean(l5, 'reb')) && `${d1(mean(l5, 'reb'))} REB`, d1(mean(l5, 'ast')) && `${d1(mean(l5, 'ast'))} AST`].filter(Boolean).join(' · ') } : null,
      hasX && fin(xpts.minRecent) != null && fin(xpts.rate) != null ? { label: 'Projection built from', value: `${d1(xpts.minRecent)} MIN × ${Number(xpts.rate).toFixed(2)} PTS/MIN` } : null,
    ].filter(Boolean)
    const out = await statPlayerCard('nba', {
      label: 'Player card', day: day || '', name: card.name, team: card.team, where, id: card.id, photo: null, number: card.jersey,
      bits: [card.pos, card.height],
      status, score: fin(row?.score), scoreLabel: `${NBA_MARKETS.pts.label} SCORE`, rank: fin(row?.nightRank), rankOf,
      tiles: [
        { label: 'PTS / G', value: d1(season?.pts) }, { label: 'REB / G', value: d1(season?.reb) }, { label: 'AST / G', value: d1(season?.ast) },
        hasX ? { label: 'xPTS', value: d1(xpts.xpts), hot: true } : { label: 'MIN / G', value: d1(season?.min) },
      ],
      lines, result, pool: 'players',
    })
    savePng(out.c, `${slug(card.name, 'player')}_${stamp(day)}.png`)
  } catch (e) { fail('player')(e) }
}

// one board row for the ranked list; a graded game puts his result on it
function rowOf(r, rank, market, final) {
  const base = { rank, name: r.name, team: r.team, opp: r.opp, where: `${r.home ? 'vs' : '@'} ${r.opp}`, id: r.playerId, status: r.status, score: r.score }
  if (!final || r.status === 'off') return base
  if (r.voidReason) return { ...base, result: { text: 'VOID', hot: false }, miss: true }
  if (r.actual == null) return base
  const word = market === 'first' ? (r.hit ? 'YES' : 'NO') : `${r.actual} ${ACTUAL_WORD[market] || ''}`.trim()
  return { ...base, result: { text: r.hit ? word : 'MISS', hot: Boolean(r.hit) }, miss: !r.hit }
}
const leadLine = (r, market) => {
  const bits = (NBA_MARKETS[market]?.legs || []).filter((l) => fin(r.legs?.[l]) != null).slice(0, 3).map((l) => `${fmtLeg(l, r.legs[l])} ${LEG_LABEL[l] || l}`)
  if (fin(r.xpts) != null) bits.push(`${d1(r.xpts)} xPTS`)
  return bits.join('  ·  ')
}

/** The top of the ranking for one market, as the table has it. rows = the table's rows, best score first. */
export async function downloadBucketsBoardCard(rows = [], { market = 'pts', date = '', total = null, finalGames = new Set() } = {}) {
  try {
    const ranked = rows.filter((r) => r && r.score != null)
    if (!ranked.length) return
    const [first, ...rest] = ranked.slice(0, 9)
    const word = NBA_MARKETS[market]?.label || market.toUpperCase()
    const card = await rankedCard('nba', {
      label: `Rankings · ${word}`, day: date, sub: `${total ?? ranked.length} ranked · BUCKETS' own ${word.toLowerCase()} score`,
      lead: { ...rowOf(first, 1, market, finalGames.has(first.gameId)), scoreLabel: `${word} SCORE`, line: leadLine(first, market) },
      rows: rest.map((r, i) => rowOf(r, i + 2, market, finalGames.has(r.gameId))), total: total ?? ranked.length,
    })
    savePng(card.c, `rankings-${slug(word)}_${stamp(date)}.png`)
  } catch (e) { fail('rankings')(e) }
}

/** One game: the two clubs, the team model's expected points for each, and its players on the board (the calls first). tm = the team model's row for this game, or null. */
export async function downloadBucketsGameCard({ g, rows = [], tm = null, market = 'pts', date = '' } = {}) {
  if (!g) return
  try {
    const away = g.away.abbrev, home = g.home.abbrev
    const final = g.state === 'final'
    const when = final ? `FINAL ${g.away.score ?? 0}–${g.home.score ?? 0}` : g.state === 'live' ? (g.detail || 'LIVE') : tipWord(g.start)
    const proj = tm && fin(tm.away?.pts) != null && fin(tm.home?.pts) != null
      ? { label: EXPECTED_POINTS_WORDS.toUpperCase(), away: tm.away.pts.toFixed(1), home: tm.home.pts.toFixed(1), total: fin(tm.total) != null ? Number(tm.total).toFixed(1) : null } : null
    const on = rows.filter((r) => r.status !== 'off' && r.score != null)
      .sort((a, b) => (a.status === 'called' ? 0 : 1) - (b.status === 'called' ? 0 : 1) || (b.score ?? 0) - (a.score ?? 0)).slice(0, 6)
    const locked = rows.length > 0 && rows.every((r) => r.locked !== false)
    const card = await rankedCard('nba', {
      label: 'Game card', day: date, sub: `${away} @ ${home} · ${NBA_MARKETS[market]?.label || market} · ${locked ? 'calls locked' : 'a preview, not a call yet'}`,
      banner: { away, home, when, proj }, rows: on.map((r, i) => rowOf(r, i + 1, market, final)), total: on.length,
      empty: 'Nobody in this game has ten NBA games on file to be on the board.',
    })
    savePng(card.c, `game-${slug(away)}-${slug(home)}_${stamp(date)}.png`)
  } catch (e) { fail('game')(e) }
}
