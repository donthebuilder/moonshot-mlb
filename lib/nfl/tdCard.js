// lib/nfl/tdCard.js — THE END ZONE: the live touchdown alert, TUDDY-branded.
//
// 2026-09-13 (Donovan: "tuddy tweets should fire after every touchdown too",
// then "yes, adapt v5" over a fresh live-alert layout). The palette, frame,
// and TopBand/Footer/StatChip primitives below are promoted out of the
// design-exploration prototype from earlier the same session (the v2-v5
// CALLED IT brand pass) — jade/cyan is TUDDY's own already-established
// accent pair (lib/nfl/theme.js), kept separate from MOONSHOT's orange
// rather than reusing lib/dash/homerCard.js's Header/Footer, which hardcode
// "MOONSHOT" and orange and are not parameterized by segment.
//
// EVERY FIELD HERE IS REAL OR ABSENT, NEVER GUESSED. lib/nfl/tdFeed.js's
// buildTdEvent() already enforces this on the data side (a missed roster
// join omits season-to-date/on-the-bot rather than fabricating them) — this
// file's only job is to not draw a box for a field that came back null.
//
// AIR YARDS, DROPPED (2026-09-13, Donovan's call after I flagged it): no
// free live source has it at post time — nflreadpy's play-by-play, the only
// free source with it at all, updates at best ~15 min after the game ends
// (nfl_pbp.py's own docstring). TD distance stays; it's on the play itself.
//
// OPPONENT DEFENSE-BY-ROLE, NOW WIRED (2026-09-13, "fill those cards up"):
// the depth-chart role this box needs turned out to already be published --
// nfl_matchup.json's own `roles` map (gsis_id -> "RB1"/"WR2"/"Other WR"/...)
// -- so lib/nfl/tdFeed.js's buildTdEvent() resolves it with the SAME
// matchupTag() the Games/Matchups pages already use for the pregame
// TARGET/AVOID/EVEN tag, not a fresh resolver. ev.defense is null (box
// omitted) when the roster join or the role lookup comes up empty.

import { ImageResponse } from 'next/og'
import { readFile } from 'node:fs/promises'
import { headshotIdFor } from './headshotIds'
import { nflHeadshot, nflTeamLogo } from './nflAssets'
import { nflTones } from './teamColors'

const ORANGE = '#f4581f'
export const JADE = '#00f5ad'
export const CYAN = '#35cdff'
export const INK = '#efe9dd'
export const DIM = '#8f8a83'
export const PANEL = '#12100e'
export const RULE = 'rgba(239,233,221,0.15)'
export const DISPLAY = 'Shoulders'
// Exported (2026-09-20) so lib/nfl/spotlightCard.js can be the SAME card, not
// a second one that drifts. The palette, the frame, the top band, the footer
// and the stat chip are TUDDY's card language; a new card type should inherit
// them rather than restate them (project rule 21, "avoid duplicated business
// logic" -- this is its visual equivalent).

const FIELD_NFL = [
  'radial-gradient(circle at 8% -8%, rgba(0,245,173,0.22) 0%, rgba(0,245,173,0) 42%)',
  'radial-gradient(circle at 96% -10%, rgba(53,205,255,0.20) 0%, rgba(53,205,255,0) 40%)',
  'radial-gradient(circle at 92% 112%, rgba(0,245,173,0.10) 0%, rgba(0,245,173,0) 46%)',
  '#07090a',
].join(', ')

let _display = null
export async function loadDisplay() {
  if (_display) return _display
  try {
    const b = await readFile(`${process.cwd()}/public/fonts/BigShouldersDisplay-900.ttf`)
    _display = [{ name: DISPLAY, data: b, weight: 900, style: 'normal' }]
  } catch { _display = [] }
  return _display
}

let _base = null
export async function loadFonts() {
  if (_base) return _base
  try {
    const css = await fetch('https://fonts.googleapis.com/css2?family=Inter:wght@400;800&display=swap', { headers: { 'User-Agent': '' } }).then((r) => r.text())
    const urls = [...css.matchAll(/font-weight:\s*(\d+);[^}]*?src:\s*url\(([^)]+)\)/g)]
    const out = []
    for (const [, weight, url] of urls) out.push({ name: 'Inter', data: await fetch(url).then((r) => r.arrayBuffer()), weight: Number(weight), style: 'normal' })
    _base = out
  } catch { _base = [] }
  return _base
}

let _mark = null
export async function loadMark() {
  if (_mark != null) return _mark
  try {
    const b = await readFile(`${process.cwd()}/public/dash-network-mark-128.png`)
    _mark = `data:image/png;base64,${b.toString('base64')}`
  } catch { _mark = '' }
  return _mark
}

export function frame(children, fonts) {
  return new ImageResponse(
    (
      <div style={{ width: 1200, height: 675, display: 'flex', flexDirection: 'column', background: FIELD_NFL, color: INK, position: 'relative', ...(fonts.length ? { fontFamily: 'Inter' } : {}) }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 8, background: JADE, display: 'flex' }} />
        <div style={{ position: 'absolute', left: 16, top: 16, width: 15, height: 15, borderTop: `2px solid ${JADE}`, borderLeft: `2px solid ${JADE}`, display: 'flex' }} />
        <div style={{ position: 'absolute', right: 16, top: 16, width: 15, height: 15, borderTop: `2px solid ${JADE}`, borderRight: `2px solid ${JADE}`, display: 'flex' }} />
        <div style={{ position: 'absolute', left: 16, bottom: 24, width: 15, height: 15, borderBottom: `2px solid ${JADE}`, borderLeft: `2px solid ${JADE}`, display: 'flex' }} />
        <div style={{ position: 'absolute', right: 16, bottom: 24, width: 15, height: 15, borderBottom: `2px solid ${JADE}`, borderRight: `2px solid ${JADE}`, display: 'flex' }} />
        {children}
      </div>
    ),
    { width: 1200, height: 675, fonts: fonts.length ? fonts : undefined },
  )
}

export function TopBand({ mark, tag }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '24px 40px 0 40px', gap: 14 }}>
        {mark
          ? <img src={mark} width={44} height={44} style={{ borderRadius: 10, border: `1px solid ${JADE}66` }} />
          : <div style={{ width: 44, height: 44, borderRadius: 10, background: JADE, display: 'flex' }} />}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: 19, fontWeight: 800, letterSpacing: -0.2 }}>CALLED IT 🤖</span>
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 2.4, color: '#b9b2a8' }}>POWERED BY DASH NETWORK</span>
        </div>
        <span style={{ marginLeft: 26, fontSize: 13, fontWeight: 800, letterSpacing: 3, color: JADE }}>🏈 TUDDY</span>
        <div style={{ display: 'flex', marginLeft: 'auto', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 11.5, fontWeight: 800, color: JADE, border: `1px solid ${JADE}88`, borderRadius: 999, padding: '5px 13px', letterSpacing: 1.8 }}>{tag}</span>
        </div>
      </div>
      <div style={{ display: 'flex', height: 1, background: `linear-gradient(90deg, ${JADE}99 0%, ${RULE} 34%, ${RULE} 100%)`, marginTop: 16 }} />
    </div>
  )
}

export function Footer() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', marginTop: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '12px 40px', borderTop: `1px solid ${RULE}` }}>
        <span style={{ fontSize: 14, fontWeight: 800, letterSpacing: 4 }}>CALLED IT</span>
        <span style={{ marginLeft: 16, fontSize: 11, letterSpacing: 2.6, color: DIM }}>GRADED IN PUBLIC</span>
        <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 800, letterSpacing: 1.4, color: '#b9b2a8' }}>dashnetwork.vercel.app/called</span>
      </div>
      <div style={{ display: 'flex', height: 7, background: JADE }} />
    </div>
  )
}

export function StatChip({ label, value, unit }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', padding: '10px 18px', border: `1px solid ${RULE}`, background: PANEL, flex: 1 }}>
      <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 2.2, color: '#b9b2a8' }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, marginTop: 2 }}>
        <span style={{ fontFamily: DISPLAY, fontSize: 34, fontWeight: 900, lineHeight: 1, color: JADE, transform: 'skewX(-8deg)' }}>{String(value)}</span>
        {unit ? <span style={{ fontSize: 12, fontWeight: 800, color: INK }}>{unit}</span> : null}
      </div>
    </div>
  )
}


// ── SHARED CARD PIECES (2026-09-20) ────────────────────────────────────────
// inkOn/one/loadHeadshot/Field were written on lib/nfl/spotlightCard.js and
// then wanted, unchanged, by the touchdown card. Two copies of a luminance
// test and a headshot cache is exactly the duplication project rule 21 names,
// so they live here — in TUDDY's card language file — and spotlightCard.js
// imports them. One cache, one field, one contrast rule, both cards.

// Black or cream on a club colour, by luminance.
export function inkOn(hex) {
  const h = String(hex || '').replace('#', '')
  if (h.length !== 6) return '#07090a'
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
  return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#07090a' : INK
}

export const one = (v) => (v == null ? '' : (Math.round(Number(v) * 10) / 10).toFixed(1))

const HEADSHOT_TIMEOUT_MS = 4000

// Fetched to a data: URI because satori will not follow a remote image on its
// own. A slow or missing headshot must cost the card a portrait, never the
// card — same degradation rule as the fonts above.
const _shots = new Map()
export async function loadHeadshot(playerId) {
  const key = String(playerId || '')
  if (_shots.has(key)) return _shots.get(key)
  let out = ''
  try {
    const id = headshotIdFor(key)
    if (id) {
      const url = nflHeadshot(id, 176, 176)
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

// ── THE FIELD ───────────────────────────────────────────────────────────────
// Project rule 10: NFL cards should speak football. Yard lines and hash marks
// are the cheapest honest way in — drawn, not clip-art, and they read as
// football at thumbnail size. Absolute divs rather than
// repeating-linear-gradient, because satori's gradient handling is the kind of
// thing that renders differently in production than in dev.
const YARDS = [10, 20, 30, 40, 50, 40, 30, 20, 10]

export function Field({ tint }) {
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, display: 'flex' }}>
      {YARDS.map((y, i) => (
        <div key={`y${i}`} style={{ position: 'absolute', top: 0, bottom: 0, left: 92 + i * 116,
          width: i === 4 ? 2 : 1, background: i === 4 ? `${tint}2e` : `${tint}18`, display: 'flex' }} />
      ))}
      {Array.from({ length: 40 }).map((_, i) => (
        <div key={`h${i}`} style={{ position: 'absolute', top: 330, left: 40 + i * 29, width: 9, height: 2,
          background: `${tint}14`, display: 'flex' }} />
      ))}
    </div>
  )
}

// The centred, equal-width accent tile both cards use for supporting numerals.
export function Tile({ label, value, unit }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, alignItems: 'center',
      border: `1px solid ${RULE}`, background: PANEL, padding: '14px 6px 12px 6px' }}>
      <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 2.2, color: '#b9b2a8' }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 2 }}>
        <span style={{ fontFamily: DISPLAY, fontSize: 40, fontWeight: 900, lineHeight: 1.05, color: JADE,
          transform: 'skewX(-8deg)' }}>{String(value)}</span>
        {unit ? <span style={{ fontSize: 12, fontWeight: 800, color: INK }}>{unit}</span> : null}
      </div>
    </div>
  )
}

/**
 * The touchdown alert card. `ev` is a lib/nfl/tdFeed.js buildTdEvent() result.
 * Every enrichment row is conditional on the field actually being present.
 *
 * REBUILT 2026-09-20 (Donovan: "i think the touchdown cards need to be batter
 * too", one message after approving the spotlight card's direction). It is now
 * the SAME card as lib/nfl/spotlightCard.js — portrait plate on the right with
 * the hero number under its own rule, the club colour stated flat as a pill
 * with its ink flipped for contrast, centred equal tiles, the field geometry,
 * and the bottom band filled with the claim rather than left as 120px of dead
 * black. What it had before: no headshot, no team colour anywhere (the
 * opponent pill was a hardcoded navy), and a stranded gap above the footer.
 *
 * THE RIGHT MARGIN IS 356 ON EVERY OPAQUE BLOCK, on purpose. The plate is
 * absolutely positioned and sits earlier in the tree, so a full-width opaque
 * panel paints straight over the hero numeral — the exact bug the spotlight
 * card hit and the reason that number is sized to a box rather than the
 * other way round.
 *
 * STILL REAL OR ABSENT. A scorer whose roster join failed gets the club
 * monogram instead of a face and simply no board plate; a play with no parsed
 * distance gets no distance tile. Nothing here is invented to fill space.
 */
export async function tdCard(ev, { site = 'dashnetwork.vercel.app' } = {}) {
  const [base, display, mark, shot] = await Promise.all([
    loadFonts(), loadDisplay(), loadMark(), loadHeadshot(ev?.gsisId),
  ])
  const fonts = [...base, ...display]
  const [c1, c2] = nflTones(ev?.team)

  const headline = ev.scorerName || ev.text
  const scoreLine = (ev.awayScore != null && ev.homeScore != null) ? `${ev.awayScore}–${ev.homeScore}` : null
  const distanceYd = ev.parsed?.yards ?? null
  const subhead = ev.parsed
    ? (ev.parsed.passer ? `${distanceYd} yd from ${ev.parsed.passer}` : `${distanceYd} yd ${ev.parsed.kind}`)
    : null

  // THE PLATE'S HERO, in the order the product ranks them: a designated pick
  // wears his own TD score, a rated player wears his board seat, and a scorer
  // the model never surfaced wears the play itself. Three states, same three
  // the post text already distinguishes — CALLED / ON THE BOARD / NOT ON THE
  // BOARD (project rule 14). The card must never blur them.
  const plate = ev.onBot
    ? { label: 'ON THE BOT', hero: String(ev.onBot.score), caption: `#${ev.onBot.rank} TD PICK · ${ev.onBot.grade}`, accent: JADE }
    : ev.tdBoard
      ? { label: 'TD BOARD', hero: `#${ev.tdBoard.rank}`, caption: `OF ${ev.tdBoard.of} RATED`, accent: INK }
      : distanceYd != null
        ? { label: 'THE PLAY', hero: String(distanceYd), caption: 'YARD TOUCHDOWN', accent: JADE }
        : null

  // THE DISTANCE IS PRINTED ONCE. When no board state exists the play itself
  // is the plate's hero, so repeating it as a tile — and again in the line
  // under the name — turned one fact into three. Same rule MOONSHOT's card
  // states about OPS: the hero does not appear twice.
  const tiles = [
    (distanceYd != null && plate?.label !== 'THE PLAY') ? { label: 'TD DISTANCE', value: distanceYd, unit: 'YD' } : null,
    scoreLine ? { label: 'SCORE NOW', value: scoreLine } : null,
    ev.quarter != null ? { label: 'QUARTER', value: `Q${ev.quarter}`, unit: ev.clock || '' } : null,
    ev.seasonToDate ? { label: 'TD THIS YEAR', value: ev.seasonToDate.td } : null,
    ev.seasonToDate?.last3Games ? { label: `LAST ${ev.seasonToDate.last3Games} G`, value: ev.seasonToDate.last3Td, unit: 'TD' } : null,
  ].filter(Boolean).slice(0, 4)

  // The closing line. Whichever of the three states this scorer is in, said
  // once, in the account's own voice — evidence, not a victory lap (rule 8).
  const statement = ev.onBot
    ? `#${ev.onBot.rank} ON THE BOT. IT LANDED.`
    : ev.tdBoard
      ? `#${ev.tdBoard.rank} OF ${ev.tdBoard.of} RATED.`
      : `${ev.team} FINDS THE END ZONE.`

  // The line under the statement carries what the tiles do NOT — his season
  // shape and, when the board plate took the hero slot, the play itself.
  const context = [
    plate?.label === 'THE PLAY' ? '' : subhead,
    ev.seasonToDate ? `${ev.seasonToDate.td} TD IN ${ev.seasonToDate.games} G THIS YEAR` : '',
    (ev.seasonToDate?.last3Games && !tiles.some((t) => t.label.startsWith('LAST ')))
      ? `${ev.seasonToDate.last3Td} IN THE LAST ${ev.seasonToDate.last3Games}` : '',
  ].filter(Boolean).join('  ·  ').toUpperCase()

  return frame(
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, position: 'relative' }}>
      {/* His club behind the plate — the wash is the only place the colour
          runs at full bleed, and it is HIS colour, not a fixed navy. */}
      <div style={{ position: 'absolute', right: 0, top: 0, width: 560, height: 460, display: 'flex',
        background: `radial-gradient(circle at 100% 0%, ${c1}4d 0%, ${c2}1f 44%, rgba(0,0,0,0) 72%)` }} />
      <Field tint={JADE} />

      <TopBand mark={mark} tag={ev.kindWord} />

      <div style={{ position: 'absolute', right: 40, top: 104, width: 288, height: 386, display: 'flex', flexDirection: 'column',
        alignItems: 'center', padding: '16px 16px 14px 16px', border: `1px solid ${RULE}`, background: 'rgba(7,9,10,0.82)' }}>
        {shot
          ? <img src={shot} width={176} height={176} style={{ border: `2px solid ${c1}`, background: `${c1}22` }} />
          : <img src={nflTeamLogo(ev?.team, 176, true)} width={176} height={176} />}
        {plate ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: 3, marginTop: 12, color: INK }}>{plate.label}</span>
            <div style={{ display: 'flex', width: 254, height: 1, background: `${c1}99`, marginTop: 12 }} />
            <span style={{ fontFamily: DISPLAY, fontSize: 86, fontWeight: 900, lineHeight: 1, color: plate.accent,
              transform: 'skewX(-8deg)', marginTop: 12 }}>{plate.hero}</span>
            <span style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: 2, color: '#b9b2a8', marginTop: 4 }}>{plate.caption}</span>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ display: 'flex', width: 254, height: 1, background: `${c1}99`, marginTop: 16 }} />
            <span style={{ fontFamily: DISPLAY, fontSize: 44, fontWeight: 900, lineHeight: 1, color: JADE,
              transform: 'skewX(-8deg)', marginTop: 16 }}>TOUCHDOWN</span>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', padding: '26px 356px 0 40px' }}>
        <span style={{ fontSize: 13.5, fontWeight: 800, letterSpacing: 6, color: JADE }}>{`${ev.team} TOUCHDOWN`}</span>
        <span style={{ fontFamily: DISPLAY, fontSize: 72, fontWeight: 900, lineHeight: 0.98, marginTop: 5,
          transform: 'skewX(-8deg)', letterSpacing: -1 }}>{String(headline || '')}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
          {ev.team
            ? <span style={{ background: c1, color: inkOn(c1), border: `1px solid ${c1}`, fontSize: 15, fontWeight: 800,
              letterSpacing: 1.4, borderRadius: 999, padding: '4px 14px', display: 'flex' }}>{ev.team}</span>
            : null}
          <span style={{ fontSize: 16, fontWeight: 800, color: INK }}>
            {[ev.position, ev.opponent ? `vs ${ev.opponent}` : '', subhead || ''].filter(Boolean).join(' · ')}
          </span>
        </div>
      </div>

      {tiles.length
        ? (
          <div style={{ display: 'flex', gap: 10, margin: '22px 356px 0 40px' }}>
            {tiles.map((t) => <Tile key={t.label} label={t.label} value={t.value} unit={t.unit} />)}
          </div>
        )
        : null}

      {/* THE DEFENSE — the same TARGET/AVOID/EVEN tag Games.js/Matchups.js
          render pregame (dvpSignal.js's matchupTag()), applied after the fact
          to the defense he just scored on. Omitted when the roster join or
          role lookup came up empty. */}
      {ev.defense ? (
        <div style={{ display: 'flex', alignItems: 'center', margin: '18px 356px 0 40px', border: `1px solid ${RULE}`, background: PANEL }}>
          <div style={{ flex: 1, padding: '12px 18px', display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 2, color: DIM }}>THE DEFENSE</span>
            <span style={{ fontSize: 17, fontWeight: 800, color: INK }}>{ev.defense.detail}</span>
          </div>
          <span style={{
            fontSize: 12, fontWeight: 900, letterSpacing: 1.6, marginRight: 18,
            color: ev.defense.tag === 'AVOID' ? '#f87171' : ev.defense.tag === 'TARGET' ? JADE : '#b9b2a8',
            border: `1px solid ${ev.defense.tag === 'AVOID' ? '#f87171' : ev.defense.tag === 'TARGET' ? JADE : '#b9b2a8'}88`,
            borderRadius: 999, padding: '5px 14px',
          }}>{ev.defense.tag}</span>
        </div>
      ) : null}

      {/* flex:1 + flex-end, NOT marginTop:'auto'. Two auto-margin siblings
          SPLIT the free space between them rather than pushing one down —
          which is what left a band of dead black above the footer. */}
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'flex-end', padding: '0 356px 18px 40px' }}>
        <div style={{ display: 'flex', height: 1, background: RULE, marginBottom: 14 }} />
        <span style={{ fontFamily: DISPLAY, fontSize: 44, fontWeight: 900, lineHeight: 1.02, letterSpacing: -0.4,
          transform: 'skewX(-8deg)', color: INK }}>{statement}</span>
        {context
          ? <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: 2.2, color: DIM, marginTop: 8 }}>{context}</span>
          : null}
      </div>

      <Footer site={site} />
    </div>,
    fonts,
  )
}
