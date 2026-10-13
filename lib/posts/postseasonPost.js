// THE POSTSEASON BIG-NIGHT POSTS (Donovan, 2026-10-12: "yes post season card when it's postseason"). When an MLB postseason game turns Final, every player who had a
// big night by the approved rule (lib/posts/postseasonCard.js BIG_NIGHT: a hitter with a home run, 3+ hits or 4+ RBI; a pitcher with 8+ strikeouts, or 6+ innings
// and 1 earned run or fewer) gets his postseason edition card posted: X (neutral text, no link, <= 280) and the MLB Discord channel (the embed carries the site's
// player link). It rides the homers tick (lib/posts/postseasonPost.js postseasonPass is called after the tick's own work; no cron, no polling of its own: the
// schedule read is kept 3 minutes per instance and only happens while the postseason is on).
//
// RULES: ONE post per player per game (the claim row postseason_mlb_<gamePk>_<playerId> on the game's own date, claimed before anything is sent). At most
// POSTSEASON_MAX_PER_NIGHT (3) a night, the most notable first inside a game. NOT exempt from the X cap or the pause (write-up tier). OFF unless MOMENT_POSTS_ON.
// A player whose season game log has not caught up with the Final yet is waited for (the post says only what MLB's own log says), then given up on.
// The picture draws in-process from the share route's loader with the 12 s limit; failing, X posts text only and Discord posts without the image.
import { hasX, postToDiscord, postToX, uploadImageToX } from '../dash/xPost'
import { feedHooks } from '../dash/discordChannels'
import { admit, logPosted } from '../dash/xGate'
import { payloadFor } from '../dash/xSchedule'
import { withNamed } from '../dash/xPolicy'
import { mayRetry } from '../dash/xFail'
import { knownTaken, unmarkTaken } from '../dash/postClaim'
import { postseasonKeyOf, kindPaused, momentPostsOn, momentPostsPaused, POSTSEASON_MAX_PER_NIGHT, POSTSEASON_FRESH_MS, POSTSEASON_WAIT_TRIES, IMAGE_TIMEOUT_MS, MIGRATION_FILE, SQL_RETRY_MS, PASS_BUDGET_MS } from '../cards/momentPosting'
import { boxNight, buildPostseasonPost } from './postseasonCard'
import { claimEvent, drawnCard, sqlBlockedUntil } from './momentPost'
import { etDay } from './momentFeed'

const API = 'https://statsapi.mlb.com/api/v1'
const _memo = new Map()
const memo = async (key, ttl, fn) => {
  const hit = _memo.get(key)
  if (hit && Date.now() - hit.at < ttl) return hit.v
  const v = await fn()
  if (_memo.size > 60) _memo.clear()
  if (v != null) _memo.set(key, { at: Date.now(), v })
  return v
}
const jget = async (url) => { try { const r = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(8000) }); return r.ok ? await r.json() : null } catch { return null } }
export const _resetPostseasonPost = () => { _memo.clear(); _done.clear(); _blockedUntil = 0 }

const _done = new Set()          // gamePk -> every qualifier of that Final is posted or given up on (per instance; the claims are the real record)
let _blockedUntil = 0            // the SQL is not run (kind check): not asked again for 30 minutes

/** The postseason games of the ET day before and today, with their status. */
async function scheduleGames(now) {
  return memo(`ps-sch|${etDay(now)}`, 3 * 60e3, async () => {
    const j = await jget(`${API}/schedule?sportId=1&startDate=${etDay(now - 86400e3)}&endDate=${etDay(now)}&gameType=F,D,L,W`)
    return j ? (j.dates || []).flatMap((d) => d.games || []) : null
  })
}
const boxscore = (pk) => memo(`ps-box|${pk}`, 5 * 60e3, () => jget(`${API}/game/${pk}/boxscore`))

/** Final postseason games that started within POSTSEASON_FRESH_MS: [{ pk, date, season, startMs }]. Pure over a schedule body. */
export function finalGames(games, now) {
  return (games || [])
    .filter((g) => g?.status?.abstractGameState === 'Final' && !/postponed|cancel|suspend/i.test(String(g.status?.detailedState || '')) && g.gamePk)
    .map((g) => ({ pk: String(g.gamePk), date: String(g.officialDate || '').slice(0, 10), season: String(g.season || String(g.officialDate || '').slice(0, 4)), startMs: Date.parse(g.gameDate || ''), teams: g.teams }))
    .filter((g) => /^\d{4}-\d{2}-\d{2}$/.test(g.date) && Number.isFinite(g.startMs) && now - g.startMs <= POSTSEASON_FRESH_MS)
}

/** Pure: a Final game's boxscore -> the players with a big night, most notable first: [{ id, name, group, score }]. */
export function bigNights(box) {
  const out = []
  for (const side of ['home', 'away']) {
    for (const p of Object.values(box?.teams?.[side]?.players || {})) {
      const id = p?.person?.id
      if (!id) continue
      for (const n of boxNight(p.stats)) out.push({ id: String(id), name: p.person.fullName || '', group: n.group, score: n.score })
    }
  }
  return out.sort((a, b) => b.score - a.score || String(a.name).localeCompare(String(b.name)))
}

const DEFAULTS = {
  hasX, postToX, uploadImageToX, postToDiscord, feedHooks, admit, logPosted,
  schedule: scheduleGames, boxscore,
  postseasonOn: async (day) => (await (await import('../dash/seasonGuard')).postseasonOn(day)).postseason === true,
  loadPlayer: async ({ id, season, group }) => (await import('../cards/postseasonData')).loadPostseasonPlayer({ id, season, group, withPictures: false }),
  image: async ({ id, season, group }) => {
    const { shareCardImage } = await import('../cards/cardImage')
    const r = await shareCardImage({ kind: 'postseason', sport: 'mlb', q: { id: String(id), side: 'front', group, season } })
    return r?.ok && r.png?.length ? { model: null, png: Buffer.from(r.png) } : { model: null, png: null }
  },
  xUsed: null,
  clock: () => Date.now(),
}

/** How many postseason cards this game date has claimed already (the night's limit). A failed read answers the limit: nothing posts on a guess. */
async function claimedThatNight(db, date) {
  const { data, error } = await db.from('homer_feed_posts').select('kind').eq('day', date).like('kind', 'postseason\\_mlb\\_%')
  return error ? POSTSEASON_MAX_PER_NIGHT : (data || []).length
}

async function postPlayer(db, g, n, ctx) {
  const { d, now } = ctx
  const ek = postseasonKeyOf({ gamePk: g.pk, playerId: n.id })
  if (!ek) return 'skip: no key'
  if (knownTaken(g.date, ek.kind)) return 'skip: already posted'
  if (kindPaused(ek.family)) return 'skip: postseason_mlb is paused'
  // his season model: the game must be in MLB's own game log before the card says anything about it
  const lp = await d.loadPlayer({ id: n.id, season: g.season, group: n.group })
  if (!lp?.ok) return `wait: no model (${lp?.why || 'unknown'})`
  const model = lp.model
  if (String(model.last?.gamePk || '') !== String(g.pk)) return mayRetry(`ps-wait|${ek.kind}`, POSTSEASON_WAIT_TRIES) ? 'wait: his game log has not caught up' : 'skip: his game log never caught up'
  const post = buildPostseasonPost(model, { at: new Date(g.startMs).toISOString() })
  if (!post.ok) return `skip: ${post.why}`
  const xText = post.x.text
  const hooks = d.feedHooks('mlb')
  const wantX = d.hasX() && Boolean(xText)
  if (!wantX && !hooks) return 'skip: no channel'
  // CLAIM FIRST
  const payload = withNamed({ moment: 'postseason_big_night', event: ek.key, game_pk: g.pk, group: n.group, round: model.last?.round || null, line: xText || null }, [n.id])
  const c = await claimEvent(db, g.date, ek.kind, payload)
  if (c === 'taken') return 'skip: already posted'
  if (c.error) {
    if (c.kindCheck) { _blockedUntil = now + SQL_RETRY_MS; console.error(`[postseason] kind not allowed yet (run ${MIGRATION_FILE}) -- postseason posts wait; asked again in 30 minutes`); return 'blocked: kind not allowed yet (run the SQL)' }
    console.error(`[postseason] claim failed for ${ek.kind}: ${c.error}`)
    return 'skip: claim failed'
  }
  const { png } = await drawnCard(() => d.image({ id: n.id, season: g.season, group: n.group }), {}, IMAGE_TIMEOUT_MS)
  const patch = { payload: { ...payload, ...payloadFor(ek.kind, now) } }
  let discordSent = false
  let discordStatus = null
  if (hooks) {
    const embed = { ...post.discord.embed }
    if (!png) delete embed.image
    const r = await d.postToDiscord(post.discord.embed.description || xText || '', { embed, ...(png ? { png } : {}), kind: ek.kind, sportKey: 'mlb' }, hooks).catch((err) => ({ ok: false, status: 0, error: String(err?.message || err) }))
    discordSent = Boolean(r?.ok); discordStatus = r?.status ?? null
    patch.discord_sent = discordSent
  }
  let xId = null
  if (wantX) {
    const a = await d.admit(db, { day: etDay(now), kind: ek.kind, ids: [n.id], sport: 'mlb', repeat: false })
    if (a.state !== 'go') patch.payload = { ...patch.payload, x_note: `X ${a.state}: ${a.reason || ''}` }
    else {
      const mediaId = png ? await d.uploadImageToX(png) : null
      const r = await d.postToX(xText, { kind: ek.kind, sport: 'mlb', ...(mediaId ? { mediaId } : {}) })
      if (r?.ok && r.id) { xId = String(r.id); d.logPosted({ day: etDay(now), kind: ek.kind, ids: [n.id], tweetId: xId, text: xText }) }
      else { console.error(`[postseason] X refused ${n.name} (${ek.kind}): ${r?.status} ${r?.error}`); patch.payload = { ...patch.payload, x_note: `X refused: ${r?.status ?? 0}` } }
    }
    patch.x_post_id = xId || 'skipped'      // a refusal keeps the claim and closes the X side: never a loop
  }
  const hiccup = hooks && !discordSent && (discordStatus === 0 || discordStatus === 429 || discordStatus >= 500)
  if (hiccup && !xId && mayRetry(`ps-send|${ek.kind}`)) {
    const del = await db.from('homer_feed_posts').delete().match({ day: g.date, kind: ek.kind })
    if (!del?.error) { unmarkTaken(g.date, ek.kind); return `retry: discord ${discordStatus} and nothing else went out` }
  }
  const saved = await db.from('homer_feed_posts').update(patch).match({ day: g.date, kind: ek.kind })
  if (saved?.error) console.error(`[postseason] ${ek.kind} posted but the row did not record it: ${saved.error.message}`)
  ctx.sent += 1
  return `posted ${n.name} ${n.group} game ${g.pk}${xId ? ` x:${xId}` : ''}${discordSent ? ' discord' : ''}`
}

/**
 * One pass (called by the homers tick, last): find the Final postseason games, take each one's big nights, post the best that fit the night's limit.
 * Never throws. -> { off | paused | blocked | skipped: why | posted:[...], skipped:[...] }
 */
export async function postseasonPass(db, { now = Date.now(), deps = {} } = {}) {
  const d = { ...DEFAULTS, ...deps }
  const out = { posted: [], skipped: [] }
  try {
    if (!momentPostsOn()) return { off: true }
    if (momentPostsPaused()) return { paused: true }
    if (now < _blockedUntil || now < sqlBlockedUntil()) return { blocked: 'kind not allowed yet (run the SQL)' }
    if (kindPaused('postseason_mlb')) return { paused: 'postseason_mlb' }
    if (!(await d.postseasonOn(etDay(now)))) return { skipped: 'not the postseason' }
    const finals = finalGames(await d.schedule(now), now).filter((g) => !_done.has(g.pk)).sort((a, b) => a.startMs - b.startMs)
    if (!finals.length) return { skipped: 'no new final', ...out }
    const t0 = d.clock()
    const ctx = { d, now, sent: 0 }
    for (const g of finals) {
      if (d.clock() - t0 > PASS_BUDGET_MS) break
      const nights = bigNights(await d.boxscore(g.pk))
      if (!nights.length) { _done.add(g.pk); out.skipped.push(`game ${g.pk}: no big night`); continue }
      let waiting = false
      for (const n of nights) {
        if (d.clock() - t0 > PASS_BUDGET_MS) { waiting = true; break }
        const have = await claimedThatNight(db, g.date)
        if (have >= POSTSEASON_MAX_PER_NIGHT) { out.skipped.push(`game ${g.pk}: the night's limit (${POSTSEASON_MAX_PER_NIGHT}) is reached`); break }
        let r
        try { r = await postPlayer(db, g, n, ctx) } catch (err) { r = `error: ${err?.message || err}`; console.error(`[postseason] ${n.name}: ${err?.message || err}`) }
        if (r.startsWith('wait') || r.startsWith('retry') || r.startsWith('error')) waiting = true
        if (r.startsWith('blocked')) { out.skipped.push(r); return out }
        ;(r.startsWith('posted') ? out.posted : out.skipped).push(r)
      }
      if (!waiting) _done.add(g.pk)
    }
    return out
  } catch (err) {
    console.error(`[postseason] pass failed: ${err?.message || err}`)
    return { error: String(err?.message || err) }
  }
}
