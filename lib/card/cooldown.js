// THE COOLDOWN (Donovan, 2026-10-30): "I don't want to see the same player, especially if they're not hitting." A man who has been on the Card (a straight, the
// Two-Man or a Double leg) on each of the sport's last COOL_DAYS Card days, and missed every time, sits out the next Card. A man who is hitting stays: Kyle Connor
// can be the straight again. OFF unless CARD_COOLDOWN_ON is on, so deploying this changes nothing by itself. Applied to the candidates the lock reads
// (lib/card/sources.js loadCardInputs), so the straights, the Two-Man, the Long Shot and the Double all skip him; he is still scored and still on the board,
// and he is named in the lock's log line. Locked rows are never touched: this decides only who is eligible at the NEXT lock.
export const COOL_DAYS = 3
const truthy = (v) => /^(on|1|true|yes)$/i.test(String(v == null ? '' : v).trim())
export const cooldownOn = () => truthy(process.env.CARD_COOLDOWN_ON)

/** One result per leg of a locked row: [{ player_id, result }] for the sport (a Double's legs carry their own sport). */
function legResults(row, sport) {
  const legs = Array.isArray(row?.legs) ? row.legs : []
  const lr = Array.isArray(row?.leg_results) ? row.leg_results : []
  return legs.filter((l) => (l.sport || row.sport) === sport && l.player_id != null).map((l, i) => {
    const own = lr.find((x) => String(x.player_id) === String(l.player_id))
    return { player_id: String(l.player_id), name: l.name || null, result: own ? own.result : legs.length === 1 ? row.result : lr[i]?.result ?? null }
  })
}

/**
 * Who sits out. `rows` = the bot lane's locked card_calls before today ({ sport, card_date, result, leg_results, legs }). Pure.
 * A man qualifies when he is a leg on each of the sport's last `days` distinct Card days and every graded leg of his in that stretch is a miss
 * (an ungraded or void leg is not a miss: no cooling on a result we do not have).
 * @returns Map(player_id -> { name, days })
 */
export function coolDownSet(rows, sport, { days = COOL_DAYS } = {}) {
  const byDay = new Map()
  for (const r of rows || []) {
    const legs = legResults(r, sport)
    if (!legs.length) continue
    const d = String(r.card_date)
    if (!byDay.has(d)) byDay.set(d, [])
    byDay.get(d).push(...legs)
  }
  const recent = [...byDay.keys()].sort().slice(-days)
  const out = new Map()
  if (recent.length < days) return out
  const ids = [...byDay.get(recent[0])].map((l) => l.player_id)
  for (const id of new Set(ids)) {
    const mine = recent.map((d) => byDay.get(d).filter((l) => l.player_id === id))
    if (mine.some((m) => !m.length)) continue
    const all = mine.flat()
    if (all.every((l) => l.result === 'miss')) out.set(id, { name: all.find((l) => l.name)?.name || null, days })
  }
  return out
}

/** Read the last week of the bot lane's rows before `cardDate` and return the cooldown set for the sport. A failed read cools nobody. */
export async function loadCooldown(db, sport, cardDate) {
  try {
    const from = new Date(Date.parse(`${cardDate}T12:00:00Z`) - 10 * 864e5).toISOString().slice(0, 10)
    const { data, error } = await db.from('card_calls').select('sport, card_date, result, leg_results, legs').eq('lane', 'bot').gte('card_date', from).lt('card_date', cardDate).in('sport', [sport, 'all'])
    if (error) return new Map()
    return coolDownSet(data || [], sport)
  } catch { return new Map() }
}

/** Remove cooled men from a candidate list. */
export const withoutCooled = (cands, cooled) => (cooled?.size ? (cands || []).filter((c) => !cooled.has(String(c.player_id))) : cands)
