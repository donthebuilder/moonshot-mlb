// 🔢 MLB NUMEROLOGY, RECORDED AND GRADED (2026-09-27, HOT-NUMBERS-FIX item 1).
// NFL and NHL have written their nights since step 6; MLB never did
// (homers/tick never called writeNight), so MOONSHOT's Hot Numbers had no
// rows at all. Same record, same rules (lib/numerology/record.js):
//
// WRITE  tonight's board players whose game has NOT started (never at or
//        after first pitch), once each -- first write wins. Jersey and birth
//        date come from one batched MLB people call for the players not yet
//        written; the per-instance memo keeps a warm tick to zero reads.
// GRADE  yesterday's players, from 3am ET (the caller gates): hit = homered
//        (homer_feed, keyed on the slate's own day). `played` isn't in the
//        feed, so it stays null and the base rate is over everyone eligible,
//        as on NFL. Then the lane summary and the Hot Numbers night, once.
// Server only. Never in a score, a board or a rank.
import { fromMlb } from './adapters'
import { writeNight, gradeNight, refreshLaneNights, writeNumbersNight, ELIGIBLE } from './record'

const PEOPLE = 'https://statsapi.mlb.com/api/v1/people'
const shift = (ymd, d) => new Date(Date.parse(`${ymd}T12:00:00Z`) + d * 864e5).toISOString().slice(0, 10)

/** Map(id -> { name, primaryNumber, birthDate }) for MLBAM ids, 100 per call. A failed batch is left out. */
export async function peopleInfo(ids) {
  const out = new Map()
  const list = [...new Set((ids || []).map(String).filter((x) => /^\d+$/.test(x)))]
  for (let i = 0; i < list.length; i += 100) {
    try {
      const r = await fetch(`${PEOPLE}?personIds=${list.slice(i, i + 100).join(',')}&fields=people,id,fullName,primaryNumber,birthDate`, { cache: 'no-store' })
      if (!r.ok) continue
      const j = await r.json()
      for (const p of j?.people || []) out.set(String(p.id), { name: p.fullName || null, primaryNumber: p.primaryNumber ?? null, birthDate: p.birthDate || null })
    } catch { /* that batch sits out */ }
  }
  return out
}

let _written = { day: '', ids: new Set() }

/** rows: tonight's board rows (player_id, name, team, opponent, season_hr, game_time). */
export async function mlbNumerologyWrite(db, day, rows, now = Date.now()) {
  if (_written.day !== day) {
    const { data, error } = await db.from('numerology_log').select('player_id').eq('sport', 'mlb').eq('day', day).eq('lane', ELIGIBLE).limit(5000)
    if (error) throw new Error(`numerology_log read: ${error.message}`)
    _written = { day, ids: new Set((data || []).map((r) => String(r.player_id))) }
  }
  const byId = new Map()
  for (const r of rows || []) {
    const id = String(r?.player_id ?? '')
    const t = Date.parse(r?.game_time || '')
    if (!/^\d+$/.test(id) || !Number.isFinite(t) || t <= now || _written.ids.has(id) || byId.has(id)) continue
    byId.set(id, r)
  }
  if (!byId.size) return 'nothing new'
  const info = await peopleInfo([...byId.keys()])
  const players = [...byId].map(([id, r]) => { const a = fromMlb(r, info.get(id) || null); return a ? { player_id: id, ...a } : null }).filter(Boolean)
  const res = await writeNight(db, 'mlb', day, players)
  for (const id of byId.keys()) _written.ids.add(id)
  return res
}

/** Grade `day - 1` once its players are open. Returns null when nothing is open. */
let _gradedDay = ''
export async function mlbNumerologyGrade(db, day) {
  const yday = shift(day, -1)
  if (_gradedDay === yday) return null
  const { data: open, error } = await db.from('numerology_log').select('player_id, name').eq('sport', 'mlb').eq('day', yday).eq('lane', ELIGIBLE).is('graded_at', null).limit(5000)
  if (error) throw new Error(`numerology_log read: ${error.message}`)
  if (!open?.length) { _gradedDay = yday; return null }
  const { data: homers, error: hErr } = await db.from('homer_feed').select('player_id').eq('day', yday)
  if (hErr) throw new Error(`homer_feed read: ${hErr.message}`)
  const hit = new Set((homers || []).map((r) => String(r.player_id)))
  const results = new Map(open.map((r) => [String(r.player_id), { played: null, hit: hit.has(String(r.player_id)) }]))
  const graded = await gradeNight(db, 'mlb', yday, results)
  await refreshLaneNights(db, 'mlb', yday)
  // HOT NUMBERS: that night's recorded players against its homers, once.
  const info = await peopleInfo(open.map((r) => r.player_id))
  const players = open.map((r) => { const p = info.get(String(r.player_id)); return { player_id: String(r.player_id), ...fromMlb({ name: r.name || p?.name }, p || null) } })
  const numbers = players.length ? await writeNumbersNight(db, 'mlb', yday, players, hit) : 'no players'
  _gradedDay = yday
  return { day: yday, graded, numbers }
}
