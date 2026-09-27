// NUMEROLOGY · HOT NUMBERS — GET /api/numerology/hot?sport=nfl|nhl|mlb
//
// BATCH-NUMEROLOGY step 6b, from numerology_numbers (written once per graded
// night by the product's own tick): TODAY = the latest recorded night's top
// values above chance; TRENDING = the same over the last 7 nights (21 days
// for football -- a few game days), summed. A value needs 2+ events to be
// called hot. Pattern watching; never a score. Empty lists until nights exist.
import { adminClient } from '../../../../lib/nhl/db'
import { SPORT_KEYS } from '../../../../lib/routes'
import { hottest, numbersNight, KIND_LABEL } from '../../../../lib/numerology/hotNumbers'
import { ELIGIBLE } from '../../../../lib/numerology/record'
import { easternToday } from '../../../../lib/data'

export const dynamic = 'force-dynamic'
const WINDOW_DAYS = { nfl: 21, nhl: 7, mlb: 7 }
// Each product's event table, keyed on the game's own day; the column that
// matches numerology_log.player_id. A goal later overturned doesn't count.
const EVENTS = {
  mlb: { table: 'homer_feed', col: 'player_id' },
  nfl: { table: 'nfl_td_feed', col: 'gsis_id' },
  nhl: { table: 'lamp_goal_feed', col: 'player_id', live: (q) => q.is('overturned_at', null) },
}

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
  // TONIGHT, LIVE (HOT-NUMBERS-FIX item 2): until tonight is graded, count
  // the events so far (this sport's event table, the game's own day) against
  // tonight's PREGAME recorded players and their numbers (the eligible rows'
  // text). Marked "so far"; the graded night replaces it. FIRST (item 4): with
  // no night graded yet, which night is first on record, from the log.
  let live = null
  let first = null
  if (latest !== today) {
    const { data: elig } = await db.from('numerology_log').select('player_id, name, team, text').eq('sport', sport).eq('day', today).eq('lane', ELIGIBLE).limit(5000)
    const players = (elig || []).map((r) => { try { const n = JSON.parse(r.text || 'null'); return n ? { player_id: String(r.player_id), name: r.name, jersey: n.jersey, birthDate: n.birthDate } : null } catch { return null } }).filter(Boolean)
    const ev = EVENTS[sport]
    if (players.length && ev) {
      let q = db.from(ev.table).select(ev.col).eq('day', today)
      if (ev.live) q = ev.live(q)
      const { data: evRows } = await q.limit(2000)
      const hits = new Set((evRows || []).map((r) => String(r[ev.col])))
      const { rows: nightRows, events } = numbersNight(players, hits, today)
      if (events) live = { day: today, events, players: players.length, hot: hottest(nightRows).map(label) }
    }
    if (!rows.length) {
      const { data: next } = await db.from('numerology_log').select('day, team').eq('sport', sport).eq('lane', ELIGIBLE).gte('day', today).order('day', { ascending: true }).limit(2000)
      const d = next?.[0]?.day
      if (d) {
        const onDay = next.filter((r) => r.day === d)
        first = { day: d, players: onDay.length, teams: [...new Set(onDay.map((r) => r.team).filter(Boolean))].sort() }
      }
    }
  }
  return Response.json({
    sport, live, first,
    today: latest ? { day: latest, hot: hottest(rows.filter((r) => r.day === latest).map((r) => ({ ...r, expected: Number(r.expected) }))).map(label) } : null,
    trending: hottest([...sum.values()].map((o) => ({ ...o, expected: Math.round(o.expected * 100) / 100 }))).map(label),
    nights: new Set(rows.map((r) => r.day)).size, windowDays: WINDOW_DAYS[sport] || 7, configured: true,
  }, { headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=1800' } })
}
