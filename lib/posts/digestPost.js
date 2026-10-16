// THE NIGHT'S DIGEST: "TOP 3 TONIGHT" (server only). Donovan, 2026-10-12: "dont like a pot with three players like the top three that night if available".
// STAR moments are not posted one by one (lib/cards/momentPosting.js): ONE post per sport per night names the three most notable STAR-or-better moments of that
// night, as ONE image (lib/cards/topThreeCard.js), on X + the sport's Discord channel + #members. It rides the tick that already runs for the sport (the end of
// lib/posts/momentPost.js momentPass): no cron, no polling of its own.
//
//   digestPass(db, { sport, now, deps })      -> { off | paused | blocked | wait | nights:[{ night, ... }] }   never throws
//   sendDigest(db, o, d)                       the one sender (also used by the postseason digest, lib/posts/postseasonPost.js)
//
// WHEN. A night is the sport's GAME DATE (ET calendar date of the game's own date, never the wall clock). It is over when the league's own schedule says every
// game of that date is Final (postponed or cancelled games are done for the night): NHL lib/nhl/api scoreFor, MLB statsapi schedule, NFL ESPN scoreboard. Never
// earlier than DIGEST_AFTER_START_MS after the night's LAST start (a floor under a feed that calls a game Final too early; NFL waits longer because the 100-yard
// games come from the weekly logs), never later than DIGEST_FRESH_MS after it (a restart, or the day the switch is turned on, does not dump an old night).
// The league is asked at most every DIGEST_EVAL_MS per sport per instance, and only for a date the sport has feed rows on.
// MLB: on a postseason date the regular 'TOP 3 TONIGHT' is not posted; the postseason digest (lib/posts/postseasonPost.js) is the night's one MLB top-three post.
//
// WHO. lib/cards/digestRank.js: tier, then the moment's size, then recency; one line per man; a man posted on his own that night (ELITE / LEGEND card) is not
// repeated. Fewer than three is posted as it is ('TOP 2 TONIGHT', 'TOP PERFORMER TONIGHT'); none posts nothing. BASE never.
//
// RULES. CLAIM ONCE: the row (night, moment_<sport>_top3_<YYYYMMDD>) is upserted BEFORE anything is sent, so two ticks or two instances never post it twice. An X
// refusal keeps the claim and closes the X side 'skipped': never a loop. ONE X post, write-up tier, NOT exempt: it goes through admit() (pause + cap) like any
// scheduled kind. Discord and #members are never held back by the X cap. The picture is garnish (12 s limit): without it X posts text only and Discord
// posts the embed alone. The kind matches the table's existing moment kind pattern (supabase/migrations/202610121400): no SQL. OFF unless MOMENT_POSTS_ON;
// MOMENT_POSTS_PAUSE stops it, MOMENT_POSTS_PAUSE_KINDS=moment_top3 (every digest) or moment_nhl / moment_nhl_top3 (one sport's) stops just those.
// A goal overturned after the night's digest does not edit it: the digest is posted at the END of the night, after the league's confirmations.
import { mayRetry } from '../dash/xFail'
import { knownTaken, unmarkTaken } from '../dash/postClaim'
import { hasX, postToDiscord, postToX, uploadImageToX } from '../dash/xPost'
import { feedHooks } from '../dash/discordChannels'
import { membersWebhook } from '../dash/membersPost'
import { admit, logPosted } from '../dash/xGate'
import { payloadFor } from '../dash/xSchedule'
import { withNamed } from '../dash/xPolicy'
import { buildCard, siteUrl } from '../dash/discordCard'
import { binderHref } from '../routes'
import {
  digestKindOf, digestPolicy, kindPaused, POSTSEASON_SPORT, momentPostsOn, momentPostsPaused, playerSlugOfKind,
  DIGEST_EVAL_MS, DIGEST_AFTER_START_MS, DIGEST_FRESH_MS, IMAGE_TIMEOUT_MS, MIGRATION_FILE,
} from '../cards/momentPosting'
import { pickTop, digestTexts } from '../cards/digestRank'
import { claimEvent, drawnCard, sqlBlockedUntil, blockSql } from './momentPost'
import { etDay } from './momentFeed'

const ROW_TABLE = { nhl: 'lamp_goal_feed', mlb: 'homer_feed', nfl: 'nfl_td_feed' }
const _next = new Map()      // sport -> ms before which the schedule is not asked again
const _done = new Set()      // `${sport}|${night}` -> nothing more to do for that night on this instance (the claims are the real record)
export const _resetDigest = () => { _next.clear(); _done.clear() }

// ── the league's word on a night (impure; replaceable in tests) ───────────────
const jget = async (url) => { try { const r = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(8000) }); return r.ok ? await r.json() : null } catch { return null } }
/**
 * The games of a sport's game date: { postseason, games:[{ id, startMs, final, off }] }, or null when the league did not answer. `off` = postponed / cancelled /
 * suspended: done for the night without being played.
 */
export async function nightGames(sport, night) {
  if (sport === 'mlb') {
    const j = await jget(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${night}&fields=dates,games,gamePk,gameDate,gameType,status,abstractGameState,detailedState`)
    if (!j) return null
    const raw = (j.dates || []).flatMap((d) => d.games || [])
    return {
      postseason: raw.some((g) => /^[FDLW]$/.test(String(g.gameType || ''))),
      games: raw.map((g) => ({ id: String(g.gamePk), startMs: Date.parse(g.gameDate), off: /postponed|cancel|suspend/i.test(String(g.status?.detailedState || '')), final: g.status?.abstractGameState === 'Final' })),
    }
  }
  if (sport === 'nhl') {
    const [{ scoreFor }, { gameStateOf }] = await Promise.all([import('../nhl/api'), import('../nhl/reduce')])
    let j = null
    try { j = await scoreFor(night) } catch { return null }
    if (!j) return null
    return {
      postseason: false,
      games: (j.games || []).filter((g) => Number(g.gameType) !== 1).map((g) => ({ id: String(g.id), startMs: Date.parse(g.startTimeUTC), off: /^(PPD|CNCL|SUSP)$/i.test(String(g.gameScheduleState || '')), final: gameStateOf(g.gameState) === 'final' })),
    }
  }
  if (sport === 'nfl') {
    const { fetchNflGamesOn } = await import('../nfl/liveSlate')
    let games = null
    try { games = await fetchNflGamesOn(night) } catch { return null }
    if (!games) return null
    return { postseason: false, games: games.map((g) => ({ id: String(g.game_id), startMs: Date.parse(g.kickoff), off: /POSTPONED|CANCEL/i.test(String(g.status_name || '')), final: g.state === 'post' || g.completed === true })) }
  }
  return null
}

/** Pure: is the night over, and when did it last start? { over, live:[...], lastStart } (over = at least one game was played and every game is Final or off). */
export function nightState(games) {
  const list = Array.isArray(games) ? games : []
  const live = list.filter((g) => !g.off)
  const starts = live.map((g) => g.startMs).filter(Number.isFinite)
  return { over: live.length > 0 && live.every((g) => g.final), live, lastStart: starts.length ? Math.max(...starts) : null }
}
/** Pure: may a night that is over be posted at `now`? ('wait' = too early after the last start, 'stale' = too old, 'go'.) */
export function windowFor(sport, lastStart, now) {
  if (lastStart == null) return 'go'      // the league sent no start times: its Final stands on its own
  if (now < lastStart + (DIGEST_AFTER_START_MS[sport] ?? 0)) return 'wait'
  if (now > lastStart + DIGEST_FRESH_MS) return 'stale'
  return 'go'
}

const DEFAULTS = {
  hasX, postToX, uploadImageToX, postToDiscord, feedHooks, membersWebhook, admit, logPosted,
  nightGames,
  hasRows: async (db, sport, night) => {
    const { data, error } = await db.from(ROW_TABLE[sport]).select('day').eq('day', night).limit(1)
    return !error && Boolean(data?.length)
  },
  events: async (db, sport, night, now) => (await import('./momentFeed')).nightEvents(db, { sport, night, now }),
  postedPlayers: async (db, sport, night) => {
    const { data, error } = await db.from('homer_feed_posts').select('kind').eq('day', night).like('kind', `moment\\_${sport}\\_%`).limit(500)
    return error ? null : new Set((data || []).map((r) => playerSlugOfKind(r.kind)).filter(Boolean))
  },
  image: async (model) => {
    const { renderTopThree } = await import('../cards/topThreeCard')
    return { model, png: Buffer.from(await renderTopThree(model, { width: 1080 })) }
  },
  loadModel: async (o) => (await import('../cards/topThreeData')).loadTopThree(o),
  clock: () => Date.now(),
}
export { DEFAULTS as DIGEST_SENDERS }

/**
 * THE ONE SENDER. `o` = { sport, night, kind, picks, postseason?, now }. Claims first, draws the card (12 s), then Discord (sport channel), #members, X.
 * Returns a one-line result for the tick's log: 'posted ...' | 'skip: ...' | 'dropped: ...' | 'blocked: ...' | 'retry: ...'.
 */
export async function sendDigest(db, o, d) {
  const { sport, night, kind, picks, now } = o
  const postseason = Boolean(o.postseason)
  const teamSport = postseason ? POSTSEASON_SPORT : sport      // the product the post belongs to (its channel, its brand, its X sport)
  if (!picks?.length) return 'skip: nothing to name'
  if (kindPaused(kind)) return `skip: ${kind.replace(/_\d{8}$/, '')} is paused`
  if (knownTaken(night, kind)) return 'skip: already posted'
  const pol = digestPolicy({ hasX: d.hasX(), hasMembers: Boolean(d.membersWebhook()) })
  const hooks = pol.discord ? d.feedHooks(sport) : ''
  const members = pol.members ? d.membersWebhook() : ''
  const texts = digestTexts(picks, { sport, postseason })
  if (!texts.title || !texts.discord) return 'dropped: no clean text'
  const wantX = pol.x && Boolean(texts.x)
  if (!wantX && !hooks && !members) return 'skip: no channel'

  // 1. CLAIM FIRST (who it names rides in the payload: the repeat guard, digestNamed, the correction record)
  const ids = picks.map((p) => p.playerId)
  const payload = withNamed({
    moment: 'top3', digest: true, night, sport, count: picks.length, postseason,
    picks: picks.map((p) => ({ player_id: p.playerId, name: p.name, moment: p.moment, tier: p.tier, line: p.line })), x_wanted: wantX,
  }, ids)
  const c = await claimEvent(db, night, kind, payload)
  if (c === 'taken') return 'skip: already posted'
  if (c.error) {
    if (c.kindCheck) {
      blockSql(now)
      console.error(`[digest] kind not allowed yet (run ${MIGRATION_FILE}) -- digest posts wait; asked again in 30 minutes`)
      return 'blocked: kind not allowed yet (run the SQL)'
    }
    console.error(`[digest] claim failed for ${kind}: ${c.error}`)
    return 'skip: claim failed'
  }

  // 2. the picture (garnish)
  const model = await d.loadModel({ sport, picks, night, postseason })
  const { png } = await drawnCard((m) => d.image(m), model, IMAGE_TIMEOUT_MS)

  // 3. send. Discord (sport channel) and #members first: neither waits on the X cap.
  const patch = { payload: { ...payload, ...payloadFor(kind, now), x_text: texts.x || null } }
  const embed = buildCard({
    sport: teamSport, title: `${texts.title} · ${model.brand?.league || sport.toUpperCase()}`, description: texts.discord.split('\n').slice(1).join('\n').trim(),
    url: siteUrl(binderHref(teamSport)) || undefined, at: now, ...(png ? { image: 'attachment://card.png' } : {}),
  })
  const sendOpts = { embed, ...(png ? { png } : {}), kind, sportKey: teamSport }
  let discordSent = false
  let discordTried = false
  let discordStatus = null
  let membersSent = false
  if (hooks) {
    discordTried = true
    const r = await d.postToDiscord(texts.discord, sendOpts, hooks).catch((err) => ({ ok: false, status: 0, error: String(err?.message || err) }))
    discordSent = Boolean(r?.ok); discordStatus = r?.status ?? null
  }
  if (members) {
    const r = await d.postToDiscord(texts.discord, sendOpts, members).catch(() => ({ ok: false }))
    membersSent = Boolean(r?.ok)
  }
  let xId = null
  let xNote = ''
  if (wantX) {
    const xDay = etDay(now)
    const a = await d.admit(db, { day: xDay, kind, ids, sport: teamSport, repeat: false })
    if (a.state !== 'go') xNote = `X ${a.state}: ${a.reason || ''}`
    else {
      const mediaId = png ? await d.uploadImageToX(png) : null
      const r = await d.postToX(texts.x, { kind, sport: teamSport, ...(mediaId ? { mediaId } : {}) })
      if (r?.ok && r.id) { xId = String(r.id); d.logPosted({ day: xDay, kind, ids, tweetId: xId, text: texts.x }) }
      else {
        // a refusal keeps the claim and closes the X side ('skipped', counted by nobody): the digest is never retried in a loop
        xNote = `X refused: ${r?.status ?? 0} ${String(r?.error || '').slice(0, 80)}`
        console.error(`[digest] X refused ${kind}: ${r?.status} ${r?.error}`)
      }
    }
  } else if (pol.x && !texts.x) xNote = 'no clean X text'
  if (xId) patch.x_post_id = xId
  else if (pol.x) patch.x_post_id = 'skipped'
  if (xNote) patch.payload = { ...patch.payload, x_note: xNote }
  if (discordTried) patch.discord_sent = discordSent
  if (membersSent) patch.payload = { ...patch.payload, members_sent: true }

  // NOTHING WENT OUT (the channel hiccuped and nothing else went): the claim can be released a few times; nothing was sent, so nothing can duplicate.
  const hiccup = discordTried && !discordSent && (discordStatus === 0 || discordStatus === 429 || discordStatus >= 500)
  if (hiccup && !xId && !membersSent && mayRetry(`digest-send|${kind}`)) {
    const del = await db.from('homer_feed_posts').delete().match({ day: night, kind })
    if (!del?.error) { unmarkTaken(night, kind); return `retry: discord ${discordStatus} and nothing else went out` }
  }
  const saved = await db.from('homer_feed_posts').update(patch).match({ day: night, kind })
  if (saved?.error) console.error(`[digest] ${kind} posted but the row did not record it: ${saved.error.message}`)
  return `posted ${texts.title} (${picks.map((p) => p.name).join(', ')})${xId ? ` x:${xId}` : ''}${discordSent ? ' discord' : ''}${membersSent ? ' members' : ''}${xNote ? ` (${xNote})` : ''}`
}

/**
 * What the ticks call after a sport's moments: look at the sport's last two game dates and post the digest of any that is over and not yet posted.
 * { off | paused | blocked | wait | nights:[{ night, result }] }. Never throws.
 */
export async function digestPass(db, { sport, now = Date.now(), deps = {} } = {}) {
  const d = { ...DEFAULTS, ...deps }
  try {
    if (!ROW_TABLE[sport]) return { skipped: 'no such sport' }
    if (!momentPostsOn()) return { off: true }
    if (momentPostsPaused()) return { paused: true }
    if (kindPaused(`moment_${sport}_top3`)) return { paused: `moment_${sport}_top3` }
    if (now < sqlBlockedUntil()) return { blocked: 'kind not allowed yet (run the SQL)' }
    if (now < (_next.get(sport) || 0)) return { wait: true }
    _next.set(sport, now + DIGEST_EVAL_MS)
    const out = { nights: [] }
    for (const night of [etDay(now - 86400e3), etDay(now)]) {
      const key = `${sport}|${night}`
      const kind = digestKindOf({ sport, night })
      if (!kind || _done.has(key) || knownTaken(night, kind)) continue
      const note = (result) => out.nights.push({ night, result })
      if (!(await d.hasRows(db, sport, night))) continue
      const st = await d.nightGames(sport, night)
      if (!st?.games?.length) continue
      if (st.postseason) { note('postseason date: the postseason digest owns it'); _done.add(key); continue }
      const s = nightState(st.games)
      if (!s.over) continue
      const w = windowFor(sport, s.lastStart, now)
      if (w === 'wait') { note('over; waiting for the post-game window'); continue }
      if (w === 'stale') { _done.add(key); continue }
      const posted = await d.postedPlayers(db, sport, night)
      if (posted == null) { note('skip: could not read who was posted'); continue }
      const picks = pickTop(await d.events(db, sport, night, now), { exclude: posted })
      if (!picks.length) { note('nothing to name')
        // NFL: the 100-yard games come from logs published after the games, so it looks again for a few hours; the other sports have everything at the Final
        if (sport !== 'nfl' || s.lastStart == null || now > s.lastStart + 8 * 3600e3) _done.add(key)
        continue
      }
      let result
      try { result = await sendDigest(db, { sport, night, kind, picks, now }, d) } catch (err) { result = `error: ${err?.message || err}`; console.error(`[digest] ${key}: ${err?.message || err}`) }
      if (/^(posted|skip: already posted|dropped)/.test(result)) _done.add(key)
      note(result)
      if (result.startsWith('blocked')) break
    }
    return out
  } catch (err) {
    console.error(`[digest] pass ${sport} failed: ${err?.message || err}`)
    return { error: String(err?.message || err) }
  }
}

