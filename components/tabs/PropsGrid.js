'use client'
import { useMemo, useState } from 'react'
import { C } from '../../lib/theme'
import { nameOf, teamOf, oppOf, txt, playerId, mlbId, PLATE_BAR } from '../../lib/player'
import { quoteFor, fmtOdds } from '../../lib/odds'
import {
  GROUP_ORDER, rolesOf, primaryRole, roleColor,
  verdictFor, sentenceFor, chipsFor,
} from '../../lib/verdict'
import PickCompare from '../PickCompare'
import { mlbFaceStrict } from '../PlayerFace'
import MlbTeamMark from '../MlbTeamMark'
import PropsSheet from '../PropsSheet'
import { useIsPhone } from '../MobileFold'
import PropCards from '../props/PropCards'

// ══ PROPS GRID — THE MOBILE PILOT PAGE ══════════════════════════════════════
// built 2026-08-23 · REDRAWN 2026-08-23 (Donovan: "make the props page better
// and more futuristic looking but still simple … i dont see it on the props
// page or the use of it … make it look visually different")
//
// The first build answered the BRIEF (verdict first, depth on tap) and lost
// the LOOK: the cards were the same 1px-border, 10px-type, bg2 rectangles as
// every other list on the site, sitting under ~500px of page furniture —
// hero tiles, search, team dropdown, tab bar, a three-line paragraph, TWO
// rows of pills and a SECOND search box that duplicated the one at the top
// of every page. On a phone you scrolled half a screen to reach the first
// card, and when you got there nothing told you this page was new. That is
// what "I don't see it" meant.
//
//   1. THE DIAL. One number per card, drawn as a ring that fills to the
//      score — an instrument, not a table cell. It is the only loud thing on
//      the card and the only thing on this site that looks like this, which
//      is the whole point: the page announces itself. It now lives in
//      components/VerdictHero.js, because the player and pitcher modals open
//      the same way (Donovan, same day: "upgrade both ... modals like this").
//   2. AIR. Card padding, name size and tile size all step up; each card
//      carries a soft wash of its own badge colour so a board of them reads
//      as a stack of distinct decisions rather than one grey list.
//   3. THE FURNITURE IS GONE. The second search box is deleted (Controls at
//      the top of the page already filters `players` by name/team/pitcher —
//      this one filtered the same rows a second time), the paragraph moved
//      into TabExplainer where every other tab's lives, and the two pill rows
//      are one sideways-scrolling rail on the standard .chip-row.
//   4. THE PRICE, QUIETLY. "odds are cool make subtle" — the book's own
//      number sits dimmed at the end of the matchup line, and only when the
//      book is quoting the same bar the pick has to clear (quoteFor's
//      `matches`; a HR pick graded on 1+ cannot wear a price for 2+).
//
// WHY-THIS-ONE (the long-open question #7) — Donovan, asked directly: "idk
// please make simple". So the badge's own market score led, and under it
// ONE sentence. Which sentence, and which score, is lib/verdict.js's job.
// CLOSED 2026-09-01 — asked which field should lead, he picked "Flag /
// verdict". The badge is now the card's left-hand instrument (VerdictHero
// lead="badge"), the score a small chip on the right. Same sentence, same
// tiles, same everything else.
//
// Everything else is deliberate: default population is the decision-ready set
// (badge holders + WATCH), "Everyone" is one pill away, cards are ranked only
// against cards measured the same way, and the drill-down is the existing
// player modal — the full grid, splits and zone map already live there.

// THE GRID ITSELF IS SHARED NOW (2026-10-04, Donovan: "make sure the props
// pages look like the mlb one"): components/props/PropCards.js is this page's
// markup and rules, moved out unchanged so TUDDY, LAMP and BUCKETS run the same
// grid. This file is MOONSHOT's ADAPTER -- its markets (lib/verdict.js), its
// card content, its prices and its original words -- plus the phone sheet.

// WATCH is the coverage tier, so its price is the home-run market's; a hitter
// with no badge is in no market at all and gets no price rather than a
// borrowed one.
const PRICE_ROLE = { TOP: 'TOP', HR: 'HR', HIT: 'HIT', HRR: 'HRR', CONTACT: 'CONTACT', WATCH: 'HR' }
// The bar under the badge on the plate — the shortest true statement of what
// the badge has to clear. verdict.js's `market` is the English name; this is
// the width a 64px plate can carry.
// PLATE_BAR now lives in lib/player.js (shared with The Four).

function priceFor(odds, r, role) {
  const cat = PRICE_ROLE[role]
  if (!odds || !cat) return null
  const q = quoteFor(odds, r, cat)
  if (!q || !q.matches) return null
  const price = fmtOdds(q.over)
  return price === '—' ? null : price
}

// The hitter's own facts, as TAGS. matchup_reason arrives as ' · '-joined
// fragments ("RHB attacks pitcher weak side · low-K pitcher 18% · pitcher
// HR/9 1.71 / WHIP 1.54 · HRW 42 / IHR 0.18 / 350+ 14%").
//
// ── 2026-09-02, Donovan: "the extra lines of words we added, make those
// into the bubble tags." ─────────────────────────────────────────────────
// Rejoining them into one grey sentence is what a paragraph is for, and
// this is not a paragraph — it is a list of separate measurements that
// happens to arrive delimited. On a card it wrapped to two dim lines of
// run-on text directly above a row of pills that say the same KIND of
// thing, so the card had two visual grammars for one class of fact.
//
// Split on the bot's own ' · ', then again on ' / ', which is its second
// delimiter inside a fragment — that is what turns "HRW 88 / IHR 0.18 /
// 350+ 27%" into three readable tags instead of one long one. The inner
// split requires spaces around the slash, so "HR/9" survives intact.
//
// An empty or "None" field is no tags, not a dash.
function matchupTags(r) {
  const t = txt(r?.matchup_reason).trim()
  if (!t || /^none$/i.test(t)) return null
  const out = t.split(/\s*·\s*/)
    .flatMap((part) => part.split(/\s+\/\s+/))
    .map((x) => x.trim())
    .filter(Boolean)
  return out.length ? out : null
}

// "Everyone" is 266 hitters on a full slate, and each card here is a real
// piece of paint (a conic ring, a wash, a glow). Rendering all of them at once
// is a phone-melting amount of work for a view nobody scrolls to the bottom
// of, so it stops at 60 — and SAYS SO, with the rest one tap away. A cap that
// doesn't announce itself reads as "that's everybody", which is the one thing
// a coverage board must never imply.

// ══ PRECISION (2026-08-23) ══════════════════════════════════════════════════
//
// Donovan: "lets focus on precision instead of coverage … i just feel like now
// theres hell picks, to every game's got the top and a hr pick idk … i was
// thinking what about the 4 best bets then from dividing up the picks top hit
// hrr bases whatever, what would the scoring look like if we did that over the
// time — if bad or not good just forget that idea."
//
// bots/precision_study.py measured it over 25 graded nights, every pick on its
// own bar (a homer for the HR pick, a base hit for the HIT pick, 2+ H+R+RBI
// for HRR, 2+ total bases for CONTACT). The numbers below are that study's,
// not an estimate:
//
//     one per market (The Four)   65.0%   over 100 picks
//     two per market              ~59%
//     three per market            ~55%
//     every designation           41.2%   over 2,048 picks
//
// So this is a CUT, not a re-rank: keep the top K of each market's own block
// and hide the rest behind the existing "Show the rest". The ordering inside a
// block is untouched — it is already each market's own score, which is the
// house rule and the reason the study's ranking was legitimate in the first
// place.
//
// WHY PER-MARKET AND NOT TOP-N-OVERALL. A top-4-overall board can be four HR
// picks on a night the HR board runs hot, and HR is the hardest bar on the
// site — 21.8% against 74.3% for 1+ hit. One per market is the shape Donovan
// described ("dividing up the picks") AND the shape that measured best.
//
// DEFAULT FLIPPED TO "1 EACH" (2026-08-29). It shipped off-by-default while
// the study was 25 nights; both the live review and the outside review then
// found the same thing a fresh visitor finds — sixty cards on a page whose
// job is a decision. The official cut leads now: The Four first, the full
// coverage board one tap away on the same remembered pill. Anyone who has
// ever picked a depth keeps their choice — localStorage still wins.
const MLB_COPY = {
  priced: "Cards where the book has posted a number on this pick's OWN bar. A 1+ HR pick cannot borrow a 2+ price to look priced.",
  upcoming: "Games that have not started yet. The one that earns its place after about 4pm, when half the board is already unactionable and looked identical to the half that wasn't.",
  watched: 'Only names on your watchlist.',
  sortScore: "Each market's own score, which is the page's default and the only ranking the house rule allows across a whole block.",
  sortPrice: 'Longest price first, within each market block. An unpriced card sinks rather than sorting as if it were even money.',
  sortTime: 'Earliest first pitch first, within each market block.',
  empty: 'No slate published yet, or the market filter left nobody. Clear it above.',
  precision: {
    0: 'Every badge the bot published tonight.',
    1: 'The single best pick in each market — the same board as The Four on Live.',
  },
}

function mlbAdapter(odds) {
  return {
    markets: GROUP_ORDER,
    pillLabel: (k) => (k === 'WATCH' ? '👀 Watch' : k),
    groupLabel: (k) => verdictFor(k).market,
    color: (k) => roleColor(k),
    rolesOf,
    primaryOf: primaryRole,
    score: (r, k) => verdictFor(k).score(r),
    idOf: playerId,
    keyOf: (r) => `${r.player_id}-${r.game_pk}`,
    // The card wears the market you are BROWSING (the group's own key).
    card: (r, role) => {
      const v = verdictFor(role)
      const arm = txt(r?.pitcher_name).trim()
      const hand = txt(r?.pitcher_throws).trim()
      return {
        photo: mlbFaceStrict(mlbId(r), 96),
        dialTitle: `${role === 'NONE' ? 'Overall' : role} score — the bot's number for this market`,
        market: PLATE_BAR[role] || v.market,
        title: nameOf(r),
        badge: role === 'WATCH' ? 'WATCH' : role === 'NONE' ? 'NONE' : role,
        badgeQuiet: role === 'WATCH' || role === 'NONE',
        meta: <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, minWidth: 0, maxWidth: '100%' }}>
          <MlbTeamMark abbr={teamOf(r)} style={{ height: 16 }} />
          <span>vs</span>
          <MlbTeamMark abbr={oppOf(r)} style={{ height: 16 }} />
          {arm ? <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>· {arm}{hand ? ` (${hand})` : ''}</span> : null}
        </span>,
        metaRight: priceFor(odds, r, role),
        line: sentenceFor(r, role),
        facts: matchupTags(r),
        chips: chipsFor(r, role),
        tiles: v.tiles(r),
      }
    },
    priced: (r, k) => {
      const q = quoteFor(odds, r, PRICE_ROLE[k] || 'HR')
      return !!q && q.over != null && q.matches !== false
    },
    priceNum: (r, k) => {
      const q = quoteFor(odds, r, PRICE_ROLE[k] || 'HR')
      return q && q.over != null && q.matches !== false ? Number(q.over) : null
    },
    startsAt: (r) => Date.parse(r?.game_time || ''),
    precisionKey: 'moonshot_precision_v1',
    sortTimeLabel: 'First pitch',
    picksTitle: 'every bat wearing a badge tonight',
    unit: 'badge',
    copy: MLB_COPY,
  }
}

export default function PropsGrid({ players = [], odds = null, onPlayerClick, onWatch, watchIds }) {
  // On a phone a tapped card opens components/PropsSheet.js (one player, whole
  // screen); on anything wider the player modal opens directly.
  const isPhone = useIsPhone(760)
  const [sheet, setSheet] = useState(null)
  const openCard = (p) => { if (isPhone) setSheet(p); else onPlayerClick?.(p) }
  const a = useMemo(() => mlbAdapter(odds), [odds])
  return (
    <>
      <PropCards a={a} rows={players} onOpen={openCard} onWatch={onWatch} watchIds={watchIds}
        compare={<PickCompare players={players} odds={odds} onPlayerClick={onPlayerClick} />}
        theme={C} accent={C.orange} />
      {sheet && (
        <PropsSheet
          player={sheet}
          odds={odds}
          onClose={() => setSheet(null)}
          onFullResearch={(p) => { setSheet(null); onPlayerClick?.(p) }}
          onWatch={onWatch}
          watched={watchIds?.has(playerId(sheet))}
        />
      )}
    </>
  )
}
