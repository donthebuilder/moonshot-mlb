// STORY THREADS, THE RESULT (RUN ORDER 3b, BATCH-STORY-THREAD-PLAN.md; built
// 2026-10-04, OFF until STORY_THREADS=on). Each game's call already posts once
// before first pitch (call_<game_pk>, lib/dash/gameCall.js) -- the thread's
// setup and board in one. This is its last post: after the final, a REPLY under
// that call saying how it went, so X shows the call and its grade as one
// conversation. Misses post too; that is the brand.
//
// The grade is lib/liveSlate.js pickCleared -- the one bar the bot is graded on
// -- against the hitter's own box line for that game. No at-bat, no grade, no
// post. The claim lives on the call row itself (payload.t3), so no new post
// kind and no SQL: a conditional update only one tick can win.
import { pickCleared } from '../liveSlate'

const txt = (v) => String(v ?? '').trim()
const MARKET = { TOP: 'home run', HR: 'home run', HIT: '1+ hit', HRR: '2+ hits + runs + RBIs', CONTACT: '2+ total bases', TB: '2+ total bases' }

/** Is STORY_THREADS on? Off by default: it posts to X. */
export const storyThreadsOn = () => /^on$/i.test(txt(process.env.STORY_THREADS))

/** "2-for-4, HR, 2 RBI" from a box line. */
export function lineWords(line) {
  if (!line) return ''
  const bits = [`${line.h}-for-${line.ab}`]
  if (line.hr) bits.push(line.hr > 1 ? `${line.hr} HR` : 'HR')
  if (line.r) bits.push(`${line.r} R`)
  if (line.rbi) bits.push(`${line.rbi} RBI`)
  return bits.join(', ')
}

/** The reply, or null when there is nothing honest to say (he never batted). */
export function storyResultText({ name, role, line }) {
  const r = txt(role).toUpperCase()
  const cleared = pickCleared(r, line)
  if (cleared == null) return null
  const who = txt(name)
  const market = MARKET[r] || r.toLowerCase()
  return cleared
    ? ['🤖 CALLED IT', '', `✅ ${who} · ${market}: ${lineWords(line)}.`, '', 'Locked before first pitch. Graded against exactly that.'].join('\n')
    : [`✗ MISSED · ${who} · ${market}`, '', `${lineWords(line)}.`, '', 'Graded in public.'].join('\n')
}

const MLB = 'https://statsapi.mlb.com/api/v1'

/** { final, line } for one hitter in one game: final only when the league says Final. */
export async function callOutcome(gamePk, playerId) {
  const sched = await fetch(`${MLB}/schedule?sportId=1&gamePk=${gamePk}&fields=dates,games,status,abstractGameState`).then((r) => (r.ok ? r.json() : null)).catch(() => null)
  const state = sched?.dates?.[0]?.games?.[0]?.status?.abstractGameState
  if (state !== 'Final') return { final: false, line: null }
  const box = await fetch(`${MLB}/game/${gamePk}/boxscore`).then((r) => (r.ok ? r.json() : null)).catch(() => null)
  for (const side of ['home', 'away']) {
    const p = box?.teams?.[side]?.players?.[`ID${playerId}`]
    const b = p?.stats?.batting
    if (b && b.atBats != null) return { final: true, line: { ab: Number(b.atBats) || 0, h: Number(b.hits) || 0, hr: Number(b.homeRuns) || 0, tb: Number(b.totalBases) || 0, r: Number(b.runs) || 0, rbi: Number(b.rbi) || 0 } }
  }
  return { final: true, line: null }
}

/**
 * Post each finished call's result as a reply. `days` = the slate days to look
 * at (today and yesterday: a West Coast final lands after midnight).
 * deps = { postToX, xAllows(day) -> bool, log }.
 */
export async function postStoryResults(db, days, { postToX, xAllows, log = console.error }) {
  const out = { replied: 0, skipped: 0 }
  const { data: calls, error } = await db.from('homer_feed_posts').select('day, kind, payload, x_post_id')
    .in('day', days).like('kind', 'call_%').not('x_post_id', 'is', null)
  if (error) { log(`[story] read: ${error.message}`); return out }
  for (const c of calls || []) {
    const p = c.payload || {}
    if (p.t3 || !p.player_id || !p.game_pk || !/^\d+$/.test(String(c.x_post_id))) continue
    const { final, line } = await callOutcome(p.game_pk, p.player_id)
    if (!final) continue
    const text = storyResultText({ name: p.name, role: p.role, line })
    // a final with no at-bat: mark it done so it is never read again
    if (!text) { await db.from('homer_feed_posts').update({ payload: { ...p, t3: 'no-at-bat' } }).match({ day: c.day, kind: c.kind }).is('payload->>t3', null); out.skipped++; continue }
    if (!(await xAllows(c.day))) { out.skipped++; continue }
    // the claim: only the tick whose update finds t3 still empty posts
    const claim = await db.from('homer_feed_posts').update({ payload: { ...p, t3: 'posting' } }).match({ day: c.day, kind: c.kind }).is('payload->>t3', null).select('kind')
    if (claim.error || !claim.data?.length) continue
    const r = await postToX(text, { replyTo: c.x_post_id, kind: 'story_t3' })
    await db.from('homer_feed_posts').update({ payload: { ...p, t3: r.ok && r.id ? String(r.id) : `failed:${r.status || 0}` } }).match({ day: c.day, kind: c.kind })
    if (r.ok) out.replied++
    else log(`[story] ${c.kind} reply refused: ${r.status} ${r.error}`)
  }
  return out
}
