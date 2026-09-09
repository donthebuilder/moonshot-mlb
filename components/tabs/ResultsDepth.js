'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT } from '../../lib/theme'
import { arr, obj, n, clean, hitScore, prodScore, tbScore } from '../../lib/player'
import { dedupeGraded } from '../../lib/graded'
import { rampColor, inkFor } from '../Heatmap'
import DenseTable from '../DenseTable'
import { WhatThis } from '../ui'
import { SCORE } from '../../lib/scales'

// Results depth — the grading half of the Streamlit Results tab.
//
// Every field here comes from graded_slots, which the bot writes per pick with
// its designed_outcome ("what this pick needed to do") alongside what actually
// happened. That distinction is the whole page: an HR pick that produced two
// singles didn't work, and grading everything on HR would call a Hit pick a
// failure for doing exactly its job.
//
// Confirmed present on all 90 graded slots: pick_type, designed_outcome,
// designed_hit, got_hr, got_base_hit, got_xbh, actual_*, hrr_total, rank.

// ── WHAT THE ARCHIVE SAYS EACH LANE IS WORTH ────────────────────────────────
//
// Measured over this project's own archive (2026-08-16): 62 graded nights,
// 811 games, 5,184 judgeable designated picks. Every lane is scored on ITS OWN
// bar — the same bar this page grades tonight against — and VOIDS ARE EXCLUDED
// throughout, because a man who never batted is not a loss; he is a third
// outcome, not half of a bad one.
//
// It lives here rather than in Results.js because Results already imports this
// file, so this direction of the dependency is the one that doesn't loop.
//
// k AND n, ALWAYS. A bare percentage from somebody else's sample is exactly
// what this site refuses to print, and the older copy elsewhere in the repo
// (fit on 9 days and ~648 slots) reads several points off these — anywhere a
// rate is restated on this page it is restated from this block, with the
// sample said out loud.
export const ARCHIVE = {
  nights: 62,
  games: 811,
  picks: 5184,
  lanes: {
    HIT:     { k: 968, n: 1391, bar: '1+ hit' },
    HRR:     { k: 709, n: 1392, bar: '2+ H+R+RBI' },
    CONTACT: { k: 316, n: 791,  bar: '2+ total bases' },
    TOP:     { k: 172, n: 807,  bar: '1+ HR' },
    HR:      { k: 128, n: 803,  bar: '1+ HR' },
  },
  // The finding that dominates every other one on the page: the SAME TOP pick,
  // the same night, judged on the easier bar instead of the HR bar.
  topOnHits:  { k: 571, n: 807 },
  // One pick per game, always the top-scored HIT pick.
  onePerGame: { k: 586, n: 809, voidsAsLossesPct: 69.8 },
}
export const archPct = (o) => (100 * o.k) / o.n
export const archText = (o) => `${o.k.toLocaleString()}/${o.n.toLocaleString()} · ${archPct(o).toFixed(1)}%`

const PICK_META = {
  TOP15:    ['🏆', 'Top 15 Board'],
  TOP:      ['🔥', 'Legacy TOP · per game'],
  HR:       ['🚀', 'HR Picks'],
  HRR:      ['🎲', 'HRR Picks'],
  HIT:      ['🔷', 'Hit Picks'],
  CONTACT:  ['⚾', 'Contact Picks'],
}
const meta = (k) => PICK_META[String(k).toUpperCase()] || ['•', clean(k, '—')]

// The lib/player score getters all fall back to 0 when every alias is missing,
// which is exactly the failure this page has been burned by before: a field the
// bot never wrote printing as a confident 0.0. Anything that isn't a positive
// score comes back null instead, and DenseTable renders null as an em dash.
// A dash means "not published on this row", not "the model scored him zero".
const optScore = (row, getter) => {
  if (!row) return null
  const v = getter(row)
  return Number.isFinite(v) && v > 0 ? v : null
}

// The `Tile` component came out 2026-08-16 with its last four callers — the
// "Homers tonight / Were our picks / Inside our top 15 / Median rank" block in
// "Home runs vs the model", now the sentence that opens that section. Nothing
// on this page renders a stat tile any more.

// Horizontal bars. Same ramp as everything else, so length AND brightness both
// carry the value -- readable even when two bars are nearly the same length.
function Bars({ rows, unit = '', max: forcedMax, min: forcedMin = 0, limit }) {
  if (!rows.length) return null
  const shown = limit ? rows.slice(0, limit) : rows
  const max = forcedMax ?? Math.max(...shown.map((r) => r.value), 1)
  // A non-zero baseline is for measurements that never start at zero -- home
  // run distances live in a 350-430ft window, so a zero-based axis draws
  // fourteen near-identical full-width bars and shows nothing. Charts that
  // count things keep min at 0, where a zero baseline is the honest one.
  const min = forcedMin
  const span = Math.max(1, max - min)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {shown.map((r) => {
        const w = Math.max(3, (100 * (r.value - min)) / span)
        const bg = rampColor(r.value, min, max)
        return (
          <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              fontSize: 10, color: C.text2, width: 118, flexShrink: 0,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'right',
            }}>{r.label}</span>
            <div style={{ flex: 1, minWidth: 0, height: 15, background: C.bg3, borderRadius: 3 }}>
              <div style={{
                width: `${w}%`, height: '100%', background: bg, borderRadius: 3,
                display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 5,
              }}>
                <span style={{ fontSize: 9, fontWeight: 800, fontFamily: NUM_FONT, color: inkFor(bg) }}>
                  {r.display ?? `${r.value.toFixed(0)}${unit}`}
                </span>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// Every section leads with the question it answers, in one plain sentence.
// `sub` is the caveat under it, and is optional — the purpose line is not.
function Section({ title, answers, sub, children }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 3 }}>{title}</div>
      {answers && <WhatThis maxWidth={700}>{answers}</WhatThis>}
      {sub && <div style={{ fontSize: 10, color: C.text3, marginBottom: 7, lineHeight: 1.5 }}>{sub}</div>}
      {children}
    </div>
  )
}

export default function ResultsDepth({ results, onPlayerClick }) {
  const [showOnly, setShowOnly] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')

  const slots = useMemo(
    () => arr(results?.graded_slots).length ? arr(results.graded_slots) : arr(results?.results),
    [results],
  )
  const report = obj(results?.hr_capture_report)
  const homers = arr(report.all_homer_entries).length
    ? arr(report.all_homer_entries)
    : arr(results?.merged_homers)

  // Per-tier aggregation. `designed_hit` is the bot's own answer to "did this
  // pick do the job it was picked for"; got_hr is graded on HR regardless.
  const tiers = useMemo(() => {
    const by = new Map()
    slots.forEach((s) => {
      const k = String(s?.pick_type || '?').toUpperCase()
      if (!by.has(k)) by.set(k, [])
      by.get(k).push(s)
    })
    return [...by.entries()].map(([k, list]) => {
      const [icon, label] = meta(k)
      const did = list.filter((s) => s?.designed_hit).length
      const hr = list.filter((s) => s?.got_hr).length
      const hit = list.filter((s) => s?.got_base_hit).length
      const xbh = list.filter((s) => s?.got_xbh).length
      // TONIGHT NEXT TO 62 NIGHTS. A tier that went 2-for-3 means nothing on
      // its own; against the lane's own archive rate it means something. TOP15
      // is the night's top-15 board rather than a per-game designation, so it
      // has no archive row and prints a dash rather than borrowing one.
      const base = ARCHIVE.lanes[k] || null
      return {
        _key: k,
        icon, label, n: list.length,
        needs: clean(list[0]?.designed_outcome, '—'),
        base: base ? archText(base) : '—',
        did, didPct: (100 * did) / list.length,
        hr, hrPct: (100 * hr) / list.length,
        hit, hitPct: (100 * hit) / list.length,
        xbh, xbhPct: (100 * xbh) / list.length,
      }
    }).sort((a, b) => b.didPct - a.didPct)
  }, [slots])

  // Hit rate by model score band — the single chart that says whether the
  // score means anything. If it isn't monotonic, the score isn't ranking.
  //
  // DEDUPED (lib/graded.js): hr_score is a slate-row field, identical on both
  // graded rows of a hitter designated in two categories, so the raw slots put
  // that hitter in the same band twice with the same outcome. Multi-category
  // picks skew high, so the double-counting landed almost entirely in the top
  // band — the exact place this chart is being read. The tiers above stay on
  // the raw slots on purpose: those ARE per-category, by definition.
  const uniq = useMemo(() => dedupeGraded(slots), [slots])
  const bands = useMemo(() => {
    const edges = [[0, 40], [40, 55], [55, 70], [70, 101]]
    return edges.map(([lo, hi]) => {
      const inBand = uniq.filter((s) => {
        const v = n(s?.hr_score, 0)
        return v >= lo && v < hi
      })
      const hr = inBand.filter((s) => s?.got_hr).length
      return {
        label: hi > 100 ? `${lo}+` : `${lo}–${hi}`,
        nSlots: inBand.length,
        value: inBand.length ? (100 * hr) / inBand.length : 0,
      }
    }).filter((b) => b.nSlots > 0)
  }, [uniq])

  const everyPick = useMemo(() => {
    return slots
      .filter((s) => showOnly === 'all'
        || (showOnly === 'hr' && s?.got_hr)
        || (showOnly === 'did' && s?.designed_hit)
        || (showOnly === 'miss' && !s?.designed_hit))
      .filter((s) => typeFilter === 'all' || String(s?.pick_type).toUpperCase() === typeFilter)
      .map((s, i) => {
        const [icon, label] = meta(s?.pick_type)
        return {
          _key: `${s?.player_id ?? s?.name}-${i}`,
          _raw: s,
          icon,
          name: clean(s?.name, '—'),
          team: clean(s?.team, ''),
          pick: label,
          needs: clean(s?.designed_outcome, '—'),
          rank: n(s?.rank, null),
          score: n(s?.hr_score, 0),
          hr: n(s?.actual_hr, 0),
          h: n(s?.actual_hits, 0),
          tb: n(s?.actual_tb, 0),
          rbi: n(s?.actual_rbi, 0),
          r: n(s?.actual_runs, 0),
          hrr: n(s?.hrr_total, 0),
          job: s?.designed_hit ? 1 : 0,
          weak: s?.weak_spot_flag ? 1 : 0,
        }
      })
  }, [slots, showOnly, typeFilter])

  if (!slots.length) {
    return <div style={{ fontSize: 11.5, color: C.text3 }}>No graded picks published yet.</div>
  }

  // CUT 2026-08-09, owner: "everything from Bettable results down is too much,
  // even for me." Two whole sections came off the top of this file, and both
  // were the page above it repeated in tiles:
  //
  //   · "Bettable results" — five tiles. "Designed outcome hit" and "If graded
  //     on HR only" are, number for number, the Overview's "Did its job" and
  //     "If graded HR-only" tiles; the three tier tiles are the first three
  //     rows of the tier table twenty pixels further down.
  //   · "HR capture" — six tiles plus a longest-HR bar chart. The capture
  //     numbers are the Overview tile, the takeaway sentence AND the folded
  //     CaptureBanner; the longest bars are the Distance column of the
  //     "Home runs vs the model" table, which is sorted by distance already.
  //
  // Nothing here was unique to this file. `report` is still read, above, to
  // find the homer list the "Home runs vs the model" table is built from.

  return (
    <div>
      <Section
        title="Did each pick do its job?"
        answers="which kind of pick is actually working tonight — each tier scored against the outcome it was picked for."
        sub="A Hit pick that produced a single did its job; grading it on HR would call that a failure."
      >
        <DenseTable
          heatMode="sorted"
rows={tiers}
          columns={[
            { key: 'icon',   label: '',        heat: false, w: 26 },
            { key: 'label',  label: 'Pick type', heat: false, w: 118, bold: true, sticky: true },
            { key: 'needs',  label: 'Needs',   heat: false, w: 96, dim: true },
            { key: 'n',      label: 'N',       heat: false, w: 34, mono: true, dim: true },
            { key: 'did',    label: 'Did job', w: 50 },
            { key: 'didPct', label: 'Rate %',  w: 52, dp: 1 },
            { key: 'base',   label: `${ARCHIVE.nights} nights`, heat: false, w: 108, mono: true, dim: true,
              title: `What this lane has done on its own bar across the whole archive — ${ARCHIVE.nights} graded nights, ${ARCHIVE.games.toLocaleString()} games, ${ARCHIVE.picks.toLocaleString()} judgeable picks, voids excluded. Tonight is one night against that.` },
            // HR count lives here now. It used to be its own "HRs by pick type"
            // bar chart at the bottom of the page, which drew the same six
            // numbers a second time; one column is the whole chart.
            { key: 'hr',     label: 'HR',      w: 36 },
            { key: 'hrPct',  label: 'HR %',    w: 48, dp: 1 },
            { key: 'hitPct', label: '1+ Hit %', w: 54, dp: 1 },
            { key: 'xbhPct', label: 'XBH %',   w: 50, dp: 1 },
          ]}
          initialSort="didPct"
          maxHeight={280}
          caption=""
        />
        {/* DEDUPED 2026-08-09 (owner: "too many charts, some are repeats").
            A bar row per tier used to sit here drawing didPct — the exact
            values already in the Rate % column one line above — and a second
            "HRs by pick type" chart at the bottom of the page drew the HR
            counts. Both were the table again in a different shape. One
            representation of each fact: the table. */}
        <div style={{ fontSize: 9.5, color: C.text3, marginTop: 8, lineHeight: 1.55 }}>
          Legacy TOP is the archived per-game designation — the best play among the picks tracked in
          that game. It is not The Four, which are today&apos;s four market headline calls. A legacy TOP
          only counts here if it out-produced the other tracked picks from its game; it never means
          best player in the game.
        </div>
        {/* THE ARCHIVE, IN SENTENCES, UNDER THE ONE TABLE IT GRADES. Restated
            from the 62-night backtest rather than the older nine-day copy that
            still sits in the pick scorecard — same lanes, several points apart,
            mostly because voids used to be counted as losses. */}
        <div style={{ fontSize: 10.5, color: C.text2, marginTop: 9, lineHeight: 1.65 }}>
          <b style={{ color: C.text }}>The bar dominates the pick.</b> Over{' '}
          <b style={{ fontFamily: NUM_FONT }}>{ARCHIVE.nights}</b> graded nights —{' '}
          <b style={{ fontFamily: NUM_FONT }}>{ARCHIVE.games.toLocaleString()}</b> games,{' '}
          <b style={{ fontFamily: NUM_FONT }}>{ARCHIVE.picks.toLocaleString()}</b> judgeable
          designated picks, voids left out — the legacy per-game TOP pick cleared its own HR bar{' '}
          <b style={{ fontFamily: NUM_FONT }}>{archText(ARCHIVE.lanes.TOP)}</b>. The identical man on
          the identical night got a base hit{' '}
          <b style={{ fontFamily: NUM_FONT, color: C.text }}>{archText(ARCHIVE.topOnHits)}</b> of the
          time. Choosing what you ask him to do is worth more than choosing who.
          <div style={{ marginTop: 5, color: C.text3 }}>
            Lane by lane on their own bars: HIT {archText(ARCHIVE.lanes.HIT)} · HRR{' '}
            {archText(ARCHIVE.lanes.HRR)} · CONTACT {archText(ARCHIVE.lanes.CONTACT)} · TOP{' '}
            {archText(ARCHIVE.lanes.TOP)} · HR {archText(ARCHIVE.lanes.HR)}. Taking one pick per game
            and always the top-scored HIT pick: {archText(ARCHIVE.onePerGame)} — and counting the
            voids as losses instead of setting them aside drops that to{' '}
            {ARCHIVE.onePerGame.voidsAsLossesPct}%, which is the floor to quote if anyone asks.
          </div>
        </div>
      </Section>

      {bands.length > 1 && (
        <Section
          title="HR hit rate by model score band"
          answers="does a higher HR score actually mean a higher chance of a homer? If the model is working, these bars climb left to right."
          sub="The one chart on this page that grades the score itself rather than the picks."
        >
          <Bars
            rows={bands.map((b) => ({
              label: `${b.label}  (n=${b.nSlots})`,
              value: b.value,
              display: `${b.value.toFixed(0)}%`,
            }))}
            max={Math.max(...bands.map((b) => b.value), 10)}
          />
          <div style={{ fontSize: 9.5, color: C.text3, marginTop: 7 }}>
            Sample sizes are in the labels for a reason — a band with four picks in it can read 25% or
            0% on one swing, so a bar that breaks the pattern on a small n is noise, not a finding.
          </div>
        </Section>
      )}

      {/* The question the whole site exists to answer: when someone went deep,
          did we have him, and where did we have him ranked? A capture rate
          alone can be flattered by a wide board -- rank is what makes it real. */}
      <Section
        title="Home runs vs the model"
        answers="when someone went deep tonight, did we have him — and how high did the board have him?"
        sub="Every homer, matched to whether it was one of our picks, where the board ranked it, and what the board thought of him in every lane, not just HR. A homer off a man the model rated 41 for HR but 68 for hit shape is a different story than one it liked nowhere."
      >
        {(() => {
          const norm = (v) => String(v || '').toLowerCase().replace(/[^a-z]/g, '')
          const pickBy = new Map()
          slots.forEach((sl) => {
            const k = norm(sl?.name)
            if (!k) return
            // Keep the best-ranked entry when a name is picked in several tiers.
            const prev = pickBy.get(k)
            const rank = n(sl?.rank, 9999)
            if (!prev || rank < n(prev?.rank, 9999)) pickBy.set(k, sl)
          })

          const rows = homers.map((h, i) => {
            const sl = pickBy.get(norm(h?.name))
            const [icon, label] = sl ? meta(sl.pick_type) : ['', '']
            return {
              _key: `${h?.player_id ?? h?.name}-${i}`,
              _raw: sl || null,
              name: clean(h?.name, '—'),
              team: clean(h?.team, ''),
              onSheet: sl ? 1 : 0,
              pick: sl ? `${icon} ${label}` : 'not picked',
              rank: sl ? n(sl.rank, null) : null,
              score: sl ? n(sl.hr_score, 0) : 0,
              // The other three lanes the board scores every hitter in. Null,
              // not 0, when the graded row doesn't carry them.
              hitSc: optScore(sl, hitScore),
              hrrSc: optScore(sl, prodScore),
              tbSc: optScore(sl, tbScore),
              // Did the homer-hitter also get on base with a plain hit? A homer
              // IS a hit, so this is always >= 1 for a picked homer — the
              // interesting number is 2+, the guy who did it twice.
              hits: sl ? n(sl.actual_hits, null) : null,
              ft: n(h?.longest_ft, 0),
              ev: n(h?.max_ev_mph, 0),
              la: n(h?.launch_angle, 0),
            }
          }).sort((a, b) => b.onSheet - a.onSheet || (a.rank ?? 9999) - (b.rank ?? 9999))

          const onSheet = rows.filter((r) => r.onSheet)
          const ranked = onSheet.filter((r) => r.rank != null)
          const top15 = ranked.filter((r) => r.rank <= 15).length
          const medRank = ranked.length
            ? [...ranked].sort((a, b) => a.rank - b.rank)[Math.floor(ranked.length / 2)].rank
            : null

          // How many of the OTHER lanes had something to say about tonight's
          // homer-hitters. If this is 0 the three new columns will be all
          // dashes, and the note below says so rather than leaving you to
          // wonder whether the model scored everyone zero.
          const laneCovered = onSheet.filter((r) => r.hitSc != null || r.hrrSc != null || r.tbSc != null).length

          // The "Base hits by our picks" tile block came off here 2026-08-09.
          // Four tiles: total hits, picks with 1+ hit, multi-hit picks, hits
          // per pick. The Overview's "Base hit" tile and its multi-hit tile
          // already carry the first three off the same slots array, and this
          // section is about HOMERS versus the board — the base-hit rate was
          // sitting inside it for no reason other than that it fitted.

          return (
            <>
              {/* FOUR TILES BECAME ONE SENTENCE (2026-08-16). Homers tonight /
                  Were our picks / Inside our top 15 / Median rank all said the
                  same thing the sentence says, minus the clauses that make the
                  median rank readable at all. Every number and every sub-line
                  is still here; tiles lose to sentences. */}
              <div style={{ fontSize: 11.5, color: C.text2, lineHeight: 1.65, marginBottom: 12 }}>
                {rows.length === 0 ? (
                  'Nobody on the slate has gone deep yet, so there is nothing to check the board against.'
                ) : (
                  <>
                    <b style={{ fontFamily: NUM_FONT, color: C.text }}>{rows.length}</b> homer
                    {rows.length === 1 ? '' : 's'} tonight, and the sheet had{' '}
                    <b style={{ fontFamily: NUM_FONT, color: '#4ade80' }}>{onSheet.length} of {rows.length}</b>{' '}
                    ({((100 * onSheet.length) / rows.length).toFixed(0)}%) of them somewhere.{' '}
                    <b style={{ fontFamily: NUM_FONT, color: C.orange }}>{top15}</b> came from inside the
                    ranked top 15
                    {medRank == null ? (
                      <>, and none of the ones we had carried a board rank, so there is no median to quote.</>
                    ) : (
                      <>, and the median board rank of a homer we did have was{' '}
                        <b style={{ fontFamily: NUM_FONT, color: C.text }}
                          title="Lower is the model being right — it means the men who went deep were near the top of the board, not buried at the bottom of a wide net.">
                          #{medRank}
                        </b> — lower is the model being right.</>
                    )}
                  </>
                )}
              </div>

              <DenseTable
                heatMode="sorted"
rows={rows}
                columns={[
                  { key: 'name',    label: 'Player', heat: false, w: 150, bold: true, sticky: true },
                  { key: 'team',    label: 'Tm',     heat: false, w: 34, mono: true, dim: true },
                  { key: 'onSheet', label: 'Ours',   flag: true, mark: '✓', w: 36 },
                  { key: 'pick',    label: 'Pick type', heat: false, w: 124, dim: true },
                  { key: 'rank',    label: 'Board rank', heat: false, w: 62, mono: true, dim: true,
                    fmt: (v) => (v == null ? '—' : `#${v}`) },
                  { key: 'score',   label: 'HR score', w: 56, dp: 1, ...SCORE,
                    title: 'The home-run lane — what the board thought of his chance to go deep.' },
                  { key: 'hitSc',   label: 'Hit', w: 46, dp: 1, ...SCORE,
                    title: 'Hit-shape score — the board’s read on him getting a base hit, independent of power. A dash means the graded row doesn’t carry it.' },
                  { key: 'hrrSc',   label: 'HRR', w: 46, dp: 1, ...SCORE,
                    title: 'Production score — hits + runs + RBI. A dash means the graded row doesn’t carry it.' },
                  { key: 'tbSc',    label: 'TB', w: 44, dp: 1, ...SCORE,
                    title: 'Contact / total-base score — extra-base shape. A dash means the graded row doesn’t carry it.' },
                  { key: 'hits',    label: 'H', w: 34, dp: 0,
                    title: 'Actual hits tonight. A homer is a hit, so a picked homer is always at least 1 — the number worth seeing is 2+.' },
                  { key: 'ft',      label: 'Distance', w: 56, dp: 0 },
                  { key: 'ev',      label: 'EV',     w: 48, dp: 1 },
                  { key: 'la',      label: 'LA',     w: 42, dp: 1 },
                ]}
                onRowClick={onPlayerClick}
                initialSort="ft"
                maxHeight={360}
                caption={
                  `Sorted with our picks first, then by board rank. A homer with no rank was on the sheet in some tier but outside the ranked board; 'not picked' means we missed him entirely. `
                  + `Hit / HRR / TB are the board's other three lanes for the same man — ${laneCovered} of ${onSheet.length} picked homer-hitters carry at least one of them in the graded file`
                  + (laneCovered === 0
                    ? '; tonight none do, so those three columns are all dashes rather than zeros.'
                    : '. A dash is a field the grader did not write, not a score of zero.')
                }
              />
            </>
          )
        })()}
      </Section>

      <Section
        title="Every pick"
        answers="what happened to one specific player you were watching — the searchable, sortable list of all of them."
      >
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
          {[['all', 'All'], ['hr', 'Hit a HR'], ['did', 'Did its job'], ['miss', 'Missed']].map(([k, label]) => (
            <button
              key={k}
              onClick={() => setShowOnly(k)}
              style={{
                padding: '3px 10px', fontSize: 10.5, fontWeight: 700, borderRadius: 6, cursor: 'pointer',
                border: `1px solid ${showOnly === k ? C.orange : C.border}`,
                background: showOnly === k ? 'rgba(249,115,22,.12)' : 'transparent',
                color: showOnly === k ? C.orange : C.text3,
              }}
            >{label}</button>
          ))}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            style={{
              marginLeft: 'auto', background: C.bg2, border: `1px solid ${C.border}`,
              borderRadius: 6, padding: '3px 8px', fontSize: 10.5, color: C.text2, outline: 'none',
            }}
          >
            <option value="all">All types</option>
            {tiers.map((t) => <option key={t._key} value={t._key}>{t.label}</option>)}
          </select>
        </div>

        <DenseTable
          heatMode="sorted"
rows={everyPick}
          columns={[
            { key: 'icon',  label: '',       heat: false, w: 24 },
            { key: 'name',  label: 'Player', heat: false, w: 142, bold: true, sticky: true },
            { key: 'team',  label: 'Tm',     heat: false, w: 34, mono: true, dim: true },
            { key: 'pick',  label: 'Pick',   heat: false, w: 100, dim: true },
            { key: 'needs', label: 'Needed', heat: false, w: 86, dim: true },
            { key: 'job',   label: 'Job',    flag: true, mark: '✓', w: 34 },
            { key: 'weak',  label: '★',      flag: true, mark: '★', w: 30 },
            { key: 'rank',  label: 'Rank',   heat: false, w: 44, mono: true, dim: true,
              fmt: (v) => (v == null ? '—' : `#${v}`) },
            { key: 'score', label: 'HR score', w: 54, dp: 1, ...SCORE },
            { key: 'hr',    label: 'HR',     w: 34 },
            { key: 'h',     label: 'H',      w: 32 },
            { key: 'tb',    label: 'TB',     w: 34 },
            { key: 'rbi',   label: 'RBI',    w: 36 },
            { key: 'r',     label: 'R',      w: 32 },
            { key: 'hrr',   label: 'HRR',    w: 40 },
          ]}
          onRowClick={onPlayerClick}
          initialSort="score"
          maxHeight={520}
          caption={`${everyPick.length} of ${slots.length} picks shown. Job is the bot's own designed-outcome grade, not an HR check.`}
        />
      </Section>
    </div>
  )
}
