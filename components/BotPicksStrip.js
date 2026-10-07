'use client'
import { useMemo } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import {
  clean, nameOf, teamOf, hrScore, hitScore, prodScore, tbScore, PLATE_BAR,
} from '../lib/player'
import HeadlinePicks from './headline/HeadlinePicks'
import { rankBuckets, fourGrade } from '../lib/mlbFour'
import { playerHref } from '../lib/routes'
import PlayerFace from './PlayerFace'
import { reasonContext, boardReasonFor, reasonLines } from '../lib/mlb/boardReason'

// THE FOUR — the bot's own headline section, rebuilt on the site.
//
// This is not an invention. `mlb_breakdown_today.txt` prints a block called
// "🎯 THE FOUR" directly under the slate summary, and it is exactly one pick per
// category with its score, its last-five line and the arm it faces:
//
//   🧨 HR       Esmerlyn Valdez (PIT) ⭐   89.7   L5 3H/1HR/1XBH · vs Merrill Kelly
//   💠 HIT      CJ Abrams (WSH) ⭐         91.4   L5 14H/5HR/7XBH · vs Max Scherzer
//   🏁 HRR      Jeremy Peña (HOU)          83.8   L5 12H/4HR/4XBH · vs Walbert Ureña
//   ⚾ CONTACT  James Wood (WSH) ⭐         76.9   L5 6H/2HR/4XBH · vs Max Scherzer
//
// THREE per category: #1 featured with full detail, #2 and #3 as compact rows
// under a divider. Two reasons this beats one-per-bucket. The 39-day archive
// shows the scores separate quartiles, not neighbours — #1 vs #2 is close to
// a coin flip, so one name implied precision the data doesn't support. And a
// single name per bucket dies the moment that hitter is scratched. Three is
// still a decision, not a list.
//
// The category is `game_pick_role`, which tags 105 of 268 hitters: TOP 15,
// HR 15, HRR 30, HIT 30, CONTACT 15. Inside each, ranking is by the highest
// score ON THAT CATEGORY'S OWN SCALE — HR score for the HR picks, hit score
// for the hit picks, and so on. Ranking them all by HR score would just hand
// you the biggest power bats and defeat the split.
//
// WHERE IT LIVES. Top of Scoreboard, the landing tab — not the sticky header.
// The header already carries the projection, the live tracker and three tiles;
// four more would push it to two rows on a laptop and three on a phone, and a
// sticky bar eating a third of the viewport stops being navigation. This also
// doesn't change minute to minute — it's fixed when the slate builds — so it
// has no reason to follow you down the page.

// ── the stat line, per category ──────────────────────────────────────────────
// 2026-08-09, Donovan: "make sure the stats are relevant to each category."
//
// He was right, and the screenshot made it obvious: all four cards printed the
// SAME line — `L5 9H/2HR/2XBH`. A card headed "Runs + RBI" was showing you
// homers, and a card headed "Total bases" was showing you singles. The line
// was describing the hitter in general instead of describing the reason he is
// in THIS bucket, which is the one job it has.
//
// So each category now reads its own evidence, form first and a season anchor
// behind it, because five games is a small window and the reader deserves to
// know whether the hot line is a blip or the player:
//
//   HR       L5 3HR · 8.3% barrel · .245 ISO     did he hit them, can he hit them
//   HIT      L5 9H · .310 · .274 szn             hits, and whether that's normal
//   HRR      L5 4R/6RBI · 61R/74RBI szn          the actual scoring counters
//   CONTACT  L5 9H/2XBH · .488 SLG               bases, not just hit-or-not
//
// FIELD VERIFICATION (verify-first). Every key was read out of the live
// today_slim.json before this was written: last5_hits, last5_hr, last5_xbh,
// last5_runs, last5_rbi, last5_avg, season_avg, season_slg, season_iso,
// season_runs, season_rbi and l20pa_barrel_rate all ship on every hitter row.
//
// There is deliberately NO total-bases number on the CONTACT card even though
// that is the market's name. The payload publishes hits and XBH but not
// doubles/triples separately, so TB cannot be computed exactly — only guessed.
// H and XBH are the two real numbers the guess would have been made from, so
// they're what gets printed. Slugging carries the season side.
//
// Anything missing renders nothing. No zero-filler, no em-dashes.
const iso3 = (v) => (v == null ? null : v.toFixed(3).replace(/^0/, ''))
const numOrNull = (v) => (Number.isFinite(Number(v)) ? Number(v) : null)

function statLine(p, role) {
  const g = (k) => numOrNull(p?.[k])
  const parts = []
  const push = (t) => { if (t) parts.push(t) }

  if (role === 'HR') {
    const hr = g('last5_hr')
    if (hr != null) push(`L5 ${hr}HR`)
    const bar = g('l20pa_barrel_rate') ?? g('recent_barrel_rate')
    if (bar != null) push(`${(bar * 100).toFixed(1)}% barrel`)
    push(iso3(g('season_iso')) && `${iso3(g('season_iso'))} ISO`)
  } else if (role === 'HIT') {
    const h = g('last5_hits')
    if (h != null) push(`L5 ${h}H`)
    push(iso3(g('last5_avg')))
    push(iso3(g('season_avg')) && `${iso3(g('season_avg'))} season`)
  } else if (role === 'HRR') {
    const r = g('last5_runs')
    const rbi = g('last5_rbi')
    if (r != null || rbi != null) push(`L5 ${r ?? 0}R/${rbi ?? 0}RBI`)
    const sr = g('season_runs')
    const srbi = g('season_rbi')
    if (sr != null && srbi != null) push(`${sr}R/${srbi}RBI season`)
  } else {
    const h = g('last5_hits')
    const x = g('last5_xbh')
    if (h != null || x != null) push(`L5 ${h ?? 0}H/${x ?? 0}XBH`)
    push(iso3(g('season_slg')) && `${iso3(g('season_slg'))} SLG`)
  }
  return parts.join(' · ')
}

// One number for the #2 and #3 rows — the same evidence, squeezed. These rows
// only had a name and a score, which made them look like filler rather than
// the two hitters the card says are nearly as good as the first one.
function microStat(p, role) {
  const g = (k) => numOrNull(p?.[k])
  if (role === 'HR') {
    const hr = g('last5_hr')
    return hr != null ? `${hr}HR` : null
  }
  if (role === 'HIT') return iso3(g('last5_avg'))
  if (role === 'HRR') {
    const r = g('last5_runs')
    const rbi = g('last5_rbi')
    return r != null || rbi != null ? `${(r ?? 0) + (rbi ?? 0)} R+RBI` : null
  }
  const x = g('last5_xbh')
  return x != null ? `${x}XBH` : null
}

// EXPORTED (2026-08-10) so the dedicated picks page ranks the exact same way.
// Two surfaces naming different hitters as "the bot's pick" is the failure
// this file's own history section is about; the fix is one definition, not two
// copies that agree today.
export const CATEGORIES = [
  // The bot's own score, and as of 2026-08-09 that is what the whole site
  // ranks on — so this strip and the HR Board finally name the same hitters.
  //
  // HISTORY WORTH KEEPING: from 2026-08-04 the HR Board ranked on a site-side
  // ISO adjustment while this strip mirrored the bot verbatim, which meant the
  // site's Four and the bot's printed FOUR could disagree, and people noticed.
  // The rule then was "one voice per surface". There is one voice everywhere
  // now; see lib/scoring.js for why the adjustment came out.
  { role: 'HR',      label: 'HR',      icon: null, color: C.orange,
    blurb: 'Going deep',     score: hrScore },
  { role: 'HIT',     label: 'HIT',     icon: null, color: C.purple,
    blurb: 'Base-hit floor', score: hitScore },
  { role: 'HRR',     label: 'HRR',     icon: null, color: C.cyan,
    blurb: 'Runs + RBI',     score: prodScore },
  // ── NO LONE EMOJI (2026-08-29) ────────────────────────────────────────
  // Donovan: "the four, put the emojis associated with the categories —
  // looks off only having contact like that, or just remove whatever is
  // easier." CONTACT was the only one of the four carrying an icon, which
  // made the row look unfinished rather than decorated. Removed: each
  // category already has its own colour, its own label and its own blurb,
  // which is what tells them apart. The render below skips a null icon, so
  // nothing else had to change.
  { role: 'CONTACT', label: 'CONTACT', icon: null, color: C.green,
    blurb: 'Total bases',    score: tbScore },
]

/**
 * The buckets, three deep, ranked on each category's own scale.
 *
 * ── THREE DEEP MEANS THREE DIFFERENT MEN (2026-08-17) ───────────────────────
 * Donovan: "i like it repeats the top pick twice it's no need too."
 *
 * On the 08-17 slate the CONTACT card listed Alec Burleson at #2 AND #3, both
 * reading 4XBH / 89.0. Not a data fault: STL @ CIN was a doubleheader, so
 * Burleson is on the slate as two rows, and "sort by score, take three" handed
 * him two of the three slots. A three-deep card that names two of the same man
 * is two picks wide, and the second one tells the reader nothing they did not
 * already have.
 *
 * So the slice is now by PERSON, not by row. First appearance wins — that is
 * his better game by this category's own score, since the pool is already
 * sorted — and the row is tagged with how many of his games are on the slate so
 * the information is condensed rather than removed. Everything else about the
 * ranking is untouched.
 *
 * Keyed on player_id with a name fallback: a row with no id is not silently
 * merged with every other row that also has no id.
 */
// The body moved to lib/mlbFour.js rankBuckets (2026-09-27) so the server can
// grade the same Four night by night (the record on each card). Same rule,
// same order, one copy: CATEGORIES ride through with their colours and blurbs.
export function pickBuckets(players = []) {
  return rankBuckets(players, CATEGORIES)
}

export default function BotPicksStrip({ players = [], onPlayerClick, onFullCard = null, graded = null, rankWhy = true }) {
  const four = useMemo(() => pickBuckets(players), [players])
  // WHY / WATCH ON EACH #1 (2026-09-30, BATCH-SIGNAL-WHY S2): lib/mlb/
  // boardReason.js, ranked against `players` -- the whole slate on Home. A
  // caller holding only a trimmed list (/start) sets rankWhy={false} and
  // hands each row its own precomputed `_why` instead, so a rank is never
  // taken over a partial board.
  const rctx = useMemo(() => (rankWhy ? reasonContext(players) : null), [players, rankWhy])
  const whyOf = (p) => (p?._why !== undefined ? p._why : rctx ? reasonLines(boardReasonFor(p, rctx), nameOf(p)) : null)
  // ✓ / ✗ ONCE A PICK IS SETTLED (2026-09-28, DAY-AWARE-OPENERS): Home hands in
  // the slate's own graded rows (resultsForSlate, date-gated in Dashboard).
  // Each shown pick is graded on its category's bar by lib/mlbFour.js
  // fourGrade -- the record's rule -- from his row for that category, else any
  // row of his in the same game (the box score is his, not the category's).
  // Not final / didn't play / voided -> no mark, never a guess.
  const gradeOf = useMemo(() => {
    const rows = Array.isArray(graded) ? graded : []
    if (!rows.length) return () => null
    const by = new Map()
    for (const r of rows) {
      if (r?.player_id == null) continue
      const k = String(r.player_id)
      if (!by.has(k)) by.set(k, [])
      by.get(k).push(r)
    }
    return (p, role) => {
      const mine = (by.get(String(p?.player_id ?? '')) || []).filter((r) => p?.game_pk == null || r.game_pk == null || String(r.game_pk) === String(p.game_pk))
      const row = mine.find((r) => String(r.pick_type || '').toUpperCase() === role) || mine[0]
      const g = fourGrade(role, row)
      return g == null ? null : { hit: g, title: `${g ? 'Cleared' : 'Missed'} the bar (${PLATE_BAR[role]})` }
    }
  }, [graded])
  // EACH CARD'S OWN RECORD (2026-09-27, The Four like The Six): the category's
  // #1 graded on its own bar over the last 14 graded nights, computed and
  // cached on the server (the nightly files are 2.4 MB
  // each). Replaces the one "65% over 25 nights · Aug 23" pill, which was a
  // study snapshot a month old. Unreadable -> no record line, never a guess.
  //
  // 2026-10-01 (queue 0d PUBLIC NUMBERS): OFF. That record ranked each night's
  // #1 by the scores in graded_results_<date>.json, which are a post-game
  // re-run (claude/HR-MODEL-FINDINGS-2026-10-01.md §1), so "9 of 14 nights"
  // was measured on the leaky archive. The card's record returns when it can
  // be read from the locked pick record. (/api/dash/four-record was removed
  // 2026-10-06: nothing read it once series.mjs moved to /api/calibration.)

  if (!four.some((f) => f.picks.length)) return null

  // THE LAYOUT IS SHARED NOW (2026-09-27, BATCH-HEADLINE-PICKS step 1):
  // components/headline/HeadlinePicks.js is this strip's old markup, moved
  // unchanged; TUDDY's The Six renders through it too. What stays here is
  // MOONSHOT's: the ranking (pickBuckets), the words (statLine / microStat)
  // and the measured record below.
  const lanes = four.map((f) => ({
    // THE BAR beside the market, like TUDDY's "bar 1+" (2026-09-27, The Four
    // like The Six): the words the Props plate prints (PLATE_BAR, one copy).
    key: f.role, label: f.label, icon: f.icon, blurb: `bar ${PLATE_BAR[f.role]}`, color: f.color,
    record: null,
    picks: f.picks.map((p, i) => ({
      key: p?.player_id ?? i,
      raw: p,
      name: nameOf(p),
      // The #1's face (BATCH-FACES step 8), mlbstatic by MLBAM id.
      // In the club-coloured rounded square TUDDY's faces use (variant tile).
      face: i === 0 && p?.player_id != null ? <PlayerFace sport="mlb" variant="tile" id={String(p.player_id)} team={teamOf(p)} name={nameOf(p)} size={28} theme={C} /> : null,
      score: f.score(p).toFixed(1),
      result: gradeOf(p, f.role),
      flag: p?.weak_spot_flag === true ? { icon: '⭐', title: i === 0 ? 'Weak lineup spot for this pitcher' : undefined } : null,
      micro: i === 0 ? null : microStat(p, f.role),
      ...(i === 0 ? (() => { const w = whyOf(p); return w ? { why: w.why, watch: w.watch, explain: w.explain } : {} })() : {}),
      lines: i === 0 ? [statLine(p, f.role), (
        <>
          {teamOf(p)} · vs {clean(p?.pitcher_name, 'TBD')}
          {p?.pitcher_throws ? ` (${p.pitcher_throws}HP)` : ''}
          {p?._slateGames > 1 && (
            <span
              title={`His team plays ${p._slateGames} times today. This card shows his best game by this category's score; the full board lists both, split by the G column.`}
              style={{ color: f.color, opacity: .85 }}
            >{` · plays ${p._slateGames}×`}</span>
          )}
        </>
      )] : [],
      team: i === 0 ? null : (
        <>
          {teamOf(p)}
          {p?._slateGames > 1 && (
            <span
              title={`His team plays ${p._slateGames} times today — this is his best game by this category's score. Both games are on the full board, split by the G column.`}
              style={{ color: f.color, opacity: .85 }}
            >{` ${p._slateGames}×`}</span>
          )}
        </>
      ),
    })),
  }))

  return (
    <HeadlinePicks sport="mlb"
      theme={C} numFont={NUM_FONT}
      title="🎯 The Four"
      subtitle={<>four categories, three deep — MOONSHOT&apos;s headline picks</>}
      lanes={lanes}
      // No orphan (was 3 + CONTACT alone at 900): 4 across from 1100px, 2 x 2
      // below, one column on a phone. NOT collapsed to the #1s on a phone like
      // The Six: measured, the 44px "#2 and #3" button is taller than the two
      // compact rows it hides, so four collapsed cards were taller, not shorter.
      cols={{ wide: 4, mid: 2 }}
      foldWhy
      // No opener (the /start page): a name links to his card in the app.
      onPick={onPlayerClick ? (pick) => onPlayerClick(pick.raw) : (pick) => { const id = pick.raw?.player_id ?? pick.raw?.id; if (id != null) window.location.assign(playerHref('mlb', id)) }}
      whatThis={{ label: 'how these are ranked', body: 'Each category uses its own score and evidence. ⭐ marks a weak lineup spot; tap a name for the hitter detail.' }}
      // "Full card →" top right, like The Six's; the Props page is the card.
      record={onFullCard ? <button type="button" onClick={onFullCard} style={{ minHeight: 44, margin: '-13px 0 -13px auto', padding: '0 4px', border: 'none', background: 'transparent', color: C.orange, font: `800 11px/1 ${NUM_FONT}`, cursor: 'pointer' }}>Full card →</button> : null}
    />
  )
}
