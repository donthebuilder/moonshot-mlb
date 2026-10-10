// /api/admin/two-man: DONOVAN'S TWO-MAN, admin only (signed in AND the account's email in ADMIN_EMAILS; anyone else gets a 404).
//   GET  ?sport=nhl|nfl|mlb                 the card windows of the slate, each with its lock time and Donovan's entry if he made one
//   GET  ?sport=&date=YYYY-MM-DD            + the picker: the window's scored board (real player ids), best score first
//   POST { sport, date, players:[id,id], note }       save (or replace, before the lock) his two-man; refused once any game has started or the lock passed
//   POST { sport, date, action:'withdraw' }           withdraw his open entry (the database only allows it before the lock)
// The rules are lib/card/core.js donovanRow; the database trigger (supabase/migrations/202610101000_card_calls.sql) is the backstop.
import { hasSupabaseConfig } from '../../../../lib/supabase/config'
import { createSupabaseServerClient } from '../../../../lib/supabase/server'
import { adminClient } from '../../../../lib/supabase/admin'
import { isAdminEmail } from '../../../../lib/admin'
import { CARD_SPORTS, CARD_VERSION, lockAtOf, donovanRow, NOTE_MAX_LINES, NOTE_MAX_CHARS } from '../../../../lib/card/core'
import { loadWindows, loadCandidates } from '../../../../lib/card/sources'
import { saveDonovan, withdrawDonovan, donovanEntry } from '../../../../lib/card/store'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const no = () => Response.json({ error: 'not found' }, { status: 404 })
const PICKER_MAX = 150

async function admin() {
  if (!hasSupabaseConfig()) return null
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user && isAdminEmail(user.email) ? user : null
}

const slimEntry = (r) => (r ? { card_date: r.card_date, locks_at: r.locks_at, start_at: r.start_at, note: r.note, legs: r.legs.map((l) => ({ player_id: l.player_id, name: l.name, team: l.team, opp: l.opp, game_id: l.game_id, start_at: l.start_at })), result: r.result } : null)

export async function GET(request) {
  if (!(await admin())) return no()
  const q = new URL(request.url).searchParams
  const sport = String(q.get('sport') || 'nhl')
  if (!CARD_SPORTS.includes(sport)) return Response.json({ error: 'sport must be nhl, nfl or mlb' }, { status: 400 })
  const db = adminClient()
  if (!db) return Response.json({ error: 'no database' }, { status: 500 })
  const now = Date.now()
  const w = await loadWindows(sport, now)
  if (!w.ok) return Response.json({ sport, windows: [], error: w.why }, { headers: { 'Cache-Control': 'no-store' } })
  const windows = await Promise.all(w.windows.map(async (win) => ({
    card_date: win.card_date, label: win.label, first_start: new Date(win.first_start_ms).toISOString(), locks_at: new Date(lockAtOf(win.first_start_ms)).toISOString(),
    open: now < lockAtOf(win.first_start_ms) && now < win.first_start_ms, entry: slimEntry(await donovanEntry(db, sport, win.card_date)),
  })))
  const date = q.get('date')
  let field = null
  if (date && DATE_RE.test(date)) {
    const win = w.windows.find((x) => x.card_date === date)
    if (!win) return Response.json({ sport, windows, error: `no ${sport} games on ${date}` }, { headers: { 'Cache-Control': 'no-store' } })
    const c = await loadCandidates(sport, win, now, { all: true })
    if (!c.ok) return Response.json({ sport, windows, error: c.why }, { headers: { 'Cache-Control': 'no-store' } })
    field = c.cands.filter((x) => x.start_ms > now).sort((a, b) => b.score - a.score).slice(0, PICKER_MAX)
      .map((x) => ({ player_id: x.player_id, name: x.name, team: x.team, opp: x.opp, pos: x.pos || null, score: x.score, status: x.status || null, start_at: new Date(x.start_ms).toISOString(), game_id: x.game_id }))
  }
  return Response.json({ sport, windows, field, note: { lines: NOTE_MAX_LINES, chars: NOTE_MAX_CHARS } }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request) {
  if (!(await admin())) return no()
  const db = adminClient()
  if (!db) return Response.json({ error: 'no database' }, { status: 500 })
  const body = await request.json().catch(() => ({}))
  const sport = String(body.sport || '')
  const date = String(body.date || '')
  if (!CARD_SPORTS.includes(sport) || !DATE_RE.test(date)) return Response.json({ error: 'Pick a sport and a card date.' }, { status: 400 })
  const now = Date.now()
  const w = await loadWindows(sport, now)
  if (!w.ok) return Response.json({ error: `The slate could not be read: ${w.why}` }, { status: 502 })
  const win = w.windows.find((x) => x.card_date === date)
  if (!win) return Response.json({ error: `No ${sport} games on ${date}.` }, { status: 404 })
  const lockAtMs = lockAtOf(win.first_start_ms)
  if (now >= lockAtMs || now >= win.first_start_ms) return Response.json({ error: 'The lock has passed; the entry is closed.' }, { status: 409 })
  if (body.action === 'withdraw') {
    const r = await withdrawDonovan(db, { sport, card_date: date })
    return r.ok ? Response.json({ ok: true }) : Response.json({ error: r.error }, { status: 409 })
  }
  const c = await loadCandidates(sport, win, now, { all: true })
  if (!c.ok) return Response.json({ error: `The board could not be read: ${c.why}` }, { status: 502 })
  const made = donovanRow({ sport, slate_key: win.slate_key, card_date: date, field: c.cands, playerIds: body.players, note: body.note, now, lockAtMs, version: CARD_VERSION })
  if (!made.ok) return Response.json({ error: made.error }, { status: 400 })
  const saved = await saveDonovan(db, made.row)
  if (!saved.ok) return Response.json({ error: saved.error }, { status: 409 })
  return Response.json({ ok: true, entry: slimEntry(made.row) })
}
