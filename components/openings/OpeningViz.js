'use client'
import { useState } from 'react'
import { flatChip, FLAT_CHIP_CLASS } from '../../lib/chips'
import TeamMark from '../TeamMark'
import { faceUrl, faceCropBackground } from '../PlayerFace'
import { surname } from '../../lib/player'

// 🏀 THE FACE WALL (10-25, Donovan: "the faces one is cool ... faces and table", then "do something with the background of the
// player pictures ... the rings, I gotta understand what all that means ... this is very new, I like this"). One game's two
// clubs, face to face across a half-court line, every mark one game on file (newest first):
//   face on a disc          his club scored the first basket -- and this is the man who did it
//   face + accent ring      ... and his club won the tip too
//   empty accent ring       won the tip, lost the first basket
//   faint dot               lost both
// The legend draws those four marks, not a sentence. Under each wall: the three faces that turn up most, with counts.
// Shared (10-26, Donovan: "the same face wall" for MOONSHOT's first run, LAMP's first goal, TUDDY's first TD): a product hands
// the two clubs' logs ([first 1|0, ring 1|0|null, scorer id] newest first), a name lookup, its theme and accent, its `words`
// (what the ring means -- BUCKETS' tip, MOONSHOT's first hit -- or no ring at all), `urlOf(id, size)` (the scorer's photo when
// the product's ids aren't faceUrl's: LAMP's mug and TUDDY's ESPN id come back from /api/ledger/first), and optionally its `floor` (Surface below: the home club's court / rink / field / park, its own paint) and the matchup `rows`.
// FaceWallByGame adds the game chips for a page that has no matchup of its own. The counts are records, never a chance.

// 4 x 33px + gaps fits half of a 360 phone (Donovan 10-25: "the image needs to be bigger ... so you can really see them");
// the wall previews each club's last 20 games, "All games" opens the rest
const D = 33, GAP = 3, COLS = 4, PREVIEW = 20

// THE FACE, CROPPED TO FIT (Donovan 10-25: "the backdrop sucks ... make the picture fit well in the spaces"): ESPN's headshot is
// a wide cut-out (600 x 436), so a round frame showed a small head in a dark disc. Drawn as a background with the shared crop
// (components/PlayerFace.js CROP_OF: 150%, pinned 18% down), the whole head sits centred over a light studio grey; his
// initials sit under it for a man with no picture.
const initials = (name) => String(name || '').split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase()
function Face({ id, name, sport, C, size, ring = null, glow = null, urlOf = null }) {
  const url = !id ? null : urlOf ? urlOf(id, size) : faceUrl({ sport, id, size })
  return (
    <span title={name || undefined} style={{ width: size, height: size, borderRadius: '50%', display: 'grid', placeItems: 'center', boxSizing: 'border-box', flex: '0 0 auto',
      background: `${url ? `url(${url}) ${faceCropBackground(sport)} no-repeat, ` : ''}radial-gradient(circle at 50% 30%, ${C.text3}, ${C.bg3})`,
      border: ring ? `1.5px solid ${ring}` : `1px solid ${C.border}`, boxShadow: glow ? `0 0 8px ${glow}77` : 'none',
      color: C.text2, font: `900 ${Math.max(8, Math.round(size * 0.32))}px/1 monospace` }}>
      {url ? null : initials(name)}
    </span>
  )
}

function Mark({ kind, id, name, sport, C, accent, D = 33, urlOf }) {
  const box = { width: D, height: D, borderRadius: '50%', display: 'grid', placeItems: 'center', boxSizing: 'border-box', flex: '0 0 auto' }
  if (kind === 'none') return <span style={box}><span style={{ width: 5, height: 5, borderRadius: 3, background: C.text3, opacity: 0.45 }} /></span>
  if (kind === 'wasted') return <span style={{ ...box, border: `1.5px solid ${accent}`, opacity: 0.85 }} />
  return <Face id={id} name={name} sport={sport} C={C} size={D} urlOf={urlOf} ring={kind === 'both' ? accent : null} glow={kind === 'both' ? accent : null} />
}
const kindOf = (x) => (x[0] === 1 ? (x[1] === 1 ? 'both' : 'first') : (x[1] === 1 ? 'wasted' : 'none'))

// BUCKETS' words; a product with no ring passes `ring: null` and the wall draws two marks, not four
const TIP_WORDS = { ring: 'tip', first: 'Scored first', both: 'Scored first + won tip', wasted: 'Won tip, lost it', none: 'Lost both', other: 'They scored first' }

export function FaceWall({ game, logs, rows = [], sport, C, NUM_FONT, accent, nameOf, floor = null, words = TIP_WORDS, urlOf = null }) {
  const W = { ...TIP_WORDS, ...words }
  const hasRing = W.ring != null && [...(logs.away || []), ...(logs.home || [])].some((x) => x[1] != null)
  const rate = (log) => { const g = (log || []).filter((x) => x[0] != null); return g.length ? g.filter((x) => x[0] === 1).length / g.length : null }
  // the lit side: the matchup row when the product has one, else the better of the two walls -- by the percent as shown
  // (10-26: 55% against 55% lit one side over a fraction)
  const ra = rate(logs.away), rh = rate(logs.home)
  const pa = ra == null ? null : Math.round(100 * ra), ph = rh == null ? null : Math.round(100 * rh)
  const first = rows.find((r) => r._id === 'firstPct') || { better: pa == null || ph == null || pa === ph ? null : pa > ph ? 'away' : 'home' }
  const [all, setAll] = useState(false)
  let most = 0
  const shade = { textShadow: '0 1px 3px rgba(0,0,0,.8)' }
  const tops = {}
  const wall = (log, s) => {
    const g = (log || []).filter((x) => x[0] != null)
    const n = g.length, k = g.filter((x) => x[0] === 1).length
    const tips = g.filter((x) => x[1] === 1).length
    const wasted = g.filter((x) => x[1] === 1 && x[0] === 0).length
    const by = new Map(); for (const x of g) if (x[2]) by.set(x[2], (by.get(x[2]) || 0) + 1)
    const top = [...by.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
    tops[s] = top
    const away = s === 'away'
    const lit = first?.better === s
    most = Math.max(most, n)
    const shown = all ? g : g.slice(0, PREVIEW)
    return (
      <div style={{ display: 'grid', gap: 8, justifyItems: away ? 'start' : 'end', alignContent: 'start', minWidth: 0 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexDirection: away ? 'row' : 'row-reverse', font: `900 12px/1 ${NUM_FONT}`, letterSpacing: '.06em', color: C.text, ...shade }}>
          <TeamMark sport={sport} abbr={away ? game.away : game.home} variant="logo" px={22} eager />{away ? game.away : `@ ${game.home}`}
        </span>
        <div style={{ font: `900 32px/1 ${NUM_FONT}`, color: lit ? accent : C.text, ...shade }}>{n ? `${Math.round((100 * k) / n)}%` : '—'}</div>
        <div style={{ font: `600 10px/1.45 ${NUM_FONT}`, color: C.text2, textAlign: away ? 'left' : 'right', ...shade }}>
          {`${k}/${n} scored first`}{hasRing ? <><br />{`${W.ring} ${n ? Math.round((100 * tips) / n) : 0}% · ${wasted} wasted`}</> : null}
        </div>
        <div style={{ font: `900 10px/1 ${NUM_FONT}`, letterSpacing: '.08em', color: C.text2, ...shade }}>{all ? `ALL ${n} GAMES` : `LAST ${shown.length} GAMES`}</div>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${COLS}, ${D}px)`, gap: GAP, direction: away ? 'ltr' : 'rtl' }}>
          {shown.map((x, i) => <Mark key={i} D={D} urlOf={urlOf} kind={kindOf(x)} id={x[2]} name={x[2] ? nameOf?.get(x[2]) : ''} sport={sport} C={C} accent={accent} />)}
        </div>
        <div style={{ display: 'grid', gap: 5, justifyItems: away ? 'start' : 'end', marginTop: 2 }}>
          {top.map(([id, c]) => (
            <span key={id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexDirection: away ? 'row' : 'row-reverse', font: `600 12px/1 ${NUM_FONT}`, color: C.text2, ...shade }}>
              <Face id={id} name={nameOf?.get(id) || ''} sport={sport} C={C} size={28} urlOf={urlOf} />
              {surname(nameOf?.get(id) || '')}<b style={{ color: C.text }}>{c}</b>
            </span>
          ))}
        </div>
      </div>
    )
  }
  const walls = [wall(logs.away, 'away'), wall(logs.home, 'home')]
  const sample = tops.home?.[0]?.[0] || tops.away?.[0]?.[0] || null
  const legend = hasRing ? [['first', W.first], ['both', W.both], ['wasted', W.wasted], ['none', W.none]] : [['first', W.first], ['none', W.other]]
  return (
    <div style={{ position: 'relative', borderRadius: floor?.kind === 'rink' ? 22 : 14, overflow: 'hidden', border: `1px solid ${C.border}`, background: C.bg2 }}>
      {floor ? <Surface floor={floor} home={game.home} sport={sport} /> : null}
      <div style={{ position: 'relative', padding: '12px 12px 12px', display: 'grid', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>{walls}</div>
        {most > PREVIEW ? (
          <button type="button" className={FLAT_CHIP_CLASS} aria-pressed={all} onClick={() => setAll(!all)} style={{ ...flatChip(all, accent, C, NUM_FONT), justifySelf: 'center' }}>{all ? `Last ${PREVIEW}` : 'All games'}</button>
        ) : null}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 12px', paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
          {legend.map(([k, l]) => (
            <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, color: C.text2, ...shade }}>
              <Mark D={26} urlOf={urlOf} kind={k} id={sample} name={sample ? nameOf?.get(sample) : ''} sport={sport} C={C} accent={accent} />{l}
            </span>
          ))}
        </div>
        <div style={{ fontSize: 11, color: C.text2, ...shade }}>Each mark is one game, newest first. The % counts every game on file. A record, not a chance.</div>
      </div>
    </div>
  )
}

/** The wall with its own game chips: for a page without a matchup (LAMP's and TUDDY's Ledger, MOONSHOT's Openings).
 *  games: [{ key, away, home, label }]; logOf(team) -> that club's log. Draws nothing until a game has a club with games on file. */
export function FaceWallByGame({ games = [], logOf, title, ...wall }) {
  const shown = games.filter((g) => (logOf(g.away)?.length || 0) + (logOf(g.home)?.length || 0) > 0)
  const [pick, setPick] = useState(null)
  const game = shown.find((g) => g.key === pick) || shown[0] || null
  if (!game) return null
  const { C, NUM_FONT, accent } = wall
  return (
    <section aria-label={title} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8 }}>
      <div style={{ color: C.text2, font: `900 12px/1.2 ${NUM_FONT}`, letterSpacing: '.08em' }}>{title.toUpperCase()}</div>
      <div role="group" aria-label="Game" className="chip-row" style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: 2, margin: '0 -2px', WebkitOverflowScrolling: 'touch' }}>
        {shown.map((g) => (
          <button key={g.key} type="button" className={FLAT_CHIP_CLASS} aria-pressed={game.key === g.key} onClick={() => setPick(g.key)} style={{ ...flatChip(game.key === g.key, accent, C, NUM_FONT), flexShrink: 0 }}>{g.label}</button>
        ))}
      </div>
      <FaceWall key={game.key} game={game} logs={{ away: logOf(game.away) || [], home: logOf(game.home) || [] }} {...wall} />
    </section>
  )
}

// THE HOME CLUB'S FLOOR (2026-10-26, Donovan: "the background doesn't feel legit like the rink or courts ... each team has their
// logo in the middle ... make it whatever home court that is"). Drawn under the wall, the walls' clubs on either side of the
// halfway line and tonight's home club's logo where a real one sits: centre court, centre ice, the 50, the mound. The paint is
// the product's own (BUCKETS' hardwood, LAMP's RINK, TUDDY's turf, MOONSHOT's DIAMOND); a dark wash keeps the faces and the
// numbers readable on it. `floor.kind`: court | rink | field | diamond.
const CY = 64          // the centre mark sits in the gap between the two clubs' big numbers
const LOGO = 58
const BASE = {
  court: (f) => `repeating-linear-gradient(0deg, rgba(255,255,255,.03) 0 1px, transparent 1px 9px), repeating-linear-gradient(90deg, ${f.a} 0 9px, ${f.b} 9px 21px, ${f.a} 21px 29px, ${f.b} 29px 44px)`,
  rink: (f) => `radial-gradient(ellipse at 50% 20%, ${f.ice}, ${f.iceShade} 70%)`,
  field: (f) => `linear-gradient(90deg, ${f.endzone} 0 8.33%, transparent 8.33% 91.67%, ${f.endzone} 91.67%), repeating-linear-gradient(90deg, ${f.turf1} 0 4.1667%, ${f.turf2} 4.1667% 8.333%)`,
  diamond: (f) => `repeating-linear-gradient(45deg, rgba(255,255,255,.035) 0 20px, transparent 20px 40px), repeating-linear-gradient(-45deg, ${f.grass} 0 20px, ${f.grass2} 20px 40px)`,
}
// the wash over the paint: lighter on the dark turf and grass, heavier on the bright ice
const WASH = {
  court: 'linear-gradient(180deg, rgba(0,0,0,.32), rgba(0,0,0,.55))',
  rink: 'linear-gradient(180deg, rgba(6,14,26,.52), rgba(6,14,26,.7))',
  field: 'linear-gradient(180deg, rgba(0,0,0,.12), rgba(0,0,0,.4))',
  diamond: 'linear-gradient(180deg, rgba(0,0,0,.18), rgba(0,0,0,.45))',
}
function Lines({ floor: f }) {
  const k = f.kind
  if (k === 'court') return (
    <g stroke={f.line} strokeOpacity={0.55} strokeWidth={2} fill="none">
      <rect x="6" y="6" style={{ width: 'calc(100% - 12px)', height: 'calc(100% - 12px)' }} rx="3" />
      <line x1="50%" y1="6" x2="50%" y2="100%" />
      <circle cx="50%" cy={CY} r={46} />
    </g>
  )
  if (k === 'rink') return (
    <g fill="none">
      <rect x="3" y="3" style={{ width: 'calc(100% - 6px)', height: 'calc(100% - 6px)' }} rx="19" stroke={f.kick} strokeOpacity={0.7} strokeWidth={2} />
      <line x1="7%" y1="0" x2="7%" y2="100%" stroke={f.red} strokeOpacity={0.7} strokeWidth={2} />
      <line x1="93%" y1="0" x2="93%" y2="100%" stroke={f.red} strokeOpacity={0.7} strokeWidth={2} />
      <line x1="36%" y1="0" x2="36%" y2="100%" stroke={f.blue} strokeOpacity={0.6} strokeWidth={5} />
      <line x1="64%" y1="0" x2="64%" y2="100%" stroke={f.blue} strokeOpacity={0.6} strokeWidth={5} />
      <line x1="50%" y1="0" x2="50%" y2="100%" stroke={f.red} strokeOpacity={0.9} strokeWidth={5} />
      <circle cx="50%" cy={CY} r={44} stroke={f.blue} strokeOpacity={0.9} strokeWidth={2.5} />
    </g>
  )
  if (k === 'field') {
    const x = (yd) => `${(100 * (10 + yd)) / 120}%`
    return (
      <g stroke={f.chalk} fill="none">
        {[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((yd) => <line key={yd} x1={x(yd)} y1="0" x2={x(yd)} y2="100%" strokeOpacity={yd % 100 === 0 ? 0.75 : 0.4} strokeWidth={yd % 100 === 0 ? 3 : 1.5} />)}
        {Array.from({ length: 19 }, (_, i) => 5 + i * 5).filter((yd) => yd % 10).map((yd) => <line key={`h${yd}`} x1={x(yd)} y1="12" x2={x(yd)} y2="20" strokeOpacity={0.4} strokeWidth={1.5} />)}
      </g>
    )
  }
  if (k === 'diamond') return (
    // home plate under the clubs' numbers, second base up top, the mound (the logo) between -- seen from behind home
    <svg x="50%" y="0" overflow="visible">
      <polygon points={`0,${CY - 44} 54,${CY + 10} 0,${CY + 64} -54,${CY + 10}`} fill={f.dirt} fillOpacity={0.75} />
      <polygon points={`0,${CY - 22} 32,${CY + 10} 0,${CY + 42} -32,${CY + 10}`} fill={f.grass} fillOpacity={0.9} />
      <g stroke={f.chalk} strokeOpacity={0.5} strokeWidth={1.5}><line x1="0" y1={CY + 64} x2="-400" y2={CY - 336} /><line x1="0" y1={CY + 64} x2="400" y2={CY - 336} /></g>
      {[[0, CY - 40], [50, CY + 10], [-50, CY + 10]].map(([bx, by]) => <rect key={bx} x={bx - 4} y={by - 4} width="8" height="8" fill={f.chalk} transform={`rotate(45 ${bx} ${by})`} />)}
      <circle cx="0" cy={CY + 10} r="19" fill={f.dirt} stroke={f.chalk} strokeOpacity={0.8} strokeWidth={1.5} />
    </svg>
  )
  return null
}
// where the logo sits: centre court / centre ice / the 50 at the clubs' numbers; the park's on the mound
const LOGO_Y = { court: CY, rink: CY, field: CY, diamond: CY + 10 }
export function Surface({ floor, home, sport }) {
  const k = floor.kind || 'court'
  return (
    <>
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: BASE[k]?.(floor) }} />
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: WASH[k] }} />
      <svg aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}><Lines floor={{ ...floor, kind: k }} /></svg>
      {home ? (
        <span aria-hidden="true" style={{ position: 'absolute', left: '50%', top: (LOGO_Y[k] ?? CY) - (k === 'diamond' ? 13 : LOGO / 2), transform: 'translateX(-50%)', opacity: 0.92, lineHeight: 0 }}>
          <TeamMark sport={sport} abbr={home} variant="logo" px={k === 'diamond' ? 26 : LOGO} eager />
        </span>
      ) : null}
    </>
  )
}
