// 🔁 THE 2+ CLUB AS A STORY (BATCH-STORYLINES-PAGE step 1), shared by the
// three engines. From lib/multi/read.js's season table (multi_games): a
// player on tonight's slate with MIN[sport]+ games of two or more this
// season. Nothing when the table is showing a past season (stale) -- last
// year's count is not tonight's story.
//
// RARITY: 0.50 + 0.05 per multi game past the floor (max 0.75).
import { readMulti } from '../multi/read'
import { story, parts, name, num } from './shape'

const MIN = { mlb: 3, nfl: 2, nhl: 2 }
const WORD = { mlb: 'multi-homer games', nfl: 'multi-touchdown games', nhl: 'multi-goal games' }

/**
 * @param players  Map(player_id string -> { game_id, day, name, team, opp })  tonight's slate
 * @param table    readMulti(db, sport) result
 */
export function multiStories(sport, players, table) {
  if (!table || table.stale) return []
  const out = []
  for (const p of table.players || []) {
    const t = players.get(String(p.player_id))
    if (!t || p.multi < MIN[sport]) continue
    out.push(story({
      sport, day: t.day, game_id: t.game_id, player_id: p.player_id, name: t.name || p.name, team: t.team ?? p.team, opp: t.opp ?? null,
      type: 'multi', icon: '🔁', rarity: Math.min(0.75, 0.5 + 0.05 * (p.multi - MIN[sport])), source: `multi_games (${table.seasonLabel})`,
      parts: parts(name(t.name || p.name), ' has ', num(p.multi), ` ${WORD[sport]} this season`, p.called ? [' — ', num(p.called), ' of them CALLED'] : ''),
      numbers: { multi: p.multi, most: p.most, called: p.called, gp: p.gp },
    }))
  }
  return out
}

export async function readMultiSafe(db, sport) {
  if (!db) return null
  return readMulti(db, sport).catch((e) => { console.error(`[stories] 2+ club ${sport}: ${e?.message}`); return null })
}
