// 🏀 THE OPENING OF A GAME (2026-10-22, Donovan: tip win rate, who takes the first shots, shots / usage / points in the
// first 3 minutes, first baskets; "the first six minutes ... for first quarter tickets"; "this all needs to be a part of the
// model"). Plan: claude/BATCH-FIRSTS-PLAN-2026-10-22.txt. Pure: ESPN's game summary in, the two openings rows out
// (supabase/migrations/202610221300_openings.sql). No fetch, no clock, no guess: a play the feed doesn't carry is not counted.
//
//   window 1  the first 3:00 of Q1 (first basket)     window 2  the first 6:00 (first-quarter tickets)     p1  all of Q1
//
// The jump: ESPN's first play is the jump ball, its two participants the jumpers and its team the club that GOT the ball
// (a tip that goes out of bounds counts for whoever got it). Plays are put in sequence order before anything is read: two
// shots can share a second on the clock. Usage pieces (FGA, FTA, TOV) are stored as counts; the share is worked out on read.
import { reduceBox } from './api'

export const WIN1_S = 180
export const WIN2_S = 360
const Q_S = 720

const num = (v) => { const x = Number(v); return Number.isFinite(x) ? x : null }
const txt = (p) => String(p?.type?.text || '') + ' ' + String(p?.text || '')
const isFt = (p) => /free throw/i.test(txt(p))
const isHeave = (p) => /heave/i.test(txt(p))

/** "11:41" in Q1 -> 19 seconds into the game; null outside Q1 or when the clock is unreadable. */
export function q1Elapsed(p) {
  if (num(p?.period?.number) !== 1) return null
  const m = String(p?.clock?.displayValue || '').match(/^(\d{1,2}):(\d{2})$/) || String(p?.clock?.displayValue || '').match(/^(\d+)(?:\.\d+)?$/)
  if (!m) return null
  const left = m.length === 3 ? Number(m[1]) * 60 + Number(m[2]) : Number(m[1])
  return Q_S - left
}

/** The plays in sequence order (ESPN's sequenceNumber; array order breaks ties). */
export function orderedPlays(summary) {
  return (summary?.plays || []).map((p, i) => [p, i]).sort((a, b) => ((num(a[0].sequenceNumber) ?? a[1]) - (num(b[0].sequenceNumber) ?? b[1])) || a[1] - b[1]).map(([p]) => p)
}

const blank = () => ({ att: 0, made: 0, pts: 0, '3pa': 0, fta: 0, tov: 0 })

/**
 * game: { gameId, gameDate, season, seasonType, home, away } (club abbreviations). Returns { game, players } or null when the
 * summary has no Q1 plays (not played, or the feed is empty).
 */
export function openingRows(summary, game) {
  const plays = orderedPlays(summary).filter((p) => num(p?.period?.number) === 1)
  if (!plays.length) return null
  const comps = summary?.header?.competitions?.[0]?.competitors || []
  const abbrevOf = new Map(comps.map((c) => [String(c?.team?.id || ''), String(c?.team?.abbreviation || '')]))
  const box = reduceBox(summary)
  const who = new Map(box.map((b) => [b.id, b]))
  const club = (p) => abbrevOf.get(String(p?.team?.id || '')) || null
  const pid = (p, i = 0) => String(p?.participants?.[i]?.athlete?.id || '') || null

  const per = new Map()   // player -> { team, w1, w2, p1, reb, ast, firstAtt }
  const touch = (id, team) => {
    if (!per.has(id)) per.set(id, { team: who.get(id)?.team || team, w1: blank(), w2: blank(), p1: blank(), reb: 0, ast: 0, firstAtt: null })
    return per.get(id)
  }
  const pts = { w1: {}, w2: {}, p1: {} }
  const addPts = (bucket, team, v) => { if (team) pts[bucket][team] = (pts[bucket][team] || 0) + v }

  let jump = null, firstAtt = null, firstScore = null, attN = 0
  for (const p of plays) {
    const t = q1Elapsed(p)
    const team = club(p)
    const windows = ['p1', ...(t != null && t <= WIN2_S ? ['w2'] : []), ...(t != null && t <= WIN1_S ? ['w1'] : [])]
    if (!jump && /jump ?ball/i.test(String(p?.type?.text || ''))) {
      jump = { team, players: [pid(p, 0), pid(p, 1)].filter(Boolean) }
      continue
    }
    if (p.shootingPlay) {
      const shooter = pid(p)
      const made = p.scoringPlay === true
      const v = made ? (num(p.scoreValue) || 0) : 0
      for (const w of windows) addPts(w, team, v)
      if (!shooter) continue
      const s = touch(shooter, team)
      if (isFt(p)) {
        for (const w of windows) { s[w].fta += 1; s[w].pts += v }
        continue
      }
      if (isHeave(p)) continue
      attN += 1
      const three = num(p.pointsAttempted) === 3 || /three point/i.test(txt(p))
      for (const w of windows) { s[w].att += 1; if (made) { s[w].made += 1; s[w].pts += v }; if (three) s[w]['3pa'] += 1 }
      if (s.firstAtt == null && t != null && t <= WIN2_S) s.firstAtt = attN
      if (!firstAtt) firstAtt = { team, player: shooter, t }
      if (made && !firstScore) firstScore = { team, player: shooter, t, pts: v }
      const assist = made && pid(p, 1)
      if (assist) touch(assist, team).ast += 1
      continue
    }
    const kind = String(p?.type?.text || '')
    const actor = pid(p)
    if (!actor) continue   // team rebounds and team turnovers name no player
    if (/rebound/i.test(kind)) touch(actor, team).reb += 1
    else if (/turnover/i.test(kind) || /turnover/i.test(String(p?.text || ''))) { const s = touch(actor, team); for (const w of windows) s[w].tov += 1 }
  }

  const { gameId, gameDate, season = null, seasonType = null, home, away } = game
  const g = {
    sport: 'nba', game_id: String(gameId), game_date: gameDate, season, season_type: seasonType, home, away,
    win1_s: WIN1_S, win2_s: WIN2_S,
    jump_win_team: jump?.team || null, jump_players: jump?.players?.length ? jump.players : null,
    first_att_team: firstAtt?.team || null, first_att_player: firstAtt?.player || null, first_att_clock_s: firstAtt?.t ?? null,
    first_score_team: firstScore?.team || null, first_score_player: firstScore?.player || null, first_score_clock_s: firstScore?.t ?? null,
    first_score_pts: firstScore?.pts ?? null,
    win1_home_pts: pts.w1[home] ?? 0, win1_away_pts: pts.w1[away] ?? 0,
    win2_home_pts: pts.w2[home] ?? 0, win2_away_pts: pts.w2[away] ?? 0,
    p1_home_pts: pts.p1[home] ?? 0, p1_away_pts: pts.p1[away] ?? 0,
  }
  // every man who played gets a row (zeros are facts: he was out there and took nothing); a DNP gets none
  for (const b of box) if (!b.dnp && b.id) touch(b.id, b.team)
  const cols = (pre, w) => ({ [`${pre}_att`]: w.att, [`${pre}_made`]: w.made, [`${pre}_pts`]: w.pts, [`${pre}_3pa`]: w['3pa'], [`${pre}_fta`]: w.fta, [`${pre}_tov`]: w.tov })
  const players = [...per.entries()].filter(([id, s]) => id && s.team).map(([id, s]) => ({
    sport: 'nba', game_id: String(gameId), game_date: gameDate, season, season_type: seasonType,
    player_id: id, name: who.get(id)?.name || null, team: s.team, pos: who.get(id)?.pos || null, starter: who.has(id) ? who.get(id).starter : null,
    first_att_order: s.firstAtt,
    ...cols('win1', s.w1), ...cols('win2', s.w2), ...cols('p1', s.p1), p1_reb: s.reb, p1_ast: s.ast,
  }))
  return { game: g, players }
}

/** Write one game's opening (upsert: a re-grade writes the same numbers). Returns an error message or null. */
export async function writeOpening(db, summary, game, source = 'tick') {
  const r = openingRows(summary, game)
  if (!r) return 'no first-quarter plays'
  const gw = await db.from('opening_games').upsert([{ ...r.game, source }], { onConflict: 'sport,game_id' })
  if (gw.error) return `games: ${gw.error.message}`
  if (r.players.length) {
    const pw = await db.from('opening_players').upsert(r.players.map((x) => ({ ...x, source })), { onConflict: 'sport,game_id,player_id' })
    if (pw.error) return `players: ${pw.error.message}`
  }
  return null
}
