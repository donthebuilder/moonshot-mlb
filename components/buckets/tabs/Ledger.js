'use client'
import { useMemo, useState } from 'react'
import PageHeader from '../../PageHeader'
import CallStatusBadge from '../../CallStatusBadge'
import { C, NUM_FONT } from '../../../lib/nba/theme'
import { NBA_MARKETS } from '../../../lib/nba/legs'
import { useBucketsLedger } from '../../../lib/nba/useBuckets'
import BucketsTable from '../BucketsTable'
import { EmptyState, DelayedBanner, Loading, SourceLine, Pills, DayPager, RimDot, fmtDay } from '../ui'

// 🧾 THE LEDGER -- LAMP's nightly Ledger, basketball's: every player who
// cleared a market's bar that night, live while the games are on, each with
// the status his row LOCKED with before tip (CallStatusBadge, lib/callStatus
// words). A game that never locked carries no tag -- it is said, not guessed.
const MK = ['pts', 'reb', 'ast', '3pm', 'pra']
const ORDER = { called: 0, board: 1, off: 2 }

export default function Ledger({ date, setDate, onOpenPlayer, onOpenTeam, onOpenGame }) {
  const { data, error, loading } = useBucketsLedger(date)
  const [m, setM] = useState('pts')
  const rows = useMemo(() => (data?.rows || []).filter((r) => r.market === m)
    .sort((a, b) => (ORDER[a.status] ?? 3) - (ORDER[b.status] ?? 3) || b.value - a.value)
    .map((r) => ({ ...r, _id: `${r.gameId}-${r.playerId}-${r.market}` })), [data, m])
  const cap = data?.capture?.[m]
  const columns = [
    { key: 'name', label: 'Player', group: 'Player', w: 150, heat: false, bold: true, sticky: true },
    { key: 'team', label: 'Tm', group: 'Player', w: 52, heat: false, mono: true, teamMark: 'nba', link: (r) => (onOpenTeam ? () => onOpenTeam(r.team) : null) },
    { key: 'opp', label: 'Opp', group: 'Player', w: 52, heat: false, mono: true, dim: true, link: (r) => (onOpenTeam ? () => onOpenTeam(r.opp) : null) },
    { key: 'value', label: NBA_MARKETS[m].label.split(' ')[0], group: 'The night', w: 54, mono: true, primary: true, heat: false, fmt: (v) => <b style={{ color: C.rim }}>{v}</b> },
    { key: 'status', label: 'Locked as', group: 'The night', w: 150, heat: false, statusCol: true, fmt: (v, r) => (v ? <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}><CallStatusBadge status={v} accent={C.purple} />{r.role ? <b style={{ fontSize: 10, color: C.purple }}>{r.role}</b> : null}</span> : <span style={{ fontSize: 11, color: C.text3 }}>game not locked</span>) },
    { key: 'state', label: 'Game', group: 'The night', w: 90, heat: false, mono: true, dim: true, link: (r) => (onOpenGame ? () => onOpenGame(r.gameId) : null), fmt: (v, r) => (v === 'live' ? <span style={{ color: C.rim }}><RimDot size={6} />{r.detail}</span> : 'FINAL') },
  ]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <PageHeader eyebrow={`BUCKETS · THE LEDGER · ${NBA_MARKETS[m].label}`} title={data?.date ? fmtDay(data.date) : 'Tonight'} theme={C} numFont={NUM_FONT} accent={C.purple}
        note="Every player who cleared the bar that night, live while the games are on, with the status his row locked with before tip."
        stats={cap ? [{ value: cap.total, label: 'CLEARED', tone: C.text2 }, { value: cap.called, label: 'CALLED', tone: C.purple }, { value: cap.board, label: 'ON BOARD', tone: C.text2 }] : null} />
      <DayPager shown={data?.date || date} date={date} setDate={setDate} disabled={loading} />
      <Pills ariaLabel="Market" value={m} onChange={setM} options={MK.map((k) => ({ key: k, text: NBA_MARKETS[k].label }))} />
      <DelayedBanner error={error} what="the box scores" />
      {loading && !data ? <Loading what="the night’s box scores" /> : null}
      {data && !data.games.length && <EmptyState title="NO GAMES THAT DAY" note="Page a day." />}
      {data && data.games.length > 0 && !data.games.some((g) => g.state !== 'pre') && <EmptyState title="NOTHING TIPPED YET" note="The ledger fills as the games are played -- live, then final." />}
      {data && data.games.some((g) => g.state !== 'pre') && !rows.length && <EmptyState title={`NOBODY AT ${NBA_MARKETS[m].label} YET`} note="Check another market, or come back as the games go." />}
      {cap?.total > 0 && <p style={{ margin: 0, fontSize: 12, color: C.text2, fontFamily: NUM_FONT }}>Of {cap.total} who cleared it in locked games: <b style={{ color: C.purple }}>{cap.called} CALLED</b> · {cap.board} on the board · {cap.off} not on the board.</p>}
      {rows.length > 0 && <BucketsTable rows={rows} columns={columns} statusOf={(r) => r.status} onRowClick={(r) => onOpenPlayer?.((r?._raw ?? r).playerId)} faceOf={(r) => ({ sport: 'nba', id: r.playerId, name: r.name })}
        heatMode="none" maxHeight={620} maxRows={rows.length} caption="Who cleared the bar, called first. Each row opens that player; the game column opens the game." />}
      <SourceLine>Box scores: ESPN game summaries. Tags: buckets_log rows as locked before tip (/api/buckets/ledger).</SourceLine>
    </div>
  )
}
