// FIND A MAN ON THE INJURY LIST, AND MAP HIS ID TO OURS. Pure.
//
// ESPN's athlete ids are not NFL gsis ids, NHL ids or MLB ids (NBA is the exception: lib/nba already uses ESPN's),
// so a man is matched by NAME + CLUB (accents, punctuation and Jr./III stripped), after an exact id hit when we
// have one. A last-name + first-initial + club match is allowed only when it is unambiguous on that club. A man we
// cannot match is simply not found -- never guessed.
import { canonTeam } from './teams'
import { BLOCKS, STATUS_INFO } from './statuses'

// sports whose OWN player ids are ESPN's (lib/nba), so an ESPN id from the injury feed is an id of ours
const ESPN_IDS = new Set(['nba'])
const SUFFIX = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'v'])
export function nameKey(name) {
  const t = String(name == null ? '' : name).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[.'`’]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
  return t.split(' ').filter((w) => w && !SUFFIX.has(w)).join(' ')
}
const shortKey = (name) => {
  const w = nameKey(name).split(' ')
  return w.length >= 2 ? `${w[w.length - 1]}|${w[0][0]}` : ''
}

/** Index a snapshot's entries for lookups. */
export function indexEntries(sport, entries) {
  const full = new Map(); const short = new Map(); const ours = new Map(); const espn = new Map(); const byTeam = new Map()
  for (const e of entries || []) {
    const team = canonTeam(sport, e.team)
    full.set(`${nameKey(e.name)}|${team}`, e)
    const sk = shortKey(e.name)
    if (sk) short.set(`${sk}|${team}`, short.has(`${sk}|${team}`) ? 'AMBIG' : e)
    if (e.player_id != null && e.player_id !== '') ours.set(String(e.player_id), e)
    if (e.espnId) espn.set(String(e.espnId), e)
    if (!byTeam.has(team)) byTeam.set(team, [])
    byTeam.get(team).push(e)
  }
  return { sport, full, short, ours, espn, byTeam, size: (entries || []).length }
}

/** Attach OUR player id to each entry from a roster [{ id|player_id, name, team }]. Returns new entries (input untouched). */
export function attachIds(sport, entries, roster) {
  const idx = new Map(); const sidx = new Map()
  for (const r of roster || []) {
    const id = r?.id ?? r?.player_id ?? r?.playerId
    if (id == null || id === '') continue
    const team = canonTeam(sport, r.team)
    idx.set(`${nameKey(r.name)}|${team}`, String(id))
    const sk = shortKey(r.name)
    if (sk) sidx.set(`${sk}|${team}`, sidx.has(`${sk}|${team}`) ? 'AMBIG' : String(id))
  }
  return (entries || []).map((e) => {
    if (e.player_id != null && e.player_id !== '') return e
    const team = canonTeam(sport, e.team)
    let id = idx.get(`${nameKey(e.name)}|${team}`)
    if (!id) { const s = sidx.get(`${shortKey(e.name)}|${team}`); if (s && s !== 'AMBIG') id = s }
    return id ? { ...e, player_id: id } : e
  })
}

/** The entry for one man, or null. `who` = { player_id|id|playerId, name, team }. NBA ids ARE ESPN's, so they hit the espn map. */
export function findEntry(index, who) {
  if (!index || !index.size) return null
  const id = who?.player_id ?? who?.id ?? who?.playerId
  if (id != null && id !== '') {
    const hit = index.ours.get(String(id)) || (ESPN_IDS.has(index.sport) && index.espn.get(String(id))) || null
    if (hit) return hit
  }
  if (!who?.name) return null
  const team = canonTeam(index.sport, who.team)
  if (!team) return null
  const f = index.full.get(`${nameKey(who.name)}|${team}`)
  if (f) return f
  const s = index.short.get(`${shortKey(who.name)}|${team}`)
  return s && s !== 'AMBIG' ? s : null
}

/** What the injury layer says about one man for gating: null (not listed) or { entry, status, blocked, word }. */
export function injuryVerdict(index, who) {
  const entry = findEntry(index, who)
  if (!entry) return null
  return { entry, status: entry.status, blocked: BLOCKS.has(entry.status), word: STATUS_INFO[entry.status].word }
}

/** Both clubs' listed men for one game, the most relevant first. `isOurs(entry)` puts our board / CALLED men on top. */
export function forGame(index, sport, clubs, { isOurs = () => false } = {}) {
  const out = []
  for (const c of clubs || []) for (const e of index?.byTeam?.get(canonTeam(sport, c)) || []) out.push(e)
  return out.sort((a, b) =>
    (isOurs(b) ? 1 : 0) - (isOurs(a) ? 1 : 0)
    || STATUS_INFO[a.status].rank - STATUS_INFO[b.status].rank
    || String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''))
    || a.name.localeCompare(b.name))
}

/** Count line for a slate or game row: "3 out" (OUT + IL + DOUBTFUL are not-expected-to-play), or '' when there are none. */
export function countLine(entries) {
  const n = (entries || []).filter((e) => BLOCKS.has(e.status)).length
  return n ? `${n} out` : ''
}

/** One row's `who` for findEntry, whatever the sport calls its id and name. */
export const whoOfRow = (r) => ({ player_id: r?.player_id ?? r?.playerId ?? r?.id ?? null, name: r?.name ?? r?.player_name ?? null, team: r?.team ?? null })

/**
 * OUT MEN OFF THE ATTACK LISTS (2026-10-24, Donovan: "if somebody's out of the game, I don't want to see how to attack
 * them ... slide the next best person in there", every sport). The rows minus every man the report has out / on the
 * injured list / doubtful (BLOCKS). Run it on the POOL before a list picks its best, so the next man takes the slot.
 * No index (report loading or unavailable) = the rows as they are: a missing report never empties a list.
 */
export function dropBlocked(index, rows, who = whoOfRow) {
  if (!index || !index.size || !Array.isArray(rows)) return rows
  return rows.filter((r) => { const e = findEntry(index, who(r)); return !(e && BLOCKS.has(e.status)) })
}
