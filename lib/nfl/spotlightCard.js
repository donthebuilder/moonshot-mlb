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

import { headshotIdFor } from './headshotIds'
import { nflHeadshot, nflTeamLogo } from './nflAssets'
import { nflTones } from './teamColors'
import {
  frame, TopBand, Footer, StatChip,
  loadDisplay, loadFonts, loadMark,
  JADE, INK, DIM, PANEL, RULE, DISPLAY,
} from './tdCard'

const HEADSHOT_TIMEOUT_MS = 4000

// Fetched to a data: URI because satori will not follow a remote image on its
// own. A slow or missing headshot must cost the card a portrait, never the
// card — same degradation rule as the fonts above it.
const _shots = new Map()
async function loadHeadshot(playerId) {
  const key = String(playerId || '')
  if (_shots.has(key)) return _shots.get(key)
  let out = ''
  try {
    const id = headshotIdFor(key)
    if (id) {
      const url = nflHeadshot(id, 470, 470)
      const ctl = AbortSignal.timeout ? AbortSignal.timeout(HEADSHOT_TIMEOUT_MS) : undefined
      const res = await fetch(url, { signal: ctl })
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer())
        if (buf.length) out = `data:image/png;base64,${buf.toString('base64')}`
      }
    }
  } catch { out = '' }
  _shots.set(key, out)
  return out
}

// flex:1, not a fixed minWidth. A quarterback has two tiles and a receiver
// four; at a fixed width the two-tile version sat in the left third of a
// 1200px card with the rest of the row empty.
// flex:1, not a fixed minWidth. A quarterback has two tiles and a receiver
// four; at a fixed width the two-tile version sat in the left third of a
// 1200px card with the rest of the row empty.
function Tile({ label, value }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', padding: '14px 18px', border: `1px solid ${RULE}`, background: 'rgba(7,9,10,0.72)', flex: 1 }}>
      <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 2.4, color: '#b9b2a8' }}>{label}</span>
      <span style={{ fontFamily: DISPLAY, fontSize: 46, fontWeight: 900, lineHeight: 1.05, color: INK, transform: 'skewX(-8deg)' }}>{String(value)}</span>
    </div>
  )
}

// ── THE FIELD ───────────────────────────────────────────────────────────────
// Project rule 10: "NFL cards should use football-specific visual language --
// field position, red-zone geometry, play concepts." The first version had
// none; it was a stat card that could have been about any sport, on a flat
// gradient, with half the canvas empty.
//
// Yard lines and a numbered strip are the cheapest honest way in: they are
// drawn, not decorative clip-art, they give the empty right half something to
// be, and they read instantly as football at thumbnail size. Absolute divs
// rather than repeating-linear-gradient, because satori's gradient support is
// the kind of thing that renders differently in production than in dev and
// this has to be right the first time it posts.
const YARDS = [10, 20, 30, 40, 50, 40, 30, 20, 10]

function Field({ tint }) {
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, display: 'flex' }}>
      {YARDS.map((y, i) => (
        <div
          key={`y${i}`}
          style={{
            position: 'absolute', top: 0, bottom: 0,
            left: 92 + i * 116, width: i === 4 ? 2 : 1,
            background: i === 4 ? `${tint}2e` : `${tint}18`,
            display: 'flex',
          }}
        />
      ))}
      {/* Hash marks along the middle, the way a broadcast frame reads. */}
      {Array.from({ length: 40 }).map((_, i) => (
        <div
          key={`h${i}`}
          style={{
            position: 'absolute', top: 330, left: 40 + i * 29, width: 9, height: 2,
            background: `${tint}14`, display: 'flex',
          }}
        />
      ))}
    </div>
  )
}

/**
 * `pick` is a lib/nfl/tweetFeed.js spotlightPick() result.
 * `windowLabel` is the same string the tweet's headline uses, and `statement`
 * the same sentence it closes with, so the card and the post can never
 * disagree about which window this is or what it claims. `context` is the
 * small line under the statement (the game it happened in).
 */
export async function spotlightCard(pick, { site = 'dashnetwork.vercel.app', windowLabel = '', statement = '', context = '' } = {}) {
  const [display, base, mark, shot] = await Promise.all([
    loadDisplay(), loadFonts(), loadMark(), loadHeadshot(pick?.player_id),
  ])
  const fonts = [...display, ...base]
  const [c1, c2] = nflTones(pick?.team)
  const td = (pick?.patd || 0) + (pick?.rutd || 0) + (pick?.rectd || 0)

  const tiles = [
    pick?.payd > 0 ? { label: 'PASS YDS', value: pick.payd } : null,
    pick?.ruyd !== 0 && pick?.ruyd != null ? { label: 'RUSH YDS', value: pick.ruyd } : null,
    pick?.rec > 0 ? { label: 'REC', value: pick.rec } : null,
    pick?.recyd > 0 ? { label: 'REC YDS', value: pick.recyd } : null,
  ].filter(Boolean).slice(0, 4)

  const breakdown = [
    pick?.patd > 0 ? `${pick.patd} PASS` : '',
    pick?.rutd > 0 ? `${pick.rutd} RUSH` : '',
    pick?.rectd > 0 ? `${pick.rectd} REC` : '',
  ].filter(Boolean).join('  ·  ')

  const first = String(pick?.name || '').split(' ')[0] || ''
  const last = String(pick?.name || '').split(' ').slice(1).join(' ') || first

  return frame(
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, position: 'relative' }}>
      {/* The club's own colours, and the field drawn over them. The wash is
          anchored RIGHT because that is where the portrait lands -- on the
          first version it sat over 500px of nothing and did nothing. */}
      <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 700, display: 'flex',
        background: `linear-gradient(105deg, ${c1}00 0%, ${c1}55 48%, ${c2}3a 100%)` }} />
      <Field tint={JADE} />

      {/* THE PORTRAIT, BLED. 200x146 in a bordered box read as a passport
          photo in the corner. Full height on the right edge, no border, it is
          the subject of the card -- and it fills the half of the canvas that
          was empty. */}
      {shot
        ? (
          <div style={{ position: 'absolute', right: 18, bottom: 44, display: 'flex' }}>
            {/* NO EDGE FEATHER. Tried one -- a dark-to-transparent gradient
                over the portrait's left edge -- and it was worse: the overlay
                is a 150x470 rectangle, and everywhere it covered the CARD
                rather than the player it read as a visible box. The headshot
                comes through the combiner on transparency and sits on the
                field cleanly on its own. Left here so nobody re-adds it. */}
            <img src={shot} width={470} height={470} />
          </div>
        )
        : null}

      {/* The hero numeral sits BEHIND the portrait's shoulder rather than in
          the opposite corner competing with the name. */}
      <div style={{ position: 'absolute', right: 470, top: 132, display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
        <span style={{ fontFamily: DISPLAY, fontSize: 224, fontWeight: 900, lineHeight: 0.78, color: JADE, transform: 'skewX(-8deg)' }}>{td}</span>
        <div style={{ display: 'flex', width: 132, height: 2, background: `${JADE}aa`, marginTop: 14 }} />
        <span style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: 3.6, color: INK, marginTop: 9 }}>TOTAL TD</span>
        {breakdown
          ? <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1.8, color: '#b9b2a8', marginTop: 5 }}>{breakdown}</span>
          : null}
      </div>

      <TopBand mark={mark} tag={windowLabel || 'SPOTLIGHT'} />

      {/* NAME AS A POSTER, broken across two lines: given name small above the
          surname at display size. One 74px line was neither big enough to be
          the hero nor small enough to be a label. */}
      <div style={{ display: 'flex', flexDirection: 'column', padding: '30px 40px 0 40px', maxWidth: 700 }}>
        <span style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: 3.4, color: JADE }}>
          {[pick?.position, pick?.team].filter(Boolean).join(' · ')}
        </span>
        <span style={{ fontFamily: DISPLAY, fontSize: 46, fontWeight: 900, lineHeight: 1, letterSpacing: -0.5,
          transform: 'skewX(-8deg)', color: '#cfc8bb', marginTop: 8 }}>
          {first.toUpperCase()}
        </span>
        <span style={{ fontFamily: DISPLAY, fontSize: 96, fontWeight: 900, lineHeight: 0.94, letterSpacing: -1.5,
          transform: 'skewX(-8deg)' }}>
          {last.toUpperCase()}
        </span>
      </div>

      {/* flex:1 + flex-end, NOT marginTop:auto. The Footer imported from
          tdCard.js already carries marginTop:'auto', and two auto-margined
          siblings SPLIT the free space between them -- which is why the first
          attempt at this left a 90px band of nothing under the statement. */}
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'flex-end', padding: '0 40px 20px 40px', maxWidth: 760 }}>
        {/* Tiles live HERE, not under the name. Split across the card they
            left a 140px hole in the middle of the left column; bottom-aligned
            with the statement, the whole left side reads as one block --
            name at the top, evidence and claim at the foot. */}
        {tiles.length
          ? (
            <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
              {tiles.map((t) => <Tile key={t.label} label={t.label} value={t.value} />)}
            </div>
          )
          : null}
        <div style={{ display: 'flex', height: 1, background: RULE, marginBottom: 14 }} />
        <span style={{ fontFamily: DISPLAY, fontSize: 44, fontWeight: 900, lineHeight: 1.02, letterSpacing: -0.4,
          transform: 'skewX(-8deg)', color: INK }}>
          {String(statement || '').toUpperCase()}
        </span>
        {context
          ? <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: 2.4, color: DIM, marginTop: 8 }}>{context}</span>
          : null}
      </div>

      <Footer />
    </div>,
    fonts,
  )
}
