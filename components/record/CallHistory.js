'use client'
// EVERY CALL, ITS PRICE, ITS RESULT (2026-10-04, Donovan's user review build 2:
// "no list of calls with price and result ... verify 14/13"). One row per graded
// call this season from /api/record/calls: when, who, the call, the best price at
// lock and its book, the result, and what $10 at that price did. The table's own
// footer downloads it as CSV.
//
// A RETURN IS NOT QUOTED UNDER 100 PRICED CALLS (lib/odds/roi.js MIN_N): under
// that the line says how many there are and stops. Every row still shows its
// own $10 -- that is arithmetic on one bet, not a claim about the method.
import { useMemo } from 'react'
import { useLiveFetch } from '../../lib/useLiveFetch'
import { useSportTheme } from '../SportTheme'
import { fmtOdds, profitOn } from '../../lib/odds'
import { MIN_N } from '../../lib/odds/roi'
import { TYPE } from '../../lib/theme'

const RESULT = { hit: '✅ hit', miss: '❌ miss', void: '➖ void' }
const money = (v) => (v == null ? '—' : `${v >= 0 ? '+' : '−'}$${Math.abs(v).toFixed(2).replace(/\.00$/, '')}`)

export default function CallHistory({ sport, Table, onOpenPlayer = null, title = 'Every call, its price, its result' }) {
  const { C, NUM_FONT, accent } = useSportTheme()
  const { data, error } = useLiveFetch(`/api/record/calls?sport=${sport}`)
  const rows = useMemo(() => (data?.calls || []).map((c, i) => {
    const net = c.best == null || c.result === 'void' ? null : c.result === 'hit' ? profitOn(c.best, 10) : -10
    return { ...c, _key: `${c.date}-${c.player_id}-${i}`, when: c.week ? `Wk ${c.week}` : c.date, price: c.best, net }
  }), [data, sport])
  const graded = rows.filter((r) => r.result !== 'void')
  const hits = graded.filter((r) => r.result === 'hit').length
  const priced = graded.filter((r) => r.net != null)
  const net = priced.reduce((s, r) => s + r.net, 0)

  if (error && !data) return <p style={{ fontSize: TYPE.body, color: C.text3 }}>The call history is delayed — try again in a minute.</p>
  if (!data) return null
  if (!rows.length) return null
  return (
    <section aria-label={title} style={{ marginTop: 18 }}>
      <div style={{ color: accent, font: `900 10px/1 ${NUM_FONT}`, letterSpacing: '.14em', margin: '4px 0 6px' }}>{title.toUpperCase()}</div>
      <p style={{ margin: '0 0 8px', fontSize: TYPE.body, color: C.text2, lineHeight: 1.5 }}>
        <b style={{ color: C.text }}>{hits} of {graded.length}</b> hit this season.{' '}
        {priced.length >= MIN_N
          ? <>$10 on each of the {priced.length} priced calls at the best price: <b style={{ color: net >= 0 ? accent : C.text }}>{money(net)}</b>.</>
          : <>{priced.length} have a price from lock — a return isn&apos;t quoted under {MIN_N}.</>}
      </p>
      <Table rows={rows} maxRows={12} maxHeight={9999} heatMode="sorted" initialSort={null}
        onRowClick={onOpenPlayer ? (r) => onOpenPlayer((r?._raw ?? r).player_id) : undefined}
        caption="One row per graded call, newest first. Price = the longest any book offered at lock; blank before prices were saved. $10 = what that price paid on a hit, or the $10 lost on a miss."
        columns={[
          { key: 'when', label: rows.some((r) => r.week) ? 'Week' : 'Date', group: 'Call', heat: false, w: 84, mono: true },
          { key: 'name', label: 'Player', group: 'Call', heat: false, sticky: true, bold: true, w: 150 },
          { key: 'team', label: 'Team', group: 'Call', heat: false, w: 50 },
          { key: 'role', label: 'Call', group: 'Call', heat: false, w: 70 },
          { key: 'price', label: 'Price', group: 'Price', heat: false, w: 60, mono: true, fmt: (v) => (v == null ? '—' : fmtOdds(v)) },
          { key: 'book', label: 'Book', group: 'Price', heat: false, w: 84, fmt: (v) => v || '—' },
          { key: 'result', label: 'Result', group: 'Result', heat: false, w: 70, fmt: (v) => RESULT[v] || '—' },
          { key: 'net', label: '$10', group: 'Result', heat: false, w: 64, mono: true, fmt: (v) => money(v) },
        ]} />
    </section>
  )
}
