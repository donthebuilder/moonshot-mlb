'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT, gradeFor, TYPE, rampAt } from '../../../lib/nfl/theme'
import { boardReason } from '../../../lib/nfl/boardReason'
import { injuryTag, injuryTitle, injuryColor } from '../../../lib/nfl/injury'
import { quoteFor } from '../../../lib/nfl/oddsMatch'
import { alignedSignals, matchupTag } from '../../../lib/nfl/dvpSignal'
import { kickoffFor } from '../../../lib/nfl/kickoff'
import OddsLine from '../../OddsLine'
import OddsStatus from '../../OddsStatus'
import MatchupBadge from '../MatchupBadge'
import NflFace from '../NflFace'
import { AnatomyStrip, baselineFor, topStatChips } from '../ScoreAnatomy'
import { useNflWatchlist } from '../../../lib/nfl/watchlist'
import { ActiveFilters, FilterBar, FilterPill } from '../../Filters'
import NflBoardFilters, { useNflBoardFilter } from '../NflBoardFilters'
import MobileFold, { useIsPhone } from '../../MobileFold'
import { NflBoardList, BoardHead, DrawerPills, AngleRow, angleDefs, useNflDrawerFilters, TdWatch } from '../NflBoardExtras'
import TdCompare from '../TdCompare'

// TOUCHDOWNS — the front door.
//
// REBUILT 2026-09-16 (Donovan, comparing this page's list against Props'
// card grid: "you see the diefferenece" — then, asked directly how far to
// take it: "Rebuild it like Props (Recommended) ... Scrap the beginner-list
// design. Rebuild Touchdowns as a dense card grid with search, filter pills,
// sort, a compare-two tool, and per-card stat chips -- true click-over
// parity with Props, stat jargon and all.")
//
// The 2026-09-13 build (see git history) was a DELIBERATE beginner-list --
// written for someone who has never watched football, no percentiles, no
// jargon, one sentence per player. That brief is now explicitly superseded:
// the ask is stat-forward parity with components/tabs/PropsGrid.js, not a
// second pass on the same idea.
//
// WHAT PORTS FROM PROPS AND WHAT DOESN'T, and why -- the same never-invent-
// data discipline this whole project runs on:
//
//   PORTS DIRECTLY: search, a pills-then-sort filter bar (components/
//   Filters.js, already shared site-wide), a MobileFold "compare two" tool,
//   per-card stat chips, a soft render cap with "show the rest".
//
//   DOESN'T PORT: Props' five-role grouping (TOP/HR/HIT/HRR/CONTACT) has no
//   TD equivalent -- TD is ONE market, not five, so there is nothing to
//   group cards BY. The pills here are TD's own real tiers instead (see
//   TIER below). Props' PRECISION cut is a measured study
//   (bots/precision_study.py, 65.0% vs 41.2% over 25 graded nights) with no
//   NFL sibling -- inventing a percentage for a study that doesn't exist
//   would be exactly what rule #16 forbids, so it's left out rather than
//   faked.
//
//   THE STAT CHIPS ARE REAL. Each card's chips are its own top
//   components.TD entries (ScoreAnatomy.js's anatomyOf(), already built and
//   already driving the AnatomyStrip on the old row) -- weight x percentile,
//   the same arithmetic the score is built from, just surfaced as tags
//   instead of only a bar.
//
// 2026-09-17: the WHY map, baseline() and statChips() that used to live here
// are now reasonFor()/baselineFor()/topStatChips() in ScoreAnatomy.js,
// market-parametrized instead of hardcoded to TD — Boards.js needed the same
// "why is this score what it is" sentence for the other six markets, and
// two copies of the same edge-scoring arithmetic is how they drift the
// moment one changes and the other doesn't (rule #21). Behavior here is
// unchanged: same components, same weights, same edge formula, just called
// with MARKET passed in instead of closed over.
const MARKET = 'TD'
const SOFT_CAP = 60

function ScoreBar({ score }) {
  const g = gradeFor(score)
  const pct = Math.max(4, Math.min(100, ((Number(score) || 0) - 30) / 50 * 100))

  return (
    <span style={{
      position: 'relative', display: 'block', height: 4, borderRadius: 99,
      background: 'rgba(255,255,255,.08)',
    }}>
      <span style={{
        position: 'absolute', inset: '0 auto 0 0', width: `${pct}%`, borderRadius: 99,
        background: g.color, boxShadow: `0 0 7px -1px ${g.color}`,
      }} />
    </span>
  )
}

// ── THE CARD ─────────────────────────────────────────────────────────────
// THE TD POOL, once (2026-09-28): the eligible scored players, the market's
// weights and the pool baseline the card's "why" line reads. The Slate uses it.
export function tdPool(data) {
  const m = (data?.markets || []).find((x) => x.key === MARKET)
  const elig = new Set(m?.positions || ['RB', 'WR', 'TE'])
  const list = (data?.players || [])
    .filter((p) => !p.on_bye && elig.has(p.position) && Number.isFinite(Number(p.scores?.[MARKET])))
    .sort((a, b) => (b.scores[MARKET] ?? 0) - (a.scores[MARKET] ?? 0))
  return {
    rows: list,
    weights: m?.weights || null,
    base: baselineFor(list, MARKET),
    games: new Set(list.map((p) => [p.team, p.opp].sort().join('@'))).size,
  }
}

// Exported (2026-09-28) for the Slate's Picks section -- the same card, not a copy.
export function Card({ p, rank, matchup, odds, onPlayerClick, weights, base, pool, watchlist }) {
  const score = p.scores?.[MARKET]
  const g = gradeFor(score)
  // His top component with the number behind it (lib/nfl/boardReason.js,
  // TUDDY depth step 4) -- the fixed clause read the same on 10 of 10 cards.
  const why = boardReason(p, weights, base, MARKET, pool)
  const chips = topStatChips(p.components?.[MARKET], weights)
  const tag = injuryTag(p)
  const pinned = watchlist.isPinned(p.player_id)
  const aligned = alignedSignals(matchup, p)
  const highConf = Boolean(p.high_confidence_td_flag)
  const quote = quoteFor(odds, p, MARKET)

  return (
    <div
      onClick={() => onPlayerClick?.(p, MARKET)}
      style={{
        position: 'relative', display: 'flex', flexDirection: 'column', gap: 8,
        cursor: 'pointer', minWidth: 0, overflow: 'hidden',
        border: `1px solid ${C.border}`, borderRadius: 14, padding: '11px 12px 10px',
        background: `linear-gradient(158deg, ${g.color}1c, ${C.bg2} 58%)`,
      }}
    >
      <span style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 2,
        background: `linear-gradient(90deg, ${g.color}, ${g.color}00 72%)`,
      }} />

      <button
        onClick={(e) => { e.stopPropagation(); watchlist.toggle(p) }}
        title={pinned ? 'Remove from watchlist' : 'Add to watchlist'}
        style={{
          position: 'absolute', top: 8, right: 8, zIndex: 1,
          background: pinned ? `${C.green}22` : 'transparent',
          border: `1px solid ${pinned ? C.green : C.border}`,
          color: pinned ? C.green : C.text3,
          borderRadius: 7, padding: '3px 7px', fontSize: 13, lineHeight: 1, cursor: 'pointer',
        }}
      >{pinned ? '★' : '☆'}</button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0, paddingRight: 26 }}>
        <span style={{ fontFamily: NUM_FONT, fontSize: TYPE.label, color: rank <= 3 ? C.green : C.text3, minWidth: 14 }}>{rank}</span>
        <NflFace player={p} size={36} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: TYPE.name, fontWeight: 700, color: C.text, minWidth: 0,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{p.name}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
            <span style={{ fontSize: TYPE.micro, color: C.text3, fontFamily: NUM_FONT }}>
              {p.position} · {p.team} vs {p.opp}
            </span>
            <MatchupBadge matchup={matchup} player={p} market={MARKET} />
            {highConf && <span title="The bot's own high-confidence TD flag" style={{ fontSize: TYPE.label }}>⭐</span>}
            {aligned.aligned && <span title={`${aligned.hits} of 3 real signals lining up (matchup / red-zone finisher / rising snaps)`} style={{ fontSize: TYPE.label }}>🧩</span>}
            {tag && (
              <span title={injuryTitle(tag)} style={{ color: injuryColor(tag, C), fontWeight: 900, fontSize: TYPE.label }}>{tag}</span>
            )}
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontFamily: NUM_FONT, fontSize: TYPE.title, fontWeight: 900, color: g.color, lineHeight: 1 }}>
            {Math.round(score ?? 0)}
          </div>
          <div style={{
            fontFamily: NUM_FONT, fontSize: TYPE.label, fontWeight: 900, color: g.color,
            border: `1px solid ${g.color}55`, borderRadius: 5, padding: '1px 4px', marginTop: 3, textAlign: 'center',
          }}>{g.label}</div>
        </div>
      </div>

      {why && <div style={{ fontSize: TYPE.micro, color: C.text2, lineHeight: 1.4 }}>{why.text}</div>}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}><ScoreBar score={score} /></div>
        <AnatomyStrip components={p.components?.[MARKET]} weights={weights} width={56} />
      </div>

      {chips && chips.length > 0 && (
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {chips.map((c) => {
            // A percentile is an ordered scale: the amber -> jade RAMP, not hit/miss green.
            const pct = Number(p.components?.[MARKET]?.[c.key])
            const ramp = rampAt(Number.isFinite(pct) ? pct / 100 : 0)
            return (
              <span key={c.key} style={{
                fontSize: 8.5, fontWeight: 800, letterSpacing: '.02em', padding: '2px 7px',
                borderRadius: 999, whiteSpace: 'nowrap', fontFamily: NUM_FONT,
                color: C.text2, border: `1px solid ${ramp}66`, background: `${ramp}14`,
              }}>{c.t}</span>
            )
          })}
        </div>
      )}

      {(odds || quote) && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <OddsLine quote={quote} compact />
        </div>
      )}
    </div>
  )
}

export default function Touchdowns({ data, matchup, odds, onPlayerClick, oddsStatus, logs = null, top = null, results = null, liveSnap = null }) {
  const watchlist = useNflWatchlist(data)
  // Search, team and game come from the hub's top bar (2026-09-27).
  const query = top?.query || ''
  const team = top?.team || 'all'
  const [position, setPosition] = useState('all')
  const [onlyPriced, setOnlyPriced] = useState(false)
  const [onlyUpcoming, setOnlyUpcoming] = useState(false)
  const [onlyWatched, setOnlyWatched] = useState(false)
  const [sortBy, setSortBy] = useState('score')
  const [all, setAll] = useState(false)
  // LIST | CARDS (board filters plan, TUDDY 1): list by default, like MOONSHOT.
  const [view, setView] = useState('list')
  const [angle, setAngle] = useState(null)   // board filters plan, TUDDY 2
  const phone = useIsPhone()
  const now = useMemo(() => Date.now(), [data, onlyUpcoming])

  const { rows, weights, base, games } = useMemo(() => tdPool(data), [data])

  const positionOptions = useMemo(() => {
    const counts = {}
    for (const p of rows) counts[p.position] = (counts[p.position] || 0) + 1
    return [
      { key: 'all', label: 'All positions', count: rows.length },
      ...Object.keys(counts).sort().map((k) => ({ key: k, label: k, count: counts[k] })),
    ]
  }, [rows])


  // Same bands as Boards, on the same market this page is fixed to. They cut
  // the pool before the ranking and before the soft cap, so a banded board
  // promotes names off the bottom rather than only hiding rows.
  const { filtered: bandFiltered, state: bandState } = useNflBoardFilter(rows, MARKET)
  // The confidence tiers (Everyone / High confidence / Aligned) were a row of
  // their own; they are one-tap angles like the rest, so they lead the Angle
  // row now -- one row of chips where there were two (2026-09-27).
  const angles = useMemo(() => [
    { key: 'highconf', label: '⭐ High confidence', title: "The bot's own high-confidence TD flag.", test: (p) => Boolean(p.high_confidence_td_flag) },
    { key: 'aligned', label: '🧩 Aligned', title: '2 or more of 3 real signals lining up: matchup, red-zone finisher, rising snap share.', test: (p) => alignedSignals(matchup, p).aligned },
    ...angleDefs({ matchup, logs, market: MARKET, matchupTag, week: data ? { season: data.season, week: data.week } : null }),
  ], [matchup, logs, data?.season, data?.week])
  const drawer = useNflDrawerFilters(rows, data?.games, MARKET, { game: top?.game || '' })   // TUDDY 3 + 4

  // One removable chip per narrowing dimension, bands included. Touchdowns had
  // no chip row at all, so a tier or a team filter was invisible once you had
  // scrolled past the control that set it. (Was pasted into ScoreBar's scope
  // by mistake on 2026-09-21 -- none of these exist there, which is what
  // broke the whole tab with "tdFilterChips is not defined". Moved to where
  // it actually belongs, unchanged otherwise.)
  const tdFilterChips = [
    ...bandState.activeFilters,
    ...drawer.chips,
    position !== 'all' ? { key: 'pos', label: position, onClear: () => setPosition('all') } : null,
    angle ? { key: 'angle', label: angles.find((x) => x.key === angle)?.label || angle, onClear: () => setAngle(null) } : null,
    onlyPriced ? { key: 'priced', label: 'Priced', onClear: () => setOnlyPriced(false) } : null,
    onlyUpcoming ? { key: 'upcoming', label: 'Not kicked off', onClear: () => setOnlyUpcoming(false) } : null,
    onlyWatched ? { key: 'watch', label: 'Watchlist', onClear: () => setOnlyWatched(false) } : null,
  ].filter(Boolean)
  const clearTdFilters = () => {
    bandState.reset()
    setPosition('all'); setAngle(null); drawer.reset(); setSortBy('score')
    setOnlyPriced(false); setOnlyUpcoming(false); setOnlyWatched(false)
  }

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    let out = bandFiltered.filter(drawer.test)
    if (position !== 'all') out = out.filter((p) => p.position === position)
    if (team !== 'all') out = out.filter((p) => p.team === team)
    if (needle) out = out.filter((p) => String(p.name || '').toLowerCase().includes(needle))
    if (angle) { const d = angles.find((x) => x.key === angle); if (d) out = out.filter(d.test) }
    if (onlyWatched) out = out.filter((p) => watchlist.isPinned(p.player_id))
    if (onlyUpcoming) out = out.filter((p) => {
      const t = kickoffFor(data?.games, p)
      return t != null && t > now
    })
    if (onlyPriced) out = out.filter((p) => {
      const q = quoteFor(odds, p, MARKET)
      return !!q && q.over != null && q.matches !== false
    })

    const cmp = sortBy === 'price'
      ? (a, b) => {
        const qa = quoteFor(odds, a, MARKET), qb = quoteFor(odds, b, MARKET)
        const va = qa && qa.over != null && qa.matches !== false ? Number(qa.over) : -1e9
        const vb = qb && qb.over != null && qb.matches !== false ? Number(qb.over) : -1e9
        return vb - va || (b.scores[MARKET] ?? 0) - (a.scores[MARKET] ?? 0)
      }
      : sortBy === 'kickoff'
        ? (a, b) => {
          const ta = kickoffFor(data?.games, a) ?? 9e15, tb = kickoffFor(data?.games, b) ?? 9e15
          return ta - tb || (b.scores[MARKET] ?? 0) - (a.scores[MARKET] ?? 0)
        }
        : (a, b) => (b.scores[MARKET] ?? 0) - (a.scores[MARKET] ?? 0)
    return [...out].sort(cmp)
  }, [bandFiltered, drawer, rows, query, position, team, angle, angles, onlyWatched, onlyUpcoming, onlyPriced, sortBy, matchup, watchlist, odds, data, now])

  const capped = all ? filtered : filtered.slice(0, SOFT_CAP)
  const hidden = filtered.length - capped.length

  if (!rows.length) {
    return <div style={{ color: C.text3, fontSize: TYPE.body, padding: 18 }}>
      No scored players in this week&apos;s payload yet.
    </div>
  }

  // Position, the Only toggles and the sort live in the Filters drawer now
  // (MOONSHOT keeps its board chrome to one Filters button and a pool pill).
  const drawerExtraCount = drawer.activeCount + (position !== 'all') + onlyPriced + onlyUpcoming + onlyWatched + (sortBy !== 'score')
  const drawerExtra = (
    <>
      <DrawerPills label="Position">
        {positionOptions.map((o) => <FilterPill key={o.key} active={position === o.key} count={o.count} onClick={() => { setPosition(o.key); setAll(false) }}>{o.key === 'all' ? 'All' : o.label}</FilterPill>)}
      </DrawerPills>
      <DrawerPills label="Only">
        <FilterPill active={onlyPriced} onClick={() => { setOnlyPriced(!onlyPriced); setAll(false) }} title="The book has posted a number on this player's anytime-TD line.">💵 Priced</FilterPill>
        <FilterPill active={onlyUpcoming} onClick={() => { setOnlyUpcoming(!onlyUpcoming); setAll(false) }} title="His game has not kicked off yet.">⏱ Not kicked off</FilterPill>
        <FilterPill active={onlyWatched} onClick={() => { setOnlyWatched(!onlyWatched); setAll(false) }} title="Only names on your watchlist.">★ Watchlist</FilterPill>
      </DrawerPills>
      <DrawerPills label="Sort">
        {[['score', 'Score'], ['price', 'Longest price'], ['kickoff', 'Earliest kickoff']].map(([k, label]) => (
          <FilterPill key={k} active={sortBy === k} onClick={() => setSortBy(k)}
            title={k === 'score' ? "The model's own touchdown score — the page's default." : k === 'price' ? 'Longest anytime-TD price first. An unpriced card sinks rather than sorting as if it were even money.' : 'Earliest kickoff first.'}>{label}</FilterPill>
        ))}
      </DrawerPills>
      {drawer.section}
    </>
  )
  const extraReset = () => { drawer.reset(); setPosition('all'); setOnlyPriced(false); setOnlyUpcoming(false); setOnlyWatched(false); setSortBy('score') }

  return (
    <div>
      <AngleRow defs={angles} pool={bandFiltered} value={angle} onChange={(k) => { setAngle(k); setAll(false) }} />

      {/* TD WATCH (board filters plan, TUDDY 5): MOONSHOT's B2B Watch slot. */}
      <div style={{ marginTop: 8 }}>
        <TdWatch players={rows} games={data?.games} logs={logs} results={results} liveSnap={liveSnap} week={data ? { season: data.season, week: data.week } : null} onPlayerClick={onPlayerClick} />
      </div>

      <div style={{ marginTop: 8 }}>
        <FilterBar>
          <NflBoardFilters state={bandState} total={rows.length} shown={filtered.length} extra={drawerExtra} extraCount={drawerExtraCount} extraReset={extraReset} />
        </FilterBar>
        {Boolean(tdFilterChips.length) && (
          <div style={{ marginTop: 8 }}>
            <ActiveFilters filters={tdFilterChips} shown={filtered.length} total={rows.length} onClearAll={clearTdFilters} />
          </div>
        )}
      </div>

      {oddsStatus && (
        <div style={{ marginTop: 8 }}><OddsStatus status={oddsStatus} /></div>
      )}

      <BoardHead title="Anytime TD" count={capped.length} view={view} setView={setView}
        sub={`Every scored player across ${games} game${games === 1 ? '' : 's'}, ranked by the model’s own touchdown score. Tap a name for his card.`} />

      {filtered.length === 0 ? (
        <div style={{ fontSize: TYPE.body, color: C.text3, marginTop: 10 }}>
          Nothing matches.{' '}
          {onlyPriced || onlyUpcoming || onlyWatched
            ? `The ${[onlyPriced && 'Priced', onlyUpcoming && 'Not kicked off', onlyWatched && 'Watchlist'].filter(Boolean).join(' + ')} filter left nobody — turn one off under Filters.`
            : 'Clear the search, team, game or a filter above.'}
        </div>
      ) : (
        <>
          {view === 'list'
            ? <NflBoardList players={capped} market={MARKET} weights={weights} odds={odds} phone={phone} onPlayerClick={onPlayerClick} />
            : <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))' }}>
                {capped.map((p, i) => (
                  <Card key={p.player_id} p={p} rank={i + 1} matchup={matchup} odds={odds}
                        onPlayerClick={onPlayerClick} weights={weights} base={base} pool={rows} watchlist={watchlist} />
                ))}
              </div>}
          {hidden > 0 && (
            <div style={{ marginTop: 14 }}>
              <FilterPill onClick={() => setAll(true)} count={hidden}>Show the rest</FilterPill>
            </div>
          )}
        </>
      )}

      {/* ⚖️ COMPARE TWO (2026-09-16): below the board now -- a tool you reach
          for after reading the list, not chrome in front of it. */}
      <div style={{ marginTop: 14 }}>
        <MobileFold title="⚖️ Compare two players" summary="side by side, stat for stat" accent={C.green}>
          <TdCompare rows={rows} matchup={matchup} odds={odds} onPlayerClick={onPlayerClick} />
        </MobileFold>
      </div>

      <p style={{ margin: '13px 0 0', maxWidth: 620, fontSize: 11, lineHeight: 1.55, color: C.text3 }}>
        Ranked by the model&apos;s own touchdown score. The score is a league ranking on a 0–100 scale, not a
        probability. Tap a row for his card: the parts that built the score, the matchup and the price.
      </p>
    </div>
  )
}
