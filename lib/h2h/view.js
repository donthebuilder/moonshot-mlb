// HEAD TO HEAD, AS A SECTION (2026-10-13). Pure: a /api/h2h payload in, a team-page section out (the shape of
// lib/team/contract.js: { id, label, window, status, state, empty, blocks }), so ONE drawer (components/team/SectionView.js)
// draws it on a team page and on a game page, in the sport's own table. Nothing here names a sport's table or colour.
//
//   pair  a vs b : by season (record, win %, average each side scored, margin, total, last meeting) + the meetings list
//   club  a vs everyone : the club's season against each opponent, rivals first
//
// Words: MARGIN is the final score difference from one club's side. It is never called a spread (no closing spread is
// stored); averages print only from MIN_MEETINGS (3) games and say "not enough yet" under it.
import { bySeason, vsEveryone, recordText, sideOf } from './core'
import { rivalryOf, MIN_MEETINGS, SPORT_RULES } from './config'

const ID = 'h2h'
const LABEL = 'Head to head'
const dash = '–'

/** "W 5–3", "L 2–4 OT" -- the result from `a`'s side. */
export function resultText(g, a) {
  const s = sideOf(g, a); if (!s) return '—'
  return `${s.result} ${s.for}${dash}${s.against}${g.ot ? ` ${g.ot}` : ''}`
}
const lastText = (l) => (l ? `${l.result} ${l.for}${dash}${l.against}${l.ot ? ` ${l.ot}` : ''}` : '—')

const empty = (title, note) => ({ id: ID, label: LABEL, window: null, n: 0, state: 'empty', empty: { title, note }, blocks: [] })
const missing = (seasons) => (seasons || []).filter((s) => !s.ok).map((s) => s.label)
const missingNote = (seasons) => (missing(seasons).length ? `The league feed did not answer for ${missing(seasons).join(', ')}; those seasons are not in the numbers.` : null)

export function pairSection(payload, { open = false } = {}) {
  const { sport, a, b } = payload
  const rules = SPORT_RULES[sport] || SPORT_RULES.mlb
  const unit = rules.unit
  const { rows, all, meetings } = bySeason(payload.games || [], a, b, sport)
  const asked = (payload.seasons || []).map((s) => s.label)
  if (!meetings.length) {
    return empty('NO MEETINGS ON RECORD', `${a} and ${b} have no finished game in ${asked.length ? asked.join(', ') : 'the seasons read'}.${missingNote(payload.seasons) ? ` ${missingNote(payload.seasons)}` : ''}`)
  }
  const rivalry = rivalryOf(sport, a, b)
  const tableRows = [...rows, ...(rows.length > 1 && all ? [all] : [])].map((r) => ({
    _key: r.key, label: r.label, gp: r.gp, rec: recordText(r, sport), winPct: r.winPct, avgFor: r.avgFor, avgAgainst: r.avgAgainst, avgMargin: r.avgMargin, avgTotal: r.avgTotal,
    date: r.last?.date || null, lastTxt: lastText(r.last), noOpen: true,
  }))
  const seasonCols = [
    { key: 'label', label: 'Season', w: 96, heat: false, sticky: true, bold: true, group: 'Series' },
    { key: 'gp', label: 'GP', w: 40, heat: false, group: 'Series', title: 'Finished games between the two clubs.' },
    { key: 'rec', label: `${a} record`, w: 86, heat: false, group: 'Series', title: `${rules.recordWords}, from ${a}’s side.` },
    { key: 'winPct', label: 'Win %', w: 56, kind: 'pct3', group: 'Series' },
    { key: 'avgFor', label: `${a} avg`, w: 62, kind: 'n1', group: 'Margin', title: `The ${unit}s ${a} scored per meeting, on average.` },
    { key: 'avgAgainst', label: `${b} avg`, w: 62, kind: 'n1', group: 'Margin', title: `The ${unit}s ${b} scored per meeting, on average.` },
    { key: 'avgMargin', label: `${a} margin`, w: 78, signed: true, dp: 1, group: 'Margin', title: `Average final score difference from ${a}’s side. It is a margin, not a betting spread: no closing spread is stored.` },
    { key: 'avgTotal', label: 'Total', w: 56, kind: 'n1', group: 'Margin', title: 'Average combined score.' },
    { key: 'date', label: 'Last', w: 70, kind: 'day', heat: false, group: 'Last meeting' },
    { key: 'lastTxt', label: `${a}`, w: 82, heat: false, group: 'Last meeting', title: `The last meeting’s score from ${a}’s side.` },
  ]
  const meetRows = meetings.map((g) => {
    const s = sideOf(g, a)
    const win = s.result === 'W' ? a : s.result === 'L' ? b : null
    return {
      _key: g.id || `${g.date}-${g.home}`, gameId: g.id, date: g.date, season: g.season, kind: g.type === 'P' ? 'Playoffs' : 'Regular', where: s.home ? 'Home' : 'Away',
      winner: win || 'Tie', winnerCode: win, score: `${Math.max(g.hs, g.as)}${dash}${Math.min(g.hs, g.as)}${g.ot ? ` ${g.ot}` : ''}`, margin: s.margin, total: g.hs + g.as, noOpen: !open,
    }
  })
  const meetCols = [
    { key: 'date', label: 'Date', w: 70, kind: 'day', heat: false, sticky: true, group: 'Game' },
    { key: 'winner', label: 'Winner', w: 60, heat: false, bold: true, group: 'Game', link: 'team', linkKey: 'winnerCode' },
    { key: 'score', label: 'Score', w: 76, heat: false, group: 'Game' },
    { key: 'where', label: `${a} was`, w: 62, heat: false, group: 'Game' },
    { key: 'kind', label: 'Type', w: 74, heat: false, group: 'Game' },
    { key: 'margin', label: `${a} margin`, w: 78, signed: true, group: 'Margin' },
    { key: 'total', label: 'Total', w: 52, group: 'Margin' },
  ]
  const blocks = [
    { type: 'table', id: 'h2h-seasons', title: `${a} vs ${b} · by season`, caption: `${a} against ${b}: the record, what each club scored on average, the average margin and the last meeting. Regular season and playoffs together.`, rows: tableRows, columns: seasonCols, heat: 'standouts', maxRows: 5, bareTable: true },
  ]
  const thin = tableRows.filter((r) => r.gp < MIN_MEETINGS).length
  if (thin) blocks.push({ type: 'note', text: `Not enough yet for averages in ${thin === tableRows.length ? 'any row' : `${thin} row${thin === 1 ? '' : 's'}`}: they need ${MIN_MEETINGS} or more meetings, so a thinner row shows the record and the last meeting only.` })
  blocks.push({ type: 'table', id: 'h2h-meetings', title: `Meetings · ${meetings.length}`, caption: 'Every finished meeting in the seasons read, latest first.', rows: meetRows, columns: meetCols, initialSort: { key: 'date', dir: 'desc' }, heat: 'sorted', maxRows: 5, bareTable: true, ...(open ? { rowOpen: 'game' } : {}) })
  blocks.push({ type: 'note', text: `Margin is the final score difference from ${a}’s side. It is not a betting spread: no closing spread is stored, so who covered is not shown.${missingNote(payload.seasons) ? ` ${missingNote(payload.seasons)}` : ''}` })
  return {
    id: ID, label: LABEL, n: meetings.length, state: 'ok',
    window: `${a} vs ${b} · ${rows.length > 1 ? `${rows[rows.length - 1].label} to ${rows[0].label}` : rows[0].label} · ${meetings.length} ${meetings.length === 1 ? 'meeting' : 'meetings'}`,
    rivalry: rivalry ? rivalry.tag : null, blocks,
  }
}

export function clubSection(payload) {
  const { sport, a } = payload
  const rules = SPORT_RULES[sport] || SPORT_RULES.mlb
  const used = (payload.seasons || []).find((s) => s.n > 0)
  const opp = vsEveryone(payload.games || [], a, sport)
  if (!used || !opp.length) return empty('NO FINISHED GAMES', `${a} has no finished game in the league feed for ${(payload.seasons || []).map((s) => s.label).join(' or ') || 'this season'}.${missingNote(payload.seasons) ? ` ${missingNote(payload.seasons)}` : ''}`)
  const rows = opp.map((r) => {
    const rv = rivalryOf(sport, a, r.opp)
    return {
      _key: r.opp, opp: r.opp, rival: rv ? rv.tag : '', _rv: rv ? 0 : 1, gp: r.gp, rec: recordText(r, sport), winPct: r.winPct, avgMargin: r.avgMargin, avgTotal: r.avgTotal,
      date: r.last?.date || null, lastTxt: lastText(r.last), noOpen: true,
    }
  }).sort((x, y) => x._rv - y._rv || y.gp - x.gp || (x.opp < y.opp ? -1 : 1))
  const cols = [
    { key: 'opp', label: 'Opponent', w: 84, heat: false, sticky: true, bold: true, group: 'Opponent', link: 'team', linkKey: 'opp' },
    { key: 'rival', label: 'Rivalry', w: 110, heat: false, group: 'Opponent' },
    { key: 'gp', label: 'GP', w: 40, group: 'Series' },
    { key: 'rec', label: 'Record', w: 70, heat: false, group: 'Series', title: `${rules.recordWords}.` },
    { key: 'winPct', label: 'Win %', w: 56, kind: 'pct3', group: 'Series' },
    { key: 'avgMargin', label: 'Margin', w: 66, signed: true, dp: 1, group: 'Margin', title: `Average final score difference from ${a}’s side, from ${MIN_MEETINGS} games. A margin, not a betting spread.` },
    { key: 'avgTotal', label: 'Total', w: 56, kind: 'n1', group: 'Margin' },
    { key: 'date', label: 'Last', w: 70, kind: 'day', heat: false, group: 'Last meeting' },
    { key: 'lastTxt', label: 'Score', w: 82, heat: false, group: 'Last meeting' },
  ]
  const lab = used.label
  const blocks = [
    { type: 'table', id: 'h2h-clubs', title: `${a} against every club · ${lab}`, caption: `${a}'s finished regular-season games by opponent, rivals first. Tap an opponent for its page.`, rows, columns: cols, heat: 'standouts', maxRows: 8, bareTable: true },
  ]
  if (!rules.rareMeetings) blocks.push({ type: 'note', text: `Not enough yet for the margin and the total against a club met fewer than ${MIN_MEETINGS} times: those cells stay empty. Margin is the final score difference, not a betting spread (no closing spread is stored).` })
  else blocks.push({ type: 'note', text: `Clubs meet once or twice a season, so the margin and the total stay empty until ${MIN_MEETINGS} games; open a game to see the club against that opponent over three seasons. Margin is the final score difference, not a betting spread.` })
  return {
    id: ID, label: LABEL, n: opp.reduce((s, r) => s + r.gp, 0), state: 'ok',
    window: `${lab} regular season${payload.stale ? ' (LAST SEASON)' : ''} · ${opp.reduce((s, r) => s + r.gp, 0)} games vs ${opp.length} clubs`, blocks,
  }
}

export const h2hSection = (payload, opts) => (payload?.mode === 'club' ? clubSection(payload) : pairSection(payload, opts))
export const H2H = { ID, LABEL }
