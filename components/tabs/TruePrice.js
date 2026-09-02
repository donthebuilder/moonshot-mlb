'use client'
import { Fragment, useEffect, useMemo, useState } from 'react'
import { C, NUM_FONT } from '../../lib/theme'
import { verdictInk } from '../../lib/scales'
import { fetchJSON } from '../../lib/data'
import OddsStatus, { useOddsStatus } from '../OddsStatus'
import { oddsHistoryPaths } from '../../lib/dataSource'
import { fmtOdds, impliedPct } from '../../lib/odds'
import { hrScore, hitScore, prodScore, tbScore } from '../../lib/player'
import {
  flatten, priceText, historyLooksReal, readsAs, roiRows, roiVerdict, gapSe, MARKET_LABEL, MARKET_ORDER,
} from '../../lib/oddsHistory'
import { wilson, wilsonLower } from '../../lib/interval'
import { benjaminiHochberg, expectedFalseAlarms } from '../../lib/fdr'
import { RoiErrorBars, GapFunnel, GapIntervals } from '../OddsChart'

// 🏷 TRUE PRICE
//
// Donovan, 2026-08-15: "a page where it track players who go at what price for
// certain props that way we can find the true price of a player to do certian
// things."
//
// Two prices per row and they are not the same kind of thing:
//
//   TRUE      what his own rate says the bet is worth
//   GOES AT   what the book has actually been paying him
//
// The gap between them is the entire product of this page. Positive means the
// market has been slow on him; negative means you have been paying up for a
// name. Everything else here exists to stop that gap being believed too early.
//
// FETCHED ON OPEN, not by the Dashboard. This payload is season-scale and does
// not change during a slate, so putting it in the poll would re-download a few
// hundred KB every 60 seconds to show the same numbers.
//
// ── 2026-08-16, THE PAGE THAT SHOWED NOTHING ────────────────────────────────
//
// Donovan sent a screenshot of this view and the entire page was one grey
// line: "Nothing at 10+ nights. The history is 1 night old, so no row can
// clear that bar yet — try 5." MIN NIGHTS was hard-defaulted to 10 against an
// archive holding one night, so the page loaded its full contents and then
// filtered every last row away before drawing anything. A default the data
// cannot satisfy is a BUG, not a strict filter — it shows an empty page while
// a full one sits one notch down. See MIN_NIGHT_RUNGS below for the fix.
//
// The other half of the same screenshot was order: a long explanation, then a
// money panel, then filters, then (on that night) nothing. The page now leads
// with its answer — how many priced lines actually clear their own error bar
// and which one is loudest — and the explanation moved to a fold at the
// bottom, where a manual belongs. Nothing was deleted; the paragraph is intact
// inside "How to read this page".

const SORTS = [
  ['gap', 'Biggest gap'],
  ['support', 'Best-supported rate'],
  ['rate', 'Hit rate'],
  ['streak', 'Hottest streak'],
  ['tonight', 'Tonight’s edge'],
  ['n', 'Most nights'],
  ['price', 'Longest true price'],
  ['name', 'Name'],
]

// ── TONIGHT, BESIDE THE HISTORY (2026-09-01) ────────────────────────────────
//
// Donovan, confirming this is the board he pictured, and what it was missing:
// "streaks and scores and price hit rate like the avg price pregame when they
// cash." The history columns say what a hitter HAS been; these say what he is
// TONIGHT, so the two can be read against each other in one row:
//
//   SCORE     the model's number for the same market, off tonight's slate
//   TONIGHT   the price the book is posting right now at this line
//   EDGE      his own rate minus what tonight's price needs — the same gap
//             the page is named after, but against the number you can
//             actually bet, not the average of the ones you missed
//
// A hitter not on tonight's slate simply has blanks here; the history is still
// the history. The score is per-market because a HR score says nothing about
// a 2+ hits line — see lib/player.js for which field each market reads.
const MARKET_SCORE = {
  batter_home_runs: hrScore,
  batter_hits: hitScore,
  batter_hits_runs_rbis: prodScore,
  batter_runs_scored: prodScore,
  batter_rbis: prodScore,
  batter_total_bases: tbScore,
}
function tonightFor(r, byPid, odds) {
  const p = byPid.get(Number(r.pid))
  const score = p ? MARKET_SCORE[r.market]?.(p) : null
  const q = odds?.by_player_id?.[String(r.pid)]?.[r.market]
  const sameLine = q && Number.isFinite(Number(q.line)) && Math.abs(Number(q.line) - Number(r.line)) < 1e-9
  const price = sameLine ? (q.over ?? null) : null
  const need = sameLine ? (q.implied ?? impliedPct(q.over)) : null
  const edge = need != null && Number.isFinite(Number(r.rate)) ? Math.round(10 * (Number(r.rate) - need)) / 10 : null
  return { onSlate: Boolean(p), score: Number.isFinite(score) ? score : null, price, need, edge, bookLine: q?.line ?? null }
}

// The false-discovery rate the page controls at. 10% is the working number in
// screening work and it reads as a plain sentence: at most one row in ten that
// this page calls real is expected to be noise. Tighter than that and a ten-
// night archive returns nothing, which is a filter that hides everything.
const FDR_Q = 0.10

// ── MIN NIGHTS ──────────────────────────────────────────────────────────────
//
// The rungs now carry their own row counts, and the page picks its OPENING
// rung from what the archive actually holds: 10 whenever 10 has rows (the
// shipped behaviour, unchanged on a mature archive), otherwise the highest
// rung below it that does. It never steps UP on its own — a page that quietly
// raised its own bar would be hiding rows — and when it steps down it says so
// in a sentence, with the rung it stepped down from. Touching any rung pins it
// and the page stops choosing.
//
// A 1 rung is new. On a one-night archive every row has n=1, so 5 is just as
// empty as 10 was; without a rung the data can reach, "pick a sensible default"
// has nothing to pick. Every row it exposes is labelled 'too thin' by
// trustOf(), which is the honest reading, not a hidden one.
const MIN_NIGHT_RUNGS = [1, 5, 10, 20, 40]
const PREFERRED_MIN = 10

const chip = (on) => ({
  padding: '3px 10px', borderRadius: 999, cursor: 'pointer', fontSize: 9.5,
  fontWeight: 800, fontFamily: NUM_FONT, whiteSpace: 'nowrap',
  border: `1px solid ${on ? C.orange : C.border}`,
  background: on ? 'rgba(249,115,22,.14)' : 'transparent',
  color: on ? C.orange : C.text3,
})

const th = { fontSize: 8.5, color: C.text3, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.07em', padding: '0 6px 4px', whiteSpace: 'nowrap' }

export default function TruePrice({ onPlayerClick, players = [], odds = null }) {
  const [hist, setHist] = useState(undefined)   // undefined = loading, null = absent
  const [market, setMarket] = useState('all')
  // null = "the page chooses" (see MIN_NIGHT_RUNGS). A number means the reader
  // clicked a rung and owns the choice from then on.
  const [minNPin, setMinNPin] = useState(null)
  const [sort, setSort] = useState('gap')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(null)
  const oddsStatus = useOddsStatus()

  useEffect(() => {
    let alive = true
    fetchJSON(oddsHistoryPaths(), historyLooksReal)
      .then((j) => { if (alive) setHist(j || null) })
      .catch(() => { if (alive) setHist(null) })
    return () => { alive = false }
  }, [])

  // How many priced lines survive each rung. Counted straight off the payload
  // rather than off flatten()'s output, because flatten's `minN` argument only
  // changes each row's TRUST tier — the row set itself is the same at every
  // rung — and deriving the default from the thing it feeds would be circular.
  // The `n` guard matches flatten's, so these counts and the table agree.
  const nightCounts = useMemo(() => {
    const counts = new Map(MIN_NIGHT_RUNGS.map((v) => [v, 0]))
    Object.values(hist?.players || {}).forEach((p) => {
      Object.values(p?.markets || {}).forEach((b) => {
        const k = Number(b?.n)
        if (!b || !Number.isFinite(k)) return
        MIN_NIGHT_RUNGS.forEach((v) => { if (k >= v) counts.set(v, counts.get(v) + 1) })
      })
    })
    return counts
  }, [hist])

  const autoMin = useMemo(() => {
    if (nightCounts.get(PREFERRED_MIN)) return PREFERRED_MIN
    const below = MIN_NIGHT_RUNGS.filter((v) => v < PREFERRED_MIN).sort((a, b) => b - a)
    for (const v of below) if (nightCounts.get(v)) return v
    return MIN_NIGHT_RUNGS[0]
  }, [nightCounts])

  const minN = minNPin ?? autoMin
  const steppedDown = minNPin == null && autoMin < PREFERRED_MIN && nightCounts.get(autoMin) > 0

  const byPid = useMemo(() => {
    const m = new Map()
    ;(players || []).forEach((p) => { const id = Number(p?.player_id ?? p?.id); if (Number.isFinite(id)) m.set(id, p) })
    return m
  }, [players])
  const rows = useMemo(
    () => flatten(hist, { minN }).map((r) => ({ ...r, tonight: tonightFor(r, byPid, odds) })),
    [hist, minN, byPid, odds],
  )

  // THE ANSWER, computed before anything is drawn. Everything in the lead band
  // is a count over the rows the table is about to show — ignoring the market
  // filter and the search box on purpose, because the reader has not narrowed
  // anything yet when they read it.
  const lead = useMemo(() => {
    const pool = rows.filter((r) => r.n >= minN)
    const real = pool.filter((r) => r.trust === 'real')
    const up = real.filter((r) => r.edge > 0)
    const down = real.filter((r) => r.edge < 0)
    const loudest = [...real].sort((a, b) => Math.abs(b.z ?? 0) - Math.abs(a.z ?? 0))[0] || null
    const best = [...pool].sort((a, b) => (b.edge ?? 0) - (a.edge ?? 0))[0] || null
    // ── THE SEARCH ITSELF IS A HYPOTHESIS TEST (2026-08-30) ─────────────
    // Every row above got its own two-sigma test and passed or failed it
    // alone. Nothing had ever asked what happens when the SAME test is run
    // across two thousand lines at once: at 5% each, about one line in
    // twenty comes back "holds up" on a board where nothing is true, and
    // those false positives are big gaps by construction, so they sort to
    // the top. Benjamini–Hochberg over the same z-scores answers the
    // question a bettor actually has — of the rows I would act on, how many
    // are noise — and `expected` is the count that makes the difference
    // between the two readings visible in one sentence.
    const fdr = benjaminiHochberg(pool, (r) => r.z, FDR_Q)
    const expected = expectedFalseAlarms(pool.length)
    const survivors = new Set()
    fdr.pass.forEach((i) => { if (pool[i]) survivors.add(pool[i].id) })
    return { pool, real, up, down, loudest, best, fdr, expected, survivors }
  }, [rows, minN])

  // Rows sort by how much the sample backs them FIRST, so a proven small gap
  // outranks an unproven big one. (Restored 2026-08-15 — the sentences rewrite
  // of the Reality Check swallowed these two lines and the default sort threw
  // `rank is not defined`, which the render walk caught only after the walk
  // itself was fixed to actually reload between tabs.)
  const RANK = { real: 3, leaning: 2, noise: 1, thin: 0 }
  const rank = (r) => RANK[r.trust] ?? 0

  // The price the funnel is drawn at. gapSe() takes a break-even rate, and a
  // funnel needs ONE — so it uses the median of the prices actually on the
  // board rather than a made-up 50%, which would draw a bar wider than any row
  // on a longshot-heavy board and narrower than reality on a short one. Median
  // over mean because a handful of +1500 quotes should not move the curve.
  const medianImplied = useMemo(() => {
    const v = rows.map((r) => Number(r.avgImplied)).filter(Number.isFinite).sort((a, b) => a - b)
    if (!v.length) return 50
    return v[Math.floor(v.length / 2)]
  }, [rows])

  // "39–86%" — the sample's own resolution, beside the rate it qualifies.
  const ciOf = (r) => {
    const ci = wilson(r.hits, r.n)
    return ci ? `${ci[0].toFixed(0)}\u2013${ci[1].toFixed(0)}%` : null
  }

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    let r = rows.filter((x) => x.n >= minN)
    if (market !== 'all') r = r.filter((x) => x.market === market)
    if (needle) r = r.filter((x) => x.name.toLowerCase().includes(needle) || x.team.toLowerCase().includes(needle))
    const by = {
      // DEFAULT. Sorted by the gap, but PROVEN gaps first — a 30-point gap on
      // eleven nights ranking above a 9-point gap on ninety would be the page
      // telling a lie with a sort order.
      gap: (a, b) => (rank(b) - rank(a)) || (b.edge - a.edge),
      // THE SORT THAT ACCOUNTS FOR ITS OWN DENOMINATOR. lib/interval.js's
      // own header makes the case: 8-for-12 (66.7%) leads 30-for-50 (60.0%)
      // on the raw rate and trails it on the lower bound, and the lower
      // bound is the order you would pick in if you had to put money on one.
      support: (a, b) => (wilsonLower(b.hits, b.n) ?? -1) - (wilsonLower(a.hits, a.n) ?? -1),
      rate: (a, b) => b.rate - a.rate,
      // Longest current run of cashes first; a cold run sorts to the bottom
      // rather than mixing in by absolute length.
      streak: (a, b) => (b.streak - a.streak) || (b.rate - a.rate),
      // Rows with a price on the board tonight first, biggest edge against
      // THAT price on top. Everyone else keeps the default order below them.
      tonight: (a, b) => ((b.tonight.edge ?? -1e9) - (a.tonight.edge ?? -1e9)) || ((rank(b) - rank(a)) || (b.edge - a.edge)),
      n: (a, b) => b.n - a.n,
      price: (a, b) => (b.truePrice ?? -1e9) - (a.truePrice ?? -1e9),
      name: (a, b) => a.name.localeCompare(b.name) || a.marketLabel.localeCompare(b.marketLabel),
    }
    return [...r].sort(by[sort] || by.gap)
  }, [rows, market, minN, sort, q])

  // How many different sample sizes the CHARTED rows actually span — the rows
  // after the rung filter, not flatten()'s whole output. Caught in render
  // 2026-08-30: flatten() returns every row at every n (the rung only changes
  // the trust tier), so counting there said "ten distinct sizes" while every
  // visible row sat at exactly five, and the funnel drew a stripe anyway.
  const distinctN = useMemo(
    () => new Set((shown.length ? shown : lead.pool).map((r) => r.n)).size,
    [shown, lead.pool],
  )


  if (hist === undefined) {
    return <div style={{ fontSize: 11, color: C.text3, fontFamily: NUM_FONT, padding: 18 }}>Loading the price history…</div>
  }

  // ── nothing published yet ─────────────────────────────────────────────────
  if (!hist || !hist.days?.length) {
    return (
      <Shell>
        <div style={{
          border: `1px solid ${C.border}`, borderRadius: 12, padding: '16px 18px',
          background: C.bg2, fontSize: 12, lineHeight: 1.65, color: C.text2, maxWidth: 720,
        }}>
          <b style={{ color: C.text }}>No history yet.</b> This page starts filling the first night an
          odds snapshot and a graded results file exist for the <b>same date</b> — the bot keeps a
          dated copy of every pre-game price it fetches, then settles each one against that night&apos;s
          box score.
          <div style={{ fontSize: 10.5, color: C.text3, marginTop: 8 }}>
            Needs the odds workflow to have run before first pitch and the grading workflow to have
            run after. One night of both, and the first rows appear.
          </div>
          {/* This is exactly where someone stands when they ask "are the odds
              even on there", so the status shows even when it's fine. */}
          <div style={{ marginTop: 11 }}>
            <OddsStatus status={oddsStatus} always />
          </div>
          {hist?.priced_not_graded?.length > 0 && (
            <div style={{ fontSize: 10.5, color: C.orange, marginTop: 8, fontFamily: NUM_FONT }}>
              Priced but not yet graded: {hist.priced_not_graded.join(', ')}
            </div>
          )}
        </div>
        <HowToRead open />
      </Shell>
    )
  }

  const marketsPresent = MARKET_ORDER.filter((m) => rows.some((r) => r.market === m))

  return (
    <Shell days={hist.days} settled={hist.settled_props} stamp={hist.generated_at_human}>
      <div style={{ marginBottom: 10 }}><OddsStatus status={oddsStatus} /></div>

      {/* ── THE READ, BEFORE ANYTHING ELSE ──────────────────────────────────
          Sentences, not tiles: every one of these numbers needs a clause after
          it ("+18 points and still inside its own error bar" is the finding,
          not "+18"), and a tile cannot carry a clause. */}
      <div style={{
        background: `linear-gradient(155deg, ${C.bg2}, rgba(249,115,22,.04))`,
        border: `1px solid ${C.border}`, borderRadius: 13,
        padding: '11px 15px', display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 11,
      }}>
        <Line icon="🏷">
          {!lead.pool.length ? (
            <>
              <B>{hist.days.length}</B> graded night{hist.days.length === 1 ? '' : 's'} of prices are
              in, and <B>{Number(hist.settled_props) ? Number(hist.settled_props).toLocaleString() : 'zero'}</B> settled
              props with them, but no player has been priced at the SAME line on <B>{minN}</B> of
              them — so there is no rate to quote at this rung. A line needs repeats before it has a
              rate, and this fills in a night at a time.
            </>
          ) : lead.real.length ? (
            <>
              Of the <B>{lead.pool.length.toLocaleString()}</B> priced lines with{' '}
              <B>{minN}+</B> graded night{minN === 1 ? '' : 's'} behind them,{' '}
              <B col={verdictInk(true).color}>{lead.real.length}</B> clear their own error bar —{' '}
              <B col={verdictInk(true).color}>{lead.up.length}</B> where the market has been slow on him,{' '}
              <B col={verdictInk(false).color}>{lead.down.length}</B> where you have been paying up for the name.
            </>
          ) : (
            <>
              None of the <B>{lead.pool.length.toLocaleString()}</B> priced line
              {lead.pool.length === 1 ? '' : 's'} at <B>{minN}+</B> night{minN === 1 ? '' : 's'} clears
              its own error bar yet, on <B>{hist.days.length}</B> graded night
              {hist.days.length === 1 ? '' : 's'} of prices. That is the expected answer this early,
              not a broken page — a ten-point gap against a coin-flip price takes about a hundred
              nights to separate from luck. The table is sorted best-supported first regardless.
            </>
          )}
        </Line>

        {/* ── HOW MANY OF THOSE ARE THE SEARCH TALKING (2026-08-30) ────
            The line above counts the rows that clear their own error bar. It
            has never said how many rows a board of this size would hand back
            if NOTHING were true, and that number is not small: at 5% each,
            2,000 lines produce about ninety. This is the only sentence on the
            page that judges the page rather than a player. */}
        {lead.pool.length >= 10 && (
          <Line icon="🎯">
            Those verdicts come from testing <B>{lead.pool.length.toLocaleString()}</B> lines at
            once, and a board that size hands back about <B>{Math.round(lead.expected)}</B> two-sigma
            &ldquo;findings&rdquo; even when nothing is true.{' '}
            {lead.fdr.pass.size
              ? <>Controlling the false-discovery rate at <B>{Math.round(FDR_Q * 100)}%</B> leaves{' '}
                <B col={verdictInk(true).color}>{lead.fdr.pass.size}</B> of them standing — of which
                about <B>{lead.fdr.expectedFalse}</B> is still expected to be noise. Those rows wear a{' '}
                <b style={{ color: verdictInk(true).color }}>survives the board</b> mark below.</>
              : <>Not one row survives that correction, which is the honest state of a{' '}
                <B>{hist.days.length}</B>-night archive: the individual verdicts are real tests, and
                the board as a whole has not yet found anything the search alone would not have
                produced.</>}
          </Line>
        )}

        {lead.loudest && (
          <Line icon="📣">
            The loudest is{' '}
            <b
              onClick={() => onPlayerClick?.({ player_id: lead.loudest.pid, player_name: lead.loudest.name, team: lead.loudest.team })}
              style={{ color: C.text, cursor: 'pointer', borderBottom: `1px dotted ${C.border2}` }}
              title="Open his card"
            >{lead.loudest.name}</b>{lead.loudest.team ? ` (${lead.loudest.team})` : ''} on{' '}
            <b style={{ color: C.text }}>{lead.loudest.label}</b> — he cleared it{' '}
            <B>{lead.loudest.hits}/{lead.loudest.n}</B> ({lead.loudest.rate.toFixed(0)}%) while the
            prices he was actually getting only needed <B>{lead.loudest.avgImplied}%</B>. True price{' '}
            <B col={C.orange}>{priceText(lead.loudest.truePrice, lead.loudest.rate, lead.loudest.n)}</B>,
            book price <B>{lead.loudest.avgPrice != null ? fmtOdds(lead.loudest.avgPrice) : '—'}</B>{' '}
            — a <B col={verdictInk(lead.loudest.edge > 0).color}>
              {lead.loudest.edge > 0 ? '+' : ''}{lead.loudest.edge.toFixed(0)}
            </B>-point gap at <B>{lead.loudest.z}σ</B>.
          </Line>
        )}

        {!lead.real.length && lead.best && lead.best.edge > 0 && (
          <Line icon="👀">
            The biggest raw gap belongs to <b style={{ color: C.text }}>{lead.best.name}</b> on{' '}
            <b style={{ color: C.text }}>{lead.best.label}</b> — <B>{lead.best.hits}/{lead.best.n}</B>{' '}
            against prices needing <B>{lead.best.avgImplied}%</B>, <B>+{lead.best.edge.toFixed(0)}</B>{' '}
            points. Read it as a name to watch: at this sample the gap and no gap are the same claim.
          </Line>
        )}

        {/* THE DEFAULT SAYING WHAT IT DID. Never silently show an empty page
            when there is data one notch down — and never move the bar without
            printing the move. */}
        {steppedDown && (
          <Line icon="⚙️">
            Opened at <B>{minN}+ nights</B> instead of the usual <B>{PREFERRED_MIN}+</B>:{' '}
            {nightCounts.get(PREFERRED_MIN)
              ? <>only <B>{nightCounts.get(PREFERRED_MIN)}</B> line{nightCounts.get(PREFERRED_MIN) === 1 ? '' : 's'} reach ten graded nights at one number</>
              : <>no line has ten graded nights at one number yet — the archive is <B>{hist.days.length}</B> night{hist.days.length === 1 ? '' : 's'} old</>}
            , and a filter that hides everything is a broken filter. Click any rung below and the page
            stops choosing for you.
          </Line>
        )}
      </div>

      <RealityCheck hist={hist} />

      {/* ── THE PAGE'S OWN RULE, DRAWN (2026-08-30) ───────────────────────
          Donovan: "make these pages more precise and better stats and chart
          wise." Everything the funnel shows was already true in the table —
          it is the same gap against the same two-standard-error bar the
          Reads-as column runs — but as a chip beside a number it took sixty
          separate readings to notice that every dot on a ten-night archive
          sits inside the funnel. That is the page's real answer and it was
          invisible. Clicking a dot opens the same receipts the row does. */}
      {/* The funnel needs the sample size to VARY; on a young archive every row
          sits at the same n and it collapses to a stripe. So the page picks:
          intervals always work, the funnel earns its place once the archive has
          rows at three different sample sizes. Neither is ever both. */}
      {distinctN >= 3 ? (
        <GapFunnel
          rows={shown.length ? shown : lead.pool}
          seAt={(n) => gapSe(medianImplied, n)}
          onPick={(r) => setOpen(open === r.id ? null : r.id)}
        />
      ) : (
        <GapIntervals
          rows={shown.length ? shown : lead.pool}
          seAt={(n) => gapSe(medianImplied, n)}
          onPick={(r) => setOpen(open === r.id ? null : r.id)}
        />
      )}

      {/* ── controls ── */}
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center', marginBottom: 9 }}>
        <button onClick={() => setMarket('all')} style={chip(market === 'all')}>All props</button>
        {marketsPresent.map((m) => (
          <button key={m} onClick={() => setMarket(m)} style={chip(market === m)}>{MARKET_LABEL[m]}</button>
        ))}
        <span style={{ width: 8 }} />
        <span style={{ fontSize: 8, color: C.text3, textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 800 }}>Min nights</span>
        {/* Each rung wears the number of lines that clear it, so an empty rung
            is visible BEFORE it is clicked rather than after. */}
        {MIN_NIGHT_RUNGS.map((v) => {
          const c = nightCounts.get(v) || 0
          return (
            <button
              key={v} onClick={() => setMinNPin(v)}
              style={{ ...chip(minN === v), opacity: c ? 1 : 0.45 }}
              title={c
                ? `${c.toLocaleString()} line${c === 1 ? '' : 's'} have at least ${v} graded night${v === 1 ? '' : 's'} at that exact line${v === 1 ? ' — nothing here can clear its error bar, read the Reads as column' : ''}`
                : `No line has ${v} graded nights at one number yet`}
            >{v}<span style={{ opacity: 0.6, marginLeft: 4 }}>{c}</span></button>
          )
        })}
        {minNPin != null && (
          <button
            onClick={() => setMinNPin(null)} style={chip(false)}
            title={`Hand the choice back to the page — it opens at ${PREFERRED_MIN}+ when rows exist there, otherwise the highest rung that has any`}
          >↺ auto</button>
        )}
        <span style={{ width: 8 }} />
        {SORTS.map(([k, label]) => (
          <button key={k} onClick={() => setSort(k)} style={chip(sort === k)}>{label}</button>
        ))}
        <input
          value={q} onChange={(e) => setQ(e.target.value)} placeholder="player or team"
          style={{
            marginLeft: 'auto', fontFamily: NUM_FONT, fontSize: 10.5, padding: '4px 9px',
            borderRadius: 999, border: `1px solid ${C.border}`, background: 'transparent',
            color: C.text, minWidth: 130, outline: 'none',
          }}
        />
      </div>

      {!shown.length ? (
        // AN EMPTY TABLE NOW HAS TO SAY WHOSE FAULT IT IS. The page only opens
        // on a rung with rows, so getting here means the reader narrowed it —
        // a pinned rung, a prop filter or the search box — and the line names
        // which one and offers the click back.
        <div style={{ fontSize: 11.5, color: C.text3, lineHeight: 1.6, padding: '10px 2px' }}>
          Nothing at {minN}+ night{minN === 1 ? '' : 's'}{market !== 'all' ? ` on ${MARKET_LABEL[market]}` : ''}
          {q ? ` matching “${q}”` : ''}.{' '}
          {(() => {
            const reachable = MIN_NIGHT_RUNGS.filter((v) => v < minN && nightCounts.get(v)).sort((a, b) => b - a)[0]
            if (nightCounts.get(minN) && (market !== 'all' || q)) {
              return <>
                {nightCounts.get(minN).toLocaleString()} line{nightCounts.get(minN) === 1 ? '' : 's'} clear
                that many nights across all props, so it is the prop filter or the search box doing this,
                not the archive.
              </>
            }
            if (reachable) {
              return <>
                The archive is {hist.days.length} night{hist.days.length === 1 ? '' : 's'} old, so no line
                has {minN} graded nights at one number yet —{' '}
                <b onClick={() => setMinNPin(reachable)} style={{ color: C.orange, cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dotted' }}>
                  drop to {reachable}+
                </b>, which has {nightCounts.get(reachable).toLocaleString()}.
              </>
            }
            return <>
              No line in the archive has a graded night at a repeated number yet — this fills in as the
              odds workflow and the grading workflow both run on the same date.
            </>
          })()}
        </div>
      ) : (
        <div className="dense-scroll rail" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 2px', fontFamily: NUM_FONT }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: 'left' }}>Player</th>
                <th style={{ ...th, textAlign: 'left' }}>Prop</th>
                <th style={th} title="Nights he was priced at this exact line AND graded. Games he never batted in are void, not misses.">N</th>
                <th style={th}>Hit rate</th>
                <th style={th} title="The American price at which his own rate breaks even. This is the number the page is named after.">True</th>
                <th style={th} title="What the book has actually been paying him, averaged as probability and converted back.">Goes at</th>
                <th style={th} title="His rate minus what those prices needed. Positive = the market has been slow on him.">Gap</th>
                <th style={{ ...th, textAlign: 'left' }} title="Whether the gap is bigger than its own error bar.">Reads as</th>
                <th style={th} title="Current run, newest night first. +3 = cleared his last three priced nights; −4 = missed his last four.">Streak</th>
                <th style={th} title="The average pregame price on the nights he actually cashed this prop — what it cost to be on him when it worked. Averaged as probability, like Goes at.">Cashed at</th>
                <th style={th} title="The model's score for this same market, off tonight's slate. Blank if he isn't playing tonight.">Score</th>
                <th style={th} title="What the book is posting right now at this exact line. Blank if he isn't priced tonight, or the book is at a different number.">Tonight</th>
                <th style={th} title="His rate minus what tonight's price needs. The gap column, against a number you can actually bet.">Edge</th>
              </tr>
            </thead>
            <tbody>
              {shown.slice(0, 300).map((r) => {
                const t = readsAs(r.trust, r.edge)
                const isOpen = open === r.id
                return (
                  <Fragment key={r.id}>
                    <tr onClick={() => setOpen(isOpen ? null : r.id)}
                      style={{ cursor: 'pointer', background: isOpen ? 'rgba(249,115,22,.07)' : 'transparent' }}>
                      <td style={{ fontSize: 11.5, fontWeight: 700, color: C.text, padding: '4px 6px', whiteSpace: 'nowrap' }}>
                        <span
                          onClick={(e) => { e.stopPropagation(); onPlayerClick?.({ player_id: r.pid, player_name: r.name, team: r.team }) }}
                          style={{ borderBottom: `1px dotted ${C.border2}` }}
                          title="Open his card"
                        >{r.name}</span>
                        {r.team && <span style={{ fontSize: 9, color: C.text3, marginLeft: 6 }}>{r.team}</span>}
                      </td>
                      <td style={{ fontSize: 10.5, color: C.text2, padding: '4px 6px', whiteSpace: 'nowrap' }}>{r.label}</td>
                      <td style={{ ...cell, color: C.text3 }} title={`${r.hits} of ${r.n}`}>{r.n}</td>
                      {/* THE RATE, WITH ITS OWN RESOLUTION UNDER IT. A bare
                          "80%" off five nights and a "80%" off eighty nights
                          are the same three characters and different facts;
                          the Wilson range is the difference, printed. */}
                      <td style={{ ...cell, color: C.text, fontWeight: 900 }}
                        title={`${r.hits}/${r.n} · 95% Wilson interval ${ciOf(r) || 'n/a'} · the gap's own error bar is ±${r.se} points`}>
                        {r.rate.toFixed(0)}%
                        {ciOf(r) && (
                          <div style={{ fontSize: 8, fontWeight: 700, color: C.text3, marginTop: 1 }}>{ciOf(r)}</div>
                        )}
                      </td>
                      <td style={{ ...cell, color: C.orange, fontWeight: 900 }}>
                        {priceText(r.truePrice, r.rate, r.n)}
                      </td>
                      <td style={{ ...cell, color: C.text2 }} title={`needs ${r.avgImplied}% to break even`}>
                        {r.avgPrice != null ? fmtOdds(r.avgPrice) : '—'}
                      </td>
                      <td style={{
                        ...cell, fontWeight: 900,
                        color: r.trust === 'real' ? verdictInk(r.edge > 0).color : C.text2,
                      }} title={r.z != null ? `${r.edge > 0 ? '+' : ''}${r.edge} points, error bar ±${r.se} → ${r.z} standard errors` : ''}>
                        {r.edge > 0 ? '+' : ''}{r.edge.toFixed(0)}
                      </td>
                      <td style={{ padding: '4px 6px', whiteSpace: 'nowrap' }}>
                        <span title={t.why} style={{
                          fontSize: 8.5, fontWeight: 800, letterSpacing: '.04em', padding: '1.5px 7px',
                          borderRadius: 999, border: `1px solid ${t.tone}55`, background: `${t.tone}14`, color: t.tone,
                        }}>{t.label}</span>
                        {r.z != null && <span style={{ fontSize: 8.5, color: C.text3, marginLeft: 6 }}>{r.z > 0 ? '+' : ''}{r.z}σ</span>}
                        {lead.survivors.has(r.id) && (
                          <span
                            title={`This row survives a Benjamini–Hochberg correction at ${Math.round(FDR_Q * 100)}% across all ${lead.pool.length.toLocaleString()} lines tested — it is not just significant on its own, it is significant given how many lines were searched to find it.`}
                            style={{
                              fontSize: 8, fontWeight: 900, letterSpacing: '.04em', marginLeft: 6,
                              padding: '1.5px 6px', borderRadius: 999,
                              border: `1px solid ${verdictInk(true).color}55`,
                              color: verdictInk(true).color,
                            }}
                          >survives the board</span>
                        )}
                      </td>
                      {/* ── TONIGHT, BESIDE THE HISTORY (2026-09-01) ── */}
                      <td style={{ ...cell, fontWeight: 900, color: r.streak > 0 ? verdictInk(true).color : r.streak < 0 ? C.text3 : C.text2 }}
                        title={r.streak > 0 ? `Cleared his last ${r.streak} priced night${r.streak === 1 ? '' : 's'}` : r.streak < 0 ? `Missed his last ${-r.streak} priced night${r.streak === -1 ? '' : 's'}` : ''}>
                        {r.streak > 0 ? `+${r.streak}` : r.streak < 0 ? `${r.streak}` : '—'}
                      </td>
                      <td style={{ ...cell, color: C.text2 }}
                        title={r.cashPrice != null ? `${r.hits} cash night${r.hits === 1 ? '' : 's'}; last one ${r.lastCash || '—'}` : 'Has not cashed this line yet'}>
                        {r.cashPrice != null ? fmtOdds(r.cashPrice) : '—'}
                      </td>
                      <td style={{ ...cell, color: r.tonight.score != null ? C.text : C.text3 }}
                        title={r.tonight.onSlate ? 'Tonight’s model score for this market' : 'Not on tonight’s slate'}>
                        {r.tonight.score != null ? Math.round(r.tonight.score) : '—'}
                      </td>
                      <td style={{ ...cell, color: r.tonight.price != null ? C.text : C.text3 }}
                        title={r.tonight.price != null
                          ? `Tonight’s price needs ${r.tonight.need}% to break even`
                          : r.tonight.bookLine != null ? `Book is at ${r.tonight.bookLine} tonight, not ${r.line}` : r.tonight.onSlate ? 'No price posted yet' : 'Not on tonight’s slate'}>
                        {r.tonight.price != null ? fmtOdds(r.tonight.price) : '—'}
                      </td>
                      <td style={{ ...cell, fontWeight: 900, color: r.tonight.edge == null ? C.text3 : verdictInk(r.tonight.edge > 0).color }}
                        title={r.tonight.edge != null ? `${r.rate.toFixed(0)}% rate vs ${r.tonight.need}% needed tonight` : ''}>
                        {r.tonight.edge != null ? `${r.tonight.edge > 0 ? '+' : ''}${r.tonight.edge.toFixed(0)}` : '—'}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={13} style={{ padding: '2px 8px 8px' }}>
                          {/* THE RECEIPTS. Without these the two prices above are
                              a claim; with them they're checkable. */}
                          <div style={{
                            display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center',
                            fontSize: 9.5, color: C.text3,
                          }}>
                            <span>last {r.log.length} nights, newest first:</span>
                            {r.log.map(([date, over, got], i) => (
                              <span key={i} title={`${date} — priced ${fmtOdds(over)}, ${got ? 'cleared' : 'missed'}`} style={{
                                padding: '1.5px 6px', borderRadius: 5, whiteSpace: 'nowrap',
                                border: `1px solid ${got ? 'rgba(74,222,128,.35)' : C.border}`,
                                background: got ? 'rgba(74,222,128,.08)' : 'transparent',
                                color: got ? verdictInk(true).color : C.text3,
                              }}>{date.slice(5)} {fmtOdds(over)}</span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
          {shown.length > 300 && (
            <div style={{ fontSize: 9.5, color: C.text3, padding: '6px 2px' }}>
              Showing the first 300 of {shown.length} — narrow it with a prop filter or the search box.
            </div>
          )}
        </div>
      )}

      <HowToRead />
    </Shell>
  )
}

const cell = { textAlign: 'center', fontSize: 11, padding: '4px 6px', whiteSpace: 'nowrap' }

// The lead band's two atoms. A numeral is always NUM_FONT so a rate and a
// denominator line up down the block instead of drifting.
const B = ({ children, col = C.text }) => (
  <b style={{ color: col, fontFamily: NUM_FONT }}>{children}</b>
)
const Line = ({ icon, children }) => (
  <div style={{ display: 'flex', gap: 9, alignItems: 'baseline', fontSize: 11.5, lineHeight: 1.65, color: C.text2 }}>
    <span style={{ flexShrink: 0 }}>{icon}</span>
    <span style={{ minWidth: 0 }}>{children}</span>
  </div>
)

// 💵 Hit rate is not the finish line. Everything else on this page is a
// percentage; this is the only band that says whether a unit came back.
//
// WRITTEN AS SENTENCES, NOT TILES (2026-08-15, second pass). Donovan: "i dont
// like the tile style id rather text just like the storylines section." He's
// right about this one in particular — a grid of six ROI tiles reads like a
// dashboard you have to decode, and every one of these numbers needs a clause
// after it anyway ("+30% and still inside its own error bar" is the finding,
// not "+30%"). Storylines' shape — an icon, then a line you can read — carries
// the caveat for free, which a tile never can.
function RealityCheck({ hist }) {
  const rows = roiRows(hist)
  if (!rows.length) return null
  const fmt = (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}%`
  return (
    <div style={{
      background: `linear-gradient(155deg, ${C.bg2}, rgba(252,211,77,.03))`,
      border: `1px solid ${C.border}`, borderRadius: 12, padding: '10px 14px', marginBottom: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 5, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11.5, fontWeight: 900 }}>💵 Reality check</span>
        <span style={{ fontSize: 9, color: C.text3 }}>
          flat one unit a bet at the price it was actually offered
        </span>
      </div>
      {rows.map((r) => {
        const v = roiVerdict(r.all)
        const best = [...r.bands].sort((a, b) => b.roi - a.roi)[0]
        return (
          <div key={r.market} title={r.bands.length
            ? r.bands.map((b) => `${b.band}: ${b.n} bets · ${b.hit_rate}% hit · ROI ${b.roi > 0 ? '+' : ''}${b.roi}% ±${b.roi_se}`).join('\n')
            : undefined}
            style={{
              display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 11,
              lineHeight: 1.55, padding: '3px 0', color: C.text2,
            }}>
            <span style={{ flexShrink: 0 }}>{v.key === 'up' ? '💰' : v.key === 'down' ? '🩸' : '➖'}</span>
            <span style={{ minWidth: 0 }}>
              <b style={{ color: C.text, display: 'inline-block', minWidth: 92, verticalAlign: 'top' }}>{r.label}</b>
              {' '}came back <b style={{ fontFamily: NUM_FONT, color: v.tone }}>{fmt(r.all.roi)}</b> over{' '}
              <b style={{ fontFamily: NUM_FONT }}>{r.all.n.toLocaleString()}</b> priced bets, hitting{' '}
              <b style={{ fontFamily: NUM_FONT }}>{r.all.hit_rate}%</b> of them
              {r.all.thin
                ? <> — <span style={{ color: C.text3 }}>too few bets to mean anything yet</span>.</>
                : v.key === 'flat'
                  ? <> — but the error bar is <b style={{ fontFamily: NUM_FONT }}>±{r.all.roi_se}</b>, so that is
                      <span style={{ color: v.tone }}> indistinguishable from break-even</span>.</>
                  : <> — <span style={{ color: v.tone }}>{v.label}</span>, and it clears its own
                      <b style={{ fontFamily: NUM_FONT }}> ±{r.all.roi_se}</b> error bar.</>}
              {best && !best.thin && best.roi > r.all.roi + 5 && (
                <> Best in the <b style={{ color: C.text }}>{best.band}</b> band, at{' '}
                  <b style={{ fontFamily: NUM_FONT }}>{fmt(best.roi)}</b>.</>
              )}
            </span>
          </div>
        )
      })}
      {/* THE SAME SIX NUMBERS, ON ONE SCALE (2026-08-30). The sentences stay —
          they carry the clause a chart cannot. What the chart carries and the
          sentences cannot is that Hits is measured to ±5.8 and home runs to
          ±21.4: the two markets are not even resolved to the same precision,
          which is the most useful fact on this panel and read as a footnote. */}
      <RoiErrorBars
        rows={rows.map((r) => ({
          label: r.label,
          value: Number(r.all.roi),
          se: Number(r.all.roi_se),
          n: Number(r.all.n),
        })).filter((r) => Number.isFinite(r.value) && Number.isFinite(r.se))}
        footer="Each bar is two standard errors around the measured return. A bar that touches the zero line is a market that has not said anything yet — which, on this much history, is most of them."
      />

      <div style={{ fontSize: 8.5, color: C.text3, marginTop: 6, lineHeight: 1.5 }}>
        ROI&apos;s error bar comes from the RETURNS, not the win rate — one +900 winner moves a small
        book more than twenty −150 winners — so a book can post +30% and still be break-even. Hover a
        line for the same split by price band, which is where a model that is right about WHO and
        wrong about AT WHAT NUMBER gives itself away.
      </div>
    </div>
  )
}

function Shell({ days, settled, stamp, children }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, flexWrap: 'wrap', marginBottom: 4 }}>
        <span style={{ fontSize: 14, fontWeight: 900 }}>🏷 True Price</span>
        {days && (
          <span style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT }}>
            {days.length} graded night{days.length === 1 ? '' : 's'} · {settled?.toLocaleString?.() || settled} settled props
            {days.length ? ` · ${days[0]} → ${days[days.length - 1]}` : ''}
            {stamp ? ` · built ${stamp}` : ''}
          </span>
        )}
      </div>
      {children}
    </div>
  )
}

// ℹ️ THE MANUAL, MOVED TO THE BOTTOM (2026-08-16). This paragraph used to be
// the first thing on the page, above the money panel, above the filters and
// above the table — so the answer was always the fourth thing you reached.
// Every word of it is still here; it just stopped being the lead. `open` is
// set when there is nothing else to read, which is the one time an explanation
// IS the page.
function HowToRead({ open = false }) {
  return (
    <details open={open} style={{
      background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 12, marginTop: 12,
    }}>
      <summary style={{ padding: '9px 14px', fontSize: 10.5, fontWeight: 800, cursor: 'pointer', color: C.text2 }}>
        ℹ️ How to read this page — what True and Goes at are, and when a gap counts
      </summary>
      <div style={{ fontSize: 11, color: C.text2, lineHeight: 1.65, maxWidth: 780, padding: '0 14px 12px' }}>
        Every price the bot fetched before first pitch, settled against that night&apos;s box score.
        <b style={{ color: C.text }}> True</b> is what his own rate says the bet is worth;
        <b style={{ color: C.text }}> Goes at</b> is what the book has actually been paying him. The
        gap between the two is the point — but a gap is not an edge until it clears its own error
        bar, so rows that haven&apos;t are labelled and sorted below the ones that have.
        <div style={{ marginTop: 8, color: C.text3, fontSize: 10.5 }}>
          <b style={{ color: C.text2 }}>Min nights</b> counts graded nights at that exact line, not
          nights he played. A void — priced, and he never batted — is neither a hit nor a miss and
          never reaches the denominator. The rung the page opens on is chosen from what the archive
          holds: <b>{PREFERRED_MIN}+</b> when rows exist there, otherwise the highest rung below it
          that has any, so the page never opens empty while it has something to show. Every rung is
          still one click away and the count beside each one is how many lines clear it.
        </div>
        <div style={{ marginTop: 8, color: C.text3, fontSize: 10.5 }}>
          <b style={{ color: C.text2 }}>Why thin samples stay quiet.</b> The error bar is computed at
          the PRICE&apos;S rate, not his, and two of them is the bar. A ten-point gap against a
          coin-flip price needs about a hundred graded nights to clear it — 4·p·(1−p)/gap² in
          nights — which is why a big gap on eleven nights is labelled, not celebrated.
        </div>
      </div>
    </details>
  )
}
