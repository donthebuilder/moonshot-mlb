'use client'
import { C, NUM_FONT } from '../../../lib/nhl/theme'
import { coldCase } from '../../../lib/nhl/goalLog'

// 🧊 THE COLD CASE (MOONSHOT components/ColdCase.js: "the argument against him").
// Every other panel on the page argues for a goal. This one reads his own log
// and tonight's board for the case against: how often he goes without, the
// drought, whether the recent goals outran his shooting, ice time, the
// building's opponent, the defence he meets. Each line carries the games it
// stands on and a sentence is only written when there is a sample under it.
// Tonight's starting goalie is not published before the game, so no goalie
// claim is made here; the shot map above prints his shots against the goalie
// the opponent is likeliest to start.
export default function GoalColdCase({ rows, ctx }) {
  const cc = coldCase(rows, ctx)
  if (!cc) return <div style={{ color: C.text3, fontSize: 12, lineHeight: 1.5 }}>Not enough games logged ({rows?.length || 0}) to make the case against him; it needs eight.</div>
  return (
    <div>
      <div style={{ color: C.text3, fontSize: 12, lineHeight: 1.5, marginBottom: 6 }}>The argument against a goal, from his own {cc.n} games{ctx.opp ? ` and tonight against ${ctx.opp}` : ''}.</div>
      {cc.items.map((it) => (
        <div key={it.key} style={{ display: 'flex', gap: 8, alignItems: 'baseline', padding: '4px 0', borderTop: `1px solid ${C.border}`, fontSize: 12, lineHeight: 1.55, color: C.text2 }}>
          <b style={{ flex: '0 0 92px', color: C.ice, font: `800 10px/1.5 ${NUM_FONT}`, letterSpacing: '.06em', textTransform: 'uppercase' }}>{it.label}</b>
          <span style={{ minWidth: 0 }}>{it.text}</span>
        </div>
      ))}
    </div>
  )
}
