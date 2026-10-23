// 🏀 A GAME'S SHOTS IN ORDER (2026-10-23, BUCKETS' tabletop prototypes). Pure: ESPN's NBA game summary (site.api.espn.com
// .../basketball/nba/summary?event=<id>; CORS open) -> every shot and free throw in order, with the real spot, the shooter,
// the assist, made or missed, the points and the score after it. components/buckets/TabletopCourt.js plays them on the
// tin spring-lever court and on the red-LED handheld.
//
// THE COURT FRAME: ESPN's shot spot is x 0..50 across the floor and y feet out from the baseline the shooter attacks.
// toCourt() turns it into the stage's full court: X along it (baskets at +/-41.75, the home club attacking +X), Z across.
// WHAT IS REAL: every spot, shooter, assist, make or miss, the points, the clock, the score. DRAWN: the flight of the ball.
const num = (v) => (v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null)
const secs = (s) => { const m = /^(\d+):(\d{2})(?:\.\d)?$/.exec(String(s || '')); return m ? Number(m[1]) * 60 + Number(m[2]) : null }
export const BASKET_X = 41.75   // 47 ft to the baseline, the rim's centre 5.25 ft in

export function shotsFromSummary(sum) {
  const comp = sum?.header?.competitions?.[0]
  if (!comp) return null
  const side = (ha) => {
    const c = (comp.competitors || []).find((x) => x.homeAway === ha)
    return c ? { id: String(c.team?.id), abbrev: c.team?.abbreviation || null, color: c.team?.color ? `#${c.team.color}` : null, alt: c.team?.alternateColor ? `#${c.team.alternateColor}` : null, logo: c.team?.logos?.[0]?.href || null, score: num(c.score) } : null
  }
  const away = side('away'), home = side('home')
  if (!away || !home) return null
  const club = (id) => (String(id) === home.id ? 'home' : String(id) === away.id ? 'away' : null)
  const players = {}
  for (const t of sum?.boxscore?.players || []) for (const st of t.statistics || []) for (const a of st.athletes || []) {
    const at = a.athlete || {}
    if (at.id) players[String(at.id)] = { name: at.displayName || at.shortName || null, short: at.shortName || null, jersey: at.jersey ?? null, face: at.headshot?.href || null, club: club(t.team?.id) }
  }
  const plays = []
  for (const p of sum?.plays || []) {
    if (!p.shootingPlay) continue
    const k = club(p.team?.id)
    if (!k) continue
    const ft = /free throw/i.test(p.type?.text || '') || (p.pointsAttempted === 1)
    const c = p.coordinate || {}, x = num(c.x), y = num(c.y)
    const spot = !ft && x != null && y != null && x >= 0 && x <= 50 && y >= 0 && y <= 94 ? { x, y } : null   // ESPN's -2147483xx = no spot
    const ids = (p.participants || []).map((q) => String(q.athlete?.id || ''))
    const made = /\bmakes\b/i.test(p.text || '') || (p.scoringPlay && num(p.scoreValue) > 0)
    plays.push({
      n: plays.length, period: num(p.period?.number), clock: secs(p.clock?.displayValue), club: k, ft, spot,
      made: !!made, pts: made ? num(p.scoreValue) ?? (ft ? 1 : 2) : 0, three: !ft && /three point/i.test(p.text || ''),
      who: ids[0] || null, ast: !ft && made && ids[1] ? ids[1] : null, kind: p.type?.text || '', text: p.text || '',
      score: [num(p.awayScore) ?? 0, num(p.homeScore) ?? 0],
    })
  }
  return { id: String(sum?.header?.id || comp.id || ''), date: comp.date || null, final: comp.status?.type?.completed === true, away, home, players, plays }
}

/** ESPN's half-court spot -> the full court: the home club attacks +X. { X, Z } in feet. */
export function toCourt(spot, club) {
  const s = club === 'home' ? 1 : -1
  return { X: s * (47 - (spot.y + 4.25)), Z: spot.x - 25 }   // (ESPN's y is from 4.25 ft off the baseline: the rim at y 1, lib/courtWorld.js)
}
/** The rim the club attacks. */
export const rimOf = (club) => ({ X: (club === 'home' ? 1 : -1) * BASKET_X, Z: 0 })

/** The timeline: each shot a beat (a free throw shorter), a hold on a three that drops, a break between quarters. */
export const NBA_MS = { shot: 1100, ft: 650, three: 1500, quarter: 1200, gap: 180 }
export function shotBeats(plays) {
  const beats = []
  let t = 0
  plays.forEach((p, i) => {
    if (i > 0 && p.period !== plays[i - 1].period) { beats.push({ type: 'quarter', i, t, dur: NBA_MS.quarter }); t += NBA_MS.quarter }
    const dur = p.ft ? NBA_MS.ft : NBA_MS.shot
    beats.push({ type: 'shot', i, t, dur }); t += dur
    if (p.three && p.made) { beats.push({ type: 'three', i, t, dur: NBA_MS.three - NBA_MS.shot }); t += NBA_MS.three - NBA_MS.shot }
    beats.push({ type: 'gap', i, t, dur: NBA_MS.gap }); t += NBA_MS.gap
  })
  return { beats, total: t }
}

// ── THE WHOLE GAME (2026-10-23, the tin court v2; Donovan: "there was no jump ball ... no first basket ... make the
// figurines move around"). Every play the toy shows, in order, from the same summary: the opening tip (the two jumpers
// and who gained it), every shot and free throw (a block names the blocker), rebounds, turnovers (a steal names the
// stealer), substitutions (so the five on the floor are always the real five) and the end of each quarter. Plus each
// club's starting five (the box score's starter flag). WHAT IS REAL: all of it. DRAWN: where the men stand between plays.
const BLOCK_RE = /^(.+?) blocks /i
export function gameFromSummary(sum) {
  const base = shotsFromSummary(sum)
  if (!base) return null
  const { home, away, players } = base
  const club = (id) => (String(id) === home.id ? 'home' : String(id) === away.id ? 'away' : null)
  const starters = { home: [], away: [] }
  for (const t of sum?.boxscore?.players || []) {
    const k = club(t.team?.id)
    if (!k) continue
    for (const st of t.statistics || []) for (const a of st.athletes || []) if (a.starter && a.athlete?.id && starters[k].length < 5) starters[k].push(String(a.athlete.id))
  }
  const byName = {}
  for (const [id, p] of Object.entries(players)) if (p.name) byName[p.name.toLowerCase()] = id
  const shots = new Map(base.plays.map((p) => [p.text + '|' + p.period + '|' + p.clock, p]))
  const events = []
  let tip = null
  for (const p of sum?.plays || []) {
    const kind = p.type?.text || '', text = p.text || '', k = club(p.team?.id)
    const ids = (p.participants || []).map((q) => String(q.athlete?.id || '')).filter(Boolean)
    const at = { period: num(p.period?.number), clock: secs(p.clock?.displayValue), text }
    if (/^jump ?ball/i.test(kind) && !tip && ids.length >= 2) {
      tip = { ...at, kind: 'tip', jumpers: [ids[0], ids[1]], gained: ids[2] || null, club: ids[2] ? players[ids[2]]?.club || null : null }
      events.push(tip); continue
    }
    if (p.shootingPlay) {
      const s = shots.get(text + '|' + at.period + '|' + at.clock)
      if (!s) continue
      const bm = BLOCK_RE.exec(text)
      events.push({ ...s, kind: s.ft ? 'ft' : 'shot', blk: bm ? byName[bm[1].trim().toLowerCase()] || null : null })
      continue
    }
    if (/rebound/i.test(kind)) { if (k) events.push({ ...at, kind: 'reb', club: k, who: ids[0] || null, off: /offensive/i.test(kind) }); continue }
    if (/turnover/i.test(kind)) { if (k) events.push({ ...at, kind: 'tov', club: k, who: ids[0] || null, stl: /steals\)/i.test(text) ? ids[1] || null : null }); continue }
    if (/^substitution/i.test(kind)) { if (k && ids.length >= 2) events.push({ ...at, kind: 'sub', club: k, in: ids[0], out: ids[1] }); continue }
    if (/^end (period|game)/i.test(kind) || /^end of the/i.test(text)) events.push({ ...at, kind: 'end' })
  }
  events.forEach((e, i) => { e.i = i })
  const first = events.find((e) => e.kind === 'shot' && e.made) || null
  return { ...base, starters, tip, events, firstBasket: first ? first.i : null }
}
