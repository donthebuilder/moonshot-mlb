// THE POSTSEASON EDITIONS' DATA (server only, no JSX at the top: pictures load lazily). Reads MLB's own StatsAPI with gameType=P and hands the pure
// model (lib/cards/postseason.js) its input. READ-ONLY: nothing is written, nothing polls, a result is remembered for a couple of minutes per instance.
//   one player   /people/{id}/stats?stats=season,gameLog,career&group=hitting,pitching&gameType=P&season=YYYY   (ONE call: this postseason, each game, career)
//   the league   /stats?stats=season&group=hitting|pitching&gameType=P&playerPool=ALL&sportIds=1              (every player with a postseason line, in one call)
//   a club's run /schedule?sportId=1&teamId=&startDate=&endDate=&gameType=F,D,L,W                             (series results; each game names its round)
// A player or club with no postseason game answers { ok:false, status:404, why }; a source that does not answer is 502. Nothing is drawn from a guess.
import { teamCodeFromName, teamFullName, teamPrimary, mlbHeadshot } from '../mlbTeams'
import { postseasonLine, seriesEdition, leagueCode, roundOf, roundTag, hitCounts, pitCounts } from './postseason'

const API = 'https://statsapi.mlb.com/api/v1'
const miss = (why, status = 404) => ({ ok: false, status, why })
const ET = 'America/New_York'
const jget = async (u, ms = 9000) => {
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), ms)
  try { const r = await fetch(u, { signal: ctl.signal, cache: 'no-store' }); return r.ok ? await r.json() : null } catch { return null } finally { clearTimeout(t) }
}
/** Like jget but says a 404 (the thing does not exist) apart from a source that did not answer: { none:true } | null | the json. */
const jget404 = async (u, ms = 9000) => {
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), ms)
  try { const r = await fetch(u, { signal: ctl.signal, cache: 'no-store' }); return r.ok ? await r.json() : (r.status === 404 || r.status === 400) ? { none: true } : null } catch { return null } finally { clearTimeout(t) }
}
const _memo = new Map()
async function memo(key, fn, ttl = 120e3) {
  const hit = _memo.get(key)
  if (hit && Date.now() - hit.at < ttl) return hit.v
  const v = await fn()
  if (v != null) { if (_memo.size > 60) _memo.clear(); _memo.set(key, { at: Date.now(), v }) }
  return v
}
export const _resetPostseasonMemo = () => _memo.clear()

/** The seasons to try, newest first: this year's postseason, then last year's (the most recent one on record when the new year has none yet). */
export function seasonsToTry(now = Date.now(), asked = null) {
  if (asked) return [String(asked)]
  const y = Number(new Date(now).toLocaleDateString('en-CA', { timeZone: ET }).slice(0, 4))
  return [String(y), String(y - 1)]
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const bornWord = (iso, city) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); return m ? `${MON[+m[2] - 1]} ${+m[3]}, ${m[1]}${city ? ` · ${city}` : ''}` : null }

/** The thirty clubs: code (the site's), id, full name. One read, kept six hours. */
export async function clubs() {
  return memo('clubs', async () => {
    const j = await jget(`${API}/teams?sportId=1&fields=teams,id,name,abbreviation,league,name`, 9000)
    if (!j?.teams) return null
    const byCode = new Map(), byId = new Map()
    for (const t of j.teams) {
      const code = teamCodeFromName(t.name) || t.abbreviation
      const row = { id: t.id, code, name: t.name, league: leagueCode(t.league?.name) }
      byCode.set(code, row); byId.set(t.id, row)
    }
    return { byCode, byId }
  }, 6 * 3600e3)
}

// ── pictures (lazy: the JSON routes never pull the card kit) ──────────────
/** MLB's ACTION photo of a player (img.mlbstatic.com .../people/{id}/action/vertical/current, 2:3), by width. The URL answers 404 when MLB has none. */
export const mlbActionPhoto = (id, px) => `https://img.mlbstatic.com/mlb-photos/image/upload/w_${px},q_auto:best/v1/people/${encodeURIComponent(id)}/action/vertical/current`
export const ART_TIMEOUT_MS = 4000

/** The top square of a 2:3 data-URI photo (head and shoulders) as a small JPEG data URI; '' on any trouble. */
export async function topSquare(dataUri, px = 360) {
  try {
    const buf = Buffer.from(String(dataUri).split(',')[1] || '', 'base64')
    if (!buf.length) return ''
    const sharp = (await import('sharp')).default
    const m = await sharp(buf).metadata()
    const side = Math.min(m.width, m.height)
    const out = await sharp(buf).extract({ left: Math.floor((m.width - side) / 2), top: 0, width: side, height: side }).resize(px, px).jpeg({ quality: 82 }).toBuffer()
    return `data:image/jpeg;base64,${out.toString('base64')}`
  } catch { return '' }
}

/**
 * The pictures of one player: his silo headshot (the fallback, as every card), his club mark, and his ACTION photo as the card's art
 * (`art`, full size; `faceArt`, a head-and-shoulders square). A photo that 404s or takes over 4 s is just absent ('' = the card uses the
 * headshot); the fetch is the card kit's memoised `inline`, and the whole result is remembered 60 s per player, so a render never waits twice.
 */
async function pictures(id, code, { art = true } = {}) {
  return memo(`pic|${id}|${code}|${art}`, async () => {
    try {
      const [{ inline }, { logoFor }] = await Promise.all([import('./cardKit'), import('./adapters/common')])
      const [logo, face, photo] = await Promise.all([
        code ? logoFor('mlb', code) : { src: '', plate: false },
        inline(mlbHeadshot(String(id), 480, { strict: true })),
        art && Number(id) > 0 ? inline(mlbActionPhoto(id, 900), { timeout: ART_TIMEOUT_MS }) : '',
      ])
      return { face, logo: logo.src, logoPlate: logo.plate, tone: code ? teamPrimary(code) : null, art: photo || '', faceArt: photo ? await topSquare(photo) : '' }
    } catch { return { face: '', logo: '', logoPlate: false, tone: null, art: '', faceArt: '' } }
  }, 60e3)
}

const groupOf = (stats, type, group) => stats.find((s) => s.type?.displayName === type && s.group?.displayName === group)?.splits || []

/** The raw read of one player's postseason for one season: { people, bundle } or null when the source did not answer. */
async function readPlayer(id, season) {
  const [stats, ppl] = await Promise.all([
    jget404(`${API}/people/${encodeURIComponent(id)}/stats?stats=season,gameLog,career&group=hitting,pitching&gameType=P&season=${season}`),
    jget404(`${API}/people/${encodeURIComponent(id)}?hydrate=currentTeam`),
  ])
  if (stats?.none || ppl?.none || (ppl && !ppl.people?.length)) return { none: true }
  if (!stats || !ppl?.people?.[0]) return null
  // a PITCHER's game log labels every game 'P' (a hitter's carries F / D / L / W): the round of those games is read from the schedule, by game id
  const logs = (stats.stats || []).filter((s) => s.type?.displayName === 'gameLog').flatMap((s) => s.splits || [])
  const unknown = [...new Set(logs.filter((x) => !roundOf(x.gameType)).map((x) => x.game?.gamePk).filter(Boolean))]
  if (unknown.length) {
    const sch = await jget(`${API}/schedule?sportId=1&gamePks=${unknown.slice(0, 40).join(',')}&fields=dates,games,gamePk,gameType`)
    const typeOf = new Map((sch?.dates || []).flatMap((d) => d.games || []).map((g) => [g.gamePk, g.gameType]))
    for (const x of logs) if (!roundOf(x.gameType) && typeOf.has(x.game?.gamePk)) x.gameType = typeOf.get(x.game.gamePk)
  }
  return { person: ppl.people[0], stats: stats.stats || [] }
}

/** The input of postseasonLine from a raw read (pure; the check feeds it a TEST read). */
export function normalizePlayer(read, season, clubsById = null) {
  const p = read.person
  const side = (g) => {
    const seasonSplit = groupOf(read.stats, 'season', g)[0] || null
    return { season: seasonSplit?.stat || null, log: groupOf(read.stats, 'gameLog', g), career: groupOf(read.stats, 'career', g)[0]?.stat || null, split: seasonSplit }
  }
  const hitting = side('hitting'), pitching = side('pitching')
  const anyLog = [...hitting.log, ...pitching.log]
  const lastTeam = anyLog.length ? [...anyLog].sort((a, b) => String(a.date).localeCompare(String(b.date))).pop().team : null
  const tm = hitting.split?.team || pitching.split?.team || lastTeam || p.currentTeam || null
  const code = tm?.id && clubsById?.get(tm.id)?.code ? clubsById.get(tm.id).code : teamCodeFromName(tm?.name)
  const lg = leagueCode((hitting.split?.league || pitching.split?.league || anyLog[0]?.league)?.name) || (tm?.id && clubsById?.get(tm.id)?.league) || ''
  return {
    id: p.id, name: p.fullName, pos: p.primaryPosition?.abbreviation || null, number: p.primaryNumber || null, season: String(season),
    team: code || '', teamName: teamFullName(code) || tm?.name || '', league: lg,
    bio: [
      ['HT / WT', [p.height, p.weight ? `${p.weight} lb` : null].filter(Boolean).join(' · ')],
      ['BATS / THROWS', p.batSide?.code ? `${p.batSide.code} / ${p.pitchHand?.code || '—'}` : null],
      ['BORN', bornWord(p.birthDate, [p.birthCity, p.birthStateProvince || p.birthCountry].filter(Boolean).join(', '))],
      ['DEBUT', p.mlbDebutDate ? bornWord(p.mlbDebutDate, '') : null],
    ],
    hitting: { season: hitting.season, log: hitting.log, career: hitting.career },
    pitching: { season: pitching.season, log: pitching.log, career: pitching.career },
  }
}

/**
 * A player's postseason edition model (+ pictures when `pictures` is true). { ok:true, model, name, day } | { ok:false, status, why }.
 * `group` = 'hitting' | 'pitching' to force one side of a two-way player.
 */
export async function loadPostseasonPlayer({ id, season = null, group = null, now = Date.now(), withPictures = true }) {
  if (!/^\d{1,9}$/.test(String(id || ''))) return miss('a numeric MLB player id is needed', 400)
  const cl = await clubs()
  for (const yr of seasonsToTry(now, season)) {
    const read = await memo(`pl|${id}|${yr}`, () => readPlayer(String(id), yr), 90e3)
    if (!read) return miss('MLB did not answer', 502)
    if (read.none) return miss('no such player')
    const player = normalizePlayer(read, yr, cl?.byId)
    const r = postseasonLine(player, { group })
    if (!r.ok) continue
    if (withPictures) Object.assign(r.model, await pictures(id, r.model.team))
    return { ok: true, model: r.model, name: `${String(r.model.name).toLowerCase().replace(/[^a-z0-9]+/g, '-')}-postseason`, day: r.model.last?.date || null }
  }
  return miss(`no postseason games for that player in ${seasonsToTry(now, season).join(' or ')}`)
}

/** Every player who has a postseason line this season: { hitters:[{id,name,teamId,stat}], pitchers:[...] } (two league reads, kept two minutes). */
export async function loadLeaguePostseason(season) {
  return memo(`lg|${season}`, async () => {
    const q = (g) => jget(`${API}/stats?stats=season&group=${g}&gameType=P&season=${season}&playerPool=ALL&limit=2000&sportIds=1`)
    const [h, p] = await Promise.all([q('hitting'), q('pitching')])
    if (!h || !p) return null
    const rows = (j) => (j.stats?.[0]?.splits || []).map((s) => ({ id: s.player?.id, name: s.player?.fullName, teamId: s.team?.id, stat: s.stat }))
    return { hitters: rows(h), pitchers: rows(p), season: String(season) }
  }, 120e3)
}

/** How many players have a postseason line today, by group and by club (for the report and the check of the live read). */
export async function postseasonCensus(season) {
  const lg = await loadLeaguePostseason(season)
  if (!lg) return null
  const ids = new Set([...lg.hitters, ...lg.pitchers].map((r) => r.id))
  return { season: String(season), hitters: lg.hitters.length, pitchers: lg.pitchers.length, players: ids.size, hittersWithHr: lg.hitters.filter((r) => hitCounts(r.stat).homeRuns > 0).length }
}

async function scheduleOf(teamId, season) {
  return memo(`sch|${teamId}|${season}`, async () => {
    const j = await jget(`${API}/schedule?sportId=1&teamId=${teamId}&startDate=${season}-09-15&endDate=${season}-11-20&gameType=F,D,L,W&hydrate=team,probablePitcher`)
    return j ? (j.dates || []).flatMap((d) => d.games || []) : null
  }, 90e3)
}

/** A club's postseason run as a series edition model (+ pictures). `code` is the site's club code (NYY, LAD ...). */
export async function loadSeriesEdition({ code, season = null, now = Date.now(), withPictures = true }) {
  const cl = await clubs()
  if (!cl) return miss('MLB did not answer', 502)
  const club = cl.byCode.get(String(code || '').toUpperCase())
  if (!club) return miss('no such club')
  for (const yr of seasonsToTry(now, season)) {
    const [games, lg] = await Promise.all([scheduleOf(club.id, yr), loadLeaguePostseason(yr)])
    if (!games || !lg) return miss('MLB did not answer', 502)
    const mine = games.filter((g) => roundOf(g.gameType))
    const r = seriesEdition({
      code: club.code, name: club.name, id: club.id, league: club.league, season: yr, games: mine,
      hitters: lg.hitters.filter((x) => x.teamId === club.id), pitchers: lg.pitchers.filter((x) => x.teamId === club.id),
    }, (t) => teamFullName(cl.byId.get(t?.id)?.code) || t?.name || '')
    if (!r.ok) continue
    if (withPictures) {
      const pic = await pictures('0', club.code)
      const { inline } = await import('./cardKit')
      const rowsOf = [...r.model.hitters, ...r.model.pitchers]
      // each row wears his action photo cropped to head and shoulders (a small 240 px fetch), else his headshot
      const shots = await Promise.all(rowsOf.map(async (p) => {
        const small = await inline(mlbActionPhoto(p.id, 240), { timeout: ART_TIMEOUT_MS })
        return (small && (await topSquare(small, 160))) || (await inline(mlbHeadshot(String(p.id), 160, { strict: true })))
      }))
      rowsOf.forEach((p, i) => { p.face = shots[i] || '' })
      Object.assign(r.model, { logo: pic.logo, logoPlate: pic.logoPlate, tone: pic.tone })
    }
    return { ok: true, model: r.model, name: `${club.code.toLowerCase()}-postseason-run`, day: null }
  }
  return miss(`no postseason games for ${club.name}`)
}

/**
 * THE GAME PAGE'S ROW: for one game (gamePk), is it a postseason game, and who are the key players. For each club: the three hitters with the most
 * postseason home runs (then hits, then RBI) and the probable starter when he has a postseason line. { postseason:false } for a regular-season
 * game (nothing is drawn). Public data only; one schedule read + the cached league read.
 */
export async function loadGameKeyPlayers({ gamePk, now = Date.now() }) {
  if (!/^\d{4,9}$/.test(String(gamePk || ''))) return miss('a game id is needed', 400)
  const sch = await memo(`gm|${gamePk}`, () => jget(`${API}/schedule?sportId=1&gamePks=${gamePk}&hydrate=team,probablePitcher`), 90e3)
  const g = sch?.dates?.[0]?.games?.[0]
  if (!sch) return miss('MLB did not answer', 502)
  if (!g || !roundOf(g.gameType)) return { ok: true, postseason: false }
  const yr = String(g.season || String(g.officialDate || '').slice(0, 4))
  const [cl, lg] = await Promise.all([clubs(), loadLeaguePostseason(yr)])
  if (!lg || !cl) return miss('MLB did not answer', 502)
  const side = (s) => {
    const t = g.teams[s]
    const club = cl.byId.get(t.team.id)
    const hit = lg.hitters.filter((x) => x.teamId === t.team.id).map((x) => ({ ...x, c: hitCounts(x.stat) }))
      .sort((a, b) => b.c.homeRuns - a.c.homeRuns || b.c.hits - a.c.hits || b.c.rbi - a.c.rbi || String(a.name).localeCompare(String(b.name))).slice(0, 3)
    const pp = t.probablePitcher
    const pit = pp ? lg.pitchers.find((x) => x.id === pp.id) : null
    return {
      code: club?.code || '', name: t.team.name, league: club?.league || '',
      hitters: hit.map((x) => ({ id: x.id, name: x.name, group: 'hitting', games: x.c.gamesPlayed, avg: x.stat.avg, ops: x.stat.ops, hr: x.c.homeRuns, rbi: x.c.rbi })),
      pitcher: pp ? { id: pp.id, name: pp.fullName, group: 'pitching', line: pit ? { games: pitCounts(pit.stat).gamesPlayed, ip: pit.stat.inningsPitched, era: pit.stat.era, k: pitCounts(pit.stat).strikeOuts } : null } : null,
    }
  }
  const lgCode = cl.byId.get(g.teams.home.team.id)?.league || ''
  return { ok: true, postseason: true, gamePk: g.gamePk, season: yr, round: roundTag(g.gameType, lgCode), gameNo: g.seriesGameNumber || null, of: g.gamesInSeries || null, away: side('away'), home: side('home') }
}
