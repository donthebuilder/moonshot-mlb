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
//   HIS DOUBLE (optional, daily; two players from two different sports, free to show after the lock with his note):
//   GET  ?product=double&date=YYYY-MM-DD    each sport's window + board for that day, the earlier lock, and his entry if he made one
//   POST { product:'double', date, picks:[{sport,player_id},{sport,player_id}], note }   save (or replace, before the EARLIER of the two locks)
//   POST { product:'double', date, action:'withdraw' }
// The rules are lib/card/core.js donovanRow; the database trigger (supabase/migrations/202610101000_card_calls.sql) is the backstop.
import { hasSupabaseConfig } from '../../../../lib/supabase/config'
import { createSupabaseServerClient } from '../../../../lib/supabase/server'
import { adminClient } from '../../../../lib/supabase/admin'
import { isAdminUser, adminDenyReason, sameOriginJson } from '../../../../lib/admin'
import { CARD_SPORTS, CARD_VERSION, DOUBLE_SPORT, LATE_LANE, LATE_EDIT_MIN, lockAtOf, donovanRow, donovanDoubleRow, NOTE_MAX_LINES, NOTE_MAX_CHARS } from '../../../../lib/card/core'
import { loadWindows, loadCandidates, loadAnytimePrices } from '../../../../lib/card/sources'
import { saveDonovan, withdrawDonovan, donovanEntry, lateEntries } from '../../../../lib/card/store'
import { pickerRow, nhlSeasonOf, etWhen } from '../../../../lib/card/picker'

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
  card_date: r.card_date, sport: r.sport, locks_at: r.locks_at, start_at: r.start_at, note: r.note, lane: r.lane, late: r.lane === LATE_LANE,
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
  const windows = await Promise.all(live.map(async (win) => ({
    card_date: win.card_date, label: win.label, games: win.games ?? null, first_start: new Date(win.first_start_ms).toISOString(), first_when: etWhen(new Date(win.first_start_ms).toISOString()),
    locks_at: new Date(lockAtOf(win.first_start_ms)).toISOString(),
    // ALWAYS OPEN: `open` is "on time" (the verified entry still possible); a form is offered either way, and a save after it is stored LATE
    // mode: on_time (before the lock) | lock_now (after the lock, before the first game: a save is verified and locks at that moment) | live (games under
    // way: a pick whose game has started is LATE, a pick whose game has not is still verified and locks at save)
    open: onTime(win, now), mode: onTime(win, now) ? 'on_time' : now < win.first_start_ms ? 'lock_now' : 'live',
    entry: slimEntry(await donovanEntry(db, sport, win.card_date)), late_entry: slimEntry(await donovanEntry(db, sport, win.card_date, 'two_man', CARD_VERSION, LATE_LANE)),
  })))
  const late = await lateEntries(db, { sport })
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
    sport, windows, field, prices_ok: pricesOk, now: new Date(now).toISOString(), note: { lines: NOTE_MAX_LINES, chars: NOTE_MAX_CHARS },
    late: { rows: late.rows.map(slimEntry), record: { graded: late.record.graded, hits: late.record.hits, misses: late.record.misses, voids: late.record.voids, pending: late.record.pending }, edit_min: LATE_EDIT_MIN },
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
    const r = await withdrawDonovan(db, { sport, card_date: date, lane: body.lane === 'late' ? LATE_LANE : 'donovan' })
    return r.ok ? Response.json({ ok: true }) : Response.json({ error: r.error }, { status: 409 })
  }
  const c = await loadCandidates(sport, win, now, { all: true })
  if (!c.ok) return Response.json({ error: `The board could not be read: ${boardWhy(c.why, date)}` }, { status: 502 })
  const made = donovanRow({ sport, slate_key: win.slate_key, card_date: date, field: c.cands, playerIds: body.players, note: body.note, now, lockAtMs, version: CARD_VERSION, allowLate: true })
  if (!made.ok) return Response.json({ error: made.error }, { status: 400 })
  // LOCKS AT SAVE is irreversible at once, so it is saved only when he has seen that (the form says so and sends confirm_lock)
  if (made.lockAtSave && body.confirm_lock !== true) return Response.json({ error: 'The lock has passed. This entry is still before your first game, so it is VERIFIED and locks the moment you save: it cannot be changed.', lock_now: true, needs_confirm: true }, { status: 409 })
  // A LATE entry is saved only when he has seen that it is late (the form says so and sends confirm_late); it is never the verified entry
  if (made.late && body.confirm_late !== true) return Response.json({ error: `This would be saved as a LATE entry (${made.lateWhy}): it is kept apart from the record and never posted.`, late: true, needs_confirm: true }, { status: 409 })
  const saved = await saveDonovan(db, made.row, { lockAtSave: made.lockAtSave })
  if (!saved.ok) return Response.json({ error: saved.error, needs_sql: saved.needsSql || undefined }, { status: 409 })
  return Response.json({ ok: true, late: made.late, lock_now: made.lockAtSave, entry: slimEntry(made.row) })
}
