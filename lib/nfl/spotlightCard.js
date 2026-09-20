// lib/nfl/spotlightCard.js — PLAYER SPOTLIGHT, TUDDY's showcase card.
//
// 2026-09-20, Donovan, one word: "wheres the card". He was right — the whole
// brief was "player spot lights just like mlb", and MOONSHOT's THE HOT STRETCH
// is one of only a handful of posts that KEPT its card when the rest went
// text-only. A stacked stat line is exactly what a card is for; shipping the
// football twin without one was half the job.
//
// SAME CARD, NOT A SECOND ONE. The frame, palette, top band, footer and stat
// chip are imported from lib/nfl/tdCard.js rather than restated here — that
// file is TUDDY's card language and this is a new card in it. The only things
// this file adds are the ones the touchdown alert has no use for: the player's
// own club colours, his headshot, and a hero number.
//
// THE HERO IS TOTAL TOUCHDOWNS. The stacked rows deliberately split a
// quarterback's scores across passing and rushing (Josh Allen's Thursday was
// 3 PASS TD and 2 RUSH TD), so the sum is the fact the card has to lead with —
// the same reason the tweet's closing line carries it.
//
// EVERY FIELD REAL OR ABSENT. A receiver with no carries gets no CAR tile;
// a missing headshot falls back to the club monogram. Nothing is invented and
// nothing draws an empty box — the same rule tdCard.js's own header states.

import { nflTeamLogo } from './nflAssets'
import { nflTones } from './teamColors'
import {
  frame, TopBand, Footer, Field, Tile, Jersey, inkOn, one, loadHeadshot,
  loadDisplay, loadFonts, loadMark,
  JADE, INK, DIM, PANEL, RULE, DISPLAY,
} from './tdCard'

// ── MODELLED ON MOONSHOT'S HOT STRETCH CARD ─────────────────────────────────
//
// Donovan: "i like A but make better overall, model after mlb one with the
// team color and all that."
//
// So this is lib/dash/homerCard.js's hotStretchCard, structure for structure,
// in TUDDY's palette. What that card does and this one was not:
//
//   THE HERO LIVES INSIDE THE PORTRAIT PLATE. MLB puts OPS under a rule
//   beneath the face, in one emblem. Mine had the numeral floating in open
//   canvas beside a separate photo, so the two competed instead of reading as
//   one object.
//   A SOLID TEAM-COLOUR PILL beside the name, with its ink flipped for
//   contrast -- the only place the club's actual colour is stated flat rather
//   than as a wash.
//   CENTRED, EQUAL TILES in the accent colour, not left-aligned boxes.
//   THE COMPARISON IS A BORDERED PANEL with its own header bar and an arrow
//   per row, not four loose lines.
//
// Kept from the football pass: the field geometry, because rule 10 asks these
// cards to speak football and MOONSHOT's has no equivalent to borrow.

// one(), inkOn(), loadHeadshot() and Field() were written here and now live in
// lib/nfl/tdCard.js, because the touchdown card wanted every one of them
// unchanged. One cache, one contrast rule, one field — both cards.

/**
 * `pick` is a lib/nfl/tweetFeed.js spotlightPick() result. `windowLabel` and
 * `statement` are the same strings the tweet uses, so the card and the post
 * can never disagree about which week this is or what it claims.
 */
export async function spotlightCard(pick, { site = 'dashnetwork.vercel.app', windowLabel = '', statement = '', context = '' } = {}) {
  const [display, base, mark, shot] = await Promise.all([
    loadDisplay(), loadFonts(), loadMark(), loadHeadshot(pick?.player_id),
  ])
  const fonts = [...display, ...base]
  const [c1, c2] = nflTones(pick?.team)
  const td = (pick?.patd || 0) + (pick?.rutd || 0) + (pick?.rectd || 0)
  const label = String(windowLabel || 'SPOTLIGHT').toUpperCase()

  // The supporting numerals. TOTAL TD is deliberately NOT here -- it is the
  // hero in the emblem, and printing it twice would flatten the hierarchy the
  // card exists to create. Straight from MOONSHOT's own note on OPS.
  const tiles = [
    pick?.payd > 0 ? { label: 'PASS YDS', value: pick.payd } : null,
    pick?.patd > 0 ? { label: 'PASS TD', value: pick.patd } : null,
    pick?.ruyd > 0 ? { label: 'RUSH YDS', value: pick.ruyd } : null,
    pick?.rec > 0 ? { label: 'REC', value: pick.rec } : null,
    pick?.recyd > 0 ? { label: 'REC YDS', value: pick.recyd } : null,
  ].filter(Boolean).slice(0, 5)

  // THIS WEEK vs HIS OWN AVERAGE. Per-game season rates off the slate row's
  // `stats` block -- the same one RED ZONE TARGETS reads. Only rows where both
  // halves are real; a row blank on either side says nothing.
  const a = pick?.avg || {}
  const cmp = [
    a.td != null ? { label: 'TD', avg: one(a.td), now: String(td) } : null,
    a.xtd != null ? { label: 'EXPECTED TD', avg: one(a.xtd), now: String(td) } : null,
    pick?.payd > 0 && a.payd != null ? { label: 'PASS YDS', avg: one(a.payd), now: String(pick.payd) } : null,
    pick?.ruyd > 0 && a.ruyd != null ? { label: 'RUSH YDS', avg: one(a.ruyd), now: String(pick.ruyd) } : null,
    pick?.recyd > 0 && a.rz != null ? { label: 'RZ TOUCHES', avg: one(a.rz), now: '—' } : null,
  ].filter(Boolean).slice(0, 4).map((r) => ({ ...r, up: Number(r.now) >= Number(r.avg) }))

  return frame(
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, position: 'relative' }}>
      {/* His club behind the emblem -- the same wash shape MOONSHOT uses. */}
      <div style={{ position: 'absolute', right: 0, top: 0, width: 560, height: 460, display: 'flex',
        background: `radial-gradient(circle at 100% 0%, ${c1}4d 0%, ${c2}1f 44%, rgba(0,0,0,0) 72%)` }} />
      <Field tint={JADE} />

      <TopBand mark={mark} tag={label} />

      {/* THE EMBLEM: face, window, and the one number that earned the card,
          in a single plate. This is the piece Donovan picked, with the hero
          moved inside it the way MOONSHOT's OPS sits under its own rule. */}
      {/* EXPLICIT HEIGHT, on purpose. An absolutely positioned plate with
          auto height collapsed in satori: first it let the 88px numeral render
          straight through the bottom border, and with alignSelf:'stretch' on
          the inner column it dropped the numeral entirely. Both are the kind
          of thing that only shows up in a render, so the box is sized and the
          content sized to fit it rather than the other way round. */}
      <div style={{ position: 'absolute', right: 40, top: 104, width: 288, height: 386, display: 'flex', flexDirection: 'column',
        alignItems: 'center', padding: '16px 16px 14px 16px', border: `1px solid ${RULE}`, background: 'rgba(7,9,10,0.82)' }}>
        {shot
          ? <img src={shot} width={176} height={176} style={{ border: `2px solid ${c1}`, background: `${c1}22` }} />
          : <img src={nflTeamLogo(pick?.team, 176, true)} width={176} height={176} />}
        <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: 3, marginTop: 12, color: INK }}>{label}</span>
        <div style={{ display: 'flex', width: 254, height: 1, background: `${c1}99`, marginTop: 12 }} />
        <span style={{ fontFamily: DISPLAY, fontSize: 86, fontWeight: 900, lineHeight: 1, color: JADE,
          transform: 'skewX(-8deg)', marginTop: 12 }}>{td}</span>
        <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: 3.4, color: INK, marginTop: 2 }}>TOTAL TD</span>
      </div>

      {/* Identity. Eyebrow, name, then the club stated FLAT as a pill -- the
          one place the colour is the colour and not a wash. */}
      <div style={{ display: 'flex', flexDirection: 'column', padding: '28px 356px 0 40px' }}>
        <span style={{ fontSize: 13.5, fontWeight: 800, letterSpacing: 6, color: JADE }}>THE BIGGEST NIGHT</span>
        <span style={{ fontFamily: DISPLAY, fontSize: 72, fontWeight: 900, lineHeight: 0.98, marginTop: 5,
          transform: 'skewX(-8deg)', letterSpacing: -1 }}>{String(pick?.name || '')}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
          {pick?.team
            ? <span style={{ background: c1, color: inkOn(c1), border: `1px solid ${c1}`, fontSize: 15, fontWeight: 800,
              letterSpacing: 1.4, borderRadius: 999, padding: '4px 14px', display: 'flex' }}>{pick.team}</span>
            : null}
          <Jersey n={pick?.jersey} tint={c1} />
          <span style={{ fontSize: 16, fontWeight: 800, color: INK }}>
            {[pick?.position, pick?.opp ? `vs ${pick.opp}` : '', pick?.seasonTd != null ? `${pick.seasonTd} TD ON THE YEAR` : '']
              .filter(Boolean).join(' · ')}
          </span>
        </div>
      </div>

      {tiles.length
        ? (
          <div style={{ display: 'flex', gap: 10, margin: '24px 356px 0 40px' }}>
            {tiles.map((t) => <Tile key={t.label} label={t.label} value={t.value} />)}
          </div>
        )
        : null}

      {/* Right margin matches the tiles, NOT the card. At full width this
          panel is opaque and sits later in the tree than the absolutely
          positioned emblem, so it painted straight over the hero numeral --
          the 5 was there the whole time, behind this box. */}
      {cmp.length
        ? (
          <div style={{ display: 'flex', flexDirection: 'column', margin: '20px 356px 0 40px', border: `1px solid ${RULE}`, background: PANEL }}>
            <div style={{ display: 'flex', alignItems: 'center', padding: '9px 16px', borderBottom: `1px solid ${RULE}` }}>
              <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: 1.6 }}>{`${label} vs HIS AVERAGE`}</span>
              <span style={{ marginLeft: 'auto', fontSize: 10.5, fontWeight: 800, letterSpacing: 2, color: DIM }}>PER GAME</span>
            </div>
            <div style={{ display: 'flex', padding: '14px 16px 16px 16px' }}>
              {cmp.map((r) => (
                <div key={r.label} style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                  <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 2.4, color: '#b9b2a8' }}>{r.label}</span>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 3 }}>
                    <span style={{ fontSize: 18, fontWeight: 800, color: DIM }}>{r.avg}</span>
                    <span style={{ fontSize: 13, fontWeight: 800, color: r.up ? JADE : DIM }}>{r.up ? '▲' : '▼'}</span>
                    <span style={{ fontSize: 21, fontWeight: 800, color: INK }}>{r.now}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
        : null}

      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'flex-end', padding: '0 356px 18px 40px' }}>
        <div style={{ display: 'flex', height: 1, background: RULE, marginBottom: 16 }} />
        <span style={{ fontFamily: DISPLAY, fontSize: 44, fontWeight: 900, lineHeight: 1.02, letterSpacing: -0.4,
          transform: 'skewX(-8deg)', color: INK }}>{String(statement || '').toUpperCase()}</span>
        {context
          ? <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: 2.4, color: DIM, marginTop: 9 }}>{context}</span>
          : null}
      </div>

      <Footer />
    </div>,
    fonts,
  )
}
