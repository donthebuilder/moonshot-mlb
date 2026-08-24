'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT } from '../../lib/theme'
import { n, clean, nameOf, teamOf, oppOf } from '../../lib/player'
import { convictionOf, percentileOf, standingPhrase } from '../../lib/whyPick'
import { airParts } from '../../lib/conditions'
import { hrPerGame } from '../../lib/odds'
import { btnStyle, Band } from '../ui'
import LongestBoard from './LongestBoard'
import DueBoard from './DueBoard'
import LuckReport from '../LuckReport'
import ParkBoard, { parkRows } from '../ParkBoard'
import FenceBoard from '../FenceBoard'
import ShapeBoard from '../ShapeBoard'
import { alpha } from '../../lib/scales'

// 🚀 POWER — one lead, one board, three lenses (rebuilt 2026-08-15).
//
// WHAT WAS WRONG. Donovan: "the power page is just all bad i dont like the
// parks ranked like that at the top." The parks complaint was the part he
// could name; the shape of the page was the rest of it. Opening this tab gave
// you, in order: fifteen ranked park cards, the fence-riders panel, a two-
// button toggle, a paragraph explaining the toggle, and only THEN the board
// you opened the tab for. Four sections at four equal weights above the
// content, so nothing led, and the one thing you came for was the one thing
// you had to scroll past everything else to reach.
//
// WHAT IT IS NOW.
//
//   1. ONE LEAD. The single strongest power read of the night, argued in a
//      couple of sentences with the numbers inside them. It is chosen by
//      CONVICTION, not by category order (the idiom TheRead established):
//      the farthest-ball name and the most-overdue name are each measured
//      against their OWN field in their own standard deviations, and the one
//      standing further clear of its field leads. Comparing a distance score
//      to a due score directly would be meaningless; comparing "how far clear
//      of his own field" is the same question asked twice, so the answers
//      rank. The other lens gets a one-clause nod so neither night is lost.
//
//   2. ONE BOARD, THREE LENSES. Longest and Due were two boards behind a
//      toggle that read as two boards. They are two lenses on one question —
//      where is the power hiding tonight — so the switch now says that, and
//      the boards no longer print their own h2 under a pill that already
//      names them (`showTitle={false}`; the facts that h2 carried moved into
//      each board's own paragraph rather than disappearing).
//
//   3. PARKS IS THE THIRD LENS, AND A SENTENCE. Not deleted — demoted, twice
//      over. The lead names the friendliest and coldest buildings in a clause
//      (off `parkRows`, the same arithmetic the board ranks on, so the two can
//      never disagree), and the full ranked ladder with every card, chip and
//      tooltip is one tap away on the Parks pill. Clicking a park still
//      filters the Farthest board to that game and now jumps you back to it.
//
//   4. FENCE RIDERS AND THE LUCK REPORT SIT UNDER THE BOARD. Both are still
//      here in full; neither is between him and the table any more. Both are
//      folded by default, with their headline fact in the closed line.
//
// Every prop this tab is mounted with (players, slateDate, results, onWatch,
// watchIds, onPlayerClick, initial) works exactly as before, including the
// #tab=due deep link that arrives as initial="due".
//
// ── 5. 🧬 SHAPE IS THE FOURTH LENS (2026-08-16) ──────────────────────────────
//
// Donovan: "hr shape ... needs to be somewhere else on the site for comparison
// and sorting." Homer shape existed in exactly one place — a panel inside a
// single player's modal — so you could learn what one hitter's homers look
// like and never compare two. components/ShapeBoard.js is that comparison, and
// it belongs HERE rather than as a tab of its own for the reason the nine-tab
// consolidation states: a tab is a question you arrive with, a lens is an
// answer you switch between once you are there. "What kind of power is this"
// is the same arrival as "where is the power hiding tonight".
//
// IT IS NOT IN THE LEAD, ON PURPOSE. The three existing lenses all rank on a
// bot score and the lead argues the strongest of them. Shape ranks on nothing
// — it is descriptive, ungraded, and feeds no score (see the file header on
// ShapeBoard.js) — so putting a shape name in the hero paragraph would give an
// ungraded description the same voice this page uses for measured reads. The
// lens row is exactly where a fourth lens with nothing to claim should sit.

// The floor under the DUE lead. A drought only means something with power
// behind it — that is this board's own standing warning — so the lead is
// never allowed to be a hitter who simply does not homer. .030 HR/PA is about
// one homer every 33 plate appearances; below that the drought is the hitter,
// not a slump. The BOARD still shows everybody; this gate only decides who is
// allowed to be argued at the top of the page.
const DUE_POWER_FLOOR = 0.03

// ── AND THE SAMPLE UNDER THE RATE (2026-08-15) ──────────────────────────────
//
// DUE_POWER_FLOOR alone is not enough, and the hole was found by rendering
// this page and reading the sentence back.
//
// hrPerGame() turns hr_per_pa into "about N% to homer tonight". It is honest
// arithmetic and it does not care how many plate appearances produced the
// rate. On the verified slate, Rafael Flores Jr. has 4 homers in 40 PA — a
// .100 HR/PA, which clears DUE_POWER_FLOOR three times over and prints as
// "about 35% to homer in a given game". That is a real number and a fantasy:
// four swings decided it.
//
// The Odds board hit exactly this and gated its lead at 150 PA. The gate has
// to be the same here, because it is the same function quoted the same way to
// the same reader — one page guarded and the other not is how two surfaces
// end up disagreeing about the same hitter. The BOARD still shows everybody;
// this only decides who may be ARGUED at the top of the page, and the rate
// clause below refuses to print at all under the bar rather than printing a
// number it would have to apologise for.
const LEAD_MIN_PA = 150

// 2026-08-24: labels went text-only — secondary/sub-tab pills are emoji-free
// site-wide (Donovan). Only the top-level nav tabs in lib/theme.js carry emoji.
const LENSES = [
  { k: 'longest', label: 'Farthest', tag: 'who hits it the farthest', color: C.orange },
  { k: 'due', label: 'Overdue', tag: 'who is sitting on one', color: C.purple },
  { k: 'parks', label: 'Parks', tag: 'where the air is helping', color: C.cyan },
  // The tag says "hits" and not "will hit" because this lens describes homers
  // already struck; the other three project tonight. One word, and it is the
  // difference between a description and a claim.
  { k: 'shape', label: 'Shape', tag: 'what kind of homer he hits', color: C.purple },
]

const ord = (i) => (i % 10 === 1 && i % 100 !== 11 ? 'st' : i % 10 === 2 && i % 100 !== 12 ? 'nd' : i % 10 === 3 && i % 100 !== 13 ? 'rd' : 'th')
const distOf = (p) => n(p?.longest_hr_score, 0)
const dueOf = (p) => n(p?.hr_due_score, 0)

function Para({ children, dim }) {
  return <p style={{ margin: '0 0 7px', fontSize: 12.5, lineHeight: 1.72, color: dim ? C.text3 : C.text2, maxWidth: 760 }}>{children}</p>
}

const Num = ({ children, color = C.text }) => (
  <b style={{ color, fontFamily: NUM_FONT, fontWeight: 800 }}>{children}</b>
)

// The conditions for one game as a clause rather than a chip strip — same
// helper the game deep-dive uses, so temp, wind, park factor, humidity, rain
// and roof all speak, and each one keeps the tooltip it used to hang off a
// chip. See lib/conditions.js for why this exists.
function AirClause({ p }) {
  const parts = airParts(p)
  if (!parts.length) return null
  return (
    <>
      {parts.map((part, i) => (
        <span key={part.key} title={part.title} style={{ cursor: 'help' }}>
          {i > 0 && (i === parts.length - 1 ? ' and ' : ', ')}
          <b style={{
            fontFamily: NUM_FONT, fontWeight: 800,
            color: part.tone === 'hot' ? C.orange : part.tone === 'cold' ? C.cyan : C.text2,
          }}>{part.text}</b>
        </span>
      ))}
    </>
  )
}

// ── THE NUMBER THAT PICKS THE LEAD, ALWAYS SPOKEN ───────────────────────────
//
// `lead` sorts its candidates by conviction z and takes the top one. The page
// then printed that z only when it cleared 0.8 — so on a night when the
// winner was 0.3 clear of the runner-up, the reader got a confident headline
// and no way to see that the two were a coin flip. The lead is a ranking
// claim; the strength of the ranking belongs in the sentence either way.
function ConvictionClause({ conv, field }) {
  if (!conv || !Number.isFinite(conv.z)) return null
  const strong = conv.z >= 0.8
  return (
    <>
      , <Num>{conv.z.toFixed(1)}</Num> standard deviation{conv.z === 1 ? '' : 's'}{' '}
      {strong ? 'clear of' : 'above'} {field}
      {strong && conv.gap != null && <> and <Num>{conv.gap.toFixed(1)}</Num> points clear of the next name</>}
      {!strong && (
        <span style={{ color: C.text3 }}> — close enough to the next name that this is an ordering, not a separation</span>
      )}
    </>
  )
}

export default function PowerTab({ players, slateDate = '', results = null, onWatch, watchIds, onPlayerClick, initial = 'longest' }) {
  const [view, setView] = useState(initial)
  // Park click → filter the Farthest board to that game (2026-08-07). Clicking
  // a park from the Parks lens now also RETURNS you to the board, which is the
  // whole point of the filter — the click used to leave you looking at the
  // park cards you had just filtered away from.
  const [venueFilter, setVenueFilter] = useState('')
  const pickVenue = (v) => { setVenueFilter(v); if (v) setView('longest') }

  const pool = useMemo(() => (players || []).filter(Boolean), [players])

  // 🏟 TONIGHT'S AIR, IN ONE CLAUSE — the friendliest and coldest buildings on
  // the board, ranked by exactly what the Parks lens ranks by.
  const parks = useMemo(() => {
    const rows = parkRows(pool)
    if (rows.length < 2) return null
    const sorted = [...rows].sort((a, b) => b.edge - a.edge)
    return { sorted, best: sorted[0], worst: sorted[sorted.length - 1], count: rows.length }
  }, [pool])

  // 🏆 THE LEAD. Two candidates, each measured against its own field; the one
  // standing further clear of its own field is the read of the night.
  const lead = useMemo(() => {
    if (pool.length < 8) return null

    const far = [...pool].sort((a, b) => distOf(b) - distOf(a))[0]
    const duePool = pool.filter((p) => n(p?.hr_per_pa, 0) >= DUE_POWER_FLOOR
      && n(p?.season_pa, 0) >= LEAD_MIN_PA)
    const overdue = [...duePool].sort((a, b) => dueOf(b) - dueOf(a))[0]

    const cands = []
    if (far && distOf(far) > 0) {
      cands.push({
        kind: 'far', p: far, color: C.orange, lens: 'longest',
        kicker: 'The distance read of the night',
        conv: convictionOf(far, pool, distOf),
        pct: percentileOf(distOf(far), pool.map(distOf)),
      })
    }
    if (overdue && dueOf(overdue) > 0) {
      cands.push({
        kind: 'due', p: overdue, color: C.purple, lens: 'due',
        kicker: 'The overdue read of the night',
        conv: convictionOf(overdue, pool, dueOf),
        pct: percentileOf(dueOf(overdue), pool.map(dueOf)),
      })
    }
    if (!cands.length) return null

    // THE HERO IS PICKED BY z, so z is printed unconditionally below — see
    // the ConvictionClause note. It used to be spoken only when it cleared
    // 0.8, which meant the page hid the number precisely on the nights when
    // the lead was weakest and the reader most needed to know it.
    const hero = [...cands].sort((a, b) => (b.conv?.z ?? -99) - (a.conv?.z ?? -99))[0]
    const other = cands.find((c) => c !== hero) || null
    return { hero, other }
  }, [pool])

  // Where the lead's own building sits in tonight's ranking — the park read,
  // attached to the one hitter it matters most for instead of ranked at the
  // top of the page in its own board.
  const heroPark = useMemo(() => {
    if (!lead?.hero || !parks) return null
    const pk = lead.hero.p?.game_pk
    const i = parks.sorted.findIndex((g) => g.pk === pk)
    return i < 0 ? null : { row: parks.sorted[i], rank: i + 1 }
  }, [lead, parks])

  const lens = LENSES.find((l) => l.k === view) || LENSES[0]

  return (
    <div>
      {/* ── THE LEAD ──────────────────────────────────────────────────────── */}
      {lead && (() => {
        const h = lead.hero
        const p = h.p
        const conv = h.conv
        const spot = n(p?.lineup_spot, 0)
        const arm = clean(p?.pitcher_name, '')
        const hr9 = n(p?.pitcher_hr9, 0)
        const drought = n(p?.games_since_last_hr, 0)
        const ratio = n(p?.hr_due_ratio, 0)
        // The rate is only spoken when the sample under it can carry the
        // sentence. See LEAD_MIN_PA. Silence beats "about 35% to homer" off
        // four swings, and the plate appearances ride along so the reader can
        // weigh it rather than take it on trust.
        const seasonPa = n(p?.season_pa, 0)
        const perGame = seasonPa >= LEAD_MIN_PA ? hrPerGame(p) : null
        const maxDist = n(p?.recent_max_distance, 0)
        const d375 = n(p?.recent_375_num, 0)
        const den = n(p?.recent_350_den, 0)

        return (
          // Card treatment matches VerdictHero's visual language (radius 18,
          // padded, a subtle tint of the lead's own color) instead of the bare
          // borderLeft rule that used to sit directly above the lens pills —
          // 2026-08-24, "looks off/cluttered" against a purple callout with no
          // card edge of its own. See components/VerdictHero.js.
          <section style={{
            marginBottom: 18, maxWidth: 780, borderRadius: 18,
            border: `1px solid ${alpha(h.color, 0.26)}`,
            background: `linear-gradient(158deg, ${alpha(h.color, 0.1)}, ${C.bg2} 60%)`,
            padding: '16px 18px 15px',
          }}>
            <div style={{
              fontSize: 9, fontFamily: NUM_FONT, fontWeight: 900, letterSpacing: '.14em',
              textTransform: 'uppercase', color: h.color, marginBottom: 5,
            }}>
              {h.kicker}
            </div>
            <h2 style={{ margin: '0 0 8px', fontSize: 27, fontWeight: 900, letterSpacing: '-.02em', lineHeight: 1.1 }}>
              <span onClick={() => onPlayerClick?.(p)} style={{ cursor: onPlayerClick ? 'pointer' : 'default' }}>{nameOf(p)}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: C.text3, fontFamily: NUM_FONT }}> {teamOf(p)} vs {oppOf(p)}</span>
            </h2>

            {/* THE ARGUMENT. Every number is a published field spoken inside a
                sentence — no tile, no meter, and deliberately no percentage on
                a 0-100 score. The only per-game chance quoted anywhere on this
                page is hrPerGame, which is built from the bot's real
                hr_per_pa; a due score and a longest-HR score are rankings and
                are said as rankings. */}
            {h.kind === 'far' ? (
              <Para>
                Nobody on the slate projects to hit one farther. His longest-HR score is{' '}
                <Num color={h.color}>{distOf(p).toFixed(0)}</Num>
                {h.pct != null && <> — <b style={{ color: C.text2 }}>{standingPhrase(h.pct)}</b></>}
                <ConvictionClause conv={conv} field="tonight&apos;s field" />. That is a{' '}
                <b style={{ color: C.text2 }}>distance</b> read, not a chance of a homer.
                {maxDist > 0 && <> He has already put a ball <Num color={h.color}>{Math.round(maxDist)} ft</Num> in the tracked window
                  {d375 > 0 && den > 0 && <>, with <Num>{d375}</Num> of <Num>{den}</Num> tracked balls past 375</>}.</>}
              </Para>
            ) : (
              <Para>
                He has not gone deep in <Num color={h.color}>{drought} games</Num> — and unlike most of
                that list, there is real power behind the gap.
                {perGame != null && <> His own rate — <Num>{n(p?.season_hr, 0)}</Num> homers in{' '}
                  <Num>{seasonPa}</Num> plate appearances — makes him about <Num color={h.color}>{perGame.toFixed(0)}%</Num> to homer
                  in a given game, which is the number the drought has to be read against.</>}
                {' '}The bot&apos;s due score has him at <Num>{dueOf(p).toFixed(1)}</Num>
                {h.pct != null && <> — <b style={{ color: C.text2 }}>{standingPhrase(h.pct)}</b></>}
                <ConvictionClause conv={conv} field="the field" />
                {ratio > 0 && <>, and its ratio puts him <Num>{ratio.toFixed(1)}×</Num> past what his own rate predicts</>}.
                {' '}A long drought <b style={{ color: C.text2 }}>without</b> that rate behind it is just a
                hitter who does not homer, which is why this lead is picked on the rate and not on the
                length of the gap.
              </Para>
            )}

            {/* ── EVERYTHING PAST THE FIRST PARAGRAPH FOLDS (2026-08-17) ────
                "power section needs to be cleaned up." The lead ran four
                paragraphs before the lenses. First paragraph — the claim and
                its numbers — stays; the park, the other lens and the extremes
                sit one tap behind it. Nothing deleted. */}
            <details>
            <summary style={{ cursor: 'pointer', fontSize: 10.5, color: C.orange, listStyle: 'revert', margin: '2px 0 4px' }}>
              the park, the other lens, tonight&apos;s extremes
            </summary>
            {/* THE BUILDING — the park read, attached to the name it matters
                for. This is where the ranked park board used to live. */}
            <Para>
              {arm ? <>He draws <b style={{ color: C.text2 }}>{arm}</b></> : <>He is in the lineup</>}
              {hr9 > 0 && <>, who is giving up <Num color={hr9 >= 1.4 ? C.red : C.text2}>{hr9.toFixed(2)}</Num> home runs per nine</>}
              {spot > 0 && <>, and he hits {spot}{ord(spot)}</>}.
              {' '}He does it in <b style={{ color: C.text2 }}>{clean(p?.venue_name, 'a park the slate has not named')}</b>
              {heroPark && (
                <>
                  {' '}— <button
                    type="button"
                    onClick={() => setView('parks')}
                    title="Ranked by the building's own HR factor plus tonight's weather. Open the Parks lens for the full ladder."
                    style={{
                      background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                      color: C.text2, font: 'inherit', textDecoration: 'underline dotted',
                    }}
                  >{heroPark.rank === 1
                    ? <>the <b style={{ color: C.orange }}>friendliest</b> of {parks.count} parks tonight at </>
                    : heroPark.rank === parks.count
                      ? <>the <b style={{ color: C.cyan }}>coldest</b> of {parks.count} parks tonight at </>
                      : <>the <Num color={heroPark.row.edge >= 0 ? C.orange : C.cyan}>{heroPark.rank}{ord(heroPark.rank)}</Num> friendliest of {parks.count} parks tonight at </>}
                    <Num color={heroPark.row.edge >= 0 ? C.orange : C.cyan}>{heroPark.row.edge > 0 ? '+' : ''}{heroPark.row.edge.toFixed(0)}%</Num>
                  </button>
                </>
              )}.
              {' '}<AirClause p={p} />.
            </Para>

            {/* THE OTHER LENS, in one clause — so the night the reader isn't
                looking at still gets named without a second hero block. */}
            {lead.other && (
              <Para dim>
                The other lens:{' '}
                <b
                  onClick={() => onPlayerClick?.(lead.other.p)}
                  style={{ color: C.text2, cursor: onPlayerClick ? 'pointer' : 'default' }}
                >{nameOf(lead.other.p)}</b>
                {lead.other.kind === 'due'
                  ? <> is the strongest overdue name with the power to back it — <Num color={C.purple}>{n(lead.other.p?.games_since_last_hr, 0)}</Num> games
                      without one on a <Num color={C.purple}>{(n(lead.other.p?.hr_per_pa, 0) * 100).toFixed(1)}</Num> HR-per-100-PA bat</>
                  : <> is the farthest-ball projection on the slate at <Num color={C.orange}>{distOf(lead.other.p).toFixed(0)}</Num></>}
                .{' '}
                <button
                  type="button"
                  onClick={() => setView(lead.other.lens)}
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: C.text3, font: 'inherit', textDecoration: 'underline dotted' }}
                >Open that lens →</button>
              </Para>
            )}

            {/* TONIGHT'S EXTREMES — the ranked park board, condensed to the two
                buildings anyone actually acts on, with the ladder a tap away. */}
            {parks && parks.best.edge !== parks.worst.edge && (
              <Para dim>
                Across the slate the ball carries best at{' '}
                <b style={{ color: C.text2 }}>{parks.best.venue || parks.best.matchup}</b>{' '}
                (<Num color={C.orange}>{parks.best.edge > 0 ? '+' : ''}{parks.best.edge.toFixed(0)}%</Num>)
                {' '}and worst at <b style={{ color: C.text2 }}>{parks.worst.venue || parks.worst.matchup}</b>{' '}
                (<Num color={C.cyan}>{parks.worst.edge > 0 ? '+' : ''}{parks.worst.edge.toFixed(0)}%</Num>).{' '}
                <button
                  type="button"
                  onClick={() => setView('parks')}
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: C.text3, font: 'inherit', textDecoration: 'underline dotted' }}
                >All {parks.count} parks, ranked →</button>
              </Para>
            )}
            </details>
          </section>
        )
      })()}

      {/* ── THE LENS SWITCH ───────────────────────────────────────────────────
          One board. The pill is the board's title, which is why the boards
          below run with showTitle={false}. The active lens's own one-line
          answer rides the row rather than getting a paragraph of its own — the
          longer explanation belongs to the board and is printed by the board. */}
      <div style={{ display: 'flex', gap: 6, marginTop: 4, marginBottom: 12, flexWrap: 'wrap', alignItems: 'baseline' }}>
        {LENSES.map((l) => (
          <button key={l.k} onClick={() => setView(l.k)} style={btnStyle(l.color, view === l.k)}>
            {l.label}
          </button>
        ))}
        {/* The count is read off LENSES rather than typed, because "three
            lenses" survived as a hard-coded word for exactly as long as it
            took to add a fourth. */}
        <span style={{ fontSize: 10.5, color: C.text3, marginLeft: 2 }}>
          {LENSES.length === 4 ? 'four' : LENSES.length === 3 ? 'three' : LENSES.length} lenses on one
          question — {lens.tag}
        </span>
      </div>

      {view === 'shape' ? (
        /* 🧬 SHAPE. Same prop contract as the other two board lenses —
           showTitle={false} because the pill above IS its title, and the two
           facts the PanelTitle carried move into the board's own paragraph.
           It takes no `results` and no venue filter: it ranks nothing against
           tonight's conditions, it describes homers already hit. */
        <ShapeBoard
          players={players}
          onWatch={onWatch}
          watchIds={watchIds}
          onPlayerClick={onPlayerClick}
          showTitle={false}
        />
      ) : view === 'parks' ? (
        <ParkBoard
          players={players}
          slateDate={slateDate}
          activeVenue={venueFilter}
          onVenueClick={pickVenue}
          onPlayerClick={onPlayerClick}
          fold={false}
        />
      ) : view === 'due' ? (
        <DueBoard players={players} onWatch={onWatch} watchIds={watchIds} onPlayerClick={onPlayerClick} showTitle={false} />
      ) : (
        <LongestBoard
          players={players}
          results={results}
          onWatch={onWatch}
          watchIds={watchIds}
          onPlayerClick={onPlayerClick}
          venueFilter={venueFilter}
          onClearVenue={() => setVenueFilter('')}
          showTitle={false}
        />
      )}

      {/* ── UNDER THE BOARD ───────────────────────────────────────────────────
          Both of these used to sit ABOVE the board — fence riders directly
          above it, and the luck report open at full height below. Neither is
          between the reader and the table now, and neither lost a row: fence
          riders keeps its own fold, the luck report gets one, and both name
          their headline fact in the closed line.

          Luck lives with power on purpose: Due is distance-based regression,
          this is contact-quality regression — two lenses on the same idea. */}
      <Band note="folded — open what you need">More on tonight&apos;s power</Band>
      <FenceBoard players={players} onPlayerClick={onPlayerClick} />
      <LuckReport players={players} onPlayerClick={onPlayerClick} defaultOpen={false} />
    </div>
  )
}
