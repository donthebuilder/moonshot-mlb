// MLB'S STATE, CHECKED (2026-10-21, BATCH-MLB-OFFSEASON B1). lib/mlb/phase.js phaseFrom on TEST schedule bodies (regular, postseason, the gap after
// the World Series, the fall league, spring training, an unreadable feed), the forced preview, and the wiring (Home hands Tonight to the offseason
// page only in the OFFSEASON; the stale banner steps aside on Home). TEST data only.
//   node --no-warnings --import ./scripts/_esm-resolve.mjs scripts/check-mlb-phase.mjs
import fs from 'node:fs'
const P = await import('../lib/mlb/phase.js')
let bad = 0, n = 0
const ok = (c, m) => { n += 1; if (!c) { bad += 1; console.log('FAIL ' + m) } }
const g = (date, gameType, extra = {}) => ({ date, games: [{ gamePk: Math.floor(Math.random() * 1e6), gameType, gameDate: `${date}T23:00:00Z`, status: { abstractGameState: 'Preview' }, teams: { away: { team: { id: 1, name: 'Test Away' } }, home: { team: { id: 2, name: 'Test Home' } } }, ...extra }] })
const T = '2026-11-05'

ok(P.phaseFrom({ today: T, mlb: null }) === null, 'an unreadable schedule: no answer (the page stays as it was)')
ok(P.phaseFrom({ today: T, mlb: { dates: [g('2026-11-04', 'R')] } }).phase === 'REGULAR', 'a regular-season game in the window: REGULAR')
ok(P.phaseFrom({ today: T, mlb: { dates: [g('2026-11-03', 'W')] } }).phase === 'POSTSEASON', 'a World Series game in the window: POSTSEASON')
ok(P.phaseFrom({ today: T, mlb: { dates: [g('2026-11-02', 'R'), g('2026-11-05', 'F')] } }).phase === 'POSTSEASON', 'the nearest game decides (Wild Card today)')
const off = P.phaseFrom({ today: T, mlb: { dates: [] }, fall: { dates: [g(T, 'R'), g(T, 'R'), g('2026-11-06', 'R')] } })
ok(off.phase === 'OFFSEASON' && off.lane === 'FALL' && off.laneGames.length === 2 && off.next?.date === '2026-11-06', `no MLB game: OFFSEASON, the fall lane with today's games and the next (${JSON.stringify(off).slice(0, 160)})`)
ok(off.laneGames[0].away.name === 'Test Away' && off.laneGames[0].home.name === 'Test Home', 'a lane game carries its clubs')
const over = P.phaseFrom({ today: '2026-11-20', mlb: { dates: [] }, fall: { dates: [] } })
ok(over.phase === 'OFFSEASON' && over.lane === null, 'the fall league over: OFFSEASON, no lane')
ok(P.phaseFrom({ today: '2027-03-01', mlb: { dates: [g('2027-03-01', 'S'), g('2027-03-02', 'S')] } }).lane === 'SPRING', 'spring training: PRESEASON, the spring lane')
ok(P.phaseFrom({ today: '2027-03-01', mlb: { dates: [g('2027-03-01', 'S')] } }).phase === 'PRESEASON', 'PRESEASON')

ok(P.forcedPhase('?mlbPhase=offseason', T)?.phase === 'OFFSEASON' && P.forcedPhase('?mlbPhase=offseason', T).forced, 'the forced preview')
ok(P.forcedPhase('?x=1', T) === null && P.forcedPhase('?mlbPhase=nonsense', T) === null, 'nothing forced without a real state')

// the network read, faked: the fall league is asked only in the OFFSEASON
P._resetPhaseForTests()
const asked = []
const fetcher = async (u) => { asked.push(u); return { ok: true, json: async () => (u.includes('sportId=17') ? { dates: [g(T, 'R')] } : { dates: [] }) } }
const live = await P.mlbPhase(T, { fetcher })
ok(live.phase === 'OFFSEASON' && live.lane === 'FALL' && asked.length === 2 && asked[1].includes('leagueId=119'), `two reads in the offseason, the fall league second (${asked.length})`)
P._resetPhaseForTests(); asked.length = 0
await P.mlbPhase('2026-07-01', { fetcher: async (u) => { asked.push(u); return { ok: true, json: async () => ({ dates: [g('2026-07-01', 'R')] }) } } })
ok(asked.length === 1, 'one read in season')

const home = fs.readFileSync(new URL('../components/tabs/Home.js', import.meta.url), 'utf8')
ok(/if \(mlbPhase\?\.phase === 'OFFSEASON' && view === 'tonight'\) return <MlbOffseason/.test(home), 'Home hands Tonight to the offseason page only in the OFFSEASON')
const banner = fs.readFileSync(new URL('../components/StaleBanner.js', import.meta.url), 'utf8')
ok(/phase\?\.phase === 'OFFSEASON'[\s\S]{0,40}if \(onHome\) return null/.test(banner), 'the stale banner steps aside on Home in the offseason')
const dash = fs.readFileSync(new URL('../components/Dashboard.js', import.meta.url), 'utf8')
ok(/onHome=\{tab === 'home'\}/.test(dash), 'the shell tells the banner when it is on Home')
const pg = fs.readFileSync(new URL('../components/tabs/MlbOffseason.js', import.meta.url), 'utf8')
ok(/useLockedRecord/.test(pg) && /columns\(C\.orange/.test(pg) && !/\d+\/\d+ /.test(pg.replace(/\/\/.*$/gm, '')), 'the record comes from the locked-record reader in the record table\'s columns (no typed numbers)')

console.log(bad ? `${bad}/${n} FAILED` : `check-mlb-phase: ${n} checks passed (TEST data)`)
process.exit(bad ? 1 : 0)
