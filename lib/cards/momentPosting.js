// MOMENT POSTING: THE ONE POLICY (Donovan, 2026-10-12: "yes post these when they happen, I love this" and "yes post season card when it's postseason").
// Pure: no I/O, no env reads except the switches at the bottom. The runner is lib/posts/momentPost.js, the events come from lib/posts/momentFeed.js, the
// postseason night digest is lib/posts/postseasonPost.js, the night's digest sender lib/posts/digestPost.js. Nothing here sends anything.
//
// WHO GETS POSTED WHERE, BY TIER (lib/cards/moments.js BASE / STAR / ELITE / LEGEND):
//   LEGEND  X + the sport's Discord channel + #members
//   ELITE   X + the sport's Discord channel + #members
//   STAR    NOT posted one by one any more (Donovan, 2026-10-12: "dont like a pot with three players like the top three that night if available"): STAR
//           moments are the material of THE NIGHT'S DIGEST (below). The card still lives on the player's page shelf and in the binder.
//   BASE    NEVER posted (it lives on the player's page shelf only)
// THE DIGEST (lib/posts/digestPost.js, ranking in lib/cards/digestRank.js): ONE post per sport per night (NFL: per game day) naming the three most notable
// STAR-or-better moments of that night, as ONE image (lib/cards/topThreeCard.js), at the END of the night (every game of the sport's slate for that game date
// is Final, read from the league's own schedule). X + the sport's Discord channel + #members. A player ELITE / LEGEND already posted on his own that night is
// not repeated in it; fewer than three is posted as 'TOP 2' / a single 'TOP PERFORMER'; none posts nothing. It is claimed ONCE (kind
// moment_<sport>_top3_<YYYYMMDD>, which already matches the table's kind pattern: no SQL), an X refusal keeps the claim, it counts as ONE X post (write-up
// tier, NOT exempt). MLB postseason: ONE 'TOP 3 POSTSEASON PERFORMANCES' post a night, kind postseason_mlb_top3_<YYYYMMDD>.
// X is a counted, capped, non-exempt kind (write-up tier in lib/dash/xPolicy.js: it stops 2 short of the 20-a-day cap), so a busy night cannot squeeze the
// CALLED alerts. An X post (a card or the digest) goes through admit() (pause + cap) like every other scheduled kind.
//
// ONE POST PER EVENT. Every moment has a stable event key  moment|<sport>|<playerId>|<gameId>|<n>  (n = the rung that just became true: the count of goals /
// home runs / touchdowns, or the tier's first count). homer_feed_posts is keyed (day, kind), so the claim row's kind CARRIES the event
// (moment_<sport>_<player>_<game>_<n>, same idea as call_<game_pk>): claimed once BEFORE anything is sent, so two ticks never double-post, and an X refusal
// keeps the claim (the post is closed 'skipped', never retried in a loop).
//
// KILL SWITCHES (env):  MOMENT_POSTS_ON       must be on for ANYTHING to post (default OFF in code: Donovan flips it after the SQL has been run)
//                       MOMENT_POSTS_PAUSE=1  stops every new moment / postseason post (corrections still go: they fix a public statement)
//                       MOMENT_POSTS_PAUSE_KINDS=moment_nhl,postseason_mlb   stops just those families (the digest of a sport is in its family)
//                       MOMENT_POSTS_PAUSE_KINDS=moment_top3          stops EVERY digest (any sport, postseason included); moment_nhl_top3 stops one sport's
//                       CORRECTIONS_OFF=on    (existing) stops the overturned-goal update
// Words: a result stated as a fact (a count, a clock, a yardage, a price that was listed). Never "lock" / "due" / "guaranteed" / "nuke", never a model chance figure,
// never a link on X (Discord carries the player's page link in the embed title). CALLED / ON THE BOARD appear ONLY when the stored label says so.
import { STATUS_WORD } from '../callStatus'
import { tierRank, periodShort, strengthCode } from './moments'
import { ordinal } from '../format'

export const MOMENT_POLICY = Object.freeze({
  legend: Object.freeze({ x: 'always', discord: true, members: true }),
  elite: Object.freeze({ x: 'always', discord: true, members: true }),
  star: Object.freeze({ x: 'never', discord: false, members: false }),   // STAR rides the night's digest only (DIGEST_POLICY)
  base: Object.freeze({ x: 'never', discord: false, members: false }),
})
/** THE DIGEST: where it goes (the same room as an ELITE card), and how many names it carries. */
export const DIGEST_POLICY = Object.freeze({ x: true, discord: true, members: true })
export const DIGEST_MAX = 3
/** DIGEST: a sport's night is looked at (the league's schedule asked) at most this often per instance; the ticks run every minute and the answer rarely changes. */
export const DIGEST_EVAL_MS = 5 * 60e3
/**
 * DIGEST: not before this long after the night's LAST start (a floor under the league's own 'Final': a feed that says Final too early never posts a half night). NFL waits
 * longer because the 100-yard games come from the weekly logs the site publishes after the games.
 */
export const DIGEST_AFTER_START_MS = Object.freeze({ nhl: 2.5 * 3600e3, mlb: 2.5 * 3600e3, nfl: 4 * 3600e3 })
/** DIGEST: a night is posted from only while its last start was this long ago or less (a restart or the day the switch is turned on never dumps an old night). */
export const DIGEST_FRESH_MS = 20 * 3600e3
/** The most moment posts one pass of one tick sends (a backlog never dumps; the best tier goes first). */
export const MAX_PER_PASS = 3
/** A pass stops starting new posts after this long (the ticks have a 60 s limit and do their own work first). */
export const PASS_BUDGET_MS = 25e3
/** The card picture gets this long to draw, then the post goes without it (X text-only, Discord without the image). */
export const IMAGE_TIMEOUT_MS = 12e3
/** FRESH: a live event (goal, homer, touchdown) is posted only while it is this young. A backlog (after an outage, or the day the switch is turned on) is not news. */
export const FRESH_MS = 3 * 3600e3
/** SETTLE: a goal waits this long after the league confirmed it (a challenge can take it off; lib/nhl/goalFeed POST_AFTER_MS is the same 3 minutes). */
export const SETTLE_MS = { nhl: 3 * 60e3, mlb: 0, nfl: 0 }
/** DAY-KEYED events (a 100-yard game from the published logs, a long shot) have no clock: posted while their game day is this many days old or less. */
export const FRESH_DAYS = { nfl_100_yards: 5, long_shot_cashed: 1 }
/** A failed claim because the kind is not allowed yet (the SQL has not been run) is not asked again for this long. */
export const SQL_RETRY_MS = 30 * 60e3
export const MIGRATION_FILE = 'supabase/migrations/202610121400_homer_feed_moment_kinds.sql'
/** POSTSEASON: the digest names this many big nights per postseason night (one game date): the three best by the box-score rule. */
export const POSTSEASON_MAX_PER_NIGHT = DIGEST_MAX
/** POSTSEASON: a night is posted from only while its last game started this long ago or less (a restart or the day the switch is turned on never dumps yesterday's finals). */
export const POSTSEASON_FRESH_MS = 20 * 3600e3
/** POSTSEASON: how long (minutes of ticks) the night's big-night players whose game logs have not caught up with the Finals are waited for before the digest goes without them. */
export const POSTSEASON_WAIT_TRIES = 20

// ── the kinds ────────────────────────────────────────────────────────────────
export const MOMENT_FAMILIES = Object.freeze(['moment_mlb', 'moment_nfl', 'moment_nhl', 'postseason_mlb'])
export const MOMENT_SPORTS = Object.freeze(['mlb', 'nfl', 'nhl'])
/** The postseason digest is baseball's: the sport its card, channel and X post belong to. */
export const POSTSEASON_SPORT = 'mlb'
const slug = (v) => String(v == null ? '' : v).toLowerCase().replace(/[^a-z0-9]/g, '')

/**
 * The event of a moment: { key, kind, family, parts }.  key = moment|<sport>|<playerId>|<gameId>|<n> (the stable name of the event);
 * kind = the homer_feed_posts kind that CLAIMS it, moment_<sport>_<player>_<game>_<n> (lowercase letters and digits only, so the table's kind check can be a
 * pattern). `sfx` ('upd') marks the overturned-goal update of the same event.
 */
export function eventKeyOf({ sport, playerId, gameId, n, sfx = '' }) {
  const parts = [slug(sport), slug(playerId), slug(gameId), slug(n)]
  if (!MOMENT_SPORTS.includes(parts[0]) || parts.slice(1).some((p) => !p)) return null
  return { key: `moment|${parts.join('|')}`, family: `moment_${parts[0]}`, kind: `moment_${parts.join('_')}${sfx ? `_${slug(sfx)}` : ''}`, parts }
}
/** The digest's claim kind for a sport's night: moment_<sport>_top3_<YYYYMMDD> (matches the table's moment kind pattern); the postseason one is postseason_mlb_top3_<YYYYMMDD>. null on a bad sport / date. */
export const digestKindOf = ({ sport, night, postseason = false }) => {
  const sp = slug(sport), d = String(night || '').replace(/-/g, '')
  if (!/^\d{8}$/.test(d)) return null
  if (postseason) return `postseason_mlb_top3_${d}`
  return MOMENT_SPORTS.includes(sp) ? `moment_${sp}_top3_${d}` : null
}
/** Is this claim kind a digest's? (moment_<sport>_top3_<YYYYMMDD> or postseason_mlb_top3_<YYYYMMDD>.) */
export const isDigestKind = (kind) => /^(?:moment_(?:mlb|nfl|nhl)|postseason_mlb)_top3_\d{8}$/.test(String(kind || ''))
/** The player slug an individual moment claim names: moment_<sport>_<player>_<game>_<n> -> <player> (null for a digest, an update, or anything else). */
export const playerSlugOfKind = (kind) => { const m = /^moment_(?:mlb|nfl|nhl)_([a-z0-9]+)_[a-z0-9]+_[a-z0-9]+$/.exec(String(kind || '')); return m && m[1] !== 'top3' ? m[1] : null }
export const slugOf = slug
/** The family (moment_nhl ...) of a claim kind. */
export const familyOfKind = (kind) => (/^(moment|postseason)_(mlb|nfl|nhl)(?:_|$)/.exec(String(kind || '')) || []).slice(1, 3).join('_') || null

// ── the policy ───────────────────────────────────────────────────────────────
/**
 * What a card of `tier` is posted to ON ITS OWN: { x, discord, members, why }.  `hasX` / `hasMembers` = whether those channels are configured. Pure.
 */
export function policyFor(tier, { hasX = true, hasMembers = true } = {}) {
  const t = String(tier || '').toLowerCase()
  const p = MOMENT_POLICY[t]
  if (!p) return { x: false, discord: false, members: false, why: 'unknown tier' }
  if (p.x === 'never' && !p.discord && !p.members) return { x: false, discord: false, members: false, why: t === 'star' ? 'STAR is named only in the night\'s digest' : 'BASE is never posted' }
  return { x: hasX && p.x === 'always', discord: p.discord, members: p.members && hasMembers, why: '' }
}
/** What the night's digest goes to: { x, discord, members }, from DIGEST_POLICY and what is configured. */
export const digestPolicy = ({ hasX = true, hasMembers = true } = {}) => ({ x: hasX && DIGEST_POLICY.x, discord: DIGEST_POLICY.discord, members: DIGEST_POLICY.members && hasMembers })
/** May a card of this tier be posted ON ITS OWN? (ELITE and LEGEND. STAR waits for the digest; BASE never.) */
export const postable = (tier) => tierRank(tier) >= tierRank('elite')
/** May a moment of this tier be NAMED in the night's digest? (STAR and up; BASE never.) */
export const inDigest = (tier) => tierRank(tier) >= tierRank('star')

// ── the switches ─────────────────────────────────────────────────────────────
const truthy = (v) => /^(on|1|true|yes)$/i.test(String(v == null ? '' : v).trim())
/** The master switch. OFF unless MOMENT_POSTS_ON is on (Donovan flips it after the SQL has been run and the dry run looks right). */
export const momentPostsOn = () => truthy(process.env.MOMENT_POSTS_ON)
export const momentPostsPaused = () => truthy(process.env.MOMENT_POSTS_PAUSE)
const pausedFamilies = () => String(process.env.MOMENT_POSTS_PAUSE_KINDS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
/** Is a family (moment_nhl, postseason_mlb ...) or any claim kind of one paused? */
export function kindPaused(kindOrFamily) {
  if (momentPostsPaused()) return true
  const raw = String(kindOrFamily || '').toLowerCase()
  const fam = familyOfKind(raw) || raw
  const list = pausedFamilies()
  if (list.includes(fam)) return true
  // the digests: 'moment_top3' stops every one, '<family>_top3' (moment_nhl_top3, postseason_mlb_top3) stops one family's
  return isDigestKind(raw) || /_top3$/.test(raw) ? list.includes('moment_top3') || list.includes(`${fam.replace(/_top3$/, '')}_top3`) : false
}

// ── the words ────────────────────────────────────────────────────────────────
/** The words no moment or postseason post may carry (the site-wide rules: no lock / due / guaranteed / nuke, no model chance, no percent sign). */
export const BANNED = /\b(lock(?:ed|s)?|due|guarantee[ds]?|nuke[ds]?|prob[a]bilit(?:y|ies))\b|%/i
export const X_LIMIT = 280
const nn = (v) => { if (v == null || v === '') return null; const n = Number(v); return Number.isFinite(n) ? n : null }
const txt = (v) => String(v == null ? '' : v).trim()
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
const ordinalOf = (n) => ordinal(n)
const versus = (opp) => (txt(opp) ? ` against ${txt(opp)}` : '')
const club = (team) => (txt(team) ? ` (${txt(team)})` : '')

/**
 * The ONE factual line of a moment: who, what, against whom. `row` is the moment's data row (lib/cards/moments.js), `who` = { name, team, opp }.
 * Pure; no price unless the moment is a long shot (its price was listed, and the line says "listed").
 */
export function momentLine(key, row, who) {
  const name = txt(who?.name) || 'A player'
  const head = `${name}${club(who?.team)}`
  const opp = versus(who?.opp)
  switch (key) {
    case 'nhl_goal': {
      const ot = txt(row.period_type).toUpperCase() === 'OT'
      return `${head} scored ${ot ? `in ${periodShort(row) === 'OT' ? 'overtime' : `${periodShort(row)} overtime`}` : `in the ${periodShort(row).toLowerCase()} period`} at ${txt(row.time_in_period)}${opp}${txt(row.score_after) ? `: ${txt(row.score_after).replace(/ · /g, ', ')}` : ''}.`
    }
    case 'nhl_season_goal_milestone': return `${head} scored his ${ordinalOf(nn(row.season_goals))} goal of the season${opp}.`
    case 'nhl_hat_trick': { const n = row.goals.length; return n === 3 ? `${head} has a hat trick${opp}.` : `${head} has scored ${n} goals${opp}.` }
    case 'nhl_three_points': { const g = row.goals.length, a = row.assists.length; return `${head} has ${plural(g + a, 'point')}${opp}: ${plural(g, 'goal')} and ${plural(a, 'assist')}.` }
    case 'mlb_multi_hr': return `${head} has hit ${plural(row.hrs.length, 'home run')}${opp}.`
    case 'nfl_multi_td': return `${head} has scored ${plural(row.tds.length, 'touchdown')}${opp}.`
    case 'nfl_100_yards': {
      const rush = (nn(row.rush_yds) || 0) >= (nn(row.rec_yds) || 0)
      return rush
        ? `${head} ran for ${nn(row.rush_yds)} yards${nn(row.rush_att) != null ? ` on ${plural(nn(row.rush_att), 'carry', 'carries')}` : ''}${opp}.`
        : `${head} had ${nn(row.rec_yds)} receiving yards${nn(row.rec) != null ? ` on ${plural(nn(row.rec), 'catch', 'catches')}` : ''}${opp}.`
    }
    case 'long_shot_cashed': return `${head} came through${opp}: ${txt(row.market)}, listed at a best price of +${Math.round(nn(row.best))} (best of ${plural(nn(row.books), 'book')}).`
    default: return ''
  }
}

/** The stored-label sentence: only when the SOURCE stored the label (never re-derived here). '' otherwise. */
export const statusLine = (status) => (status === 'called' ? `He was ${STATUS_WORD.called}.` : status === 'board' ? `He was ${STATUS_WORD.board}.` : '')

/** True when `text` carries a banned word. The player's own name and club are left out of the look (a quarterback named Lock is not a banned word). */
export function bannedIn(text, names = []) {
  let t = String(text == null ? '' : text)
  for (const n of names) if (n) t = t.split(String(n)).join(' ')
  return BANNED.test(t)
}

/**
 * The X text of a moment: the factual line, then the stored-label sentence if it fits, <= 280, no link, none of the banned words. null when nothing
 * clean fits. `names` = the strings to leave out of the banned-word look (the player's name, his club).
 */
export function xTextFor(line, status, names = []) {
  const base = noLinkText(line)
  if (!base) return null
  const full = [base, statusLine(status)].filter(Boolean).join(' ')
  const pick = Array.from(full).length <= X_LIMIT ? full : base
  if (Array.from(pick).length > X_LIMIT || bannedIn(pick, names)) return null
  return pick
}
/** A string with no link: a bare URL, a markdown link (its words stay), the site's own host. */
export function noLinkText(raw) {
  return String(raw == null ? '' : raw)
    .replace(/\[([^\]]*)\]\((?:[^)]*)\)/g, '$1')
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\bdashnetwork\.vercel\.app\S*/gi, '')
    .replace(/[ \t]+\n/g, '\n').replace(/ {2,}/g, ' ').trim()
}
