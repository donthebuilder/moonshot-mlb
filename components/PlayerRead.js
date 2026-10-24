'use client'
import { playerHref } from '../lib/routes'
import { C, NUM_FONT } from '../lib/theme'
import { hr9Color } from '../lib/hr9'
import { n, clean, txt } from '../lib/player'
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

// Exported (2026-09-30) so TUDDY's and LAMP's cards write their sentences in
// MOONSHOT's Read (components/nfl/NflPlayerRead.js).
export function Line({ icon, children, fs = 11 }) {
  return (
    <div style={{
      display: 'flex', gap: 8, alignItems: 'baseline', fontSize: fs,
      lineHeight: 1.55, padding: '3px 0', color: C.text2,
    }}>
      {icon ? <span style={{ flexShrink: 0 }}>{icon}</span> : null}
      <span style={{ minWidth: 0 }}>{children}</span>
    </div>
  )
}

const ORD = ['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th']
const LINK = { color: 'inherit', textDecoration: 'underline', textDecorationColor: 'rgba(255,255,255,.25)', textUnderlineOffset: 2 }

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
  const hr9Col = hr9Color(hr9)

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

  // ── THE READ AS TILES (2026-10-23, Donovan: "The read ... hell of words"): the same facts, each a tile -- the label, one big
  // number, a short line under it; a tile that favours the bat lights in the accent. Same data, same rules (a Skip HR has no price,
  // a market without a rate gets no verdict); only the sentences are gone.
  // the mistake (meatball fit) and the run (steal spot): the bot's own fields, each silent when absent / refused (see the 08-23 notes in git)
  const mbNote = txt(p?.meatball_fit_note)
  const mbFit = n(p?.meatball_fit_score, null)
  const mbStatus = String(p?.meatball_fit_status || '')
  const steal = n(p?.steal_risk_score, null)
  const stealStatus = String(p?.steal_risk_status || '')
  const catcher = txt(p?.opp_catcher_name)
  const catcherRate = n(p?.opp_catcher_cs_rate, null)
  const tiles = []
  const spotWord = Number.isFinite(spot) && spot >= 1 && spot <= 9 ? `bats ${ORD[spot]}` : null
  tiles.push(skipHr
    ? { k: 'call', label: 'THE CALL', big: 'Skip HR', small: ['no homer case tonight', spotWord].filter(Boolean).join(' · '), on: false }
    : { k: 'call', label: 'THE CALL', big: grade, small: [`${role} · best: ${bet}`, spotWord, hasEdge ? 'pitch-mix edge ✓' : null].filter(Boolean).join(' · '), on: /^A/.test(grade) })
  if (hasContact) {
    const big = Number.isFinite(dMax) && dMax > 0 ? `${Math.round(dMax)} ft` : Number.isFinite(brl) ? `${Math.round(brl * 100)}%` : `${Math.round(hh * 100)}%`
    const bits = [
      Number.isFinite(dMax) && dMax > 0 && Number.isFinite(eMax) && eMax > 0 ? `${eMax.toFixed(0)} mph` : null,
      Number.isFinite(brl) && !(big.endsWith('%') && !Number.isFinite(dMax)) ? `barrel ${Math.round(brl * 100)}%` : null,
      Number.isFinite(hh) ? `hard ${Math.round(hh * 100)}%` : null,
      hotBat ? 'contact is live' : coldBat ? 'quiet lately' : null,
    ].filter(Boolean)
    tiles.push({ k: 'bat', label: 'THE BAT', big, small: bits.join(' · '), on: hotBat })
  }
  if (arm && arm !== '—') {
    tiles.push({
      k: 'arm', label: 'THE ARM', big: Number.isFinite(hr9) ? `${hr9.toFixed(2)} HR/9` : (throwsH && throwsH !== '—' ? `${throwsH}HP` : '—'),
      small: <>{p?.pitcher_id ? <a href={`#sport=mlb&tab=pitchers&pitcher=${p.pitcher_id}`} style={LINK} title="Open the pitcher's file">{arm}</a> : arm}{[throwsH && throwsH !== '—' ? ` (${throwsH}HP${p?.pitcher_projected ? ' ≈' : ''})` : '', Number.isFinite(whip) ? ` · WHIP ${whip.toFixed(2)}` : '', weakSide ? ` · weak vs ${weakSide}${matchesWeak ? ' ✓' : ''}` : ''].join('')}</>,
      on: Boolean(matchesWeak) || hr9Col === C.orange,
    })
  }
  if (mbNote && mbStatus && mbStatus !== 'missing') {
    tiles.push({ k: 'mistake', label: 'THE MISTAKE', big: mbFit != null && mbFit > 0 ? mbFit.toFixed(0) : '—', small: mbNote, on: mbFit != null && mbFit >= 65 })
  }
  if (steal != null && steal > 0 && stealStatus && stealStatus !== 'no_runner' && stealStatus !== 'missing') {
    tiles.push({
      k: 'run', label: 'THE RUN', big: steal.toFixed(0),
      small: <>{[txt(p?.steal_risk_note), stealStatus === 'thin' ? 'half measured' : null].filter(Boolean).join(' · ')}{catcher && catcherRate != null ? <>{' · '}{p?.opp_catcher_id ? <a href={playerHref('mlb', p.opp_catcher_id)} style={LINK} title="Open the catcher's card">{catcher}</a> : catcher} catching{p?.opp_catcher_source === 'roster' ? ' (likeliest)' : ''}</> : null}</>,
      on: steal >= 60,
    })
  }
  if (Number.isFinite(since)) {
    if (since === 0) tiles.push({ k: 'pow', label: 'THE POWER', big: 'Last game', small: `homered his last game${n(p?.season_hr, 0) > 0 ? ` · ${n(p?.season_hr, 0)} on the season` : ''}`, on: true })
    else if (since >= 2 && closeScore >= 2) tiles.push({ k: 'pow', label: 'THE POWER', big: `${since} G`, small: `since a homer · one was close${walls > 0 ? ` · ${walls} wall-scraper${walls > 1 ? 's' : ''}` : ''} · drought, not decline`, on: true })
    else if (since >= 4) tiles.push({ k: 'pow', label: 'THE POWER', big: `${since} G`, small: 'since a homer · nothing reached the wall · a slump', on: false })
  }
  if (q && q.matches) {
    const mk = cat === 'CONTACT' ? '2+ TB' : `${cat} ${cat === 'HRR' ? '2+' : '1+'}`
    const verdict = diff != null && fair != null ? (diff >= 3 ? 'paying more than his season says' : diff <= -3 ? 'asking more than he delivers' : 'about fair') : 'no verdict: a score is not a rate'
    tiles.push({
      k: 'price', label: `THE PRICE · ${mk}`, big: fmtOdds(q.over),
      small: [`needs ${need != null ? `${need.toFixed(0)}%` : '—'}`, diff != null && fair != null ? `his rate ${rate.toFixed(0)}% (fair ${fmtOdds(fair)})` : null, verdict].filter(Boolean).join(' · '),
      on: diff != null && diff >= 3,
    })
  }

  return (
    <ReadFrame calm sub="tonight at a glance">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 170px), 1fr))', gap: 6 }}>
        {tiles.map((t) => (
          <div key={t.k} style={{ border: `1px solid ${t.on ? C.orange : C.border}`, background: t.on ? 'rgba(255,255,255,.03)' : 'transparent', borderRadius: 3, padding: '7px 9px 8px', minWidth: 0 }}>
            <div style={{ font: `800 10px/1.1 ${NUM_FONT}`, letterSpacing: '.07em', color: t.on ? C.orange : C.text3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.label}</div>
            <div style={{ font: `900 20px/1.15 ${NUM_FONT}`, color: t.on ? C.text : C.text2, marginTop: 4, whiteSpace: 'nowrap' }}>{t.big}</div>
            {t.small ? <div style={{ fontSize: 11, lineHeight: 1.3, color: C.text3, marginTop: 2 }}>{t.small}</div> : null}
          </div>
        ))}
      </div>
      {note && note !== '—' ? <div style={{ fontSize: 12, color: C.text3, marginTop: 6, lineHeight: 1.4 }}><b style={{ color: C.text2 }}>MOONSHOT&apos;s note:</b> {note}</div> : null}
    </ReadFrame>
  )
}

/** The Read's head and body: "🧭 The read" and its promise, then the lines. */
export function ReadFrame({ sub = 'tonight in sentences — every number below backs one of these', children, calm = false }) {
  return (
    <div style={{ marginBottom: 13 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginBottom: 4, flexWrap: 'wrap' }}>
        <span style={{ fontSize: calm ? 12 : 11.5, fontWeight: calm ? 800 : 900 }}>{calm ? 'The read' : '🧭 The read'}</span>
        <span style={{ fontSize: calm ? 11 : 9, color: C.text3 }}>{sub}</span>
      </div>
      {children}
    </div>
  )
}
