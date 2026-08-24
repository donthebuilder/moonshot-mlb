'use client'
import { useMemo } from 'react'
import { C, NUM_FONT, MARKETS } from '../../../lib/nfl/theme'
import DenseTable from '../../DenseTable'
import { downloadNflPickCard } from '../shareCard'

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
const MARKET_COLOR = {
  TD: C.green,
  REC_YDS: C.cyan,
  REC: C.lime,
  RUSH_YDS: C.blue,
  RUSH_ATT: C.purple,
  PASS_YDS: C.orange,
  KICK_PTS: C.yellow,
}

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
      fontSize: 9, fontWeight: 900, padding: '1.5px 6px', borderRadius: 4,
      fontFamily: NUM_FONT, letterSpacing: '.04em',
      background: `${col}22`, color: col,
    }}>{children}</span>
  )
}

// ── section 1: the card's record ────────────────────────────────────────────

function CardGrid({ results }) {
  const totals = results.totals || {}
  const bars = results.bars || {}

  const boxes = MARKETS.map(([key, label]) => {
    const t = totals[key]
    return { key, label, color: MARKET_COLOR[key], bar: bars[key], t }
  }).filter((b) => b.t)

  const sumN = boxes.reduce((a, b) => a + (b.t.n || 0), 0)
  const sumHit = boxes.reduce((a, b) => a + (b.t.hit || 0), 0)
  const sumVoid = boxes.reduce((a, b) => a + (b.t.void || 0), 0)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 800 }}>Did the card do its job?</span>
        <span style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT }}>
          {sumHit} of {sumN} card rungs cleared their own bar this run
          {sumVoid > 0 && ` · ${sumVoid} void`}
        </span>
      </div>

      <div style={{ fontSize: 10.5, color: C.text3, marginBottom: 8, lineHeight: 1.6 }}>
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
          const degenerate = b.key === 'TD'
          return (
            <div key={b.key} title={degenerate
              ? 'TD’s bar is 1, and a value of exactly 0 never reaches this payload (nfl_results.py drops falsy values) — so a void rung here may mean “played, scored zero” rather than “never played.” Read the void count as an upper bound on true misses, not a bench count.'
              : `Graded against ${MARKET_OUTCOME_TEXT[b.key]}, bar ${b.bar}.`}
              style={{
                background: `linear-gradient(155deg, ${b.color}1c, ${b.color}06)`,
                border: `1px solid ${b.color}44`, borderRadius: 11, padding: '8px 12px',
              }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 10.5, fontWeight: 900, color: b.color, fontFamily: NUM_FONT }}>{b.label}</span>
                <span style={{ fontSize: 8.5, color: C.text3 }}>bar {b.bar}</span>
                {degenerate && <span style={{ fontSize: 9, color: C.yellow }}>†</span>}
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 2 }}>
                <span style={{ fontFamily: NUM_FONT, fontSize: 19, fontWeight: 900, color: b.color }}>
                  {n ? `${hit}/${n}` : '—'}
                </span>
                {n > 0 && <span style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT }}>{pctTxt(pct)}</span>}
              </div>
              {voidN > 0 && (
                <div style={{ fontSize: 8.5, fontFamily: NUM_FONT, color: C.text3, marginTop: 1 }}>
                  {voidN} void
                </div>
              )}
            </div>
          )
        })}
      </div>
      <div style={{ fontSize: 9, color: C.text3, marginTop: 2 }}>
        † TD&apos;s void count may be inflated — see the box for why.
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
      key, label, color: MARKET_COLOR[key], bar: bars[key],
      ...bandMarket(key, bars[key], players, lines),
    }))
  }, [data, results])

  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 2 }}>
        Is the score separating outcomes, live?
      </div>
      <div style={{ fontSize: 10.5, color: C.text3, marginBottom: 8, lineHeight: 1.6 }}>
        Not the five-deep card — every player this run who had both a score and a graded line for
        that market, split into quartiles by score. If the top quarter of the pool doesn&apos;t
        clear the bar noticeably more than the bottom quarter, the ranking isn&apos;t doing
        anything a coin flip wouldn&apos;t. This is 2026&apos;s actual results only, one run&apos;s
        pool at a time — for the same question asked properly, against completed prior seasons
        under a real backtest, see Report Card.
      </div>

      {rows.map((r) => (
        <div key={r.key} style={{
          background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 11,
          padding: '9px 12px', marginBottom: 7,
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11.5, fontWeight: 800, color: r.color }}>{r.label}</span>
            <span style={{ fontSize: 9, color: C.text3, fontFamily: NUM_FONT }}>bar {r.bar}</span>
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
            <div style={{ fontSize: 9.5, color: C.text3, marginTop: 3, lineHeight: 1.55 }}>
              No player this run has both a {MARKET_LABEL[r.key]} score and a graded line —
              either nothing has finished yet, or this market has no eligible players on the
              slate.
            </div>
          )}
          {r.state === 'degenerate' && (
            <div style={{ fontSize: 9.5, color: C.text3, marginTop: 3, lineHeight: 1.55 }}>
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
                  <div style={{ fontSize: 8.5, color: C.text3 }}>{b.label}</div>
                  <div style={{ fontFamily: NUM_FONT, fontSize: 14, fontWeight: 900, color: r.color }}>
                    {b.pct.toFixed(1)}%
                  </div>
                  <div style={{ fontSize: 8.5, color: C.text3, fontFamily: NUM_FONT }}>
                    {b.ok}/{b.n} cleared
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ── the tab ──────────────────────────────────────────────────────────────────

export default function Accountability({ data, results, onPlayerClick }) {
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
        textAlign: 'center', color: C.text3, fontSize: 12.5,
      }}>Nothing has been graded yet.</div>
    )
  }

  const rows = cardRows(results)
  const when = results.mode === 'week'
    ? `season ${results.season}, week ${results.week ?? '—'}`
    : `${results.season} preseason`

  return (
    <div>
      <div style={{
        background: C.bg2, border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.green}`,
        borderRadius: 10, padding: '10px 14px', marginBottom: 14,
        fontSize: 11, color: C.text3, lineHeight: 1.6,
      }}>
        Last graded: <b style={{ color: C.text2 }}>{when}</b>
        {results.exhibition && <> · <b style={{ color: C.yellow }}>preseason counts</b>, starters play two series</>}
        {results.graded_at_human && <> · graded {results.graded_at_human}</>}. This is the
        bot&apos;s own record on its own published card — not anyone&apos;s personal calls. For
        your record against the bot, see the Picks tab.
      </div>

      <CardGrid results={results} />

      {rows.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <DenseTable
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
                      borderRadius: 6, padding: '1px 5px', cursor: 'pointer', fontSize: 10,
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
                  if (r.void) return <span style={{ color: C.text3 }}>void</span>
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

      <ScoreBands data={data} results={results} />
    </div>
  )
}
