// 🔥 TRENDING FILTERS, PURE (2026-10-26, Donovan: "the trending tab can use more filters ... especially when you add the other sports ... toggle only a couple
// sports"). One page for every product (components/TrendingBoard.js): its rows are the Hit Rater's (lib/hitRater.js hitRaterRow, served whole by
// /api/trending), and every filter here runs on rows the page already holds -- no new read. No React, no fetch.
// A row: { sport, id, name, team, opp, home, gameId, lane, word, line, odds, own: { L5, L10, L20, Season, HA, H2H }, dvp }. A cell: { ok, n, pct }.
// A hit rate is a count of games that happened, never a chance (NHL / NBA print no model or implied %).

export const SPORTS = ['mlb', 'nfl', 'nhl', 'nba']
/** [key, label] of the window the bar applies to and the table sorts by. */
export const WINDOWS = [['L5', 'L5'], ['L10', 'L10'], ['L20', 'L20'], ['Season', 'LONG RUN']]
export const BARS = [0, 60, 70, 80]
export const MIN_GAMES = [5, 8, 10]

const fin = (v) => v != null && v !== '' && Number.isFinite(Number(v))
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim()
/** American price -> decimal, so a range reads in the order a bettor means it (-150 .. +300). */
export const decimalOf = (am) => { const v = Number(am); return v > 0 ? 1 + v / 100 : 1 + 100 / -v }

/** The defaults, for the sports that are on. */
export const defaults = (sports = SPORTS) => ({ sports: [...sports], props: [], bar: 0, win: 'L10', price: null, minN: 5, ha: null, q: '', team: '', game: '' })

/** The chosen window's cell on a row, or null. */
export const winCell = (r, win = 'L10') => { const c = r?.own?.[win]; return c && c.n >= 1 && fin(c.pct) ? c : null }

/** Rows through every filter. A row with no price survives unless a price range is set. */
export function filterRows(rows, f = defaults()) {
  const sports = new Set(f.sports?.length ? f.sports : SPORTS)
  const props = new Set(f.props || [])
  const q = norm(f.q)
  const [lo, hi] = f.price && f.price.length === 2 ? [decimalOf(f.price[0]), decimalOf(f.price[1])] : [null, null]
  return (rows || []).filter((r) => {
    if (!sports.has(r.sport)) return false
    if (props.size && !props.has(r.word)) return false
    const c = winCell(r, f.win)
    if (!c || c.n < (f.minN || 1)) return false
    if (f.bar && c.pct < f.bar) return false
    if (lo != null) { if (!fin(r.odds)) return false; const d = decimalOf(r.odds); if (d < Math.min(lo, hi) - 1e-9 || d > Math.max(lo, hi) + 1e-9) return false }
    if (f.ha === 'home' && r.home !== true) return false
    if (f.ha === 'away' && r.home !== false) return false
    if (f.team && r.team !== f.team) return false
    if (f.game && String(r.gameId) !== String(f.game)) return false
    if (q && !`${norm(r.name)} ${norm(r.team)}`.includes(q)) return false
    return true
  })
}

/** Best first on the chosen window, then the long run, then the defense's L10, then the sample. */
export function sortRows(rows, win = 'L10') {
  const v = (c) => (c && c.n >= 1 && fin(c.pct) ? c.pct : -1)
  return [...rows].sort((a, b) => v(b.own?.[win]) - v(a.own?.[win]) || v(b.own?.Season) - v(a.own?.Season) || v(b.dvp?.L10) - v(a.dvp?.L10) || (b.own?.[win]?.n || 0) - (a.own?.[win]?.n || 0))
}

/** The prop words the rows of these sports carry, in first-seen order, with how many rows each. */
export function propOptions(rows, sports = SPORTS) {
  const on = new Set(sports)
  const m = new Map()
  for (const r of rows || []) if (on.has(r.sport) && r.word) m.set(r.word, (m.get(r.word) || 0) + 1)
  return [...m].map(([word, n]) => ({ word, n }))
}
/** Clubs on the rows of these sports, sorted. */
export function teamOptions(rows, sports = SPORTS) {
  const on = new Set(sports)
  return [...new Set((rows || []).filter((r) => on.has(r.sport) && r.team).map((r) => r.team))].sort()
}
/** Games on the rows of these sports (rows that carry a gameId: tonight's slate only), one each: "AWAY @ HOME". */
export function gameOptions(rows, sports = SPORTS) {
  const on = new Set(sports)
  const m = new Map()
  for (const r of rows || []) {
    if (!on.has(r.sport) || r.gameId == null || !r.team || !r.opp || m.has(String(r.gameId))) continue
    m.set(String(r.gameId), { key: String(r.gameId), sport: r.sport, label: r.home === false ? `${r.team} @ ${r.opp}` : `${r.opp} @ ${r.team}` })
  }
  return [...m.values()].sort((a, b) => a.label.localeCompare(b.label))
}
/** How many rows each sport has (the sport chips' counts). */
export function sportCounts(rows) {
  const m = {}
  for (const r of rows || []) m[r.sport] = (m[r.sport] || 0) + 1
  return m
}

// ── the URL (shareable, Back returns to it) ────────────────────────────────────────────────────────────────────────
const list = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean)
/** hash params (a get(key) function) -> filters; anything missing or unreadable is the default. */
export function fromParams(get, base = defaults()) {
  const f = { ...base }
  const sp = list(get('sp')).filter((s) => SPORTS.includes(s)); if (sp.length) f.sports = sp
  const pr = list(get('prop')); if (pr.length) f.props = pr
  const bar = Number(get('bar')); if (BARS.includes(bar)) f.bar = bar
  const win = get('win'); if (WINDOWS.some(([k]) => k === win)) f.win = win
  const price = list(get('price')).map(Number); if (price.length === 2 && price.every((x) => Number.isFinite(x) && Math.abs(x) >= 100)) f.price = price
  const min = Number(get('min')); if (MIN_GAMES.includes(min)) f.minN = min
  const ha = get('ha'); if (ha === 'home' || ha === 'away') f.ha = ha
  if (get('q')) f.q = String(get('q')).slice(0, 40)
  if (get('team')) f.team = String(get('team')).slice(0, 8)
  if (get('game')) f.game = String(get('game')).slice(0, 40)
  return f
}
/** filters -> { key: value|null } (null = remove the key): only what differs from the defaults is written. */
export function toParams(f, base = defaults()) {
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
  return {
    sp: same([...f.sports].sort(), [...base.sports].sort()) ? null : f.sports.join(','),
    prop: f.props.length ? f.props.join(',') : null,
    bar: f.bar ? String(f.bar) : null,
    win: f.win !== base.win ? f.win : null,
    price: f.price ? f.price.join(',') : null,
    min: f.minN !== base.minN ? String(f.minN) : null,
    ha: f.ha || null, q: f.q || null, team: f.team || null, game: f.game || null,
  }
}
/** The line under the count: what is on, in words ("NBA + NHL · PTS, SOG · L10 70%+ · -150 to +300"). */
export function describe(f, names = {}) {
  const parts = [f.sports.map((s) => names[s] || s.toUpperCase()).join(' + ')]
  if (f.props.length) parts.push(f.props.join(', '))
  if (f.bar) parts.push(`${(WINDOWS.find(([k]) => k === f.win) || [])[1] || f.win} ${f.bar}%+`)
  else if (f.win !== 'L10') parts.push(`by ${(WINDOWS.find(([k]) => k === f.win) || [])[1] || f.win}`)
  if (f.price) parts.push(`${f.price[0] > 0 ? '+' : ''}${f.price[0]} to ${f.price[1] > 0 ? '+' : ''}${f.price[1]}`)
  if (f.ha) parts.push(f.ha === 'home' ? 'home games' : 'away games')
  if (f.team) parts.push(f.team)
  return parts.join(' · ')
}
