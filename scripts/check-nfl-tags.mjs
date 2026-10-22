#!/usr/bin/env node
// NFL TAGS (lib/nfl/tags.js and every surface that prints one). All data below is TEST data, made up for this check only
// (clubs "T01".."T32", players "e1".."e9"); nothing here is a real player or a real number.
//   node --no-warnings --import ./scripts/_esm-resolve.mjs scripts/check-nfl-tags.mjs
import fs from 'node:fs'
import {
  TAG_RULES, TAG_ORDER, TAG_WORD, MIN_GAMES, TEAM_QUARTILE, PRESSURE_MIN_PLAYS,
  playerTags, teamTags, tagBook, tagOptions, hasTag, chipText, leagueRates, touchesOf, seasonPool,
} from '../lib/nfl/tags.js'
import { tdCallStatus, STATUS_WORD } from '../lib/callStatus.js'

let failed = 0
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed += 1 }
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const deepFreeze = (o) => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); Object.values(o).forEach(deepFreeze) } return o }

// ── 1. THE THRESHOLD TABLE: one table, the documented numbers ────────────────
check(MIN_GAMES === 3, 'the games floor is the site-wide 3 (lib/nfl/seasonRule.js MIN_GAMES_THIS)')
check(TAG_RULES.fumble_prone.minLost === 2 && TAG_RULES.fumble_prone.minRatePer100 === 1.0 && TAG_RULES.fumble_prone.minTouches === 40 && TAG_RULES.fumble_prone.minGames === 3, 'Fumble-prone: 2+ lost, 1.0+ per 100 touches, 40+ touches, 3+ games')
check(TAG_RULES.interception_prone.minInt === 3 && TAG_RULES.interception_prone.minRatePer100 === 3.0 && TAG_RULES.interception_prone.minAttempts === 60 && TAG_RULES.interception_prone.position === 'QB', 'Interception-prone: QB, 3+ INT, 3.0+ per 100 attempts, 60+ attempts')
check(TEAM_QUARTILE === 0.25 && PRESSURE_MIN_PLAYS === 300, 'defence tags: the best / worst quarter; last-season pressure needs 300+ plays')
check(TAG_ORDER.length === 8 && TAG_ORDER.every((k) => TAG_RULES[k] && TAG_WORD[k]), 'eight tags, each in the registry with a word')
check(['Fumble-prone', 'Interception-prone', 'Strong corners', 'Weak corners', 'Strong pass rush', 'Weak pass rush', 'Run stuffers', 'Soft vs run'].every((w) => Object.values(TAG_WORD).includes(w)), 'the words are the ones Donovan named')

// ── 2. PLAYER TAGS: threshold, sample floor, season label ────────────────────
const league = { lostPer100: 0.6, intPer100: 2.1 }
const ctx = { season: 2026, league, position: 'RB' }
const fp = (o) => playerTags({ games: 4, car: 60, rec: 10, att: 0, sacked: 0, fum: 3, lost: 2, ...o }, ctx).filter((t) => t.key === 'fumble_prone')
check(fp({}).length === 1, 'TEST: 2 lost on 70 touches (2.9 per 100), 4 games -> Fumble-prone')
check(fp({ lost: 1 }).length === 0, 'one fumble lost is never a tag (minLost 2)')
check(fp({ car: 190, rec: 10 }).length === 1 && fp({ car: 191, rec: 10 }).length === 0, 'the rate edge: 2 lost on 200 touches = 1.0 per 100 tags; on 201 it does not')
check(fp({ car: 30, rec: 9 }).length === 0 && fp({ car: 30, rec: 10 }).length === 1, 'the touches floor: 39 touches no tag, 40 tags')
check(fp({ games: 2 }).length === 0 && fp({ games: 3 }).length === 1, 'a man with 2 games gets NO tag; 3 games does')
const fpTag = fp({})[0]
check(fpTag.season === 2026 && fpTag.games === 4 && /4 games this season \(2026\)/.test(fpTag.note), 'the note names the season and the games')
check(/fumbles lost/.test(fpTag.note) && /70 touches/.test(fpTag.note) && /per 100 touches/.test(fpTag.note) && /against 0\.6 for the league/.test(fpTag.note), 'the note names the number behind it and the league rate')
const ip = (o, pos = 'QB') => playerTags({ games: 4, att: 120, int: 4, sacked: 8, car: 5, fum: 0, lost: 0, ...o }, { season: 2026, league, position: pos }).filter((t) => t.key === 'interception_prone')
check(ip({}).length === 1, 'TEST: 4 INT on 120 attempts (3.3 per 100), 4 games -> Interception-prone')
check(ip({ int: 2 }).length === 0 && ip({ int: 3, att: 101 }).length === 0 && ip({ int: 3, att: 100 }).length === 1, 'INT edge: 3 on 101 attempts is 2.97 per 100, no tag; 3 on 100 tags')
check(ip({ att: 59, int: 3 }).length === 0 && ip({ games: 2 }).length === 0, 'attempt floor 60 and games floor 3')
check(ip({}, 'RB').length === 0 && ip({}, 'WR').length === 0, 'only a quarterback is ever Interception-prone')
check(/2026/.test(ip({})[0].note) && /interceptions/.test(ip({})[0].note) && /pass attempts/.test(ip({})[0].note), 'the INT note names the season and the number')
check(playerTags(null, ctx).length === 0 && playerTags({}, ctx).length === 0 && playerTags({ games: 5 }, {}).length === 0, 'no line / empty line -> no tags, no throw')
check(touchesOf({ car: 10, rec: 5, att: 20, sacked: 2 }) === 37 && touchesOf({}) === 0, 'touches = carries + catches + attempts + sacks taken')
const lr = leagueRates([{ car: 100, lost: 1, att: 0 }, { att: 100, int: 2, sacked: 0, car: 0, lost: 1 }, { att: 10, int: 9 }])
check(Math.abs(lr.lostPer100 - 100 * 2 / 210) < 1e-9 && Math.abs(lr.intPer100 - 2) < 1e-9, 'league rates: a passer under 20 attempts does not move the INT rate')

// ── 3. TEAM TAGS on a TEST league of 32 clubs ────────────────────────────────
// WR1+WR2+WR3 yards: club i allows 150 + 5*i (T01 the fewest, T32 the most); RB1+RB2: 60 + 2*i.
const clubs = Array.from({ length: 32 }, (_, i) => `T${String(i + 1).padStart(2, '0')}`)
const cell = (stat, v, g = 4, s) => ({ [stat]: v, g, ...(s ? { s } : null) })
const mkRoles = (i, g = 4, s = null) => ({
  WR1: cell('recyd_g', 70 + 2 * i, g, s), WR2: cell('recyd_g', 50 + 2 * i, g, s), WR3: cell('recyd_g', 30 + i, g, s),
  RB1: cell('rshyd_g', 40 + 1.5 * i, g, s), RB2: cell('rshyd_g', 20 + 0.5 * i, g, s),
})
const dvpSeason = Object.fromEntries(clubs.map((t, i) => [t, mkRoles(i)]))
const sacks = Object.fromEntries(clubs.map((t, i) => [t, { def_sacks: 0.5 + i * 0.1, g: 4 }]))   // T32 the most sacks
const MATCHUP = deepFreeze({
  season: 2026, slate_season: 2026, chart_season: 2025, dvp: { season: dvpSeason }, team_defense: { season: 2026, per_game: sacks },
  pass_game: { corner_season: 2026, corners: { T32: [{ slot: 'LCB', name: 'Test Corner Jr.', pd: 4, int: 1 }, { slot: 'RCB', name: 'Other Corner', pd: 2, int: 0 }, { slot: 'NB', name: 'Third Man', pd: 1, int: 0 }] } },
  disruption_team: Object.fromEntries(clubs.map((t, i) => [t, { pressure: { created_pct: 20 + i * 0.5, created_plays: 400 } }])),
})
const keys = (t) => teamTags(MATCHUP, t, 2026).map((x) => x.key)
// corners: T01..T08 allow the fewest -> Strong; T25..T32 the most -> Weak; T09 and T24 are outside
check(keys('T01').includes('strong_corners') && keys('T08').includes('strong_corners') && !keys('T09').includes('strong_corners'), 'Strong corners: the fewest 8 of 32 clubs, rank 8 is in, rank 9 is out')
check(keys('T32').includes('weak_corners') && keys('T25').includes('weak_corners') && !keys('T24').includes('weak_corners'), 'Weak corners: the most 8 of 32, rank 8 from the top is in, 9 is out')
check(!keys('T16').some((k) => /corners/.test(k)), 'a club in the middle gets no corner tag')
check(keys('T32').includes('strong_pass_rush') && keys('T01').includes('weak_pass_rush') && !keys('T16').some((k) => /pass_rush/.test(k)), 'pass rush: sacks a game, the most / fewest 8')
check(keys('T01').includes('run_stuffers') && keys('T32').includes('soft_vs_run') && !keys('T16').includes('run_stuffers') && !keys('T16').includes('soft_vs_run'), 'run defence: rushing yards to RB1+RB2, the fewest / most 8 -> Run stuffers / Soft vs run')
const weakC = teamTags(MATCHUP, 'T32', 2026).find((t) => t.key === 'weak_corners')
check(weakC.rank === 1 && weakC.of === 32 && weakC.value === 150 + 5 * 31 && weakC.games === 4 && weakC.season === 2026 && weakC.current === true, 'the tag carries its rank, pool, value, games and season')
check(/most of 32/.test(weakC.note) && /4 games this season \(2026\)/.test(weakC.note) && /WR1, WR2 and WR3/.test(weakC.note) && /passes defended/.test(weakC.note) && /Corner/.test(weakC.note) && !/Jr\./.test(weakC.note), 'the note says which number, which season, and the corners’ PBU/INT (last names, suffix dropped)')
// ties across the cut line tag nobody
const tied = JSON.parse(JSON.stringify(MATCHUP))
for (const i of [7, 8, 9]) tied.dvp.season[clubs[i]] = mkRoles(7)   // T08, T09, T10 allow exactly what T08 did: a tie across rank 8
const tiedKeys = (t) => teamTags(tied, t, 2026).map((x) => x.key)
check(!tiedKeys('T08').includes('strong_corners') && !tiedKeys('T09').includes('strong_corners') && tiedKeys('T07').includes('strong_corners'), 'a tie that straddles the quarter line tags none of the tied clubs')

// ── 4. THE SEASON RULE: under 3 games, last season labelled or nothing ───────
const thin = JSON.parse(JSON.stringify(MATCHUP))
thin.dvp.season.T32 = mkRoles(31, 2)
thin.team_defense.per_game.T32 = { def_sacks: 4, g: 2 }
const thinKeys = teamTags(thin, 'T32', 2026)
check(!thinKeys.some((t) => /corners|run|soft/.test(t.key)), 'TEST: a club with 2 games and no last-season table gets NO corner or run tag')
check(thinKeys.every((t) => t.key !== 'strong_pass_rush' || t.current === false), 'a 2-game club never gets a THIS-season pass-rush tag')
// the pass-rush fallback: last season's pressure rate, labelled, with a play floor
const pr = thinKeys.find((t) => /pass_rush/.test(t.key))
check(pr && pr.current === false && pr.season === 2025 && /last season \(2025\)/.test(pr.note) && /dropbacks/.test(pr.note), 'under the floor: the pressure-rate fallback says "last season (2025)"')
const lowPlays = JSON.parse(JSON.stringify(thin))
lowPlays.disruption_team.T32.pressure.created_plays = 299
check(!teamTags(lowPlays, 'T32', 2026).some((t) => /pass_rush/.test(t.key)), 'the fallback needs 300+ pressure plays')
const noChart = JSON.parse(JSON.stringify(thin)); noChart.chart_season = 2026
check(!teamTags(noChart, 'T32', 2026).some((t) => /pass_rush/.test(t.key)), 'a chart table that is THIS season is not a "last season" fallback: no tag')
// a blended payload (lib/nfl/seasonRule.js blendMatchup): the thin club's whole table is last season's, ranked in last season's league
const prevTable = Object.fromEntries(clubs.map((t, i) => [t, mkRoles(i, 17, 2025)]))
const blended = JSON.parse(JSON.stringify(thin))
blended.dvp.season.T32 = Object.fromEntries(Object.entries(mkRoles(31, 17, 2025)))
blended.dvp_league = prevTable
blended.dvp_team_season = { T32: 2025 }
for (const t of clubs) if (t !== 'T32') for (const r of Object.values(blended.dvp.season[t])) r.s = 2026
const bl = teamTags(blended, 'T32', 2026).find((t) => t.key === 'weak_corners')
check(bl && bl.current === false && bl.season === 2025 && bl.games === 17 && /last season \(2025\), 17 games/.test(bl.note), 'blended: the thin club’s corner tag is last season’s, with the year and the 17 games in the words')
check(bl && bl.of === 32, 'the rank is inside ONE season’s table (last season’s 32 clubs), never a mix')
const pool = seasonPool(blended, 2026)
check(!('T32' in pool) && Object.keys(pool).length === 31, 'this season’s pool leaves the thin club out, so a 2-game cell cannot set the quarter')
check(teamTags(null, 'T01').length === 0 && teamTags(MATCHUP, null).length === 0 && teamTags({}, 'T01', 2026).length === 0, 'no matchup file / no club -> no tags, no throw')
const small = { ...MATCHUP, dvp: { season: Object.fromEntries(clubs.slice(0, 6).map((t, i) => [t, mkRoles(i)])) } }
check(teamTags(small, 'T01', 2026).filter((t) => /corners|run/.test(t.key)).length === 0, 'a pool under 12 clubs is not "a quarter of the league": no tag')

// ── 5. WORDS: neutral, sourced, never "will" ─────────────────────────────────
const sample = [...clubs.flatMap((t) => teamTags(MATCHUP, t, 2026)), ...teamTags(thin, 'T32', 2026), fpTag, ip({})[0]]
check(sample.length > 20, 'a TEST league produces tags to read')
check(sample.every((t) => !/\bwill\b|\bshould\b|\bexpect|\bguarantee|\block\b/i.test(t.note)), 'no tag note says will / should / expect / guarantee / lock')
check(sample.every((t) => /not a forecast/.test(t.note) && /changes no score and no status/.test(t.note)), 'every note says it is not a forecast and changes no score or status')
check(sample.every((t) => /\(\d{4}\)|last season/.test(t.note)), 'every note names its season')
check(sample.filter((t) => t.side === 'team').every((t) => /defense-versus-position line/.test(t.note)), 'every defence note says it feeds the defense-versus-position line')
check(chipText({ side: 'team', team: 'T07', word: 'Weak corners' }, { onPlayerRow: true }) === 'T07 weak corners' && chipText({ side: 'player', word: 'Fumble-prone' }, { onPlayerRow: true }) === 'Fumble-prone' && chipText({ side: 'team', team: 'T07', word: 'Weak corners' }) === 'Weak corners', 'on a player row a defence tag names the club; elsewhere it is the plain word')

// ── 6. THE BOOK: surfaces share it; missing data is an empty state ───────────
const lines = { e1: { name: 'Test Back', team: 'T05', games: 4, car: 60, rec: 10, att: 0, sacked: 0, fum: 3, lost: 2 }, e2: { name: 'Test QB', team: 'T06', games: 4, att: 120, int: 4, sacked: 8, car: 5, fum: 0, lost: 0 } }
const TURN = { season: 2026, players: lines }
const book = tagBook({ matchup: MATCHUP, turnovers: TURN, slateSeason: 2026 })
check(book.ready.team && book.ready.player, 'the book is ready with both sources')
check(book.player('e1', 'RB').map((t) => t.key).join() === 'fumble_prone' && book.player('e2', 'QB').map((t) => t.key).join() === 'interception_prone', 'the book returns the man’s tags')
check(book.row({ espn_id: 'e1', position: 'RB', opp: 'T32' }).all.map((t) => t.key).join() === 'fumble_prone,weak_corners,strong_pass_rush,soft_vs_run', 'a player row = his own tags, then the defence he faces: corners, pass rush, run')
check(book.row({ espn_id: 'zz', position: 'WR', opp: 'T16' }).all.length === 0, 'an unknown man facing a middle club: no tags')
check(tagBook({ matchup: MATCHUP, turnovers: { season: 2025, players: lines }, slateSeason: 2026 }).player('e1', 'RB').length === 0, 'a turnover payload from another season than the slate is not read (no mixing seasons)')
const empty = tagBook({})
check(!empty.ready.team && !empty.ready.player && empty.row({ espn_id: 'e1', position: 'RB', opp: 'T01' }).all.length === 0 && empty.team('T01').length === 0, 'no data at all -> an empty book, no throw')
const noTurn = tagBook({ matchup: MATCHUP, turnovers: null, slateSeason: 2026 })
check(noTurn.ready.team && !noTurn.ready.player && noTurn.team('T32').length > 0 && noTurn.player('e1', 'RB').length === 0, 'while the turnover lines load, defence tags still show and player tags are simply absent')
const rows = [{ espn_id: 'e1', position: 'RB', opp: 'T32' }, { espn_id: 'e2', position: 'QB', opp: 'T01' }, { espn_id: 'e3', position: 'WR', opp: 'T16' }]
const opts = tagOptions(book, rows)
check(opts.map((o) => `${o.key}:${o.count}`).join() === 'fumble_prone:1,interception_prone:1,strong_corners:1,weak_corners:1,strong_pass_rush:1,weak_pass_rush:1,run_stuffers:1,soft_vs_run:1', 'the Tags filter lists only tags that exist, in registry order, with counts')
check(hasTag(book, rows[0], 'weak_corners') && !hasTag(book, rows[2], 'weak_corners') && hasTag(book, rows[2], 'all') && hasTag(book, rows[2], ''), 'hasTag: by tag, and "all" matches everyone')
check(tagBook({ matchup: MATCHUP, turnovers: TURN, slateSeason: 2026 }) === book, 'the book is memoised on its inputs (one build per payload)')

// ── 7. A TAG NEVER CHANGES A SCORE OR A STATUS ───────────────────────────────
const slate = deepFreeze({ players: [{ player_id: 'p1', espn_id: 'e1', position: 'RB', team: 'T05', opp: 'T32', scores: { TD: 71.2 } }, { player_id: 'p2', espn_id: 'e2', position: 'QB', team: 'T06', opp: 'T01', scores: { TD: 33.5 } }] })
const before = JSON.stringify(slate)
const statusBefore = ['called', 'board', 'off'].map((s) => `${STATUS_WORD[s]}`).join('|') + JSON.stringify(tdCallStatus({ rank: 1, called: true }))
slate.players.forEach((p) => book.row(p))
check(JSON.stringify(slate) === before, 'building tags for the board does not touch a slate row (frozen input, scores unchanged)')
check(statusBefore === ['called', 'board', 'off'].map((s) => `${STATUS_WORD[s]}`).join('|') + JSON.stringify(tdCallStatus({ rank: 1, called: true })), 'the status words and tdCallStatus answer the same before and after tags are built')
const src = read('lib/nfl/tags.js')
check(!/callStatus|tdStatus|STATUS_WORD|scoring|\.scores\b|scores\[/.test(src.replace(/\/\/.*$/gm, '')), 'lib/nfl/tags.js reads no score and imports no status module (comments aside)')
// its imports: the season rule, plus the shared ordinal helper (lib/format.js, the site's one ordinal rule); nothing that scores or labels
const imports = [...src.matchAll(/^import [^\n]* from '([^']+)'/gm)].map((m) => m[1])
check(imports.includes('./seasonRule') && imports.every((m) => ['./seasonRule', '../format'].includes(m)), `its only imports are the season rule and the shared format helpers (${imports.join(', ')})`)

// ── 8. HOVER MEANS TAP: the chip explains itself on both ────────────────────
const chip = read('components/nfl/TagChips.js')
check(/title=\{tag\.note\}/.test(chip) && /explain\(word, tag\.note\)/.test(chip) && /onClick=\{say\}/.test(chip) && /onKeyDown/.test(chip) && /role="button"/.test(chip) && /tabIndex=\{0\}/.test(chip), 'the chip has the note as its hover title, opens it through lib/explain.js on tap, and works from the keyboard')
check(/top:-11px;bottom:-11px/.test(chip), 'a 44px tap area around a 22px chip')
check(!/#[0-9a-fA-F]{3,8}\b/.test(chip.replace(/&#\d+;/g, '')), 'no hex literal in the chip (theme tokens only)')

// ── 9. ONE REGISTRY, SURFACES USE IT; DEFAULT OFF ────────────────────────────
const surfaces = ['components/nfl/NflBoardExtras.js', 'components/nfl/NflPlayerModal.js', 'components/nfl/DefenseSections.js', 'components/nfl/DefensesTable.js']
check(surfaces.every((f) => !/minLost|minRatePer100|TEAM_QUARTILE|PRESSURE_MIN_PLAYS/.test(read(f))), 'no surface carries a threshold: they are only in lib/nfl/tags.js')
check(/useState\(false\)/.test(read('components/nfl/NflBoardExtras.js').split('const [showTags')[1].slice(0, 40)) && /tags\?\.show \?/.test(read('components/nfl/NflBoardExtras.js')), 'the board’s Tags column is OFF until the Filters sheet turns it on')
check(/Show tags column/.test(read('components/nfl/NflBoardExtras.js')) && /tagKey/.test(read('components/nfl/NflBoardExtras.js')), 'the Filters sheet has a Tags section: show-column toggle and one pill per tag that exists')
check(/const \[showTags, setShowTags\] = useState\(false\)/.test(read('components/nfl/DefensesTable.js')), 'the Matchups defenses table’s Tags column is OFF by default')
check(read('components/nfl/NflPlayerModal.js').includes('TagChips') && read('components/nfl/NflPlayerModal.js').includes('rowTags'), 'the player page shows his tags and the defence he faces')
check(read('components/nfl/NflSlate.js').split('<DefenseFile').length === 3, 'the game page shows BOTH defences (two DefenseFile blocks)')
check(read('components/nfl/tabs/Team.js').includes('TeamDefenders'), 'the team page shows its defence tags and defenders')
// no change to Discord / X text in this pass
const texts = ['lib/discord', 'lib/x', 'lib/dash'].flatMap((d) => { try { return fs.readdirSync(new URL(`../${d}`, import.meta.url)).map((f) => `${d}/${f}`) } catch { return [] } }).filter((f) => /\.js$/.test(f))
check(texts.every((f) => !/lib\/nfl\/tags|TagChips|tagBook/.test(read(f))), 'no Discord / X / alert text module reads the tags in this pass')

console.log(failed ? `\n${failed} FAILED` : '\nall ok')
process.exit(failed ? 1 : 0)
