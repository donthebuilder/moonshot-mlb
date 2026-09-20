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

/**
 * The touchdown alert card. `ev` is a lib/nfl/tdFeed.js buildTdEvent() result.
 * Every enrichment row is conditional on the field actually being present.
 *
 * LAYOUT (2026-09-13, "fill those cards up"): the on-the-bot emblem used to
 * be absolutely positioned at a fixed offset, which meant a card with fewer
 * real rows (no season log, no picks-ladder hit) just left a dead black gap
 * below wherever the last real row happened to fall. Every row -- headline,
 * stat chips, season, defense -- is now one flex column with
 * justifyContent: 'center', so whatever real content exists (2 rows or 4)
 * fills the space between the header and footer evenly instead of pinning
 * to the top. Nothing here is invented to fill space -- a card with only 2
 * real rows still shows only 2 rows, just centered rather than stranded.
 */
export async function tdCard(ev, { site = 'dashnetwork.vercel.app' } = {}) {
  const [base, display, mark] = await Promise.all([loadFonts(), loadDisplay(), loadMark()])
  const fonts = [...base, ...display]

  const headline = ev.scorerName || ev.text
  const scoreLine = (ev.awayScore != null && ev.homeScore != null) ? `${ev.awayScore}–${ev.homeScore}` : null
  const distanceYd = ev.parsed?.yards ?? null
  const subhead = ev.parsed
    ? (ev.parsed.passer ? `${distanceYd} yd from ${ev.parsed.passer}` : `${distanceYd} yd ${ev.parsed.kind}`)
    : null

  return frame([
    <TopBand mark={mark} tag={ev.kindWord} key="h" />,
    <div key="wash" style={{ display: 'flex', position: 'absolute', right: -60, top: 40, width: 520, height: 520, background: `radial-gradient(circle, ${CYAN}22 0%, ${CYAN}00 70%)` }} />,

    <div key="content" style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center', gap: 20, padding: '0 40px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 18 }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: 5, color: JADE }}>{ev.team} TOUCHDOWN</span>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 18, marginTop: 6 }}>
            <span style={{ fontFamily: DISPLAY, fontSize: 76, fontWeight: 900, lineHeight: 0.95, transform: 'skewX(-8deg)', letterSpacing: -1 }}>{headline}</span>
            {ev.opponent ? <span style={{ background: '#1c2841', color: '#fff', fontSize: 15, fontWeight: 800, letterSpacing: 1.4, borderRadius: 999, padding: '5px 15px', marginBottom: 10 }}>vs {ev.opponent}</span> : null}
          </div>
          {subhead ? <span style={{ fontSize: 20, fontWeight: 800, color: '#b9b2a8', marginTop: 2 }}>{subhead}</span> : null}
        </div>
        {ev.onBot ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, width: 190, padding: '14px 12px', borderRadius: 4, border: `2px solid ${JADE}`, background: 'rgba(0,245,173,0.10)' }}>
            <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 3, color: INK }}>ON THE BOT</span>
            <span style={{ fontFamily: DISPLAY, fontSize: 44, fontWeight: 900, lineHeight: 1, color: JADE, transform: 'skewX(-8deg)' }}>{ev.onBot.score}</span>
            <span style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: 1.4, color: '#b9b2a8', marginTop: 4 }}>#{ev.onBot.rank} TD PICK · {ev.onBot.grade}</span>
          </div>
        ) : ev.tdBoard ? (
          // 2026-09-14: a scorer who isn't a designated pick still shows where
          // he sat on the full TD board pregame -- the same "#N of M" rank
          // MLB puts on every homer card. Dimmer than the ON THE BOT box (a
          // ranking, not a call): a rule box, not the filled jade emblem.
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, width: 190, padding: '14px 12px', borderRadius: 4, border: `1px solid ${RULE}`, background: PANEL }}>
            <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 3, color: '#b9b2a8' }}>TD BOARD</span>
            <span style={{ fontFamily: DISPLAY, fontSize: 44, fontWeight: 900, lineHeight: 1, color: INK, transform: 'skewX(-8deg)' }}>#{ev.tdBoard.rank}</span>
            <span style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: 1.4, color: '#8f8a83', marginTop: 4 }}>OF {ev.tdBoard.of} RATED</span>
          </div>
        ) : null}
      </div>

      <div style={{ display: 'flex', gap: 14 }}>
        {distanceYd != null ? <StatChip label="TD DISTANCE" value={distanceYd} unit="YDS" /> : null}
        <StatChip label="SCORE NOW" value={scoreLine || '—'} unit="" />
        <StatChip label="QUARTER" value={`Q${ev.quarter ?? '?'}`} unit={ev.clock || ''} />
      </div>

      {ev.seasonToDate ? (
        <div style={{ display: 'flex', border: `1px solid ${RULE}`, background: PANEL }}>
          <div style={{ flex: 1, padding: '14px 22px', borderRight: `1px solid ${RULE}`, display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 2, color: DIM }}>SEASON ENTERING TONIGHT</span>
            <span style={{ fontSize: 20, fontWeight: 800, color: INK }}>{ev.seasonToDate.td} TD · {ev.seasonToDate.games} G</span>
          </div>
          <div style={{ flex: 1, padding: '14px 22px', display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 2, color: DIM }}>LAST {ev.seasonToDate.last3Games}</span>
            <span style={{ fontSize: 20, fontWeight: 800, color: INK }}>{ev.seasonToDate.last3Td} TD</span>
          </div>
        </div>
      ) : null}

      {/* THE DEFENSE -- same TARGET/AVOID/EVEN tag Games.js/Matchups.js
          already render pregame (dvpSignal.js's matchupTag()), just applied
          after the fact to the defense he actually just scored on. null
          (row simply omitted) when the roster join or role lookup came up
          empty -- see lib/nfl/tdFeed.js's buildTdEvent() header note. */}
      {ev.defense ? (
        <div style={{ display: 'flex', alignItems: 'center', border: `1px solid ${RULE}`, background: PANEL }}>
          <div style={{ flex: 1, padding: '14px 22px', display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 2, color: DIM }}>THE DEFENSE</span>
            <span style={{ fontSize: 18, fontWeight: 800, color: INK }}>{ev.defense.detail}</span>
          </div>
          <span style={{
            fontSize: 12, fontWeight: 900, letterSpacing: 1.6, marginRight: 22,
            color: ev.defense.tag === 'AVOID' ? '#f87171' : ev.defense.tag === 'TARGET' ? JADE : '#b9b2a8',
            border: `1px solid ${ev.defense.tag === 'AVOID' ? '#f87171' : ev.defense.tag === 'TARGET' ? JADE : '#b9b2a8'}88`,
            borderRadius: 999, padding: '5px 14px',
          }}>{ev.defense.tag}</span>
        </div>
      ) : null}
    </div>,

    <Footer key="f" site={site} />,
  ], fonts)
}
