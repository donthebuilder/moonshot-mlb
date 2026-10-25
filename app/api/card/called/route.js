// GET /api/card/called?sport=nba|nhl|nfl&game=<game id>[&part=1][&date=YYYY-MM-DD][&w=360|540|720|1080]
// One game's CALLED card as a PNG (lib/cards/calledCard.js, on the N-man card), from the same gather as "Copy called"
// (lib/calledGather.js). MEMBERS ONLY: before the lock a CALLED pick is members' (components/MemberGate), so a viewer who is not
// a signed-in member gets 403 and nothing is drawn (lib/members/viewer.js fails closed). Per viewer: never cached by the CDN.
import { viewerIsMember } from '../../../../lib/members/viewer'
import { nbaCalled, nhlCalled, nflCalled } from '../../../../lib/calledGather'
import { groupCalled } from '../../../../lib/calledList'
import { calledModels, renderCalled } from '../../../../lib/cards/calledCard'
import { adapterFor } from '../../../../lib/cards/registry'
import { legModel } from '../../../../lib/cards/dayData'
import { brandOf, prettyDay } from '../../../../lib/cards/model'
import { fetchNfl, nflSlatePaths, nflPicksPaths, nflGameCallsPaths } from '../../../../lib/nfl/dataSource'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

const WIDTHS = [360, 540, 720, 1080]
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const json = (body, status) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } })

// each sport's gather, by key (the registry rule: a lookup, no sport ternaries)
const GATHER = {
  nba: (getJSON, date, base) => nbaCalled(getJSON, date, base),
  nhl: (getJSON, date, base) => nhlCalled(getJSON, date, base),
  nfl: async () => {
    const [data, picks, calls] = await Promise.all([fetchNfl(nflSlatePaths()), fetchNfl(nflPicksPaths()), fetchNfl(nflGameCallsPaths()).catch(() => null)])
    return nflCalled(data, picks, calls)
  },
}

export async function GET(request) {
  const url = new URL(request.url)
  const q = url.searchParams
  const sport = String(q.get('sport') || '').toLowerCase()
  if (!GATHER[sport]) return json({ error: 'NOT FOUND', detail: 'no CALLED card for that sport' }, 404)
  const game = String(q.get('game') || '')
  if (!game) return json({ error: 'BAD REQUEST', detail: 'game is required' }, 400)
  const date = q.get('date')
  if (date && !DATE_RE.test(date)) return json({ error: 'BAD REQUEST', detail: 'bad date' }, 400)
  if (!(await viewerIsMember())) return json({ error: 'MEMBERS ONLY', detail: 'the CALLED card is for members' }, 403)
  const part = Math.max(1, Number(q.get('part')) || 1)
  const w = Number(q.get('w'))
  const width = WIDTHS.includes(w) ? w : 1080

  const getJSON = (u) => fetch(u, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
  const r = await GATHER[sport](getJSON, date, url.origin)
  const g = groupCalled(r?.entries || []).find((x) => String(x.key) === game)
  if (!g || !g.men.length) return json({ error: 'NOT FOUND', detail: 'nobody is CALLED in that game' }, 404)
  const adapter = await adapterFor(sport)
  if (!adapter) return json({ error: 'NOT FOUND', detail: 'no cards for that sport' }, 404)
  const men = await Promise.all(g.men.map(async (x) => ({ m: await legModel(sport, { player_id: x.id, name: x.name, team: x.team, opp: x.opp, game_date: x.date }, adapter), lanes: x.lanes })))
  const day = g.men[0]?.date || r.day || null
  const models = calledModels({ sport, brandName: brandOf(sport).name, dayWord: day ? prettyDay(day) : '', title: g.title, start: g.start, weekday: Boolean(r.weekday), men })
  const d = models[part - 1]
  if (!d) return json({ error: 'NOT FOUND', detail: `that game has ${models.length} card${models.length === 1 ? '' : 's'}` }, 404)
  const png = await renderCalled(d, { width })
  return new Response(png, { status: 200, headers: { 'Content-Type': 'image/png', 'Cache-Control': 'private, no-store' } })
}
