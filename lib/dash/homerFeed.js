// THE HOMER FEED — every home run tonight, tagged with what the bot said.
//
// Pure functions over the two payloads the push sender already reads: the live
// slate snapshot (lib/liveSlate.js — every batter's line in every started
// game) and the published board (lib/dash/board.js — the bot's designations).
// No I/O here, so the whole thing is testable in node with two fixtures.
//
// WHAT "THE BOT HAD HIM" MEANS (Donovan, 2026-09-05): "any pick, watch, top15
// is a bot hit." On the published board that is a non-empty `game_pick_role`
// — TOP, TOP15, HR, HIT, HRR, CONTACT, WATCH, slash-joined when he holds several
// (tonight's board: 91 of 284 rows carry one; 44 of those are WATCH).
// A man on the board with no designation is ON THE BOARD, NO CALL: he is
// recorded with his rank, and he is not a star. A man not on the board at all is an
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
      stats: statsFrom(r),
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

// A LONGSHOT is a price of +700 or longer. It gets its own glyph on the
// line, because a called homer at +1100 is the post that gets screenshotted.
export const LONGSHOT = 700
export const isLongshot = (ev) => Boolean(ev?.role) && Number(ev?.odds_over) >= LONGSHOT

/** "HR +900 · DraftKings", or the longshot form when the bot had him, or ''. */
export function oddsWord(ev) {
  const over = Number(ev?.odds_over)
  const book = txt(ev?.odds_book)
  if (!Number.isFinite(over) || over === 0 || !book) return ''
  if (isLongshot(ev)) return `🎯 ${fmtOdds(over)} · ${book} — and the bot had him`
  return `HR ${fmtOdds(over)} · ${book}`
}

// ── THE STATS ON THE CARD ───────────────────────────────────────────────────
//
// The same numbers components/shareCard.js downloadPlayerCard() prints under
// 🔨 THE BAT and 🥎 THE ARM, read off the full board row (fetchBoardFull —
// the slimmed sender copy drops every one of these). Stored on the homer_feed
// row as `stats` so the card can be re-rendered a month later from the record
// alone. Null where the board had nothing; the card prints nothing for a null.
const fnum = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))

export function statsFrom(r) {
  if (!r) return null
  const shape = r.hr_shape_components || {}
  return {
    season_hr: fnum(r.season_hr),
    season_iso: fnum(r.season_iso),
    last5_hr: fnum(r.last5_hr),
    last5_hits: fnum(r.last5_hits),
    last5_xbh: fnum(r.last5_xbh),
    barrel: fnum(r.recent_barrel_rate),
    hard_hit: fnum(r.recent_hard_hit_rate),
    max_ev: fnum(shape.max_ev),
    max_distance: fnum(shape.max_distance),
    // The model's own sub-scores (itself/bots/mlb_dashboard.py), 0-100 each —
    // nobody outside MOONSHOT has these. Kept separate from max_ev/max_distance
    // (real Statcast numbers) so shapeWord() below never mixes the two.
    shape_swing: fnum(shape.pull_air_launch),
    shape_pitch_fit: fnum(shape.pitch_type_fit),
    shape_contact: fnum(shape.batted_ball_damage),
    shape_power: fnum(shape.season_power_baseline),
    bats: txt(r.bats || r.handedness) || null,
    pitcher: txt(r.pitcher_name) || null,
    pitcher_throws: txt(r.pitcher_throws) || null,
    pitcher_hr9: fnum(r.pitcher_hr9),
    pitcher_whip: fnum(r.pitcher_whip),
    weak_side: txt(r.pitcher_weak_side || r.weak_side) || null,
    park_factor: fnum(r.park_hr_factor),
    venue: txt(r.venue_name) || null,
  }
}

// ── THE HOOKS: what only MOONSHOT tracks ───────────────────────────────────
//
// Donovan (09-05): "use any data we have for the X post, like the pair history
// like Star Tool did — things we track that no one else does." Each hook is
// one short line, computed when the homer is first seen and frozen on the row
// (`hooks`), so the post and the card and the page all say the same thing.
//
//   👥 SAME-DAY PARTNER  pair_history_summary.json: the man he has gone deep
//      on the same day with most often this season, and whether that man has
//      ALSO gone deep tonight. This is Star Tool's reply stat, in the post.
//   🔁 BACK-TO-BACK      he homered last night too (homer_feed, yesterday).
//   🤖 THE BOT'S RECORD  ON HIM: how many of his last N homers the bot had
//      called (homer_feed history). Only once he has 3+ on record.
//   🔢 NUMEROLOGY        his season HR number and his jersey reduce to the
//      same digit root — the ledger's own pattern, stated only when it hits.
//
// A hook that cannot be computed is simply absent. Never a placeholder.

export const digitRoot = (v) => (v > 0 ? 1 + ((v - 1) % 9) : 0)

// 🧬 MOONSHOT SHAPE SCORE — the model's own read on the swing, not a Statcast
// number. Every homer carries four 0-100 sub-scores (statsFrom, above); this
// takes whichever one graded highest and names it, the same "one stat, not
// the whole card" rule the share-card tweets use (claude/moonshot-tweet-format.md).
// Donovan (09-05): "add a stat only our site uses" — this is the one nobody
// else can print, because nobody else has the model.
const SHAPE_LABELS = [
  ['shape_swing', 'swing shape'],
  ['shape_pitch_fit', 'pitch-mix fit'],
  ['shape_contact', 'contact quality'],
  ['shape_power', 'power baseline'],
]
export function shapeWord(stats) {
  let best = null
  for (const [key, label] of SHAPE_LABELS) {
    const v = fnum(stats?.[key])
    if (v == null) continue
    if (!best || v > best.v) best = { v, label }
  }
  if (!best) return ''
  return `🧬 MOONSHOT Shape Score — ${best.label}: ${Math.round(best.v)}/100`
}

/**
 * His most frequent same-day partner from the pair summary, or null.
 * `rate` is same-day homers over the days the file checked — the share of
 * nights this season both men went deep. Small by nature (Star Tool prints
 * 1-2% for the same idea); Donovan wants it shown anyway: "I like that they
 * showed the percent even though it was like 2 percent."
 */
export function partnerFor(pairs, id, name) {
  const daysChecked = num(pairs?.days_checked)
  const list = Array.isArray(pairs?.top_pairs) ? pairs.top_pairs : []
  const pid = String(id)
  const nm = normName(name)
  let best = null
  for (const p of list) {
    const ps = Array.isArray(p?.players) ? p.players : []
    const mine = ps.find((x) => String(x?.player_id) === pid || (nm && normName(x?.name || x?.player_name) === nm))
    if (!mine) continue
    const other = ps.find((x) => x !== mine)
    const count = num(p?.same_day_hr_count_season)
    if (!other || count < 2) continue
    if (!best || count > best.count) {
      best = {
        id: other.player_id != null ? String(other.player_id) : null,
        name: txt(other.name || other.player_name), team: txt(other.team) || null,
        count, sameGame: num(p?.same_game_hr_count),
        rate: daysChecked > 0 ? Math.round((1000 * count) / daysChecked) / 10 : null,
      }
    }
  }
  return best
}

/**
 * The hook lines for one homer.
 * @param ev          the homer row (needs player_id, name, role, hr_n, stats)
 * @param ctx         { pairs, todayIds:Set, yesterdayIds:Set, history:[{role}], jersey }
 */
export function hooksFor(ev, ctx = {}) {
  const out = []
  const id = String(ev?.player_id || '')

  // THE PAIR, LIVE. Donovan: "it's mainly to help with pairing live through
  // the night." So the line says where the partner IS right now: already
  // deep tonight, still batting, or not on the slate.
  const partner = ctx.pairs ? partnerFor(ctx.pairs, id, ev?.name) : null
  if (partner) {
    const pid = partner.id ? String(partner.id) : null
    const both = pid && ctx.todayIds?.has(pid)
    const playing = pid && ctx.board?.has(pid)
    const status = both ? 'both deep tonight ✓' : playing ? 'still live tonight' : 'not on tonight\'s slate'
    const rate = partner.rate != null ? ` (${partner.rate}% of nights)` : ''
    out.push(`👥 Pair: ${partner.name}${partner.team ? ` (${partner.team})` : ''} · ${partner.count} same-day HRs${rate} · ${status}`)
  }

  // Ordered by what sells the site: the record on him outranks a streak,
  // and the post keeps as many as fit under the character limit in this order.
  const hist = Array.isArray(ctx.history) ? ctx.history : []
  if (hist.length >= 3) {
    const called = hist.filter((h) => h?.role).length + (ev?.role ? 1 : 0)
    const n = hist.length + 1
    out.push(`🤖 The bot had him for ${called} of his last ${n} homers`)
  }

  if (ctx.yesterdayIds?.has(id)) out.push('🔁 Back-to-back nights')

  // PAIR COMPLETE. An earlier homer tonight named this man as its partner;
  // this is the payoff line for anyone who paired off that post.
  const earlier = (Array.isArray(ctx.pairedEarlier) ? ctx.pairedEarlier : []).find((r) => String(r?.partner_id) === id && String(r?.player_id) !== id)
  if (earlier) out.push(`✓ Pair complete — ${earlier.name} went deep earlier${earlier.inning ? ` (${earlier.inning})` : ''}`)

  // THE STREAK. Only on a TOP pick's own homer, and only once it is a streak.
  const straight = num(ctx.topStraight)
  if (ev?.role === 'TOP' && straight >= 2) out.push(`🔥 The bot's TOP pick has gone deep ${straight} straight nights`)

  const seasonHr = fnum(ev?.stats?.season_hr)
  const jersey = fnum(ctx.jersey)
  const nth = seasonHr != null ? seasonHr + num(ev?.hr_n) : null
  if (nth != null && MILESTONES.has(nth)) out.push(`🏆 HR #${nth} of the season`)
  if (nth != null && jersey != null && nth > 0 && digitRoot(nth) === digitRoot(jersey)) {
    out.push(`🔢 HR #${nth} in jersey #${jersey} — same digit root (${digitRoot(nth)})`)
  }

  // Lowest priority on purpose: postText keeps hooks in order until the
  // character budget runs out, so a starred pick already carrying a partner
  // and a streak line won't get crowded by this — but the quiet, no-call
  // homers that had nothing else to say now have this most nights.
  const shape = shapeWord(ev?.stats)
  if (shape) out.push(shape)

  return out
}

const MILESTONES = new Set([10, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70])

/**
 * How many consecutive nights, ending on `day`, a TOP pick went deep.
 * `rows` are homer_feed rows (day, role) from the last ~10 days, tonight's
 * included. Tonight counts only if `includeToday` — for a post at 9pm it is
 * true (this homer is the night's TOP); for the recap it is whatever the
 * table says.
 */
export function topStreakFrom(rows, day, includeToday = true) {
  const nights = new Set((Array.isArray(rows) ? rows : []).filter((r) => r?.role === 'TOP').map((r) => String(r.day)))
  if (includeToday) nights.add(day)
  let n = 0
  let d = new Date(`${day}T12:00:00Z`)
  for (;;) {
    const iso = d.toISOString().slice(0, 10)
    if (!nights.has(iso)) break
    n += 1
    d.setUTCDate(d.getUTCDate() - 1)
  }
  return n
}

// ── THE PREGAME CALL ───────────────────────────────────────────────────────
//
// The post that makes every ⭐ provable: the bot's HR calls, public before
// first pitch, with the price. Every called homer that night QUOTES it.
// Five names, not one — the archive says #1 vs #2 is close to a coin flip
// (components/BotPicksStrip.js), and five gives the night more to point back
// at. Ranked by hr_score among the TOP and HR designations.

export function pregamePicks(rows, odds, day, limit = 5) {
  const list = (Array.isArray(rows) ? rows : [])
    .filter((r) => /\b(TOP|HR)\b/.test(txt(r?.game_pick_role).toUpperCase()) && txt(r?.player_id))
    .sort((a, b) => num(b?.hr_score) - num(a?.hr_score))
    .slice(0, limit)
  return list.map((r) => {
    const q = hrQuoteFor(odds, r.player_id, r.name, day)
    return {
      player_id: String(r.player_id), name: txt(r.name), team: txt(r.team) || null, opponent: txt(r.opponent) || null,
      role: primaryRole(r), hr_score: fnum(r.hr_score), odds_over: q?.over ?? null, odds_book: q?.book ?? null,
      pitcher: txt(r.pitcher_name) || null,
    }
  })
}

export function pregameText(picks, { day = '', site = '', handle = '' } = {}) {
  const lines = picks.map((p, i) => {
    const price = p.odds_over && p.odds_book ? ` · ${fmtOdds(p.odds_over)} ${p.odds_book}` : ''
    return `${i + 1}. ${p.name}${p.team ? ` (${p.team})` : ''}${p.opponent ? ` vs ${p.opponent}` : ''}${price}`
  })
  const tail = [site, handle].filter(Boolean).join(' · ')
  const head = `🎯 The bot's HR calls tonight${day ? ` — ${day.slice(5).replace('-', '/')}` : ''}`
  // Five names with prices can run long; the closing line goes first, then
  // names from the bottom, and the link never does. 270 leaves room for X's
  // own accounting of the URL.
  let body = [head, ...lines, '⭐ = called it · graded live below', tail]
  if (body.join('\n').length > 270) body = [head, ...lines, tail]
  while (body.join('\n').length > 270 && body.length > 3) body.splice(body.length - 2, 1)
  return body.filter(Boolean).join('\n')
}

// ── THE WEEK ───────────────────────────────────────────────────────────────
//
// Sunday night, after the recap: seven nights in one line, with the price.
// A record, not an ROI claim — the average price of a called homer is a fact
// about the feed; "you would have made X" is a claim about a bettor, and this
// account does not make it.

export function weeklyText(rows, { from = '', to = '', site = '', handle = '' } = {}) {
  const c = captureFrom(rows)
  const priced = (Array.isArray(rows) ? rows : []).filter((r) => r?.role && Number(r?.odds_over) > 0)
  const avg = priced.length ? Math.round(priced.reduce((a, r) => a + Number(r.odds_over), 0) / priced.length) : null
  const best = priced.slice().sort((a, b) => Number(b.odds_over) - Number(a.odds_over))[0] || null
  const nights = new Set((rows || []).map((r) => r.day)).size
  return [
    `📅 The week${from && to ? ` (${from.slice(5).replace('-', '/')}–${to.slice(5).replace('-', '/')})` : ''}: ${c.called} of ${c.total} home runs on the bot (${c.pct ?? 0}%) over ${nights} nights`,
    avg != null ? `⭐ average price of a called homer: ${fmtOdds(avg)}` : '',
    best ? `🎯 longest: ${best.name} at ${fmtOdds(best.odds_over)} (${best.odds_book})` : '',
    [site, handle].filter(Boolean).join(' · '),
  ].filter(Boolean).join('\n')
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
        stats: b?.stats || null,
        hooks: [],
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
  HRR: 'HRR pick', CONTACT: 'CONTACT pick', TB: 'CONTACT pick', WATCH: 'HR Watch',
}

export function roleWord(role) {
  return ROLE_WORD[txt(role).toUpperCase()] || (role ? `${role} pick` : '')
}

export function matchupWord(ev) {
  const t = ev?.team || '???'
  const o = ev?.opponent || '???'
  return ev?.home ? `${o} @ ${t}` : `${t} @ ${o}`
}

// "0.225" → ".225"; "0.058" → ".058". Never called on a null iso.
const fmtIso = (iso) => `.${String(Math.round(Math.abs(iso) * 1000)).padStart(3, '0')}`

// A ⚪ POST — ON THE BOARD, NO CALL — used to read as three bare lines
// ("On the board, no call · #255") with nothing to say beyond the rank.
// The season stats used on the card are already sitting on the row and
// unused in the text; say what they say instead of leaving the line empty.
// Donovan (09-05): wants the no-call line to carry more, and to help SEO —
// per claude/moonshot-tweet-format.md, that means weaving a searchable
// phrase ("home run board") into the sentence, not hashtags.
// Real numbers only: a row missing season_hr/season_iso keeps the old flat
// line rather than fabricating a read on him.
const QUIET_ISO = 0.12
const POP_ISO = 0.19
export function boardMissText(ev) {
  const rank = fnum(ev?.board_rank)
  const hr = fnum(ev?.stats?.season_hr)
  const iso = fnum(ev?.stats?.season_iso)
  const rankTxt = rank ? `#${rank} on tonight's home run board` : "On tonight's home run board"
  if (hr == null || iso == null) return `On the board, no call${rank ? ` · #${rank}` : ''}`
  const line = `${hr} HR, ${fmtIso(iso)} ISO`
  if (iso >= POP_ISO) return `${rankTxt} — real pop (${line}) got left off tonight`
  if (iso < QUIET_ISO) return `${rankTxt} — quiet bat: ${line} this year. The board had this one right`
  return `${rankTxt} — ${line} this year, right in the mix`
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
    call = boardMissText(ev)
  } else {
    call = 'Not on the board'
  }
  const tail = [site, handle].filter(Boolean).join(' · ')
  const core = [
    `${star} HOME RUN — ${ev?.name || 'Unknown'}${ev?.team ? ` (${ev.team})` : ''}${nth}`,
    where,
    call,
    oddsWord(ev),
  ].filter(Boolean)
  // Hooks ride between the call and the link, as many as fit. X counts a URL
  // as 23 characters whatever its length; the budget below is conservative
  // on purpose so a long name never pushes the link off the end.
  const LIMIT = 270
  const lenOf = (arr) => arr.join('\n').length
  const hooks = Array.isArray(ev?.hooks) ? ev.hooks : []
  const kept = []
  for (const h of hooks) {
    if (lenOf([...core, ...kept, h, tail]) <= LIMIT) kept.push(h)
  }
  return [...core, ...kept, tail].filter(Boolean).join('\n')
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
