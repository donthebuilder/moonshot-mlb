// LIVE SLATE — the whole night, one snapshot, from the league's own feeds.
//
// One schedule call finds tonight's games and their state; one boxscore call
// per started game returns every batter's live line (AB/H/HR/TB/R/RBI). That
// is everything a picks-first live feed needs:
//   · each designated pick graded against ITS OWN bar, live
//   · every homer tonight, tagged whether the model had him
// Cost: 1 + (games started) calls per refresh — a dozen at peak, fired only
// when the user asks (manual button or the opt-in 60s auto while visible).
// Never polled in the background. Display lane only; nothing here scores.

const SCHED_FIELDS = 'dates,games,gamePk,status,abstractGameState,detailedState,teams,home,away,team,id,score,linescore,currentInning,inningState'
const BOX_FIELDS = 'teams,home,away,team,id,players,person,fullName,battingOrder,stats,batting,atBats,hits,homeRuns,totalBases,runs,rbi,doubles,triples,strikeOuts'

export async function fetchLiveSlate() {
  const today = new Date().toLocaleDateString('en-CA')
  const sched = await fetch(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${today}&hydrate=linescore&fields=${SCHED_FIELDS}`)
    .then((r) => (r.ok ? r.json() : null)).catch(() => null)
  const games = (sched?.dates?.[0]?.games || []).map((g) => ({
    pk: g.gamePk,
    state: g?.status?.abstractGameState || '',            // Preview | Live | Final
    detail: g?.status?.detailedState || '',
    homeId: g?.teams?.home?.team?.id, awayId: g?.teams?.away?.team?.id,
    homeScore: g?.teams?.home?.score ?? null, awayScore: g?.teams?.away?.score ?? null,
    inning: g?.linescore?.currentInning ?? null,
    half: g?.linescore?.inningState || '',
  }))
  if (!games.length) return null

  const started = games.filter((g) => g.state === 'Live' || g.state === 'Final')
  const lines = {}   // playerId -> live batting line
  await Promise.all(started.map(async (g) => {
    const box = await fetch(`https://statsapi.mlb.com/api/v1/game/${g.pk}/boxscore?fields=${BOX_FIELDS}`)
      .then((r) => (r.ok ? r.json() : null)).catch(() => null)
    if (!box?.teams) return
    ;['home', 'away'].forEach((side) => {
      Object.values(box.teams[side]?.players || {}).forEach((pl) => {
        const id = pl?.person?.id
        const b = pl?.stats?.batting
        if (!id || !b || b.atBats == null) return
        lines[id] = {
          pk: g.pk, state: g.state,
          name: pl?.person?.fullName || '',   // so off-slate homers never render as "#650968"
          ab: Number(b.atBats) || 0, h: Number(b.hits) || 0,
          hr: Number(b.homeRuns) || 0, tb: Number(b.totalBases) || 0,
          r: Number(b.runs) || 0, rbi: Number(b.rbi) || 0,
          d2: Number(b.doubles) || 0, d3: Number(b.triples) || 0,
          k: Number(b.strikeOuts) || 0,
        }
      })
    })
  }))
  return { games, lines, fetched: Date.now() }
}

// Did a pick's live line clear its category bar — same rules the archive
// grades on. Returns true / false / null (bar not judgeable yet: 0 AB).
export function pickCleared(role, line) {
  if (!line || line.ab === 0) return null
  const combo = line.h + line.r + line.rbi
  if (role === 'HR' || role === 'TOP') return line.hr >= 1
  if (role === 'HIT') return line.h >= 1
  if (role === 'HRR') return combo >= 2
  if (role === 'CONTACT' || role === 'TB') return line.tb >= 2
  return null
}
