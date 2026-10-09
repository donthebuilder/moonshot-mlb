// LAMP · GOALIE QUALITY — GET /api/lamp/goaliequality?home=BUF&away=CHI&date=2026-10-08
//
// The goalies each club has played lately, with the goals and expected goals on the shots they faced and the
// goalie-quality factor the team model uses (lib/nhl/goalieQuality.js), as of the game's own date.
// { available: false } until lamp_team_game_xg has history. Cached 30 minutes.
import { readGoalieQuality } from '../../../../lib/nhl/goalieQualityRead'
import { ok, bad } from '../../../../lib/nhl/respond'

export const dynamic = 'force-dynamic'

export async function GET(request) {
  const q = new URL(request.url).searchParams
  const home = String(q.get('home') || ''); const away = String(q.get('away') || ''); const date = String(q.get('date') || '')
  if (!/^[A-Z]{3}$/.test(home) || !/^[A-Z]{3}$/.test(away)) return bad('home and away must be 3-letter club codes')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return bad('date must be YYYY-MM-DD, the game\'s own date')
  return ok({ ...(await readGoalieQuality({ home, away, date })), fetchedAt: new Date().toISOString() }, 1800)
}
