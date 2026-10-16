// APPLY THE ROUTING TABLE AT THE ONE PLACE EVERY DISCORD SEND PASSES (lib/dash/xPost.js postToDiscord).
// Pure given process.env: turns a kind's rooms (lib/dash/routing.js) into webhook URLs and narrows the hooks a poster
// asked for to those rooms. A kind the table does not list is untouched. A CUT kind sends nothing but reports success,
// so the poster still records the row (grading and receipts read it) and never retries.
import { routeOf } from './routing.js'

const split = (raw) => String(raw || '').split(/[,\n]/).map((s) => s.trim()).filter(Boolean)
const env = (name) => split(process.env[name])

/** The webhook URLs behind a room name, for a post of sport `sportKey`. */
export function hooksOfRoom(room, sportKey = 'mlb') {
  if (room === 'feed') return env('DISCORD_HOMER_WEBHOOK')
  if (room === 'receipts') return env('DISCORD_RECEIPTS_WEBHOOK')
  if (room === 'members') return env('DISCORD_MEMBERS_WEBHOOK')
  if (room === 'donovan') return env('DISCORD_DONOVAN_WEBHOOK')
  if (room === 'sport') {
    const mlb = env('DISCORD_MLB_WEBHOOKS')
    if (sportKey === 'nfl') { const own = env('DISCORD_NFL_WEBHOOKS'); return own.length ? own : mlb }
    if (sportKey === 'nhl') { const own = env('DISCORD_NHL_WEBHOOKS'); return own.length ? own : mlb }
    if (sportKey === 'nba') return env('DISCORD_NBA_WEBHOOKS')
    return mlb
  }
  return []
}

/**
 * @returns {{ hooks: string[], cut: boolean, routed: boolean }}
 *   routed=false: the table is silent on this kind, `hooks` is exactly what was passed in.
 */
export function routeHooks(kind, sportKey, hooks) {
  const list = Array.isArray(hooks) ? hooks : split(hooks)
  const r = routeOf(kind)
  if (!r) return { hooks: list, cut: false, routed: false }
  if (r.rooms.length === 1 && r.rooms[0] === 'off') return { hooks: [], cut: true, routed: true }
  const allowed = new Set(r.rooms.flatMap((room) => hooksOfRoom(room, sportKey || 'mlb')))
  return { hooks: list.filter((h) => allowed.has(h)), cut: false, routed: true }
}
