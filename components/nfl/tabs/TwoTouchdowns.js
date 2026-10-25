'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT, gradeFor, TYPE } from '../../../lib/nfl/theme'
import { boardReason } from '../../../lib/nfl/boardReason'
import { injuryTag, injuryTitle, injuryColor } from '../../../lib/nfl/injury'
import { kickoffFor } from '../../../lib/nfl/kickoff'
import PlayerFace from '../../PlayerFace'
import { baselineFor } from '../../../lib/nfl/tdPool'
import { SportTheme } from '../../SportTheme'
import RankCard from '../../card/RankCard'
import { stampArg, gameDayOf } from '../../card/useStamps'
import { useNflWatchlist } from '../../../lib/nfl/watchlist'
import { ActiveFilters, FilterBar, FilterPill, PositionNote, PositionEmpty } from '../../Filters'
import usePositionFilter from '../../../lib/usePositionFilter'
import NflBoardFilters, { useNflBoardFilter } from '../NflBoardFilters'
import { useIsPhone } from '../../MobileFold'
import { NflBoardList, BoardHead, ViewSwitch, DrawerPills, useNflDrawerFilters } from '../NflBoardExtras'
import { useNowTick } from '../../../lib/useNowTick'
import { explain } from '../../../lib/explain'
import { useRankMove } from '../../../lib/useRankMove'
import { RankMoveNote } from '../../RankMove'
import { roleLabel, roleKeys, ROLE_PILLS } from '../../../lib/nfl/roles'
import { twoBoard, TWO_NOTE } from '../../../lib/nfl/twoScore'
import { tdCallStatus } from '../../../lib/callStatus'
import { TWO_PLUS, PRICES_STORED } from '../../../lib/twoPlus/rules'

// 2+ TD -- WHO CAN SCORE TWO (TWO-SCORE batch, 2026-10-11, Donovan: "we also need to know who can score two").
// The Anytime TD board's twin: the same table (NflBoardList), the same cards (RankCard), the same position filter, rank
// arrows, watchlist star and injury chip, ranked by OUR OWN new model (lib/nfl/twoScore.js, td2_site_v1) -- not the bot's
// TD score, which this page never changes. Status words come from lib/callStatus (ON THE BOARD = the top third of THIS
// board; CALLED appears only when the Card carries a 2+ straight, which needs a posted 2+ price: none is stored today).
const MARKET = 'TD2'
const SOFT_CAP = 60
const nflRankId = (p) => p?.player_id
const SHORT = { xtd: 'EXP TDS', gl: 'GOAL LINE', rz: 'RED ZONE', team: 'TEAM TOT', snap: 'SNAPS', dvp: 'DEFENCE' }   // card tiles, 9 characters at most

function TapNote({ label, text, style, children }) {
  const say = (e) => { e.stopPropagation(); explain(label, text) }
  return <span role="button" tabIndex={0} title={text} onClick={say} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); say(e) } }} style={{ ...style, cursor: 'help', display: 'inline-block', padding: 9, margin: -9 }}>{children}</span>
}

/** The inputs behind a row, as one sentence a tap can show. */
export const twoInputsText = (p) => (p?.two?.parts || []).map((x) => `${x.label} ${Math.round(x.pct)}`).join(' · ') || 'No inputs published for him.'

function TwoCard({ p, rank, watchlist, status, onPlayerClick, weights, base, pool, rankMove, kickoff = null, place = 0 }) {
  const score = p.scores?.[MARKET]
  const g = gradeFor(score)
  const why = boardReason(p, weights, base, MARKET, pool)
  const parts = p.two?.parts || []
  const stats = parts.slice().sort((a, b) => b.weight * b.pct - a.weight * a.pct).slice(0, 3).map((x) => ({ label: SHORT[x.key] || x.label.toUpperCase(), value: Math.round(x.pct), pct: x.pct, title: `${x.label}: ${Math.round(x.pct)} on a 0-100 scale among this week's players` }))
  const tag = injuryTag(p)
  const pinned = watchlist.isPinned(p.player_id)
  return (
    <SportTheme theme={C} accent={C.green} numFont={NUM_FONT}>
      <RankCard accent={C.green} status={status} rankMove={rankMove} pos={p.position || ''} rank={rank} sport="nfl" club={p.team} name={p.name} opp={p.opp} role={roleLabel(p)}
        stampFor={stampArg('nfl', p.player_id, gameDayOf(kickoff), place)} lockIn={{ key: String(p.player_id), time: kickoff }}
        face={<PlayerFace sport="nfl" espnId={p?.espn_id} team={p?.team} name={p?.name} size={84} />}
        score={Number.isFinite(score) ? Math.round(score) : '—'} scoreWord="2+ TD" rankTags={[`GRADE ${g.label}`]}
        explain={`The two-score ranking, 0–100: a rank among this week's players, not a percentage. ${TWO_NOTE}`}
        reason={why ? why.text : null}
        chips={<>
          {p.can_two && <TapNote label="Can score two" text={`In the top third of our two-score ranking. ${twoInputsText(p)}. A ranking, not a forecast.`} style={{ fontSize: 11, fontWeight: 900, color: C.green, fontFamily: NUM_FONT }}>2+</TapNote>}
          {tag && <TapNote label={tag} text={injuryTitle(tag)} style={{ color: injuryColor(tag, C), fontWeight: 900 }}>{tag}</TapNote>}
        </>}
        stats={stats} back={parts.length ? { rows: parts.map((x) => ({ label: x.label.toUpperCase(), value: Math.round(x.pct), pct: x.pct })), note: `Each input 0-100 among this week's players. ${TWO_NOTE}` } : null}
        onClick={() => onPlayerClick?.(p, MARKET)}
        foot={<button onClick={(e) => { e.stopPropagation(); watchlist.toggle(p) }} title={pinned ? 'Remove from watchlist' : 'Add to watchlist'} aria-label={pinned ? 'Remove from watchlist' : 'Add to watchlist'}
          style={{ background: pinned ? `${C.yellow}22` : 'transparent', border: `1px solid ${pinned ? C.yellow + '66' : C.border2}`, color: pinned ? C.yellow : C.text3, borderRadius: 8, padding: '6px 9px', fontSize: 14, cursor: 'pointer', minWidth: 44, minHeight: 44, margin: '-6px 0' }}>{pinned ? '★' : '☆'}</button>} />
    </SportTheme>
  )
}

export default function TwoTouchdowns({ data, matchup, odds, onPlayerClick, oddsStatus, top = null, showOpts = true, viewCtl = null, liveSnap = null }) {
  const watchlist = useNflWatchlist(data)
  const query = top?.query || ''
  const team = top?.team || 'all'
  const [onlyUpcoming, setOnlyUpcoming] = useState(false)
  const [onlyWatched, setOnlyWatched] = useState(false)
  const [all, setAll] = useState(false)
  const [viewOwn, setViewOwn] = useState('list')
  // the phone's List | Cards lives in BoardHub's top row (viewCtl); on its own the board keeps its own switch
  const view = viewCtl ? viewCtl.view : viewOwn
  const setView = viewCtl ? viewCtl.setView : setViewOwn
  const phone = useIsPhone()
  const now = useNowTick()
  const slateDay = useMemo(() => { const k = (data?.games || []).map((g) => g.kickoff).filter(Boolean).sort()[0]; return k ? String(k).slice(0, 10) : '' }, [data?.games])

  const board = useMemo(() => twoBoard(data, matchup), [data, matchup])
  const rows = board.rows
  const weights = board.weights
  const base = useMemo(() => baselineFor(rows, MARKET), [rows])
  const rankOf = useMemo(() => new Map(rows.map((p, i) => [String(p.player_id), i + 1])), [rows])
  const rankMv = useRankMove({ sport: 'nfl', board: MARKET, date: slateDay || null, ranks: rankOf, rows, idOf: nflRankId })
  const statusOf = useMemo(() => (p) => tdCallStatus({ td_board: { rank: p.two_rank, of: p.two_of } }), [])

  const { filtered: bandFiltered, state: bandState } = useNflBoardFilter(rows, MARKET)
  const drawer = useNflDrawerFilters(rows, data?.games, MARKET, { game: top?.game || '', matchup, season: data?.season })
  const beforePos = useMemo(() => {
    const needle = query.trim().toLowerCase()
    let out = bandFiltered.filter(drawer.test)
    if (team !== 'all') out = out.filter((p) => p.team === team)
    if (top?.called) out = out.filter((p) => top.called.has(String(p.player_id)))   // Called only (BoardHub): CALLED in any market
    if (needle) out = out.filter((p) => String(p.name || '').toLowerCase().includes(needle))
    if (onlyWatched) out = out.filter((p) => watchlist.isPinned(p.player_id))
    if (onlyUpcoming) out = out.filter((p) => { const t = kickoffFor(data?.games, p); return t != null && t > now })
    return out
  }, [bandFiltered, drawer, query, team, onlyWatched, onlyUpcoming, watchlist, data, now, top?.called])
  const pf = usePositionFilter('nfl', rows, { posOf: (p) => p.position, extraOf: roleKeys, extraOrder: ROLE_PILLS, countRows: beforePos })
  const filtered = useMemo(() => beforePos.filter(pf.test), [beforePos, pf.test])
  const capped = all ? filtered : filtered.slice(0, SOFT_CAP)
  const hidden = filtered.length - capped.length
  const openFromBoard = (p, market) => onPlayerClick?.(p, market, filtered)

  const chips = [...bandState.activeFilters, ...drawer.chips, pf.chip,
    onlyUpcoming ? { key: 'upcoming', label: 'Not kicked off', onClear: () => setOnlyUpcoming(false) } : null,
    onlyWatched ? { key: 'watch', label: 'Watchlist', onClear: () => setOnlyWatched(false) } : null].filter(Boolean)
  const clearAll = () => { bandState.reset(); pf.clear(); drawer.reset(); setOnlyUpcoming(false); setOnlyWatched(false) }
  const extraCount = drawer.activeCount + onlyUpcoming + onlyWatched
  const extra = (<>
    <DrawerPills label="Only">
      <FilterPill active={onlyUpcoming} onClick={() => { setOnlyUpcoming(!onlyUpcoming); setAll(false) }} title="His game has not kicked off yet.">⏱ Not kicked off</FilterPill>
      <FilterPill active={onlyWatched} onClick={() => { setOnlyWatched(!onlyWatched); setAll(false) }} title="Only names on your watchlist.">★ Watchlist</FilterPill>
    </DrawerPills>
    {drawer.section}
  </>)
  const rule = TWO_PLUS.nfl

  if (!rows.length) return <div style={{ color: C.text3, fontSize: TYPE.body, padding: 18 }}>No players have the inputs for the two-score ranking in this week&apos;s payload yet.</div>

  return (
    <div>
      {showOpts && (<>
        <div style={{ marginTop: 8 }}>
          <FilterBar>
            <NflBoardFilters ledger="nfl" positions={pf.control} state={bandState} total={rows.length} shown={filtered.length} extra={extra} extraCount={extraCount} extraReset={() => { drawer.reset(); pf.clear(); setOnlyUpcoming(false); setOnlyWatched(false) }} />
          </FilterBar>
          {Boolean(chips.length) && <div style={{ marginTop: 8 }}><ActiveFilters filters={chips} shown={filtered.length} total={rows.length} onClearAll={clearAll} /></div>}
        </div>
        {phone && !viewCtl && <div style={{ marginTop: 8 }}><ViewSwitch value={view} onChange={setView} /></div>}
      </>)}
      {!phone && <BoardHead title="2+ TD" count={capped.length} view={view} setView={setView} sub={TWO_NOTE} />}
      {phone && <p style={{ margin: '8px 0 0', fontSize: 12, lineHeight: 1.4, color: C.text2 }}>{TWO_NOTE}</p>}

      {pf.active && filtered.length > 0 && <div style={{ marginTop: 8 }}><PositionNote control={pf.control} shown={filtered.length} total={rows.length} /></div>}
      {filtered.length === 0 && pf.active ? (
        <div style={{ marginTop: 10 }}><PositionEmpty control={pf.control} othersActive={chips.length > 1} onClearAll={clearAll} /></div>
      ) : filtered.length === 0 ? (
        <div style={{ fontSize: TYPE.body, color: C.text3, marginTop: 10 }}>Nothing matches. Clear the search, team, game or a filter above.</div>
      ) : (
        <>
          {view === 'list'
            ? <NflBoardList games={data?.games} players={capped} market={MARKET} rankOf={rankOf} rankMv={rankMv} weights={weights} odds={null} phone={phone} onPlayerClick={openFromBoard} statusOf={statusOf} base={base} pool={rows} watchlist={watchlist} liveSnap={liveSnap} />
            : <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))' }}>
                {capped.map((p, i) => (
                  <TwoCard key={p.player_id} p={p} place={i} kickoff={kickoffFor(data?.games, p)} rank={rankOf.get(String(p.player_id)) ?? i + 1} status={statusOf(p)} onPlayerClick={openFromBoard} weights={weights} base={base} pool={rows} watchlist={watchlist} rankMove={rankMv.cell(p.player_id)} />
                ))}
              </div>}
          {hidden > 0 && <div style={{ marginTop: 14 }}><FilterPill onClick={() => setAll(true)} count={hidden}>Show the rest</FilterPill></div>}
          <RankMoveNote show={rankMv.any} color={C.text3} />
        </>
      )}

      <p style={{ margin: '13px 0 0', maxWidth: 620, fontSize: 12, lineHeight: 1.55, color: C.text3 }}>
        Ranked by our two-score number: expected touchdowns, goal-line and red-zone chances, the team&apos;s implied total, snap share and the defense he faces.
        It is a 0–100 ranking, not a probability. ON THE BOARD is the top third of this list. {PRICES_STORED.nfl ? '' : `No ${rule.label} prices are published, so this board shows none and the Card cannot take a ${rule.label} straight. `}
        The two-score picks are recorded before kickoff and graded on the real result: two or more touchdowns, rushing plus receiving. Information only.
      </p>
    </div>
  )
}
