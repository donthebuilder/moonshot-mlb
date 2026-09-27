'use client'
import { useEffect, useMemo, useState } from 'react'
import PageHeader from './PageHeader'
import DenseTable from './DenseTable'
import { PillRow } from './Filters'

// 🎯 LONGSHOTS (2026-09-27), one page on all three products. Players the
// books price long (median book at or past the sport's line) beside our own
// model's score and CALLED / ON THE BOARD, from /api/odds/longshots
// (lib/odds/longshots.js explains every source). Sorted by model score.
// A price is not a pick and a score is not a probability; the note says so.
//
// Each product passes its own theme, table and player opener -- no sport
// branches in here (lib/routes.js is the one place sports are listed).
const STATUS_WORD = { called: 'CALLED', board: 'ON THE BOARD', off: '' }
const plus = (v) => (v == null ? '—' : v > 0 ? `+${v}` : String(v))
const clock = (iso) => (iso ? new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '')

export default function Longshots({ sport, eyebrow, theme: C, numFont, accent, Table = DenseTable, onOpenPlayer }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [scope, setScope] = useState('all')
  useEffect(() => {
    let alive = true
    fetch(`/api/odds/longshots?sport=${sport}`).then((r) => r.json()).then((j) => { if (alive) { if (j.error) setError(j.error); else setData(j) } }).catch((e) => alive && setError(e.message))
    return () => { alive = false }
  }, [sport])

  const rows = useMemo(() => (data?.rows || []).map((r) => ({
    ...r, statusWord: STATUS_WORD[r.status] || '', matchup: r.opp ? `vs ${r.opp}` : '',
    flag: r.note || '', asOf: `${r.snap || ''} ${clock(r.takenAt)}`.trim(),
  })), [data])
  const called = rows.filter((r) => r.status === 'called').length
  const shown = scope === 'called' ? rows.filter((r) => r.status === 'called') : rows

  // Price and score first: on a phone they are the two columns in view.
  const columns = [
    { key: 'name', label: 'Player', w: 140, heat: false, sticky: true, bold: true },
    { key: 'median', label: 'PRICE', w: 58, heat: false, fmt: plus, title: 'Median book\u2019s price at our newest snapshot' },
    { key: 'score', label: 'SCORE', w: 54, primary: true, dp: 0, title: 'Our model\u2019s score for this market (0\u2013100), as the product publishes it' },
    { key: 'best', label: 'BEST', w: 56, heat: false, fmt: plus, title: 'Longest price any book offered' },
    { key: 'team', label: 'Team', w: 46, heat: false },
    { key: 'matchup', label: 'Opp', w: 56, heat: false },
    { key: 'statusWord', label: 'Call', w: 104, heat: false },
    { key: 'bestBook', label: 'BOOK', w: 78, heat: false },
    { key: 'books', label: 'BOOKS', w: 50, heat: false, title: 'How many books listed him' },
    { key: 'flag', label: 'NOTE', w: 150, heat: false },
    { key: 'asOf', label: 'AS OF', w: 80, heat: false },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <PageHeader eyebrow={eyebrow} title={`Longshots${data?.market ? `: ${data.market}` : ''}`}
        note={data?.date
          ? `Every player the books price at +${data.longAt} or longer on ${data.date}, beside our model's score. Sorted by score. A price is what the books offer, not a pick; a score is a rank, not a chance.`
          : 'Players the books price long, beside our model’s score.'}
        theme={C} numFont={numFont} accent={accent}
        stats={data ? [{ value: rows.length, label: 'LONGSHOTS', tone: C.text2 }, { value: called, label: 'CALLED', tone: accent }, { value: data.priced, label: 'PRICED', tone: C.text3 }] : null} />
      {error && <div role="status" style={{ padding: '10px 12px', border: `1px solid ${C.border}`, borderRadius: 10, color: C.text2, fontSize: 12 }}>Odds are delayed right now. Try again in a minute.</div>}
      {!error && !data && <div style={{ color: C.text3, fontSize: 12 }}>Loading prices…</div>}
      {data && !rows.length && (
        <div style={{ padding: 22, border: `1px dashed ${C.border2 || C.border}`, borderRadius: 12, textAlign: 'center', color: C.text3, fontSize: 12.5 }}>
          {data.reason === 'no prices yet' ? 'No prices yet for the next games. They are read on game days.' : data.reason === 'model not published for this date' ? 'Prices are in, but the model has not published this date yet.' : 'Nobody priced that long has a model score today.'}
        </div>
      )}
      {rows.length > 0 && (
        <>
          <PillRow label="Show" value={scope} onChange={setScope} options={[
            { key: 'all', label: 'All', count: rows.length },
            { key: 'called', label: 'Called only', count: called },
          ]} />
          <Table rows={shown} columns={columns} heatMode="primary" initialSort="score" maxRows={shown.length}
            onRowClick={onOpenPlayer ? (r) => onOpenPlayer(r.id) : null} />
        </>
      )}
      <div style={{ color: C.text3, fontSize: 11, lineHeight: 1.55 }}>
        Prices: SportsGameOdds, read by this site ({data?.priced ?? 0} players priced that day; {data?.modelled ?? 0} have a model score). Snapshots are taken on game days and again before each start; lines move after them.
      </div>
    </div>
  )
}
