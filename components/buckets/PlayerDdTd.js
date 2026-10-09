'use client'
// 🏀 HIS DOUBLE-DOUBLE AND TRIPLE-DOUBLE ROWS (2026-10-09). On the player's page: tonight's board row for each of the
// two game-log markets -- the status word the lock wrote (lib/callStatus via CallStatusBadge), his share of games with
// one (a count of games, from his own log), and the result once his game is final. A man whose game isn't tonight, or
// who isn't on that board, shows nothing; a man scored "not on the board" says why in his own row.
import { useMemo } from 'react'
import CallStatusBadge from '../CallStatusBadge'
import { C, NUM_FONT } from '../../lib/nba/theme'
import { NBA_MARKETS, fmtLeg } from '../../lib/nba/legs'
import { useBucketsBoard } from '../../lib/nba/useBuckets'
import BucketsTable from './BucketsTable'
import { Kicker, RimDot } from './ui'

const RATE = { dd: 'ddRate', td: 'tdRate' }

export default function PlayerDdTd({ playerId }) {
  const dd = useBucketsBoard(null, 'dd'), td = useBucketsBoard(null, 'td')
  const rows = useMemo(() => [['dd', dd.data], ['td', td.data]].flatMap(([k, d]) => {
    const r = (d?.rows || []).find((x) => String(x.playerId) === String(playerId))
    if (!r) return []
    return [{ ...r, _id: `${k}-${r.gameId}`, marketLabel: NBA_MARKETS[k].label, rate: r.legs?.[RATE[k]] ?? null, market: k, tonight: r.locked ? 'LOCKED' : 'PREVIEW' }]
  }), [dd.data, td.data, playerId])
  if (!rows.length) return null
  const cols = [
    { key: 'marketLabel', label: 'Market', group: 'Tonight', w: 118, heat: false, bold: true, sticky: true },
    { key: 'status', label: 'Status', group: 'Tonight', w: 150, heat: false, statusCol: true, fmt: (v, r) => (
      <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center', whiteSpace: 'nowrap' }}>
        <CallStatusBadge status={v} accent={C.purple} />
        {r.role ? <b style={{ fontSize: 10, color: C.purple, fontFamily: NUM_FONT }}>{r.role}</b> : null}
        <span style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT, fontWeight: 800, letterSpacing: '.08em' }}>{r.tonight}</span>
      </span>) },
    { key: 'rate', label: 'Of his games', group: 'Tonight', w: 92, heat: false, mono: true, title: 'The share of his last games (up to 82, this season then last) with one, from his game log',
      fmt: (v, r) => (v == null ? <span style={{ color: C.text3 }} title={r.reason || ''}>—</span> : fmtLeg(RATE[r.market], v)) },
    { key: 'actual', label: 'Result', group: 'Result', w: 70, heat: false, mono: true, fmt: (v, r) => (
      r.voidReason ? <span style={{ fontSize: 10, color: C.text3 }}>VOID</span>
        : v == null ? <span style={{ color: C.text3 }}>—</span>
          : <span style={{ color: r.hit ? C.rim : C.text2, fontWeight: 900 }}>{r.hit ? <RimDot size={6} /> : null}{r.hit ? 'YES' : 'NO'}</span>) },
  ]
  return (
    <section aria-label="Double-double and triple-double tonight">
      <Kicker>TONIGHT · DOUBLE-DOUBLE AND TRIPLE-DOUBLE</Kicker>
      <BucketsTable rows={rows} columns={cols} statusOf={(r) => r.status} heatMode="none" maxHeight={9999} maxRows={2} initialSort={null}
        caption="His board row for each market tonight: the status the lock gave him, the share of his games with one, the result once final." />
      {rows.some((r) => r.status === 'off' && r.reason) ? <p style={{ margin: '6px 0 0', fontSize: 12, color: C.text3, lineHeight: 1.5 }}>{rows.filter((r) => r.status === 'off' && r.reason).map((r) => `${r.marketLabel}: ${r.reason}`).join(' · ')}</p> : null}
    </section>
  )
}
