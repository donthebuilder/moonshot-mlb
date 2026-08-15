'use client'

// 🎫 MY PICKS · NFL — your card against the bot's, on the pick ladder.
//
// 2026-08-15, Donovan: "we dont even have any dedicated picjk style for
// football we acan figure that out right nwo aswell."
//
// The football unit is a MARKET LADDER, not a per-game slot: seven markets,
// five rungs each, ranked across the whole slate (see bots/nfl/nfl_picks.py
// for why football doesn't get baseball's per-game shape). So a slot key here
// is `MARKET|rank`, not `game|category`.
//
// The four rules from the MLB version hold, for the same reasons, and the
// deliberate parallel is the point — a record that means one thing in baseball
// and another in football is two records:
//
//   1. THE BAR IS THE BOT'S. Each market has one number — 40 receiving yards,
//      12 carries, 6 kicking points — and your man clears it or doesn't. The
//      bot publishes the actual value per player in results.json; nothing here
//      re-derives what "cleared" means.
//   2. THE BOT'S RUNG IS SNAPSHOTTED at swap time. The card re-ranks through
//      the week as injuries land. Looking it up at grading time would score
//      you against a name you never disagreed with.
//   3. VOID IS NOT A MISS. No line at all means he didn't play — dropped from
//      both sides. A slot is contested only when both men have a line.
//   4. LOCK AT KICKOFF, per game. Football's slate is not one clock: a
//      Thursday rung locks on Thursday while Sunday's are still open.
//
// NEW HERE, AND THE REASON TO BUILD IT NOW: CONVICTION. Every override carries
// lean / strong / lock. A flat hit rate blends your best reads with your
// shrugs, and "48% vs the bot's 46%" teaches nothing — but 61% on locks and
// 38% on leans is a finding hiding inside that null. You cannot reconstruct
// how sure you felt three weeks ago, so it is captured at the moment of the
// pick or it is gone.
//
// Device-local, exactly like lib/myPicks.js and lib/watchLedger.js. There is
// no server here; the site is read-only by design.

const KEY = 'nfl_my_picks_v1'
const CAP = 60          // weeks of ledger; football gives you ~20 a season
const SLATE_CAP = 30

export const CONVICTION = [
  ['lean', 'Lean', 'A hunch. Worth logging, not worth much.'],
  ['strong', 'Strong', "You'd bet it."],
  ['lock', 'Lock', "You think the bot is plainly wrong here."],
]
export const CONVICTION_ORDER = CONVICTION.map(([k]) => k)

const EMPTY = { slates: {}, ledger: {} }

function read() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null')
    if (!raw || typeof raw !== 'object') return { ...EMPTY }
    return {
      slates: raw.slates && typeof raw.slates === 'object' ? raw.slates : {},
      ledger: raw.ledger && typeof raw.ledger === 'object' ? raw.ledger : {},
    }
  } catch { return { ...EMPTY } }
}

function write(store) {
  try {
    const trim = (obj, cap) => {
      const keys = Object.keys(obj).sort().slice(-cap)
      const out = {}
      keys.forEach((k) => { out[k] = obj[k] })
      return out
    }
    localStorage.setItem(KEY, JSON.stringify({
      slates: trim(store.slates || {}, SLATE_CAP),
      ledger: trim(store.ledger || {}, CAP),
    }))
  } catch { /* private mode, quota — a nicety, never a blocker */ }
}

// Weeks sort lexically as long as the number is padded. "2026-W03".
export const slateKey = (season, week, mode) =>
  `${season}-${mode === 'preseason' ? 'P' : 'W'}${String(week ?? 0).padStart(2, '0')}`

export const slotKey = (market, rank) => `${market}|${rank}`

// ── the lock ──────────────────────────────────────────────────────────────────

/**
 * Per-game kickoff, not one slate clock. Football plays Thursday through
 * Monday and a Thursday rung must freeze while Sunday's stay open.
 *
 * No kickoff published (a rung whose game isn't on the schedule payload) never
 * freezes blind — same call as the MLB side.
 */
export function isLocked(kickoff, now = Date.now()) {
  const t = kickoff ? new Date(kickoff).getTime() : NaN
  if (!Number.isFinite(t)) return false
  return now >= t
}

// ── the picks ─────────────────────────────────────────────────────────────────

export function getPicks(key) {
  if (!key) return {}
  return read().slates[key] || {}
}

/**
 * Put your man on a rung.
 *
 * `bot` is the rung's occupant AT THIS MOMENT — decision (2). Choosing the
 * man already on the rung clears the override: a slot you didn't contest has
 * no business in a head-to-head.
 */
export function savePick(key, market, rank, mine, bot, conviction = 'strong') {
  if (!key || !market || !rank || !mine?.player_id) return getPicks(key)
  if (bot?.player_id && String(bot.player_id) === String(mine.player_id)) {
    return clearPick(key, market, rank)
  }
  const store = read()
  const day = store.slates[key] || (store.slates[key] = {})
  const prev = day[slotKey(market, rank)]
  day[slotKey(market, rank)] = {
    market,
    rank,
    pid: String(mine.player_id),
    name: mine.name || '',
    team: mine.team || '',
    position: mine.position || '',
    bot_pid: bot?.player_id ? String(bot.player_id) : null,
    bot_name: bot?.name || '',
    conviction: CONVICTION_ORDER.includes(conviction) ? conviction : 'strong',
    // Keep the original stamp when only the conviction changes, so "when did
    // you make this call" stays honest.
    at: prev?.pid === String(mine.player_id) ? (prev.at || Date.now()) : Date.now(),
  }
  write(store)
  return store.slates[key]
}

/** Change conviction without changing the man. No-op if the slot is empty. */
export function setConviction(key, market, rank, conviction) {
  const store = read()
  const slot = store.slates[key]?.[slotKey(market, rank)]
  if (!slot) return getPicks(key)
  slot.conviction = CONVICTION_ORDER.includes(conviction) ? conviction : slot.conviction
  write(store)
  return store.slates[key]
}

export function clearPick(key, market, rank) {
  const store = read()
  const day = store.slates[key]
  if (day) { delete day[slotKey(market, rank)]; write(store) }
  return store.slates[key] || {}
}

// ── grading ───────────────────────────────────────────────────────────────────

/**
 * @param card    the published pick card, {market: {bar, rungs:[...]}}
 * @param picks   your overrides for this slate
 * @param results the published results payload for the SAME slate
 *
 * `results.lines` is {player_id: {market: value}}, published for every player
 * who recorded a line — not just the card — so your overrides are gradeable
 * whoever you picked. Football has no equivalent of the MLB "untracked" case
 * for that reason: a week is a few hundred rows and the bot ships all of them.
 */
export function gradeSlate(card, picks, results) {
  const lines = results?.lines || null
  const judged = (v) => typeof v === 'boolean'

  // undefined = no results published yet (or he didn't dress); null is unused
  // here because a published week lists everyone who played, so "absent" and
  // "did not play" are the same fact in football.
  const verdict = (pid, market, bar) => {
    if (!lines || !pid) return undefined
    const row = lines[String(pid)]
    if (!row) return undefined
    const v = Number(row[market])
    return Number.isFinite(v) ? v >= Number(bar) : false
  }
  const valueOf = (pid, market) => {
    const v = Number(lines?.[String(pid)]?.[market])
    return Number.isFinite(v) ? v : (lines && lines[String(pid)] ? 0 : null)
  }

  const rows = []
  Object.entries(card || {}).forEach(([market, blk]) => {
    const bar = Number(blk.bar)
    ;(blk.rungs || []).forEach((rung) => {
      const mine = picks?.[slotKey(market, rung.rank)] || null
      const botOut = verdict(rung.player_id, market, bar)
      const mineOut = mine ? verdict(mine.pid, market, bar) : undefined
      rows.push({
        market, bar, rank: rung.rank, bot: rung, mine,
        botOut, mineOut,
        botVal: valueOf(rung.player_id, market),
        mineVal: mine ? valueOf(mine.pid, market) : null,
        contested: Boolean(mine) && judged(mineOut) && judged(botOut),
      })
    })
  })

  const blank = () => ({ n: 0, mineWon: 0, botWon: 0, w: 0, l: 0, t: 0 })
  const h2h = blank()
  const byConv = Object.fromEntries(CONVICTION_ORDER.map((c) => [c, blank()]))
  rows.filter((r) => r.contested).forEach((r) => {
    const add = (acc) => {
      acc.n += 1
      if (r.mineOut) acc.mineWon += 1
      if (r.botOut) acc.botWon += 1
      if (r.mineOut && !r.botOut) acc.w += 1
      else if (!r.mineOut && r.botOut) acc.l += 1
      else acc.t += 1
    }
    add(h2h)
    add(byConv[r.mine.conviction] || byConv.strong)
  })

  const card_ = { mineN: 0, mineWon: 0, botN: 0, botWon: 0 }
  rows.forEach((r) => {
    const mineOut = r.mine ? r.mineOut : r.botOut
    if (judged(mineOut)) { card_.mineN += 1; if (mineOut) card_.mineWon += 1 }
    if (judged(r.botOut)) { card_.botN += 1; if (r.botOut) card_.botWon += 1 }
  })

  return { rows, h2h, byConv, card: card_, overrides: rows.filter((r) => r.mine).length }
}

/** Idempotent by slate key. Nothing judgeable = not recorded. */
export function recordSlate(key, graded, exhibition) {
  if (!key || !graded) return null
  const { h2h, byConv, card, overrides } = graded
  if (!card.mineN && !card.botN) return null
  const row = {
    ov: overrides,
    n: h2h.n, mw: h2h.mineWon, bw: h2h.botWon, w: h2h.w, l: h2h.l, t: h2h.t,
    cmn: card.mineN, cmw: card.mineWon, cbn: card.botN, cbw: card.botWon,
    // Preseason counts, per Donovan's call, but it is stamped so the split can
    // always be made later. Starters play two series; these weeks are thin by
    // nature and a record that can't separate them can never be re-read.
    ex: exhibition ? 1 : 0,
    conv: Object.fromEntries(CONVICTION_ORDER.map((c) => [c, {
      n: byConv[c].n, w: byConv[c].w, l: byConv[c].l, t: byConv[c].t,
      mw: byConv[c].mineWon, bw: byConv[c].botWon,
    }])),
  }
  const store = read()
  store.ledger[key] = row
  write(store)
  return row
}

export function readLedger() {
  const l = read().ledger
  return Object.keys(l).sort().map((key) => ({ key, ...l[key] }))
}

/**
 * @param opts.includeExhibition  count preseason weeks (default true — his call)
 */
export function ledgerTotals({ includeExhibition = true } = {}) {
  let rows = readLedger()
  if (!includeExhibition) rows = rows.filter((r) => !r.ex)
  const sum = (k) => rows.reduce((a, r) => a + (Number(r[k]) || 0), 0)
  const pct = (a, b) => (b ? (100 * a) / b : null)
  const n = sum('n')
  const conv = Object.fromEntries(CONVICTION_ORDER.map((c) => {
    const g = (k) => rows.reduce((a, r) => a + (Number(r.conv?.[c]?.[k]) || 0), 0)
    const cn = g('n')
    return [c, {
      n: cn, w: g('w'), l: g('l'), t: g('t'),
      minePct: pct(g('mw'), cn), botPct: pct(g('bw'), cn),
    }]
  }))
  return {
    slates: rows.length,
    exhibition: rows.filter((r) => r.ex).length,
    overrides: sum('ov'),
    n, mineWon: sum('mw'), botWon: sum('bw'),
    w: sum('w'), l: sum('l'), t: sum('t'),
    minePct: pct(sum('mw'), n), botPct: pct(sum('bw'), n),
    cardMineN: sum('cmn'), cardMineWon: sum('cmw'),
    cardBotN: sum('cbn'), cardBotWon: sum('cbw'),
    cardMinePct: pct(sum('cmw'), sum('cmn')), cardBotPct: pct(sum('cbw'), sum('cbn')),
    conv, rows,
  }
}

// ── portability ───────────────────────────────────────────────────────────────

export function exportStore() {
  return JSON.stringify({ v: 1, sport: 'nfl', exported: new Date().toISOString(), ...read() }, null, 2)
}

export function importStore(text) {
  let incoming
  try { incoming = JSON.parse(text) } catch { return { ok: false, error: 'Not valid JSON.' } }
  if (!incoming || typeof incoming !== 'object' || (!incoming.slates && !incoming.ledger)) {
    return { ok: false, error: "That file doesn't look like an NFL My Picks export." }
  }
  if (incoming.sport && incoming.sport !== 'nfl') {
    return { ok: false, error: `That's a ${incoming.sport} export — wrong sport.` }
  }
  const store = read()
  const before = Object.keys(store.ledger).length
  Object.assign(store.slates, incoming.slates || {})
  Object.assign(store.ledger, incoming.ledger || {})
  write(store)
  const after = Object.keys(read().ledger).length
  return { ok: true, added: after - before, slates: after }
}

export function clearAll() {
  try { localStorage.removeItem(KEY) } catch {}
}
