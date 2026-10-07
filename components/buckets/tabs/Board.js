'use client'
import { useMemo, useState } from 'react'
import PageHeader from '../../PageHeader'
import HowToRead from '../../HowToRead'
import { C, NUM_FONT } from '../../../lib/nba/theme'
import { useBucketsBoard } from '../../../lib/nba/useBuckets'
import { NBA_MARKETS, MARKET_OPTIONS, LEG_LABEL, fmtLeg } from '../../../lib/nba/legs'
import BucketsTable from '../BucketsTable'
import { boardRows, boardColumns, faceOf } from '../boardTable'
import FullBoard from './FullBoard'
import { useWhySheet, whyColumn } from '../../WhySheet'
import BucketWatch from '../BucketWatch'
import { AngleRow } from '../../Filters'
import { bucketsAngles } from '../../../lib/nba/angles'
import { BucketsCards } from '../BucketsCard'
import { EmptyState, DelayedBanner, Loading, SourceLine, Pills, NavBtn, DayPager, fmtDay, writeHashParam, readHashParam } from '../ui'

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

// MERGED WITH RANKINGS (2026-10-06): this is the Rankings page. One market at a time, or ALL MARKETS
// (the old every-market table), the table first, and a WHY on every row.
const ALL = 'all'
const MARKET_PILLS = [...MARKET_OPTIONS, { key: ALL, text: 'ALL MARKETS' }]
const ordW = (p) => { const n = Math.round(p); const r = n % 100; return `${n}${r >= 11 && r <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'}` }
const LEG_WORDS = { ptsPg: 'points per game', rebPg: 'rebounds per game', astPg: 'assists per game', minPg: 'minutes', fgaPg: 'shot attempts', ftaPg: 'free throw attempts', tpmPg: 'threes made', tpaPg: 'threes tried', tpPct: 'three-point shooting', praPg: 'points, rebounds and assists', fgaShare: 'share of his team’s shots', oppPts: 'points his opponent allows', oppReb: 'rebounds his opponent allows', oppAst: 'assists his opponent allows', oppTpm: 'threes his opponent allows' }
/** His strongest leg in plain words: { lead, short } (null when no leg has a percentile). */
function plainWhy(r, market) {
  const legs = (NBA_MARKETS[market].legs || []).map((l) => ({ l, p: Number(r.pct?.[l]) })).filter((x) => Number.isFinite(x.p)).sort((a, b) => b.p - a.p)
  if (!legs.length) return null
  const w = LEG_WORDS[legs[0].l] || (LEG_LABEL[legs[0].l] || legs[0].l).toLowerCase()
  return { lead: `His best part is ${w}: ${ordW(legs[0].p)} percentile among tonight’s players.`, short: `Best part: ${w}, ${ordW(legs[0].p)} percentile.` }
}
function whyItemFor(r, market, rank) {
  const D = NBA_MARKETS[market]
  const parts = (D.legs || []).map((l) => {
    const v = r.legs?.[l]; const p = r.pct?.[l]
    if (v == null && p == null) return null
    return { label: LEG_LABEL[l] || l, text: `${fmtLeg(l, v)}${Number.isFinite(Number(p)) ? ` · ${ordW(p)} percentile` : ''}`, pct: Number.isFinite(Number(p)) ? Number(p) : null }
  }).filter(Boolean)
  const id = r.playerId
  return {
    name: r.name, rank,
    lead: (r.status === 'off' && r.reason) ? `Not on the board: ${r.reason}` : (plainWhy(r, market)?.lead || null),
    watch: r.injury || null,
    parts,
    links: [
      { label: 'His page: season line, game log, every shot', href: `#sport=nba&tab=player&player=${id}` },
      { label: 'Where he shoots from', href: `#sport=nba&tab=shotmap&player=${id}` },
      { label: 'Who is running hot: last 5 and 10', href: '#sport=nba&tab=hot' },
      { label: 'Tonight’s defences, ranked', href: '#sport=nba&tab=matchups' },
    ],
  }
}

export default function Board({ date, setDate, market = 'pts', onOpenPlayer, onOpenTeam, onOpenGame }) {
  const { open: openWhy, sheet: whySheet } = useWhySheet({ theme: C, accent: C.purple, numFont: NUM_FONT })
  const [m, setM] = useState(() => (String(readHashParam('m') || '').toLowerCase() === ALL ? ALL : market))
  const mk = m === ALL ? 'pts' : m
  const [calledOnly, setCalledOnly] = useState(false)
  // TABLE FIRST on Rankings (2026-10-06): the cards live on Props; one tap here
  const [layout, setLayout] = useState('table')
  const { data, error, loading } = useBucketsBoard(date, mk)
  const D = NBA_MARKETS[mk]
  const shown = data?.date || date
  const all = boardRows(data, { calledOnly })
  // ANGLES (2026-10-05): measured on 2025-26, every market (lib/nba/angles.js); only the ones with an edge
  const [angle, setAngle] = useState(null)
  const angles = useMemo(() => bucketsAngles(all, mk), [all, mk])
  const angleDef = angle ? angles.find((a) => a.key === angle) : null
  const rows = angleDef ? all.filter(angleDef.test) : all
  const scored = rows.filter((r) => r.score != null)
  const noStarters = D.startersOnly && data && !scored.length
  const games = data?.games || []
  const called = (data?.rows || []).filter((r) => r.status === 'called').length
  const previewN = rows.filter((r) => !r.locked).length
  const pick = (k) => { setM(k); setAngle(null); writeHashParam('m', k === 'pts' ? null : k) }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <PageHeader eyebrow={`BUCKETS · RANKINGS · ${m === ALL ? 'ALL MARKETS' : D.label}`} title={shown ? fmtDay(shown) : 'Tonight'} theme={C} numFont={NUM_FONT} accent={C.purple}
        note="Who we rank tonight, and why. Every player playing that day, ranked for one market. One call per team in each game; calls lock before tip and grade after the final."
        stats={data ? [{ value: games.length, label: 'GAMES', tone: C.text2 }, { value: called, label: 'CALLED', tone: C.purple }, { value: data.lockedGames?.length || 0, label: 'LOCKED', tone: C.text2 }] : null} />
      <Pills ariaLabel="Market" value={m} onChange={pick} options={MARKET_PILLS} />
      <DayPager shown={shown} date={date} setDate={setDate} disabled={loading}>
        <NavBtn onClick={() => setCalledOnly((v) => !v)} strong={calledOnly} ariaLabel="Called only">{calledOnly ? '✓ Called only' : 'Called only'}</NavBtn>
      </DayPager>
      <HowToRead id="buckets-board" accent={C.purple} notes={HOW_NOTES} />
      {m === ALL ? <FullBoard embedded date={date} setDate={setDate} onOpenPlayer={onOpenPlayer} onOpenTeam={onOpenTeam} onOpenGame={onOpenGame} /> : (<>
      {angles.length > 0 && <AngleRow defs={angles} pool={all} value={angleDef ? angle : null} onChange={setAngle} accent={C.purple} hideEmpty />}
      {angleDef && <p style={{ margin: 0, fontSize: 12, color: C.text3, lineHeight: 1.5 }}>{angleDef.title}</p>}
      {m !== ALL && <Pills ariaLabel="Layout" value={layout} onChange={setLayout} options={[{ key: 'table', text: 'TABLE' }, { key: 'cards', text: 'CARDS' }]} />}
      <DelayedBanner error={error} what="the board" />
      {loading && !data ? <Loading what="the board" /> : null}
      {data && !games.length && <EmptyState title="NO GAMES THAT DAY" note="Nothing to rank. Page a day, or the Slate has what’s next." />}
      {noStarters && games.length > 0 && <EmptyState title="NO STARTERS LISTED YET" note="First basket is the ten starters only, scored once the pre-tip box score lists them. Check back near tip." />}
      {D.highVariance && scored.length > 0 && <p style={{ margin: 0, fontSize: 12, color: C.text3 }}>A high-variance lane: the ten starters only, ranked mostly on shot share.</p>}
      {previewN > 0 && rows.length > 0 && !noStarters && (
        <div style={{ color: C.amber, font: `800 12px/1.5 ${NUM_FONT}`, letterSpacing: '.08em' }}>
          {previewN === rows.length && games.length > 0 && games.every((g) => g.state === 'final') ? 'THIS NIGHT NEVER LOCKED — THE ROWS ARE A PREVIEW, NOT CALLS'
            : previewN === rows.length ? 'EVERY GAME IS STILL PREVIEW — NOT A CALL YET' : `${previewN} OF ${rows.length} ROWS ARE PREVIEW — NOT A CALL YET`}
          {games.some((g) => g.seasonType === 1) ? ' · PRESEASON' : ''}
        </div>
      )}
      {mk === 'pts' && m !== ALL && (data?.rows || []).length > 0 && <BucketWatch rows={data.rows} date={data.date} onOpenPlayer={onOpenPlayer} />}
      {rows.length > 0 && !noStarters && layout === 'cards' && (
        <BucketsCards market={mk} onOpen={onOpenPlayer} rows={[...rows].filter((r) => Number.isFinite(Number(r.score))).sort((a, b) => b.score - a.score)} />
      )}
      {rows.length > 0 && !noStarters && layout === 'table' && (
        <BucketsTable rows={rows} columns={boardColumns(m, { onOpenTeam, onOpenGame, whyCol: whyColumn({ textOf: (r) => (r.status === 'off' && r.reason ? r.reason : plainWhy(r, m)?.short || ''), itemOf: (r) => whyItemFor(r, m, r.nightRank), open: openWhy, theme: C, numFont: NUM_FONT, w: 165 }) })} statusOf={(r) => r.status}
          onRowClick={(r) => onOpenPlayer?.((r?._raw ?? r).playerId)} faceOf={faceOf}
          dimRow={(r) => Boolean(r.voidReason) || r.status === 'off'}
          initialSort={{ key: 'nightRank', dir: 'asc' }} heatMode="sorted" maxHeight={620} maxRows={Math.max(rows.length, 1)}
          caption="Every player tonight for this market, #1 to the bottom. Column headers sort; each row opens that player; the team and opponent open the club; the game column opens the game." />
      )}
      </>)}
      {whySheet}
      <SourceLine>Where this comes from: the league’s rosters, injury reports and season stats. A locked row is written before tip and never changed after it.</SourceLine>
    </div>
  )
}
