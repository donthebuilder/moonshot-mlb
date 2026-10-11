// lib/nfl/defStats.js -- DEFENSIVE (AND TURNOVER) STATS FROM ESPN'S PUBLIC BOX SCORES, PURE (2026-10-10).
//
// Donovan: "we need to pull defensive stats too for the stat and players."
//
// WHAT WE HOLD, AUDITED (see the report that shipped with this file):
//   * nfl_matchup_extra.json `disruption` (the bot's nfl_disruption.player_grades): per defender, this season's
//     tackles, tackles for loss, sacks, QB hits, passes defended, forced fumbles, games, and a percentile inside his
//     position group. 397 men, any with 4+ games. HELD, but no page read it until this pass (the bot's own comment:
//     "no site reader yet"). It has NO interceptions, NO fumble recoveries, NO snaps, and no season stamp (it is the
//     matchup file's stat_season).
//   * nfl_matchup.json pass_game.corners: the three starting corners of every club with games / PD / INT.
//   * nfl_matchup.json snaps: OFFENSE only (side is always "offense"): no defensive snap counts are published.
//   * Nothing published carries a man's fumbles, fumbles lost or interceptions thrown (nfl_logs rows have g_td /
//     g_recyd / g_rec / g_ruyd / g_car / g_payd / g_kick only).
//
// WHAT THIS FILE ADDS. ESPN's per-game box score (site.web.api.espn.com .../summary?event=<id>, the same host
// lib/nfl/liveSlate.js reads) has, per player, a `defensive` group (TOT SOLO SACKS TFL PD QB HTS TD), an
// `interceptions` group (INT YDS TD), a `fumbles` group (FUM LOST REC) and `passing` (INT thrown). Summed over a
// club's finished games that is the season line, with a game log for free. Not in the box score, so NOT shown:
// forced fumbles (the bot file has them), pressures, and snap counts.
//
// ONLY FINISHED GAMES count (state "post"): a game in progress would put half a game under a "games" label.
// Parsing is by the group's own `keys`, never by column position, so a column ESPN adds or reorders cannot shift
// a number into the wrong field. A group or key that is missing yields nothing (null), never a zero.

const num = (v) => {
  if (v == null || v === '' || v === '-' || v === '--') return null
  const n = Number(String(v).replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}
const ZERO = (n) => n ?? 0

/** One group's row as { key: value } using the group's own `keys` (an "a/b" or "a-b" key splits its "x/y" value). */
function rowOf(group, stats) {
  const keys = Array.isArray(group?.keys) ? group.keys : []
  const out = {}
  keys.forEach((k, i) => {
    const raw = stats?.[i]
    if (/[/-]/.test(k) && typeof raw === 'string' && /[/-]/.test(raw.replace(/^-/, ''))) {
      const ks = k.split(/[/-]/)
      const vs = raw.split(/[/-]/)
      ks.forEach((kk, j) => { out[kk] = num(vs[j]) })
    } else out[k] = num(raw)
  })
  return out
}

/**
 * One box score -> { id, week, date, teams: [abbr, abbr], players: [ { id, name, team, opp, off, def } ] }.
 * `meta` = { id, week, date } from the scoreboard event (the summary's own header is the fallback).
 * Returns null when the payload has no box score players (a game ESPN has not filled in).
 */
export function parseSummary(summary, meta = {}) {
  const teams = summary?.boxscore?.players
  if (!Array.isArray(teams) || !teams.length) return null
  const abbrs = teams.map((t) => String(t?.team?.abbreviation || '').toUpperCase())
  const header = summary?.header?.competitions?.[0]
  const id = String(meta.id || summary?.header?.id || '')
  const players = new Map()
  teams.forEach((t, ti) => {
    const team = abbrs[ti]
    const opp = abbrs[1 - ti] || null
    for (const g of t?.statistics || []) {
      for (const a of g?.athletes || []) {
        const pid = a?.athlete?.id
        if (pid == null) continue
        const key = String(pid)
        let p = players.get(key)
        if (!p) { p = { id: key, name: a.athlete.displayName || a.athlete.shortName || '', team, opp, off: null, def: null }; players.set(key, p) }
        const r = rowOf(g, a.stats)
        const name = g.name
        if (name === 'passing') {
          p.off = p.off || {}
          Object.assign(p.off, { cmp: r.completions, att: r.passingAttempts, int: r.interceptions, sacked: r.sacks })
        } else if (name === 'rushing') {
          p.off = p.off || {}
          Object.assign(p.off, { car: r.rushingAttempts })
        } else if (name === 'receiving') {
          p.off = p.off || {}
          Object.assign(p.off, { rec: r.receptions, tgt: r.receivingTargets })
        } else if (name === 'fumbles') {
          p.fum = { fum: r.fumbles, lost: r.fumblesLost, rec: r.fumblesRecovered }
        } else if (name === 'defensive') {
          p.def = p.def || {}
          Object.assign(p.def, { tot: r.totalTackles, solo: r.soloTackles, sck: r.sacks, tfl: r.tacklesForLoss, pd: r.passesDefended, qbh: r.QBHits, td: r.defensiveTouchdowns })
        } else if (name === 'interceptions') {
          p.def = p.def || {}
          Object.assign(p.def, { int: r.interceptions, intyds: r.interceptionYards, inttd: r.interceptionTouchdowns })
        }
      }
    }
  })
  return {
    id, week: num(meta.week), date: meta.date || header?.date || null, teams: abbrs,
    players: [...players.values()],
  }
}

const sumInto = (acc, src) => { for (const [k, v] of Object.entries(src || {})) if (v != null) acc[k] = (acc[k] || 0) + v }

/**
 * Add one parsed game to the season book: { [espnId]: { id, name, team, games, off, def, fum, log } }.
 * `games` = finished games he appears in a box-score group for (a man with no stat line in a game is not counted
 * for it: a number says "in games he logged a stat", and the labels use exactly that words).
 * A man traded mid-season keeps the club of his LATEST game.
 */
export function addGame(book, game) {
  if (!game) return book
  for (const p of game.players) {
    const cur = book[p.id] || (book[p.id] = { id: p.id, name: p.name, team: p.team, games: 0, off: {}, def: {}, fum: {}, log: [], _w: -1 })
    cur.games += 1
    if (game.week != null && game.week >= cur._w) { cur.team = p.team; cur._w = game.week; if (p.name) cur.name = p.name }
    sumInto(cur.off, p.off); sumInto(cur.def, p.def); sumInto(cur.fum, p.fum)
    cur.log.push({ w: game.week, g: game.id, opp: p.opp, off: p.off || null, def: p.def || null, fum: p.fum || null })
  }
  return book
}

/** Order each man's log by week and drop the internal marker. */
export function finishBook(book) {
  for (const p of Object.values(book)) { p.log.sort((a, b) => (a.w ?? 0) - (b.w ?? 0)); delete p._w }
  return book
}

/** Did this man play defence in the games read? Any defensive stat at all (a zero tackle line still shows a row). */
export const isDefender = (p) => Boolean(p?.def && (p.def.tot != null || p.def.int != null || p.def.pd != null || p.def.sck != null))

/** Games a CLUB has played in the book (the most any of its men appear in), for "N of N games" denominators. */
export function teamGames(book) {
  const by = {}
  for (const p of Object.values(book)) by[p.team] = Math.max(by[p.team] || 0, p.games)
  return by
}

// ── the bot's disruption file (nfl_matchup_extra.json) ───────────────────────
// Position group the TABLE uses. The bot's own group is DL / LB / DB; the position word splits DB into CB and S.
// A man whose position says only "DB" is listed as DB, never guessed to a corner or a safety.
const POS_TO_GROUP = {
  DL: 'DL', DE: 'DL', DT: 'DL', NT: 'DL',
  LB: 'LB', ILB: 'LB', OLB: 'LB', MLB: 'LB',
  CB: 'CB', S: 'S', SS: 'S', FS: 'S', SAF: 'S', DB: 'DB',
}
export const DEF_GROUPS = ['DL', 'LB', 'CB', 'S', 'DB']
export const GROUP_WORD = { DL: 'Defensive line', LB: 'Linebackers', CB: 'Cornerbacks', S: 'Safeties', DB: 'Defensive backs' }
export const groupOf = (position) => POS_TO_GROUP[String(position || '').toUpperCase()] || null
export const isDefPosition = (position) => groupOf(position) != null

/** Honest columns per group: a column appears only where that position makes the number meaningful. */
export const GROUP_COLUMNS = {
  DL: ['tkl', 'tfl', 'sck', 'qbh', 'pd', 'ff', 'fr'],
  LB: ['tkl', 'tfl', 'sck', 'qbh', 'pd', 'int', 'ff', 'fr'],
  CB: ['tkl', 'pd', 'int', 'ff', 'fr'],
  S: ['tkl', 'tfl', 'pd', 'int', 'qbh', 'ff', 'fr'],
  DB: ['tkl', 'pd', 'int', 'ff', 'fr'],
}
export const COLUMN_LABEL = {
  tkl: ['TKL', 'Tackles (solo plus assisted)'], tfl: ['TFL', 'Tackles for loss'], sck: ['SACK', 'Sacks'],
  qbh: ['QB HIT', 'Quarterback hits'], pd: ['PBU', 'Passes defended'], int: ['INT', 'Interceptions'],
  ff: ['FF', 'Forced fumbles'], fr: ['FR', 'Fumbles recovered'],
}


/**
 * One defender's season line. THE RULE: the box-score sums (ESPN) lead for every column the box score carries
 * (tackles, TFL, sacks, QB hits, passes defended, interceptions, fumbles recovered), because one row then has ONE
 * source for those columns; the bot's disruption row supplies what the box score cannot (forced fumbles, the
 * percentile inside his group) and is the whole line when ESPN has nothing for him (a failed or partial pull).
 * `source` says which; numbers from the two are never added.
 */
export function defenderLine({ gsis, espnId, roster, bot, box }) {
  const b = bot || null
  const e = box && isDefender(box) ? box : null
  if (!b && !e) return null
  const position = b?.position || roster?.position || null
  const group = groupOf(b?.position) || groupOf(roster?.position)
  const d = e?.def || {}
  const pick = (espn, botVal) => (e && espn != null ? espn : botVal ?? null)
  return {
    id: gsis || null, espn_id: espnId || e?.id || null,
    name: b?.name || roster?.name || e?.name || '', team: e?.team || b?.team || roster?.team || null,
    position, group,
    games: e ? e.games : (b?.games ?? null),
    tkl: pick(d.tot, b?.stats?.tackles),
    tfl: pick(d.tfl, b?.stats?.tackles_for_loss),
    sck: pick(d.sck, b?.stats?.sacks),
    qbh: pick(d.qbh, b?.stats?.qb_hits),
    pd: pick(d.pd, b?.stats?.pass_defended),
    int: e ? ZERO(d.int) : null,
    ff: b?.stats?.fumbles_forced ?? null,
    fr: e ? ZERO(e.fum?.rec) : null,
    pctl: b?.percentiles || null,
    grade: b?.grade ?? null,
    source: e ? (b ? 'espn+bot' : 'espn') : 'bot',
  }
}

// ── the payloads /api/nfl/defense serves ─────────────────────────────────────
const hasOffense = (p) => (p.off && (p.off.att != null || p.off.car != null || p.off.rec != null)) || (p.fum && ((p.fum.fum || 0) > 0 || (p.fum.lost || 0) > 0))

/** { [espnId]: season line } for every man with an offensive or fumble line: what the player tags read. Small on purpose. */
export function turnoverPlayers(book) {
  const out = {}
  for (const p of Object.values(book)) {
    if (!hasOffense(p)) continue
    out[p.id] = {
      name: p.name, team: p.team, games: p.games,
      att: p.off.att ?? 0, cmp: p.off.cmp ?? 0, int: p.off.int ?? 0, sacked: p.off.sacked ?? 0,
      car: p.off.car ?? 0, rec: p.off.rec ?? 0, tgt: p.off.tgt ?? 0,
      fum: p.fum.fum ?? 0, lost: p.fum.lost ?? 0,
    }
  }
  return out
}

/** Defenders of the named clubs, with their game logs. Only men with a defensive line. */
export function defenderPlayers(book, teams) {
  const want = new Set((teams || []).map((t) => String(t).toUpperCase()))
  const out = {}
  for (const p of Object.values(book)) {
    if (!want.has(p.team) || !isDefender(p)) continue
    out[p.id] = {
      name: p.name, team: p.team, games: p.games, def: p.def, fum: { rec: p.fum.rec ?? 0 },
      log: p.log.filter((l) => l.def).map((l) => ({ w: l.w, opp: l.opp, def: l.def, rec: l.fum?.rec ?? 0 })),
    }
  }
  return out
}

// ── one club's defenders, the three sources joined ───────────────────────────
const normName = (s) => String(s || '').toLowerCase().replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, '').replace(/[^a-z]/g, '')

/**
 * The defenders of ONE club as table lines.
 *   roster      nfl_roster.json players (gsis_id, espn_id, name, team, position, status_word): who is on the club, and his position
 *   disruption  the bot's table keyed by gsis id (nfl_matchup_extra.json)
 *   box         /api/nfl/defense?team= players keyed by ESPN id
 * A man joins on his ESPN id, else (same club) on his normalised name. Men the roster does not know but a source does
 * are kept when the BOT names their position, and counted in `unplaced` when only the box score has them (no position
 * to file them under: shown nowhere rather than guessed into a group).
 * Returns { rows, unplaced }.
 */
export function joinDefenders({ team, roster = [], disruption = {}, box = {} }) {
  const t = String(team || '').toUpperCase()
  const boxByName = {}
  for (const [id, b] of Object.entries(box || {})) if (b?.team === t) boxByName[normName(b.name)] = { ...b, id }
  const botByName = {}
  for (const [gsis, b] of Object.entries(disruption || {})) if (b?.team === t) botByName[normName(b.name)] = { gsis, ...b }
  const usedBox = new Set()
  const usedBot = new Set()
  const rows = []
  const sources = (name, espnId, gsis) => {
    const e = espnId && box?.[espnId] ? { ...box[espnId], id: espnId } : boxByName[normName(name)] || null
    const bGsis = gsis && disruption?.[gsis] ? gsis : botByName[normName(name)]?.gsis
    const b = bGsis ? disruption[bGsis] : null
    if (e) usedBox.add(e.id)
    if (bGsis) usedBot.add(bGsis)
    return { e, b, bGsis }
  }
  for (const r of roster || []) {
    if (String(r?.team || '').toUpperCase() !== t || !isDefPosition(r?.position)) continue
    const { e, b, bGsis } = sources(r.name, r.espn_id, r.gsis_id || r.player_id)
    const line = defenderLine({ gsis: r.gsis_id || r.player_id || bGsis, espnId: r.espn_id || e?.id, roster: r, bot: b, box: e })
    if (line) rows.push({ ...line, status: r.status_word || null, jersey: r.jersey ?? null })
  }
  for (const [gsis, b] of Object.entries(disruption || {})) {
    if (b?.team !== t || usedBot.has(gsis) || !isDefPosition(b.position)) continue
    const e = boxByName[normName(b.name)] || null
    if (e) usedBox.add(e.id)
    const line = defenderLine({ gsis, espnId: e?.id, roster: null, bot: b, box: e })
    if (line) rows.push(line)
  }
  let unplaced = 0
  for (const [id, b] of Object.entries(box || {})) if (b?.team === t && isDefender(b) && !usedBox.has(id)) unplaced += 1
  return { rows, unplaced }
}

/** The stat a group's table leads with. */
const LEAD = { DL: 'sck', LB: 'tkl', CB: 'pd', S: 'tkl', DB: 'pd' }
export const leadStat = (group) => LEAD[group] || 'tkl'
export function sortGroup(rows, group) {
  const k = leadStat(group)
  return [...rows].sort((a, b) => (b[k] ?? -1) - (a[k] ?? -1) || (b.tkl ?? -1) - (a.tkl ?? -1) || String(a.name).localeCompare(String(b.name)))
}

/** The few defenders a game page names: the top pass rushers (DL / LB by sacks then hits) and the top corners (by PBU then INT). */
export function keyDefenders(rows = [], { rushers = 3, corners = 3 } = {}) {
  const rush = rows.filter((r) => r.group === 'DL' || r.group === 'LB')
    .filter((r) => (r.sck || 0) + (r.qbh || 0) > 0)
    .sort((a, b) => (b.sck ?? -1) - (a.sck ?? -1) || (b.qbh ?? -1) - (a.qbh ?? -1)).slice(0, rushers)
  const cbs = rows.filter((r) => r.group === 'CB' || r.group === 'DB')
    .sort((a, b) => ((b.pd ?? 0) + (b.int ?? 0)) - ((a.pd ?? 0) + (a.int ?? 0)) || (b.int ?? 0) - (a.int ?? 0) || (b.tkl ?? -1) - (a.tkl ?? -1)).slice(0, corners)
  return { rushers: rush, corners: cbs }
}
