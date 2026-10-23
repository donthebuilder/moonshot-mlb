// IS THIS DISCORD POST BROKEN? ONE PLACE (2026-10-23, the Discord harness: scripts/check-discord-posts.mjs).
// Pure: takes the exact body postToDiscord would send (lib/dash/xPost.js discordPayload) and the channel keys it would reach, returns
// problems. Nothing here posts, reads env or the network.
//
//   ERROR (the harness fails):  empty post · junk words (undefined / null / NaN / [object Object] / Invalid Date / ${) · over Discord's
//                               limits · text cut at 1,900 · pings not disabled · a bad link · another product's name or words in a
//                               one-sport post · "the bot" · a members post reaching a free channel · a sport post in another sport's channel
//   WARN (printed, not failed): ragged spacing · long copy (Donovan's less-words rule: word count is printed for every post)

export const DISCORD_HARD = Object.freeze({ content: 2000, embeds: 10, title: 256, description: 4096, fields: 25, name: 256, value: 1024, footer: 2048, total: 6000 })
export const CUT_AT = 1900      // postToDiscord cuts content here; a text that long was cut, which is broken copy

const glyphs = (s) => [...String(s == null ? '' : s)].length

export const BRANDS = Object.freeze({ mlb: 'MOONSHOT', nfl: 'TUDDY', nhl: 'LAMP', nba: 'BUCKETS' })
// words that only belong to one sport's night (the start of the game, the event)
const SPORT_WORDS = Object.freeze({
  mlb: /\b(first pitch|home runs?|homers?|went deep|goes deep)\b/i,
  nfl: /\b(kickoff|touchdowns?|end zone)\b/i,
  nhl: /\b(puck drop|power play|hat trick)\b/i,
  nba: /\b(tip-?off|triple-double|double-double)\b/i,
})
const JUNK = /\bundefined\b|\bNaN\b|\[object Object\]|Invalid Date|\$\{|(^|[\s(:])null([\s).,]|$)/
const SITE_LINK = /^https:\/\/[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i

/** Every human-readable string in a payload, with where it sits. */
export function payloadStrings(payload = {}) {
  const out = []
  if (payload.content) out.push(['content', payload.content])
  for (const [i, e] of (payload.embeds || []).entries()) {
    const at = `embed${i}`
    if (e.title) out.push([`${at}.title`, e.title])
    if (e.description) out.push([`${at}.description`, e.description])
    for (const [j, f] of (e.fields || []).entries()) { out.push([`${at}.field${j}.name`, f.name]); out.push([`${at}.field${j}.value`, f.value]) }
    if (e.footer?.text) out.push([`${at}.footer`, e.footer.text])
    if (e.author?.name) out.push([`${at}.author`, e.author.name])
  }
  return out
}

/** Every link in a payload (embed urls and the links written in the text). */
export function payloadLinks(payload = {}) {
  const urls = []
  for (const e of payload.embeds || []) {
    if (e.url) urls.push(e.url)
    if (e.image?.url && !/^attachment:\/\//.test(e.image.url)) urls.push(e.image.url)
    if (e.thumbnail?.url) urls.push(e.thumbnail.url)
  }
  for (const [, s] of payloadStrings(payload)) for (const m of String(s).matchAll(/https?:\/\/[^\s)>\]]+/g)) urls.push(m[0])
  return urls
}

/** The words a reader reads (links and markdown out). */
export function wordCount(payload = {}) {
  const text = payloadStrings(payload).filter(([at]) => !/footer/.test(at)).map(([, s]) => s).join(' ')
  return text.replace(/https?:\/\/\S+/g, ' ').replace(/[*_`>#|~]/g, ' ').split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length
}

/**
 * @param payload  the body (discordPayload(...).payload)
 * @param o.sport  the post's sport, or 'all' for a cross-sport post (the slate, the receipt, THE DAY ...)
 * @param o.source the text before the 1,900 cut (to tell a cut post), optional
 * @param o.channels the env KEY NAMES the post reaches (routing applied), optional
 * @param o.members  true when the post is members-only content
 * @returns {{ errors: string[], warns: string[], words: number }}
 */
export function checkDiscordPost(payload, { sport = null, source = null, channels = null, members = false } = {}) {
  const errors = []
  const warns = []
  const strings = payloadStrings(payload)
  const embeds = payload?.embeds || []
  if (!strings.length && !embeds.some((e) => e.image?.url)) errors.push('empty post')
  if (!payload?.allowed_mentions || (payload.allowed_mentions.parse || []).length) errors.push('pings not disabled (allowed_mentions.parse must be [])')

  // limits
  if (glyphs(payload?.content) > DISCORD_HARD.content) errors.push(`content ${glyphs(payload.content)} > ${DISCORD_HARD.content}`)
  if (source != null && glyphs(source) > CUT_AT && !embeds.length) errors.push(`text ${glyphs(source)} characters: cut at ${CUT_AT}`)
  if (embeds.length > DISCORD_HARD.embeds) errors.push(`${embeds.length} embeds > ${DISCORD_HARD.embeds}`)
  let total = 0
  for (const [i, e] of embeds.entries()) {
    const over = (what, s, max) => { const n = glyphs(s); total += n; if (n > max) errors.push(`embed${i}.${what} ${n} > ${max}`) }
    over('title', e.title, DISCORD_HARD.title)
    over('description', e.description, DISCORD_HARD.description)
    over('footer', e.footer?.text, DISCORD_HARD.footer)
    if ((e.fields || []).length > DISCORD_HARD.fields) errors.push(`embed${i} ${e.fields.length} fields > ${DISCORD_HARD.fields}`)
    for (const f of e.fields || []) {
      over('field name', f.name, DISCORD_HARD.name); over('field value', f.value, DISCORD_HARD.value)
      if (!String(f.name || '').trim() || !String(f.value || '').trim()) errors.push(`embed${i} has an empty field`)
    }
    if (!e.image?.url && !String(e.title || '').trim() && !String(e.description || '').trim()) errors.push(`embed${i} has no title, text or picture`)
  }
  if (total > DISCORD_HARD.total) errors.push(`embeds total ${total} > ${DISCORD_HARD.total}`)

  // words
  for (const [at, s] of strings) {
    const m = JUNK.exec(String(s))
    if (m) errors.push(`junk "${m[0].trim()}" in ${at}`)
    if (/\bthe bot\b/i.test(s)) errors.push(`"the bot" in ${at} (say MOONSHOT / TUDDY / LAMP / BUCKETS)`)
    if (/ {2,}/.test(s.replace(/^ +| +$/gm, ''))) warns.push(`double space in ${at}`)
    if (/\n{3,}/.test(s)) warns.push(`3+ line breaks in ${at}`)
  }
  for (const u of payloadLinks(payload)) {
    if (!SITE_LINK.test(u) || /localhost|127\.0\.0\.1|undefined|null/.test(u)) errors.push(`bad link ${u}`)
  }

  // product voice: a one-sport post never names another product or another sport's night
  if (sport && BRANDS[sport]) {
    const all = strings.map(([, s]) => s).join('\n')
    for (const [other, brand] of Object.entries(BRANDS)) {
      if (other === sport) continue
      if (new RegExp(`\\b${brand}\\b`).test(all)) errors.push(`${BRANDS[sport]} post names ${brand}`)
      const w = SPORT_WORDS[other].exec(all)
      if (w && !SPORT_WORDS[sport].test(w[0])) errors.push(`${BRANDS[sport]} post uses ${other.toUpperCase()} words: "${w[0]}"`)
    }
    if ((sport === 'nhl' || sport === 'nba') && /\b\d{1,3}(\.\d+)?% (chance|to score|to hit|probability)\b|\bprobability\b/i.test(all)) errors.push(`${BRANDS[sport]} prints a model probability (a score is a rank, not a chance)`)
  }

  // rooms
  if (channels) {
    if (!channels.length) warns.push('reaches no channel')
    const free = channels.filter((c) => !/_(MEMBERS|DONOVAN|OPS)_/.test(c))      // the private rooms, by key name
    if (members && free.length) errors.push(`members post reaches a free channel: ${free.join(', ')}`)
    const own = { mlb: 'DISCORD_MLB_WEBHOOKS', nfl: 'DISCORD_NFL_WEBHOOKS', nhl: 'DISCORD_NHL_WEBHOOKS', nba: 'DISCORD_NBA_WEBHOOKS' }
    if (sport && own[sport]) for (const c of free) if (Object.values(own).includes(c) && c !== own[sport]) errors.push(`${BRANDS[sport]} post lands in ${c}`)
  }
  return { errors, warns, words: wordCount(payload) }
}
