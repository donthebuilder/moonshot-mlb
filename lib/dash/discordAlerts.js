// MIRRORING THE PUSH CATALOG TO DISCORD.
//
// The push sender (app/api/dash/push/tick) computes one thing per cron run:
// the events that are NEW this tick, globally deduped through dash_push_seen.
// That list already IS "everything that just happened, once" -- which is
// exactly what a Discord broadcast wants and a per-device push does not, so
// this module takes toSend as-is and does not compute anything of its own.
//
// WHY THIS IS NOT PER-USER. dash_alerts_v1 / dash_follow_v1 gate who gets a
// push on THEIR device. A Discord server is not a device -- there is no
// "whose webhook is this" to check it against -- so every event that reaches
// this module goes to every webhook configured for its sport. If that turns
// out to be too loud for a given server, the fix is fewer categories through
// pushRules' audience, or a second webhook fed a filtered subset -- not a
// per-user check that has nothing to check against here. (2026-09-14: it did
// turn out too loud, and the fix is the ROOMS allowlist below.)
//
// FANTASY STAYS OUT. franchiseEventsFrom / lineupGapEventsFrom /
// byeStarterEventsFrom are addressed to one team owner ("you are on the
// clock"), not to a sport's followers, and carry sport:'fantasy'. Broadcasting
// those to a public-ish Discord would leak one person's draft-clock business
// to everyone in the server, so only sport 'mlb' and 'nfl' -- the 16-category
// notification catalog -- ever leave this module.
//
// CONFIG. Cheapest thing that can grow later:
//
//   DISCORD_ALERTS_WEBHOOKS   comma- or newline-separated webhook URLs.
//                             The fallback list for every room below.
//   DISCORD_MLB_WEBHOOKS
//   DISCORD_NFL_WEBHOOKS      optional, same list format. Setting either one
//                             makes THAT sport stop falling back to the
//                             shared list -- so moving NFL onto its own
//                             server later is a Vercel env edit, not a code
//                             change. Leave both unset and everything just
//                             uses DISCORD_ALERTS_WEBHOOKS.
//   DISCORD_LIVE_WEBHOOKS    optional, same list format. The LIVE ROOM below
//                             (2026-09-07, Donovan: "these need to go to the
//                             live action one") are pulled OUT of the sport
//                             list above and sent here instead -- on deck,
//                             iLive's lead swings, clutch spots, extra bases,
//                             the rest of a game actually being played, as
//                             opposed to the pregame four, a roster event, or
//                             a one-time day-after housekeeping post. Unset,
//                             they fall back through DISCORD_MLB_WEBHOOKS /
//                             DISCORD_ALERTS_WEBHOOKS exactly like before, so
//                             this is additive -- nothing changes until the
//                             env var is set.
//
// Never throws. A bad or rate-limited webhook is logged and skipped; it can
// never take the push send down, because this always runs alongside it, not
// instead of it.

import { postToDiscord } from './xPost'

const list = (raw) => String(raw || '')
  .split(/[,\n]/)
  .map((s) => s.trim())
  .filter(Boolean)

// ── THE ROOMS, AND WHAT EACH ONE IS FOR (2026-09-14) ───────────────────────
//
// Until this pass every fresh event went to the room, minus `multihit`. The
// 09-12/09-13 ledger put that at ~1,300 posts a night, ~420 of them "on deck".
// A room has no follow list and no quiet slot, so a blacklist can never keep
// up with the catalog; it has to be an ALLOWLIST -- a room gets the moments
// it exists for and nothing else. Donovan, 2026-09-14: "make all the Discord
// notifications worth something."
//
//   BOARD ROOM   (DISCORD_MLB_WEBHOOKS, else DISCORD_ALERTS_WEBHOOKS)
//                the pregame four: the board is live, last call, a game is
//                off, a scratch. Brings people TO the site. ~4 a night.
//   LIVE ROOM    (DISCORD_LIVE_WEBHOOKS, else the board room's list)
//                the moments: a followed hitter goes deep, bases loaded and
//                he is up, a BOARD HIT slate homer (a random homer is not a
//                story), a touchdown, the red zone. ~30-50 on a full slate.
//   NFL ROOM     (DISCORD_NFL_WEBHOOKS, else DISCORD_ALERTS_WEBHOOKS)
//                kickoff, touchdown, red zone. Nothing more until TD delivery
//                is proven in the ledger.
//
// Everything else -- on deck, clutch, iLive, extra bases, HRR, big bases,
// cold, finals, first pitch, lineup, callup, dropout, multihit, big day,
// one-score game -- is phone-only. It is about YOUR names; a room has none.
//
// One webhook can back two rooms; the send dedupes on URL per event so a
// touchdown never lands twice.
//
// RED ZONE IS THE BOARD'S (2026-10-02): `nflred` (followed men only) stays on
// phones; the room hears `nflboardred`, built from the TUDDY board.
//
// NO `nfltd` HERE (2026-10-02). A touchdown reaches the football channel
// through the per-touchdown feed (app/api/dash/nfl/tick -> nfl_td_feed), which
// is built from the TUDDY board, carries CALLED / ON THE BOARD, and skips
// anyone not on it. This room only ever saw touchdowns by men some subscriber
// FOLLOWS -- including off-board ones -- and would have posted the same
// touchdown a second time. One path per moment.
//
// ONE PATH PER MOMENT, BASEBALL TOO (2026-10-04, ops audit):
//   · `homer` is gone from the room: it fired for any homer by a man some
//     subscriber FOLLOWS -- off-board homers and the follow list in public --
//     and every homer already reaches #moonshot-mlb through the homer feed
//     (app/api/dash/homers/tick). `slate` (a board man's homer) is the same
//     moment, so the live room only carries it to a LIVE channel of its own,
//     never when DISCORD_LIVE_WEBHOOKS is unset and it would fall back to the
//     MLB room the feed already posted in (the double post).
//   · `boardup` / `lastcall` are phone-only: their copy is built from the
//     union of everyone's follows ("3 of your names made it", "4 of yours
//     start soon") -- wrong words for a room, and a follow list in public.
//     The room's board post is the feed's own morning board.
const ROOMS = {
  // ONE CHANNEL PER EVENT (2026-10-09): scratch and delay reach Discord through the bot's
  // pen-door post (designated picks only, lineup-checked) and the phone push; the site no
  // longer posts them a third time. DISCORD_BOARD_ROOM_ALERTS=on restores this room.
  board: new Set(process.env.DISCORD_BOARD_ROOM_ALERTS === 'on' ? ['gameoff', 'scratched'] : []),
  // `slam` left this room (2026-10-09): the bot's pen-door "pick at the plate with the bases
  // loaded" ping is the Discord twin, and one channel carries one event. `slate` is cut for
  // phones too, so this room is empty unless PUSH_CUT_CATEGORIES=on.
  live: new Set(['slate']),
  nfl: new Set(['nflkick', 'nflboardred']),
}

function roomWebhooks(room) {
  const alerts = list(process.env.DISCORD_ALERTS_WEBHOOKS)
  const mlb = list(process.env.DISCORD_MLB_WEBHOOKS)
  if (room === 'board') return mlb.length ? mlb : alerts
  if (room === 'live') {
    // Its own channel only (above): no fallback, and never a hook the homer
    // feed already posts to.
    const feed = new Set([...mlb, ...list(process.env.DISCORD_HOMER_WEBHOOK)])
    return list(process.env.DISCORD_LIVE_WEBHOOKS).filter((h) => !feed.has(h))
  }
  if (room === 'nfl') { const nfl = list(process.env.DISCORD_NFL_WEBHOOKS); return nfl.length ? nfl : alerts }
  return []
}

/** Every webhook this event should reach, deduped. Empty means phone-only. */
export function webhooksForEvent(e) {
  const cat = e?.category
  if (!cat) return []
  // A slate homer is a story only when the man was ON tonight's board.
  if (cat === 'slate' && !e.boardHit) return []
  const out = new Set()
  for (const [room, cats] of Object.entries(ROOMS)) {
    if (!cats.has(cat)) continue
    if (room === 'nfl' && e.sport !== 'nfl') continue
    if (room === 'board' && e.sport !== 'mlb') continue
    // The live room is the MLB live room. nfltd/nflred sit in it only so the
    // list of categories that reach any room stays one set; football's own
    // room (above) is the one that carries them, so a touchdown never lands
    // in the baseball channel just because DISCORD_LIVE_WEBHOOKS points there.
    if (room === 'live' && e.sport !== 'mlb') continue
    for (const h of roomWebhooks(room)) out.add(h)
  }
  return [...out]
}

export const discordAlertsOn = () => Boolean(
  process.env.DISCORD_ALERTS_WEBHOOKS || process.env.DISCORD_MLB_WEBHOOKS
  || process.env.DISCORD_NFL_WEBHOOKS || process.env.DISCORD_LIVE_WEBHOOKS,
)

/** Categories that reach any room at all -- exported for the alerts page's labels. */
export const DISCORD_CATEGORIES = new Set([...ROOMS.board, ...ROOMS.live, ...ROOMS.nfl])

/**
 * Post this tick's fresh events to the rooms that want them.
 * Returns { sent, failed } -- counts of individual webhook deliveries, not
 * events, so three servers on one homer counts as three.
 */
export async function fanOutToDiscord(events) {
  if (!discordAlertsOn()) return { sent: 0, failed: 0 }
  const worth = (events || [])
    // mlb|nfl by hand ON PURPOSE (Batch 1, 2026-09-25): these are the only
    // sports with Discord rooms (ROOMS above) and with events at all. LAMP
    // produces none until its event record lands (phase 4). When it does,
    // give NHL its room first, then make this `isSport(e?.sport)` from
    // lib/routes.js -- not a third `||` here.
    .filter((e) => e?.sport === 'mlb' || e?.sport === 'nfl')
    .map((e) => [e, webhooksForEvent(e)])
    .filter(([, hooks]) => hooks.length)
  if (!worth.length) return { sent: 0, failed: 0 }

  let sent = 0
  let failed = 0
  await Promise.all(worth.map(async ([e, webhooks]) => {
    const text = e.title ? `**${e.title}**\n${e.body || ''}` : String(e.body || '')
    await Promise.all(webhooks.map(async (hook) => {
      const r = await postToDiscord(text, {}, hook)
      if (r.ok) sent += 1
      else {
        failed += 1
        console.error(`[discord] alert refused (${e.category || e.sport}): ${r.status} ${r.error}`)
      }
    }))
  }))
  return { sent, failed }
}
