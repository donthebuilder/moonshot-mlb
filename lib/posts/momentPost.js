// THE MOMENT POSTS: the runner (server only). A special card (lib/cards/moments.js) for a thing that just happened goes out ONCE, on the channels its tier earns
// (lib/cards/momentPosting.js is the policy; lib/posts/momentFeed.js finds the events). It rides the ticks that already run (the LAMP goals tick, the homers tick,
// the NFL tick, the card tick): no cron, no polling of its own.
//
//   postMomentEvents(db, events, { now, deps })   -> { posted:[...], skipped:[...], blocked? }   (one pass: the best tier first, at most MAX_PER_PASS)
//   momentPass(db, { source, now })                reads the events of a source and posts them, then runs that sport's end-of-night digest (what the ticks call; always inside a try/catch)
//   postMomentCorrections(db, { now, deps })       an NHL goal behind a posted card was overturned: ONE update, never a delete
//
// THE RULES THIS FILE KEEPS
//   - OFF by default: nothing posts unless MOMENT_POSTS_ON is on (Donovan flips it after supabase/migrations/..._homer_feed_moment_kinds.sql has been run).
//   - CLAIM FIRST: the event's row in homer_feed_posts (day, kind = moment_<sport>_<player>_<game>_<rung>) is upserted BEFORE anything is sent, so two ticks
//     (or two instances) never post it twice. A refusal by X keeps the claim and closes the X side 'skipped': the post is never retried in a loop.
//   - SQL NOT RUN: a claim the kind check refuses (23514) means the migration is not run. Nothing is sent, the log says which file to run, and the pass is not
//     tried again for 30 minutes.
//   - THE CAP: the X post goes through xGate.admit (X_POSTS_PAUSE, the daily cap by tier: write-up tier, NOT exempt). Discord is never held back by the X cap.
//   - ELITE AND LEGEND ONLY (Donovan, 2026-10-12): a STAR moment is not posted on its own; it is named in the night's digest (lib/posts/digestPost.js, called at the
//     end of momentPass). A man the night's digest already named is not posted again on his own (digestNamed), and the digest never repeats a man posted here.
//   - THE PICTURE is garnish: it draws in-process with a 12 s limit; a card that does not draw posts X text-only and Discord without the image.
//   - NEVER a delete: a goal that is overturned after the card posted gets an update (a reply under the tweet, a channel card); the original stands.
import { knownTaken, markTaken, unmarkTaken } from '../dash/postClaim'
import { mayRetry } from '../dash/xFail'
import { hasX, postToDiscord, postToX, uploadImageToX } from '../dash/xPost'
import { feedHooks } from '../dash/discordChannels'
import { membersWebhook } from '../dash/membersPost'
import { admit, logPosted } from '../dash/xGate'
import { payloadFor } from '../dash/xSchedule'
import { postsPaused, withNamed } from '../dash/xPolicy'
import { buildCard, playerUrl } from '../dash/discordCard'
import { TIER_WORD } from '../cards/moments'
import {
  eventKeyOf, familyOfKind, policyFor, postable, slugOf, momentPostsOn, momentPostsPaused, kindPaused, momentLine, statusLine, xTextFor, noLinkText, bannedIn,
  MAX_PER_PASS, PASS_BUDGET_MS, IMAGE_TIMEOUT_MS, SQL_RETRY_MS, MIGRATION_FILE,
} from '../cards/momentPosting'
import { etDay } from './momentFeed'
import { digestNamed } from './digestNamed'

let _sqlBlockedUntil = 0
export const _resetMomentPost = () => { _sqlBlockedUntil = 0 }
export const sqlBlockedUntil = () => _sqlBlockedUntil
/** A claim the kind check refused (the SQL is not run): no moment, digest or postseason post is tried again until `now` + 30 minutes. */
export const blockSql = (now) => { _sqlBlockedUntil = now + SQL_RETRY_MS }

// ── the real senders, replaceable in tests ────────────────────────────────────
async function renderCard(e, db) {
  // THE COLLECTIBLE FRAME (2026-10-14): the card is drawn in the new 5:7 look with its real issue number when the issuance table has one. A moment the v2 rules do not recognise
  // (a long shot priced after the lock, say) falls back to the old special card, so a post never loses its picture over a rule difference.
  try {
    const { collectModel } = await import('../cards/collect/collectData')
    const c = await collectModel(e.moment, e.row, {})
    if (c) {
      const { issueNoOf, issueLabel } = await import('../cards/issue')
      c.model.collect.issue = issueLabel(await issueNoOf(db, c.id.cardId))
      const { renderCollect } = await import('../cards/collect/collectCard')
      return { model: c.model, png: Buffer.from(await renderCollect(c.model, {})) }
    }
  } catch (err) { console.error(`[moment] collect card failed for ${e?.who?.name}: ${err?.message || err}`) }
  const { modelFromRow } = await import('../cards/specialData')
  const model = await modelFromRow(e.moment, e.row)
  if (!model) return { model: null, png: null }
  const { renderSpecial } = await import('../cards/specialCard')
  return { model, png: Buffer.from(await renderSpecial(model, { width: 1080 })) }
}
const DEFAULTS = {
  hasX, postToX, uploadImageToX, postToDiscord, feedHooks, membersWebhook, admit, logPosted,
  render: renderCard,
  clock: () => Date.now(),
}

/** Run `work()` against the image time limit: { model, png } or { model:null, png:null }. Never throws. */
async function drawn(work, e, timeoutMs, db = null) {
  let timer
  try {
    const r = await Promise.race([work(e, db), new Promise((res) => { timer = setTimeout(() => res(null), timeoutMs) })])
    return r?.png?.length ? { model: r.model || null, png: r.png } : { model: r?.model || null, png: null }
  } catch (err) { console.error(`[moment] card failed for ${e?.who?.name}: ${err?.message || err}`); return { model: null, png: null } }
  finally { clearTimeout(timer) }
}

/** The claim: 'claimed' | 'taken' | { error } (the kind check is `error.kindCheck`). */
async function claim(db, day, kind, payload) {
  if (knownTaken(day, kind)) return 'taken'
  const { data, error } = await db.from('homer_feed_posts').upsert([{ day, kind, payload }], { onConflict: 'day,kind', ignoreDuplicates: true }).select('day')
  if (error) return { error: error.message || String(error), kindCheck: error.code === '23514' || /homer_feed_posts_kind_check|violates check constraint/i.test(String(error.message || '')) }
  markTaken(day, kind)
  return data?.length ? 'claimed' : 'taken'
}

/** A moment's Discord words and card, pure (the poster and scripts/check-discord-posts.mjs both use these). */
export const momentDiscordLine = (line, status) => noLinkText([line, statusLine(status)].filter(Boolean).join(' '))
/** The #members copy of a moment's words: the line alone, no status tag. */
export const momentMembersLine = (line) => noLinkText(String(line || '').replace(/\s*He was (ON THE BOARD|CALLED)\.?/gi, '').trim())
// the card says the status ONCE (buildCard's status word) and no tier word (2026-10-23: "ON THE BOARD · ... He was ON THE BOARD." read twice)
export const momentDiscordEmbed = (e, { name, discordLine, png = null, now = Date.now() }) => buildCard({ sport: e.sport, title: `${name} · ${e.ev.print.kicker}`, status: e.status, description: momentMembersLine(discordLine), url: playerUrl(e.sport, e.who.playerId), at: e.at || now, ...(png ? { image: 'attachment://card.png' } : {}) })

/** Post ONE event. Returns a one-line result for the tick's log. */
async function postOne(db, e, ctx) {
  const { d, now, state } = ctx
  if (!postable(e.tier)) return 'skip: only ELITE and LEGEND post on their own (STAR rides the night\'s digest, BASE never)'
  const ek = eventKeyOf({ sport: e.sport, playerId: e.who.playerId, gameId: e.gameId, n: e.n })
  if (!ek) return 'skip: no event key'
  if (kindPaused(ek.family)) return `skip: ${ek.family} is paused`
  const day = String(e.day || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return 'skip: no game date'
  if (knownTaken(day, ek.kind)) return 'skip: already posted'

  // already NAMED in tonight's digest: not posted a second time on his own
  if ((await digestNamed(db, e.sport, day)).has(slugOf(e.who.playerId))) return 'skip: already named in the night\'s digest'

  const xDay = etDay(now)
  const policy = policyFor(e.tier, { hasX: d.hasX(), hasMembers: Boolean(d.membersWebhook()) })
  const hooks = policy.discord ? d.feedHooks(e.sport) : ''
  const members = policy.members ? d.membersWebhook() : ''
  if (!policy.x && !hooks && !members) return `skip: no channel (${policy.why || 'none configured'})`

  // 1. CLAIM FIRST (the event is in the kind; the full key rides in the payload with who it names, for the repeat records and the correction)
  const payload = withNamed({ moment: e.moment, event: ek.key, tier: e.tier, kicker: e.ev.print.kicker, sport: e.sport, status: e.status || null, ...(e.goals ? { goals: e.goals } : {}), x_wanted: policy.x }, [e.who.playerId])
  const c = await claim(db, day, ek.kind, payload)
  if (c === 'taken') return 'skip: already posted'
  if (c.error) {
    if (c.kindCheck) {
      _sqlBlockedUntil = now + SQL_RETRY_MS
      console.error(`[moment] kind not allowed yet (run ${MIGRATION_FILE}) -- ${ek.family} posts wait; asked again in 30 minutes`)
      return 'blocked: kind not allowed yet (run the SQL)'
    }
    console.error(`[moment] claim failed for ${ek.kind}: ${c.error}`)
    return 'skip: claim failed'
  }

  // 2. the picture (garnish) and the words
  const { model, png } = await drawn(d.render, e, IMAGE_TIMEOUT_MS, db)
  const name = model?.name || e.who.name
  const who = { ...e.who, name }
  const line = momentLine(e.moment, e.row, who)
  const names = [name, e.who.name, e.who.team, e.who.opp]
  const xText = xTextFor(line, e.status, names)
  const discordLine = momentDiscordLine(line, e.status)
  if (!line || bannedIn(discordLine, names)) {
    await db.from('homer_feed_posts').update({ payload: { ...payload, dropped: 'no clean text' } }).match({ day, kind: ek.kind })
    return 'dropped: no clean text'
  }

  // 3. send. Discord (sport channel [+ the feed]) and #members first: neither waits on the X cap.
  const patch = { payload: { ...payload, ...payloadFor(ek.kind, now), line } }
  const embed = momentDiscordEmbed(e, { name, discordLine, png, now })
  let discordSent = false
  let membersSent = false
  let discordTried = false
  let discordStatus = null
  if (hooks) {
    discordTried = true
    const r = await d.postToDiscord(discordLine, { embed, ...(png ? { png } : {}), kind: ek.kind, sportKey: e.sport }, hooks).catch((err) => ({ ok: false, status: 0, error: String(err?.message || err) }))
    discordSent = Boolean(r?.ok); discordStatus = r?.status ?? null
  }
  if (members) {
    // #members reads plain words: no CALLED / ON THE BOARD tag (Donovan, 2026-10-23); the free channels keep it
    const plain = momentMembersLine(line)
    const r = await d.postToDiscord(plain, { embed: momentDiscordEmbed({ ...e, status: null }, { name, discordLine: plain, png, now }), ...(png ? { png } : {}), kind: ek.kind, sportKey: e.sport }, members).catch(() => ({ ok: false }))
    membersSent = Boolean(r?.ok)
  }
  // X: the pause and the cap by tier through admit()
  let xId = null
  let xNote = ''
  if (policy.x && xText) {
    {
      const a = await d.admit(db, { day: xDay, kind: ek.kind, ids: [e.who.playerId], sport: e.sport, repeat: false })
      if (a.state !== 'go') xNote = `X ${a.state}: ${a.reason || ''}`
      else {
        const mediaId = png ? await d.uploadImageToX(png) : null
        const r = await d.postToX(xText, { kind: ek.kind, sport: e.sport, ...(mediaId ? { mediaId } : {}) })
        if (r?.ok && r.id) { xId = String(r.id); d.logPosted({ day: xDay, kind: ek.kind, ids: [e.who.playerId], tweetId: xId, text: xText }) }
        else {
          // a refusal keeps the claim and closes the X side ('skipped', counted by nobody): the post is never retried in a loop
          xNote = `X refused: ${r?.status ?? 0} ${String(r?.error || '').slice(0, 80)}`
          console.error(`[moment] X refused ${e.who.name} (${ek.kind}): ${r?.status} ${r?.error}`)
        }
      }
    }
  } else if (policy.x && !xText) xNote = 'no clean X text'
  if (xId) patch.x_post_id = xId
  else if (policy.x) patch.x_post_id = 'skipped'
  if (xNote) patch.payload = { ...patch.payload, x_note: xNote }
  if (discordTried) patch.discord_sent = discordSent
  if (membersSent) patch.payload = { ...patch.payload, members_sent: true }

  // NOTHING WENT OUT (the channel hiccuped and X did not post it either): the claim can be released a few times, as postOnce does; nothing was sent, so nothing can duplicate. A REAL answer only (429, 5xx): status 0 is an aborted request (8 s) that Discord MAY have delivered (xPost.js), and releasing on it re-sent the post up to three times (batch 3, 2026-10-26).
  const hiccup = discordTried && !discordSent && (discordStatus === 429 || discordStatus >= 500)
  if (hiccup && !xId && !membersSent && mayRetry(`moment-send|${ek.kind}`)) {
    const del = await db.from('homer_feed_posts').delete().match({ day, kind: ek.kind })
    if (!del?.error) { unmarkTaken(day, ek.kind); return `retry: discord ${discordStatus} and nothing else went out` }
  }
  const saved = await db.from('homer_feed_posts').update(patch).match({ day, kind: ek.kind })
  if (saved?.error) console.error(`[moment] ${ek.kind} posted but the row did not record it: ${saved.error.message}`)
  state.sent += 1
  return `posted ${e.who.name} ${e.moment} ${e.tier}${xId ? ` x:${xId}` : ''}${discordSent ? ' discord' : ''}${membersSent ? ' members' : ''}${xNote ? ` (${xNote})` : ''}`
}

/** One pass over `events` (already ordered best first). */
export async function postMomentEvents(db, events, { now = Date.now(), deps = {} } = {}) {
  const d = { ...DEFAULTS, ...deps }
  const out = { posted: [], skipped: [] }
  if (!momentPostsOn()) return { ...out, off: true }
  if (momentPostsPaused()) return { ...out, paused: true }
  if (now < _sqlBlockedUntil) return { ...out, blocked: 'kind not allowed yet (run the SQL)' }
  const todo = (events || []).filter((e) => postable(e.tier))
  if (!todo.length) return out
  const t0 = d.clock()
  const state = { sent: 0 }
  for (const e of todo) {
    if (state.sent >= MAX_PER_PASS || d.clock() - t0 > PASS_BUDGET_MS) break
    if (now < _sqlBlockedUntil) break
    let r
    try { r = await postOne(db, e, { d, now, state }) } catch (err) { r = `error: ${err?.message || err}`; console.error(`[moment] ${e?.moment}/${e?.who?.name}: ${err?.message || err}`) }
    ;(r.startsWith('posted') ? out.posted : out.skipped).push(r)
  }
  return out
}

/** What the ticks call: read a source's events and post them. Never throws. */
export async function momentPass(db, { source, now = Date.now(), deps = {} } = {}) {
  try {
    if (!momentPostsOn()) return { off: true }
    if (momentPostsPaused()) return { paused: true }
    if (now < _sqlBlockedUntil) return { blocked: 'kind not allowed yet (run the SQL)' }
    const { momentEvents } = await import('./momentFeed')
    const events = await momentEvents(db, { source, now })
    // every card the events prove gets its real issue number (idempotent; a no-op until card_issues exists; never blocks a post)
    const issued = await (await import('../cards/issue')).issuePass(db, events, { now })
    const out = await postMomentEvents(db, events, { now, deps })
    if (source === 'nhl') out.corrections = await postMomentCorrections(db, { now, deps })
    // the end-of-night digest of the sport (free until a night is over: it asks the league's schedule at most every 5 minutes, and only when the sport has rows that day)
    if (['mlb', 'nfl', 'nhl'].includes(source)) out.digest = await (await import('./digestPost')).digestPass(db, { sport: source, now, deps })
    return { source, events: events.length, issued, ...out }
  } catch (err) {
    console.error(`[moment] pass ${source} failed: ${err?.message || err}`)
    return { source, error: String(err?.message || err) }
  }
}

// ── THE UPDATE: a goal behind a posted card was overturned ──────────────────────────────────────────────────────
/** The correction text of a card whose goal(s) came off the board. Pure. `to` = the row the goal was re-credited to. */
export function correctionLine({ kicker, name, many, to }) {
  const who = noLinkText(name) || 'The scorer'
  if (to) return `Update: the league changed the scorer on ${many ? 'one of' : 'that'} ${many ? `${who}'s goals` : 'goal'}. The ${noLinkText(kicker || 'card').toLowerCase()} card above no longer stands.`
  return `Update: ${many ? `one of ${who}'s goals was` : `${who}'s goal was`} overturned on review. The ${noLinkText(kicker || 'card').toLowerCase()} card above no longer stands.`
}
const NOT_A_TWEET = ['posting', 'skipped', 'dry', 'backfill']

/**
 * For every NHL moment post of the last two days whose goals include one that is now overturned: ONE update (a reply under the tweet when there is a real one,
 * a channel card where the card went), claimed in its own row (moment_nhl_<event>_upd) before anything is sent. Never a delete, never touches the original.
 * CORRECTIONS_OFF=on stops it. Exempt from the daily cap (a reply, one per card), like the goal correction it follows.
 */
export async function postMomentCorrections(db, { now = Date.now(), deps = {} } = {}) {
  const d = { ...DEFAULTS, ...deps }
  const out = []
  if (/^(on|1|true)$/i.test(String(process.env.CORRECTIONS_OFF || '').trim())) return out
  try {
    const from = etDay(now - 2 * 86400e3)
    const { data: posted, error } = await db.from('homer_feed_posts').select('day, kind, x_post_id, discord_sent, payload').like('kind', 'moment\\_nhl\\_%').gte('day', from).limit(200)
    if (error || !posted?.length) return out
    const cards = posted.filter((r) => !/_upd$/.test(r.kind) && Array.isArray(r.payload?.goals) && r.payload.goals.length)
    if (!cards.length) return out
    const games = [...new Set(cards.flatMap((r) => r.payload.goals.map((g) => g.game_id)))]
    const { data: goals, error: gerr } = await db.from('lamp_goal_feed').select('game_id, player_id, goal_n, name, team, period, time_in_period, score_after, overturned_at').in('game_id', games)
    if (gerr || !goals?.length) return out
    const { recreditedTo } = await import('../nhl/goalFeed')
    for (const r of cards) {
      const gone = r.payload.goals.map((g) => goals.find((x) => Number(x.game_id) === Number(g.game_id) && Number(x.player_id) === Number(g.player_id) && Number(x.goal_n) === Number(g.goal_n))).filter((x) => x && x.overturned_at)
      if (!gone.length) continue
      const ek = r.kind
      const updKind = `${ek}_upd`
      if (updKind.length > 120) continue
      const c = await claim(db, r.day, updKind, { update_of: ek, moment: r.payload.moment, named: r.payload.named || [] })
      if (c === 'taken') continue
      if (c.error) { if (c.kindCheck) console.error(`[moment] update kind not allowed yet (run ${MIGRATION_FILE})`); else console.error(`[moment] update claim failed: ${c.error}`); continue }
      const first = gone[0]
      const to = recreditedTo(first, goals)
      const text = correctionLine({ kicker: r.payload.kicker, name: first.name, many: r.payload.goals.length > 1, to })
      const patch = { payload: { update_of: ek, moment: r.payload.moment, named: r.payload.named || [], text } }
      const reply = r.x_post_id && !NOT_A_TWEET.includes(String(r.x_post_id)) ? String(r.x_post_id) : null
      const sport = 'nhl'
      if (r.discord_sent || r.payload.members_sent) {
        const embed = buildCard({ sport, title: `↩️ ${noLinkText(first.name) || 'The scorer'}: a goal behind that card changed`, description: text, url: playerUrl(sport, first.player_id), at: now })
        const hooks = r.discord_sent ? d.feedHooks(sport) : ''
        const dr = hooks ? await d.postToDiscord(text, { embed, kind: updKind, sportKey: sport }, hooks).catch(() => ({ ok: false })) : { ok: false }
        patch.discord_sent = Boolean(dr?.ok)
        if (r.payload.members_sent && d.membersWebhook()) await d.postToDiscord(text, { embed, kind: updKind, sportKey: sport }, d.membersWebhook()).catch(() => null)
      }
      if (reply && d.hasX() && !postsPaused()) {
        const xr = await d.postToX(text, { kind: updKind, sport, replyTo: reply })
        patch.x_post_id = xr?.ok && xr.id ? String(xr.id) : 'skipped'
        if (!(xr?.ok && xr.id)) console.error(`[moment] update for ${ek} refused by X: ${xr?.status} ${xr?.error}`)
      }
      await db.from('homer_feed_posts').update(patch).match({ day: r.day, kind: updKind })
      out.push(`${ek} updated`)
    }
  } catch (err) { console.error(`[moment] corrections: ${err?.message || err}`) }
  return out
}

export { familyOfKind, claim as claimEvent, drawn as drawnCard, DEFAULTS as MOMENT_SENDERS }
