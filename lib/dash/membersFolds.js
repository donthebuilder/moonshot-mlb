// MEMBERS_FOLDS_ON: THE #MEMBERS FOLDS (2026-10-16, Donovan approved folding many alert kinds into fewer posts so nobody mutes on day one).
// OFF BY DEFAULT in code (pattern: MOMENT_POSTS_ON, lib/cards/momentPosting.js): with the switch off every poster behaves exactly as it always did.
//
//   1. ONE DAILY BRIEFING. card_members_day at the first lock is the briefing (lib/card/briefing.js): a section per sport with every Card leg's market, line, price,
//      status word and one-line why, the Double and Long Shots, and the day's best looks. A window that locks later is ONE short "(added)" follow-up with only the
//      new legs (never a repeat). The per-sport card_members_<sport> posts are still claimed and stored, but not delivered.
//   2. THE WRITE-UP ROUNDUP. With the switch on, #members gets ONE roundup per sport and night (members_roundup_<sport>) instead of one writeup_<sport>_<game> post per
//      game: every game that had a called pick, its names and a site link to the game page, sent BEFORE the games (30 minutes before the soonest one; later games
//      in a short follow-up, 2026-10-26). The
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
/** The claim kind of a sport's nightly roundup: the first, then the follow-ups _2.._6 (supabase/migrations/202610161950_members_roundup_kinds.sql,
 *  202610262330_members_roundup_waves.sql). */
export const roundupKind = (sport, n = 1) => (n <= 1 ? `members_roundup_${sport}` : `members_roundup_${sport}_${n}`)
export const ROUNDUP_WAVES = 6
/** BEFORE THE GAMES (2026-10-26, Donovan: the BUCKETS roundup "was sent too late to members", 10 PM ET after most tips). A roundup goes out once the soonest game it
 *  carries is this close (its write-up is final 30 minutes before, lib/writeups/post.js RETRY_TO); games that lock later get a short follow-up, also before they start. */
export const ROUNDUP_BEFORE_MS = 30 * 60e3
export const ROUNDUP_MIGRATION = 'supabase/migrations/202610161950_members_roundup_kinds.sql'

const DISCORD_MAX = 1900
const glyph = (s) => [...String(s == null ? '' : s)].length
const WORD = { nhl: 'LAMP', nfl: 'TUDDY', nba: 'BUCKETS' }
const ICON_OF = { nhl: '🏒', nfl: '🏈', nba: '🏀' }
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const prettyDate = (d) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(d || '')); return m ? `${MON[Number(m[2]) - 1]} ${Number(m[3])}` : '' }
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
export function roundupText({ sport, day, items, wave = 1 }) {
  if (!items?.length || !WORD[sport]) return null
  // PLAIN WORDS (2026-10-23, Donovan): the game and the names, then the link to its write-up. The headline sentence is gone: the names are the news.
  // A follow-up (wave 2+) is "more games tonight": the later games, sent before they start.
  const title = wave > 1 ? `\u2795 **${WORD[sport]} · more games tonight**` : `${ICON_OF[sport]} **${WORD[sport]} · tonight's games**`
  const head = `${title} · ${prettyDate(day)}\n\n${items.length} game${items.length === 1 ? '' : 's'} with a pick. Tap a game for the full write-up.`
  // <link>: Discord shows it as a link without the site's preview card under the post (2026-10-26)
  const block = (it, link) => [`**${it.teams.length === 2 ? `${it.teams[0]} at ${it.teams[1]}` : 'Game'}** · ${(it.names || []).length ? it.names.join(', ') : it.headline}`, link ? `<${gameUrl(sport, it.game_id)}>` : null].filter(Boolean).join('\n')
  const more = (n) => `+${n} more game${n === 1 ? '' : 's'} with a pick: <${siteUrl(`/app#sport=${sport}`)}>`
  const all = `Every game's page: <${siteUrl(`/app#sport=${sport}&tab=${GAME_TAB[sportKey(sport)]}`)}>`      // a game that lost its own link in a long night is still one tap away
  const render = (linked, shown) => [head, '', ...items.slice(0, shown).map((it, i) => block(it, i < linked)), ...(shown < items.length ? ['', more(items.length - shown)] : linked < shown ? ['', all] : [])].join('\n').replace(/\n\n\n+/g, '\n\n')
  for (let shown = items.length; shown >= 1; shown -= 1) for (let linked = shown; linked >= 0; linked -= 1) {
    const t = render(linked, shown)
    if (glyph(t) <= DISCORD_MAX) return t
  }
  return null
}

const _tried = new Map()      // `${sport}|${day}` -> ms before which the roundup is not looked at again (a night with nothing to say is not re-read every minute)
export const _resetRoundupMemo = () => _tried.clear()
const RECHECK_MS = 2 * 60e3

/**
 * Send the night's roundup BEFORE the games: once the soonest game with a finished write-up starts within ROUNDUP_BEFORE_MS, every ready game not yet sent goes in one
 * post (the first is members_roundup_<sport>, a later one members_roundup_<sport>_2..6). A game already started is never sent (its write-up is old news). `db` =
 * service client; the night's write-up and roundup rows are read here. Claimed once each through postMembers (claim-before-send); no members webhook = nothing sent
 * and nothing claimed. Never throws. Returns what happened as a string.
 */
export async function postRoundup(db, { sport, day, startsMs = [], now = Date.now(), read = null }) {
  try {
    if (!membersFoldsOn()) return 'off'
    if (!ROUNDUP_SPORTS.includes(sport)) return 'no-roundup-for-sport'
    if (!isSportOpen(sport)) return 'hidden'      // BUCKETS says nothing anywhere until BUCKETS_PUBLIC is on
    const starts = (startsMs || []).filter((t) => Number.isFinite(t))
    if (!starts.some((t) => t > now)) return 'not-yet-or-over'
    const k = `${sport}|${day}`
    if (now < (_tried.get(k) || 0)) return 'checked-recently'
    if (!membersWebhook()) return 'no-members-webhook'
    _tried.set(k, now + RECHECK_MS)
    const all = read ? await read() : ((await db.from('homer_feed_posts').select('kind,payload').eq('day', day).or(`kind.like.writeup\\_${sport}\\_%,kind.like.members\\_roundup\\_${sport}%`)).data || [])
    const sentRows = all.filter((r) => String(r.kind || '').startsWith(`members_roundup_${sport}`))
    const sent = new Set(sentRows.flatMap((r) => (r.payload?.games || []).map(String)))
    const items = roundupItems(all.filter((r) => String(r.kind || '').startsWith('writeup_')))
      .filter((it) => !sent.has(it.game_id) && !(Date.parse(it.kickoff) <= now))      // not sent yet, and not started (an unknown kickoff counts as not started)
    if (!items.length) return 'nothing-to-say'
    const soonest = Math.min(...items.map((it) => Date.parse(it.kickoff)).filter(Number.isFinite))
    if (Number.isFinite(soonest) && soonest - now > ROUNDUP_BEFORE_MS) { _tried.delete(k); return 'not-yet' }
    const wave = sentRows.length + 1
    if (wave > ROUNDUP_WAVES) return 'wave-limit'
    const kind = roundupKind(sport, wave)
    const res = await postMembers(db, {
      day, kind, envGate: false,
      build: async () => { const text = roundupText({ sport, day, items, wave }); return text ? { text, payload: { day, sport, games: items.map((i) => i.game_id), roundup: true, wave } } : null },
    })
    if (res === 'claim-failed') console.error(`[members roundup] ${kind} skipped: the kind is not allowed yet (run supabase/migrations/202610262330_members_roundup_waves.sql)`)
    return res
  } catch (e) { return `error: ${e?.message || e}` }
}
