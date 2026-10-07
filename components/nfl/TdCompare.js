'use client'
import { useMemo } from 'react'
import CompareTwo from '../compare/CompareTwo'
import { C, NUM_FONT, gradeFor } from '../../lib/nfl/theme'
import { quoteFor, fmtOdds } from '../../lib/nfl/oddsMatch'
import { matchupTag, alignedSignals } from '../../lib/nfl/dvpSignal'
import { injuryTag } from '../../lib/nfl/injury'

// ══ ⚖️ COMPARE TWO PLAYERS — TUDDY's half of MOONSHOT's PickCompare ══════════
//
// Donovan, 2026-09-16 ("Rebuild it like Props"): Touchdowns needed "a
// compare-two tool" to reach click-over parity with Props. MOONSHOT's own
// version (components/PickCompare.js) doesn't port line-for-line -- it reads
// off seven MLB-only fields (pitch_type_match_flag, weak_spot_flag, park_hr_
// factor...) that have no TD-market equivalent. This is the same STRUCTURE
// (pick two, read them side by side, a printed rule decides a verdict) built
// off TD's own four real signals instead of MLB's seven.
//
// NOTHING HERE IS A NEW MODEL, same discipline as the MLB page: every number
// is a field the bot published (components.TD, scores.TD) or a price the
// book posted (quoteFor). The verdict rule is the same shape too -- higher
// score by 8+ wins outright (the two products share one 0-100 scale, see
// ScoreAnatomy.js's header on why an NFL 78 means what an MLB 78 means);
// inside that, more real signals wins; inside that, the better price at the
// same bar; otherwise it says coin flip rather than inventing a favourite.
export const SIGNALS = [
  ['highconf', 'High-confidence flag', "TUDDY's high-confidence TD flag", (p) => Boolean(p?.high_confidence_td_flag)],
  ['matchup', 'Matchup (TARGET)', 'faces a defense in the softest third of the league at his role/market', (p, matchup) => matchupTag(matchup, p, 'TD')?.tag === 'TARGET'],
  ['finisher', 'Red-zone finisher', 'red-zone opportunity in the 80th percentile or better', (p, matchup) => alignedSignals(matchup, p).finisherHit],
  ['rising', 'Snap share rising', 'snap share trending up 20+ points', (p, matchup) => alignedSignals(matchup, p).risingHit],
]

const pctOf = (comps, key) => (Number.isFinite(Number(comps?.[key])) ? `${Math.round(Number(comps[key]))}p` : '—')

// The shell is components/compare/CompareTwo.js (2026-10-03): MOONSHOT's
// compare layout, TUDDY's signals, rows and verdict.
export default function TdCompare({ rows = [], matchup, odds, onPlayerClick }) {
  const signals = useMemo(() => SIGNALS.map(([k, l, w, f]) => [k, l, w, (p) => f(p, matchup)]), [matchup])
  const verdictFor = (a, b, qa, qb, ca, cb) => {
    const sa = Number(a.scores?.TD) || 0, sb = Number(b.scores?.TD) || 0
    const gap = sa - sb
    if (Math.abs(gap) >= 8) {
      const w = gap > 0 ? a : b
      return { who: w, why: `${Math.abs(gap).toFixed(0)} points clear on the TD score — outside the noise between two cards.` }
    }
    if (ca !== cb) {
      const w = ca > cb ? a : b
      return { who: w, why: `scores are within ${Math.abs(gap).toFixed(0)} points, so the signals decide: ${Math.max(ca, cb)} of ${SIGNALS.length} agree on him against ${Math.min(ca, cb)}.` }
    }
    const ia = qa?.matches ? qa.implied : null, ib = qb?.matches ? qb.implied : null
    if (ia != null && ib != null && Math.abs(ia - ib) >= 3) {
      const w = ia < ib ? a : b
      return { who: w, why: `same score, same signals — so take the price: ${fmtOdds((w === a ? qa : qb).over)} needs ${Math.min(ia, ib)}% to break even against ${Math.max(ia, ib)}% for the other.` }
    }
    return { who: null, why: `coin flip — ${Math.abs(gap).toFixed(0)} points apart, ${ca} signal${ca === 1 ? '' : 's'} each${ia != null && ib != null ? ', prices within 3 points' : ''}. Nothing here separates them.` }
  }
  const rowDefs = [
    ['Grade', (p) => gradeFor(p.scores?.TD).label, false],
    ['TD score', (p) => Math.round(p.scores?.TD ?? 0), true],
    ['Price · needs', (p, q) => (q?.matches ? `${fmtOdds(q.over)} · ${Math.round(q.implied)}%` : q ? `book at ${q.line}` : '—'), false],
    ['Goal-line opp (pct)', (p) => pctOf(p.components?.TD, 'f_gl_opp'), false],
    ['Red-zone touches (pct)', (p) => pctOf(p.components?.TD, 'f_rz_opp'), false],
    ['Snap share (pct)', (p) => pctOf(p.components?.TD, 'f_snap_pct'), false],
    ['Matchup', (p) => matchupTag(matchup, p, 'TD')?.tag || 'EVEN', false],
    ['Injury', (p) => injuryTag(p) || '—', false],
  ]
  return (
    <CompareTwo
      players={rows} nameOf={(p) => p.name || ''} teamOf={(p) => p.team || ''}
      metaSel={(p) => `${p.team} vs ${p.opp}`} metaHit={(p) => `${p.team} vs ${p.opp} · ${p.position}`}
      rows={rowDefs} signals={signals} quoteOf={(p) => quoteFor(odds, p, 'TD')}
      verdictFor={verdictFor} onPlayerClick={onPlayerClick ? (p) => onPlayerClick(p, 'TD') : null}
      title="⚖️ Compare two players" sub="the things that differ between two TD picks, side by side, and a verdict that says why"
      placeholders={['first player…', 'second player…']} signalsTitle="The four real signals this page tracks for a TD pick."
      accent={C.green} accentBg={`${C.green}14`} bgTint={`${C.green}0a`} winInk={C.green}
      theme={C} numFont={NUM_FONT} gridClass="tc-grid" />
  )
}
