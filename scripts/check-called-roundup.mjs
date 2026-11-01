// THE ROUNDUP'S GAMES FROM THE CALLS (lib/posts/calledRoundup.js, 2026-10-31). TEST data only.
//   node --no-warnings --import ./scripts/_esm-resolve.mjs scripts/check-called-roundup.mjs
import assert from 'node:assert/strict'
const C = await import('../lib/posts/calledRoundup.js')
let n = 0, bad = 0
const t = (name, fn) => { n++; try { fn(); console.log(`ok    ${name}`) } catch (e) { bad++; console.log(`FAIL  ${name}\n      ${e.message}`) } }
const row = (gid, pid, name, score, extra = {}) => ({ game_id: gid, player_id: pid, name, score, status: 'called', team: 'TST', opp: 'OPP', pos: 'C', ...extra })

t('LAMP: every game with a locked called skater is listed, best score first, at most three names, in the games\' own order', () => {
  const rows = [row(1, 'a', 'Test A', 80), row(1, 'b', 'Test B', 90), row(1, 'c', 'Test C', 70), row(1, 'd', 'Test D', 60), row(2, 'e', 'Test E', 75), row(3, 'f', 'Test F', 99, { status: 'board' }), row(4, 'g', 'Test G', 88)]
  const meta = [{ game_id: 1, locked_at: 'x' }, { game_id: 2, locked_at: 'x' }, { game_id: 3, locked_at: 'x' }]      // game 4 has not locked: a preview is not a call
  const games = [1, 2, 3, 4].map((id) => ({ id, start: `2026-10-31T${17 + id}:00:00Z`, away: `A${id}`, home: `H${id}` }))
  const out = C.nhlCalledGames({ rows, meta, games })
  assert.deepEqual(out.map((g) => g.game_id), ['1', '2'], 'game 3 has no CALLED man, game 4 has not locked')
  assert.deepEqual(out[0].names, ['Test B', 'Test A', 'Test C']); assert.deepEqual(out[0].teams, ['A1', 'H1']); assert.equal(out[0].kickoff, '2026-10-31T18:00:00.000Z')
})
t('BUCKETS: the points board\'s locked CALLED rows per game; an unlocked (preview) row is never named', () => {
  const board = { games: [{ id: '10', start: '2026-10-31T23:00:00Z', away: { abbrev: 'AWY' }, home: { abbrev: 'HOM' } }, { id: '11', start: '2026-11-01T00:00:00Z', away: { abbrev: 'X' }, home: { abbrev: 'Y' } }],
    rows: [row('10', 'a', 'Test A', 90, { gameId: '10', locked: true }), row('10', 'b', 'Test B', 95, { gameId: '10', locked: true }), row('11', 'c', 'Test C', 99, { gameId: '11', locked: false })] }
  const out = C.nbaCalledGames({ board })
  assert.equal(out.length, 1); assert.deepEqual(out[0].names, ['Test B', 'Test A']); assert.deepEqual(out[0].teams, ['AWY', 'HOM'])
})
t('TUDDY: the game calls file\'s LOCKED games only; the TOP call first, the rest after, no repeats, at most three', () => {
  const games = [
    { game_id: 'g1', kickoff: '2026-11-01T18:00:00Z', away: 'AAA', home: 'BBB', locked: true, calls: [{ role: 'TD', name: 'Test Back', slate_rank: 2 }, { role: 'TOP', name: 'Test Top', slate_rank: 1 }, { role: 'TD', name: 'Test Back' }, { role: 'TD', name: 'Test Third', slate_rank: 3 }, { role: 'TD', name: 'Test Fourth', slate_rank: 4 }] },
    { game_id: 'g2', kickoff: '2026-11-01T18:00:00Z', away: 'CCC', home: 'DDD', locked: false, calls: [{ role: 'TOP', name: 'Test Unlocked' }] },
    { game_id: 'g3', kickoff: '2026-11-01T21:00:00Z', away: 'EEE', home: 'FFF', locked: true, calls: [] },
  ]
  const out = C.nflCalledGames({ games })
  assert.equal(out.length, 1); assert.deepEqual(out[0].names, ['Test Top', 'Test Back', 'Test Third']); assert.deepEqual(out[0].teams, ['AAA', 'BBB'])
})
t('nothing locked: nothing listed (never a guess)', () => {
  assert.deepEqual(C.nflCalledGames({ games: null }), []); assert.deepEqual(C.nbaCalledGames({ board: null }), []); assert.deepEqual(C.nhlCalledGames({ rows: [], meta: [], games: [{ id: 1 }] }), [])
})
const B = await import('../lib/dash/liveBox.js')
const F = await import('../lib/dash/membersFolds.js')
t('a 13-game football Sunday: every game stays on the one box, split across fields under 1,024 characters, each matchup a tappable link, none "+N earlier"', () => {
  const events = Array.from({ length: 13 }, (_, i) => { const it = { game_id: `g${i}`, teams: [`AW${i}`, `HM${i}`], names: ['Test Top Back', 'Test Second Runner', 'Test Third Catcher'], kickoff: new Date(Date.UTC(2026, 10, 1, 18, 0)).toISOString() }; return { key: it.game_id, at: Date.parse(it.kickoff) + i, section: 'Games with a pick', line: F.gameLine(it, null, { href: F.gameUrl('nfl', it.game_id) }) } })
  const e = B.liveEmbed({ sport: 'nfl', events, sections: [{ name: 'Games with a pick', noun: 'games with a pick', chunk: true, plays: true }], title: 'TEST box' })
  assert.equal(e.description, '13 games with a pick')
  assert.ok(e.fields.length >= 2 && e.fields.every((f) => [...f.value].length <= 1024), e.fields.map((f) => [...f.value].length).join(','))
  const all = e.fields.map((f) => f.value).join('\n')
  for (let i = 0; i < 13; i += 1) assert.ok(all.includes(`AW${i} at HM${i}`) && all.includes(`game=g${i})`), `game ${i} is on the box with its link`)
  assert.ok(!/earlier/.test(all)); assert.deepEqual(e.fields.map((f) => f.name), ['Games with a pick', ...Array(e.fields.length - 1).fill('Games with a pick (cont.)')])
})
console.log(bad ? `${bad}/${n} FAILED` : `OK: called roundup (${n} checks, TEST data)`)
process.exit(bad ? 1 : 0)
