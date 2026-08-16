'use client'
import { useMemo } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { findNameEchoes } from '../lib/namePatterns'

// ── 🔤 NAME ECHOES (2026-08-16) ─────────────────────────────────────────────
//
// Donovan, verbatim: "all track common names or names that vibe together like
// bobby witt tommy white 2 sylablas or like bryce and brice bryce edlfergid
// does thsat make sense like maybe all the j names are going . just secetian
// patterns like austin riley riley greene or pete alson pete crow /pca"
//
// WHAT THIS PANEL ANSWERS: among the hitters who went deep tonight, is there a
// name echo actually worth pointing at — two Petes, an Austin Riley next to a
// Riley Greene, a Bryce beside a Brice, a run of J names — and how often does a
// night throw one of those up by accident.
//
// All the thinking is in lib/namePatterns.js, including the long note on why a
// count of coincidences is worthless without the night's own baseline and how
// the null is built. This file only renders what came back. Read that header
// before changing anything here; the honesty of the panel lives there.
//
// ── THE THREE RULES THIS FILE IS RESPONSIBLE FOR ────────────────────────────
//
//   1. IT RENDERS NOTHING WHEN THERE IS NOTHING. Not an empty card, not "no
//      patterns tonight", not a heading with a shrug under it. findNameEchoes
//      returns [] on most nights — that is the correct and common answer — and
//      [] means this component returns null and takes up no space. A panel
//      that appears every night to say it has nothing trains you to skip it,
//      and then it is furniture on the night it finally has something.
//
//   2. EVERY LINE SHOWS ITS DENOMINATOR AND ITS CHANCE RATE, side by side.
//      "3 of the 24 hitters who homered tonight are called Tyler" and "expect
//      about 0.3; about 1 night in 63 runs this far over" are the same size on
//      screen. Neither is small print. A count on its own is the thing this
//      site exists not to print.
//
//   3. IT SAYS, ONCE, THAT SOMETHING ALWAYS TURNS UP. The footer carries the
//      pAny figure for the strongest line — how often ANY of the six lenses
//      finds something this striking on a night with nothing in it. That
//      number is usually several times bigger than the line's own, and a
//      reader who has it can discount the whole panel correctly.
//
// ── THIS IS A SIBLING OF THE LEDGER'S NUMEROLOGY STRIP, DELIBERATELY ────────
//
// The jersey/birthday strip inside HomerLedger got exactly this treatment on
// 2026-08-13: watched because Donovan wants it watched, disclosed as pattern
// spotting, stated with its denominator, and wired into nothing. The note
// above digitRoot() there makes the case that a signal having failed an audit
// once ("no statistical basis", pulled 2026-06-27) is a reason to keep it out
// of the scoring, not a reason to refuse to look at it. Same posture here, one
// step further: this panel does not merely disclose that coincidences happen,
// it measures how often and refuses to speak below that bar.
//
// It is also the reason this stayed a separate component rather than becoming
// another tag in "Aligning with tonight". Those tags are all reductions of
// NUMBERS the ledger already holds; a name echo is a different kind of object
// with a different denominator and its own null, and folding it into the
// alignment chips would have let a name silently count toward a hitter's tag
// score. It sits next to that section, not inside it.
//
// ── WHAT I DID NOT BUILD ────────────────────────────────────────────────────
//
//   NO CLICK-THROUGH TO THE PLAYER CARD. Every other name on the Scoreboard
//   opens a modal, and the muscle memory here would be to tap Riley Greene —
//   arriving at his props sheet from a name-rhyme panel is the exact journey
//   this panel must not encourage. The names are text.
//   NO HISTORY, NO STREAK, NO "THE J NAMES ARE 4-1 THIS WEEK". Nothing here
//   has ever been graded and it should not start being graded by accident.
//   NO COLOUR-CODED STRENGTH. The chance rate is the strength and it is
//   written out in words and figures; a green-to-red scale would encode the
//   same thing worse and would read as a confidence rating.
//
// ── MOUNTING THIS (for whoever wires it into HomerLedger) ───────────────────
//
//   homers      one entry per HITTER who went deep, { name } or a string. The
//               ledger's `cards` are already exactly this shape and already
//               deduped by player, so `homers={model.cards}` is the call.
//               A two-homer night is ONE entry: the echo is between people.
//   population  every hitter who batted tonight — the ledger's `players` prop
//               unchanged. Slate rows carry `name`, which is all this reads.
//
// PASS THE SECOND ONE. Without it the panel drops to unbaselined mode: it can
// still see that two names line up, but it cannot say whether lining up is
// unusual, so it says so on screen and every number disappears. That is a
// noticeably worse panel and it is one prop away from being the good one.
export default function NamePatterns({ homers = [], population = [] }) {
  // Keyed on the NAMES, not the array identity: the ledger rebuilds its card
  // list on every poll, and re-running a 1200-draw null forty times an evening
  // for an unchanged set of names would be forty times too many. The pool goes
  // into the key too — lineups move, and a different set of bats is a
  // different baseline even at the same count.
  const key = useMemo(() => [
    (homers || []).map((h) => (typeof h === 'string' ? h : h?.name)).join('|'),
    (population || []).map((p) => (typeof p === 'string' ? p : p?.name)).join('|'),
  ].join('#'), [homers, population])
  const echoes = useMemo(() => findNameEchoes(homers, population), [key]) // eslint-disable-line react-hooks/exhaustive-deps

  // Rule 1. Nothing found, nothing rendered — no card, no heading, no space.
  if (!echoes.length) return null

  const denom = echoes[0].denom
  const top = echoes[0]
  const anyWords = top.pAny == null ? null
    : (top.pAny >= 0.5 ? 'most nights' : `about 1 night in ${Math.round(1 / top.pAny)}`)

  return (
    <div style={{
      background: `${C.cyan}0f`, border: `1px solid ${C.cyan}44`,
      borderRadius: 10, padding: '8px 11px', marginBottom: 9,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 5 }}>
        <span style={{ fontSize: 10.5, fontWeight: 900, color: C.cyan }}>🔤 Name echoes</span>
        <span style={{ fontSize: 9, color: C.text3 }}>
          across the <span style={{ fontFamily: NUM_FONT, color: C.text2 }}>{denom}</span> hitters who homered tonight
        </span>
      </div>

      {echoes.map((e) => (
        <div key={`${e.kind}:${e.names.join('/')}`} style={{
          display: 'flex', gap: 8, alignItems: 'flex-start',
          padding: '5px 0', borderTop: `1px solid ${C.border}`,
        }}>
          {/* The kind, as words. Colour is the panel's, not this row's — what
              kind of echo it is has to survive being read in greyscale. */}
          <span style={{
            flex: '0 0 auto', fontSize: 8.5, fontWeight: 900, fontFamily: NUM_FONT,
            letterSpacing: '.04em', textTransform: 'uppercase', color: C.cyan,
            border: `1px solid ${C.cyan}55`, borderRadius: 4, padding: '2px 5px', marginTop: 1,
          }}>{e.label}</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: C.text, lineHeight: 1.45 }}
              title={e.phrase}>
              {e.names.join(' · ')}
            </div>
            {/* Rule 2: the claim and the count it came out of, one sentence. */}
            <div style={{ fontSize: 9.5, color: C.text2, lineHeight: 1.5 }}>{e.detail}</div>
            {/* Rule 2, second half: what chance alone does with the same slate.
                Same tier of type as the claim above it — this is not fine print.
                Only when there IS a baseline: without one every row's note is
                the identical "we can't measure this" sentence, and printing it
                three times over plus once in the footer reads as an apology.
                The footer says it once instead. */}
            {e.baselined && (
              <div style={{ fontSize: 9.5, color: C.text3, lineHeight: 1.5 }}>{e.note}</div>
            )}
          </div>
        </div>
      ))}

      {/* Rule 3. The number that answers "but you'd always find something",
          stated before anyone has to think of the objection themselves. */}
      <div style={{ fontSize: 8.5, color: C.text3, marginTop: 6, lineHeight: 1.55, borderTop: `1px solid ${C.border}`, paddingTop: 5 }}>
        {top.baselined ? (
          <>
            Six kinds of echo get checked every night — shared first names, shared surnames, a first
            name that is somebody else&apos;s surname, near-miss spellings, matching cadence, and a hot
            initial. Drawing {denom} names at random from tonight&apos;s bats, <b style={{ color: C.text2 }}>{anyWords}</b> turns
            up something at least as striking as the line at the top. That is the number to hold on to.
          </>
        ) : (
          <>
            No slate was handed to this panel tonight, so it can tell you the names line up and
            nothing about whether lining up is unusual — and with ~25 homers, some of them always do.
            Everything above is unmeasured.
          </>
        )}
        {' '}Syllable counts are spelling-based and approximate; they never carry a line on their own.
      </div>
      <div style={{ fontSize: 8.5, color: C.text3, marginTop: 3, lineHeight: 1.55 }}>
        Names are for noticing. None of this has ever been graded, none of it moves a score or a
        pick, and no hitter has ever been retired by his own initials.
      </div>
    </div>
  )
}
