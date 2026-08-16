// League-wide leader boards, pulled live from the MLB StatsAPI — the same
// public, CORS-open API lib/situational.js already uses from the browser.
//
// WHY THIS EXISTS: the slate payload carries each hitter's season HR/RBI/runs
// but NO stolen bases — there is no season_sb field anywhere in the bot JSON —
// so speed had no surface on the site at all. This pulls the actual league
// top-10 boards instead of pretending the slate is the league.
//
// VERIFIED LIVE 2026-08-08 against a real response (Nasim Nuñez 40 SB,
// James Wood 100 R, CJ Abrams 89 RBI). Two things the verification caught:
//   - statGroup=hitting is REQUIRED. Without it the API returns every stat
//     group and the FIRST leagueLeaders block is pitchers' stolen bases
//     *allowed* (Eury Pérez "25 SB" — against him, not by him).
//   - ties overflow the limit: limit=10 can return 12+ rows, so we slice.
//
// One fetch for all categories, cached for the session. If the call fails the
// caller gets null and shows an honest empty state — no stale numbers.
//
// The second half of this file is the HISTORICAL side — leaderboards over the
// graded archive rather than over tonight. See the banner comment down there.

import { gradedResultsUrl } from './dataSource'
import { dedupeGraded, gradedSlots } from './graded'
import { pickCleared } from './liveSlate'

const API = 'https://statsapi.mlb.com/api/v1'
let cached = null

const season = () => {
  const d = new Date()
  // January–February belong to last season's data (same rule as situational).
  return d.getMonth() < 2 ? d.getFullYear() - 1 : d.getFullYear()
}

export const LEADER_CATS = [
  { cat: 'stolenBases',  icon: '🏃', label: 'Stolen bases', unit: 'SB' },
  { cat: 'runs',         icon: '🔁', label: 'Runs scored',  unit: 'R' },
  { cat: 'runsBattedIn', icon: '🚛', label: 'RBI',          unit: 'RBI' },
]

// → { stolenBases: [{id, name, team, value}], runs: [...], runsBattedIn: [...] }
//   or null if the API call failed / came back empty.
export async function leagueLeaders() {
  if (cached) return cached
  const cats = LEADER_CATS.map((c) => c.cat).join(',')
  const url = `${API}/stats/leaders?leaderCategories=${cats}&statGroup=hitting`
    + `&season=${season()}&sportId=1&limit=10`
    + '&fields=leagueLeaders,leaderCategory,leaders,person,id,fullName,value,team,name'
  cached = fetch(url)
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => {
      const out = {}
      ;(j?.leagueLeaders || []).forEach((b) => {
        const rows = (b?.leaders || [])
          .map((l) => ({
            id: l?.person?.id ?? null,
            name: l?.person?.fullName || '?',
            team: l?.team?.name || '',
            value: Number(l?.value),
          }))
          .filter((r) => r.id != null && Number.isFinite(r.value))
        if (b?.leaderCategory && rows.length) out[b.leaderCategory] = rows.slice(0, 10)
      })
      return Object.keys(out).length ? out : null
    })
    .catch(() => null)
  return cached
}


// ── 🏁 WHY THERE IS NO MILESTONE CODE HERE ───────────────────────────────────
//
// 2026-08-15: a "chasing a number tonight" strip was built here off a
// league-wide season-lines call, and then deleted the same day — because
// components/Storylines.js has done this since it shipped, and does it better:
// season AND career, nine stat families each, with per-target proximity
// windows (S_MILES / C_MILES) and it already reads as prose rather than as a
// row of tiles.
//
// Two surfaces computing "who is close to a number" is the exact failure mode
// this project keeps finding in other forms — two answers to one question,
// diverging quietly. The milestone lives in Storylines. If it needs more
// targets, they go in S_MILES.


// ── 🗓️ HISTORICAL BOARDS, OUT OF THE SITE'S OWN GRADED ARCHIVE ──────────────
//
// WHY (2026-08-16, Donovan: "i think i still dont see the historical things on
// leaders"). He had raised it once before and the answer given was structural
// — "there's no separate historical page, Leaders carries its own lenses" —
// which answered a question he wasn't asking. Everything else on this page,
// season line included, is a ranking of the people playing TONIGHT. He wants
// leaderboards over TIME. The site already owns a history: the nightly graded
// files the bot publishes. This reads them.
//
// FOUR THINGS THIS CODE HAS TO GET RIGHT, each guarding a real failure:
//
// 1. DEDUPE WHEN THE SUBJECT IS A PLAYER (lib/graded.js is the authority).
//    The graded file is ONE ROW PER PICK CATEGORY, and every one of a hitter's
//    rows carries the SAME actual line. Summing actual_hr over raw slots gives
//    the man designated TOP *and* HR two homers for one swing, and he walks
//    straight to the top of a "most homers" board on nothing but being picked
//    twice. So the homer / big-night pass runs over dedupeGraded(). The
//    pick-rate pass does NOT dedupe: two designations are two bars to clear,
//    which is a question about PICKS.
//
// 2. THREE OUTCOMES, NOT TWO. pickCleared() returns true / false / null, and
//    null (0 AB — scratched, pinch-run for, game postponed) is a VOID, not a
//    miss. Voids are counted and shown, and they are in NO denominator. Rows
//    the file hasn't finalised are 'pending' and are likewise out of both.
//    A hitter with no row at all that night is UNTRACKED — he simply isn't in
//    that night's numbers, and never a zero.
//
// 3. EVERY RATE PRINTS ITS DENOMINATOR, and no rate is RANKED below
//    HIST_MIN_PICKS judged picks. A 3-for-4 sorts above a 40-for-70 and means
//    nothing; the minimum is stated on screen next to the board.
//
// 4. FETCH BUDGET. A graded night is a 0.4–1.1 MB file. Nothing here is
//    fetched on page load: the caller asks for HIST_FIRST nights on a click,
//    and can extend to HIST_MAX, which only fetches the dates not already
//    held. Every date is cached for the session, so re-opening the tab, or
//    extending the window, never re-downloads a night.
//
// Missing dates are normal — the branch keeps a rolling window and the archive
// has gaps. A date that 404s or fails is dropped from the window and the
// window says how many were dropped. It never zeroes anybody.

// 7 first, 14 on request. Chosen against the file size: seven nights is ~5 MB
// and enough for counts to mean something; the published branch only carries
// about twenty dates anyway, so there is no honest thirty-day board to build.
export const HIST_FIRST = 7
export const HIST_MAX = 14

// Minimum JUDGED picks before a hit rate is ranked. Below it a player is kept
// out of the rate board entirely rather than shown with a percentage — the
// point of a minimum is that thin rows don't sort to the top.
//
// AND A MINIMUM NUMBER OF NIGHTS, which is the less obvious half. A hitter can
// hold five or six designations on ONE night (TOP + TOP15 + HR + HRR + CONTACT
// happens), and all of them grade off the SAME line — so one big game could
// put a 6/6 at the head of the board off a single swing. A picks minimum alone
// does not catch that; the outcomes are perfectly correlated. Requiring three
// separate nights means the rate is at least three independent games.
//
// Measured against twenty real graded files: over a 7-night window 23 hitters
// clear 6 judged picks, so the board fills without being fed by flukes.
export const HIST_MIN_PICKS = 6
export const HIST_MIN_NIGHTS = 3

const num = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0 }

// TOP15 is a ranked TOP slot and grades on a homer like TOP does; TB is the
// older name for CONTACT. Anything unrecognised returns null and that row is
// counted as tracked-but-not-designated rather than guessed at.
const ROLE_OF = {
  TOP15: 'TOP', TOP: 'TOP', HR: 'HR', HIT: 'HIT', HRR: 'HRR', CONTACT: 'CONTACT', TB: 'CONTACT',
}
const roleOf = (s) =>
  ROLE_OF[String(s?.game_pick_role || s?.pick_type || '').split('/')[0].trim().toUpperCase()] || null

// The graded file speaks actual_*; pickCleared speaks the live box line.
const lineOf = (s) => ({
  ab: num(s?.actual_ab), h: num(s?.actual_hits), hr: num(s?.actual_hr),
  tb: num(s?.actual_tb), r: num(s?.actual_runs), rbi: num(s?.actual_rbi),
})

// The last `nights` calendar dates, most recent first, ENDING YESTERDAY.
//
// Today is excluded on purpose: today's graded file exists from first pitch and
// is still filling in, so folding it into a window would mix half-played games
// with finished ones and quietly depress every rate. Anchored at noon UTC
// (same trick as StaleBanner) so a DST boundary can't skip or repeat a day.
export function historyDates(nights, from = new Date().toLocaleDateString('en-CA')) {
  const t0 = new Date(`${from}T12:00:00Z`).getTime()
  if (!Number.isFinite(t0)) return []
  const out = []
  for (let k = 1; k <= Math.max(0, nights); k++) {
    out.push(new Date(t0 - k * 864e5).toISOString().slice(0, 10))
  }
  return out
}

// date → Promise<{date, json}>. Session cache, and the reason extending the
// window is cheap: only the dates nobody has asked for yet cost a request.
const _nights = new Map()

export function fetchGradedNight(date) {
  const hit = _nights.get(date)
  if (hit) return hit
  const p = fetch(gradedResultsUrl(date))
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null)
    .then((json) => {
      // A MISS IS NOT CACHED. A 404 (no file for that date) and a dropped
      // connection are indistinguishable here, and pinning the failure would
      // mean one flaky moment silently shrinks the window for the rest of the
      // session. Re-asking costs one cheap 404 for the dates that truly have
      // no file; that is the better side to err on.
      if (!json) _nights.delete(date)
      return { date, json }
    })
  _nights.set(date, p)
  return p
}

// Small concurrency pool. Seven megabyte-scale files fired at once is a lot of
// simultaneous parsing on a phone; three at a time is not noticeably slower and
// keeps the tab responsive while they land.
async function pool(items, width, fn) {
  const out = new Array(items.length)
  let i = 0
  await Promise.all(Array.from({ length: Math.min(width, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]) }
  }))
  return out
}

const _agg = new Map()

/**
 * Historical leaderboards over the last `nights` graded nights.
 *
 * → null if not one night in the window could be read (the caller says so
 *   rather than rendering empty boards, which would read as "nobody homered").
 * → otherwise:
 *
 *   window   { nights asked, dates tried, loaded, missing, from, to }
 *   totals   { players, picks, judged, cleared, voids, pending }
 *   homers      most home runs        — count, with nights-on-the-sheet beside it
 *   rate        best pick hit rate    — k/n, min HIST_MIN_PICKS judged picks
 *                                       across at least HIST_MIN_NIGHTS nights
 *   designated  most often picked     — nights designated, and total pick slots
 *   bigNights   biggest single nights — one player-night each, by total bases
 */
export async function gradedHistory(nights = HIST_FIRST) {
  const key = Math.max(1, Math.min(HIST_MAX, Math.round(nights)))
  const hit = _agg.get(key)
  if (hit) return hit
  const p = buildHistory(key).catch(() => null)
  _agg.set(key, p)
  // An all-failed window is not worth remembering — drop it so the button can
  // be pressed again after the connection comes back.
  p.then((v) => { if (!v) _agg.delete(key) })
  return p
}

async function buildHistory(nights) {
  const dates = historyDates(nights)
  const got = await pool(dates, 3, fetchGradedNight)
  const loaded = got.filter((g) => g?.json)
  if (!loaded.length) return null

  const byPid = new Map()
  const bigNights = []
  const seenNight = new Set()   // `${date}:${pid}` — so a night counts once
  const totals = { players: 0, picks: 0, judged: 0, cleared: 0, voids: 0, pending: 0 }

  const of = (s) => {
    const pid = Number(s?.player_id)
    if (!Number.isFinite(pid) || !pid) return null
    let p = byPid.get(pid)
    if (!p) {
      p = {
        pid, name: String(s?.name || '?'), team: String(s?.team || ''),
        nights: 0, hr: 0, hrNights: 0,
        pickNights: 0, picks: 0, judged: 0, cleared: 0, voids: 0, pending: 0,
      }
      byPid.set(pid, p)
    }
    return p
  }

  loaded.forEach(({ date, json }) => {
    const slots = gradedSlots(json)

    // ── PLAYER PASS — DEDUPED. Counting homers per player is the textbook
    // case from lib/graded.js: two pick rows, one bat, one homer.
    dedupeGraded(slots).forEach((s) => {
      const p = of(s)
      if (!p) return
      const l = lineOf(s)
      p.nights += 1
      p.hr += l.hr
      if (l.hr > 0) p.hrNights += 1
      // A player-night is only a "big night" if he actually batted. The board
      // ranks on total bases, which is the one line that separates a real
      // night (4 TB) from a busy-looking one (3 singles).
      if (l.ab > 0 && l.tb > 0) {
        bigNights.push({
          pid: p.pid, name: p.name, team: String(s?.team || p.team), date,
          opp: String(s?.opponent || ''),
          hr: l.hr, tb: l.tb, h: l.h, r: l.r, rbi: l.rbi, ab: l.ab,
        })
      }
    })

    // ── PICK PASS — NOT DEDUPED. Each row is one designation with its own
    // bar, so a hitter picked TOP and HR on the same night is two picks with
    // two chances to clear. Deduping here would erase half the card.
    slots.forEach((s) => {
      const role = roleOf(s)
      if (!role) return
      const p = of(s)
      if (!p) return
      const k = `${date}:${p.pid}`
      if (!seenNight.has(k)) { seenNight.add(k); p.pickNights += 1 }
      p.picks += 1
      totals.picks += 1
      // Not finalised — a suspended or still-running game. Not a result yet,
      // so it sits in neither the numerator nor the denominator.
      if (Number(s?.is_final) !== 1) { p.pending += 1; totals.pending += 1; return }
      const v = pickCleared(role, lineOf(s))
      if (v === null) { p.voids += 1; totals.voids += 1; return }   // VOID ≠ loss
      p.judged += 1
      totals.judged += 1
      if (v) { p.cleared += 1; totals.cleared += 1 }
    })
  })

  const list = [...byPid.values()]
  totals.players = list.length

  const dts = loaded.map((g) => g.date).sort()
  return {
    window: {
      nights, tried: dates.length, loaded: loaded.length,
      missing: dates.length - loaded.length,
      from: dts[0] || '', to: dts[dts.length - 1] || '',
    },
    totals,
    homers: list.filter((p) => p.hr > 0)
      .sort((a, b) => b.hr - a.hr || b.hrNights - a.hrNights || a.nights - b.nights)
      .slice(0, 10),
    rate: list.filter((p) => p.judged >= HIST_MIN_PICKS && p.pickNights >= HIST_MIN_NIGHTS)
      .sort((a, b) => (b.cleared / b.judged) - (a.cleared / a.judged) || b.judged - a.judged)
      .slice(0, 10),
    designated: list.filter((p) => p.picks > 0)
      .sort((a, b) => b.pickNights - a.pickNights || b.picks - a.picks)
      .slice(0, 10),
    bigNights: bigNights.sort((a, b) => b.tb - a.tb || b.hr - a.hr || b.rbi - a.rbi).slice(0, 8),
  }
}
