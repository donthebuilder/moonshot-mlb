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

// THE BUG THAT KILLED EVERY DUE-UP ALERT (found 2026-08-09, Donovan: "why
// didn't I get an update that one of my top picks was at the plate").
//
// `fields` is a WHITELIST — the API returns only the keys named here. This
// list hydrated `linescore` and asked for currentInning/inningState, but
// never named `offense`, `batter` or `onDeck`. So the server stripped the
// offense block out of every response, `upBatter`/`onDeck` parsed as null on
// every game, forever, and the "🎤 your pick is UP" toast had nothing to
// fire on. Every fix upstream of this — always-notify, the 35s cadence —
// was tuning a pipe with no water in it. Verified against the live endpoint:
// the same call WITHOUT these keys returns no offense; WITH them it returns
// batter/onDeck ids on all nine live games.
const SCHED_FIELDS = 'dates,games,gamePk,status,abstractGameState,detailedState,teams,home,away,team,id,score,linescore,currentInning,inningState,offense,batter,onDeck,inHole,fullName'
const BOX_FIELDS = 'teams,home,away,team,id,players,person,fullName,battingOrder,stats,batting,atBats,hits,homeRuns,totalBases,runs,rbi,doubles,triples,strikeOuts,pitching,numberOfPitches,gamesStarted'

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
    // Due-up (2026-08-06): in-game the linescore offense carries who's at the
    // plate and who's waiting — pregame it only has the team, so these stay
    // null until first pitch. Powers the "your pick is UP" alerts for free.
    upBatter: g?.linescore?.offense?.batter?.id ?? null,
    onDeck: g?.linescore?.offense?.onDeck?.id ?? null,
    inHole: g?.linescore?.offense?.inHole?.id ?? null,
  }))
  if (!games.length) return null

  const started = games.filter((g) => g.state === 'Live' || g.state === 'Final')
  const lines = {}   // playerId -> live batting line
  await Promise.all(started.map(async (g) => {
    const box = await fetch(`https://statsapi.mlb.com/api/v1/game/${g.pk}/boxscore?fields=${BOX_FIELDS}`)
      .then((r) => (r.ok ? r.json() : null)).catch(() => null)
    if (!box?.teams) return
    // Starter pitch counts (2026-08-07): the bullpen door signal. The
    // starter is the pitcher with gamesStarted >= 1 IN THIS GAME's boxscore
    // (fields verified live). Stored per game, per side.
    g.starters = []
    ;['home', 'away'].forEach((side) => {
      const sideTeamId = box.teams[side]?.team?.id ?? null
      Object.values(box.teams[side]?.players || {}).forEach((pl) => {
        const pit = pl?.stats?.pitching
        if (pit && Number(pit.gamesStarted) >= 1 && pit.numberOfPitches != null) {
          g.starters.push({
            side, teamId: sideTeamId,
            id: pl?.person?.id, name: pl?.person?.fullName || '',
            pitches: Number(pit.numberOfPitches) || 0,
          })
        }
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

// HR CONTEXT (2026-08-08, the Real-app lesson: context on every event).
// One targeted feed/live call AFTER a fresh homer is detected — never
// polled — returning the batted ball's exit velo, distance and launch
// angle. hitData fields verified live in the Game Cockpit work
// (playEvents[].hitData.launchSpeed/launchAngle/totalDistance).
const FEED_FIELDS = 'liveData,plays,allPlays,result,eventType,about,matchup,batter,id,playEvents,hitData,launchSpeed,launchAngle,totalDistance'

export async function fetchHrContext(gamePk, batterId) {
  try {
    const j = await fetch(`https://statsapi.mlb.com/api/v1.1/game/${gamePk}/feed/live?fields=${FEED_FIELDS}`)
      .then((r) => (r.ok ? r.json() : null))
    const plays = j?.liveData?.plays?.allPlays || []
    for (let i = plays.length - 1; i >= 0; i--) {
      const pl = plays[i]
      if (pl?.result?.eventType !== 'home_run') continue
      if (Number(pl?.matchup?.batter?.id) !== Number(batterId)) continue
      const ev = (pl.playEvents || []).find((e) => e?.hitData?.launchSpeed != null)?.hitData
      if (!ev) return null
      return {
        ev: Number(ev.launchSpeed) || null,
        dist: Number(ev.totalDistance) || null,
        la: Number(ev.launchAngle) || null,
      }
    }
  } catch { /* context is garnish — never block the toast */ }
  return null
}
