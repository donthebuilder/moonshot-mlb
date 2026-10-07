'use client'
import { useMemo, useState } from 'react'
import PageHeader from '../../PageHeader'
import { C, NUM_FONT } from '../../../lib/nba/theme'
import { useBucketsRecord } from '../../../lib/nba/useBuckets'
import { NBA_MARKETS } from '../../../lib/nba/legs'
import BucketsTable from '../BucketsTable'
import RecordPage from '../../record/RecordPage'
import CallHistory from '../../record/CallHistory'
import CalibrationTable from '../../record/CalibrationTable'
import { nbaRecordModel } from '../../../lib/record/page'
import { DelayedBanner, Loading, SourceLine, EmptyState, Pills, Kicker, fmtDay } from '../ui'

// 🧾 THE RECORD -- MOONSHOT's / TUDDY's / LAMP's one record page
// (components/record/RecordPage.js) with BUCKETS' numbers (lib/record/page.js
// nbaRecordModel): the last night graded, by market with windows, the calls
// that hit, what got away; the full tables are the receipts underneath.
// buckets_log rows are graded after the final and never rewritten. Preseason
// is counted apart (off by default, one tap on).
const MK = Object.keys(NBA_MARKETS)
const LABEL = (k) => NBA_MARKETS[k]?.label || (k === 'first_fg' ? 'FIRST BASKET' : k === 'first_pts' ? 'FIRST POINTS' : k)

export default function Results({ onOpenPlayer, onOpenTeam }) {
  const [pre, setPre] = useState(false)
  const { data, error, loading } = useBucketsRecord(120, { pre })
  const nights = data?.nights || []
  const tot = useMemo(() => {
    const t = {}
    for (const n of nights) for (const [k, v] of Object.entries(n.markets)) { t[k] ||= { n: 0, hit: 0 }; t[k].n += v.n; t[k].hit += v.hit }
    return t
  }, [nights])
  const keys = [...new Set([...MK.map((k) => (k === 'first' ? 'first_fg' : k)), ...Object.keys(tot)])].filter((k) => tot[k]?.n)
  const sumRows = keys.map((k) => ({ _id: k, market: LABEL(k), calls: tot[k].n, hit: tot[k].hit, rate: tot[k].n ? tot[k].hit / tot[k].n : null }))
  const sumCols = [
    { key: 'market', label: 'Market', group: 'Market', w: 120, heat: false, sticky: true, bold: true },
    { key: 'calls', label: 'Calls', group: 'Record', w: 52, heat: false, mono: true },
    { key: 'hit', label: 'Hit', group: 'Record', w: 52, heat: false, mono: true },
    { key: 'rate', label: 'Hit %', group: 'Record', w: 60, heat: false, mono: true, fmt: (v) => (v == null ? '—' : `${(v * 100).toFixed(1)}%`) },
  ]
  const record = useMemo(() => nbaRecordModel({ rec: data, onOpen: (r) => onOpenPlayer?.(r.player_id) }), [data]) // eslint-disable-line react-hooks/exhaustive-deps
  const hits = nights.slice().reverse().flatMap((n) => n.called.map((r) => ({ ...r, _id: `${r.game_date}-${r.player_id}-${r.market}`, playerId: r.player_id, marketLabel: LABEL(r.market) })))
  const hitCols = [
    { key: 'game_date', label: 'Date', group: 'Night', w: 84, heat: false, fmt: (v) => fmtDay(v) },
    { key: 'name', label: 'Player', group: 'Night', w: 150, heat: false, bold: true, sticky: true },
    { key: 'team', label: 'Tm', group: 'Night', w: 52, heat: false, mono: true, teamMark: 'nba', link: (r) => (onOpenTeam ? () => onOpenTeam(r.team) : null) },
    { key: 'marketLabel', label: 'Market', group: 'Call', w: 100, heat: false, mono: true },
    { key: 'actual', label: 'Did', group: 'Call', w: 50, heat: false, mono: true },
    { key: 'score', label: 'Score', group: 'Call', w: 50, heat: false, mono: true },
  ]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <PageHeader eyebrow="BUCKETS · THE RECORD" title="Every graded night" theme={C} numFont={NUM_FONT} accent={C.purple}
        note="Each call is locked before tip and graded after the final. A player who didn’t play is void, not a miss."
        stats={data ? [{ value: nights.length, label: 'NIGHTS', tone: C.text2 }, { value: Object.values(tot).reduce((n, v) => n + v.n, 0), label: 'CALLS', tone: C.purple }] : null} />
      <Pills ariaLabel="Which games" value={pre ? 'pre' : 'reg'} onChange={(k) => setPre(k === 'pre')} options={[{ key: 'reg', text: 'Regular season' }, { key: 'pre', text: 'With preseason' }]} />
      <DelayedBanner error={error} what="the record" />
      {loading && !data ? <Loading what="the record" /> : null}
      {data && data.dbReady === false && <EmptyState title="NOT RECORDING YET" note="The BUCKETS log isn’t reachable right now." />}
      {data?.dbReady && !nights.length && <EmptyState title="NOTHING GRADED YET" note={pre ? 'The first locked night grades after its last final.' : 'No regular-season night is graded yet. “With preseason” shows the preseason nights.'} />}
      {nights.length > 0 && (
        <RecordPage record={record} Table={BucketsTable} calls={<><CalibrationTable sport="nba" Table={BucketsTable} /><CallHistory sport="nba" Table={BucketsTable} onOpenPlayer={onOpenPlayer} title="Every call, its price, its result" /></>} receiptsLabel="every market, every call that hit" receipts={(<>
          {sumRows.length > 0 && <BucketsTable rows={sumRows} columns={sumCols} heatMode="none" maxHeight={9999} maxRows={sumRows.length} caption="Calls and hits per market, every graded night in the window." />}
          {hits.length > 0 && (
            <section>
              <Kicker>THE CALLS THAT HIT</Kicker>
              <BucketsTable rows={hits} columns={hitCols} onRowClick={(r) => onOpenPlayer?.((r?._raw ?? r).playerId)} faceOf={(r) => ({ sport: 'nba', id: r.playerId, name: r.name })}
                heatMode="none" maxHeight={480} maxRows={hits.length} caption="Every call that hit, newest night first. Each row opens that player." />
            </section>
          )}
        </>)} />
      )}
      <SourceLine>Source: buckets_log rows with a grade (/api/buckets/record), the last 120 days.</SourceLine>
    </div>
  )
}
