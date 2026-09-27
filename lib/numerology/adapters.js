// 🔢 ONE PLAYER SHAPE FOR THE LANES (2026-09-27, BATCH-NUMEROLOGY step 1).
// Each sport's row -> { name, jersey, birthDate, next, team, opp }. A field
// the sport doesn't publish is null (its lanes sit out), never 0.
//   MLB  the slate row (jersey, season HR) + MLB people (birthDate)
//   NFL  nfl_week.json players[] (jersey_number, birth_date, season_td)
//   NHL  /api/lamp/numerology rows (jersey, birthDate); next = season goals + 1 when known
// DEFENSE IS NOT A NAME (plan step 3): a team defense / special-teams row
// (TUDDY's DEF rows) returns null and never enters a name lane.
const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))

export function fromMlb(row, person = null) {
  if (!row) return null
  const hr = num(row.season_hr ?? row.hr_season ?? row.stats?.season_hr)
  return {
    name: row.name || row.player_name || null,
    jersey: num(row.jersey ?? row.jersey_number ?? person?.primaryNumber),
    birthDate: person?.birthDate || row.birth_date || null,
    next: hr != null ? hr + 1 : null,
    team: row.team || null, opp: row.opp || row.opponent || null,
  }
}

export function fromNfl(p) {
  if (!p || p.position === 'DEF' || String(p.player_id || '').startsWith('DEF-')) return null
  const td = num(p.season_td)
  return { name: p.name || null, jersey: num(p.jersey_number), birthDate: p.birth_date || null, next: td != null ? td + 1 : null, team: p.team || null, opp: p.opp || null }
}

export function fromNhl(r) {
  if (!r) return null
  const g = num(r.seasonGoals ?? r.goals)
  return { name: r.name || null, jersey: num(r.jersey), birthDate: r.birthDate || null, next: g != null ? g + 1 : null, team: r.team || null, opp: r.opp || null }
}
