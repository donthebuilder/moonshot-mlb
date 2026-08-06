// Live in-game batted balls for ONE hitter, from the MLB live feed.
// Verified 2026-08-06: /api/v1.1/game/{pk}/feed/live carries per-play
// hitData (launchSpeed / launchAngle / totalDistance) on playEvents.
//
// Deliberately scoped: fetched when a modal's EV Log opens (and on manual
// refresh), never polled, never slate-wide. A live ticker for 250 hitters is
// noise; "is the pattern I bet on showing up tonight" for the one hitter
// you're looking at is signal.

const FIELDS = 'gameData,status,abstractGameState,liveData,plays,allPlays,result,event,about,inning,halfInning,matchup,batter,id,playEvents,hitData,launchSpeed,launchAngle,totalDistance,trajectory'

export async function liveBattedBalls(gamePk, batterId) {
  if (!gamePk || !batterId) return null
  try {
    const j = await fetch(`https://statsapi.mlb.com/api/v1.1/game/${gamePk}/feed/live?fields=${FIELDS}`)
      .then((r) => (r.ok ? r.json() : null))
    if (!j) return null
    const state = j?.gameData?.status?.abstractGameState || ''
    if (state === 'Preview') return { state, balls: [] }
    const balls = []
    ;(j?.liveData?.plays?.allPlays || []).forEach((play) => {
      if (Number(play?.matchup?.batter?.id) !== Number(batterId)) return
      const ev = String(play?.result?.event || '')
      ;(play?.playEvents || []).forEach((pe) => {
        const hd = pe?.hitData
        if (!hd || hd.launchSpeed == null) return
        balls.push({
          inning: play?.about?.inning,
          half: play?.about?.halfInning,
          event: ev,
          ev: Number(hd.launchSpeed) || 0,
          la: hd.launchAngle != null ? Number(hd.launchAngle) : null,
          dist: Number(hd.totalDistance) || 0,
          traj: String(hd.trajectory || '').replace(/_/g, ' '),
        })
      })
    })
    return { state, balls }
  } catch {
    return null
  }
}
