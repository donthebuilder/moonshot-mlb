// THE LAMP SLATE (2026-10-10, Donovan: "yes do the lamp slate"). ONE separate NHL post a night, kind 'nhl_slate':
// the night's best CALLED skaters, named only after their game's lock exists and before the night's first puck.
//
//   🏒 THE LAMP SLATE · SAT OCT 10
//   14 CALLED so far tonight, top 5 by LAMP ranking score.
//
//   1. [Full Name] ([TEAM]) vs OPP · shots 99th
//   2. ...
//
// WHO: the CALLED rows of lamp_goal_log that lib/nhl/boardRead.js readBoard() carries (lib/nhl/goalModel.js scoreNight:
// status 'called', the top skater of each club), the same rows the Card and the board use, best NIGHT RANK first
// (context.nightRank of context.nightOf), at most 5, and nothing at all when fewer than 3 exist. The words are the
// Card's own stat words (shots / goals / ice time percentile among tonight's skaters). A score is called a ranking
// score and is never printed; no probability, no link, no hashtag on X.
//
// THE LOCK (same rule as the cross-sport Slate, lib/posts/slate.js SLATE_CUTOFF_MS): a game's rows are calls only once
// the LAMP tick has written them (locked_at); a preview is never named. The post WAITS for the lock of the first game
// it can still name. A game that has started, or starts within 20 minutes, is never named.
//
// THE GOALIE RULE (rule 4, lib/nhl/oppGoalie.js): a skater is named only when the opposing starting goalie is
// CONFIRMED. A pending one HOLDS the post (nothing claimed, asked again next tick) until 30 minutes before his game,
// then he is left out and the next CALLED skater takes the seat. No goalie source for a game = a definite no.
//
// ONE A DAY: a row (day, 'nhl_slate') in homer_feed_posts is claimed BEFORE anything is sent. X goes first, Discord
// after (the LAMP channel, lib/dash/discordChannels.js feedHooks('nhl'), never #members): a transient X refusal
// (lib/dash/xFail.js mayRetryPost) before the first puck releases the claim for another try while Discord has not
// been told, so a retry can never post Discord twice. NHL_SLATE_OFF=on stops the post (nothing else).
//
// WHERE IT FITS (lib/dash/xSchedule.js): an INFO event kind tied to the lock, not a fixed Phoenix window. The windows
// 15:00-18:00 PHX do not allow the slate tier, and a 1pm ET matinee needs 8-9am PHX; the lock moves with the puck.
//
// NEXT TO THE CROSS-SPORT SLATE: a different kind, so the 3-day repeat guard of one does not touch the other. The
// cross-sport Slate keeps its one NHL line; this post names the top five. The same man can be in both on one day.
import { BRAND, appHref } from '../routes'
import { resolveNaming } from '../dash/namingChecks'
import { admit, logPosted, recentNamed } from '../dash/xGate'
import { recordPost } from '../dash/xPostLog'
import { hasX, postToDiscord, postToX } from '../dash/xPost'
import { foldedForDiscord } from './sportPlans'
import { knownTaken, markTaken, unmarkTaken } from '../dash/postClaim'
import { mayRetryPost } from '../dash/xFail'
import { feedHooks } from '../dash/discordChannels'
import { payloadFor } from '../dash/xSchedule'
import { HARD_LIMIT, postLimit, TAIL_MARGIN } from '../dash/postLimit'
import { buildCard, dayWords, footerOf, ledgerLink, siteUrl } from '../dash/discordCard'
import { ordinal } from '../format'
import { nhlStatWhy } from '../card/plain.js'
import { STATUS_WORD } from '../callStatus'
import { nhlGoalieProblem } from '../nhl/oppGoalie'
import { nhlGameLocked, nhlProof } from './nhl'
import { dayLabel, xLen } from './slate'
import { primeInjuries } from '../injuries/read'

export const KIND = 'nhl_slate'
export const MIN_NAMES = 3
export const MAX_NAMES = 5
/** A game that starts sooner than this is never named, and the post is not sent for it (the cross-sport Slate's cutoff). */
export const CUTOFF_MS = 20 * 60e3

/** NHL_SLATE_OFF=on: the post does not go out today (nothing else changes). */
export const lampSlateOff = () => /^(on|1|true)$/i.test(String(process.env.NHL_SLATE_OFF || '').trim())

const txt = (v) => String(v == null ? '' : v).trim()
const num = (v) => { if (v == null || v === '') return null; const n = Number(v); return Number.isFinite(n) ? n : null }
const pctOf = (v) => { const n = num(v); return n == null ? null : Math.max(0, Math.min(100, Math.round(n))) }

// ── THE FACT: stored data only, the Card's stat words ───────────────────────
/** { shots, goals, toi } percentiles among tonight's skaters (stored `pct`), or null. */
export function pctSet(row) {
  const p = row?.pct
  if (!p || typeof p !== 'object') return null
  const s = pctOf(p.shotsPg), g = pctOf(p.goalsPg), t = pctOf(p.toi)
  return s == null || g == null || t == null ? null : { shots: s, goals: g, toi: t }
}
/** The ONE short fact on a line: his real numbers ("3.4 shots a game"), never a percentile (2026-10-23); his night rank when there are none. */
export function shortFact(row, rank, of) {
  const L = row?.legs || {}
  const p = pctSet(row)
  const shots = num(L.shotsPg), goals = num(L.goalsPg)
  if (p && shots != null && goals != null) return p.goals > p.shots ? `${goals.toFixed(2)} goals a game` : `${shots.toFixed(1)} shots a game`
  return nhlStatWhy(L, 'anytime') || nhlProof(row, rank, of)
}
/** The Discord line: shots, goals and ice time per game, as numbers. */
export function longFact(row, rank, of) {
  return nhlStatWhy(row?.legs, 'anytime') || nhlProof(row, rank, of)
}

// ── THE CANDIDATES ──────────────────────────────────────────────────────────
const byRank = (a, b) => (a.rank - b.rank) || String(a.name).localeCompare(String(b.name))
const startOfGame = (g) => Date.parse(g?.game?.startUtc)

/**
 * The pool the post chooses from, and the clock facts. Pure.
 * @param games readBoard(day, { market: 'GOAL', net: true }).games
 * @returns {{ listed, upcoming, eligible, firstLocked, firstStartMs, pool, allIn, why }}
 */
export function lampSlatePool(games, now = Date.now()) {
  const listed = (Array.isArray(games) ? games : []).filter((g) => g?.game && (g.game.scheduleState == null || g.game.scheduleState === 'OK'))
  // a game that has started (or is not 'pre') is never named; one starting within the cutoff is too close
  const upcoming = listed.filter((g) => g.game.state === 'pre' && startOfGame(g) > now)
  const eligible = upcoming.filter((g) => startOfGame(g) - now >= CUTOFF_MS).sort((a, b) => startOfGame(a) - startOfGame(b))
  const first = eligible[0] || null
  const pool = []
  for (const g of eligible) {
    if (!nhlGameLocked(g)) continue                 // a preview is not a call: never named
    const startMs = startOfGame(g)
    for (const r of g.rows || []) {
      if (r.preview) continue
      if (r.status !== 'called' || !(r.score != null)) continue
      const id = txt(r.playerId)
      const rank = num(r.context?.nightRank)
      const of = num(r.context?.nightOf)
      if (!id || !(rank > 0) || !(of > 0)) continue
      const team = txt(r.team)
      const away = txt(g.game.away?.abbrev), home = txt(g.game.home?.abbrev)
      const opp = txt(r.opp) || (r.home ? away : home)
      pool.push({
        sport: 'nhl', id, player_id: id, name: txt(r.name), team, opp, rank, of, startMs, gameId: g.game.id,
        problem: nhlGoalieProblem(g, r, id), fact: shortFact(r, rank, of), longFact: longFact(r, rank, of),
      })
    }
  }
  pool.sort(byRank)
  // one entry per man (a skater is on one row a night; this is a guard, not a rule)
  const seen = new Set()
  const unique = pool.filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)))
  return {
    listed, upcoming, eligible, first, firstLocked: first ? nhlGameLocked(first) : false,
    firstStartMs: first ? startOfGame(first) : NaN, pool: unique,
    // every game of the day is in the pool (locked, not started, not too close): "tonight" is then the whole slate
    allIn: listed.length > 0 && listed.every((g) => eligible.includes(g) && nhlGameLocked(g)),
  }
}

// ── TEXT ────────────────────────────────────────────────────────────────────
const lineOf = (c, i) => `${i + 1}. ${c.name} (${c.team}) vs ${c.opp} · ${c.fact}`
/**
 * The post fitted to X's length: five names if they fit, else four, else three (never a cut line). The lead states the
 * count honestly ("14 CALLED tonight" when every game of the slate is locked, else "so far tonight") and calls the score
 * a ranking score. null when even three do not fit.
 */
export function renderLampSlate({ day, picks = [], calledCount = 0, allIn = false, limit = HARD_LIMIT } = {}) {
  const head = `\u{1F3D2} THE ${BRAND.nhl.name} SLATE · ${dayLabel(day)}`
  for (let k = Math.min(MAX_NAMES, picks.length); k >= MIN_NAMES; k -= 1) {
    const lead = `${calledCount} ${STATUS_WORD.called} ${allIn ? 'tonight' : 'so far tonight'}, top ${k} by ${BRAND.nhl.name} ranking score.`      // no percentile note (2026-10-23): the facts are real numbers now
    // LAYOUT (Donovan, 2026-10-16): label, a blank line, the lead, a blank line, the names. A name is never dropped for a blank line: the blank
    // after the lead goes first, then the one after the label, before the last name comes off.
    const rows = picks.slice(0, k).map(lineOf)
    for (const text of [[head, '', lead, '', ...rows], [head, '', lead, ...rows]].map((l) => l.join('\n'))) {
      if (xLen(text) <= limit) return { text, lead, picks: picks.slice(0, k) }
    }
  }
  return null
}

const etTime = (ms) => new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })
/**
 * The same list as a DASH Discord card (lib/dash/discordCard.js): the title links to the LAMP board (rankings), one
 * section per skater, the ledger line on the last. Discord only: the one place a link is allowed.
 */
export function lampSlateEmbed({ day, picks = [], lead = '', at = null } = {}) {
  const sections = picks.map((c, i) => ({
    name: `${i + 1}. ${c.name}`,
    lines: [`${c.team} vs ${c.opp} · **${STATUS_WORD.called}** · puck ${etTime(c.startMs)} ET`, c.longFact],
  }))
  if (sections.length) sections[sections.length - 1].link = ledgerLink('nhl')
  return buildCard({
    sport: 'nhl', title: `\u{1F3D2} The ${BRAND.nhl.name} Slate · ${dayWords(day)}`, description: `${lead}`,
    url: siteUrl(appHref('nhl', 'fullboard')), sections, footer: footerOf('nhl'), at: at || Date.now(),
  })
}

// ── ASSEMBLY ────────────────────────────────────────────────────────────────
/**
 * Everything but the I/O. Pure.
 * @param repeated Set of ids this kind named within 3 days (left out; the next skater takes the seat)
 * @returns { state: 'go', text, embed, named, payload, firstStartMs, trimmed, ... }
 *        | { state: 'waiting', reason }   the lock is not written yet (asked again next tick)
 *        | { state: 'held', reason, pending }   a goalie is unconfirmed (asked again next tick)
 *        | { state: 'none', reason }
 */
export function assembleLampSlate({ day, games = [], repeated = new Set(), now = Date.now(), limit = null } = {}) {
  const p = lampSlatePool(games, now)
  if (!p.listed.length) return { state: 'none', reason: 'no NHL games today' }
  if (!p.upcoming.length) return { state: 'none', reason: 'every game has started' }
  if (!p.eligible.length) return { state: 'none', reason: 'the first puck is less than 20 minutes away' }
  if (!p.firstLocked) {
    const f = p.first
    return { state: 'waiting', reason: `lock not written yet for the first game (${txt(f.game.away?.abbrev)} at ${txt(f.game.home?.abbrev)}, puck ${new Date(p.firstStartMs).toISOString()}); it is written inside the 100 minutes before puck drop` }
  }
  const called = p.pool.length
  if (called < MIN_NAMES) return { state: 'none', reason: `only ${called} CALLED skater${called === 1 ? '' : 's'} in the locked games (fewer than ${MIN_NAMES})`, called }
  const rows = p.pool.filter((c) => !repeated.has(c.id))
  const nr = resolveNaming({
    rows,
    check: (r) => (r.problem ? { id: r.player_id, reason: `${r.name}: ${r.problem.reason}`, pending: Boolean(r.problem.pending) } : null),
    pickFrom: (rs) => [...rs].sort(byRank).slice(0, MAX_NAMES),
    startOf: (r) => r.startMs,
    trim: true,
    now,
  })
  if (nr.state === 'held') return { state: 'held', reason: nr.reason, pending: nr.pending, called }
  const picks = nr.picks
  if (picks.length < MIN_NAMES) return { state: 'none', reason: `only ${picks.length} CALLED skater${picks.length === 1 ? '' : 's'} can be named (goalie not confirmed, or named in the last 3 days)`, called, trimmed: nr.trimmed || [] }
  const out = renderLampSlate({ day, picks, calledCount: called, allIn: p.allIn, limit: limit || postLimit() + TAIL_MARGIN })
  if (!out) return { state: 'none', reason: 'does not fit', called }
  const named = out.picks.map((c) => c.id)
  const payload = {
    v: 1, day, named, n_called: called, all_games_locked: p.allIn,
    picks: out.picks.map((c) => ({ player_id: c.id, name: c.name, team: c.team, opp: c.opp, rank: c.rank, of: c.of, game_id: c.gameId })),
    left_out: nr.trimmed || [],
  }
  return {
    state: 'go', text: out.text, lead: out.lead, picks: out.picks, named, payload, called, trimmed: nr.trimmed || [], reason: nr.reason,
    firstStartMs: Math.min(...out.picks.map((c) => c.startMs)),
    embed: lampSlateEmbed({ day, picks: out.picks, lead: out.lead, at: now }),
  }
}

// ── POSTING ─────────────────────────────────────────────────────────────────
const _said = new Set()
const sayOnce = (day, what, line) => { const k = `${day}|${what}`; if (_said.has(k)) return; if (_said.size > 200) _said.clear(); _said.add(k); console.log(`[lampslate] ${day}: ${line}`) }
export const _resetLampSlateForTests = () => _said.clear()

/**
 * One try at the day's LAMP Slate. Cheap when there is nothing to do: a taken slot costs no request.
 * @param load  async () => readBoard(day, { market: 'GOAL', net: true }).games
 * @returns {Promise<string>} what happened, for the tick's own log
 */
export async function postLampSlateOnce(db, { day, load, hooks = null, now = Date.now() } = {}) {
  if (lampSlateOff()) return 'off'
  if (knownTaken(day, KIND)) return 'already-posted'
  await primeInjuries(['nhl'])
  const { data: done } = await db.from('homer_feed_posts').select('day').match({ day, kind: KIND }).maybeSingle()
  if (done) { markTaken(day, KIND); return 'already-posted' }

  const games = await load()
  // who this kind named in the last 3 days (rule 4): left out, the next CALLED skater takes the seat. Only counted for X.
  const repeated = hasX() ? await recentNamed(db, { kind: KIND, day }) : new Set()
  const a = assembleLampSlate({ day, games, repeated, now })
  if (a.state === 'waiting') { sayOnce(day, 'waiting', `WAITING, ${a.reason}`); return 'waiting' }
  if (a.state === 'held') {
    sayOnce(day, `held|${a.reason}`, `HELD ${a.reason}`)
    recordPost({ day, kind: KIND, sport: 'nhl', state: 'HELD', reason: a.reason, ids: (a.pending || []).map((x) => x.id) })
    return `held: ${a.reason}`
  }
  if (a.state === 'none') { sayOnce(day, `none|${a.reason}`, `NO POST: ${a.reason}`); return `none: ${a.reason}` }
  if (a.trimmed?.length) recordPost({ day, kind: KIND, sport: 'nhl', state: 'DROPPED', reason: `left out, goalie not confirmed 30 min before puck: ${a.trimmed.join(', ')}`, ids: a.trimmed })

  const { data: claimed, error } = await db.from('homer_feed_posts')
    .upsert([{ day, kind: KIND, payload: {} }], { onConflict: 'day,kind', ignoreDuplicates: true }).select('day')
  if (error) { console.error(`[lampslate] claim failed: ${error.message}`); return 'claim-failed' }
  markTaken(day, KIND)
  if (!claimed?.length) return 'already-posted'

  const patch = { payload: { ...a.payload, ...payloadFor(KIND, now) } }
  const first = await db.from('homer_feed_posts').update({ payload: patch.payload }).match({ day, kind: KIND })
  if (first?.error) console.error(`[lampslate] payload not saved: ${first.error.message}`)

  const retryable = now < a.firstStartMs
  const release = async (why) => {
    const del = await db.from('homer_feed_posts').delete().match({ day, kind: KIND })
    if (del?.error) { console.error(`[lampslate] could not release the claim (${why}): ${del.error.message}`); return false }
    unmarkTaken(day, KIND)
    return true
  }
  if (hasX()) {
    const g = await admit(db, { day, kind: KIND, ids: a.named, repeat: false })   // the pause and the daily cap (slate tier); repeats were left out above
    if (g.state === 'go') {
      const r = await postToX(a.text, { kind: KIND })
      if (r.ok && r.id) { patch.x_post_id = r.id; logPosted({ day, kind: KIND, ids: a.named, tweetId: r.id, text: a.text }) }
      else {
        console.error(`[lampslate] refused: ${r.status} ${r.error}`)
        if (retryable && mayRetryPost(r, `lampslate|${day}`) && await release(`x ${r.status}`)) return `retry: x ${r.status}`
      }
    } else if (retryable && await release(g.reason || g.state)) return `retry: x ${g.reason || g.state}`
  }
  const d = foldedForDiscord(KIND) ? { ok: false } : await postToDiscord(a.text, { kind: KIND, sportKey: 'nhl', embed: a.embed }, hooks == null ? feedHooks('nhl') : hooks)   // SPORT_PLANS_ON: recorded, not delivered to the room
  if (d.ok) patch.discord_sent = true
  const saved = await db.from('homer_feed_posts').update(patch).match({ day, kind: KIND })
  if (saved?.error) console.error(`[lampslate] posted but the row did not record it: ${saved.error.message}`)
  return patch.x_post_id ? 'posted' : (patch.discord_sent ? 'posted (discord only)' : 'posted (nowhere)')
}
