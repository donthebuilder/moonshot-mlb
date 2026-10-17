'use client'
// THE RESULT STAMP, LAMP's twin of MOONSHOT's PickVerdictStamp (components/PickVerdictStamp.js, #59): once his game is graded the outcome leads the card.
// Read from the graded goal-board row itself (lamp_goal_log: hit, goals, dressed), nothing else; nothing before the grade, nothing for a man who did not dress.
// A called pick that scored CLEARED the bar (1+ goal), one that did not MISSED it; a man who was not called is not judged, only reported.
import { C, NUM_FONT } from '../../lib/nhl/theme'

export default function LampResultStamp({ row, graded }) {
  if (!graded || !row || row.dressed === false || (row.hit !== true && row.hit !== false)) return null
  const called = row.status === 'called'
  const tone = row.hit ? C.ice : C.text3
  const head = called ? (row.hit ? 'CALLED PICK CLEARED' : 'CALLED PICK MISSED') : (row.hit ? 'SCORED' : 'NO GOAL')
  const goals = Number(row.goals) || 0
  return (
    <div role="status" style={{ display: 'flex', alignItems: 'baseline', gap: 9, flexWrap: 'wrap', border: `1px solid ${tone}55`, background: `${tone}12`, borderRadius: 11, padding: '8px 13px' }}>
      <span style={{ font: `900 11px/1 ${NUM_FONT}`, letterSpacing: '.12em', color: tone }}>{row.hit ? '✓ ' : called ? '✗ ' : ''}{head}</span>
      <span style={{ font: `700 12px/1.4 ${NUM_FONT}`, color: C.text2 }}>{goals} {goals === 1 ? 'goal' : 'goals'}</span>
      {called && <span style={{ fontSize: 12, color: C.text3 }}>needed 1+ goal</span>}
      <span style={{ marginLeft: 'auto', font: `800 11px/1 ${NUM_FONT}`, color: C.text3, letterSpacing: '.08em' }}>GAME FINAL</span>
    </div>
  )
}
