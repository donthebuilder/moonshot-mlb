// NFL: a week's frozen pregame board (the last prediction-log run before the week's first kickoff) + the week's
// graded file -> LearnRows (2026-10-12, accuracy loop). Pure; the script does the reads.
//
//   board     prediction-log rows for the market: one per player, ranked by score (highest first)
//   called    the card's five rungs for that market (results.card[market].rungs). A TD that was a game's call
//             (tdFeed onBotFor) but not a card rung reads ON THE BOARD or NOT ON THE BOARD here: said in the report
//   status    lib/callStatus tdCallStatus (the top-third cut on the stored rank), the one place the labels come from.
//             Only TD carries the label on the site; the other markets use the same cut for the analysis only
//   produced  results.lines[player][market] >= results.bars[market]; a player absent from the week's lines did not
//             play: void (null), never a miss
import { tdCallStatus } from '../../callStatus'
import { numericFeatures } from '../features'

const num = (v) => { const x = Number(v); return Number.isFinite(x) ? x : null }

export function nflRows({ season, week, market, board, results, lockedAt, startAt, date }) {
  const mine = new Map()
  for (const p of board || []) if (p.market === market && p.player_id != null && !mine.has(String(p.player_id))) mine.set(String(p.player_id), p)
  const list = [...mine.values()].sort((a, b) => (num(b.score) ?? -1) - (num(a.score) ?? -1))
  const calledIds = new Set((results?.card?.[market]?.rungs || []).map((r) => String(r.player_id)))
  const bar = results?.bars?.[market]
  const of = list.length
  return list.map((p, i) => {
    const pid = String(p.player_id)
    const line = results?.lines?.[pid]
    const status = tdCallStatus({ on_bot: calledIds.has(pid) ? { market } : null, td_board: { rank: i + 1, of } })
    return {
      sport: 'nfl', market, unit: `${season}-w${String(week).padStart(2, '0')}`, date, id: pid, name: p.player, team: p.team, opp: p.opp,
      version: p.model_version || null, status,
      produced: line && bar != null ? (num(line[market]) ?? 0) >= bar : null,
      score: num(p.score),
      features: {
        ...numericFeatures([['components', p.components]]),
        ...(typeof p.questionable === 'boolean' ? { questionable: p.questionable ? 1 : 0 } : {}),
        ...(typeof p.low_sample === 'boolean' ? { low_sample: p.low_sample ? 1 : 0 } : {}),
        ...(typeof p.carryover === 'boolean' ? { carryover: p.carryover ? 1 : 0 } : {}),
      },
      lockedAt, startAt,
    }
  })
}
