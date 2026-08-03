'use client'
import { useMemo } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { n, nn, hrScore, hitScore, prodScore, tbScore, teamOf, oppOf } from '../lib/player'
import Heatmap from './Heatmap'

// Slate at a glance — ported from the Streamlit Games tab.
//
// "Best game score 61.2" tells you a number on a scale nobody knows. These
// tiles answer questions instead: how much power is on tonight, WHICH game is
// the one, how much of the slate is actually confirmed, where the exploitable
// spots are.

export const med = (vals) => {
  const v = vals.map(Number).filter(Number.isFinite).sort((a, b) => a - b)
  if (!v.length) return 0
  const m = Math.floor(v.length / 2)
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2
}

// One number per hitter: the median of his four HR-relevant scores.
// Median rather than mean on purpose -- a hitter with three strong marks and
// one weak one still reads strong, and one inflated score can't drag the whole
// thing up on its own.
const playerScore = (p) => med([
  hrScore(p), prodScore(p), nn(p?.hrw_score), nn(p?.damage_conversion_score),
])

export default function SlateGlance({ games, onGameClick }) {
  const rows = useMemo(() => games.map((g) => {
    const gp = g.players || []
    const head = gp.reduce((a, b) => (hrScore(b) > hrScore(a) ? b : a), gp[0] || {})
    return {
      label: `${g.away || teamOf(head)} @ ${g.home || oppOf(head)}`,
      game_pk: g.game_pk,
      values: {
        'Game Score': med(gp.map(playerScore)),
        'Med HR': med(gp.map(hrScore)),
        'Med HRR': med(gp.map(prodScore)),
        'Med HRW': med(gp.map((x) => nn(x?.hrw_score))),
        'Med DC': med(gp.map((x) => nn(x?.damage_conversion_score))),
        'Med Hit': med(gp.map(hitScore)),
        'Med TB': med(gp.map(tbScore)),
        'Top HR': Math.max(...gp.map(hrScore), 0),
        'Top HRR': Math.max(...gp.map(prodScore), 0),
      },
    }
  }).sort((a, b) => b.values['Game Score'] - a.values['Game Score']), [games])

  if (!rows.length) return null


  return (
    <div style={{ marginBottom: 18 }}>
      <Heatmap
        rows={rows}
        columns={['Game Score', 'Med HR', 'Med HRR', 'Med HRW', 'Med DC', 'Med Hit', 'Med TB', 'Top HR', 'Top HRR']}
        title="Game × metric — brighter is better for hitters"
        labelWidth={150}
        onRowClick={onGameClick ? (r) => onGameClick(r.game_pk) : null}
        caption="Sorted by Game Score. Peaks (Top HR / Top HRR) say whether there's a play here; the medians say whether the whole lineup is live or it's one guy."
      />
    </div>
  )
}
