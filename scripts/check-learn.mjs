// THE ACCURACY LOOP'S CHECK (2026-10-12). Every row below is TEST DATA built here, labelled as such; nothing is read from the
// database or the network. Proves:
//   1. the groups (called / on-the-board-no-call / got-away on and off the board; a man who did not play is in none)
//   2. no post-game information leaks into pick-time features (late lock stamps out, outcome and selection keys out)
//   3. the floors (no feature claim under 30 per group; a half-season reversal or pure noise is not a claim)
//   4. the walk-forward split never trains on the future (and a change in the future cannot change an earlier fold)
//   5. the labels come from lib/callStatus (MLB lane, NFL tdCallStatus), never re-derived
//   6. the published subset: only claims, neutral words, n beside every line, no "due/hot/lock/guaranteed", no probability
//   7. the sport table matches the registry; deterministic; private output never goes to docs/
//   node --no-warnings --import ./scripts/_esm-resolve.mjs scripts/check-learn.mjs
await import('./_esm-resolve.mjs')
const fs = await import('node:fs')
const { groupRows, countsOf, withBins, MIN_GROUP_N } = await import('../lib/learn/groups.js')
const { sanitizeRows, numericFeatures, isOutcomeKey, isSelectionKey } = await import('../lib/learn/features.js')
const { separate } = await import('../lib/learn/separators.js')
const { walkForward, proposeCandidates, MIN_TEST_UNITS } = await import('../lib/learn/candidates.js')
const { rng, auc, tTwoSidedP } = await import('../lib/learn/stats.js')
const { nhlRow } = await import('../lib/learn/rows/nhl.js')
const { mlbRows } = await import('../lib/learn/rows/mlb.js')
const { nflRows } = await import('../lib/learn/rows/nfl.js')
const { buildReport, publicEntry, publicLines } = await import('../lib/learn/report.js')
const { LEARN_SPORTS } = await import('../lib/learn/sports.js')
const { describeLine, PUBLIC_DENY } = await import('../lib/learn/labels.js')
const R = await import('../lib/routes.js')
const { STATUS_WORD } = await import('../lib/callStatus.js')

let bad = 0
const ok = (cond, msg) => { if (!cond) { console.log(`FAIL ${msg}`); bad += 1 } }
console.log('TEST DATA ONLY: synthetic rows built in this script (seeded). No database, no network.')

const T0 = Date.parse('2026-10-01T20:00:00Z'), LOCK = T0 - 600000
let uid = 0
const mk = (o) => ({ sport: 'test', market: 'T', unit: '2026-10-01', date: '2026-10-01', id: String(++uid), name: 'TEST', team: 'AAA', opp: 'BBB', version: 'test-v1', status: 'off', produced: false, score: 50, features: {}, lockedAt: LOCK, startAt: T0, ...o })

// 1. GROUPS ------------------------------------------------------------------------------------------------------------
{
  const rows = [
    mk({ status: 'called', produced: true }), mk({ status: 'called', produced: true }), mk({ status: 'called', produced: false }),
    mk({ status: 'board', produced: true }), mk({ status: 'board', produced: false }), mk({ status: 'board', produced: false }),
    mk({ status: 'off', produced: true }), mk({ status: 'off', produced: false }),
    mk({ status: 'called', produced: null }), mk({ status: 'off', produced: null }),    // did not play: void
  ]
  const g = groupRows(rows)
  ok(g.called.length === 3 && g.calledHit.length === 2 && g.calledMiss.length === 1, 'called group and its hit/miss split')
  ok(g.boardNoCall.length === 3 && g.boardNoCallHit.length === 1 && g.boardNoCallMiss.length === 2, 'on-the-board-no-call group')
  ok(g.gotAway.length === 2 && g.gotAwayBoard.length === 1 && g.gotAwayOff.length === 1, 'got away = produced and not called, split on / off the board')
  ok(g.notCalledMiss.length === 3, 'not called and did not produce')
  ok(g.all.length === 8, 'a man who did not play is in no group')
  const c = countsOf(rows)
  ok(c.gotAway.n === 2 && c.gotAway.onBoard === 1 && c.gotAway.notOnBoard === 1 && c.called.hits === 2 && c.board.n === 3, 'counts line up')
}

// 2. NO LEAKAGE --------------------------------------------------------------------------------------------------------
{
  const f = numericFeatures([['legs', { goalsPg: 0.3, goals: 2, hit: true, dressed: true, value: 4, actual: 3, graded_at: 5, shotsPg: 2.1, curSeason: 20262027, note: 'x' }], ['context', { b2b: true, oppGaPg: 2.9, goalGameProbability: 0.2, nightRank: 3 }]])
  ok('legs.goalsPg' in f && 'legs.shotsPg' in f && f['context.b2b'] === 1 && 'context.oppGaPg' in f, 'pregame inputs kept (booleans as 0/1)')
  ok(!('legs.goals' in f) && !('legs.hit' in f) && !('legs.dressed' in f) && !('legs.value' in f) && !('legs.actual' in f) && !('legs.graded_at' in f), 'outcome-named keys never become features')
  ok(!('legs.curSeason' in f), 'ids are not features')
  ok(isOutcomeKey('hit') && !isOutcomeKey('recent_hard_hit_rate') && isSelectionKey('rank_in_game') && isSelectionKey('goalGameProbability') && isSelectionKey('scores.hr') && !isSelectionKey('shotsPg'), 'key rules')
  const rows = [
    mk({ features: { 'legs.shotsPg': 2, goals: 3, value: 4, rank_in_game: 1, 'context.goalGameProbability': 0.3 } }),
    mk({ lockedAt: T0 }),             // stamped AT the start: not pregame
    mk({ lockedAt: T0 + 1000 }),      // stamped after
    mk({ lockedAt: null }),
  ]
  const s = sanitizeRows(rows)
  ok(s.rows.length === 1 && s.lateExcluded === 3, 'a row locked at or after the start (or unstamped) is out')
  ok(Object.keys(s.rows[0].features).join() === 'legs.shotsPg', 'sanitize strips outcome and selection keys an adapter let through')
  // the adapter: a graded NHL row's result fields never reach the features
  const nr = nhlRow({ game_date: '2026-10-01', player_id: 1, name: 'TEST', team: 'A', opp: 'B', model_version: 'v', status: 'board', score: 50, rank_in_game: 4, home: true, legs: { shotsPg: 2, goals: 1 }, pct: { shotsPg: 80 }, context: { b2b: false, hit: true }, locked_at: '2026-10-01T19:00:00Z', start_utc: '2026-10-01T20:00:00Z', graded_at: '2026-10-02T03:00:00Z', dressed: true, hit: true, goals: 1, market: 'GOAL' })
  ok(nr.produced === true && !('legs.goals' in nr.features) && !('context.hit' in nr.features) && nr.lockedAt < nr.startAt, 'NHL adapter: result is `produced`, never a feature')
  ok(nhlRow({ game_date: '2026-10-01', player_id: 1, status: 'off', graded_at: '2026-10-02T03:00:00Z', dressed: false, hit: false, locked_at: 'x', start_utc: 'y' }).produced === null, 'NHL adapter: not dressed is void, not a miss')
}

// 3. FLOORS AND CLAIMS -------------------------------------------------------------------------------------------------
{
  const r = rng(11)
  const gen = (n, shift, units, unitsStart = 0) => Array.from({ length: n }, (_, i) => mk({ unit: `u${String(unitsStart + (i % units)).padStart(2, '0')}`, score: 50, features: { 'legs.x': shift + r(), 'legs.noise': r() } }))
  // 40 per group, a clear shift in both halves of 8 units: a claim
  const A = gen(40, 1, 8), B = gen(40, 0, 8)
  const s = separate(withBins(A), withBins(B), { reps: 120 })
  const x = s.features.find((f) => f.feature === 'legs.x')
  ok(s.floor && x.claim === 'separates' && x.direction === 'higher' && x.nA === 40, 'a clear, stable separator with n >= 30 per group is a claim')
  ok(s.features.find((f) => f.feature === 'legs.noise').claim === 'tracking', 'noise is not a claim')
  // under the floor: the same shift with 25 per group is tracking, with the reason
  const s2 = separate(withBins(gen(25, 1, 8)), withBins(gen(25, 0, 8)), { reps: 120 })
  const x2 = s2.features.find((f) => f.feature === 'legs.x')
  ok(!s2.floor && x2.claim === 'tracking' && /under 30/.test(x2.why), 'under 30 per group is tracking, never a claim')
  // a reversal between the two halves: first 4 units high, last 4 units low
  const rev = (shift1, shift2) => Array.from({ length: 80 }, (_, i) => mk({ unit: `u${String(i % 8).padStart(2, '0')}`, features: { 'legs.x': ((i % 8) < 4 ? shift1 : shift2) + r() } }))
  const s3 = separate(withBins(rev(1, 1)), withBins(rev(0, 2)), { reps: 120 })
  ok(s3.features.find((f) => f.feature === 'legs.x').claim === 'tracking', 'a feature that flips between the halves is not a claim')
  // many noise features: nothing survives the many-features check
  const many = (shift) => Array.from({ length: 60 }, (_, i) => mk({ unit: `u${String(i % 8).padStart(2, '0')}`, features: Object.fromEntries(Array.from({ length: 30 }, (_, k) => [`legs.n${k}`, r()])) }))
  const s4 = separate(withBins(many()), withBins(many()), { reps: 100 })
  ok(s4.features.filter((f) => f.claim === 'separates').length === 0, 'thirty noise features: no claim')
  ok(MIN_GROUP_N === 30, 'the floor is 30')
  ok(Math.abs(auc([1, 2, 3], [1, 2, 3]) - 0.5) < 1e-9 && auc([5, 6], [1, 2]) === 1, 'auc basics')
  ok(Math.abs(tTwoSidedP(2.228, 10) - 0.05) < 0.002, 'student-t p')
}

// 4. WALK-FORWARD NEVER TRAINS ON THE FUTURE --------------------------------------------------------------------------
{
  const r = rng(5)
  const build = (flipFuture = false) => {
    const rows = []
    for (let u = 0; u < 18; u += 1) {
      for (let i = 0; i < 60; i += 1) {
        const feat = r()
        const sc = 40 + 20 * r()
        const p = 0.15 + 0.2 * feat + (sc - 40) / 100
        // flipFuture rewrites the labels of the LAST 6 units only
        const prod = (flipFuture && u >= 12) ? r() < 0.05 : r() < p
        rows.push(mk({ unit: `2026-10-${String(u + 1).padStart(2, '0')}`, date: `2026-10-${String(u + 1).padStart(2, '0')}`, score: sc, status: i < 5 ? 'called' : 'off', produced: prod, features: { 'legs.f': feat } }))
      }
    }
    return rows
  }
  const base = build(false)
  const w = walkForward(base, 'legs.f', { k: 1 })
  ok(w.folds.length > 0 && w.folds.every((f) => f.train.length > 0 && f.train.every((t) => t < f.test)), 'every fold trains only on units BEFORE its test unit')
  ok(new Set(w.folds.map((f) => f.test)).size === w.folds.length && w.folds[0].train.length >= 3, 'each unit is tested once; at least 3 units to train on')
  // invariance: rewrite the labels of units 12.. and the first six folds' choices and lifts do not move
  const r2 = rng(5)
  const w2 = walkForward((() => { const rows = base.map((x) => ({ ...x })); for (const x of rows) if (x.unit >= '2026-10-13') x.produced = r2() < 0.05; return rows })(), 'legs.f', { k: 1 })
  const early = (ww) => ww.folds.filter((f) => f.test < '2026-10-13').map((f) => `${f.test}:${f.lambda}:${f.lift.toFixed(9)}`).join('|')
  ok(early(w) === early(w2) && early(w).length > 0, 'changing the future cannot change an earlier fold')
  ok(w.status === 'tracking' || w.testUnits >= MIN_TEST_UNITS, 'under the held-out floor a proposal is only "tracking"')
  const small = proposeCandidates(base.filter((x) => x.unit <= '2026-10-08'))
  ok(small.proposals.every((p) => p.status !== 'ready'), 'too few held-out units: nothing is ready')
}

// 5. LABELS COME FROM lib/callStatus ---------------------------------------------------------------------------------
{
  const games = new Map([['1', { start: Date.parse('2026-09-20T23:00:00Z'), type: 'R', date: '2026-09-20' }]])
  const row = (pid, role, hr, extra = {}) => ({ game_pk: 1, player_id: pid, player: `TEST${pid}`, team: 'A', opp: 'B', game_pick_role: role, generated_at: '2026-09-20T18:00:00Z', scores: { hr, hit: hr, hrr: hr, contact: hr }, components: { pmix: hr, pull_rate: 0.3 }, model_versions: { picks: 'x' }, ...extra })
  // 12 hitters, hr score 100..89: rank 1..12, the top third is 4
  const por = Array.from({ length: 12 }, (_, i) => row(i + 1, i === 0 ? 'TOP' : i === 2 ? 'HIT' : i === 5 ? 'WATCH' : '', 100 - i))
  const outcomes = new Map(por.map((r) => [`1|${r.player_id}`, { is_final: true, void: false, plate_appearances: 4, went_yard: r.player_id === 8, home_runs: r.player_id === 8 ? 1 : 0, hits: 1, runs: 0, rbi: 0, total_bases: 1 }]))
  const hr = mlbRows({ date: '2026-09-20', por, outcomes, games, lane: 'HR' })
  const st = Object.fromEntries(hr.map((x) => [x.name, x.status]))
  ok(st.TEST1 === 'called', 'MLB HR lane: TOP is called')
  ok(st.TEST3 === 'board', 'MLB HR lane: a HIT-role hitter in the top third is ON THE BOARD, not an HR call')
  ok(st.TEST6 === 'board', 'MLB HR lane: a ranking-band role stays ON THE BOARD (callStatus)')
  ok(st.TEST2 === 'board' && st.TEST4 === 'board' && st.TEST5 === 'off' && st.TEST12 === 'off', 'MLB HR lane: the top-third cut comes from callStatus boardCut')
  ok(hr.find((x) => x.name === 'TEST8').produced === true && hr.find((x) => x.name === 'TEST9').produced === false, 'MLB produced = the lane bar on the final outcome')
  ok(hr.every((x) => !Object.keys(x.features).some((k) => k.startsWith('scores.'))), 'MLB features carry no model scores, only inputs')
  const hit = mlbRows({ date: '2026-09-20', por, outcomes, games, lane: 'HIT' })
  ok(hit.find((x) => x.name === 'TEST3').status === 'called' && hit.find((x) => x.name === 'TEST1').status !== 'called', 'MLB HIT lane: called by the HIT role only')
  // NFL: a rung is called; the rest by the top-third cut of the stored rank
  const board = Array.from({ length: 9 }, (_, i) => ({ market: 'TD', player_id: `p${i}`, player: `TEST${i}`, team: 'A', opp: 'B', score: 90 - i, components: { f_xtd: 90 - i }, questionable: false }))
  const results = { bars: { TD: 1 }, card: { TD: { rungs: [{ player_id: 'p0' }] } }, lines: { p0: { TD: 1 }, p1: { TD: 2 }, p5: { TD: 0 }, p8: { TD: 1 } } }
  const nf = nflRows({ season: 2026, week: 5, market: 'TD', board, results, lockedAt: LOCK, startAt: T0, date: '2026-10-04' })
  const ns = Object.fromEntries(nf.map((x) => [x.name, x.status]))
  ok(ns.TEST0 === 'called' && ns.TEST1 === 'board' && ns.TEST2 === 'board' && ns.TEST3 === 'off', 'NFL: tdCallStatus (rung = called; top third of 9 = 3)')
  ok(nf.find((x) => x.name === 'TEST1').produced === true && nf.find((x) => x.name === 'TEST5').produced === false && nf.find((x) => x.name === 'TEST2').produced === null, 'NFL: absent from the lines is void, not a miss')
  ok(Object.values(STATUS_WORD).join('|') === 'CALLED|ON THE BOARD|NOT ON THE BOARD', 'the words are STATUS_WORD')
}

// 6. THE PUBLISHED SUBSET ---------------------------------------------------------------------------------------------
{
  const FORBID = /\b(lock|locks|locked|due|hot|cold|guarantee[ds]?|sure|lean|bet|pick this|should|must)\b|probab|chance|%\s*to\b/i
  const r = rng(21)
  const rows = []
  for (let u = 0; u < 10; u += 1) for (let i = 0; i < 50; i += 1) {
    const x = r()
    rows.push(mk({ unit: `2026-10-${String(u + 1).padStart(2, '0')}`, date: `2026-10-${String(u + 1).padStart(2, '0')}`, score: 30 + 40 * r(), status: i < 4 ? 'called' : i < 15 ? 'board' : 'off', produced: r() < 0.1 + 0.3 * x, features: { 'legs.shotsPg': x, 'legs.games_since_last_hr': x, 'context.b2b': r() < 0.5 ? 1 : 0, 'legs.noise': r() } }))
  }
  const rep = buildReport(rows, { sport: 'test', market: 'T', label: 'TEST', reps: 80, candidates: true })
  const pe = publicEntry(rep)
  ok(rep.rows.graded === 500 && pe.gotAway.n >= 0 && pe.floor === 30, 'report builds on TEST rows')
  ok(pe.lines.length <= 3 && pe.lines.every((l) => l.nA >= 30 && l.nB >= 30 && /n=\d+ vs \d+/.test(l.text)), 'at most 3 public lines, each with n on both sides and over the floor')
  ok(pe.lines.every((l) => !FORBID.test(l.text) && !PUBLIC_DENY.test(l.feature)), 'public lines use neutral words and no drought / streak features')
  ok(!JSON.stringify(pe).includes('"features"') && !('candidates' in pe), 'the public entry carries no private feature tables or candidates')
  const line = describeLine({ a: 'Players who got away', b: 'the called set', feature: 'legs.shotsPg', direction: 'higher', nA: 41, nB: 38 })
  ok(/^Players who got away had a higher median for shots a game than the called set \(season so far, n=41 vs 38\)\.$/.test(line) && !FORBID.test(line), 'a line is a description with n')
  const again = buildReport(rows, { sport: 'test', market: 'T', label: 'TEST', reps: 80, candidates: true })
  ok(JSON.stringify(publicLines(rep)) === JSON.stringify(publicLines(again)) && rep.boardNoCall.readout === again.boardNoCall.readout, 'deterministic: the same rows give the same lines')
  // the real published file, if there is one
  const pubPath = new URL('../lib/learn/published.json', import.meta.url)
  if (fs.existsSync(pubPath)) {
    const pub = JSON.parse(fs.readFileSync(pubPath, 'utf8'))
    for (const [sp, e] of Object.entries(pub.sports || {})) {
      ok(Object.hasOwn(LEARN_SPORTS, sp) && !LEARN_SPORTS[sp].hidden, `published.json: ${sp} is a known, public sport`)
      for (const m of e.markets) {
        ok(m.lines.length <= 3 && m.lines.every((l) => l.nA >= 30 && l.nB >= 30 && !FORBID.test(l.text) && !PUBLIC_DENY.test(l.feature) && /n=\d+ vs \d+/.test(l.text)), `published.json ${sp}/${m.market}: lines clear the floor and the word rules`)
        ok(m.gotAway.n === m.gotAway.onBoard + m.gotAway.notOnBoard, `published.json ${sp}/${m.market}: got-away counts add up`)
        ok(!JSON.stringify(m).includes('"features"'), `published.json ${sp}/${m.market}: no private tables`)
      }
    }
  }
}

// 7. THE SPORT TABLE, AND WHERE THE OUTPUT GOES ------------------------------------------------------------------------
{
  ok(JSON.stringify(Object.keys(LEARN_SPORTS).sort()) === JSON.stringify([...R.ALL_SPORT_KEYS].sort()), 'LEARN_SPORTS keys are the registry keys (lib/routes.js ALL_SPORT_KEYS)')
  ok(R.isHiddenSport('nba') === Boolean(LEARN_SPORTS.nba.hidden) && LEARN_SPORTS.nba.markets.length === 0, 'BUCKETS stays hidden: no markets, no public entry')
  for (const [k, S] of Object.entries(LEARN_SPORTS)) ok(S.markets.length === 0 || S.markets.filter((m) => m.lead).length === 1, `${k}: exactly one lead market`)
  const src = fs.readFileSync(new URL('./learn-report.mjs', import.meta.url), 'utf8')
  ok(!/['"`]docs[\/'"`]/.test(src.replace(/\/\/.*$/gm, '')) && /\.claude-notes/.test(src), 'the report goes to .claude-notes/learn, never docs/')
  ok(/^\.claude-notes\/$/m.test(fs.readFileSync(new URL('../.gitignore', import.meta.url), 'utf8')), '.claude-notes/ is gitignored')
  const lib = fs.readdirSync(new URL('../lib/learn/', import.meta.url)).filter((f) => f.endsWith('.js'))
  for (const f of lib) {
    const t = fs.readFileSync(new URL(`../lib/learn/${f}`, import.meta.url), 'utf8')
    ok(!/\b(sb|db|supabase)\.from|createClient|\.rpc\(|\.insert\(|\.upsert\(|\.delete\(/.test(t), `lib/learn/${f}: no database access`)
  }
}

if (bad) { console.log(`\n${bad} FAILED`); process.exit(1) }
console.log('check-learn: all green (TEST data)')
