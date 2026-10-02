// 📜 MLB POSTSEASON HISTORY CLAIMS (HISTORY WATCH 2 step 4, 2026-09-27).
// Server only. From Tue 09-29 every regular-season rung is out of reach, so
// in October History Watch asks these instead. History = hist_mlb_post (SABR
// Lahman BattingPost 1884-2025, before this season only); this postseason =
// MLB StatsAPI, read live at claim time (gameType P). Three claims, each a
// query result with its proof in the shape HistoryWatch.js already renders
// ({ who, lastSeason, hits, allSince: [{ season, name, value }], source }):
//
//   DROUGHT  the club has no homer yet this October, and its last postseason
//            homer is more than MIN_GAP seasons back: "a homer tonight = the
//            first Tigers postseason HR since J.D. Martinez in 2014".
//   SEASON   one HR from the club's record for one postseason (a record of 3+).
//   CAREER   one HR from the club's career postseason record (5+), counting
//            his OWN postseason homers for the club by StatsAPI team id.
// A claim that can't be read is skipped, never guessed.
import { MIN_GAP } from './lastTime'
import { adminClient } from '../supabase/admin'

export const POST_CREDIT = 'Data: SABR Lahman Baseball Database; MLB StatsAPI'
const SEASON_MIN = 3
const CAREER_MIN = 5

const db = () => {
  return adminClient()
}
const api = (p) => fetch(`https://statsapi.mlb.com/api/v1${p}`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null))

// History never changes inside a season: one read per franchise per instance.
const _hist = new Map()
async function franchiseHistory(franchise, season) {
  const k = `${franchise}|${season}`
  if (_hist.has(k)) return _hist.get(k)
  const c = db()
  if (!c) return null
  const { data, error } = await c.from('hist_mlb_post').select('season, source_id, name, hr')
    .eq('franchise', franchise).lt('season', season).gt('hr', 0).order('season', { ascending: false }).limit(5000)
  if (error) throw new Error(`hist_mlb_post: ${error.message}`)
  _hist.set(k, data || [])
  return data || []
}

/** Pure: the three claim bases from a franchise's postseason homer rows. */
export function postRecords(rows) {
  const lastSeason = rows.length ? Math.max(...rows.map((r) => r.season)) : null
  const byPlayerSeason = new Map()
  const byPlayer = new Map()
  for (const r of rows) {
    const ks = `${r.source_id}|${r.season}`
    byPlayerSeason.set(ks, { name: r.name, season: r.season, value: (byPlayerSeason.get(ks)?.value || 0) + r.hr })
    byPlayer.set(r.source_id, { name: r.name, value: (byPlayer.get(r.source_id)?.value || 0) + r.hr, last: Math.max(byPlayer.get(r.source_id)?.last || 0, r.season) })
  }
  const seasons = [...byPlayerSeason.values()].sort((a, b) => b.value - a.value || b.season - a.season)
  const careers = [...byPlayer.values()].sort((a, b) => b.value - a.value || b.last - a.last)
  return {
    lastSeason,
    lastPlayers: rows.filter((r) => r.season === lastSeason).map((r) => r.name),
    seasonRecord: seasons[0]?.value || 0,
    seasonHolders: seasons.filter((s) => s.value === seasons[0]?.value),
    seasons, careers,
    careerRecord: careers[0]?.value || 0,
    careerHolders: careers.filter((c) => c.value === careers[0]?.value),
  }
}

const names = (list) => {
  const n = list.map((x) => (x.season ? `${x.name} in ${x.season}` : x.name))
  return n.length <= 2 ? n.join(' and ') : `${n.slice(0, 2).join(', ')} and ${n.length - 2} more`
}

/**
 * Pure: the claims for one hitter. p = { name, teamName, clubHrThisOctober,
 * hrThisOctober, careerForClub } (live numbers); rec = postRecords(rows).
 * @returns [{ kind, text, unit, have, rung, proof }] strongest first
 */
export function postClaims(p, rec, season) {
  const out = []
  const src = { source: POST_CREDIT }
  if (p.clubHrThisOctober === 0 && rec.lastSeason != null && season - rec.lastSeason > MIN_GAP) {
    out.push({
      kind: 'DROUGHT', unit: `${p.teamName} postseason HR yet`, have: 0, rung: 1, lead: `The ${p.teamName} haven't homered this postseason.`, prefix: 'A homer tonight',
      text: `the first ${p.teamName} postseason HR since ${names(rec.lastPlayers.map((name) => ({ name })))} in ${rec.lastSeason}`,
      proof: { title: `Every ${p.teamName} postseason with a homer, newest first (player · HR):`, who: `${p.teamName} player`, lastSeason: rec.lastSeason, hits: rec.seasons.length, allSince: rec.seasons.slice().sort((a, b) => b.season - a.season), ...src },
    })
  }
  // The records are Lahman's (through last season). A teammate tonight who is
  // already at the record this October (rivalNow) or for his career
  // (rivalCareer) may have moved it past what the data knows: then the claim
  // is not said.
  const h = p.hrThisOctober
  if (Number.isFinite(h) && h >= 1 && rec.seasonRecord >= SEASON_MIN && !((p.rivalNow ?? 0) >= rec.seasonRecord) && (h === rec.seasonRecord - 1 || h === rec.seasonRecord)) {
    out.push({
      kind: 'SEASON', unit: 'HR this postseason', have: h, rung: rec.seasonRecord, lead: `${p.name} has ${h} HR this postseason.`, prefix: 'One more',
      text: h === rec.seasonRecord - 1
        ? `ties the ${p.teamName} record for HR in one postseason (${rec.seasonRecord}, ${names(rec.seasonHolders)})`
        : `sets the ${p.teamName} record for HR in one postseason (${rec.seasonRecord}, ${names(rec.seasonHolders)})`,
      proof: { title: `The best single postseasons in ${p.teamName} history (season · player · HR):`, who: `${p.teamName} player`, lastSeason: rec.seasonHolders[0]?.season ?? null, hits: rec.seasons.filter((s) => s.value >= rec.seasonRecord).length, allSince: rec.seasons.filter((s) => s.value >= Math.max(1, rec.seasonRecord - 1)), ...src },
    })
  }
  const c = p.careerForClub
  // Never against himself: a hitter already holding the record is not "one away" from it.
  const holdsIt = rec.careerHolders.some((x) => x.name === p.name)
  if (Number.isFinite(c) && !holdsIt && rec.careerRecord >= CAREER_MIN && !((p.rivalCareer ?? 0) >= rec.careerRecord) && (c === rec.careerRecord - 1 || c === rec.careerRecord)) {
    out.push({
      kind: 'CAREER', unit: `career postseason HR for the ${p.teamName}`, have: c, rung: rec.careerRecord, lead: `${p.name} has ${c} career postseason HR for the ${p.teamName}.`, prefix: 'One more',
      text: c === rec.careerRecord - 1
        ? `ties ${names(rec.careerHolders)} for the most postseason HR in ${p.teamName} history (${rec.careerRecord})`
        : `the most postseason HR in ${p.teamName} history, passing ${names(rec.careerHolders)} (${rec.careerRecord})`,
      proof: { title: `The ${p.teamName} career postseason HR leaders through last season:`, who: `${p.teamName} player`, lastSeason: null, hits: rec.careers.filter((x) => x.value >= rec.careerRecord - 1).length, allSince: rec.careers.slice(0, 8).map((x) => ({ season: `thru ${x.last}`, name: x.name, value: x.value })), ...src },
    })
  }
  const order = { SEASON: 0, CAREER: 1, DROUGHT: 2 }
  return out.sort((a, b) => order[a.kind] - order[b.kind])
}

/** Is `day` a postseason day? (any F/D/L/W game on the schedule). Null when unreadable. */
export async function isPostseasonDay(day) {
  const j = await api(`/schedule?sportId=1&date=${day}&gameType=F,D,L,W&fields=totalGames`).catch(() => null)
  return j ? Number(j.totalGames || 0) > 0 : null
}

/** Live: each club's postseason HR so far this season (team id -> HR). */
async function clubOctober(teamIds, season) {
  const out = new Map()
  await Promise.all(teamIds.map(async (id) => {
    const j = await api(`/teams/${id}/stats?stats=season&group=hitting&season=${season}&gameType=P`).catch(() => null)
    const s = j?.stats?.[0]?.splits?.[0]?.stat
    out.set(id, s ? Number(s.homeRuns || 0) : j ? 0 : NaN)   // no split yet = no postseason game yet = 0
  }))
  return out
}

/** Live: this postseason's HR and his career postseason HR per team id. */
async function hitterOctober(ids, season) {
  const out = new Map()
  for (let i = 0; i < ids.length; i += 100) {
    const j = await api(`/people?personIds=${ids.slice(i, i + 100).join(',')}&hydrate=currentTeam,stats(group=[hitting],type=[yearByYear],gameType=[P])`).catch(() => null)
    for (const p of j?.people || []) {
      const splits = (p.stats || []).flatMap((s) => s.splits || [])
      const byTeam = new Map()
      let now = 0
      for (const x of splits) {
        const hr = Number(x.stat?.homeRuns || 0)
        if (x.team?.id) byTeam.set(x.team.id, (byTeam.get(x.team.id) || 0) + hr)
        if (Number(x.season) === season) now += hr
      }
      out.set(p.id, { name: p.fullName, teamId: p.currentTeam?.id, now, byTeam })
    }
  }
  return out
}

/**
 * Tonight's postseason watch. rows = the day's board rows (player_id = MLBAM,
 * best-ranked first); teams = abbrev -> { franchise, teamName, id } (watch.js).
 * One DROUGHT line per club (on its best-ranked hitter), record lines per hitter.
 */
export async function mlbPostWatch(rows, season, teams) {
  const ids = [...new Set((rows || []).map((r) => Number(r.player_id)).filter(Boolean))]
  if (!ids.length) return []
  const byId = new Map([...teams.values()].map((t) => [t.id, t]))
  const abbrOf = new Map([...teams.entries()].map(([ab, t]) => [t.id, ab]))
  const ppl = await hitterOctober(ids, season)
  const clubIds = [...new Set([...ppl.values()].map((p) => p.teamId).filter(Boolean))]
  const club = await clubOctober(clubIds, season)
  const droughtDone = new Set()
  const out = []
  for (const id of ids) {
    const p = ppl.get(id)
    const t = p && byId.get(p.teamId)
    if (!t?.franchise) continue
    const hist = await franchiseHistory(t.franchise, season).catch(() => null)
    if (!hist) continue
    const mates = [...ppl.entries()].filter(([oid, o]) => oid !== id && o.teamId === p.teamId).map(([, o]) => o)
    const claims = postClaims({
      name: p.name, teamName: t.teamName, clubHrThisOctober: club.get(p.teamId),
      hrThisOctober: p.now, careerForClub: p.byTeam.get(p.teamId) ?? 0,
      rivalNow: Math.max(0, ...mates.map((o) => o.now)),
      rivalCareer: Math.max(0, ...mates.map((o) => o.byTeam.get(p.teamId) ?? 0)),
    }, postRecords(hist), season).filter((c) => c.kind !== 'DROUGHT' || !droughtDone.has(p.teamId))
    if (!claims.length) continue
    if (claims.some((c) => c.kind === 'DROUGHT')) droughtDone.add(p.teamId)
    const [top, ...rest] = claims
    out.push({ player_id: String(id), name: p.name, team: abbrOf.get(p.teamId), hr: top.have, unit: top.unit, rung: top.rung, kind: top.kind, lead: top.lead, prefix: top.prefix, claim: top.text, proof: top.proof, more: rest.map((c) => c.text), postseason: true })
  }
  const order = { SEASON: 0, CAREER: 1, DROUGHT: 2 }
  return out.sort((a, b) => order[a.kind] - order[b.kind] || (a.proof.lastSeason ?? 9999) - (b.proof.lastSeason ?? 9999))
}
