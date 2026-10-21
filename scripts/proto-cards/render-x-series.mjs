// RENDER THE X SERIES PICTURES THROUGH THE PRODUCTION CODE (2026-10-20): Film Room (lib/posts/filmRoom.js filmPicture) and The Five
// (lib/posts/theFive.js fivePicture) from REAL current data, to PNG files and one text file of the posts. Nothing posts, nothing deploys.
//   node --import ./scripts/proto-cards/_loader.mjs scripts/proto-cards/render-x-series.mjs <outDir> [from] [to]
// Needs network: the live site's public boards (LAMP, BUCKETS), the TUDDY week file (data branch), the public call record (/api/record/calls).
//   THE FIVE    tonight's real CALLED men (standing in for a Friday: the post goes Friday from 3:45 PM Phoenix)
//   FILM ROOM   the nights [from..to] from the public call record, shaped like the stored night receipts the post reads
import { mkdirSync, writeFileSync } from 'node:fs'
import { nhlSlate } from '../../lib/posts/nhl.js'
import { nbaSlate } from '../../lib/posts/nba.js'
import { nflSlate } from '../../lib/posts/nfl.js'
import { fetchNfl, nflPicksLooksReal, nflPicksPaths, nflSlateLooksReal, nflSlatePaths } from '../../lib/nfl/dataSource.js'
import { TOPICS, filmData, filmRoomText, filmPicture } from '../../lib/posts/filmRoom.js'
import { pickFive, fiveText, fivePicture } from '../../lib/posts/theFive.js'
import { renderFilmRoom } from '../../lib/cards/filmRoomCard.js'
import { renderTopThree } from '../../lib/cards/topThreeCard.js'
import { faceOf } from '../../lib/cards/faceOf.js'
import { logoFor } from '../../lib/cards/adapters/common.js'
import { C } from '../../lib/theme.js'

const OUT = process.argv[2] || './x-series-proto'
const FROM = process.argv[3] || '2026-10-13'
const TO = process.argv[4] || '2026-10-19'
const SITE = 'https://dashnetwork.vercel.app'
const DAY = '2026-10-20'
mkdirSync(OUT, { recursive: true })
const getJson = async (u) => { const r = await fetch(u); if (!r.ok) throw new Error(`${u}: ${r.status}`); return r.json() }
const notes = []
const texts = []

// ── THE FIVE ──
const [nhlBoard, nbaBoard] = await Promise.all([getJson(`${SITE}/api/lamp/board?date=${DAY}`), getJson(`${SITE}/api/buckets/board?date=${DAY}&market=pts`)])
const [nflData, nflPicks] = await Promise.all([fetchNfl(nflSlatePaths(), nflSlateLooksReal), fetchNfl(nflPicksPaths(), nflPicksLooksReal)])
// run after puck drop: "game already started" is the only problem cleared, so tonight's calls stand in for a Friday's
const clearStarted = (s) => ({ ...s, cands: s.cands.map((c) => (c.problem?.reason === 'game already started' ? { ...c, problem: null } : c)) })
const sports = [clearStarted(nflSlate({ data: nflData, picks: nflPicks, day: '2026-10-25' })), clearStarted(nhlSlate({ games: nhlBoard.games })), clearStarted(nbaSlate({ board: nbaBoard }))]
notes.push(`THE FIVE candidates: ${sports.map((s) => `${s.sport} ${s.cands.length}`).join(', ')} (CALLED only, from the real adapters)`)
const picks = pickFive(sports)
const FRI = '2026-10-23'
texts.push(`===== THE FIVE · ${FRI} =====\n${fiveText({ picks, day: FRI, limit: 890 })}\n`)
const fivePng = await fivePicture({ picks, day: FRI, draw: renderTopThree, face: faceOf, logo: logoFor, accent: C.orange })
if (fivePng) writeFileSync(`${OUT}/the-five.png`, fivePng)
console.log(fivePng ? 'wrote the-five.png' : 'THE FIVE: no picture', picks.map((p) => `${p.sport}:${p.name}`).join(' | '))

// ── FILM ROOM: the public call record shaped as the night receipts ──
const receipts = []
for (const sport of ['mlb', 'nfl', 'nhl']) {
  const rec = await getJson(`${SITE}/api/record/calls?sport=${sport}`).catch(() => null)
  for (const c of (rec?.calls || []).filter((x) => x.date >= FROM && x.date <= TO && (x.result === 'hit' || x.result === 'miss'))) {
    let night = receipts.find((r) => r.day === c.date)
    if (!night) { night = { day: c.date, payload: { counts: { cashed: 0, missed: 0, void: 0 }, by_sport: {}, results: [] } }; receipts.push(night) }
    const k = c.result === 'hit' ? 'cashed' : 'missed'
    night.payload.counts[k] += 1
    const bs = (night.payload.by_sport[sport] ||= { cashed: 0, missed: 0, void: 0 }); bs[k] += 1
    night.payload.results.push({ sport, player_id: c.player_id, name: c.name, outcome: k })
  }
}
const data = filmData({ receipts, tuesdayRow: null })
notes.push(`FILM ROOM: ${FROM}..${TO} from /api/record/calls (mlb, nfl, nhl): ${data.made} calls, ${data.cashed} landed`)
for (let i = 0; i < TOPICS.length; i += 1) {
  const day = new Date(Date.parse('2026-10-21T12:00:00Z') + i * 7 * 864e5).toISOString().slice(0, 10)
  const png = await filmPicture({ day, data, receipts, draw: renderFilmRoom, face: faceOf })
  if (png) writeFileSync(`${OUT}/film-room-${i + 1}-${TOPICS[i].key}.png`, png)
  texts.push(`===== FILM ROOM NO. ${i + 1} · ${day} · ${TOPICS[i].key} =====\n${filmRoomText({ day, data, limit: 900 }).text}\n`)
  console.log(png ? `wrote film-room-${i + 1}-${TOPICS[i].key}.png` : `FILM ROOM ${i + 1}: no picture`)
}
writeFileSync(`${OUT}/X-SERIES.txt`, `X SERIES · built ${new Date().toISOString()}\n${notes.map((n) => `- ${n}`).join('\n')}\n\n${texts.join('\n')}`)
console.log(notes.join('\n'))
