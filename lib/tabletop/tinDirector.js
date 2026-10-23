// 🎬 THE TIN COURT'S DIRECTOR (2026-10-23, v2). Pure: a game from lib/nba/plays.js gameFromSummary -> a timeline of
// beats, and for any beat and moment in it, where each of the ten men on the floor should stand, what each is doing
// (a hop, a spin, the lever) and where the ball is. lib/tabletop/tinCourt.js moves the tin figures toward these spots
// (they glide and rattle, as the toy does).
//
// REAL: who is on the floor (the starters, then every substitution), who has the ball, every shot's spot, shooter,
// blocker, make or miss, every rebound, turnover and steal, the opening tip and who gained it. DRAWN: where the other
// eight stand (a five-out set and man-to-man), the run between plays, the ball's flight.
import { toCourt, rimOf, BASKET_X } from '../nba/plays'

export const TIN_MS = { tip: 2600, shot: 950, three: 450, ft: 600, reb: 420, tov: 540, run: 560, quarter: 1300, first: 2200 }
const other = (k) => (k === 'home' ? 'away' : 'home')
const sideOf = (k) => (k === 'home' ? 1 : -1)
// the offence's five-out set: [feet from its baseline-side rim toward half court, across]
const SET = [[24, 0], [18, -15], [18, 15], [4, -21], [8, 8]]
const setSpot = (club, k) => { const s = sideOf(club); return { x: s * (BASKET_X - SET[k][0]), z: SET[k][1] } }
const ftSpot = (club) => ({ x: sideOf(club) * (BASKET_X - 13.75), z: 0 })
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)
const clamp01 = (x) => Math.max(0, Math.min(1, x))
const bump = (u, a, b) => (u <= a || u >= b ? 0 : Math.sin(((u - a) / (b - a)) * Math.PI))
export const HANDS = 8.6   // the ball in a figure's hands (the print's ball is over his head)

/** The game prepared once: lineups in force at each event, the beats, who acts. */
export function direct(game) {
  const ev = game.events
  const on = { home: [...game.starters.home], away: [...game.starters.away] }
  const lineups = []
  for (const e of ev) {
    if (e.kind === 'sub') { const L = on[e.club], k = L.indexOf(e.out); if (k >= 0) L[k] = e.in; else if (L.length < 5) L.push(e.in) }
    lineups.push({ home: [...on.home], away: [...on.away] })
  }
  const beats = []
  let t = 0, lastClub = null   // (after the tip the men run to the first play's end)
  const push = (type, i, dur, extra = {}) => { beats.push({ type, i, t, dur, ...extra }); t += dur }
  for (const e of ev) {
    if (e.kind === 'sub') continue
    if (e.kind === 'tip') { push('tip', e.i, TIN_MS.tip); continue }
    if (e.kind === 'end') { push('quarter', e.i, TIN_MS.quarter); continue }
    const acting = e.club
    // a change of possession: everyone runs the floor first
    if ((e.kind === 'shot' || e.kind === 'ft' || e.kind === 'tov') && lastClub && acting !== lastClub) push('run', e.i, TIN_MS.run)
    if (e.kind === 'shot') {
      push('shot', e.i, TIN_MS.shot)
      if (e.made && e.three) push('three', e.i, TIN_MS.three)
      if (e.i === game.firstBasket) push('first', e.i, TIN_MS.first)
    } else if (e.kind === 'ft') push('ft', e.i, TIN_MS.ft)
    else if (e.kind === 'reb') push('reb', e.i, TIN_MS.reb)
    else if (e.kind === 'tov') push('tov', e.i, TIN_MS.tov)
    // the end of the floor the men are at: the club that last shot or lost the ball there (a rebound happens at that end)
    if (e.kind !== 'reb') lastClub = acting
  }
  // the shot each rebound came off (for where the ball lies)
  const prevShot = []
  let ps = null
  for (const e of ev) { prevShot.push(ps); if (e.kind === 'shot' || e.kind === 'ft') ps = e.i }
  return { beats, total: t, lineups, prevShot }
}

/** Where a missed shot's ball ends up (it rattles off to one side of the rim). */
function missRest(e) {
  const r = rimOf(e.club), s = sideOf(e.club), side = e.n % 2 ? 1 : -1
  return { x: r.X - s * 4.5, y: 0.95, z: side * 5 }
}

/** The set for one play: every man's spot (by player id), and the ball's holder. */
function setFor(e, L, offence) {
  const D = other(offence), spots = {}
  L[offence].forEach((id, k) => { spots[id] = setSpot(offence, k) })
  const actor = e?.who && spots[e.who] ? e.who : null
  if (e && e.kind === 'shot' && actor) {
    const at = e.spot ? (() => { const c = toCourt(e.spot, e.club); return { x: c.X, z: c.Z } })() : setSpot(offence, 0)
    // the teammate standing nearest the shot's spot takes the shooter's place in the set
    const mate = L[offence].filter((id) => id !== actor).sort((a, b) => dist(spots[a], at) - dist(spots[b], at))[0]
    if (mate && dist(spots[mate], at) < 8) spots[mate] = spots[actor]
    spots[actor] = at
  }
  if (e && e.kind === 'tov' && actor) { const top = setSpot(offence, 0), holder = L[offence].find((id) => dist(spots[id], top) < 0.1); if (holder && holder !== actor) spots[holder] = spots[actor]; spots[actor] = top }
  // man-to-man: each defender a step off his man toward the rim (the shooter's man closer)
  const rim = rimOf(offence), R = { x: rim.X, z: rim.Z }
  L[D].forEach((id, k) => {
    const man = spots[L[offence][k]] || setSpot(offence, k), d = dist(man, R) || 1, gap = L[offence][k] === actor ? 2.6 : 3.6
    spots[id] = d < 5 ? { x: man.x - sideOf(offence) * 2.6, z: man.z + (man.z >= 0 ? -2 : 2) } : { x: man.x + ((R.x - man.x) / d) * gap, z: man.z + ((R.z - man.z) / d) * gap }
  })
  return { spots, holder: actor || L[offence][0] }
}

/** The free-throw set: the shooter at the line, two of each club on the lane, the rest behind the arc. */
function ftSet(e, L) {
  const O = e.club, D = other(O), s = sideOf(O), spots = {}, base = BASKET_X + 5.25   // the baseline
  const lane = (k, side) => ({ x: s * (base - 7 - k * 3), z: side * 8.8 })
  spots[e.who] = ftSpot(O)
  const offs = L[O].filter((id) => id !== e.who), defs = [...L[D]]
  spots[defs[0]] = lane(0, -1); spots[defs[1]] = lane(0, 1); spots[offs[0]] = lane(1, -1); spots[offs[1]] = lane(1, 1)
  const rest = [...offs.slice(2), ...defs.slice(2)]
  // the rest fan out round the arc behind the shooter
  const rim = rimOf(O)
  rest.forEach((id, k) => { const a = ((k - (rest.length - 1) / 2) / Math.max(1, rest.length - 1)) * 2.2; spots[id] = { x: rim.X - s * 25 * Math.cos(a), z: 25 * Math.sin(a) * 0.95 } })
  return { spots, holder: e.who }
}

/** The opening tip: the jumpers in the centre circle, each club's other four on its own half. */
function tipSet(g, L) {
  const spots = {}, [ja, jb] = g.tip.jumpers
  const clubOf = (id) => (L.home.includes(id) ? 'home' : 'away')
  for (const k of ['home', 'away']) {
    const s = sideOf(k)
    let n = 0
    for (const id of L[k]) {
      if (id === ja || id === jb) { spots[id] = { x: -s * 1.7, z: 0 }; continue }
      const ring = [[-9, -9], [-9, 9], [-15, -3], [-15, 13]][n++] || [-12, 0]
      spots[id] = { x: s * ring[0] * 1, z: ring[1] }
    }
  }
  return { spots, clubOf }
}

/** The scene at beat b, moment u (0..1): { spots, pin: [ids that must be exactly on their spot], acts: { id: { hop,
 *  spin, lever } }, ball: { hold: id } | { x, y, z }, offence, called-out event }. */
export function sceneAt(game, d, b, u) {
  const ev = game.events, e = ev[b.i], L = d.lineups[b.i]
  const acts = {}
  const act = (id, a) => { if (id) acts[id] = { ...(acts[id] || {}), ...a } }
  if (b.type === 'tip') {
    const { spots } = tipSet(game, L), [ja, jb] = game.tip.jumpers
    act(ja, { hop: bump(u, 0.4, 0.64) * 2.6 }); act(jb, { hop: bump(u, 0.42, 0.66) * 2.2 })
    const g = spots[game.tip.gained] || { x: 0, z: 6 }
    const ball = u < 0.46 ? { x: 0, y: 7 + 9 * Math.sin((u / 0.46) * Math.PI / 2), z: 0 }
      : u < 0.8 ? (() => { const f = (u - 0.46) / 0.34; return { x: g.x * f, y: 16 * (1 - f) + HANDS * f + 3 * Math.sin(f * Math.PI), z: g.z * f } })()
        : { hold: game.tip.gained }
    if (u > 0.8) act(game.tip.gained, { hop: bump(u, 0.8, 0.95) * 0.8 })
    return { spots, pin: u > 0.25 ? [ja, jb] : [], acts, ball, offence: game.tip.club }
  }
  if (b.type === 'quarter') {
    const prev = ev.slice(0, b.i).reverse().find((x) => x.kind === 'shot' || x.kind === 'ft' || x.kind === 'tov' || x.kind === 'reb')
    const s = prev ? (prev.kind === 'ft' ? ftSet(prev, L) : setFor(prev, L, prev.club)) : { spots: {}, holder: null }
    return { spots: s.spots, pin: [], acts, ball: { x: 0, y: 0.95, z: 0 }, offence: null }
  }
  if (b.type === 'run') {
    const s = e.kind === 'ft' ? ftSet(e, L) : setFor(e, L, e.club)
    return { spots: s.spots, pin: [], acts, ball: { hold: s.holder }, offence: e.club }
  }
  if (e.kind === 'ft') {
    const s = ftSet(e, L), r = rimOf(e.club), from = ftSpot(e.club)
    act(e.who, { lever: bump(u, 0.25, 0.5), hop: bump(u, 0.25, 0.45) * 0.4 })
    return { spots: s.spots, pin: [e.who], acts, ball: flight(from, { x: r.X, z: r.Z }, u, e.made, e), offence: e.club }
  }
  if (e.kind === 'shot') {
    const s = setFor(e, L, e.club), from = s.spots[e.who], r = rimOf(e.club), D = other(e.club)
    const guard = L[D][L[e.club].indexOf(e.who)]
    if (b.type === 'shot') {
      act(e.who, { hop: bump(u, 0.28, 0.52) * 1.8, lever: bump(u, 0.3, 0.5) })
      act(e.blk || guard, { hop: bump(u, 0.32, 0.6) * (e.blk ? 2.6 : 1.1) })
      let ball = u < 0.3 ? { hold: e.who } : flight(from, { x: r.X, z: r.Z }, (u - 0.3) / 0.7, e.made, e)
      if (e.blk && u >= 0.45) {
        // blocked: the ball stops at the blocker's hand and is swatted down and away
        const bk = s.spots[e.blk] || from, f = (u - 0.45) / 0.55
        ball = { x: bk.x + (from.x - bk.x) * 0.3 + sideOf(e.club) * -f * 6, y: Math.max(0.95, 10 - 9 * f * f), z: bk.z + (e.n % 2 ? 1 : -1) * f * 7 }
      }
      return { spots: s.spots, pin: u > 0.2 ? [e.who] : [], acts, ball, offence: e.club, ev: e }
    }
    // the holds after a make: a three (he spins), the first basket (he spins twice, his mates jump)
    if (b.type === 'three') act(e.who, { spin: clamp01(u) * Math.PI * 2 })
    if (b.type === 'first') { act(e.who, { spin: clamp01(u / 0.7) * Math.PI * 4, hop: bump(u, 0, 0.35) * 1.6 }); for (const id of L[e.club]) if (id !== e.who) act(id, { hop: bump((u * 3) % 1, 0, 1) * 0.9 }) }
    return { spots: s.spots, pin: [e.who], acts, ball: { x: r.X, y: 0.95, z: r.Z }, offence: e.club, ev: e }
  }
  if (e.kind === 'reb') {
    const pi = d.prevShot[b.i], p = pi != null ? ev[pi] : null
    const shooting = p ? p.club : other(e.club)
    const s = p && p.kind === 'ft' ? ftSet(p, L) : setFor(p && p.kind === 'shot' ? p : null, L, shooting)
    const rest = p && p.kind === 'shot' ? missRest(p) : { x: rimOf(shooting).X - sideOf(shooting) * 4.5, y: 0.95, z: 3 }
    if (e.who && s.spots[e.who]) { s.spots[e.who] = { x: rest.x - sideOf(shooting) * 1.5, z: rest.z * 0.6 }; act(e.who, { hop: bump(u, 0.15, 0.6) * 2 }) }
    const to = e.who || L[e.club][0]
    const ball = u < 0.4 ? { x: rest.x, y: rest.y + 6 * Math.sin((u / 0.4) * Math.PI) * 0.6 + (u / 0.4) * 2, z: rest.z } : { hold: to }
    return { spots: s.spots, pin: [], acts, ball, offence: e.club, ev: e }
  }
  if (e.kind === 'tov') {
    const s = setFor(e, L, e.club), h = s.spots[e.who] || setSpot(e.club, 0)
    if (e.stl && s.spots[e.stl]) { s.spots[e.stl] = u < 0.35 ? s.spots[e.stl] : { x: h.x + sideOf(e.club) * 1.5, z: h.z + 1.2 }; act(e.stl, { hop: bump(u, 0.5, 0.75) * 0.8 }) }
    const ball = u < 0.5 ? { hold: e.who || s.holder } : e.stl ? { hold: e.stl } : { x: h.x, y: 0.95, z: h.z + (h.z >= 0 ? 1 : -1) * Math.min(1, (u - 0.5) * 2) * (27 - Math.abs(h.z)) }
    return { spots: s.spots, pin: [], acts, ball, offence: e.club, ev: e }
  }
  return { spots: {}, pin: [], acts, ball: { x: 0, y: 0.95, z: 0 }, offence: null }
}

/** The ball from a release point to the rim: up and over in an arc; a make drops through, a miss rattles out. */
function flight(from, rim, u, made, e) {
  const f = clamp01(u)
  const d = Math.hypot(rim.x - from.x, rim.z - from.z), peak = 10.4 + Math.max(3, d * 0.36)
  if (f <= 0.66) {
    const k = f / 0.66, y0 = HANDS + 1.2
    return { x: from.x + (rim.x - from.x) * k, y: y0 + (10.4 - y0) * k + 4 * (peak - Math.max(y0, 10.4)) * k * (1 - k), z: from.z + (rim.z - from.z) * k }
  }
  const k = (f - 0.66) / 0.34
  if (made) return { x: rim.x, y: Math.max(0.95, 10.2 - 9.3 * k), z: rim.z, made: k }
  const r = missRest(e)
  return { x: rim.x + (r.x - rim.x) * k, y: Math.max(0.95, 10.6 + 2.4 * Math.sin(k * Math.PI) - 9.6 * k), z: rim.z + (r.z - rim.z) * k }
}
