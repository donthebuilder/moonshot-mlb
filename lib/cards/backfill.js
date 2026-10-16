// ISSUE NUMBERS FOR OLDER CARDS (server only, no JSX): the planning half of scripts/backfill-card-issues.mjs. READ-ONLY here; the script alone writes, and only with --apply.
//   historyItems(db, { since })        every card the STORED history proves under the CURRENT rules: [{ key, row }] (the same readers the binder and the shelf use)
//   plan(items, existing, { minTier }) the cards that have no number yet, in the order they would be issued, with the number each would get. Pure.
//   applyPlan(db, plan)                issue_card() for each, one at a time, in order (the same deterministic ids and the same function the live tick uses: idempotent)
// ORDER: game day, then the moment's own id, so the numbers of a moment follow history (the first hat trick on file is no. 1). That holds when the moment has no numbers yet; if the live tick
// has already numbered newer cards, the older ones get the next numbers after them and the plan says so (outOfOrder) rather than pretend.
// ONLY WHAT A CURRENT RULE PROVES FROM STORED DATA: a card is a stored row that lib/cards/rulesV2.js qualifies (qualify -> a tier, a deterministic id) and that issueArgs() accepts (a PUBLIC moment;
// BUCKETS never). Overturned goals are not read. A long shot needs the stored LOCK snapshot price (price_source = 'lock'); a priced-after-the-lock one is not a card. Nothing is guessed, nothing inferred.
import { issueArgs, isMissing } from './issue'
import { tierRank } from './moments'
import { momentRowsOf } from './momentEvents'
import { FEED_COLS, MLB_COLS, NFL_COLS, qPaged, yardRows, candidates } from './specialData'

export const BIG = 200000            // the most rows read per feed (the feeds are a few seasons; paging is 1000 at a time)
const DAY0 = '2000-01-01'

/** Every {key,row} the stored history proves, all public sports. A feed that cannot be read throws (a backfill never runs on half a history). */
export async function historyItems(db, { since = DAY0, onStep = () => {} } = {}) {
  const items = []
  const take = (list) => { for (const m of list) items.push({ key: m.key, row: m.row }) }
  onStep('nhl: lamp_goal_feed')
  take(momentRowsOf('nhl', await qPaged(() => db.from('lamp_goal_feed').select(FEED_COLS).is('overturned_at', null).gte('day', since).order('day').order('game_id').order('player_id').order('goal_n'), BIG)))
  onStep('mlb: homer_feed')
  take(momentRowsOf('mlb', await qPaged(() => db.from('homer_feed').select(MLB_COLS).gte('day', since).order('day').order('game_pk').order('player_id').order('hr_n'), BIG)))
  onStep('nfl: nfl_td_feed')
  take(momentRowsOf('nfl', await qPaged(() => db.from('nfl_td_feed').select(NFL_COLS).gte('day', since).order('day').order('game_id').order('td_n').order('gsis_id'), BIG)))
  onStep('nfl: game logs (100-yard games)')
  for (const row of await yardRows()) items.push({ key: 'nfl_100_yards', row })
  onStep('long shots: called events with a stored lock price')
  for (const c of await candidates('long_shot_cashed', db, { since, limit: BIG })) items.push({ key: 'long_shot_cashed', row: c.row })
  return items
}

/** The cards already numbered: [{ card_id, slot_id, moment, issue_no, game_day, status }], or { missing: true } when the table is not there. */
export async function readExisting(db) {
  const out = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('card_issues').select('card_id,slot_id,moment,issue_no,game_day,status').order('id').range(from, from + 999)
    if (error) { if (isMissing(error)) return { missing: true, rows: [] }; throw new Error(error.message) }
    out.push(...(data || []))
    if ((data || []).length < 1000) break
  }
  return { missing: false, rows: out }
}

/**
 * @param items     [{ key, row }]
 * @param existing  [{ card_id, slot_id, moment, issue_no, game_day }]
 * @returns { issue: [{ args, no, tier }], byMoment: { [moment]: { proven, already, issue, tiers:{}, first, last, firstDay, lastDay } }, outOfOrder: [moment], skipped }
 */
export function plan(items, existing = [], { minTier = 'base' } = {}) {
  const haveId = new Set(existing.map((r) => r.card_id)), haveSlot = new Set(existing.map((r) => r.slot_id))
  const seen = new Set()
  const proven = []
  let skipped = 0
  for (const { key, row } of items) {
    const args = issueArgs(key, row)
    if (!args || tierRank(args.p_tier) < tierRank(minTier)) { skipped += 1; continue }
    if (seen.has(args.p_card_id) || seen.has(args.p_slot_id)) continue      // the same achievement read twice is one card
    seen.add(args.p_card_id); seen.add(args.p_slot_id)
    proven.push(args)
  }
  proven.sort((a, b) => a.p_game_day.localeCompare(b.p_game_day) || a.p_event_key.localeCompare(b.p_event_key, 'en', { numeric: true }) || a.p_card_id.localeCompare(b.p_card_id))
  const next = {}, maxDay = {}
  for (const r of existing) { next[r.moment] = Math.max(next[r.moment] || 0, r.issue_no); maxDay[r.moment] = [maxDay[r.moment] || '', String(r.game_day || '')].sort().pop() }
  const byMoment = {}
  const bm = (m) => (byMoment[m] ||= { proven: 0, already: 0, issue: 0, tiers: {}, first: null, last: null, firstDay: null, lastDay: null })
  const issue = []
  const outOfOrder = new Set()
  for (const a of proven) {
    const s = bm(a.p_moment)
    s.proven += 1
    if (haveId.has(a.p_card_id) || haveSlot.has(a.p_slot_id)) { s.already += 1; continue }
    const no = (next[a.p_moment] || 0) + 1
    if (maxDay[a.p_moment] && a.p_game_day < maxDay[a.p_moment]) outOfOrder.add(a.p_moment)
    next[a.p_moment] = no
    issue.push({ args: a, no, tier: a.p_tier })
    s.issue += 1
    s.tiers[a.p_tier] = (s.tiers[a.p_tier] || 0) + 1
    if (s.first == null) { s.first = no; s.firstDay = a.p_game_day }
    s.last = no; s.lastDay = a.p_game_day
  }
  return { issue, byMoment, outOfOrder: [...outOfOrder], skipped }
}

/** Write the plan through issue_card(), in order, one call each. A number the database assigns that differs from the plan is reported (another issuer ran meanwhile). */
export async function applyPlan(db, p, { onProgress = () => {} } = {}) {
  const out = { issued: 0, existing: 0, errors: [], drift: 0 }
  let i = 0
  for (const it of p.issue) {
    i += 1
    const { data, error } = await db.rpc('issue_card', it.args)
    if (error) { out.errors.push(`${it.args.p_card_id}: ${error.message}`); if (out.errors.length >= 5) break; continue }
    const r = Array.isArray(data) ? data[0] : data
    if (!r || r.issue_no == null) { out.errors.push(`${it.args.p_card_id}: no issue number returned`); continue }
    if (r.issue_no === it.no) out.issued += 1
    else if (r.issue_no < it.no) out.existing += 1
    else { out.issued += 1; out.drift += 1 }
    if (i % 200 === 0) onProgress(i, p.issue.length)
  }
  return out
}
