// ── THE BOARD COLUMNS (2026-09-25) ──────────────────────────────────────────
//
// Donovan, with the CSV of the full board in hand: "add all the columns, even
// the ones not pictured, to every table on the site -- that's how I like all
// the site's tables formatted."
//
// So the column list and the row mapper that were private to Scoreboard.js
// (the every-hitter table on Live, now also The Board) live here, and every
// table whose rows are hitters on tonight's slate reads them. One list: a
// column added here appears on all of them; a column that only one table
// wants is a `columns` override, not a fork.
//
//   boardColumns({ onWatch, dhOn })  -> the column defs
//   boardRowContext(players, opts)   -> the slate-wide facts every row needs
//   boardRow(p, i, ctx)              -> one DenseTable row for slate row p
//   boardRows(players, ctx)          -> all of them
//
// Everything below the marker is the original Scoreboard code, moved, not
// rewritten; the commentary on each column is that column's history.
import {
  nameOf, teamOf, oppOf, n, clean,
  recent375, ihrVal,
  hrScore, hitScore, prodScore, tbScore, pitchMixScore, playerId, mlbId,
} from './player'
import { isAligned, hrRank } from './scoring'
import { designationOf, hitterRoleTitle, hitterLaneLabel, hitterLaneTitle, laneRanker } from './verdict'
import { hrOverlayRead } from './hrOverlay'
import { gameNumbers, gameNumOf } from './doubleheader'
import { kRiskScore, matchupAvg, rbiScore, runScore } from './scoring_additions'
import { hrShapeMeta } from './hrShape'
import { DIV_FIELD } from './scales'

/** Everything a row needs that is a fact about the WHOLE slate, computed once
 *  over the full players list (never the filtered one -- rank, doubleheader
 *  and lane percentiles are facts about tonight, not about the filter). */
export function boardRowContext(players, { watchIds = null } = {}) {
  const all = Array.isArray(players) ? players : []
  return {
    dh: gameNumbers(all),
    laneOf: laneRanker(all),
    slateSize: all.length,
    watchIds,
    rankOf: hrRank(all),
  }
}

export function boardRow(p, i, { dh, laneOf, slateSize, watchIds, rankOf }) {
  const hrOverlay = hrOverlayRead(p)
  return ({
      // The published board_rank first (the bot's number, the same one the
      // alerts print); the slate-wide hrRank map only for a payload that
      // predates it. A table fed one game's lineups passes rankOf: null and
      // shows a blank rather than a rank inside eighteen men.
      rank: (Number.isFinite(Number(p?.board_rank)) && Number(p.board_rank) > 0)
        ? Number(p.board_rank)
        : (rankOf ? (rankOf.get(mlbId(p)) ?? null) : null),
      // game_pk in the key: on a doubleheader one player_id is legitimately two
      // rows, and a duplicate React key drops one of them silently — which
      // would "fix" the complaint by deleting a game.
      _key: `${p?.player_id ?? nameOf(p)}-${p?.game_pk ?? ''}-${i}`,
      _raw: p,
      name: nameOf(p),
      team: teamOf(p),
      g: gameNumOf(p, dh),
      opp: oppOf(p),
      // THE LANE, NOT THE TIER, FOR AN UNDESIGNATED BAT (2026-08-23).
      // Donovan: "it seems everyone is contact on the role colume, need a more
      // diverse groupe of roles ... but prescion." Counted: final_hr_role has
      // four values and 74 of 106 hitters carry one of them, so shortRole()
      // printed "Contact" on seventy percent of the board. laneOf() asks the
      // question the column is for instead — which of his four market scores
      // sits highest WITHIN THE ROWS IN VIEW — and says so in upper case only
      // when he is in the top quarter of that lane. See lib/verdict.js.
      role: designationOf(p) || hitterLaneLabel(p, laneOf(p)),
      roleTitle: designationOf(p) ? hitterRoleTitle(p) : hitterLaneTitle(p, laneOf(p), slateSize),
      hrPct: hrOverlay.probability,
      hrFit: hrOverlay.passed,
      spot: p?.lineup_spot == null || p?.lineup_spot === '' ? null : n(p.lineup_spot, null),
      weak: p?.weak_spot_flag ? 1 : 0,
      aligned: isAligned(p) ? 1 : 0,
      edge: matchupEdge(p),
      hr: hrScore(p),
      dmg: n(p?.damage_conversion_score, 0),
      pmatch: n(p?.pitch_type_match_score, 0),
      hrr: prodScore(p),
      hit: hitScore(p),
      avg: n(p?.season_avg, 0),
      a5: n(p?.last5_avg, null),
      a10: n(p?.last10_avg, null),
      obp: n(p?.season_obp, 0),
      vsHand: matchupAvg(p) ?? 0,
      rbiScore: rbiScore(p),
      runScore: runScore(p),
      tb: tbScore(p),
      hrw: n(p?.hrw_score, 0),
      p3: n(p?.power3_score, 0),
      longest: n(p?.longest_hr_score, 0),
      pmix: pitchMixScore(p),
      d375: recent375(p),
      p375: n(p?.pitcher_375_allowed, 0),
      p400: n(p?.pitcher_400_allowed, 0),
      ihr: ihrVal(p),
      k: n(p?.season_k_rate, 0) * 100,
      hr9: n(p?.pitcher_hr9, 0),
      // null rather than 0 when the field is absent — a park factor of zero
      // isn't a thing, and a 0.00 in this column would read as "worst park on
      // the slate" instead of "not published".
      park: n(p?.park_hr_factor, 0) > 0 ? n(p?.park_hr_factor, 0) : null,
      kRisk: kRiskScore(p),
      // ── MORE STATS TO SORT BY (2026-08-22) ─────────────────────────────
      // Donovan: "I just wanted more stat columns added." Everything here is
      // already on the slate row and was going unread. Grouped the way he
      // asked for on the Games tab and applied here: recent form, the season
      // line, the split that matches tonight's arm, statcast, then the
      // pitcher. Nothing computed, nothing invented — where a field is not
      // published the cell is blank rather than zero-filled.
      l5hr: n(p?.last5_hr, null),
      l10hr: n(p?.last10_hr, null),
      l5h: n(p?.last5_hits, null),
      drought: n(p?.games_since_last_hr, null),
      sznHr: n(p?.season_hr, null),
      pa: n(p?.season_pa, null),
      iso: n(p?.season_iso, null),
      slg: n(p?.season_slg, null),
      hrPa: n(p?.hr_per_pa, null),
      bb: (() => { const v = n(p?.season_bb_rate, null); return v == null ? null : (v <= 1 ? v * 100 : v) })(),
      // The split that matches the hand tonight's starter actually throws —
      // same idea as the vs Hand average already on the board, for power.
      isoHand: (() => {
        const hand = String(p?.pitcher_hand || p?.pitcher_throws || '').toUpperCase()
        const v = hand.startsWith('L') ? n(p?.iso_vs_lhp, null) : n(p?.iso_vs_rhp, null)
        return v == null ? n(p?.season_iso, null) : v
      })(),
      ev: n(p?.recent_ev, null),
      brl: (() => { const v = n(p?.recent_barrel_rate, null); return v == null ? null : (v <= 1 ? v * 100 : v) })(),
      d350: (() => {
        const num = n(p?.recent_350_num, null); const den = n(p?.recent_350_den, 0)
        return num == null || !(den > 0) ? null : (100 * num) / den
      })(),
      pEra: n(p?.pitcher_era, null),
      pWhip: n(p?.pitcher_whip, null),
      pK9: n(p?.pitcher_k9, null),
      pHH: (() => { const v = n(p?.pitcher_hardhit_allowed, null); return v == null ? null : (v <= 1 ? v * 100 : v) })(),
      pFB: (() => { const v = n(p?.pitcher_fb_rate, null); return v == null ? null : (v <= 1 ? v * 100 : v) })(),
      pBrl: (() => { const v = n(p?.pitcher_barrel_allowed, null); return v == null ? null : (v <= 1 ? v * 100 : v) })(),
      pEV: n(p?.pitcher_ev_allowed, null),
      pSw: (() => { const v = n(p?.pitcher_swstr_pct, null); return v == null ? null : (v <= 1 ? v * 100 : v) })(),
      pPull: (() => { const v = n(p?.pitcher_pullair_allowed_pct, null); return v == null ? null : (v <= 1 ? v * 100 : v) })(),
      pL3Era: n(p?.pitcher_l3_era, null),
      pL3Whip: n(p?.pitcher_l3_whip, null),
      pL3Hr9: n(p?.pitcher_l3_hr9, null),
      watched: watchIds?.has(playerId(p)) ? 1 : 0,
    })
}

export function boardRows(players, ctx) {
  return (Array.isArray(players) ? players : []).map((p, i) => boardRow(p, i, ctx))
}

/** A table's own columns first, then every board column it does not already
 *  have (matched on key). The table keeps its lead and its own meaning for a
 *  shared key; the rest of the board follows. Pair with boardRow spread
 *  UNDER the table's own row fields: `{ ...boardRow(p, i, ctx), ...own }`. */
export function withBoardColumns(own, opts = {}) {
  const ownList = Array.isArray(own) ? own.filter(Boolean) : []
  const seen = new Set(ownList.map((c) => c.key))
  // No handler, no star column: an action column that does nothing is worse
  // than none (rule 25 -- silent failures).
  const rest = boardColumns(opts).filter((c) => !seen.has(c.key) && !(c.action && !opts.onWatch))
  return [...ownList, ...rest]
}

// ── moved from components/tabs/Scoreboard.js, unchanged below this line ──────

const matchupEdge = (p) => {
  const weak = clean(p?.pitcher_weak_side || p?.weak_side, '')
  const bats = clean(p?.bats || p?.handedness, '')
  if (!weak || !bats) return 0
  return (weak === 'LHB' && bats === 'L') || (weak === 'RHB' && bats === 'R') ? 1 : 0
}

// ── THE G COLUMN (2026-08-17) ────────────────────────────────────────────────
// Donovan: "names also duplicated idk whats thats about."
//
// They were not duplicated. On 08-17, STL @ CIN was a DOUBLEHEADER — two
// game_pks, 17:40 and 22:40 — so all 17 twice-listed player_ids were St. Louis
// and Cincinnati bats appearing once per game. Alec Burleson genuinely hits
// twice. Deduping would have deleted a real plate appearance and halved a
// team's presence on the board on precisely the day they play most.
//
// The reason it read as a bug is that the two rows were IDENTICAL on screen:
// this board has no first-pitch column, so nothing distinguished them. So the
// fix is a label, not a filter. Injected only when a matchup actually repeats —
// see lib/doubleheader.js, including why sorting on game_pk would have numbered
// this particular doubleheader backwards.
const DH_COLUMN = {
  key: 'g',
  label: 'G',
  heat: false,
  w: 28,
  mono: true,
  dim: true,
  fmt: (v) => (v ? `G${v}` : '—'),
  title: 'Which game of a doubleheader. G1 is the earlier first pitch. A hitter '
    + 'whose team plays twice appears once per game and both rows are real.',
}

// ── ANCHORS (2026-08-22) ────────────────────────────────────────────────────
//
// A batting average is not a magnitude; it is a distance from what everybody
// else does. Drawn on the sequential ramp against the slate's own min/max, a
// .251 hitter on a night of good bats came out black and a .251 hitter on a
// night of bad ones came out bright — the same number, two opposite readings,
// and neither of them the one that matters.
//
// TWO KINDS OF ANCHOR, AND THE DIFFERENCE IS NOT COSMETIC.
//
// LG holds real league marks — numbers I can defend independently of this
// payload, for stats whose definition is standard (AVG, OBP, ISO, SLG, ERA,
// WHIP, K/9, K%, BB%, HR/9, hard-hit, exit velocity, swinging strikes).
//
// TYPICAL holds the observed centre of a PUBLISHED FIELD whose denominator the
// payload does not state, so the textbook league figure does not apply to it.
// Measured across the live slate on 2026-08-22 and recorded with what was seen,
// because an anchor nobody can check is worse than no anchor:
//
//   pitcher_barrel_allowed       median 3.8   (range 0.0–8.4)   textbook ~8%
//   pitcher_fb_rate              median 26.0  (range 19.4–47.3) textbook ~36%
//   pitcher_pullair_allowed_pct  median 25.5  (range 17.3–33.3)
//   recent_barrel_rate (batter)  median 4.2   (range 0–28.6)    textbook ~8%
//
// Three of those are half the textbook value, which means the field is not
// counting what the textbook counts — a different denominator, almost
// certainly per plate appearance rather than per batted ball. Anchoring them
// at 8% would have painted almost the whole column cool and called every arm
// on the slate stingy. The tooltips on those columns say "typical", not
// "league", so the claim on screen matches the claim in the code.
//
// Recheck these when the bot's definitions change; nothing else here moves.
/** League marks the diverging columns are drawn against. Shared with Gone Yard. */
export const LG = {
  avg: 0.245,
  obp: 0.315,
  iso: 0.160,      // slugging minus average
  slg: 0.405,
  hrPa: 0.032,     // homers per plate appearance
  bbRate: 8.5,     // %
  ev: 89.0,        // average exit velocity, mph
  kRate: 22.0,     // %
  hr9: 1.15,       // homers allowed per nine
  era: 4.10,
  whip: 1.28,      // walks + hits per inning
  hardHit: 39.0,   // % of batted balls hit hard
  evAllowed: 89.0,
  swStr: 11.0,     // % swinging strikes
  k9: 8.60,        // strikeouts per nine
  park: 1.00,      // a neutral building
}

// ── WHICH WAY IS WARM ───────────────────────────────────────────────────────
//
// One convention across the site: WARM IS GOOD FOR THE BAT. A diverging column
// sets `invert: true` ONLY when the good-for-the-bat side is the LOW side.
//
//   no invert   P ERA, P WHIP, P HR/9, P HH%, P FB%, P Brl%, P EV ag,
//               P PullAir% — a leaky arm is a hitter's friend, so above the
//               mark is warm.
//   invert      K% (his own), K risk, P K/9, P SwStr% — missing bats is what
//               stops a homer, so above the mark is cool.
//
// THE FIRST VERSION OF THIS PASS HAD THE WHOLE PITCHER BLOCK BACKWARDS, and
// only a screenshot caught it: sorting by P WHIP put a 1.48 arm — twenty
// points worse than league, exactly the arm you want — at the top of the board
// in cool blue, while the tooltip under it read "warm means he puts men on".
// The sort was right and the colour argued with it. Neither the build nor any
// of the three checkers can see that; it is only visible rendered.

// Observed centres of published fields whose denominator is not stated. See
// the note above — these are labelled "typical" on screen, never "league".
export const TYPICAL = {
  barrel: 4.2,     // recent_barrel_rate, batter side
  pBarrel: 3.8,    // pitcher_barrel_allowed
  pFbRate: 26.0,   // pitcher_fb_rate
  pPullAir: 25.5,  // pitcher_pullair_allowed_pct
}

// ── THE RUNDOWN'S COLOUR (2026-08-22, pass 2) ───────────────────────────────
//
// Donovan: "Rundown is the most-used page. Make it visually better."
//
// Thirty numeric columns, every one of them heat-painted against its own
// min/max. On the page you open first. The problem is not that thirty columns
// is too many — you sort by all of them, which is the point of the page — it is
// that thirty columns coloured at once means colour has stopped saying
// anything except "there is a number here".
//
// So the board keeps every column and every value, and the colour goes onto
// the three questions the numbers actually answer:
//
//   SEQUENTIAL, on a stated 0-100 — the model scores. Their header now says
//     /100, so a score can never be misread as a percentage.
//   DIVERGING, against a league mark — AVG, OBP, vs Hand, K%, the arm's HR/9
//     and the park factor. Every one of those is a distance from a normal, and
//     was being drawn as a magnitude.
//   PLAIN — counts (375+, P375, P400) and IHR. A count has no ceiling and no
//     midpoint; painting one is decoration.
//
// Everything else follows the sort. Nothing was removed.
export const boardColumns = ({ onWatch = null, dhOn = false } = {}) => [
  { key: 'watched', label: '☆', action: true, w: 30, mark: '★', markOff: '☆',
    titleOn: 'Remove from watchlist', titleOff: 'Add to watchlist', onAction: onWatch },
  // THE BOARD, IN ORDER (2026-09-25). Donovan: "there is no dedicated place
  // to look at the boards at every single one in order." This table already
  // listed every hitter on the slate; it had no rank column and sorted on
  // hr_score. # is the board rank -- the same number the HR board's # column
  // and the homer alert's "#N on the board" print (lib/boardOrder.js) --
  // computed over the WHOLE slate before any filter, so a filtered view
  // still shows true positions. The table opens sorted on it, #1 first.
  { key: 'rank',    label: '#',      heat: false, w: 40, mono: true, bold: true,
    fmt: (v) => (v == null ? '—' : `#${v}`),
    title: 'His position on tonight\u2019s board, #1 first, over the whole slate \u2014 the HR score, season home runs and season exit velocity averaged. The same number the HR board and the homer alerts use. Filtering hides rows; it never renumbers them.' },
  { key: 'name',    label: 'Player', heat: false, w: 168, bold: true, sticky: true },
  { key: 'team',    label: 'Tm',     heat: false, w: 34, mono: true, dim: true },
  ...(dhOn ? [DH_COLUMN] : []),
  { key: 'opp',     label: 'Opp',    heat: false, w: 34, mono: true, dim: true },
  { key: 'role',    label: 'Role',   heat: false, w: 158, dim: true, titleKey: 'roleTitle',
    title: 'The hitter archetype comes first; the grading market stays in parentheses. Official picks settle on that market. Other rows show their strongest profile lane, not an official pick.' },
  { key: 'hrPct', label: 'HR%', w: 48, dp: 1, domain: [0, 35], primary: true,
    title: 'His small-sample-shrunk season-derived chance of 1+ HR in this game. This is a probability; HR score is not.' },
  { key: 'hrFit', label: 'Power', w: 48, dp: 0, domain: [0, 2], fmt: (v) => `${Number(v).toFixed(0)}/2`,
    title: 'Current HR Overlay progress: Air% >50 and Avg EV >87. The full 2/2 gate went 23/130 (17.7%) versus 8.0% outside it in the newest clean locked slice.' },
  { key: 'spot',    label: 'Spot',   heat: false, w: 40, mono: true, dim: true,
    fmt: (v) => (v == null ? '—' : String(v)) },
  { key: 'weak',    label: '★',      flag: true, mark: '★', w: 32 },
  { key: 'aligned', label: '◆',      flag: true, mark: '◆', w: 32 },
  { key: 'edge',    label: '▲',      flag: true, mark: '▲', w: 32 },

// ── WHY EVERY SCORE COLUMN DIVERGES AGAINST TONIGHT'S FIELD ─────────────────
//
// Donovan, 2026-08-22, pointing at the AVG column: make that the site's
// colour scheme, put it on all the other scoring, and show the arrows on the
// scoring too "when it's valid."
//
// AVG could diverge because it has a stated zero — the league mark. A 0-100
// model score has no league mark and never will; the only honest zero it has
// is the middle of the slate you are actually choosing from tonight. That is
// what `anchor: DIV_FIELD` resolves to, from the rows on screen, and it is
// still not a probability: it says "above the middle of tonight's board",
// which is a comparison, not a claim about how often the ball leaves.
//
// `domain` stays declared on every one of them. It is the fallback: when the
// field is too small or too flat to anchor honestly (fewer than eight rows, a
// dead spread), lib/scales.js hands back null, the column paints its plain
// sequential fill and NO ARROW IS DRAWN. That is the "when it's valid".
//
// The arrow always points the way the number went. `invert` flips which end
// is warm, never the arrow — see the WHICH WAY IS WARM block below.
  // The board's lead. `primary` keeps it lit whatever you sort by, because
  // "how does this hitter's HR score compare" is the question the page is for
  // and losing it while you sort by something else would cost the through-line.
  { key: 'hr',      label: 'HR',     w: 48, dp: 1, scale: 'div', anchor: DIV_FIELD, domain: [0, 100], primary: true },
  { key: 'dmg',     label: 'Damage', w: 54, dp: 1, scale: 'div', anchor: DIV_FIELD, domain: [0, 100] },
  // NOT A 0-100 SCORE, and it was sitting between six that are. Measured on
  // the live slate 2026-08-22: pitch_type_match_score runs 0 to 120 with a
  // MEDIAN OF ZERO — 25 of 269 rows clear 100 outright. Drawn against [0,100]
  // it would clip a fifth of the column at full brightness and read as "these
  // are maxed", and drawn against the slate min/max it would make the median
  // hitter's ZERO look like a low score rather than an absence. So: its own
  // stated domain, its own /120 in the header, and the tooltip says the zero
  // out loud.
  { key: 'pmatch',  label: 'PMatch', w: 58, dp: 1, scale: 'div', anchor: DIV_FIELD, domain: [0, 120],
    // A zero here is an ABSENCE — no pitch match was found — not the worst
    // match on the board, and the median hitter has one. Painted, it turned
    // half the column into a wall of near-black that read as failure.
    blankWhen: (v) => !(v > 0),
    fmt: (v) => (Number(v) > 0 ? Number(v).toFixed(1) : '—'),
    title: 'Pitch-type match: how well tonight’s starter’s mix lines up with what this hitter punishes. Runs 0–120, not 0–100. A dash means no match was found — which is most of the slate — not a bad match.' },
  { key: 'hrr',     label: 'HRR',    w: 48, dp: 1, scale: 'div', anchor: DIV_FIELD, domain: [0, 100] },
  { key: 'hit',     label: 'Hit',    w: 48, dp: 1, scale: 'div', anchor: DIV_FIELD, domain: [0, 100] },
  // ── SPLITS & AVERAGES (2026-08-21, Donovan: "stats like the batter splits
  // and avgs... I like all those stats to sort by") ─────────────────────────
  // The board had fifteen columns of HR-family scores and not one plain
  // batting average — the raw rate every one of those scores is trying to
  // predict never got its own sortable column. AVG and OBP are season rates,
  // already on every slate row. vs Hand resolves to a real matchup number —
  // the hitter's own average against LHP or RHP, picked by the hand tonight's
  // actual starter throws (lib/scoring_additions.js matchupAvg) — instead of
  // a generic split pair nobody's chosen between.
  { key: 'avg',     label: 'AVG',    w: 50, dp: 3, scale: 'div', anchor: LG.avg, ceiling: 0.080,
    anchorLabel: `league ${LG.avg.toFixed(3).replace(/^0/, '')}`,
    title: `Season batting average, against a league mark of ${LG.avg.toFixed(3).replace(/^0/, '')}. ▲ above it, ▼ below, blank when he is league-average — which is a fact about him, not a finding.` },
  // L5 / L10 AVG (2026-09-06) -- Donovan: "we need like last 5 BA and last
  // 10 BA, I like those stats, we need those across the board." Same fields
  // the game lineup table reads (last5_avg / last10_avg), printed plain.
  { key: 'a5',      label: 'L5 AVG',  w: 54, heat: false, mono: true, fmt: (v) => (v == null ? '—' : Number(v).toFixed(3).replace(/^0/, '')),
    title: 'Batting average over his last five games' },
  { key: 'a10',     label: 'L10 AVG', w: 58, heat: false, mono: true, fmt: (v) => (v == null ? '—' : Number(v).toFixed(3).replace(/^0/, '')),
    title: 'Batting average over his last ten games' },
  { key: 'obp',     label: 'OBP',    w: 50, dp: 3, scale: 'div', anchor: LG.obp, ceiling: 0.080,
    anchorLabel: `league ${LG.obp.toFixed(3).replace(/^0/, '')}`,
    title: `Season on-base percentage, against a league mark of ${LG.obp.toFixed(3).replace(/^0/, '')}.` },
  { key: 'vsHand',  label: 'vs Hand', w: 54, dp: 3, scale: 'div', anchor: LG.avg, ceiling: 0.080,
    anchorLabel: `league ${LG.avg.toFixed(3).replace(/^0/, '')}`,
    title: "The hitter's own average against the hand tonight's starter actually throws (avg_vs_lhp or avg_vs_rhp), drawn against the same league mark as AVG so the two columns can be read side by side. Falls back to season AVG when that split or the pitcher's hand is missing." },
  // RBI / RUN SCORE (same request, "what do you think of player run and rbi
  // scoring same with hit scoring"). Composites, not bot fields — same
  // "not calibrated" status as K risk below: a transparent blend of
  // published rates (opportunity × ability × tonight's matchup × recent
  // form), not yet walk-forward tested against the graded archive's own
  // actual_rbi/actual_runs. See lib/scoring_additions.js for the weights.
  { key: 'rbiScore', label: 'RBI',   w: 48, dp: 1, scale: 'div', anchor: DIV_FIELD, domain: [0, 100],
    title: 'A composite RBI-production read: season RBI rate, lineup spot (peaks at the 4-hole), tonight\'s matchup average, and recent RBI form. Not a bot field, not calibrated — a transparent blend, same caveat as K risk.' },
  { key: 'runScore', label: 'Run',   w: 48, dp: 1, scale: 'div', anchor: DIV_FIELD, domain: [0, 100],
    title: 'A composite run-production read: season run rate, lineup spot (peaks at the 1-2 hole), season OBP, and recent run form. Not a bot field, not calibrated — a transparent blend, same caveat as K risk.' },
  { key: 'tb',      label: 'TB',     w: 48, dp: 1, scale: 'div', anchor: DIV_FIELD, domain: [0, 100] },
  { key: 'hrw',     label: 'HRW',    w: 48, dp: 1, scale: 'div', anchor: DIV_FIELD, domain: [0, 100],
    title: 'The HR-window score. The 🌋 🚀 ⚡ 🌤️ 🧊 band on a hitter card is this number — see lib/hrwBand.js.' },
  // Due -> Power-3 (2026-09-06). The due score measured backwards in the homer
  // night audit; Power-3 (season HR/BBE + avg EV + max EV, ranked on the
  // slate) is the signal that held on 150 of 155 nights. Drought stays as its
  // own column further right.
  { key: 'p3',      label: 'Power-3', w: 54, dp: 0, scale: 'div', anchor: DIV_FIELD, domain: [0, 100],
    title: 'Season power, ranked on tonight\'s slate: mean of his HR-per-ball-in-play, average EV and max EV ranks. The top ten homer 21% of the time.' },
  { key: 'longest', label: 'Long',   w: 48, dp: 1, scale: 'div', anchor: DIV_FIELD, domain: [0, 100] },
  { key: 'pmix',    label: 'PMix',   w: 48, dp: 1, scale: 'div', anchor: DIV_FIELD, domain: [0, 100] },
  // Counts. No ceiling, no midpoint — a number, drawn as a number.
  { key: 'd375',    label: '375+',   w: 42,
    title: 'Count of 375ft+ batted balls in his recent tracked window. A count, so it prints plain — colour follows it only when you sort by it.' },
  { key: 'p375',    label: 'P375 ag', w: 50,
    title: 'Balls of 375ft+ this pitcher has allowed' },
  { key: 'p400',    label: 'P400 ag', w: 50,
    title: 'Balls of 400ft+ this pitcher has allowed' },
  { key: 'ihr',     label: 'IHR',    w: 46, dp: 3,
    title: 'Ideal HR contact rate — the EV/launch window that produces homers.' },
  // A high strikeout rate is bad for the hitter, so this column runs the other
  // way. Left alone, the most strikeout-prone bats on the slate glow brightest.
  // K% was `invert: true` on the sequential ramp, which is a diverging idea
  // wearing a sequential coat: the reason to invert is that there IS a normal
  // and being above it is bad. So say so — league K%, ▲ worse for the bat.
  { key: 'k',       label: 'K%',     w: 46, dp: 1, scale: 'div', anchor: LG.kRate, ceiling: 10, invert: true,
    anchorLabel: `league ${LG.kRate.toFixed(1)}%`,
    title: `Season strikeout rate against a league mark of ${LG.kRate.toFixed(1)}%. Inverted — cool is good for the bat, because striking out more than league is the bad side of this line.` },
  { key: 'kRisk',  label: 'K risk', w: 54, dp: 0, invert: true, scale: 'div', anchor: DIV_FIELD, domain: [0, 100],
    title: 'Strikeout risk: hitter K% 40%, pitcher K% 25%, SwStr 20%, putaway 15%. Inverted — low is good for the bat. Composite, not a bot field, and not calibrated: the graded archive has no strikeout outcome to check it against.' },
  { key: 'hr9',     label: 'P HR/9', w: 50, dp: 2, scale: 'div', anchor: LG.hr9, ceiling: 0.80,
    anchorLabel: `league ${LG.hr9.toFixed(2)}`,
    title: `Homers allowed per nine by tonight's starter, against a league mark of ${LG.hr9.toFixed(2)}. ▲ he gives up more than league — good for the bat.` },
  // PARK (2026-08-09). The one piece of tonight's context this table never
  // carried. The Park board ranks buildings and every board on the site talks
  // about carry, but the sheet with all 268 hitters on it had no way to ask
  // "who's in a launch pad tonight" — you had to read the park board, memorise
  // the venues, then come back and scan by opponent. It's park_hr_factor, the
  // same field the park board ranks on, already stamped on every slate row.
  { key: 'park',    label: 'Park',   w: 50, dp: 2, scale: 'div', anchor: LG.park, ceiling: 0.25,
    anchorLabel: '1.00 (a neutral building)',
    fmt: (v) => (v == null || !Number.isFinite(Number(v)) ? '—' : `×${Number(v).toFixed(2)}`),
    title: "The bot's park HR factor for tonight's building. 1.00 is neutral, ×1.10 means the park adds about 10% of home-run rate. Bright is hitter-friendly, same as every other column. Park only — the weather adjustment lives on the Park board, not in this number. A dash means no factor was published for that game." },

  // ══ MORE STATS (2026-08-22) ══════════════════════════════════════════════
  //
  // Donovan: "I just wanted more stat columns added."
  //
  // Grouped the way he asked for on the Games tab — recent form, season line,
  // the split that matches tonight's arm, statcast, then the pitcher — and
  // every one of them sortable, which is the point ("I like all those stats
  // to sort by"). All published on the slate row already.
  //
  // They print PLAIN and light up when you sort by them. The ones carrying a
  // `div` scale are the ones with a real league mark behind them, so sorting
  // by P WHIP tells you not just the order but which side of average each arm
  // is on. Counts have no league mark and no midpoint, so they stay numbers.

  // ── recent form ──────────────────────────────────────────────────────────
  { key: 'l5hr',   label: 'L5 HR',   w: 46,
    title: 'Home runs in his last five games.' },
  { key: 'l10hr',  label: 'L10 HR',  w: 50,
    title: 'Home runs in his last ten games.' },
  { key: 'l5h',    label: 'L5 H',    w: 44,
    title: 'Hits in his last five games.' },
  { key: 'drought', label: 'Drought', w: 54,
    title: 'Games since his last home run. Read it next to HR/PA — a long drought on a bat with no power is not a drought, it is who he is.' },

  // ── the season line ──────────────────────────────────────────────────────
  { key: 'sznHr',  label: 'Szn HR',  w: 52,
    title: 'Home runs this season.' },
  { key: 'pa',     label: 'PA',      w: 44,
    title: 'Season plate appearances — the denominator under HR/PA, ISO and SLG.' },
  { key: 'iso',    label: 'ISO',     w: 48, dp: 3, scale: 'div', anchor: LG.iso, ceiling: 0.100,
    anchorLabel: `league ${LG.iso.toFixed(3).replace(/^0/, '')}`,
    title: `Isolated power — slugging minus average, against a league mark of ${LG.iso.toFixed(3).replace(/^0/, '')}. The archive's strongest single HR predictor: sub-.130 bats homered 8.2% of the time, .230+ homered 22.2%.` },
  { key: 'slg',    label: 'SLG',     w: 48, dp: 3, scale: 'div', anchor: LG.slg, ceiling: 0.130,
    anchorLabel: `league ${LG.slg.toFixed(3).replace(/^0/, '')}`,
    title: `Season slugging, against a league mark of ${LG.slg.toFixed(3).replace(/^0/, '')}.` },
  { key: 'hrPa',   label: 'HR/PA',   w: 52, dp: 3, scale: 'div', anchor: LG.hrPa, ceiling: 0.030,
    anchorLabel: `league ${LG.hrPa.toFixed(3).replace(/^0/, '')}`,
    title: `Home runs per plate appearance — his own rate, against a league mark of ${LG.hrPa.toFixed(3).replace(/^0/, '')}. This is a measured frequency; its denominator is the PA column.` },
  { key: 'bb',     label: 'BB%',     w: 46, dp: 1, scale: 'div', anchor: LG.bbRate, ceiling: 5,
    anchorLabel: `league ${LG.bbRate.toFixed(1)}%`,
    title: `Walk rate, against a league mark of ${LG.bbRate.toFixed(1)}%. High walks means fewer swings, which cuts both ways on a homer board.` },

  // ── the split that matches tonight's arm ─────────────────────────────────
  { key: 'isoHand', label: 'ISO vs hand', w: 64, dp: 3, scale: 'div', anchor: LG.iso, ceiling: 0.100,
    anchorLabel: `league ${LG.iso.toFixed(3).replace(/^0/, '')}`,
    title: "His isolated power against the hand tonight's starter actually throws (iso_vs_lhp or iso_vs_rhp). Falls back to season ISO when the split or the pitcher's hand is missing — the power twin of the vs Hand column." },

  // ── statcast ─────────────────────────────────────────────────────────────
  { key: 'ev',     label: 'EV',      w: 46, dp: 1, scale: 'div', anchor: LG.ev, ceiling: 4,
    anchorLabel: `league ${LG.ev.toFixed(1)}`,
    title: `Recent average exit velocity, against a league mark of ${LG.ev.toFixed(1)} mph.` },
  { key: 'brl',    label: 'Brl%',    w: 48, dp: 1, scale: 'div', anchor: TYPICAL.barrel, ceiling: 6,
    anchorLabel: `typical ${TYPICAL.barrel.toFixed(1)}%`,
    title: `Recent barrel rate, against a TYPICAL ${TYPICAL.barrel.toFixed(1)}% — the middle of what this field actually publishes, not the textbook 8% barrel rate, because the payload does not state this one's denominator. Blank where the bot has not tracked enough batted balls to publish one.` },
  { key: 'd350',   label: '350+%',   w: 52, dp: 0,
    title: 'Share of his tracked batted balls travelling 350+ ft. A rate, so it survives a small sample better than a raw count — the denominator is recent_350_den.' },

  // ── the arm ──────────────────────────────────────────────────────────────
  { key: 'pEra',   label: 'P ERA',   w: 50, dp: 2, scale: 'div', anchor: LG.era, ceiling: 2,
    anchorLabel: `league ${LG.era.toFixed(2)}`,
    title: `Tonight's starter's earned run average, against a league mark of ${LG.era.toFixed(2)}. Warm is the arm that gives runs up, which is the good side for the bat.` },
  { key: 'pWhip',  label: 'P WHIP',  w: 54, dp: 2, scale: 'div', anchor: LG.whip, ceiling: 0.35,
    anchorLabel: `league ${LG.whip.toFixed(2)}`,
    title: `Walks and hits per inning allowed, against a league mark of ${LG.whip.toFixed(2)}. Warm means he puts men on.` },
  { key: 'pK9',    label: 'P K/9',   w: 50, dp: 2, scale: 'div', anchor: LG.k9, ceiling: 3, invert: true,
    anchorLabel: `league ${LG.k9.toFixed(2)}`,
    title: `Strikeouts per nine, against a league mark of ${LG.k9.toFixed(2)}. Inverted, so cool is the dangerous arm: missing bats is what stops a homer.` },
  { key: 'pHH',    label: 'P HH%',   w: 52, dp: 1, scale: 'div', anchor: LG.hardHit, ceiling: 12,
    anchorLabel: `league ${LG.hardHit.toFixed(1)}%`,
    title: `Hard-hit rate he allows, against a league mark of ${LG.hardHit.toFixed(1)}%. Warm is the arm that gets squared up.` },
  { key: 'pFB',    label: 'P FB%',   w: 50, dp: 1, scale: 'div', anchor: TYPICAL.pFbRate, ceiling: 9,
    anchorLabel: `typical ${TYPICAL.pFbRate.toFixed(1)}%`,
    title: `Fly balls he allows, against a TYPICAL ${TYPICAL.pFbRate.toFixed(1)}% — measured off this field rather than assumed. Warm is the arm that supplies air, and distance needs air under it.` },
  { key: 'pBrl',   label: 'P Brl%',  w: 52, dp: 1, scale: 'div', anchor: TYPICAL.pBarrel, ceiling: 4,
    anchorLabel: `typical ${TYPICAL.pBarrel.toFixed(1)}%`,
    title: `Barrel rate he allows, against a TYPICAL ${TYPICAL.pBarrel.toFixed(1)}% — the middle of tonight's thirty starters, not the textbook 8%, because this field's denominator is not stated. Warm is the arm that gives up barrels, which is the contact that actually leaves.` },
  { key: 'pEV',    label: 'P EV ag', w: 54, dp: 1, scale: 'div', anchor: LG.evAllowed, ceiling: 4,
    anchorLabel: `league ${LG.evAllowed.toFixed(1)}`,
    title: `Average exit velocity he gives up, against a league mark of ${LG.evAllowed.toFixed(1)} mph. Warm is the arm hit hardest.` },
  { key: 'pSw',    label: 'P SwStr%', w: 58, dp: 1, scale: 'div', anchor: LG.swStr, ceiling: 5, invert: true,
    anchorLabel: `league ${LG.swStr.toFixed(1)}%`,
    title: `Swinging-strike rate, against a league mark of ${LG.swStr.toFixed(1)}%. Inverted, so cool is the dangerous arm — same direction as K/9.` },
  { key: 'pPull',  label: 'P PullAir%', w: 66, dp: 1, scale: 'div', anchor: TYPICAL.pPullAir, ceiling: 7,
    anchorLabel: `typical ${TYPICAL.pPullAir.toFixed(1)}%`,
    title: `How often he concedes pulled air contact — the shortest route over a fence — against a TYPICAL ${TYPICAL.pPullAir.toFixed(1)}%. Warm is the arm that concedes it.` },
  { key: 'pL3Era', label: 'P L3 ERA', w: 58, dp: 2, scale: 'div', anchor: LG.era, ceiling: 2,
    anchorLabel: `league ${LG.era.toFixed(2)}`,
    blankWhen: (v) => !(v > 0), fmt: (v) => (Number(v) > 0 ? Number(v).toFixed(2) : '—'),
    title: 'ERA over his last three starts. Read against the season column beside it — a gap either way is the trend.' },
  { key: 'pL3Whip', label: 'P L3 WHIP', w: 62, dp: 2, scale: 'div', anchor: LG.whip, ceiling: 0.35,
    anchorLabel: `league ${LG.whip.toFixed(2)}`,
    blankWhen: (v) => !(v > 0), fmt: (v) => (Number(v) > 0 ? Number(v).toFixed(2) : '—'),
    title: 'WHIP over his last three starts. A 0.00 is a gap in the feed, not a perfect run, so it blanks.' },
  { key: 'pL3Hr9', label: 'P L3 HR/9', w: 62, dp: 2, scale: 'div', anchor: LG.hr9, ceiling: 0.80,
    anchorLabel: `league ${LG.hr9.toFixed(2)}`,
    title: 'Homers per nine over his last three starts, against the same league mark as P HR/9. Where it runs above the season figure, the arm is trending into trouble.' },
]
