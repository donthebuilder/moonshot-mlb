// THE POSTSEASON CARD POST, BUILD ONLY (2026-10-12). A pure builder: given one player's postseason model (lib/cards/postseason.js) it says whether his
// LATEST postseason game was a big night and, if so, returns the Discord embed and the X text the post would carry.
//
// NOT WIRED. Nothing imports this file but scripts/postseason-card-dryrun.mjs and scripts/check-postseason-cards.mjs. It has no tick, no cron, no
// schedule, no claim, no send, and it is NOT in lib/dash/xSchedule.js KIND_TAGS (a kind without a tag does not post: that is the guard that keeps it
// off). Donovan approves wiring separately; what wiring needs is listed at the bottom of this file and in the dry-run's output.
//
// RULES kept here: X text has no link and no emoji-led hype, is neutral (no "lock / due / guaranteed / nuke"), prints no probability and no model
// number (these are RESULTS), and every figure is from the model, which got it from MLB. Discord may carry the site's player link (lib/dash/discordCard.js).
import { buildCard, playerUrl, actionTitle } from '../dash/discordCard'

/** The words every postseason card and post must never carry (the site-wide rules). Exported for the check. */
export const BANNED = /\b(lock(?:ed|s)?|due|guarantee[ds]?|nuke[ds]?|probabilit(?:y|ies)|chance)\b|%/i

/** THE BIG-NIGHT RULE (defaults; Donovan changes the numbers, not the shape). A hitter: a home run, or 3+ hits, or 4+ RBI. A pitcher: 8+ strikeouts, or 6+ innings with 1 or fewer earned runs. */
export const BIG_NIGHT = Object.freeze({ hr: 1, hits: 3, rbi: 4, k: 8, ip: 6, er: 1 })
export const X_LIMIT = 280

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** What the last game was: { big, headline, parts[] } or { big:false }. Counting stats come from his game log split (model.last.counts). */
export function nightOf(model, rule = BIG_NIGHT) {
  const c = model?.last?.counts
  if (!c) return { big: false }
  if (model.group === 'pitching') {
    const outs = c.outs || 0
    const ip = outs / 3
    const big = c.strikeOuts >= rule.k || (ip >= rule.ip && c.earnedRuns <= rule.er)
    const parts = [`${model.last.ip || `${Math.floor(outs / 3)}.${outs % 3}`} IP`, plural(c.earnedRuns, 'ER', 'ER'), plural(c.strikeOuts, 'strikeout')]
    return { big, headline: c.strikeOuts >= rule.k ? `struck out ${c.strikeOuts}` : `allowed ${plural(c.earnedRuns, 'earned run')} over ${model.last.ip || ''} innings`, verb: 'pitches', parts }
  }
  const big = c.homeRuns >= rule.hr || c.hits >= rule.hits || c.rbi >= rule.rbi
  const parts = [`${c.hits}-for-${c.atBats}`, c.homeRuns ? (c.homeRuns === 1 ? 'HR' : `${c.homeRuns} HR`) : null, c.doubles ? (c.doubles === 1 ? '2B' : `${c.doubles} 2B`) : null, c.triples ? (c.triples === 1 ? '3B' : `${c.triples} 3B`) : null, c.rbi ? `${c.rbi} RBI` : null].filter(Boolean)
  const headline = c.homeRuns >= 2 ? `hit ${c.homeRuns} home runs` : c.homeRuns === 1 ? 'homered' : c.hits >= rule.hits ? `had ${c.hits} hits` : `drove in ${c.rbi} runs`
  return { big, headline, verb: c.homeRuns ? 'homers' : 'delivers', parts }
}

/** The X text: plain, no link, within 280. null when the night is not big. */
export function xText(model, night = nightOf(model)) {
  if (!night.big) return null
  const g = model.last
  const where = [g.round, g.opp ? `${g.isHome === false ? 'at' : 'vs'} ${g.opp}` : ''].filter(Boolean).join(' ')
  const l = model.total
  const sofar = model.group === 'pitching'
    ? `${model.season} postseason: ${l.ip} IP, ${l.era} ERA, ${l.k} K in ${plural(model.games, 'game')}.`
    : `${model.season} postseason: ${plural(Number(l.hr), 'HR', 'HR')}, ${l.rbi} RBI, ${l.avg} AVG in ${plural(model.games, 'game')}.`
  let t = `${model.name} ${night.headline} for the ${model.teamName}${where ? ` (${where})` : ''}: ${night.parts.join(', ')}.\n${sofar}`
  if (t.length > X_LIMIT) t = `${model.name} ${night.headline}: ${night.parts.join(', ')}.\n${sofar}`
  return t.length <= X_LIMIT ? t : null
}

/** The Discord embed (site player link in the title slot, the card attached as card.png). null when the night is not big. */
export function discordEmbed(model, night = nightOf(model), { at = null } = {}) {
  if (!night.big) return null
  const g = model.last
  const tot = model.total
  const career = model.back?.career
  const sections = [
    { name: 'THIS GAME', lines: [`${night.parts.join(' · ')}`, [g.dayWord, g.opp ? `${g.isHome === false ? 'at' : 'vs'} ${g.opp}` : ''].filter(Boolean).join(' · ')] },
    { name: `${model.season} POSTSEASON`, lines: model.group === 'pitching'
      ? [`${tot.ip} IP · ${tot.era} ERA · ${tot.whip} WHIP · ${tot.k} K · ${tot.wl} W-L`]
      : [`${tot.hr} HR · ${tot.rbi} RBI · ${tot.h} H · ${tot.avg}/${tot.obp}/${tot.slg}`, `${plural(model.games, 'game')}`] },
    ...(career ? [{ name: 'CAREER POSTSEASON', lines: [model.group === 'pitching' ? `${career.ip} IP · ${career.era} ERA · ${career.k} K · ${career.wl} W-L` : `${career.hr} HR · ${career.rbi} RBI · ${career.avg}/${career.obp}/${career.slg} in ${plural(Number(career.g), 'game')}`] }] : []),
  ]
  return buildCard({
    sport: 'mlb', title: actionTitle({ icon: '⚾', player: model.name, verb: night.verb, sport: 'mlb', team: model.team, opp: g.opp }),
    description: [g.round, 'postseason edition'].filter(Boolean).join(' · '), sections, at, url: playerUrl('mlb', model.id), image: 'attachment://card.png',
  })
}

/**
 * The whole post a tick WOULD make: { kind, ok, why?, x:{ text, filename }, discord:{ embed, filename }, imageUrl } (the PNG is rendered by the caller from
 * /api/card/share?kind=postseason, side=front: bytes or null, never a reason to hold the text). No I/O here.
 */
export function buildPostseasonPost(model, opts = {}) {
  const night = nightOf(model)
  if (!night.big) return { kind: 'postseason_card', ok: false, why: 'not a big night by the rule', night }
  const text = xText(model, night)
  const embed = discordEmbed(model, night, opts)
  const bad = [text, JSON.stringify(embed)].filter(Boolean).filter((s) => BANNED.test(s.replace(/"/g, '')))
  if (bad.length) return { kind: 'postseason_card', ok: false, why: 'a banned word or a percent sign is in the text', night }
  return { kind: 'postseason_card', ok: true, night, x: { text, length: text ? text.length : 0 }, discord: { embed, filename: 'card.png' }, imageUrl: `/api/card/share?kind=postseason&sport=mlb&id=${model.id}&side=front`, dedupeKey: `postseason|${model.id}|${model.last.date}` }
}

// ── WHAT WIRING NEEDS (not done; Donovan approves) ─────────────────────────
export const WIRING = Object.freeze([
  'lib/dash/xSchedule.js KIND_TAGS: add the kind (e.g. postseason_card: E(\'INFO\', \'postseason\', \'mlb\')) and decide whether it is exempt/uncounted like the CALLED alerts or counts against the 20/day cap; the repeat guard (3 days) is per player, so a second big night inside 3 days would be held unless the kind is exempt.',
  'lib/dash/homerFeed.js (kind check) and the homer_feed_posts kind CHECK constraint in Supabase: the new kind must be allowed (SQL, run BEFORE the code).',
  'A trigger: the existing live HR/box feed (lib/dash/liveSlate / tick) calling buildPostseasonPost once per player per game date when a postseason game turns Final (key: dedupeKey), claimed with lib/dash/postClaim.js so a retry cannot double-post.',
  'The picture: fetch /api/card/share?kind=postseason&sport=mlb&id=&side=front in-process through lib/cards/cardImage.js shareCardImage (12 s limit, null on failure: the text goes out alone), as lib/cards/postImages.js does for slabs.',
  'Posting: lib/dash/xPost.js (X text, the PNG as media, no link) and postToDiscord (embed + attachment://card.png); a kill switch env (e.g. POSTSEASON_CARD_OFF=on) like SLAB_CARD_OFF.',
  'Checks: add the kind to scripts/check-x-kinds (or the tagged-kinds check) and run the gate; confirm the Discord channel (#moonshot-mlb) and that 3 big nights a game do not blow the cap.',
])
