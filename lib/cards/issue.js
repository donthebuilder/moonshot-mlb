// CARD ISSUANCE (server only): the real issue number of a collectible card, from supabase/migrations/202610141500_card_issues.sql (card_issues + issue_card()).
//   issueCard(db, key, row)    -> { status:'issued'|'existing', issueNo, cardId } | { status:'unavailable', why } | { status:'skipped', why } | { status:'error', why }
//                                 idempotent: the same card twice returns the same row and takes no new number (the function and the table's unique keys enforce it)
//   issueNoOf(db, cardId)      -> { status:'issued', issueNo } | { status:'none' } (the table exists, no row) | { status:'unavailable' } (the table is not there yet)
//   issuePass(db, events)      the tick's one call: issues every card the events prove (each once per instance), never throws, never blocks a post
// GRACEFUL BY DESIGN: until Donovan has run the SQL the table and function do not exist; every call then answers 'unavailable', is remembered for UNAVAILABLE_MS, and
// the card prints "ISSUE NO. PREVIEW". Nothing here can fail a post or a render. Only PUBLIC moments with a tier from the v2 rules are issued (BUCKETS is hidden: never).
import { qualify, RULES_VERSION } from './rulesV2'
import { MOMENTS, evaluate } from './moments'
import { subjectOf, idOf } from './specialData'

export const UNAVAILABLE_MS = 10 * 60e3
let _unavailableUntil = 0
export const _resetIssue = () => { _unavailableUntil = 0; _done.clear() }
const _done = new Map()   // card id -> issue number, for this instance (a card is asked for once)

/** The errors that mean "the SQL has not been run": PostgREST's missing function / table, Postgres' undefined function / table. */
export const isMissing = (err) => {
  if (!err) return false
  const code = String(err.code || '')
  return ['PGRST202', 'PGRST205', '42883', '42P01'].includes(code) || /could not find the (function|table)|does not exist|schema cache/i.test(String(err.message || ''))
}

const day10 = (v) => String(v || '').slice(0, 10)

/** The RPC arguments of one card, or null when it earns none / is not a public moment. Pure. */
export function issueArgs(key, row, { isTest = false } = {}) {
  if (!Object.hasOwn(MOMENTS, key)) return null            // BUCKETS' moments are not in MOMENTS: never issued
  const q = qualify(key, row)
  const who = subjectOf(key, row)
  if (!q || !who) return null
  const ev = evaluate(key, row)
  return {
    p_card_id: q.cardId, p_slot_id: q.slotId, p_moment: key, p_sport: q.sport, p_player_id: String(who.playerId), p_season: q.season, p_event_key: String(idOf[key](row)),
    p_game_day: day10(who.day), p_tier: q.tier, p_rules_version: RULES_VERSION,
    p_evidence: { kicker: ev?.print?.kicker || null, line: ev?.print?.line || null, name: who.name, team: who.team, opp: who.opp },
    p_portrait: {}, p_is_test: Boolean(isTest),
  }
}

export async function issueCard(db, key, row, { now = Date.now(), isTest = false } = {}) {
  try {
    if (!db) return { status: 'unavailable', why: 'no database' }
    if (now < _unavailableUntil) return { status: 'unavailable', why: 'card_issues is not set up yet' }
    const args = issueArgs(key, row, { isTest })
    if (!args) return { status: 'skipped', why: 'not a public card' }
    if (_done.has(args.p_card_id)) return { status: 'existing', issueNo: _done.get(args.p_card_id), cardId: args.p_card_id }
    const { data, error } = await db.rpc('issue_card', args)
    if (error) {
      if (isMissing(error)) { _unavailableUntil = now + UNAVAILABLE_MS; return { status: 'unavailable', why: 'card_issues is not set up yet' } }
      return { status: 'error', why: String(error.message || error) }
    }
    const r = Array.isArray(data) ? data[0] : data
    if (!r || r.issue_no == null) return { status: 'error', why: 'no issue number returned' }
    if (_done.size > 5000) _done.clear()
    _done.set(args.p_card_id, r.issue_no)
    return { status: 'issued', issueNo: r.issue_no, cardId: r.card_id || args.p_card_id }
  } catch (e) {
    return { status: 'error', why: String(e?.message || e) }
  }
}

/** The issue number of a card that may already have one (read only). */
export async function issueNoOf(db, cardId, { now = Date.now() } = {}) {
  try {
    if (!db || !cardId) return { status: 'unavailable' }
    if (_done.has(cardId)) return { status: 'issued', issueNo: _done.get(cardId) }
    if (now < _unavailableUntil) return { status: 'unavailable' }
    const { data, error } = await db.from('card_issues').select('issue_no,status').eq('card_id', cardId).limit(1)
    if (error) { if (isMissing(error)) { _unavailableUntil = now + UNAVAILABLE_MS; return { status: 'unavailable' } } return { status: 'unavailable' } }
    const r = data?.[0]
    if (!r) return { status: 'none' }
    if (r.status === 'void') return { status: 'none' }
    _done.set(cardId, r.issue_no)
    return { status: 'issued', issueNo: r.issue_no }
  } catch { return { status: 'unavailable' } }
}

/** What a card prints in its issue slot: the real number, 'PREVIEW' until the table exists, or '' (the line is left off) when the table exists and holds no row. */
export const issueLabel = (r) => (r?.status === 'issued' ? String(r.issueNo) : r?.status === 'none' ? '' : 'PREVIEW')

/** The tick's call: issue every card the events prove. `events` = momentFeed events ({ moment, row }). Never throws, never slows a post (a few idempotent calls, each card once per instance). */
export async function issuePass(db, events, { now = Date.now() } = {}) {
  const out = { issued: 0, existing: 0, skipped: 0, unavailable: false, errors: 0 }
  try {
    // ONE CARD PER ACHIEVEMENT: a goal event stands for its goal card AND its season-milestone card (the feed keeps only the rarer of the two as the event)
    const keys = (e) => (e.moment === 'nhl_goal' || e.moment === 'nhl_season_goal_milestone' ? ['nhl_goal', 'nhl_season_goal_milestone'] : [e.moment])
    for (const e of (events || []).flatMap((x) => keys(x).map((moment) => ({ moment, row: x.row })))) {
      const r = await issueCard(db, e.moment, e.row, { now })
      if (r.status === 'issued') out.issued += 1
      else if (r.status === 'existing') out.existing += 1
      else if (r.status === 'skipped') out.skipped += 1
      else if (r.status === 'unavailable') { out.unavailable = true; break }
      else out.errors += 1
    }
  } catch { out.errors += 1 }
  return out
}
