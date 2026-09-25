// LAMP · BOARD — GET /api/lamp/board?date=YYYY-MM-DD
//
// Tonight's goal board as the record has it — lib/nhl/boardRead.js does
// the reading (locked rows, else a live PREVIEW flagged as such); this is
// the HTTP face of it, cached a minute at the edge.
import { easternToday } from '../../../../lib/data'
import { validDate } from '../../../../lib/nhl/api'
import { readBoard } from '../../../../lib/nhl/boardRead'
import { ok, bad, delayed } from '../../../../lib/nhl/respond'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const date = searchParams.get('date') || easternToday()
  if (!validDate(date)) return bad('date must be a real YYYY-MM-DD day')
  try {
    const board = await readBoard(date)
    return ok({ ...board, fetchedAt: new Date().toISOString() }, 60)
  } catch (e) {
    return delayed(`board ${date}`, e)
  }
}
