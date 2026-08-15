'use client'
import { C, NUM_FONT } from '../lib/theme'
import { n, clean } from '../lib/player'
import { compactRole, gradeFor, bestBet } from '../lib/scoring'
import { quoteFor, fmtOdds, fairOdds, hrPerGame, impliedPct } from '../lib/odds'

// 🧭 THE READ — the Overview's missing first paragraph.
//
// 2026-08-15, Donovan: "the overview on the player modal as well — make it
// flow and clean." The tab opened on a matrix, then a wall of forty
// label:value rows. Every number was there; the STORY wasn't — you had to
// assemble it yourself from six columns. The surfaces he keeps calling right
// (Storylines, the cold case, the reality check) all do the same thing:
// sentences first, numbers wearing their clauses.
//
// So this is the same Line shape, synthesizing ONLY what the slate row
// already carries — zero new fetches, all sync. Each line renders only when
// its data exists; a hitter with no statcast window simply has a shorter
// read, not a row of dashes.
//
// INTEGRITY: the price line obeys the two standing rules. (1) A quote is
// only judged when the book's line matches the pick's bar (quoteFor.matches).
// (2) Only HR gets a verdict, because hr_per_pa is the one real probability
// the slate publishes — every other market shows the price and says what it
// needs, no green word, because a 0-100 score is not a rate.

function Line({ icon, children }) {
  return (
    <div style={{
      display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 11,
      lineHeight: 1.55, padding: '3px 0', color: C.text2,
    }}>
      <span style={{ flexShrink: 0 }}>{icon}</span>
      <span style={{ minWidth: 0 }}>{children}</span>
    </div>
  )
}

const ORD = ['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th']
const B = ({ col = C.text, children }) => <b style={{ fontFamily: NUM_FONT, color: col }}>{children}</b>

// bestBet() returns the bot's free-text market ("HR", "Hit", "Contact 2+ TB"…).
// Map it onto the odds categories so the price line prices the SAME bet.
function betCat(txt) {
  const t = String(txt || '').toLowerCase()
  if (t.includes('hit') || t.includes('base hit')) return 'HIT'
  if (t.includes('hrr') || t.includes('run') || t.includes('rbi') || t.includes('prod')) return 'HRR'
  if (t.includes('contact') || t.includes('tb') || t.includes('total')) return 'CONTACT'
  return 'HR'
}

export default function PlayerRead({ p, odds }) {
  if (!p) return null

  // ── 1. the bot's call ────────────────────────────────────────────────────
  // Graded on HIS market, not blindly on HR. The first live render caught the
  // blind version saying "Skip HR, grade A+ — best play Avoid for HR": an A+
  // for a market the bot just said to skip, and a bet named "Avoid". A hitter
  // whose role is Hit gets his HIT grade and bet; only an HR-role hitter is
  // graded on homers; a Skip HR gets the honest sentence and no fake grade.
  const role = compactRole(p)
  const skipHr = /skip/i.test(role)
  const roleType = /hit/i.test(role) && !skipHr ? 'hit'
    : /hrr/i.test(role) ? 'hrr'
    : /(tb|contact)/i.test(role) ? 'tb'
    : 'hr'
  const grade = gradeFor(p, roleType)
  const bet = bestBet(p, roleType)
  const spot = n(p?.lineup_spot, NaN)
  const hasEdge = n(p?.pitch_type_match_score, 0) > 0
  const gradeCol = /^A/.test(grade) ? C.orange : C.text

  // ── 2. the contact ───────────────────────────────────────────────────────
  const dMax = n(p?.hr_shape_components?.max_distance, NaN)
  const eMax = n(p?.hr_shape_components?.max_ev, NaN)
  const brl = n(p?.recent_barrel_rate, NaN)
  const hh = n(p?.recent_hard_hit_rate, NaN)
  const hotBat = (Number.isFinite(brl) && brl >= 0.12) || (Number.isFinite(dMax) && dMax >= 400)
  const coldBat = Number.isFinite(brl) && brl <= 0.04 && (!Number.isFinite(dMax) || dMax < 372)
  const hasContact = Number.isFinite(dMax) || Number.isFinite(brl) || Number.isFinite(hh)

  // ── 3. the arm ───────────────────────────────────────────────────────────
  const arm = clean(p?.pitcher_name, '')
  const throwsH = clean(p?.pitcher_throws, '')
  const hr9 = n(p?.pitcher_hr9, NaN)
  const whip = n(p?.pitcher_whip, NaN)
  const weakSide = clean(p?.pitcher_weak_side || p?.weak_side, '')
  const batsHand = clean(p?.bats || p?.handedness, '')
  const matchesWeak = weakSide && batsHand && (
    (weakSide === 'LHB' && batsHand === 'L') || (weakSide === 'RHB' && batsHand === 'R')
  )
  const hr9Col = Number.isFinite(hr9) ? (hr9 >= 1.5 ? C.orange : hr9 <= 0.8 ? '#38bdf8' : C.text) : C.text

  // ── 4. the power state ───────────────────────────────────────────────────
  // Same near-miss bar the Scoreboard board uses: a drought only reads as
  // "close" when the recent contact actually was — otherwise it reads cold,
  // out loud, because that is the honest version.
  const since = n(p?.games_since_last_hr, NaN)
  const walls = n(p?.hr_shape_profile?.wall_scraper, 0)
  const closeScore = (Number.isFinite(dMax) ? (dMax >= 400 ? 3 : dMax >= 385 ? 2 : dMax >= 372 ? 1 : 0) : 0)
    + walls * 2
    + (Number.isFinite(eMax) ? (eMax >= 110 ? 2 : eMax >= 106 ? 1 : 0) : 0)
    + (Number.isFinite(brl) && brl >= 0.12 ? 1 : 0)

  // ── 5. the price, on the bot's own market ────────────────────────────────
  // A Skip HR gets no price line at all — quoting a market the bot just said
  // to skip would dress a pass up as a play.
  const cat = betCat(bet)
  const q = skipHr ? null : quoteFor(odds, p, cat)
  const rate = cat === 'HR' ? hrPerGame(p) : null
  const fair = rate != null ? fairOdds(rate) : null
  const need = q ? (q.implied ?? impliedPct(q.over)) : null
  const diff = q?.matches && rate != null && need != null ? rate - need : null

  // ── 6. the bot's own note, folded in instead of orphaned at the bottom ───
  const note = clean(p?.note || p?.summary, '')

  const lines = []

  lines.push(
    <Line key="call" icon="🤖">
      {skipHr ? (
        <>The bot tags him <b style={{ color: C.text }}>Skip HR</b> — no homer case tonight, and his
          other scores don&apos;t make one elsewhere either{Number.isFinite(spot) && spot >= 1 && spot <= 9 && <>. He hits <B>{ORD[spot]}</B></>}.</>
      ) : (
        <>The bot tags him <b style={{ color: C.text }}>{role}</b>, grade <B col={gradeCol}>{grade}</B> on
          that market — best play <b style={{ color: C.text }}>{bet}</b>
          {Number.isFinite(spot) && spot >= 1 && spot <= 9 && <>, hitting <B>{ORD[spot]}</B></>}.</>
      )}
      {hasEdge && <> His bat profiles against this arm&apos;s pitch mix — the strongest single separator the backtest found.</>}
    </Line>
  )

  if (hasContact) {
    lines.push(
      <Line key="contact" icon={hotBat ? '🔨' : coldBat ? '🧊' : '⚾'}>
        <b style={{ color: C.text }}>The bat:</b>{' '}
        {Number.isFinite(dMax) && dMax > 0 && <>his best recent ball went <B col={dMax >= 390 ? C.orange : C.text}>{Math.round(dMax)} ft</B>{Number.isFinite(eMax) && eMax > 0 && <> at <B>{eMax.toFixed(0)} mph</B></>}{(Number.isFinite(brl) || Number.isFinite(hh)) && <>, </>}</>}
        {Number.isFinite(brl) && <>barreling <B col={brl >= 0.12 ? C.orange : brl <= 0.04 ? '#38bdf8' : C.text}>{Math.round(brl * 100)}%</B></>}
        {Number.isFinite(brl) && Number.isFinite(hh) && <> with </>}
        {Number.isFinite(hh) && <><B col={hh >= 0.45 ? C.orange : C.text}>{Math.round(hh * 100)}%</B> hard contact</>}
        {' '}in his recent window
        {hotBat ? <> — <b style={{ color: C.orange }}>the contact is live</b></> : coldBat ? <> — <b style={{ color: '#38bdf8' }}>quiet bat lately</b></> : null}.
      </Line>
    )
  }

  if (arm && arm !== '—') {
    lines.push(
      <Line key="arm" icon="🥎">
        <b style={{ color: C.text }}>The arm:</b> {arm}
        {throwsH && throwsH !== '—' && <> ({throwsH}HP{p?.pitcher_projected ? <span title="No probable announced — rotation projection, not an official listing" style={{ color: C.yellow }}> ≈</span> : null})</>}
        {Number.isFinite(hr9) && <> gives up <B col={hr9Col}>{hr9.toFixed(2)} HR/9</B></>}
        {Number.isFinite(whip) && <>{Number.isFinite(hr9) ? ' on' : ' carries'} a <B>{whip.toFixed(2)}</B> WHIP</>}
        {weakSide && <>
          {' '}— and he is weakest against <b style={{ color: matchesWeak ? C.orange : C.text }}>{weakSide}</b>
          {matchesWeak && <b style={{ color: C.orange }}>, which is this hitter&apos;s side ✓</b>}
        </>}.
      </Line>
    )
  }

  if (Number.isFinite(since)) {
    if (since === 0) {
      lines.push(
        <Line key="pow" icon="💥">
          <b style={{ color: C.text }}>The power:</b> he went yard <b style={{ color: C.orange }}>his last game</b>
          {n(p?.season_hr, 0) > 0 && <> — <B>{n(p?.season_hr, 0)}</B> on the season</>}.
        </Line>
      )
    } else if (since >= 2 && closeScore >= 2) {
      lines.push(
        <Line key="pow" icon="🧱">
          <b style={{ color: C.text }}>The power:</b> <B col={since >= 10 ? '#f87171' : since >= 5 ? C.orange : C.text}>{since} games</B> since a homer,
          but one was close — the contact above is homer-shaped
          {walls > 0 && <>, with <B col="#FCD34D">{walls} wall-scraper{walls > 1 ? 's' : ''}</B> in his recent hard contact</>}.
          Drought, not decline.
        </Line>
      )
    } else if (since >= 4) {
      lines.push(
        <Line key="pow" icon="🍩">
          <b style={{ color: C.text }}>The power:</b> <B col={since >= 10 ? '#f87171' : C.orange}>{since} games</B> since a homer,
          and the recent contact does not argue bad luck — nothing in his window reached the wall. That is a slump reading, not a due reading.
        </Line>
      )
    }
  }

  if (q && q.matches) {
    lines.push(
      <Line key="price" icon="💰">
        <b style={{ color: C.text }}>The price:</b> the book has his {cat === 'CONTACT' ? '2+ TB' : `${cat} ${cat === 'HRR' ? '2+' : '1+'}`} at{' '}
        <B>{fmtOdds(q.over)}</B>, which needs <B>{need != null ? `${need.toFixed(0)}%` : '—'}</B>
        {diff != null && fair != null ? (
          diff >= 3
            ? <> — his own rate says <B>{rate.toFixed(0)}%</B> (fair {fmtOdds(fair)}), so <b style={{ color: '#4ade80' }}>the book is paying more than his season says it should</b>.</>
            : diff <= -3
              ? <> — his own rate says only <B>{rate.toFixed(0)}%</B> (fair {fmtOdds(fair)}), so <b style={{ color: '#f87171' }}>the price is asking more than his season delivers</b>.</>
              : <> — right about where his own <B>{rate.toFixed(0)}%</B> rate prices it.</>
        ) : (
          <> to break even. No verdict on this market — the slate publishes a score for it, not a rate, and a score is not a probability.</>
        )}
      </Line>
    )
  }

  if (note && note !== '—') {
    lines.push(
      <Line key="note" icon="💬">
        <b style={{ color: C.text }}>Bot&apos;s note:</b> {note}
      </Line>
    )
  }

  return (
    <div style={{ marginBottom: 13 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginBottom: 4, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11.5, fontWeight: 900 }}>🧭 The read</span>
        <span style={{ fontSize: 9, color: C.text3 }}>tonight in sentences — every number below backs one of these</span>
      </div>
      {lines}
    </div>
  )
}
