// APPLY THE ROUTING TABLE AT THE ONE PLACE EVERY DISCORD SEND PASSES (lib/dash/xPost.js postToDiscord).
// Pure given process.env: turns a kind's rooms (lib/dash/routing.js) into webhook URLs and narrows the hooks a poster
// asked for to the table's rooms (see routeHooks). A kind the table does not list is untouched. A CUT kind sends nothing but reports success,
// so the poster still records the row (grading and receipts read it) and never retries.
import { routeOf } from './routing.js'

const split = (raw) => String(raw || '').split(/[,\n]/).map((s) => s.trim()).filter(Boolean)
const env = (name) => split(process.env[name])
const SPORT_KEY = { mlb: 'DISCORD_MLB_WEBHOOKS', nfl: 'DISCORD_NFL_WEBHOOKS', nhl: 'DISCORD_NHL_WEBHOOKS', nba: 'DISCORD_NBA_WEBHOOKS' }

/** The webhook URLs behind a room name, for a post of sport `sportKey`. */
export function hooksOfRoom(room, sportKey = 'mlb') {
  if (room === 'feed') return env('DISCORD_HOMER_WEBHOOK')
  if (room === 'receipts') return env('DISCORD_RECEIPTS_WEBHOOK')
  if (room === 'members') return env('DISCORD_MEMBERS_WEBHOOK')
  if (room === 'donovan') return env('DISCORD_DONOVAN_WEBHOOK')
  // each product its own room, no fallback (2026-10-23): a hockey post never lands in #moonshot because #lamp's key went missing
  if (room === 'sport') return env(SPORT_KEY[sportKey] || SPORT_KEY.mlb)
  // THE NETWORK ROOM (2026-10-23): the posts that cover every product (the slate, the receipt, the weekly shows). Its own channel once
  // DISCORD_OVERVIEW_WEBHOOK is set; until then exactly where they went before (#moonshot), so nothing goes quiet in between.
  if (room === 'network') { const own = env('DISCORD_OVERVIEW_WEBHOOK'); return own.length ? own : env('DISCORD_MLB_WEBHOOKS') }
  return []
}

/**
 * THE TABLE DECIDES (lib/dash/routing.js). A listed kind goes to its rooms' webhooks, whatever the poster passed, with two rules:
 *   - a poster that passed no webhook gets none (it asked for no channel);
 *   - #members is reached only by a send whose webhooks are ALL #members (the members poster), and such a send reaches nothing else:
 *     a moment or a write-up sent once for the free room and once for #members lands once in each.
 * @returns {{ hooks: string[], cut: boolean, routed: boolean }}
 *   routed=false: the table does not list this kind; `hooks` is exactly what was passed in.
 *   cut=true: the table sends this kind nowhere on Discord ('off', or 'x' = X only).
 */
export function routeHooks(kind, sportKey, hooks) {
  const list = Array.isArray(hooks) ? hooks : split(hooks)
  const r = routeOf(kind)
  if (!r) return { hooks: list, cut: false, routed: false }
  if (r.rooms.every((x) => x === 'off' || x === 'x')) return { hooks: [], cut: true, routed: true }
  if (!list.length) return { hooks: [], cut: false, routed: true }
  const members = new Set(env('DISCORD_MEMBERS_WEBHOOK'))
  const membersSend = list.every((h) => members.has(h))
  const out = new Set()
  for (const room of r.rooms) {
    if (room === 'chosen') { for (const h of list) out.add(h); continue }      // the one channel the admin picked (routing.js admin_test)
    if ((room === 'members') !== membersSend) continue
    for (const h of hooksOfRoom(room, sportKey || 'mlb')) if (room !== 'members' || list.includes(h)) out.add(h)
  }
  return { hooks: [...out], cut: false, routed: true }
}
