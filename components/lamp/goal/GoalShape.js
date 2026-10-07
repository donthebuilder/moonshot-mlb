'use client'
import { useLampShots } from '../../../lib/nhl/useLamp'
import { ZONES } from '../ShotPanel'
import { C, NUM_FONT } from '../../../lib/nhl/theme'
import LampTable from '../LampTable'
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
  if (loading && !data) return <div style={{ color: C.text3, fontSize: 12 }}>Reading his shots…</div>
  const gs = goalShape(data?.all, data?.all?.recent, ZONES)
  if (!gs) return <div style={{ color: C.text3, fontSize: 12, lineHeight: 1.5 }}>{data ? `No goals on the shot map for him in ${data.seasonLabel || 'this season'} yet.` : 'The shot map has nothing for him yet.'}</div>
  // dense tables, not pills (2026-10-07: no bubbles in the player view)
  const table = (rows, label, total, thin) => (
    <LampTable bare noGroups tight heatMode="sorted" maxHeight={9999} maxRows={8} caption={label}
      rows={rows.map((x) => ({ _key: x.key, label: x.label, goals: x.goals, share: total ? Math.round((100 * x.goals) / total) : null }))}
      columns={[
        { key: 'label', label, heat: false, sticky: true, w: 120, numeric: false, fmt: (v) => <b>{v}</b> },
        { key: 'goals', label: 'G', w: 40, dp: 0 },
        ...(thin ? [] : [{ key: 'share', label: '%', w: 44, dp: 0 }]),
      ]} />
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
          {table(gs.byType.map((t) => ({ key: t.key, label: t.key, goals: t.goals })), 'Type', gs.typed, gs.thin)}
        </div>
      )}
      {gs.zoneRows.length > 0 && (
        <div>
          <div style={{ color: C.text3, font: `800 10px/1 ${NUM_FONT}`, letterSpacing: '.08em', marginBottom: 4 }}>BY ZONE · {gs.zoneN} GOALS IN HIS MOST RECENT ATTEMPTS (UP TO 200)</div>
          {table(gs.zoneRows.map((z) => ({ key: z.key, label: z.label, goals: z.goals })), 'Zone', gs.zoneN, gs.thin)}
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
