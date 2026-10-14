// node --import <loader> scripts/check-facts.mjs -- the fact engine's proof
// (BATCH-FACT-ENGINE). Rebuilds 2026 week 4's facts from nflverse's schedule
// and checks them against the three Cowork verified by hand (10-02), then
// proves the checker refuses what it must. Exits 1 on any failure.
import { parseGames, nflFacts, NFL_GAMES_URL } from '../lib/facts/nfl.js'
import { templateDrafts } from '../lib/facts/write.js'
import { checkDraft } from '../lib/facts/check.js'
import { pairKey } from '../lib/facts/franchise.js'
import { botOnHimAll, botBadges } from '../lib/botOnHim.js'
import { botFactsFor } from '../lib/facts/mlb.js'

let pass = 0, fail = 0
const ok = (cond, what) => { if (cond) pass++; else { fail++; console.log(`FAIL ${what}`) } }
const csv = await fetch(NFL_GAMES_URL).then((r) => r.text())
const games = parseGames(csv)
const f = nflFacts(games, { season: 2026, week: 4 })
const by = (id) => f.find((x) => x.id === id)

ok(pairKey('nfl', 'OAK', 'KC') === pairKey('nfl', 'KC', 'LV'), 'franchise map: OAK and LV are one team')
const kc = by('nfl:2026w4:unbeaten:KC-LV')
ok(kc && kc.prior === 0 && kc.proves.includes('first'), 'KC 3-0 at LV 3-0: first since 1999 this late')
ok(kc?.last?.winner === 'Raiders' && kc.last.winnerPts === 14 && kc.last.loserPts === 12, 'last meeting Raiders 14, Chiefs 12')
ok(kc?.last?.meetings === 54, `KC-Raiders meetings since 1999 counted as one franchise (got ${kc?.last?.meetings})`)
ok(by('nfl:2026w4:start:LV:3-0')?.seasons?.join(',') === '2002,2021,2026', 'Raiders 3-0 starts 2002, 2021, 2026')
ok(by('nfl:2026w4:start:TEN:0-3')?.running === 3, 'Titans 0-3 three seasons running')
const cats = by('nfl:2026w4:theme:cats')
ok(cats && cats.count === 2 && cats.prior === 0, 'the only week since 1999 with two cat-vs-cat games')

for (const x of f) for (const d of templateDrafts(x)) { const c = checkDraft(d, x); ok(c.ok, `template passes its own fact: ${x.id} -- ${c.why.join('; ')}`) }
const ref = 'Week 4 has an unbeaten matchup.\nChiefs 3-0. Raiders 3-0.\nFirst time since at least 1999 these two meet with both teams unbeaten this late.\nLast meeting: Raiders 14, Chiefs 12 (Jan 4).'
ok(checkDraft(ref, kc).ok, 'the reference tweet passes')
for (const [bad, what] of [
  ['Chiefs 3-0. Raiders 3-0. First time ever these two meet unbeaten since 1999.', '"ever" refused'],
  ['Chiefs 3-0 vs Raiders 3-0 since 1999. Mahomes leads them.', 'a name not in the fact refused'],
  ['Chiefs 3-0. Raiders 3-0 since 1999. Last meeting: Raiders 14, Chiefs 13.', 'a number not in the fact refused'],
  ['Chiefs 3-0. Raiders 3-0. First time these two meet both unbeaten this late.', 'a missing range refused'],
  ['Chiefs 3-0. Raiders 3-0 since 1999. Take the over.', 'betting language refused'],
]) ok(!checkDraft(bad, kc).ok, what)
// THE BOT ON HIM (lock-rule record, through 09-30). Counts re-derived 2026-10-14 from the locked rows
// (commit 8874fd3: a row counts only if stamped before first pitch); the old hand counts predate that rule.
const bot = await botOnHimAll('2026-09-30')
const tatis = bot.players['665487'], alonso = bot.players['624413']
ok(tatis?.roles.HIT?.all.g === 3 && tatis.roles.HIT.all.hr === 1 && tatis.roles.HIT.all.did === 3, 'Tatis as a HIT pick: 3 games, 1 HR, 3/3 on the job')
ok(tatis?.roles.HIT?.vsL.g === 0 && tatis.roles.HIT.vsR.g === 3 && tatis.roles.HIT.vsR.hr === 1, 'Tatis as a HIT pick: no locked game vs LHP, 3 games 1 HR vs RHP')
ok(botBadges(tatis).map((b) => b.text).join('|') === '3/3 as a Hit pick', 'Tatis badges: PERFECT 3/3 (the doubled badge drops, 1 of 3)')
const bf = botFactsFor(bot, ['624413', '806146'], '2026-10-01', '2026-09-30')
const al = bf.find((x) => x.family === 'bot_called'), lo = bf.find((x) => x.family === 'bot_blind_spot')
ok(al && al.called.g === 11 && al.called.hrG === 7 && al.called.hr === 9, 'Alonso called: 11 games, homered in 7 (9 HR)')
ok(lo && lo.not.g === 12 && lo.not.hrG === 4, 'Lombard never called: 12 games, homered in 4')
for (const x of bf) for (const d of templateDrafts(x)) { const c = checkDraft(d, x); ok(c.ok, `bot template passes: ${x.id} -- ${c.why.join('; ')} -- ${d}`) }
console.log(`${pass}/${pass + fail} checks`)
process.exit(fail ? 1 : 0)
