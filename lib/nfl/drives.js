// 🏈 A GAME'S PLAYS ON THE FIELD (2026-10-22, PREPLAY's football world). Pure: ESPN's game summary (site.api.espn.com
// .../football/nfl/summary?event=<id>, the host lib/nfl/liveSlate.js already reads; the slate's game_id IS the event id)
// -> every play in order, placed on the field, and the ball's path through each one. components/nfl/DriveReplay.js plays
// them (a finished game: the look test; the TUDDY simulator's games will come out in the same shape).
//
// THE FIELD FRAME: `x` is yards from the HOME club's goal line (0) to the away club's (100) -- ESPN's own yardLine. The
// home club scores at x = 100, the away club at x = 0 (the stage keeps each club going the same way all game; TV flips
// ends each quarter, the drawing doesn't, and its caption says so).
// WHAT IS REAL: every yard line, down, distance, gain, result, clock, score, name and number. DRAWN: the ball's path inside
// a play (where across the field from the feed's own "short right", how far a catch was in the air from "short" / "deep").
// The sanity checks: scripts/check-drive-replay.mjs.
const KIND = [
  // ESPN's play type decides (checked on a full game: Rush, Pass Reception / Incompletion, Passing / Rushing Touchdown,
  // Sack, Kickoff, Punt, Penalty, Field Goal Good, Fumble Recovery, timeouts, period ends); the words split the rest
  [/timeout|end period|end of|two-minute|coin toss/i, 'stop'],
  [/interception/i, 'int'], [/fumble/i, 'fumble'],
  [/kickoff/i, 'kickoff'], [/punt/i, 'punt'], [/field goal/i, 'fg'], [/extra point|two-point|conversion|pat\b/i, 'xp'],
  [/sack/i, 'sack'], [/penalty/i, 'penalty'], [/pass/i, 'pass'], [/rush/i, 'rush'],
]
const kindOf = (t) => { for (const [re, k] of KIND) if (re.test(t)) return k; return 'other' }
const NAME_RE = "[A-Z][a-z]?\\.(?:[A-Z][a-z]{0,2}\\.\\s?)?[A-Z][A-Za-z'-]+"   // "C.McCaffrey", "Am.St. Brown"
const NAME = new RegExp(`\\b(${NAME_RE})`)
const laneOf = (text) => (/\bleft\b/i.test(text) ? 'L' : /\bright\b/i.test(text) ? 'R' : /\bmiddle\b|up the middle/i.test(text) ? 'M' : null)
const secs = (s) => { const m = /^(\d+):(\d{2})$/.exec(String(s || '')); return m ? Number(m[1]) * 60 + Number(m[2]) : null }
const num = (v) => (v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null)
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
/** The feed's "C.McCaffrey" / "Am.St. Brown" -> the key the box score's surname gives (lastKey): drop the first initial only,
 *  then letters, lower case ("Am.St. Brown" -> "stbrown", the box score's "St. Brown" -> "stbrown"). */
export const shortKey = (s) => String(s || '').replace(/^[A-Z][a-z]?\.\s?/, '').replace(/[^A-Za-z]/g, '').toLowerCase()
const lastKey = (s) => String(s || '').replace(/[^A-Za-z]/g, '').toLowerCase()

/** summary JSON -> { id, date, away, home, players, plays } or null.
 *  away / home: { id, abbrev, color, alt, logo }; players: { '<abbrev>|<shortKey>': { name, jersey, face } } from the box score. */
export function playsFromSummary(sum) {
  const comp = sum?.header?.competitions?.[0]
  if (!comp) return null
  const side = (ha) => {
    const c = (comp.competitors || []).find((x) => x.homeAway === ha)
    return c ? { id: String(c.team?.id), abbrev: c.team?.abbreviation || null, color: c.team?.color ? `#${c.team.color}` : null, alt: c.team?.alternateColor ? `#${c.team.alternateColor}` : null, logo: c.team?.logos?.[0]?.href || null, score: num(c.score) } : null
  }
  const away = side('away'), home = side('home')
  if (!away || !home) return null
  const abbrevOf = (teamId) => (String(teamId) === home.id ? home.abbrev : String(teamId) === away.id ? away.abbrev : null)
  // the box score's men: every one who recorded a stat, with his number and face
  const players = {}
  for (const t of sum?.boxscore?.players || []) {
    const ab = abbrevOf(t.team?.id)
    for (const st of t.statistics || []) for (const a of st.athletes || []) {
      const at = a.athlete || {}
      if (!at.lastName) continue
      players[`${ab}|${lastKey(at.lastName)}`] = { name: at.displayName || null, jersey: at.jersey ?? null, face: at.headshot?.href || null }
    }
  }
  const drives = sum?.drives?.previous || []
  const plays = []
  drives.forEach((d, di) => {
    for (const p of d.plays || []) {
      const text = String(p.text || ''), typ = String(p.type?.text || '')
      const kind = kindOf(typ) === 'other' ? kindOf(text) : kindOf(typ)
      if (kind === 'stop' || kind === 'other') continue
      const from = num(p.start?.yardLine), to = num(p.end?.yardLine)
      if (from == null || to == null) continue
      const team = abbrevOf(p.start?.team?.id) || abbrevOf(d.team?.id)
      const body = text.replace(/^\([^)]*\)\s*/, '')
      // the men: the passer and the man he threw to; otherwise the first name in the play (the runner, the kicker)
      const qb = ['pass', 'sack', 'int'].includes(kind) || (kind === 'fumble' && /\bpass\b|sacked/i.test(body)) ? NAME.exec(body)?.[1] || null : null
      const target = /\bpass\b/i.test(body) ? new RegExp(`\\bto (${NAME_RE})`).exec(body)?.[1] || null : null
      const who = target || NAME.exec(body)?.[1] || null
      // a kick's returner: "fair catch by L.McCaffrey", or the first man in the sentence after the kick ("... to SF 4. J.James to SF 36")
      const ret = ['kickoff', 'punt'].includes(kind) ? (new RegExp(`fair catch by (${NAME_RE})`).exec(body)?.[1] || new RegExp(`[.]\\s+(${NAME_RE})`).exec(body)?.[1] || null) : null
      const kickYd = num(/\b(?:kicks|punts)\s+(-?\d+)\s+yards?/i.exec(body)?.[1])
      const td = !!p.scoringPlay && /touchdown/i.test(`${typ} ${text}`)
      // the try after a touchdown, from the same play's words
      const pat = !td ? null : /two-point|2-point|2pt/i.test(text) ? (/succeeds|is good/i.test(text.split(/two-point|2-point|2pt/i).pop()) ? '2' : '2x')
        : /extra point is good/i.test(text) ? '1' : /extra point/i.test(text) ? '1x' : null
      plays.push({
        n: plays.length, period: num(p.period?.number), clock: secs(p.clock?.displayValue), team, kind, from, to,
        down: num(p.start?.down), dist: num(p.start?.distance), gain: num(p.statYardage),
        lane: laneOf(body), deep: /\bdeep\b/i.test(body), incomplete: /incomplete/i.test(body), touchback: /touchback/i.test(body),
        good: kind === 'fg' || kind === 'xp' ? !/no good|missed|blocked/i.test(body) : null,
        wide: /wide right/i.test(body) ? 'R' : /wide left/i.test(body) ? 'L' : null,
        kickYd, qb, who, ret, scoring: !!p.scoringPlay, td, pat,
        text, score: [num(p.awayScore) ?? 0, num(p.homeScore) ?? 0], drive: di,
      })
    }
  })
  return { id: String(sum?.header?.id || comp.id || ''), date: comp.date || null, final: comp.status?.type?.completed === true, away, home, players, plays }
}

/** The points the try added (the score bug shows the six first, then the try). */
export const patPoints = (p) => (p?.pat === '1' ? 1 : p?.pat === '2' ? 2 : 0)

/** "1st & 10 · SF 36" from a play's own down, distance and yard line. */
export function downText(p, game) {
  if (!p || !(p.down >= 1)) return ''
  const ord = ['', '1st', '2nd', '3rd', '4th'][p.down] || `${p.down}th`
  const dir = p.team === game.home.abbrev ? 1 : -1
  const toGo = dir > 0 ? 100 - p.from : p.from
  return `${ord} & ${p.dist >= toGo ? 'Goal' : p.dist} · ${spotText(p.from, game)}`
}
export const spotText = (x, game) => (x === 50 ? '50' : x < 50 ? `${game.home.abbrev} ${x}` : `${game.away.abbrev} ${100 - x}`)

/** A play's words for the ticker, short: "TOUCHDOWN · 11 yd · G.Kittle", from the feed's own text. */
export function playWords(p) {
  const head = { pass: p.incomplete ? 'INCOMPLETE' : 'PASS', rush: 'RUN', sack: 'SACK', int: 'INTERCEPTED', fumble: 'FUMBLE', punt: 'PUNT', kickoff: 'KICKOFF', penalty: 'FLAG', xp: 'TRY' }[p.kind] || ''
  const tag = p.td ? 'TOUCHDOWN' : p.kind === 'fg' ? (p.good ? 'FIELD GOAL GOOD' : 'FIELD GOAL MISSED') : head
  const fgYd = p.kind === 'fg' ? /(\d+) yard field goal/i.exec(p.text)?.[1] : null
  const yd = p.gain != null && ['pass', 'rush', 'sack'].includes(p.kind) && !p.incomplete ? `${p.gain} yd` : fgYd ? `${fgYd} yd` : ''
  return [tag, yd, p.who].filter(Boolean).join(' · ')
}

// ── THE BALL'S PATH ─────────────────────────────────────────────────────────────────────────────────────────────────
// keys: [u (0..1 of the play), x (field yards), z (yards across, + = the offence's right), h (feet up)].
// `dir` is the offence's direction (+1 the home club, going to 100). `carrier` says from which u the man with the ball is
// the one the play is about (the receiver after the catch, the runner after the handoff, the returner after the catch).
export const PLAY_MS = { rush: 1500, pass: 1900, sack: 1400, int: 2100, fumble: 1700, kickoff: 2700, punt: 2700, fg: 2100, xp: 1500, penalty: 1100 }
const LANE_Y = { L: -13, M: 0, R: 13 }   // yards across for "left / middle / right" (each third of 53.3 yards, nearer the middle)

export function playPath(p, game) {
  const dir = p.team === game.home.abbrev ? 1 : -1
  const fx = (x) => clamp(x, -10, 110)
  const laneZ = LANE_Y[p.lane] ?? 0
  const at = (u, x, z = 0, h = 2) => [u, fx(x), z, h]
  const gain = p.to - p.from
  switch (p.kind) {
    case 'rush':
      return { keys: [at(0, p.from), at(0.18, p.from - dir * 1.5, 0), at(1, p.to, laneZ * 0.7)], carrier: 0.18 }
    case 'sack':
      return { keys: [at(0, p.from), at(0.35, p.from - dir * 6), at(1, p.to, 0, 1)], carrier: 0 }
    case 'pass': {
      const drop = p.from - dir * 6
      if (p.incomplete) {
        const air = p.deep ? 24 : 8
        return { keys: [at(0, p.from), at(0.3, drop), at(0.78, p.from + dir * air, laneZ, 5 + air * 0.6), at(1, p.from + dir * (air + 2), laneZ, 0.5)], carrier: 0, throwAt: 0.3, incomplete: true }
      }
      const yd = dir * gain
      const air = yd <= 0 ? -2 : p.deep ? Math.max(Math.min(yd, 18), yd * 0.8) : Math.min(yd, Math.max(2, yd * 0.45))
      const catchX = p.from + dir * air
      return { keys: [at(0, p.from), at(0.3, drop), at(0.62, catchX, laneZ, 4), at(1, p.to, laneZ * 0.85)], carrier: 0.62, throwAt: 0.3, peak: 6 + Math.abs(air) * 0.55 }
    }
    case 'int': {
      const drop = p.from - dir * 6, air = p.deep ? 26 : 11
      return { keys: [at(0, p.from), at(0.25, drop), at(0.55, p.from + dir * air, laneZ, 5), at(1, p.to, laneZ * 0.6)], carrier: 0.55, throwAt: 0.25, peak: 8 + air * 0.5, turnover: true }
    }
    case 'fumble':
      return { keys: [at(0, p.from), at(0.2, p.from - dir * 1.5), at(0.7, p.from + dir * Math.max(2, dir * gain * 0.6), laneZ * 0.6), at(1, p.to, laneZ * 0.6, 0.5)], carrier: 0.2, turnover: true }
    case 'kickoff':
    case 'punt': {
      const back = p.kind === 'punt' ? p.from - dir * 14 : p.from
      const land = p.kickYd != null ? p.from + dir * p.kickYd : p.to
      const landX = p.touchback ? fx(dir > 0 ? Math.max(land, 101) : Math.min(land, -1)) : fx(land)
      return { keys: [at(0, back, 0, 1), at(0.62, landX, 0, 3), at(1, p.touchback ? landX : p.to, 0)], carrier: 0.62, kickAt: 0, kickTo: 0.62, peak: 55, returner: true }
    }
    case 'fg':
    case 'xp': {
      const hold = p.from - dir * 7, post = dir > 0 ? 110 : -10   // the posts stand on the end line
      const z = p.good ? 0 : p.wide === 'R' ? 5 : p.wide === 'L' ? -5 : 0
      return { keys: [at(0, hold, 0, 1), at(1, post, z, p.good ? 22 : p.wide ? 18 : 6)], carrier: 0, kickAt: 0, kickTo: 1, peak: 30, kick: true }
    }
    case 'penalty':
      return { keys: [at(0, p.from, 0, 1), at(1, p.to, 0, 1)], carrier: 1, flag: true }
    default:
      return { keys: [at(0, p.from), at(1, p.to)], carrier: 0 }
  }
}

/** The ball at u along a path: straight between keys, lofted on a throw or a kick (a parabola between its two keys). */
export function ballAt(path, u) {
  const k = path.keys
  if (u <= k[0][0]) return { x: k[0][1], z: k[0][2], h: k[0][3] }
  for (let i = 1; i < k.length; i += 1) {
    if (u <= k[i][0] || i === k.length - 1) {
      const a = k[i - 1], b = k[i], f = clamp((u - a[0]) / Math.max(1e-6, b[0] - a[0]), 0, 1)
      let h = a[3] + (b[3] - a[3]) * f
      const lofted = (path.throwAt != null && Math.abs(a[0] - path.throwAt) < 1e-6) || (path.kickAt != null && Math.abs(a[0] - path.kickAt) < 1e-6)
      if (lofted) h += 4 * (path.peak ?? 10) * f * (1 - f)
      return { x: a[1] + (b[1] - a[1]) * f, z: a[2] + (b[2] - a[2]) * f, h }
    }
  }
  const z = k[k.length - 1]
  return { x: z[1], z: z[2], h: z[3] }
}

// ── THE TIMELINE ────────────────────────────────────────────────────────────────────────────────────────────────────
// Beats in replay milliseconds at 1x: each play, a hold on a touchdown (then the try, kicked), a short hold on a field goal,
// the quarter's end, and a breath between snaps. The stage moves through them at its speed; the recorder steps them.
export const HOLD = { td: 2600, pat: 1300, fg: 900, quarter: 1100, gap: 450, turnover: 700 }
export function beatsOf(plays) {
  const beats = []
  let t = 0
  const push = (type, i, dur) => { beats.push({ type, i, t, dur }); t += dur }
  plays.forEach((p, i) => {
    if (i > 0 && p.period !== plays[i - 1].period) push('quarter', i, HOLD.quarter)
    push('play', i, PLAY_MS[p.kind] ?? 1400)
    if (p.td) { push('td', i, HOLD.td); if (p.pat === '1' || p.pat === '1x') push('pat', i, HOLD.pat) }
    else if (p.kind === 'fg' && p.good) push('fg', i, HOLD.fg)
    else if (p.kind === 'int' || p.kind === 'fumble') push('turnover', i, HOLD.turnover)
    push('gap', i, HOLD.gap)
  })
  return { beats, total: t }
}

/** The score the bug shows inside beat b at u (0..1): a scoring play's points land when it ends, a touchdown's six on its
 *  hold and the try's point(s) once the kick is through. [away, home]. */
export function scoreAt(plays, game, b, u = 1) {
  const p = plays[b.i], prev = b.i > 0 ? plays[b.i - 1].score : [0, 0]
  if (!p.scoring) return p.score
  if (b.type === 'play') return u >= 1 && !p.td ? p.score : prev
  if (b.type === 'td') {
    const k = p.team === game.home.abbrev ? 1 : 0, s = [...p.score]
    s[k] -= patPoints(p)
    return s
  }
  if (b.type === 'pat') return u >= 0.7 ? p.score : scoreAt(plays, game, { ...b, type: 'td' })
  return p.score
}

/** The try after a touchdown as a kick to draw: from the 15 (held at the 22). */
export function patPlay(p, game) {
  const dir = p.team === game.home.abbrev ? 1 : -1
  return { ...p, kind: 'xp', from: dir > 0 ? 85 : 15, to: dir > 0 ? 100 : 0, good: p.pat === '1', wide: p.pat === '1x' ? (/wide left/i.test(p.text) ? 'L' : /wide right/i.test(p.text) ? 'R' : null) : null }
}
