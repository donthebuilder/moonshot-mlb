'use client'
import { useLampShots } from '../../../lib/nhl/useLamp'
import { ZONES } from '../ShotPanel'
import { C, NUM_FONT } from '../../../lib/nhl/theme'
import { alpha } from '../../../lib/scales'
import { goalShape, SHAPE_MIN_GOALS } from '../../../lib/nhl/goalLog'

// 💥 HIS GOAL SHAPE (MOONSHOT components/HomerShape.js + lib/hrShape.js
// personalShape: the mix of his homers). The mix of his goals from the shot
// archive (lamp_shots, the same /api/lamp/shots read the shot map above
// makes): by shot type over the season, by zone over his most recent attempts (up to 200)
// (the zone definitions are ShotPanel's own), the distance they come from and
// the strength. Under four goals the counts stand alone and no "his kind of
// goal" is claimed, as MOONSHOT does under four homers. How that mix lines up
// with the goalie he meets is the shot map's own VS GOALIE line, above.
export default function GoalShape({ playerId }) {
  const { data, loading } = useLampShots({ player: playerId })
  if (loading && !data) return <div style={{ color: C.text3, fontSize: 12 }}>Reading the shot archive…</div>
  const gs = goalShape(data?.all, data?.all?.recent, ZONES)
  if (!gs) return <div style={{ color: C.text3, fontSize: 12, lineHeight: 1.5 }}>{data ? `No goals in the shot archive for him in ${data.seasonLabel || 'this season'} yet.` : 'The shot archive has nothing for him yet.'}</div>
  const chip = (key, label, count, share, def) => (
    <span key={key} title={def || `${label}: ${count} goals`} style={{ display: 'inline-flex', gap: 5, alignItems: 'baseline', border: `1px solid ${alpha(C.ice, 0.35)}`, background: alpha(C.ice, 0.08), borderRadius: 999, padding: '3px 10px' }}>
      <span style={{ color: C.ice, font: `800 12px/1 ${NUM_FONT}`, letterSpacing: '.04em', textTransform: 'uppercase' }}>{label}</span>
      <b style={{ color: C.text, font: `800 12px/1 ${NUM_FONT}` }}>{count}</b>
      {share != null && !gs.thin ? <span style={{ color: C.text3, font: `600 12px/1 ${NUM_FONT}` }}>{Math.round(share * 100)}%</span> : null}
    </span>
  )
  const st = gs.strength
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ color: C.text3, fontSize: 12, lineHeight: 1.5 }}>
        {gs.n} {gs.n === 1 ? 'goal' : 'goals'} in {data.seasonLabel} regular season
        {gs.thin ? <b style={{ color: C.amber }}> · thin sample: under {SHAPE_MIN_GOALS} goals, counts only, no “his kind of goal” claimed</b> : null}
      </div>
      {gs.byType.length > 0 && (
        <div>
          <div style={{ color: C.text3, font: `800 10px/1 ${NUM_FONT}`, letterSpacing: '.08em', marginBottom: 4 }}>BY SHOT TYPE · {gs.typed} OF {gs.n} CLASSIFIED</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{gs.byType.map((t) => chip(t.key, t.key, t.goals, gs.typed ? t.goals / gs.typed : null, `${t.goals} goals on ${t.att} unblocked ${t.key} attempts`))}</div>
        </div>
      )}
      {gs.zoneRows.length > 0 && (
        <div>
          <div style={{ color: C.text3, font: `800 10px/1 ${NUM_FONT}`, letterSpacing: '.08em', marginBottom: 4 }}>BY ZONE · {gs.zoneN} GOALS IN HIS MOST RECENT ATTEMPTS (UP TO 200)</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{gs.zoneRows.map((z) => chip(z.key, z.label, z.goals, gs.zoneN ? z.goals / gs.zoneN : null, z.def))}</div>
        </div>
      )}
      <div style={{ color: C.text2, fontSize: 12, lineHeight: 1.55 }}>
        {gs.distGoal != null ? <>His goals come from <b style={{ color: C.text, fontFamily: NUM_FONT }}>{gs.distGoal} ft</b> on average. </> : null}
        {gs.zoneN > 0 ? <>Strength, those {gs.zoneN} goals: even {st.ev}, power play {st.pp}{st.sh ? `, short-handed ${st.sh}` : ''}{st.other ? `, other ${st.other}` : ''}. </> : null}
        This reads where and how his goals have come; it is not a score.
      </div>
    </div>
  )
}
