// /called — DID THE BOT CALL IT? Every home run tonight, on the record.
//
// 2026-09-05. The public face of the homer feed (lib/dash/homerFeed.js). One
// question, answered the way a stranger from X would check it: which of
// tonight's home runs did the bot have on its board before the ball left, and
// how has that gone over the last ten nights.
//
// NOT A GATE, NOT A BOARD. Nothing here needs an account, nothing here
// scores. It reads homer_feed — rows the cron wrote when each homer was first
// seen, with the designation frozen at that moment — so the number on this
// page and the star on the post can never disagree.
//
// EMPTY IS EMPTY. Before the first homer of the night the page says so. A
// capture rate of 0/0 is not a percentage and is not shown as one.
//
// 2026-09-06: past nights in the "Last N nights" strip are now real —
// each bar with a homer count links (no JS, plain #anchor) down to a
// <details> for that night with the same by-name breakdown "Tonight's
// home runs" gets. Donovan asked to be able to tap into other nights from
// this page the way the signed-in Ledger lab already lets him; this reuses
// the SAME rows the bars are already counting, one extra grouping pass on
// data already fetched — no new query.

import { windowFor, OUTSIDE_POOL } from '../../lib/recordWindow'
import { unstable_cache } from 'next/cache'
import { postseasonOn } from '../../lib/dash/seasonGuard'
import { slateNight } from '../../lib/slateNight'
import { matchupWord, oddsWord, roleWord } from '../../lib/dash/homerFeed'
import { tdCallWord, tdPlayWord, matchRoster } from '../../lib/nfl/tdFeed'
import { nflSlatePaths } from '../../lib/nfl/dataSource'
import { BRAND, SPORT_KEYS, sportKey, appHref, playerHref, isHiddenSport } from '../../lib/routes'
import { nhlCaptureFrom, readNhlRecords } from '../../lib/record/nhl'
import { readMlbEvents } from '../../lib/record/mlb'
import { readNflEvents } from '../../lib/record/nfl'
import { eventCapture } from '../../lib/record/shape'
import { readNflCardRecord, edgeParts } from '../../lib/nfl/cardRecord'
import { regradeNote } from '../../lib/nfl/regrades'
import styles from './called.module.css'
import { membersUrl, MEMBERS_LINE } from '../../lib/members'
import { shiftDay } from '../../lib/data'
import { adminClient } from '../../lib/supabase/admin'

// 2026-09-20 — FOOTBALL MOVED IN, IT DIDN'T GET ITS OWN HOUSE. Donovan:
// "can you not just build it on the same side of the site." Right call, and
// it is the CALLED IT brand architecture written down in the project
// instructions: one account, one public record, both sports. A second page at
// a second URL would have meant a second thing to link, a second thing to
// keep honest, and a visitor who lands on the baseball one in February.
//
// ?sport=nfl swaps the source table (nfl_td_feed for homer_feed) and the
// words. Everything else — the strip, the drilldowns, the frozen tags, the
// sign-up — is the same page, because it is the same promise.
//
// NO JS FOR THE SWITCH. Two plain links, same as the night anchors already
// in the strip below. The page is server-rendered and stays that way.
//
// ONE COUNT, EVERY SPORT (2026-09-26, Batch 3). Home runs and touchdowns are
// read as §33 events (lib/record/mlb.js, lib/record/nfl.js) and counted by
// one eventCapture(); LAMP's goal scorers come from its model record
// (lib/record/nhl.js). The three states (CALLED / ON THE BOARD / NOT ON THE
// BOARD — project rule 14) are set by each sport's own rule in
// lib/callStatus.js / goalModel.js and are the same three states in all of
// them, which is the whole reason one page can carry every sport.

export const dynamic = 'force-dynamic'
export const revalidate = 0
// a sport /called has no page for -- or a hidden one (BUCKETS before it opens) -- is MOONSHOT, as an unknown one always was
const calledKey = (raw) => { const k = sportKey(String(raw || '').toLowerCase()); return SPORTS[k] && !isHiddenSport(k) ? k : 'mlb' }

// 2026-09-24 (SEO): the title said MOONSHOT on the football page too, and
// the root canonical pointed both sports at '/'. One entry per sport now.
export async function generateMetadata({ searchParams }) {
  const params = (await searchParams) || {}
  return SPORTS[calledKey(params.sport)].meta
}
// the newest ten game days: lib/recordWindow.js (0g D4), shared with /start + the front door
const DAYS = windowFor('mlb').gameDays

function client() {
  return adminClient({ anon: true })
}

function prettyDay(iso) {
  const d = new Date(`${iso}T12:00:00Z`)
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' })
}

// Compact form for the per-night <summary> row — "Wed, Sep 3" — prettyDay's
// full weekday reads fine as a hero kicker but wraps a summary row on phone.
function shortDay(iso) {
  const d = new Date(`${iso}T12:00:00Z`)
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
}

// ── ONE TABLE PER SPORT (Batch 2, 2026-09-25) ──────────────────────────────
// Every word and link that differs by sport lives here, so the page below
// renders one path for all three and a sport is a new entry, never a new
// branch. `lead` picks the headline number: 'called' (the designated calls
// over the scorers -- MOONSHOT and LAMP) or 'board' (board coverage -- TUDDY,
// see WHY FOOTBALL LEADS WITH A DIFFERENT NUMBER below). Both numbers are
// printed either way; only which one leads changes.
const SPORTS = {
  mlb: {
    key: 'mlb', label: 'MLB', product: 'MOONSHOT', event: 'home runs', eventOne: 'home run',
    verb: 'went deep', table: 'homer_feed', board: appHref('mlb'),
    legend: '🤖 on the bot before the ball left  ·  ⚪ on the board, no call  ·  💥 not on the board',
    frozen: 'Tags are frozen when the home run is first seen and never re-graded.',
    empty: 'No home runs yet tonight',
    fills: 'This page fills in within a minute of each one.',
    foot: "CALLED IT is MOONSHOT's home run record — every home run, graded in public. Data from MLB's public feeds.",
    lead: 'called', onWhat: 'the bot', capture: eventCapture, window: DAYS, unit: ['night', 'nights'],
    rule: 'CALLED = a TOP, HR, HIT, HRR or CONTACT pick in his game. ON THE BOARD = the top third of that night\u2019s board (nights before Sep 17: anyone the board rated).',
    cta: ['See who the bot likes tonight', 'The headline picks and the full board, in the app — no account needed'],
    callsHead: 'Tonight\u2019s calls', callsPill: 'posted before first pitch',
    eventsHead: 'Tonight\u2019s home runs',
    close: ['Tomorrow\u2019s calls are already on the board.', 'The bot publishes its picks every morning. The 🤖 you see here is what it said before first pitch.', 'Save your watchlist, picks and alerts when your guys go deep'],
    playerHref: (id) => playerHref('mlb', id),
    meta: {
      // §36: search words first, product second (Batch 6).
      title: 'MLB home run picks, graded in public · CALLED IT · MOONSHOT',
      description: 'Every MLB home run tonight, tagged with whether MOONSHOT had the hitter on its board before first pitch. Ten-night capture rate, graded in public.',
      alternates: { canonical: '/called' },
    },
  },
  nfl: {
    key: 'nfl', label: 'NFL', product: 'TUDDY', event: 'touchdowns', eventOne: 'touchdown',
    verb: 'found the end zone', table: 'nfl_td_feed', board: appHref('nfl'),
    legend: '🤖 on the bot before the snap  ·  ⚪ on the board (top third of the TD board), no call  ·  💥 not on the board',
    frozen: 'Tags are frozen when the touchdown is first seen and never re-graded.',
    empty: 'No touchdowns yet today',
    fills: 'This page fills in within a minute of each one.',
    foot: "CALLED IT is TUDDY's touchdown record — every touchdown, graded in public. Data from public NFL feeds.",
    lead: 'board', onWhat: 'the board', capture: eventCapture, window: windowFor('nfl').fetchDays, unit: ['game day', 'game days'],
    rule: 'CALLED = a pick in any TUDDY market that week, or his game\u2019s TD call. ON THE BOARD = the top third of the week\u2019s TD board.',
    cta: ['See who the bot likes this week', 'This week\u2019s reads and the full board, in the app — no account needed'],
    callsHead: 'This week\u2019s calls', callsPill: 'posted before kickoff',
    eventsHead: 'Today\u2019s touchdowns',
    close: ['This week\u2019s calls are already on the board.', 'The bot publishes its touchdown board before kickoff. The 🤖 you see here is what it said before the snap.', 'Save your watchlist, picks and alerts when your guys score'],
    playerHref: (id) => playerHref('nfl', id),
    // THE CARD (TUDDY depth step 1): the weekly 5 x 7 card's graded record,
    // beside the touchdown record. A sport without a card simply has none.
    cardRecord: readNflCardRecord,
    // QB TOUCHDOWNS ARE OUTSIDE THE POOL (TUDDY depth step 6, the stopgap until
    // QBs join the TD model in the bot). The TD model scores RB / WR / TE, so a
    // QB touchdown was always NOT ON THE BOARD -- counted as a miss the model
    // never had the chance to make. Counted separately now, and said plainly.
    outsidePool: OUTSIDE_POOL.nfl,   // lib/recordWindow.js -- shared with /start and the front door
    outsideNote: 'TD calls cover RB / WR / TE. QB touchdowns are outside the pool',
    outsideHead: 'QB touchdowns · outside the pool',
    meta: {
      title: 'NFL touchdown picks, graded in public · CALLED IT · TUDDY',
      description: 'Every NFL touchdown, tagged with whether TUDDY had the scorer on its board before kickoff. Board coverage by game day, graded in public.',
      alternates: { canonical: '/called?sport=nfl' },
    },
  },
  // LAMP (Batch 2). Read through the shared record (lib/record/nhl.js): the
  // board as LOCKED before puck drop, graded after the final. Leads with the
  // calls (Donovan, 09-25): two per game (one per team) against ~6 scorers is a fair
  // capture rate, and board coverage runs near 100% because nearly every
  // skater with ten NHL games is scored.
  nhl: {
    key: 'nhl', label: 'NHL', product: 'LAMP', event: 'goal scorers', eventOne: 'goal',
    verb: 'lit the lamp', table: 'lamp_goal_log', board: appHref('nhl'),
    legend: '🤖 called before puck drop  ·  ⚪ on the board, no call  ·  💥 not on the board',
    frozen: 'Tags are the board as locked before puck drop, graded after the final, never re-graded.',
    empty: 'No games graded yet tonight',
    fills: 'Each game fills in once its final is graded.',
    foot: "CALLED IT is LAMP's goal record — every goal scorer, graded in public. Data from the NHL's public feeds.",
    lead: 'called', onWhat: 'CALLED', capture: nhlCaptureFrom, window: windowFor('nhl').fetchDays, unit: ['game night', 'game nights'],
    rule: 'CALLED = one of the calls in his game: the goal board (the top skater on each team, from Oct 1) or SHOTS 3+. ON THE BOARD = the top third of tonight\u2019s board.',
    cta: ['See tonight\u2019s goal board', 'One called per team in every game, and the full board, in the app — no account needed'],
    callsHead: 'Tonight\u2019s calls', callsPill: 'locked before puck drop',
    eventsHead: 'Tonight\u2019s goal scorers',
    close: ['Tomorrow\u2019s calls lock before puck drop.', 'LAMP locks one skater per team before the puck drops. The 🤖 you see here is what it said before the game.', 'Save your watchlist, picks and alerts when your guys score'],
    playerHref: (id) => playerHref('nhl', id),
    meta: {
      title: 'NHL goal picks, graded in public · CALLED IT · LAMP',
      description: 'Every NHL goal scorer, tagged with whether LAMP called him before puck drop. Three calls per game, locked and graded in public.',
      alternates: { canonical: '/called?sport=nhl' },
    },
  },
}

// ── ONE ROW SHAPE, EVERY SPORT ─────────────────────────────────────────────
// The list component below renders this and nothing else, so a change to how
// a row looks lands on every sport at once and none can drift.
// MOONSHOT and TUDDY rows are EVENTS (lib/record/, §33): `status` is the
// board at the moment of the event, `payload` the feed row for the details.
function normMlb(e) {
  const r = e.payload
  return {
    key: `${r.player_id}:${r.hr_n}`,
    day: r.day,
    name: r.name,
    repeat: r.hr_n > 1 ? r.hr_n : null,
    href: `/app#sport=mlb&p=${encodeURIComponent(r.player_id)}&view=spray`,
    called: e.status === 'called',
    onBoard: e.status !== 'off',
    detail: [r.team || '', r.inning ? `${r.inning}` : '', matchupWord(r), oddsWord(r) || ''].filter(Boolean).join(' · '),
    cardHref: `/api/dash/homers/card?day=${r.day}&pid=${r.player_id}&n=${r.hr_n}`,
    call: r.role
      ? `${roleWord(r.role)}${r.board_rank ? ` · #${r.board_rank}` : ''}`
      // from the row's status (lib/callStatus top-third rule), as normNfl / normNhl do --
      // not r.on_board, which called a #41 below the cut "on the board" (0g D2)
      : e.status === 'board' ? `on the board, no call${r.board_rank ? ` · #${r.board_rank}` : ''}` : `not on the board${r.board_rank ? ` · #${r.board_rank}` : ''}`,
  }
}

function normNfl(e, slate) {
  const r = e.payload
  // THE PASSER IS A NAME TOO (2026-09-29, check-clickable: Purdy, Mahomes,
  // Ward in "5 yd from ..." were the page's only dead player names). The
  // feed stores the passer's name, not his id, so he is joined to this
  // week's slate the way the scorer is (team + exact name, lib/nfl/tdFeed
  // matchRoster); no unique match, no link.
  const passer = r.passer_name ? matchRoster(slate, r.passer_name, r.team) : null
  const scorerId = r.gsis_id || (r.scorer_name ? matchRoster(slate, r.scorer_name, r.team)?.gsis_id : null) || null
  return {
    key: `${r.game_id}:${r.td_n}`,
    day: r.day,
    name: r.scorer_name || r.team,
    repeat: null,
    // The gsis_id is nullable by design (see tdFeed.js) — an unresolved
    // scorer still gets his row, just without a link into the board.
    // A row stored without one (the QB rushing TDs) joins the same way at
    // read time; the stored row is never rewritten.
    href: scorerId ? `/app#sport=nfl&tab=players&player=${encodeURIComponent(scorerId)}` : null,
    called: e.status === 'called',
    onBoard: e.status !== 'off',
    detail: [
      r.team || '', r.opponent ? `vs ${r.opponent}` : '',
      r.quarter != null ? `Q${r.quarter}${r.clock ? ` ${r.clock}` : ''}` : '',
      tdPlayWord(r),
    ].filter(Boolean).join(' · '),
    // No public touchdown-card route yet, so no card link rather than a
    // link to a 404.
    cardHref: null,
    passer: passer?.gsis_id ? { name: r.passer_name, href: `/app#sport=nfl&tab=players&player=${encodeURIComponent(passer.gsis_id)}` } : null,
    call: tdCallWord(r),
  }
}

// A LAMP scorer: one row per skater who scored (two goals is one row, and
// says so). The tag is the status stored at lock, never re-derived here.
function normNhl(r) {
  return {
    key: `${r.game_id}:${r.player_id}`,
    day: r.game_date,
    name: r.name,
    repeat: null,
    href: SPORTS.nhl.playerHref(r.player_id),
    called: r.status === 'called',
    onBoard: r.status !== 'off',
    detail: [r.team || '', r.opp ? `vs ${r.opp}` : '', r.goals > 1 ? `${r.goals} goals` : ''].filter(Boolean).join(' · '),
    cardHref: null,
    call: r.status === 'called' ? `called · #${r.rank} in his game` : r.status === 'board' ? `on the board, no call${r.rank ? ` · #${r.rank}` : ''}` : 'not on the board',
  }
}

// LAMP's two reads, both lean: the window's SCORERS (all the capture counts
// need) and tonight's CALLED rows (the calls panel). Preseason is read and
// labelled -- it is graded like any night -- but kept out of the span.
async function loadNhl(sport, db, today) {
  const since = shiftDay(today, -(sport.window - 1))
  const [scorers, calls] = await Promise.all([
    readNhlRecords(db, { since, until: today, includePre: true, graded: true, hitOnly: true }),
    readNhlRecords(db, { since: today, until: today, includePre: true, graded: false, status: 'called' }),
  ])
  const all = scorers.rows.map((r) => ({ ...r, _n: normNhl(r) }))
  const rows = all.filter((r) => r.game_date === today)
  const byDay = new Map()
  const history = []
  const days = [...new Set(all.map((r) => r.game_date))].sort().slice(-DAYS)
  for (const day of days) {
    const dayRows = all.filter((r) => r.game_date === day)
    byDay.set(day, dayRows)
    history.push({ day, pre: dayRows.every((r) => r.game_type === 1), ...nhlCaptureFrom(dayRows) })
  }
  // Tonight's calls: LOCKED rows only (a row exists here only once its game
  // locked), game by game, then rank. A graded miss or a void says so.
  const picks = calls.rows
    .sort((a, b) => String(a.game_id).localeCompare(String(b.game_id)) || (a.rank || 0) - (b.rank || 0))
    .map((r) => ({
      player_id: r.player_id, name: r.name, team: r.team, opp: r.opp,
      outcome: r.result === 'miss' ? 'no goal' : r.result === 'void' ? 'did not dress' : null,
    }))
  const calledIds = new Set(rows.filter((r) => r.status === 'called').map((r) => String(r.player_id)))
  const configured = !scorers.error
  return { sport, today, rows, picks, calledIds, history, byDay, configured }
}

// One loader per sport, picked off the table -- no sport branch in load().
const LOADERS = { mlb: loadMlb, nfl: loadNfl, nhl: loadNhl }

async function loadFresh(key) {
  const sport = SPORTS[key] || SPORTS.mlb
  const db = client()
  // the slate's own date (lib/slateNight.js, 0g D5): yesterday while its games are still live
  const today = await slateNight(sport.key)
  const blank = { sport, today, rows: [], picks: [], calledIds: new Set(), history: [], byDay: new Map(), configured: false }
  if (!db) return blank
  return LOADERS[sport.key](sport, db, today)
}

// READ ONCE PER MINUTE, NOT ONCE PER VISITOR (cost cut, 2026-09-27). This is
// the page every X post links to, and each view re-read 10 nights of
// homer_feed / 28 days of nfl_td_feed / 14 nights of lamp_goal_log (100-300
// KB of Supabase egress a view). Same move /start made (PERF-2): the reduced
// result is cached, CALLED_TTL seconds, keyed on sport + the ET day.
// unstable_cache stores JSON, so the Set / Map / sport table are carried as
// plain data and put back here.
const CALLED_TTL = 60
const loadPlain = unstable_cache(async (key) => {
  const { sport, calledIds, byDay, ...rest } = await loadFresh(key)
  return { ...rest, key: sport.key, calledIds: [...calledIds], byDay: [...byDay] }
}, ['called-load-v2'], { revalidate: CALLED_TTL })
const cardPlain = unstable_cache(async (key) => (SPORTS[key]?.cardRecord ? SPORTS[key].cardRecord() : null), ['called-card-v1'], { revalidate: CALLED_TTL })

async function load(key) {
  const p = await loadPlain(key, await slateNight(SPORTS[key]?.key || 'mlb'))
  return { ...p, sport: SPORTS[p.key] || SPORTS.mlb, calledIds: new Set(p.calledIds), byDay: new Map(p.byDay) }
}

// FOOTBALL IS NOT NIGHTLY. Baseball plays every day, so ten days and ten
  // game days are the same window; football plays three days a week, so a
// ten-DAY strip would be seven empty columns. The NFL window is widened to
// four weeks (SPORTS.nfl.window) and then reduced to the last ten days that
// actually had a touchdown — same ten bars, each one a real game day.
async function loadNfl(sport, db, today) {
  const since = shiftDay(today, -(sport.window - 1))
  const [{ events }, slate] = await Promise.all([
    readNflEvents(db, { since, until: today }),
    // This week's slate (~70 KB, Data Cache 10 min), only for the passer links.
    fetch(nflSlatePaths()[0], { next: { revalidate: 600 } }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
  ])
  const outside = sport.outsidePool || (() => false)
  const all = events.map((e) => ({ ...e, day: e.game_date, _n: normNfl(e, slate) }))
  const rows = all.filter((r) => r.day === today && !outside(r))
  const outRows = all.filter((r) => r.day === today && outside(r))
  const byDay = new Map()
  const history = []
  // Newest ten game days, oldest-first for the strip. Outside-the-pool
  // touchdowns (QBs) are counted beside each day, never inside its capture.
  const days = [...new Set(all.map((r) => r.day))].sort().slice(-DAYS)
  for (const day of days) {
    const dayRows = all.filter((r) => r.day === day)
    const inPool = dayRows.filter((r) => !outside(r))
    byDay.set(day, inPool)
    history.push({ day, ...eventCapture(inPool), outside: dayRows.length - inPool.length })
  }
  // The board post the bot published before kickoff, most recent first —
  // the football twin of the morning pregame picks.
  const { data: pre } = await db.from('homer_feed_posts')
    .select('day,payload').eq('kind', 'nfl_board').gte('day', since)
    .order('day', { ascending: false }).limit(1)
  let picks = Array.isArray(pre?.[0]?.payload?.picks) ? pre[0].payload.picks.slice(0, 5) : []
  // THE BOARD IS GRADED ON ITS OWN DAYS, NOT TODAY'S (2026-09-29, claims
  // audit): the board is Sunday's, so on any other day matching it against
  // today's touchdowns left every name "pending" long after the games were
  // over. A pick is a hit on any touchdown from the board's day on; it reads
  // "no TD" only once the bot's own nfl_results post has graded that day
  // (same name match the post itself uses) and he is not among its scorers.
  const picksDay = pre?.[0]?.day || null
  const hitIds = new Set(all.filter((r) => r.player_id && (picksDay ? r.day >= picksDay : r.day === today)).map((r) => String(r.player_id)))
  if (picksDay && picks.length) {
    const { data: res } = await db.from('homer_feed_posts')
      .select('payload').eq('kind', 'nfl_results').gte('day', picksDay)
      .order('day', { ascending: false }).limit(1)
    const g = res?.[0]?.payload
    const scorers = g?.graded_day === picksDay && Array.isArray(g.scorers) ? new Set(g.scorers) : null
    if (scorers) picks = picks.map((p) => (hitIds.has(String(p.player_id)) || scorers.has(String(p.name || '').toLowerCase()) ? p : { ...p, outcome: 'no TD' }))
  }
  return { sport, today, rows, outRows, picks, picksDay, calledIds: hitIds, history, byDay, configured: true }
}

async function loadMlb(sport, db, today) {
  const since = shiftDay(today, -(sport.window - 1))
  const { events } = await readMlbEvents(db, { since, until: today })
  const all = events.map((e) => ({ ...e, day: e.game_date, _n: normMlb(e) }))
  const rows = all.filter((r) => r.day === today)
  // The morning's call, so the page shows the names BEFORE any homer lands.
  const { data: pre } = await db.from('homer_feed_posts').select('payload,x_post_id').match({ day: today, kind: 'pregame' }).maybeSingle()
  const picks = Array.isArray(pre?.payload?.picks) ? pre.payload.picks.slice(0, 5) : []
  const calledIds = new Set(rows.filter((r) => r.status === 'called').map((r) => String(r.player_id)))
  // Same window, grouped by night — the bars and the per-night drilldown
  // below both read this so the two can never disagree.
  const byDay = new Map()
  const history = []
  // THE POSTSEASON IS ITS OWN LINE (2026-09-27, list-posts step 6): a night on
  // or after the season's first postseason day is tagged `post` -- on the
  // strip, labelled, counted on its own POSTSEASON line and never in the
  // season span (the NHL preseason rule, the other way round).
  const post = await postseasonOn(today).catch(() => ({ postseason: null }))
  for (let i = 0; i < DAYS; i += 1) {
    const day = shiftDay(today, -i)
    const dayRows = all.filter((r) => r.day === day)
    byDay.set(day, dayRows)
    history.push({ day, post: Boolean(post.start && day >= post.start), ...eventCapture(dayRows) })
  }
  return { sport, today, rows, picks, calledIds, history: history.reverse(), byDay, configured: true }
}

// 2026-09-06 — THE WALL CAME DOWN. Donovan, after hearing the "a brand-new
// site should not ask for an email before anyone's seen it" feedback and
// deciding the boards should speak for themselves: /app is open again (see
// proxy.js), so a link into the board goes straight there now, same as every
// link on the front door already did. An account is still real and still
// worth having — it's what saves your watchlist, your picks, and turns on
// alerts (lib/dash/sync.js) — so SIGNUP is kept as its own link for the one
// spot on this page that is actually asking someone to create one, rather
// than wrapping every board link in a login redirect nobody asked for.
const PREVIEW = 5

const glyph = (n) => (n.called ? '🤖' : n.onBoard ? '⚪' : '💥')

export default async function CalledPage({ searchParams }) {
  const members = membersUrl()
  const params = (await searchParams) || {}
  const key = calledKey(params.sport)
  const { sport, today, rows, outRows = [], picks, picksDay = null, calledIds, history, byDay, configured } = await load(key)
  const card = sport.cardRecord ? await cardPlain(sport.key).catch((e) => { console.error(`[called] card record: ${e?.message}`); return null }) : null
  const BOARD = sport.board
  const SIGNUP = `/login?next=${encodeURIComponent(BOARD)}#create-account`
  // /start -- no longer the main door (funnel step 1, 2026-09-26). On 09-21
  // the two CTAs went to /start; /start's own buttons came back here, and a
  // visitor could circle X -> /start -> /called -> /start without reaching
  // the app. Both CTAs open the board now; /start is the small "What is
  // this?" link under the main button.
  const START = `/start?sport=${sport.key}`
  const tonight = sport.capture(rows)
  // Preseason nights are on the strip, labelled, but not in the span: camp
  // lineups are not the season (LAMP's own record route keeps them out too).
  // Postseason nights (MLB, `post`) likewise: their own line, not the span.
  const graded = history.filter((h) => h.total > 0 && !h.pre && !h.post)
  const preOnly = !graded.length && history.some((h) => h.total > 0 && h.pre)
  const postNights = history.filter((h) => h.total > 0 && h.post)
  const postSpan = postNights.reduce((a, h) => ({ called: a.called + h.called, onBoard: a.onBoard + (h.onBoard || 0), total: a.total + h.total }), { called: 0, onBoard: 0, total: 0 })
  const span = graded.reduce((a, h) => ({ called: a.called + h.called, onBoard: a.onBoard + (h.onBoard || 0), total: a.total + h.total }), { called: 0, onBoard: 0, total: 0 })
  const spanPct = span.total ? Math.round((100 * span.called) / span.total) : null
  const spanBoardPct = span.total ? Math.round((100 * span.onBoard) / span.total) : null
  const spanOutside = history.reduce((a, h) => a + (h.outside || 0), 0)
  // 2026-09-24 audit: the bars and the per-day lines below used `called` for
  // football too, so the record read "3 / 88 · 3%" against a five-rung
  // ladder -- the same category error the hero comment above already names.
  // Football's bars are board coverage; baseball's stay the call rate. Both
  // numbers are printed either way.
  const byBoard = sport.lead === 'board'
  const leadOf = (h) => (byBoard ? { n: h.onBoard || 0, pct: h.boardPct || 0 } : { n: h.called, pct: h.pct })
  const leadWord = byBoard ? 'on the board' : 'called'
  const tonightPre = rows.length > 0 && rows.every((r) => r.game_type === 1)
  const unit = sport.unit[history.length === 1 ? 0 : 1]
  const called = rows.filter((r) => r._n.called)
  const rest = rows.filter((r) => !r._n.called)
  // Newest first, today excluded (it already has its own full section below).
  const pastNights = history.filter((h) => h.day !== today).slice().reverse()

  return (
    <main className={styles.page}>
      <Bar sport={sport} board={BOARD} />

      <section className={styles.hero}>
        <p className={styles.kicker}>{prettyDay(today)}{tonightPre ? ' · Preseason' : ''}{history.find((h) => h.day === today)?.post ? ' · Postseason' : ''}</p>
        {tonight.total ? (
          <>
            {/* ── WHY FOOTBALL LEADS WITH A DIFFERENT NUMBER ──────────────
                MOONSHOT publishes ~30 calls a night against ~30 home runs, so
                "N of M were on the bot" is a fair capture rate. TUDDY's
                touchdown ladder is FIVE rungs a week against ~24 touchdowns a
                Sunday, so the same sentence reads "0 of 24 · 0%" on a day the
                model only ever claimed five names. That is not honesty, it is
                a category error dressed as honesty: it implies 24 chances
                were taken and missed.
                So football leads with board coverage — how many of the day's
                scorers the model had rated at all — and states the designated
                calls underneath, which is the claim it actually made. The
                counting is identical; only which number is the headline
                changes. Both are on the page either way. */}
            <h1 className={styles.headline}>
              <span className={styles.big}>{byBoard ? tonight.called + tonight.rated : tonight.called}</span> of <span className={styles.big}>{tonight.total}</span> {sport.event} were {sport.onWhat === 'CALLED' ? 'CALLED' : `on ${sport.onWhat}`}
            </h1>
            <p className={styles.sub}>
              {byBoard
                ? `${tonight.called} designated ${tonight.called === 1 ? 'call' : 'calls'}${tonight.off ? ` · ${tonight.off} never surfaced` : ''}`
                : `${tonight.pct}% tonight${tonight.rated ? ` · ${tonight.rated} more on the board, no call` : ''}${tonight.off ? ` · ${tonight.off} off the board` : ''}`}
            </p>
          </>
        ) : (
          <>
            <h1 className={styles.headline}>{sport.empty}</h1>
            <p className={styles.sub}>
              {configured ? sport.fills : 'The feed is not configured on this deployment.'}
            </p>
          </>
        )}
        {/* 0c (2026-10-01): what the two words mean here, in one line, on
            every state of the page, so each count reads against it. */}
        {sport.rule && <p className={styles.rule}>{sport.rule}</p>}
        {/* FUNNEL STEP 1 (2026-09-26): the primary goes FORWARD, into the
            board. It used to open /start, whose own buttons came back here --
            a loop with no way into the app. /start is a small text link now. */}
        <a className={styles.cta} href={BOARD}>
          <strong>{sport.cta[0]} →</strong>
          <span>{sport.cta[1]}</span>
        </a>
        <p className={styles.whatIs}><a href={START}>What is this? →</a></p>
        <p className={styles.rule}>
          {sport.legend}. {sport.frozen}
        </p>
      </section>

      {picks.length ? (
        <section className={styles.panel}>
          <h2 className={styles.h2}>{sport.callsHead} <span className={styles.pill}>{sport.callsPill}{picksDay && picksDay !== today ? ` · ${shortDay(picksDay)}` : ''}</span></h2>
          <ol className={styles.calls}>
            {picks.slice(0, PREVIEW).map((p, i) => <Pick key={p.player_id || i} p={p} i={i} sport={sport} calledIds={calledIds} />)}
          </ol>
          {picks.length > PREVIEW ? (
            // LAMP calls one per team (two a game) -- thirty-odd names on a full night.
            // Five preview, the rest behind one tap, like the scorer lists.
            <details className={styles.more}>
              <summary>Show the other {picks.length - PREVIEW}</summary>
              <ol className={styles.calls} start={PREVIEW + 1}>
                {picks.slice(PREVIEW).map((p, i) => <Pick key={p.player_id || i} p={p} i={i + PREVIEW} sport={sport} calledIds={calledIds} />)}
              </ol>
            </details>
          ) : null}
        </section>
      ) : null}

      <section className={styles.panel}>
        <h2 className={styles.h2}>{`Last ${history.length} ${unit}`} {spanPct != null ? <span className={styles.pill}>{byBoard ? `${span.onBoard} / ${span.total} on the board · ${spanBoardPct}% · ${span.called} called` : `${span.called} / ${span.total} called · ${spanPct}% · ${span.onBoard} on the board`}</span> : preOnly ? <span className={styles.pill}>preseason — not counted</span> : null}</h2>
        {postNights.length ? (
          <p className={styles.sub}>
            <b>POSTSEASON</b> · {postSpan.called} / {postSpan.total} called{postSpan.total ? ` · ${Math.round((100 * postSpan.called) / postSpan.total)}%` : ''} · {postSpan.onBoard} on the board · {postNights.length} {postNights.length === 1 ? 'night' : 'nights'}, counted on their own{spanPct != null ? ' (the line above is the regular season)' : ''}
          </p>
        ) : null}
        <div className={styles.bars} role="group" aria-label={`Capture rate over the last ${history.length} ${unit} — tap one to see who ${sport.verb}`}>
          {history.map((h) => {
            const href = h.total ? (h.day === today ? '#tonight' : `#night-${h.day}`) : null
            const inner = (
              <>
                <div className={styles.barTrack}>
                  <div className={styles.barFill} style={{ height: `${leadOf(h).pct || 0}%` }} />
                </div>
                <div className={styles.barPct}>{h.total ? `${leadOf(h).pct}%` : '—'}</div>
                <div className={styles.barDay}>{h.day.slice(5).replace('-', '/')}</div>
                {h.pre ? <div className={styles.barPre}>PRE</div> : h.post ? <div className={styles.barPre}>POST</div> : null}
              </>
            )
            return href ? (
              <a key={h.day} className={styles.barCol} href={href} aria-label={`${h.day}: ${leadOf(h).n} of ${h.total} ${leadWord}, ${leadOf(h).pct}% — see who ${sport.verb}`}>
                {inner}
              </a>
            ) : (
              <div key={h.day} className={styles.barCol} title={`${h.day}: no ${sport.event} recorded`}>
                {inner}
              </div>
            )
          })}
        </div>
        {sport.outsideNote && spanOutside ? (
          <p className={styles.tableNote}>{sport.outsideNote}: {spanOutside} in these {unit}, counted here and not as misses.</p>
        ) : null}
        {pastNights.some((h) => h.total > 0) ? (
          <div className={styles.nights}>
            {pastNights.map((h) => (h.total > 0 ? <NightDetails key={h.day} h={h} rows={byDay.get(h.day) || []} /> : null))}
          </div>
        ) : null}
      </section>

      {card?.markets?.length ? (
        // THE CARD, GRADED (TUDDY depth step 1). The same files and the same
        // sums as the in-app Record tab; a void is never a miss.
        <section id="card" className={styles.panel}>
          <h2 className={styles.h2}>
            The card · {card.season} season
            <span className={styles.pill}>{card.weeks.length === 1 ? `week ${card.weeks[0]}` : `weeks ${card.weeks[0]}–${card.weeks.at(-1)}`} · 5 calls per market</span>
          </h2>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr><th scope="col">Market · bar</th><th scope="col">Cleared</th><th scope="col">Hit</th><th scope="col">Vs recent form</th></tr>
              </thead>
              <tbody>
                {card.markets.map((m) => (
                  <tr key={m.key}>
                    <th scope="row">{m.label}{m.bar != null ? <small className={styles.sub2}>{m.bar}+</small> : null}</th>
                    <td>{m.n ? `${m.hit} / ${m.n}` : '—'}{m.void ? <small className={styles.sub2}>{m.void} void</small> : null}</td>
                    <td className={styles.num}>{m.pct != null ? `${m.pct}%` : '—'}</td>
                    {(() => {
                      const e = edgeParts(m.edge)
                      return <td>{e ? <><b>{e.head}</b><small className={styles.sub2}>{e.detail}</small></> : '—'}</td>
                    })()}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={styles.tableNote}>
            Cleared = the call reached the bar in its game. Void = no game line or an ineligible position, never a miss.
            {card.backtest ? ` Back-test: the card against a pick made on recent form alone, same depth, ${card.backtest.picks} picks per market (${card.backtest.seasons.join(', ')}). Trust words are the bot's: holds, leans, thin, sinks, fails.` : ''}
            {card.live ? ` Week ${card.live.week} is in progress: ${card.live.graded ? `${card.live.graded} of its calls are graded so far, and ` : 'none of its calls are graded yet; '}they count as they land.` : ''}
            {card.weeks.map((w) => regradeNote(card.season, w)).filter(Boolean).map((t) => ` ${t}`).join('')}
            {' '}Regular season only. <a href={`${appHref('nfl', 'accountability')}`}>Every rung, week by week →</a>
          </p>
        </section>
      ) : null}

      {rows.length ? (
        <section id="tonight" className={styles.panel}>
          <h2 className={styles.h2}>{sport.eventsHead}</h2>
          {called.length ? (
            <ul className={styles.list}>
              {called.map((r) => <Row key={r._n.key} n={r._n} />)}
            </ul>
          ) : null}
          {rest.length ? (
            <>
              <h3 className={styles.h3}>Not called · {rest.length}</h3>
              <ul className={styles.list}>
                {rest.slice(0, PREVIEW).map((r) => <Row key={r._n.key} n={r._n} dim />)}
              </ul>
              {rest.length > PREVIEW ? (
                // A phone should not scroll through thirty misses to reach
                // the sign-up. Five preview, the rest behind one tap, no JS.
                <details className={styles.more}>
                  <summary>Show the other {rest.length - PREVIEW}</summary>
                  <ul className={styles.list}>
                    {rest.slice(PREVIEW).map((r) => <Row key={r._n.key} n={r._n} dim />)}
                  </ul>
                </details>
              ) : null}
            </>
          ) : null}
        </section>
      ) : null}

      {outRows.length ? (
        <section className={styles.panel}>
          <h2 className={styles.h2}>{sport.outsideHead} · {outRows.length}</h2>
          <ul className={styles.list}>
            {outRows.map((r) => <Row key={r._n.key} n={r._n} dim />)}
          </ul>
          <p className={styles.tableNote}>{sport.outsideNote} — these are not counted in the day&apos;s coverage above.</p>
        </section>
      ) : null}

      <section className={styles.close}>
        <h2 className={styles.closeH}>{sport.close[0]}</h2>
        <p>{sport.close[1]}</p>
        <a className={styles.cta} href={SIGNUP}>
          <strong>Create a free account</strong>
          <span>{sport.close[2]}</span>
        </a>
        {members ? (
          <p>
            {MEMBERS_LINE}{' '}
            <a href={members} target="_blank" rel="noopener noreferrer">Join →</a>
          </p>
        ) : null}
      </section>

      <footer className={styles.foot}>
        <span>{sport.foot}</span>
        <span><a href="/playbook">How to use DASH: the Playbook</a></span>
        <span><a href="/terms">Terms</a>{' · 21+ · information, not advice'}</span>
      </footer>
    </main>
  )
}

// The header, shared by every sport's page. The switch is one link per sport
// in the registry (lib/routes.js), no JS -- the same approach the night
// anchors in the strip use. A sport added there shows up here on its own.
function Bar({ sport, board }) {
  return (
    <header className={styles.bar}>
      <a className={styles.brand} href="/" aria-label="DASH Network home">
        <img src="/icon-192.png" alt="" width="30" height="30" />
        <div><small>DASH NETWORK · {sport.product}</small><strong>CALLED IT</strong></div>
      </a>
      <nav className={styles.nav}>
        {SPORT_KEYS.map((k) => (
          <a key={k} className={k === sport.key ? styles.navOn : styles.navOff} href={`/called?sport=${k}`}>{BRAND[k].league}</a>
        ))}
        <a className={styles.navCta} href={board}>Open the board</a>
      </nav>
    </header>
  )
}

// One name in the calls panel. `outcome` is set only where the sport grades
// the call itself (LAMP: no goal / did not dress); otherwise it is pending
// until the name shows up among the scorers.
function Pick({ p, i, sport, calledIds }) {
  const hit = calledIds.has(String(p.player_id))
  return (
    <li className={hit ? styles.callHit : ''}>
      <span className={styles.callN}>{i + 1}</span>
      <a className={styles.name} href={sport.playerHref(p.player_id)}>{p.name}</a>
      <span className={styles.meta}>{p.team || ''}{p.opponent || p.opp ? ` vs ${p.opponent || p.opp}` : ''}{p.odds_over && p.odds_book ? ` · ${p.odds_over > 0 ? '+' : ''}${p.odds_over} ${p.odds_book}` : ''}</span>
      <span className={styles.call}>{hit ? `🤖 ${sport.verb}` : p.outcome || 'pending'}</span>
    </li>
  )
}

function Row({ n, dim }) {
  return (
    <li className={`${styles.row} ${dim ? styles.rowDim : ''}`}>
      <span className={styles.glyph}>{glyph(n)}</span>
      {n.href
        ? <a className={styles.name} href={n.href}>{n.name}{n.repeat ? <small> ({n.repeat})</small> : null}</a>
        : <span className={styles.name}>{n.name}</span>}
      <span className={styles.meta}>
        {n.passer && n.detail.endsWith(n.passer.name)
          ? <>{n.detail.slice(0, -n.passer.name.length)}<a className={styles.cardLink} href={n.passer.href}>{n.passer.name}</a></>
          : n.detail}
        {n.cardHref ? <>{' · '}<a className={styles.cardLink} href={n.cardHref} target="_blank" rel="noreferrer">card</a></> : null}
      </span>
      <span className={styles.call}>{n.call}</span>
    </li>
  )
}

// One night from the strip, expanded — same shape as "Tonight's home runs"
// so a night from last week reads exactly like tonight does once it's over.
function NightDetails({ h, rows }) {
  const called = rows.filter((r) => r._n.called)
  const rest = rows.filter((r) => !r._n.called)
  return (
    <details id={`night-${h.day}`} className={styles.night}>
      <summary>
        <span className={styles.nightDay}>{shortDay(h.day)}</span>
        <span className={styles.nightStat}>{h.called} of {h.total} called · {h.onBoard ?? h.called} on the board{h.pre ? ' · preseason' : h.post ? ' · postseason' : ''}</span>
      </summary>
      {called.length ? (
        <ul className={styles.list}>
          {called.map((r) => <Row key={r._n.key} n={r._n} />)}
        </ul>
      ) : (
        <p className={styles.sub}>No calls that day.</p>
      )}
      {rest.length ? (
        <>
          <h3 className={styles.h3}>Not called · {rest.length}</h3>
          <ul className={styles.list}>
            {rest.slice(0, PREVIEW).map((r) => <Row key={r._n.key} n={r._n} dim />)}
          </ul>
          {rest.length > PREVIEW ? (
            <details className={styles.more}>
              <summary>Show the other {rest.length - PREVIEW}</summary>
              <ul className={styles.list}>
                {rest.slice(PREVIEW).map((r) => <Row key={r._n.key} n={r._n} dim />)}
              </ul>
            </details>
          ) : null}
        </>
      ) : null}
    </details>
  )
}
