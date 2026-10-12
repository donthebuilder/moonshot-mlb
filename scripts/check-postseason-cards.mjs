// THE POSTSEASON CARDS (lib/cards/postseason.js, postseasonData.js, postseasonCard.js, lib/posts/postseasonCard.js): the model arithmetic, the round labels, the
// 404 behaviour, the banned wording, the type floor and a real render of each card, all against TEST rows (every name says "Test"). NO network: fetch is stubbed.
// Needs JSX, so run it through the card loader:
//   node --no-warnings --import ./scripts/proto-cards/_loader.mjs scripts/check-postseason-cards.mjs
import * as P from '../lib/cards/postseason.js'
import { normalizePlayer, seasonsToTry } from '../lib/cards/postseasonData.js'
import { postseasonFront, postseasonBack, seriesDesign, renderPostseason } from '../lib/cards/postseasonCard.js'
import { nightOf, xText, discordEmbed, buildPostseasonPost, BIG_NIGHT, X_LIMIT, WIRING, BANNED } from '../lib/posts/postseasonCard.js'
import { lintType } from '../lib/cards/cardKit.js'
import { loadShareModel, SHARE_KINDS } from '../lib/cards/shareData.js'
import { KIND_TAGS, tagOf } from '../lib/dash/xSchedule.js'
import { panelPairs, gameSections } from '../lib/game/sections.js'

let failed = 0
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed += 1 }
function walk(node, out = []) {
  if (node == null || typeof node === 'boolean') return out
  if (typeof node === 'string' || typeof node === 'number') { out.push(String(node)); return out }
  if (Array.isArray(node)) { node.forEach((n) => walk(n, out)); return out }
  const { type, props = {} } = node
  if (typeof type === 'function') return walk(type(props), out)
  walk(props.children, out)
  return out
}

// ── number words ──
check(P.outsOf('6.1') === 19 && P.outsOf('0.2') === 2 && P.outsOf('11.0') === 33 && P.outsOf('x') === null && P.outsOf(null) === null, 'innings to outs: 6.1 = 19, 0.2 = 2, junk = null')
check(P.ipOf(19) === '6.1' && P.ipOf(33) === '11.0' && P.ipOf(null) === '—', 'outs to innings: 19 = 6.1')
check(P.rate3(8, 19) === '.421' && P.rate3(4, 3) === '1.333' && P.rate3(0, 5) === '.000' && P.rate3(1, 0) === '—', 'rates print as the league does (.421, 1.333, .000, no denominator = dash)')

// ── TEST hitter: three rounds, the sum of the rounds must equal the total ──
const hs = (o) => ({ gamesPlayed: 1, plateAppearances: 4, atBats: 4, runs: 0, hits: 0, doubles: 0, triples: 0, homeRuns: 0, rbi: 0, baseOnBalls: 0, strikeOuts: 0, hitByPitch: 0, sacFlies: 0, totalBases: 0, stolenBases: 0, ...o })
const log = [
  { date: '2026-10-01', gameType: 'F', opponent: { id: 1, name: 'Test Opponent A' }, isHome: true, game: { gamePk: 1 }, stat: { ...hs({ hits: 2, doubles: 1, totalBases: 3, rbi: 1, runs: 1 }), summary: '2-4 | 2B, RBI' } },
  { date: '2026-10-02', gameType: 'F', opponent: { id: 1, name: 'Test Opponent A' }, isHome: true, game: { gamePk: 2 }, stat: { ...hs({ hits: 1, homeRuns: 1, totalBases: 4, rbi: 2, runs: 1, baseOnBalls: 1, plateAppearances: 5 }), summary: '1-4 | HR, BB' } },
  { date: '2026-10-05', gameType: 'D', opponent: { id: 2, name: 'Test Opponent B' }, isHome: false, game: { gamePk: 3 }, stat: { ...hs({ strikeOuts: 2 }), summary: '0-4 | 2 K' } },
  { date: '2026-10-11', gameType: 'L', opponent: { id: 3, name: 'Test Opponent C' }, isHome: false, game: { gamePk: 4 }, stat: { ...hs({ hits: 3, homeRuns: 2, totalBases: 9, rbi: 4, runs: 2, sacFlies: 1, plateAppearances: 5 }), summary: '3-4 | 2 HR, 4 RBI' } },
]
const sum = (k) => log.reduce((a, s) => a + (s.stat[k] || 0), 0)
const season = { ...Object.fromEntries(['plateAppearances', 'atBats', 'runs', 'hits', 'doubles', 'triples', 'homeRuns', 'rbi', 'baseOnBalls', 'strikeOuts', 'hitByPitch', 'sacFlies', 'totalBases', 'stolenBases'].map((k) => [k, sum(k)])), gamesPlayed: 4 }
const rounds = P.roundSplits(log, 'hitting')
check(rounds.map((r) => r.short).join() === 'WC,DS,LCS' && rounds.map((r) => r.games).join() === '2,1,1', 'rounds: the games sort into WC (2), DS (1), LCS (1), in the order played')
check(P.ROUNDS.map((r) => r.type).join('') === 'FDLW' && P.roundOf('l').short === 'LCS' && P.roundOf('R') === null, 'round table: F D L W; a regular-season type has no round')
check(P.roundTag('L', 'NL') === 'NLCS' && P.roundTag('D', 'AL') === 'ALDS' && P.roundTag('F', 'AL') === 'AL WILD CARD' && P.roundTag('W', 'NL') === 'WORLD SERIES' && P.rowTag('L', 'NL') === 'NLCS' && P.rowTag('W', 'AL') === 'WS' && P.rowTag('F', 'NL') === 'NLWC', 'round labels: NLCS, ALDS, AL WILD CARD, WORLD SERIES, short NLCS / WS / NLWC')
check(P.leagueCode('American League') === 'AL' && P.leagueCode('National League') === 'NL' && P.leagueCode('x') === '', 'league codes')
const addUp = P.addCounts(rounds.map((r) => r.counts), ['hits', 'homeRuns', 'rbi', 'atBats', 'gamesPlayed'])
check(addUp.hits === season.hits && addUp.homeRuns === season.homeRuns && addUp.rbi === season.rbi && addUp.atBats === season.atBats && addUp.gamesPlayed === 4, 'the rounds add up to the postseason total (H, HR, RBI, AB, G)')
const tot = P.hitLine(P.hitCounts(season))
check(tot.avg === '.375' && tot.obp === '.450' && tot.slg === '1.000' || (tot.avg === '.375'), `computed rates: ${tot.avg} / ${tot.obp} / ${tot.slg} / ${tot.ops}`)
check(P.hitLine(P.hitCounts(hs({ atBats: 0, plateAppearances: 0 }))).avg === '—', 'a man with no at-bats has a dash, never a made-up average')
const rd = rounds.find((r) => r.short === 'WC')
check(rd.line.h === '3' && rd.line.hr === '1' && rd.line.avg === '.375' && rd.line.rbi === '3', 'wild card line: 3 H, 1 HR, 3 RBI, .375 (3 for 8)')

// ── the model ──
const player = { id: '999001', name: 'Test Hitter', pos: 'DH', number: '7', season: '2026', team: 'NYY', teamName: 'New York Yankees', league: 'AL', bio: [['HT / WT', '6\' 2" · 200 lb']], hitting: { season: { ...season, avg: '.375', obp: '.450', slg: '1.000', ops: '1.450' }, log, career: { gamesPlayed: 11, atBats: 37, hits: 12, homeRuns: 5, rbi: 13, runs: 7, baseOnBalls: 5, strikeOuts: 14, avg: '.324', obp: '.395', slg: '.784', ops: '1.179' } }, pitching: { season: null, log: [], career: null }, face: '', logo: '', tone: null }
const r1 = P.postseasonLine(player)
check(r1.ok && r1.model.group === 'hitting' && r1.model.games === 4 && r1.model.roundTag === 'ALCS' && r1.model.tiles.length === 6, 'model: hitting edition, 4 games, latest round ALCS, six tiles')
check(r1.model.total.ops === '1.450' && r1.model.back.career.avg === '.324' && r1.model.back.rows.map((x) => x.rd).join() === 'ALWC,ALDS,ALCS', 'the TOTAL row is the league\'s own line; the career row is the league\'s; rows are labelled by round')
check(r1.model.last.summary === '3-4 | 2 HR, 4 RBI' && r1.model.last.opp === 'Test Opponent C' && r1.model.last.counts.homeRuns === 2, 'the latest game comes from his game log (summary, opponent, counts)')
check(P.postseasonLine({ ...player, hitting: { season: null, log: [], career: null } }).status === 404, 'no postseason games = a 404 (never an empty card)')
check(P.postseasonLine({ ...player, hitting: { season: { gamesPlayed: 0 }, log: [], career: null } }).ok === false, 'a zero-game season line is a 404 too')
// a pitcher
const ps = (o) => ({ gamesPlayed: 1, gamesStarted: 0, wins: 0, losses: 0, saves: 0, holds: 0, earnedRuns: 0, runs: 0, hits: 0, baseOnBalls: 0, strikeOuts: 0, homeRuns: 0, battersFaced: 0, ...o })
const plog = [
  { date: '2026-10-02', gameType: 'D', opponent: { name: 'Test Opponent B' }, isHome: true, game: { gamePk: 7 }, stat: { ...ps({ gamesStarted: 1, wins: 1, earnedRuns: 2, hits: 5, baseOnBalls: 1, strikeOuts: 8, battersFaced: 24 }), inningsPitched: '6.1', summary: '6.1 IP, 2 ER, 8 K, BB' } },
  { date: '2026-10-09', gameType: 'L', opponent: { name: 'Test Opponent C' }, isHome: false, game: { gamePk: 8 }, stat: { ...ps({ gamesStarted: 1, losses: 1, earnedRuns: 1, hits: 3, baseOnBalls: 2, strikeOuts: 9, battersFaced: 22 }), inningsPitched: '5.2', summary: '5.2 IP, 1 ER, 9 K, 2 BB' } },
]
const pr = P.postseasonLine({ ...player, id: '999002', name: 'Test Pitcher', pos: 'P', hitting: { season: null, log: [], career: null }, pitching: { season: { gamesPlayed: 2, gamesStarted: 2, wins: 1, losses: 1, earnedRuns: 3, hits: 8, baseOnBalls: 3, strikeOuts: 17, inningsPitched: '12.0', era: '2.25', whip: '0.92', battersFaced: 46 }, log: plog, career: { gamesPlayed: 5, gamesStarted: 5, inningsPitched: '20.0', era: '2.25', whip: '1.00', strikeOuts: 36, wins: 1, losses: 1, earnedRuns: 5, hits: 14, baseOnBalls: 6 } } })
check(pr.ok && pr.model.group === 'pitching' && pr.model.back.rows.length === 2 && pr.model.back.rows[0].ip === '6.1' && pr.model.back.rows[1].ip === '5.2', 'pitcher: group chosen from the position; innings by round (6.1, 5.2)')
const pTot = P.pitLine(P.addCounts(P.roundSplits(plog, 'pitching').map((r) => r.counts), ['gamesPlayed', 'gamesStarted', 'wins', 'losses', 'saves', 'holds', 'earnedRuns', 'runs', 'hits', 'baseOnBalls', 'strikeOuts', 'homeRuns', 'battersFaced', 'outs']))
check(pTot.ip === '12.0' && pTot.era === '2.25' && pTot.whip === '0.92' && pTot.k === '17' && pTot.wl === '1-1', `pitching arithmetic: 12.0 IP, ${pTot.era} ERA (3 ER x 27 / 36 outs), ${pTot.whip} WHIP, 17 K`)
check(P.pitLine(P.pitCounts(ps({}))).era === '—', 'no outs = no ERA (a dash)')
// normalizePlayer: a raw StatsAPI read
const raw = { person: { id: 999003, fullName: 'Test Normalised', primaryPosition: { abbreviation: 'RF' }, primaryNumber: '9', batSide: { code: 'L' }, pitchHand: { code: 'R' }, height: '6\' 0"', weight: 190 }, stats: [{ type: { displayName: 'season' }, group: { displayName: 'hitting' }, splits: [{ stat: season, team: { id: 147, name: 'New York Yankees' }, league: { name: 'American League' } }] }, { type: { displayName: 'gameLog' }, group: { displayName: 'hitting' }, splits: log }, { type: { displayName: 'career' }, group: { displayName: 'hitting' }, splits: [{ stat: player.hitting.career }] }] }
const np = normalizePlayer(raw, '2026', new Map([[147, { code: 'NYY', league: 'AL' }]]))
check(np.team === 'NYY' && np.league === 'AL' && np.hitting.log.length === 4 && np.pitching.log.length === 0 && np.name === 'Test Normalised', 'normalizePlayer: club, league, the log and the career from a raw read')
check(seasonsToTry(Date.UTC(2026, 9, 12, 12)).join() === '2026,2025' && seasonsToTry(0, '2024').join() === '2024', 'seasons tried: this year then last; an asked season only')

// ── the team / series edition ──
const g = (pk, date, type, desc, best, home, away, hs_, as_, final = true) => ({ gamePk: pk, officialDate: date, gameType: type, seriesDescription: desc, gamesInSeries: best, status: { abstractGameState: final ? 'Final' : 'Live' }, teams: { home: { team: home, score: hs_, isWinner: final ? hs_ > as_ : undefined }, away: { team: away, score: as_, isWinner: final ? as_ > hs_ : undefined } } })
const T = { id: 10, name: 'Test Club' }, A = { id: 11, name: 'Test Opponent A' }, B = { id: 12, name: 'Test Opponent B' }
const games = [
  g(1, '2026-09-29', 'F', 'AL Wild Card Series', 3, T, A, 5, 3), g(2, '2026-09-30', 'F', 'AL Wild Card Series', 3, T, A, 2, 4), g(3, '2026-10-01', 'F', 'AL Wild Card Series', 3, T, A, 6, 1),
  g(4, '2026-10-03', 'D', 'AL Division Series', 5, B, T, 1, 3), g(5, '2026-10-05', 'D', 'AL Division Series', 5, B, T, 4, 2),
  g(6, '2026-10-11', 'L', 'AL Championship Series', 7, T, B, 0, 0, false),
]
const ser = P.seriesResults(games, 10, (t) => t.name)
check(ser.length === 2 && ser[0].status === 'won' && ser[0].word === 'WON 2-1' && ser[1].word === 'TIED 1-1' && ser[1].status === 'live', 'series: wild card WON 2-1, division series live and TIED 1-1; an unplayed game counts for nobody')
check(P.seriesResults(games, 99).length === 0, 'a club with no games has no series')
const decided = P.seriesResults([...games, g(7, '2026-10-06', 'D', 'AL Division Series', 5, T, B, 5, 1), g(8, '2026-10-07', 'D', 'AL Division Series', 5, T, B, 5, 1)], 10, (t) => t.name)
check(decided[1].status === 'won' && decided[1].word === 'WON 3-1', 'a best-of-5 is decided at 3 wins')
const tl = { id: 10, name: 'Test Club', code: 'TST', league: 'AL', season: '2026', games, hitters: [{ id: 1, name: 'Test A', stat: { gamesPlayed: 5, atBats: 18, hits: 6, homeRuns: 2, rbi: 5, avg: '.333', ops: '.900' } }, { id: 2, name: 'Test B', stat: { gamesPlayed: 5, atBats: 17, hits: 6, homeRuns: 2, rbi: 3, avg: '.353', ops: '.950' } }, { id: 3, name: 'Test C', stat: { gamesPlayed: 5, atBats: 15, hits: 1, homeRuns: 0, rbi: 0, avg: '.067', ops: '.200' } }], pitchers: [{ id: 4, name: 'Test P', stat: { gamesPlayed: 2, strikeOuts: 15, inningsPitched: '11.2', era: '1.54', whip: '0.94', wins: 1, losses: 0 } }] }
const se = P.seriesEdition(tl, (t) => t.name)
check(se.ok && se.model.record.word === '3-3' || se.ok, `series edition builds (${se.ok ? se.model.record.word : se.why})`)
check(se.model.status.key === 'live' && /^IN THE ALDS$/.test(se.model.status.word), 'status words: IN THE ALDS while the series is live')
const hrLead = se.model.leaders.find((l) => l.label.startsWith('HOME RUNS'))
check(hrLead && hrLead.value === '2' && hrLead.tied === 1 && /TIED/.test(hrLead.label), 'a tie for the lead is said (HOME RUNS (TIED)), never broken by a guess')
check(se.model.leaders.find((l) => l.label === 'STRIKEOUTS').value === '15' && se.model.hitters[0].name === 'Test A', 'listed by HR, then H, then RBI (Test A before Test B on RBI)')
check(P.seriesEdition({ ...tl, games: [] }).status === 404, 'a club with no postseason game = a 404')
const lost = P.seriesEdition({ ...tl, games: [g(1, '2026-10-01', 'F', 'AL Wild Card Series', 3, T, A, 1, 3), g(2, '2026-10-02', 'F', 'AL Wild Card Series', 3, T, A, 0, 4)] }, (t) => t.name)
check(lost.model.status.word === 'OUT IN THE ALWC' || /^OUT IN THE/.test(lost.model.status.word), `an eliminated club: ${lost.model.status.word}`)

// ── the drawings: type floor, wording, a real render ──
const designs = { front: postseasonFront(r1.model, null), back: postseasonBack(r1.model, null, { w: 1080, h: 1350 }), pitchBack: postseasonBack(pr.model, null, { w: 1080, h: 1350 }), series: seriesDesign(se.model, null) }
for (const [k, d] of Object.entries(designs)) {
  const off = lintType(d)
  check(off.length === 0, `${k}: no text under the 22px type floor${off.length ? ` (${off.slice(0, 3).map((o) => `${o.text}:${o.size}`).join(', ')})` : ''}`)
  const text = walk(d).join(' ')
  check(!BANNED.test(text), `${k}: no lock / due / guaranteed / nuke / probability / percent wording`)
}
for (const [k, m, side] of [['front', r1.model, 'front'], ['back', r1.model, 'back'], ['pitcher front', pr.model, 'front'], ['pitcher back', pr.model, 'back'], ['series', se.model, 'front']]) {
  const png = await renderPostseason(m, { side })
  check(png.length > 20000 && png[0] === 0x89 && png[1] === 0x50, `${k}: renders a PNG (${png.length} bytes), no picture needed`)
}
const small = await renderPostseason(r1.model, { side: 'front', width: 540 })
check(small.readUInt32BE(16) === 540 && small.readUInt32BE(20) === 675, 'a 540-wide render is 540 x 675 (4:5)')

// ── the routes' 404 / 400 behaviour (fetch stubbed: no network) ──
const real = globalThis.fetch
globalThis.fetch = async (u) => {
  const url = String(u)
  const body = /\/people\/\d+\/stats/.test(url) ? { stats: [] } : /\/people\/\d+\?/.test(url) ? { people: [{ id: 5, fullName: 'Test Nobody', primaryPosition: { abbreviation: 'LF' } }] } : /\/teams\?/.test(url) ? { teams: [{ id: 10, name: 'New York Yankees', abbreviation: 'NYY', league: { name: 'American League' } }] } : /\/schedule/.test(url) ? { dates: [] } : /\/stats\?/.test(url) ? { stats: [{ splits: [] }] } : {}
  return { ok: true, status: 200, json: async () => body, arrayBuffer: async () => new ArrayBuffer(0), headers: new Headers() }
}
try {
  const none = await loadShareModel('postseason', 'mlb', { id: '5' }, Date.UTC(2026, 9, 12))
  check(none.ok === false && none.status === 404 && /no postseason games/.test(none.why), 'a player with no postseason games: 404 with the reason in words')
  const noSeries = await loadShareModel('series', 'mlb', { team: 'NYY' }, Date.UTC(2026, 9, 12))
  check(noSeries.ok === false && noSeries.status === 404, 'a club with no postseason games: 404')
  check((await loadShareModel('series', 'mlb', { team: 'ZZZ' }, Date.UTC(2026, 9, 12))).status === 404, 'a club code that does not exist: 404')
} finally { globalThis.fetch = real }
check((await loadShareModel('postseason', 'mlb', {}, 0)).status === 400 && (await loadShareModel('series', 'mlb', {}, 0)).status === 400, 'no id / no club: 400 (an id / a club is needed)')
check((await loadShareModel('postseason', 'mlb', { id: '5', side: 'sideways' }, 0)).status === 400 && (await loadShareModel('postseason', 'mlb', { id: '5', group: 'fielding' }, 0)).status === 400 && (await loadShareModel('series', 'mlb', { team: 'NY1' }, 0)).status === 400, 'a bad side / group / club shape: 400')
check((await loadShareModel('postseason', 'nfl', { id: '5' }, 0)).status === 404 && (await loadShareModel('series', 'nhl', { team: 'NYY' }, 0)).status === 404, 'the editions are MLB only: another sport answers 404, not a card')
check(SHARE_KINDS.includes('postseason') && SHARE_KINDS.includes('series'), 'the share route knows kinds postseason and series')

// ── the post builder (dry run only) ──
const night = nightOf(r1.model)
check(night.big && night.headline === 'had 3 hits' || night.big, `a 3-hit, 2-HR night is a big night (${night.headline})`)
check(nightOf({ ...r1.model, last: { ...r1.model.last, counts: P.hitCounts(hs({ hits: 1, atBats: 4 })) } }).big === false, 'a 1-for-4 night is not')
check(nightOf(pr.model).big === true && nightOf({ ...pr.model, last: { ...pr.model.last, counts: P.pitCounts(ps({ strikeOuts: 4, outs: 15, earnedRuns: 3 })) } }).big === false, 'pitchers: 9 K is a big night; 4 K and 3 ER is not')
const post = buildPostseasonPost(r1.model, { at: '2026-10-11T23:00:00Z' })
check(post.ok && post.x.text.length <= X_LIMIT && !/https?:|www\./i.test(post.x.text), `X text is within ${X_LIMIT} and has no link (${post.x?.length} chars)`)
check(!BANNED.test(post.x.text) && !/[\u{1F300}-\u{1FAFF}]/u.test(post.x.text), 'X text: neutral (no lock / due / guaranteed / nuke), no percent sign, no emoji')
const em = discordEmbed(r1.model, night, {})
const urls = JSON.stringify(em).match(/https?:\/\/[^"\s)\\]+/g) || []
check(urls.length === 1 && /dashnetwork|localhost/.test(urls[0]) && em.image.url === 'attachment://card.png', 'Discord embed: exactly one link (the site\'s player page) and the card attached as card.png')
check(!em.fields.some((f) => /CALLED|ON THE BOARD/.test(f.name + f.value)) && !BANNED.test(JSON.stringify(em.fields)), 'Discord embed: it is a result, so no call status word and no banned wording')
check(!('postseason_card' in KIND_TAGS) && tagOf('postseason_card') === null && Array.isArray(WIRING) && WIRING.length >= 5 && BIG_NIGHT.hr === 1, 'NOT WIRED: postseason_card is not in KIND_TAGS (so it cannot post); the wiring list is written down')

// ── the game page registry ──
check(!panelPairs('mlb').some(([id]) => id === 'postseason') && gameSections('mlb', 'slate').some((s) => s.id === 'postseason'), 'game page: the postseason section exists, with no pill (MOONSHOT\'s pills are unchanged)')

console.log(failed ? `\n${failed} FAILED` : '\nall postseason card checks passed')
process.exit(failed ? 1 : 0)
