'use client'
import { C, NUM_FONT } from '../lib/theme'
import { n, nameOf, teamOf, oppOf, txt, hrScore } from '../lib/player'
import { verdictInk, alpha } from '../lib/scales'
import { fmtOdds, quoteFor } from '../lib/odds'
import CompareTwo from './compare/CompareTwo'

// ══ ⚖️ COMPARE TWO PICKS ═════════════════════════════════════════════════════
//
// Donovan, 2026-09-01, on the cards site-wide: "I felt ours were repetitive
// and not informational or helpful in decision making or deciphering between
// two picks." This is the page for that one sentence. Pick two hitters and
// read them against each other on the things that actually differ between
// two homer picks, in one column each, with the verdict stated the way a
// friend would state it.
//
// THE SIGNALS ROW IS THE SAME SEVEN the bot's shadow lane counts
// (bots/hr_v3_shadow.py, SIGNALS, same date) — pitch, spot, mistake, pace,
// air, form, power — read off the same published fields, so what this page
// calls "5 of 7 agree" is the number the shadow record is grading nightly.
// When that record says convergence predicts, this row already means it;
// when it says it does not, this row is a checklist and nothing more, and
// the copy says which.
//
// NOTHING HERE IS A NEW MODEL. Every number is a field the bot published or
// a price the book posted. The verdict is a rule, printed: higher score by
// 8+ wins; inside that, more signals wins; inside that, the longer price at
// the same rate is the better bet; and when none of those separates them it
// says coin flip rather than inventing a favourite.

export const SIGNALS = [
  ['pitch', 'Pitch match', 'his damage pitch is what this arm throws most', (p) => Boolean(p?.pitch_type_match_flag)],
  ['spot', 'Weak spot', 'the arm bleeds to his lineup spot', (p) => Boolean(p?.weak_spot_flag)],
  ['mistake', 'Mistake pitch', 'the arm’s mistake pitch is one he punishes', (p) => Boolean(p?.pitcher_mistake_match)],
  ['pace', 'Due + HR-prone arm', 'real expected-HR gap on a real sample, against an arm allowing homers right now', (p) => Boolean(p?.hr_pace_flag)],
  ['air', 'Air / park', 'wind helping, or a park at 1.05+ for homers', (p) => (n(p?.weather_wind_boost, 0) > 0.02) || (n(p?.park_hr_factor, 0) >= 1.05)],
  ['form', 'Recent homer', 'went deep in his last five', (p) => n(p?.last5_hr, 0) >= 1],
  ['power', 'Power tell', 'MOONSHOT’s own power-watch or high-confidence flag', (p) => Boolean(p?.power_watch_flag) || Boolean(p?.high_confidence_hr_flag)],
]

const pct = (v, dp = 1) => (v == null ? '—' : `${(100 * v).toFixed(dp)}%`)

function verdictFor(a, b, qa, qb) {
  const sa = hrScore(a), sb = hrScore(b)
  const ca = SIGNALS.filter(([, , , f]) => f(a)).length, cb = SIGNALS.filter(([, , , f]) => f(b)).length
  const gap = sa - sb
  if (Math.abs(gap) >= 8) {
    const w = gap > 0 ? a : b
    return { who: w, why: `${Math.abs(gap).toFixed(0)} points clear on the HR score — that is outside the noise between two cards.` }
  }
  if (ca !== cb) {
    const w = ca > cb ? a : b
    return { who: w, why: `scores are within ${Math.abs(gap).toFixed(0)} points, so the signals decide: ${Math.max(ca, cb)} of 7 agree on him against ${Math.min(ca, cb)}. Read that as a checklist until the shadow record says convergence predicts.` }
  }
  const ia = qa?.matches ? qa.implied : null, ib = qb?.matches ? qb.implied : null
  if (ia != null && ib != null && Math.abs(ia - ib) >= 3) {
    const w = ia < ib ? a : b
    return { who: w, why: `same score, same signals — so take the price: ${fmtOdds((w === a ? qa : qb).over)} needs ${Math.min(ia, ib)}% to break even against ${Math.max(ia, ib)}% for the other.` }
  }
  return { who: null, why: `coin flip — ${Math.abs(gap).toFixed(0)} points apart, ${ca} signals each${ia != null && ib != null ? ', prices within 3 points' : ''}. Nothing on this page separates them; pick the lineup spot you trust.` }
}

// The shell is components/compare/CompareTwo.js (2026-10-03), shared with
// TUDDY; this file is MOONSHOT's content for it: the rows, the seven signals,
// the verdict rule and the matchup-reason footer.
const ROWS = [
  ['Badge', (p) => String(p.game_pick_role || '').split('/')[0] || 'none', false],
  ['HR score', (p) => hrScore(p).toFixed(0), true],
  ['Model P(HR tonight)', (p) => pct(n(p.season_hr_game_probability, null)), true],
  ['Price · needs', (p, q) => (q?.matches ? `${fmtOdds(q.over)} · ${Math.round(q.implied)}%` : q ? `book at ${q.line}` : '—'), false],
  ['HR last 5 / 10 / szn', (p) => `${n(p.last5_hr, 0)} / ${n(p.last10_hr, 0)} / ${n(p.season_hr, 0)}`, false],
  ['ISO · HR/PA', (p) => `${n(p.season_iso, 0).toFixed(3).replace(/^0/, '')} · ${pct(n(p.hr_per_pa, null), 1)}`, false],
  ['Arm HR/9 · last 3', (p) => `${n(p.pitcher_hr9, 0).toFixed(2)} · ${p.pitcher_l3_hr9 != null ? Number(p.pitcher_l3_hr9).toFixed(2) : '—'}`, false],
  ['Park HR · wind', (p) => `${n(p.park_hr_factor, 1).toFixed(2)} · ${n(p.weather_wind_boost, 0) > 0.02 ? 'helping' : n(p.weather_wind_boost, 0) < -0.02 ? 'hurting' : 'flat'}`, false],
  ['Lineup spot', (p) => (p.lineup_spot ? `${p.lineup_spot}${p.lineup_confirmed ? ' ✓' : ' (proj)'}` : '—'), false],
  ['Trap flag', (p) => (p.trap_flag ? 'yes' : 'no'), false],
]

function footer(a, b) {
  if (!(txt(a.matchup_reason) || txt(b.matchup_reason))) return null
  return (
    <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT, lineHeight: 1.5 }}>
      <div><b style={{ color: C.text2 }}>{nameOf(a).split(' ').slice(-1)[0]}:</b> {txt(a.matchup_reason).split(/\s*·\s*/).join(' · ')}</div>
      <div><b style={{ color: C.text2 }}>{nameOf(b).split(' ').slice(-1)[0]}:</b> {txt(b.matchup_reason).split(/\s*·\s*/).join(' · ')}</div>
    </div>
  )
}

export default function PickCompare({ players = [], odds = null, onPlayerClick }) {
  return (
    <CompareTwo
      players={players} nameOf={nameOf} teamOf={teamOf}
      metaSel={(p) => `${teamOf(p)} vs ${oppOf(p)}`}
      metaHit={(p) => `${teamOf(p)} vs ${oppOf(p)} · ${String(p.game_pick_role || '').split('/')[0] || 'no badge'}`}
      rows={ROWS} signals={SIGNALS} quoteOf={(p) => quoteFor(odds, p, 'HR')}
      verdictFor={(a, b, qa, qb) => verdictFor(a, b, qa, qb)} footer={footer} onPlayerClick={onPlayerClick}
      title="⚖️ Compare two picks" sub="the things that differ between two homer picks, side by side, and a verdict that says why"
      placeholders={['first hitter…', 'second hitter…']}
      signalsTitle="The seven signals MOONSHOT's shadow lane counts nightly. A checklist until that record says convergence predicts."
      accent={C.orange} accentBg={alpha(C.orange, 0.08)} bgTint={alpha(C.orange, 0.04)} winInk={verdictInk(true).color}
      gridClass="pc-grid" />
  )
}
