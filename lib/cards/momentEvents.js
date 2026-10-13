// THE SHARED MOMENT RULE FOR EVENTS (pure: no I/O, no JSX). One function that turns the STORED FEED ROWS of a sport into the special-card moments they prove,
// using the one config in lib/cards/moments.js (evaluate()). The card-earned PUSH (lib/dash/pushRules.js cardEarnedEventsFrom) and the post builder
// both call it, so "what is a card" is decided in exactly one place.
//   momentsForEvent({ sport, rows, minTier })  rows = lamp_goal_feed rows (nhl) | homer_feed rows (mlb) | nfl_td_feed rows (nfl)
//   -> [{ moment, id, tier, tierWord, holo, shimmer, kicker, line, status, sport, playerId, name, team, opp, day, game }] rarest-per-player-game first
// minTier defaults to 'star': a BASE card (every goal) is never an event. Two things are NOT here, on purpose: the 100-yard game (it is read from the weekly
// game logs, not from a live feed) and the long shot cashed (it needs a stored price, i.e. a database read); both are on the shelf and the binder, not pushed.
import { MOMENTS, TIER_WORD, tierRank, evaluate, nhlGameLines, mlbGameLines, nflGameLines } from './moments'

const txt = (v) => String(v == null ? '' : v).trim()

/** [{ key, row, id, game, playerId }] for a sport's feed rows: the data rows each moment reads (the groupers in moments.js). */
export function momentRowsOf(sport, rows) {
  const out = []
  const list = Array.isArray(rows) ? rows : []
  if (sport === 'nhl') {
    const live = list.filter((r) => !r.overturned_at)
    for (const r of live) {
      for (const key of ['nhl_goal', 'nhl_season_goal_milestone']) out.push({ key, row: r, id: `${r.game_id}:${r.player_id}:${r.goal_n}`, game: String(r.game_id), playerId: String(r.player_id) })
    }
    for (const l of nhlGameLines(live).values()) {
      for (const key of ['nhl_hat_trick', 'nhl_three_points']) out.push({ key, row: l, id: `${l.game_id}:${l.player_id}`, game: String(l.game_id), playerId: String(l.player_id) })
    }
  } else if (sport === 'mlb') {
    for (const l of mlbGameLines(list).values()) out.push({ key: 'mlb_multi_hr', row: l, id: `${l.game_pk}:${l.player_id}`, game: String(l.game_pk), playerId: String(l.player_id) })
  } else if (sport === 'nfl') {
    for (const l of nflGameLines(list).values()) out.push({ key: 'nfl_multi_td', row: l, id: `${l.game_id}:${l.gsis_id}`, game: String(l.game_id), playerId: String(l.gsis_id) })
  }
  return out
}

/** The moments (STAR and up by default) the rows prove, ONE per player-game (his rarest), rarest first. Pure. */
export function momentsForEvent({ sport, rows, minTier = 'star' }) {
  const best = new Map()
  for (const m of momentRowsOf(sport, rows)) {
    const ev = evaluate(m.key, m.row)
    if (!ev || tierRank(ev.tier) < tierRank(minTier)) continue
    const k = `${m.playerId}:${m.game}`
    const cur = best.get(k)
    if (!cur || tierRank(ev.tier) > tierRank(cur.ev.tier)) best.set(k, { m, ev })
  }
  return [...best.values()].map(({ m, ev }) => {
    const r = m.row
    return {
      moment: m.key, id: m.id, sport, tier: ev.tier, tierWord: TIER_WORD[ev.tier], holo: ev.holo, shimmer: ev.shimmer, kicker: ev.print.kicker, line: ev.print.line, status: ev.status,
      playerId: m.playerId, name: txt(r.name || r.scorer_name), team: txt(r.team), opp: txt(r.opp || r.opponent), day: txt(r.day), game: m.game,
      label: MOMENTS[m.key].label,
    }
  }).sort((a, b) => tierRank(b.tier) - tierRank(a.tier) || String(b.day).localeCompare(String(a.day)))
}
