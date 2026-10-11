'use client'
import { C, NUM_FONT } from '../../lib/nhl/theme'
import { useLampGoalieWeakMany } from '../../lib/nhl/useLamp'
import { WEAK_FLOOR, leagueWord } from '../../lib/nhl/goalieWeak'
import { seasonLabel } from '../../lib/nhl/reduce'
import PlayerInjuryChip from '../injuries/PlayerInjuryChip'
import Tap from '../Tap'
import { SpotsTable } from './GoalieWeakSpots'
import { Loading } from './ui'

// 🥅 THE TEAM PAGE'S GOALIE READ (2026-10-11, Donovan: "build out the team pages"). For each of the club's goalies: his
// name (a link), his injury chip (the shared injury layer: it renders nothing when he is not listed), the sample, and the
// zones where he has allowed the most goals above the league (lib/nhl/goalieWeak.js holds the rules; the SAME table the
// game page draws). Information only: a weak zone is where goals have gone in, not a forecast. It reads nothing until
// the Goalies section is opened, and then one request for all of the club's goalies.
const note = { margin: 0, color: C.text3, fontSize: 12.5, lineHeight: 1.5 }

function Body({ w, loading, error }) {
  if (loading && !w) return <Loading what="his zones" />
  if (!w) return <p style={note}>{error ? 'His zones are delayed.' : 'No zone read.'}</p>
  if (w.state === 'unavailable') return <p style={note}>The goalie zone read is not available right now. Nothing is guessed in its place.</p>
  if (w.state === 'thin') return <p style={{ ...note, color: C.text2 }}>Too few to read: {w.sampleLabel}. A goalie is read from {WEAK_FLOOR.starts} starts or {WEAK_FLOOR.shots} shots against; under that, no zone is ranked.</p>
  if (w.state === 'none') return <p style={{ ...note, color: C.text2 }}>No zone is clearly above the league for him: none has {WEAK_FLOOR.zoneShots}+ shots, {WEAK_FLOOR.zoneGoals}+ goals and a gap of more than one standard error over the league’s rate.</p>
  return (
    <>
      <SpotsTable w={w} />
      <div style={{ color: C.text3, font: '700 11px/1.45 system-ui, sans-serif', marginTop: 4 }}>vs {leagueWord(w)}.</div>
    </>
  )
}

export default function TeamGoalies({ goalies = [], season = null, team = null, onOpenPlayer = null }) {
  const ids = goalies.map((g) => g.id)
  const { data, loading, error } = useLampGoalieWeakMany(ids, season, ids.length > 0)
  if (!ids.length) return null
  // one id comes back as the goalie's own answer; several as { goalies: { [id]: answer } }
  const of = (id) => (data?.goalies ? data.goalies[id] || null : data && String(data.goalie) === String(id) ? data : null)
  return (
    <section aria-label={`${team || 'Club'} goalies: where each is weak`} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ color: C.ice, font: `900 11px/1 ${NUM_FONT}`, letterSpacing: '.16em' }}>WHERE EACH GOALIE IS WEAK{season ? ` · ${seasonLabel(season).toUpperCase()}` : ''}</div>
      {goalies.map((g) => {
        const w = of(g.id)
        return (
          <div key={g.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', minHeight: 24 }}>
              <Tap onClick={onOpenPlayer ? () => onOpenPlayer(g.id) : null}><span style={{ color: C.text, fontSize: 13, fontWeight: 700 }}>{g.name}</span></Tap>
              <PlayerInjuryChip who={{ id: g.id, name: g.name, team: g.team }} C={C} font={NUM_FONT} size={10} />
              {w?.sampleLabel ? <span style={{ color: C.text3, font: `700 11px/1.2 ${NUM_FONT}` }}>{w.sampleLabel}</span> : null}
            </div>
            <Body w={w} loading={loading} error={error} />
          </div>
        )
      })}
      <p style={{ margin: 0, color: C.text3, font: '700 11px/1.5 system-ui, sans-serif' }}>
        Regular season. A weak zone is where goals have gone in, not a forecast. The league’s feed has no net location, so there is no glove, blocker or five-hole read.
      </p>
    </section>
  )
}
