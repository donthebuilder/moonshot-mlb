// MEMBERS_FOLDS_ON: THE #MEMBERS FOLDS (2026-10-16, Donovan approved folding many alert kinds into fewer posts so nobody mutes on day one).
// OFF BY DEFAULT in code (pattern: MOMENT_POSTS_ON, lib/cards/momentPosting.js): with the switch off every poster behaves exactly as it always did.
//
//   1. ONE DAILY BRIEFING. card_members_day at the first lock is the briefing (lib/card/briefing.js): a section per sport with every Card leg's market, line, price,
//      status word and one-line why, the Double and Long Shots, and the day's best looks. A window that locks later is ONE short "(added)" follow-up with only the
//      new legs (never a repeat). The per-sport card_members_<sport> posts are still claimed and stored, but not delivered.
//   2. THE WRITE-UP ROUNDUP. With the switch on, #members gets ONE roundup per sport and night (members_roundup_<sport>) instead of one writeup_<sport>_<game> post per
//      game: every game that had a called pick, its one-line headline and a site link to the game page, sent once the last game of the night has started. The
//      per-game write-up rows are STILL generated and stored (the site game page and the receipts read them); the FREE featured-game post is unchanged.
//
// The text here is #members only: it goes through lib/dash/membersPost.js postMembers (the members webhook, never X, never a public webhook).
import { postMembers, membersWebhook } from './membersPost'
import { siteUrl } from './discordCard'
import { gameHref, GAME_TAB, sportKey } from '../routes'
import { isSportOpen } from '../openSwitch'

const truthy = (v) => /^(on|1|true|yes)$/i.test(String(v == null ? '' : v).trim())
/** The switch. OFF unless MEMBERS_FOLDS_ON is on. */
export const membersFoldsOn = () => truthy(process.env.MEMBERS_FOLDS_ON)

export const ROUNDUP_SPORTS = Object.freeze(['nhl', 'nfl', 'nba'])
/** The claim kind of a sport's nightly roundup (needs supabase/migrations/202610161950_members_roundup_kinds.sql). */
export const roundupKind = (sport) => `members_roundup_${sport}`
export const ROUNDUP_MIGRATION = 'supabase/migrations/202610161950_members_roundup_kinds.sql'

const DISCORD_MAX = 1900
const glyph = (s) => [...String(s == null ? '' : s)].length
const WORD = { nhl: 'LAMP', nfl: 'TUDDY', nba: 'BUCKETS' }
const NIGHT = { nhl: 'goal', nfl: 'touchdown', nba: 'double-double and triple-double' }

/** The site page of one game (a plain link: the roundup is plain text, so the link sits on its own line). */
export const gameUrl = (sport, id) => siteUrl(`/app${gameHref(sport, id)}`)

/**
 * The roundup's items from stored write-up rows ({ kind, payload }): only a LIVE row (mode 'live') of a game that had a called pick, whose #members copy was left for
 * the roundup (payload.members_sent === 'roundup'), in kickoff order. { game_id, teams, headline, names, kickoff }.
 */
export function roundupItems(rows) {
  const out = []
  for (const r of rows || []) {
    const p = r?.payload || {}
    const w = p.writeup || {}
    if (p.mode !== 'live' || p.members_sent !== 'roundup' || !(p.called || []).length || !p.game_id) continue
    const headline = String(w.header?.t || '').replace(/\s+/g, ' ').trim()
    if (!headline) continue
    out.push({ game_id: String(p.game_id), teams: [w.away, w.home].filter(Boolean), headline, names: (w.players || []).map((x) => x.name).filter(Boolean), kickoff: p.kickoff || null })
  }
  return out.sort((a, b) => (Date.parse(a.kickoff) || 0) - (Date.parse(b.kickoff) || 0) || a.game_id.localeCompare(b.game_id))
}

/**
 * The roundup's text: one block per game ("AWAY at HOME", the headline, the game's page), at most 1,900 characters. Past that the LAST games drop their own link and
 * then become a "+N more" line with the one list link; a game is never cut in half. null when there is nothing to say.
 */
export function roundupText({ sport, day, items }) {
  if (!items?.length || !WORD[sport]) return null
  const head = `${WORD[sport]} MEMBERS · ${day} · every game with a call tonight (${items.length})`
  const block = (it, link) => [`${it.teams.length === 2 ? `${it.teams[0]} at ${it.teams[1]}` : 'Game'}: ${it.headline}`, link ? gameUrl(sport, it.game_id) : null].filter(Boolean).join('\n')
  const more = (n) => `+${n} more game${n === 1 ? '' : 's'} with a call: ${siteUrl(`/app#sport=${sport}`)}`
  const all = `Every game's page: ${siteUrl(`/app#sport=${sport}&tab=${GAME_TAB[sportKey(sport)]}`)}`      // a game that lost its own link in a long night is still one tap away
  const render = (linked, shown) => [head, '', ...items.slice(0, shown).map((it, i) => block(it, i < linked)), ...(shown < items.length ? ['', more(items.length - shown)] : linked < shown ? ['', all] : [])].join('\n').replace(/\n\n\n+/g, '\n\n')
  for (let shown = items.length; shown >= 1; shown -= 1) for (let linked = shown; linked >= 0; linked -= 1) {
    const t = render(linked, shown)
    if (glyph(t) <= DISCORD_MAX) return t
  }
  return null
}

const _tried = new Map()      // `${sport}|${day}` -> ms before which the roundup is not looked at again (a night with nothing to say is not re-read every minute)
export const _resetRoundupMemo = () => _tried.clear()
const RECHECK_MS = 5 * 60e3

/**
 * Send one night's roundup, once the last game of `startsMs` has started. `db` = service client; `rows` are read here (the night's write-up rows). Claimed once through
 * postMembers (claim-before-send; a second tick or instance never posts it again); no members webhook = nothing sent and nothing claimed. Never throws.
 * Returns what happened as a string: 'off' | 'not-yet' | 'hidden' | 'nothing-to-say' | 'no-members-webhook' | 'posted' | 'already-posted' | ...
 */
export async function postRoundup(db, { sport, day, startsMs = [], now = Date.now(), read = null }) {
  try {
    if (!membersFoldsOn()) return 'off'
    if (!ROUNDUP_SPORTS.includes(sport)) return 'no-roundup-for-sport'
    if (!isSportOpen(sport)) return 'hidden'      // BUCKETS says nothing anywhere until BUCKETS_PUBLIC is on
    const starts = (startsMs || []).filter((t) => Number.isFinite(t))
    if (!starts.length || Math.max(...starts) > now) return 'not-yet'      // after the last lock: the last game of the night has started
    const k = `${sport}|${day}`
    if (now < (_tried.get(k) || 0)) return 'checked-recently'
    if (!membersWebhook()) return 'no-members-webhook'
    _tried.set(k, now + RECHECK_MS)
    const kind = roundupKind(sport)
    const rows = read ? await read() : ((await db.from('homer_feed_posts').select('kind,payload').eq('day', day).like('kind', `writeup\\_${sport}\\_%`)).data || [])
    const items = roundupItems(rows)
    if (!items.length) return 'nothing-to-say'
    const res = await postMembers(db, {
      day, kind, envGate: false,
      build: async () => { const text = roundupText({ sport, day, items }); return text ? { text, payload: { day, sport, games: items.map((i) => i.game_id), roundup: true } } : null },
    })
    if (res === 'claim-failed') console.error(`[members roundup] ${kind} skipped: the kind is not allowed yet (run ${ROUNDUP_MIGRATION})`)
    return res
  } catch (e) { return `error: ${e?.message || e}` }
}
