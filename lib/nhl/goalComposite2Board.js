// 🏒 LAMP GOAL COMPOSITE v2, THE FETCH-AND-JOIN HALF (lamp-goal-comp-v2; the definition is lib/nhl/goalComposite2Model.js). Server only.
// Takes the night buildNight() already scored and joins what v1 did not read, each FROM A SOURCE THIS REPO ALREADY READS:
//   shot quality   our own lamp_shots archive (the league's play-by-play shot events, x / y / shot type / situation code, written postgame by the tick),
//                  scored by lamp-xg-v1 (lib/nhl/xg.js xgSum). Supabase only: NO NHL request. This season, games BEFORE the date.
//   PP ice time    api.nhle.com/stats/rest/en/skater/timeonice, ppTimeOnIcePerGame (seconds; the field scripts/nhl/goal-v2-backtest.mjs already reads).
//                  ONE league-wide request (limit=-1) per hour, through nhlStatsGet's Data Cache -- the same shape of call as leagueSkaterLines.
//   PP share       his PP minutes (ppTimeOnIcePerGame x games) over his club's (team/powerplay ppTimeOnIcePerGame x its games, spots.readSpecialTeams)
//   opp rest       spots.readRest(clubs, date), the same map boardRead uses: club-schedule-season per club, already in the Data Cache from buildNight
// Every feed is optional: a failed read leaves that ingredient neutral for the men it touches, never an error. form and special teams are read as v1
// reads them (both cached). Called by the tick inside the lock window, in its own try/catch; nothing here touches the live goal board.
import { adminClient } from '../supabase/admin'
import { nhlStatsGet } from './api'
import { readForm } from './seasonLine'
import { readSpecialTeams, readRest } from './spots'
import { xgSum } from './xg'
import { netSave } from './goalCompositeModel'
import { scoreComposite2Night } from './goalComposite2Model'

const safe = async (what, fn, fallback) => { try { return await fn() } catch (e) { console.error(`[lamp composite2] ${what}: ${e?.message}`); return fallback } }
const num = (v) => { const x = Number(v); return v !== null && v !== '' && v !== undefined && Number.isFinite(x) ? x : null }

const XG_TTL = 30 * 60 * 1000
const xgCache = new Map()
/** Map playerId -> { n, xg, g }: his shots on goal this season before `date` (empty-net shots left off), their lamp-xg-v1 xG, the goals among them. */
export async function readShooterXg(ids, season, date, db = adminClient()) {
  const out = new Map()
  if (!db || !ids.length || !season || !date) return out
  const key = `${season}|${date}|${ids.length}`
  const hit = xgCache.get(key)
  if (hit && Date.now() - hit.at < XG_TTL) return hit.v
  const uniq = [...new Set(ids.map(Number).filter(Boolean))]
  const byPlayer = new Map()
  const chunks = []
  for (let i = 0; i < uniq.length; i += 100) chunks.push(uniq.slice(i, i + 100))
  await Promise.all(chunks.map(async (chunk) => {
    for (let from = 0; ; from += 1000) {
      const { data, error } = await db.from('lamp_shots').select('player_id,x,y,zone,result,strength,shot_type,situation_code,goalie_id')
        .in('player_id', chunk).eq('season', season).eq('game_type', 2).lt('game_date', date).in('result', ['sog', 'goal'])
        .order('game_id', { ascending: true }).order('event_id', { ascending: true }).range(from, from + 999)
      if (error) throw new Error(error.message)
      for (const s of data) { const a = byPlayer.get(s.player_id) || []; a.push(s); byPlayer.set(s.player_id, a) }
      if (data.length < 1000) break
    }
  }))
  for (const [id, shots] of byPlayer) {
    const s = xgSum(shots)
    if (s.shots > 0) out.set(Number(id), { n: s.shots, xg: s.xg, g: shots.filter((x) => x.result === 'goal' && x.goalie_id != null).length })
  }
  xgCache.set(key, { at: Date.now(), v: out })
  while (xgCache.size > 4) xgCache.delete(xgCache.keys().next().value)
  return out
}

/** Map playerId -> { ppToiPg (seconds), gp|null } for ONE season, regular season. One league-wide request, cached an hour. */
export async function readPpToi(seasonId) {
  const j = await nhlStatsGet(`/skater/timeonice?limit=-1&cayenneExp=${encodeURIComponent(`seasonId=${seasonId} and gameTypeId=2`)}`, 3600)
  const out = new Map()
  for (const r of j?.data || []) { const v = num(r.ppTimeOnIcePerGame); if (r.playerId && v != null) out.set(Number(r.playerId), { ppToiPg: v, gp: num(r.gamesPlayed) }) }
  return out
}

/** Score the night's composite v2 and hang it on it: night.comp2ByGame = Map(gameId -> [every scored skater]). Returns { feeds } for the tick's log. */
export async function attachComposite2(night, date) {
  const rows = (night?.rows || []).filter((r) => r.legs?.ok)
  const teams = [...new Set(rows.flatMap((r) => [r.team, r.opp]))]
  const cur = night.season?.current || night.season?.id
  const [form, spots, rest, xg, ppToi] = await Promise.all([
    safe('form', () => readForm(cur, date), new Map()),
    safe('special teams', () => readSpecialTeams(), null),
    safe('rest', () => readRest(teams, date), {}),
    safe('shooter xG', () => readShooterXg(rows.map((r) => r.playerId), cur, date), new Map()),
    safe('PP ice time', () => readPpToi(cur), new Map()),
  ])
  // last season's special teams are not this season's (v4): a stale report is not used
  const st = spots && !spots.stale ? new Map(spots.teams.map((t) => [t.abbrev, t])) : new Map()
  const feed = night.compFeed || { sa60: {}, goalies: {} }
  const candidates = rows.map((r) => {
    const net = netSave(feed.goalies?.[r.opp], r.context?.oppGoalie?.id ?? null)
    const f = form.get(Number(r.playerId)) || null
    const x = xg.get(Number(r.playerId)) || null
    const pp = ppToi.get(Number(r.playerId)) || null
    const club = st.get(r.team)
    const gp = pp?.gp ?? num(r.legs?.gpCur)
    const clubPp = club && club.ppToiPg > 0 && club.gp > 0 ? club.ppToiPg * club.gp : null
    const share = pp && gp > 0 && clubPp ? Math.min(1, (pp.ppToiPg * gp) / clubPp) : null
    return {
      gameId: r.gameId, playerId: r.playerId, name: r.name, pos: r.pos, team: r.team, opp: r.opp, home: r.home, legs: r.legs, context: r.context,
      ang: {
        oppSa60: feed.sa60?.[r.opp] ?? null, oppSv: net.sv, oppSvBasis: net.basis,
        oppShPg: st.get(r.opp)?.shPg ?? null, oppPkPct: st.get(r.opp)?.pkPct ?? null,
        form: f ? { l5: f.l5, gp5: f.gp5, l10: f.l10, gp10: f.gp10 } : null,
        xgN: x?.n ?? null, xg: x?.xg ?? null, xgG: x?.g ?? null,
        ppToiPg: pp?.ppToiPg ?? null, ppShare: share,
        oppRest: num(rest?.[r.opp]?.rest),
      },
    }
  })
  const out = scoreComposite2Night(candidates)
  night.comp2ByGame = out.byGame
  return { feeds: { form: form.size, shooterXg: xg.size, ppToi: ppToi.size, specialTeams: st.size, rest: Object.values(rest || {}).filter((x) => x.rest != null).length, scored: out.rows.length } }
}
