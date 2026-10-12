// DRY RUN of the postseason card post (lib/posts/postseasonCard.js). PRINTS the Discord embed and the X text and WRITES the PNGs. Sends nothing, writes
// nothing to any database, is not scheduled, and posts to no channel. Picks a real current example (the postseason player with the most recent big night);
// if nobody played a big night in the latest game window it says so and uses the most recent postseason player with a line.
//   node --no-warnings --import ./scripts/proto-cards/_loader.mjs scripts/postseason-card-dryrun.mjs [outDir] [playerId] [clubCode]
// Needs the network (MLB StatsAPI + the picture hosts).
import { mkdirSync, writeFileSync } from 'node:fs'
import { loadLeaguePostseason, loadPostseasonPlayer, loadSeriesEdition, seasonsToTry, postseasonCensus } from '../lib/cards/postseasonData.js'
import { renderPostseason } from '../lib/cards/postseasonCard.js'
import { buildPostseasonPost, nightOf, WIRING } from '../lib/posts/postseasonCard.js'
import { hitCounts } from '../lib/cards/postseason.js'

const OUT = process.argv[2] || '/Volumes/DONX/USERS/Kingdondondon/Desktop/AUDITS-TO-READ/POSTSEASON-CARDS'
const ASK_ID = process.argv[3] || null
const ASK_CLUB = process.argv[4] || null
mkdirSync(OUT, { recursive: true })

let season = null
for (const yr of seasonsToTry()) { const c = await postseasonCensus(yr); if (c && c.players) { season = yr; console.log('census', JSON.stringify(c)); break } }
if (!season) { console.log('no postseason players found'); process.exit(0) }
const lg = await loadLeaguePostseason(season)

// the example: the best-known candidates first (home-run hitters), the one whose LATEST game is the most recent big night
let pick = null
const cands = ASK_ID ? [{ id: ASK_ID }] : [...lg.hitters].sort((a, b) => hitCounts(b.stat).homeRuns - hitCounts(a.stat).homeRuns).slice(0, 12)
for (const c of cands) {
  const r = await loadPostseasonPlayer({ id: c.id, season })
  if (!r.ok) continue
  const night = nightOf(r.model)
  const key = `${night.big ? 1 : 0}|${r.model.last?.date || ''}`
  if (!pick || key > pick.key) pick = { key, r, night }
}
if (!pick) { console.log('no player could be loaded'); process.exit(0) }
const m = pick.r.model
console.log(`\nEXAMPLE: ${m.name} (${m.team}) ${m.roundTag} latest game ${m.last?.date}: ${pick.night.big ? 'a big night by the rule' : 'NOT a big night (the post would not fire); drawn anyway as a preview of the card'}`)
if (!pick.night.big) console.log('  (no top home-run hitter had a big night in his latest game; this is the most recent postseason player with a line)')

const post = buildPostseasonPost(m, { at: m.last?.date ? `${m.last.date}T23:00:00Z` : null })
console.log('\n--- X TEXT (no link) ---')
console.log(post.ok ? post.x.text : `(none: ${post.why})`)
if (post.ok) console.log(`[${post.x.length}/280 chars]`)
console.log('\n--- DISCORD EMBED ---')
console.log(post.ok ? JSON.stringify(post.discord.embed, null, 2) : `(none: ${post.why})`)
console.log('\n--- DEDUPE KEY ---', post.ok ? post.dedupeKey : '-')

const slug = `${String(m.name).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
const write = async (name, buf) => { writeFileSync(`${OUT}/${name}`, buf); console.log('wrote', `${OUT}/${name}`) }
await write(`postseason-${slug}-front.png`, await renderPostseason(m, { side: 'front' }))
await write(`postseason-${slug}-back.png`, await renderPostseason(m, { side: 'back' }))
// a pitcher too, so both back tables are seen
const pit = [...lg.pitchers].sort((a, b) => Number(b.stat.strikeOuts) - Number(a.stat.strikeOuts))[0]
if (pit) {
  const pr = await loadPostseasonPlayer({ id: pit.id, season })
  if (pr.ok) {
    const ps = String(pr.model.name).toLowerCase().replace(/[^a-z0-9]+/g, '-')
    await write(`postseason-${ps}-front.png`, await renderPostseason(pr.model, { side: 'front' }))
    await write(`postseason-${ps}-back.png`, await renderPostseason(pr.model, { side: 'back' }))
  }
}
const sr = await loadSeriesEdition({ code: ASK_CLUB || m.team, season })
console.log(sr.ok ? `series: ${sr.model.teamName} ${sr.model.status.word} ${sr.model.record.word}` : `series: ${sr.why}`)
if (sr.ok) await write(`series-${sr.model.team.toLowerCase()}.png`, await renderPostseason(sr.model))
console.log('\n--- WHAT WIRING NEEDS (not done) ---')
WIRING.forEach((w, i) => console.log(`${i + 1}. ${w}`))
