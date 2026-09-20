'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT, MARKETS, gradeFor, TYPE } from '../../../lib/nfl/theme'
import { quoteFor } from '../../../lib/nfl/oddsMatch'
import { kickoffFor } from '../../../lib/nfl/kickoff'
import OddsLine from '../../OddsLine'
import OddsStatus from '../../OddsStatus'
import NflFace from '../NflFace'
import MatchupBadge from '../MatchupBadge'
import NflExplain from '../NflExplain'
import { ActiveFilters, FilterBar, FilterPill, FilterSearch, FilterSelect, PillRow, Segmented } from '../../Filters'
import { injuryTag, injuryTitle, injuryColor } from '../../../lib/nfl/injury'
import { useNflWatchlist } from '../../../lib/nfl/watchlist'
import { reasonFor, baselineFor, topStatChips } from '../ScoreAnatomy'

// Same soft cap Touchdowns.js uses, so the two boards cut at the same depth.
const SOFT_CAP = 60

const LOG_FIELD = {
  TD: 'g_td',
  REC_YDS: 'g_recyd',
  REC: 'g_rec',
  RUSH_YDS: 'g_ruyd',
  RUSH_ATT: 'g_car',
  PASS_YDS: 'g_payd',
  KICK_PTS: 'g_kick',
}

function recentForm(logs, playerId, market, bar) {
  const field = LOG_FIELD[market]
  const games = logs?.logs?.[String(playerId)]?.log
  if (!field || !Array.isArray(games)) return null
  const points = games
    .filter((game) => Number.isFinite(game?.[field]))
    .slice(-8)
    .map((game) => ({ value: Number(game[field]), week: game.w, season: game.s }))
  if (points.length < 2) return null

  const split = Math.max(1, Math.floor(points.length / 2))
  const older = points.slice(0, split)
  const newer = points.slice(split)
  const average = (items) => items.reduce((sum, point) => sum + point.value, 0) / items.length
  const delta = average(newer) - average(older)
  const hits = points.filter((point) => point.value >= Number(bar)).length
  return { points, delta, hits }
}

function FormSparkline({ form, bar, color }) {
  if (!form) return <span style={{ color: C.text3, fontSize: TYPE.micro }}>No form</span>
  const values = form.points.map((point) => point.value)
  const ceiling = Math.max(Number(bar) || 0, ...values, 1)
  const coords = values.map((value, index) => {
    const x = values.length === 1 ? 32 : 2 + (index / (values.length - 1)) * 60
    const y = 24 - (Math.max(0, value) / ceiling) * 20
    return `${x},${y}`
  }).join(' ')
  const barY = 24 - (Math.max(0, Number(bar) || 0) / ceiling) * 20
  const direction = form.delta > 0.05 ? '▲' : form.delta < -0.05 ? '▼' : '—'
  const directionColor = form.delta > 0.05 ? C.green : form.delta < -0.05 ? C.red : C.text3

  return (
    <span title={`${form.hits}/${form.points.length} cleared the market bar in the last ${form.points.length} games`} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <svg width="66" height="27" viewBox="0 0 66 27" role="img" aria-label={`Recent form: ${form.hits} of ${form.points.length} games cleared the bar`}>
        <line x1="1" x2="65" y1={barY} y2={barY} stroke={C.border2} strokeDasharray="2 2" />
        <polyline points={coords} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        {form.points.map((point, index) => {
          const [x, y] = coords.split(' ')[index].split(',')
          return <circle key={`${point.season}-${point.week}`} cx={x} cy={y} r="1.8" fill={point.value >= Number(bar) ? C.green : color} />
        })}
      </svg>
      <b style={{ color: directionColor, fontFamily: NUM_FONT, fontSize: TYPE.micro }}>{direction}</b>
    </span>
  )
}

// Boards — the seven markets, one at a time, category buttons across the top.
//
// Same call the MLB side made on 2026-08-04 when HR Board and Hits & HRR were
// merged: these are the same ranking machinery pointed at different columns,
// and seven tabs for one component is seven places to fix the same bug.
//
// The score bar is the whole visual. At a glance you want the SHAPE of the
// board — is this a market with three clear plays or twenty coin flips — and
// a column of numbers doesn't show you that.
//
// ── 2026-09-17: THE "WHY" LINE + STAT CHIPS + SORT (markets-prominence pass) ─
//
// Donovan, off a screenshot of MOONSHOT's storylines and a separate note the
// same day: "the prop eq rn is touchdowns just add the different markets rec
// yards rush yards pass yards you know i feel we need induivual score for
// each posititokns in a sense." Traced first
// (claude/tuddy-storylines-and-markets-audit-2026-09-16.md): every player
// already carries a real, weighted `scores`/`components` object across all
// seven markets (bots/nfl/nfl_scoring.py) — this page has been ranking by
// that score since it shipped. The gap wasn't the model, it was that this
// page — the one place all six non-TD markets actually live — never got
// Touchdowns.js's own "here's what's actually driving this number" layer:
// the one-line reason and the stat chips underneath a card. Two scoping
// questions later (one combined page, all six non-TD markets), this is that
// layer, generalized off Touchdowns.js's own reasonFor()/topStatChips()
// (now market-parametrized in ScoreAnatomy.js, see its header) instead of a
// second copy written for six more markets. Sort by price/kickoff is the
// same parity move, off the same kickoffFor() Touchdowns.js already used.
//
// TD stays in this page's own market pills too — Touchdowns.js's own
// dedicated page still exists for the deeper tier/compare-tool experience,
// this is not a replacement for it, just the rest of the board catching up.
export default function Boards({ data, logs, matchup, onPlayerClick, odds, oddsStatus }) {
  // ── SAVE FROM THE CARD ITSELF (parity pass, 2026-09-16) ─────────────────
  // MOONSHOT's PropsGrid found this exact gap 2026-08-24 (Donovan: "click a
  // player to add to watch list, nothing happens") -- its card board had no
  // direct star, only the modal you reach by opening the card first. TUDDY's
  // own Watchlist.js empty state already tells a visitor to "tap SAVE TO
  // WATCHLIST" on a card, but Boards.js -- the props card board Donovan
  // explicitly likes -- never actually had that button. useNflWatchlist is
  // the same hook StatPortal.js/Live.js/NflPlayerModal.js already call
  // directly off `data`, self-contained -- no new prop plumbing needed.
  const watchlist = useNflWatchlist(data)
  const [market, setMarket] = useState('TD')
  const [showLow, setShowLow] = useState(false)
  const [query, setQuery] = useState('')
  const [team, setTeam] = useState('all')
  const [position, setPosition] = useState('all')
  const [sortBy, setSortBy] = useState('score')
  // THE SAME RESEARCH BAR AS TOUCHDOWNS (2026-09-18). Donovan, on both
  // products side by side: "there should be zero difference." This board had
  // grown a second control vocabulary -- dropdowns and a Sample segmented
  // control in a bordered box -- while Touchdowns.js (and MOONSHOT's own
  // Props) use ONLY pills, a sort row and a soft cap. TUDDY disagreed with
  // TUDDY, which is worse than either choice. Touchdowns' idiom wins because
  // it is MOONSHOT's.
  const [onlyPriced, setOnlyPriced] = useState(false)
  const [onlyUpcoming, setOnlyUpcoming] = useState(false)
  const [onlyWatched, setOnlyWatched] = useState(false)
  const [all, setAll] = useState(false)

  // Recomputed when the slate changes or the toggle flips, not per render --
  // same rule Touchdowns.js's own `now` follows.
  const now = useMemo(() => Date.now(), [data, onlyUpcoming])

  const spec = useMemo(
    () => (data?.markets || []).find((m) => m.key === market),
    [data, market],
  )

  // Baseline is the market's FULL eligible pool, not whatever the search/
  // team/position filters below leave on screen -- the same rule
  // Touchdowns.js's own baseline always followed. Computed off it, not off
  // `rows`, so searching one name can't collapse the league median to n=1.
  const base = useMemo(() => {
    const eligible = (data?.players || []).filter((p) => Number.isFinite(p.scores?.[market]))
    return baselineFor(eligible, market)
  }, [data, market])

  const rows = useMemo(() => {
    const pool = (data?.players || []).filter((p) => Number.isFinite(p.scores?.[market]))
    const needle = query.trim().toLowerCase()
    const kept = pool.filter((p) => {
      if (!showLow && p.low_sample) return false
      if (team !== 'all' && p.team !== team) return false
      if (position !== 'all' && p.position !== position) return false
      if (needle && !String(p.name || '').toLowerCase().includes(needle)) return false
      if (onlyWatched && !watchlist.isPinned(p.player_id)) return false
      if (onlyPriced) {
        const q = quoteFor(odds, p, market)
        if (!q || q.over == null || q.matches === false) return false
      }
      if (onlyUpcoming) {
        const t = kickoffFor(data?.games, p)
        if (!(t && t > now)) return false
      }
      return true
    })
    const cmp = sortBy === 'price'
      ? (a, b) => {
        const qa = quoteFor(odds, a, market), qb = quoteFor(odds, b, market)
        const va = qa && qa.over != null && qa.matches !== false ? Number(qa.over) : -1e9
        const vb = qb && qb.over != null && qb.matches !== false ? Number(qb.over) : -1e9
        return vb - va || (b.scores[market] ?? 0) - (a.scores[market] ?? 0)
      }
      : sortBy === 'kickoff'
        ? (a, b) => {
          const ta = kickoffFor(data?.games, a) ?? 9e15, tb = kickoffFor(data?.games, b) ?? 9e15
          return ta - tb || (b.scores[market] ?? 0) - (a.scores[market] ?? 0)
        }
        : (a, b) => b.scores[market] - a.scores[market]
    // No truncation here any more. The board used to cut silently at 200 with
    // nothing on screen saying so; it now caps at SOFT_CAP with a "showing X
    // of Y" line and a Show-the-rest pill, exactly as Touchdowns does.
    return kept.sort(cmp)
  }, [data, market, showLow, query, team, position, sortBy, odds,
      onlyPriced, onlyUpcoming, onlyWatched, watchlist, now])

  const capped = all ? rows : rows.slice(0, SOFT_CAP)
  const hidden = rows.length - capped.length

  const filterOptions = useMemo(() => {
    const eligible = (data?.players || []).filter((p) => Number.isFinite(p.scores?.[market]))
    const countBy = (key) => eligible.reduce((acc, p) => {
      const value = p[key]
      if (value) acc[value] = (acc[value] || 0) + 1
      return acc
    }, {})
    const teams = countBy('team')
    const positions = countBy('position')
    return {
      teams: [{ key: 'all', label: 'All teams', count: eligible.length }, ...Object.keys(teams).sort().map((key) => ({ key, label: key, count: teams[key] }))],
      positions: [{ key: 'all', label: 'All positions', count: eligible.length }, ...Object.keys(positions).sort().map((key) => ({ key, label: key, count: positions[key] }))],
    }
  }, [data, market])

  const marketOptions = useMemo(() => MARKETS.map(([key, label]) => ({
    key, label,
    count: (data?.players || []).filter((p) => Number.isFinite(p.scores?.[key]) && (showLow || !p.low_sample)).length,
  })), [data, showLow])

  const lowCount = useMemo(
    () => (data?.players || []).filter(
      (p) => Number.isFinite(p.scores?.[market]) && p.low_sample).length,
    [data, market],
  )

  return (
    <div>
      <PillRow label="Market" value={market} options={marketOptions} onChange={setMarket} />

      <div style={{ marginTop: 8 }}>
        <FilterBar>
          <FilterSearch value={query} onChange={setQuery} placeholder="Search player…" width={165} />
          <FilterSelect label="Team" value={team} options={filterOptions.teams} onChange={setTeam} />
          <FilterSelect label="Position" value={position} options={filterOptions.positions} onChange={setPosition} />
        </FilterBar>
      </div>

      <div className="chip-row" style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
        <span style={{ fontSize: TYPE.label, fontWeight: 900, letterSpacing: '.1em', color: C.text3, textTransform: 'uppercase', fontFamily: NUM_FONT, flexShrink: 0 }}>Only</span>
        <FilterPill active={onlyPriced} onClick={() => { setOnlyPriced(!onlyPriced); setAll(false) }} title="Cards where the book has posted a number on this market for this player.">
          💵 Priced
        </FilterPill>
        <FilterPill active={onlyUpcoming} onClick={() => { setOnlyUpcoming(!onlyUpcoming); setAll(false) }} title="His game has not kicked off yet.">
          ⏱ Not kicked off
        </FilterPill>
        <FilterPill active={onlyWatched} onClick={() => { setOnlyWatched(!onlyWatched); setAll(false) }} title="Only names on your watchlist.">
          ★ Watchlist
        </FilterPill>
        <FilterPill active={showLow} onClick={() => { setShowLow(!showLow); setAll(false) }} count={lowCount || undefined}
          title="Include players the model scored off a thin sample. They render dimmed, and they are out by default.">
          🔬 Low sample
        </FilterPill>
        <span style={{ width: 6 }} />
        <span style={{ fontSize: TYPE.label, fontWeight: 900, letterSpacing: '.1em', color: C.text3, textTransform: 'uppercase', fontFamily: NUM_FONT, flexShrink: 0 }}>Sort</span>
        {[['score', 'Score'], ['price', 'Longest price'], ['kickoff', 'Earliest kickoff']].map(([k, label]) => (
          <FilterPill key={k} active={sortBy === k} onClick={() => setSortBy(k)}
            title={k === 'score' ? "The model's own score for this market — the board's default."
              : k === 'price' ? 'Longest price first. An unpriced card sinks rather than sorting as if it were even money.'
                : 'Earliest kickoff first.'}>
            {label}
          </FilterPill>
        ))}
      </div>

      <div style={{ fontSize: TYPE.body, color: C.text3, margin: '8px 0 4px', lineHeight: 1.55 }}>
        {hidden > 0 ? `showing ${capped.length} of ${rows.length}` : `${rows.length} player${rows.length === 1 ? '' : 's'}`}
        {' — ranked by the model’s own score for this market.'}
      </div>

      {/* Says WHY there's no price on any row below, rather than every row
          just silently carrying nothing — same discipline odds_status.json
          enforces on the MLB side. Silent (renders null) once a fetch has
          actually succeeded; see components/OddsStatus.js's own TONE table. */}
      {oddsStatus && (
        <div style={{ marginBottom: 10 }}><OddsStatus status={oddsStatus} /></div>
      )}

      {spec && (
        <div style={{
          background: C.bg2, border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.green}`,
          borderRadius: 10, padding: '9px 13px', marginBottom: 10,
          fontSize: TYPE.body, color: C.text2, lineHeight: 1.6,
        }}>
          {/* THE TWO WORDS THAT DECIDE HOW THE WHOLE BOARD READS (2026-09-20).
              What this market ranks for, and what counts as clearing it. They
              are explained nowhere else on the page and the answer is one tap
              now. Deliberately HERE and not on every row's grade chip -- a dot
              per row is noise on a phone; a dot on the header is the same
              definition, once. */}
          <b style={{ color: C.text }}>
            <NflExplain label={spec.label} />
          </b> ·{' '}
          <NflExplain label="bar" />{' '}
          <b style={{ color: C.green, fontFamily: NUM_FONT }}>{spec.bar}</b> ·{' '}
          {spec.positions.join(' / ')}
          {spec.dropped?.length > 0 && (
            <div style={{ color: C.yellow, marginTop: 3, fontSize: TYPE.micro }}>
              no lines this slate · weight redistributed
            </div>
          )}
          <div style={{ color: C.text3, marginTop: 3, fontSize: TYPE.micro }}>
            Form line = last 8 games · dotted line = market bar · arrow compares recent half with prior half
          </div>
          {/* The single most common misread of the board (08-29 review): an 81
              looks like an 81% chance. Say what it is where it first appears. */}
          <div style={{ color: C.text3, marginTop: 3, fontSize: TYPE.micro }}>
            The score is a <b style={{ color: C.text2 }}>league ranking on a 0–100 scale</b>, not a probability — 81 means far up the league on this market&apos;s inputs, not an 81% chance.
          </div>
        </div>
      )}

      {/* CARD BOARD (2026-09-15, Donovan: "the props card board is okay we
          just need the pictures on there ... a table flip wouldn't be bad,
          I do like the props card"). Same rows, same scores, same sparkline,
          same odds line, same onClick -- this is a presentation change only,
          not a new data path. Photo comes from the same NflFace tile every
          other TUDDY page already uses (real ESPN headshot keyed off the
          player's own espn_id, team-colored monogram when there isn't one --
          never invented). */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(212px, 1fr))', gap: 8,
      }}>
        {capped.map((p, i) => {
          const s = p.scores[market]
          const g = gradeFor(s)
          const form = recentForm(logs, p.player_id, market, spec?.bar)
          const why = reasonFor(p, spec?.weights, base, market)
          const chips = topStatChips(p.components?.[market], spec?.weights, 2)
          return (
            <div
              key={p.player_id}
              onClick={() => onPlayerClick?.(p, market)}
              style={{
                position: 'relative', display: 'flex', flexDirection: 'column', gap: 7,
                textAlign: 'left', cursor: 'pointer',
                background: C.bg2, border: `1px solid ${C.border}`,
                borderTop: `3px solid ${g.color}`, borderRadius: 10,
                padding: '9px 10px 10px', overflow: 'hidden',
                opacity: p.low_sample ? 0.5 : 1,
              }}
            >
              <button
                onClick={(e) => { e.stopPropagation(); watchlist.toggle(p) }}
                title={watchlist.isPinned(p.player_id) ? 'Remove from watchlist' : 'Add to watchlist'}
                style={{
                  position: 'absolute', top: 6, right: 6, zIndex: 1,
                  background: watchlist.isPinned(p.player_id) ? 'rgba(0,245,173,.14)' : 'transparent',
                  border: `1px solid ${watchlist.isPinned(p.player_id) ? C.green : C.border}`,
                  color: watchlist.isPinned(p.player_id) ? C.green : C.text3,
                  borderRadius: 7, padding: '3px 7px', fontSize: 13, lineHeight: 1, cursor: 'pointer',
                }}
              >{watchlist.isPinned(p.player_id) ? '★' : '☆'}</button>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  fontFamily: NUM_FONT, fontSize: TYPE.label, color: C.text3, minWidth: 13,
                }}>{i + 1}</span>
                <NflFace player={p} size={38} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="nfl-board-name" style={{
                    fontSize: TYPE.name, fontWeight: 700, color: C.text,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{p.name}</div>
                  <div className="nfl-board-matchup" style={{
                    fontSize: TYPE.micro, color: C.text3, fontFamily: NUM_FONT,
                    display: 'flex', alignItems: 'center', gap: 5,
                  }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.position} · {p.team} {p.opp ? `vs ${p.opp}` : ''}
                    </span>
                    <MatchupBadge matchup={matchup} player={p} market={market} />
                  </div>
                </div>
                <div style={{ textAlign: 'right', flex: '0 0 auto' }}>
                  {/* The grade, same ladder as the MLB board. The number alone
                      doesn't tell you whether 61 is good on this slate. */}
                  <div style={{
                    fontFamily: NUM_FONT, fontSize: TYPE.title, fontWeight: 900, color: g.color, lineHeight: 1,
                  }}>{Math.round(s)}</div>
                  <div style={{
                    fontFamily: NUM_FONT, fontSize: TYPE.label, fontWeight: 900, color: g.color,
                    border: `1px solid ${g.color}55`, borderRadius: 5,
                    padding: '1px 4px', marginTop: 3, textAlign: 'center',
                  }}>{g.label}</div>
                </div>
              </div>

              {/* THE WHY LINE + CHIPS (2026-09-17) — the same "here's what's
                  actually driving this number" Touchdowns.js gives TD,
                  generalized off the real components/weights every market
                  already publishes. Renders nothing on a market/player pair
                  with no component clearing reasonFor()'s own bar, same as
                  Touchdowns -- an absent line is honest, not a bug. */}
              {why && <div style={{ fontSize: TYPE.micro, color: C.text2, lineHeight: 1.35 }}>He {why}.</div>}
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

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                <FormSparkline form={form} bar={spec?.bar} color={g.color} />
                {/* The book's line, when one exists for this player/market --
                    renders nothing per-card when it doesn't (no line offered is
                    a normal, per-player state; the banner above is what says
                    whether the FETCH itself found anything at all). */}
                {odds && <OddsLine quote={quoteFor(odds, p, market)} compact />}
              </div>

              {(injuryTag(p) || p.carryover) && (
                <div style={{ display: 'flex', gap: 8 }}>
                  {injuryTag(p) && (
                    <span title={injuryTitle(injuryTag(p))} style={{
                      fontSize: TYPE.label, fontWeight: 900, color: injuryColor(injuryTag(p), C),
                    }}>{injuryTag(p)}</span>
                  )}
                  {p.carryover && (
                    <span
                      title="Built from last season's per-game baseline -- no current-season form yet."
                      style={{ fontSize: TYPE.label, fontWeight: 900, color: C.purple }}
                    >CO</span>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {hidden > 0 && (
        <div style={{ marginTop: 14 }}>
          <FilterPill onClick={() => setAll(true)} count={hidden}>Show the rest</FilterPill>
        </div>
      )}

      {!rows.length && (
        <div style={{
          border: `1px dashed ${C.border2}`, borderRadius: 12, padding: 28,
          textAlign: 'center', color: C.text3, fontSize: TYPE.body,
        }}>
          {onlyPriced || onlyUpcoming || onlyWatched
            ? `Nothing matches. The ${[onlyPriced && 'Priced', onlyUpcoming && 'Not kicked off', onlyWatched && 'Watchlist'].filter(Boolean).join(' + ')} filter left nobody — turn one off above.`
            : query || team !== 'all' || position !== 'all'
              ? 'Nothing matches. Clear the search, team or position filter above.'
              : 'Nothing scored for this market on this slate.'}
        </div>
      )}
    </div>
  )
}
