// /api/admin/two-man: DONOVAN'S TWO-MAN, admin only (signed in AND the account's email in ADMIN_EMAILS; anyone else gets a 404).
//   GET  ?sport=nhl|nfl|mlb                 the card windows to come (tonight and the next two days; the football week), each with its lock time, Donovan's
//                                           on-time entry and his LATE entry if he made them, and his late entries with their own tally
//   GET  ?sport=&date=YYYY-MM-DD            + the picker: the window's scored board (real player ids), best score first, each row with face, club, game start
//                                           (ET), market, stored price, floor status (information only), board word and score (lib/card/picker.js)
//   POST { sport, date, players:[id,id], note }       save his two-man. ALWAYS OPEN (2026-10-12): before the lock it is the verified entry exactly as always;
//                                           after the lock but before any leg's game starts it is VERIFIED too and locks at the moment of save (needs confirm_lock:true);
//                                           once a leg's game has started it is stored in the LATE lane (never the record, never posted, never public) and needs
//                                           confirm_late:true (else 409 with needs_confirm). A late entry never touches an on-time one.
//   POST { sport, date, action:'withdraw', lane?:'late' }   withdraw his open entry (on-time: only before the lock; late: inside its 15-minute typo window)
//   HIS N-MAN (2026-10-12, "do up a 6 man with a card too"): 2 to 6 players, ALL must land, product 'n_man', the same rules as his Two-Man in every way (on time / lock at save /
//   LATE, never over a locked entry, own post card_don_<sport>), 0.5 unit unless `units` (0.25..1) says otherwise. Each window also carries n_entry / n_late_entry; `late.n_rows` his late N-men.
//   POST { product:'n_man', sport, date, players:[2..6 ids], note, card_name?, units?, confirm_lock?, confirm_late? }   save;   POST { product:'n_man', sport, date, action:'withdraw', lane? }
//   2026-10-12 ("2 yes"): the N-man is 2 to 6 players. Two players on the N-man tab are product 'n_man' with leg_count 2 ("ADMIN'S 2-MAN"), the same bet as the Two-Man in the N-man card's layout; the
//   Two-Man tab still saves a 'two_man'. They are counted separately everywhere (donovan vs donovan_n_man).
//   HIS STRAIGHT and up to three N-men (2026-10-12, "give me 3 post max, ranging from straight to 6man"): POST { product:'straight', sport, date, players:[1 id], note, card_name?, slot? } (and product:'n_man' with `slot`);
//   a new entry takes the next free slot (1..3) of its lane, `slot` replaces that one; withdraw takes `slot` too. Entries are never capped at save; only the oldest 3 of a sport-day are POSTED
//   (the response says will_post). Until supabase/migrations/202610121800_card_calls_donovan_mix.sql is run a straight / 2nd N-man answers 409 needs_sql and stores nothing.
//   Each window also carries `entries` (all of them, slimmed), `late_entries` and `posts` { max: 3, used, entries:[{ key, product, state }] }: his posts are up to 3 a day and sport (lib/card/post.js), the oldest saved first.
//   Until supabase/migrations/202610121200_card_calls_nman.sql is run a save answers 409 with needs_sql and stores NOTHING; the 2-leg Two-Man is unaffected.
//   HIS DOUBLE (optional, daily; two players from two different sports, free to show after the lock with his note):
//   GET  ?product=double&date=YYYY-MM-DD    each sport's window + board for that day, the earlier lock, and his entry if he made one
//   POST { product:'double', date, picks:[{sport,player_id},{sport,player_id}], note }   save (or replace, before the EARLIER of the two locks)
//   POST { product:'double', date, action:'withdraw' }
// The rules are lib/card/core.js donovanRow; the database trigger (supabase/migrations/202610101000_card_calls.sql) is the backstop.
import { hasSupabaseConfig } from '../../../../lib/supabase/config'
import { createSupabaseServerClient } from '../../../../lib/supabase/server'
import { adminClient } from '../../../../lib/supabase/admin'
import { isAdminUser, adminDenyReason, sameOriginJson } from '../../../../lib/admin'
import { CARD_SPORTS, CARD_VERSION, DOUBLE_SPORT, LATE_LANE, DON_SLOTS, DON_MAX_POSTS, LATE_EDIT_MIN, NMAN_MIN, NMAN_MAX, NMAN_UNITS, lockAtOf, donovanRow, donovanDoubleRow, NOTE_MAX_LINES, NOTE_MAX_CHARS } from '../../../../lib/card/core'
import { loadWindows, loadCandidates, loadAnytimePrices } from '../../../../lib/card/sources'
import { saveDonovan, withdrawDonovan, donovanEntry, donovanRowsOf, lateEntries } from '../../../../lib/card/store'
import { pickerRow, nhlSeasonOf, etWhen } from '../../../../lib/card/picker'
import { donovanPostsToday, donovanEntries as postOrder, donKey } from '../../../../lib/card/post'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const no = () => Response.json({ error: 'not found' }, { status: 404 })
const PICKER_MAX = 150

async function admin() {
  if (!hasSupabaseConfig()) return null
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user && isAdminUser(user)) return user
  console.warn(`[admin/two-man api] 404: ${adminDenyReason(user)}`)       // the reason code only (never an email), for the server log
  return null
}
/** A board that cannot be read for a day that has no board yet, in plain words (MLB publishes today's board only). */
const boardWhy = (why, date) => (/the board file is for/.test(String(why)) ? `The model's board for ${date} is not published yet; it appears on the day. (${why})` : String(why))

const slimEntry = (r) => (r ? {
  card_date: r.card_date, sport: r.sport, product: r.product, slot: r.slot ?? 1, stake: r.stake ?? null, locks_at: r.locks_at, start_at: r.start_at, note: r.note, card_name: r.legs?.[0]?.card_name || null, lane: r.lane, late: r.lane === LATE_LANE,
  saved_at: r.locked_at || null, edit_until: r.lane === LATE_LANE && r.locked_at ? new Date(Date.parse(r.locked_at) + LATE_EDIT_MIN * 60e3).toISOString() : null,
  legs: r.legs.map((l) => ({ player_id: l.player_id, name: l.name, team: l.team, opp: l.opp, game_id: l.game_id, start_at: l.start_at, sport: l.sport || null, status: l.status || null })),
  result: r.result,
} : null)

/** The windows Donovan can enter: tonight, the next two days (night sports), the football week. A slate that is over (its last game started more than 5 hours ago) is not offered. */
const AHEAD = 2
const OVER_MS = 5 * 3600e3
const notOver = (now) => (w) => !(Number.isFinite(w.last_start_ms) && now > w.last_start_ms + OVER_MS)
/** On time = before the card's lock AND before any game of the slate starts. Anything later is LATE. */
const onTime = (win, now) => now < lockAtOf(win.first_start_ms) && now < win.first_start_ms

// HIS DOUBLE: each sport's window for the day, its board (real ids, best score first) and the lock
async function doubleWindows(date, now, withBoards) {
  const out = {}
  await Promise.all(CARD_SPORTS.map(async (sport) => {
    const w = await loadWindows(sport, now)
    const win = w.ok ? w.windows.find((x) => x.card_date === date) : null
    if (!win) { out[sport] = { sport, error: w.ok ? `no ${sport} games on ${date}` : w.why }; return }
    const o = { sport, win, first_start: new Date(win.first_start_ms).toISOString(), locks_at: new Date(lockAtOf(win.first_start_ms)).toISOString(), field: null }
    if (withBoards) {
      const c = await loadCandidates(sport, win, now, { all: true })
      if (!c.ok) o.error = c.why
      else { o.cands = c.cands; o.field = c.cands.filter((x) => x.start_ms > now).sort((a, b) => b.score - a.score).slice(0, PICKER_MAX).map((x) => ({ player_id: x.player_id, name: x.name, team: x.team, opp: x.opp, pos: x.pos || null, score: x.score, status: x.status || null, start_at: new Date(x.start_ms).toISOString(), game_id: x.game_id, sport })) }
    }
    out[sport] = o
  }))
  return out
}

export async function GET(request) {
  if (!(await admin())) return no()
  const q = new URL(request.url).searchParams
  const sport = String(q.get('sport') || 'nhl')
  const db = adminClient()
  if (!db) return Response.json({ error: 'no database' }, { status: 500 })
  const now = Date.now()
  if (q.get('product') === 'double') {
    const date = q.get('date')
    if (!date || !DATE_RE.test(date)) return Response.json({ error: 'Pick a date.' }, { status: 400 })
    const ws = await doubleWindows(date, now, true)
    const sports = CARD_SPORTS.map((k) => ({ sport: k, error: ws[k].error || null, first_start: ws[k].first_start || null, locks_at: ws[k].locks_at || null, open: ws[k].locks_at ? now < Date.parse(ws[k].locks_at) : false, field: ws[k].field || [] }))
    const entry = slimEntry(await donovanEntry(db, DOUBLE_SPORT, date, 'double'))
    const locksAt = Math.min(...sports.map((x) => (x.locks_at ? Date.parse(x.locks_at) : Infinity)))
    return Response.json({ product: 'double', date, sports, entry, earliest_lock: Number.isFinite(locksAt) ? new Date(locksAt).toISOString() : null, note: { lines: NOTE_MAX_LINES, chars: NOTE_MAX_CHARS } }, { headers: { 'Cache-Control': 'no-store' } })
  }
  if (!CARD_SPORTS.includes(sport)) return Response.json({ error: 'sport must be nhl, nfl or mlb' }, { status: 400 })
  const w = await loadWindows(sport, now, { ahead: AHEAD })
  if (!w.ok) return Response.json({ sport, windows: [], error: w.why }, { headers: { 'Cache-Control': 'no-store' } })
  const live = w.windows.filter(notOver(now))
  const windows = await Promise.all(live.map(async (win) => {
    const rawTwo = await donovanEntry(db, sport, win.card_date)
    const rawN = await donovanEntry(db, sport, win.card_date, 'n_man')
    const allRows = await donovanRowsOf(db, sport, win.card_date)                       // every verified-lane entry of the slate: straights, Two-Man, N-men (slots 1..3)
    const allLate = await donovanRowsOf(db, sport, win.card_date, LATE_LANE)
    return {
      card_date: win.card_date, label: win.label, games: win.games ?? null, first_start: new Date(win.first_start_ms).toISOString(), first_when: etWhen(new Date(win.first_start_ms).toISOString()),
      locks_at: new Date(lockAtOf(win.first_start_ms)).toISOString(),
      // ALWAYS OPEN: `open` is "on time" (the verified entry still possible); a form is offered either way, and a save after it is stored LATE
      // mode: on_time (before the lock) | lock_now (after the lock, before the first game: a save is verified and locks at that moment) | live (games under
      // way: a pick whose game has started is LATE, a pick whose game has not is still verified and locks at save)
      open: onTime(win, now), mode: onTime(win, now) ? 'on_time' : now < win.first_start_ms ? 'lock_now' : 'live',
      entry: slimEntry(rawTwo), late_entry: slimEntry(await donovanEntry(db, sport, win.card_date, 'two_man', CARD_VERSION, LATE_LANE)),
      n_entry: slimEntry(rawN), n_late_entry: slimEntry(await donovanEntry(db, sport, win.card_date, 'n_man', CARD_VERSION, LATE_LANE)),
      // POSTS TODAY (2026-10-12, up to 3 a day and sport): how many of his entries for this slate have gone out, and which (lib/card/post.js donovanPostsToday). A read failure shows nothing.
      posts: await donovanPostsToday(db, { sport, day: win.card_date, rows: allRows }).catch(() => null),
      // 2026-10-12: ALL of his entries for the slate (the form's slot chips), oldest saved first, and his LATE ones; `entry` / `n_entry` above stay the Two-Man and the first N-man
      entries: allRows.map(slimEntry), late_entries: allLate.map(slimEntry), slots: DON_SLOTS, max_posts: DON_MAX_POSTS,
    }
  }))
  const late = await lateEntries(db, { sport })
  const nLate = await lateEntries(db, { sport, product: 'n_man' })
  const sLate = await lateEntries(db, { sport, product: 'straight' })
  const date = q.get('date')
  let field = null
  let pricesOk = null
  if (date && DATE_RE.test(date)) {
    const win = live.find((x) => x.card_date === date)
    if (!win) return Response.json({ sport, windows, error: `no ${sport} games to come on ${date}` }, { headers: { 'Cache-Control': 'no-store' } })
    const c = await loadCandidates(sport, win, now, { all: true })
    if (!c.ok) return Response.json({ sport, windows, error: boardWhy(c.why, date) }, { headers: { 'Cache-Control': 'no-store' } })
    const prices = await loadAnytimePrices(db, sport, date, now).catch(() => null)
    pricesOk = Boolean(prices)
    const season = nhlSeasonOf(date)
    field = c.cands.slice().sort((a, b) => b.score - a.score).slice(0, PICKER_MAX).map((x) => pickerRow(x, { sport, price: prices?.get(String(x.player_id)) || null, now, season }))
  }
  return Response.json({
    sport, windows, field, prices_ok: pricesOk, now: new Date(now).toISOString(), note: { lines: NOTE_MAX_LINES, chars: NOTE_MAX_CHARS }, n_man: { min: NMAN_MIN, max: NMAN_MAX, units: NMAN_UNITS },
    late: { s_rows: sLate.rows.map(slimEntry), s_record: { graded: sLate.record.graded, hits: sLate.record.hits, misses: sLate.record.misses, voids: sLate.record.voids, pending: sLate.record.pending }, n_rows: nLate.rows.map(slimEntry), n_record: { graded: nLate.record.graded, hits: nLate.record.hits, misses: nLate.record.misses, voids: nLate.record.voids, pending: nLate.record.pending }, rows: late.rows.map(slimEntry), record: { graded: late.record.graded, hits: late.record.hits, misses: late.record.misses, voids: late.record.voids, pending: late.record.pending }, edit_min: LATE_EDIT_MIN },
  }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request) {
  if (!(await admin())) return no()
  if (!sameOriginJson(request)) return Response.json({ error: 'bad request' }, { status: 403 })      // CSRF: an admin write is a same-origin JSON request
  const db = adminClient()
  if (!db) return Response.json({ error: 'no database' }, { status: 500 })
  const body = await request.json().catch(() => ({}))
  if (body.product === 'double') {
    const date = String(body.date || '')
    if (!DATE_RE.test(date)) return Response.json({ error: 'Pick a card date.' }, { status: 400 })
    const now = Date.now()
    if (body.action === 'withdraw') {
      const r = await withdrawDonovan(db, { card_date: date, product: 'double' })
      return r.ok ? Response.json({ ok: true }) : Response.json({ error: r.error }, { status: 409 })
    }
    const picks = Array.isArray(body.picks) ? body.picks : []
    const ws = await doubleWindows(date, now, true)
    const fields = {}; const locks = {}
    for (const k of CARD_SPORTS) { if (ws[k]?.cands) fields[k] = ws[k].cands; if (ws[k]?.locks_at) locks[k] = Date.parse(ws[k].locks_at) }
    const made = donovanDoubleRow({ card_date: date, fields, picks, note: body.note, now, locks, version: CARD_VERSION })
    if (!made.ok) return Response.json({ error: made.error }, { status: 400 })
    const saved = await saveDonovan(db, made.row)
    if (!saved.ok) return Response.json({ error: saved.error }, { status: 409 })
    return Response.json({ ok: true, entry: slimEntry(made.row) })
  }
  const sport = String(body.sport || '')
  const date = String(body.date || '')
  const product = body.product === 'n_man' ? 'n_man' : body.product === 'straight' ? 'straight' : 'two_man'      // 'two_man' = his Two-Man exactly as before; 'n_man' = his 2-to-6-man; 'straight' = his one-player straight (2026-10-12)
  const reqSlot = body.slot == null || body.slot === '' ? null : Number(body.slot)
  if (reqSlot != null && (!Number.isInteger(reqSlot) || reqSlot < 1 || reqSlot > (product === 'two_man' ? 1 : DON_SLOTS))) return Response.json({ error: 'That slot is not one you can use.' }, { status: 400 })
  if (!CARD_SPORTS.includes(sport) || !DATE_RE.test(date)) return Response.json({ error: 'Pick a sport and a card date.' }, { status: 400 })
  const now = Date.now()
  const w = await loadWindows(sport, now, { ahead: AHEAD })
  if (!w.ok) return Response.json({ error: `The slate could not be read: ${w.why}` }, { status: 502 })
  const win = w.windows.filter(notOver(now)).find((x) => x.card_date === date)
  if (!win) return Response.json({ error: `No ${sport} games to come on ${date} (a slate that is over is not offered).` }, { status: 404 })
  const lockAtMs = lockAtOf(win.first_start_ms)
  if (body.action === 'withdraw') {
    // the on-time entry only before its lock (the database holds it too); a LATE entry only inside its typo window (the database holds that)
    if (body.lane !== 'late' && !onTime(win, now)) return Response.json({ error: 'The lock has passed; the entry is closed.' }, { status: 409 })
    const r = await withdrawDonovan(db, { sport, card_date: date, product, lane: body.lane === 'late' ? LATE_LANE : 'donovan', slot: reqSlot || 1 })
    return r.ok ? Response.json({ ok: true }) : Response.json({ error: r.error }, { status: 409 })
  }
  const c = await loadCandidates(sport, win, now, { all: true })
  if (!c.ok) return Response.json({ error: `The board could not be read: ${boardWhy(c.why, date)}` }, { status: 502 })
  const row0 = { sport, slate_key: win.slate_key, card_date: date, field: c.cands, playerIds: body.players, note: body.note, now, lockAtMs, version: CARD_VERSION, allowLate: true, cardName: body.card_name, product, units: product === 'n_man' ? body.units : null }
  let made = donovanRow({ ...row0, slot: 1 })
  if (!made.ok) return Response.json({ error: made.error }, { status: 400 })
  // THE SLOT (straights and N-men, 1..3 each, 2026-10-12): replacing an entry names its slot; a new one takes the next free slot of ITS lane (a LATE entry is its own lane). A Two-Man is always slot 1.
  if (product !== 'two_man') {
    const inLane = (await donovanRowsOf(db, sport, date, made.late ? LATE_LANE : 'donovan')).filter((r) => r.product === product)
    const used = new Set(inLane.map((r) => Number(r.slot)))
    const slot = reqSlot ?? [...Array(DON_SLOTS)].map((_, i) => i + 1).find((k) => !used.has(k))
    if (!slot) return Response.json({ error: `All ${DON_SLOTS} ${product === 'straight' ? 'straight' : 'N-man'} slots for this slate are used. Replace or withdraw one first.` }, { status: 409 })
    made = donovanRow({ ...row0, slot })
    if (!made.ok) return Response.json({ error: made.error }, { status: 400 })
  }
  // LOCKS AT SAVE is irreversible at once, so it is saved only when he has seen that (the form says so and sends confirm_lock)
  if (made.lockAtSave && body.confirm_lock !== true) return Response.json({ error: 'The lock has passed. This entry is still before your first game, so it is VERIFIED and locks the moment you save: it cannot be changed.', lock_now: true, needs_confirm: true }, { status: 409 })
  // A LATE entry is saved only when he has seen that it is late (the form says so and sends confirm_late); it is never the verified entry
  if (made.late && body.confirm_late !== true) return Response.json({ error: `This would be saved as a LATE entry (${made.lateWhy}): it is kept apart from the record and never posted.`, late: true, needs_confirm: true }, { status: 409 })
  // THE SAME CONFIRMATIONS for the N-man as for the Two-Man (above): nothing irreversible is saved without them
  const saved = await saveDonovan(db, made.row, { lockAtSave: made.lockAtSave })
  if (!saved.ok) return Response.json({ error: saved.error, needs_sql: saved.needsSql || undefined }, { status: 409 })
  // will it POST? (the cap is on POSTS, not on saving): the oldest DON_MAX_POSTS verified entries of the sport-day post, a later one is saved and public and not posted
  let will_post = !made.late
  if (will_post) {
    const rows = await donovanRowsOf(db, sport, date)
    const order = postOrder(rows.some((r) => r.product === made.row.product && r.slot === made.row.slot) ? rows : [...rows, { ...made.row, id: Number.MAX_SAFE_INTEGER }])
    will_post = order.findIndex((r) => donKey(r) === donKey(made.row)) < DON_MAX_POSTS
  }
  return Response.json({ ok: true, late: made.late, lock_now: made.lockAtSave, will_post, entry: slimEntry(made.row) })
}
