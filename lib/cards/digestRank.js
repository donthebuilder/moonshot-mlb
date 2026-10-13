// THE NIGHT'S DIGEST: WHO MAKES IT, IN WHAT ORDER, AND THE WORDS (pure: no I/O, no env, no clock; safe for scripts and tests).
// Donovan, 2026-10-12: "dont like a pot with three players like the top three that night if available". STAR-tier moments are not posted one by one; ONE post a
// night per sport names the three most notable STAR-or-better moments of that night (lib/posts/digestPost.js sends it, lib/cards/topThreeCard.js draws it).
//
// THE RANK, in order (the ONE place to change it):
//   1. TIER       LEGEND > ELITE > STAR            (lib/cards/moments.js; BASE is never in a digest)
//   2. MAGNITUDE  the moment's own size, on a scale where 1.0 is the moment's ENTRY level so different moments compare fairly:
//                   goals in a game / home runs / touchdowns / points in a night = the count itself, so a 4-goal night beats a hat trick (both are
//                   a count of the same thing); a 100-yard game = yards / 100 (151 yards = 1.51, 212 = 2.12); a season goal milestone = goal total / 20;
//                   a long shot = the best listed price / 1000 (+1520 = 1.52); an overtime goal = 1.
//   3. RECENCY    the later event first (the game's stored clock; a day-keyed event counts as the end of its game day)
//   then the name, then the moment key, so the same events always give the same order.
// ONE LINE PER PLAYER: a man with two moments that night is listed once, by his best one. A man already posted on his own that night (ELITE / LEGEND card) is
// left out (`exclude`, a Set of player slugs), so the digest never repeats a name.
// WORDS: facts only (a count, a yardage, a listed price). Never 'lock' / 'due' / 'guaranteed' / 'nuke', never a chance figure, never a % sign, never a link on X.
import { tierRank, periodShort } from './moments'
import { X_LIMIT, noLinkText, bannedIn } from './momentPosting'

export const TOP_N = 3
const nn = (v) => { if (v == null || v === '') return null; const n = Number(v); return Number.isFinite(n) ? n : null }
const txt = (v) => String(v == null ? '' : v).trim()
const slug = (v) => String(v == null ? '' : v).toLowerCase().replace(/[^a-z0-9]/g, '')

/** The size of a moment on the shared scale (1.0 = the moment's entry level). `e` = a feed event ({ moment, row }). */
export function magnitudeOf(e) {
  const r = e?.row || {}
  switch (e?.moment) {
    case 'nhl_hat_trick': return (r.goals || []).length
    case 'nhl_three_points': return (r.goals || []).length + (r.assists || []).length
    case 'mlb_multi_hr': return (r.hrs || []).length
    case 'nfl_multi_td': return (r.tds || []).length
    case 'nfl_100_yards': return Math.max(nn(r.rush_yds) || 0, nn(r.rec_yds) || 0) / 100
    case 'nhl_season_goal_milestone': return (nn(r.season_goals) || 0) / 20
    case 'long_shot_cashed': return (nn(r.best) || 0) / 1000
    case 'nhl_goal': return 1
    default: return 0
  }
}

/** The moment's short line for the card and the post: 'HAT TRICK · 3 G', '151 RUSH YDS', 'OT GOAL'. Upper case, facts only. */
export function shortLine(e) {
  const r = e?.row || {}
  switch (e?.moment) {
    case 'nhl_goal': { const p = periodShort(r); return p === 'OT' || !p ? 'OT GOAL' : `${p} GOAL` }
    case 'nhl_season_goal_milestone': return `GOAL #${nn(r.season_goals)}`
    case 'nhl_hat_trick': { const n = (r.goals || []).length; return n === 3 ? 'HAT TRICK · 3 G' : `${n}-GOAL GAME` }
    case 'nhl_three_points': { const g = (r.goals || []).length, a = (r.assists || []).length; return `${g + a}-POINT NIGHT · ${g} G ${a} A` }
    case 'mlb_multi_hr': return `${(r.hrs || []).length} HOME RUNS`
    case 'nfl_multi_td': return `${(r.tds || []).length} TOUCHDOWNS`
    case 'nfl_100_yards': { const rush = (nn(r.rush_yds) || 0) >= (nn(r.rec_yds) || 0); return `${rush ? nn(r.rush_yds) : nn(r.rec_yds)} ${rush ? 'RUSH' : 'REC'} YDS` }
    case 'long_shot_cashed': return `LONG SHOT · +${Math.round(nn(r.best) || 0)}`
    default: return ''
  }
}

const dayMs = (day) => { const t = Date.parse(`${String(day || '').slice(0, 10)}T23:00:00Z`); return Number.isFinite(t) ? t : 0 }
/** A pick from a feed event: { slug, playerId, name, team, tier, rank, magnitude, at, moment, line, event }. null for BASE or an event without a man. */
export function pickOf(e) {
  if (!e || !e.who || tierRank(e.tier) < tierRank('star')) return null
  const line = shortLine(e)
  if (!line) return null
  return { slug: slug(e.who.playerId), playerId: String(e.who.playerId), name: txt(e.who.name), team: txt(e.who.team), tier: e.tier, rank: tierRank(e.tier), magnitude: magnitudeOf(e), at: e.at != null ? e.at : dayMs(e.day), moment: e.moment, line, event: e }
}

/** The order: tier, then magnitude, then recency (later first), then name, then moment key. */
export function compareDigest(a, b) {
  return b.rank - a.rank || b.magnitude - a.magnitude || (b.at || 0) - (a.at || 0) || String(a.name).localeCompare(String(b.name)) || String(a.moment).localeCompare(String(b.moment))
}

/**
 * The digest's picks from a night's picks (from pickOf, or built the same shape for the postseason): one per player (his best), `exclude` slugs left out,
 * best first, at most `max`. Pure; the input is not changed.
 */
export function rankPicks(picks, { exclude = new Set(), max = TOP_N } = {}) {
  const best = new Map()
  for (const p of picks || []) {
    if (!p || !p.slug || exclude.has(p.slug)) continue
    const cur = best.get(p.slug)
    if (!cur || compareDigest(p, cur) < 0) best.set(p.slug, p)
  }
  return [...best.values()].sort(compareDigest).slice(0, Math.max(0, max))
}
/** The digest of a night's feed events: rankPicks over pickOf. */
export const pickTop = (events, opts = {}) => rankPicks((events || []).map(pickOf).filter(Boolean), opts)

// ── the words ────────────────────────────────────────────────────────────────
const SPORT_WORD = { nhl: 'NHL', mlb: 'MLB', nfl: 'NFL' }
/** The title by count and sport: 'TOP 3 TONIGHT' (NHL, MLB), 'TOP 3 TODAY' (NFL: a game day), 'TOP 3 POSTSEASON PERFORMANCES'. null for no pick. */
export function digestTitle(count, { sport = 'nhl', postseason = false } = {}) {
  const n = Math.max(0, Math.min(TOP_N, Number(count) || 0))
  if (!n) return null
  if (postseason) return n === 1 ? 'TOP POSTSEASON PERFORMANCE' : `TOP ${n} POSTSEASON PERFORMANCES`
  const when = sport === 'nfl' ? 'TODAY' : 'TONIGHT'
  return n === 1 ? `TOP PERFORMER ${when}` : `TOP ${n} ${when}`
}

const lineOf = (p, i, club) => `${i + 1}. ${p.name}${club && p.team ? ` (${p.team})` : ''}: ${p.line}`
/**
 * The X text and the Discord description of a digest: { title, x, discord } (x null when nothing clean fits 280). Neutral, no link, no banned word.
 * `picks` = the ranked picks (rankPicks). Pure.
 */
export function digestTexts(picks, { sport = 'nhl', postseason = false } = {}) {
  const list = (picks || []).slice(0, TOP_N)
  const title = digestTitle(list.length, { sport, postseason })
  if (!title) return { title: null, x: null, discord: null }
  const head = postseason ? `${title} · MLB` : `${title} · ${SPORT_WORD[sport] || ''}`.replace(/ · $/, '')
  const names = list.flatMap((p) => [p.name, p.team])
  const make = (club) => noLinkText([head, ...list.map((p, i) => lineOf(p, i, club))].join('\n'))
  const full = make(true)
  const x = [full, make(false)].find((t) => Array.from(t).length <= X_LIMIT && !bannedIn(t, names)) || null
  const discord = bannedIn(full, names) ? null : full
  return { title, x, discord }
}
