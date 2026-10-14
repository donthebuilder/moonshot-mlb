// Championship odds reader (lib/championship.js). TEST DATA, MADE UP: teams T00.. and every share are invented
// for these checks. Run: node --import ./scripts/_esm-resolve.mjs scripts/check-championship-odds.mjs
import assert from 'node:assert/strict'
import { CHAMPIONSHIP, readChampionship, applyRace, pctWords, listed, championshipFile } from '../lib/championship.js'

let failed = 0
const t = async (name, fn) => { try { await fn(); console.log('ok  ', name) } catch (e) { failed += 1; console.log('FAIL', name, '->', e.message) } }

function doc(sport, patch = {}) {
  const cfg = CHAMPIONSHIP[sport]
  const n = cfg.teams
  const teams = Array.from({ length: n }, (_, i) => {
    const champ = 1 / n
    return { team_id: 100 + i, abbr: `T${String(i).padStart(2, '0')}`, name: `Team ${i}`, wins: 5, losses: 1, ties: 0, otl: 1,
      make_playoffs: cfg.field / n, win_division: 0.25, top_seed: 0.06,
      win_round1: 0.5, win_round2: 0.25, win_round3: 0.12, win_round4: champ, win_champion: champ, seeds: { 1: 0.06 } }
  })
  return { schema: 1, season: 2026, as_of: '2026-10-14T04:00:00Z', sims: 10000, method: 'TEST method text', teams, ...patch }
}

await t('a good file is read for every sport', () => {
  for (const s of ['nfl', 'nhl', 'nba']) assert.equal(readChampionship(s, doc(s)).ok, true, s)
})
await t('no method, no sims, or a partial team list means no file', () => {
  assert.equal(readChampionship('nfl', doc('nfl', { method: '  ' })).ok, false)
  assert.equal(readChampionship('nfl', doc('nfl', { sims: 0 })).ok, false)
  const d = doc('nhl'); d.teams = d.teams.slice(0, 31)
  assert.match(readChampionship('nhl', d).why, /expected 32/)
  assert.equal(readChampionship('nfl', null).ok, false)
})
await t('a percent written as a share makes the whole file unreadable', () => {
  const d = doc('nfl'); d.teams[3].make_playoffs = 31.5
  assert.equal(readChampionship('nfl', d).ok, false)
})
await t('champion shares must sum to 1 (+-0.05) and round 4 must equal the champion share', () => {
  const d = doc('nba'); d.teams.forEach((x) => { x.win_champion = 0.5 / 30; x.win_round4 = 0.5 / 30 })
  assert.match(readChampionship('nba', d).why, /sums to/)
  const e = doc('nfl'); e.teams[0].win_round4 = e.teams[0].win_champion - 0.01
  assert.equal(readChampionship('nfl', e).ok, false)
})
await t('rounds must be monotone per team', () => {
  const d = doc('nhl'); d.teams[0].win_round2 = 0.9
  assert.match(readChampionship('nhl', d).why, /monotone/)
})
await t('the lock rule: clinched prints 100%, eliminated prints 0, no race block changes nothing', () => {
  assert.equal(applyRace({ make_playoffs: 0.93, race: { clinch: 'x', eliminated: false } }).make_playoffs, 1)
  assert.equal(applyRace({ make_playoffs: 0.04, race: { clinch: '', eliminated: true } }).make_playoffs, 0)
  const free = applyRace({ make_playoffs: 0.4 })
  assert.equal(free.make_playoffs, 0.4); assert.equal(free.locked, '')
})
await t('percent words: <1% under 1%, >99% at 99.5%+, dash for nothing', () => {
  assert.equal(pctWords(0.004), '<1%'); assert.equal(pctWords(0.996), '>99%'); assert.equal(pctWords(0.314), '31%')
  assert.equal(pctWords(0), '—'); assert.equal(pctWords(undefined), '—')
})
await t('listed: title-chance order, anyone with no path is left out', () => {
  const teams = [{ abbr: 'A', make_playoffs: 0.9, win_champion: 0.1 }, { abbr: 'B', make_playoffs: 0, win_champion: 0 },
    { abbr: 'C', make_playoffs: 0.5, win_champion: 0.3 }, { abbr: 'D', make_playoffs: 0.001, win_champion: 0, locked: '' }]
  assert.deepEqual(listed(teams).map((x) => x.abbr), ['C', 'A'])
})
await t('files and columns: one file per sport, the round fields named by the spec', () => {
  assert.equal(championshipFile('nfl'), 'current/nfl_playoff_odds.json')
  assert.equal(championshipFile('nhl'), 'current/nhl_playoff_odds.json')
  assert.equal(championshipFile('nba'), 'current/nba_playoff_odds.json')
  assert.deepEqual(CHAMPIONSHIP.nfl.cols.map((c) => c[0]), ['win_division', 'top_seed', 'win_round3'])
  assert.equal(CHAMPIONSHIP.nba.cols.some((c) => c[0] === 'win_division'), false, 'NBA has no divisions')
})
console.log(failed ? `\n${failed} FAILED` : '\nall ok')
process.exit(failed ? 1 : 0)
