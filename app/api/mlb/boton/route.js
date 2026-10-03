// GET /api/mlb/boton?pid=665487 -- THE BOT ON HIM for one hitter: each role
// the bot gave him on the clean pregame record (lib/botOnHim.js), with n on
// every number, and the two badges. Built for every hitter once per 6 h.
import { botOnHimAll, botBadges } from '../../../../lib/botOnHim'
import { easternToday, shiftDay } from '../../../../lib/data'

export const dynamic = 'force-dynamic'

export async function GET(request) {
  const pid = new URL(request.url).searchParams.get('pid')
  if (!/^\d+$/.test(String(pid || ''))) return Response.json({ error: 'pid' }, { status: 400 })
  const through = shiftDay(easternToday(), -1)
  const all = await botOnHimAll(through).catch(() => null)
  if (!all) return Response.json({ available: false }, { status: 502 })
  const P = all.players[pid] || null
  return Response.json({
    available: true, since: all.since, through: all.through, nights: all.nights,
    player: P ? { name: P.name, team: P.team, games: P.games, roles: Object.fromEntries(Object.entries(P.roles).map(([k, R]) => [k, { all: R.all, vsL: R.vsL, vsR: R.vsR, home: R.home, away: R.away }])) } : null,
    badges: P ? botBadges(P) : [],
  }, { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=21600' } })
}
