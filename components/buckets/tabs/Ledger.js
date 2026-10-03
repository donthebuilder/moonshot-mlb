'use client'
import { useMemo, useState } from 'react'
import PageHeader from '../../PageHeader'
import CallStatusBadge from '../../CallStatusBadge'
import { C, NUM_FONT } from '../../../lib/nba/theme'
import { NBA_MARKETS } from '../../../lib/nba/legs'
import { useBucketsLedger } from '../../../lib/nba/useBuckets'
import BucketsTable from '../BucketsTable'
import { LedgerFrame, LedgerHead, WatchStrip, ScorerChips } from '../../ledger/LedgerBlocks'
import { EmptyState, DelayedBanner, Loading, SourceLine, Pills, DayPager, RimDot, fmtDay } from '../ui'

// 🧾 THE LEDGER -- LAMP's nightly Ledger, basketball's: every player who
// cleared a market's bar that night, live while the games are on, each with
// the status his row LOCKED with before tip (CallStatusBadge, lib/callStatus
// words). A game that never locked carries no tag -- it is said, not guessed.
// THE LEDGER BLOCKS (2026-10-03): under the table, the same frame LAMP, TUDDY
// and MOONSHOT draw their night in (components/ledger/LedgerBlocks.js): the
// calls that cleared out of the calls written (one per team in each locked
// game), and who cleared as chips with his club's logo. The rows carry no
// position and NBA first baskets aren't in /api/ledger/first, so the
// by-position bars and First scorers are not drawn rather than guessed.
const MK = ['pts', 'reb', 'ast', '3pm', 'pra']
const ORDER = { called: 0, board: 1, off: 2 }

export default function Ledger({ date, setDate, onOpenPlayer, onOpenTeam, onOpenGame }) {
  const { data, error, loading } = useBucketsLedger(date)
  const [m, setM] = useState('pts')
  const rows = useMemo(() => (data?.rows || []).filter((r) => r.market === m)
    .sort((a, b) => (ORDER[a.status] ?? 3) - (ORDER[b.status] ?? 3) || b.value - a.value)
    .map((r) => ({ ...r, _id: `${r.gameId}-${r.playerId}-${r.market}` })), [data, m])
  const cap = data?.capture?.[m]
  const unit = NBA_MARKETS[m].label.split(' ')[0]
  const locked = (data?.lockedGames || []).length
  const calledIn = rows.filter((r) => r.status === 'called')
  const live = (data?.games || []).some((g) => g.state === 'live')
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
        stats={cap ? [{ value: rows.length, label: 'CLEARED', tone: C.text2 },   // every row that cleared; cap.total counts locked games only (said 0 on an unlocked night)
 { value: cap.called, label: 'CALLED', tone: C.purple }, { value: cap.board, label: 'ON BOARD', tone: C.text2 }] : null} />
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
      {rows.length > 0 && (
        <LedgerFrame accent={C.purple} header={<LedgerHead title="🧾 Bucket ledger" count={rows.length} countWord={`cleared ${NBA_MARKETS[m].label}`} note={live ? 'builds as the games play' : 'the finals'} accent={C.purple} />}>
          <WatchStrip color={C.purple} label="The calls:" hits={calledIn.length} watched={locked * 2}
            sentence={`cleared ${NBA_MARKETS[m].label} -- one call per team in each of the ${locked} locked game${locked === 1 ? '' : 's'}, written before tip.`}>
            {calledIn.map((r) => <span key={r._id}>{' · '}<b onClick={() => onOpenPlayer?.(r.playerId)} style={{ color: C.text, cursor: 'pointer' }}>{r.name}</b><span style={{ color: C.text3, fontFamily: NUM_FONT }}> {r.value} {unit}</span></span>)}
          </WatchStrip>
          <ScorerChips sport="nba" accent={C.purple} preview={12} cards={rows.map((r) => ({
            key: r._id, icon: '🏀', team: r.team, name: r.name, milestone: r.status === 'called', numHot: r.status === 'called',
            num: `${r.value} ${unit}`, spot: r.status === 'called' ? 'CALLED' : r.status === 'board' ? 'ON THE BOARD' : null, onClick: () => onOpenPlayer?.(r.playerId),
            title: `${r.name} (${r.team}) -- ${r.value} ${unit} vs ${r.opp}${r.status ? ` · locked ${r.status === 'called' ? 'CALLED' : r.status === 'board' ? 'ON THE BOARD' : 'NOT ON THE BOARD'}` : ' · game not locked'}`,
          }))} />
        </LedgerFrame>
      )}
      <SourceLine>Box scores: ESPN game summaries. Tags: buckets_log rows as locked before tip (/api/buckets/ledger).</SourceLine>
    </div>
  )
}
