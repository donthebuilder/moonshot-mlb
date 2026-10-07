// THE BOT ON HIM (BATCH-FACT-ENGINE, 2026-10-02). Server only. For every
// hitter: each role the bot gave him -> games, HR, hits, how often he did
// that role's job, split by pitcher hand and home / away, with n on every
// number. CLEAN PREGAME ROWS ONLY: por_rows_<date>.jsonl (the board locked at
// first pitch) joined to outcome_log_<date>.jsonl (the latest final revision
// of each player-game), the same record lib/cleanRecord.js prints from.
// graded_results is NOT used: it is written after the games and leaks
// (cleanRecord.js "WHY NOT THE GRADED ARCHIVE"). Void and 0-PA games are out.
// Pitcher hands: MLB Stats API people (one batched read); home / away: the MLB
// schedule for the range (one read). Built once, cached 6 h, for every player.
import { unstable_cache } from 'next/cache'
import { dataUrl } from './dataSource'
import { pickJobOf, PICK_JOBS } from './pickJob'
import { LOCKED_SINCE, parseJsonl, finalOutcomes, played } from './record/mlbLocked'

export const BOT_SINCE = LOCKED_SINCE          // the clean pregame record starts here (lib/record/mlbLocked.js)
export const TWEET_MIN_N = 10                    // a tweet from this family needs n >= 10 in the exact cut
const i0 = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0 }

// Twice each role's bar (the bars are lib/pickJob.js's, the record page's).
export const DOUBLE_BAR = {
  TOP: { label: '2+ HR', test: (o) => o.hr >= 2 },
  HR: { label: '2+ HR', test: (o) => o.hr >= 2 },
  HIT: { label: '2+ hits', test: (o) => o.hits >= 2 },
  HRR: { label: '4+ H+R+RBI', test: (o) => o.hits + o.runs + o.rbi >= 4 },
  CONTACT: { label: '4+ total bases', test: (o) => o.tb >= 4 },
}

const jsonl = parseJsonl
const get = (u) => fetch(u, { cache: 'no-store' }).then((r) => (r.ok ? r.text() : null)).catch(() => null)
const days = (from, to) => { const out = []; for (let t = Date.parse(`${from}T12:00:00Z`); t <= Date.parse(`${to}T12:00:00Z`); t += 864e5) out.push(new Date(t).toISOString().slice(0, 10)); return out }

const blank = () => ({ g: 0, hr: 0, hrG: 0, hitG: 0, did: 0, dbl: 0 })
const add = (c, o, did, dbl) => { c.g += 1; c.hr += o.hr; if (o.hr > 0) c.hrG += 1; if (o.hits > 0) c.hitG += 1; if (did) c.did += 1; if (dbl) c.dbl += 1 }

async function build(through) {
  const rows = []
  const ds = days(BOT_SINCE, through)
  for (let k = 0; k < ds.length; k += 6) {
    const batch = await Promise.all(ds.slice(k, k + 6).map(async (d) => {
      const [p, o] = await Promise.all([get(dataUrl(`current/por_rows_${d}.jsonl`)), get(dataUrl(`current/outcome_log_${d}.jsonl`))])
      if (!p || !o) return []
      // the latest FINAL revision of each player-game
      const fin = finalOutcomes(jsonl(o))
      return jsonl(p).map((r) => ({ d, r, o: fin.get(`${r.game_pk}|${r.player_id}`) })).filter((x) => played(x.o))
    }))
    rows.push(...batch.flat())
  }
  // pitcher hands (one batched read) and home teams (one schedule read)
  const pids = [...new Set(rows.map((x) => x.r.opp_pitcher_id).filter(Boolean))]
  const hand = new Map()
  for (let k = 0; k < pids.length; k += 150) {
    const j = await fetch(`https://statsapi.mlb.com/api/v1/people?personIds=${pids.slice(k, k + 150).join(',')}`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
    for (const p of j?.people || []) hand.set(p.id, p.pitchHand?.code || null)
  }
  const sc = await fetch(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&startDate=${BOT_SINCE}&endDate=${through}&gameType=R,F,D,L,W&hydrate=team`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
  const homeOf = new Map()
  for (const d of sc?.dates || []) for (const g of d.games || []) homeOf.set(g.gamePk, g.teams?.home?.team?.abbreviation || null)

  const players = {}
  for (const { d, r, o } of rows) {
    const out = { hr: i0(o.home_runs), hits: i0(o.hits), runs: i0(o.runs), rbi: i0(o.rbi), tb: i0(o.total_bases) }
    const job = pickJobOf({ game_pick_role: r.game_pick_role, got_hr: out.hr > 0 ? 1 : 0, actual_hr: out.hr, actual_hits: out.hits, actual_runs: out.runs, actual_rbi: out.rbi, actual_tb: out.tb })
    const role = job?.role && DOUBLE_BAR[job.role] ? job.role : (String(r.game_pick_role || '').split('/')[0].trim().toUpperCase() || 'NONE')
    const P = players[r.player_id] ||= { name: r.player, team: r.team, games: 0, roles: {}, last: d }
    P.games += 1; P.name = r.player; P.team = r.team; if (d > P.last) P.last = d
    const R = P.roles[role] ||= { all: blank(), vsL: blank(), vsR: blank(), home: blank(), away: blank(), log: [] }
    const did = job ? job.did : null
    const dbl = DOUBLE_BAR[role] ? DOUBLE_BAR[role].test(out) : false
    const h = hand.get(r.opp_pitcher_id)
    const home = homeOf.get(r.game_pk) ? homeOf.get(r.game_pk) === r.team : null
    add(R.all, out, did, dbl)
    if (h === 'L') add(R.vsL, out, did, dbl); else if (h === 'R') add(R.vsR, out, did, dbl)
    if (home === true) add(R.home, out, did, dbl); else if (home === false) add(R.away, out, did, dbl)
    R.log.push([d, out.hr, out.hits, h || '', did === true ? 1 : did === false ? 0 : null])
  }
  return { since: BOT_SINCE, through, nights: new Set(rows.map((x) => x.d)).size, rows: rows.length, players }
}

/** Every hitter's "bot on him", built once per 6 h. `through` = the last finished night. */
export function botOnHimAll(through) {
  return unstable_cache(() => build(through), ['bot-on-him-v1', through], { revalidate: 21600 })()
    .catch((e) => (/incrementalCache|static generation store|outside a request/i.test(String(e?.message)) ? build(through) : Promise.reject(e)))
}

/** The two badges, per role, from one player's summary: a badge drops the moment it stops being true. */
export function botBadges(P) {
  const out = []
  for (const [role, R] of Object.entries(P?.roles || {})) {
    if (!PICK_JOBS[role] || !DOUBLE_BAR[role]) continue
    const a = R.all
    if (a.g >= 3 && a.did === a.g) out.push({ key: `perfect-${role}`, kind: 'perfect', role, label: 'PERFECT WHEN PICKED', text: `${a.did}/${a.g} as a ${PICK_JOBS[role].label} pick`, job: PICK_JOBS[role].job })
    if (a.dbl >= 2) out.push({ key: `double-${role}`, kind: 'double', role, label: 'DOUBLED THE BAR', text: `${a.dbl} of ${a.g} as a ${PICK_JOBS[role].label} pick`, job: DOUBLE_BAR[role].label })
  }
  return out
}
