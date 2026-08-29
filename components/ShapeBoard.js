'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { clean, nameOf, teamOf, oppOf, hrScore, playerId } from '../lib/player'
import { PanelTitle, Empty, inputStyle } from './ui'
import { inkFor } from './Heatmap'
import DenseTable from './DenseTable'
import {
  HR_BANDS, HR_CUTS, SHAPE_MIN_N, SHAPE_FORM_EDGE,
  slateShapeMix, shapeRead, typeLabel, formVerdict,
  shapeDataPublished, shapeFormPublished,
} from '../lib/hrShape'

// ── 🧬 SHAPE — every hitter's homer shape on one sortable board ─────────────
//
// Donovan: "hr shape ... needs to be somewhere else on the site for comparison
// and sorting."
//
// WHAT THIS ANSWERS. What KIND of home run each hitter on tonight's slate
// actually hits — wall-scraper, laser, standard, moonshot, no-doubter — and
// whether his recent hard-hit contact is drifting toward or away from the
// shape his own homers take. It is the same question components/HomerShape.js
// answers inside one player's modal, asked of all 266 hitters at once.
//
// WHY IT HAD TO EXIST. The modal panel was the ONLY place homer shape lived,
// and a panel inside a card can only ever describe one man. You could learn
// that Schwarber is a laser bat; you could not learn who else is, who the
// moonshot bats are tonight, or which of the two hitters you are choosing
// between is closer to his own form. Shape without comparison is trivia. This
// board is the comparison, and DenseTable's multi-column sort is the sorting.
//
// ── WHERE THE NUMBERS COME FROM, AND WHY NOT FROM THE MODAL'S SOURCE ────────
//
// The modal computes the mix browser-side from `batted_ball_log`, which lives
// in the per-player DETAIL file. A 266-row board reading that source would
// need 266 fetches to draw one column, so this reads `hr_shape_profile` and
// `personal_shape_*` off the slate rows instead — the bot's nightly archive of
// the same computation (mlb_dashboard.py; the two are kept in sync by hand,
// see the PERSONAL HR SHAPE note in lib/hrShape.js). Verified on the fixture:
// all 266 rows carry a profile and a status, so the board fetches NOTHING.
//
// The band labels, colours, blurbs, the 4-homer floor, the ±.08 form edge and
// the words "trending toward his shape" are all imported from lib/hrShape.js
// rather than restated here, so this board and the modal panel cannot describe
// the same hitter's band differently.
//
// ── THE THREE HONESTY RULES THIS BOARD IS BUILT AROUND ──────────────────────
//
// 1. IT REFUSES TO CALL A 2-HOMER MIX A SHAPE. Under SHAPE_MIN_N classified
//    homers, one ball swings the mix 25-33 points. Those hitters keep their
//    row and their COUNTS — nothing is hidden — but the Type column says "too
//    thin (2 HR)" instead of a band, and the mix renders as words rather than
//    as a proportion bar, because a bar off two homers draws a claim the two
//    homers cannot support. Same for a hitter at n=0: "no tracked HR" is an
//    absence of a shape, not a shape.
//
// 2. n IS ON SCREEN IN EVERY ROW, AND EVERY SHARE IS PRINTED NEXT TO ITS
//    COUNT. A share only ever appears at n ≥ SHAPE_MIN_N, and never alone —
//    the tooltip and the CSV both carry "6 of 14", not "43%".
//
// 3. IT DESCRIBES AND DOES NOT PREDICT. Nobody has graded whether being "in
//    his shape" makes a homer more likely tonight. The bot archives
//    personal_shape_match nightly so the question can be answered later; until
//    it is, this board is a description of contact and says so in the header,
//    in the column tooltip, and in the caption. No shape number is blended
//    into any score, and the HR-score column sits alongside precisely so the
//    reader can see the bot's opinion WITHOUT this board implying it agrees.
//
// ── WHY "DOMINANT BAND" GETS A LEAN COLUMN NEXT TO IT ───────────────────────
//
// Plurality alone answers almost nothing, and the fixture says so out loud:
// of the 222 hitters over the floor, 168 are plurality-standard — because
// standard is 46% of ALL homers, league-wide. A board whose headline column
// reads "Standard" 168 times has sorted nobody. So the board also carries
// LEAN: the band this hitter is furthest OVER the pooled slate baseline on, in
// percentage points. That is the column that separates a genuine moonshot bat
// from a hitter who merely has one moonshot, and it is why the baseline strip
// sits at the top of the page rather than in a tooltip.
//
// ── WHAT WAS REJECTED ───────────────────────────────────────────────────────
//
// · A SHAPE SCORE. Every instinct here says roll the mix and the form delta
//   into one 0-100 and sort on it. It would be the single most misleading
//   number on the site: a 0-100 reads as a probability, this has never been
//   graded, and the underlying generic version (aggregate barrel rate) does
//   not predict homer nights at all (p=0.58 on the graded archive). The board
//   sorts on measured counts and one published delta, and on nothing invented.
// · HIDING THE THIN HITTERS BY DEFAULT. 44 of 266 are under the floor and they
//   would tidy the board up nicely. But "he has no shape yet" is a real answer
//   to "what shape is he", and a reader who cannot find a hitter assumes the
//   board is broken. They are shown, dimmed, named, and there is a chip to
//   drop them when he wants the comparison set only.
// · TILES ACROSS THE TOP. Ruled against five times. The slate's pooled mix is
//   a legend strip that doubles as the baseline, and the rest is sentences.
// · A SECOND COPY OF THE BANDS. The cut points (366ft / 428ft / 25° / 34°) are
//   quoted from HR_CUTS, not retyped.

const BAND_KEYS = Object.keys(HR_BANDS)

// The five per-band count columns, in the order the bands are defined — which
// is the order of the distribution itself (shortest/flattest to farthest), so
// scanning left to right across a row IS scanning up the launch profile.
const BAND_COLS = BAND_KEYS.map((k) => ({ key: k, short: HR_BANDS[k].short, label: HR_BANDS[k].label }))

const pp = (v) => `${v > 0 ? '+' : ''}${v.toFixed(0)}`

/**
 * The mix in one cell.
 *
 * At n ≥ SHAPE_MIN_N it is a proportion bar — five segments in the band
 * colours, each one's COUNT printed inside when the segment is wide enough to
 * hold it. Below the floor it is deliberately NOT a bar: proportion is the
 * thing the sample cannot support, so those hitters get their counts as words
 * ("2 Laser") and no geometry implying a distribution.
 */
function MixCell({ read }) {
  const { n: nn, mix, thin } = read
  if (!nn) return <span style={{ color: C.text3, fontSize: 10 }}>no tracked HR</span>
  const title = mix.map((m) => `${m.label} ${m.count} of ${nn}`).join(' · ')
  if (thin) {
    return (
      <span title={`${title} — under ${SHAPE_MIN_N} classified homers, so counts only: a share off ${nn} homer${nn === 1 ? '' : 's'} is not a mix.`}
        style={{ display: 'inline-flex', gap: 6, alignItems: 'baseline', cursor: 'default' }}>
        {mix.map((m) => (
          <span key={m.key} style={{ fontSize: 9.5, fontFamily: NUM_FONT, fontWeight: 800, color: m.color }}>
            {m.count} {m.label.toLowerCase()}
          </span>
        ))}
      </span>
    )
  }
  return (
    <span title={`${title}. Segment width is his share, the number inside is the count.`}
      style={{ display: 'flex', width: '100%', height: 13, borderRadius: 3, overflow: 'hidden', cursor: 'default' }}>
      {mix.map((m) => (
        <span key={m.key} style={{
          flex: `${m.count} 0 0`, background: m.color, color: inkFor(m.color),
          fontFamily: NUM_FONT, fontSize: 8.5, fontWeight: 900, lineHeight: '13px',
          textAlign: 'center', overflow: 'hidden',
        }}>{m.share >= 0.14 ? m.count : ''}</span>
      ))}
    </span>
  )
}

/**
 * TONIGHT'S POOLED MIX — the legend and the baseline in one strip.
 *
 * It has to be here twice over: nothing else on the page says what a "laser"
 * IS, and the Lean column is measured in points over exactly these shares. A
 * baseline quoted in a tooltip and a legend printed as a colour key would be
 * two strips saying overlapping things.
 *
 * Every chip names its band in WORDS as well as colour, and prints the pooled
 * count under the share — 3,125 homers is a denominator worth showing.
 */
function BaselineStrip({ base }) {
  if (!base?.total) return null
  return (
    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', margin: '0 0 10px' }}>
      {BAND_KEYS.map((k) => {
        const b = HR_BANDS[k]
        return (
          <span key={k} title={`${b.label} — ${b.blurb}`} style={{
            display: 'inline-flex', gap: 6, alignItems: 'baseline', cursor: 'default',
            border: `1px solid ${b.color}55`, background: `${b.color}12`,
            borderRadius: 999, padding: '2px 10px',
          }}>
            <span style={{ fontSize: 8.5, fontWeight: 900, color: b.color, fontFamily: NUM_FONT, letterSpacing: '.05em' }}>{b.short}</span>
            <span style={{ fontSize: 10, fontWeight: 800, color: C.text, fontFamily: NUM_FONT }}>
              {(100 * base.shares[k]).toFixed(1)}%
            </span>
            <span style={{ fontSize: 8.5, color: C.text3, fontFamily: NUM_FONT }}>{base.counts[k]}</span>
          </span>
        )
      })}
    </div>
  )
}

/**
 * `showTitle` — same contract as LongestBoard and DueBoard: on the Power page
 * the lens pill IS this board's title, so the h2 is suppressed and the two
 * facts the PanelTitle carried (the one-line definition and the row count)
 * move into the paragraph below rather than disappearing.
 */
export default function ShapeBoard({ players = [], onWatch, watchIds, onPlayerClick, showTitle = true }) {
  // 'all' plus one key per band, plus the two non-band answers. Filtering on
  // the TYPE (not on "has any laser homer") is the filter Donovan asked for —
  // "show me only the laser guys" means guys who ARE lasers.
  const [band, setBand] = useState('all')
  // Two independent gates, both off by default. See "WHAT WAS REJECTED".
  const [overFloor, setOverFloor] = useState(false)
  const [formOnly, setFormOnly] = useState(false)
  const [query, setQuery] = useState('')

  const pool = useMemo(() => (players || []).filter(Boolean), [players])

  // The pooled reference. Every hitter's homers count toward it, including the
  // ones under the floor — the floor is a rule about describing a PERSON, and
  // a homer is evidence about the league whoever hit it.
  const base = useMemo(() => slateShapeMix(pool), [pool])

  const all = useMemo(() => pool.map((p, i) => {
    const read = shapeRead(p, base)
    const t = typeLabel(read)
    const v = formVerdict(read.form.match)
    const counts = {}
    BAND_KEYS.forEach((k) => { counts[k] = read.counts[k] })
    return {
      _key: `${p?.player_id ?? nameOf(p)}-${i}`,
      _raw: p,
      _read: read,
      _typeKey: t.key,
      _typeColor: t.color,
      _typeWhy: t.why,
      _verdict: v,
      watched: watchIds?.has(playerId(p)) ? 1 : 0,
      name: nameOf(p),
      team: teamOf(p),
      opp: oppOf(p),
      matchup: clean(p?.pitcher_name, 'TBD'),
      type: t.text,
      // The mix as TEXT is what lands in the CSV — "Standard 6 of 14 ·
      // Laser 3 of 14". Counts with their denominator, never a bare share,
      // in the export exactly as on screen. The cell itself renders the bar.
      mix: read.mix.map((m) => `${m.label} ${m.count} of ${read.n}`).join(' · '),
      n: read.n,
      ...counts,
      lean: read.lean ? read.lean.label : '',
      leanPP: read.lean ? 100 * read.lean.over : undefined,
      // ── undefined, NOT null, AND IT MATTERS ────────────────────────────────
      // A missing number here is missing because the bot refused to rate the
      // reading — see the ZERO IS NOT THE SAME FACT AS "NO READING" note in
      // lib/hrShape.js: 31 rows on the verified slate publish a flat 0.0 that
      // is a serialiser writing null, and 74 rows have no readable delta at
      // all. DenseTable sinks null and undefined identically when sorting, but
      // it colours cells off `Number(v)` — and Number(null) is 0, so a null
      // would paint 74 blank cells at the ramp's zero as if they had been
      // measured at zero. Number(undefined) is NaN, which the heat check
      // rejects, so the cell stays neutral and the '—' is the whole story.
      match: read.form.match == null ? undefined : 100 * read.form.match,
      recent: read.form.recentRate == null ? undefined : 100 * read.form.recentRate,
      season: read.form.seasonRate == null ? undefined : 100 * read.form.seasonRate,
      read: v ? v.short : (read.form.status === 'thin_recent' ? 'thin recent'
        : read.form.status === 'thin_hr' ? 'thin HR'
        : read.form.status === 'no_hr' ? 'no HR' : '—'),
      window: read.laLo == null ? '' : `${Math.round(read.laLo)}–${Math.round(read.laHi)}°`,
      hr: hrScore(p),
      unrel: read.unreliable ? 1 : 0,
    }
  }), [pool, base, watchIds])

  // Chip counts come off the same `all` the table is built from, so a chip can
  // never promise a population the board does not then show.
  const tally = useMemo(() => {
    const t = { all: all.length }
    all.forEach((r) => { t[r._typeKey] = (t[r._typeKey] || 0) + 1 })
    return t
  }, [all])

  const rows = useMemo(() => {
    const q = query.toLowerCase().trim()
    return all
      .filter((r) => band === 'all' || r._typeKey === band)
      .filter((r) => !overFloor || r.n >= SHAPE_MIN_N)
      .filter((r) => !formOnly || r.match != null)
      .filter((r) => !q || `${r.name} ${r.team} ${r.opp} ${r.matchup}`.toLowerCase().includes(q))
  }, [all, band, overFloor, formOnly, query])

  if (!pool.length) return <Empty text="No players on this slate yet." />

  // ── THE TWO PUBLISHED-DATA GUARDS ─────────────────────────────────────────
  // The bot deploys from another repo on its own schedule, so the failure that
  // actually bites is a perfectly valid slate from a bot that predates these
  // fields. Without the first guard the board renders 266 hitters with an
  // empty mix, which reads as "nobody on this slate has a homer shape" — a
  // claim, and a false one. The second is deliberately separate: profiles and
  // the form read are two computations that shipped together but need not
  // arrive together, and a slate with one and not the other must lose the form
  // columns and SAY so rather than fill them with zeros.
  const hasShape = shapeDataPublished(pool)
  const hasForm = shapeFormPublished(pool)
  if (!hasShape) {
    return (
      <Empty text="Tonight's slate carries no homer-shape profiles — the bot has not published hr_shape_profile for this file. Nothing here is empty because these hitters have no shape; the numbers simply are not in the payload yet." />
    )
  }

  const claimed = all.filter((r) => r._typeColor).length
  const readable = all.filter((r) => r.match != null).length
  const chips = [
    ['all', `All ${tally.all}`, C.text2, 'Every hitter on tonight’s slate, whatever his sample'],
    ...BAND_KEYS.filter((k) => tally[k]).map((k) => [k, `${HR_BANDS[k].label} ${tally[k]}`, HR_BANDS[k].color, `${HR_BANDS[k].label} — ${HR_BANDS[k].blurb}`]),
    ...(tally.tied ? [['tied', `Tied ${tally.tied}`, C.blue, 'His top two bands are level on the same number of homers. Named as tied rather than broken by a rule — a tiebreak there would be inventing a lean out of a coin flip.']] : []),
    ...(tally.thin ? [['thin', `Too thin ${tally.thin}`, C.text3, `Under ${SHAPE_MIN_N} classified homers. Counts shown, no type claimed.`]] : []),
    ...(tally.unreliable ? [['unreliable', `Bot flagged ${tally.unreliable}`, C.red, 'hr_unreliable_shape_flag is set on these hitters. Counts shown, no type claimed at any sample size.']] : []),
    ...(tally.none ? [['none', `No tracked HR ${tally.none}`, C.text3, 'No homer of his has been classified into a band — an absence of a shape, not a shape.']] : []),
  ]

  const columns = [
    { key: 'watched', label: '☆', action: true, w: 30, mark: '★', markOff: '☆',
      titleOn: 'Remove from watchlist', titleOff: 'Add to watchlist', onAction: onWatch },
    { key: 'name', label: 'Batter', heat: false, w: 150, bold: true, sticky: true },
    { key: 'team', label: 'Tm', heat: false, w: 34, mono: true, dim: true },
    { key: 'opp', label: 'Opp', heat: false, w: 34, mono: true, dim: true },
    { key: 'matchup', label: 'Facing', heat: false, w: 116, dim: true,
      title: 'Tonight’s starter' },
    // ── HIS TYPE ────────────────────────────────────────────────────────────
    { key: 'type', label: 'His type', heat: false, w: 128, mono: true,
      title: 'His most common homer band — or the reason there isn’t one. Sorts alphabetically, which groups the board by type.',
      explain: `The band most of his homers fall in, claimed only at ${SHAPE_MIN_N}+ classified homers, only when his top two bands are not level, and only when the bot has not flagged his shape as unreliable. Below any of those bars the cell says WHY instead of showing a band — "too thin (2 HR)", "tied: Laser / Standard", "no tracked HR". Hover a cell for the count behind it.`,
      fmt: (v, r) => (
        <span title={r._typeWhy} style={{ cursor: 'default', color: r._typeColor || C.text3, fontWeight: r._typeColor ? 800 : 500 }}>{v}</span>
      ) },
    { key: 'n', label: 'n HR', w: 46, primary: true,
      title: 'Classified homers — the denominator under every share on this row',
      explain: `How many of his homers the bot could classify into a band. It is the ONLY denominator the mix has, so it is on screen in every row: a mix off 2 homers and a mix off 27 are not the same kind of fact. On the verified slate it runs 0 to 39, median 10. It is its own count and does not always match the slate’s season_hr column — only this number divides the mix.` },
    { key: 'mix', label: 'The mix', heat: false, w: 168,
      title: 'His homers by band. A proportion bar at 4+ homers; counts in words below that, because a bar off two homers draws a claim two homers cannot support.',
      explain: 'Segment width is his share of the band, the number printed inside is the count. Under the 4-homer floor there is no bar at all — just the counts, in words. Hover for every band spelled out as "6 of 14".',
      fmt: (v, r) => <MixCell read={r._read} /> },
    // The five bands as their own sortable columns: the bar is the glance, this
    // is the sort. "Who has the most no-doubters tonight" is one header click.
    ...BAND_COLS.map((b) => ({
      key: b.key, label: b.short, w: 44,
      title: `${b.label} homers — ${HR_BANDS[b.key].blurb}`,
      explain: `${b.label}: ${HR_BANDS[b.key].blurb} Counted, not rated — click to rank tonight’s slate by how many of this band each hitter has hit. The bands are percentile slices of one continuous distribution (wall-scraper under ${HR_CUTS.shortFt}ft, no-doubter ${HR_CUTS.longFt}ft+, laser under ${HR_CUTS.flatDeg}°, moonshot ${HR_CUTS.steepDeg}°+), not physical categories.`,
    })),
    // ── WHERE HE STANDS OUT ─────────────────────────────────────────────────
    { key: 'lean', label: 'Lean', heat: false, w: 96, dim: true,
      title: 'The band he is furthest OVER tonight’s pooled baseline on',
      explain: 'Plurality is a weak answer: 168 of the 222 hitters over the floor are plurality-standard, because standard is 46% of all homers. Lean asks the better question — which band is he most over the slate baseline on. Blank under the floor, and blank for bot-flagged hitters.' },
    { key: 'leanPP', label: 'Lean pp', w: 54, dp: 0,
      title: 'How far over the pooled slate share that band runs, in percentage points',
      explain: 'His share of that band minus the whole slate’s share of it, in percentage points. A hitter at +30 is genuinely that kind of bat; a hitter at +4 is a rounding error on a small sample. Read it next to n.',
      fmt: (v) => (Number.isFinite(Number(v)) ? pp(Number(v)) : '—') },
    // ── IS HE IN HIS OWN SHAPE RIGHT NOW ────────────────────────────────────
    ...(hasForm ? [
      { key: 'match', label: 'In-form', w: 58, dp: 0, primary: true,
        title: 'Recent minus season: the share of his hard-hit contact landing inside his OWN homer launch window. Positive = drifting toward the shape his homers take. A description, not a prediction.',
        explain: `personal_shape_match, published by the bot every night. Of his hard-hit balls (95+ mph, the exit velocity a homer basically requires), the share leaving the bat inside his own homer launch-angle window — last 8 game dates minus the season. Shown ONLY where the bot rated the reading 'ok'; the recent denominator is not published on the slate row, and 'ok' is the bot's statement that it holds at least 5 recent hard-hit balls. Beyond ±${(100 * SHAPE_FORM_EDGE).toFixed(0)} points the Read column calls it trending. NOBODY HAS GRADED whether this predicts a homer night — the bot archives it nightly so that can be tested later. Colour is direction, not quality.`,
        fmt: (v) => (Number.isFinite(Number(v)) ? pp(Number(v)) : '—') },
      { key: 'read', label: 'Read', heat: false, w: 84, mono: true,
        title: 'The in-form delta in words — or the reason there isn’t one',
        explain: 'The same three words the hitter’s own card uses, from the same threshold, so a board and a card four inches apart cannot disagree about whether he is trending. "thin recent" = his window is fine but there are too few recent hard-hit balls; "thin HR" = too few classified homers to build a window; "no HR" = none at all.',
        fmt: (v, r) => (
          <span title={r._verdict ? r._verdict.label : 'The bot did not rate this reading — no number is shown rather than a zero standing in for a missing one.'}
            style={{ cursor: 'default', color: r._verdict?.key === 'toward' ? C.green : r._verdict?.key === 'away' ? C.red : C.text3 }}>{v}</span>
        ) },
      { key: 'recent', label: 'Rec%', w: 48, dp: 0,
        title: 'Recent share of hard-hit contact inside his own homer window — the front half of the In-form delta',
        explain: 'The last 8 game dates. Published as a rate; its denominator is not on the slate row, which is why it is only shown where the bot rated the reading ‘ok’.' },
      { key: 'season', label: 'Szn%', w: 48, dp: 0,
        title: 'Season share of hard-hit contact inside his own homer window — the back half of the In-form delta',
        explain: 'Built on his whole log, so it survives a thin RECENT window: a hitter with too few recent hard-hit balls still gets this column, and gets no delta.' },
      { key: 'window', label: 'Window', heat: false, w: 66, mono: true, dim: true,
        title: 'His own homer launch-angle window — the median of his homers ±max(4°, half the IQR)',
        explain: 'The window the In-form delta is measured against, published by the bot as la_lo/la_hi. Showing the delta without the window it is a delta against would be asking the reader to take the comparison on trust.' },
    ] : []),
    // ── AND WHAT THE BOT THINKS OF HIM TONIGHT ──────────────────────────────
    { key: 'hr', label: 'HR scr', w: 50, dp: 1,
      title: 'Tonight’s HR score — the bot’s ranking, which contains none of this board’s numbers',
      explain: 'Here so shape can be read NEXT TO what the bot thinks, not folded into it. No shape number feeds any score on this site; the two columns are independent opinions and the point of putting them side by side is that you can see where they disagree.' },
    { key: 'unrel', label: '⚑', flag: true, mark: '⚑', w: 32,
      title: 'The bot set hr_unreliable_shape_flag on this hitter — counts shown, no type claimed',
      explain: 'A bot-side judgement this repo cannot re-derive. On the verified slate all 9 flagged hitters are low-launch ground-ball bats with a handful of homers. It is an independent veto, not a duplicate of the sample floor: 5 of the 9 clear the 4-homer bar and 3 of those would otherwise carry a live form reading.' },
  ]

  return (
    <div>
      {showTitle && (
        <PanelTitle
          title="Shape"
          sub="What KIND of homer each hitter hits — described, not predicted"
          right={<span style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT }}>{rows.length} shown</span>}
        />
      )}

      <div style={{
        fontSize: 10.5, color: C.text3, lineHeight: 1.6, margin: '6px 0 10px',
        borderLeft: `2px solid ${C.purple}`, paddingLeft: 10, maxWidth: 720,
      }}>
        {!showTitle && (
          <>
            <b style={{ color: C.text2, fontFamily: NUM_FONT }}>{rows.length} shown.</b>{' '}
            What <b style={{ color: C.text2 }}>kind</b> of homer each hitter hits —{' '}
            <b style={{ color: C.text2 }}>described, not predicted</b>.{' '}
          </>
        )}
        His homers sorted into the five bands, so two hitters can be compared instead of read one
        card at a time. <b style={{ color: C.text2 }}>{claimed}</b> of{' '}
        <b style={{ color: C.text2 }}>{all.length}</b> hitters have enough classified homers for a
        type to be claimed at all; the rest keep their row and their counts and are told apart by
        reason, not by a dash.{' '}
        {hasForm
          ? <>The in-form delta is live on <b style={{ color: C.text2 }}>{readable}</b> of them.{' '}</>
          : <><b style={{ color: C.text2 }}>The form columns are absent tonight</b> — this slate carries
            profiles but no readable personal_shape_* values, so they are dropped rather than filled
            with zeros.{' '}</>}
        <b style={{ color: C.text2 }}>Nothing here is a prediction.</b> Whether being in his own shape
        makes a homer more likely tonight has never been graded — the bot archives the number nightly
        so it can be, and until then this board describes contact and feeds no score.
      </div>

      {/* TONIGHT'S POOLED MIX — legend and baseline in one strip. The Lean
          column is measured in points over exactly these shares. */}
      <div style={{ fontSize: 10, color: C.text3, marginBottom: 5, fontFamily: NUM_FONT }}>
        Tonight&apos;s pooled baseline — <b style={{ color: C.text2 }}>{base.total}</b> classified homers
        from <b style={{ color: C.text2 }}>{base.hitters}</b> hitters, share then count:
      </div>
      <BaselineStrip base={base} />

      {/* ── THE FILTER ROW — "show me only the laser guys" ────────────────── */}
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
        {chips.map(([k, label, color, title]) => (
          <button key={k} onClick={() => setBand(k)} title={title} style={{
            padding: '4px 11px', borderRadius: 999, cursor: 'pointer', fontSize: 10,
            fontWeight: 800, fontFamily: NUM_FONT, whiteSpace: 'nowrap',
            border: `1px solid ${band === k ? color : C.border}`,
            background: band === k ? `${color}1e` : 'transparent',
            color: band === k ? color : C.text3,
          }}>{label}</button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
        <label title={`Drop everyone under ${SHAPE_MIN_N} classified homers — the hitters the board refuses to give a type.`}
          style={{ fontSize: 10, color: C.text3, display: 'inline-flex', gap: 5, alignItems: 'center', cursor: 'pointer' }}>
          <input type="checkbox" checked={overFloor} onChange={(e) => setOverFloor(e.target.checked)}
            style={{ accentColor: C.purple }} />
          only {SHAPE_MIN_N}+ classified homers
        </label>
        <label title="Drop everyone whose in-form delta the bot did not rate readable."
          style={{ fontSize: 10, color: C.text3, display: 'inline-flex', gap: 5, alignItems: 'center', cursor: 'pointer' }}>
          <input type="checkbox" checked={formOnly} onChange={(e) => setFormOnly(e.target.checked)}
            style={{ accentColor: C.purple }} />
          only a readable in-form delta
        </label>
        <input value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="name, team, opponent, pitcher"
          style={{ ...inputStyle(), maxWidth: 240, fontSize: 11, padding: '5px 10px' }} />
      </div>

      {!rows.length ? (
        <Empty text="Nobody matches these filters." />
      ) : (
        <DenseTable
          rows={rows}
          columns={columns}
          onRowClick={onPlayerClick}
          // n, not the form delta and not the HR score: the denominator leads,
          // so the hitters whose shape can actually be described sit at the
          // top and the 2-homer rows sink without being hidden. Every other
          // question is one header click away.
          initialSort="n"
          maxHeight={520}
          maxRows={300}
          // The floor and the bot's veto, as weight — a row whose mix the
          // board will not describe should not sit at the same visual weight
          // as one it will.
          //
          // Deliberately NOT `!r._typeColor`, which would have been the tidier
          // line: that set also contains the 24 TIED hitters, and a tied
          // hitter is not thin. He has a real sample, a real lean and often a
          // live form read — the only thing he lacks is a single winning band,
          // which the Type cell already says in words. Dimming him would file
          // "two things at once" under "not enough data".
          dimRow={(r) => r.n < SHAPE_MIN_N || !!r.unrel}
          caption={`Every hitter on tonight's slate by the KIND of homer he hits — the five bands from the Homer Ledger, counted off the bot's published hr_shape_profile. This board describes contact and predicts nothing: no shape number feeds any score here, and whether being "in his shape" makes a homer more likely tonight has never been graded. Sample rules, applied everywhere: a type is claimed only at ${SHAPE_MIN_N}+ classified homers, only when the top two bands are not level, and only when the bot has not flagged the hitter — dimmed rows are the ones that fail one of those, and they keep every count they have. n is the only denominator the mix has and is never off screen; shares never appear without it. The in-form delta shows only where the bot rated the reading 'ok', because the count of recent hard-hit balls behind it is not published on the slate row and 'ok' is the bot's statement that there are at least 5 — the 31 rows publishing a flat 0.0 are a serialiser writing null, not hitters sitting level with themselves. Lean is the answer to plurality being useless here: 168 of the 222 hitters over the floor are plurality-standard because standard is 46% of all homers, so Lean asks which band he is furthest over tonight's pooled baseline on instead. The bands themselves are percentile slices of one continuous distribution — wall-scraper under ${HR_CUTS.shortFt}ft, no-doubter ${HR_CUTS.longFt}ft+, laser under ${HR_CUTS.flatDeg}°, moonshot ${HR_CUTS.steepDeg}°+ — not physical categories.`}
        />
      )}
    </div>
  )
}
