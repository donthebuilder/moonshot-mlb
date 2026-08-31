'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { nameOf, teamOf, oppOf, playerId, n, clean } from '../lib/player'
import { hrScore } from '../lib/player'
import { roleBadge } from '../lib/roleBadge'
import { hitterArchetype, marketFamily, primaryRole } from '../lib/verdict'
import { catColor } from '../lib/scales'
import { quoteFor, fmtOdds, impliedPct, hrPerGame, fairOdds } from '../lib/odds'
import DenseTable from './DenseTable'
import { Empty } from './ui'
import { DIV_FIELD } from '../lib/scales'

// 🎯 THE SHORTLIST — who stands out tonight, and whether the number is right.
//
// 2026-08-15, from Donovan's screenshot ("Who Stands Out for a Home Run?"):
// a ranked HR table with two views — strongest profiles, and profiles whose
// CURRENT PRICE leaves room. The second view is the one with money in it, and
// it is exactly the split their table drew: "strong hitter, bad number? It
// stays off the second list."
//
// Built MOONSHOT's way rather than copied:
//
//   · The rate is REAL — hr_per_pa through his lineup spot's plate
//     appearances, the same per-game probability the price bubbles use. Their
//     "historical HR rate" and our rate answer the same question; ours states
//     its source.
//   · ROOM is gated the way every comparison on this site is gated: it only
//     exists when the book is on the 0.5 line (1+ HR, the bet the profile is
//     about). A 1.5 line is a different bet and renders as one.
//   · The READ column never claims more than the row can support. No price →
//     "no price posted", which on most slates is most rows — their table
//     showed the same honestly, and it's the right call.
//   · It's a DenseTable, so every column sorts on click — sort by ROOM and
//     you have their second view without a second tab.

const READ = {
  value: { word: 'market’s behind', tone: '#4ade80', rank: 5 },
  look: { word: 'worth a look', tone: '#a3e635', rank: 4 },
  fair: { word: 'fairly priced', tone: C.text3, rank: 3 },
  short: { word: 'needs better odds', tone: '#f87171', rank: 2 },
  wrongline: { word: 'book’s on 2+', tone: '#FCD34D', rank: 1 },
  norate: { word: 'priced, no rate', tone: C.text3, rank: 1 },
  none: { word: 'no price posted', tone: C.text3, rank: 0 },
}

// ── THE STAT PACKS (2026-08-31) ─────────────────────────────────────────────
//
// Donovan: "this page need more stats on the players". The columns he wanted
// all exist and all publish on every row of the slate -- exit velocity, barrel
// rate, hard-hit rate, fly-ball rate, pull rate, strikeout rate, the locked
// last-five line, park factor -- and every one of them was already in the
// payload and on none of the screen.
//
// They are NOT all added as columns. Fifteen more columns is the odds board's
// mistake ("cant read that", 2026-08-30) repeated on a wider table. Instead the
// middle of the row swaps: identity, the bot's read and the odds verdict are
// permanent, and the block between them answers one question at a time.
//
//   PROFILE  the ranking as it was -- score, real rate, the denominator
//            behind it, ISO, park-adjusted score, the arm
//   CONTACT   how the ball is actually leaving the bat: EV, barrel, hard-hit,
//            lift, pull, and the strikeout rate that caps all of it
//   FORM      what he has actually done lately, plus the two shape scores and
//            the ballpark
//
// Every one of these is a real published field, not a derivation invented for
// the table. Nothing here is computed from the odds -- the price columns stay
// downstream of the profile, which is the whole reason the READ column is
// allowed to speak.
const PACKS = [
  ['profile', 'Profile'],
  ['contact', 'Contact quality'],
  ['form', 'Recent form'],
]

// Rates publish as fractions (barrel .267 max, hard-hit .759 max); printed as
// whole percents because nobody reads a barrel rate as ".04".
const pct1 = (v) => (v == null ? '—' : `${(v * 100).toFixed(1)}%`)

export default function Shortlist({ players = [], odds = null, onPlayerClick, onWatch, watchIds = null }) {
  const [view, setView] = useState('profile')
  const [pack, setPack] = useState('profile')

  const rows = useMemo(() => {
    return (players || [])
      .map((p) => {
        const score = hrScore(p)
        if (!Number.isFinite(score) || score <= 0) return null
        const rate = hrPerGame(p)
        const q = quoteFor(odds, p, 'HR')
        const priced = q && q.over != null
        const need = priced ? (q.implied ?? impliedPct(q.over)) : null
        const room = priced && q.matches !== false && rate != null && need != null
          ? rate - need : null
        let read = 'none'
        if (priced && q.matches === false) read = 'wrongline'
        else if (room != null) {
          read = room >= 5 ? 'value' : room >= 2 ? 'look' : room <= -4 ? 'short' : 'fair'
        } else if (priced) {
          // A price with no rate beside it is NOT "no price posted" — it's a
          // row the site declines to judge. The fixture caught this reading
          // as the wrong absence.
          read = 'norate'
        }
        // ── WHAT KIND OF PICK IS THIS (2026-08-30) ───────────────────
        //
        // Donovan: "need to know the type of pick wither watch top and
        // therne threr role too and more stats". Fair — this table ranked
        // by HR score and never said what the BOT had called the man. A
        // 55.7 the bot tagged POWER WATCH and a 55.8 it tagged HR BET are
        // different objects and the shortlist printed them identically.
        //
        // Two different fields, and not the same question:
        //   final_hr_role   the conviction tier — HR BET / HR LEAN / POWER
        //                   WATCH / AVOID. What the bot thinks of the bat.
        //   game_pick_role  the slot he was designated in for HIS game —
        //                   TOP / HR / HRR / HIT / CONTACT / WATCH. One per
        //                   group per game, so this is scarcity, not opinion.
        // Both published on every row; neither was on screen.
        //
        // Resolved through lib/roleBadge.js rather than by reading the
        // string: colour used to be keyed on the emoji, so a de-emojified
        // value fell through to orange. Its tier is the semantic one and it
        // survives the bot changing format — which it has (see the ship note).
        const tier = roleBadge(p?.final_hr_role, C)
        // ── THE TYPE OF BAT, NOT THE TIER (2026-08-31) ───────────────
        //
        // Donovan: "i thought we did away the the hr lean and and stuff
        // and use like ther role catergories hit machince mulit hit
        // those ones."
        //
        // He is right, and this column was the last place still leading
        // with the tier. HR BET / HR LEAN / POWER WATCH is a conviction
        // ladder -- it says how much the bot likes him and nothing about
        // what kind of hitter he is, so four rows in a row read "HR LEAN"
        // and the column carried no information across them. lib/verdict's
        // hitterArchetype has answered the other question since 2026-08-23
        // and is what the props cards, the modals and The Read already say:
        // Moonshooter, Laser, Matchup Hunter, Pull-Side Threat, Heater,
        // Hit Machine, Multi-Hit Threat, Contact King.
        //
        // The archetype is read in HIS OWN designated market's family, so
        // a bat the bot designated HIT reads "Hit Machine" rather than
        // being forced through the home-run ladder; an undesignated hitter
        // falls back to his strongest lane, which on this table is the
        // home-run one. That is hitterArchetype's own default and it is
        // deliberately not overridden here -- a shortlist that renamed a
        // hit bat into a power archetype would be the same category error
        // the tier column was making.
        //
        // The tier is NOT lost. It moves into the tooltip, where a
        // conviction ladder belongs: it is one sentence of context on a
        // hitter you are already looking at, not a sortable column.
        const famRole = primaryRole(p) || 'HR'
        const arch = hitterArchetype(p, famRole)
        const fam = marketFamily(famRole)
        const archColor = catColor('role', fam === 'BASES' ? 'CONTACT' : fam) || C.orange
        // KEEP EVERY PART. game_pick_role is multi-valued on the live slate —
        // 'HIT/WATCH', 'TOP/CONTACT', 'HIT/CONTACT/WATCH' — and the first cut
        // took .split('/')[0] like TheRead does. That drops WATCH whenever it
        // is not first, and WATCH is the single most common designation on the
        // board (29 of the 89 designated rows tonight). It is also the exact
        // thing this column was added to show, so it is kept whole.
        const pick = clean(p?.game_pick_role, '')
          .split('/').map((x) => x.trim().toUpperCase()).filter(Boolean)
        const hr = n(p?.season_hr, null)
        const pa = n(p?.season_pa, null)
        return {
          _key: `${p.player_id}`,
          _raw: p,
          watched: !!watchIds?.has(playerId(p)),
          name: nameOf(p),
          team: teamOf(p),
          opp: oppOf(p),
          type: arch.label,
          _typeColor: archColor,
          _typeTitle: `${arch.label} — ${arch.why}`
            + `\nRead in his ${fam === 'HR' ? 'home-run' : fam === 'HIT' ? '1+ hit' : fam === 'HRR' ? 'H+R+RBI' : 'total-bases'} lane.`
            + (tier.known ? `\nThe bot's conviction tier on the bat: ${tier.label}.` : ''),
          _tier: tier.known ? tier.label : '',
          pick: pick.join('/'),
          _pickParts: pick,
          spot: n(p?.lineup_spot, null),
          hr,
          pa,
          // The RATE behind the fraction, so the column can be judged against
          // the slate rather than read as two bare numbers.
          hrpa: hr != null && pa ? hr / pa : null,
          iso: n(p?.season_iso, null),
          hrw: n(p?.hrw_score, null),
          arm: n(p?.pitcher_hr9, null),
          // CONTACT pack — all published on 251 of 251 rows tonight.
          ev: n(p?.recent_ev, null),
          barrel: n(p?.recent_barrel_rate, null),
          hard: n(p?.recent_hard_hit_rate, null),
          fb: n(p?.recent_fb_rate, null),
          pull: n(p?.recent_pull_rate, null),
          krate: n(p?.season_k_rate, null),
          // FORM pack — the locked last-five line plus two shape scores.
          l5h: n(p?.last5_hits, null),
          l5hr: n(p?.last5_hr, null),
          l5xbh: n(p?.last5_xbh, null),
          multi: n(p?.multi_hit_score, null),
          damage: n(p?.damage_conversion_score, null),
          park: n(p?.park_hr_factor, null),
          score,
          rate,
          price: priced ? q.over : null,
          priceTxt: priced ? (q.matches === false ? `≠${fmtOdds(q.over)}` : fmtOdds(q.over)) : '—',
          assume: need,
          fair: rate != null ? fairOdds(rate) : null,
          room,
          read,
          readTxt: READ[read].word,
          _readRank: READ[read].rank,
        }
      })
      .filter(Boolean)
      .sort((a, b) => (view === 'profile'
        ? b.score - a.score
        : (b.room ?? -1e9) - (a.room ?? -1e9) || b.score - a.score))
      .slice(0, 40)
  }, [players, odds, view, watchIds])

  // ── HR/PA GETS A THRESHOLD (2026-08-31) ─────────────────────────────────
  //
  // Donovan: "hr /pa show the number abo or below that threshole or dnumber",
  // then "yes the arrows".
  //
  // The threshold is THE MIDDLE OF THIS SHORTLIST, not a league constant and
  // not a round number someone picked. Two reasons. It is the same anchor the
  // HR score column already uses (DIV_FIELD, "▲ above the middle of this
  // shortlist"), so the two columns answer to the same idea of "compared to
  // what" — and a league-wide rate would mark almost every row on a top-40
  // power list as above average, which is true and completely useless.
  //
  // MEDIAN, not mean: the top of this list contains genuine outliers by
  // construction, and a mean would let them drag up the very line they are
  // being measured against.
  //
  // The arrow is on the RATE, printed beside the fraction it comes from, so
  // the denominator stays visible — 22/391 and 7/131 are not the same claim
  // even when the rate is.
  const hrpaMid = useMemo(() => {
    const xs = rows.map((r) => r.hrpa).filter((v) => Number.isFinite(v)).sort((a, b) => a - b)
    if (!xs.length) return null
    const m = Math.floor(xs.length / 2)
    return xs.length % 2 ? xs[m] : (xs[m - 1] + xs[m]) / 2
  }, [rows])

  if (!rows.length) return <Empty text="No slate loaded, so there is nothing to rank yet." />

  const anyPriced = rows.some((r) => r.price != null)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, flexWrap: 'wrap', marginBottom: 4 }}>
        <span style={{ fontSize: 12.5, fontWeight: 900 }}>🎯 Who stands out for a homer</span>
        <span style={{ fontSize: 9.5, color: C.text3 }}>
          top 40 by the view you pick · every column sorts on click
        </span>
      </div>
      <div style={{ display: 'flex', gap: 5, marginBottom: 9 }}>
        {[['profile', 'Strongest profiles'], ['fit', 'Best odds fits']].map(([k, label]) => (
          <button key={k} onClick={() => setView(k)} style={{
            padding: '3px 11px', borderRadius: 999, cursor: 'pointer', fontSize: 10,
            fontWeight: 800, fontFamily: NUM_FONT,
            border: `1px solid ${view === k ? C.orange : C.border}`,
            background: view === k ? 'rgba(249,115,22,.14)' : 'transparent',
            color: view === k ? C.orange : C.text3,
          }}>{label}</button>
        ))}
        {view === 'fit' && !anyPriced && (
          <span style={{ fontSize: 9.5, color: C.text3, alignSelf: 'center' }}>
            no board published yet — every row reads &ldquo;no price posted&rdquo; until the odds run lands
          </span>
        )}
      </div>
      {/* The stat pack swaps the MIDDLE of the row only. Identity, the type
          of bat, the designation and the whole odds verdict never move, so
          switching packs never costs you the thing you were reading. */}
      <div style={{ display: 'flex', gap: 5, marginBottom: 9, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 9, color: C.text3, textTransform: 'uppercase', letterSpacing: '.07em' }}>Stats</span>
        {PACKS.map(([k, label]) => (
          <button key={k} onClick={() => setPack(k)} style={{
            padding: '2.5px 10px', borderRadius: 999, cursor: 'pointer', fontSize: 9.5,
            fontWeight: 800, fontFamily: NUM_FONT,
            border: `1px solid ${pack === k ? C.orange : C.border}`,
            background: pack === k ? 'rgba(249,115,22,.14)' : 'transparent',
            color: pack === k ? C.orange : C.text3,
          }}>{label}</button>
        ))}
        <span style={{ fontSize: 9, color: C.text3 }}>
          {pack === 'profile' ? 'the ranking and what it is built from'
            : pack === 'contact' ? 'how the ball is leaving the bat — every one a batted-ball measurement, not a score'
              : 'what he has actually done in the locked last five, and tonight’s park'}
        </span>
      </div>

      {/* key={view}: DenseTable keeps its own sort stack, and once a header
          has been clicked that stack overrides row order — so the profile/fit
          pills re-highlighted and nothing moved (the audit's find). Remounting
          on the toggle resets the stack, which is what the pill promises. */}
      <DenseTable
        key={`${view}-${pack}`}
        rows={rows}
        onRowClick={onPlayerClick ? (r) => onPlayerClick(r._raw) : null}
        initialSort={null}
        heatMode="sorted"
        maxHeight={560}
        columns={[
          // 2026-08-30, Donovan: the shortlist ("i like the short list tho")
          // was missing the one action every other player row on the site
          // has — no way to save a name here without leaving to find him on
          // another tab. Same ★/☆ button and behavior as PlayerCard.
          ...(onWatch ? [{
            key: 'watched', label: '', heat: false, w: 28,
            fmt: (v, r) => (
              <button
                onClick={(e) => { e.stopPropagation(); onWatch(r._raw) }}
                title={v ? 'Remove from watchlist' : 'Add to watchlist'}
                style={{
                  background: 'transparent', border: 0, cursor: 'pointer',
                  color: v ? C.yellow : C.text3, fontSize: 13, lineHeight: 1, padding: 0,
                }}
              >{v ? '★' : '☆'}</button>
            ),
          }] : []),
          { key: 'name', label: 'Player', heat: false, w: 150, bold: true, sticky: true },
          { key: 'team', label: 'Tm', heat: false, w: 34, mono: true, dim: true },
          { key: 'opp', label: 'Opp', heat: false, w: 40, mono: true, dim: true },
          // ── TYPE, NOT TIER (2026-08-31) ───────────────────────────
          // The archetype from lib/verdict.js — the same words the props
          // cards and both modals already use, so a bat cannot be called
          // one thing here and another thing one click away. Wider than
          // the tier badge was (118 vs 74) because "Multi-Hit Threat" and
          // "Matchup Hunter" are real values and a clipped archetype is
          // worse than no archetype.
          { key: 'type', label: 'Type', heat: false, w: 118,
            title: 'What KIND of hitter he is, read in his own designated market’s lane — Moonshooter, Laser, Matchup Hunter, Pull-Side Threat, Heater, Hit Machine, Multi-Hit Threat, Contact King. Hover a row for the reason and for the bot’s conviction tier on the bat.',
            fmt: (v, r) => (!v ? <span style={{ color: C.text3 }}>—</span> : (
              <span title={r._typeTitle} style={{
                fontFamily: NUM_FONT, fontSize: 8.5, fontWeight: 900, letterSpacing: '.03em',
                padding: '1.5px 6px', borderRadius: 5, whiteSpace: 'nowrap',
                border: `1px solid ${r._typeColor}55`, background: `${r._typeColor}14`, color: r._typeColor,
              }}>{v}</span>
            )) },
          { key: 'pick', label: 'Pick', heat: false, w: 124,
            title: 'The slot(s) the bot designated him in for his own game — TOP, HR, HRR, HIT, CONTACT, WATCH. A hitter can carry more than one and all of them are shown. Blank means he was not designated in that game, which on a full slate is most of the board.',
            fmt: (v, r) => (!r._pickParts?.length ? <span style={{ color: C.text3 }}>—</span> : (
              <span style={{ display: 'inline-flex', gap: 3, flexWrap: 'nowrap' }}>
                {r._pickParts.map((part) => (
                  <span key={part} style={{
                    fontFamily: NUM_FONT, fontSize: 8.5, fontWeight: 900, letterSpacing: '.04em',
                    padding: '1px 4px', borderRadius: 4, whiteSpace: 'nowrap',
                    border: `1px solid ${part === 'WATCH' ? C.border2 : `${C.orange}55`}`,
                    color: part === 'WATCH' ? C.text3 : C.orange,
                  }}>{part}</span>
                ))}
              </span>
            )) },
          { key: 'spot', label: 'Spot', heat: false, w: 40, mono: true, dim: true,
            title: 'His lineup slot. Not decoration here: the rate column converts hr_per_pa through the plate appearances this slot actually gets, so a leadoff man and a nine-hole hitter with the same per-PA rate do not have the same per-game one.',
            fmt: (v) => (v == null ? '—' : v) },
          // ── A SCORE AND A PROBABILITY STOPPED SHARING A RAMP (2026-08-22)
          //
          // These two columns sat side by side on one auto-normalised ramp:
          // an 83 in the same amber as a 23.7%. The tooltips already said the
          // right thing — "the bot's 0-100 HR score… NOT a probability" — and
          // the colour said the opposite, which is the louder of the two.
          //
          // 2026-08-22: the score now diverges against the MIDDLE OF THIS
          // SHORTLIST, like every other score on the site. That does not undo
          // the point above — the thing that keeps a score from borrowing a
          // probability's grammar is that its anchor is a rank, not a rate.
          // "Above the middle of this list" is a comparison; `rate` and
          // `assume` are probabilities and still print plain, unpainted, so
          // the two kinds of number never share a treatment.
          { key: 'score', label: 'HR score', w: 64, dp: 1, scale: 'div', anchor: DIV_FIELD, domain: [0, 100], primary: true,
            title: 'The bot’s 0-100 HR score — the profile. Not a probability. Drawn against the middle of this shortlist: ▲ above it, ▼ below.' },
          { key: 'rate', label: 'His rate', w: 58, heat: false, mono: true, fmt: (v) => (v == null ? '—' : `${v.toFixed(1)}%`),
            title: 'His real per-game 1+ HR probability: hr_per_pa through his lineup spot’s plate appearances. This IS a probability, which is why it’s the only column the price gets compared to — and why it is not painted on the same scale as the score.' },
          // ── THE SWAPPABLE MIDDLE (2026-08-31) ─────────────────────
          // Only this block changes with the Stats pill. Spot, HR score
          // and His rate stay because the first is what the rate is
          // computed through and the other two are the ranking itself;
          // every price column below stays because the READ verdict is
          // the point of the table. Nothing here is derived from the
          // odds -- that separation is what lets the verdict speak.
          ...(pack === 'profile' ? [
          // THE DENOMINATOR BEHIND "HIS RATE", which the column above cannot
          // show. 22 HR in 391 trips and 7 in 127 both render as a tidy
          // percentage; only this says which one you are reading.
          { key: 'hr', label: 'HR / PA', heat: false, w: 68, mono: true,
            title: 'Season home runs over season plate appearances — the sample the rate beside it is computed from. A rate is only as good as its denominator, and this table would otherwise never show one.',
            fmt: (v, r) => {
              if (v == null || r.pa == null) return <span style={{ color: C.text3 }}>—</span>
              const up = hrpaMid != null && r.hrpa != null ? r.hrpa > hrpaMid : null
              const mark = up == null ? null : up ? '▲' : '▼'
              const tone = up == null ? C.text3 : up ? '#4ade80' : '#f87171'
              return (
                <span style={{ fontFamily: NUM_FONT }}
                  title={hrpaMid == null ? undefined
                    : `${(100 * r.hrpa).toFixed(2)}% per plate appearance — the middle of this shortlist is ${(100 * hrpaMid).toFixed(2)}%. ${up ? 'Above' : 'Below'} it.`}>
                  {v}<span style={{ color: C.text3 }}> / {r.pa}</span>
                  {mark && <span style={{ color: tone, marginLeft: 4, fontSize: 9 }}>{mark}</span>}
                </span>
              )
            } },
          { key: 'iso', label: 'ISO', w: 48, dp: 3, mono: true,
            title: 'Season isolated power — slugging minus average, so it is extra-base ability with singles taken out. The most direct power stat on the row.',
            fmt: (v) => (v == null ? '—' : String(v.toFixed(3)).replace(/^0/, '')) },
          { key: 'hrw', label: 'HRW', w: 50, dp: 1,
            title: "The HR score with tonight's park and weather folded in. Compare it to HR score: a gap between the two IS the ballpark and the air, and the direction tells you which way they cut." },
          { key: 'arm', label: 'Arm HR9', w: 58, dp: 2, mono: true, invert: true,
            title: "Home runs allowed per nine by tonight's starter. Higher is better for the hitter, so this column is inverted — the heat reads the way the bat reads it.",
            fmt: (v) => (v == null ? '—' : v.toFixed(2)) },
          ] : pack === 'contact' ? [
            // Every column below is a MEASUREMENT of batted balls, not a
            // model score, so none of them can be circular with the HR
            // score beside them. Recent-window fields (recent_*), which
            // is why a hot month shows here before it shows in ISO.
            { key: 'ev', label: 'EV', w: 52, dp: 1, mono: true,
              title: 'Average exit velocity over the recent window, in mph. The single most stable batted-ball measurement a hitter has — it moves slower than results do, which is exactly why it is worth watching.',
              fmt: (v) => (v == null ? '—' : v.toFixed(1)) },
            { key: 'barrel', label: 'Barrel%', w: 60, mono: true,
              title: 'Share of batted balls hit at the exit-velocity-and-angle combination that historically produces extra bases. The closest thing to a home-run rate that is not itself a home-run rate.',
              fmt: pct1 },
            { key: 'hard', label: 'Hard%', w: 56, mono: true,
              title: 'Share of batted balls hit 95+ mph. Broader and noisier than barrel rate, and it fills in the hitters who hit the ball hard without lifting it.',
              fmt: pct1 },
            { key: 'fb', label: 'FB%', w: 50, mono: true,
              title: 'Fly-ball share. Lift is the half of a home run that exit velocity cannot supply — a hard-hit ground ball has never left a yard.',
              fmt: pct1 },
            { key: 'pull', label: 'Pull%', w: 52, mono: true,
              title: 'Pull share. The short part of every ballpark is on the pull side, so pull intent turns raw distance into home-run distance.',
              fmt: pct1 },
            { key: 'krate', label: 'K%', w: 48, mono: true, invert: true,
              title: 'Season strikeout rate. Inverted, because it is the one column here where lower is better: a strikeout is the one outcome that produces no batted ball for any of the columns to its left to measure.',
              fmt: pct1 },
          ] : [
            // The locked last-five line is FINISHED games only, so it can
            // never move under you mid-slate the way a season rate can.
            { key: 'l5h', label: 'L5 H', w: 46, mono: true,
              title: 'Hits in his locked last five games. Locked means completed games only — it does not change while tonight is being played.',
              fmt: (v) => (v == null ? '—' : v) },
            { key: 'l5hr', label: 'L5 HR', w: 50, mono: true,
              title: 'Home runs in his locked last five games. Small by construction: two is a lot, three is the top of the slate.',
              fmt: (v) => (v == null ? '—' : v) },
            { key: 'l5xbh', label: 'L5 XBH', w: 54, mono: true,
              title: 'Extra-base hits in the locked last five. It catches the bat that is driving the ball without the homers having landed yet.',
              fmt: (v) => (v == null ? '—' : v) },
            { key: 'multi', label: 'Multi-hit', w: 62, dp: 1,
              title: 'The bot’s 0-100 multi-hit score. A score, not a probability — drawn against the middle of this shortlist like the HR score is.',
              scale: 'div', anchor: DIV_FIELD, domain: [0, 100] },
            { key: 'damage', label: 'Damage', w: 60, dp: 1,
              title: 'Damage-conversion score: how much of his hard contact actually turns into extra bases rather than loud outs.',
              scale: 'div', anchor: DIV_FIELD, domain: [0, 100] },
            { key: 'park', label: 'Park', w: 48, dp: 2, mono: true,
              title: 'Tonight’s park home-run factor. 1.00 is neutral; above it the yard helps, below it the yard takes homers away. Narrow by nature — the whole league runs about 0.87 to 1.09.',
              fmt: (v) => (v == null ? '—' : v.toFixed(2)) },
          ]),
          { key: 'price', label: 'Price', heat: false, w: 56, mono: true,
            fmt: (v, r) => r.priceTxt,
            title: 'The book’s 1+ HR price. ≠ means the book is on a different line — a multi-homer bet, not this one.' },
          { key: 'assume', label: 'Odds assume', w: 74, heat: false, mono: true, fmt: (v) => (v == null ? '—' : `${v.toFixed(1)}%`),
            title: 'The HR rate required to break even at that price — what the market thinks his number is. A probability, printed plain: the comparison against His rate is the Room column.' },
          { key: 'fair', label: 'His fair px', heat: false, w: 62, mono: true, dim: true,
            fmt: (v) => (v == null ? '—' : fmtOdds(v)),
            title: 'The price his own rate deserves — anything longer is value.' },
          { key: 'room', label: 'Room', w: 52, scale: 'div', anchor: 0, ceiling: 8, anchorLabel: 'the break-even price',
            fmt: (v) => (v == null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(1)}`),
            title: 'His rate minus what the odds assume, in points. ▲ the book is paying more than his rate says it should; ▼ less; blank in the middle, because a fair price is not a finding.' },
          { key: '_readRank', label: 'Read', heat: false, w: 108,
            // fmt returns JSX — DenseTable renders it inside the cell, which
            // is how the verdict gets its colour without a cellStyle hook.
            fmt: (v, r) => <b style={{ color: READ[r.read].tone, fontWeight: 800, fontSize: 10 }}>{r.readTxt}</b>,
            title: 'The verdict, gated: it only speaks when a real rate met a real price on the same line.' },
        ]}
        caption="The profile view is the bot's ranking; Best odds fits re-sorts by ROOM, which is their whole second table in one click. His rate is a real per-game probability (hr_per_pa × his lineup spot's trips), so the comparison against the price is honest — the HR score never touches the odds math. Rows with no price stay ranked by profile; on most slates that's most rows, and saying so beats pretending."
      />
    </div>
  )
}
