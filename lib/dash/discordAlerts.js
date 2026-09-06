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
// per-user check that has nothing to check against here.
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
//                             Every one of them gets every MLB and NFL event.
//   DISCORD_MLB_WEBHOOKS
//   DISCORD_NFL_WEBHOOKS      optional, same list format. Setting either one
//                             makes THAT sport stop falling back to the
//                             shared list -- so moving NFL onto its own
//                             server later is a Vercel env edit, not a code
//                             change. Leave both unset and everything just
//                             uses DISCORD_ALERTS_WEBHOOKS.
//
// Never throws. A bad or rate-limited webhook is logged and skipped; it can
// never take the push send down, because this always runs alongside it, not
// instead of it.

import { postToDiscord } from './xPost'

const list = (raw) => String(raw || '')
  .split(/[,\n]/)
  .map((s) => s.trim())
  .filter(Boolean)

function webhooksFor(sport) {
  const scoped = list(sport === 'nfl' ? process.env.DISCORD_NFL_WEBHOOKS : process.env.DISCORD_MLB_WEBHOOKS)
  return scoped.length ? scoped : list(process.env.DISCORD_ALERTS_WEBHOOKS)
}

export const discordAlertsOn = () => Boolean(
  process.env.DISCORD_ALERTS_WEBHOOKS || process.env.DISCORD_MLB_WEBHOOKS || process.env.DISCORD_NFL_WEBHOOKS,
)

/**
 * Post this tick's fresh events to every configured Discord webhook.
 * Returns { sent, failed } -- counts of individual webhook deliveries, not
 * events, so three servers on one homer counts as three.
 */
export async function fanOutToDiscord(events) {
  const worth = (events || []).filter((e) => e?.sport === 'mlb' || e?.sport === 'nfl')
  if (!discordAlertsOn() || !worth.length) return { sent: 0, failed: 0 }

  let sent = 0
  let failed = 0
  await Promise.all(worth.map(async (e) => {
    const webhooks = webhooksFor(e.sport)
    if (!webhooks.length) return
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
