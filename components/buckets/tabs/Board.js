'use client'
import { useMemo, useState } from 'react'
import PageHeader from '../../PageHeader'
import HowToRead from '../../HowToRead'
import { useIsPhone } from '../../MobileFold'
import { C, NUM_FONT } from '../../../lib/nba/theme'
import { useBucketsBoard, useBucketsExpected } from '../../../lib/nba/useBuckets'
import { NBA_MARKETS, MARKET_OPTIONS, LEG_LABEL, fmtLeg, RAW_OF } from '../../../lib/nba/legs'
import BucketsTable from '../BucketsTable'
import { boardRows, boardColumns, faceOf, XPTS_MARKETS } from '../boardTable'
import FullBoard from './FullBoard'
import { useWhySheet, whyColumn } from '../../WhySheet'
import BucketWatch from '../BucketWatch'
import { AngleRow, PillRow } from '../../Filters'
import BoardTopBar from '../../BoardTopBar'
import FiltersDrawer, { DrawerSection, drawerChip } from '../../FiltersDrawer'
import RangeDual from '../../RangeDual'
import { bucketsAngles } from '../../../lib/nba/angles'
import { BucketsCards } from '../BucketsCard'
import CardButton from '../../CardButton'
import { downloadBucketsBoardCard } from '../shareCard'
import { EmptyState, DelayedBanner, Loading, SourceLine, Pills, NavBtn, DayPager, Why, fmtDay, fmtTip, writeHashParam, readHashParam } from '../ui'
import { STATUS_WORD } from '../../../lib/callStatus'

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
// The three steps under the picture: the same three TUDDY's and LAMP's read-this-board sheets end on.
const HOW_STEPS = [
  { icon: '👆', text: 'Tap a name to open his page.' },
  { icon: '★', text: 'Add him to your watchlist.' },
  { icon: '✅', text: 'After the final, every call is graded on the Ledger.' },
]
const GAME_FOR = (g, r) => (g ? `${r.home ? 'vs' : '@'} ${r.opp}${g.start ? ` · ${fmtTip(g.start)}` : ''}` : r.opp ? `${r.home ? 'vs' : '@'} ${r.opp}` : 'TBD')
const ALL_KEYS = Object.keys(NBA_MARKETS)

// MERGED WITH RANKINGS (2026-10-06): this is the Rankings page. One market at a time, or ALL MARKETS
// (the old every-market table), the table first, and a WHY on every row.
const ALL = 'all'
const MARKET_PILLS = [...MARKET_OPTIONS, { key: ALL, text: 'ALL MARKETS' }]
const ordW = (p) => { const n = Math.round(p); const r = n % 100; return `${n}${r >= 11 && r <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'}` }
const LEG_WORDS = { ptsPg: 'points per game', rebPg: 'rebounds per game', astPg: 'assists per game', minPg: 'minutes', fgaPg: 'shot attempts', ftaPg: 'free throw attempts', tpmPg: 'threes made', tpaPg: 'threes tried', tpPct: 'three-point shooting', praPg: 'points, rebounds and assists', fgaShare: 'share of his team’s shots', ddRate: 'share of his games with a double-double', ddAdj: 'share of his games with a double-double, scaled by his opponent', ddRecentAdj: 'double-doubles in his last 10 games, scaled by his opponent', tdAdj: 'share of his games with a triple-double, scaled by his opponent', ddRecent: 'double-doubles in his last 10 games', tdRate: 'share of his games with a triple-double', oppPts: 'points his opponent allows', oppReb: 'rebounds his opponent allows', oppAst: 'assists his opponent allows', oppTpm: 'threes his opponent allows' }
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
    const rk = RAW_OF[l] || l
    const v = r.legs?.[rk]; const p = r.pct?.[l]
    if (v == null && p == null) return null
    return { label: LEG_LABEL[l] || l, text: `${fmtLeg(rk, v)}${Number.isFinite(Number(p)) ? ` · ${ordW(p)} percentile` : ''}`, pct: Number.isFinite(Number(p)) ? Number(p) : null }
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
  const phone = useIsPhone()
  const { open: openWhy, sheet: whySheet } = useWhySheet({ theme: C, accent: C.purple, numFont: NUM_FONT })
  const [m, setM] = useState(() => (String(readHashParam('m') || '').toLowerCase() === ALL ? ALL : market))
  const mk = m === ALL ? 'pts' : m
  const [calledOnly, setCalledOnly] = useState(false)
  // TABLE FIRST on Rankings (2026-10-06): the cards live on Props; one tap here
  const [layout, setLayout] = useState('table')
  // FIND / FILTER (2026-10-07, parity): MOONSHOT's search / team / game bar, and its Filters drawer
  // (score range, the score's own parts, games, projected points) -- the same shared components.
  const [q, setQ] = useState('')
  const [team, setTeam] = useState('')
  const [gameF, setGameF] = useState('')
  const [scoreMin, setScoreMin] = useState(0)
  const [scoreMax, setScoreMax] = useState(100)
  const [bands, setBands] = useState([])   // [{ key, min, max }] on r.pct (percentiles among tonight's players)
  const [gameSel, setGameSel] = useState([])
  const [minX, setMinX] = useState(0)
  // ONE READ PER MARKET (2026-10-08): the chips carry a count (how many players have a score for that market), the
  // same way TUDDY's do, so all eight boards are read -- the same cached /api/buckets/board reads the ALL MARKETS table makes.
  const bPts = useBucketsBoard(date, 'pts'), bReb = useBucketsBoard(date, 'reb'), bAst = useBucketsBoard(date, 'ast')
  const bTpm = useBucketsBoard(date, '3pm'), bPra = useBucketsBoard(date, 'pra'), bFirst = useBucketsBoard(date, 'first')
  const bDd = useBucketsBoard(date, 'dd'), bTd = useBucketsBoard(date, 'td')
  const boardsBy = { pts: bPts, reb: bReb, ast: bAst, '3pm': bTpm, pra: bPra, dd: bDd, td: bTd, first: bFirst }
  const { data, error, loading } = boardsBy[mk]
  const marketCounts = useMemo(() => {
    const out = {}; const seen = new Set()
    for (const k of ALL_KEYS) {
      const rs = (boardsBy[k].data?.rows || []).filter((r) => r.score != null && Number.isFinite(Number(r.score)))
      out[k] = boardsBy[k].data ? rs.length : null
      for (const r of rs) seen.add(`${r.gameId}-${r.playerId}`)
    }
    out[ALL] = ALL_KEYS.some((k) => boardsBy[k].data) ? seen.size : null
    return out
  }, [bPts.data, bReb.data, bAst.data, bTpm.data, bPra.data, bDd.data, bTd.data, bFirst.data]) // eslint-disable-line react-hooks/exhaustive-deps
  const marketOptions = MARKET_PILLS.map((o) => ({ key: o.key, label: o.text, count: marketCounts[o.key] ?? undefined, title: o.key === ALL ? 'Every market side by side' : NBA_MARKETS[o.key]?.label }))
  const xp = useBucketsExpected(date)
  const xptsBy = useMemo(() => new Map((xp.data?.rows || []).map((r) => [String(r.playerId), r])), [xp.data])
  const D = NBA_MARKETS[mk]
  const shown = data?.date || date
  const all = boardRows(data, { calledOnly, xpts: xptsBy })
  // ANGLES (2026-10-05): measured on 2025-26, every market (lib/nba/angles.js); only the ones with an edge
  const [angle, setAngle] = useState(null)
  const angles = useMemo(() => bucketsAngles(all, mk), [all, mk])
  const angleDef = angle ? angles.find((a) => a.key === angle) : null
  const pool = angleDef ? all.filter(angleDef.test) : all
  const needle = q.trim().toLowerCase()
  const rows = pool.filter((r) => {
    if (needle && !`${r.name} ${r.team} ${r.opp}`.toLowerCase().includes(needle)) return false
    if (team && r.team !== team) return false
    if (gameF && r.gameId !== gameF) return false
    if (gameSel.length && !gameSel.includes(r.gameId)) return false
    if ((scoreMin > 0 || scoreMax < 100) && (r.score == null || r.score < scoreMin || r.score > scoreMax)) return false
    for (const b of bands) { const v = r.pct?.[b.key]; if (v == null || v < b.min || v > b.max) return false }
    if (minX > 0 && (r.xpts == null || r.xpts < minX)) return false
    return true
  })
  const scored = rows.filter((r) => r.score != null)
  const noStarters = D.startersOnly && data && !scored.length
  const games = data?.games || []
  const called = (data?.rows || []).filter((r) => r.status === 'called').length
  const previewN = rows.filter((r) => !r.locked).length
  // a held team/game the day no longer has stays in the list, named (the Controls.js pattern)
  const teams = [...new Set([...all.map((r) => r.team), ...(team && data ? [team] : [])])].sort()
  const gameOptions = games.map((g) => ({ key: g.id, label: `${g.away.abbrev} @ ${g.home.abbrev}` }))
  if (gameF && data && !gameOptions.some((o) => o.key === gameF)) gameOptions.unshift({ key: gameF, label: 'Game not on this slate' })
  const bandDefs = (D.legs || []).filter((l) => all.some((r) => r.pct?.[l] != null)).map((l) => ({ key: l, label: LEG_LABEL[l] || l }))
  const toggleBand = (k) => setBands((bs) => (bs.some((b) => b.key === k) ? bs.filter((b) => b.key !== k) : [...bs, { key: k, min: 50, max: 100 }]))
  const setBand = (k, min, max) => setBands((bs) => bs.map((b) => (b.key === k ? { ...b, min, max } : b)))
  const drawerChips = [
    scoreMin > 0 || scoreMax < 100 ? { key: 'score', label: `Score ${scoreMin}–${scoreMax}`, onClear: () => { setScoreMin(0); setScoreMax(100) } } : null,
    ...bands.map((b) => ({ key: `band-${b.key}`, label: `${LEG_LABEL[b.key] || b.key} ${b.min}–${b.max}`, onClear: () => toggleBand(b.key) })),
    ...gameSel.map((id) => ({ key: `game-${id}`, label: gameOptions.find((o) => o.key === id)?.label || id, onClear: () => setGameSel((x) => x.filter((v) => v !== id)) })),
    minX > 0 ? { key: 'xpts', label: `xPTS ${minX}+`, onClear: () => setMinX(0) } : null,
  ].filter(Boolean)
  const chips = [
    angleDef ? { key: 'angle', label: angleDef.label || angle, onClear: () => setAngle(null) } : null,
    calledOnly ? { key: 'called', label: 'Called only', onClear: () => setCalledOnly(false) } : null,
  ].filter(Boolean)
  const heldTop = (team ? 1 : 0) + (gameF ? 1 : 0) + (needle ? 1 : 0)
  const clearAll = () => { setAngle(null); setCalledOnly(false); setScoreMin(0); setScoreMax(100); setBands([]); setGameSel([]); setMinX(0); setQ(''); setTeam(''); setGameF('') }
  const drawerSections = (
    <>
      <DrawerSection label={`Score · ${D.label}`}>
        <div style={{ fontSize: 12, fontFamily: NUM_FONT, color: C.text, marginTop: 2 }}>{scoreMin}–{scoreMax}</div>
        <RangeDual min={0} max={100} step={1} low={scoreMin} high={scoreMax} onLow={setScoreMin} onHigh={setScoreMax} label="Score" />
      </DrawerSection>
      {bandDefs.length > 0 && (
        <DrawerSection label="Parts · what this score is made of" hint="Percentiles among tonight's players, 0-100. Several at once must all clear.">
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 5 }}>
            {bandDefs.map((d) => <button key={d.key} type="button" onClick={() => toggleBand(d.key)} style={drawerChip(bands.some((b) => b.key === d.key))}>{d.label}</button>)}
          </div>
          {bands.map((b) => (
            <div key={b.key} style={{ marginTop: 9 }}>
              <div style={{ fontSize: 12, color: C.purple, fontWeight: 800, fontFamily: NUM_FONT }}>{LEG_LABEL[b.key] || b.key} {b.min}–{b.max}</div>
              <RangeDual min={0} max={100} step={1} low={b.min} high={b.max} onLow={(v) => setBand(b.key, Math.min(v, b.max), b.max)} onHigh={(v) => setBand(b.key, b.min, Math.max(v, b.min))} label={b.key} />
            </div>
          ))}
        </DrawerSection>
      )}
      {gameOptions.length > 1 && (
        <DrawerSection label="Game" hint="Several at once. Stacks with the game picker above.">
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 3 }}>
            {gameOptions.map((o) => <button key={o.key} type="button" onClick={() => setGameSel((x) => (x.includes(o.key) ? x.filter((v) => v !== o.key) : [...x, o.key]))} style={drawerChip(gameSel.includes(o.key))}>{o.label}</button>)}
          </div>
        </DrawerSection>
      )}
      {XPTS_MARKETS.includes(mk) && (
        <DrawerSection label="Projected points (xPTS) at least" hint="Recent minutes x points a minute x the opponent's allowed. Rotation players only; a measured projection, not a probability.">
          <div style={{ fontSize: 12, fontFamily: NUM_FONT, color: C.text, marginTop: 2 }}>{minX > 0 ? `${minX}+` : 'any'}</div>
          <input type="range" min={0} max={40} step={1} value={minX} onChange={(e) => setMinX(Number(e.target.value))} style={{ width: '100%', accentColor: C.purple }} aria-label="Minimum projected points" />
        </DrawerSection>
      )}
    </>
  )
  const drawerProps = {
    active: chips.length + drawerChips.length > 0, activeCount: chips.length + drawerChips.length,
    activeFilters: [...chips, ...drawerChips].map((c) => ({ key: c.key, label: c.label, onRemove: c.onClear })),
    reset: clearAll, shown: rows.length, total: pool.length, accent: C.purple, accentInk: C.bg,
    poolTitle: 'Players on tonight’s board that clear the filters. Stacks with the search, team and game above.', emptyNote: 'Nothing clears every filter at once. Loosen one.',
  }
  // The row the "How to read this" picture draws: the night's real #1 for this market (a row the table below also shows).
  // Its words come from the row's own status, never re-derived here.
  const howRow = useMemo(() => {
    const top = (data?.rows || []).filter((r) => r.score != null && Number.isFinite(Number(r.score))).sort((a, b) => (a.nightRank ?? 9999) - (b.nightRank ?? 9999))[0]
    if (!top) return null
    const g = (data?.games || []).find((x) => x.id === top.gameId)
    return {
      sport: 'nba', faceId: top.playerId, team: top.team, opp: null, name: top.name, rank: top.nightRank ?? 1,
      caption: 'One row from tonight\u2019s board, taken apart.',
      score: { label: D.label, value: top.score, dp: 0 },
      pick: top.status === 'off' ? null : STATUS_WORD[top.status] || null, pickNone: STATUS_WORD.off,
      fifth: { label: 'Game', value: GAME_FOR(g, top) },
    }
  }, [data, D]) // eslint-disable-line react-hooks/exhaustive-deps
  // 📸 the top of this ranking as a PNG (fix15): in the Filters row beside Ledger and Watchlist on a desktop, beside How to read on a phone (that row has no room left; one market at a time; ALL MARKETS has no single ranking)
  const shareBtn = m !== ALL && scored.length ? <CardButton sport="nba" label="Download this ranking as an image"
    onDownload={() => downloadBucketsBoardCard([...scored].sort((a, b) => b.score - a.score), { market: mk, date: shown || '', total: scored.length, finalGames: new Set(games.filter((x) => x.state === 'final').map((x) => x.id)) })} /> : null
  const pick = (k) => { setM(k); setAngle(null); writeHashParam('m', k === 'pts' ? null : k) }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {phone ? (<>
        {/* PHONE (2026-10-08): TUDDY's Rankings anatomy -- one line, one control row (Filters / Ledger / Watchlist / the
            market chips, each with its count), then the table. Search, team, game, the day, Called only, the angles and the
            layout are all behind Filters. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
          <div style={{ minWidth: 0, fontSize: 13, lineHeight: 1.3, color: C.text2 }}>Every player tonight, #1 down. Tap a header to sort.</div>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flex: '0 0 auto' }}>
            {shareBtn}
            <HowToRead id="buckets-board" accent={C.purple} row={howRow} notes={HOW_NOTES} steps={HOW_STEPS} />
          </span>
        </div>
        <FiltersDrawer ledger="nba" {...drawerProps} compact
          beside={<div style={{ flex: 1, minWidth: 0 }}><PillRow tall value={m} options={marketOptions} onChange={pick} /></div>}
          lead={(<div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
            <BoardTopBar inDrawer query={q} setQuery={setQ} placeholder="Search player or team…" team={team} setTeam={setTeam} teams={teams} teamLabel="🏀 All teams" game={gameF} setGame={setGameF} games={gameOptions} gameLabel="All games" />
            <DayPager shown={shown} date={date} setDate={setDate} disabled={loading}>
              <NavBtn onClick={() => setCalledOnly((v) => !v)} strong={calledOnly} ariaLabel="Called only">{calledOnly ? '✓ Called only' : 'Called only'}</NavBtn>
            </DayPager>
            {m !== ALL && angles.length > 0 && <AngleRow defs={angles} pool={all} value={angleDef ? angle : null} onChange={setAngle} accent={C.purple} hideEmpty />}
            {m !== ALL && angleDef && <p style={{ margin: 0, fontSize: 12, color: C.text3, lineHeight: 1.5 }}>{angleDef.title}</p>}
            {m !== ALL && <Pills ariaLabel="Layout" value={layout} onChange={setLayout} options={[{ key: 'table', text: 'TABLE' }, { key: 'cards', text: 'CARDS' }]} />}
          </div>)}>
          {drawerSections}
        </FiltersDrawer>
      </>) : (<>
      <PageHeader eyebrow={`BUCKETS · RANKINGS · ${m === ALL ? 'ALL MARKETS' : D.label}`} title={shown ? fmtDay(shown) : 'Tonight'} theme={C} numFont={NUM_FONT} accent={C.purple}
        note={<>Every player that day, ranked for one market. <Why label="Calls" text="One call per team in each game. Calls lock before tip and are graded after the final." /></>}
        stats={data ? [{ value: games.length, label: 'GAMES', tone: C.text2 }, { value: called, label: 'CALLED', tone: C.purple }, { value: data.lockedGames?.length || 0, label: 'LOCKED', tone: C.text2 }] : null} />
      <PillRow label="Market" value={m} options={marketOptions} onChange={pick} />
      <DayPager shown={shown} date={date} setDate={setDate} disabled={loading}>
        <NavBtn onClick={() => setCalledOnly((v) => !v)} strong={calledOnly} ariaLabel="Called only">{calledOnly ? '✓ Called only' : 'Called only'}</NavBtn>
      </DayPager>
      <BoardTopBar query={q} setQuery={setQ} placeholder="Search player or team…" team={team} setTeam={setTeam} teams={teams} teamLabel="🏀 All teams" game={gameF} setGame={setGameF} games={gameOptions} gameLabel="All games" />
      <HowToRead id="buckets-board" accent={C.purple} row={howRow} notes={HOW_NOTES} steps={HOW_STEPS} />
      {m !== ALL && angles.length > 0 && <AngleRow defs={angles} pool={all} value={angleDef ? angle : null} onChange={setAngle} accent={C.purple} hideEmpty />}
      {m !== ALL && angleDef && <p style={{ margin: 0, fontSize: 12, color: C.text3, lineHeight: 1.5 }}>{angleDef.title}</p>}
      {m !== ALL && <Pills ariaLabel="Layout" value={layout} onChange={setLayout} options={[{ key: 'table', text: 'TABLE' }, { key: 'cards', text: 'CARDS' }]} />}
      <FiltersDrawer ledger="nba" share={shareBtn} {...drawerProps}>{drawerSections}</FiltersDrawer>
      </>)}
      {m === ALL ? <FullBoard embedded keep={(r) => (!needle || `${r.name} ${r.team} ${r.opp}`.toLowerCase().includes(needle)) && (!team || r.team === team) && (!gameF || r.gameId === gameF) && (!gameSel.length || gameSel.includes(r.gameId))} date={date} setDate={setDate} onOpenPlayer={onOpenPlayer} onOpenTeam={onOpenTeam} onOpenGame={onOpenGame} /> : (<>
      <DelayedBanner error={error} what="the board" />
      {loading && !data ? <Loading what="the board" /> : null}
      {data && !games.length && <EmptyState title="NO GAMES THAT DAY" note="Nothing to rank. Try another day, or open the Slate." />}
      {noStarters && games.length > 0 && <EmptyState title="NO STARTERS LISTED YET" note="First basket is the ten starters only, scored once the pre-tip box score lists them. Check back near tip." />}
      {D.highVariance && scored.length > 0 && <p style={{ margin: 0, fontSize: 12, color: C.text3 }}>A high-variance lane: the ten starters only, ranked mostly on shot share.</p>}
      {previewN > 0 && rows.length > 0 && !noStarters && (
        <div style={{ color: C.text2, font: `800 12px/1.5 ${NUM_FONT}`, letterSpacing: '.08em' }}>
          {previewN === rows.length && games.length > 0 && games.every((g) => g.state === 'final') ? 'THIS NIGHT NEVER LOCKED. THESE ROWS ARE A PREVIEW, NOT CALLS'
            : previewN === rows.length ? 'EVERY GAME IS STILL A PREVIEW, NOT A CALL YET' : `${previewN} OF ${rows.length} ROWS ARE A PREVIEW, NOT A CALL YET`}
          {games.some((g) => g.seasonType === 1) ? ' · PRESEASON' : ''}
        </div>
      )}
      {rows.length > 0 && !noStarters && layout === 'cards' && (
        <BucketsCards market={mk} onOpen={onOpenPlayer} rows={[...rows].filter((r) => r.score != null && Number.isFinite(Number(r.score))).sort((a, b) => b.score - a.score)} />
      )}
      {rows.length > 0 && !noStarters && layout === 'table' && (
        <BucketsTable rows={rows} columns={boardColumns(m, { onOpenTeam, onOpenGame, withXpts: true, whyCol: whyColumn({ textOf: (r) => (r.status === 'off' && r.reason ? r.reason : plainWhy(r, m)?.short || ''), itemOf: (r) => whyItemFor(r, m, r.nightRank), open: openWhy, theme: C, numFont: NUM_FONT, w: 165 }) })} statusOf={(r) => r.status}
          onRowClick={(r) => onOpenPlayer?.((r?._raw ?? r).playerId)} faceOf={faceOf}
          dimRow={(r) => Boolean(r.voidReason) || r.status === 'off'}
          initialSort={{ key: 'nightRank', dir: 'asc' }} heatMode="sorted" maxHeight={620} maxRows={Math.max(rows.length, 1)}
          caption="Every player tonight for this market, #1 to the bottom. Column headers sort; each row opens that player; the team and opponent open the club; the game column opens the game." />
      )}
      {/* Bucket Watch sits under the table (2026-10-06): the board comes first */}
      {mk === 'pts' && m !== ALL && (data?.rows || []).length > 0 && <BucketWatch rows={data.rows} date={data.date} onOpenPlayer={onOpenPlayer} />}
      </>)}
      {whySheet}
      <SourceLine>Where this comes from: the league’s rosters, injury reports and season stats. A locked row is written before tip and never changed after it.</SourceLine>
    </div>
  )
}
