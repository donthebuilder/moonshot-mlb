// THE HOMER FEED — every home run tonight, tagged with what the bot said.
//
// Pure functions over the two payloads the push sender already reads: the live
// slate snapshot (lib/liveSlate.js — every batter's line in every started
// game) and the published board (lib/dash/board.js — the bot's designations).
// No I/O here, so the whole thing is testable in node with two fixtures.
//
// WHAT "THE BOT HAD HIM" MEANS (Donovan, 2026-09-05): "any pick, watch, top15
// is a bot hit." On the published board that is a non-empty `game_pick_role`
// — TOP, TOP15, HR, HIT, HRR, CONTACT, WATCH, slash-joined when he holds several
// (tonight's board: 91 of 284 rows carry one; 44 of those are WATCH).
// A man on the board with no designation is ON THE BOARD, NO CALL: he is
// recorded with his rank, and he is not a star. A man not on the board at all is an
// off-slate homer — bench bat, call-up, late lineup — and says so.
//
// The star is earned by the FIRST role in the slash list, which is how every
// other surface on the site reads game_pick_role (lib/scoring.js,
// lib/leaders.js ROLE_OF). Keep that; do not invent a second reading here.

// pickCleared is the SAME threshold math the live in-card badges grade on
// (HR/TOP need a homer, HIT needs 1+ hit, HRR needs 2+ combined H+R+RBI) --
// reused here rather than re-deciding those bars a second time. See
// boardRoleResultsText below.
import { pickCleared } from '../liveSlate'
import { postLimit } from './postLimit'
import { callStatus, isCalledRole } from '../callStatus'
import { buildCard, playerUrl } from './discordCard'
import { BRAND, POST_WORDS } from '../routes'
import { boardOrder, boardCompare } from '../boardOrder'
import { digitRoot, dayRootOf, lifePathOf, dateNumbers } from '../numerology/core'
import { fullNameEquals, dateWritten, dateGematriaLine } from '../numerology/gematria'
import { normName } from '../format'   // R4: one copy; re-exported for importers

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0)
const txt = (v) => String(v == null ? '' : v).trim()

// statsapi team id → the abbreviation the board uses. The live snapshot
// carries ids only (homeId/awayId); the board carries abbreviations only.
// This is the join, and it is the one thing here that is not derived from a
// payload — MLB has not renumbered a franchise in decades.
export const TEAM_ABBR = {
  108: 'LAA', 109: 'ARI', 110: 'BAL', 111: 'BOS', 112: 'CHC', 113: 'CIN', 114: 'CLE',
  115: 'COL', 116: 'DET', 117: 'HOU', 118: 'KC', 119: 'LAD', 120: 'WSH', 121: 'NYM',
  133: 'ATH', 134: 'PIT', 135: 'SD', 136: 'SEA', 137: 'SF', 138: 'STL', 139: 'TB',
  140: 'TEX', 141: 'TOR', 142: 'MIN', 143: 'PHI', 144: 'ATL', 145: 'CWS', 146: 'MIA',
  147: 'NYY', 158: 'MIL',
}

/** Half-inning as a person says it: "bot 7th". Same reading as pushRules. */
export function inningWord(g) {
  const n = num(g?.inning)
  if (!n) return ''
  const half = /^top|^middle/i.test(txt(g?.half)) ? 'top' : 'bot'
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'
  return `${half} ${n}${s}`
}

/** The designation that earns the star, or null. "TOP/HR/CONTACT" → "TOP". */
export function primaryRole(row) {
  const raw = txt(row?.game_pick_role || row?.pick_type)
  const first = raw.split('/').map((x) => x.trim().toUpperCase()).filter(Boolean)[0]
  return first || null
}

/**
 * The board, indexed for a lookup per homer.
 *
 * Rank is the board order (lib/boardOrder.js), over the whole slate — "#12 on the board"
 * is the number a reader can check on the site. Rows without a player_id are
 * skipped rather than guessed at.
 */
export function boardIndexFrom(rows) {
  const index = new Map()
  if (!Array.isArray(rows)) return index
  // 2026-09-25: board order = the bot's board_rank (lib/boardOrder.js), the
  // same number the board tab prints, so "#12 on the board" on the alert is
  // the #12 a reader finds on the site. Rows without one fall back to hr_score.
  const ranked = boardOrder(rows.filter((r) => txt(r?.player_id)))
  ranked.forEach((r, i) => {
    const id = txt(r.player_id)
    if (index.has(id)) return              // first (highest) occurrence wins
    index.set(id, {
      role: primaryRole(r),
      roles: txt(r.game_pick_role || r.pick_type),
      hrScore: Number.isFinite(Number(r.hr_score)) ? Number(r.hr_score) : null,
      rank: i + 1,
      team: txt(r.team) || null,
      opponent: txt(r.opponent) || null,
      stats: statsFrom(r),
    })
  })
  // THE BOARD'S SIZE (2026-10-01, 0c): ON THE BOARD is the top third of the
  // night's board (lib/callStatus.js), so every entry carries the n its rank
  // is out of.
  for (const e of index.values()) e.of = index.size
  return index
}

// ── WHERE HE SAT ON THE BOARD (2026-09-18) ──────────────────────────────────
//
// Donovan: "for the hr tweet can we reply with maybe the like three names
// above and below the player who went or like 2 names."
//
// A REPLY, not part of the alert. The alert's job is the moment -- headline,
// event, proof, closer -- and bolting a five-row leaderboard onto it would
// bury the homer under a table. One tap down, the same reader gets the
// context: this is not a name we pulled out of the air, here is the company
// he was keeping before the ball landed.
//
// It also does three things nothing else on the account does. It teaches the
// ranking (a reader learns what a Moonshot score IS by seeing five of them
// next to each other). It puts four extra real names in front of search. And
// it is the honest version of a victory lap -- the neighbours are there
// whether they went deep or not.
//
// ONLY FOR A MAN WHO WAS ON THE BOARD. "Where he sat" is meaningless for
// someone the model never surfaced, and the house rule (CALLED / ON THE BOARD
// / NOT ON THE BOARD) is the whole product -- a not-on-the-board homer gets
// no reply rather than a fabricated position.
//
// RANKED AMONG THE CALLS, NOT AMONG ALL 270 ROWS. Third pass, and the two
// rejected versions are worth keeping written down:
//
//   - all 270 rows: the published file scores every hitter, so the weakest
//     real HR call rendered as "#100 on tonight's board" and his neighbours
//     were three men the model never called.
//   - any roled row: a HRR pick ranks on hr_score here and came out 258th.
//
// `rows` is therefore the CALL POOL the caller hands in -- tonight, the 30
// TOP/HR names -- so "#12 of 30" is a true sentence and every neighbour is
// another call. Ranked on hr_score, the field the whole post is about.
// ── THE MOONSHOT BOARD (2026-09-19, third pass and the right one) ──────────
//
// Donovan: "whatever the moonshot board is. i want that to be using the top
// rankings and show the top 10 top scores not hr scores. moonshot board is the
// top rankings."
//
// THE FIELD IS overall_score, and it is the one I should have used from the
// start. Verified against the live board before writing this: all 269 rows
// carry it, and the TOP-roled names cluster at the head of it (Alvarez 71.5,
// Carrigg 70.9, Crow-Armstrong 70.8) -- which is exactly what "the Moonshot
// board" means on the site. hr_score is ONE market's number; overall_score is
// the board.
//
// That also dissolves the problem the previous two passes kept hitting. There
// is no per-market pool to choose and no market to name, because there is one
// board and everybody is on it: a HIT call and a HRR call and a TOP call all
// have a real position on the same list. Jonathan Aranda, a HRR call, is 7th.
//
// THE POST SHOWS THE TOP 10 AND THEN HIM. Ten names every time is ten names
// in front of search, the list is the same object every night so a reader
// learns to recognise it, and marking his line inside it -- or under it when
// he is deeper -- answers "where did he sit" without a paragraph.
//
// ── FOURTH PASS (2026-09-25): THE BOARD ORDER, SAME AS THE SITE ────────────
// The site's # column, the HR board, the lanes and the alert's "#N on the
// board" all moved to lib/boardOrder.js (the bot's board_rank -- hr_score,
// season HR and season avg EV averaged as slate ranks, measured on 21
// pregame nights: top-10 17% -> 22%). Donovan, on the question of whether
// this post should follow: "do the recommended". So the ten names here are
// the same ten a reader finds at #tab=fullboard, and the number beside each
// is the board score (0-100). A payload without board_rank falls back to the
// old overall_score order, exactly as the site does, so nothing goes blank.
export function moonshotBoardRanking(rows) {
  const seen = new Set()
  const out = []
  const hasBoard = (Array.isArray(rows) ? rows : []).some((r) => Number(r?.board_rank) > 0)
  for (const r of (Array.isArray(rows) ? rows : [])) {
    const id = txt(r?.player_id)
    if (!id || seen.has(id)) continue
    if (hasBoard) { if (!(Number(r?.board_rank) > 0)) continue }
    else if (!Number.isFinite(Number(r?.overall_score))) continue
    seen.add(id)
    out.push(r)
  }
  if (hasBoard) out.sort(boardCompare)
  else out.sort((a, b) => num(b?.overall_score) - num(a?.overall_score))
  return out.map((r, i) => ({
    rank: i + 1,
    player_id: txt(r.player_id),
    name: txt(r.name),
    team: txt(r.team) || null,
    score: Math.round(num(hasBoard ? r.board_score : r.overall_score) * 10) / 10,
    role: txt(r.game_pick_role) || null,
  }))
}

export function moonshotBoardText(ranking, playerId, { site = '', handle = '', top = 10 } = {}) {
  const id = txt(playerId)
  if (!Array.isArray(ranking) || !ranking.length || !id) return ''
  const him = ranking.find((r) => r.player_id === id)
  if (!him) return ''
  const tail = [site, handle].filter(Boolean).join(' · ') || null
  const head = "📊 TONIGHT'S MOONSHOT BOARD"
  const line = (r, mark) => `${mark ? '→ ' : '   '}${r.rank}. ${r.name}${r.team ? ` (${r.team})` : ''} · ${r.score}`
  const closer = him.rank === 1
    ? 'Top of the board. It landed.'
    : `#${him.rank} on tonight's board. It landed.`
  // He is either INSIDE the ten, marked in place, or he is below it and gets
  // his own line under a blank -- never both, and never a ten that quietly
  // omits him.
  for (let n = Math.max(3, top); n >= 3; n -= 1) {
    const head10 = ranking.slice(0, n)
    const inside = head10.some((r) => r.player_id === id)
    const rows = head10.map((r) => line(r, r.player_id === id))
    const body = [
      head, '',
      ...rows,
      ...(inside ? [] : ['', line(him, true)]),
      '', closer,
      tail ? '' : null, tail,
    ]
    if (body.filter((l) => l != null).join('\n').length <= postLimit()) {
      return body.filter((l) => l != null).join('\n')
    }
  }
  return ''
}

// WHICH BOARD HE WAS ACTUALLY ON (2026-09-18, second pass -- see the route's
// own note for the coverage problem that forced this). lib/verdict.js's house
// rule again: a pick wears its own market's score. A HIT call ranked on
// hr_score is the Freddie Freeman bug the NFL twin already documents.
//
// WATCH is deliberately absent. It is coverage, never a pick -- the same
// reason boardRoleText leaves it off TONIGHT'S BOARD -- so a WATCH name going
// deep gets the alert and no reply.
export const NEIGHBOR_MARKETS = {
  TOP: { key: 'hr_score', label: 'HR' },
  HR: { key: 'hr_score', label: 'HR' },
  HIT: { key: 'hit_score', label: 'HIT' },
  HRR: { key: 'hrr_score', label: 'HRR' },
}

// ── THE PRICE ───────────────────────────────────────────────────────────────
//
// Donovan (09-05): "if the pick has an actual price then post it but make sure
// the book is known. we have to have odds and stuff because the site shows it."
//
// odds_latest.json (bots/odds_fetch.py) already carries exactly that: per
// player, per market, `best_over` and `best_book` — and tonight's file names
// only Fanatics and DraftKings, which is the pair he wants. The same lookup
// lib/odds.js quoteFor() does, re-done here in plain server-side code because
// that file is 'use client' and cannot be imported by a cron.
//
// Two guards. The file has to be for THIS slate (slate_date === day) or a
// Friday homer would wear Thursday's price; and the line has to be the 0.5 the
// HR bet is on, which is what the whole site's HR quote insists on.

/** Must match norm_name() in bots/odds_fetch.py and normName() in lib/odds.js. */

/** { over, book } for this man's HR price tonight, or null. */
export function hrQuoteFor(odds, id, name, day) {
  if (!odds || typeof odds !== 'object') return null
  if (day && txt(odds.slate_date) && txt(odds.slate_date) !== day) return null
  const q = odds.by_player_id?.[String(id)]?.batter_home_runs
    || odds.by_name?.[normName(name)]?.batter_home_runs
  if (!q) return null
  if (Math.abs(num(q.line) - 0.5) > 1e-9) return null
  const over = Number.isFinite(Number(q.best_over)) ? Number(q.best_over) : Number(q.over)
  const book = txt(q.best_book)
  if (!Number.isFinite(over) || over === 0 || !book) return null   // a price without a book is not posted
  return { over, book }
}

export const fmtOdds = (n) => (Number(n) > 0 ? `+${Number(n)}` : `${Number(n)}`)

// A LONGSHOT is a price of +700 or longer. It gets its own glyph on the
// line, because a called homer at +1100 is the post that gets screenshotted.
export const LONGSHOT = 700
// 'the bot had him' only for a CALLED role -- a WATCH / TOP15 band is a ranking,
// not a call (bot audit 10-03: Boolean(role) said it for both)
export const isLongshot = (ev) => isCalledRole(ev?.role) && Number(ev?.odds_over) >= LONGSHOT

/** "HR +900 · DraftKings", or the longshot form when the bot had him, or ''. */
export function oddsWord(ev) {
  const over = Number(ev?.odds_over)
  const book = txt(ev?.odds_book)
  if (!Number.isFinite(over) || over === 0 || !book) return ''
  if (isLongshot(ev)) return `🎯 ${fmtOdds(over)} · ${book} — and MOONSHOT had him`
  return `HR ${fmtOdds(over)} · ${book}`
}

// ── THE STATS ON THE CARD ───────────────────────────────────────────────────
//
// The same numbers components/shareCard.js downloadPlayerCard() prints under
// 🔨 THE BAT and 🥎 THE ARM, read off the full board row (fetchBoardFull —
// the slimmed sender copy drops every one of these). Stored on the homer_feed
// row as `stats` so the card can be re-rendered a month later from the record
// alone. Null where the board had nothing; the card prints nothing for a null.
const fnum = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))

export function statsFrom(r) {
  if (!r) return null
  const shape = r.hr_shape_components || {}
  return {
    season_hr: fnum(r.season_hr),
    season_iso: fnum(r.season_iso),
    last5_hr: fnum(r.last5_hr),
    last5_hits: fnum(r.last5_hits),
    last5_xbh: fnum(r.last5_xbh),
    barrel: fnum(r.recent_barrel_rate),
    hard_hit: fnum(r.recent_hard_hit_rate),
    max_ev: fnum(shape.max_ev),
    max_distance: fnum(shape.max_distance),
    // The model's own sub-scores (itself/bots/mlb_dashboard.py), 0-100 each —
    // nobody outside MOONSHOT has these. Kept separate from max_ev/max_distance
    // (real Statcast numbers) so shapeWord() below never mixes the two.
    shape_swing: fnum(shape.pull_air_launch),
    shape_pitch_fit: fnum(shape.pitch_type_fit),
    shape_contact: fnum(shape.batted_ball_damage),
    shape_power: fnum(shape.season_power_baseline),
    bats: txt(r.bats || r.handedness) || null,
    pitcher: txt(r.pitcher_name) || null,
    pitcher_throws: txt(r.pitcher_throws) || null,
    pitcher_hr9: fnum(r.pitcher_hr9),
    pitcher_whip: fnum(r.pitcher_whip),
    weak_side: txt(r.pitcher_weak_side || r.weak_side) || null,
    park_factor: fnum(r.park_hr_factor),
    venue: txt(r.venue_name) || null,
  }
}

// ── THE HOOKS: what only MOONSHOT tracks ───────────────────────────────────
//
// Donovan (09-05): "use any data we have for the X post, like the pair history
// like Star Tool did — things we track that no one else does." Each hook is
// one short line, computed when the homer is first seen and frozen on the row
// (`hooks`), so the post and the card and the page all say the same thing.
//
//   👥 SAME-DAY PARTNER  pair_history_summary.json: the man he has gone deep
//      on the same day with most often this season, and whether that man has
//      ALSO gone deep tonight. This is Star Tool's reply stat, in the post.
//   🔁 BACK-TO-BACK      he homered last night too (homer_feed, yesterday).
//   🤖 THE BOT'S RECORD  ON HIM: how many of his last N homers the bot had
//      called (homer_feed history). Only once he has 3+ on record.
//   🔢 NUMEROLOGY        his season HR number and his jersey reduce to the
//      same digit root — the ledger's own pattern, stated only when it hits.
//      A SECOND numerology line, birthday-based, is the FALLBACK for a man
//      with no history yet (a call-up, a rookie) — see the note above its
//      block in hooksFor(). Never both at once; see below.
//
// A hook that cannot be computed is simply absent. Never a placeholder.

// digitRoot / dayRootOf / lifePathOf: one copy, lib/numerology/core.js (2026-09-27).
export { digitRoot, dayRootOf, lifePathOf }

// The two birthday reductions — identical to the Ledger's and the Ledger
// Archive's (lib/ledgerArchive.js), re-derived here rather than imported so
// this module keeps its own no-dependency rule (see file header); they must
// stay in step by hand. day = the day of the month reduced (the 26th →
// 2+6 → 8); life path = every digit of the full date, reduced.

// "the Nth" — 1st, 2nd, 3rd, 4th... only used to name a birth day-of-month
// in a tweet, so it never has to handle anything outside 1-31.
const ordinalOf = (n) => {
  const v = Number(n)
  if (!Number.isFinite(v)) return String(n)
  const mod100 = v % 100
  if (mod100 >= 11 && mod100 <= 13) return `${v}th`
  const suffix = ['th', 'st', 'nd', 'rd'][v % 10] || 'th'
  return `${v}${suffix}`
}

// 🧬 MOONSHOT SHAPE SCORE — the model's own read on the swing, not a Statcast
// number. Every homer carries four 0-100 sub-scores (statsFrom, above); this
// takes whichever one graded highest and names it, the same "one stat, not
// the whole card" rule the share-card tweets use (claude/moonshot-tweet-format.md).
// Donovan (09-05): "add a stat only our site uses" — this is the one nobody
// else can print, because nobody else has the model.
const SHAPE_LABELS = [
  ['shape_swing', 'swing shape'],
  ['shape_pitch_fit', 'pitch-mix fit'],
  ['shape_contact', 'contact quality'],
  ['shape_power', 'power baseline'],
]
export function shapeWord(stats) {
  let best = null
  for (const [key, label] of SHAPE_LABELS) {
    const v = fnum(stats?.[key])
    if (v == null) continue
    if (!best || v > best.v) best = { v, label }
  }
  if (!best) return ''
  return `🧬 MOONSHOT Shape Score — ${best.label}: ${Math.round(best.v)}/100`
}

/**
 * His most frequent same-day partner from the pair summary, or null.
 * `rate` is same-day homers over the days the file checked — the share of
 * nights this season both men went deep. Small by nature (Star Tool prints
 * 1-2% for the same idea); Donovan wants it shown anyway: "I like that they
 * showed the percent even though it was like 2 percent."
 */
export function partnerFor(pairs, id, name) {
  const daysChecked = num(pairs?.days_checked)
  const list = Array.isArray(pairs?.top_pairs) ? pairs.top_pairs : []
  const pid = String(id)
  const nm = normName(name)
  let best = null
  for (const p of list) {
    const ps = Array.isArray(p?.players) ? p.players : []
    const mine = ps.find((x) => String(x?.player_id) === pid || (nm && normName(x?.name || x?.player_name) === nm))
    if (!mine) continue
    const other = ps.find((x) => x !== mine)
    const count = num(p?.same_day_hr_count_season)
    if (!other || count < 2) continue
    if (!best || count > best.count) {
      best = {
        id: other.player_id != null ? String(other.player_id) : null,
        name: txt(other.name || other.player_name), team: txt(other.team) || null,
        count, sameGame: num(p?.same_game_hr_count),
        rate: daysChecked > 0 ? Math.round((1000 * count) / daysChecked) / 10 : null,
      }
    }
  }
  return best
}

/**
 * The hook lines for one homer.
 * @param ev          the homer row (needs player_id, name, role, hr_n, stats)
 * @param ctx         { pairs, todayIds:Set, yesterdayIds:Set, history:[{role}], jersey }
 */
export function hooksFor(ev, ctx = {}) {
  const out = []
  const id = String(ev?.player_id || '')

  // THE PAIR, LIVE. Donovan: "it's mainly to help with pairing live through
  // the night." So the line says where the partner IS right now: already
  // deep tonight, still batting, or not on the slate.
  const partner = ctx.pairs ? partnerFor(ctx.pairs, id, ev?.name) : null
  if (partner) {
    const pid = partner.id ? String(partner.id) : null
    const both = pid && ctx.todayIds?.has(pid)
    const playing = pid && ctx.board?.has(pid)
    const status = both ? 'both deep tonight ✓' : playing ? 'still live tonight' : 'not on tonight\'s slate'
    const rate = partner.rate != null ? ` (${partner.rate}%)` : ''
    out.push(`👥 ${partner.name}${partner.team ? ` (${partner.team})` : ''}: ${partner.count}x same-day${rate} · ${status}`)
  }

  // MOONSHOT SHAPE SCORE — moved up 2026-09-07 (Donovan: this and pair history
  // are the two he actually wants to see). Used to be dead last, added only
  // so a quiet no-call homer had something to say; that also meant it was the
  // first thing the character budget cut on any post that already had a
  // partner or a streak line. Now second, right behind pair history, so the
  // two together survive together far more often -- at the cost of streak /
  // pair-complete / numerology being what gets trimmed instead.
  const shape = shapeWord(ev?.stats)
  if (shape) out.push(shape)

  // Ordered by what sells the site: the record on him outranks a streak,
  // and the post keeps as many as fit under the character limit in this order.
  // 🎉 A FIRST CAREER POSTSEASON HOMER (2026-09-27) is the moment, whoever
  // hit it: said before the record line, for everyone (the tick stamps
  // stats.post_first off his earlier seasons' postseason totals).
  if (ev?.stats?.postseason === true && ev?.stats?.post_first === true) out.push('🎉 His first career postseason homer')
  const hist = Array.isArray(ctx.history) ? ctx.history : []
  if (hist.length >= 3) {
    // CALLED, the one definition (lib/callStatus.js): a WATCH / TOP15 role is a ranking band, not a call
    const called = hist.filter((h) => callStatus(h) === 'called').length + (callStatus(ev) === 'called' ? 1 : 0)
    const n = hist.length + 1
    if (called * 2 >= n) {
      // A real track record -- majority or better. This is the flex.
      out.push(`✅ MOONSHOT had him for ${called} of his last ${n} homers`)
    } else {
      // Donovan (09-07): "0 of his last 4 is not a flex, exchange this with
      // something else." Below-majority just admits the bot whiffed on him,
      // so this isn't the place to say it. He suggested a park-specific HR
      // count, but that split isn't tracked anywhere in the pipeline today
      // (neither here nor in dash-bot -- only the PARK's overall HR factor
      // is, which THE ARM already prints) -- a real feature, not a copy
      // swap, if he wants it built. Season total is already computed and
      // is always a plain, positive number regardless of a cold recent
      // stretch. Skipped when it would just repeat the milestone hook below.
      // OCTOBER (2026-09-27): a postseason homer is counted in the
      // postseason (stats.post_nth, stamped by the tick) and never added to
      // the regular-season total; an unknown season (postseason: null) says
      // nothing about counts.
      const seasonHrSoFar = fnum(ev?.stats?.season_hr)
      const postNth = fnum(ev?.stats?.post_nth)
      if (ev?.stats?.postseason === true) {
        // (a first career postseason homer already has its own line above)
        if (ev?.stats?.post_first !== true && postNth != null) out.push(`⚾ His ${ordinalOf(postNth)} homer this postseason`)
      } else if (ev?.stats?.postseason !== null && seasonHrSoFar != null) {
        const seasonNth = seasonHrSoFar + num(ev?.hr_n)
        if (!MILESTONES.has(seasonNth)) out.push(`⚾ His ${ordinalOf(seasonNth)} homer of the season`)
      }
    }
  }

  if (ctx.yesterdayIds?.has(id)) out.push('🔁 Back-to-back nights')

  // PAIR COMPLETE. An earlier homer tonight named this man as its partner;
  // this is the payoff line for anyone who paired off that post.
  const earlier = (Array.isArray(ctx.pairedEarlier) ? ctx.pairedEarlier : []).find((r) => String(r?.partner_id) === id && String(r?.player_id) !== id)
  if (earlier) out.push(`✓ Pair complete — ${earlier.name} went deep earlier${earlier.inning ? ` (${earlier.inning})` : ''}`)

  // THE STREAK. Only on a TOP pick's own homer, and only once it is a streak.
  const straight = num(ctx.topStraight)
  if (ev?.role === 'TOP' && straight >= 2) out.push(`🔥 MOONSHOT's TOP pick has gone deep ${straight} straight nights`)

  const seasonHr = fnum(ev?.stats?.season_hr)
  const jersey = fnum(ctx.jersey)
  // The season-number hooks are regular-season hooks: none in October (or
  // when the season is unknown) -- "HR #40 of the season" must not count an
  // October homer.
  const regular = ev?.stats?.postseason === undefined || ev?.stats?.postseason === false
  const nth = regular && seasonHr != null ? seasonHr + num(ev?.hr_n) : null
  if (nth != null && MILESTONES.has(nth)) out.push(`🏆 HR #${nth} of the season`)
  // GEMATRIA (numerology step 7): his FULL name equals tonight's date number,
  // his HR number or his jersey, exactly, in one of the 4 base ciphers. Rarer
  // than a shared digit root, so it takes the one 🔢 line first. ctx.day is
  // the slate's own date; without it the date match sits out.
  const gem = gematriaHook(ev?.name, { day: ctx.day, nth, jersey })
  if (gem) out.push(gem)
  else if (nth != null && jersey != null && nth > 0 && digitRoot(nth) === digitRoot(jersey)) {
    out.push(`🔢 HR #${nth} in jersey #${jersey} — same digit root (${digitRoot(nth)})`)
  }

  // FALLBACK NUMEROLOGY — for the quiet ones. Same hist.length < 3 gate as
  // the "bot had him for X of Y" hook above (a call-up or rookie has nothing
  // to hang that one on), so this only runs for a thin-data player, and only
  // when the jersey/HR-count coincidence above didn't already fire. One 🔢
  // line, never two.
  const alreadyNumerology = out.some((h) => h.startsWith('🔢'))
  if (hist.length < 3 && !alreadyNumerology && ctx.birthDate) {
    const dayRoot = dayRootOf(ctx.birthDate)
    const lifePath = lifePathOf(ctx.birthDate)
    const bday = Number(String(ctx.birthDate).slice(8, 10)) || null
    if (jersey != null && bday === jersey) {
      out.push(`🔢 Born on the ${ordinalOf(bday)} — same as his jersey number, #${jersey}`)
    } else if (jersey != null && dayRoot != null && dayRoot === digitRoot(jersey)) {
      out.push(`🔢 Jersey #${jersey} and his birthday both reduce to ${dayRoot}`)
    } else if (nth != null && nth > 0 && lifePath != null && lifePath === digitRoot(nth)) {
      out.push(`🔢 HR #${nth} lands on his life path number, ${lifePath}`)
    }
  }

  return out
}

const MILESTONES = new Set([10, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70])

/**
 * The homer tweet's gematria line, or null: tonight's date first (full, then
 * short), then his HR number, then his jersey. Exact values only.
 *   "🔢 His name = 64 in English Ordinal. Tonight is 9/29/26 = 64"
 */
export function gematriaHook(name, { day = '', nth = null, jersey = null } = {}) {
  if (!name) return null
  const onDate = dateGematriaLine(name, day)
  if (onDate) return onDate
  if (nth != null && nth > 0) {
    const hit = fullNameEquals(name, nth)
    if (hit) return `🔢 HR #${nth}, and his name = ${nth} in ${hit.label}`
  }
  if (jersey != null && jersey > 0) {
    const hit = fullNameEquals(name, jersey)
    if (hit) return `🔢 His name = ${jersey} in ${hit.label} — same as his jersey, #${jersey}`
  }
  return null
}

/**
 * How many consecutive nights, ending on `day`, a TOP pick went deep.
 * `rows` are homer_feed rows (day, role) from the last ~10 days, tonight's
 * included. Tonight counts only if `includeToday` — for a post at 9pm it is
 * true (this homer is the night's TOP); for the recap it is whatever the
 * table says.
 */
export function topStreakFrom(rows, day, includeToday = true) {
  const nights = new Set((Array.isArray(rows) ? rows : []).filter((r) => r?.role === 'TOP').map((r) => String(r.day)))
  if (includeToday) nights.add(day)
  let n = 0
  let d = new Date(`${day}T12:00:00Z`)
  for (;;) {
    const iso = d.toISOString().slice(0, 10)
    if (!nights.has(iso)) break
    n += 1
    d.setUTCDate(d.getUTCDate() - 1)
  }
  return n
}

// ── THE PREGAME CALL ───────────────────────────────────────────────────────
//
// The post that makes every 🤖 provable: the bot's HR calls, public before
// first pitch, with the price. Every called homer that night QUOTES it.
// Ten names, not one — the archive says #1 vs #2 is close to a coin flip
// (components/BotPicksStrip.js), and ten gives the night more to point back
// at (bumped from five 2026-09-06, Donovan). Ranked by hr_score among the
// TOP and HR designations.

export function pregamePicks(rows, odds, day, limit = 10) {
  // 2026-09-24: one row per man. A doubleheader puts him on the slate twice
  // and /called listed Pete Alonso at #3 and #4 the same night.
  const seenIds = new Set()
  const list = (Array.isArray(rows) ? rows : [])
    .filter((r) => /\b(TOP|HR)\b/.test(txt(r?.game_pick_role).toUpperCase()) && txt(r?.player_id))
    // ONE ORDER (2026-10-03, Donovan: "one post has Murakami being the call,
    // other has Randal ... we need to get all that in order"). This ranked by
    // raw hr_score while the site, the homer alerts and "#N on the board" all
    // use board_rank (lib/boardOrder.js) -- so Murakami, #1 on the board, was
    // #3 here. Same comparator as everywhere else now.
    .sort(boardCompare)
    .filter((r) => { const id = txt(r.player_id); if (seenIds.has(id)) return false; seenIds.add(id); return true })
    .slice(0, limit)
  return list.map((r) => {
    const q = hrQuoteFor(odds, r.player_id, r.name, day)
    return {
      player_id: String(r.player_id), name: txt(r.name), team: txt(r.team) || null, opponent: txt(r.opponent) || null,
      role: primaryRole(r), board_rank: fnum(r.board_rank), hr_score: fnum(r.hr_score), odds_over: q?.over ?? null, odds_book: q?.book ?? null,
      pitcher: txt(r.pitcher_name) || null,
      // 2026-09-18 (Donovan: "make sure we know pitcher hr/9 recent"). The arm's
      // HR/9 over his last THREE starts. Verified live on tonight's board before
      // wiring it: 270/270 rows carry it, all 30 starters, every one with a full
      // 3-start sample -- and it separates far harder than the season number
      // (0.45-5.73 vs 0.36-2.66), disagreeing with it outright in places
      // (Bradish 1.16 season, 3.00 last three). It fills the pregame card's
      // price column on a night with no odds, which printed a dash ten times.
      pitcher_l3_hr9: fnum(r.pitcher_l3_hr9),
    }
  })
}

// WHO THE PUBLIC PREGAME POST NAMES -- and only them (2026-10-09, X overhaul
// piece 1, Donovan: "don't reply to a list if the player is not on there").
// This used to return EVERY roled name on the board (15 to 39 ids) while the
// public post names five, so a CALLED homer by a man the post never mentioned
// quoted it anyway: 30 of 79 receipts pointed at a post that did not name him.
// It takes the picks that were POSTED and returns exactly their ids. Stored in
// the pregame payload as `named`; the receipt lookup (lib/dash/quoteFor.js)
// reads only that, so the quoted set is the named set. Never reaches post text.
// `text` (the post as written) narrows it further: pregameText drops names off
// the bottom to fit, or falls back to a teaser that names no one, so the ids are
// those whose name is really IN the text.
export function pregameCalled(picks, text = null) {
  const seen = new Set()
  for (const p of Array.isArray(picks) ? picks : []) {
    const id = txt(p?.player_id)
    if (!id) continue
    if (text != null && !(txt(p?.name) && String(text).includes(txt(p.name)))) continue
    seen.add(String(id))
  }
  return [...seen]
}

export function pregameText(picks, { day = '', site = '', handle = '' } = {}) {
  const tail = [site, handle].filter(Boolean).join(' · ') || null
  const head = '🌙 THE CALLED SHOTS'
  const fits = (lines) => lines.filter((l) => l != null).join('\n').length <= postLimit()

  // 2026-09-18 (Donovan: "all the tweet should be full"). WAS `picks.length <= 5`
  // -- a hardcoded cap that predates the shared budget, and the reason THE
  // CALLED SHOTS read 84 characters with ten real calls in hand: any night the
  // board called more than five, the named list was skipped outright and the
  // post fell through to the teaser. The teaser is still there below, but it is
  // now a LAST resort rather than the normal path. fits() decides, and it drops
  // names off the BOTTOM of the ranking -- never off #1.
  //
  // The arm and his recent HR/9 ride along now that there is room: pitcher_l3_hr9
  // is on every pick already (see pregamePicks above) and was reaching the CARD
  // only. On a night with no odds the price column is blank, and this is the
  // evidence that fills it.
  for (let n = picks.length; n >= 1; n -= 1) {
    const priced = picks.slice(0, n).map((p, i) => {
      const price = p.odds_over && p.odds_book ? ` · ${fmtOdds(p.odds_over)}` : ''
      const arm = p.pitcher ? ` vs ${p.pitcher}` : ''
      const hr9 = p.pitcher_l3_hr9 != null ? ` ${Number(p.pitcher_l3_hr9).toFixed(2)} HR/9 L3` : ''
      return `${i + 1}. ${p.name}${p.team ? ` (${p.team})` : ''}${arm}${hr9}${price}`
    })
    const body = [head, '', ...priced, tail ? '' : null, tail]
    if (fits(body)) return body.filter((l) => l != null).join('\n')
  }
  const teaser = picks.length
    ? [head, '', `Tonight's top ${picks.length} from Moonshot.`, '', 'The full board is on the card.', tail ? '' : null, tail]
    : [head, tail]
  return teaser.filter((l) => l != null).join('\n')
}

// MOVED HERE FROM tweetFeed.js (2026-09-18). TONIGHT'S BOARD needs it too,
// and tweetFeed already imports from this file -- the other direction would
// be circular. num() here returns 0 for a missing value where tweetFeed's
// returned null, so this copy uses fnum() and the .000 guard still holds.
// 2026-09-08 (Donovan: "add recent stats to help ... anything that doesn't
// really have any stats with it"). One shared line for any post that would
// otherwise just be a bare name: last5_avg/hr/rbi are already on every board
// row, no extra pull. last5_status !== 'ok' (early season, a call-up with
// no games yet) returns '' rather than a fabricated .000.
export function l5Line(row) {
  if (!row || row.last5_status !== 'ok') return ''
  const avg = fnum(row.last5_avg)
  if (avg == null) return ''
  const avgStr = avg.toFixed(3).replace(/^0\./, '.').replace(/^-0\./, '-.')
  const hr = fnum(row.last5_hr) || 0
  const rbi = fnum(row.last5_rbi) || 0
  // 2026-09-18 (Donovan: "short all the text on the tweets to fit more words").
  // "last 5" -> "L5" on every caller of this helper at once.
  const bits = [`${avgStr} L5`]
  if (hr > 0) bits.push(`${hr} HR`)
  if (rbi > 0) bits.push(`${rbi} RBI`)
  return bits.join(', ')
}

// ── TONIGHT'S BOARD (role-based, text only) ─────────────────────────────────
//
// 2026-09-15, Donovan: "should we post top ten scorer in each category or
// maybe like role based tweets no cards just text" -- one pick per role
// (TOP, HR, HIT, HRR), not ten-deep per category. A ten-per-category dump is
// the exact "database, not a story" complaint the HR Leaders tweet got
// tonight, times four categories, and it also blurs CALLED vs ON THE BOARD
// (the house rule this whole product is built around) into "everyone the
// model scored decently." WATCH is left off -- it is coverage, never a pick
// (lib/verdict.js) -- and CONTACT was never asked for here.
//
// A PICK ALWAYS WEARS ITS OWN MARKET'S SCORE (lib/verdict.js's house rule,
// written for the exact same mistake this would otherwise repeat): TOP and
// HR both settle on a homer, so both rank on hr_score; HIT settles on 1+
// hit, so it ranks on hit_score; HRR settles on 2+ combined H+R+RBI, so it
// ranks on hrr_score. Ranking a HIT-tagged row by hr_score would surface a
// good home-run bet wearing a HIT badge, not the board's actual best 1+ hit
// lean. hit_score/hrr_score were not previously kept by lib/dash/board.js's
// 17-field whitelist -- added there (2026-09-15) specifically so this could
// exist without inventing a number.
const BOARD_ROLE_SCORE = { TOP: 'hr_score', HR: 'hr_score', HIT: 'hit_score', HRR: 'hrr_score' }

export function boardRolePicks(rows) {
  const list = Array.isArray(rows) ? rows : []
  const out = []
  for (const role of ['TOP', 'HR', 'HIT', 'HRR']) {
    const scoreKey = BOARD_ROLE_SCORE[role]
    // TOP and HR are home-run calls, so they sit in the board's own order
    // (board_rank), the order every "#N on the board" is quoted in. HIT and
    // HRR settle on different bars and keep ranking on their own score.
    const byBoard = role === 'TOP' || role === 'HR'
    const best = list
      .filter((r) => txt(r?.player_id) && primaryRole(r) === role && num(r?.[scoreKey]) > 0)
      .sort(byBoard ? boardCompare : (a, b) => num(b?.[scoreKey]) - num(a?.[scoreKey]))[0]
    if (best) {
      out.push({
        role, player_id: String(best.player_id), name: txt(best.name),
        team: txt(best.team) || null, opponent: txt(best.opponent) || null,
        // 2026-09-18 (Donovan: "all the tweet should be full"). The post was
        // four bare names. Everything added here is already on the row the
        // pick was chosen FROM -- the score it was ranked on, the arm it
        // faces, and the L5 line every other post uses -- so this is evidence
        // the board already had and wasn't printing, not a new calculation.
        score: num(best[scoreKey]) != null ? Math.round(num(best[scoreKey]) * 10) / 10 : null,
        rank: num(best.board_rank) > 0 ? Math.round(num(best.board_rank)) : null,
        pitcher: txt(best.pitcher_name) || null,
        last5_avg: best.last5_avg, last5_hr: best.last5_hr,
        last5_rbi: best.last5_rbi, last5_status: best.last5_status,
      })
    }
  }
  return out
}

export function boardRoleText(picks, { day = '', site = '', handle = '' } = {}) {
  if (!Array.isArray(picks) || !picks.length) return ''
  const tail = [site, handle].filter(Boolean).join(' · ') || null
  const fits = (lines) => lines.filter((l) => l != null).join('\n').length <= postLimit()
  // 2026-09-18: two lines per role now -- the call, then the evidence under it
  // -- and the evidence line is dropped first if the budget is tight, so this
  // degrades back to exactly the old four-line post rather than breaking.
  const evidence = (p) => {
    const bits = []
    // TOP / HR wear their place on the board, not a bare score: "TOP score
    // 52" under "HR score 70" read as the top pick being the weaker one.
    if ((p.role === 'TOP' || p.role === 'HR') && p.rank != null) bits.push(`#${p.rank} on the board`)
    else if (p.score != null) bits.push(`${p.role} score ${p.score}`)
    if (p.pitcher) bits.push(`vs ${p.pitcher}`)
    const l5 = l5Line(p)
    if (l5) bits.push(l5)
    return bits.join(' · ')
  }
  const call = (p) => `${p.role}: ${p.name}${p.team ? ` (${p.team})` : ''}${p.opponent ? ` vs ${p.opponent}` : ''}`
  const build = (withEvidence) => {
    const lines = picks.flatMap((p) => {
      const e = withEvidence ? evidence(p) : ''
      return e ? [call(p), e, ''] : [call(p)]
    })
    if (withEvidence && lines[lines.length - 1] === '') lines.pop()
    // Pregame has called nothing yet (Donovan 2026-10-04: CALLED IT only when earned).
    return ['🎯 TONIGHT’S BOARD', '', ...lines, '', 'MOONSHOT · graded in public', tail ? '' : null, tail]
  }
  const rich = build(true)
  const body = fits(rich) ? rich : build(false)
  return body.filter((l) => l != null).join('\n')
}

// GRADING (2026-09-15, Donovan: "make sure its graded"). accountabilityText
// above grades Called Shots off homer_feed, which only ever answers "did he
// hit a homer" -- fine for an HR/TOP-only post, not enough here, since a HIT
// or HRR pick can clear without ever going deep. This needs the same real
// batting line pickCleared() already grades live badges against
// (lib/liveSlate.js: ab, h, hr, tb, r, rbi) -- but for a PAST date, which
// pullLiveSlate() cannot give (it is hardcoded to today/yesterday and cached
// in memory for the live site). boxLinesForDate re-fetches the same MLB
// StatsAPI boxscore shape for one specific finished date instead.
const BOX_SCHED_FIELDS = 'dates,date,games,gamePk,status,abstractGameState'
const BOX_LINE_FIELDS = 'teams,home,away,team,players,person,id,fullName,stats,batting,atBats,hits,homeRuns,totalBases,runs,rbi'

export async function boxLinesForDate(dateIso) {
  const lines = {}
  try {
    const schedUrl = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${dateIso}&fields=${BOX_SCHED_FIELDS}`
    const schedRes = await fetch(schedUrl).catch(() => null)
    if (!schedRes?.ok) return lines
    const sched = await schedRes.json().catch(() => null)
    const games = (sched?.dates || []).flatMap((d) => d.games || [])
      .filter((g) => g?.status?.abstractGameState === 'Final')
    await Promise.all(games.map(async (g) => {
      const box = await fetch(`https://statsapi.mlb.com/api/v1/game/${g.gamePk}/boxscore?fields=${BOX_LINE_FIELDS}`)
        .then((r) => (r.ok ? r.json() : null)).catch(() => null)
      if (!box?.teams) return
      for (const side of ['home', 'away']) {
        Object.values(box.teams[side]?.players || {}).forEach((pl) => {
          const id = pl?.person?.id
          const b = pl?.stats?.batting
          if (!id || !b || b.atBats == null) return
          lines[String(id)] = {
            ab: Number(b.atBats) || 0, h: Number(b.hits) || 0,
            hr: Number(b.homeRuns) || 0, tb: Number(b.totalBases) || 0,
            r: Number(b.runs) || 0, rbi: Number(b.rbi) || 0,
          }
        })
      }
    }))
  } catch { /* fails open below: a missing line grades "not judgeable" (➖), never a false miss */ }
  return lines
}

// (boardRoleResultsText, the graded board post's text, is retired with board_results: lib/posts/receipt.js is the night's grade.)

// ── PAIRS TO WATCH ──────────────────────────────────────────────────────────
//
// hooksFor()'s pair line only ever speaks AFTER a homer -- it names the
// partner of a man who just went deep. This is the pregame mirror Donovan
// asked for: scan the pair-history file for any pair where BOTH men are
// already TOP/HR calls on tonight's board, before either has batted, so
// the account has something to point at before first pitch too.
export function pairsToWatch(rows, pairs, odds, day, limit = 5) {
  const list = Array.isArray(rows) ? rows : []
  const called = new Map()
  for (const r of list) {
    if (!/\b(TOP|HR)\b/.test(txt(r?.game_pick_role).toUpperCase())) continue
    const pid = txt(r?.player_id)
    if (pid) called.set(pid, r)
  }
  // Same board row already carries recent form and tonight's pitcher (used
  // by the Hot Zone / Danger Combos posts) and its own HR price -- none of
  // it reached this card before. Projected here so the card can show each
  // man's own case, not just the two names.
  const project = (r) => {
    const q = hrQuoteFor(odds, r.player_id, r.name, day)
    const blast = fnum(r.recent_blast_rate)
    return {
      player_id: String(r.player_id), name: txt(r.name), team: txt(r.team) || null, opponent: txt(r.opponent) || null,
      hr_score: fnum(r.hr_score), blastPct: blast != null ? Math.round(blast * 1000) / 10 : null,
      pitcher: txt(r.pitcher_name) || null, pitcherTeam: txt(r.pitcher_team) || null,
      over: q?.over ?? null, book: q?.book ?? null,
    }
  }
  const daysChecked = num(pairs?.days_checked)
  const top = Array.isArray(pairs?.top_pairs) ? pairs.top_pairs : []
  const hits = []
  for (const p of top) {
    const ps = Array.isArray(p?.players) ? p.players : []
    if (ps.length !== 2) continue
    const ra = called.get(String(ps[0]?.player_id))
    const rb = called.get(String(ps[1]?.player_id))
    if (!ra || !rb) continue
    const count = num(p?.same_day_hr_count_season)
    if (count < 2) continue
    hits.push({
      a: project(ra),
      b: project(rb),
      count,
      sameGame: num(p?.same_game_hr_count),
      rate: daysChecked > 0 ? Math.round((1000 * count) / daysChecked) / 10 : null,
    })
  }
  hits.sort((x, y) => y.count - x.count)
  return hits.slice(0, limit)
}

export function pairsToWatchText(hits, { day = '', site = '', handle = '' } = {}) {
  if (!Array.isArray(hits) || !hits.length) return ''
  const head = '👥 THE PAIR TRAP'
  const tail = [site, handle].filter(Boolean).join(' · ') || null
  const fits = (lines) => lines.filter((l) => l != null).join('\n').length <= postLimit()
  const blockOf = (h) => [
    `${h.a.name} + ${h.b.name}`,
    '',
    `${h.count} same-day HR games${h.rate != null ? ` (${h.rate}%)` : ''}`,
    'this season.',
    '',
    "Both are on tonight's board.",
  ]
  for (let n = hits.length; n >= 1; n -= 1) {
    const body = [head, '']
    hits.slice(0, n).forEach((h, i) => {
      if (i > 0) body.push('')
      body.push(...blockOf(h))
    })
    body.push('', '👀')
    if (tail) body.push('', tail)
    if (fits(body)) return body.filter((l) => l != null).join('\n')
  }
  return [head, tail].filter((l) => l != null).join('\n')
}

// ── TONIGHT'S LONGEST CALL ───────────────────────────────────────────────────
//
// The single longest-priced TOP/HR call on the board, once it clears the
// same LONGSHOT line (+700) the per-homer post already uses for its own 🎯
// glyph -- one definition of "longshot" for the whole account, not a second
// number invented here.
export function longshotPick(rows, odds, day) {
  const list = (Array.isArray(rows) ? rows : [])
    .filter((r) => /\b(TOP|HR)\b/.test(txt(r?.game_pick_role).toUpperCase()) && txt(r?.player_id))
  let best = null
  for (const r of list) {
    const q = hrQuoteFor(odds, r.player_id, r.name, day)
    const over = Number(q?.over)
    if (!Number.isFinite(over) || over < LONGSHOT || !q?.book) continue
    if (!best || over > best.over) {
      const pct1 = (v) => (v != null ? Math.round(v * 1000) / 10 : null)
      best = {
        player_id: String(r.player_id), name: txt(r.name), team: txt(r.team) || null,
        opponent: txt(r.opponent) || null, role: primaryRole(r), hr_score: fnum(r.hr_score),
        over, book: q.book,
        // Same board row the Hot Zone / Danger Combos posts already read, plus
        // the pitcher HR/9 and batter barrel/hard-hit rates statsFrom() reads
        // for the per-homer card -- none of it reached this pick before.
        blastPct: pct1(fnum(r.recent_blast_rate)),
        barrelPct: pct1(fnum(r.recent_barrel_rate)),
        hardHitPct: pct1(fnum(r.recent_hard_hit_rate)),
        pitcherHr9: fnum(r.pitcher_hr9),
        pitcher: txt(r.pitcher_name) || null, pitcherTeam: txt(r.pitcher_team) || null,
      }
    }
  }
  return best
}

export function longshotText(pick, { day = '', site = '', handle = '' } = {}) {
  if (!pick) return ''
  const tail = [site, handle].filter(Boolean).join(' · ') || null
  const lines = [
    '🚀 THE MOONSHOT',
    '',
    `${pick.name} ${fmtOdds(pick.over)}`,
    `${pick.team || '???'}${pick.opponent ? ` vs ${pick.opponent}` : ''}`,
    '',
    "Longest price on tonight's board.",
    '',
    '🌙',
  ]
  if (tail) lines.push('', tail)
  return lines.join('\n')
}

// ── THE NUMEROLOGY MOMENT ────────────────────────────────────────────────
//
// Donovan, 2026-09-06: he wants all three coincidence types watched for,
// but "rare and special" as a posting cadence — so this checks EVERY tick,
// against every homer the night has produced so far, but the account gets
// at most one numerology post a night (claimed the same way as pregame/
// pairswatch/longshot), and only for the rarest thing that actually
// happened. Priority, rarest first:
//   1. TRIFECTA  one man's jersey, season HR count, and birthday all reduce
//      to the same digit root, the night he went deep.
//   2. JERSEY MATCH  two different men wearing the same number BOTH went
//      deep tonight — the one axis the 4,238-night sweep found a real
//      signal on (1.71x, z≈+3.65 over 33 nights; still small-sample, but
//      real enough to name).
//   3. CLUSTER  five or more of tonight's homers share a jersey digit root
//      — the loosest match, so it needs the highest bar to stay rare.
// No hedge in the copy below — Donovan's explicit call: "people like
// numerology, don't put a disclaimer on it." This is the only place
// standalone numerology posts from; the birthday/jersey coincidence added
// to hooksFor() above stays inside a homer's own tweet and is never also
// promoted here, so the two never compete for the same night.
//   1b. GEMATRIA (numerology step 7, 2026-09-27)  homer hitters whose FULL
//      name equals tonight's full or short date number (9/29/2026 = 48,
//      9/29/26 = 64) in one of the 4 base ciphers. Exact, never a root.
//      Needs `day` (the slate's own date); without it the tier sits out.
//      ONE such hitter is NOT rare: measured on 2026's 1,113 homers (37
//      nights), 6.9% of hitters match -- about 2 a night by chance, and a
//      one-hitter rule would have posted on 31 of 37 nights. (Only the two
//      reduction ciphers ever match; ordinal names run 100-200, date numbers
//      40-70.) So the tier needs as many matching hitters as chance reaches
//      on under 1 night in 20 -- gematriaBar(): 6+ of 30 hitters, 2+ of 5.
//      In October (few games) that is 2-3.
export const GEMATRIA_RATE = 0.069
/** The fewest date-matching hitters, out of `n`, that chance alone reaches on under 5% of nights (never fewer than 2). */
export function gematriaBar(n, p = GEMATRIA_RATE) {
  let tail = 1; let pk = (1 - p) ** n
  for (let k = 0; k <= n; k++) {
    if (k >= 2 && tail < 0.05) return k
    tail -= pk
    pk = pk * ((n - k) / (k + 1)) * (p / (1 - p))
  }
  return Infinity
}
export function numerologyMoment(rows, { day = '' } = {}) {
  const all = (Array.isArray(rows) ? rows : [])
    .map((r) => {
      const jersey = fnum(r?.stats?.jersey)
      const seasonHr = fnum(r?.stats?.season_hr)
      // Regular-season homers only: an October homer is not the season's nth.
      const regular = r?.stats?.postseason === undefined || r?.stats?.postseason === false
      const nth = regular && seasonHr != null ? seasonHr + num(r?.hr_n) : null
      return {
        player_id: txt(r?.player_id), name: txt(r?.name), team: txt(r?.team) || null,
        opponent: txt(r?.opponent) || null, role: txt(r?.role) || null,
        jersey, nth, dayRoot: dayRootOf(r?.stats?.birthDate),
      }
    })
  const list = all.filter((r) => r.jersey != null && r.nth != null && r.nth > 0)

  // Two homers on the night before anything is said. The jersey tiers need
  // two with a jersey and a season number; GEMATRIA needs only names, so it
  // also runs in October (no season number then).
  if (all.length < 2) return null

  for (const r of list.length >= 2 ? list : []) {
    if (r.dayRoot == null) continue
    const root = digitRoot(r.jersey)
    if (root === digitRoot(r.nth) && root === r.dayRoot) return { tier: 'trifecta', root, players: [r] }
  }

  const dn = dateNumbers(day)
  const written = dateWritten(day)
  if (dn && written) {
    const seen = new Set()
    const hitters = []
    for (const r of all) {
      if (!r.name || seen.has(r.player_id)) continue
      seen.add(r.player_id)
      for (const which of ['full', 'short']) {
        const hit = fullNameEquals(r.name, dn[which])
        if (hit) { hitters.push({ ...r, gem: { value: hit.value, cipherLabel: hit.label, dateText: written[which] } }); break }
      }
    }
    if (hitters.length && hitters.length >= gematriaBar(seen.size)) {
      const top = hitters[0].gem
      return { tier: 'gematria', root: top.value, value: top.value, cipherLabel: top.cipherLabel, dateText: top.dateText, players: hitters }
    }
  }

  if (list.length < 2) return null

  const byJersey = new Map()
  for (const r of list) {
    if (!byJersey.has(r.jersey)) byJersey.set(r.jersey, new Map())
    byJersey.get(r.jersey).set(r.player_id, r)
  }
  for (const [jersey, players] of byJersey) {
    if (players.size >= 2) return { tier: 'jersey', jersey, players: [...players.values()] }
  }

  const byRoot = new Map()
  for (const r of list) {
    const root = digitRoot(r.jersey)
    if (!byRoot.has(root)) byRoot.set(root, new Map())
    byRoot.get(root).set(r.player_id, r)
  }
  let best = null
  for (const [root, players] of byRoot) {
    if (players.size >= 5 && (!best || players.size > best.players.length)) {
      best = { tier: 'cluster', root, players: [...players.values()] }
    }
  }
  return best
}

// "Jazz Chisholm Jr." -> "Chisholm": the last word that isn't a suffix.
const lastNameOf = (name) => {
  const w = txt(name).split(/\s+/).filter(Boolean)
  while (w.length > 1 && /^(jr|sr|ii|iii|iv|v)\.?$/i.test(w.at(-1))) w.pop()
  return w.at(-1) || txt(name)
}

export function numerologyText(moment,{ day = '', site = '', handle = '' } = {}) {
  if (!moment) return ''
  const tail = [site, handle].filter(Boolean).join(' · ') || null
  const disclosure = 'Pattern watching, not prediction.'
  let lines
  if (moment.tier === 'trifecta') {
    const p = moment.players[0]
    lines = [
      '🔢 NUMEROLOGY', '',
      'A rare one tonight.', '',
      `${p.name} went deep wearing #${p.jersey}.`, '',
      'Jersey • season HR • birthday', 'all reduce to the same number.', '',
      disclosure,
    ]
  } else if (moment.tier === 'gematria') {
    // One line per cipher, last names: "Full Reduction: Sogard 47 · Chourio 63".
    // Names drop off the end (as "+N") until the post fits 270 with its tail.
    const dates = [...new Map(moment.players.map((p) => [p.gem.dateText, p.gem.value])).entries()].map(([d, v]) => `${d} = ${v}`)
    const build = (shownN) => {
      const byCipher = new Map()
      for (const p of moment.players.slice(0, shownN)) {
        if (!byCipher.has(p.gem.cipherLabel)) byCipher.set(p.gem.cipherLabel, [])
        byCipher.get(p.gem.cipherLabel).push(`${lastNameOf(p.name)} ${p.gem.value}`)
      }
      const rest = moment.players.length - shownN
      return [
        '🔢 NUMEROLOGY', '',
        `Tonight is ${dates.join(' and ')}.`, '',
        `${moment.players.length} men went deep whose names add up to the date:`,
        ...[...byCipher].map(([c, names]) => `${c}: ${names.join(' · ')}`), ...(rest > 0 ? [`+${rest} more`] : []), '',
        disclosure,
      ]
    }
    let n = moment.players.length
    while (n > 1 && [...build(n), ...(tail ? ['', tail] : [])].join('\n').length > 270) n -= 1
    lines = build(n)
  } else if (moment.tier === 'jersey') {
    lines = [
      '🔢 NUMEROLOGY', '',
      'Same number. Same night.', '',
      ...moment.players.map((p) => `${p.name} #${p.jersey}`), '',
      'Both went deep.', '',
      disclosure,
    ]
  } else {
    const shown = moment.players.slice(0, 4).map((p) => p.name)
    const rest = moment.players.length - shown.length
    lines = [
      '🔢 NUMEROLOGY', '',
      `${moment.players.length} homers.`, 'One jersey-number pattern.', '',
      ...shown, ...(rest > 0 ? [`+${rest}`] : []), '',
      disclosure,
    ]
  }
  if (tail) lines.push('', tail)
  return lines.join('\n')
}

// (weeklyText / monthlyText are retired: the weekly and monthly receipts are lib/posts/receipt.js renderPeriod.)

// ── ENGAGEMENT TWEETS (2026-09-13, Section 8 of Donovan's rewrite) ─────────
// Three of the five new kinds from that spec. The other two are deliberately
// NOT here: Model vs Market stays on hold per the original brand plan (no
// real calibrated probability exists to show), and Weekly Bot Report needs
// the NFL touchdown feed live before an "MLB + NFL combined" post means
// anything real.

// (accountabilityText is retired: THE NIGHT RECEIPT, lib/posts/receipt.js, grades the night and shows the misses.)

/**
 * COMMUNITY PICK — a static invite, no data dependency. "How the board
 * compares" is left as a soft callback for a later post, not a live reply
 * tally -- reading replies is its own (unbuilt) piece of infrastructure.
 */
export function communityPickText({ site = '', handle = '' } = {}) {
  const tail = [site, handle].filter(Boolean).join(' · ') || null
  const lines = [
    "WHO'S YOUR HR CALL? 👀",
    '',
    'Drop one name before first pitch.',
    '',
    "We'll see how the board compares.",
  ]
  if (tail) lines.push('', tail)
  return lines.join('\n')
}

/**
 * BOT VS THE PEOPLE — the tweet TEXT only. The candidate names are a native
 * X poll (see postToX's `poll` option in lib/dash/xPost.js), not typed out
 * as "A) / B) / C)" in the body -- X already renders poll options as
 * tappable buttons, so repeating them as text would just be noise.
 */
export function botPollText({ site = '', handle = '' } = {}) {
  const tail = [site, handle].filter(Boolean).join(' · ') || null
  const lines = ['MOONSHOT VS THE PEOPLE', '', 'Who goes deep tonight?']
  if (tail) lines.push('', tail)
  return lines.join('\n')
}

/** Which side of the game this batter is on, from the live lineups. */
function sideOf(g, id) {
  for (const side of ['home', 'away']) {
    if ((g?.lineup?.[side] || []).some((r) => txt(r?.id) === id)) return side
  }
  return null
}

/**
 * Every home run in the snapshot, one record per homer, as rows for the
 * homer_feed table. Stateless: a man with two homers tonight yields hr_n 1 and
 * hr_n 2 every tick, and the table's primary key decides which are new.
 */
export function homersFrom(snap, day, board, odds = null) {
  if (!snap) return []
  const games = Array.isArray(snap.games) ? snap.games : []
  const lines = snap.lines && typeof snap.lines === 'object' ? snap.lines : {}
  const gameOf = new Map(games.map((g) => [Number(g.pk), g]))
  const out = []

  for (const [id, line] of Object.entries(lines)) {
    const hr = num(line?.hr)
    if (hr < 1) continue
    const g = gameOf.get(Number(line?.pk))
    const b = board?.get(String(id)) || null
    // 2026-09-06 (Donovan: a pinch-hit homer posted with no team/opponent).
    // `line.side`/`line.teamId` come straight off the boxscore row this
    // batter's own stats were read from (see liveSlate.js) -- true for
    // anyone with a real at-bat, starter or substitute. sideOf() falls back
    // to the posted STARTING lineup, which a pinch hitter is never in; kept
    // only for a line that predates this field.
    const side = line?.side || sideOf(g, String(id))
    const myId = line?.teamId ?? (side ? g?.[`${side}Id`] : null)
    const theirId = side ? g?.[side === 'home' ? 'awayId' : 'homeId'] : null
    const team = b?.team || TEAM_ABBR[Number(myId)] || null
    const opponent = b?.opponent || TEAM_ABBR[Number(theirId)] || null
    const quote = hrQuoteFor(odds, id, line?.name, day)

    for (let n = 1; n <= hr; n += 1) {
      out.push({
        day,
        player_id: String(id),
        hr_n: n,
        name: txt(line?.name) || `#${id}`,
        team,
        opponent,
        game_pk: line?.pk != null ? String(line.pk) : null,
        // The inning is only right for the LATEST homer; an earlier one by
        // the same man was seen on an earlier tick and already has its row.
        inning: n === hr ? inningWord(g) || null : null,
        role: b?.role || null,
        on_board: Boolean(b),
        hr_score: b?.hrScore ?? null,
        board_rank: b?.rank ?? null,
        home: side === 'home',
        odds_over: quote?.over ?? null,
        odds_book: quote?.book ?? null,
        // board_of rides in stats (no new column): the n the rank is out of.
        stats: b ? { ...(b.stats || {}), board_of: b.of ?? null } : null,
        hooks: [],
        // Not a column. Carried so the post can say "TOP/HR" where the row
        // stores only TOP.
        _roles: b?.roles || '',
      })
    }
  }
  return out
}

// ── THE POST ────────────────────────────────────────────────────────────────
//
// One shape, four lines, under 200 characters. The star is the whole message:
// a reader who follows the account for a week learns the ratio of 🤖 to plain
// without being told, which is the only track record that persuades anybody.
//
// The price rides on its own line when there is one, book named, and is
// simply absent when there is not — never a price without a book.

const ROLE_WORD = {
  TOP: 'TOP pick', TOP15: 'Top 15', HR: 'HR pick', HIT: 'HIT pick',
  HRR: 'HRR pick', CONTACT: 'CONTACT pick', TB: 'CONTACT pick', WATCH: 'HR Watch',
}

export function roleWord(role) {
  return ROLE_WORD[txt(role).toUpperCase()] || (role ? `${role} pick` : '')
}

// The same call in plain words, for the X post text only (2026-09-28,
// postseason plan step 10: no bare "HRR" / "CONTACT" on first contact). The
// cards and /called keep roleWord -- their badges are sized for it.
const ROLE_PLAIN = {
  TOP: 'TOP pick (1+ home run)', TOP15: 'Top 15 for a home run', HR: 'home-run pick (1+ HR)', HIT: 'hit pick (1+ hit)',
  HRR: 'hits + runs + RBI pick (2 or more)', CONTACT: 'total-bases pick (2 or more)', TB: 'total-bases pick (2 or more)', WATCH: 'on the home-run watch list',
}
export function plainRoleWord(role) {
  return ROLE_PLAIN[txt(role).toUpperCase()] || roleWord(role)
}

export function matchupWord(ev) {
  const t = ev?.team || '???'
  const o = ev?.opponent || '???'
  return ev?.home ? `${o} @ ${t}` : `${t} @ ${o}`
}

// "0.225" → ".225"; "0.058" → ".058". Never called on a null iso.
const fmtIso = (iso) => `.${String(Math.round(Math.abs(iso) * 1000)).padStart(3, '0')}`

// Real numbers only: a row missing season_hr/season_iso keeps a flat line
// rather than fabricating a read on him.
const QUIET_ISO = 0.12
const POP_ISO = 0.19

/**
 * The text of one post.
 *
 * Rewritten 2026-09-13 (Donovan's "sports media, not backend output" pass):
 * headline, blank line, main event, blank line, a short data block, blank
 * line, one closing thought. Status language is CALLED / ON THE BOARD /
 * NOT ON THE BOARD throughout -- never "on the bot." Sportsbook name is
 * dropped from the tweet (still on the card); price alone rides the data
 * line when there is one.
 *
 * @param ev       a homer row from homersFrom()
 * @param opts     { site, handle } — the site URL for the link line and the
 *                 account to credit; both optional and both omitted when empty.
 */
export function postText(ev, { site = '', handle = '' } = {}) {
  const tail = [site, handle].filter(Boolean).join(' · ') || null
  const name = txt(ev?.name) || 'Unknown'
  const nth = num(ev?.hr_n) > 1 ? ` (#${ev.hr_n} tonight)` : ''
  // THE HEADER FROM THE CALL STATUS (2026-09-27, X-BETTER step 1; brand rule
  // §14): every alert used to open "🤖 CALLED IT" -- #260 on the board and
  // "Not on the Moonshot board" included. Only a CALLED homer says it now;
  // everything else leads with the homer itself.
  const called = callStatus(ev) === 'called'
  // A homer by a HIT / HRR / CONTACT pick is still CALLED (his market's call,
  // Donovan's 0c rule) but the post names that market rather than implying the
  // call was a home run (Donovan 2026-10-04).
  const homerRole = ['TOP', 'HR'].includes(String(ev?.role || '').toUpperCase())
  const header = called ? (homerRole ? '🤖 CALLED IT' : `🤖 CALLED IT · ${String(ev.role).toUpperCase()} PICK`) : null
  const lines = called ? [header, '', `${name.toUpperCase()} GOES DEEP.${nth}`] : [`💥 ${name.toUpperCase()} GOES DEEP.${nth}`]

  // 2026-09-24: `if (ev?.role)` printed "The call is in." for a WATCH-only
  // hitter. Only a designated call (lib/callStatus.js) gets the call line.
  if (called) {
    const where = [matchupWord(ev), ev?.inning].filter(Boolean).join(' · ')
    if (where) lines.push('', where)
    const rank = fnum(ev?.board_rank)
    const price = ev?.odds_over && ev?.odds_book ? ` · ${fmtOdds(ev.odds_over)}` : ''
    lines.push('', rank ? `#${rank} on the Moonshot board` : 'On the Moonshot board', `${plainRoleWord(ev.role)}${price}`)
    if (homerRole) lines.push('', 'The call is in.')
  } else if (callStatus(ev) === 'board') {
    const rank = fnum(ev?.board_rank)
    const hr = fnum(ev?.stats?.season_hr)
    const iso = fnum(ev?.stats?.season_iso)
    lines.push('', rank ? `#${rank} on the Moonshot board` : 'On the Moonshot board')
    if (hr == null || iso == null) {
      lines.push('', 'Not a top call tonight.')
    } else {
      lines.push('', `${hr} HR · ${fmtIso(iso)} ISO`)
      if (iso >= POP_ISO) lines.push('', 'Not a top call tonight.')
      else if (iso < QUIET_ISO) lines.push('', 'Not every homer is a call.')
      else lines.push('', 'Right in the mix.', 'Not a top call.')
    }
  } else {
    lines.push('', 'Not on the Moonshot board.')
  }

  // Hooks (streaks, pair mentions, etc.) ride between the data block and the
  // tail, as many as fit -- same budget rule as before, just line-stacked
  // instead of comma-joined. X counts a URL as 23 characters whatever its
  // length; the budget below is conservative on purpose.
  const LIMIT = postLimit()
  const lenOf = (arr) => arr.filter((l) => l != null).join('\n').length
  const hooks = Array.isArray(ev?.hooks) ? ev.hooks : []
  const kept = []
  for (const h of hooks) {
    if (lenOf([...lines, '', ...kept, h, tail ? '' : null, tail]) <= LIMIT) kept.push(h)
  }
  for (const h of kept) lines.push('', h)
  if (tail) lines.push('', tail)
  return lines.filter((l) => l != null).join('\n')
}

/**
 * The homer as a DASH Discord card (lib/dash/discordCard.js). The X text is unchanged. The feed posts every homer, so the card
 * carries all three statuses (the word from lib/callStatus). `extra` = the lines that rode under the text (called-at, REACHED, 2+ club).
 */
export function homerEmbed(ev, { extra = [], at = null } = {}) {
  const status = callStatus(ev)
  const name = txt(ev?.name) || 'Unknown'
  const nth = num(ev?.hr_n) > 1 ? ` (#${ev.hr_n} tonight)` : ''
  const rank = fnum(ev?.board_rank)
  const brand = BRAND.mlb.name
  const price = ev?.odds_over && ev?.odds_book ? ` \u00B7 ${fmtOdds(ev.odds_over)}` : ''
  const call = status === 'called' ? [rank ? `#${rank} on the ${brand} board` : `On the ${brand} board`, `${plainRoleWord(ev.role)}${price}`]
    : status === 'board' ? [rank ? `#${rank} on the ${brand} board` : `On the ${brand} board`] : [`Not on the ${brand} board`]
  const hr = fnum(ev?.stats?.season_hr)
  const iso = fnum(ev?.stats?.season_iso)
  const why = status === 'called' || hr == null || iso == null ? [] : [`${hr} HR \u00B7 ${fmtIso(iso)} ISO`]
  return buildCard({
    sport: 'mlb',
    url: playerUrl('mlb', ev?.player_id),
    title: `${status === 'called' ? '\u{1F6A8}' : BRAND.mlb.icon} ${name.toUpperCase()} GOES DEEP${nth}${ev?.team && ev?.opponent ? ` \u00B7 ${ev.team} vs ${ev.opponent}` : ''}`,
    status,
    description: POST_WORDS.mlb.market,
    sections: [
      { name: status === 'called' ? 'THE CALL' : 'THE BOARD', lines: call },
      { name: 'THE HOMER', lines: [[matchupWord(ev), ev?.inning].filter(Boolean).join(' \u00B7 ')].filter(Boolean) },
      { name: 'WHY', lines: why },
      { name: 'THE RECORD', lines: (extra || []).filter(Boolean) },
    ],
    at: at || Date.now(),
  })
}

/**
 * Tonight's scoreboard from the feed rows, for the page and the nightly recap.
 * "Called" counts a row with a role — the pick / watch / Top 15 definition.
 */
export function captureFrom(rows) {
  const list = Array.isArray(rows) ? rows : []
  const total = list.length
  // 2026-09-24: one definition, lib/callStatus.js. WATCH/CONTACT/TOP15 are
  // ON THE BOARD, not calls -- this used to count any role as called.
  const called = list.filter((r) => callStatus(r) === 'called').length
  const rated = list.filter((r) => callStatus(r) === 'board').length
  const off = total - called - rated
  const byRole = {}
  for (const r of list) if (isCalledRole(r?.role)) byRole[r.role] = (byRole[r.role] || 0) + 1
  return {
    total, called, rated, off, byRole,
    pct: total ? Math.round((100 * called) / total) : null,
    // 2026-09-24: the coverage number -- called OR rated, i.e. anyone the
    // board had before the game. /called leads football with it and shows
    // it beside the call rate for baseball.
    onBoard: called + rated,
    boardPct: total ? Math.round((100 * (called + rated)) / total) : null,
  }
}
export { normName }
