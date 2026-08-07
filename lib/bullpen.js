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

export function penTier(t) {
  if (!t) return null
  if (t.used >= 4 || t.pitches >= 65) return { key: 'gassed', icon: '🥵', word: 'PEN GASSED', col: '#f87171' }
  if (t.used >= 3 || t.pitches >= 45) return { key: 'worked', icon: '😮‍💨', word: 'pen worked', col: '#FCD34D' }
  return null
}
