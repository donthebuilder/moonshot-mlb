// THE FACT ENGINE (BATCH-FACT-ENGINE, 2026-10-02). Finds the day's facts,
// writes them (lib/facts/write.js), checks every draft (lib/facts/check.js)
// and AUTO-POSTS the best one (Donovan 10-02: "make it so they're automatic").
// Limits: 3 fact posts a day across all sports, 90 minutes apart, inside the X
// daily and monthly caps (the cap wins); one attempt per fact, ever (fact_posts
// is keyed on the fact's id, so a fact is never posted -- or re-written -- twice).
// THE KILL SWITCH: dash_flags 'facts_autopost' (toggled on /admin, no redeploy)
// or FACTS_AUTOPOST=off in Vercel. No fact_posts / dash_flags table yet (the
// SQL hasn't run) = off: the engine stays hidden until its SQL exists.
import { parseGames, nflFacts, NFL_GAMES_URL } from './nfl'
import { TEAM_READERS, teamFacts } from './teams'
import { mlbBotFacts } from './mlb'
import { aiDrafts, templateDrafts, WRITER_MODEL } from './write'
import { checkDraft } from './check'
import { postToX, hasX } from '../dash/xPost'
import { xDailyAllows, logXBudget } from '../dash/xBudget'
import { easternToday, shiftDay } from '../data'

// ONE CONFIG: when each sport posts (ET), and the limits.
export const FACTS_CONFIG = {
  maxPerDay: 3,
  spacingMin: 90,
  minScore: 40,          // a fact that isn't interesting enough isn't posted (house style rule 10)
  maxAttempts: 3,        // facts tried per run before giving up until the next one
  monthlyCap: Number(process.env.X_MONTHLY_CAP || 1100) || 1100,
  // NFL: Thursday + Saturday evening, Sunday morning before the early games (dow 0 = Sunday)
  nfl: [{ dow: 4, from: '18:00', to: '20:00' }, { dow: 6, from: '17:00', to: '19:00' }, { dow: 0, from: '09:00', to: '11:30' }],
  // MLB / NHL / NBA: about 2 hours before the day's first game
  daily: { beforeFirstMin: 120, widthMin: 60, sports: ['mlb', 'nhl', 'nba'] },
}

const etParts = (t) => {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(t))
  const g = (k) => f.find((x) => x.type === k)?.value
  return { dow: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(g('weekday')), min: (Number(g('hour')) % 24) * 60 + Number(g('minute')) }
}
const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m }

// Per-sport finders beyond the team facts, looked up (no sport branches).
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

/** Which sports are inside their posting window right now, with their facts. */
async function factsDue(now, today) {
  const due = []
  const et = etParts(now)
  if (FACTS_CONFIG.nfl.some((w) => w.dow === et.dow && et.min >= toMin(w.from) && et.min <= toMin(w.to))) {
    const csv = await fetch(NFL_GAMES_URL, { cache: 'no-store' }).then((r) => (r.ok ? r.text() : '')).catch(() => '')
    const games = parseGames(csv)
    const ahead = games.filter((g) => g.as == null && g.day >= today).sort((a, b) => (a.day < b.day ? -1 : 1))
    const next = ahead[0]
    if (next) {
      const soon = new Date(Date.parse(`${today}T12:00:00Z`) + 4 * 864e5).toISOString().slice(0, 10)
      due.push(...nflFacts(games, { season: next.season, week: next.week }).filter((f) => !f.date || (f.date >= today && f.date <= soon)))
    }
  }
  for (const sport of FACTS_CONFIG.daily.sports) {
    try {
      const data = await TEAM_READERS[sport](today)
      const first = Math.min(...data.games.map((g) => Date.parse(g.start)).filter(Number.isFinite))
      if (!Number.isFinite(first)) continue
      const open = first - FACTS_CONFIG.daily.beforeFirstMin * 60e3
      if (now < open || now > open + FACTS_CONFIG.daily.widthMin * 60e3) continue
      due.push(...teamFacts(sport, data, today))
      // a sport's own extra finders (MLB: the bot's history with tonight's hitters)
      for (const find of EXTRA_FINDERS[sport] || []) due.push(...await find(today).catch((e) => { console.error(`[facts] ${sport} extra: ${e?.message}`); return [] }))
    } catch (e) { console.error(`[facts] ${sport} read failed: ${e?.message}`) }
  }
  return due.sort((a, b) => b.score - a.score)
}

/** Drafts for a fact, checked: { text, writer, tokens, rejected[] }. */
export async function writeChecked(fact) {
  const rejected = []
  let tokens = null
  const ai = await aiDrafts(fact)
  if (ai) {
    tokens = ai.tokens
    for (const d of ai.drafts) { const c = checkDraft(d, fact); if (c.ok) return { text: d, writer: WRITER_MODEL, tokens, rejected }; rejected.push({ d, why: c.why }) }
  }
  for (const d of templateDrafts(fact)) { const c = checkDraft(d, fact); if (c.ok) return { text: d, writer: 'template', tokens, rejected }; rejected.push({ d, why: c.why }) }
  return { text: null, writer: ai ? WRITER_MODEL : 'template', tokens, rejected }
}

/** One engine run (the cron). dry = find + write + check, post nothing, write nothing. */
export async function runFacts(db, { now = Date.now(), dry = false, force = false } = {}) {
  const today = easternToday()
  const out = { today, dry, posted: null, tried: [], skipped: null }
  const state = await autopostState(db)
  out.autopost = state
  if (!state.on && !dry) { out.skipped = `autopost off: ${state.why}`; return out }

  if (!dry) {
    const day = await db.from('fact_posts').select('posted_at').eq('day', today).eq('status', 'posted').order('posted_at', { ascending: false })
    if (day.error) { out.skipped = `fact_posts: ${day.error.message}`; return out }
    if ((day.data || []).length >= FACTS_CONFIG.maxPerDay) { out.skipped = `${FACTS_CONFIG.maxPerDay} fact posts already today`; return out }
    const last = day.data?.[0]?.posted_at ? Date.parse(day.data[0].posted_at) : 0
    if (last && now - last < FACTS_CONFIG.spacingMin * 60e3) { out.skipped = `last fact post under ${FACTS_CONFIG.spacingMin} min ago`; return out }
    if (!hasX()) { out.skipped = 'X not configured'; return out }
    const month = await logXBudget(db, today, { mode: 'facts', cap: FACTS_CONFIG.monthlyCap })
    if (month && month.used >= month.cap) { out.skipped = `X monthly cap reached (${month.used}/${month.cap})`; return out }
    if (!(await xDailyAllows(db, today, 2))) { out.skipped = 'X daily cap'; return out }
  }

  const facts = (await factsDue(now, today)).filter((f) => force || f.score >= FACTS_CONFIG.minScore)
  out.found = facts.length
  if (!facts.length) { out.skipped = 'no fact due in a posting window'; return out }
  const seen = dry ? new Set() : new Set(((await db.from('fact_posts').select('id').in('id', facts.map((f) => f.id))).data || []).map((r) => r.id))

  let attempts = 0
  for (const fact of facts) {
    if (seen.has(fact.id)) continue
    if (attempts++ >= FACTS_CONFIG.maxAttempts) break
    const w = await writeChecked(fact)
    out.tried.push({ id: fact.id, why: fact.why, text: w.text, writer: w.writer, rejected: w.rejected.length })
    if (dry) continue
    const row = { id: fact.id, day: today, sport: fact.sport, family: fact.family, fact, text: w.text, writer: w.writer, tokens_in: w.tokens?.in ?? null, tokens_out: w.tokens?.out ?? null, rejected: w.rejected }
    if (!w.text) {
      // every draft failed a check: logged once, never posted, never retried
      await db.from('fact_posts').upsert([{ ...row, status: 'rejected' }], { onConflict: 'id', ignoreDuplicates: true })
      console.warn(`[facts] ${fact.id}: every draft failed the checker`)
      continue
    }
    // the claim: of two runs racing, one gets the row back and posts
    const claim = await db.from('fact_posts').upsert([{ ...row, status: 'posting' }], { onConflict: 'id', ignoreDuplicates: true }).select('id')
    if (claim.error || !claim.data?.length) continue
    const r = await postToX(w.text, { kind: 'facts' })
    await db.from('fact_posts').update(r?.ok ? { status: 'posted', x_post_id: r.id, posted_at: new Date().toISOString() } : { status: 'failed', error: String(r?.error || r?.status || 'post failed').slice(0, 300) }).eq('id', fact.id)
    out.posted = r?.ok ? { id: fact.id, x: r.id, text: w.text } : { id: fact.id, error: r?.error || r?.status }
    break
  }
  return out
}
