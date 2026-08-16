// BULLPEN FATIGUE — who threw yesterday, per team (2026-08-07, Donovan:
// "those people give up home runs all the time").
//
// One schedule call for yesterday + one boxscore per game. Relievers are
// pitchers with gamesStarted 0 and pitches thrown; the starter is excluded —
// his workload doesn't tax tonight's pen. Fields verified live 2026-08-07 on
// game 824804: stats.pitching.numberOfPitches, gamesStarted, inningsPitched
// all present. Context lane only; nothing here feeds a score.
//
// Tiers (workload, not magic):
//   🥵 GASSED  4+ relievers used OR 65+ reliever pitches yesterday
//   😮‍💨 WORKED  3+ relievers OR 45+ pitches
//   fresh      everything else — not shown, absence of a flag is the info

const SCHED = 'dates,games,gamePk,teams,home,away,team,id'
const BOX = 'teams,home,away,team,id,players,person,fullName,stats,pitching,numberOfPitches,gamesStarted,inningsPitched'

let _cache = null // { dateKey, byTeamId }

export async function fetchPenFatigue() {
  const y = new Date(Date.now() - 24 * 3600 * 1000).toLocaleDateString('en-CA')
  if (_cache?.dateKey === y) return _cache.byTeamId

  const sched = await fetch(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${y}&fields=${SCHED}`)
    .then((r) => (r.ok ? r.json() : null)).catch(() => null)
  const games = (sched?.dates?.[0]?.games || [])
  if (!games.length) { _cache = { dateKey: y, byTeamId: {} }; return {} }

  const byTeamId = {}
  await Promise.all(games.map(async (g) => {
    const box = await fetch(`https://statsapi.mlb.com/api/v1/game/${g.gamePk}/boxscore?fields=${BOX}`)
      .then((r) => (r.ok ? r.json() : null)).catch(() => null)
    if (!box?.teams) return
    ;['home', 'away'].forEach((side) => {
      const teamId = box.teams[side]?.team?.id ?? g?.teams?.[side]?.team?.id
      if (!teamId) return
      const relievers = []
      Object.values(box.teams[side]?.players || {}).forEach((pl) => {
        const pit = pl?.stats?.pitching
        if (!pit || pit.numberOfPitches == null) return
        const pitches = Number(pit.numberOfPitches) || 0
        if (pitches <= 0) return
        if (Number(pit.gamesStarted) >= 1) return // the starter, excluded
        // Bulk-innings guard (found in the verified payload: a 153-pitch
        // 9.0 IP line carrying gamesStarted 0). 4+ IP is a starter's night
        // whatever the flag says — it doesn't tax the short relievers.
        if (parseFloat(pit.inningsPitched || '0') >= 4) return
        relievers.push({ name: pl?.person?.fullName || '?', pitches })
      })
      if (!relievers.length) return
      relievers.sort((a, b) => b.pitches - a.pitches)
      const t = byTeamId[teamId] || (byTeamId[teamId] = { used: 0, pitches: 0, names: [] })
      t.used += relievers.length
      t.pitches += relievers.reduce((a, r) => a + r.pitches, 0)
      t.names.push(...relievers)
    })
  }))
  Object.values(byTeamId).forEach((t) => { t.names = t.names.sort((a, b) => b.pitches - a.pitches).slice(0, 4) })
  _cache = { dateKey: y, byTeamId }
  return byTeamId
}

// ── penStatsFor — the missing export that broke the Games page ──────────────
// (2026-08-08). ProjectedOutput's Adj HR column (commit 218ba04) imports
// penStatsFor from this module, but that commit never carried the lib file —
// and when this file was created fresh for the fatigue work it exported
// different names, so the Games tab crashed on a client-side exception.
// This is the real implementation: each team's RELIEVER-ONLY season HR/9
// from the StatsAPI statSplits sitCode 'rp' (verified live 2026-08-08 —
// all 30 teams carry homeRunsPer9/homeRuns/inningsPitched). Returns a Map
// keyed by TEAM ABBREVIATION (what ProjectedOutput looks up by), cached for
// the session.
import { teamAbbrs } from './gamelogs'

let _penStats = null
export async function penStatsFor() {
  if (_penStats) return _penStats
  const [j, abbrs] = await Promise.all([
    fetch("https://statsapi.mlb.com/api/v1/teams/stats?season=" + new Date().getFullYear() +
          "&group=pitching&stats=statSplits&sitCodes=rp&sportIds=1&fields=stats,splits,team,id,stat,homeRunsPer9,inningsPitched,homeRuns")
      .then((r) => (r.ok ? r.json() : null)).catch(() => null),
    teamAbbrs().catch(() => null),
  ])
  const m = new Map()
  ;(j?.stats?.[0]?.splits || []).forEach((sp) => {
    const ab = abbrs?.[sp?.team?.id]
    if (!ab) return
    m.set(String(ab).toUpperCase(), {
      hr9: parseFloat(sp?.stat?.homeRunsPer9) || null,
      hr: Number(sp?.stat?.homeRuns) || 0,
      ip: sp?.stat?.inningsPitched || '',
    })
  })
  if (m.size) _penStats = m
  return m
}

export function penTier(t) {
  if (!t) return null
  if (t.used >= 4 || t.pitches >= 65) return { key: 'gassed', icon: '🥵', word: 'PEN GASSED', col: '#f87171' }
  if (t.used >= 3 || t.pitches >= 45) return { key: 'worked', icon: '😮‍💨', word: 'pen worked', col: '#FCD34D' }
  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// 🚪 THE PEN'S PUBLISHED LINE — the other half of the board (2026-08-15)
// ─────────────────────────────────────────────────────────────────────────────
//
// Donovan: "fill like more things can be now wiether about the bull pen
// piutcher or..." — so, the pen.
//
// WHAT WAS WRONG BEFORE. The bullpen board on the Pitchers page was ONE number
// wide: reliever-only HR/9 off the StatsAPI split above, a bar drawn from it,
// and a fatigue tag. Meanwhile the slate itself publishes a whole bullpen block
// on every one of 266 rows — bullpen_era, bullpen_whip, bullpen_hr9,
// bullpen_quality, bullpen_attack_score and a per-hitter bullpen_pitch_fit —
// and not one of those six appeared anywhere on the page. A pen with a 3.15 ERA
// and a pen with a 5.38 ERA sat on the board looking identical because neither
// number was drawn.
//
// WHOSE PEN IS IT. On a hitter's slate row the bullpen_* block describes the
// pen of the team he is FACING. Verified against the live payload: the values
// are constant per (game_pk, batting team) and DIFFERENT on the two sides of
// the same game — COL's hitters carry SF's 4.08 pen while SF's hitters carry
// COL's 5.38 one. So reading the block off a starter's opposing lineup gives
// you the arms that come in behind HIM, which is exactly the question a hitter
// asks in the seventh.
//
// TWO SOURCES, SAID OUT LOUD. penStatsFor's HR/9 is a live StatsAPI
// reliever-only season split; these are the bot's own published pen numbers.
// They should agree and mostly do, but they are not the same pull, so the board
// labels which is which rather than blending them into one number nobody can
// trace.

const bnum = (v) => {
  const x = Number(v)
  return Number.isFinite(x) ? x : null
}

/** The published bullpen block off any slate row. Null when nothing is on it. */
export function penFrom(row) {
  if (!row) return null
  const p = {
    era: bnum(row.bullpen_era),
    hr9: bnum(row.bullpen_hr9),
    whip: bnum(row.bullpen_whip),
    quality: String(row.bullpen_quality ?? '').trim().toLowerCase(),
    attack: bnum(row.bullpen_attack_score),
    fit: bnum(row.bullpen_pitch_fit),
  }
  const any = p.era != null || p.hr9 != null || p.whip != null || p.quality || p.attack != null
  return any ? p : null
}

/**
 * The pen as spoken clauses — same { key, text, tone, title } shape as
 * lib/conditions.js's airParts, so a caller strings them into a sentence
 * instead of laying out another row of little boxes.
 *
 * Tone is from the HITTER's side, like every other board here: 'hot' = good
 * news for the bat.
 *
 * @param pen  penFrom(row)
 * @param opts.attackRange [lo, hi] of bullpen_attack_score across tonight's
 *             slate, so the score can be read against its real spread instead
 *             of against an instinctive 0-100. Optional; the clause drops the
 *             comparison rather than inventing a scale.
 * @param opts.fitAvg / opts.fitN  average published bullpen_pitch_fit across
 *             the N hitters who will actually bat against this pen tonight.
 */
export function penLineParts(pen, opts = {}) {
  if (!pen) return []
  const out = []

  if (pen.quality) {
    out.push({
      key: 'quality',
      text: `the bot grades it a${/^[aeiou]/.test(pen.quality) ? 'n' : ''} ${pen.quality} pen`,
      tone: pen.quality === 'weak' ? 'hot' : pen.quality === 'strong' ? 'cold' : 'plain',
      title: 'bullpen_quality — the bot\'s own one-word grade on the relief corps behind this starter.',
    })
  }

  // ── ONE HR/9, NOT TWO (2026-08-16) ──────────────────────────────────────
  //
  // This board was printing the live StatsAPI reliever-only HR/9 (the bar) AND
  // the slate's published bullpen_hr9 in the sentence beside it, labelled as
  // two feeds measuring the same relievers. Honest, and Donovan's answer when
  // asked whether he wanted one number was "yes".
  //
  // The LIVE split wins and this sentence drops its copy. Reason: the bar is
  // the thing being ranked and coloured, so the number that must agree with
  // the ranking is the one the ranking is built from — and the live pull is
  // reliever-only by sitCode, which is exactly the population the claim is
  // about. Nothing is lost: `opts.liveHr9` lets the caller pass the live value
  // in so the clause still SAYS an HR/9, and the slate's own figure keeps its
  // labelled column in the big starter table (penHr9) where a reader who wants
  // to compare the two feeds can still do so.
  const rates = []
  if (pen.era != null) rates.push(`a ${pen.era.toFixed(2)} ERA`)
  if (pen.whip != null) rates.push(`a ${pen.whip.toFixed(2)} WHIP`)
  const shownHr9 = Number.isFinite(opts.liveHr9) ? opts.liveHr9 : (opts.suppressHr9 ? null : pen.hr9)
  if (shownHr9 != null) rates.push(`${shownHr9.toFixed(2)} HR/9`)
  if (rates.length) {
    out.push({
      key: 'rates',
      text: `${rates.length > 1 ? `${rates.slice(0, -1).join(', ')} and ${rates[rates.length - 1]}` : rates[0]} on the season`,
      tone: shownHr9 != null && shownHr9 >= 1.25 ? 'hot' : shownHr9 != null && shownHr9 <= 0.95 ? 'cold' : 'plain',
      title: 'bullpen_era and bullpen_whip as published on the slate row; the HR/9 is the live reliever-only split the bar is built from, so the sentence and the bar can never disagree. ERA and WHIP are new to this board — it used to show HR/9 alone, which cannot tell a pen that walks the yard from one that simply gives up the odd homer.',
    })
  }

  if (pen.attack != null) {
    const r = opts.attackRange
    const spread = Array.isArray(r) && r.length === 2 && r[1] > r[0]
    out.push({
      key: 'attack',
      text: `bullpen attack score ${pen.attack.toFixed(0)}${spread ? ` on tonight's ${Math.round(r[0])}–${Math.round(r[1])} spread` : ''}`,
      tone: spread && pen.attack >= r[0] + (r[1] - r[0]) * 0.66 ? 'hot'
        : spread && pen.attack <= r[0] + (r[1] - r[0]) * 0.33 ? 'cold' : 'plain',
      title: 'bullpen_attack_score — the bot\'s 0-100 rating of how attackable the pen is. A SCORE, not a chance of anything, and it does not run the full 0-100 in practice, so it is quoted against tonight\'s actual spread.',
    })
  }

  if (opts.fitAvg != null && Number.isFinite(opts.fitAvg)) {
    out.push({
      key: 'fit',
      text: `the ${opts.fitN ? `${opts.fitN} bats` : 'bats'} due to face it average ${Math.round(opts.fitAvg)} on pitch fit against it`,
      tone: opts.fitAvg >= 70 ? 'hot' : opts.fitAvg <= 45 ? 'cold' : 'plain',
      title: 'Mean of the published per-hitter bullpen_pitch_fit across the lineup that will bat against this pen — how well those swings match what the relievers throw. Each hitter\'s own number is on his card; this is the average of them, nothing modelled.',
    })
  }

  return out
}

/**
 * Yesterday's workload as clauses — including the honesty case.
 *
 * A MISSING LOG IS NOT REST, and this survives every rewrite of the board: no
 * boxscore for a club yesterday means an off day OR a feed that hasn't landed,
 * and the two are indistinguishable from here. It is never spoken as "fresh"
 * and never sorted as if it were.
 */
export function penWorkParts(fat) {
  if (!fat) {
    return [{
      key: 'nolog',
      text: 'nothing was logged for their relievers yesterday — an off day, or a boxscore that has not landed',
      tone: 'plain',
      title: 'No reliever line found in yesterday\'s boxscores for this club. That is unknown workload, NOT confirmed rest, so it is never ranked as if it were rested.',
    }]
  }
  const out = []
  const tier = penTier(fat)
  out.push({
    key: 'work',
    text: `yesterday ${fat.used} reliever${fat.used === 1 ? '' : 's'} threw ${fat.pitches} pitches${tier ? ` — ${tier.word.toLowerCase()}` : ', under both fatigue thresholds'}`,
    tone: tier?.key === 'gassed' ? 'hot' : tier?.key === 'worked' ? 'plain' : 'cold',
    title: 'Counted off yesterday\'s boxscores: pitchers with gamesStarted 0, under 4 IP, who actually threw. 🥵 GASSED is 4+ arms or 65+ pitches; 😮‍💨 worked is 3+ arms or 45+ pitches.',
  })
  const top = (fat.names || []).filter((x) => x?.pitches > 0).slice(0, 3)
  if (top.length) {
    out.push({
      key: 'arms',
      text: `the heaviest were ${top.map((x) => `${x.name} at ${x.pitches}`).join(', ')}`,
      tone: 'plain',
      title: 'The individual relievers who carried yesterday\'s load, by pitch count — collected already by fetchPenFatigue and never shown until now. A pen is not one thing: which arms are unavailable matters more than the team total.',
    })
  }
  return out
}

/** The workload clauses as one plain string, for tooltips. */
export function penWorkSentence(fat) {
  const parts = penWorkParts(fat).map((x) => x.text)
  if (!parts.length) return ''
  const s = parts.join('; ')
  return `${s.charAt(0).toUpperCase()}${s.slice(1)}.`
}
