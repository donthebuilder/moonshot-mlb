#!/usr/bin/env node
// Which Discord channel a post goes to (2026-10-02). TEST webhook names only, no real URLs.
//   node scripts/check-discord-channels.mjs
import { feedHooks, feedHooksFor, hookList, receiptsHooks, sportHooks, withReceipts } from '../lib/dash/discordChannels.js'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
// discordAlerts.js imports ./xPost without an extension, which plain node can't
// resolve: run a copy in a temp dir with a do-nothing poster beside it.
const tmp = mkdtempSync(join(tmpdir(), 'dash-discord-'))
writeFileSync(join(tmp, 'xp.mjs'), 'export const postToDiscord = async () => ({ ok: true })')
writeFileSync(join(tmp, 'da.mjs'), readFileSync(new URL('../lib/dash/discordAlerts.js', import.meta.url), 'utf8').replace("from './xPost'", "from './xp.mjs'"))
const { webhooksForEvent } = await import(pathToFileURL(join(tmp, 'da.mjs')).href)
let fail = 0
const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); fail += !ok; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` -> ${JSON.stringify(got)}`}`) }
const reset = () => { for (const k of ['DISCORD_HOMER_WEBHOOK', 'DISCORD_MLB_WEBHOOKS', 'DISCORD_NFL_WEBHOOKS', 'DISCORD_NHL_WEBHOOKS', 'DISCORD_RECEIPTS_WEBHOOK']) delete process.env[k] }

// nothing set: nothing changes, nothing posts
reset()
eq('unset -> empty feed', feedHooks('nfl'), '')
eq('unset -> empty receipts', receiptsHooks(), '')

// today's behaviour (only HOMER + MLB set): NFL/NHL still ride the MLB list
process.env.DISCORD_HOMER_WEBHOOK = 'HOMER'; process.env.DISCORD_MLB_WEBHOOKS = 'MLB'
eq('mlb feed', feedHooks('mlb'), 'HOMER,MLB')
eq('nfl falls back to MLB', feedHooks('nfl'), 'HOMER,MLB')
eq('nhl falls back to MLB', feedHooks('nhl'), 'HOMER,MLB')

// fully wired
process.env.DISCORD_NFL_WEBHOOKS = 'NFL'; process.env.DISCORD_NHL_WEBHOOKS = 'NHL'; process.env.DISCORD_RECEIPTS_WEBHOOK = 'CALLED'
eq('mlb feed unchanged', feedHooks('mlb'), 'HOMER,MLB')
eq('nfl feed -> NFL channel, never MLB', feedHooks('nfl'), 'HOMER,NFL')
eq('nhl feed -> NHL channel', feedHooks('nhl'), 'HOMER,NHL')
eq('CALLED TD reaches the channel', feedHooksFor('nfl', 'called'), 'HOMER,NFL')
eq('ON THE BOARD TD reaches the channel', feedHooksFor('nfl', 'board'), 'HOMER,NFL')
eq('NOT ON THE BOARD TD does not', feedHooksFor('nfl', 'off'), 'HOMER')
eq('unknown status does not', feedHooksFor('nfl', undefined), 'HOMER')
eq('recap also lands in #called-it', withReceipts(feedHooks('mlb')), 'HOMER,MLB,CALLED')
eq('dedupe', hookList('A,B', ['B', 'C'], 'C\nD'), ['A', 'B', 'C', 'D'])
eq('same URL in two vars posts once', (() => { process.env.DISCORD_NFL_WEBHOOKS = 'MLB'; return feedHooks('nfl') })(), 'HOMER,MLB')

// BUCKETS (2026-10-09): never the MLB list, and not the public homer feed while it is hidden
eq('nba: no own channel -> nowhere (not MLB)', (() => { delete process.env.DISCORD_NBA_WEBHOOKS; delete process.env.BUCKETS_PUBLIC; return feedHooks('nba') })(), '')
eq('nba: own channel only while hidden', (() => { process.env.DISCORD_NBA_WEBHOOKS = 'NBA'; return feedHooks('nba') })(), 'NBA')
eq('nba: off-board moment stays off the homer feed while hidden', feedHooksFor('nba', 'off'), '')
eq('nba: open -> homer feed + own channel', (() => { process.env.BUCKETS_PUBLIC = 'on'; return feedHooks('nba') })(), 'HOMER,NBA')
delete process.env.BUCKETS_PUBLIC; delete process.env.DISCORD_NBA_WEBHOOKS

// rooms (push mirror): football touchdowns are the feed's, not the room's
process.env.DISCORD_NFL_WEBHOOKS = 'NFL'; process.env.DISCORD_LIVE_WEBHOOKS = 'MLB'
process.env.DISCORD_ALERTS_WEBHOOKS = ''
// 2026-10-04 ops audit: one path per moment. LIVE pointing at the MLB room
// (or unset) adds nothing -- the homer feed already posted there.
eq('room: followed homer -> nowhere (the feed owns homers)', webhooksForEvent({ category: 'homer', sport: 'mlb' }), [])
eq('room: board-hit slate, LIVE = the MLB room -> nowhere (no double post)', webhooksForEvent({ category: 'slate', sport: 'mlb', boardHit: true }), [])
eq('room: boardup is phone-only (follow-list copy)', webhooksForEvent({ category: 'boardup', sport: 'mlb' }), [])
eq('room: lastcall is phone-only', webhooksForEvent({ category: 'lastcall', sport: 'mlb' }), [])
// 2026-10-09 (notifications pass, Donovan: one channel per event, phone push first): a scratch is a PHONE push; the board room no
// longer repeats it unless DISCORD_BOARD_ROOM_ALERTS=on brings it back (read once at module load: set it at deploy, not at runtime).
eq('room: scratch is phone-first, not the board room', webhooksForEvent({ category: 'scratched', sport: 'mlb' }), [])
eq('room: board-hit slate, its own LIVE channel -> LIVE', (() => { process.env.DISCORD_LIVE_WEBHOOKS = 'LIVE'; return webhooksForEvent({ category: 'slate', sport: 'mlb', boardHit: true }) })(), ['LIVE'])
eq('room: board-hit slate, LIVE unset -> nowhere (no fallback)', (() => { delete process.env.DISCORD_LIVE_WEBHOOKS; return webhooksForEvent({ category: 'slate', sport: 'mlb', boardHit: true }) })(), [])
process.env.DISCORD_LIVE_WEBHOOKS = 'MLB'
eq('room: off-board slate -> nowhere', webhooksForEvent({ category: 'slate', sport: 'mlb', boardHit: false }), [])
eq('room: nfl touchdown -> nowhere (the feed owns it)', webhooksForEvent({ category: 'nfltd', sport: 'nfl' }), [])
eq('room: followed-only red zone stays on phones', webhooksForEvent({ category: 'nflred', sport: 'nfl' }), [])
eq('room: board red zone -> NFL only', webhooksForEvent({ category: 'nflboardred', sport: 'nfl' }), ['NFL'])
eq('room: nfl kickoff -> NFL only', webhooksForEvent({ category: 'nflkick', sport: 'nfl' }), ['NFL'])
eq('room: multihit -> nowhere', webhooksForEvent({ category: 'multihit', sport: 'mlb' }), [])
// the MLB tick's Discord switch must not depend on the OLD homer feed webhook (Donovan cut the other servers 10-10)
{
  const { readFileSync } = await import('node:fs')
  const tick = readFileSync(new URL('../app/api/dash/homers/tick/route.js', import.meta.url), 'utf8')
  const ok = /const DISCORD_ON = Boolean\(feedHooks\('mlb'\)\)/.test(tick) && !/DISCORD_ON = Boolean\(process\.env\.DISCORD_HOMER_WEBHOOK\)/.test(tick)
  if (!ok) { fail += 1; console.log('FAIL  MLB tick DISCORD_ON must read feedHooks(mlb), not DISCORD_HOMER_WEBHOOK') } else console.log('ok    MLB tick DISCORD_ON follows any feed channel, not the old homer webhook')
}
console.log(fail ? `\n${fail} FAILED` : '\nall ok')
process.exit(fail ? 1 : 0)
