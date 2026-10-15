// THE COLLECTIBLE FRAME (server only, JSX): the 2.5 : 3.5 trading-card frame of Donovan's 2026-10-14 brief, drawn entirely in code by satori. PREVIEW ONLY: nothing links
// to it, nothing posts it, and the special cards (lib/cards/specialCard.js, 1080 x 1350, 4:5) are untouched beside it.
//
// SIZE. 1000 x 1400 is exactly 5:7 (2.5 x 3.5 in at 400 px/in). The special card is 1080 x 1350 (4:5 = 0.800); this is 0.714: 7.4% narrower and 3.7% taller. That is
// why this file has its own render (renderCollect) instead of cardKit's renderPng, which draws a fixed 1080 x 1350. The type floor is the same 22 px AT 1000 wide.
//
// THE FIVE LAYERS (brief section 5): (1) the stock and the sport environment (ice, drawn in code, seeded by the card id so no two cards share a background);
// (2) the verified portrait; (3) sport decoration (faceoff circle, puck); (4) REAL text (name, stats, rarity word, ids); (5) the rarity finish (foil, sheen, glints,
// ornaments). Layer 5 is a list of NAMED layers per tier (collectLayers); its length is the tier's decoration density and check-collect-card.mjs caps it.
//
// RARITY IS THE EVENT'S, NEVER A GRADE. No "GEM MT 10", no population, no "1/250": the only number about the card itself is its real id, and its issue number reads
// PREVIEW until supabase/migrations/202610141500_card_issues.sql has run and a row exists.
import { ImageResponse } from 'next/og'
import { assets, fs, fitName, field, alpha, Logo, DISPLAY, INK, INK2, DIM, CHASSIS, lintType, LINT } from '../cardKit'
import { HOLO, FOIL, PRISM } from '../assets'
import { SPORT_ACCENT } from '../../sportAccent'
import { STATUS_WORD } from '../../callStatus'
import { TIER_WORD, TIERS } from '../moments'
import { initMetrics } from '../fit'
import { ringOf, washOf, bandOf, Glint } from '../specialCard'

export const W = 1000
export const H = 1400
export const RATIO = W / H   // 0.7143 = 2.5 / 3.5

// ── the look of each tier: geometry and density in one table (DESIGN-SPEC.md quotes it) ─────────────────────────────────────────
export const LOOK = {
  base:   { inset: 30, radius: 36, grain: 0.45 },
  star:   { inset: 34, radius: 36, grain: 0.12 },
  elite:  { inset: 34, radius: 36, grain: 0.18 },
  legend: { inset: 40, radius: 40, grain: 0.18 },
}
/** The NAMED finish layers drawn for a tier (layer 5). Its length is the tier's decoration density: BASE 0, STAR 3, ELITE <= 12, LEGEND <= 12. */
export const collectLayers = (tier) => ({
  base: [],
  star: ['silver-frame', 'sheen-portrait', 'badge'],
  elite: ['holo-ring', 'holo-bevel', 'edge-wash', 'prism-streaks', 'sheen-1', 'sheen-2', 'glint-frame', 'glint-emblem', 'glint-name', 'glint-badge', 'badge'],
  legend: ['gold-ring', 'gold-bevel', 'gold-wash', 'streak-1', 'streak-2', 'streak-3', 'gold-dust', 'glint-frame', 'glint-emblem', 'glint-name', 'corner-ornaments', 'badge'],
}[tier] || [])
export const MAX_DENSITY = { base: 0, star: 3, elite: 11, legend: 12 }

export const goldRamp = (deg = 135) => `linear-gradient(${deg}deg, ${FOIL.goldHi} 0%, ${FOIL.gold} 18%, ${FOIL.goldMid} 38%, ${FOIL.goldHi} 52%, ${FOIL.gold} 68%, ${FOIL.goldDeep} 100%)`
const silverRamp = `linear-gradient(90deg, ${FOIL.silverEdge} 0%, ${FOIL.silver} 30%, ${HOLO.white} 50%, ${FOIL.silver} 70%, ${FOIL.silverEdge} 100%)`
export const goldWash = (k = 1) => `linear-gradient(115deg, ${alpha(FOIL.gold, 0)} 0%, ${alpha(FOIL.gold, 0.12 * k)} 22%, ${alpha(FOIL.goldHi, 0.14 * k)} 46%, ${alpha(FOIL.gold, 0.1 * k)} 70%, ${alpha(FOIL.gold, 0)} 100%)`
const prismStops = [PRISM.magenta, PRISM.orange, PRISM.yellow, PRISM.green, PRISM.cyan, PRISM.blue, PRISM.violet, PRISM.magenta]
/** The saturated spectrum as one gradient (alpha < 1 for streaks over art). */
export const prismRamp = (deg = 135, a = 1) => `linear-gradient(${deg}deg, ${prismStops.map((c, i) => `${a < 1 ? alpha(c, a) : c} ${Math.round((i / (prismStops.length - 1)) * 100)}%`).join(', ')})`
/** A diagonal prismatic wash for the art: the spectrum in broad bands, transparent between. */
export const prismWash = (k) => `linear-gradient(115deg, ${alpha(PRISM.cyan, 0)} 0%, ${alpha(PRISM.cyan, k)} 14%, ${alpha(PRISM.violet, k)} 28%, ${alpha(PRISM.magenta, k)} 42%, ${alpha(PRISM.orange, k)} 56%, ${alpha(PRISM.yellow, k * 0.9)} 66%, ${alpha(PRISM.green, k)} 78%, ${alpha(PRISM.blue, k)} 90%, ${alpha(PRISM.blue, 0)} 100%)`
/** STAR's blue-silver foil: a brushed ramp with cool blue in the shadows, so the whole frame edge reads as foil rather than as a grey line. */
const starFoil = `linear-gradient(135deg, ${FOIL.silverEdge} 0%, ${FOIL.silver} 14%, ${HOLO.blue} 26%, ${FOIL.silver} 40%, ${HOLO.white} 50%, ${HOLO.cyan} 60%, ${FOIL.silverEdge} 74%, ${FOIL.silver} 88%, ${HOLO.blue} 100%)`
export const MARK_COLOR = { base: INK2, star: FOIL.silver, elite: HOLO.cyan, legend: FOIL.gold }

/** A tiny seeded generator (mulberry32) so a card's ice scratches and glow land in the same place every render, and differ from card to card. */
export function seeded(hex) {
  let a = parseInt(String(hex || '1').replace(/[^0-9a-f]/gi, '').slice(0, 8) || '1', 16) >>> 0 || 1
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}

// ── layer 1 / 3: the sport environment and decoration. One entry per sport that has a treatment (a table, not a branch) ─────────────
/** NHL / LAMP: ice (skate scratches, a cold glow, a faceoff circle, halftone dots in one corner) and a puck. Restrained: ice-blue at low alpha. */
function IceEnvironment({ w, h, accent, rnd }) {
  const scratches = Array.from({ length: 16 }, (_, i) => {
    const len = 260 + Math.round(rnd() * 520)
    return { i, len, x: Math.round(rnd() * (w - 120)) - 120, y: Math.round(rnd() * h), rot: -38 + Math.round(rnd() * 76), a: 0.05 + rnd() * 0.07 }
  })
  const glow = { x: 20 + Math.round(rnd() * 60), y: 18 + Math.round(rnd() * 30) }
  return (
    <div style={{ display: 'flex', position: 'absolute', left: 0, top: 0, width: w, height: h, overflow: 'hidden' }}>
      <div style={{ display: 'flex', position: 'absolute', left: 0, top: 0, width: w, height: h, background: `radial-gradient(circle at ${glow.x}% ${glow.y}%, ${alpha(accent, 0.34)} 0%, ${alpha(accent, 0.06)} 52%, ${alpha(CHASSIS.bg, 0)} 78%)` }} />
      {scratches.map((s) => (
        <div key={s.i} style={{ display: 'flex', position: 'absolute', left: s.x, top: s.y, width: s.len, height: 2, transform: `rotate(${s.rot}deg)`, background: `linear-gradient(90deg, ${alpha(INK, 0)}, ${alpha(INK, s.a)}, ${alpha(INK, 0)})` }} />
      ))}
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ position: 'absolute', left: 0, top: 0 }}>
        <circle cx={w / 2} cy={h * 0.52} r={Math.round(w * 0.3)} fill="none" stroke={alpha(accent, 0.22)} strokeWidth="5" />
        <circle cx={w / 2} cy={h * 0.52} r="10" fill={alpha(accent, 0.3)} />
        <path d={`M${w / 2 - 36} ${h * 0.52 - Math.round(w * 0.3)} h72 M${w / 2 - 36} ${h * 0.52 + Math.round(w * 0.3)} h72`} stroke={alpha(accent, 0.3)} strokeWidth="6" />
      </svg>
      <div style={{ display: 'flex', position: 'absolute', left: 0, bottom: 0, width: 260, height: 190, backgroundImage: `radial-gradient(circle, ${alpha(INK, 0.16)} 1.6px, ${alpha(INK, 0)} 2.4px)`, backgroundSize: '15px 15px' }} />
    </div>
  )
}
/** MLB / MOONSHOT: warm glow, an infield arc with base-path chalk, a few stitch arcs. Used behind a silo headshot (the action photograph is its own background). */
function DiamondEnvironment({ w, h, accent, rnd }) {
  const glow = { x: 25 + Math.round(rnd() * 50), y: 20 + Math.round(rnd() * 25) }
  return (
    <div style={{ display: 'flex', position: 'absolute', left: 0, top: 0, width: w, height: h, overflow: 'hidden' }}>
      <div style={{ display: 'flex', position: 'absolute', left: 0, top: 0, width: w, height: h, background: `radial-gradient(circle at ${glow.x}% ${glow.y}%, ${alpha(accent, 0.32)} 0%, ${alpha(accent, 0.06)} 55%, ${alpha(CHASSIS.bg, 0)} 80%)` }} />
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ position: 'absolute', left: 0, top: 0 }}>
        <path d={`M${w / 2} ${h * 0.95} L${w * 0.08} ${h * 0.45} L${w / 2} ${h * -0.05} L${w * 0.92} ${h * 0.45} Z`} fill="none" stroke={alpha(INK, 0.14)} strokeWidth="5" />
        <circle cx={w / 2} cy={h * 0.45} r={Math.round(w * 0.3)} fill="none" stroke={alpha(accent, 0.22)} strokeWidth="5" strokeDasharray="14 12" />
        <path d={`M${w * 0.06} ${h * 0.2} Q${w * 0.2} ${h * 0.34} ${w * 0.06} ${h * 0.48} M${w * 0.94} ${h * 0.2} Q${w * 0.8} ${h * 0.34} ${w * 0.94} ${h * 0.48}`} fill="none" stroke={alpha(accent, 0.3)} strokeWidth="4" strokeDasharray="9 9" />
      </svg>
    </div>
  )
}
/** NFL / TUDDY: turf (alternating mown stripes), yard lines with hash ticks, a faint end-zone arc; the club mark rides over it. Behind a cut-out headshot only. */
function FieldEnvironment({ w, h, accent, rnd }) {
  const glow = { x: 20 + Math.round(rnd() * 60), y: 15 + Math.round(rnd() * 25) }
  const stripe = Math.round(h / 7)
  return (
    <div style={{ display: 'flex', position: 'absolute', left: 0, top: 0, width: w, height: h, overflow: 'hidden' }}>
      <div style={{ display: 'flex', position: 'absolute', left: 0, top: 0, width: w, height: h, background: `radial-gradient(circle at ${glow.x}% ${glow.y}%, ${alpha(accent, 0.34)} 0%, ${alpha(accent, 0.08)} 56%, ${alpha(CHASSIS.bg, 0)} 82%)` }} />
      {Array.from({ length: 7 }, (_, i) => (i % 2 ? <div key={i} style={{ display: 'flex', position: 'absolute', left: 0, top: i * stripe, width: w, height: stripe, background: alpha(accent, 0.07) }} /> : null))}
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ position: 'absolute', left: 0, top: 0 }}>
        {[0.18, 0.5, 0.82].map((x, i) => <path key={i} d={`M${w * x} 0 V${h}`} stroke={alpha(INK, 0.16)} strokeWidth="5" />)}
        {[0.1, 0.34, 0.66, 0.9].map((x, i) => <path key={`h${i}`} d={`M${w * x} 0 V${h}`} stroke={alpha(INK, 0.08)} strokeWidth="3" strokeDasharray="10 34" />)}
        <circle cx={w / 2} cy={h * 1.04} r={Math.round(w * 0.42)} fill="none" stroke={alpha(accent, 0.22)} strokeWidth="5" />
      </svg>
    </div>
  )
}
const ENVIRONMENT = { nhl: IceEnvironment, mlb: DiamondEnvironment, nfl: FieldEnvironment }
const Puck = ({ size = 56, color = INK }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="32" cy="38" rx="26" ry="11" fill="none" stroke={color} strokeWidth="3" />
    <path d="M6 38 V28 a26 11 0 0 1 52 0 V38" fill="none" stroke={color} strokeWidth="3" />
    <ellipse cx="32" cy="28" rx="26" ry="11" fill={alpha(color, 0.25)} stroke={color} strokeWidth="3" />
  </svg>
)
const Ball = ({ size = 56, color = INK }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
    <circle cx="32" cy="32" r="26" fill={alpha(color, 0.18)} stroke={color} strokeWidth="3" />
    <path d="M14 14 Q26 32 14 50 M50 14 Q38 32 50 50" fill="none" stroke={color} strokeWidth="3" />
  </svg>
)
const Football = ({ size = 56, color = INK }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="32" cy="32" rx="28" ry="17" transform="rotate(-30 32 32)" fill={alpha(color, 0.18)} stroke={color} strokeWidth="3" />
    <path d="M22 38 L42 26 M26 30 l4 5 M31 27 l4 5 M36 24 l4 5" stroke={color} strokeWidth="3" fill="none" />
  </svg>
)
export const BANNER_ICON = { nhl: Puck, mlb: Ball, nfl: Football }

// ── the rarity mark ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
function TierIcon({ tier, size = 34 }) {
  const c = MARK_COLOR[tier]
  if (tier === 'star') return <svg width={size} height={size} viewBox="0 0 40 40"><path d="M20 2 L24 16 L38 20 L24 24 L20 38 L16 24 L2 20 L16 16 Z" fill={c} /></svg>
  if (tier === 'elite') return <svg width={size} height={size} viewBox="0 0 40 40"><path d="M20 2 L36 14 L30 36 L10 36 L4 14 Z" fill="none" stroke={c} strokeWidth="3.5" /><path d="M20 10 L28 16 L25 28 L15 28 L12 16 Z" fill={c} /></svg>
  if (tier === 'legend') return <svg width={size} height={size} viewBox="0 0 40 40"><path d="M3 30 L7 10 L15 20 L20 6 L25 20 L33 10 L37 30 Z" fill={c} /><rect x="3" y="32" width="34" height="4" fill={c} /></svg>
  return null
}
export function TierMark({ tier }) {
  const c = MARK_COLOR[tier]
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 46, padding: tier === 'base' ? '0 18px' : '0 18px 0 14px', background: alpha(CHASSIS.bg, 0.78), border: `2px solid ${alpha(c, tier === 'base' ? 0.5 : 0.95)}`, borderRadius: 8 }}>
      <TierIcon tier={tier} />
      <span style={{ fontSize: fs(26), fontWeight: 800, letterSpacing: 5, color: c, whiteSpace: 'nowrap' }}>{TIER_WORD[tier]}</span>
    </div>
  )
}
export const Chip = ({ text, color = INK2 }) => (
  <div style={{ display: 'flex', alignItems: 'center', height: 40, alignSelf: 'flex-start', padding: '0 14px', background: alpha(CHASSIS.bg, 0.78), border: `2px solid ${alpha(color, 0.55)}`, borderRadius: 6 }}>
    <span style={{ fontSize: fs(22), fontWeight: 800, letterSpacing: 2, color, whiteSpace: 'nowrap' }}>{text}</span>
  </div>
)

// ── layer 4: the stats panel, per tier ──────────────────────────────────────────────────────────────────────────────────────────
function Tile({ s, w, tier, accent, h = 150 }) {
  const text = `${s.value}${s.unit ? ` ${s.unit}` : ''}`
  const big = text.length >= 8 ? 54 : text.length >= 6 ? 62 : 72
  const rule = tier === 'legend' ? alpha(FOIL.gold, 0.5) : tier === 'elite' ? alpha(HOLO.cyan, 0.4) : alpha(INK, 0.14)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: w, height: h, padding: '0 20px', borderLeft: `2px solid ${rule}`, justifyContent: 'center' }}>
      <span style={{ fontSize: fs(22), fontWeight: 800, color: DIM, letterSpacing: 0.4, whiteSpace: 'nowrap' }}>{s.label}</span>
      <div style={{ display: 'flex', alignItems: 'center', height: 70 }}>
        {s.small
          ? <span style={{ fontSize: Math.max(24, Math.min(38, Math.floor((w - 40) / (String(s.value).length * 0.76)))), fontWeight: 800, whiteSpace: 'nowrap' }}>{s.value}</span>
          : <span style={{ fontFamily: DISPLAY, fontSize: big, fontWeight: 900, lineHeight: 1, whiteSpace: 'nowrap', color: tier === 'legend' ? FOIL.goldHi : INK }}>{s.value}</span>}
      </div>
      <div style={{ display: 'flex', height: 26, alignItems: 'center' }}>
        {s.sub ? <span style={{ fontSize: fs(22), fontWeight: 600, color: INK2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: w - 40 }}>{s.sub}</span> : null}
      </div>
    </div>
  )
}
export const panelStyle = (tier, accent) => ({
  base: { background: alpha(INK, 0.04), border: `2px solid ${alpha(INK, 0.16)}`, borderRadius: 6 },
  star: { background: alpha(INK, 0.05), border: `2px solid ${alpha(INK, 0.18)}`, borderTop: `4px solid ${FOIL.silver}`, borderRadius: 6 },
  elite: { background: alpha(FOIL.void, 0.62), border: `2px solid ${alpha(HOLO.cyan, 0.5)}`, borderTop: `3px solid ${alpha(HOLO.white, 0.55)}`, borderRadius: 8 },
  legend: { background: alpha(FOIL.void, 0.7), border: `2px solid ${alpha(FOIL.gold, 0.75)}`, borderTop: `2px solid ${FOIL.goldHi}`, borderBottom: `2px solid ${FOIL.goldMid}`, borderRadius: 4 },
}[tier])

// ── the ornate corner of a LEGEND (200 px): a gold bracket that runs 190 px along both edges inside the border zone, with a notch, scroll and a pearl; mirrored into the four corners.
// Everything sits in the 40 px border and a 56 px flourish: it never reaches the type. ────────────────────────────────────────────────────
export function Corner({ x, y, flipX, flipY, s = 200 }) {
  return (
    <svg width={s} height={s} viewBox="0 0 200 200" style={{ position: 'absolute', left: x, top: y, transform: `scale(${flipX ? -1 : 1}, ${flipY ? -1 : 1})` }}>
      <path d="M5 196 V44 Q5 5 44 5 H196" fill="none" stroke={FOIL.goldHi} strokeWidth="7" />
      <path d="M17 196 V48 Q17 17 48 17 H196" fill="none" stroke={FOIL.goldDeep} strokeWidth="4" />
      <path d="M5 5 L58 5 L58 17 L17 17 L17 58 L5 58 Z" fill={FOIL.gold} stroke={FOIL.goldDeep} strokeWidth="2" />
      <path d="M70 11 Q88 30 106 11 Q124 30 142 11 M11 70 Q30 88 11 106 Q30 124 11 142" fill="none" stroke={FOIL.goldHi} strokeWidth="4" />
      <path d="M30 30 L52 36 L36 52 Z" fill={FOIL.goldMid} stroke={FOIL.goldHi} strokeWidth="2" />
      <circle cx="30" cy="30" r="11" fill={FOIL.goldHi} stroke={FOIL.goldDeep} strokeWidth="3" />
      <circle cx="30" cy="30" r="4" fill={FOIL.goldDeep} />
    </svg>
  )
}

/** The rarity badge: a medallion with the tier's icon and word, ringed in the tier's material. Sits low on the portrait's right, over the club watermark. */
function Badge({ tier }) {
  const c = MARK_COLOR[tier]
  const ring = tier === 'legend' ? goldRamp(135) : tier === 'elite' ? prismRamp(135) : silverRamp
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 132 }}>
      <div style={{ display: 'flex', width: 112, height: 112, borderRadius: 112, alignItems: 'center', justifyContent: 'center', background: ring }}>
        <div style={{ display: 'flex', width: 92, height: 92, borderRadius: 92, alignItems: 'center', justifyContent: 'center', background: FOIL.void, border: `3px solid ${alpha(c, 0.9)}` }}>
          <TierIcon tier={tier} size={54} />
        </div>
      </div>
      <div style={{ display: 'flex', marginTop: -16, padding: '2px 14px', background: FOIL.void, border: `2px solid ${c}`, borderRadius: 6 }}>
        <span style={{ fontSize: fs(22), fontWeight: 800, letterSpacing: 4, color: c, whiteSpace: 'nowrap' }}>{TIER_WORD[tier]}</span>
      </div>
    </div>
  )
}

/** The portrait: the verified photo, bottom-anchored; or the sport's intentional placeholder (initials on a crest ring), never anyone else's picture. */
function Portrait({ m, w, h, accent }) {
  if (m.face) return <img src={m.face} width={w} height={h} style={{ objectFit: 'contain' }} />
  const ini = (m.placeholder && m.placeholder.initials) || String(m.name || '').split(/\s+/).filter(Boolean).map((x) => x[0]).slice(0, 2).join('').toUpperCase() || '?'
  const d = Math.round(Math.min(w, h) * 0.62)
  return (
    <div style={{ display: 'flex', width: w, height: h, alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ display: 'flex', width: d, height: d, borderRadius: d, alignItems: 'center', justifyContent: 'center', background: alpha(accent, 0.16), border: `6px solid ${alpha(accent, 0.7)}` }}>
        <span style={{ fontFamily: DISPLAY, fontSize: Math.round(d * 0.46), fontWeight: 900, color: INK, transform: 'skewX(-8deg)' }}>{ini}</span>
      </div>
    </div>
  )
}

export const abs = (o) => ({ display: 'flex', position: 'absolute', ...o })
/** BASE's worn card stock: seeded nicks along the edge, a few scuffed corners, so every BASE card ages differently. */
function EdgeWear({ rnd, inset }) {
  const nicks = Array.from({ length: 90 }, (_, i) => {
    const edge = Math.floor(rnd() * 4), along = rnd(), size = 3 + Math.round(rnd() * 7), depth = Math.round(rnd() * (inset - 10))
    const horiz = edge < 2
    return { i, w: horiz ? size * 2 : size, h: horiz ? size : size * 2, x: horiz ? Math.round(along * (W - 60)) + 20 : edge === 2 ? depth : W - depth - size, y: horiz ? (edge === 0 ? depth : H - depth - size) : Math.round(along * (H - 60)) + 20, light: rnd() > 0.55 }
  })
  return <div style={abs({ left: 0, top: 0, width: W, height: H })}>{nicks.map((n) => <div key={n.i} style={abs({ left: n.x, top: n.y, width: n.w, height: n.h, background: n.light ? alpha(HOLO.white, 0.5) : alpha(FOIL.paperEdge, 0.7), borderRadius: 2 })} />)}</div>
}
/** LEGEND's gold dust: seeded sparkles of three sizes across the whole card, and a few four-point glints. */
export function GoldDust({ rnd }) {
  const dust = Array.from({ length: 56 }, (_, i) => ({ i, x: Math.round(rnd() * W), y: Math.round(rnd() * H), s: 4 + Math.round(rnd() * 8), a: 0.35 + rnd() * 0.55 }))
  const stars = Array.from({ length: 7 }, (_, i) => ({ i, x: 60 + Math.round(rnd() * (W - 120)), y: 90 + Math.round(rnd() * (H - 180)), s: 26 + Math.round(rnd() * 22) }))
  return <div style={abs({ left: 0, top: 0, width: W, height: H })}>{[
    ...dust.map((d) => <div key={`d${d.i}`} style={abs({ left: d.x, top: d.y, width: d.s, height: d.s, transform: 'rotate(45deg)', background: alpha(d.s > 8 ? FOIL.goldHi : HOLO.white, d.a) })} />),
    ...stars.map((s) => <Glint key={`g${s.i}`} x={s.x} y={s.y} s={s.s} a={0.8} />),
  ]}</div>
}

// ── the layout numbers, ONE place (collectDesign draws from them; faceRectOnCard measures from them) ─────────────────────────────────────────────
/** The VIEWS a single-photo sport (NHL, NFL) rotates through, and MLB's cut-out silo too: zoom, sideways shift, how far the photo drops below the zone's foot, the side the light comes from, and which colour the backlight takes. */
export const VIEWS = [
  { zoom: 1.0, dx: 0, drop: 0.04, light: 'top', hue: 'accent' },
  { zoom: 1.1, dx: -0.06, drop: 0.09, light: 'left', hue: 'tone' },
  { zoom: 1.05, dx: 0.06, drop: 0.02, light: 'right', hue: 'accent' },
  { zoom: 1.08, dx: 0, drop: 0.12, light: 'low', hue: 'tone' },
]
const LIGHT_AT = { top: '50% 0%', left: '0% 40%', right: '100% 40%', low: '50% 100%' }

export function geometry(m, tier) {
  const look = LOOK[tier]
  const b = look.inset
  const IW = W - 2 * b
  const IH = H - 2 * b
  const tiles = (m.tiles || []).slice(0, 6)
  const cols = tiles.length > 4 ? 3 : tiles.length === 4 ? 2 : Math.max(1, tiles.length)
  const rows = Math.ceil(tiles.length / cols) || 0
  const tileW = Math.floor((IW - 2 * 24 - 8) / cols)
  const TOP = 60, NAME = 124, TEAM = 56, TILE = 132, PANEL = rows * TILE + (rows ? 14 : 0), BANNER = 88, FOOT = 88, OVERLAP = 56
  const PZ = Math.max(400, IH - (TOP + NAME + TEAM + PANEL + BANNER + FOOT + 24) + OVERLAP)
  const portraitSize = Math.min(Math.round(PZ * 1.1), IW + 40)
  return { look, b, IW, IH, tiles, cols, rows, tileW, TOP, NAME, TEAM, TILE, PANEL, BANNER, FOOT, OVERLAP, PZ, portraitSize }
}

/** Where the whole photo sits inside the portrait zone ({ left, top, w, h } in zone px, before the zone clips it), per layout. null when the card wears a placeholder. */
export function photoRect(m, tier) {
  const p = m.collect && m.collect.portrait
  if (!m.face || !p || !p.width || !p.height) return null
  const { IW, PZ, portraitSize } = geometry(m, tier)
  const layout = m.portraitLayout || 'cutout'
  const aspect = p.width / p.height
  if (layout === 'bleed') {
    const scale = Math.max(IW / p.width, PZ / p.height)
    const w = p.width * scale, h = p.height * scale
    return { left: (IW - w) * 0.5, top: (PZ - h) * (m.portraitMode === 'action' ? 0 : 0.5), w, h }
  }
  if (layout === 'studio') {
    const h = PZ * 1.08, w = h * aspect
    return { left: (IW - w) / 2, top: PZ - h + 0.09 * h, w, h }
  }
  const v = m.view || VIEWS[0]
  const ps = Math.round(portraitSize * v.zoom)
  const w = aspect >= 1 ? ps : ps * aspect, h = w / aspect
  const boxLeft = (IW - ps) / 2 + v.dx * ps, boxTop = PZ - ps + v.drop * ps
  return { left: boxLeft + (ps - w) / 2, top: boxTop + (ps - h) / 2, w, h }
}

/** The face box on the finished card ({ x, y, w, h } in card px, clipped to the portrait zone): where the check measures how bright the face is. null without a photo. */
export function faceRectOnCard(m, tier) {
  const r = photoRect(m, tier)
  const f = m.portraitFace
  if (!r || !f) return null
  const { b, IW, TOP, PZ } = geometry(m, tier)
  const x0 = Math.max(0, r.left + f.x0 * r.w), x1 = Math.min(IW, r.left + f.x1 * r.w)
  const y0 = Math.max(0, r.top + f.y0 * r.h), y1 = Math.min(PZ - geometry(m, tier).OVERLAP, r.top + f.y1 * r.h)
  if (x1 <= x0 || y1 <= y0) return null
  return { x: Math.round(b + x0), y: Math.round(b + TOP + y0), w: Math.round(x1 - x0), h: Math.round(y1 - y0) }
}

/** THE STOCK (outer card): the material is the border. One piece of code for the front and the back (lib/cards/collect/collectBack.js), so a tier's frame is the same on both sides. */
export function collectStock(tier, grain, rnd) {
  const look = LOOK[tier]
  const b = look.inset
  const has = (n) => collectLayers(tier).includes(n)
  const stockBg = { base: FOIL.paper, star: starFoil, elite: prismRamp(135), legend: goldRamp(135) }[tier]
  const stock = (
    <div style={abs({ left: 0, top: 0, width: W, height: H, borderRadius: look.radius, overflow: 'hidden', background: stockBg })}>
      {grain ? <img src={grain} width={W} height={H} style={{ position: 'absolute', left: 0, top: 0, opacity: tier === 'base' ? 0.45 : tier === 'star' ? 0.12 : 0.18 }} /> : null}
      {tier === 'base' ? <div style={abs({ left: 0, top: 0, width: W, height: H, background: `radial-gradient(circle at 50% 40%, ${alpha(HOLO.white, 0.16)} 0%, ${alpha(FOIL.paperEdge, 0.38)} 100%)` })} /> : null}
      {tier === 'base' ? <div style={abs({ left: 11, top: 11, width: W - 22, height: H - 22, borderRadius: look.radius - 8, border: `2px solid ${alpha(FOIL.paperEdge, 0.95)}` })} /> : null}
      {tier === 'base' ? <EdgeWear rnd={rnd} inset={b} /> : null}
      {has('silver-frame') ? <div style={abs({ left: 0, top: 0, width: W, height: H, background: `linear-gradient(118deg, ${alpha(HOLO.white, 0)} 0%, ${alpha(HOLO.white, 0)} 30%, ${alpha(HOLO.white, 0.85)} 38%, ${alpha(HOLO.white, 0)} 46%, ${alpha(HOLO.white, 0)} 70%, ${alpha(HOLO.white, 0.55)} 76%, ${alpha(HOLO.white, 0)} 82%)` })} /> : null}
      {has('silver-frame') ? <div style={abs({ left: 7, top: 7, width: W - 14, height: H - 14, borderRadius: look.radius - 5, border: `3px solid ${alpha(FOIL.void, 0.55)}` })} /> : null}
      {has('holo-bevel') ? <div style={abs({ left: 8, top: 8, width: W - 16, height: H - 16, borderRadius: look.radius - 6, background: alpha(FOIL.void, 0.88) })} /> : null}
      {has('holo-bevel') ? <div style={abs({ left: 12, top: 12, width: W - 24, height: H - 24, borderRadius: look.radius - 10, background: prismRamp(315) })} /> : null}
      {has('gold-bevel') ? <div style={abs({ left: 10, top: 10, width: W - 20, height: H - 20, borderRadius: look.radius - 6, background: alpha(FOIL.goldDeep, 0.95) })} /> : null}
      {has('gold-bevel') ? <div style={abs({ left: 15, top: 15, width: W - 30, height: H - 30, borderRadius: look.radius - 11, background: goldRamp(315) })} /> : null}
      {has('gold-bevel') ? <div style={abs({ left: 26, top: 26, width: W - 52, height: H - 52, borderRadius: look.radius - 20, border: `2px solid ${alpha(FOIL.goldDeep, 0.9)}` })} /> : null}
    </div>
  )
  return stock
}

/** The design (1000 x 1400) of a collectible card, as an element. `m` = a special MODEL (lib/cards/specialData.js buildSpecialModel) + m.collect = { cardId, issue, ... }. */
export function collectDesign(m, grain, { tier = m.moment.tier } = {}) {
  const accent = SPORT_ACCENT[m.sport]
  const { look, b, IW, IH, rows, cols, tileW, TOP, NAME, TEAM, TILE, BANNER, FOOT, OVERLAP, PZ, portraitSize } = geometry(m, tier)
  const tiles = (m.tiles || []).slice(0, 6)
  const c = m.collect || {}
  const rnd = seeded(String(c.slotId || c.cardId || m.playerId || '1').replace(/^D[NS]-/, ''))
  const status = m.status === 'called' || m.status === 'board' ? m.status : null
  const layout = m.face ? (m.portraitLayout || 'cutout') : 'cutout'
  const view = m.view || VIEWS[0]
  const glowCol = view.hue === 'tone' ? (m.tone || accent) : accent
  const photo = photoRect(m, tier)
  const nameSize = fitName(m.name, 128, IW - 70)
  const Env = ENVIRONMENT[m.sport]
  const BIcon = BANNER_ICON[m.sport]
  const layers = collectLayers(tier)
  const has = (n) => layers.includes(n)
  const accentText = tier === 'legend' ? FOIL.goldHi : accent
  const kick = String(m.kicker || '')
  const lookPreview = Boolean(c.styleOnly)
  const rule = { base: alpha(FOIL.paper, 0.55), star: FOIL.silver, elite: prismRamp(90), legend: goldRamp(90) }[tier]
  const plateBg = {
    base: `linear-gradient(90deg, ${alpha(FOIL.void, 0.95)} 0%, ${alpha(FOIL.void, 0.82)} 100%)`,
    star: `linear-gradient(90deg, ${alpha(FOIL.void, 0.95)} 0%, ${alpha(CHASSIS.bg, 0.8)} 100%)`,
    elite: `linear-gradient(90deg, ${alpha(FOIL.void, 0.95)} 0%, ${alpha(PRISM.violet, 0.28)} 55%, ${alpha(FOIL.void, 0.85)} 100%)`,
    legend: `linear-gradient(90deg, ${alpha(FOIL.goldDeep, 0.78)} 0%, ${alpha(FOIL.void, 0.92)} 55%, ${alpha(FOIL.goldDeep, 0.6)} 100%)`,
  }[tier]

  const stock = collectStock(tier, grain, rnd)

  // ── the printed area (the field) ──
  const field_ = (
    <div style={{ display: 'flex', flexDirection: 'column', position: 'absolute', left: b, top: b, width: IW, height: IH, borderRadius: look.radius - 20, overflow: 'hidden', background: field(accent, m.tone) }}>
      {grain ? <img src={grain} width={IW} height={IH} style={{ position: 'absolute', left: 0, top: 0, opacity: 0.9 }} /> : null}

      {/* the top bar: the product, the rarity mark, the league */}
      <div style={{ display: 'flex', alignItems: 'center', height: TOP, padding: '0 22px', gap: 16 }}>
        <span style={{ fontSize: fs(34), fontWeight: 800, letterSpacing: 8, color: accentText, whiteSpace: 'nowrap' }}>{m.brand.name}</span>
        <div style={{ display: 'flex', flexGrow: 1, height: 2, background: alpha(accentText, 0.5) }} />
        <TierMark tier={tier} />
        <span style={{ fontSize: fs(28), fontWeight: 800, letterSpacing: 3, color: INK2, whiteSpace: 'nowrap' }}>{String(m.sport).toUpperCase()}</span>
      </div>

      {/* the portrait zone. THE PHOTO IS NEVER TINTED OR DARKENED: no vignette, no wash, no dark backlight over it. The only things over the face are thin ADDITIVE light bands. */}
      <div style={{ display: 'flex', position: 'relative', width: IW, height: PZ, overflow: 'hidden', borderTop: `2px solid ${alpha(accentText, 0.4)}`, background: layout === 'studio' && m.portraitBg ? `rgb(${m.portraitBg.join(',')})` : 'transparent' }}>
        {layout === 'cutout' || !m.face ? <div style={abs({ left: 0, top: 0, width: IW, height: PZ, background: `radial-gradient(circle at ${LIGHT_AT[view.light]}, ${alpha(glowCol, 0.5)} 0%, ${alpha(glowCol, 0.16)} 60%, ${alpha(glowCol, 0.07)} 100%)` })} /> : null}
        {layout === 'cutout' || !m.face ? (Env ? <Env w={IW} h={PZ} accent={accent} rnd={rnd} /> : null) : null}
        {layout === 'cutout' && m.logo ? <div style={{ display: 'flex', position: 'absolute', right: -70, top: Math.round(PZ * 0.1), opacity: 0.22 }}><Logo m={m} size={Math.round(PZ * 0.8)} /></div> : null}
        {m.face && photo ? <img src={m.face} width={Math.round(photo.w)} height={Math.round(photo.h)} style={{ position: 'absolute', left: Math.round(photo.left), top: Math.round(photo.top), objectFit: layout === 'cutout' ? 'contain' : 'cover' }} /> : null}
        {!m.face ? <div style={{ display: 'flex', position: 'absolute', left: Math.round((IW - portraitSize) / 2), bottom: -Math.round(portraitSize * 0.04) }}><Portrait m={m} w={portraitSize} h={portraitSize} accent={accent} /></div> : null}
        {/* only the lower body fades into the name plate (the plate's own overlap, 56 px): never the face or the upper body */}
        <div style={abs({ left: 0, bottom: 0, width: IW, height: OVERLAP + 14, background: `linear-gradient(180deg, ${alpha(FOIL.void, 0)} 0%, ${alpha(FOIL.void, 0.8)} 100%)` })} />
        {has('sheen-portrait') ? <div style={abs({ left: -300, top: Math.round(PZ * 0.1), width: 1800, height: 70, transform: 'rotate(-27deg)', background: bandOf(0.16) })} /> : null}
        {has('prism-streaks') ? <div style={abs({ left: -300, top: Math.round(PZ * 0.05), width: 1800, height: 18, transform: 'rotate(-27deg)', background: prismRamp(90, 0.3) })} /> : null}
        {has('prism-streaks') ? <div style={abs({ left: -300, top: Math.round(PZ * 0.88), width: 1800, height: 10, transform: 'rotate(-27deg)', background: prismRamp(90, 0.28) })} /> : null}
        <div style={{ display: 'flex', flexDirection: 'column', position: 'absolute', left: 22, top: 20, gap: 8 }}>
          <Chip text={kick} color={accentText} />
          {m.tag ? <Chip text={m.tag} /> : null}
          {m.test ? <Chip text="TEST DATA" color={FOIL.gold} /> : null}
          {c.priceSource === 'lock' ? <Chip text="PRICE LISTED PRE-GAME" color={FOIL.gold} /> : null}
          {lookPreview ? <Chip text="STYLE PREVIEW · TIER NOT EARNED" color={FOIL.gold} /> : null}
        </div>
        {m.hero ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'absolute', right: 22, top: 20, padding: '10px 24px 6px 24px', background: alpha(CHASSIS.bg, 0.78), border: `2px solid ${alpha(accentText, 0.7)}`, borderRadius: 6 }}>
            <span style={{ fontSize: fs(22), fontWeight: 800, letterSpacing: 4, color: INK2, whiteSpace: 'nowrap' }}>{m.hero.word}</span>
            <span style={{ fontFamily: DISPLAY, fontSize: m.hero.value.length > 5 ? 72 : 96, fontWeight: 900, lineHeight: 1, color: accentText, transform: 'skewX(-8deg)', whiteSpace: 'nowrap' }}>{m.hero.value}</span>
          </div>
        ) : null}
        {has('badge') ? <div style={{ display: 'flex', position: 'absolute', right: 22, bottom: OVERLAP + 36 }}><Badge tier={tier} /></div> : null}
      </div>

      {/* the name plate (overlaps the portrait's foot) and the club */}
      <div style={{ display: 'flex', flexDirection: 'column', marginTop: -OVERLAP }}>
        <div style={{ display: 'flex', flexDirection: 'column', background: plateBg }}>
          <div style={{ display: 'flex', height: 6, background: rule }} />
          <div style={{ display: 'flex', alignItems: 'center', height: NAME - 6, padding: '0 30px 0 26px' }}>
            <span style={{ fontFamily: DISPLAY, fontSize: nameSize, fontWeight: 900, lineHeight: 1.02, textTransform: 'uppercase', transform: 'skewX(-8deg)', letterSpacing: -0.5, whiteSpace: 'nowrap', color: tier === 'legend' ? FOIL.goldHi : INK }}>{m.name}</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, height: TEAM, padding: '0 30px 0 26px' }}>
          <Logo m={m} size={44} />
          <span style={{ fontSize: fs(36), fontWeight: 800, whiteSpace: 'nowrap' }}>{m.home == null ? `${m.team} · ${m.opp}` : `${m.team} ${m.home ? 'vs' : '@'} ${m.opp}`}</span>
          <span style={{ fontSize: fs(26), fontWeight: 600, color: DIM, whiteSpace: 'nowrap' }}>{[m.club || m.teamName, m.pos, m.number != null ? `#${m.number}` : null].filter((x) => x && x !== m.team).join('  ·  ')}</span>
        </div>
      </div>

      {/* the evidence: the verified stats */}
      {rows ? (
        <div style={{ display: 'flex', flexDirection: 'column', margin: '0 24px 0 24px', ...panelStyle(tier, accent) }}>
          {Array.from({ length: rows }, (_, r) => (
            <div key={r} style={{ display: 'flex', borderTop: r ? `${tier === 'legend' ? 3 : 2}px solid ${tier === 'legend' ? FOIL.goldMid : alpha(INK, 0.1)}` : 'none' }}>
              {tiles.slice(r * cols, r * cols + cols).map((s) => <Tile key={s.label} s={s} w={tileW} tier={tier} accent={accent} h={TILE} />)}
            </div>
          ))}
        </div>
      ) : null}

      {/* the event line */}
      <div style={{ display: 'flex', flexGrow: 1, alignItems: 'center', padding: '0 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', width: '100%', height: BANNER, padding: '0 22px', gap: 20, background: alpha(accentText, 0.12), borderStyle: 'solid', borderWidth: '2px 2px 2px 8px', borderColor: `${alpha(accentText, 0.45)} ${alpha(accentText, 0.45)} ${alpha(accentText, 0.45)} ${accentText}` }}>
          {BIcon ? <BIcon size={52} color={accentText} /> : null}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {status ? <span style={{ fontSize: fs(24), fontWeight: 800, letterSpacing: 5, color: accentText }}>{STATUS_WORD[status]}</span> : null}
            <span style={{ fontFamily: DISPLAY, fontSize: 50, fontWeight: 900, lineHeight: 1.05, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{status && m.callLine ? m.callLine : m.line}</span>
          </div>
        </div>
      </div>

      {/* the collection metadata: the real card id; the issue number is PREVIEW until the issuance table exists */}
      <div style={{ display: 'flex', flexDirection: 'column', height: FOOT, padding: '0 26px', justifyContent: 'center', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontSize: fs(24), fontWeight: 800, color: INK2, letterSpacing: 2, whiteSpace: 'nowrap' }}>{`${m.brand.name} · DASH Network`}</span>
          <div style={{ display: 'flex', flexGrow: 1, height: 2, background: alpha(INK, 0.15) }} />
          <span style={{ fontSize: fs(24), fontWeight: 600, color: DIM, whiteSpace: 'nowrap' }}>{m.dayWord || ''}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontSize: fs(22), fontWeight: 800, color: DIM, letterSpacing: 1.5, whiteSpace: 'nowrap' }}>{`ID ${c.cardId || 'NO ID'}`}</span>
          <div style={{ display: 'flex', flexGrow: 1, height: 2, background: alpha(INK, 0.1) }} />
          <span style={{ fontSize: fs(22), fontWeight: 800, color: DIM, letterSpacing: 1.5, whiteSpace: 'nowrap' }}>{c.issue === '' ? '' : `ISSUE NO. ${c.issue || 'PREVIEW'}`}</span>
        </div>
      </div>
      {/* BASE: the inner bevel line of the printed area (a dark line and a light line, like a pressed edge) */}
      {tier === 'base' ? <div style={abs({ left: 0, top: 0, width: IW, height: IH, borderRadius: look.radius - 20, border: `3px solid ${alpha(FOIL.void, 0.7)}` })} /> : null}
      {tier === 'base' ? <div style={abs({ left: 5, top: 5, width: IW - 10, height: IH - 10, borderRadius: look.radius - 24, border: `2px solid ${alpha(FOIL.paper, 0.4)}` })} /> : null}
    </div>
  )

  // ── layer 5: the finish, over everything. FOIL STAYS ON THE FRAME, THE PLATES AND THE OUTER EDGES: the washes are drawn only in the top bar, below the portrait, and in two narrow edge strips
  // beside it; across the photo itself there are only thin additive bands (above, in the portrait zone). ──
  const ZT = b + TOP, ZB = b + TOP + PZ - OVERLAP
  const streak = (top, h, a, left = -380) => <div style={abs({ left, top, width: 1800, height: h, transform: 'rotate(-27deg)', background: `linear-gradient(180deg, ${alpha(FOIL.goldHi, 0)} 0%, ${alpha(FOIL.goldHi, a)} 50%, ${alpha(FOIL.goldHi, 0)} 100%)` })} />
  const washBg = has('edge-wash') ? prismWash(0.12) : has('gold-wash') ? goldWash(1.5) : null
  const stripL = has('edge-wash') ? alpha(PRISM.violet, 0.26) : alpha(FOIL.gold, 0.3)
  const stripR = has('edge-wash') ? alpha(PRISM.cyan, 0.26) : alpha(FOIL.gold, 0.3)
  const finish = layers.length ? (
    <div style={abs({ left: 0, top: 0, width: W, height: H, borderRadius: look.radius, overflow: 'hidden' })}>
      {washBg ? <div style={abs({ left: 0, top: 0, width: W, height: ZT, background: washBg })} /> : null}
      {washBg ? <div style={abs({ left: 0, top: ZB, width: W, height: H - ZB, background: washBg })} /> : null}
      {washBg ? <div style={abs({ left: 0, top: ZT, width: b + 64, height: ZB - ZT, background: `linear-gradient(90deg, ${stripL} 0%, ${alpha(FOIL.void, 0)} 100%)` })} /> : null}
      {washBg ? <div style={abs({ left: W - b - 64, top: ZT, width: b + 64, height: ZB - ZT, background: `linear-gradient(270deg, ${stripR} 0%, ${alpha(FOIL.void, 0)} 100%)` })} /> : null}
      {tier === 'elite' && has('sheen-1') ? <div style={abs({ left: -380, top: 10, width: 1800, height: 90, transform: 'rotate(-27deg)', background: bandOf(0.14) })} /> : null}
      {tier === 'elite' && has('sheen-2') ? <div style={abs({ left: -380, top: 840, width: 1800, height: 50, transform: 'rotate(-27deg)', background: bandOf(0.14) })} /> : null}
      {tier === 'legend' && has('streak-1') ? streak(170, 90, 0.2) : null}
      {tier === 'legend' && has('streak-2') ? streak(700, 40, 0.18) : null}
      {tier === 'legend' && has('streak-3') ? streak(930, 300, 0.16) : null}
      {has('gold-dust') ? <GoldDust rnd={rnd} /> : null}
      {has('glint-frame') ? <Glint x={Math.round(b / 2) + 8} y={Math.round(H * 0.07)} s={tier === 'legend' ? 70 : 56} a={0.9} /> : null}
      {has('glint-emblem') ? <Glint x={Math.round(W * 0.84)} y={Math.round(H * 0.22)} s={52} a={0.8} /> : null}
      {has('glint-name') ? <Glint x={Math.round(W * 0.7)} y={Math.round(H * 0.575)} s={58} a={0.8} /> : null}
      {has('glint-badge') ? <Glint x={W - b - 22 - 66} y={Math.round(H * 0.5)} s={48} a={0.85} /> : null}
      {has('corner-ornaments') ? [<Corner key="a" x={0} y={0} />, <Corner key="b" x={W - 200} y={0} flipX />, <Corner key="c" x={0} y={H - 200} flipY />, <Corner key="d" x={W - 200} y={H - 200} flipX flipY />] : null}
    </div>
  ) : null

  return (
    <div style={{ width: W, height: H, display: 'flex', position: 'relative', background: 'transparent', color: INK, fontFamily: 'Inter' }}>
      {stock}
      {field_}
      {finish}
    </div>
  )
}

/** PNG bytes of a collectible card at `width` px (5:7; the design size by default). */
export async function renderCollect(m, { width, tier } = {}) {
  const { grain, fonts } = await assets()
  initMetrics(fonts)
  const t = TIERS.includes(tier) ? tier : m.moment.tier
  const el = collectDesign(m, grain, { tier: t })
  LINT.push(...lintType(collectDesign(m, grain, { tier: t })).map((x) => ({ ...x, card: 'collect' })))
  const full = Buffer.from(await new ImageResponse(el, { width: W, height: H, fonts }).arrayBuffer())
  const w = Math.max(250, Math.min(W, Math.round(Number(width) || W)))
  if (w >= W) return full
  const sharp = (await import('sharp')).default
  return sharp(full).resize(w, Math.round((w * H) / W), { kernel: 'lanczos3' }).png().toBuffer()
}
