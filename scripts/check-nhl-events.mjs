// THE GAME'S EVENT TRAIL, CHECKED (2026-10-22). lib/nhl/events.js eventsFromPlayByPlay + eventWords on a small TEST
// play-by-play (made up for this check, labelled TEST; the shape is the league's gamecenter/{id}/play-by-play).
//   node --no-warnings --import ./scripts/_esm-resolve.mjs scripts/check-nhl-events.mjs
const { eventsFromPlayByPlay, eventWords, powerPlayAt, penaltyStretches } = await import('../lib/nhl/events.js')
let bad = 0, n = 0
const ok = (c, m) => { n += 1; if (!c) { bad += 1; console.log('FAIL ' + m) } }
const per = (number, periodType = 'REG') => ({ number, periodType })
// TEST DATA
const TEST = {
  id: 9999020001, gameDate: '2099-01-01', gameType: 2, gameState: 'OFF',
  awayTeam: { id: 1, abbrev: 'AAA' }, homeTeam: { id: 2, abbrev: 'HHH' },
  rosterSpots: [
    { teamId: 1, playerId: 1000001, firstName: { default: 'Test' }, lastName: { default: 'Away' }, sweaterNumber: 9, positionCode: 'C', headshot: 'x.png' },
    { teamId: 2, playerId: 2000002, firstName: { default: 'Test' }, lastName: { default: 'Home' }, sweaterNumber: 91, positionCode: 'D' },
    { teamId: 2, playerId: 2000030, firstName: { default: 'Test' }, lastName: { default: 'Goalie' }, sweaterNumber: 30, positionCode: 'G' },
  ],
  plays: [
    { sortOrder: 1, typeDescKey: 'period-start', timeInPeriod: '00:00', periodDescriptor: per(1) },
    { sortOrder: 2, typeDescKey: 'faceoff', timeInPeriod: '00:00', periodDescriptor: per(1), details: { xCoord: 0, yCoord: 0, eventOwnerTeamId: 1, winningPlayerId: 1000001, losingPlayerId: 2000002 } },
    { sortOrder: 3, typeDescKey: 'hit', timeInPeriod: '00:15', periodDescriptor: per(1), details: { xCoord: 40, yCoord: 38, eventOwnerTeamId: 2, hittingPlayerId: 2000002, hitteePlayerId: 1000001 } },
    { sortOrder: 5, typeDescKey: 'goal', timeInPeriod: '01:02', periodDescriptor: per(1), details: { xCoord: 80, yCoord: -4, eventOwnerTeamId: 1, scoringPlayerId: 1000001, goalieInNetId: 2000030, awayScore: 1, homeScore: 0 } },
    { sortOrder: 4, typeDescKey: 'blocked-shot', timeInPeriod: '00:40', periodDescriptor: per(1), details: { xCoord: 70, yCoord: 5, eventOwnerTeamId: 2, shootingPlayerId: 1000001, blockingPlayerId: 2000002 } },
    { sortOrder: 6, typeDescKey: 'faceoff', timeInPeriod: '01:02', periodDescriptor: per(1), details: { xCoord: 0, yCoord: 0, eventOwnerTeamId: 2, winningPlayerId: 2000002, losingPlayerId: 1000001 } },
    { sortOrder: 7, typeDescKey: 'stoppage', timeInPeriod: '02:00', periodDescriptor: per(1), details: { reason: 'icing' } },
    { sortOrder: 8, typeDescKey: 'giveaway', timeInPeriod: '02:30', periodDescriptor: per(1), details: { eventOwnerTeamId: 2, playerId: 2000002 } },
    { sortOrder: 9, typeDescKey: 'shot-on-goal', timeInPeriod: '03:00', periodDescriptor: per(4, 'OT'), details: { xCoord: -70, yCoord: 10, eventOwnerTeamId: 2, shootingPlayerId: 2000002, goalieInNetId: 1 } },
    { sortOrder: 10, typeDescKey: 'goal', timeInPeriod: '00:00', periodDescriptor: per(5, 'SO'), details: { xCoord: 80, yCoord: 0, eventOwnerTeamId: 1, scoringPlayerId: 1000001 } },
  ],
}
const g = eventsFromPlayByPlay(TEST)
ok(g && g.away.abbrev === 'AAA' && g.home.abbrev === 'HHH' && g.gameType === 2, 'clubs and game type read')
ok(g.players[1000001].num === 9 && g.players[1000001].team === 'AAA' && g.players[1000001].face === 'x.png', 'a player: number, club, face')
ok(eventsFromPlayByPlay(null) === null && eventsFromPlayByPlay({}) === null, 'no feed: null, not a throw')
const kinds = g.events.map((e) => e.kind).join(',')
ok(kinds === 'faceoff,hit,block,goal,faceoff,sog', `in the feed's order, shootout and spotless events left out (${kinds})`)
ok(g.events[0].fresh === true && g.events[1].fresh === false, 'the opening faceoff starts fresh; the play after it does not')
ok(g.events[4].fresh === true, 'the faceoff after a goal starts fresh (the puck does not travel into it)')
ok(g.events[5].fresh === true, 'after a stoppage and a spotless giveaway, the next event starts fresh')
ok(g.events[2].team === 'AAA', "a block belongs to the shooter's club, not the blocking side the feed names")
ok(g.events[3].score.join('-') === '1-0' && g.events[5].score.join('-') === '1-0', 'the score moves on a goal and carries after it')
ok(g.events[5].pt === 'OT' && g.events[5].period === 4, 'overtime kept, with its period type')
ok(eventWords(g.events[1], g.players) === 'HIT · Home on Away', `hit words (${eventWords(g.events[1], g.players)})`)
ok(eventWords(g.events[3], g.players) === 'GOAL · Away', `goal words (${eventWords(g.events[3], g.players)})`)
ok(eventWords(g.events[2], g.players) === 'BLOCKED · Away, by Home', `block words (${eventWords(g.events[2], g.players)})`)
// THE POWER PLAY (TEST DATA)
ok(powerPlayAt({ sit: '1451' }) === 'home' && powerPlayAt({ sit: '1541' }) === 'away' && powerPlayAt({ sit: '1551' }) === null, 'strength code: who is a man up')
ok(powerPlayAt({ sit: '0651' }) === null, "a pulled goalie's extra attacker is not a power play")
ok(powerPlayAt({ sit: null }) === null && powerPlayAt(null) === null, 'no code: no power play')
const pen = [
  { kind: 'penalty', period: 1, t: 100, team: 'AAA', who: 1, dur: 2 },
  { kind: 'goal', period: 1, t: 160, team: 'HHH' },
  { kind: 'penalty', period: 1, t: 1150, team: 'HHH', who: 2, dur: 2 },
  { kind: 'penalty', period: 2, t: 10, team: 'AAA', who: 3, dur: 5 },
  { kind: 'goal', period: 2, t: 30, team: 'HHH' },
]
const st = penaltyStretches(pen)
ok(st[0].start === 100 && st[0].end === 160, 'a minor ends early on the power-play goal')
ok(st[1].start === 1150 && st[1].end === 1270, 'a minor runs across the period break in game time')
ok(st[2].end === 1210 + 300, 'a major runs its full five minutes, goal or not')
console.log(`${n - bad}/${n} checks ${bad ? 'FAILED' : 'pass'}`)
process.exit(bad ? 1 : 0)
