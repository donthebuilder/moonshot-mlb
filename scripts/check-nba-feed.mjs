// node --import <loader> scripts/check-nba-feed.mjs -- BUCKETS' feed reader
// (lib/nba/api.js) against ESPN's own box scores: every player's shots on the
// floor must equal his FGA, FGM and 3PA in the box, on finished games from last
// season. Exits 1 on any mismatch.
import { summaryFor, reduceBox, reduceShots, firstBaskets, scoreboardFor, reduceScoreboard } from '../lib/nba/api.js'

const DAYS = ['2026-03-10', '2026-01-15', '2025-12-25']
let games = 0, bad = 0, off1 = 0
for (const d of DAYS) {
  const gs = reduceScoreboard(await scoreboardFor(d)).filter((g) => g.state === 'final').slice(0, 3)
  for (const g of gs) {
    const s = await summaryFor(g.id, true)
    const box = reduceBox(s), shots = reduceShots(s, g.id)
    games++
    for (const p of box) {
      const mine = shots.filter((x) => x.player_id === p.id)
      const a = mine.length, m = mine.filter((x) => x.made).length, t = mine.filter((x) => x.three).length
      // attempts and makes must be exact. Threes: ESPN's play log and its own box
      // can disagree by one (03-10 DET@BKN, Holland: a 22-ft pull-up at 0:02 of the
      // 1st is a 3PA in the plays, not in the box) -- reported, not hidden.
      if (a !== (p.fga || 0) || m !== (p.fgm || 0) || Math.abs(t - (p.tpa || 0)) > 1) { bad++; console.log(`MISMATCH ${d} ${g.away.abbrev}@${g.home.abbrev} ${p.name}: box ${p.fga}/${p.fgm}/${p.tpa} vs floor ${a}/${m}/${t}`) }
      else if (t !== (p.tpa || 0)) { off1++; console.log(`note: ${d} ${g.away.abbrev}@${g.home.abbrev} ${p.name} 3PA box ${p.tpa}, plays ${t} (ESPN's two records disagree by one)`) }
    }
    const fb = firstBaskets(s)
    if (!fb.firstFieldGoal || !fb.firstPoints) { bad++; console.log(`no first basket ${g.id}`) }
  }
}
console.log(`${games} games, ${bad} mismatches, ${off1} three-point attempts where ESPN's plays and box disagree by one`)
process.exit(bad ? 1 : 0)
