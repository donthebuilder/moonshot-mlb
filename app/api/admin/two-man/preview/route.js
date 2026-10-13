// POST /api/admin/two-man/preview   { sport, date, players:[id,id] }   -> the Two-Man DUAL CARD (PNG) drawn from the form's current selection. ADMIN ONLY.
// POST ... { product:'n_man', sport, date, players:[2 to 6 ids], card_name?, units? }   -> HIS N-MAN CARD (lib/cards/nManCard.js), shaped by the same donovanRow, stored nowhere.
// "So he sees exactly what posts" (Donovan, 2026-10-12). It shapes the row with lib/card/core.js donovanRow (the same function the save uses), draws it with
// the same renderer the post uses (lib/cards/dualData.js dualOfRow + dualCard.js renderDual), and STORES NOTHING: no card_calls write, no post, no cache.
// A late selection (a game has started, or the lock has passed) is drawn plainly labelled "LATE" and carries no serial, because that is what it is.
// Not signed in / not an admin (a confirmed, allow-listed email): 404, like every admin route. A cross-site or non-JSON request: 403.
import { hasSupabaseConfig } from '../../../../../lib/supabase/config'
import { createSupabaseServerClient } from '../../../../../lib/supabase/server'
import { adminClient } from '../../../../../lib/supabase/admin'
import { isAdminUser, adminDenyReason, sameOriginJson } from '../../../../../lib/admin'
import { CARD_SPORTS, CARD_VERSION, lockAtOf, donovanRow } from '../../../../../lib/card/core'
import { loadWindows, loadCandidates } from '../../../../../lib/card/sources'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const json = (body, status) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
const PREVIEW_NOTE = 'Preview.'      // donovanRow wants a note; the dual card never prints one, and nothing here is stored

async function admin() {
  if (!hasSupabaseConfig()) return null
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user && isAdminUser(user)) return user
  console.warn(`[admin/two-man preview] 404: ${adminDenyReason(user)}`)
  return null
}

export async function POST(request) {
  if (!(await admin())) return json({ error: 'not found' }, 404)
  if (!sameOriginJson(request)) return json({ error: 'bad request' }, 403)
  const body = await request.json().catch(() => ({}))
  const sport = String(body.sport || '')
  const date = String(body.date || '')
  if (!CARD_SPORTS.includes(sport) || !DATE_RE.test(date)) return json({ error: 'Pick a sport and a card date.' }, 400)
  const ids = Array.isArray(body.players) ? body.players.map((v) => String(v == null ? '' : v)) : []
  const nman = body.product === 'n_man'
  if (!nman && ids.length !== 2) return json({ error: 'Pick two players to see the card.' }, 400)
  const db = adminClient()
  if (!db) return json({ error: 'no database' }, 500)
  const now = Date.now()
  const w = await loadWindows(sport, now, { ahead: 2 })
  if (!w.ok) return json({ error: `The slate could not be read: ${w.why}` }, 502)
  const win = w.windows.find((x) => x.card_date === date)
  if (!win) return json({ error: `No ${sport} games on ${date}.` }, 404)
  const c = await loadCandidates(sport, win, now, { all: true })
  if (!c.ok) return json({ error: `The board could not be read: ${c.why}` }, 502)
  const made = donovanRow({ sport, slate_key: win.slate_key, card_date: date, field: c.cands, playerIds: ids, note: PREVIEW_NOTE, cardName: body.card_name, now, lockAtMs: lockAtOf(win.first_start_ms), version: CARD_VERSION, allowLate: true, product: nman ? 'n_man' : 'two_man', units: nman ? body.units : null })
  if (!made.ok) return json({ error: made.error }, 400)
  try {
    if (nman) {
      const { nManOfRow, previewNManSerial } = await import('../../../../../lib/cards/nManData')
      const { renderNMan } = await import('../../../../../lib/cards/nManCard')
      const serial = made.late ? null : await previewNManSerial(db, { sport, cardDate: date, locksAt: made.row.locks_at })
      const card = await nManOfRow({ sport, row: made.row, db, serial, label: made.late ? 'late' : null })
      const png = await renderNMan(card, { width: 540 })
      return new Response(png, { status: 200, headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store', 'X-Entry': made.late ? 'late' : 'on-time' } })
    }
    const { dualOfRow, previewSerial } = await import('../../../../../lib/cards/dualData')
    const { renderDual } = await import('../../../../../lib/cards/dualCard')
    const serial = made.late ? null : await previewSerial(db, { sport, cardDate: date, locksAt: made.row.locks_at })
    const dual = await dualOfRow({ sport, row: made.row, db, serial, label: made.late ? 'late' : null })
    const png = await renderDual(dual, { width: 540 })
    return new Response(png, { status: 200, headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store', 'X-Entry': made.late ? 'late' : 'on-time' } })
  } catch (e) {
    console.error(`[admin/two-man preview] ${sport}/${date}: ${e?.message || e}`)
    return json({ error: 'The card could not be drawn.' }, 502)
  }
}
