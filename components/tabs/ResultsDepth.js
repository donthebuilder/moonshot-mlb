'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT } from '../../lib/theme'
import { arr, obj, n, clean, hitScore, prodScore, tbScore } from '../../lib/player'
import Heatmap, { ORANGE_RAMP, rampColor, inkFor } from '../Heatmap'
import DenseTable from '../DenseTable'

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

const PICK_META = {
  TOP15:    ['🏆', 'Top 15 Board'],
  TOP:      ['🔥', 'Top Picks'],
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

function Tile({ label, value, sub, tone = 'flat' }) {
  const col = tone === 'up' ? '#4ade80' : tone === 'accent' ? C.orange : C.text3
  return (
    <div style={{
      background: `${col}12`, border: `1px solid ${col}30`, borderRadius: 10,
      padding: '8px 12px', minWidth: 0,
    }}>
      <div style={{
        fontSize: 8.5, textTransform: 'uppercase', letterSpacing: '.08em',
        color: C.text3, fontWeight: 700, whiteSpace: 'nowrap',
        overflow: 'hidden', textOverflow: 'ellipsis',
      }}>{label}</div>
      <div style={{
        fontFamily: NUM_FONT, fontSize: 19, fontWeight: 800,
        color: tone === 'flat' ? C.text : col, letterSpacing: '-.02em',
      }}>{value}</div>
      {sub && <div style={{ fontSize: 9, color: C.text3, fontFamily: NUM_FONT }}>{sub}</div>}
    </div>
  )
}

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

function Section({ title, sub, children }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ fontSize: 13, fontWeight: 800, marginBottom: sub ? 2 : 7 }}>{title}</div>
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
      return {
        _key: k,
        icon, label, n: list.length,
        needs: clean(list[0]?.designed_outcome, '—'),
        did, didPct: (100 * did) / list.length,
        hr, hrPct: (100 * hr) / list.length,
        hit, hitPct: (100 * hit) / list.length,
        xbh, xbhPct: (100 * xbh) / list.length,
      }
    }).sort((a, b) => b.didPct - a.didPct)
  }, [slots])

  // Hit rate by model score band — the single chart that says whether the
  // score means anything. If it isn't monotonic, the score isn't ranking.
  const bands = useMemo(() => {
    const edges = [[0, 40], [40, 55], [55, 70], [70, 101]]
    return edges.map(([lo, hi]) => {
      const inBand = slots.filter((s) => {
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
  }, [slots])

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

  const didTotal = slots.filter((s) => s?.designed_hit).length
  const hrTotal = slots.filter((s) => s?.got_hr).length
  const longest = [...homers]
    .map((h) => ({ label: clean(h?.name, '—'), value: n(h?.longest_ft, 0) }))
    .filter((h) => h.value > 0)
    .sort((a, b) => b.value - a.value)
  const topLongest = longest[0]
  const maxEV = Math.max(...homers.map((h) => n(h?.max_ev_mph, 0)), 0)

  return (
    <div>
      <Section title="Bettable results">
        <div style={{
          display: 'grid', gap: 8,
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
        }}>
          {tiers.slice(0, 3).map((t) => (
            <Tile
              key={t._key}
              label={`${t.icon} ${t.label}`}
              value={`${t.did}/${t.n}`}
              sub={`${t.didPct.toFixed(1)}% did its job`}
              tone="accent"
            />
          ))}
          <Tile
            label="Designed outcome hit"
            value={`${didTotal}/${slots.length}`}
            sub={`${((100 * didTotal) / slots.length).toFixed(1)}%`}
            tone="up"
          />
          <Tile
            label="If graded on HR only"
            value={`${hrTotal}/${slots.length}`}
            sub={`${((100 * hrTotal) / slots.length).toFixed(1)}%`}
          />
        </div>
      </Section>

      {homers.length > 0 && (
        <Section title="HR capture">
          <div style={{
            display: 'grid', gap: 8, marginBottom: 14,
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          }}>
            <Tile label="Slate HRs" value={n(report.total_hrs_on_slate, homers.length)} />
            <Tile label="On the sheet" value={n(report.caught_hrs_on_sheet, 0)} tone="up" />
            <Tile
              label="Capture rate"
              value={`${n(report.hr_capture_pct, 0).toFixed(1)}%`}
              tone="up"
            />
            <Tile label="Missed entirely" value={n(report.missed_hrs_not_on_sheet, 0)} />
            {topLongest && (
              <Tile label="Longest" value={`${topLongest.value.toFixed(0)} ft`} sub={topLongest.label} tone="accent" />
            )}
            {maxEV > 0 && <Tile label="Max EV" value={`${maxEV.toFixed(1)} mph`} />}
          </div>

          {longest.length > 0 && (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.text2, marginBottom: 6 }}>
                Longest HRs tonight (ft)
                {longest.length > 5 && (
                  <span style={{ color: C.text3, fontWeight: 600, fontFamily: NUM_FONT }}>
                    {' '}· top 5 of {longest.length}
                  </span>
                )}
              </div>
              <Bars
                rows={longest.slice(0, 5)}
                limit={5}
                min={Math.max(0, Math.min(...longest.slice(0, 5).map((x) => x.value)) - 15)}
                max={Math.max(...longest.slice(0, 5).map((x) => x.value)) + 5}
              />
              <div style={{ fontSize: 9.5, color: C.text3, marginTop: 6, lineHeight: 1.5 }}>
                Top 5 only — a full list of thirty homers pushed everything else on this page off
                screen, and past the top handful the distances stop being interesting.
                {' '}The axis starts near the shortest of the five rather than at zero: every ball
                here cleared a fence, so a zero-based scale would draw five identical full-width
                bars. That makes the spread readable but also exaggerates it — the gap across these
                five is usually 30 to 60 feet, not the full width of the chart.
              </div>
            </>
          )}
        </Section>
      )}

      <Section
        title="Did each pick do its job?"
        sub="Each tier is graded on the outcome it was picked FOR, not on home runs. A Hit pick that produced a single did its job; grading it on HR would call that a failure."
      >
        <DenseTable
          rows={tiers}
          columns={[
            { key: 'icon',   label: '',        heat: false, w: 26 },
            { key: 'label',  label: 'Pick type', heat: false, w: 118, bold: true, sticky: true },
            { key: 'needs',  label: 'Needs',   heat: false, w: 96, dim: true },
            { key: 'n',      label: 'N',       heat: false, w: 34, mono: true, dim: true },
            { key: 'did',    label: 'Did job', w: 50 },
            { key: 'didPct', label: 'Rate %',  w: 52, dp: 1 },
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
          Top Picks are relative — picked as the best play in their game, so one only counts if it
          out-produced our other picks from that same game. We only see our own picks, so that means
          best <i>of the ones we tracked</i>, not best in the game.
        </div>
      </Section>

      {bands.length > 1 && (
        <Section
          title="HR hit rate by model score band"
          sub="The one chart that says whether the score means anything. If the model is working, these climb left to right."
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
        sub="Every homer tonight, matched to whether it was one of our picks, where the board had it ranked, and — added 2026-08-09 — what the board thought of him in EVERY lane, not just HR. A homer off a man the model rated 41 for HR but 68 for hit shape is a different story than one it liked nowhere."
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

          // BASE HITS BY OUR PICKS — slate-wide, every graded pick, not just
          // the ones who went deep. Only picks that actually recorded an at-bat
          // are in the denominator; a scratched or benched pick isn't a miss.
          const judged = slots.filter((s) => n(s?.actual_ab, 0) > 0)
          const totalHits = judged.reduce((a, s) => a + n(s?.actual_hits, 0), 0)
          const withHit = judged.filter((s) => n(s?.actual_hits, 0) >= 1).length
          const multiHit = judged.filter((s) => n(s?.actual_hits, 0) >= 2).length

          return (
            <>
              <div style={{
                display: 'grid', gap: 8, marginBottom: 12,
                gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
              }}>
                <Tile label="Homers tonight" value={rows.length} />
                <Tile
                  label="Were our picks"
                  value={`${onSheet.length}/${rows.length}`}
                  sub={rows.length ? `${((100 * onSheet.length) / rows.length).toFixed(0)}%` : null}
                  tone="up"
                />
                <Tile label="Inside our top 15" value={top15} tone="accent" />
                <Tile
                  label="Median rank of hits"
                  value={medRank == null ? '—' : `#${medRank}`}
                  sub="lower is the model being right"
                />
              </div>

              {/* BASE HITS BY OUR PICKS (2026-08-09). The page graded the
                  night on homers and on designed outcomes, and never once
                  said the plainest thing: how often our picks simply got a
                  hit. Slate-wide, across every graded pick — not only the
                  ones in the homer table above it. */}
              {judged.length > 0 && (
                <>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.text2, margin: '4px 0 7px' }}>
                    Base hits by our picks
                    <span style={{ color: C.text3, fontWeight: 500 }}>
                      {' '}— every graded pick tonight, not just the homers
                    </span>
                  </div>
                  <div style={{
                    display: 'grid', gap: 8, marginBottom: 12,
                    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                  }}>
                    <Tile label="Total hits" value={totalHits} sub={`across ${judged.length} picks with an AB`} tone="up" />
                    <Tile
                      label="Picks with 1+ hit"
                      value={`${withHit}/${judged.length}`}
                      sub={`${((100 * withHit) / judged.length).toFixed(0)}%`}
                      tone="accent"
                    />
                    <Tile label="Multi-hit picks" value={multiHit} sub="2 or more" />
                    <Tile
                      label="Hits per pick"
                      value={(totalHits / judged.length).toFixed(2)}
                      sub="mean, ABs only"
                    />
                  </div>
                  <div style={{ fontSize: 9.5, color: C.text3, margin: '-6px 0 14px', lineHeight: 1.55 }}>
                    Denominator is picks that recorded an at-bat ({judged.length} of {slots.length} graded
                    slots). A pick who was scratched or never came up isn&apos;t a miss, so he isn&apos;t
                    counted either way — which is also why this percentage runs a little higher than one
                    taken over every slot.
                  </div>
                </>
              )}

              <DenseTable
                rows={rows}
                columns={[
                  { key: 'name',    label: 'Player', heat: false, w: 150, bold: true, sticky: true },
                  { key: 'team',    label: 'Tm',     heat: false, w: 34, mono: true, dim: true },
                  { key: 'onSheet', label: 'Ours',   flag: true, mark: '✓', w: 36 },
                  { key: 'pick',    label: 'Pick type', heat: false, w: 124, dim: true },
                  { key: 'rank',    label: 'Board rank', heat: false, w: 62, mono: true, dim: true,
                    fmt: (v) => (v == null ? '—' : `#${v}`) },
                  { key: 'score',   label: 'HR score', w: 56, dp: 1,
                    title: 'The home-run lane — what the board thought of his chance to go deep.' },
                  { key: 'hitSc',   label: 'Hit', w: 46, dp: 1,
                    title: 'Hit-shape score — the board’s read on him getting a base hit, independent of power. A dash means the graded row doesn’t carry it.' },
                  { key: 'hrrSc',   label: 'HRR', w: 46, dp: 1,
                    title: 'Production score — hits + runs + RBI. A dash means the graded row doesn’t carry it.' },
                  { key: 'tbSc',    label: 'TB', w: 44, dp: 1,
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

      <Section title="Every pick">
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
            { key: 'score', label: 'HR score', w: 54, dp: 1 },
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
