'use client'
// THE STRAIGHT RECORD LINE, ONE PER SPORT (2026-10-10, Donovan approved). n, hit rate with its 95% Wilson
// interval, the rate the stored lock prices imply for the same calls, and units at the median and the best
// price only once 100+ calls carry a stored price. Every number is a count of the rows /api/record/calls
// returns (lib/odds/gradedPicks pricedPicks; MLB: the locked calls, lib/record/mlbCalls.js); the arithmetic is
// lib/record/callsLanded.js, which reads lib/interval.js and lib/odds/roi.js. Nothing typed, nothing printed
// under 1 graded call. The Record tab's CallHistory prints the same line above its call list.
import { useMemo } from 'react'
import { useLiveFetch } from '../../lib/useLiveFetch'
import { useSportTheme } from '../SportTheme'
import { straightLine, straightWords, STRAIGHT_CALL_WORD } from '../../lib/record/callsLanded'
import { TYPE } from '../../lib/theme'

export default function StraightRecordLine({ sport }) {
  const { C, NUM_FONT, accent } = useSportTheme()
  const { data } = useLiveFetch(`/api/record/calls?sport=${sport}`)
  const line = useMemo(() => straightLine(data?.calls || []), [data])
  if (!line) return null
  const words = straightWords(line, { callWord: STRAIGHT_CALL_WORD[sport] || 'calls' })
  return (
    <section aria-label="The straight record" style={{ margin: '4px 0 12px' }}>
      <div style={{ color: accent, font: `900 ${TYPE.label}px/1 ${NUM_FONT}`, letterSpacing: '.14em', margin: '4px 0 6px' }}>THE STRAIGHT RECORD</div>
      <p style={{ margin: 0, fontSize: TYPE.body, color: C.text2, lineHeight: 1.5 }}>
        <b style={{ color: C.text }}>{words[0]}</b> {words.slice(1).join(' ')}
      </p>
    </section>
  )
}
