// ESPN's injuries JSON -> the one shape the site reads. Pure; no network.
//
//   GET https://site.api.espn.com/apis/site/v2/sports/{football/nfl|hockey/nhl|baseball/mlb|basketball/nba}/injuries
//   { timestamp, status, season, injuries: [ { id, displayName, injuries: [ { id, status, date, shortComment,
//       longComment, type{description}, details{type, location, detail, side, returnDate, fantasyStatus},
//       athlete{ id, displayName, position{abbreviation}, team{abbreviation}, status{name} } } ] } ] }
//
// -> { sport, team, player_id, espnId, name, position, status, rawStatus, note, returnDate, updatedAt, source }
//    status is one of lib/injuries/statuses INJURY_STATUSES. player_id is OUR id when a roster is passed to
//    attachIds (null until then). A line with a status we do not map is dropped and COUNTED, never guessed.
import { classify, isHealthy } from './statuses'
import { canonTeam } from './teams'

const txt = (v) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim()
const NOT_SPECIFIED = /^(not specified|unknown|n\/a|none)$/i
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)

/** "Right shoulder, inflammation" from the structured details; else the short report line, clipped. */
export function noteOf(i) {
  const d = i?.details || {}
  const side = NOT_SPECIFIED.test(txt(d.side)) ? '' : txt(d.side)
  const type = NOT_SPECIFIED.test(txt(d.type)) ? '' : txt(d.type)
  const detail = NOT_SPECIFIED.test(txt(d.detail)) ? '' : txt(d.detail)
  const part = [side, type].filter(Boolean).join(' ').toLowerCase()
  const bits = [part, detail.toLowerCase()].filter(Boolean)
  if (bits.length) return cap(bits.join(', '))
  const c = txt(i?.shortComment)
  if (!c || /^(ir|out|inj\.?)$/i.test(c)) return ''
  return c.length > 110 ? `${c.slice(0, 107).trimEnd()}...` : c
}

const isoOf = (s) => { const t = Date.parse(txt(s)); return Number.isFinite(t) ? new Date(t).toISOString() : null }

/** @returns {{ entries: object[], skipped: Record<string, number>, sourceAt: string|null, teams: number }} */
export function normaliseEspn(sport, json) {
  const entries = []
  const skipped = {}
  const teams = Array.isArray(json?.injuries) ? json.injuries : []
  for (const t of teams) {
    for (const i of Array.isArray(t?.injuries) ? t.injuries : []) {
      const a = i?.athlete || {}
      const name = txt(a.displayName || [a.firstName, a.lastName].filter(Boolean).join(' '))
      if (!name) { skipped.noName = (skipped.noName || 0) + 1; continue }
      const raw = txt(i?.status || i?.type?.description)
      if (isHealthy(raw)) continue
      const status = classify(raw)
      if (!status) { skipped[raw] = (skipped[raw] || 0) + 1; continue }
      const team = canonTeam(sport, a.team?.abbreviation)
      if (!team) { skipped.noTeam = (skipped.noTeam || 0) + 1; continue }
      entries.push({
        sport, team, player_id: null, espnId: txt(a.id) || null, name,
        position: txt(a.position?.abbreviation) || null,
        status, rawStatus: raw, note: noteOf(i),
        returnDate: txt(i?.details?.returnDate) || null,
        updatedAt: isoOf(i?.date), source: 'espn',
      })
    }
  }
  return { entries, skipped, sourceAt: isoOf(json?.timestamp), teams: teams.length }
}
