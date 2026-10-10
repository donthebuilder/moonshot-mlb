// MEMBERS-ONLY POSTS (BATCH-MEMBERS-PLAN M3, 2026-10-02). The founders' rail:
// the board before lock and its grade after, posted to the private Discord
// #members channel ONLY -- never X, never the public feed. Zero X credits.
//
// postMembers() goes through the same once-per-day claim every other post
// uses (lib/dash/longshotsPost.js postOnce, homer_feed_posts (day, kind)), with
// the members webhook and toX: false. With DISCORD_MEMBERS_WEBHOOK unset it
// returns before the claim, so nothing is written and nothing posts until
// Donovan wires the channel (his D1-D2). The four kinds need
// homer_feed_posts_kind_widen_19 (Donovan runs it first).
//
// Every line is read off the board as published: the score, the status word
// (lib/callStatus.js, never re-derived), the why line (lib/nfl/boardReason.js,
// lib/mlb/boardReason.js). No invented numbers; a man with no clean why line
// gets none. The grade counts touchdowns / homers from the event tables with
// no spin -- a game not played yet is "pending", never a miss.
import { postOnce } from './longshotsPost'
import { STATUS_WORD, tdCallStatus, callStatus, boardOfRows } from '../callStatus'
import { tdPool } from '../nfl/tdPool'
import { boardReason } from '../nfl/boardReason'
import { onBotFor } from '../nfl/tdFeed'
import { reasonContext, boardReasonFor, reasonLines } from '../mlb/boardReason'

export const MEMBERS_KINDS = {
  nflBoard: 'nfl_members_board', nflGrade: 'nfl_members_grade',
  mlbBoard: 'mlb_members_board', mlbGrade: 'mlb_members_grade',
}
export const NFL_MEMBERS_N = 15
export const MLB_MEMBERS_N = 10

// A members value counts only when it is a real Discord webhook URL (https,
// discord.com / discordapp.com, /api/webhooks/<id>/<token>). ',' or a pasted
// non-URL is nothing at all.
const DISCORD_HOOK = /^https:\/\/(?:[a-z]+\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+(?:\?[\w=&.-]*)?$/i
const splitHooks = (raw) => String(raw || '').split(/[,\n]/).map((s) => s.trim()).filter(Boolean)

/** Env names of every PUBLIC webhook the site could read: every DISCORD_*WEBHOOK* key except the members one. */
const publicKeys = () => Object.keys(process.env).filter((k) => /^DISCORD_.*WEBHOOK/.test(k) && k !== 'DISCORD_MEMBERS_WEBHOOK')

/**
 * The private channel's webhook(s) as a comma string, or '' when there is
 * nothing safe to post to. A URL that is not a valid Discord webhook, or that
 * also appears in ANY public webhook variable (a paste mistake), is dropped
 * and logged by KEY NAME only -- never the URL. Empty means: post nowhere.
 */
export function membersWebhook() {
  const mine = splitHooks(process.env.DISCORD_MEMBERS_WEBHOOK)
  if (!mine.length) return ''
  const owner = new Map()
  for (const k of publicKeys()) for (const u of splitHooks(process.env[k])) if (!owner.has(u)) owner.set(u, k)
  const keep = []
  const clash = new Set()
  let invalid = 0
  for (const u of mine) {
    if (owner.has(u)) { clash.add(owner.get(u)); continue }
    if (!DISCORD_HOOK.test(u)) { invalid += 1; continue }
    if (!keep.includes(u)) keep.push(u)
  }
  if (clash.size) console.error(`[members] REFUSED: DISCORD_MEMBERS_WEBHOOK holds a URL that is also in ${[...clash].join(', ')}. Dropped; fix the value. Nothing posts to a public channel.`)
  if (invalid) console.error(`[members] DISCORD_MEMBERS_WEBHOOK: ${invalid} value(s) are not a Discord webhook URL; ignored.`)
  return keep.join(',')
}

/** One members post, claimed once per day like every other post. Claims only when a valid members URL will be tried. */
export async function postMembers(db, { day, kind, build, envGate = true }) {
  const hooks = membersWebhook()
  if (!hooks) return 'no-members-webhook'
  return postOnce(db, { day, kind, build, webhooks: hooks, toX: false, envGate, membersOnly: true })
}

// the cards' date words (homerCard prettyDay), kept here so this module stays
// JSX-free and testable outside Next
const prettyDay = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
// Discord cuts a message at 1,900 (lib/dash/xPost.js postToDiscord). A list
// that would run past it keeps every name and drops why lines from the bottom
// up -- never a line cut in half.
const DISCORD_MAX = 1900
function fitList(head, items) {
  const keep = items.map(() => true)
  const build = () => [...head, ...items.map((it, i) => (keep[i] && it.why ? `${it.line}\n   ${it.why}` : it.line))].join('\n')
  for (let i = items.length - 1; i >= 0 && build().length > DISCORD_MAX; i -= 1) keep[i] = false
  return build()
}
const txt = (v) => (v == null ? '' : String(v).trim())
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null)

// ── TUDDY ──────────────────────────────────────────────────────────────────

/** Sunday's board: the week's top TD board in board order, each with its status and why. */
export function nflMembersBoard({ data, picksCard = null, gameCalls = null, n = NFL_MEMBERS_N }) {
  const pool = tdPool(data)
  if (!pool.rows.length) return null
  const gameOf = (team) => (data?.games || []).find((g) => g.home === team || g.away === team) || null
  const picks = pool.rows.slice(0, n).map((p, i) => {
    const g = gameOf(p.team)
    const onBot = onBotFor(picksCard, p.player_id, { gameCalls, gameId: g?.game_id ?? null })
    const status = tdCallStatus({ on_bot: onBot, td_board: { rank: i + 1, of: pool.rows.length } })
    return {
      player_id: txt(p.player_id), name: txt(p.name), team: txt(p.team), opp: txt(p.opp), pos: txt(p.position),
      score: Math.round(Number(p.scores.TD)), rank: i + 1, of: pool.rows.length, status,
      why: boardReason(p, pool.weights, pool.base, 'TD', pool.rows)?.text || null,
      kickoff: g?.kickoff || null, game_id: g?.game_id ?? null,
    }
  })
  const week = data?.week != null ? `Week ${data.week}` : 'This week'
  const text = fitList([
    `🏈 TUDDY MEMBERS · ${week} touchdown board, before kickoff`,
    `The top ${picks.length} of ${pool.rows.length} rated, in board order. Graded Monday.`,
    '',
  ], picks.map((p) => ({ line: `${p.rank}. ${p.name} · ${p.team} vs ${p.opp} · TD ${p.score} · ${STATUS_WORD[p.status]}`, why: p.why })))
  return { text, payload: { season: data?.season ?? null, week: data?.week ?? null, picks } }
}

/** Monday's grade: the same names against the touchdowns the feed recorded. */
export function nflMembersGrade({ board, events = [], now = Date.now() }) {
  const picks = board?.picks || []
  if (!picks.length) return null
  const scored = new Map()
  for (const e of events) if (e.player_id) scored.set(String(e.player_id), (scored.get(String(e.player_id)) || 0) + 1)
  let hit = 0, done = 0
  const lines = picks.map((p) => {
    const td = scored.get(String(p.player_id)) || 0
    const played = td > 0 || (p.kickoff ? Date.parse(p.kickoff) + 4 * 3600e3 <= now : true)
    if (played) { done += 1; if (td > 0) hit += 1 }
    const mark = td > 0 ? `✅ ${td} TD` : played ? '❌' : '⏳ plays later'
    return `${p.rank}. ${p.name} (${p.team}) · ${mark}`
  })
  const week = board?.week != null ? `Week ${board.week}` : 'This week'
  const head = `${hit} of ${done} scored${done < picks.length ? ` · ${picks.length - done} still to play` : ''}`
  return { text: [`🏈 TUDDY MEMBERS · ${week} board, graded`, head, '', ...lines].join('\n'), payload: { hit, done, of: picks.length } }
}

// ── MOONSHOT ───────────────────────────────────────────────────────────────

/** The HR board at the pregame lock: the top of tonight's board with status and why. */
export function mlbMembersBoard({ rows = [], day, n = MLB_MEMBERS_N }) {
  const rated = rows.filter((r) => r?.player_id != null && num(r?.hr_score) != null)
  if (!rated.length) return null
  const ordered = [...rated].sort((a, b) => (num(a.board_rank) ?? 1e9) - (num(b.board_rank) ?? 1e9) || num(b.hr_score) - num(a.hr_score))
  const ctx = reasonContext(rows)
  const boardOf = boardOfRows(rows) || rated.length
  const picks = ordered.slice(0, n).map((r, i) => {
    const rank = num(r.board_rank) ?? i + 1
    const status = callStatus({ role: r.game_pick_role, board_rank: rank, board_of: boardOf, on_board: true })
    const why = reasonLines(boardReasonFor(r, ctx), txt(r.name))?.why || null
    return { player_id: txt(r.player_id), name: txt(r.name), team: txt(r.team), opp: txt(r.opponent), score: Math.round(num(r.hr_score)), rank, of: boardOf, status, why }
  })
  const text = fitList([
    `⚾ MOONSHOT MEMBERS · ${prettyDay(day)} home run board, at lock`,
    `The top ${picks.length} of ${boardOf} rated, in board order. Graded tomorrow morning.`,
    '',
  ], picks.map((p) => ({ line: `${p.rank}. ${p.name} · ${p.team} vs ${p.opp} · HR ${p.score} · ${STATUS_WORD[p.status]}`, why: p.why })))
  return { text, payload: { day, picks } }
}

/** The next morning: the same names against the homers the feed recorded that night. */
export function mlbMembersGrade({ board, events = [] }) {
  const picks = board?.picks || []
  if (!picks.length) return null
  const homers = new Map()
  for (const e of events) if (e.player_id) homers.set(String(e.player_id), (homers.get(String(e.player_id)) || 0) + 1)
  const hit = picks.filter((p) => homers.has(String(p.player_id))).length
  const lines = picks.map((p) => { const h = homers.get(String(p.player_id)) || 0; return `${p.rank}. ${p.name} (${p.team}) · ${h ? `✅ ${h} HR` : '❌'}` })
  return {
    text: [`⚾ MOONSHOT MEMBERS · ${prettyDay(board?.day)} board, graded`, `${hit} of ${picks.length} homered`, '', ...lines].join('\n'),
    payload: { hit, of: picks.length },
  }
}
