'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT, MARKETS, gradeFor, TYPE } from '../../../lib/nfl/theme'
import NflTable from '../NflTable'
import { useResultsArchive, seasonTotals, grandTotal, gradeBands, labelOf, weekKey } from '../../../lib/nfl/resultsArchive'
import { downloadNflPickCard } from '../shareCard'
import ChartFrame from '../ChartFrame'
import PageHeader from '../../PageHeader'
import { WhatThis } from '../../ui'
import NflSignalAudit from '../NflSignalAudit'

// DID THE PICKS DO THEIR OWN JOB? — the NFL sibling of MLB's PickScorecard +
// ScoreAudit (components/PickScorecard.js, components/ScoreAudit.js).
//
// ONE FILE, NOT TWO, unlike the MLB side. PickScorecard exists to grade five
// DIFFERENT pick roles (HR/TOP/HIT/CONTACT/HRR) against five different
// outcomes on a shared nightly slate; ScoreAudit exists to band whichever
// UNPUBLISHED composite scores (K Risk, Overall pitcher) the site has grown,
// checked against whatever graded field eventually shows up for them. NFL has
// neither problem yet — there are exactly seven markets, each with exactly
// one already-published score and one already-published OUTCOME expression
// (bots/nfl/nfl_scoring.py), so there is nothing here that needs a second
// file's worth of machinery. Split this out the day a second axis shows up
// (a pick_type per market, an unpublished composite worth auditing) — until
// then two files would just be one file's worth of ideas with a seam in it.
//
// TWO QUESTIONS, TWO SECTIONS:
//
//   1. THE CARD'S RECORD. nfl_picks.json publishes five rungs a market, seven
//      markets, thirty-five total. nfl_results.py grades every one of them
//      against nfl_scoring.py's own OUTCOME for that market — rushing_tds +
//      receiving_tds for TD, receiving_yards for REC_YDS, and so on — never
//      one outcome for every market, the same discipline PickScorecard's JOBS
//      dict enforces per pick role on the MLB side.
//
//   2. IS THE SCORE ITSELF SEPARATING OUTCOMES, LIVE. Report Card (the tab
//      next to this one) already answers "does this model work" against
//      completed PRIOR seasons under a real backtest, with deciles. This
//      section asks the same SHAPE of question using 2026's actual results
//      only — banding this run's full eligible pool (not just the five-deep
//      card) by score quartile and checking whether the top quartile clears
//      the bar more than the bottom, the live and much smaller-sample cousin
//      of Report Card's calibrated chart, not a replacement for it.
//
// WHAT THIS IS NOT: lib/nfl/myPicks.js's ledger, rendered on the Picks tab
// ("Your record vs the bot"), is YOUR overrides against the bot, kept on your
// device. Nothing here reads that store. This page is the bot's own record on
// its own card, the same for every visitor, and it exists whether or not
// anyone has ever swapped a single rung.
//
// A REAL DATA WRINKLE, FOUND WHILE BUILDING THIS (2026-08-24): nfl_results.py
// writes `{k: v for k, v in vals.items() if v}` — a market with an actual
// value of exactly 0 is DROPPED from a player's line, not stored as 0. Every
// other market has real misses below its bar (verified against the committed
// 2026-08-24 preseason snapshot: REC_YDS 412 of 563 present lines miss its
// 40-yard bar, RUSH_ATT 241 of 313 miss its 12-carry bar). TD's bar is 1 and
// TD is a whole-number count, so a value of exactly 0 is the ONLY way to miss
// it — and that value never survives to the payload. Same snapshot: 151 TD
// lines published, minimum value 1.0, zero of them below bar. A player who
// took the field and scored zero touchdowns is indistinguishable, in this
// file, from a player who never played at all. That is a real limit of the
// published data, not a bug in this component, and both sections below say so
// next to the TD row rather than quietly reporting a number that can't miss.
//
// WHAT THIS DOESN'T DO YET: nfl_results.json is OVERWRITTEN every grading
// pass (its own module docstring says so), so both sections describe the
// LAST run only, never a season-to-date total. nfl_outcome_log_{date}.jsonl
// accumulates one line per grading pass and could rebuild that history — but
// dataSource.js's fetchNfl() walks a short FIXED list of candidate URLs, and
// the log's filename carries today's UTC date, which a static candidate list
// can't guess. Reading the real history needs either a directory listing
// (a GitHub-contents-API call this file doesn't add) or, better, a small
// rolled-up summary the bot publishes under a fixed name — the NFL sibling of
// backtest_summary.json. Both are bot-repo or data-source changes; out of
// scope for a presentation-only pass. Logged here rather than faked with a
// client-side history this page doesn't actually have.

const MARKET_LABEL = Object.fromEntries(MARKETS.map(([k, label]) => [k, label]))

// One market, one accent — seven markets, seven accents in the NFL palette,
// no leftovers and nothing reused.
// Called, not frozen: C is mutated after mount (applyTheme, lib/theme.js), so a
// module-level literal keeps the palette it was imported with. See #23.
const MARKET_COLOR = () => ({
  TD: C.green,
  REC_YDS: C.cyan,
  REC: C.lime,
  RUSH_YDS: C.blue,
  RUSH_ATT: C.purple,
  PASS_YDS: C.orange,
  KICK_PTS: C.yellow,
})

// What each market's OUTCOME expression actually is, in nfl_scoring.py's own
// terms — the plain-English column names it sums, not a re-description of
// the bar. Keep this in lockstep with OUTCOME there; it's prose, not code,
// so nothing enforces that by itself.
const MARKET_OUTCOME_TEXT = {
  TD: 'rushing_tds + receiving_tds',
  REC_YDS: 'receiving_yards',
  REC: 'receptions',
  RUSH_YDS: 'rushing_yards',
  RUSH_ATT: 'carries',
  PASS_YDS: 'passing_yards',
  KICK_PTS: 'fg_made×3 + pat_made',
}

// SAMPLE-SIZE FLOOR for the live banding in section 2 — 20, not MLB's 40.
//
// ScoreAudit's 40 comes from MLB's archive: thousands of graded picks a
// season, so 40 costs nothing to ask for. NFL's smallest eligible pools are
// position-capped at the league level no matter how the season goes — roughly
// 32 starting kickers, a similar count of starting quarterbacks — so a bar as
// high as 40 would leave KICK_PTS and PASS_YDS structurally unable to ever
// clear it most weeks, which just hides two of the seven markets forever
// instead of grading them thin. 20 is the lowest floor that still leaves
// roughly five players in every quartile band, so a band boundary means
// something. Verified against the 2026-08-24 preseason snapshot: every one of
// the seven markets already joins above 20 (KICK_PTS the thinnest at 33), so
// this floor is real, not theoretical, for the data that exists right now.
const BAND_MIN = 20

const pctTxt = (v) => (v == null ? '—' : `${v.toFixed(1)}%`)

function Badge({ tone, children }) {
  const map = {
    green: C.green, red: C.red, yellow: C.yellow, dim: C.text3,
  }
  const col = map[tone] || C.text3
  return (
    <span style={{
      fontSize: TYPE.label, fontWeight: 900, padding: '1.5px 6px', borderRadius: 4,
      fontFamily: NUM_FONT, letterSpacing: '.04em',
      background: `${col}22`, color: col,
    }}>{children}</span>
  )
}

function ReceiptHero({ results, when }) {
  const totals = results.totals || {}
  const markets = MARKETS.map(([key, label]) => ({
    key, label, color: MARKET_COLOR()[key], ...(totals[key] || {}),
  })).filter((m) => Number.isFinite(m.n))
  const graded = markets.reduce((sum, m) => sum + (m.n || 0), 0)
  const hits = markets.reduce((sum, m) => sum + (m.hit || 0), 0)
  const voids = markets.reduce((sum, m) => sum + (m.void || 0), 0)
  const hitRate = graded ? (100 * hits) / graded : null
  const leader = [...markets]
    .filter((m) => m.n > 0 && Number.isFinite(m.pct))
    .sort((a, b) => b.pct - a.pct || b.n - a.n)[0]

  return (
    <section className="receiptHero">
      {/* The shared page header (2026-09-18), not a bespoke glowing hero: the
          eyebrow, the headline and the LAST GRADED stamp are all slots it
          already has. The KPI block below is this page's own and stays. */}
      <PageHeader
        eyebrow="TUDDY · THE RECEIPT ROOM"
        title="Every call. Every bar. No hiding."
        note="The latest published card, graded market by market against the job it was asked to do."
        theme={C}
        numFont={NUM_FONT}
        accent={C.green}
        stats={[
          { value: when, label: 'LAST GRADED', tone: C.text2 },
          results.exhibition ? { value: 'PRESEASON', label: 'CAVEAT', tone: C.yellow } : null,
        ]}
      />

      <div className="receiptKpis">
        <div className="receiptRate">
          <span>OVERALL CLEAR RATE</span>
          <strong>{hitRate == null ? '—' : `${hitRate.toFixed(1)}%`}</strong>
          <div className="receiptMeter"><i style={{ width: `${Math.max(0, Math.min(100, hitRate || 0))}%` }} /></div>
          <small>{hits} of {graded} graded rungs cleared</small>
        </div>
        <div><span>GRADED</span><strong>{graded}</strong><small>latest published run</small></div>
        {/* 2026-09-26 (Batch 5): these are rows with no stat line yet -- a man
            who didn't play, or a game not graded yet. A whole unplayed week
            read "VOIDS 35", i.e. "cancelled". Named for what they are. */}
        <div><span>NO RESULT</span><strong>{voids}</strong><small>not played or not graded yet — not counted as misses</small></div>
        <div><span>STRONGEST MARKET</span><strong className="leader" style={{ color: leader?.color }}>{leader?.label || '—'}</strong><small>{leader ? `${leader.hit}/${leader.n} · ${leader.pct.toFixed(1)}%` : 'waiting on results'}</small></div>
      </div>

      <div className="receiptMarkets" aria-label="Latest clear rate by market">
        {markets.map((m) => (
          <div key={m.key} title={`${m.hit || 0} of ${m.n || 0} cleared`}>
            <span style={{ color: m.color }}>{m.label}</span>
            <b>{m.n ? `${Number(m.pct || 0).toFixed(0)}%` : '—'}</b>
            <i><em style={{ width: `${Math.max(0, Math.min(100, m.pct || 0))}%`, background: m.color }} /></i>
          </div>
        ))}
      </div>
    </section>
  )
}

// ── section 1: the card's record ────────────────────────────────────────────

function CardGrid({ results }) {
  const totals = results.totals || {}
  const bars = results.bars || {}

  const boxes = MARKETS.map(([key, label]) => {
    const t = totals[key]
    return { key, label, color: MARKET_COLOR()[key], bar: bars[key], t }
  }).filter((b) => b.t)

  const sumN = boxes.reduce((a, b) => a + (b.t.n || 0), 0)
  const sumHit = boxes.reduce((a, b) => a + (b.t.hit || 0), 0)
  const sumVoid = boxes.reduce((a, b) => a + (b.t.void || 0), 0)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: TYPE.title, fontWeight: 800 }}>Did the card do its job?</span>
        <span style={{ fontSize: TYPE.micro, color: C.text3, fontFamily: NUM_FONT }}>
          {sumHit} of {sumN} card rungs cleared their own bar this run
          {sumVoid > 0 && ` · ${sumVoid} with no result yet`}
        </span>
      </div>

      <div style={{ fontSize: TYPE.body, color: C.text3, marginBottom: 8, lineHeight: 1.6 }}>
        Five rungs a market, thirty-five total on a full card — never more, no matter how the
        run graded. That&apos;s why every number below is shown as a fraction first: <b
        style={{ color: C.text2 }}>a percentage off five picks is a coin flip wearing a
        costume.</b> Void rungs (no line at all — cut, inactive, never dressed) are dropped from
        both sides of the fraction, same rule the Picks tab&apos;s own ledger uses.
      </div>

      <div style={{
        display: 'grid', gap: 8, marginBottom: 4,
        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
      }}>
        {boxes.map((b) => {
          const { n, hit, pct, void: voidN } = b.t
          return (
            <div key={b.key} title={`Graded against ${MARKET_OUTCOME_TEXT[b.key]}, bar ${b.bar}.`}
              style={{
                background: `linear-gradient(155deg, ${b.color}1c, ${b.color}06)`,
                border: `1px solid ${b.color}44`, borderRadius: 11, padding: '8px 12px',
              }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: TYPE.label, fontWeight: 900, color: b.color, fontFamily: NUM_FONT }}>{b.label}</span>
                <span style={{ fontSize: TYPE.micro, color: C.text3 }}>bar {b.bar}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 2 }}>
                <span style={{ fontFamily: NUM_FONT, fontSize: TYPE.display, fontWeight: 900, color: b.color }}>
                  {n ? `${hit}/${n}` : '—'}
                </span>
                {n > 0 && <span style={{ fontSize: TYPE.micro, color: C.text3, fontFamily: NUM_FONT }}>{pctTxt(pct)}</span>}
              </div>
              {voidN > 0 && (
                <div style={{ fontSize: TYPE.micro, fontFamily: NUM_FONT, color: C.text3, marginTop: 1 }}>
                  {voidN} no result
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function cardRows(results) {
  const bars = results.bars || {}
  const rows = []
  MARKETS.forEach(([key, label]) => {
    const rungs = results.card?.[key]?.rungs || []
    rungs.forEach((r) => {
      const isVoid = r.actual == null
      rows.push({
        _key: `${key}-${r.rank}`,
        _raw: r,
        market: key,
        marketLabel: label,
        rank: r.rank,
        player_id: r.player_id,
        name: r.name || '—',
        team: r.team || '',
        opp: r.opp ? `vs ${r.opp}` : '',
        position: r.position || '',
        bar: bars[key],
        actual: r.actual,
        void: isVoid,
        hit: isVoid ? null : !!r.hit,
        did: r.hit ? 1 : 0,
        result: isVoid ? 'void' : (r.hit ? 'hit' : 'miss'),
        grade: r.grade || '—',
      })
    })
  })
  return rows
}

// 📸 SHARE (2026-08-24) — the graded half of the NFL share-card pair. Every
// field below already lives on the DenseTable row built by cardRows() above;
// this only reshapes it to components/nfl/shareCard.js's `pick` shape. `opp`
// here arrives pre-prefixed ("vs DAL") for the table's own column, so it's
// stripped back to a bare team code — the card prepends its own "vs ". A
// published '—' grade (no grade recorded) is dropped rather than printed
// literally. No pregame `score` is carried in this row at all — the card
// still reads correctly without one, it just leads with the result instead
// of a score bar (see downloadNflPickCard's PREGAME vs GRADED branch).
function pickFromResultRow(r) {
  return {
    name: r.name,
    team: r.team,
    opp: String(r.opp || '').replace(/^vs\s+/i, ''),
    position: r.position,
    market: r.market,
    marketLabel: r.marketLabel,
    rank: r.rank,
    bar: r.bar,
    actual: r.actual,
    hit: r.hit,
    void: r.void,
    grade: r.grade && r.grade !== '—' ? r.grade : undefined,
  }
}

// ── section 2: is the score separating outcomes, live ──────────────────────

function bandMarket(key, bar, players, lines) {
  const rows = players
    .filter((p) => Number.isFinite(p.scores?.[key]))
    .map((p) => {
      const line = lines[String(p.player_id)]
      const val = line ? line[key] : undefined
      if (val === undefined || val === null) return null // no line = void, not a miss
      return { score: p.scores[key], hit: val >= bar }
    })
    .filter(Boolean)

  if (!rows.length) return { state: 'missing', n: 0 }

  // Every joined line cleared the bar — for TD this is the void/zero artifact
  // documented at the top of this file, not a perfect model. Flagged rather
  // than shown as a false "SEPARATES".
  if (rows.every((r) => r.hit)) return { state: 'degenerate', n: rows.length }
  if (rows.length < BAND_MIN) return { state: 'thin', n: rows.length }

  const sorted = [...rows].sort((a, b) => a.score - b.score)
  const cut = Math.floor(sorted.length / 4)
  const labels = ['Bottom 25%', '25–50%', '50–75%', 'Top 25%']
  const bands = []
  for (let b = 0; b < 4; b++) {
    const seg = sorted.slice(b * cut, b === 3 ? sorted.length : (b + 1) * cut)
    if (!seg.length) continue
    const ok = seg.filter((x) => x.hit).length
    bands.push({ label: labels[b], n: seg.length, ok, pct: (100 * ok) / seg.length })
  }
  const lo = bands[0].pct, hi = bands[bands.length - 1].pct
  return { state: 'measured', bands, n: rows.length, spread: hi - lo, works: hi - lo > 0 }
}

function ScoreBands({ data, results }) {
  // players/bars/lines are derived with `|| []`/`|| {}` fallbacks, which mint
  // a fresh reference on every render whenever the source is absent — so they
  // live INSIDE the memo callback rather than as its dependencies; the memo
  // keys on `data` and `results` themselves, the values that actually change.
  const rows = useMemo(() => {
    const players = data?.players || []
    const bars = results.bars || {}
    const lines = results.lines || {}
    return MARKETS.map(([key, label]) => ({
      key, label, color: MARKET_COLOR()[key], bar: bars[key],
      ...bandMarket(key, bars[key], players, lines),
    }))
  }, [data, results])

  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ fontSize: TYPE.title, fontWeight: 800, marginBottom: 2 }}>
        Is the score separating outcomes, live?
      </div>
      <div style={{ fontSize: TYPE.body, color: C.text3, marginBottom: 8, lineHeight: 1.6 }}>
        Not the five-deep card — every player this run who had both a score and a graded line for
        that market, split into quartiles by score. If the top quarter of the pool doesn&apos;t
        clear the bar noticeably more than the bottom quarter, the ranking isn&apos;t doing
        anything a coin flip wouldn&apos;t. This is 2026&apos;s actual results only, one run&apos;s
        pool at a time — for the same question asked properly, against completed prior seasons
        under a real backtest, see Report Card.
      </div>

      {rows.map((r) => (
        <ChartFrame key={r.key} pad="9px 12px"
          style={{ borderRadius: 11, marginBottom: 7 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: TYPE.name, fontWeight: 800, color: r.color }}>{r.label}</span>
            <span style={{ fontSize: TYPE.micro, color: C.text3, fontFamily: NUM_FONT }}>bar {r.bar}</span>
            {r.state === 'missing' && <Badge tone="dim">NO JOINED LINES</Badge>}
            {r.state === 'thin' && <Badge tone="dim">TOO THIN · n={r.n}, need {BAND_MIN}</Badge>}
            {r.state === 'degenerate' && <Badge tone="yellow">NOT READABLE · every line cleared</Badge>}
            {r.state === 'measured' && (
              <Badge tone={r.works ? 'green' : 'red'}>
                {r.works ? 'SEPARATES' : 'NO SIGNAL'} · {r.spread >= 0 ? '+' : ''}{r.spread.toFixed(1)}pts top vs bottom · n={r.n}
              </Badge>
            )}
          </div>

          {r.state === 'missing' && (
            <div style={{ fontSize: TYPE.micro, color: C.text3, marginTop: 3, lineHeight: 1.55 }}>
              No player this run has both a {MARKET_LABEL[r.key]} score and a graded line —
              either nothing has finished yet, or this market has no eligible players on the
              slate.
            </div>
          )}
          {r.state === 'degenerate' && (
            <div style={{ fontSize: TYPE.micro, color: C.text3, marginTop: 3, lineHeight: 1.55 }}>
              Every one of the {r.n} joined lines cleared bar {r.bar}. {r.key === 'TD'
                ? <>Expected for TD specifically: a value of exactly 0 never reaches this payload
                    (see the note at the top of this file), so a miss can&apos;t be observed here
                    at all — this row can never be audited this way, not just this week.</>
                : <>On a small pool that can happen by chance rather than by design — read it as
                    a fluke until it repeats.</>}
            </div>
          )}
          {r.state === 'measured' && (
            <div style={{ display: 'flex', gap: 6, marginTop: 7, flexWrap: 'wrap' }}>
              {r.bands.map((b) => (
                <div key={b.label} style={{
                  flex: '1 1 90px', background: C.bg, border: `1px solid ${C.border}`,
                  borderRadius: 8, padding: '5px 8px',
                }}>
                  <div style={{ fontSize: TYPE.micro, color: C.text3 }}>{b.label}</div>
                  <div style={{ fontFamily: NUM_FONT, fontSize: TYPE.title, fontWeight: 900, color: r.color }}>
                    {b.pct.toFixed(1)}%
                  </div>
                  <div style={{ fontSize: TYPE.micro, color: C.text3, fontFamily: NUM_FONT }}>
                    {b.ok}/{b.n} cleared
                  </div>
                </div>
              ))}
            </div>
          )}
        </ChartFrame>
      ))}
    </div>
  )
}

// ── the tab ──────────────────────────────────────────────────────────────────

// ── SEASON TO DATE (2026-09-05) ─────────────────────────────────────────────
//
// The "doesn't do yet" above is done: the bot now writes one file per graded
// week and lib/nfl/resultsArchive.js harvests them. This strip is the season
// in one row per market, and the picker under it swaps which week the rest
// of the page grades. Everything below it is unchanged -- it always read one
// payload, and now it reads whichever one you picked.
// The letter's own colour, by feeding gradeFor a score inside that band.
const BAND_SCORE = { 'A+': 80, A: 72, 'A-': 64, 'B+': 56, B: 48, 'C+': 30 }
const bandColor = (label) => gradeFor(BAND_SCORE[label] ?? 30).color

function SeasonStrip({ archive, keys, loading, picked, onPick, currentKey, mode = 'season' }) {
  // In week mode this section is nothing but the picker, so with one graded
  // week there is nothing to draw — an empty bordered box is #24's exact
  // complaint.
  if (mode === 'week' && keys.length < 2) return null
  const totals = seasonTotals(keys.map((k) => archive[k]))
  const grand = grandTotal(totals)
  const markets = MARKETS.map(([k, label]) => [k, label, totals[k]]).filter(([, , t]) => t && t.n > 0)
  const col = MARKET_COLOR()
  const bands = gradeBands(keys.map((k) => archive[k]), gradeFor)
  return (
    <section className="acc-season">
      {mode === 'season' && (
      <div className="acc-season-head">
        <div><small>SEASON TO DATE</small><h2>{grand.n ? `${grand.hit}/${grand.n} · ${grand.pct}%` : loading ? 'Harvesting weeks…' : 'One week graded so far'}</h2>
          <p>{keys.length} graded week{keys.length === 1 ? '' : 's'} on the branch. The bot&apos;s own card, every rung, every week, bars unchanged. Refreshes on load; older weeks are remembered on this device.</p></div>
      </div>
      )}
      {mode === 'season' && markets.length > 0 && (
        <div className="acc-season-row">
          {markets.map(([k, label, t]) => (
            <div key={k} style={{ borderTopColor: col[k] }}>
              <small>{label}</small>
              <b style={{ color: t.pct >= 55 ? C.green : t.pct < 45 ? C.red : C.text }}>{t.pct == null ? '—' : `${t.pct}%`}</b>
              <span>{t.hit}/{t.n}{t.void ? ` · ${t.void} void` : ''}</span>
            </div>
          ))}
        </div>
      )}
      {mode === 'season' && bands.length > 0 && grand.n >= 10 && (
        <div className="acc-season-bands" title="Every graded rung this season, bucketed by the letter the site printed on it. The Report tab's deciles are the backtest's version of this; this is the live one.">
          <small>WHAT A GRADE HAS BEEN WORTH · THIS SEASON</small>
          <div>{bands.map((b) => { const col = bandColor(b.label); return <span key={b.label} style={{ borderColor: col + '66' }}><b style={{ color: col }}>{b.label}</b><strong>{b.pct}%</strong><em>{b.hit}/{b.n}</em></span> })}</div>
        </div>
      )}
      {mode === 'week' && keys.length > 1 && (
        <div className="acc-season-picker" role="tablist" aria-label="Graded week">
          {keys.map((k) => {
            const t = grandTotal(archive[k]?.totals)
            return <button key={k} role="tab" aria-selected={picked === k} className={picked === k ? 'on' : ''} onClick={() => onPick(k)}>
              <b>{labelOf(k)}{k === currentKey ? ' · latest' : ''}</b><span>{t.n ? `${t.hit}/${t.n}` : 'not graded'}</span>
            </button>
          })}
        </div>
      )}
      <style>{`
      .acc-season{margin-bottom:14px;padding:16px 18px;border:1px solid ${C.border};border-radius:14px;background:linear-gradient(160deg,rgba(0,245,173,.07),${C.bg2} 55%)}
      .acc-season-head small{color:${C.green};font:900 8px/1 ${NUM_FONT};letter-spacing:.12em}
      .acc-season-head h2{margin:6px 0 4px;font:900 clamp(22px,4vw,34px)/1 ${NUM_FONT};letter-spacing:-.03em}
      .acc-season-head p{margin:0;color:${C.text3};font-size:10px;line-height:1.5;max-width:620px}
      .acc-season-row{display:grid;grid-template-columns:repeat(auto-fill,minmax(118px,1fr));gap:7px;margin-top:12px}
      .acc-season-row>div{padding:8px 10px;border:1px solid ${C.border};border-top:3px solid;border-radius:9px;background:${C.bg}}
      .acc-season-row small{display:block;color:${C.text3};font:800 7.5px/1 ${NUM_FONT};letter-spacing:.06em;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .acc-season-row b{display:block;margin-top:5px;font:900 19px/1 ${NUM_FONT}}
      .acc-season-row span{display:block;margin-top:3px;color:${C.text3};font:700 8.5px/1 ${NUM_FONT}}
      .acc-season-bands{margin-top:12px}.acc-season-bands>small{display:block;color:${C.text3};font:900 7.5px/1 ${NUM_FONT};letter-spacing:.1em;margin-bottom:6px}.acc-season-bands>div{display:flex;gap:5px;overflow-x:auto;padding-bottom:2px}.acc-season-bands span{flex:0 0 auto;display:flex;align-items:baseline;gap:5px;padding:6px 9px;border:1px solid;border-radius:8px;background:${C.bg};font-family:${NUM_FONT}}.acc-season-bands b{font-size:10px}.acc-season-bands strong{font-size:13px;font-weight:900}.acc-season-bands em{font-style:normal;font-size:8px;color:${C.text3}}
      .acc-season-picker{display:flex;gap:5px;overflow-x:auto;margin-top:12px;padding-bottom:2px}
      .acc-season-picker button{flex:0 0 auto;display:flex;flex-direction:column;align-items:flex-start;gap:3px;padding:7px 10px;border:1px solid ${C.border};border-radius:8px;background:${C.bg};color:${C.text3};cursor:pointer;font-family:${NUM_FONT}}
      .acc-season-picker button b{font-size:9px;color:${C.text2}}.acc-season-picker button span{font-size:8px}
      .acc-season-picker button.on{border-color:${C.green};background:rgba(0,245,173,.08)}.acc-season-picker button.on b{color:${C.green}}
      @media(max-width:560px){.acc-season-row{grid-template-columns:repeat(2,1fr)}}
      `}</style>
    </section>
  )
}

// ── THE TWO QUESTIONS (2026-09-18) ─────────────────────────────────────────
// MOONSHOT's Results tab has asked two questions behind one header since it
// was built (components/tabs/Results.js, MODES): "how did the picks graded"
// and "is the model any good". This page had only the first, with the season
// numbers wedged above it as a strip. Same bar, same words, same shape —
// the sub-views under it differ only where the sport does.
const MODES = [
  ['week', '🏈 This week', 'how the card graded'],
  ['season', '📈 All season', 'is the model any good'],
]

function ModeBar({ mode, setMode }) {
  return (
    <div style={{ display: 'flex', gap: 6, marginBottom: 11, flexWrap: 'wrap' }}>
      {MODES.map(([k, label, question]) => {
        const on = mode === k
        return (
          <button
            key={k} onClick={() => setMode(k)}
            style={{
              flex: '1 1 170px', minWidth: 0, textAlign: 'left', cursor: 'pointer',
              padding: '7px 13px', borderRadius: 11,
              border: `1px solid ${on ? C.green : C.border}`,
              background: on ? 'rgba(0,245,173,.13)' : 'rgba(255,255,255,.03)',
            }}
          >
            <div style={{ fontSize: TYPE.name, fontWeight: 900, color: on ? C.green : C.text2 }}>{label}</div>
            <div style={{ fontSize: TYPE.micro, color: C.text3, marginTop: 1 }}>{question}</div>
          </button>
        )
      })}
    </div>
  )
}

function TabBtn({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      padding: '5px 12px', fontSize: TYPE.body, fontWeight: 700, borderRadius: 999,
      border: `1px solid ${active ? C.green : C.border}`,
      background: active ? `${C.green}22` : 'rgba(255,255,255,.035)',
      color: active ? C.green : C.text2, cursor: 'pointer', whiteSpace: 'nowrap',
    }}>{children}</button>
  )
}

// 👤 TRACK RECORD — which players the card has actually been right about,
// across every graded week in the archive. MOONSHOT's Results has the same
// view over graded_results_<date>.json; this reads the same rungs the tables
// below read, just grouped by player instead of by week. Nothing new is
// fetched and nothing is modelled — a row is a count of published rungs.
function trackRecordRows(archive, keys) {
  const by = {}
  for (const k of keys) {
    for (const [mk, blk] of Object.entries(archive[k]?.card || {})) {
      for (const r of blk?.rungs || []) {
        if (r.hit !== true && r.hit !== false) continue
        const id = String(r.player_id || r.name || '')
        if (!id) continue
        const cur = by[id] || {
          _key: id, player_id: r.player_id, name: r.name || '—',
          team: r.team || '', position: r.position || '',
          n: 0, hit: 0, markets: new Set(), weeks: new Set(),
        }
        cur.n += 1
        cur.hit += r.hit ? 1 : 0
        cur.markets.add(mk)
        cur.weeks.add(k)
        if (r.team) cur.team = r.team
        if (r.position) cur.position = r.position
        by[id] = cur
      }
    }
  }
  return Object.values(by).map((r) => ({
    ...r,
    markets: r.markets.size,
    weeks: r.weeks.size,
    pct: r.n ? Math.round((1000 * r.hit) / r.n) / 10 : null,
  }))
}

// 📅 WEEK BY WEEK — one row per graded week, the archive's own index.
function weekRows(archive, keys, currentKey) {
  return keys.map((k) => {
    const p = archive[k]
    const t = grandTotal(p?.totals)
    return {
      _key: k, key: k,
      week: labelOf(k) + (k === currentKey ? ' · latest' : ''),
      n: t.n, hit: t.hit, pct: t.pct,
      markets: Object.values(p?.totals || {}).filter((x) => (x.n || 0) > 0).length,
      graded: p?.graded_at_human || '—',
    }
  })
}

export default function Accountability({ data, results: latest, onPlayerClick }) {
  const { archive, keys, loading } = useResultsArchive(latest, data?.season)
  const currentKey = latest?.week ? weekKey(latest.season, latest.mode, latest.week) : null
  const [picked, setPicked] = useState(null)
  // Two questions, one header — the MOONSHOT shape (components/tabs/Results.js).
  const [mode, setMode] = useState('week')
  const [subTab, setSubTab] = useState('overview')
  const pickMode = (m) => { setMode(m); setSubTab(m === 'week' ? 'overview' : 'card') }
  // The page grades the picked week, or the latest grade when nothing is picked.
  const results = (picked && archive[picked]) || latest
  const byPid = useMemo(
    () => Object.fromEntries((data?.players || []).map((p) => [String(p.player_id), p])),
    [data],
  )
  const openRow = (r) => {
    const p = byPid[String(r.player_id)]
    if (p) onPlayerClick?.(p, r.market)
  }

  if (!results) {
    return (
      <div style={{
        border: `1px dashed ${C.border2}`, borderRadius: 12, padding: 28,
        textAlign: 'center', color: C.text3, fontSize: TYPE.body,
      }}>Nothing has been graded yet.</div>
    )
  }

  const rows = cardRows(results)
  const when = results.mode === 'week'
    ? `season ${results.season}, week ${results.week ?? '—'}`
    : `${results.season} preseason`

  const trackRows = mode === 'season' && subTab === 'record' ? trackRecordRows(archive, keys) : []
  const weeksRows = mode === 'season' && subTab === 'weeks' ? weekRows(archive, keys, currentKey) : []

  return (
    <div>
      <ModeBar mode={mode} setMode={pickMode} />

      {/* ONE ROW OF VIEWS, scoped to the question above it — the same row the
          MLB Results tab prints, with the sub-views this sport actually has
          data for. Deliberately NOT ported: Pitchers (no such thing here),
          Pairs & Pools and P/L (the bot publishes no NFL odds, so a money
          column would be invented — project rule #16). Signals arrived
          2026-09-23 once the bot started freezing its flags
          (nfl_signal_audit.json, graded bot-side — see NflSignalAudit.js). */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {(mode === 'week'
          ? [['overview', '📊 Overview'], ['bands', '🔬 Score bands']]
          : [['card', '🧾 Report card'], ['record', '👤 Track record'], ['weeks', '📅 Week by week'], ['signals', '🔬 Signals']]
        ).map(([k, label]) => (
          <TabBtn key={k} active={subTab === k} onClick={() => setSubTab(k)}>{label}</TabBtn>
        ))}
      </div>

      <WhatThis maxWidth={760}>
        {{
          overview: 'how the week graded — did each rung clear the bar it was picked against, and which ones got away.',
          bands: 'is the score itself separating outcomes — this season\u2019s eligible pool, banded by score quartile.',
          card: 'is the model any good, all season — every graded week rolled up per market, plus what each letter grade has actually been worth.',
          record: 'which players the card has been right about across every graded week in the archive.',
          weeks: 'the archive\u2019s own index — one row per graded week, newest last.',
          signals: 'do the flags TUDDY shows actually mean anything — each one graded against real touchdowns, frozen before kickoff.',
        }[subTab]}
      </WhatThis>

      <SeasonStrip archive={archive} keys={keys} loading={loading} picked={picked || currentKey} onPick={(k) => setPicked(k === currentKey ? null : k)} currentKey={currentKey} mode={mode} />

      {mode === 'week' && <ReceiptHero results={results} when={when} />}

      {mode === 'week' && (
      <div style={{
        background: C.bg2, border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.green}`,
        borderRadius: 10, padding: '10px 14px', marginBottom: 14,
        fontSize: TYPE.body, color: C.text3, lineHeight: 1.6,
      }}>
        {picked && picked !== currentKey ? 'Showing' : 'Last graded'}: <b style={{ color: C.text2 }}>{when}</b>
        {results.exhibition && <> · <b style={{ color: C.yellow }}>preseason counts</b>, starters play two series</>}
        {results.graded_at_human && <> · graded {results.graded_at_human}</>}. This is the
        bot&apos;s own record on its own published card — not anyone&apos;s personal calls. For
        your record against the bot, see the Picks tab.
      </div>
      )}

      {mode === 'week' && subTab === 'overview' && <CardGrid results={results} />}

      {mode === 'week' && subTab === 'overview' && rows.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <NflTable
            rows={rows}
            columns={[
              { key: 'did', label: '✓', flag: true, mark: '✓', w: 26,
                title: 'Did this rung clear its own market’s bar?' },
              { key: 'share', label: '', heat: false, w: 24,
                fmt: (v, r) => (
                  <button
                    onClick={(e) => { e.stopPropagation(); downloadNflPickCard(pickFromResultRow(r)) }}
                    title="Download this result as a PNG for posting"
                    aria-label="Download result card as image"
                    style={{
                      background: 'transparent', border: `1px solid ${C.border}`, color: C.text3,
                      borderRadius: 6, padding: '1px 5px', cursor: 'pointer', fontSize: TYPE.micro,
                    }}
                  >📸</button>
                ) },
              { key: 'name', label: 'Player', heat: false, w: 150, bold: true, sticky: true },
              { key: 'position', label: 'Pos', heat: false, w: 36, mono: true, dim: true },
              { key: 'team', label: 'Tm', heat: false, w: 36, mono: true, dim: true },
              { key: 'opp', label: 'Opp', heat: false, w: 56, mono: true, dim: true },
              { key: 'marketLabel', label: 'Market', heat: false, w: 108, dim: true,
                title: 'Which of the seven markets this rung was picked for' },
              { key: 'bar', label: 'Bar', heat: false, w: 42, mono: true, dim: true },
              { key: 'actual', label: 'Actual', heat: false, w: 54, mono: true,
                fmt: (v) => (v == null ? '—' : Number(v).toFixed(0)) },
              { key: 'result', label: 'Result', heat: false, w: 64,
                fmt: (v, r) => {
                  if (r.void) return <span style={{ color: C.text3 }}>no result</span>
                  return (
                    <span style={{ color: r.hit ? C.green : C.red, fontWeight: 800 }}>
                      {r.hit ? 'HIT' : 'MISS'}
                    </span>
                  )
                } },
              { key: 'grade', label: 'Grade', heat: false, w: 42, mono: true, dim: true,
                title: 'The rung’s own score grade, as published on the card' },
              { key: 'rank', label: '#', heat: false, w: 26, mono: true, dim: true,
                title: 'Rung rank within its market, 1 = the card’s top pick' },
            ]}
            onRowClick={onPlayerClick ? openRow : undefined}
            initialSort="did"
            maxHeight={420}
            caption="Every rung on the last graded card, receipts for the fractions above. Void means no line at all — cut, inactive, or a bye — and is left out of the market's own hit rate; it stays in this table because a scratched pick is information too. Sort by Market to compare within one, or by Grade to see whether the card's own highest-graded rungs actually cleared more often than its lowest — the honest test of whether the ranking inside a market means anything."
          />
        </div>
      )}

      {mode === 'week' && subTab === 'bands' && <ScoreBands data={data} results={results} />}

      {mode === 'season' && subTab === 'signals' && <NflSignalAudit />}

      {mode === 'season' && subTab === 'card' && keys.length === 0 && !loading && (
        <div style={{
          border: `1px dashed ${C.border2}`, borderRadius: 12, padding: 24,
          textAlign: 'center', color: C.text3, fontSize: TYPE.body,
        }}>No week has been graded yet this season.</div>
      )}

      {mode === 'season' && subTab === 'record' && (
        trackRows.length === 0 ? (
          <div style={{
            border: `1px dashed ${C.border2}`, borderRadius: 12, padding: 24,
            textAlign: 'center', color: C.text3, fontSize: TYPE.body,
          }}>{loading ? 'Harvesting graded weeks…' : 'No graded rungs in the archive yet.'}</div>
        ) : (
          <NflTable
            rows={trackRows}
            columns={[
              { key: 'name', label: 'Player', heat: false, w: 160, bold: true, sticky: true },
              { key: 'position', label: 'Pos', heat: false, w: 36, mono: true, dim: true },
              { key: 'team', label: 'Tm', heat: false, w: 36, mono: true, dim: true },
              { key: 'n', label: 'Rungs', heat: false, w: 50, mono: true,
                title: 'Graded rungs this player has been on, across the archive' },
              { key: 'hit', label: 'Hit', heat: false, w: 44, mono: true },
              { key: 'pct', label: 'Clear %', w: 62, mono: true,
                fmt: (v) => (v == null ? '—' : `${v}%`) },
              { key: 'weeks', label: 'Wks', heat: false, w: 42, mono: true, dim: true },
              { key: 'markets', label: 'Mkts', heat: false, w: 44, mono: true, dim: true,
                title: 'How many different markets this player has been picked in' },
            ]}
            onRowClick={onPlayerClick ? openRow : undefined}
            initialSort="n"
            maxHeight={520}
            maxRows={300}
            caption="Every graded rung in the archive, grouped by the player it was on. Void rungs are excluded — a scratched pick says nothing about the player. A two-rung player at 100% is a sample of two; sort by Rungs before you read Clear %."
          />
        )
      )}

      {mode === 'season' && subTab === 'weeks' && (
        weeksRows.length === 0 ? (
          <div style={{
            border: `1px dashed ${C.border2}`, borderRadius: 12, padding: 24,
            textAlign: 'center', color: C.text3, fontSize: TYPE.body,
          }}>{loading ? 'Harvesting graded weeks…' : 'No graded week has been published yet.'}</div>
        ) : (
          <NflTable
            rows={weeksRows}
            columns={[
              { key: 'week', label: 'Week', heat: false, w: 110, bold: true, sticky: true },
              { key: 'n', label: 'Rungs', heat: false, w: 52, mono: true },
              { key: 'hit', label: 'Hit', heat: false, w: 44, mono: true },
              { key: 'pct', label: 'Clear %', w: 64, mono: true,
                fmt: (v) => (v == null ? '—' : `${v}%`) },
              { key: 'markets', label: 'Markets', heat: false, w: 62, mono: true, dim: true,
                title: 'Markets with at least one graded rung that week' },
              { key: 'graded', label: 'Graded', heat: false, w: 150, dim: true },
            ]}
            onRowClick={(r) => { setMode('week'); setSubTab('overview'); setPicked(r.key === currentKey ? null : r.key) }}
            initialSort="week"
            maxHeight={420}
            caption="One row per graded week the archive has on the branch. Click a row to open that week under This week."
          />
        )
      )}

      {/* ── #14: THIS BLOCK WAS DOING NOTHING ────────────────────────────
          The Results header rendered as raw stacked text -- "LAST GRADED2026
          preseason", "OVERALL CLEAR RATE84.8%", "GRADED33latest published
          run" -- and the seven per-market rates as bare coloured words instead
          of tiles. Not a design choice and not a missing file: `<style jsx>`
          without `global` is SCOPED, and styled-jsx scopes by stamping a
          jsx-<hash> class onto elements rendered IN THIS COMPONENT. Every
          element these rules name is rendered by ReceiptHero and CardGrid,
          which are different components, so not one of them ever matched. The
          block has been inert for as long as it has existed, on the page the
          whole product's credibility rests on.

          `global` is the fix, and it comes with an obligation: a global block
          may not carry bare element selectors. The `h1` and `p` rules below
          were scoped to this component and would have restyled every h1 and
          every paragraph on the site the moment they went global -- so they
          are qualified to the hero they were always meant for. */}
      <style jsx global>{`
        .receiptHero{position:relative;margin-bottom:12px}
        .receiptKpis span{display:block;font-family:${NUM_FONT};font-size:8px;font-weight:900;letter-spacing:.1em;color:${C.text3}}
        .receiptKpis{position:relative;display:grid;grid-template-columns:1.4fr repeat(3,1fr);gap:8px;margin-top:18px}
        .receiptKpis>div{min-width:0;padding:10px 11px;border:1px solid ${C.border};border-radius:10px;background:#050b0ee0}
        .receiptKpis strong{display:block;margin-top:4px;font-family:${NUM_FONT};font-size:22px;line-height:1;color:${C.text}}
        .receiptKpis strong.leader{font-size:15px;line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .receiptKpis small{display:block;margin-top:5px;font-size:8.5px;color:${C.text3}}
        .receiptMeter{height:4px;margin-top:8px;border-radius:99px;background:${C.border};overflow:hidden}
        .receiptMeter i{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,${C.green},${C.lime})}
        .receiptMarkets{position:relative;display:grid;grid-template-columns:repeat(7,1fr);gap:5px;margin-top:8px}
        .receiptMarkets>div{padding:7px 8px;border-radius:8px;background:#050b0eb8;border:1px solid ${C.border}}
        .receiptMarkets span{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-family:${NUM_FONT};font-size:8px;font-weight:900}
        .receiptMarkets b{display:block;margin-top:3px;font-family:${NUM_FONT};font-size:12px;color:${C.text2}}
        .receiptMarkets i{display:block;height:2px;margin-top:5px;background:${C.border};border-radius:9px;overflow:hidden}
        .receiptMarkets em{display:block;height:100%;border-radius:inherit}
        @media(max-width:760px){
          .receiptKpis{grid-template-columns:1fr 1fr}
          .receiptMarkets{display:flex;overflow-x:auto;padding-bottom:3px}
          .receiptMarkets>div{min-width:82px}
        }
      `}</style>
    </div>
  )
}
