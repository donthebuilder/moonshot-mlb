// THE HOMER FEED — every home run tonight, tagged with what the bot said.
//
// Pure functions over the two payloads the push sender already reads: the live
// slate snapshot (lib/liveSlate.js — every batter's line in every started
// game) and the published board (lib/dash/board.js — the bot's designations).
// No I/O here, so the whole thing is testable in node with two fixtures.
//
// WHAT "THE BOT HAD HIM" MEANS (Donovan, 2026-09-05): "any pick, watch, top15
// is a bot hit." On the published board that is a non-empty `game_pick_role`
// — TOP, TOP15, HR, HIT, HRR, CONTACT, slash-joined when he holds several.
// A man on the board with no designation is RATED, not PICKED: he is recorded
// with his rank, and he is not a star. A man not on the board at all is an
// off-slate homer — bench bat, call-up, late lineup — and says so.
//
// The star is earned by the FIRST role in the slash list, which is how every
// other surface on the site reads game_pick_role (lib/scoring.js,
// lib/leaders.js ROLE_OF). Keep that; do not invent a second reading here.

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0)
const txt = (v) => String(v == null ? '' : v).trim()

// statsapi team id → the abbreviation the board uses. The live snapshot
// carries ids only (homeId/awayId); the board carries abbreviations only.
// This is the join, and it is the one thing here that is not derived from a
// payload — MLB has not renumbered a franchise in decades.
export const TEAM_ABBR = {
  108: 'LAA', 109: 'ARI', 110: 'BAL', 111: 'BOS', 112: 'CHC', 113: 'CIN', 114: 'CLE',
  115: 'COL', 116: 'DET', 117: 'HOU', 118: 'KC', 119: 'LAD', 120: 'WSH', 121: 'NYM',
  133: 'ATH', 134: 'PIT', 135: 'SD', 136: 'SEA', 137: 'SF', 138: 'STL', 139: 'TB',
  140: 'TEX', 141: 'TOR', 142: 'MIN', 143: 'PHI', 144: 'ATL', 145: 'CWS', 146: 'MIA',
  147: 'NYY', 158: 'MIL',
}

/** Half-inning as a person says it: "bot 7th". Same reading as pushRules. */
export function inningWord(g) {
  const n = num(g?.inning)
  if (!n) return ''
  const half = /^top|^middle/i.test(txt(g?.half)) ? 'top' : 'bot'
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'
  return `${half} ${n}${s}`
}

/** The designation that earns the star, or null. "TOP/HR/CONTACT" → "TOP". */
export function primaryRole(row) {
  const raw = txt(row?.game_pick_role || row?.pick_type)
  const first = raw.split('/').map((x) => x.trim().toUpperCase()).filter(Boolean)[0]
  return first || null
}

/**
 * The board, indexed for a lookup per homer.
 *
 * Rank is by hr_score, descending, over the whole slate — "#12 on the board"
 * is the number a reader can check on the site. Rows without a player_id are
 * skipped rather than guessed at.
 */
export function boardIndexFrom(rows) {
  const index = new Map()
  if (!Array.isArray(rows)) return index
  const ranked = rows
    .filter((r) => txt(r?.player_id))
    .slice()
    .sort((a, b) => num(b?.hr_score) - num(a?.hr_score))
  ranked.forEach((r, i) => {
    const id = txt(r.player_id)
    if (index.has(id)) return              // first (highest) occurrence wins
    index.set(id, {
      role: primaryRole(r),
      roles: txt(r.game_pick_role || r.pick_type),
      hrScore: Number.isFinite(Number(r.hr_score)) ? Number(r.hr_score) : null,
      rank: i + 1,
      team: txt(r.team) || null,
      opponent: txt(r.opponent) || null,
    })
  })
  return index
}

// ── THE PRICE ───────────────────────────────────────────────────────────────
//
// Donovan (09-05): "if the pick has an actual price then post it but make sure
// the book is known. we have to have odds and stuff because the site shows it."
//
// odds_latest.json (bots/odds_fetch.py) already carries exactly that: per
// player, per market, `best_over` and `best_book` — and tonight's file names
// only Fanatics and DraftKings, which is the pair he wants. The same lookup
// lib/odds.js quoteFor() does, re-done here in plain server-side code because
// that file is 'use client' and cannot be imported by a cron.
//
// Two guards. The file has to be for THIS slate (slate_date === day) or a
// Friday homer would wear Thursday's price; and the line has to be the 0.5 the
// HR bet is on, which is what the whole site's HR quote insists on.

const SUFFIX = /^(jr|sr|ii|iii|iv|v)$/

/** Must match norm_name() in bots/odds_fetch.py and normName() in lib/odds.js. */
export function normName(s) {
  const stripped = String(s || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .toLowerCase()
  const parts = stripped.split(/\s+/).filter(Boolean)
  while (parts.length > 1 && SUFFIX.test(parts[parts.length - 1])) parts.pop()
  return parts.join(' ')
}

/** { over, book } for this man's HR price tonight, or null. */
export function hrQuoteFor(odds, id, name, day) {
  if (!odds || typeof odds !== 'object') return null
  if (day && txt(odds.slate_date) && txt(odds.slate_date) !== day) return null
  const q = odds.by_player_id?.[String(id)]?.batter_home_runs
    || odds.by_name?.[normName(name)]?.batter_home_runs
  if (!q) return null
  if (Math.abs(num(q.line) - 0.5) > 1e-9) return null
  const over = Number.isFinite(Number(q.best_over)) ? Number(q.best_over) : Number(q.over)
  const book = txt(q.best_book)
  if (!Number.isFinite(over) || over === 0 || !book) return null   // a price without a book is not posted
  return { over, book }
}

export const fmtOdds = (n) => (Number(n) > 0 ? `+${Number(n)}` : `${Number(n)}`)

/** "HR +900 · DraftKings" or ''. */
export function oddsWord(ev) {
  const over = Number(ev?.odds_over)
  const book = txt(ev?.odds_book)
  if (!Number.isFinite(over) || over === 0 || !book) return ''
  return `HR ${fmtOdds(over)} · ${book}`
}

/** Which side of the game this batter is on, from the live lineups. */
function sideOf(g, id) {
  for (const side of ['home', 'away']) {
    if ((g?.lineup?.[side] || []).some((r) => txt(r?.id) === id)) return side
  }
  return null
}

/**
 * Every home run in the snapshot, one record per homer, as rows for the
 * homer_feed table. Stateless: a man with two homers tonight yields hr_n 1 and
 * hr_n 2 every tick, and the table's primary key decides which are new.
 */
export function homersFrom(snap, day, board, odds = null) {
  if (!snap) return []
  const games = Array.isArray(snap.games) ? snap.games : []
  const lines = snap.lines && typeof snap.lines === 'object' ? snap.lines : {}
  const gameOf = new Map(games.map((g) => [Number(g.pk), g]))
  const out = []

  for (const [id, line] of Object.entries(lines)) {
    const hr = num(line?.hr)
    if (hr < 1) continue
    const g = gameOf.get(Number(line?.pk))
    const b = board?.get(String(id)) || null
    const side = sideOf(g, String(id))
    const myId = side ? g?.[`${side}Id`] : null
    const theirId = side ? g?.[side === 'home' ? 'awayId' : 'homeId'] : null
    const team = b?.team || TEAM_ABBR[Number(myId)] || null
    const opponent = b?.opponent || TEAM_ABBR[Number(theirId)] || null
    const quote = hrQuoteFor(odds, id, line?.name, day)

    for (let n = 1; n <= hr; n += 1) {
      out.push({
        day,
        player_id: String(id),
        hr_n: n,
        name: txt(line?.name) || `#${id}`,
        team,
        opponent,
        game_pk: line?.pk != null ? String(line.pk) : null,
        // The inning is only right for the LATEST homer; an earlier one by
        // the same man was seen on an earlier tick and already has its row.
        inning: n === hr ? inningWord(g) || null : null,
        role: b?.role || null,
        on_board: Boolean(b),
        hr_score: b?.hrScore ?? null,
        board_rank: b?.rank ?? null,
        home: side === 'home',
        odds_over: quote?.over ?? null,
        odds_book: quote?.book ?? null,
        // Not a column. Carried so the post can say "TOP/HR" where the row
        // stores only TOP.
        _roles: b?.roles || '',
      })
    }
  }
  return out
}

// ── THE POST ────────────────────────────────────────────────────────────────
//
// One shape, four lines, under 200 characters. The star is the whole message:
// a reader who follows the account for a week learns the ratio of ⭐ to plain
// without being told, which is the only track record that persuades anybody.
//
// The price rides on its own line when there is one, book named, and is
// simply absent when there is not — never a price without a book.

const ROLE_WORD = {
  TOP: 'TOP pick', TOP15: 'Top 15', HR: 'HR pick', HIT: 'HIT pick',
  HRR: 'HRR pick', CONTACT: 'CONTACT pick', TB: 'CONTACT pick',
}

export function roleWord(role) {
  return ROLE_WORD[txt(role).toUpperCase()] || (role ? `${role} pick` : '')
}

export function matchupWord(ev) {
  const t = ev?.team || '???'
  const o = ev?.opponent || '???'
  return ev?.home ? `${o} @ ${t}` : `${t} @ ${o}`
}

/**
 * The text of one post.
 *
 * @param ev       a homer row from homersFrom()
 * @param opts     { site, handle } — the site URL for the link line and the
 *                 account to credit; both optional and both omitted when empty.
 */
export function postText(ev, { site = '', handle = '' } = {}) {
  const star = ev?.role ? '⭐' : ev?.on_board ? '⚪' : '\u{1F4A5}'
  const nth = num(ev?.hr_n) > 1 ? ` (${ev.hr_n} tonight)` : ''
  const where = [ev?.inning, matchupWord(ev)].filter(Boolean).join(' | ')
  let call
  if (ev?.role) {
    const roles = txt(ev._roles) || ev.role
    call = `On the bot: ${roleWord(ev.role)}${roles.includes('/') ? ` (${roles})` : ''}`
    if (ev.board_rank) call += ` · #${ev.board_rank} on the board`
  } else if (ev?.on_board) {
    call = `Rated, not picked${ev.board_rank ? ` · #${ev.board_rank} on the board` : ''}`
  } else {
    call = 'Not on the board'
  }
  const lines = [
    `${star} HOME RUN — ${ev?.name || 'Unknown'}${ev?.team ? ` (${ev.team})` : ''}${nth}`,
    where,
    call,
    oddsWord(ev),
    [site, handle].filter(Boolean).join(' · '),
  ].filter(Boolean)
  return lines.join('\n')
}

/**
 * Tonight's scoreboard from the feed rows, for the page and the nightly recap.
 * "Called" counts a row with a role — the pick / watch / Top 15 definition.
 */
export function captureFrom(rows) {
  const list = Array.isArray(rows) ? rows : []
  const total = list.length
  const called = list.filter((r) => r?.role).length
  const rated = list.filter((r) => !r?.role && r?.on_board).length
  const off = total - called - rated
  const byRole = {}
  for (const r of list) if (r?.role) byRole[r.role] = (byRole[r.role] || 0) + 1
  return {
    total, called, rated, off, byRole,
    pct: total ? Math.round((100 * called) / total) : null,
  }
}
