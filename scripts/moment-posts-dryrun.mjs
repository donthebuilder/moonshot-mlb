// DRY RUN of the moment posts and THE NIGHT'S DIGEST (lib/posts/momentPost.js, lib/posts/digestPost.js, lib/posts/postseasonPost.js). PRINTS what WOULD post for the
// last few nights from the REAL stored events: for each sport and night, the ELITE / LEGEND cards that would post on their own, the TOP 3 digest that would post at
// the end of the night (names, moment lines, the X text and its length, the channels), whether the league's schedule says the night is over, and the X posts it
// would use per ET day against the cap. STAR moments are never posted one by one any more: they only appear in a digest. MLB postseason: the night's one
// 'TOP 3 POSTSEASON PERFORMANCES' digest. READ-ONLY: it sends nothing, writes nothing, claims nothing, and it ignores MOMENT_POSTS_ON (that switch only matters to
// the live ticks). With --png it also draws each digest's card to <dir> (the real faces and club marks: pictures are fetched, nothing is stored).
//   node --no-warnings --import ./scripts/proto-cards/_loader.mjs scripts/moment-posts-dryrun.mjs [--env <file>] [--nights 3] [--json <file>] [--png <dir>]
// Needs the database (service role or anon key from the env file, never printed) and the network (the leagues' schedules; MLB StatsAPI for the postseason).
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'

const args = process.argv.slice(2)
const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null }
const envFile = flag('--env') || '.env.local'
if (existsSync(envFile)) {
  for (const l of readFileSync(envFile, 'utf8').split('\n')) {
    const m = /^\s*(?:export\s+)?([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/.exec(l)
    if (m && !(m[1] in process.env)) process.env[m[1]] = /^(".*"|'.*')$/.test(m[2]) ? m[2].slice(1, -1) : m[2]
  }
}
const nights = Number(flag('--nights')) || 3
const pngDir = flag('--png')
if (pngDir) mkdirSync(pngDir, { recursive: true })
const now = Date.now()

const { adminClient } = await import('../lib/supabase/admin.js')
const { historicalEvents, etDay } = await import('../lib/posts/momentFeed.js')
const P = await import('../lib/cards/momentPosting.js')
const { pickTop, digestTexts, rankPicks } = await import('../lib/cards/digestRank.js')
const { X_POLICY, capAllows } = await import('../lib/dash/xPolicy.js')
const { xPostsToday } = await import('../lib/dash/xBudget.js')
const { TIER_WORD } = await import('../lib/cards/moments.js')
const { modelFromRow } = await import('../lib/cards/specialData.js')
const { nightGames, nightState, windowFor } = await import('../lib/posts/digestPost.js')

const db = adminClient({ anon: true })
if (!db) { console.error('no database key in the env file (NEXT_PUBLIC_SUPABASE_URL + a key)'); process.exit(2) }

const nightList = Array.from({ length: nights }, (_, i) => etDay(now - i * 86400e3)).sort()
const { events, errors, since } = await historicalEvents(db, { days: nights, now })
console.log(`DIGEST DRY RUN: the last ${nights} game dates (${nightList.join(', ')}), ${events.length} moment events found${errors.length ? `; SOURCES THAT FAILED: ${errors.join(' | ')}` : ''}`)
console.log('STAR moments are no longer posted one by one: each sport posts ONE "TOP 3" per night; ELITE / LEGEND still post on their own the moment they happen.\n')

// the real counted X posts of each ET day so far (the simulation starts from it)
const used = {}
for (const d of nightList) used[d] = await xPostsToday(db, d).catch(() => null)
const xByDay = Object.fromEntries(nightList.map((d) => [d, { individual: 0, digest: 0, postseason: 0, refused: 0, wantInd: 0, wantDig: 0, wantPs: 0 }]))
const out = { digests: [], individual: [], postseason: [], errors }

const nameOf = async (e) => { try { return (await modelFromRow(e.moment, e.row))?.name || e.who.name } catch { return e.who.name } }
const dayOfEvent = (e) => e.day

for (const sport of ['nhl', 'mlb', 'nfl']) {
  console.log(`=== ${sport.toUpperCase()} ===`)
  for (const night of nightList) {
    const ev = events.filter((e) => e.sport === sport && dayOfEvent(e) === night)
    const byTier = (t) => ev.filter((e) => e.tier === t).length
    // the league's word on the night
    let lg = null
    try { lg = await nightGames(sport, night) } catch { lg = null }
    const st = lg?.games?.length ? nightState(lg.games) : null
    const over = st ? (st.over ? `OVER (${st.live.length} game(s) Final${st.lastStart ? `, last start ${new Date(st.lastStart).toISOString().slice(11, 16)}Z, window: ${windowFor(sport, st.lastStart, now)}` : ''})` : `NOT OVER YET (${st.live.filter((g) => !g.final).length} of ${st.live.length} still going or not started)`) : (lg ? 'no games on the league schedule' : 'the league did not answer')
    console.log(`  ${night}  ${ev.length} events (LEGEND ${byTier('legend')} · ELITE ${byTier('elite')} · STAR ${byTier('star')} · BASE ${byTier('base')})   night: ${over}${lg?.postseason ? '   [postseason date: the postseason digest owns it, see below]' : ''}`)
    // ELITE / LEGEND: posted on their own at the time
    const own = ev.filter((e) => P.postable(e.tier)).sort((a, b) => (a.at || 0) - (b.at || 0))
    const ownSlugs = new Set()
    for (const e of own) {
      const name = await nameOf(e)
      const line = P.momentLine(e.moment, e.row, { ...e.who, name })
      const xText = P.xTextFor(line, e.status, [name, e.who.name, e.who.team, e.who.opp])
      let x = Boolean(xText)
      if (x) xByDay[night].wantInd += 1
      const ek = P.eventKeyOf({ sport: e.sport, playerId: e.who.playerId, gameId: e.gameId, n: e.n })
      if (x && !capAllows(ek ? ek.kind : 'moment_nhl_x', (used[night] ?? 0) + xByDay[night].individual + xByDay[night].digest + xByDay[night].postseason)) { x = false; xByDay[night].refused += 1 }
      if (x) xByDay[night].individual += 1
      ownSlugs.add(P.slugOf(e.who.playerId))
      out.individual.push({ sport, night, tier: e.tier, name, line, x })
      console.log(`      own post [${TIER_WORD[e.tier]}] ${line}   -> X${x ? ` (${Array.from(xText).length}/280)` : ' (over the cap or no clean text)'} + ${sport.toUpperCase()} channel + #members`)
    }
    // the digest
    const picks = pickTop(ev, { exclude: ownSlugs })
    if (!picks.length) { console.log('      digest: nothing to name (no STAR-or-better moment that was not already posted on its own)'); continue }
    for (const p of picks) p.name = await nameOf(p.event).catch(() => p.name)
    const tx = digestTexts(picks, { sport })
    const dkind = P.digestKindOf({ sport, night })
    if (tx.x) xByDay[night].wantDig += 1
    let xok = Boolean(tx.x) && capAllows(dkind, (used[night] ?? 0) + xByDay[night].individual + xByDay[night].digest + xByDay[night].postseason)
    if (xok) xByDay[night].digest += 1; else xByDay[night].refused += 1
    console.log(`      DIGEST ${dkind}  (${picks.length} name${picks.length === 1 ? '' : 's'}; would post when the night is over; X ${xok ? `${Array.from(tx.x).length}/280` : 'NOT posted (cap or no clean text)'} + ${sport.toUpperCase()} channel + #members + one image)`)
    for (const l of tx.discord.split('\n')) console.log(`         ${l}`)
    const dropped = ev.filter((e) => P.inDigest(e.tier) && !picks.some((p) => p.slug === P.slugOf(e.who.playerId)) && !ownSlugs.has(P.slugOf(e.who.playerId)))
    if (dropped.length) console.log(`         (not in the top three: ${dropped.length} more STAR-or-better moment(s), they live on the shelf)`)
    out.digests.push({ sport, night, kind: dkind, picks: picks.map((p) => ({ name: p.name, tier: p.tier, line: p.line, magnitude: p.magnitude })), text: tx.x, xLen: tx.x ? Array.from(tx.x).length : 0, x: xok, over: Boolean(st?.over) })
    if (pngDir) {
      try {
        const { loadTopThree } = await import('../lib/cards/topThreeData.js')
        const { renderTopThree } = await import('../lib/cards/topThreeCard.js')
        const model = await loadTopThree({ sport, picks, night })
        writeFileSync(`${pngDir}/${sport}-${night}.png`, Buffer.from(await renderTopThree(model, { width: 1080 })))
        console.log(`         card: ${pngDir}/${sport}-${night}.png`)
      } catch (err) { console.log(`         card failed: ${err?.message || err}`) }
    }
  }
  console.log('')
}

// ── the postseason digest ────────────────────────────────────────────────────────
console.log('=== MLB POSTSEASON (one digest per night: the three best big nights) ===')
{
  const { postseasonNights, bigNights, postseasonTile } = await import('../lib/posts/postseasonPost.js')
  const { nightOf } = await import('../lib/posts/postseasonCard.js')
  const { loadPostseasonPlayer } = await import('../lib/cards/postseasonData.js')
  const j = await fetch(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&startDate=${nightList[0]}&endDate=${nightList.at(-1)}&gameType=F,D,L,W`).then((r) => (r.ok ? r.json() : null)).catch(() => null)
  const sched = j ? (j.dates || []).flatMap((d) => d.games || []) : null
  if (!sched) console.log('  (the MLB schedule did not answer)')
  else if (!sched.length) console.log('  no postseason games on these dates')
  else for (const night of postseasonNights(sched)) {
    const s = nightState(night.games)
    console.log(`  ${night.date}  ${night.games.length} game(s); ${s.over ? `OVER (window: ${windowFor('mlb', s.lastStart, now)})` : 'NOT OVER YET'}`)
    const cands = []
    for (const g of s.live) {
      const box = await fetch(`https://statsapi.mlb.com/api/v1/game/${g.id}/boxscore`).then((r) => (r.ok ? r.json() : null)).catch(() => null)
      for (const n of bigNights(box)) cands.push({ ...n, pk: g.id, startMs: g.startMs, season: night.season })
    }
    const ranked = rankPicks(cands.map((c) => ({ slug: c.id, playerId: c.id, name: c.name, team: c.team, tier: 'star', rank: 1, magnitude: c.score, at: c.startMs, moment: `postseason_${c.group}`, line: '', cand: c })), { max: 99 })
    console.log(`      ${cands.length} big night(s) by the approved rule; the three best by the box-score score:`)
    const picks = []
    for (const r of ranked) {
      if (picks.length >= P.POSTSEASON_MAX_PER_NIGHT) break
      const lp = await loadPostseasonPlayer({ id: r.cand.id, season: r.cand.season, group: r.cand.group, withPictures: Boolean(pngDir) })
      const n1 = lp.ok && String(lp.model.last?.gamePk) === r.cand.pk ? nightOf(lp.model) : null
      if (!n1?.big) { console.log(`      (${r.name}: his game log has not caught up yet, or not a big night by the model)`); continue }
      const line = n1.parts.join(' · ').toUpperCase().replace(/(\d+) STRIKEOUTS?/, '$1 K')
      picks.push({ ...r, team: r.team || lp.model.team, line, tile: postseasonTile(lp.model, line) })
    }
    if (!picks.length) { console.log('      digest: nothing to name'); continue }
    const tx = digestTexts(picks, { sport: 'mlb', postseason: true })
    const dkind = P.digestKindOf({ sport: 'mlb', night: night.date, postseason: true })
    const day = nightList.includes(night.date) ? night.date : nightList.at(-1)
    if (tx.x) xByDay[day].wantPs += 1
    const xok = Boolean(tx.x) && capAllows(dkind, (used[day] ?? 0) + xByDay[day].individual + xByDay[day].digest + xByDay[day].postseason)
    if (xok) xByDay[day].postseason += 1
    console.log(`      DIGEST ${dkind}  (X ${xok ? `${Array.from(tx.x).length}/280` : 'NOT posted'} + MLB channel + #members + one image)`)
    for (const l of tx.discord.split('\n')) console.log(`         ${l}`)
    out.postseason.push({ night: night.date, kind: dkind, text: tx.x, xLen: tx.x ? Array.from(tx.x).length : 0, x: xok })
    if (pngDir) {
      try {
        const { topThreeModel } = await import('../lib/cards/topThreeData.js')
        const { renderTopThree } = await import('../lib/cards/topThreeCard.js')
        const model = topThreeModel({ sport: 'mlb', picks, tiles: picks.map((p) => p.tile), night: night.date, postseason: true })
        writeFileSync(`${pngDir}/mlb-postseason-${night.date}.png`, Buffer.from(await renderTopThree(model, { width: 1080 })))
        console.log(`         card: ${pngDir}/mlb-postseason-${night.date}.png`)
      } catch (err) { console.log(`         card failed: ${err?.message || err}`) }
    }
  }
}

console.log(`\n=== THE X BUDGET (the cap is ${X_POLICY.dailyCap} a day shared with every other counted post; moment and digest posts are the write-up tier and stop at ${X_POLICY.dailyCap - 2}) ===`)
let total = 0
for (const d of nightList) {
  const b = xByDay[d]
  const want = b.wantInd + b.wantDig + b.wantPs
  total += want
  const mine = b.individual + b.digest + b.postseason
  console.log(`  ${d}: this feature WANTS ${want} X post(s) (ELITE/LEGEND on their own ${b.wantInd} + TOP 3 digests ${b.wantDig} + postseason digest ${b.wantPs}); the day's real counted X total so far is ${used[d] ?? 'unknown'}, so against the cap it would actually post ${mine}${b.refused ? ` (${b.refused} refused by the cap or no clean text)` : ''}`)
}
console.log(`  TOTAL over ${nights} nights: the feature wants ${total} X posts (at most one TOP 3 per sport per night + one postseason digest, however many STAR moments there were)`)
if (flag('--json')) writeFileSync(flag('--json'), JSON.stringify(out, null, 2))
