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
        balls.push({
          ...who,
          event,
          cx,
          cy,
          ev: num(e?.hitData?.launchSpeed),
          la: num(e?.hitData?.launchAngle),
          dist: num(e?.hitData?.totalDistance),
          traj: str(e?.hitData?.trajectory),
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

// One sentence describing a pitch, used by both charts' hover readouts.
export function pitchLine(p) {
  const bits = []
  bits.push(`#${p.seq} · ${p.cnt}`)
  bits.push(`${p.typeName || PITCH_NAMES[p.type] || p.type || 'pitch'}${p.velo != null ? ` ${p.velo.toFixed(1)}` : ''}`)
  bits.push(p.call || KIND_LABEL[p.kind] || '')
  return bits.filter(Boolean).join(' · ')
}
