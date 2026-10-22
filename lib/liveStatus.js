// ONE LIVE STATUS (2026-10-22, Donovan: "i like the status because i like to come to the site live and see where they are
// at, so ... make that shared for each prop lane"). Every prop lane's board table draws the same Status cell
// (components/table/LiveStatusCell.js, through DenseTable's `liveOf`): his call word, where he is against the lane's bar
// right now, and where his game is. Each sport turns its own live line into this one shape; the cell never knows the sport.
//
//   { state: 'pre' | 'live' | 'final' | 'off',   off = postponed / suspended / delayed: the word is in `clock`
//     n, bar, unit,                               what he has, what the lane needs, the unit word ('HR', 'H', 'TB' ...)
//     cleared: true | false | null,               true the moment n reaches the bar; false only once his game is final
//     clock }                                     '▲5', 'FINAL', '7:08 PM' (a short word for the cell)
//
// Live lines come from what each sport's pages already pull (MLB lib/liveSlate fetchLiveSlate: 15 s cache, read on a ↻ or a
// return to the tab). Nothing here fetches, and nothing polls.

import { localTime } from './localTime'

// MLB: the lane's count and bar. The bars are lib/liveSlate pickCleared's (the archive's grading rules); 2+ HR is its own.
export const MLB_LANES = {
  hr: { unit: 'HR', bar: 1, n: (l) => l.hr },
  top: { unit: 'HR', bar: 1, n: (l) => l.hr },
  hr2: { unit: 'HR', bar: 2, n: (l) => l.hr },
  hit: { unit: 'H', bar: 1, n: (l) => l.h },
  hrr: { unit: 'H+R+RBI', bar: 2, n: (l) => (l.h || 0) + (l.r || 0) + (l.rbi || 0) },
  contact: { unit: 'TB', bar: 2, n: (l) => l.tb },
  tb: { unit: 'TB', bar: 2, n: (l) => l.tb },
}

const OFF_WORD = { PPD: 'PPD', SUSP: 'SUSP', DLY: 'DELAY' }

/**
 * MLB: one hitter's live status on one lane. `line` is lib/liveSlate's lines[mlbId] (null before his game shows up),
 * `game` its games[] entry (for the inning), `startIso` his game_time (the pregame clock).
 */
export function mlbLiveStatus(lane, line, game = null, startIso = null) {
  const L = MLB_LANES[lane] || MLB_LANES.hr
  if (!line) {
    // no live line yet: his start time, unless that game is long gone (an old slate on a no-game day says nothing)
    const t = startIso ? new Date(startIso).getTime() : NaN
    return Number.isFinite(t) && t > Date.now() - 12 * 3600e3 ? { state: 'pre', n: null, bar: L.bar, unit: L.unit, cleared: null, clock: safeTime(startIso) } : null
  }
  if (line.postponed || line.suspended || line.delayed) {
    const w = OFF_WORD[game?.statusLabel] || (line.postponed ? 'PPD' : line.suspended ? 'SUSP' : 'DELAY')
    return { state: 'off', n: null, bar: L.bar, unit: L.unit, cleared: null, clock: w }
  }
  const n = Number(L.n(line)) || 0
  const final = line.state === 'Final' || line.settled === true
  const live = !final && line.state === 'Live'
  const state = final ? 'final' : live ? 'live' : 'pre'
  const cleared = n >= L.bar ? true : final ? false : null
  const clock = final ? 'FINAL'
    : live ? inningWord(game) : safeTime(startIso)
  return { state, n: state === 'pre' ? null : n, bar: L.bar, unit: L.unit, cleared, clock }
}

// statsapi's linescore inningState: Top / Bottom / Middle / End
function inningWord(game) {
  if (!game?.inning) return 'LIVE'
  const h = String(game.half || '').toLowerCase()
  return h.startsWith('b') ? `▼${game.inning}` : h.startsWith('m') ? `MID ${game.inning}` : h.startsWith('e') ? `END ${game.inning}` : `▲${game.inning}`
}

function safeTime(iso) {
  if (!iso) return null
  try { return localTime(iso, { zone: false }) || null } catch { return null }
}

// NFL: the lane's live value comes from lib/nfl/liveSlate marketValue (the units the bot's bar uses); TD2 is two TDs.
const NFL_UNIT = { TD: 'TD', TD2: 'TD', REC_YDS: 'YDS', REC: 'REC', RUSH_YDS: 'YDS', RUSH_ATT: 'ATT', PASS_YDS: 'YDS', KICK_PTS: 'PTS' }
const NFL_PERIOD = (n) => { const q = Number(n); return !Number.isFinite(q) || q < 1 ? '' : q <= 4 ? `Q${q}` : q === 5 ? 'OT' : `${q - 4}OT` }

/**
 * NFL: one player's live status on one lane. `value` is marketValue(line, market) (null before he shows in a box score),
 * `game` the live snapshot's game ({ state pre|in|post, clock, period, status_name }), `bar` the lane's bar, `kickoff` ms.
 */
export function nflLiveStatus(market, value, game, bar, kickoff = null) {
  const unit = NFL_UNIT[market]
  if (!unit || !Number.isFinite(Number(bar))) return null
  const name = String(game?.status_name || '')
  if (/POSTPONED|SUSPENDED|CANCELED/i.test(name)) return { state: 'off', n: null, bar, unit, cleared: null, clock: /POSTPONED/i.test(name) ? 'PPD' : 'SUSP' }
  const state = game?.state === 'post' ? 'final' : game?.state === 'in' ? 'live' : 'pre'
  if (state === 'pre') {
    const t = Number(kickoff) || (game?.kickoff ? Date.parse(game.kickoff) : NaN)
    return Number.isFinite(t) && t > Date.now() - 12 * 3600e3 ? { state, n: null, bar, unit, cleared: null, clock: safeTime(t) } : null
  }
  const n = Number(value) || 0
  const cleared = n >= bar ? true : state === 'final' ? false : null
  const clock = state === 'final' ? 'FINAL' : [NFL_PERIOD(game?.period), game?.clock].filter(Boolean).join(' ') || 'LIVE'
  return { state, n, bar, unit, cleared, clock }
}
