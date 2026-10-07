'use client'
import { C, NUM_FONT } from '../../../lib/nhl/theme'
import { arenaOf } from '../../../lib/nhl/arenas'
import { rinkRecord } from '../../../lib/nhl/goalLog'

// 🏟 GOALS AT TONIGHT'S RINK (MOONSHOT lib/venueHr.js venueRecord + VenueHrRow in
// PlayerModal). His goals and shots in the building he plays in tonight, against
// everywhere, over the two seasons of game logs on file -- the same-window
// comparison MOONSHOT makes, so it is apples to apples. The log has no venue
// field: the building is the host club's (home games for the host if he plays
// there tonight, road games at the host otherwise). A rink goal FACTOR (goals a
// game at that building against the league) is not shown: the league's goal
// totals by arena are not in any feed this page reads, so there is no number
// to put under it. Colour, not a score input.
const MIN_HERE = 8    // MOONSHOT's rule: under 8 games here the vs-himself read stays quiet
export default function GoalRink({ rows, host, team, seasons }) {
  const rec = rinkRecord(rows, { host, team })
  if (!rec) return <div style={{ color: C.text3, fontSize: 12 }}>Not on tonight’s slate, so no building to compare.</div>
  const arena = arenaOf(host)?.name || `${host}’s rink`
  if (!rec.games) return <div style={{ color: C.text3, fontSize: 12, lineHeight: 1.5 }}>{arena}: no games there in the {rec.gamesAll} on file ({seasons}).</div>
  const vs = rec.games >= MIN_HERE && rec.goalsPgAll > 0 ? rec.goalsPg / rec.goalsPgAll : null
  const per = rec.goals > 0 ? rec.games / rec.goals : null
  return (
    <div style={{ fontSize: 12, lineHeight: 1.6, color: C.text2 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ color: C.text3 }}>{arena} · {rec.homeTonight ? 'his home ice' : 'on the road'}</span>
        <b style={{ fontFamily: NUM_FONT, color: C.text }}>{rec.goals} G / {rec.games} {rec.games === 1 ? 'game' : 'games'}{per != null ? <span style={{ color: C.text3, fontWeight: 600 }}> · 1 per {per.toFixed(1)}</span> : null}</b>
      </div>
      <div>
        Shots there: <b style={{ fontFamily: NUM_FONT, color: C.text }}>{rec.shots}</b> ({rec.shotsPg.toFixed(1)} a game). Everywhere: <b style={{ fontFamily: NUM_FONT, color: C.text }}>{rec.goalsAll} G in {rec.gamesAll}</b> ({rec.goalsPgAll.toFixed(2)} a game, {rec.shotsPgAll.toFixed(1)} shots).
        {vs != null ? <> Goals a game there are <b style={{ fontFamily: NUM_FONT, color: C.text }}>{vs.toFixed(2)}x</b> his own pace.</> : <> Under {MIN_HERE} games there ({rec.games}) a comparison with his own pace is not made: a few games can say anything.</>}
      </div>
      <div style={{ color: C.text3, fontSize: 12, marginTop: 2 }}>{seasons}, regular season. Context, not part of any score.</div>
    </div>
  )
}
