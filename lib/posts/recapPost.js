// THE NIGHT RECAP, NFL AND NHL (2026-10-16, Donovan): ONE post per sport per night in #called-it (DISCORD_RECEIPTS_WEBHOOK) that lists the players who were
// CALLED pregame and CLEARED, each as a line with a link to the scoring event, laid out like the MLB bot's live digest
// (MLB-HR-DASHBOARD-STREAMLIT bots/live_results_tracker.py): THE RECORD first, then the plays (its WENT DEEP / BARS CLEARED), then DIDN'T GET THERE.
//
//   🧾 TUDDY recap · Sun Oct 18
//   CALLED · 3 of 5 cleared
//   🧾 THE RECORD        called pregame · 3/5 cleared · 2 finished without it — misses post here the same as scores
//   🏈 SCORED            ✓ **Name** (BUF) scored — 3-yd pass from J. Allen, Q2 4:12  [TUDDY page](...)
//   ✗ DIDN'T GET THERE   ✗ Name (BUF) — called, no touchdown
//
// WHO. The CALLED list is the locked one, read, never re-derived: NFL = the week's published picks (lib/nfl/tdFeed.js onBotFor, the same test the TD alert used)
// plus every nfl_td_feed row whose own label is CALLED (lib/callStatus.js tdCallStatus); NHL = lamp_goal_log rows labelled 'called' (the goal board, and a scorer
// called in any public market the way lib/record/nhl.js markAnyMarketCalls says). CLEARED = he scored (a nfl_td_feed row; lamp_goal_log hit). MISSED = his game is
// final and he did not. VOID = he did not play. PENDING = his game is not final: never a miss. A miss is never hidden, only a win is ever left out for room.
//
// WHAT EACH LINE SAYS comes from the feed rows and nothing else: NFL the scoring play (yards, kind, passer, quarter, clock: ESPN's play text is all nfl_td_feed
// keeps, there is no down-and-distance and no video); NHL the period, the clock, the strength and the league's own video page (lamp_goal_feed.clip_url).
// THE LINK is the real clip where one exists (NHL), else the player's page on the site (lib/dash/discordCard.js playerUrl). No model probability is printed:
// not a score, not a percent (NHL/NBA never print one; a score is a rank, not a chance).
//
// WHERE. Discord only, never X: the room is 'receipts' (lib/dash/routing.js) and the webhook is receiptsHooks(). OFF unless RECAP_POSTS_ON is on (Donovan flips
// it after supabase/migrations/202610161930_recap_kinds.sql has been run). CLAIM ONCE per (day, kind) before anything is sent, like lib/dash/longshotsPost.js.
import { BRAND } from '../routes'
import { STATUS_WORD, tdCallStatus } from '../callStatus'
import { buildCard, dayWords, ledgerLink, noLinks, playUrlOk, playerUrl } from '../dash/discordCard'
import { receiptsHooks } from '../dash/discordChannels'
import { roomsOf } from '../dash/routing'
import { normalizeTweet } from '../dash/tweetFormat'
import { _resetTakenForTests, knownTaken, markTaken, unmarkTaken } from '../dash/postClaim'
import { mayRetry } from '../dash/xFail'
import { postToDiscord } from '../dash/xPost'
import { periodWord as nflPeriodWord } from '../nfl/period'
import { periodWord as nhlPeriodWord, strengthWord } from '../nhl/goalFeed'
import { resultOf } from '../record/nhl'

export const KINDS = Object.freeze({ nfl: 'recap_nfl', nhl: 'recap_nhl' })
export const SPORTS = Object.freeze(Object.keys(KINDS))
/** The migration that widens homer_feed_posts_kind_check for these kinds. */
export const MIGRATION_FILE = 'supabase/migrations/202610161930_recap_kinds.sql'
/** After every game is final the recap waits this long so the last event row (a touchdown, a goal) has landed. */
export const SETTLE_MS = 10 * 60e3
/** A game still not final this long after the night's last start is given up on: the recap goes out with it shown as pending. */
export const STALE_MS = 30 * 3600e3
const RETRY_MS = 5 * 60e3
/** Discord counts 6000 across an embed; the plays are cut from the bottom (never a miss) to stay under this. */
const BUDGET = 5600
const FIELD_ROOM = 880      // under Discord's 1024 with room for the one ledger link on the last field
const MAX_PLAYS = 3

const truthy = (v) => /^(on|1|true|yes)$/i.test(String(v == null ? '' : v).trim())
/** The master switch. OFF unless RECAP_POSTS_ON is on. */
export const recapPostsOn = () => truthy(process.env.RECAP_POSTS_ON)

const txt = (v) => String(v == null ? '' : v).trim()
/** A name made safe to sit between ** ** in a line: no brackets, emphasis marks or angle brackets. */
const safe = (v) => txt(v).replace(/[[\]()*_`~<>|\\]/g, '').replace(/\s+/g, ' ').trim()
const lc = (v) => txt(v).toLowerCase()
const plural = (n, one, many) => (n === 1 ? one : many)

// ── one entry per CALLED player ─────────────────────────────────────────────
// { key, id, name, team, outcome: 'cleared'|'missed'|'void'|'pending', plays: string[], links: [{ text, url }] }

function nflPlay(r) {
  const yards = Number(r.yards)
  const y = Number.isFinite(yards) && r.yards != null && r.yards !== '' ? `${yards}-yd ` : ''
  const kind = txt(r.kind)
  const what = kind === 'pass' ? `${y}pass${txt(r.passer_name) ? ` from ${safe(r.passer_name)}` : ''}`
    : kind === 'rush' ? `${y}run`
    : kind ? `${y}${kind}`
    : safe(r.text).slice(0, 80) || 'touchdown'
  const when = [r.quarter ? nflPeriodWord(r.quarter) : '', txt(r.clock)].filter(Boolean).join(' ')
  return [what, when].filter(Boolean).join(', ')
}

/**
 * The NFL recap. Pure.
 * @param day     the game date (YYYY-MM-DD): the games' own date, never the wall clock
 * @param called  [{ id, name, team, gameId, out? }]  the locked called list (out: listed out / inactive / on a bye = did not play)
 * @param events  nfl_td_feed rows ({ day, game_id, td_n, team, quarter, clock, text, kind, yards, passer_name, scorer_name, gsis_id, on_bot, td_board })
 * @param games   [{ id, final, off? }]  a called man whose game is not in this list is pending, never guessed final
 */
export function nflRecap({ day, called = [], events = [], games = [], now = Date.now() } = {}) {
  const rows = (events || []).filter((r) => r && (!r.day || r.day === day))
  const byKey = new Map()
  const keyOf = (id, name) => (txt(id) ? `id:${txt(id)}` : `name:${lc(name)}`)
  for (const c of called || []) {
    if (!txt(c?.name)) continue
    byKey.set(keyOf(c.id, c.name), { id: txt(c.id), name: txt(c.name), team: txt(c.team), gameId: c.gameId, out: Boolean(c.out) })
  }
  // a touchdown row the feed itself labelled CALLED (the board frozen at that moment) is a called man who cleared, listed or not
  for (const r of rows) {
    if (tdCallStatus(r) !== 'called') continue
    const k = keyOf(r.gsis_id, r.scorer_name)
    if (txt(r.scorer_name) && !byKey.has(k)) byKey.set(k, { id: txt(r.gsis_id), name: txt(r.scorer_name), team: txt(r.team), gameId: r.game_id, out: false })
  }
  const gameById = new Map((games || []).map((g) => [String(g.id), g]))
  const entries = []
  for (const c of byKey.values()) {
    const mine = rows.filter((r) => (c.id && txt(r.gsis_id) === c.id) || (!txt(r.gsis_id) && lc(r.scorer_name) === lc(c.name)))
      .sort((a, b) => Number(a.td_n) - Number(b.td_n))
    const g = c.gameId != null ? gameById.get(String(c.gameId)) : null
    const url = playerUrl('nfl', c.id)
    const base = { key: c.id || lc(c.name), id: c.id, name: c.name, team: c.team }
    if (mine.length) {
      entries.push({ ...base, outcome: 'cleared', plays: mine.slice(0, MAX_PLAYS).map(nflPlay), more: Math.max(0, mine.length - MAX_PLAYS), count: mine.length, links: url ? [{ text: `${BRAND.nfl.name} page`, url }] : [] })
    } else if (c.out) entries.push({ ...base, outcome: 'void', plays: [], links: [] })
    else if (g && (g.final || g.off)) entries.push({ ...base, outcome: g.off && !g.final ? 'void' : 'missed', plays: [], links: [] })
    else entries.push({ ...base, outcome: 'pending', plays: [], links: [] })
  }
  return finish({ sport: 'nfl', day, entries, now })
}

/**
 * The NHL recap. Pure.
 * @param date    the game date (YYYY-MM-DD)
 * @param called  lamp_goal_log rows ({ game_id, game_date, player_id, team, name, status, graded_at, dressed, hit }); only status 'called' counts
 * @param goals   lamp_goal_feed rows ({ game_id, player_id, goal_n, period, period_type, time_in_period, strength, empty_net, clip_url, overturned_at })
 */
export function nhlRecap({ date, called = [], goals = [], now = Date.now() } = {}) {
  const rows = (called || []).filter((r) => r && r.status === 'called' && (!r.game_date || r.game_date === date))
  const standing = (goals || []).filter((g) => g && !g.overturned_at)
  const entries = []
  const seen = new Set()
  for (const r of rows) {
    const k = `${r.game_id}|${r.player_id}`
    if (seen.has(k)) continue
    seen.add(k)
    const res = resultOf(r)                       // lib/record/nhl.js: hit | miss | void | null (not graded yet)
    const base = { key: k, id: txt(r.player_id), name: txt(r.name), team: txt(r.team) }
    if (res === 'hit') {
      const mine = standing.filter((g) => String(g.game_id) === String(r.game_id) && String(g.player_id) === String(r.player_id))
        .sort((a, b) => Number(a.period) - Number(b.period) || String(a.time_in_period).localeCompare(String(b.time_in_period), undefined, { numeric: true }))
      const page = playerUrl('nhl', r.player_id)
      const clips = mine.map((g, i) => ({ text: i === 0 ? '▶ watch' : `▶ ${i + 1}${['st', 'nd', 'rd'][i] || 'th'} goal`, url: txt(g.clip_url) })).filter((l) => playUrlOk(l.url))     // only the league's own video page: any other host is not a clip, he links his page instead
      const links = clips.length ? clips : (page ? [{ text: `${BRAND.nhl.name} page`, url: page }] : [])
      const plays = mine.slice(0, MAX_PLAYS).map((g) => `${nhlPeriodWord(g)} ${txt(g.time_in_period)}, ${strengthWord(g)}`.replace(/\s+,/, ','))
      entries.push({ ...base, outcome: 'cleared', plays, more: Math.max(0, mine.length - MAX_PLAYS), count: Math.max(1, mine.length, Number(r.goals) || 0), links })
    } else if (res === 'miss') entries.push({ ...base, outcome: 'missed', plays: [], links: [] })
    else if (res === 'void') entries.push({ ...base, outcome: 'void', plays: [], links: [] })
    else entries.push({ ...base, outcome: 'pending', plays: [], links: [] })
  }
  return finish({ sport: 'nhl', day: date, entries, now })
}

// ── the card ────────────────────────────────────────────────────────────────
const byName = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })
const SCORED_LINE = (sport) => (e) => {
  const n = e.count > 1 ? `${e.count} ${UNIT[sport]}: ` : ''
  const what = e.plays.length ? ` — ${n}${e.plays.join(' · ')}${e.more ? ` · +${e.more} more` : ''}` : ''
  const links = e.links.map((l) => `[${noLinks(l.text)}](${l.url})`).join(' ')
  return `✓ **${safe(e.name)}**${e.team ? ` (${safe(e.team)})` : ''} scored${what}${links ? `  ${links}` : ''}`
}
const UNIT = { nfl: 'TDs', nhl: 'goals' }
const MISS_WORD = { nfl: 'called, no touchdown', nhl: 'called, no goal' }
const missLine = (sport) => (e) => `✗ ${safe(e.name)}${e.team ? ` (${safe(e.team)})` : ''} — ${MISS_WORD[sport]}`
const voidLine = (e) => `– ${safe(e.name)}${e.team ? ` (${safe(e.team)})` : ''} — did not play (void, not a miss)`
const pendingLine = (e) => `⏳ ${safe(e.name)}${e.team ? ` (${safe(e.team)})` : ''} — game not final yet`

/** Whole lines into fields of at most `room` characters; none is cut. */
function chunk(lines, room = FIELD_ROOM) {
  const out = []
  let cur = []
  for (const l of lines) {
    if (cur.length && [...[...cur, l].join('\n')].length > room) { out.push(cur); cur = [] }
    cur.push(l)
  }
  if (cur.length) out.push(cur)
  return out
}

function finish({ sport, day, entries, now }) {
  const cleared = entries.filter((e) => e.outcome === 'cleared').sort(byName)
  const missed = entries.filter((e) => e.outcome === 'missed').sort(byName)
  const voided = entries.filter((e) => e.outcome === 'void').sort(byName)
  const pending = entries.filter((e) => e.outcome === 'pending').sort(byName)
  const graded = cleared.length + missed.length
  const counts = { cleared: cleared.length, missed: missed.length, void: voided.length, pending: pending.length }
  if (!entries.length) return { state: 'none', reason: 'no one was called', counts, text: '', embed: null, entries }
  const brand = BRAND[sport]
  const label = dayWords(day)

  const record = graded
    ? `\u{1F4CC} called pregame · **${cleared.length}/${graded}** cleared${missed.length ? ` · **${missed.length}** finished without it` : ''}${pending.length ? ` · **${pending.length}** still to play` : ''} — misses post here the same as scores`
    : `\u{1F4CC} called pregame · ${pending.length} still to play — nothing is graded yet`
  const makeCard = (showN) => {
    const shown = cleared.slice(0, showN)
    const hidden = cleared.length - shown.length
    const sections = [{ name: '\u{1F9FE} THE RECORD', lines: [record] }]
    const scored = chunk(shown.map(SCORED_LINE(sport)))
    scored.forEach((ls, i) => sections.push({ name: `${brand.icon} SCORED${i ? ' (cont.)' : ''}`, lines: ls, plays: true }))
    if (hidden) sections.push({ name: `${brand.icon} SCORED (cont.)`, lines: [`+${hidden} more cleared — every one is in the ledger`] })
    const deadLines = [...missed.map(missLine(sport)), ...voided.map(voidLine)]
    chunk(deadLines).forEach((ls, i) => sections.push({ name: `✗ DIDN'T GET THERE${i ? ' (cont.)' : ''}`, lines: ls }))
    chunk(pending.map(pendingLine)).forEach((ls, i) => sections.push({ name: `⏳ PENDING${i ? ' (cont.)' : ''}`, lines: ls }))
    sections[sections.length - 1].link = ledgerLink(sport, 'Every call, graded.')
    return buildCard({
      sport, title: `\u{1F9FE} ${brand.name} recap · ${label}`, status: 'called',
      description: graded ? `${cleared.length} of ${graded} cleared${pending.length ? ` · ${pending.length} still to play` : ''}${voided.length ? ` · ${voided.length} did not play` : ''}` : `${pending.length} still to play`,
      sections, maxSections: 25, at: Date.parse(`${day}T12:00:00Z`),
    })
  }
  // The plays are the only thing ever dropped for room (and then named as "+N more"): the misses stay.
  let n = cleared.length
  let embed = makeCard(n)
  const size = (e) => [e.title, e.description, e.footer?.text, ...(e.fields || []).flatMap((f) => [f.name, f.value])].reduce((t, s) => t + [...String(s || '')].length, 0)
  while (n > 0 && size(embed) > BUDGET) { n -= 1; embed = makeCard(n) }

  const plain = [
    `\u{1F9FE} ${brand.name} recap · ${label}`, '',
    `${STATUS_WORD.called} · ${graded ? `${cleared.length} of ${graded} cleared` : `${pending.length} still to play`}`,
    ...cleared.map((e) => noLinks(SCORED_LINE(sport)(e))),
    ...missed.map(missLine(sport)), ...voided.map(voidLine), ...pending.map(pendingLine),
  ].join('\n')
  return {
    state: 'go', counts, entries,
    text: normalizeTweet(plain), embed,
    payload: {
      v: 1, day, sport, counts,
      cleared: cleared.map((e) => ({ player_id: e.id || null, name: e.name, links: e.links.map((l) => l.url) })),
      missed: missed.map((e) => ({ player_id: e.id || null, name: e.name })),
      void: voided.map((e) => ({ player_id: e.id || null, name: e.name })),
      pending: pending.map((e) => ({ player_id: e.id || null, name: e.name })),
    },
  }
}

const BUILD = { nfl: (i) => nflRecap(i), nhl: (i) => nhlRecap({ date: i.day, called: i.called, goals: i.goals, now: i.now }) }
export const recapFor = (sport, input) => BUILD[sport](input)

// ── THE READS (impure; replaceable in tests) ─────────────────────────────────
/** nightGames' answer to "is the night over": { ready, startMs, reason }. A league that did not answer is not ready; no games is not a night. */
export function nightOver(night, now = Date.now()) {
  const list = night?.games
  if (!Array.isArray(list)) return { ready: false, gaveUp: false, reason: 'games not readable' }
  if (!list.length) return { ready: false, gaveUp: false, reason: 'no games', empty: true }
  const open = list.filter((g) => !g.final && !g.off)
  const starts = list.map((g) => g.startMs).filter(Number.isFinite)
  const gaveUp = open.length > 0 && starts.length > 0 && now - Math.max(...starts) > STALE_MS
  return { ready: open.length === 0, gaveUp, reason: open.length ? `${open.length} game${open.length === 1 ? '' : 's'} not final` : '' }
}

const NFL_SELECT = 'day,game_id,td_n,team,opponent,quarter,clock,text,kind,yards,passer_name,scorer_name,gsis_id,on_bot,td_board'
const NHL_LOG = 'game_id, game_date, game_type, player_id, model_version, team, opp, name, status, graded_at, dressed, hit, goals'
const NHL_FEED = 'game_id, player_id, goal_n, day, period, period_type, time_in_period, strength, empty_net, team, name, clip_url, overturned_at'

/** NFL: the day's touchdown rows, the locked called list (published picks of the games ON THIS DATE), the league's word on the games. */
async function loadNfl(db, day) {
  const [{ fetchNfl, nflSlatePaths, nflSlateLooksReal, nflPicksPaths, nflPicksLooksReal, nflGameCallsPaths }, { onBotFor }, { nflOutProblem }, { easternDate }, { nightGames }] = await Promise.all([
    import('../nfl/dataSource'), import('../nfl/tdFeed'), import('../dash/namingChecks'), import('../data'), import('./digestPost'),
  ])
  const [night, evs, week, picks, gameCalls] = await Promise.all([
    nightGames('nfl', day),
    db.from('nfl_td_feed').select(NFL_SELECT).eq('day', day),
    fetchNfl(nflSlatePaths(), nflSlateLooksReal).catch(() => null),
    fetchNfl(nflPicksPaths(), nflPicksLooksReal).catch(() => null),
    fetchNfl(nflGameCallsPaths()).catch(() => null),
  ])
  if (evs?.error) return { error: `nfl_td_feed: ${evs.error.message}` }
  const over = nightOver(night)
  const dayGames = (Array.isArray(week?.games) ? week.games : []).filter((g) => g?.kickoff && Number.isFinite(Date.parse(g.kickoff)) && easternDate(Date.parse(g.kickoff)) === day)
  const teams = new Map()
  for (const g of dayGames) for (const t of [g.home, g.away]) if (t) teams.set(txt(t), g.game_id)
  const called = []
  for (const p of Array.isArray(week?.players) ? week.players : []) {
    const gameId = teams.get(txt(p.team))
    if (gameId == null) continue                               // not playing on this date
    if (!onBotFor(picks?.card || null, txt(p.player_id), { gameCalls, gameId })) continue
    called.push({ id: txt(p.player_id), name: txt(p.name), team: txt(p.team), gameId, out: Boolean(nflOutProblem(p)) })
  }
  return { over, input: { day, called, events: evs?.data || [], games: (night?.games || []).map((g) => ({ id: g.id, final: g.final, off: g.off })) } }
}

/** NHL: the day's lamp_goal_log (called rows, labelled the way /called does), the goal feed rows, the league's word on the games. */
async function loadNhl(db, day) {
  const [{ ALL_VERSIONS }, { markAnyMarketCalls }, { nightGames }] = await Promise.all([import('../nhl/goalModel'), import('../record/nhl'), import('./digestPost')])
  const [night, log, feed] = await Promise.all([
    nightGames('nhl', day),
    db.from('lamp_goal_log').select(NHL_LOG).eq('game_date', day).in('model_version', ALL_VERSIONS),
    db.from('lamp_goal_feed').select(NHL_FEED).eq('day', day),
  ])
  if (log?.error) return { error: `lamp_goal_log: ${log.error.message}` }
  if (feed?.error) return { error: `lamp_goal_feed: ${feed.error.message}` }
  const over = nightOver(night)
  const rows = (log?.data || []).filter((r) => Number(r.game_type) !== 1)          // preseason stays out, as the record does
  // 0c: a scorer called in any public market is CALLED (lib/record/nhl.js); a failed read leaves the labels as stored
  await markAnyMarketCalls(db, rows.filter((r) => r.hit === true)).catch(() => null)
  const best = new Map()
  for (const r of rows) {
    const k = `${r.game_id}|${r.player_id}`
    const cur = best.get(k)
    if (!cur || (r.graded_at && !cur.graded_at) || (r.status === 'called' && cur.status !== 'called')) best.set(k, r)
  }
  return { over, input: { day, called: [...best.values()].filter((r) => r.status === 'called'), goals: feed?.data || [] } }
}
export const LOADERS = { nfl: loadNfl, nhl: loadNhl }

// ── POSTING, ONCE A NIGHT PER SPORT ──────────────────────────────────────────
const _wait = new Map()          // `${day}|${kind}` -> ms of the last answer that needs time
const _readySince = new Map()    // `${day}|${kind}` -> ms the night was first seen over on this instance
export const _resetRecapForTests = () => { _wait.clear(); _readySince.clear(); _resetTakenForTests() }

/**
 * One try at a night's recap for a sport. Cheap when there is nothing to do: the switch is read first, a taken slot costs no request, an early or empty
 * answer is not asked again for five minutes on this instance.
 * @param load   async (db, sport, day) => { error } | { over: { ready, gaveUp, reason }, input }   (default: the real reads)
 * @param hooks  the webhook(s); default receiptsHooks() (#called-it). Only ever the receipts room: routing.js says so and this obeys it.
 * @returns {Promise<string>} what happened, for the tick's own log
 */
export async function postRecapOnce(db, { sport, day, load = null, hooks = null, now = Date.now() } = {}) {
  if (!recapPostsOn()) return 'off'
  const kind = KINDS[sport]
  if (!kind) return 'unknown sport'
  const rooms = roomsOf(kind)
  if (!rooms || rooms.length !== 1 || rooms[0] !== 'receipts') return 'not routed to receipts'
  const k = `${day}|${kind}`
  if (knownTaken(day, kind)) return 'already-posted'
  if (now - (_wait.get(k) || 0) < RETRY_MS) return 'waiting'
  const webhook = hooks == null ? receiptsHooks() : hooks
  if (!webhook) return 'no-webhook'
  const { data: done, error: readErr } = await db.from('homer_feed_posts').select('day').match({ day, kind }).maybeSingle()
  if (readErr) { console.error(`[recap] ${kind} read failed: ${readErr.message}`); return 'read-failed' }
  if (done) { markTaken(day, kind); return 'already-posted' }

  const read = await (load || LOADERS[sport])(db, day, now)
  if (read?.error) { _wait.set(k, now); console.error(`[recap] ${kind} ${read.error}`); return 'read-failed' }
  const over = read.over
  if (over.empty) { _wait.set(k, now); return 'none: no games' }
  if (!over.ready && !over.gaveUp) { _wait.set(k, now); _readySince.delete(k); return `waiting: ${over.reason}` }
  if (!_readySince.has(k)) _readySince.set(k, now)
  if (over.ready && now - _readySince.get(k) < SETTLE_MS) { _wait.set(k, now); return 'settling' }

  const built = recapFor(sport, { ...read.input, now })
  if (built.state !== 'go') { _wait.set(k, now); return `none: ${built.reason}` }

  const claim = await db.from('homer_feed_posts').upsert([{ day, kind, payload: {} }], { onConflict: 'day,kind', ignoreDuplicates: true }).select('day')
  if (claim?.error) { console.error(`[recap] ${kind} claim failed: ${claim.error.message}`); return 'claim-failed' }
  markTaken(day, kind)
  if (!claim.data?.length) return 'already-posted'

  const d = await postToDiscord(built.text, { kind, sportKey: sport, embed: built.embed }, webhook)
  if (!d.ok) {
    // Discord never took it: release the claim so the next tick tries again (a few tries per warm instance), so a retry cannot duplicate
    const transient = d.status === 0 || d.status === 429 || d.status >= 500
    if (transient && mayRetry(`recap|${k}`)) {
      const del = await db.from('homer_feed_posts').delete().match({ day, kind })
      if (!del?.error) { unmarkTaken(day, kind); _wait.set(k, now); return `retry: discord ${d.status}` }
      console.error(`[recap] ${kind} could not release the claim: ${del.error.message}`)
    }
    return `failed: discord ${d.status || 0}`
  }
  const saved = await db.from('homer_feed_posts').update({ payload: built.payload, discord_sent: true }).match({ day, kind })
  if (saved?.error) console.error(`[recap] ${kind} posted but the row did not record it: ${saved.error.message}`)
  return 'posted (discord only)'
}
