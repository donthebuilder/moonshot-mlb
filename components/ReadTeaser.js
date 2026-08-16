'use client'
import { useEffect, useMemo, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { oddsPaths } from '../lib/dataSource'
import { quoteFor, fmtOdds, impliedPct, oddsLooksReal } from '../lib/odds'
import { nameOf, teamOf, oppOf, clean } from '../lib/player'
import { whyPick, standingPhrase, convictionOf } from '../lib/whyPick'

// 📰 THE READ, ON THE PORCH — the lead only, and the same lead.
//
// 2026-08-16. Asked where The Read should live — it opens the Bot tab — the
// owner said "do the best recommended". The answer is not to move it. The Read
// is five sections long and it is the best writing on the site; the front page
// was rebuilt two commits ago into a deliberate descending-weight stack and
// dropping a five-section essay into the middle of it would gut the thing he
// just had rebuilt. So: THE LEAD RUNS HERE, THE ESSAY STAYS THERE. This is the
// call of the night and nothing else — name, market, bar, the arm, his spot,
// what is carrying it, the price if the book is on the same bar — then a door
// through to the full read.
//
// ── THE ONE FAILURE MODE THIS FILE IS DESIGNED AGAINST ──────────────────────
//
// If Home and the Bot page ever name DIFFERENT players as the call of the
// night, the site is broken — worse than broken, because both pages sound
// certain. That cannot be prevented by being careful; it can only be prevented
// by there being one implementation. So the selection is not re-derived here:
// `callOfTheNight` below IS the rule, exported, and it is built out of
// `convictionOf` from lib/whyPick — the same function The Read already calls.
//
// The rule, unchanged: for each category take the top-scored designated pick,
// measure how far clear of its OWN category's field it stands in that
// category's own standard deviations, and the largest z leads. Comparing an
// hr_score to a hit_score directly is meaningless — different models, different
// spreads — but "how far clear of his own field" is the same question asked
// four times, so the four answers rank against each other.
//
// FOLLOW-UP (noted, not done — components/TheRead.js is owned by another
// change this round): TheRead.js still carries its own copy of CATS and of the
// twelve lines that do this selection. It should import `CALL_CATS` and
// `callOfTheNight` from here (or both should move to lib/) and delete its
// copy. Until it does, the two must be kept identical by hand — the guards,
// the score fallback, the sort and its tiebreak below are byte-for-byte the
// same as its own, deliberately.
//
// TILES LOSE TO SENTENCES. Everything below is prose with numbers in it; the
// only non-text furniture is the coloured rule down the left edge, which is
// the same device The Read's own hero uses so the two read as one voice.

const num = (v, d = null) => {
  const x = Number(v)
  return Number.isFinite(x) ? x : d
}
const ord = (i) => (i % 10 === 1 && i % 100 !== 11 ? 'st' : i % 10 === 2 && i % 100 !== 12 ? 'nd' : i % 10 === 3 && i % 100 !== 13 ? 'rd' : 'th')

// A player can carry more than one role ("TOP/HR"), so a category match is a
// membership test, not an equality test — a double-up still counts for its
// non-primary role. Same helper, same semantics, as The Read's.
const hasRole = (p, role) => String(p?.game_pick_role || '').split('/').map((s) => s.trim().toUpperCase()).includes(role)

/**
 * The four calls, in the order they are asked for. HR first, which is also the
 * tiebreak order when two categories tie on conviction (Array#sort is stable).
 * C.green rather than a literal — the shipped value is the same #4ade80, and
 * this way a palette swap carries it.
 */
export const CALL_CATS = [
  { role: 'HR', label: 'the home run call', bar: 'needs to go deep', color: C.orange },
  { role: 'HIT', label: 'the base-hit call', bar: 'needs one hit', color: C.purple },
  { role: 'HRR', label: 'the runs call', bar: 'needs two of hits / runs / RBI', color: C.cyan },
  { role: 'CONTACT', label: 'the total-bases call', bar: 'needs two total bases', color: C.green },
]

/**
 * THE SELECTION. One implementation, two surfaces.
 *
 * @param players the whole slate (Home and the Bot tab are both handed
 *                `allPlayers`, so both see the same pools)
 * @returns { calls, hero, rest } — hero is the call of the night, rest is the
 *          other three in category order. null when there is nothing to read.
 *
 * Conviction is measured against each category's DESIGNATED pool, not the whole
 * slate: the question is how far clear of the other names the bot tagged for
 * this market he stands, and that is what makes the four numbers comparable.
 */
export function callOfTheNight(players = []) {
  const rows = (players || []).filter(Boolean)
  if (!rows.length) return null

  const calls = CALL_CATS.map((c) => {
    const pool = rows.filter((p) => hasRole(p, c.role))
    if (!pool.length) return null
    const score = (p) => num(p?.[`${c.role.toLowerCase()}_score`], num(p?.hr_score, 0)) || 0
    const lead = [...pool].sort((a, b) => score(b) - score(a))[0]
    return {
      ...c,
      p: lead,
      depth: pool.length,
      score: score(lead),
      conv: convictionOf(lead, pool, score),
      why: whyPick(lead, rows, c.role),
    }
  }).filter(Boolean)
  if (!calls.length) return null

  // Ties and single-name pools (z = 0, no field to be clear of) fall back to
  // source order, which is the categories' own order — HR first.
  const ordered = [...calls].sort((a, b) => (b.conv?.z ?? -99) - (a.conv?.z ?? -99))
  const hero = ordered[0] || null
  return { calls, hero, rest: calls.filter((c) => c !== hero) }
}

export default function ReadTeaser({ players = [], odds: oddsProp = null, onNavigate, onPlayerClick }) {
  // THE PRICE IS OPTIONAL, AND SO IS THIS FETCH. Home is mounted by
  // Dashboard.js without an `odds` prop and that file is not ours to change,
  // so the teaser reads the same published board itself — one small JSON, the
  // same file every other odds surface uses. If a caller ever does pass odds
  // down, the prop wins and no fetch happens. No board, no key, no network:
  // the price clause simply doesn't render, which is its normal state.
  const [fetched, setFetched] = useState(null)
  useEffect(() => {
    if (oddsProp) return undefined
    let alive = true
    fetch(`${oddsPaths()[0]}?t=${Date.now()}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive && oddsLooksReal(j)) setFetched(j) })
      .catch(() => {})
    return () => { alive = false }
  }, [oddsProp])
  const odds = oddsProp || fetched

  const read = useMemo(() => callOfTheNight(players), [players])
  const hero = read?.hero
  if (!hero) return null

  const p = hero.p
  const hr9 = num(p?.pitcher_hr9)
  const spot = num(p?.lineup_spot)
  const why = hero.why
  const conv = hero.conv

  // Only when the book is asking for the same thing the pick's bar asks for.
  // quoteFor sets `matches` false when it isn't — an HR call beside a 1.5 line
  // is quoting a multi-homer bet. The percentage here is the break-even the
  // PRICE implies, not a score: the two must never be dressed alike.
  const q = quoteFor(odds, p, hero.role)
  const priced = q && q.matches !== false && q.over != null ? q : null
  const need = priced ? (priced.implied ?? impliedPct(priced.over)) : null

  // Said only when it is true and measurable, on the same guards The Read
  // uses for its own clearance line, so the two pages can never make
  // different claims about how clear this pick stands.
  const clear = conv && conv.depth >= 3 && conv.gap != null && conv.z >= 0.8 ? conv : null

  const Fig = ({ children, col = C.text }) => (
    <b style={{ color: col, fontFamily: NUM_FONT }}>{children}</b>
  )

  return (
    <div style={{
      background: `linear-gradient(155deg, ${hero.color}0f, ${C.bg2} 60%)`,
      border: `1px solid ${C.border}`, borderLeft: `3px solid ${hero.color}`,
      borderRadius: 14, padding: '13px 16px', marginBottom: 14,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 5 }}>
        <span style={{ fontSize: 9.5, fontWeight: 900, color: hero.color, letterSpacing: '.1em', fontFamily: NUM_FONT, textTransform: 'uppercase' }}>
          📰 The call of the night
        </span>
        <span style={{ fontSize: 9.5, color: C.text3 }}>
          {hero.label} · {hero.bar} — the one pick standing furthest clear of its own category tonight
        </span>
      </div>

      <div style={{ fontSize: 19, fontWeight: 900, letterSpacing: '-.02em', lineHeight: 1.2, marginBottom: 6 }}>
        <span onClick={() => onPlayerClick?.(p)} style={{ cursor: onPlayerClick ? 'pointer' : 'default' }}>{nameOf(p)}</span>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: C.text3, fontFamily: NUM_FONT }}> {teamOf(p)} vs {oppOf(p)}</span>
      </div>

      {/* THE ARGUMENT, IN ONE LINE. Same three facts The Read's hero opens on
          — the arm, what it gives up, where he hits — and each clause drops
          out rather than guesses when its field is missing. */}
      <div style={{ fontSize: 12.5, color: C.text2, lineHeight: 1.7, maxWidth: 720 }}>
        He draws {clean(p?.pitcher_name, 'a TBD arm')}
        {hr9 != null && hr9 > 0 && <>, who is giving up <Fig col={hr9 >= 1.4 ? C.red : C.text2}>{hr9.toFixed(2)}</Fig> home runs per nine</>}
        {spot != null && spot > 0 && <>, and he hits {spot}{ord(spot)}</>}.
        {clear && (
          <> He is <Fig col={C.text}>{clear.gap.toFixed(1)}</Fig> points clear of the next {hero.role} name
            of <Fig col={C.text}>{clear.depth}</Fig> tagged — <Fig col={C.text}>{clear.z.toFixed(1)}</Fig> standard
            deviations above that field, which is what makes this the lead and not one of the other three.</>
        )}
      </div>

      {/* WHAT IS CARRYING IT — measured against tonight's own slate by
          lib/whyPick, not narrated. The half working against it comes too: a
          front page that prints only the flattering driver is advertising. */}
      {why && (why.top.length > 0 || why.against) && (
        <div style={{ fontSize: 12, color: C.text2, lineHeight: 1.7, maxWidth: 720, marginTop: 4 }}>
          {why.top.length > 0 && (
            <>
              <span style={{ color: hero.color }}>Carrying it:</span> {why.top[0].text}
              {why.top[0].pct != null && <> — <b style={{ color: C.text }}>{standingPhrase(why.top[0].pct)}</b></>}.{' '}
            </>
          )}
          {why.against && (
            <>
              <span style={{ color: C.text3 }}>Against it:</span> {why.against.text}
              {why.against.pct != null && <> — <b style={{ color: C.text3 }}>{standingPhrase(why.against.pct)}</b></>}.
            </>
          )}
        </div>
      )}

      {priced && (
        <div style={{ fontSize: 11.5, color: C.text3, lineHeight: 1.7, maxWidth: 720, marginTop: 4 }}>
          The price: <Fig col={C.text2}>{fmtOdds(priced.over)}</Fig> to clear it
          {need != null && <> — which needs it to happen <Fig col={C.text2}>{Math.round(need)}%</Fig> of the time to be worth taking</>}
          {priced.best_over != null && priced.best_over !== priced.over && (
            <>; best on the board is <Fig col={C.text2}>{fmtOdds(priced.best_over)}</Fig>{priced.best_book ? ` at ${priced.best_book}` : ''}</>
          )}.
        </div>
      )}

      <div style={{ fontSize: 10.5, color: C.text3, lineHeight: 1.6, marginTop: 7 }}>
        This is the opening of tonight&apos;s read. The rest — the other three calls with their prices,
        the ISO lens the site deliberately does not rank on, and the names it is steering clear of —
        is on the Bot page.{' '}
        <span onClick={() => onNavigate?.('bot')} style={{ color: hero.color, cursor: 'pointer', fontWeight: 800 }}>
          Read the whole thing →
        </span>
      </div>
    </div>
  )
}
