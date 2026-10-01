// 🚨 LAMP GOAL FEED — the live goal, hockey's homer_feed (2026-09-28,
// .claude-notes/BATCH-LAMP-GOALS-PLAN.md). Pure functions over the reduced
// /score/<date> day (lib/nhl/reduce.js) and the stored rows: which goals
// count, which stored row a goal in this read is, what a row says in a push
// and in the CALLED IT post. No fetch and no database import here -- the
// routes do the I/O and pass `db` to the one read helper at the bottom, so
// every rule below runs under scripts/check-lamp-goals.mjs with a fixture.
//
// THE KEY. The league's score feed carries no goal id, so the row key is
// (game_id, player_id, goal_n). goal_n is NOT recomputed from order on every
// read: a goal in this read is matched to one of HIS standing rows in the
// same period within MATCH_SECONDS of its clock time (the league nudges a
// goal time by a second or two after review). A goal with no match is new
// and gets the next goal_n he has ever had in this game, overturned rows
// included -- so a confirmed, pushed row can never be inherited by another
// goal (a scoring change A→B, or A's goal waved off and A scoring later).
//
// THE LABEL comes from lamp_goal_log at the lock, and only from there
// (CLAUDE.md: never re-derived). A game with log rows is a locked game: a
// scorer with a row wears its status; a scorer with none was not on the
// board ('off'). A game with no log rows never locked: status null, and
// nothing anywhere says CALLED or NOT ON THE BOARD for it.
import { dateGematriaLine } from '../numerology/gematria'

export const CONFIRM_MS = 90 * 1000          // a later read this long after first sight still has it
export const POST_AFTER_MS = 3 * 60 * 1000   // the post waits this long after confirmation (challenges)
export const MATCH_SECONDS = 60
// The first game date the feed can have rows for: the pages skip the read
// for any day before it.
export const FEED_START = '2026-09-28'
// A final game stays on the tick's list this long after its puck drop, so
// the last goals confirm (or come off) and the CALLED IT posts go out. A
// game's end time is not on the feed; 4.5 h covers a regulation game plus
// OT, the shootout and the final read.
export const FINAL_WINDOW_MS = 4.5 * 3600 * 1000

const txt = (v) => String(v == null ? '' : v).trim()
const secs = (t) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(txt(t))
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

/** The goals that count, from one reduced game: shootout goals are not goals
 *  (the same rule as the model's grade), and a goal needs a scorer. */
export function countedGoals(game) {
  return (game?.goals || []).filter((g) => txt(g.periodType).toUpperCase() !== 'SO' && g.scorer?.id)
}

/**
 * Does this read agree with itself? The goal list must add up to the score
 * (a final decided in a shootout carries one extra point for the winner).
 * A read that doesn't -- the feed mid-update -- is never used to say a goal
 * came off the board.
 */
export function feedConsistent(game) {
  const a = game?.away?.score
  const h = game?.home?.score
  if (a == null || h == null) return false
  const so = game.state === 'final' && txt(game.outcome).toUpperCase() === 'SO' ? 1 : 0
  return countedGoals(game).length === a + h - so
}

/** Is this game on the tick's list right now? */
export function gameActive(game, now = Date.now()) {
  if (game?.scheduleState && game.scheduleState !== 'OK') return false
  if (game?.state === 'live') return true
  if (game?.state !== 'final') return false
  const start = Date.parse(game.startUtc || '')
  return Number.isFinite(start) && now - start <= FINAL_WINDOW_MS
}

/**
 * One read of one game against the rows already stored for it.
 * @returns {{ matched: {row, goal}[], fresh: {goal, goal_n}[], missing: object[] }}
 *   matched  a standing row and the goal in this read that is it
 *   fresh    a goal no standing row covers, with the goal_n it gets
 *   missing  standing rows this read does not have (overturned, if the read
 *            is consistent -- the caller checks feedConsistent)
 */
export function matchGame(game, rows = []) {
  const standing = rows.filter((r) => !r.overturned_at)
  const used = new Set()
  const next = new Map()
  for (const r of rows) {
    const pid = String(r.player_id)
    next.set(pid, Math.max(next.get(pid) || 0, Number(r.goal_n) || 0))
  }
  const matched = []
  const fresh = []
  for (const goal of countedGoals(game)) {
    const pid = String(goal.scorer.id)
    const t = secs(goal.time)
    let best = null
    let bestD = Infinity
    for (const r of standing) {
      if (used.has(r) || String(r.player_id) !== pid || Number(r.period) !== Number(goal.period)) continue
      const rt = secs(r.time_in_period)
      const d = rt == null || t == null ? Infinity : Math.abs(rt - t)
      if (d <= MATCH_SECONDS && d < bestD) { best = r; bestD = d }
    }
    if (best) { used.add(best); matched.push({ row: best, goal }) }
    else {
      const n = (next.get(pid) || 0) + 1
      next.set(pid, n)
      fresh.push({ goal, goal_n: n })
    }
  }
  return { matched, fresh, missing: standing.filter((r) => !used.has(r)) }
}

/**
 * The lock, per game: Map<game_id, Map<player_id, {status, rank, score}>>
 * from lamp_goal_log rows. A game absent from the map never locked.
 */
export function locksFrom(logRows = []) {
  const out = new Map()
  for (const r of logRows) {
    const g = String(r.game_id)
    if (!out.has(g)) out.set(g, new Map())
    out.get(g).set(String(r.player_id), { status: r.status, rank: r.rank_in_game ?? null, score: r.score ?? null })
  }
  return out
}

/** The label a scorer wears: his lock row, 'off' in a locked game he was not
 *  on, or null when the game never locked. */
export function labelFor(locks, gameId, playerId) {
  const game = locks.get(String(gameId))
  if (!game) return null
  return game.get(String(playerId)) || { status: 'off', rank: null, score: null }
}

/** A new lamp_goal_feed row: the goal's facts and its label, frozen. */
export function rowFrom(game, goal, goal_n, label, modelVersion) {
  const team = txt(goal.team)
  const opp = team === game.away?.abbrev ? game.home?.abbrev : team === game.home?.abbrev ? game.away?.abbrev : null
  const full = [txt(goal.scorer.first), txt(goal.scorer.last)].filter(Boolean).join(' ') || txt(goal.scorer.name)
  return {
    game_id: Number(game.id), player_id: Number(goal.scorer.id), goal_n,
    day: game.date, season: game.season, game_type: game.gameType,
    period: goal.period, period_type: txt(goal.periodType).toUpperCase() || 'REG', time_in_period: txt(goal.time) || null,
    strength: txt(goal.strength).toLowerCase() || 'ev', empty_net: txt(goal.modifier).toLowerCase() === 'empty-net',
    team: team || null, opp: opp || null, name: full,
    season_goals: goal.scorer.goalsToDate ?? null,
    assists: (goal.assists || []).map((a) => ({ id: a.id, name: a.name, assistsToDate: a.assistsToDate ?? null })),
    score_after: goal.awayScore != null && goal.homeScore != null ? `${game.away.abbrev} ${goal.awayScore} · ${game.home.abbrev} ${goal.homeScore}` : null,
    clip_url: goal.clip || null,
    status: label ? label.status : null,
    rank_in_game: label ? label.rank : null,
    lamp_score: label && label.score != null ? Math.round(Number(label.score)) : null,
    model_version: label ? modelVersion : null,
  }
}

/** Standing rows of his in this game, in game order. */
function hisRows(row, rows) {
  return rows
    .filter((r) => !r.overturned_at && String(r.game_id) === String(row.game_id) && String(r.player_id) === String(row.player_id))
    .sort((a, b) => (Number(a.period) - Number(b.period)) || ((secs(a.time_in_period) ?? 0) - (secs(b.time_in_period) ?? 0)))
}
/** "His 2nd tonight": this goal's place among his standing goals in the game
 *  (goal_n is a key, and can skip a number after an overturn). */
export function nthTonight(row, rows) {
  const i = hisRows(row, rows).findIndex((r) => Number(r.goal_n) === Number(row.goal_n))
  return i < 0 ? 1 : i + 1
}

// ── words ───────────────────────────────────────────────────────────────────

export const ordinal = (k) => `${k}${[11, 12, 13].includes(k % 100) ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[k % 10] || 'th')}`
export function lastNameOf(full) {
  const parts = txt(full).split(/\s+/).filter(Boolean)
  return parts.length > 1 ? parts.slice(1).join(' ') : (parts[0] || 'He')
}
/** "2nd" / "OT" / "2OT" (short) or "2nd period" (long). */
export function periodWord(row, { long = false } = {}) {
  const n = Number(row.period) || 0
  if (txt(row.period_type).toUpperCase() === 'OT') { const k = n - 3; return k > 1 ? `${k}OT` : 'OT' }
  const o = ordinal(n)
  return long ? `${o} period` : o
}
/** "PP goal" / "SH goal" / "EN goal" / "Even strength". */
export function strengthWord(row) {
  if (row.empty_net) return 'EN goal'
  const s = txt(row.strength).toLowerCase()
  return s === 'pp' ? 'PP goal' : s === 'sh' ? 'SH goal' : 'Even strength'
}
/** The line that carries the lock's label, or null when the game never locked. */
export function labelLine(row) {
  if (row.status === 'called') return `CALLED · the top skater on his team on the LAMP board`
  if (row.status === 'board') return row.rank_in_game ? `#${row.rank_in_game} on the LAMP board` : 'On the LAMP board'
  if (row.status === 'off') return "Not on tonight's LAMP board"
  return null
}

/** The push: 🚨 MAKAR SCORES / CALLED · top 3… / PP goal · 2nd · his 12th. */
export function pushText(row, rows = [row]) {
  const nth = nthTonight(row, rows)
  const last = lastNameOf(row.name).toUpperCase()
  const facts = [strengthWord(row), periodWord(row), row.season_goals ? `his ${ordinal(Number(row.season_goals))}` : null, nth > 1 ? `${ordinal(nth)} tonight` : null].filter(Boolean).join(' · ')
  return {
    title: `🚨 ${last} SCORES`,
    body: [labelLine(row), facts].filter(Boolean).join('\n'),
    short: `${lastNameOf(row.name)}${nth > 1 ? ` (${nth})` : ''}`,
  }
}

/** The CALLED IT post (X). CALLED goals only -- the caller checks. No link. */
export function postText(row, rows = [row], { multiLine = null } = {}) {
  const nth = nthTonight(row, rows)
  const lines = ['🤖 CALLED IT', '', `${txt(row.name).toUpperCase()} SCORES.${nth > 1 ? ` (His ${ordinal(nth)} tonight)` : ''}`, '']
  lines.push('The top skater on his team on the LAMP board')
  lines.push([row.lamp_score != null ? `LAMP score ${row.lamp_score}` : null, `${strengthWord(row)}, ${periodWord(row, { long: true })}`].filter(Boolean).join(' · '))
  // 🔢 GEMATRIA (numerology step 7): his full name equals tonight's date
  // number (the game's own date), exactly. One line, only when it hits.
  const gem = dateGematriaLine(row.name, row.day)
  if (gem) lines.push('', gem)
  lines.push('', 'Called before puck drop.')
  if (multiLine) lines.push('', multiLine)
  return lines.join('\n')
}

// ── the one read the pages share ────────────────────────────────────────────

/**
 * Labels for the goals the pages already show, from the standing rows:
 * Map<"game|player|period", [{ t, status, rank }]>. Keyed on the goal's own
 * facts (not goal_n) and matched within MATCH_SECONDS, so the page's list
 * from the league feed finds its row without re-running the matcher, even
 * after a goal time is nudged. Service-role client; a failed read is an
 * empty map (no chips, never a wrong one).
 */
export async function goalLabels(db, gameIds) {
  const ids = [...new Set((gameIds || []).map(Number).filter(Boolean))]
  if (!db || !ids.length) return new Map()
  const { data, error } = await db.from('lamp_goal_feed')
    .select('game_id, player_id, period, time_in_period, status, rank_in_game')
    .in('game_id', ids).is('overturned_at', null).not('status', 'is', null)
  if (error) { console.error(`[lamp goals] labels: ${error.message}`); return new Map() }
  const out = new Map()
  for (const r of data || []) {
    const k = `${r.game_id}|${r.player_id}|${r.period}`
    if (!out.has(k)) out.set(k, [])
    out.get(k).push({ t: secs(r.time_in_period), status: r.status, rank: r.rank_in_game })
  }
  return out
}

/** Put `label` (called / board / off) on each goal of each game. */
export function labelGoals(games, labels) {
  if (!labels?.size) return games
  return games.map((g) => ({
    ...g,
    goals: (g.goals || []).map((x) => {
      const t = secs(x.time)
      const l = (labels.get(`${g.id}|${x.scorer?.id}|${x.period}`) || [])
        .find((c) => c.t != null && t != null && Math.abs(c.t - t) <= MATCH_SECONDS)
      return l ? { ...x, label: l.status, labelRank: l.rank } : x
    }),
  }))
}

// ── THE TICK ────────────────────────────────────────────────────────────────

/**
 * One pass over the active games. All I/O goes through `store` (Supabase in
 * app/api/lamp/goals/tick, an in-memory table in the check script) and
 * `poster` (X), so the whole rule set is testable offline.
 *
 * store: existing(gameIds) → rows · locks(gameIds) → lamp_goal_log rows ·
 *   insert(rows) → inserted rows · confirm(row, at) · overturn(row, at) ·
 *   upsertMulti(rows) · deleteMulti(row) · countMulti(season, playerId) ·
 *   claimPost(row) → bool · finishPost(row, id|null)
 * poster: null (posting off) or { post(text) → { ok, id, status, error } }
 */
export async function tickGoals({ games, now = Date.now(), store, poster = null, modelVersion, log = console }) {
  const out = { active: 0, goals: 0, inserted: 0, confirmed: 0, overturned: 0, multi: 0, posted: [], held: [] }
  const active = (games || []).filter((g) => gameActive(g, now))
  out.active = active.length
  if (!active.length) return out
  const byGame = new Map()
  for (const r of await store.existing(active.map((g) => g.id))) {
    const k = String(r.game_id)
    if (!byGame.has(k)) byGame.set(k, [])
    byGame.get(k).push(r)
  }

  // 1. what this read has, against what is stored
  const reads = active.map((g) => ({ game: g, ...matchGame(g, byGame.get(String(g.id)) || []) }))
  out.goals = reads.reduce((n, r) => n + r.matched.length + r.fresh.length, 0)

  // 2. new goals, frozen with the lock's label (first sight wins)
  const needLocks = reads.filter((r) => r.fresh.length).map((r) => r.game.id)
  if (needLocks.length) {
    const locks = locksFrom(await store.locks(needLocks))
    const rows = reads.flatMap((r) => r.fresh.map((f) => rowFrom(r.game, f.goal, f.goal_n, labelFor(locks, r.game.id, f.goal.scorer.id), modelVersion)))
    const inserted = await store.insert(rows)
    out.inserted = inserted.length
    for (const row of inserted) {
      const k = String(row.game_id)
      if (!byGame.has(k)) byGame.set(k, [])
      byGame.get(k).push({ ...row, first_seen_at: row.first_seen_at || new Date(now).toISOString() })
    }
  }

  // 3. confirm what is still there after CONFIRM_MS; overturn what a
  //    consistent read no longer has
  const touched = new Set()
  for (const r of reads) {
    for (const { row } of r.matched) {
      if (row.confirmed_at || now - Date.parse(row.first_seen_at) < CONFIRM_MS) continue
      row.confirmed_at = new Date(now).toISOString()
      await store.confirm(row, row.confirmed_at)
      out.confirmed += 1
      touched.add(`${row.game_id}|${row.player_id}`)
    }
    if (!r.missing.length) continue
    if (!feedConsistent(r.game)) { out.held.push(`${r.game.id}: ${r.missing.length} missing, read inconsistent`); continue }
    for (const row of r.missing) {
      row.overturned_at = new Date(now).toISOString()
      await store.overturn(row, row.overturned_at)
      out.overturned += 1
      touched.add(`${row.game_id}|${row.player_id}`)
      const posted = row.x_post_id && row.x_post_id !== 'posting'
      const msg = `[lamp goals] OVERTURNED ${row.name} (${row.game_id} #${row.goal_n}, ${row.time_in_period} ${periodWord(row)})${posted ? ` -- ALREADY POSTED to X as ${row.x_post_id}; left up (deleting is Donovan's call)` : ''}${row.push_sent ? ' -- push already sent' : ''}`
      if (posted || row.push_sent) log.error(msg); else log.log(msg)
    }
  }

  // 4. THE 2+ CLUB, LIVE: his second confirmed goal in one regular-season game
  //    writes the multi_games row tonight (the morning refresh rewrites it off
  //    the box score, which counts regular season only -- so this does too).
  //    An overturn that takes him back under two removes it.
  for (const r of reads) {
    if (Number(r.game.gameType) !== 2) continue
    const rows = byGame.get(String(r.game.id)) || []
    for (const key of touched) {
      const [gid, pid] = key.split('|')
      if (gid !== String(r.game.id)) continue
      const his = rows.filter((x) => String(x.player_id) === pid && !x.overturned_at)
      const confirmed = his.filter((x) => x.confirmed_at)
      if (confirmed.length >= 2) {
        const first = hisRows(confirmed[0], confirmed)[0]
        const n = (k) => confirmed.filter(k).length
        await store.upsertMulti([{
          sport: 'nhl', season: Number(String(r.game.season).slice(0, 4)), day: r.game.date, game_id: String(r.game.id), player_id: pid,
          name: first.name, team: first.team, opp: first.opp, n: confirmed.length, kind: 'G',
          detail: { pp: n((x) => x.strength === 'pp'), sh: n((x) => x.strength === 'sh'), ev: n((x) => x.strength === 'ev'), ot: n((x) => x.period_type === 'OT'), hat_trick: confirmed.length >= 3 },
          // BEFORE OUR RECORD when the game never locked, same as the backfill
          status: first.status || 'pre', board_rank: first.rank_in_game ?? null, score: first.lamp_score ?? null, odds: null,
        }])
        out.multi += 1
      } else if (his.length < 2 && rows.some((x) => String(x.player_id) === pid && x.overturned_at)) {
        await store.deleteMulti({ game_id: String(r.game.id), player_id: pid })
      }
    }
  }

  // 5. CALLED IT: CALLED goals only, confirmed and still standing
  //    POST_AFTER_MS later, regular season or playoffs, in a game this read
  //    covers. Never a goal first seen more than 3 h ago (a backlog after an
  //    outage is not news).
  if (poster) {
    const due = reads.flatMap((r) => r.matched.map((m) => m.row))
      .filter((row) => row.status === 'called' && !row.overturned_at && !row.x_post_id && row.confirmed_at
        && now - Date.parse(row.confirmed_at) >= POST_AFTER_MS && now - Date.parse(row.first_seen_at) <= 3 * 3600 * 1000
        && Number(row.game_type) !== 1)
      .slice(0, 4)
    for (const row of due) {
      if (!(await store.claimPost(row))) continue
      const rows = byGame.get(String(row.game_id)) || []
      let multiLine = null
      if (Number(row.game_type) === 2 && nthTonight(row, rows) === 2) {
        const k = await store.countMulti(Number(String(row.season).slice(0, 4)), String(row.player_id)).catch(() => 0)
        if (k) multiLine = `His ${ordinal(k)} multi-goal game this season.`
      }
      // The row rides along so the poster can attach the goal card
      // (lib/nhl/goalCard.js, the homer card's twin); text alone if it can't.
      const r = await poster.post(postText(row, rows, { multiLine }), row)
      await store.finishPost(row, r.ok && r.id ? r.id : null)
      if (r.ok && r.id) { row.x_post_id = r.id; out.posted.push(`${row.name} ${r.id}`) }
      else {
        log.error(`[lamp goals] X refused ${row.name}: ${r.status} ${r.error}`)
        if (r.status === 429 || r.status === 401 || r.status === 403) break
      }
    }
  }
  return out
}
