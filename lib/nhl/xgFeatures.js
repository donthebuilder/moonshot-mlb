// 🏒 lamp-xg-v1's shot geometry and features (2026-10-07). Split out of xg.js so the
// fit script can build the same features before any coefficient file exists.
// Pure; the one place a lamp_shots row becomes numbers.
export const NET_X = 89   // the goal line, feet; the net's centre is y = 0

/**
 * One lamp_shots row -> { x, y } with the attacked net on the right (x > 0).
 * A BLOCKED shot's coordinates are where it was taken, already toward the net it
 * attacked; a shot on goal from the shooter's OWN zone (zone 'D': pulled goalie,
 * penalty kill clears) sits behind the shooter, so the net it attacks is on the
 * far side of the ice. Everything else faces the sign of x. (Measured on 2025-26:
 * 99.9% agreement with the direction a club attacked in that period.)
 */
export function normShot(s) {
  if (s == null || s.x == null || s.y == null || !Number.isFinite(Number(s.x)) || !Number.isFinite(Number(s.y))) return null
  const x = Number(s.x); const y = Number(s.y)
  const away = s.zone === 'D' && s.result !== 'block'
  const a = away ? (x > 0 ? -1 : 1) : (x < 0 ? -1 : 1)
  return { x: a * x, y: a * y }
}

/** feet from the centre of the net, and the angle off straight-on (0 = in front, 90 = along the goal line, > 90 behind it) */
export function distAngle(n) {
  const dx = NET_X - n.x
  return { dist: Math.hypot(dx, n.y), angle: Math.atan2(Math.abs(n.y), dx) * 180 / Math.PI }
}

const TYPE_KEY = { wrist: null, snap: 'snap', slap: 'slap', backhand: 'backhand', 'tip-in': 'tip', deflected: 'tip', 'wrap-around': 'wrap' }
const typeKey = (t) => (t == null ? null : t in TYPE_KEY ? TYPE_KEY[t] : 'rare')

/** 'ev' | 'pp' | 'sh' plus the ice: 3v3 / 4v4 / full from the skater digits of situationCode */
function iceOf(code) {
  const s = String(code || '')
  if (!/^\d{4}$/.test(s)) return null
  const tot = Number(s[1]) + Number(s[2])
  return tot === 6 ? 'three' : tot === 8 ? 'four' : null
}

/** The named features of one already-normalised shot. Order is the file's. */
export function features(s, n) {
  const { dist, angle } = distAngle(n)
  const h = (v, k) => Math.max(0, v - k)
  const f = {
    lnd: Math.log(dist + 1), dist, d10: h(dist, 10), d20: h(dist, 20), d35: h(dist, 35), d55: h(dist, 55),
    angle, a25: h(angle, 25), a45: h(angle, 45), a70: h(angle, 70),
    nearAngle: dist < 20 ? angle : 0, nearBehind: n.x > NET_X ? 1 : 0,
    long: dist > 60 ? 1 : 0,
    pp: s.strength === 'pp' ? 1 : 0, sh: s.strength === 'sh' ? 1 : 0,
    three: iceOf(s.situation_code) === 'three' ? 1 : 0, four: iceOf(s.situation_code) === 'four' ? 1 : 0,
    snap: 0, slap: 0, backhand: 0, tip: 0, wrap: 0, rare: 0,
    tipNear: 0, slapFar: 0,
  }
  const k = typeKey(s.shot_type)
  if (k) f[k] = 1
  if (k === 'tip' && dist < 15) f.tipNear = 1
  if (k === 'slap' && dist > 40) f.slapFar = 1
  return f
}

export const isEmptyNet = (s) => (s.result === 'sog' || s.result === 'goal') && s.goalie_id == null

