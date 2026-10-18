// GET /api/phone/calls?sport=mlb -- tonight's called players for the swipe deck on MOONSHOT Home (2026-10-18, PHONE-PARITY item 9a).
// The SAME hiding as /m and the front door, on the server (lib/members/hide.js gateCalls): a non-member gets the first four and every call whose game has
// started; the rest are counted, never sent. Public data only (pick_lock.json); no secret, nothing written. MLB, TUDDY (the week's TD calls) and LAMP (tonight's locked goal calls).
import { mlbTodayCalls, nflTodayCalls, nhlTodayCalls } from '../../../../lib/phone/todayCalls'
import { slateNight } from '../../../../lib/slateNight'
import { viewerIsMember } from '../../../../lib/members/viewer'
import { gateCalls, isOpenCall } from '../../../../lib/members/hide'

export const dynamic = 'force-dynamic'
const LOADERS = { mlb: mlbTodayCalls, nfl: nflTodayCalls, nhl: async () => nhlTodayCalls(await slateNight('nhl')) }   // a table, not a ternary: a sport that has a list gets one line here

export async function GET(req) {
  const sport = new URL(req.url).searchParams.get('sport') || 'mlb'
  const load = LOADERS[sport]
  if (!load) return Response.json({ items: [], hidden: 0, error: 'no list for this sport' }, { status: 404, headers: { 'Cache-Control': 'no-store' } })
  const raw = await load()
  if (!raw) return Response.json({ items: [], hidden: 0 }, { headers: { 'Cache-Control': 'no-store' } })
  const member = await viewerIsMember()
  const gated = gateCalls(raw.items, { member, byPlace: true, isPublic: (it) => !isOpenCall({ status: 'called', startMs: it.firstPitch }) })
  return Response.json({ items: gated.items, hidden: gated.hidden }, { headers: { 'Cache-Control': 'private, no-store' } })
}
