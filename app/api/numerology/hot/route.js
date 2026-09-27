// NUMEROLOGY · HOT NUMBERS — GET /api/numerology/hot?sport=nfl|nhl|mlb
//
// BATCH-NUMEROLOGY step 6b, from numerology_numbers (written once per graded
// night by the product's own tick): TODAY = the latest recorded night's top
// values above chance; TRENDING = the same over the last 7 nights (21 days
// for football -- a few game days), summed. A value needs 2+ events to be
// called hot. Pattern watching; never a score. Empty lists until nights exist.
import { adminClient } from '../../../../lib/nhl/db'
import { SPORT_KEYS } from '../../../../lib/routes'
import { hottest, KIND_LABEL } from '../../../../lib/numerology/hotNumbers'
import { easternToday } from '../../../../lib/data'

export const dynamic = 'force-dynamic'
const WINDOW_DAYS = { nfl: 21, nhl: 7, mlb: 7 }

export async function GET(request) {
  const sport = String(new URL(request.url).searchParams.get('sport') || '').toLowerCase()
  if (!SPORT_KEYS.includes(sport)) return Response.json({ error: `sport must be one of ${SPORT_KEYS.join(', ')}` }, { status: 400 })
  const db = adminClient()
  if (!db) return Response.json({ sport, today: null, trending: [], configured: false })
  const today = easternToday()
  const since = new Date(Date.parse(`${today}T12:00:00Z`) - (WINDOW_DAYS[sport] || 7) * 864e5).toISOString().slice(0, 10)
  const { data, error } = await db.from('numerology_numbers').select('day, kind, value, events, expected, players').eq('sport', sport).gte('day', since).lte('day', today)
    .order('day', { ascending: false }).limit(5000)
  if (error) return Response.json({ sport, error: error.message }, { status: 502 })
  const rows = data || []
  const latest = rows[0]?.day || null
  const label = (r) => ({ ...r, label: KIND_LABEL[r.kind] || r.kind })
  const sum = new Map()
  for (const r of rows) {
    const k = `${r.kind}|${r.value}`
    const o = sum.get(k) || { kind: r.kind, value: r.value, events: 0, expected: 0, players: 0 }
    o.events += r.events; o.expected += Number(r.expected); o.players += r.players
    sum.set(k, o)
  }
  return Response.json({
    sport,
    today: latest ? { day: latest, hot: hottest(rows.filter((r) => r.day === latest).map((r) => ({ ...r, expected: Number(r.expected) }))).map(label) } : null,
    trending: hottest([...sum.values()].map((o) => ({ ...o, expected: Math.round(o.expected * 100) / 100 }))).map(label),
    nights: new Set(rows.map((r) => r.day)).size, windowDays: WINDOW_DAYS[sport] || 7, configured: true,
  }, { headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=1800' } })
}
