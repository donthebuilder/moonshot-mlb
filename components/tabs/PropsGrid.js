'use client'
import { useEffect, useMemo, useState } from 'react'
import { C, NUM_FONT } from '../../lib/theme'
import { nameOf, teamOf, oppOf, txt, playerId } from '../../lib/player'
import { quoteFor, fmtOdds } from '../../lib/odds'
import {
  ROLE_ORDER, GROUP_ORDER, rolesOf, primaryRole, roleColor,
  verdictFor, sentenceFor, chipsFor,
} from '../../lib/verdict'
import VerdictHero, { PeriodTiles } from '../VerdictHero'
import PropsSheet from '../PropsSheet'
import { useIsPhone } from '../MobileFold'
import { FilterPill } from '../Filters'

// ══ PROPS GRID — THE MOBILE PILOT PAGE ══════════════════════════════════════
// built 2026-08-23 · REDRAWN 2026-08-23 (Donovan: "make the props page better
// and more futuristic looking but still simple … i dont see it on the props
// page or the use of it … make it look visually different")
//
// The first build answered the BRIEF (verdict first, depth on tap) and lost
// the LOOK: the cards were the same 1px-border, 10px-type, bg2 rectangles as
// every other list on the site, sitting under ~500px of page furniture —
// hero tiles, search, team dropdown, tab bar, a three-line paragraph, TWO
// rows of pills and a SECOND search box that duplicated the one at the top
// of every page. On a phone you scrolled half a screen to reach the first
// card, and when you got there nothing told you this page was new. That is
// what "I don't see it" meant.
//
//   1. THE DIAL. One number per card, drawn as a ring that fills to the
//      score — an instrument, not a table cell. It is the only loud thing on
//      the card and the only thing on this site that looks like this, which
//      is the whole point: the page announces itself. It now lives in
//      components/VerdictHero.js, because the player and pitcher modals open
//      the same way (Donovan, same day: "upgrade both ... modals like this").
//   2. AIR. Card padding, name size and tile size all step up; each card
//      carries a soft wash of its own badge colour so a board of them reads
//      as a stack of distinct decisions rather than one grey list.
//   3. THE FURNITURE IS GONE. The second search box is deleted (Controls at
//      the top of the page already filters `players` by name/team/pitcher —
//      this one filtered the same rows a second time), the paragraph moved
//      into TabExplainer where every other tab's lives, and the two pill rows
//      are one sideways-scrolling rail on the standard .chip-row.
//   4. THE PRICE, QUIETLY. "odds are cool make subtle" — the book's own
//      number sits dimmed at the end of the matchup line, and only when the
//      book is quoting the same bar the pick has to clear (quoteFor's
//      `matches`; a HR pick graded on 1+ cannot wear a price for 2+).
//
// WHY-THIS-ONE (the long-open question #7) — Donovan, asked directly: "idk
// please make simple". So the badge's own market score leads, and under it
// ONE sentence. Which sentence, and which score, is lib/verdict.js's job.
//
// Everything else is deliberate: default population is the decision-ready set
// (badge holders + WATCH), "Everyone" is one pill away, cards are ranked only
// against cards measured the same way, and the drill-down is the existing
// player modal — the full grid, splits and zone map already live there.

// ── the market's own name, over its block ───────────────────────────────────
// A hairline and four words. It is what makes the grouped ranking legible
// instead of mysterious, and it says the market in ENGLISH — "2+ total bases"
// rather than CONTACT — which is the one place on the site where the badge
// codes get translated for someone who has never seen them.
function GroupHead({ role, count }) {
  const col = roleColor(role)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '16px 0 9px' }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: col, flexShrink: 0 }} />
      <span style={{
        fontSize: 9.5, fontWeight: 900, letterSpacing: '.14em',
        textTransform: 'uppercase', color: col, whiteSpace: 'nowrap',
      }}>{verdictFor(role).market}</span>
      <span style={{ fontSize: 9, fontFamily: NUM_FONT, fontWeight: 700, color: C.text3 }}>{count}</span>
      <span style={{ flex: 1, height: 1, background: C.border, minWidth: 8 }} />
    </div>
  )
}

// WATCH is the coverage tier, so its price is the home-run market's; a hitter
// with no badge is in no market at all and gets no price rather than a
// borrowed one.
const PRICE_ROLE = { TOP: 'TOP', HR: 'HR', HIT: 'HIT', HRR: 'HRR', CONTACT: 'CONTACT', WATCH: 'HR' }

function priceFor(odds, r, role) {
  const cat = PRICE_ROLE[role]
  if (!odds || !cat) return null
  const q = quoteFor(odds, r, cat)
  if (!q || !q.matches) return null
  const price = fmtOdds(q.over)
  return price === '—' ? null : price
}

function Card({ r, role: forced, odds, onPlayerClick, onWatch, watched }) {
  // The card wears the market you are BROWSING. Filter to HR and a hitter who
  // also holds TOP shows his hr_score, because that is the board you asked
  // for — the first build always showed his highest-priority role instead,
  // so an HR-filtered board could print overall scores.
  const role = forced || primaryRole(r) || 'NONE'
  const v = verdictFor(role)
  const col = roleColor(role)
  const quiet = role === 'WATCH' || role === 'NONE'
  const arm = txt(r?.pitcher_name).trim()
  const hand = txt(r?.pitcher_throws).trim()
  const price = priceFor(odds, r, role)

  return (
    <div onClick={onPlayerClick ? () => onPlayerClick(r) : undefined}
      style={{ cursor: onPlayerClick ? 'pointer' : 'default', minWidth: 0 }}>
      <VerdictHero
        col={col}
        score={v.score(r)}
        title={nameOf(r)}
        badge={role === 'WATCH' ? '👀 WATCH' : role === 'NONE' ? 'NO BADGE' : role}
        badgeQuiet={quiet}
        meta={`${teamOf(r)} vs ${oppOf(r)}${arm ? ` · ${arm}${hand ? ` (${hand})` : ''}` : ''}`}
        metaRight={price}
        line={sentenceFor(r, role)}
        chips={chipsFor(r, role)}
        footer={<PeriodTiles tiles={v.tiles(r)} />}
        right={onWatch && (
          // A star on every card, not only behind the modal (2026-08-24,
          // Donovan: "click a player to add to watch list, nothing
          // happens"). This grid never received onWatch/watchIds from
          // Dashboard at all, so this was the one board on the site where
          // adding to your watchlist meant opening the player first.
          // stopPropagation so the star doesn't also fire the card's own
          // onClick and open the sheet/modal underneath it.
          <button
            onClick={(e) => { e.stopPropagation(); onWatch(r) }}
            title={watched ? 'Remove from watchlist' : 'Add to watchlist'}
            style={{
              flexShrink: 0, background: watched ? 'rgba(249,115,22,.14)' : 'transparent',
              border: `1px solid ${watched ? C.orange : C.border}`,
              color: watched ? C.orange : C.text3,
              borderRadius: 7, padding: '3px 7px', fontSize: 13, lineHeight: 1, cursor: 'pointer',
            }}
          >{watched ? '★' : '☆'}</button>
        )}
      />
    </div>
  )
}

// "Everyone" is 266 hitters on a full slate, and each card here is a real
// piece of paint (a conic ring, a wash, a glow). Rendering all of them at once
// is a phone-melting amount of work for a view nobody scrolls to the bottom
// of, so it stops at 60 — and SAYS SO, with the rest one tap away. A cap that
// doesn't announce itself reads as "that's everybody", which is the one thing
// a coverage board must never imply.
const SOFT_CAP = 60

// ══ PRECISION (2026-08-23) ══════════════════════════════════════════════════
//
// Donovan: "lets focus on precision instead of coverage … i just feel like now
// theres hell picks, to every game's got the top and a hr pick idk … i was
// thinking what about the 4 best bets then from dividing up the picks top hit
// hrr bases whatever, what would the scoring look like if we did that over the
// time — if bad or not good just forget that idea."
//
// bots/precision_study.py measured it over 25 graded nights, every pick on its
// own bar (a homer for the HR pick, a base hit for the HIT pick, 2+ H+R+RBI
// for HRR, 2+ total bases for CONTACT). The numbers below are that study's,
// not an estimate:
//
//     one per market (The Four)   65.0%   over 100 picks
//     two per market              ~59%
//     three per market            ~55%
//     every designation           41.2%   over 2,048 picks
//
// So this is a CUT, not a re-rank: keep the top K of each market's own block
// and hide the rest behind the existing "Show the rest". The ordering inside a
// block is untouched — it is already each market's own score, which is the
// house rule and the reason the study's ranking was legitimate in the first
// place.
//
// WHY PER-MARKET AND NOT TOP-N-OVERALL. A top-4-overall board can be four HR
// picks on a night the HR board runs hot, and HR is the hardest bar on the
// site — 21.8% against 74.3% for 1+ hit. One per market is the shape Donovan
// described ("dividing up the picks") AND the shape that measured best.
//
// DEFAULT FLIPPED TO "1 EACH" (2026-08-29). It shipped off-by-default while
// the study was 25 nights; both the live review and the outside review then
// found the same thing a fresh visitor finds — sixty cards on a page whose
// job is a decision. The official cut leads now: The Four first, the full
// coverage board one tap away on the same remembered pill. Anyone who has
// ever picked a depth keeps their choice — localStorage still wins.
const PRECISION = [
  { key: 0, label: 'All', title: 'Every badge the bot published tonight. Graded 41.2% across 2,048 picks over 25 nights.' },
  { key: 1, label: '🎯 1 each', title: 'The single best pick in each market — the same board as The Four on the Rundown. Graded 65.0% across 100 picks over 25 nights; its 95% floor clears the full board\u2019s ceiling.' },
  { key: 2, label: '2 each', title: 'The top two in each market. Roughly 59% on the same 25 nights — still well clear of the full board, with twice the plays.' },
  { key: 3, label: '3 each', title: 'The top three in each market. Roughly 55% — the lift is real and decaying; past here it flattens toward the full board.' },
]

export default function PropsGrid({ players = [], odds = null, onPlayerClick, onWatch, watchIds }) {
  const [market, setMarket] = useState('picks')
  const [all, setAll] = useState(false)
  // Defaults to the official cut (1 each — The Four); see the PRECISION
  // note. Remembered, because it is a standing preference about how much
  // board you want, not a momentary one.
  const [precision, setPrecision] = useState(1)
  // ── THREE MORE FILTERS AND A SORT (2026-08-31) ──────────────────────────
  //
  // Donovan: "the for the props page any wqay to make better and or add mroe
  // fileters?"
  //
  // The page had exactly two controls — which market, and how deep a cut —
  // and both answer "what am I looking at". Nothing answered "of these, which
  // ones can I still act on", which is the question you have on a props page
  // at 6pm with four games already in the third inning.
  //
  // These three are deliberately the only ones added, and each is a hard fact
  // off the row rather than a judgement:
  //
  //   PRICED       the book has posted a number ON THIS PICK'S OWN BAR.
  //                quoteFor's `matches` is what makes that honest: a 1+ HR
  //                pick cannot borrow a 2+ price to look priced.
  //   NOT STARTED  his game_time is still in the future. This is the one that
  //                earns its place after about 4pm, when half the board is
  //                already unactionable and looked identical to the half that
  //                wasn't.
  //   WATCHLIST    your saved names only.
  //
  // They compose (all three can be on) and they apply BEFORE the precision
  // cut, so "top 1 per market, priced only" means the best priced card in
  // each market — not the best card, hidden if it happens to be unpriced.
  // Getting that order backwards is the whole difference between a filter and
  // a blindfold.
  //
  // No "value" filter, and that omission is deliberate: a real per-game rate
  // to compare a price against is published for HOME RUNS and nothing else,
  // so a value pill would silently mean something different in every market
  // block on the page. The shortlist is where that comparison lives, and it
  // says so.
  const [onlyPriced, setOnlyPriced] = useState(false)
  const [onlyUpcoming, setOnlyUpcoming] = useState(false)
  const [onlyWatched, setOnlyWatched] = useState(false)
  const [sortBy, setSortBy] = useState('score')
  // One clock read per render pass rather than one per row: Date.now() inside
  // a filter callback over 250 rows is 250 different "nows".
  const now = useMemo(() => Date.now(), [players, onlyUpcoming])
  useEffect(() => {
    try {
      // Number(null) is 0 — a missing key must NOT read as a saved "All",
      // or the new official-cut default would never apply to anyone.
      const raw = window.localStorage.getItem('moonshot_precision_v1')
      if (raw === null) return
      const v = Number(raw)
      if (Number.isFinite(v) && v >= 0 && v <= 3) setPrecision(v)
    } catch { /* private mode */ }
  }, [])
  const pickPrecision = (v) => {
    setPrecision(v); setAll(false)
    try { window.localStorage.setItem('moonshot_precision_v1', String(v)) } catch { /* private mode */ }
  }

  // ── THE FULL-PAGE SHEET (2026-08-23) ──────────────────────────────────────
  // Donovan: "i like how the props is but possible have the open up to the
  // props grid as a full page that is clickable — thats what i've been trying
  // to have done, a full props grid page for mobile that is simple."
  //
  // On a phone a tapped card opens components/PropsSheet.js — one player,
  // whole screen, one market at a time, his real hit rates and splits — and
  // "full research →" in its top bar hands off to the desktop modal for
  // anyone who wants the zone map and the rest. On anything wider the modal
  // was already the right answer and still opens directly.
  const isPhone = useIsPhone(760)
  const [sheet, setSheet] = useState(null)
  const openCard = (p) => { if (isPhone) setSheet(p); else onPlayerClick?.(p) }

  const rows = useMemo(() => (players || []).filter((p) => p && p.player_id), [players])

  const counts = useMemo(() => {
    const c = { picks: 0, everyone: rows.length }
    for (const k of ROLE_ORDER) c[k] = 0
    for (const r of rows) {
      const toks = rolesOf(r)
      if (toks.length) c.picks += 1
      for (const k of ROLE_ORDER) if (toks.includes(k)) c[k] += 1
    }
    return c
  }, [rows])

  // GROUPED BY MARKET, RANKED INSIDE IT (2026-08-23). The first build sorted
  // the whole board on "each card's own score", which sounds like the house
  // rule and quietly breaks it: hit_score runs hotter than hr_score, so a
  // 1+HIT card at 80 sat above the game's TOP bat at 65 — two different
  // yardsticks compared against each other, which is exactly what the rule
  // forbids. Cards only ever rank against cards measured the same way now,
  // and the market's own name sits above each block. It also reads better:
  // TOP first is "start here", instead of one undifferentiated stack.
  const groups = useMemo(() => {
    const single = market !== 'picks' && market !== 'everyone'
    let out = rows
    if (market === 'picks') out = out.filter((r) => rolesOf(r).length)
    else if (single) out = out.filter((r) => rolesOf(r).includes(market))

    // BEFORE the precision cut, on purpose — see the note on the state above.
    if (onlyWatched) out = out.filter((r) => watchIds?.has(playerId(r)))
    if (onlyUpcoming) out = out.filter((r) => {
      const t = Date.parse(r?.game_time || '')
      return Number.isFinite(t) && t > now
    })
    if (onlyPriced) out = out.filter((r) => {
      const q = quoteFor(odds, r, PRICE_ROLE[primaryRole(r) || market] || 'HR')
      return !!q && q.over != null && q.matches !== false
    })

    const buckets = new Map()
    for (const r of out) {
      const k = single ? market : (primaryRole(r) || 'NONE')
      if (!buckets.has(k)) buckets.set(k, [])
      buckets.get(k).push(r)
    }
    return GROUP_ORDER.filter((k) => buckets.has(k)).map((k) => {
      const sc = (r) => verdictFor(k).score(r) ?? -1
      // Sorting stays INSIDE the market block, always. The house rule is that
      // cards only ever rank against cards measured the same way, and that is
      // as true of a price or a first pitch as it is of a score.
      const cmp = sortBy === 'price'
        ? (a, b) => {
          const pa = quoteFor(odds, a, PRICE_ROLE[k] || 'HR')
          const pb = quoteFor(odds, b, PRICE_ROLE[k] || 'HR')
          // Longest price first; an unpriced card sinks rather than sorting
          // as if it were even money.
          const va = pa && pa.over != null && pa.matches !== false ? Number(pa.over) : -1e9
          const vb = pb && pb.over != null && pb.matches !== false ? Number(pb.over) : -1e9
          return vb - va || sc(b) - sc(a)
        }
        : sortBy === 'time'
          ? (a, b) => (Date.parse(a?.game_time || '') || 9e15) - (Date.parse(b?.game_time || '') || 9e15) || sc(b) - sc(a)
          : (a, b) => sc(b) - sc(a) || String(nameOf(a)).localeCompare(String(nameOf(b)))
      return { key: k, rows: buckets.get(k).sort(cmp) }
    })
  }, [rows, market, onlyPriced, onlyUpcoming, onlyWatched, watchIds, odds, now, sortBy])

  // The cut. Per market, on the ordering the group already has — see PRECISION.
  const shown = useMemo(() => (
    precision > 0
      ? groups.map((g) => ({ key: g.key, rows: g.rows.slice(0, precision) }))
      : groups
  ), [groups, precision])

  const total = useMemo(() => shown.reduce((s, g) => s + g.rows.length, 0), [shown])
  const dropped = useMemo(
    () => groups.reduce((s, g) => s + g.rows.length, 0) - total,
    [groups, total],
  )

  // Trim ACROSS groups in order, so the cap never silently empties a market.
  const capped = useMemo(() => {
    if (all || total <= SOFT_CAP) return shown
    let left = SOFT_CAP
    const out = []
    for (const g of shown) {
      if (left <= 0) break
      out.push({ key: g.key, rows: g.rows.slice(0, left) })
      left -= Math.min(left, g.rows.length)
    }
    return out
  }, [shown, total, all])

  const hidden = total - capped.reduce((s, g) => s + g.rows.length, 0)

  const pills = [
    { key: 'picks', label: 'Picks', count: counts.picks, title: 'every bat wearing a badge tonight' },
    ...ROLE_ORDER.map((k) => ({ key: k, label: k === 'WATCH' ? '👀 Watch' : k, count: counts[k] })),
    { key: 'everyone', label: 'Everyone', count: counts.everyone },
  ]

  return (
    <div>
      {/* One rail, one line. The search that used to sit here filtered the
          same rows the page header already filters — see the note up top. */}
      <div className="chip-row" style={{
        display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center', paddingBottom: 2,
      }}>
        {pills.map((o) => (
          <FilterPill
            key={o.key}
            active={market === o.key}
            onClick={() => { setMarket(o.key); setAll(false) }}
            count={o.count}
            title={o.title}
          >{o.label}</FilterPill>
        ))}
      </div>
      {/* ── SHOW ME ONLY (2026-08-31) ─────────────────────────────────────
          Three hard facts off the row, not judgements, and they compose. They
          apply BEFORE the precision cut so "top 1 per market, priced only"
          means the best PRICED card in each market rather than the best card
          hidden when it happens to be unpriced. */}
      <div className="chip-row" style={{
        display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center', marginTop: 8,
      }}>
        <span style={{
          fontSize: 8.5, fontWeight: 900, letterSpacing: '.1em', color: C.text3,
          textTransform: 'uppercase', fontFamily: NUM_FONT, flexShrink: 0,
        }}>Only</span>
        <FilterPill active={onlyPriced} onClick={() => setOnlyPriced(!onlyPriced)}
          title="Cards where the book has posted a number on this pick's OWN bar. A 1+ HR pick cannot borrow a 2+ price to look priced.">
          💵 Priced
        </FilterPill>
        <FilterPill active={onlyUpcoming} onClick={() => setOnlyUpcoming(!onlyUpcoming)}
          title="Games that have not started yet. The one that earns its place after about 4pm, when half the board is already unactionable and looked identical to the half that wasn't.">
          ⏱ Not started
        </FilterPill>
        <FilterPill active={onlyWatched} onClick={() => setOnlyWatched(!onlyWatched)}
          title="Only names on your watchlist.">
          ★ Watchlist
        </FilterPill>
        <span style={{ width: 6 }} />
        <span style={{
          fontSize: 8.5, fontWeight: 900, letterSpacing: '.1em', color: C.text3,
          textTransform: 'uppercase', fontFamily: NUM_FONT, flexShrink: 0,
        }}>Sort</span>
        {[['score', 'Score'], ['price', 'Longest price'], ['time', 'First pitch']].map(([k, label]) => (
          <FilterPill key={k} active={sortBy === k} onClick={() => setSortBy(k)}
            title={k === 'score' ? "Each market's own score, which is the page's default and the only ranking the house rule allows across a whole block."
              : k === 'price' ? 'Longest price first, within each market block. An unpriced card sinks rather than sorting as if it were even money.'
                : 'Earliest first pitch first, within each market block.'}>
            {label}
          </FilterPill>
        ))}
      </div>

      {/* ── PRECISION (2026-08-23) ────────────────────────────────────────
          "lets focus on precision instead of coverage." Measured, not
          asserted — the rate on each pill is bots/precision_study.py's own
          number over 25 graded nights, every pick on its own bar. Off by
          default: 25 nights is enough to offer this and not enough to impose
          it, and the bot publishes coverage on purpose. */}
      <div className="chip-row" style={{
        display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center', marginTop: 8,
      }}>
        <span style={{
          fontSize: 8.5, fontWeight: 900, letterSpacing: '.1em', color: C.text3,
          textTransform: 'uppercase', fontFamily: NUM_FONT, flexShrink: 0,
        }}>Precision</span>
        {PRECISION.map((o) => (
          <FilterPill
            key={o.key}
            active={precision === o.key}
            onClick={() => pickPrecision(o.key)}
            title={o.title}
          >{o.label}</FilterPill>
        ))}
      </div>

      <div style={{ fontSize: 10, color: C.text3, margin: '8px 0 4px', lineHeight: 1.55 }}>
        {hidden > 0 ? `showing ${total - hidden} of ${total}` : `${total} card${total === 1 ? '' : 's'}`}
        {' — the verdict first, tap one for the full read.'}
        {dropped > 0 && (
          <>
            {' '}<b style={{ color: C.text2 }}>Precision is on</b> — the top{' '}
            {precision === 1 ? 'pick' : `${precision}`} in each market, with{' '}
            <b style={{ color: C.text2 }}>{dropped}</b> further badge{dropped === 1 ? '' : 's'} cut.
            {precision === 1 && ' That exact board graded 65.0% over 25 nights against 41.2% for every designation.'}
            {' '}Nothing is deleted — switch to <b style={{ color: C.text2 }}>All</b> for the whole card.
          </>
        )}
      </div>

      {total === 0 ? (
        <div style={{ fontSize: 11.5, color: C.text3, marginTop: 10 }}>
          Nothing matches.{' '}
          {onlyPriced || onlyUpcoming || onlyWatched
            ? `The ${[onlyPriced && 'Priced', onlyUpcoming && 'Not started', onlyWatched && 'Watchlist'].filter(Boolean).join(' + ')} filter left nobody in this market — turn one off above.`
            : 'No slate published yet, or the market filter left nobody. Clear it above.'}
        </div>
      ) : (
        <>
          {capped.map((g) => (
            <div key={g.key}>
              <GroupHead role={g.key} count={g.rows.length} />
              <div style={{
                display: 'grid', gap: 11,
                gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 330px), 1fr))',
              }}>
                {g.rows.map((r) => (
                  <Card key={`${r.player_id}-${r.game_pk}`} r={r} role={g.key} odds={odds} onPlayerClick={openCard} onWatch={onWatch} watched={watchIds?.has(playerId(r))} />
                ))}
              </div>
            </div>
          ))}
          {hidden > 0 && (
            <div style={{ marginTop: 14 }}>
              <FilterPill onClick={() => setAll(true)} count={hidden}>Show the rest</FilterPill>
            </div>
          )}
        </>
      )}

      {sheet && (
        <PropsSheet
          player={sheet}
          odds={odds}
          onClose={() => setSheet(null)}
          onFullResearch={(p) => { setSheet(null); onPlayerClick?.(p) }}
          onWatch={onWatch}
          watched={watchIds?.has(playerId(sheet))}
        />
      )}
    </div>
  )
}
