'use client'
import { C, NUM_FONT } from '../../lib/nba/theme'
import { NBA_MARKETS } from '../../lib/nba/model'
import { ACTUAL_WORD } from '../../lib/nba/legs'

// THE OUTCOME LEADS (2026-10-17): MOONSHOT's PickVerdictStamp (components/PickVerdictStamp.js), BUCKETS' words. Once the points board's locked row on him
// is graded, one stamp above the card says whether the call cleared, from the row's own result (buckets_log actual / hit; the bar is the market's).
// It says nothing before the grade, and nothing for a player who was never called (the stamp is for the call, not for every box score). A void
// row (he did not play) reads as that. No red and no green: the product accent is a clear, the quiet ink a miss.
export default function BucketsPickStamp({ row, market = 'pts' }) {
  if (!row || row.status !== 'called') return null
  const void_ = Boolean(row.voidReason)
  if (!void_ && (row.hit == null || row.actual == null)) return null
  const def = NBA_MARKETS[market]
  const tone = void_ ? C.text3 : row.hit ? C.purple : C.text3
  const head = void_ ? `${def.label} CALL VOID` : row.hit ? `${def.label} CALL CLEARED` : `${def.label} CALL MISSED`
  return (
    <div role="status" data-pm="pick-stamp" style={{ display: 'flex', alignItems: 'baseline', gap: 9, flexWrap: 'wrap', border: `1px solid ${tone}55`, background: `${tone}12`, borderRadius: 11, padding: '8px 13px', marginBottom: 10 }}>
      <span style={{ font: `900 11px/1 ${NUM_FONT}`, letterSpacing: '.12em', color: tone }}>{void_ ? '' : row.hit ? '✓ ' : '✗ '}{head}</span>
      <span style={{ font: `700 12px/1.4 ${NUM_FONT}`, color: C.text2 }}>{void_ ? 'he did not play' : `${row.actual} ${ACTUAL_WORD[market] || ''}`.trim()}</span>
      {def.bar != null && <span style={{ fontSize: 12, color: C.text3 }}>needed {def.bar}+</span>}
    </div>
  )
}
