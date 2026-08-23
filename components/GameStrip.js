'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { alpha, verdictInk } from '../lib/scales'
import { Dial } from './VerdictHero'
import { useSpot } from '../lib/spotlight'
import { nn, hrScore, prodScore, median as med } from '../lib/player'
import MobileFold from './MobileFold'

// Game selector strip — the PropFinder pattern.
//
// The pill bar this replaces told you a matchup existed and nothing else, so
// picking a game meant opening several to find the live one. A card carries
// the numbers that decide it: first pitch, Game Score against the slate
// median, how much of the lineup is in a hot window, weak spots, park.
//
// First-pitch order, always. You read a slate chronologically -- re-ranking by
// strength makes you hunt for the 7:05 game you're about to bet.
//
// ── THE APPLE SPORTS PASS (2026-08-16) ──────────────────────────────────────
//
// Donovan sent Apple Sports and ESPN screenshots: "how can we make have
// something like these for the site" → "just the style feed and then the hover
// all simplicist look of it. i know we are more in the realm of research and
// stats but some aspects need to be like this."
//
// Scoped to the live/scores layer — this strip and ScoreRail. The boards keep
// their density; you STUDY a board and you GLANCE at a game card.
//
// The problem this pass fixes is not the content, it is that six things were
// shouting at once on a 232px card: a heat tint, a heat-coloured border, a
// heat-scaled GS numeral, a 34px ghost rank watermark, a glow on the main
// event and a row of three filled colour chips. Nothing led, so the matchup —
// the one thing you are actually looking for — was the fourth-loudest element
// on a card about a matchup.
//
// NOTHING WAS DELETED. Every number, glyph, chip, tooltip and title that
// rendered before still renders; the hierarchy changed, not the content:
//
//   1. ONE THING LEADS. The matchup goes 14.5px → 16px in full-strength text
//      and owns its own line; everything else recedes to small grey.
//   2. TYPE DOES THE HIERARCHY, NOT BOXES. The heat gradient, the heat-tinted
//      border and the ${band.col}22 divider rule are gone in favour of one
//      flat surface and spacing. The card's box only appears on hover
//      (.quiet-tile in MobileCSS) or when it is the open card.
//   3. COLOUR IS RARE. Heat used to be said four ways at once. It is now ONE
//      quiet signal: the band glyph (🌋 / 🔥 / 🧊) plus the GS rank, which
//      moved out of the 34px watermark and into "#3" in small grey on the meta
//      line — same fact, one twentieth of the volume. The accent is spent on
//      exactly two things: the MAIN EVENT wordmark (one card a slate) and the
//      open card's border. GS keeps its ▲/▽ but stops being coloured and
//      stops changing size.
//   4. NO CHROME. The chips lose their coloured fill, ring and glow at rest —
//      only the category tag stays coloured, and the full colour treatment is
//      the ACTIVE state, i.e. a chip you have added as a pair leg.
//
// Also swapped three hardcoded accent hexes and the three chip hexes for their
// C-palette names, so the mono/steel/regal chromes actually reach this strip.

// "J. Mlodzinski", suffix-aware — surnames alone truncated to "Thornt…" on
// narrow cards and bare "Lowe" carried no identity (2026-08-07).
const SUFFIX = new Set(['jr.', 'jr', 'sr.', 'sr', 'ii', 'iii', 'iv'])
const shortName = (full) => {
  const parts = String(full || '').trim().split(/\s+/)
  if (!parts[0]) return ''
  if (parts.length === 1) return parts[0]
  const last = SUFFIX.has(parts[parts.length - 1].toLowerCase())
    ? parts.slice(-2).join(' ') : parts[parts.length - 1]
  return `${parts[0][0]}. ${last}`
}
const lastName = (full) => {
  const parts = String(full || '').trim().split(/\s+/)
  if (parts.length >= 2 && SUFFIX.has(parts[parts.length - 1].toLowerCase())) return parts.slice(-2).join(' ')
  return parts.slice(-1)[0] || ''
}

const playerScore = (p) => med([
  hrScore(p), prodScore(p), nn(p?.hrw_score), nn(p?.damage_conversion_score),
])

function timeText(t) {
  if (!t) return 'TBD'
  const d = new Date(t)
  if (Number.isNaN(d.getTime())) return 'TBD'
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

const isPast = (t) => !!t && new Date(t) < new Date(Date.now() - 3 * 60 * 60 * 1000)

export default function GameStrip({ games, activeGame, onSelect, mode, onPairPick, pairIds, sortBy = 'time', live = null, targets = [], onTarget = null }) {
  // 🔗 CROSS-GAME PAIR BUILDING (2026-08-09, Donovan: "from this view I
  // should be able to visually pair a TOP pick or HR pick / alt pick from
  // each game"). The chips below become tappable legs: tap one here, tap
  // another on a different card, and the tray at the bottom of the Games
  // page holds the pair. Tapping a chip must NOT open the game card, so
  // every chip stops propagation.
  const pairing = typeof onPairPick === 'function'
  // One hook, and every chip below opts in by spreading chipSpot(p). See the
  // long note above chipWashOf() in lib/spotlight.js for why this had to exist.
  const { chipSpot, spotTitle } = useSpot()
  const isLeg = (pl) => pairing && pl && pairIds?.has(Number(pl?.player_id ?? pl?.id))
  const botView = mode === 'botview'
  // Each Games-page mode wears its own accent (2026-08-08): ember for the
  // default read, cyan for Bot Output, green for Lineups — the strip tells
  // you which lens you're in before you read a single card.
  const accent = botView ? C.cyan : mode === 'lineups' ? C.green : C.orange
  // 2026-08-13, Donovan (screenshot feedback): "packed with too much text" +
  // "the legend paragraph at the bottom" -- this used to always render as a
  // 7-sentence paragraph under every grid. Nothing in it was wrong, there
  // was just always more of it on screen than anyone needed mid-glance.
  // Collapsed behind a toggle, same pattern as the tab-level "what am I
  // looking at" pill elsewhere on the site -- one live line stays visible
  // (the sort state, since that actually changes), the symbol glossary is
  // one tap away instead of permanent.
  const [legendOpen, setLegendOpen] = useState(false)
  const cards = useMemo(() => {
    const built = games.map((g) => {
      const gp = g.players || []
      const head = gp.reduce((a, b) => (hrScore(b) > hrScore(a) ? b : a), gp[0] || {})
      // The pitching matchup — the single most informative line a game card
      // can carry, and it was missing. Both starters live on the hitter rows.
      const arms = [...new Set(gp.map((x) => x?.pitcher_name).filter(Boolean))].slice(0, 2)
      // HEADLINE PICKS (2026-08-08, owner feedback): every card now names
      // the game's TOP and HR picks inline — the two slots you'd actually
      // quote — instead of one 🤖 line rationed to the hot cards. Same
      // slot rule as Results: highest score on the category's own scale.
      const roleOf = (x) => String(x?.game_pick_role || '').split('/')[0].trim().toUpperCase()
      const topScore = (x) => nn(x?.top_board_score_v2 ?? x?.overall_score)
      const topPickP = gp.filter((x) => roleOf(x) === 'TOP').sort((a, b) => topScore(b) - topScore(a))[0]
      const hrPickP = gp.filter((x) => roleOf(x) === 'HR').sort((a, b) => nn(b?.hr_score) - nn(a?.hr_score))[0]
      // ALT ON EVERY CARD (2026-08-09, owner: "every bubble should show TOP,
      // HR and ALT so I can decide either/or at a glance"). It used to ride
      // only on hot cards (heat >= .55) as a separate line in its own type
      // colour, which meant the one decision the strip exists for — top vs
      // homer vs the secondary look — could only be made on a third of the
      // slate. It's now the third chip in the same row, same grammar, purple.
      //
      // Honest gate kept: the chip appears only when the bot actually
      // published an alt_hr_score above zero, and the best alt is taken from
      // the hitters who AREN'T already the TOP or HR chip, so a card never
      // shows the same man twice. No alt lane on the card = no chip.
      const idOf = (x) => Number(x?.player_id ?? x?.id)
      const taken = new Set([topPickP, hrPickP].filter(Boolean).map(idOf))
      const alt = gp
        .filter((x) => x?.name && nn(x?.alt_hr_score) > 0 && !taken.has(idOf(x)))
        .sort((a, b) => nn(b?.alt_hr_score) - nn(a?.alt_hr_score))[0] || null
      const altOk = !!alt
      return {
        arms: arms.map(lastName).join(' · '),
        armsFull: arms.join(' vs '),
        topBat: head?.name ? `${shortName(head.name)} ${hrScore(head).toFixed(0)}` : '',
        topHrw: head?.name && nn(head?.hrw_score) > 0 ? nn(head.hrw_score).toFixed(0) : null,
        topPick: topPickP?.name ? { name: shortName(topPickP.name), score: topScore(topPickP).toFixed(0), p: topPickP } : null,
        hrPick: hrPickP?.name ? { name: shortName(hrPickP.name), score: nn(hrPickP.hr_score).toFixed(0), p: hrPickP } : null,
        altPick: altOk ? { name: shortName(alt.name), score: nn(alt.alt_hr_score).toFixed(0), p: alt } : null,
        altWhy: altOk ? String(alt.alt_reason || '') : '',
        // BOTH lineups (2026-08-07, Donovan): one ✓ hid a half-projected
        // game. Per-team marks now — ✓✓ both posted, ✓◻ one still projected.
        confMarks: (() => {
          const byTeam = {}
          gp.forEach((x) => {
            const tm = x?.team
            if (tm && !(tm in byTeam)) byTeam[tm] = x?.lineup_confirmed !== false
          })
          const ts = Object.keys(byTeam)
          if (ts.length !== 2) return null
          return { marks: ts.map((t) => byTeam[t] ? '✓' : '◻').join(''), tip: ts.map((t) => `${t} ${byTeam[t] ? 'posted' : 'projected'}`).join(' · ') }
        })(),
        pk: g.game_pk,
        matchup: `${g.away || '—'} @ ${g.home || '—'}`,
        time: timeText(g.game_time),
        past: isPast(g.game_time),
        confirmed: !!g.lineup_confirmed,
        gs: med(gp.map(playerScore)),
        // Worst-arm figures for the sort control (2026-08-12, Donovan: "order
        // h/9 or whip and score"). Each hitter row already carries
        // pitcher_hr9/pitcher_whip for the arm THEY personally face, so the
        // higher of the two starters' numbers found across this game's rows
        // is "how leaky is the leakier of tonight's two arms" — same idea as
        // gs, one specific stat instead of the blended board score.
        worstHr9: gp.length ? Math.max(...gp.map((x) => nn(x?.pitcher_hr9))) : 0,
        worstWhip: gp.length ? Math.max(...gp.map((x) => nn(x?.pitcher_whip))) : 0,
        // ── LOWEST K (2026-08-16, Donovan: "low k rate need to be added to
        // sorts for game") ──────────────────────────────────────────────────
        //
        // Every other sort here asks which game is WORST for the arms, so this
        // one does too, and for strikeouts "worst for the arm" means the
        // LOWEST rate — a starter who does not miss bats has to let the ball
        // be put in play, which is the whole premise of the contact markets.
        // So it is a MIN across the game's arms, not a max, and the label says
        // "Lowest K" rather than borrowing the "Worst" wording, which would
        // read backwards next to Worst HR/9.
        //
        // Arms with no published K/9 are EXCLUDED rather than counted as 0 —
        // nn() returns 0 for a missing field, and a zero would make an
        // unpublished starter the most hittable arm on the board and float his
        // game straight to the top. A game with nothing published sorts last.
        lowK: (() => {
          const ks = gp.map((x) => Number(x?.pitcher_k9)).filter((v) => Number.isFinite(v) && v > 0)
          return ks.length ? Math.min(...ks) : Infinity
        })(),
        hrw: med(gp.map((x) => nn(x?.hrw_score))),
        weak: gp.filter((x) => x?.weak_spot_flag).length,
        venue: head?.venue_name || '',
        batters: gp.length,
        // MORE INTUITIVE SORTS (2026-08-15, Donovan: "add more intuitive
        // game sorts"). Both come off rows this card already has — no new
        // data, no new fetch. "Air" is the building plus tonight's weather,
        // the same combination the park board ranks on; "Set" is how much of
        // this game's board is actually locked in, because a projection over
        // an unconfirmed lineup is a guess about who plays.
        air: (() => {
          const pf = nn(head?.park_hr_factor)
          const wx = nn(head?.weather_hr_effect_pct ?? head?.hr_weather_effect_pct)
          return (pf > 0 ? (pf - 1) * 100 : 0) + wx
        })(),
        setPct: gp.length ? gp.filter((x) => x?.lineup_confirmed === true).length / gp.length : 0,
        // ── THE LIVE JOIN (2026-08-18) ──────────────────────────────────────
        // Donovan sent Apple/ESPN/MLB screenshots asking for a real
        // "live-game" pass; in every one of them a game in progress leads
        // with its score and inning, not its first-pitch time. This card
        // never had that — groupGames() builds it from the pregame slate
        // rows, which have no live score on them. `live` is the same
        // fetchLiveSlate() snapshot AtThePlate/GameCockpit/Boxes already
        // poll, joined on here for free. String(pk) both sides: groupGames'
        // key can be a bot-composed string on a game the slate never
        // resolved a real gamePk for, while the live snapshot's pk is
        // always the league's numeric one — a loose match would silently
        // pair nothing on exactly the nights this is for.
        liveG: live?.get ? live.get(String(g.game_pk)) || null : null,
      }
    })
    const slateMed = med(built.map((c) => c.gs))
    // Heat rank: each card tinted by where its GS sits in tonight's range,
    // so the best game glows like a hot cell and cold games recede.
    const gsAll = built.map((c) => c.gs)
    const lo = Math.min(...gsAll), hi = Math.max(...gsAll)
    const byGs = [...built].sort((a, b) => b.gs - a.gs)
    const rankOf = new Map(byGs.map((c, i) => [c.pk, i + 1]))
    const withRank = built.map((c) => ({
      ...c,
      edge: c.gs >= slateMed ? '▲' : '▽',
      heat: hi > lo ? (c.gs - lo) / (hi - lo) : 0.5,
      gsRank: rankOf.get(c.pk) || 0,
    }))
    // DISPLAY ORDER ONLY (2026-08-12). gsRank/heat/band above still always
    // mean "vs tonight's GS" — the #rank numeral and the 🌋 MAIN EVENT badge
    // don't change meaning when a different sort is active, they just may
    // not read 1,2,3 top-to-bottom anymore. `games` already arrives in
    // chronological order (groupGames sorts it), so 'time' is a no-op here;
    // the other three just re-order the same cards by a different number.
    const SORTERS = {
      gs: (a, b) => b.gs - a.gs,
      hr9: (a, b) => b.worstHr9 - a.worstHr9,
      whip: (a, b) => b.worstWhip - a.worstWhip,
      air: (a, b) => b.air - a.air,
      set: (a, b) => (b.setPct - a.setPct) || (b.gs - a.gs),
      // ascending — the softest strikeout arm first. Infinity (nothing
      // published) sorts to the bottom on its own.
      lowk: (a, b) => a.lowK - b.lowK,
    }
    return SORTERS[sortBy] ? [...withRank].sort(SORTERS[sortBy]) : withRank
  }, [games, sortBy, live])

  if (!cards.length) return null

  // 📱 THE PHONE FOLD (2026-08-09, Donovan: "same with games"). A dozen game
  // cards at one per row is the same wall the park board was. The summary
  // names tonight's MAIN EVENT — the highest Game Score, which is the card
  // the heat-sizing exists to point at — plus how many games there are and
  // how many haven't started, so "is there anything left tonight" is answered
  // without opening it.
  const main = cards.find((c) => c.gsRank === 1) || cards[0]
  const upcoming = cards.filter((c) => !c.past).length
  const foldSummary = `${cards.length} games · 🌋 ${main.matchup} ${main.gs.toFixed(0)}`
    + (upcoming < cards.length ? ` · ${upcoming} still to come` : '')

  return (
    <MobileFold
      title={botView ? '🤖 Games' : mode === 'lineups' ? '⚾ Jump to a game' : '🎮 Tonight’s games'}
      summary={foldSummary}
      count={cards.length}
      accent={accent}
    >
    <div style={{ marginBottom: 16 }}>
      {/* ONE SIZE (2026-08-15, Donovan: "for the games tab i don't like the
          game bubble"). Cards used to scale their width AND their flex-grow
          with Game Score, so a 15-game slate rendered as fifteen different
          sized boxes on ragged rows — the heat was said three times over
          (size, tint, ghost numeral) and the cost was a grid you couldn't
          scan. Colour still carries the heat; the geometry stops shouting.
          An even grid also means a card's position now means what the SORT
          says it means, which is the whole point of the sort control.

          2026-08-16 FINISHES THAT THOUGHT. Colour no longer carries the heat
          either — the Apple Sports pass in the header comment cut the three
          remaining shouts (tint, glow, heat-scaled numeral) down to the band
          glyph and the rank. Same even grid, one flat surface, nothing lost. */}
      <style>{'@keyframes gsLivePulse{0%,100%{opacity:1}50%{opacity:.3}}'}</style>
      <div style={{
        display: 'grid', gap: 8,
        gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 264px), 1fr))',
      }}>
        {cards.map((c) => {
          const on = activeGame === c.pk
          // PERSONALITY BANDS (2026-08-07, same language as the park board):
          // the hottest game on the slate is the MAIN EVENT and burns; cold
          // games freeze quietly. Bands come from heat (GS within tonight's
          // range), so every slate has exactly one main event.
          //
          // 2026-08-16: the band no longer carries a COLOUR, because the tint,
          // the border and the glow it used to paint were three of the four
          // ways this card said "hot". The glyph is now the whole signal
          // (principle 3) — same three bands, same thresholds, same meaning.
          const band = c.gsRank === 1 ? { icon: '🌋', word: 'MAIN EVENT' }
            : c.heat >= 0.62 ? { icon: '🔥', word: '' }
            : c.heat >= 0.3 ? { icon: '', word: '' }
            : { icon: '🧊', word: '' }
          // ── THE TINT IS BACK (2026-08-17) ─────────────────────────────────
          // Donovan, after living with the flat cards: "i still want the game
          // chips to different color by game score like before."
          // The 08-16 quiet pass took the tint away along with the glow, the
          // size-scaling and the heat numeral, on the argument that four
          // signals was three too many. He agreed about the other three and
          // has now said twice that the TINT was the one he used — colour by
          // game score is how he scans the grid. So: one alpha channel on one
          // colour, scaled by tonight's GS range. No glow, no size change, no
          // border — the geometry stays quiet, the paint says the score.
          // Alpha runs 0 → 0.16: visible next to a cold card, never loud
          // enough to fight the text, and the open-card accent still wins.
          // ── THE WHOLE-NEW-LOOK PASS (2026-08-23) ─────────────────────
          // Donovan: "i just want a whole new look for the game chips, update
          // it to the same style as the prop cards."
          //
          // So it IS a prop card now, built out of the same pieces: the wash,
          // the light bar across the top edge, the radius, the air — and the
          // dial, which is the thing that makes a Props card a Props card.
          //
          // WHAT THE DIAL SHOWS, and why it needs `pct`. A Game Score has no
          // absolute scale: it is defined relative to tonight's slate ("GS vs
          // the median"), so drawing 34 against 100 would say a third of a
          // nothing. `c.heat` is already GS normalised within tonight's range,
          // which is exactly the ring's job, so the ring takes heat and the
          // number printed inside stays the real GS. The tooltip says both.
          //
          // THE TINT STAYS. He asked for colour-by-game-score twice
          // (2026-08-17), and it survives as the card's wash — the prop cards
          // are washed by their badge colour, these are washed by their heat,
          // which is the same idea pointed at the fact that matters here.
          // Nothing was removed: every mark, glyph, count, score, chip and
          // tooltip the old card carried is still on this one.
          const ink = verdictInk(c.heat >= 0.55 ? true : c.heat <= 0.25 ? false : null)
          const col = on ? accent : ink.color
          const wash = alpha(col, 0.05 + 0.11 * c.heat)
          return (
            <button
              key={c.pk}
              onClick={() => onSelect(c.pk)}
              title={[c.matchup, c.armsFull && `⚾ ${c.armsFull}`, c.topBat && `🔝 ${c.topBat}`]
                .filter(Boolean).join('\n')}
              style={{
                position: 'relative', overflow: 'hidden', textAlign: 'left',
                cursor: 'pointer', padding: '12px 13px 11px', minWidth: 0,
                borderRadius: 18,
                border: `1px solid ${alpha(col, on ? 0.6 : 0.24)}`,
                background: `linear-gradient(158deg, ${wash}, ${C.bg2} 56%)`,
                opacity: c.past && !on ? 0.5 : 1,
                display: 'flex', flexDirection: 'column', gap: 9,
              }}
            >
              {/* the light bar — the prop card's one piece of chrome */}
              <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, height: 2,
                background: `linear-gradient(90deg, ${col}, ${alpha(col, 0)} 72%)`,
              }} />

              <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
                <Dial
                  value={c.gs}
                  pct={100 * c.heat}
                  col={col}
                  size={52}
                  title={`Game Score ${c.gs.toFixed(0)} ${c.edge} — #${c.gsRank} on tonight's slate${c.weak > 0 ? `, ${c.weak} weak lineup spot${c.weak === 1 ? '' : 's'}` : ''}. The ring fills against tonight's own GS range, because a Game Score is defined relative to the slate rather than out of 100.`}
                />
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                    <span style={{
                      fontFamily: NUM_FONT, fontSize: 15.5, fontWeight: 900, letterSpacing: '-.02em',
                      color: C.text, minWidth: 0, flex: '1 1 auto',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      textDecoration: c.past ? 'line-through' : 'none',
                    }}>{c.matchup}</span>
                    {band.icon && <span style={{ fontSize: 11, flexShrink: 0 }}>{band.icon}</span>}
                    {onTarget && (
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => { e.stopPropagation(); onTarget(c.pk) }}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); e.preventDefault(); onTarget(c.pk) } }}
                        title={targets.includes(c.pk) ? 'Targeted — tap to drop it' : 'Target this game (the ⭐ Targets filter above)'}
                        style={{
                          cursor: 'pointer', fontSize: 12, lineHeight: 1, flexShrink: 0,
                          color: targets.includes(c.pk) ? C.yellow : C.text3,
                          opacity: targets.includes(c.pk) ? 1 : 0.5,
                        }}
                      >{targets.includes(c.pk) ? '★' : '☆'}</span>
                    )}
                  </div>

                  {/* the meta line — every mark the old top row carried */}
                  <div style={{
                    display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap',
                    fontSize: 9.5, fontFamily: NUM_FONT, fontWeight: 600, color: C.text3,
                  }}>
                    <span title={c.confMarks ? c.confMarks.tip : (c.confirmed ? 'lineups confirmed' : 'projected lineups')}>
                      {c.confMarks ? c.confMarks.marks : (c.confirmed ? '✓' : '◻')}
                    </span>
                    {c.liveG?.state === 'Live' ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: C.green, fontWeight: 800 }}>
                        <span style={{
                          width: 5, height: 5, borderRadius: '50%', background: C.green,
                          animation: 'gsLivePulse 1.8s ease-in-out infinite', flexShrink: 0,
                        }} />
                        {String(c.liveG.half || '').slice(0, 3)}{c.liveG.inning ?? ''}
                        {c.liveG.outs != null ? ` · ${c.liveG.outs}o` : ''}
                      </span>
                    ) : c.liveG?.state === 'Final' ? (
                      <span style={{ fontWeight: 800 }}>FINAL</span>
                    ) : (
                      <span>{c.time}</span>
                    )}
                    {/* SLEEKER = FEWER MARKS, NOT SMALLER ONES (2026-08-23).
                        #rank and the ▲▽ edge both said "where this game sits
                        on tonight's board" — which is what the dial now draws,
                        in the same glance, without a number to decode. ★weak
                        was a third count competing with them. All three stay
                        available: the dial's tooltip carries the rank, and the
                        sort row above already orders by whatever you asked for.
                        MAIN EVENT survives because it is one card a slate. */}
                    {band.word && (
                      <span style={{ fontSize: 8.5, fontWeight: 900, color: accent, letterSpacing: '.1em', whiteSpace: 'nowrap' }}>
                        {band.word}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* the live score, once there is one */}
              {c.liveG && (c.liveG.awayScore != null || c.liveG.homeScore != null) && (() => {
                const [awayAbbr, homeAbbr] = c.matchup.split(' @ ')
                const aS = c.liveG.awayScore ?? 0, hS = c.liveG.homeScore ?? 0
                return (
                  <div style={{
                    fontFamily: NUM_FONT, fontSize: 13, fontWeight: 900,
                    color: c.liveG.state === 'Live' ? C.green : C.text2,
                    display: 'flex', gap: 6, alignItems: 'baseline',
                  }}>
                    <span style={{ color: aS > hS ? undefined : C.text3 }}>{awayAbbr}</span>
                    <span>{aS}–{hS}</span>
                    <span style={{ color: hS > aS ? undefined : C.text3 }}>{homeAbbr}</span>
                  </div>
                )
              })()}

              {/* THE ARMS AND THE TOP BAT CAME OFF (2026-08-23). Donovan:
                  "game cards can be sleaker less info and more prescion."
                  Both lines repeated what the row below already says better —
                  the TOP chip names the top bat AND scores him, and both
                  starters get a dial, a sentence and five tiles the moment the
                  card is opened. Two truncated grey lines that restate the
                  next row are the definition of less precise, not more.
                  The arms survive as the card's tooltip, so nothing is gone. */}

              {/* THE EITHER/OR ROW, in the prop card's tile language. Same three
                  chips, same order, same grammar, same pair-leg behaviour and
                  the same standing-highlight wash — rounder, roomier, and on
                  the card's own surface instead of a flat bg3 slab. */}
              {(c.topPick || c.hrPick || c.altPick) && (
                <div style={{ display: 'flex', gap: 5, minWidth: 0, flexWrap: 'wrap' }}>
                  {[['TOP', c.topPick, C.yellow, "The bot's TOP pick in this game"],
                    ['HR', c.hrPick, C.orange, "The bot's HR pick in this game"],
                    ['ALT', c.altPick, C.purple, c.altWhy || "The bot's secondary HR look in this game"],
                  ].map(([tag, pk2, cc, tip]) => pk2 && (
                    <span key={tag}
                      title={[
                        pairing ? `${tag} — ${tip} — tap to add him as a pair leg` : `${tag} — ${tip}`,
                        spotTitle(pk2.p),
                      ].filter(Boolean).join('\n')}
                      onClick={pairing ? (e) => { e.stopPropagation(); onPairPick(pk2.p) } : undefined}
                      style={{
                        display: 'inline-flex', gap: 5, alignItems: 'baseline',
                        minWidth: 86, flex: '1 1 31%',
                        fontSize: 9.5, fontFamily: NUM_FONT, fontWeight: 600, color: C.text2,
                        cursor: pairing ? 'pointer' : 'inherit',
                        border: `1px solid ${isLeg(pk2.p) ? cc : C.border}`,
                        background: isLeg(pk2.p) ? alpha(cc, 0.19) : C.glass,
                        boxShadow: isLeg(pk2.p) ? `0 0 10px ${alpha(cc, 0.33)}` : 'none',
                        borderRadius: 10, padding: '4px 8px',
                        ...(isLeg(pk2.p) ? {} : chipSpot(pk2.p)),
                      }}>
                      {isLeg(pk2.p) && <span style={{ fontSize: 8 }}>🔗</span>}
                      <b style={{ color: cc, fontSize: 8, letterSpacing: '.06em', flexShrink: 0 }}>{tag}</b>
                      <span style={{ overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', minWidth: 0, flex: '1 1 auto' }}>{pk2.name}</span>
                      <b style={{ color: isLeg(pk2.p) ? cc : C.text, flexShrink: 0 }}>{pk2.score}</b>
                    </span>
                  ))}
                </div>
              )}
            </button>
          )
        })}
      </div>

      <div style={{ marginTop: 7 }}>
        <div style={{ fontSize: 9.5, color: C.text3, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span>
            {sortBy === 'gs' ? 'Sorted by Game Score, hottest first'
              : sortBy === 'hr9' ? "Sorted by the leakier starter's HR/9, worst first"
              : sortBy === 'air' ? 'Sorted by park factor plus tonight\u2019s weather — the friendliest building first'
              : sortBy === 'set' ? 'Sorted by how much of each lineup is confirmed — the settled games first'
              : sortBy === 'whip' ? "Sorted by the leakier starter's WHIP, worst first"
              : sortBy === 'lowk' ? "Sorted by the softest starter's K/9, lowest first — the arms that have to let you put it in play. Games with no published K/9 sort last rather than reading as zero."
              : 'First-pitch order'}. Heat reads as 🌋/🔥/🧊 and the #rank.
          </span>
          <button onClick={() => setLegendOpen((v) => !v)} style={{
            fontSize: 9, fontWeight: 700, color: C.text3, cursor: 'pointer',
            background: 'transparent', border: `1px dashed ${C.border2}`, borderRadius: 999,
            padding: '1px 8px',
          }}>{legendOpen ? '✕ hide symbols' : '❓ what do the symbols mean'}</button>
        </div>
        {legendOpen && (
          <div style={{ fontSize: 9.5, color: C.text3, marginTop: 5, lineHeight: 1.55 }}>
            🌋 marks tonight&apos;s MAIN EVENT (highest GS), 🔥 runs hot, 🧊 runs cold; #3 at the right of
            the top line is always the game&apos;s GS rank, even when sorted by something else. Those two
            marks are the whole heat signal now — the cards no longer tint, glow or change size, so a
            card&apos;s position means what the sort says it means and the matchup is the loudest thing
            on it. The number beside the matchup is its{' '}
            <strong style={{ color: C.text2 }}>GS</strong> (Game Score: the median of every hitter&apos;s
            four board scores, then the median across the lineup — &ldquo;is this whole lineup
            dangerous&rdquo;, not &ldquo;is there one guy&rdquo;). ▲/▽ = above/below tonight&apos;s median.
            ⚾ the pitching matchup · 🔝 the game&apos;s top bat and his HR score · ★ weak lineup spots
            · ✓✓/✓◻ per-team lineup posted or projected. Every card carries the same three chips —
            <strong style={{ color: C.yellow }}> TOP</strong>,
            <strong style={{ color: C.orange }}> HR</strong> and
            <strong style={{ color: C.purple }}> ALT</strong> (the bot&apos;s secondary HR lane, hover for
            the reason) — name and score, so the either/or is one glance. A chip only appears when the
            bot actually published that lane, and never names the same hitter twice on one card.
            {onPairPick ? ' Tap any chip to add him as a pair leg; 🔗 marks the legs you already have.' : ''}
            {' '}Click a card to open the full deep-dive below the grid; click it again to close.
          </div>
        )}
      </div>
    </div>
    </MobileFold>
  )
}
