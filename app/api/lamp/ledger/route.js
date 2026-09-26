// LAMP · LEDGER — GET /api/lamp/ledger?date=YYYY-MM-DD | ?days=N
//
// Every scorer on a locked, graded night, CALLED / ON THE BOARD / NOT ON THE
// BOARD from the record (lib/record/nhl.js), with the shot type and strength
// from lamp_shots (lib/nhl/ledger.js). ?date= is one night (default: the
// latest graded one); ?days= is the regular-season window for the season
// block and per-player history. Preseason is labelled and kept out of it.
import { easternToday } from '../../../../lib/data'
import { validDate } from '../../../../lib/nhl/api'
import { readLedgerNight, readLedgerSeason } from '../../../../lib/nhl/ledger'
import { ok, bad, delayed } from '../../../../lib/nhl/respond'

export const dynamic = 'force-dynamic'

export async function GET(request) {
  const q = new URL(request.url).searchParams
  const date = q.get('date'); const days = Number(q.get('days'))
  if (date && !validDate(date)) return bad('date must be a real YYYY-MM-DD day')
  try {
    if (q.has('days')) {
      if (!Number.isInteger(days) || days < 1 || days > 400) return bad('days must be 1..400')
      return ok({ season: await readLedgerSeason(days, easternToday()), fetchedAt: new Date().toISOString() }, 300)
    }
    return ok({ ...(await readLedgerNight(date || null)), fetchedAt: new Date().toISOString() }, 300)
  } catch (e) {
    return delayed(`ledger ${date || days || 'latest'}`, e)
  }
}
