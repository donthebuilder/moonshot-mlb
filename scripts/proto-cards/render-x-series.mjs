// RENDER THE X SERIES PROTOTYPES (Donovan, 2026-10-20: "lets build proto types"): the five Film Room pictures and both versions of The Five,
// from REAL current data, to PNG files and one text file of the posts. Prototype only: nothing here is imported by app/, nothing deploys.
//   node --import ./scripts/proto-cards/_loader.mjs scripts/proto-cards/render-x-series.mjs <outDir> [from] [to]
// Needs network: the live site's public boards (LAMP, BUCKETS), the TUDDY week file (data branch), the public call record (/api/record/calls).
//   THE FIVE    tonight's real CALLED men (the prototype stands in for a weekend: the post would go Friday after the first NHL/NBA lock)
//   FILM ROOM   the real line from the public call record of the nights [from..to] (production reads the stored night receipts instead)
import { mkdirSync, writeFileSync } from 'node:fs'
import { nhlSlate } from '../../lib/posts/nhl.js'
import { nbaSlate } from '../../lib/posts/nba.js'
import { nflSlate } from '../../lib/posts/nfl.js'
import { fetchNfl, nflPicksLooksReal, nflPicksPaths, nflSlateLooksReal, nflSlatePaths } from '../../lib/nfl/dataSource.js'
import { nbaHeadshot } from '../../lib/nba/teams.js'
import { nflHeadshot } from '../../lib/nfl/nflAssets.js'
import { headshotIdFor } from '../../lib/nfl/headshotIds.js'
import { inline } from '../../lib/cards/cardKit.js'
import { TOPICS, filmData, filmRoomText } from '../../lib/posts/filmRoom.js'
import { pickFiveA, pickFiveB, fiveText } from '../../lib/posts/theFive.js'
import { filmRoomPoster, fivePoster } from '../../lib/cards/proto/xSeriesCards.js'

const OUT = process.argv[2] || './x-series-proto'
const FROM = process.argv[3] || '2026-10-13'
const TO = process.argv[4] || '2026-10-19'
const SITE = 'https://dashnetwork.vercel.app'
const DAY = '2026-10-20'
mkdirSync(OUT, { recursive: true })
const getJson = async (u) => { const r = await fetch(u); if (!r.ok) throw new Error(`${u}: ${r.status}`); return r.json() }
const notes = []

// ── THE FIVE: the real candidates, every sport the boards have tonight ──
const [nhlBoard, nbaBoard] = await Promise.all([getJson(`${SITE}/api/lamp/board?date=${DAY}`), getJson(`${SITE}/api/buckets/board?date=${DAY}&market=pts`)])
const [nflData, nflPicks] = await Promise.all([fetchNfl(nflSlatePaths(), nflSlateLooksReal), fetchNfl(nflPicksPaths(), nflPicksLooksReal)])
// the prototype runs after puck drop: "game already started" is the only problem cleared, so tonight's calls stand in for a Friday's
const clearStarted = (s) => ({ ...s, cands: s.cands.map((c) => (c.problem?.reason === 'game already started' ? { ...c, problem: null } : c)) })
const sports = [clearStarted(nflSlate({ data: nflData, picks: nflPicks, day: '2026-10-25' })), clearStarted(nhlSlate({ games: nhlBoard.games })), clearStarted(nbaSlate({ board: nbaBoard }))]
notes.push(`THE FIVE candidates: ${sports.map((s) => `${s.sport} ${s.cands.length}`).join(', ')} (CALLED only, from the real adapters)`)
const faceOf = async (c) => {
  if (c.sport === 'nhl') return inline(`https://assets.nhle.com/mugs/nhl/latest/${c.id}.png`)
  if (c.sport === 'nba') return inline(nbaHeadshot(c.id))
  if (c.sport === 'nfl') { const h = headshotIdFor(c.id); return h ? inline(nflHeadshot(h, 200, 146)) : '' }
  return ''
}
const posterRows = async (picks) => Promise.all(picks.map(async (c) => ({ sport: c.sport, name: c.name, team: c.team, rank: c.rank, of: c.of, why: /^#\d+ of/.test(c.proof || '') ? 'CALLED on our board' : c.proof, face: await faceOf(c) })))
const texts = []
for (const [v, pick, label] of [['A', pickFiveA, 'One from every board, then the best of the rest'], ['B', pickFiveB, 'The five best spots on our boards']]) {
  const picks = pick(sports)
  const text = fiveText({ picks, dayWords: 'Weekend of Oct 24', variant: v, limit: 890 })
  texts.push(`===== THE FIVE · VERSION ${v} (${label}) =====\n${text}\n`)
  writeFileSync(`${OUT}/the-five-${v}.png`, await fivePoster({ rows: await posterRows(picks), label, day: 'Weekend of Oct 24' }))
  console.log('wrote', `the-five-${v}.png`, picks.map((p) => `${p.sport}:${p.name}`).join(' | '))
}

// ── FILM ROOM: the real line from the public call record of [FROM..TO] ──
const receipts = []
for (const sport of ['mlb', 'nfl', 'nhl']) {
  const rec = await getJson(`${SITE}/api/record/calls?sport=${sport}`).catch(() => null)
  const calls = (rec?.calls || []).filter((c) => c.date >= FROM && c.date <= TO && (c.result === 'hit' || c.result === 'miss'))
  for (const c of calls) {
    let night = receipts.find((r) => r.day === c.date)
    if (!night) { night = { day: c.date, payload: { counts: { cashed: 0, missed: 0, void: 0 }, by_sport: {}, results: [] } }; receipts.push(night) }
    const k = c.result === 'hit' ? 'cashed' : 'missed'
    night.payload.counts[k] += 1
    const bs = (night.payload.by_sport[sport] ||= { cashed: 0, missed: 0, void: 0 }); bs[k] += 1
    if (k === 'cashed') night.payload.results.push({ sport, player_id: c.player_id, name: c.name, outcome: 'cashed' })
  }
}
const data = filmData({ receipts, tuesdayRow: null })
notes.push(`FILM ROOM real line: ${FROM}..${TO} from /api/record/calls (mlb, nfl, nhl): ${data.made} calls, ${data.cashed} landed`)
for (let i = 0; i < TOPICS.length; i += 1) {
  const day = new Date(Date.parse('2026-10-21T12:00:00Z') + i * 7 * 864e5).toISOString().slice(0, 10)
  const t = filmRoomText({ day, data, limit: 900 })
  const topic = TOPICS[i]
  writeFileSync(`${OUT}/film-room-${i + 1}-${topic.key}.png`, await filmRoomPoster({ topic, n: i + 1, data }))
  texts.push(`===== FILM ROOM NO. ${i + 1} · ${day} · ${topic.key} =====\n${t.text}\n`)
  console.log('wrote', `film-room-${i + 1}-${topic.key}.png`)
}
writeFileSync(`${OUT}/X-SERIES-PROTOTYPES.txt`, `X SERIES PROTOTYPES · built ${new Date().toISOString()}\n${notes.map((n) => `- ${n}`).join('\n')}\n\n${texts.join('\n')}`)
console.log(notes.join('\n'))
