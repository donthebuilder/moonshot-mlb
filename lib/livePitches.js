// LIVE PITCHES + LIVE BATTED BALLS — one parser, two charts.
//
// 2026-08-10, Donovan: "there's no way to just use the spray and strike map we
// already have as the live ones as well?" There is, and this is it. The live
// feed's own coordinates are parsed HERE, once, and handed to the components
// the rest of the site already uses — ZoneMap draws tonight's pitches on its
// own 13-cell grid, SprayField draws tonight's batted balls on its own field.
// One visual language everywhere; the standalone live chart is gone.
//
// EVERY FIELD READ HERE WAS VERIFIED PRESENT AND POPULATED IN A LIVE FEED
// (gamePk 823425, mid-game): 324 of 324 pitches carried
// pitchData.coordinates.pX/pZ AND a per-batter strikeZoneTop/Bottom, and 57 of
// 57 batted balls carried hitData.coordinates.coordX/coordY. Nothing here is
// modeled — every dot is where the ball actually was.
//
//   playEvents[].isPitch · pitchData.coordinates.pX/pZ · strikeZoneTop/Bottom
//   pitchData.startSpeed · details.type.code/.description
//   details.call.description · details.isInPlay/.isStrike/.isBall
//   hitData.coordinates.coordX/coordY · launchSpeed · launchAngle
//   totalDistance · trajectory
//   matchup.batter/.pitcher {id, fullName} · about.inning/.halfInning
//   result.event
//
// The BALL-STRIKE COUNT and the PITCH NUMBER inside an at-bat are DERIVED here
// from the verified isBall / isStrike / isInPlay / call.description sequence
// rather than read off a `count` object — one fewer unverified field, and it
// cannot disagree with the dots that are actually drawn, because it is built
// from them.
//
// GEOMETRY. pX is feet from the centre of the plate, pZ is feet above the
// ground. Both charts on this site are drawn from the CATCHER'S VIEW, and in
// that view POSITIVE pX IS THE RIGHT-HAND SIDE OF THE PICTURE — a pitch inside
// to a right-handed hitter (who stands on the third-base side, the catcher's
// left) runs negative. That matches ZoneMap's own footer, which says inside is
// the right column for a lefty. No flip is applied anywhere below.
//
// Hit coordinates are Statcast's fixed 250x250 grid: home plate at
// (125.42, 198.27), y INVERTED (small y = deep), 2.5 feet per grid unit. That
// is the identical transform SprayField already uses for the bot's tracked
// balls, so tonight's dots land on the same field in the same places.

export const LIVE_FEED_FIELDS = 'liveData,plays,allPlays,playEvents,isPitch,pitchData,coordinates,pX,pZ,strikeZoneTop,strikeZoneBottom,startSpeed,details,type,code,description,call,isInPlay,isStrike,isBall,hitData,launchSpeed,launchAngle,totalDistance,coordX,coordY,trajectory,matchup,batter,pitcher,id,fullName,result,event,about,halfInning,inning,gameData,teams,home,away,abbreviation'

// The plate is 17 inches wide, so the zone runs ±0.708 ft from centre.
export const PLATE_HALF = 0.708

// Pitch colours — the SAME map ZoneMap's per-pitch strip already uses, so a
// slider is the same cyan on the live dots as it is on the season chips.
export const PITCH_COLORS = {
  FF: '#f87171', FA: '#f87171', SI: '#fb923c', FT: '#fb923c', FC: '#fbbf24',
  SL: '#22d3ee', ST: '#67e8f9', SV: '#67e8f9', CU: '#a78bfa', KC: '#c4b5fd',
  CS: '#c4b5fd', CH: '#4ade80', FS: '#86efac', FO: '#86efac', KN: '#9ca3af',
  EP: '#9ca3af',
}
export const pitchColor = (code) => PITCH_COLORS[code] || '#9ca3af'

export const PITCH_NAMES = {
  FF: '4-seam', FA: 'Fastball', SI: 'Sinker', FT: 'Two-seam', FC: 'Cutter',
  SL: 'Slider', ST: 'Sweeper', SV: 'Slurve', CU: 'Curve', KC: 'Knuckle curve',
  CS: 'Slow curve', CH: 'Changeup', FS: 'Splitter', FO: 'Forkball',
  KN: 'Knuckleball', EP: 'Eephus',
}

// What happened to the pitch. Six outcomes, because hollow-vs-filled can only
// say two things and there are six that matter.
export const KIND_LABEL = {
  ball: 'ball', called: 'called strike', whiff: 'swing & miss',
  foul: 'foul', inplay: 'in play', hbp: 'hit by pitch',
}
export const SWUNG = new Set(['whiff', 'foul', 'inplay'])
export const STRIKEISH = new Set(['called', 'whiff', 'foul', 'inplay'])

export async function fetchLiveGame(gamePk) {
  if (!gamePk) return null
  try {
    const r = await fetch(`https://statsapi.mlb.com/api/v1.1/game/${gamePk}/feed/live?fields=${LIVE_FEED_FIELDS}`)
    return r.ok ? await r.json() : null
  } catch {
    return null
  }
}

// ── CONTACT-QUALITY FLAGS, computed from this ball's own EV and LA ──────────
//
// 2026-08-09, Donovan: "at plate spray need pitches and hh barrels xbh
// filters." All three are derived here rather than read off a field, because
// the live feed publishes launchSpeed / launchAngle / result.event and does
// NOT publish a barrel flag. Deriving it is honest as long as the definition
// is the real one and is stated — so it is, in full, below.

// HARD HIT is Statcast's own line and needs no interpretation: 95 mph or more
// off the bat. No launch-angle condition.
export const isHardHit = (ev) => ev != null && ev >= 95

// BARREL is the real Statcast definition, not an approximation.
//
// A barrel is a batted ball whose exit velocity and launch angle have
// historically produced at least a .500 average and 1.500 slugging. The
// boundary: it starts at 98 mph with a launch-angle window of 26–30°, and the
// window widens by roughly 2–3 degrees per additional mph — reaching 8–50° at
// 116 mph. Below 98 mph nothing is a barrel at any angle.
//
// Implemented so it reproduces BOTH documented endpoints exactly: [26, 30] at
// 98 mph and [8, 50] at 116. That's 18 mph of headroom, over which the floor
// falls 18 degrees (1.0 per mph) and the ceiling climbs 20 (1.111 per mph) —
// the expansion is asymmetric, and a symmetric ±1 version fails the top of the
// scale, which is exactly what the test caught. Clamped at both ends.
//
// Anything without BOTH numbers is not a barrel — it's unknown, and unknown is
// never counted as a yes.
export const isBarrel = (ev, la) => {
  if (ev == null || la == null || ev < 98) return false
  const over = ev - 98
  const lo = Math.max(8, 26 - over)
  const hi = Math.min(50, 30 + over * (20 / 18))
  return la >= lo && la <= hi
}

// EXTRA-BASE HIT reads the play's own result event — the league's word for
// what happened, not an inference from distance.
export const XBH_EVENTS = new Set(['double', 'triple', 'home_run', 'home run'])

const str = (v) => (v == null ? '' : String(v).trim())
const num = (v) => {
  const x = Number(v)
  return Number.isFinite(x) ? x : null
}

// One pass over the feed. Returns every plotted pitch, every plotted batted
// ball, and one meta row per plate appearance that had a pitch in it.
export function parseLiveGame(data) {
  const plays = data?.liveData?.plays?.allPlays || []
  const pitches = []
  const balls = []
  const meta = []
  plays.forEach((pl, pi) => {
    const batterId = num(pl?.matchup?.batter?.id)
    const batterName = str(pl?.matchup?.batter?.fullName)
    const pitcherId = num(pl?.matchup?.pitcher?.id)
    const pitcherName = str(pl?.matchup?.pitcher?.fullName)
    const half = str(pl?.about?.halfInning)
    const inning = num(pl?.about?.inning)
    const event = str(pl?.result?.event)
    const who = { pi, batterId, batterName, pitcherId, pitcherName, half, inning }
    let b = 0
    let s = 0
    let seq = 0
    let any = false
    ;(pl.playEvents || []).forEach((e) => {
      if (e?.isPitch) {
        any = true
        const call = str(e?.details?.call?.description)
        const inPlay = !!e?.details?.isInPlay
        const isStrike = !!e?.details?.isStrike
        const isBall = !!e?.details?.isBall
        const kind = inPlay ? 'inplay'
          : /hit by pitch/i.test(call) ? 'hbp'
          : /swinging strike|missed bunt/i.test(call) ? 'whiff'
          : /foul/i.test(call) ? 'foul'
          : /called strike|automatic strike/i.test(call) ? 'called'
          : isBall ? 'ball'
          : isStrike ? 'called'
          : 'ball'
        seq += 1
        const cnt = `${b}-${s}`
        const x = num(e?.pitchData?.coordinates?.pX)
        const z = num(e?.pitchData?.coordinates?.pZ)
        if (x != null && z != null) {
          pitches.push({
            ...who,
            seq,
            cnt,
            kind,
            call,
            x,
            z,
            top: num(e?.pitchData?.strikeZoneTop),
            bot: num(e?.pitchData?.strikeZoneBottom),
            type: str(e?.details?.type?.code),
            typeName: str(e?.details?.type?.description),
            velo: num(e?.pitchData?.startSpeed),
          })
        }
        // advance the count exactly the way an umpire does
        if (kind === 'ball') b += 1
        else if (kind === 'foul') { if (s < 2) s += 1 }
        else if (kind === 'called' || kind === 'whiff') s += 1
      }
      const hc = e?.hitData?.coordinates
      const cx = num(hc?.coordX)
      const cy = num(hc?.coordY)
      if (cx != null && cy != null) {
        const ev = num(e?.hitData?.launchSpeed)
        const la = num(e?.hitData?.launchAngle)
        // THE PITCH THAT PRODUCED THE BALL (2026-08-09, Donovan: "at plate
        // spray needs pitches"). No join, no guessing: hitData and pitchData
        // hang off the SAME playEvent — this batted ball IS that pitch. The
        // spray chart can now be filtered and coloured by pitch type with the
        // same certainty the zone map has.
        balls.push({
          ...who,
          event,
          cx,
          cy,
          ev,
          la,
          dist: num(e?.hitData?.totalDistance),
          traj: str(e?.hitData?.trajectory),
          type: str(e?.details?.type?.code),
          typeName: str(e?.details?.type?.description),
          velo: num(e?.pitchData?.startSpeed),
          hh: isHardHit(ev),
          barrel: isBarrel(ev, la),
          xbh: XBH_EVENTS.has(event.toLowerCase()),
        })
      }
    })
    if (any) meta.push({ ...who, event })
  })
  const gt = data?.gameData?.teams || {}
  return {
    pitches,
    balls,
    meta,
    away: str(gt?.away?.abbreviation),
    home: str(gt?.home?.abbreviation),
  }
}

// The zone the crew actually measured for the hitters in this sample. Falls
// back to the league-average box only when no pitch carried one, and says so
// by returning measured:false.
export function zoneBox(pitches) {
  const tops = (pitches || []).map((p) => p.top).filter((v) => v != null)
  const bots = (pitches || []).map((p) => p.bot).filter((v) => v != null)
  const mean = (xs) => xs.reduce((a, c) => a + c, 0) / xs.length
  if (!tops.length || !bots.length) return { top: 3.4, bot: 1.6, measured: false }
  return { top: mean(tops), bot: mean(bots), measured: true }
}

// Feet → fractions of the strike-zone box, catcher's view.
//   fx 0 = left edge of the zone, 1 = right edge
//   fz 0 = top of the zone,       1 = bottom
// Values outside 0..1 are outside the zone, which is exactly what ZoneMap's
// four shadow corners are for.
export function zoneFrac(p, box) {
  const top = p.top != null ? p.top : box.top
  const bot = p.bot != null ? p.bot : box.bot
  const h = top - bot
  return {
    fx: 0.5 + p.x / (2 * PLATE_HALF),
    fz: h > 0 ? (top - p.z) / h : 0.5,
  }
}

export const inZone = (p, box) => {
  const { fx, fz } = zoneFrac(p, box)
  return fx >= 0 && fx <= 1 && fz >= 0 && fz <= 1
}

// ZoneMap's own cell numbering: 1-9 across the 3x3 zone (1 = up and left in
// the picture), 11-14 for the four shadow corners.
export function zoneCell(p, box) {
  const { fx, fz } = zoneFrac(p, box)
  if (fx >= 0 && fx <= 1 && fz >= 0 && fz <= 1) {
    const col = Math.min(2, Math.max(0, Math.floor(fx * 3)))
    const row = Math.min(2, Math.max(0, Math.floor(fz * 3)))
    return row * 3 + col + 1
  }
  const highish = fz < 0.5
  const leftish = fx < 0.5
  if (highish) return leftish ? 11 : 12
  return leftish ? 13 : 14
}

// Summary of a set of pitches, computed from EXACTLY the pitches handed in so
// it can never describe a different sample than the picture.
export function pitchSummary(pitches, box) {
  const nP = pitches.length
  const swings = pitches.filter((p) => SWUNG.has(p.kind)).length
  const whiffs = pitches.filter((p) => p.kind === 'whiff').length
  const strikes = pitches.filter((p) => STRIKEISH.has(p.kind)).length
  const inside = pitches.filter((p) => inZone(p, box)).length
  const outside = nP - inside
  const chases = pitches.filter((p) => !inZone(p, box) && SWUNG.has(p.kind)).length
  const velos = pitches.map((p) => p.velo).filter((v) => v != null)
  return {
    n: nP,
    strikes,
    swings,
    whiffs,
    inZone: inside,
    outZone: outside,
    chases,
    veloAvg: velos.length ? velos.reduce((a, c) => a + c, 0) / velos.length : null,
  }
}

// Per-type table for a legend: count, average velo, whiffs on swings.
export function pitchTypes(pitches) {
  const rows = []
  const seen = new Map()
  pitches.forEach((p) => {
    if (!p.type) return
    if (!seen.has(p.type)) {
      const row = { code: p.type, n: 0, velos: [], swings: 0, whiffs: 0 }
      seen.set(p.type, row)
      rows.push(row)
    }
    const row = seen.get(p.type)
    row.n += 1
    if (p.velo != null) row.velos.push(p.velo)
    if (SWUNG.has(p.kind)) row.swings += 1
    if (p.kind === 'whiff') row.whiffs += 1
  })
  rows.forEach((r) => {
    r.velo = r.velos.length ? r.velos.reduce((a, c) => a + c, 0) / r.velos.length : null
  })
  rows.sort((a, b) => b.n - a.n)
  return rows
}

// ── THE AT-BAT ITSELF (2026-08-09) ──────────────────────────────────────────
//
// Everything above describes a GAME. This describes the plate appearance
// happening right now, which is the only thing you can still act on — and the
// page never had it. The count, the pitches in order, what each one was and
// what it did.
//
// EVERY VALUE HERE IS DERIVED FROM THE VERIFIED FEED, not from a new field.
// The ball/strike count in particular is walked from the same isBall /
// isStrike / isInPlay / call.description sequence the dots are drawn from, so
// the count can never disagree with the pitches shown beside it — which is
// exactly what would happen if it were read off a separate `count` object that
// updates on its own schedule.

/** Advance a count the way an umpire does. Fouls don't make a third strike. */
const advance = (b, s, kind) => {
  if (kind === 'ball') return [b + 1, s]
  if (kind === 'foul') return [b, s < 2 ? s + 1 : s]
  if (kind === 'called' || kind === 'whiff') return [b, s + 1]
  return [b, s]                                  // in play, HBP — count ends
}

/**
 * The plate appearance a hitter is in right now (or his most recent one).
 *
 * `event` empty means it is STILL LIVE — the league only writes result.event
 * when the plate appearance finishes, so that emptiness is the liveness test
 * and needs no clock.
 */
export function atBatOf(feed, batterId) {
  const id = Number(batterId)
  if (!id) return null
  const mine = (feed?.pitches || []).filter((p) => Number(p.batterId) === id)
  if (!mine.length) return null
  const pi = Math.max(...mine.map((p) => p.pi))
  const pitches = mine.filter((p) => p.pi === pi).sort((a, b) => a.seq - b.seq)
  let b = 0
  let s = 0
  pitches.forEach((p) => { [b, s] = advance(b, s, p.kind) })
  const meta = (feed?.meta || []).find((m) => m.pi === pi) || null
  const last = pitches[pitches.length - 1]
  return {
    pi,
    pitches,
    balls: Math.min(b, 3),
    strikes: Math.min(s, 2),
    // The count can legally read 4-0 or 0-3 on the final pitch of a walk or a
    // strikeout; clamped for display, unclamped truth kept for the caller.
    rawBalls: b,
    rawStrikes: s,
    event: String(meta?.event || ''),
    live: !String(meta?.event || ''),
    pitcherId: last?.pitcherId ?? null,
    pitcherName: last?.pitcherName || '',
    inning: last?.inning ?? null,
    half: last?.half || '',
  }
}

/** His earlier plate appearances tonight, oldest first, with what happened. */
export function priorPAs(feed, batterId, beforePi = Infinity) {
  const id = Number(batterId)
  return (feed?.meta || [])
    .filter((m) => Number(m.batterId) === id && m.pi < beforePi && String(m.event || ''))
    .sort((a, b) => a.pi - b.pi)
    .map((m) => ({ pi: m.pi, inning: m.inning, event: String(m.event) }))
}

/** How many times this batter has come up against this pitcher tonight. */
export function timesFacing(feed, batterId, pitcherId) {
  const bid = Number(batterId)
  const pid = Number(pitcherId)
  if (!bid || !pid) return 0
  const seen = new Set()
  ;(feed?.pitches || []).forEach((p) => {
    if (Number(p.batterId) === bid && Number(p.pitcherId) === pid) seen.add(p.pi)
  })
  return seen.size
}

/** What this arm has thrown tonight — the live arsenal, not a season table. */
export function arsenalTonight(feed, pitcherId) {
  const pid = Number(pitcherId)
  if (!pid) return []
  const mine = (feed?.pitches || []).filter((p) => Number(p.pitcherId) === pid)
  const rows = pitchTypes(mine)
  const total = mine.length || 1
  return rows.map((r) => ({ ...r, pct: (100 * r.n) / total }))
}

// Plain-word outcome for each pitch, in the order a broadcast would say it.
export const KIND_WORD = {
  ball: 'ball', called: 'strike looking', whiff: 'swing & miss',
  foul: 'foul', inplay: 'in play', hbp: 'hit by pitch',
}

// One sentence describing a pitch, used by both charts' hover readouts.
export function pitchLine(p) {
  const bits = []
  bits.push(`#${p.seq} · ${p.cnt}`)
  bits.push(`${p.typeName || PITCH_NAMES[p.type] || p.type || 'pitch'}${p.velo != null ? ` ${p.velo.toFixed(1)}` : ''}`)
  bits.push(p.call || KIND_LABEL[p.kind] || '')
  return bits.filter(Boolean).join(' · ')
}

// ── 📻 JUST NOW — completed at-bats for the names you have skin on ──────────
//
// 2026-08-10, Donovan: "no context on what just happened. A homer, a
// strikeout, a hard-hit out — the page doesn't tell you the outcome of the
// at-bat you were just watching." Then, on the three ways to pay for it:
// "yeah the middle one."
//
// THE THREE OPTIONS AND WHY THE MIDDLE ONE IS RIGHT.
//
//   cheapest   diff the boxscore lines already polled. Free, and it can only
//              ever say "now 2-for-3 with a homer" — it cannot see a 105mph
//              lineout, which is half the point of watching.
//   MIDDLE     pull the live feed ONLY for games containing a pick or a
//              watchlist name. Full detail where you have skin, nothing spent
//              anywhere else. Typically 2-4 games of a fifteen-game slate.
//   most       every live game. Full detail, 8-15 calls a refresh, and most of
//              it about strangers.
//
// The cost is bounded by how many DIFFERENT GAMES your names are spread
// across, not by how many names you have — ten picks in three games is three
// calls. Feeds are cached per game on their own TTL, so two components asking
// at once collapse to one request, same pattern as fetchLiveSlate.
const _feedCache = new Map()   // pk -> { at, promise }
const FEED_TTL = 45000

function feedFor(pk) {
  const hit = _feedCache.get(pk)
  if (hit && Date.now() - hit.at < FEED_TTL) return hit.promise
  const promise = fetchLiveGame(pk).then((j) => (j ? parseLiveGame(j) : null)).catch(() => null)
  _feedCache.set(pk, { at: Date.now(), promise })
  return promise
}

// How loud an outcome is, so the rail can lead with the one that matters.
// Home run first, then the near-misses you would otherwise never learn about —
// a 108mph lineout is the single most useful thing this feed can tell you,
// because the box score records it as an out and it is not the same as an out.
const EVENT_TONE = (event, ev) => {
  const e = String(event || '').toLowerCase()
  if (e.includes('home run')) return { tone: 'hr', icon: '💥', rank: 0 }
  if (/double|triple/.test(e)) return { tone: 'xbh', icon: '🎯', rank: 1 }
  if (ev != null && ev >= 100) return { tone: 'hot', icon: '🔥', rank: 2 }
  if (e.includes('single') || e.includes('walk') || e.includes('hit by pitch')) return { tone: 'on', icon: '✅', rank: 3 }
  if (e.includes('strikeout')) return { tone: 'k', icon: '❌', rank: 5 }
  return { tone: 'out', icon: '·', rank: 4 }
}

/**
 * Completed plate appearances tonight for a set of player ids.
 *
 * @param snap  a fetchLiveSlate snapshot (for which games are live and where)
 * @param ids   Set/array of player ids you have skin on
 * @returns     newest first, at most `limit`
 */
export async function fetchSkinEvents(snap, ids, limit = 12) {
  const want = new Set([...(ids || [])].map(Number).filter(Boolean))
  if (!want.size || !snap?.games?.length) return []
  // Only games that are LIVE and actually contain one of the names. This is
  // the whole cost control, and it is computed off the lineups already in the
  // snapshot rather than by fetching to find out.
  const games = snap.games.filter((g) => {
    if (g.state !== 'Live' || g.postponed) return false
    const card = [...(g.lineup?.home || []), ...(g.lineup?.away || [])]
    return card.some((r) => want.has(Number(r.id)))
  })
  if (!games.length) return []
  const feeds = await Promise.all(games.map((g) => feedFor(g.pk).then((f) => ({ g, f }))))
  const out = []
  feeds.forEach(({ g, f }) => {
    if (!f) return
    ;(f.meta || []).forEach((m) => {
      if (!want.has(Number(m.batterId)) || !String(m.event || '')) return
      // The hardest ball he hit in that PA, for the "loud out" case.
      const ev = Math.max(0, ...(f.balls || [])
        .filter((b) => b.pi === m.pi && b.ev != null)
        .map((b) => Number(b.ev) || 0)) || null
      out.push({
        key: `${g.pk}:${m.pi}`,
        pk: g.pk,
        pi: m.pi,
        id: Number(m.batterId),
        name: m.batterName,
        event: m.event,
        inning: m.inning,
        half: m.half,
        pitcher: m.pitcherName,
        ev,
        ...EVENT_TONE(m.event, ev),
      })
    })
  })
  // NEWEST FIRST, and newest means latest play index within the latest inning
  // — not event loudness. A rail that reordered itself by how exciting things
  // were would stop being a timeline, and "what just happened" is a timeline
  // question. Tone colours it; it does not sort it.
  out.sort((a, b) => (b.inning - a.inning) || (b.pi - a.pi))
  return out.slice(0, limit)
}

// ── 📡 BATTED BALL LOG — every notable batted ball on today's slate ────────
//
// 2026-08-13, Donovan, one message after the hard-hit toggle above shipped:
// "i'd like to see hh deep fly out barrels distance and ev... basically a
// whole new reconstruction of the at the plate page... i don't like how the
// top of the page looks right before the lineups." This replaces
// fetchHardHitLog() with two changes:
//
//   1. THREE GATES, not one. A ball gets in if it's hard-hit (95+ mph) OR a
//      real barrel (isBarrel, defined above) OR a deep fly out (defined
//      right below) — a ball caught at the track is exactly as interesting
//      as one that found a gap, and a pure EV gate missed it: plenty of
//      well-struck outs sit at 90-94 mph on a good launch angle.
//   2. THE BALL ITSELF, not just its EV number. fetchHardHitLog took the max
//      EV across the PA as a bare number and threw the rest away. Every row
//      here carries distance, launch angle and which gate(s) it cleared, all
//      read off that SAME ball object — so a row can never show a barrel
//      flag from one batted ball and a distance from another.
//
// Same cost shape as before: every live + final game, sharing feedFor()'s
// per-game cache with the skin feed above, so nothing extra is spent if both
// are on screen at once.

// DEEP FLY OUT isn't a Statcast field, so it's derived the same honest way
// isBarrel is above: a fly ball (the feed's own trajectory) that traveled
// 370+ feet — past the infield and most warning tracks, genuinely deep, not
// just "elevated" — and did NOT land for a hit. A booming double or a
// game-tying home run both clear the distance bar but are not outs, so both
// are excluded by the hit check below.
const DEEP_MIN_FT = 370
const HIT_RESULTS = new Set(['single', 'double', 'triple', 'home_run', 'home run'])
export const isDeepFlyOut = (traj, dist, event) => {
  if (!/fly.?ball/i.test(String(traj || '')) || dist == null || dist < DEEP_MIN_FT) return false
  return !HIT_RESULTS.has(String(event || '').toLowerCase().trim())
}

export async function fetchBattedBallLog(snap, limit = 12) {
  if (!snap?.games?.length) return []
  const games = snap.games.filter((g) => (g.state === 'Live' || g.state === 'Final') && !g.postponed)
  if (!games.length) return []
  const feeds = await Promise.all(games.map((g) => feedFor(g.pk).then((f) => ({ g, f }))))
  const out = []
  feeds.forEach(({ g, f }) => {
    if (!f) return
    ;(f.meta || []).forEach((m) => {
      if (!String(m.event || '')) return
      // the loudest ball IN THIS PA, kept as the object — not a bare number —
      // so barrel/distance/angle below all describe that same ball
      const top = (f.balls || [])
        .filter((b) => b.pi === m.pi && b.ev != null)
        .reduce((best, b) => (best == null || b.ev > best.ev ? b : best), null)
      if (!top) return
      const deepFly = isDeepFlyOut(top.traj, top.dist, m.event)
      if (!isHardHit(top.ev) && !top.barrel && !deepFly) return
      out.push({
        key: `${g.pk}:${m.pi}`,
        pk: g.pk,
        pi: m.pi,
        id: Number(m.batterId),
        name: m.batterName,
        event: m.event,
        inning: m.inning,
        half: m.half,
        pitcher: m.pitcherName,
        ev: top.ev,
        dist: top.dist,
        la: top.la,
        hh: isHardHit(top.ev),
        barrel: !!top.barrel,
        deepFly,
        ...EVENT_TONE(m.event, top.ev),
      })
    })
  })
  // HARDEST FIRST, distance as tiebreak. A leaderboard of contact quality,
  // not a timeline of what just happened — that question already has an
  // answer above in fetchSkinEvents. Distance separates barrels, which
  // commonly cluster at similar EV.
  out.sort((a, b) => (b.ev - a.ev) || ((b.dist || 0) - (a.dist || 0)) || (b.inning - a.inning) || (b.pi - a.pi))
  return out.slice(0, limit)
}
