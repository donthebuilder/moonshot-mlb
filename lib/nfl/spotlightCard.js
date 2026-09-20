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
      const url = nflHeadshot(id, 280, 205)
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
function Tile({ label, value }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', padding: '16px 20px', border: `1px solid ${RULE}`, background: PANEL, flex: 1 }}>
      <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2.4, color: '#b9b2a8' }}>{label}</span>
      <span style={{ fontFamily: DISPLAY, fontSize: 52, fontWeight: 900, lineHeight: 1.05, color: INK, transform: 'skewX(-8deg)' }}>{String(value)}</span>
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

  return frame(
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, position: 'relative' }}>
      {/* The club's own colours, as a wash rather than a block: the card stays
          TUDDY jade-and-cyan and the team reads as context. */}
      <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 560, display: 'flex',
        background: `linear-gradient(115deg, ${c1}00 0%, ${c1}44 55%, ${c2}33 100%)` }} />
      <TopBand mark={mark} tag={windowLabel || 'SPOTLIGHT'} />

      <div style={{ display: 'flex', padding: '26px 40px 0 40px', gap: 28, alignItems: 'flex-start' }}>
        {shot
          ? <img src={shot} width={200} height={146} style={{ border: `1px solid ${JADE}55`, background: PANEL }} />
          : <img src={nflTeamLogo(pick?.team, 120, true)} width={120} height={120} />}
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
          <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: 3, color: JADE }}>
            {[pick?.position, pick?.team].filter(Boolean).join(' · ')}
          </span>
          <span style={{ fontFamily: DISPLAY, fontSize: 74, fontWeight: 900, lineHeight: 1, letterSpacing: -1,
            transform: 'skewX(-8deg)', marginTop: 4 }}>
            {String(pick?.name || '').toUpperCase()}
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2.6, color: '#b9b2a8' }}>TOTAL TD</span>
          <span style={{ fontFamily: DISPLAY, fontSize: 118, fontWeight: 900, lineHeight: 0.92, color: JADE,
            transform: 'skewX(-8deg)' }}>{td}</span>
          {breakdown
            ? <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1.6, color: DIM, marginTop: 2 }}>{breakdown}</span>
            : null}
        </div>
      </div>

      {tiles.length
        ? (
          <div style={{ display: 'flex', gap: 12, padding: '24px 40px 0 40px' }}>
            {tiles.map((t) => <Tile key={t.label} label={t.label} value={t.value} />)}
          </div>
        )
        : null}

      {/* THE BOTTOM HALF WAS 280px OF NOTHING on the first render, which is
          the exact flaw already logged against tdCard.js. Filled the way rule
          30 asks -- stronger hierarchy, not more panels: one editorial line
          at display size, the same sentence the tweet closes with, over the
          game it happened in. The card now reads top to bottom as portrait ->
          numbers -> statement. */}
      {/* flex:1 + flex-end, NOT marginTop:auto. The Footer imported from
          tdCard.js already carries marginTop:'auto', and two auto-margined
          siblings SPLIT the free space between them -- which is why the first
          attempt at this fix left a 90px band of nothing under the statement.
          Absorbing the space here and bottom-aligning inside it puts the
          statement directly above the footer rule. */}
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'flex-end', padding: '0 40px 22px 40px' }}>
        <div style={{ display: 'flex', height: 1, background: RULE, marginBottom: 18 }} />
        <span style={{ fontFamily: DISPLAY, fontSize: 56, fontWeight: 900, lineHeight: 1.02, letterSpacing: -0.5,
          transform: 'skewX(-8deg)', color: INK }}>
          {String(statement || '').toUpperCase()}
        </span>
        {context
          ? <span style={{ fontSize: 14, fontWeight: 800, letterSpacing: 2.4, color: DIM, marginTop: 10 }}>{context}</span>
          : null}
      </div>

      <Footer />
    </div>,
    fonts,
  )
}
