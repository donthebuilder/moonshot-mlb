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
import { filmRoomPoster } from '../../lib/cards/proto/xSeriesCards.js'
import { renderTopThree } from '../../lib/cards/topThreeCard.js'
import { logoFor } from '../../lib/cards/adapters/common.js'
import { BRAND } from '../../lib/routes.js'
import { C } from '../../lib/theme.js'
import { mlbHeadshot } from '../../lib/mlbTeams.js'

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
  if (c.sport === 'mlb') return inline(mlbHeadshot(c.id))
  return ''
}
// THE FIVE is the Top 3 card with five tiles (lib/cards/topThreeCard.js, compact mode): each tile in its own product's accent, #1 holo, the rest shimmer
const tileOf = async (c, i) => {
  const logo = await logoFor(c.sport, c.team)
  return {
    sport: c.sport, name: c.name, team: c.team, face: await faceOf(c), logo: logo.src, logoPlate: logo.plate, tone: null,
    tier: i === 0 ? 'elite' : 'star', holo: i === 0, shimmer: i !== 0,
    tag: `CALLED · ${BRAND[c.sport]?.name || c.sport} · #${c.rank} OF ${c.of}`, line: c.proof,
  }
}
const texts = []
for (const [v, pick, label] of [['A', pickFiveA, 'One from every board, then the best of the rest'], ['B', pickFiveB, 'The five best spots on our boards']]) {
  const picks = pick(sports)
  const text = fiveText({ picks, dayWords: 'Weekend of Oct 24', variant: v, limit: 890 })
  texts.push(`===== THE FIVE · VERSION ${v} (${label}) =====\n${text}\n`)
  const model = { sport: 'all', accent: C.orange, brand: { name: 'CALLED IT', league: 'ALL SPORTS' }, title: 'THE FIVE', dayWord: 'Weekend of Oct 24', tiles: await Promise.all(picks.map(tileOf)), test: false, note: v === 'A' ? 'One from every board, then the rest' : 'The five best spots on our boards' }
  writeFileSync(`${OUT}/the-five-${v}.png`, await renderTopThree(model))
  console.log('wrote', `the-five-${v}.png`, picks.map((p) => `${p.sport}:${p.name}`).join(' | '))
}

// ── FILM ROOM: the real line from the public call record of [FROM..TO] ──
const receipts = []
const hitsSeen = []
for (const sport of ['mlb', 'nfl', 'nhl']) {
  const rec = await getJson(`${SITE}/api/record/calls?sport=${sport}`).catch(() => null)
  const calls = (rec?.calls || []).filter((c) => c.date >= FROM && c.date <= TO && (c.result === 'hit' || c.result === 'miss'))
  for (const c of calls) {
    let night = receipts.find((r) => r.day === c.date)
    if (!night) { night = { day: c.date, payload: { counts: { cashed: 0, missed: 0, void: 0 }, by_sport: {}, results: [] } }; receipts.push(night) }
    const k = c.result === 'hit' ? 'cashed' : 'missed'
    night.payload.counts[k] += 1
    const bs = (night.payload.by_sport[sport] ||= { cashed: 0, missed: 0, void: 0 }); bs[k] += 1
    if (k === 'cashed') { night.payload.results.push({ sport, player_id: c.player_id, name: c.name, outcome: 'cashed' }); hitsSeen.push({ sport, id: String(c.player_id), name: c.name, team: c.team, date: c.date }) }
  }
}
const data = filmData({ receipts, tuesdayRow: null })
notes.push(`FILM ROOM real line: ${FROM}..${TO} from /api/record/calls (mlb, nfl, nhl): ${data.made} calls, ${data.cashed} landed`)
// the faces: the last 7 nights' CALLED scorers, newest first, each once; the CALLED example is the newest one whose face loads
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const dayWordOf = (d) => `${MON[Number(d.slice(5, 7)) - 1]} ${Number(d.slice(8, 10))}`.toUpperCase()
const uniq = []
for (const h of hitsSeen.sort((a, b) => b.date.localeCompare(a.date))) if (!uniq.some((u) => u.sport === h.sport && u.id === h.id)) uniq.push(h)
const faces = []
for (const h of uniq) { if (faces.length >= 5) break; const face = await faceOf(h); if (face) { const logo = await logoFor(h.sport, h.team); faces.push({ ...h, face, logo: logo.src, logoPlate: logo.plate, dayWord: dayWordOf(h.date) }) } }
notes.push(`FILM ROOM faces: ${faces.map((f) => `${f.name} (${f.sport} ${f.date})`).join(', ')}`)
for (let i = 0; i < TOPICS.length; i += 1) {
  const day = new Date(Date.parse('2026-10-21T12:00:00Z') + i * 7 * 864e5).toISOString().slice(0, 10)
  const t = filmRoomText({ day, data, limit: 900 })
  const topic = TOPICS[i]
  writeFileSync(`${OUT}/film-room-${i + 1}-${topic.key}.png`, await filmRoomPoster({ topic, n: i + 1, data, ex: faces[0] || null, faces, dayWord: dayWordOf(day).replace(/^(\w)(\w+)/, (m, a, b) => a + b.toLowerCase()) }))
  texts.push(`===== FILM ROOM NO. ${i + 1} · ${day} · ${topic.key} =====\n${t.text}\n`)
  console.log('wrote', `film-room-${i + 1}-${topic.key}.png`)
}
writeFileSync(`${OUT}/X-SERIES-PROTOTYPES.txt`, `X SERIES PROTOTYPES · built ${new Date().toISOString()}\n${notes.map((n) => `- ${n}`).join('\n')}\n\n${texts.join('\n')}`)
console.log(notes.join('\n'))
