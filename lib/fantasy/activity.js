// LEAGUE ACTIVITY -- EVERY MOVE, NOT THE LAST TWENTY (2026-09-24).
//
// ESPN's "Recent Activity": every add, drop, waiver claim, trade and
// commissioner move in the league, newest first, filterable by team and type.
// Until now the only place a move showed up was the Feed, mixed in with chat
// and cut at the last 20.
//
// source  -> fantasy_transactions (one row per team per move; a trade writes
//            one row for EACH side, same details.trade_id)
//          + fantasy_trade_items (who went where in a trade)
//          + nfl_players (names)
// shape   -> shapeActivity() below: one row per move, a trade collapsed to
//            one row with both sides
// output  -> League > Activity (app/fantasy/league/[leagueId]/league/page.js)
//
// Pure functions only, so scripts/check-activity.mjs can test them without a
// database.

export const ACTIVITY_PAGE = 25

// Filter chips. `apply` narrows a PostgREST query builder; `all` is untouched.
export const ACTIVITY_TYPES = {
  all: { label: 'ALL' },
  adds: { label: 'ADDS', apply: (q) => q.neq('transaction_type', 'trade').not('added_player_id', 'is', null) },
  drops: { label: 'DROPS', apply: (q) => q.not('dropped_player_id', 'is', null) },
  waivers: { label: 'WAIVERS', apply: (q) => q.eq('transaction_type', 'waiver') },
  trades: { label: 'TRADES', apply: (q) => q.eq('transaction_type', 'trade') },
  commish: { label: 'COMMISSIONER', apply: (q) => q.eq('transaction_type', 'commissioner') },
}

export const activityType = (value) => (ACTIVITY_TYPES[value] ? value : 'all')

const KIND = {
  waiver: 'WAIVER CLAIM',
  free_agent: 'FREE AGENT',
  drop: 'DROP',
  trade: 'TRADE',
  commissioner: 'COMMISSIONER',
}

/** Trade ids referenced by a page of transactions. */
export function tradeIdsOf(transactions) {
  return [...new Set((transactions || []).map((t) => t?.details?.trade_id).filter(Boolean))]
}

/** Every player id a page of moves needs a name for. */
export function playerIdsOf(transactions, tradeItems) {
  return [...new Set([
    ...(transactions || []).flatMap((t) => [t.added_player_id, t.dropped_player_id]),
    ...(tradeItems || []).map((i) => i.player_id),
  ].filter(Boolean))]
}

/**
 * One row per move, newest first. A trade's two transaction rows become one,
 * with each side's incoming players. A trade whose items are missing still
 * shows (both teams, "details unavailable") rather than vanishing.
 *
 * @returns {Array<{ id, at, kind, label, teamIds: string[], added: object|null,
 *   dropped: object|null, sides: Array<{ teamId, gets: object[] }>|null }>}
 */
export function shapeActivity({ transactions = [], tradeItems = [], players = [] } = {}) {
  const playerById = new Map(players.map((p) => [p.id, p]))
  const who = (id) => (id ? playerById.get(id) || { id, name: 'Unknown player', position: '', team: '' } : null)
  const itemsByTrade = new Map()
  for (const item of tradeItems) {
    if (!itemsByTrade.has(item.trade_id)) itemsByTrade.set(item.trade_id, [])
    itemsByTrade.get(item.trade_id).push(item)
  }
  const seenTrade = new Set()
  const rows = []
  for (const t of [...transactions].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))) {
    const tradeId = t.transaction_type === 'trade' ? t?.details?.trade_id : null
    if (tradeId) {
      if (seenTrade.has(tradeId)) continue
      seenTrade.add(tradeId)
      const items = itemsByTrade.get(tradeId) || []
      const teamIds = [...new Set([
        ...transactions.filter((x) => x?.details?.trade_id === tradeId).map((x) => x.team_id),
        ...items.map((i) => i.to_team_id),
      ].filter(Boolean))]
      rows.push({
        id: t.id, at: t.created_at, kind: 'trade', label: KIND.trade, teamIds,
        added: null, dropped: null,
        sides: teamIds.map((teamId) => ({ teamId, gets: items.filter((i) => i.to_team_id === teamId).map((i) => who(i.player_id)) })),
      })
      continue
    }
    rows.push({
      id: t.id, at: t.created_at, kind: t.transaction_type,
      label: KIND[t.transaction_type] || String(t.transaction_type || 'MOVE').toUpperCase(),
      teamIds: [t.team_id].filter(Boolean),
      added: who(t.added_player_id), dropped: who(t.dropped_player_id), sides: null,
    })
  }
  return rows
}

const DAY = { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric' }

/** Rows grouped under an Eastern-time day heading, order kept. */
export function byDay(rows) {
  const groups = []
  for (const row of rows) {
    const label = new Date(row.at).toLocaleDateString('en-US', DAY).toUpperCase()
    if (groups.at(-1)?.label !== label) groups.push({ label, rows: [] })
    groups.at(-1).rows.push(row)
  }
  return groups
}
