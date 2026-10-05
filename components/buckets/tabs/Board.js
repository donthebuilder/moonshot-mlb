'use client'
import { useMemo, useState } from 'react'
import PageHeader from '../../PageHeader'
import HowToRead from '../../HowToRead'
import { C, NUM_FONT } from '../../../lib/nba/theme'
import { useBucketsBoard } from '../../../lib/nba/useBuckets'
import { NBA_MARKETS, MARKET_OPTIONS } from '../../../lib/nba/legs'
import BucketsTable from '../BucketsTable'
import { boardRows, boardColumns, faceOf } from '../boardTable'
import BucketWatch from '../BucketWatch'
import { AngleRow } from '../../Filters'
import { bucketsAngles } from '../../../lib/nba/angles'
import { BucketsCards } from '../BucketsCard'
import { EmptyState, DelayedBanner, Loading, SourceLine, Pills, NavBtn, DayPager, fmtDay, writeHashParam } from '../ui'

// 🎯 PROPS -- the BUCKETS board for one market (lib/nba/boardRead.js): every
// player on the night's rosters ranked by the market's score, one CALLED per
// team in a game, the top third ON THE BOARD. Locked rows come from
// buckets_log (written before tip, never rewritten); before the lock it is a
// PREVIEW, the same arithmetic run now, and says so on every row.
const HOW_NOTES = [
  { title: 'Rank on the night', text: 'BUCKETS ranks every player playing tonight for the market you pick, #1 first.' },
  { title: 'The call', text: 'CALLED is the top-scored player on each team in a game: the game’s higher one is TOP, the other BUCKET. ON THE BOARD is the top third of the night. Calls lock before tip.' },
  { title: 'Score', text: 'A 0-100 rank among tonight’s players on the legs shown beside it (this season and last, pooled by games). A ranking, not a percent.' },
  { title: 'Result', text: 'After the final, what he did. A hit lights up in rim orange; a player who did not play is VOID, not a miss.' },
]

export default function Board({ date, setDate, market = 'pts', onOpenPlayer, onOpenTeam, onOpenGame }) {
  const [m, setM] = useState(market)
  const [calledOnly, setCalledOnly] = useState(false)
  // CARDS FIRST (2026-10-03, Donovan: the props page has the cards, like MLB's); the table one tap away
  const [layout, setLayout] = useState('cards')
  const { data, error, loading } = useBucketsBoard(date, m)
  const D = NBA_MARKETS[m]
  const shown = data?.date || date
  const all = boardRows(data, { calledOnly })
  // ANGLES (2026-10-05): measured on 2025-26 (lib/nba/angles.js), the PTS market only
  const [angle, setAngle] = useState(null)
  const angles = useMemo(() => (m === 'pts' ? bucketsAngles(all) : []), [all, m])
  const angleDef = angle ? angles.find((a) => a.key === angle) : null
  const rows = angleDef ? all.filter(angleDef.test) : all
  const scored = rows.filter((r) => r.score != null)
  const noStarters = D.startersOnly && data && !scored.length
  const games = data?.games || []
  const called = (data?.rows || []).filter((r) => r.status === 'called').length
  const previewN = rows.filter((r) => !r.locked).length
  const pick = (k) => { setM(k); writeHashParam('m', k === 'pts' ? null : k) }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <PageHeader eyebrow={`BUCKETS · PROPS · ${D.label}`} title={shown ? fmtDay(shown) : 'Tonight'} theme={C} numFont={NUM_FONT} accent={C.purple}
        note="Every player playing that day, ranked for one market. One call per team in each game; calls lock before tip and grade after the final."
        stats={data ? [{ value: games.length, label: 'GAMES', tone: C.text2 }, { value: called, label: 'CALLED', tone: C.purple }, { value: data.lockedGames?.length || 0, label: 'LOCKED', tone: C.text2 }] : null} />
      <Pills ariaLabel="Market" value={m} onChange={pick} options={MARKET_OPTIONS} />
      <DayPager shown={shown} date={date} setDate={setDate} disabled={loading}>
        <NavBtn onClick={() => setCalledOnly((v) => !v)} strong={calledOnly} ariaLabel="Called only">{calledOnly ? '✓ Called only' : 'Called only'}</NavBtn>
      </DayPager>
      {angles.length > 0 && <AngleRow defs={angles} pool={all} value={angleDef ? angle : null} onChange={setAngle} accent={C.purple} hideEmpty />}
      {angleDef && <p style={{ margin: 0, fontSize: 12, color: C.text3, lineHeight: 1.5 }}>{angleDef.title}</p>}
      <Pills ariaLabel="Layout" value={layout} onChange={setLayout} options={[{ key: 'cards', text: 'CARDS' }, { key: 'table', text: 'TABLE' }]} />
      <HowToRead id="buckets-board" accent={C.purple} notes={HOW_NOTES} />
      <DelayedBanner error={error} what="the board" />
      {loading && !data ? <Loading what="the board" /> : null}
      {data && !games.length && <EmptyState title="NO GAMES THAT DAY" note="Nothing to rank. Page a day, or the Slate has what’s next." />}
      {noStarters && games.length > 0 && <EmptyState title="NO STARTERS LISTED YET" note="First basket is the ten starters only, scored once the pre-tip box score lists them. Check back near tip." />}
      {D.highVariance && scored.length > 0 && <p style={{ margin: 0, fontSize: 12, color: C.text3 }}>A high-variance lane: the ten starters only, ranked mostly on shot share.</p>}
      {previewN > 0 && rows.length > 0 && !noStarters && (
        <div style={{ color: C.amber, font: `800 12px/1.5 ${NUM_FONT}`, letterSpacing: '.08em' }}>
          {previewN === rows.length ? 'EVERY GAME IS STILL PREVIEW — NOT A CALL YET' : `${previewN} OF ${rows.length} ROWS ARE PREVIEW — NOT A CALL YET`}
          {games.some((g) => g.seasonType === 1) ? ' · PRESEASON' : ''}
        </div>
      )}
      {m === 'pts' && (data?.rows || []).length > 0 && <BucketWatch rows={data.rows} date={data.date} onOpenPlayer={onOpenPlayer} />}
      {rows.length > 0 && !noStarters && layout === 'cards' && (
        <BucketsCards market={m} onOpen={onOpenPlayer} rows={[...rows].filter((r) => Number.isFinite(Number(r.score))).sort((a, b) => b.score - a.score)} />
      )}
      {rows.length > 0 && !noStarters && layout === 'table' && (
        <BucketsTable rows={rows} columns={boardColumns(m, { onOpenTeam, onOpenGame })} statusOf={(r) => r.status}
          onRowClick={(r) => onOpenPlayer?.((r?._raw ?? r).playerId)} faceOf={faceOf}
          dimRow={(r) => Boolean(r.voidReason) || r.status === 'off'}
          initialSort={{ key: 'nightRank', dir: 'asc' }} heatMode="sorted" maxHeight={620} maxRows={Math.max(rows.length, 1)}
          caption="Every player tonight for this market, #1 to the bottom. Column headers sort; each row opens that player; the team and opponent open the club; the game column opens the game." />
      )}
      <SourceLine>Source: ESPN rosters, injuries and season stats, ranked by lib/nba/model.js ({D.version}). Locked rows are the buckets_log rows written before tip; nothing pregame is written after it.</SourceLine>
    </div>
  )
}
