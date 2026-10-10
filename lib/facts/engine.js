// THE FACT ENGINE (BATCH-FACT-ENGINE, 2026-10-02; rebuilt fix23-facts-1009, 2026-10-09). Finds the day's facts,
// writes them (lib/facts/write.js), checks every draft (lib/facts/check.js) and AUTO-POSTS the best one.
// LIMITS (Donovan 10-08): up to 3 fact posts per ACTIVE sport per day -- a cap, not a quota; NFL: game days
// (3) and the build-up Tue-Sat (FACTS_CONFIG.nflBuildUpPerDay), never 3 a day all week. 90 minutes apart per
// sport and 45 between any two (the scheduler's gap), inside the X daily cap (tier 'fact', stops at 16: the
// gate decides). A sport with nothing honest to say today posts nothing.
// WHO MAY BE NAMED: only what the poll adapters let through (on the slate, lineup / starter / goalie /
// injury checks passed, game not started); the same player is not named by a fact again within 3 days (NFL 7),
// read from fact_posts (the homer_feed_posts guard cannot see this table).
// THE KILL SWITCH: dash_flags 'facts_autopost' (toggled on /admin, no redeploy) or FACTS_AUTOPOST=off in
// Vercel. No fact_posts / dash_flags table yet (the SQL hasn't run) = off.
// WHY IT WAS SILENT (the trace, 10-09): MLB's team finder reads REGULAR-SEASON games only (the season ended
// before the switch went on); NHL/NBA team facts need a 3-0 start or a 5-6 game streak; the NFL window was
// three evenings a week; and every error was a console line. The player facts (lib/facts/players.js) and the
// per-sport report below (out.sports) are the fix.
import { parseGames, nflFacts, NFL_GAMES_URL } from './nfl'
import { TEAM_READERS, teamFacts } from './teams'
import { mlbBotFacts } from './mlb'
import { readPlayerFacts } from './players'
import { aiDrafts, templateDrafts, WRITER_MODEL } from './write'
import { checkDraft, checkShape } from './check'
import { compose } from './label'
import { postToX, hasX } from '../dash/xPost'
import { admit, notePosted } from '../dash/xGate'
import { recordPost } from '../dash/xPostLog'
import { recentNamedIds, repeatsOf } from '../dash/xPolicy'
import { logXBudget } from '../dash/xBudget'
import { clockIn, wallToMs } from '../dash/xSchedule'
import { easternDate, shiftDay } from '../data'
import { bucketsPublic } from '../nba/gate'

// ONE CONFIG: when each sport posts (ET), and the limits.
export const FACTS_CONFIG = {
  maxPerDay: 3,            // PER ACTIVE SPORT (the name stays: /admin reads it)
  spacingMin: 90,          // between two fact posts of one sport
  gapMin: 45,              // between any two fact posts (the scheduler's gap)
  minScore: 40,            // a fact that isn't interesting enough isn't posted (house style rule 10)
  maxAttempts: 4,          // facts tried per run before giving up until the next one
  monthlyCap: Number(process.env.X_MONTHLY_CAP || 1100) || 1100,
  sports: ['nfl', 'mlb', 'nhl', 'nba'],
  // the window (ET): from `openBeforeFirstMin` ahead of the sport's first game (not before `earliest`), until
  // `closeBeforeFirstMin` ahead of it. NFL build-up days: a fixed afternoon.
  openBeforeFirstMin: 360, closeBeforeFirstMin: 45, earliest: '10:00',
  // a sport that plays by the WEEK (NFL): its game-day opening, and its build-up days (Tue-Sat, one fact, an afternoon window)
  weekly: { nfl: { gameDayOpen: '09:00', buildUp: { from: '12:00', to: '20:00', dows: [2, 3, 4, 5, 6], perDay: 1 } } },
  repeatDays: { default: 3, nfl: 7 },
}

const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m }

/** The posting window of one sport today: { open, close } in ms, or { none: why }. Pure. */
export function windowOf(sport, { today, gameDay = today, firstStartMs, now = Date.now() }) {
  const C = FACTS_CONFIG
  const at = (hhmm) => wallToMs('America/New_York', today, hhmm)
  const wk = C.weekly[sport]
  if (wk && gameDay !== today) {
    const dow = clockIn('America/New_York', now).dow
    if (!wk.buildUp.dows.includes(dow)) return { none: 'not a build-up day (Tue-Sat) and no game today' }
    return { open: at(wk.buildUp.from), close: at(wk.buildUp.to), buildUp: true }
  }
  if (!Number.isFinite(firstStartMs)) return { none: 'no game start time' }
  const open = Math.max(firstStartMs - C.openBeforeFirstMin * 60e3, at(wk?.gameDayOpen || C.earliest))
  const close = firstStartMs - C.closeBeforeFirstMin * 60e3
  return close > open ? { open, close } : { none: 'the first game is too close' }
}
/** Posts a sport may make today. */
export const capFor = (sport, buildUp) => (buildUp && FACTS_CONFIG.weekly[sport] ? FACTS_CONFIG.weekly[sport].buildUp.perDay : FACTS_CONFIG.maxPerDay)

// A sport that is hidden until it opens (BUCKETS): no fact posts to X before BUCKETS_PUBLIC=on.
const OPEN_GATE = { nba: bucketsPublic }
// Heavy readers only the sport that needs them loads.
const HEAVY = { mlb: async () => (await import('../dash/tweetFeed')).milestonePicks }

// A sport whose team facts come from a season schedule file (NFL: nflverse games.csv), not a standings feed.
const SCHEDULE_FINDERS = {
  async nfl(today, guard) {
    const csv = await guard('games.csv', () => fetch(NFL_GAMES_URL, { cache: 'no-store' }).then((r) => (r.ok ? r.text() : '')), '')
    const games = parseGames(csv)
    const next = games.filter((g) => g.as == null && g.day >= today).sort((a, b) => (a.day < b.day ? -1 : 1))[0]
    if (!next) return []
    const soon = new Date(Date.parse(`${today}T12:00:00Z`) + 4 * 864e5).toISOString().slice(0, 10)
    return nflFacts(games, { season: next.season, week: next.week }).filter((f) => !f.date || (f.date >= today && f.date <= soon))
  },
}

// Per-sport extra finders beyond the player facts, looked up (no sport branches).
const EXTRA_FINDERS = {
  mlb: [(today) => mlbBotFacts(today, shiftDay(today, -1))],
}

/** The kill switch: { on, why }. */
/** One dash_flags switch: an env var set to 'off' wins; else the row; a missing table or row is off.
 *  Shared by the fact engine (facts_autopost) and the game write-ups (writeups_autopost). */
export async function flagState(db, key, envVar) {
  if (String(process.env[envVar] || '').toLowerCase() === 'off') return { on: false, why: `${envVar}=off (Vercel)` }
  const r = await db.from('dash_flags').select('value, updated_at').eq('key', key).maybeSingle()
  if (r.error) return { on: false, why: 'dash_flags table not created yet (SQL owed)', missing: true }
  return { on: String(r.data?.value || 'off') === 'on', why: r.data ? `dash_flags ${key} = ${r.data.value}` : `no ${key} flag set`, at: r.data?.updated_at || null }
}
export const autopostState = (db) => flagState(db, 'facts_autopost', 'FACTS_AUTOPOST')

/** Drafts for a fact, checked: { text, writer, tokens, rejected[] }. */
export async function writeChecked(fact) {
  const rejected = []
  let tokens = null
  const verdict = (d) => { const c = checkDraft(d, fact), sh = checkShape(d, fact); return { ok: c.ok && sh.ok, why: [...c.why, ...sh.why] } }
  // the AI writes the body only (player facts are templates only: nothing for it to add); the label line and the source line are code
  const ai = fact.family?.startsWith('p_') ? null : await aiDrafts(fact)
  if (ai) {
    tokens = ai.tokens
    for (const raw of ai.drafts) {
      const d = compose(fact, String(raw).split('\n').map((l) => l.trim()).filter(Boolean))
      const c = verdict(d); if (c.ok) return { text: d, writer: WRITER_MODEL, tokens, rejected }; rejected.push({ d, why: c.why })
    }
  }
  for (const d of templateDrafts(fact)) { const c = verdict(d); if (c.ok) return { text: d, writer: 'template', tokens, rejected }; rejected.push({ d, why: c.why }) }
  return { text: null, writer: ai ? WRITER_MODEL : 'template', tokens, rejected }
}

const namedOf = (fact) => (Array.isArray(fact?.named) ? fact.named : Array.isArray(fact?.teams) ? fact.teams.map((t) => `team:${fact.sport}:${t.code}`) : [])
/** The facts whose subject (player or club) this sport's fact posts named inside the repeat window. Pure. */
export function repeatBlocked(fact, recent, today) {
  const win = FACTS_CONFIG.repeatDays[fact.sport] || FACTS_CONFIG.repeatDays.default
  const rows = (recent || []).filter((r) => r.sport === fact.sport && r.status === 'posted').map((r) => ({ day: r.day, payload: { named: namedOf(r.fact) } }))
  return repeatsOf(namedOf(fact), recentNamedIds(rows, { day: today, windowDays: win }))
}

/** One sport's facts for today, with why not when there are none: { sport, active, why, window, facts, errors[] }. */
export async function sportFacts(sport, { today, now, db, force = false }) {
  const errors = []
  const R = { sport, active: false, why: null, window: null, facts: [], errors }
  const guard = async (what, fn, fallback) => { try { return await fn() } catch (e) { errors.push(`${sport} ${what}: ${e?.message || e}`); return fallback } }
  if (OPEN_GATE[sport] && !OPEN_GATE[sport]()) { R.why = 'BUCKETS is not public (BUCKETS_PUBLIC)'; return R }
  const mlbMilestones = HEAVY[sport] ? await HEAVY[sport]() : null
  const P = await guard('player facts', () => readPlayerFacts(sport, { today, now, db, mlbMilestones }), null)
  let team = []
  if (SCHEDULE_FINDERS[sport]) {
    team = await SCHEDULE_FINDERS[sport](today, guard)
  } else if (TEAM_READERS[sport]) {
    const data = await guard('team standings', () => TEAM_READERS[sport](today), null)
    if (data) {
      const starts = data.games.map((g) => Date.parse(g.start)).filter(Number.isFinite)
      if (starts.length) { team = teamFacts(sport, data, today); R.teamFirstStartMs = Math.min(...starts) }
    }
  }
  for (const find of EXTRA_FINDERS[sport] || []) team.push(...await guard('extra finder', () => find(today), []))
  const firstStartMs = [P?.firstStartMs, R.teamFirstStartMs].filter(Number.isFinite).sort((a, b) => a - b)[0]
  R.active = Boolean(P?.active) || team.length > 0
  R.gameDay = P?.gameDay || today
  R.why = P ? (P.active ? null : P.why) : 'player facts failed'
  if (!R.active && !R.why) R.why = 'no games'
  R.window = windowOf(sport, { today, gameDay: R.gameDay, firstStartMs, now })
  R.facts = [...(P?.facts || []), ...team].sort((a, b) => b.score - a.score)
  R.pending = P?.pending?.length || 0
  R.noNames = Boolean(P?.active) && !P.players.length   // a game is on, but no player passes the pre-naming checks
  void force
  return R
}

/**
 * One engine run (the cron). dry = find + write + check, post nothing, write nothing (reads only).
 * `force` ignores the minimum score; `ignoreWindow` (dry) shows what WOULD post, whatever the hour.
 * `sports` limits the run. out.sports[sport] says, per sport, what was found and why not more.
 */
export async function runFacts(db, { now = Date.now(), dry = false, force = false, ignoreWindow = false, sports = null, read = sportFacts } = {}) {   // `read`: the per-sport reader (tests hand it test data)
  const today = easternDate(now)   // the day of the clock handed in (Date.now() in production), so a check with a fixed `now` does not read the real day
  const C = FACTS_CONFIG
  const out = { today, dry, posted: null, tried: [], skipped: null, sports: {}, errors: [] }
  const state = await autopostState(db)
  out.autopost = state
  if (!state.on && !dry) { out.skipped = `autopost off: ${state.why}`; return out }

  // what the table already holds: this week's posts, for the caps, the spacing and the repeat guard
  const since = shiftDay(today, -8)
  const hist = await db.from('fact_posts').select('id, day, sport, status, posted_at, fact').gte('day', since)
  if (hist.error && !dry) { out.skipped = `fact_posts: ${hist.error.message}`; return out }
  const rows = hist.data || []
  const posted = rows.filter((r) => r.status === 'posted')
  const todays = posted.filter((r) => r.day === today)
  const lastAny = Math.max(0, ...todays.map((r) => Date.parse(r.posted_at) || 0))

  if (!dry) {
    if (!hasX()) { out.skipped = 'X not configured'; return out }
    if (lastAny && now - lastAny < C.gapMin * 60e3) { out.skipped = `last fact post under ${C.gapMin} min ago`; return out }
    const month = await logXBudget(db, today, { mode: 'facts', cap: C.monthlyCap })
    if (month && month.used >= month.cap) { out.skipped = `X monthly cap reached (${month.used}/${month.cap})`; return out }
  }

  // every active sport's facts, with the reason when there are none
  const candidates = []
  for (const sport of (sports || C.sports)) {
    const R = await read(sport, { today, now, db, force })
    const mine = todays.filter((r) => r.sport === sport)
    const last = Math.max(0, ...mine.map((r) => Date.parse(r.posted_at) || 0))
    const cap = capFor(sport, R.window?.buildUp)
    const rep = { active: R.active, why: R.why, gameDay: R.gameDay, window: R.window?.none ? R.window.none : R.window ? `${new Date(R.window.open).toISOString()} .. ${new Date(R.window.close).toISOString()}` : null,
      postedToday: mine.length, cap, found: R.facts.length, pendingNames: R.pending || 0, belowMinScore: 0, seen: 0, repeats: [], held: null, errors: R.errors }
    out.sports[sport] = rep
    out.errors.push(...R.errors)
    for (const e of R.errors) recordPost({ day: today, kind: `facts_${sport}`, sport, state: 'HELD', reason: `error: ${e}`.slice(0, 200) })
    if (!R.active) { recordPost({ day: today, kind: `facts_${sport}`, sport, state: 'HELD', reason: `${sport}: ${R.why || 'inactive'}` }); continue }
    if (!ignoreWindow) {
      if (R.window?.none) { rep.held = R.window.none; continue }
      if (now < R.window.open || now > R.window.close) { rep.held = 'outside the posting window'; continue }
    }
    if (mine.length >= cap) { rep.held = `${cap} fact posts already today`; continue }
    if (last && now - last < C.spacingMin * 60e3) { rep.held = `last ${sport} fact under ${C.spacingMin} min ago`; continue }
    const have = new Set(rows.map((r) => r.id))
    for (const f of R.facts) {
      if (!force && f.score < C.minScore) { rep.belowMinScore += 1; continue }
      if (have.has(f.id)) { rep.seen += 1; continue }
      const blocked = repeatBlocked(f, rows, today)
      if (blocked.length) { rep.repeats.push(blocked[0]); continue }
      candidates.push(f)
    }
    if (!R.facts.length && R.active) rep.held = rep.held || (R.noNames ? 'no player passes the pre-naming checks (NHL: no starting-goalie source yet)' : 'nothing honest to say today')
  }
  out.found = candidates.length
  if (!candidates.length) { out.skipped = 'no fact due'; return out }

  // best first, one sport at most twice in a row of attempts; post ONE per run
  candidates.sort((a, b) => b.score - a.score)
  let attempts = 0
  for (const fact of candidates) {
    if (attempts++ >= C.maxAttempts) break
    const w = await writeChecked(fact)
    out.tried.push({ id: fact.id, sport: fact.sport, family: fact.family, why: fact.why, score: fact.score, text: w.text, writer: w.writer, rejected: w.rejected.map((r) => r.why) })
    if (dry) continue
    const row = { id: fact.id, day: today, sport: fact.sport, family: fact.family, fact, text: w.text, writer: w.writer, tokens_in: w.tokens?.in ?? null, tokens_out: w.tokens?.out ?? null, rejected: w.rejected }
    if (!w.text) {
      // every draft failed a check: logged once, never posted, never retried
      await db.from('fact_posts').upsert([{ ...row, status: 'rejected' }], { onConflict: 'id', ignoreDuplicates: true })
      recordPost({ day: today, kind: 'facts', sport: fact.sport, state: 'DROPPED', reason: `every draft failed the checker: ${fact.id}`.slice(0, 200), ids: namedOf(fact) })
      continue
    }
    // THE X GATE: the pause and the daily cap (tier 'fact': stops 4 before the cap). The repeat guard is above (fact_posts).
    const gate = await admit(db, { day: today, kind: 'facts', sport: fact.sport, repeat: false })
    if (gate.state !== 'go') { out.skipped = `gate: ${gate.reason}`; break }
    // the claim: of two runs racing, one gets the row back and posts
    const claim = await db.from('fact_posts').upsert([{ ...row, status: 'posting' }], { onConflict: 'id', ignoreDuplicates: true }).select('id')
    if (claim.error || !claim.data?.length) continue
    const r = await postToX(w.text, { kind: 'facts' })
    await db.from('fact_posts').update(r?.ok ? { status: 'posted', x_post_id: r.id, posted_at: new Date().toISOString() } : { status: 'failed', error: String(r?.error || r?.status || 'post failed').slice(0, 300) }).eq('id', fact.id)
    if (r?.ok) { notePosted('facts'); recordPost({ day: today, kind: 'facts', sport: fact.sport, state: 'POSTED', ids: namedOf(fact), tweetId: r.id, text: w.text }) }
    out.posted = r?.ok ? { id: fact.id, x: r.id, text: w.text } : { id: fact.id, error: r?.error || r?.status }
    break
  }
  return out
}
