'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT, gradeFor, TYPE } from '../../../lib/nfl/theme'
import { injuryTag, injuryTitle, injuryColor } from '../../../lib/nfl/injury'
import { quoteFor } from '../../../lib/nfl/oddsMatch'
import { alignedSignals } from '../../../lib/nfl/dvpSignal'
import { kickoffFor } from '../../../lib/nfl/kickoff'
import OddsLine from '../../OddsLine'
import OddsStatus from '../../OddsStatus'
import MatchupBadge from '../MatchupBadge'
import NflFace from '../NflFace'
import { AnatomyStrip, reasonFor, baselineFor, topStatChips } from '../ScoreAnatomy'
import { useNflWatchlist } from '../../../lib/nfl/watchlist'
import { FilterBar, FilterSearch, FilterSelect, FilterPill } from '../../Filters'
import MobileFold from '../../MobileFold'
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
function Card({ p, rank, matchup, odds, onPlayerClick, weights, base, watchlist }) {
  const score = p.scores?.[MARKET]
  const g = gradeFor(score)
  const why = reasonFor(p, weights, base, MARKET)
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

      {why && <div style={{ fontSize: TYPE.micro, color: C.text2, lineHeight: 1.4 }}>He {why}.</div>}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}><ScoreBar score={score} /></div>
        <AnatomyStrip components={p.components?.[MARKET]} weights={weights} width={56} />
      </div>

      {chips && chips.length > 0 && (
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {chips.map((c) => (
            <span key={c.key} style={{
              fontSize: 8.5, fontWeight: 800, letterSpacing: '.02em', padding: '2px 7px',
              borderRadius: 999, whiteSpace: 'nowrap', fontFamily: NUM_FONT,
              color: C.text2, border: `1px solid ${g.color}33`, background: `${g.color}0f`,
            }}>{c.t}</span>
          ))}
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

export default function Touchdowns({ data, matchup, odds, onPlayerClick, oddsStatus }) {
  const watchlist = useNflWatchlist(data)
  const [query, setQuery] = useState('')
  const [position, setPosition] = useState('all')
  const [tier, setTier] = useState('everyone')
  const [onlyPriced, setOnlyPriced] = useState(false)
  const [onlyUpcoming, setOnlyUpcoming] = useState(false)
  const [onlyWatched, setOnlyWatched] = useState(false)
  const [sortBy, setSortBy] = useState('score')
  const [all, setAll] = useState(false)
  const now = useMemo(() => Date.now(), [data, onlyUpcoming])

  const { rows, weights, base, games } = useMemo(() => {
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
  }, [data])

  const positionOptions = useMemo(() => {
    const counts = {}
    for (const p of rows) counts[p.position] = (counts[p.position] || 0) + 1
    return [
      { key: 'all', label: 'All positions', count: rows.length },
      ...Object.keys(counts).sort().map((k) => ({ key: k, label: k, count: counts[k] })),
    ]
  }, [rows])

  const tierCounts = useMemo(() => {
    let highconf = 0, aligned = 0
    for (const p of rows) {
      if (p.high_confidence_td_flag) highconf += 1
      if (alignedSignals(matchup, p).aligned) aligned += 1
    }
    return { everyone: rows.length, highconf, aligned }
  }, [rows, matchup])

  const tierPills = [
    { key: 'everyone', label: 'Everyone', count: tierCounts.everyone },
    { key: 'highconf', label: '⭐ High confidence', count: tierCounts.highconf, title: "The bot's own high-confidence TD flag." },
    { key: 'aligned', label: '🧩 Aligned', count: tierCounts.aligned, title: '2 or more of 3 real signals lining up: matchup, red-zone finisher, rising snap share.' },
  ]

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    let out = rows
    if (position !== 'all') out = out.filter((p) => p.position === position)
    if (needle) out = out.filter((p) => String(p.name || '').toLowerCase().includes(needle))
    if (tier === 'highconf') out = out.filter((p) => p.high_confidence_td_flag)
    else if (tier === 'aligned') out = out.filter((p) => alignedSignals(matchup, p).aligned)
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
  }, [rows, query, position, tier, onlyWatched, onlyUpcoming, onlyPriced, sortBy, matchup, watchlist, odds, data, now])

  const capped = all ? filtered : filtered.slice(0, SOFT_CAP)
  const hidden = filtered.length - capped.length

  if (!rows.length) {
    return <div style={{ color: C.text3, fontSize: TYPE.body, padding: 18 }}>
      No scored players in this week&apos;s payload yet.
    </div>
  }

  return (
    <div>
      {/* ⚖️ COMPARE TWO (2026-09-16) — folded on a phone, open on desktop,
          same rule Props' own compare tool uses. */}
      <MobileFold title="⚖️ Compare two players" summary="side by side, stat for stat" accent={C.green}>
        <TdCompare rows={rows} matchup={matchup} odds={odds} onPlayerClick={onPlayerClick} />
      </MobileFold>

      <div className="chip-row" style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center', paddingBottom: 2 }}>
        {tierPills.map((o) => (
          <FilterPill key={o.key} active={tier === o.key} onClick={() => { setTier(o.key); setAll(false) }} count={o.count} title={o.title}>
            {o.label}
          </FilterPill>
        ))}
      </div>

      <div style={{ marginTop: 8 }}>
        <FilterBar>
          <FilterSearch value={query} onChange={setQuery} placeholder="Search player…" width={165} />
          <FilterSelect label="Position" value={position} options={positionOptions} onChange={setPosition} />
        </FilterBar>
      </div>

      {/* Says WHY there's no price on a card below, rather than every card
          just silently carrying nothing -- same discipline Boards.js/
          Picks.js already hold odds_status.json to. Silent once a fetch has
          actually succeeded. */}
      {oddsStatus && (
        <div style={{ marginTop: 8 }}><OddsStatus status={oddsStatus} /></div>
      )}

      <div className="chip-row" style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
        <span style={{ fontSize: TYPE.label, fontWeight: 900, letterSpacing: '.1em', color: C.text3, textTransform: 'uppercase', fontFamily: NUM_FONT, flexShrink: 0 }}>Only</span>
        <FilterPill active={onlyPriced} onClick={() => setOnlyPriced(!onlyPriced)} title="Cards where the book has posted a number on this player's anytime-TD line.">
          💵 Priced
        </FilterPill>
        <FilterPill active={onlyUpcoming} onClick={() => setOnlyUpcoming(!onlyUpcoming)} title="His game has not kicked off yet.">
          ⏱ Not kicked off
        </FilterPill>
        <FilterPill active={onlyWatched} onClick={() => setOnlyWatched(!onlyWatched)} title="Only names on your watchlist.">
          ★ Watchlist
        </FilterPill>
        <span style={{ width: 6 }} />
        <span style={{ fontSize: TYPE.label, fontWeight: 900, letterSpacing: '.1em', color: C.text3, textTransform: 'uppercase', fontFamily: NUM_FONT, flexShrink: 0 }}>Sort</span>
        {[['score', 'Score'], ['price', 'Longest price'], ['kickoff', 'Earliest kickoff']].map(([k, label]) => (
          <FilterPill key={k} active={sortBy === k} onClick={() => setSortBy(k)}
            title={k === 'score' ? "The model's own touchdown score — the page's default."
              : k === 'price' ? 'Longest anytime-TD price first. An unpriced card sinks rather than sorting as if it were even money.'
                : 'Earliest kickoff first.'}>
            {label}
          </FilterPill>
        ))}
      </div>

      <div style={{ fontSize: TYPE.body, color: C.text3, margin: '8px 0 4px', lineHeight: 1.55 }}>
        {hidden > 0 ? `showing ${capped.length} of ${filtered.length}` : `${filtered.length} player${filtered.length === 1 ? '' : 's'}`}
        {' across '}{games} game{games === 1 ? '' : 's'}
        {' — ranked by the model’s own touchdown score.'}
      </div>

      {filtered.length === 0 ? (
        <div style={{ fontSize: TYPE.body, color: C.text3, marginTop: 10 }}>
          Nothing matches.{' '}
          {onlyPriced || onlyUpcoming || onlyWatched
            ? `The ${[onlyPriced && 'Priced', onlyUpcoming && 'Not kicked off', onlyWatched && 'Watchlist'].filter(Boolean).join(' + ')} filter left nobody — turn one off above.`
            : 'Clear the search or position filter above.'}
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))' }}>
            {capped.map((p, i) => (
              <Card key={p.player_id} p={p} rank={i + 1} matchup={matchup} odds={odds}
                    onPlayerClick={onPlayerClick} weights={weights} base={base} watchlist={watchlist} />
            ))}
          </div>
          {hidden > 0 && (
            <div style={{ marginTop: 14 }}>
              <FilterPill onClick={() => setAll(true)} count={hidden}>Show the rest</FilterPill>
            </div>
          )}
        </>
      )}

      <p style={{ margin: '13px 0 0', maxWidth: 620, fontSize: 11, lineHeight: 1.55, color: C.text3 }}>
        Ranked by the model&apos;s own touchdown score. The short bar is the score; the striped bar
        beside it and the tags under the reason are what built it — the same weighted percentiles,
        surfaced as jargon instead of only a shape.
      </p>
    </div>
  )
}
