// Reads JSON files and normalizes them into a flat player array.
// The bots' JSON can be shaped many ways (top-level players[], nested in games[], etc).
import { arr, obj, n, clean, nameOf, hrScore, hitScore, prodScore } from './player'

/**
 * Walk the candidate paths and take the first one that responds.
 *
 * A 200 IS NOT THE SAME AS A SLATE (2026-08-09 incident). The fallback list
 * exists precisely so a broken primary can be stepped over — and it never
 * could, because the only test was `r.ok`. Tonight's publish replaced
 * current/today_slim.json with a bare six-row array from a July 26 game in
 * Tampa. It returned 200, so it won, and current/today.json — sitting right
 * behind it with the real slate — was never asked for.
 *
 * Downstream that reads as the model having no opinion on anybody: every
 * homer on the live wire comes from the boxscore feed, finds no matching slate
 * row, and renders with no 🤖 tag. Which is exactly the report — "two people
 * who were on the bot that went, then later it says the bot didn't have them
 * at all."
 *
 * `validate` is optional so nothing else changes. When it's supplied, a
 * response has to look like the thing we asked for before it's accepted. If
 * NOTHING validates, the first 200 is returned anyway — a degraded page beats
 * a blank one, and StaleBanner is what tells the reader which they're getting.
 */
export async function fetchJSON(paths, validate = null) {
  let fallback = null
  for (const p of paths) {
    try {
      const url = `${p}${p.includes('?') ? '&' : '?'}t=${Date.now()}`
      const r = await fetch(url, { cache: 'no-store' })
      if (!r.ok) continue
      const j = await r.json()
      if (!validate) return j
      if (validate(j)) return j
      if (fallback === null) fallback = j
    } catch {
      /* try next */
    }
  }
  return fallback
}

/**
 * Does this payload look like a night of baseball?
 *
 * Deliberately loose — it is a smoke test, not a schema. The smallest real
 * slate MLB plays is around four games, and every one of those carries both
 * lineups, so a genuine slate is never fewer than ~40 hitters or fewer than 3
 * distinct game_pks. The July 26 fragment was 6 rows across ONE game_pk and
 * fails both. A thin-but-real slate passes on either test alone.
 */
export function slateLooksReal(payload) {
  if (!payload) return false
  const rows = normalizeData(payload).players
  if (rows.length >= 40) return true
  const games = new Set(rows.map((r) => r?.game_pk).filter((x) => x != null))
  return games.size >= 3
}

/** Newest game_time in a payload, as YYYY-MM-DD, or ''. */
/**
 * ── A BASEBALL SLATE IS AN EASTERN CALENDAR DAY (fixed 2026-08-17) ──────────
 *
 * The old version did two things wrong, and together they moved the whole site
 * a day into the future for a large share of the planet:
 *
 *   1. It took the LATEST game_time on the slate. The last first pitch tonight
 *      is 2026-08-18T02:00Z.
 *   2. It formatted that instant in the VIEWER'S timezone via
 *      toLocaleDateString.
 *
 * So for anyone at UTC+0 or east of it, tonight's slate date came back
 * '2026-08-18' — tomorrow. Everything keyed on that comparison then treated a
 * live slate as a future one. That is why the Homer Ledger was invisible all
 * day no matter how many surfaces it was mounted on: HomerLedger's
 * `isTmrw = slateDate > today` was TRUE from the moment the page loaded, so it
 * returned null before any of its own logic ran. Donovan asked where that thing
 * was three separate times, and every one of those answers was wrong: it was
 * never a placement problem, it was this line.
 *
 * A slate is not defined by the viewer's midnight. It is defined by the North
 * American calendar day the games belong to — a 10:10pm PT first pitch is still
 * that day's baseball, and MLB's own schedule is keyed that way. So: bucket
 * every game by its date IN US EASTERN and take the most common one. Eastern via
 * Intl, not a fixed -4, so it stays correct across the DST boundary; the modal
 * date rather than the max so one late West-Coast game cannot drag the whole
 * slate forward the way the max did.
 */
const ET_FMT = (() => {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York',
      year: 'numeric', month: '2-digit', day: '2-digit',
    })
  } catch {
    return null      // ancient engine with no tz data: fall back below
  }
})()

/** 'YYYY-MM-DD' for an instant, in US Eastern. */
export function easternDate(ms) {
  const t = Number(ms)
  if (!Number.isFinite(t) || !t) return ''
  if (ET_FMT) {
    // en-CA gives YYYY-MM-DD directly, but normalise anyway rather than trust it.
    const parts = ET_FMT.formatToParts(new Date(t))
    const get = (k) => (parts.find((p) => p.type === k) || {}).value || ''
    const y = get('year'); const m = get('month'); const d = get('day')
    if (y && m && d) return `${y}-${m}-${d}`
  }
  // No tz database. -4 is wrong for five months of the year, but it is far
  // closer than the viewer's own offset and never lands a day ahead for the
  // Eastern-and-west audience this site is for.
  return new Date(t - 4 * 3600 * 1000).toISOString().slice(0, 10)
}

/** Today's slate date, in the same Eastern frame — for comparing against. */
export function easternToday() {
  return easternDate(Date.now())
}

export function slateDateFromRows(payload) {
  const rows = normalizeData(payload || {}).players
  const counts = new Map()
  rows.forEach((r) => {
    const t = new Date(r?.game_time || 0).getTime()
    if (!Number.isFinite(t) || !t) return
    const d = easternDate(t)
    if (d) counts.set(d, (counts.get(d) || 0) + 1)
  })
  if (!counts.size) return ''
  let bestDate = ''
  let bestN = -1
  // Ties break toward the EARLIER date: a slate split evenly across a midnight
  // is the earlier day's slate, because that is the day it started.
  for (const d of [...counts.keys()].sort()) {
    const n = counts.get(d)
    if (n > bestN) { bestN = n; bestDate = d }
  }
  return bestDate
}

/**
 * The slate date a payload claims: its own date/slate_date field first, the
 * modal Eastern game date second. Same order Dashboard already used inline --
 * lifted out so the guard below and the banner cannot disagree about which
 * night a payload is.
 */
export function slateDateOf(payload) {
  if (!payload) return ''
  return clean(obj(payload).date || obj(payload).slate_date, '') || slateDateFromRows(payload)
}

/**
 * ── THE BOARD MUST NEVER GO BACKWARDS UNDER A READER (2026-08-22) ───────────
 *
 * All day the site flipped between tonight's games and last night's. The cause
 * was upstream: every bot workflow republishes the WHOLE data branch, and a
 * publisher that never built a slate (grading, hourly) would force-push its own
 * older copy of today_slim.json over one a Today run had just landed. The
 * branch itself alternated, and the 45-second poll rendered whichever version
 * it happened to catch. Fixed in publish_data.sh; this is the site declining to
 * be where it shows up if it ever comes back.
 *
 * The rule is about ORDER only. An incoming payload dated EARLIER than the one
 * already on screen is a regression, never an update, so it is dropped and the
 * newer board stays. Everything else passes: the same date (an ordinary refresh
 * as lineups land), a later date (the rollover), or no date on either side --
 * nothing to judge on, so don't.
 *
 * A failed poll (null) also keeps what is on screen instead of blanking it.
 *
 * This is NOT a replacement for StaleBanner. On a cold load there is no newer
 * slate to hold onto, so a stale branch still renders -- and the banner is what
 * tells you which night you are looking at. This only stops a board that was
 * already correct from silently turning into yesterday's while you read it.
 */
export function keepNewerSlate(prev, next) {
  if (!next) return prev
  if (!prev) return next
  const a = slateDateOf(prev)
  const b = slateDateOf(next)
  if (!a || !b) return next
  return b < a ? prev : next
}

function looksPlayerLike(v) {
  const o = obj(v)
  if (!o) return false
  return (
    !!(o.name || o.player || o.player_name) &&
    (o.hr_score !== undefined || o.hit_score !== undefined || o.hrr_score !== undefined || o.team || o.player_id)
  )
}

function uniqueBestByPlayer(players, scoreKey = 'hr_score', gameAware = false) {
  const by = {}
  arr(players).forEach((p) => {
    const base = clean(p?.player_id || p?.id || p?.name, '')
    if (!base) return
    const id = gameAware ? `${base}-${clean(p?.game_pk || p?.game_id || p?.game_time || p?.team, '')}` : base
    const score =
      scoreKey === 'hit_score' ? hitScore(p) :
      scoreKey === 'production_shape_score' ? prodScore(p) :
      n(p?.[scoreKey], 0)
    const prev = by[id]
    const prevScore = prev
      ? (scoreKey === 'hit_score' ? hitScore(prev) :
         scoreKey === 'production_shape_score' ? prodScore(prev) :
         n(prev?.[scoreKey], 0))
      : -Infinity
    if (!prev || score > prevScore) by[id] = p
  })
  return Object.values(by)
}

export function normalizeData(data) {
  if (Array.isArray(data)) data = { players: data }
  const d = obj(data)
  const players = []
  const add = (p, extra = {}) => {
    if (p && typeof p === 'object') players.push({ ...extra, ...p })
  }

  ;['players', 'all_players', 'player_pool', 'slate_players', 'rows', 'picks'].forEach((k) =>
    arr(d[k]).forEach((p) => add(p)),
  )

  arr(d.games).forEach((g) => {
    arr(g.players).forEach((p) =>
      add(p, {
        game_pk: g.game_pk,
        game_time: g.game_time,
        away: g.away,
        home: g.home,
        opponent: p?.opponent || (p?.team === g.away ? g.home : g.away),
      }),
    )
    arr(g.away_players).forEach((p) =>
      add(p, { game_pk: g.game_pk, game_time: g.game_time, away: g.away, home: g.home, opponent: g.home }),
    )
    arr(g.home_players).forEach((p) =>
      add(p, { game_pk: g.game_pk, game_time: g.game_time, away: g.away, home: g.home, opponent: g.away }),
    )
  })

  ;['top_picks', 'hr_picks', 'hit_picks', 'hrr_picks', 'contact_picks', 'top_board', 'hr_board', 'alt_looks'].forEach(
    (k) => arr(d[k]).forEach((p) => add(p)),
  )

  // Deep walk as a last resort if no obvious player array was found.
  function walk(x, depth = 0, extra = {}) {
    if (depth > 4 || !x) return
    if (Array.isArray(x)) {
      x.forEach((v) => walk(v, depth + 1, extra))
      return
    }
    if (typeof x !== 'object') return
    const local = { ...extra }
    if (x.game_pk) local.game_pk = x.game_pk
    if (x.game_time) local.game_time = x.game_time
    if (x.away) local.away = x.away
    if (x.home) local.home = x.home
    if (looksPlayerLike(x)) add(x, local)
    Object.entries(x).forEach(([k, v]) => {
      if (['weather', 'venue', 'pitcher', 'metadata'].includes(k)) return
      walk(v, depth + 1, local)
    })
  }
  if (!players.length) walk(d)

  const cleanPlayers = players.filter(looksPlayerLike)
  return { players: uniqueBestByPlayer(cleanPlayers, 'hr_score', true), meta: d }
}

export function groupGames(players) {
  const g = {}
  arr(players).forEach((p) => {
    const key = p?.game_pk || `${p?.team || ''}-${p?.opponent || ''}-${p?.game_time || ''}` || 'unknown-game'
    if (!g[key])
      g[key] = {
        game_pk: key,
        game_time: p?.game_time,
        away: p?.away || p?.team,
        home: p?.home || p?.opponent,
        lineup_confirmed: !!p?.lineup_confirmed,
        players: [],
      }
    if (p?.lineup_confirmed) g[key].lineup_confirmed = true
    g[key].players.push(p)
  })
  return Object.values(g).sort((a, b) => new Date(a.game_time || 0) - new Date(b.game_time || 0))
}

// One entry per unique starting pitcher today, with the full opposing
// lineup attached (sorted by lineup_spot) and the pitcher-level fields
// every hitter row already carries (pitcher_era, pitcher_hr9, pitcher_whip,
// pitcher_weak_side, weak_spot data is per-batter so it's attached to each
// lineup slot, not the pitcher object itself -- a weak spot is relative to
// a specific batter's hand, not a fixed pitcher attribute).
export function groupPitchers(players) {
  const byId = {}
  arr(players).forEach((p) => {
    const pid = p?.pitcher_id ?? p?.pitcher_name
    if (!pid) return
    if (!byId[pid]) {
      byId[pid] = {
        pitcher_id: p?.pitcher_id ?? null,
        pitcher_name: clean(p?.pitcher_name, 'Unknown'),
        pitcher_throws: clean(p?.pitcher_throws, '?'),
        pitcher_era: n(p?.pitcher_era, null),
        pitcher_hr9: n(p?.pitcher_hr9, null),
        pitcher_whip: n(p?.pitcher_whip, null),
        pitcher_weak_side: clean(p?.pitcher_weak_side, ''),
        team: clean(p?.opponent || p?.team, ''), // pitcher's OWN team is the batters' opponent
        opponent_team: clean(p?.team, ''),       // the team he's facing
        game_pk: p?.game_pk,
        game_time: p?.game_time,
        venue_name: clean(p?.venue_name, ''),
        lineup_confirmed: false,
        lineup: [],
      }
    }
    const entry = byId[pid]
    if (p?.lineup_confirmed) entry.lineup_confirmed = true
    entry.lineup.push({
      player_id: p?.player_id ?? p?.id,
      name: nameOf(p),
      bats: clean(p?.bats || p?.handedness, '?'),
      lineup_spot: n(p?.lineup_spot, null),
      lineup_confirmed: !!p?.lineup_confirmed,
      weak_spot_flag: p?.weak_spot_flag === true,
      weak_spot_reason: clean(p?.weak_spot_reason, ''),
      pitch_type_match_score: n(p?.pitch_type_match_score, 0),
      hr_score: hrScore(p),
      raw: p,
    })
  })
  return Object.values(byId)
    .map((entry) => ({
      ...entry,
      lineup: entry.lineup.sort((a, b) => (a.lineup_spot ?? 99) - (b.lineup_spot ?? 99)),
      weak_spot_count: entry.lineup.filter((b) => b.weak_spot_flag).length,
    }))
    .sort((a, b) => new Date(a.game_time || 0) - new Date(b.game_time || 0))
}
