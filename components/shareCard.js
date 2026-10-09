// THE MOONSHOT SHARE CARDS (fix14, 2026-10-08). The downloads, as thin wrappers:
// each one reshapes the data its tab already has into a lib/cards/cards.js
// card and saves the PNG. The drawing is the card kit's (lib/cards/kit.js:
// 1080 x 1350, one frame, one header, one footer, the product's one accent,
// faces and club logos, status words from lib/callStatus.js) -- nothing is
// drawn here, and nothing is re-derived: a status is callStatus() on the row's
// own role and board rank (hitterStatus), a score is the slate's own.
//
// Seven buttons, five layouts: Watchlist, Board and Game share the ranked
// list; Player, Track record and Pitcher have their own. The Pools, Pairs and
// Storylines cards are gone (no face, no logo, no score to lead with: text
// lists that could not meet the card rules); their 📸 buttons went with them.
import { playerCard, rankedCard, recordCard, pitcherCard, hitterStatus } from '../lib/cards/cards'
import { savePng, slug, stamp } from '../lib/cards/kit'
import { callStatus } from '../lib/callStatus'
import { nameOf, teamOf, oppOf, hrScore, mlbId, n } from '../lib/player'
import { boardOrder, boardCompare } from '../lib/boardOrder'

const dayOf = (p) => String(p?.game_date || p?.day || p?.date || '').slice(0, 10)
const iso3 = (v) => v.toFixed(3).replace(/^0/, '')
const fail = (what) => (e) => { console.error(`share card (${what}) failed`, e) }

// one hitter row for the ranked list
// `byRank`: the status is read off this list's own rank (the Boards tab ranks five ways and its table
// words each row from its place in the list), so the card agrees with the screen it came from.
function rowOf(p, rank, { score = hrScore, boardOf = null, byRank = false } = {}) {
  const status = byRank && boardOf > 0
    ? callStatus({ role: p?.game_pick_role, board_rank: rank, board_of: boardOf })
    : hitterStatus(p, boardOf)
  return { rank, name: nameOf(p), team: teamOf(p), opp: oppOf(p), id: mlbId(p), status, score: score(p) }
}
// the lead's one proof line, the numbers a bettor asks for first
function leadLine(p) {
  const bits = []
  if (n(p?.season_hr, 0) > 0) bits.push(`SZN ${n(p.season_hr, 0)} HR`)
  if (n(p?.last5_hr, 0) > 0) bits.push(`L5 ${n(p.last5_hr, 0)} HR`)
  const iso = n(p?.season_iso, NaN)
  if (Number.isFinite(iso)) bits.push(`ISO ${iso3(iso)}`)
  const gs = n(p?.games_since_last_hr, NaN)
  if (Number.isFinite(gs)) bits.push(gs === 0 ? 'WENT YARD LAST GAME' : `${gs}G SINCE HR`)
  return bits.join('  ·  ')
}

/** The Watchlist's list, as a card. */
export async function downloadShareCard(items = [], { title = 'MY WATCHLIST' } = {}) {
  try {
    const sorted = boardOrder(items)
    const [first, ...rest] = sorted
    const card = await rankedCard('mlb', {
      label: title, day: dayOf(first), sub: `${items.length} hitter${items.length === 1 ? '' : 's'} · HR score, MOONSHOT's own ranking`,
      lead: first ? { ...rowOf(first, 1), scoreLabel: 'HR SCORE', line: leadLine(first) } : null,
      rows: rest.map((p, i) => rowOf(p, i + 2)), total: items.length,
    })
    savePng(card.c, `watchlist_${stamp(dayOf(first))}.png`)
  } catch (e) { fail('watchlist')(e) }
}

/** One hitter. */
export async function downloadPlayerCard(p, { jersey = null, boardOf = null } = {}) {
  if (!p) return
  try {
    const card = await playerCard(p, { jersey, boardOf })
    savePng(card.c, `${slug(nameOf(p), 'player')}_${stamp(dayOf(p))}.png`)
  } catch (e) { fail('player')(e) }
}

/** A board (the Boards tab's ranked list), whichever ranking is on screen. */
export async function downloadBoardCard(ranked = [], { title = 'THE BOARD', sub = '', type = 'hr', scoreOf, boardOf = null } = {}) {
  try {
    const score = typeof scoreOf === 'function' ? scoreOf : (p) => hrScore(p)
    const [first, ...rest] = ranked
    const card = await rankedCard('mlb', {
      label: title, day: dayOf(first), sub: `${ranked.length} ranked${sub ? ` · ${sub}` : ''} · this board's own ${String(type).toUpperCase()} ranking`,
      lead: first ? { ...rowOf(first, 1, { score, boardOf, byRank: true }), scoreLabel: `${String(type).toUpperCase()} SCORE`, line: leadLine(first) } : null,
      rows: rest.map((p, i) => rowOf(p, i + 2, { score, boardOf, byRank: true })), total: ranked.length,
    })
    savePng(card.c, `board-${slug(type)}_${stamp(dayOf(first))}.png`)
  } catch (e) { fail('board')(e) }
}

/** One matchup's picks off the Slate tab; the graded line replaces the score once the game has one. */
export async function downloadGameCard(gm = {}, { onlyPicks = true, boardOf = null } = {}) {
  try {
    const players = Array.isArray(gm.players) ? gm.players : []
    const picks = players.filter((p) => !onlyPicks || String(p?.game_pick_role || '').trim()).sort(boardCompare).slice(0, 12)
    const away = gm.away || '—', home = gm.home || '—'
    let when = ''
    try { when = gm.game_time ? new Date(gm.game_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '' } catch { /* no game_time */ }
    const rows = picks.map((p, i) => {
      const r = rowOf(p, i + 1, { boardOf })
      const hr = n(p?.actual_hr, 0), h = n(p?.actual_hits, 0)
      if (hr > 0 || h > 0) r.result = { text: [hr > 0 ? `${hr} HR` : null, h > 0 ? `${h} H` : null].filter(Boolean).join(' · '), hot: hr > 0 }
      return r
    })
    const card = await rankedCard('mlb', {
      label: 'Game card', day: dayOf(gm) || dayOf(picks[0]), sub: `${away} @ ${home}${gm.lineup_confirmed ? ' · lineups in' : ' · projected'}`,
      banner: { away, home, when }, rows, total: picks.length, empty: 'No designated picks in this game.',
    })
    savePng(card.c, `game-${slug(away)}-${slug(home)}_${stamp(dayOf(gm) || dayOf(picks[0]))}.png`)
  } catch (e) { fail('game')(e) }
}

/** The Results tab's season report card. */
export async function downloadTrackRecordCard(data = {}) {
  try {
    const card = await recordCard('mlb', data)
    savePng(card.c, `track-record_${stamp('')}.png`)
  } catch (e) { fail('track record')(e) }
}

/** The pitcher modal's tiles and his toughest lineup matchup. */
export async function downloadPitcherCard(data = {}) {
  try {
    const card = await pitcherCard('mlb', data)
    savePng(card.c, `pitcher-${slug(data.name, 'pitcher')}_${stamp('')}.png`)
  } catch (e) { fail('pitcher')(e) }
}
