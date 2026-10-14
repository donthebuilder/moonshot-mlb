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
import { HOLO, FOIL } from '../assets'
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
  base:   { inset: 30, radius: 36, grain: 0.55 },
  star:   { inset: 30, radius: 36, grain: 0.5 },
  elite:  { inset: 28, radius: 36, grain: 0.4 },
  legend: { inset: 34, radius: 40, grain: 0.35 },
}
/** The NAMED finish layers drawn for a tier (layer 5). Its length is the tier's decoration density: BASE 0, STAR 2, ELITE <= 9, LEGEND <= 10. */
export const collectLayers = (tier) => ({
  base: [],
  star: ['silver-strip', 'sheen-1'],
  elite: ['holo-ring', 'holo-bevel', 'wash', 'sheen-1', 'sheen-2', 'sheen-3', 'glint-frame', 'glint-emblem', 'glint-hero'],
  legend: ['gold-ring', 'gold-bevel', 'gold-wash', 'sheen-1', 'sheen-2', 'glint-frame', 'glint-emblem', 'corner-ornaments'],
}[tier] || [])
export const MAX_DENSITY = { base: 0, star: 2, elite: 9, legend: 10 }

const goldRamp = (deg = 135) => `linear-gradient(${deg}deg, ${FOIL.goldHi} 0%, ${FOIL.gold} 18%, ${FOIL.goldMid} 38%, ${FOIL.goldHi} 52%, ${FOIL.gold} 68%, ${FOIL.goldDeep} 100%)`
const silverRamp = `linear-gradient(90deg, ${FOIL.silverEdge} 0%, ${FOIL.silver} 30%, ${HOLO.white} 50%, ${FOIL.silver} 70%, ${FOIL.silverEdge} 100%)`
const goldWash = (k = 1) => `linear-gradient(115deg, ${alpha(FOIL.gold, 0)} 0%, ${alpha(FOIL.gold, 0.12 * k)} 22%, ${alpha(FOIL.goldHi, 0.14 * k)} 46%, ${alpha(FOIL.gold, 0.1 * k)} 70%, ${alpha(FOIL.gold, 0)} 100%)`
const MARK_COLOR = { base: INK2, star: FOIL.silver, elite: HOLO.cyan, legend: FOIL.gold }

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
const ENVIRONMENT = { nhl: IceEnvironment }
const Puck = ({ size = 56, color = INK }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="32" cy="38" rx="26" ry="11" fill="none" stroke={color} strokeWidth="3" />
    <path d="M6 38 V28 a26 11 0 0 1 52 0 V38" fill="none" stroke={color} strokeWidth="3" />
    <ellipse cx="32" cy="28" rx="26" ry="11" fill={alpha(color, 0.25)} stroke={color} strokeWidth="3" />
  </svg>
)
const BANNER_ICON = { nhl: Puck }

// ── the rarity mark ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
function TierIcon({ tier, size = 34 }) {
  const c = MARK_COLOR[tier]
  if (tier === 'star') return <svg width={size} height={size} viewBox="0 0 40 40"><path d="M20 2 L24 16 L38 20 L24 24 L20 38 L16 24 L2 20 L16 16 Z" fill={c} /></svg>
  if (tier === 'elite') return <svg width={size} height={size} viewBox="0 0 40 40"><path d="M20 2 L36 14 L30 36 L10 36 L4 14 Z" fill="none" stroke={c} strokeWidth="3.5" /><path d="M20 10 L28 16 L25 28 L15 28 L12 16 Z" fill={c} /></svg>
  if (tier === 'legend') return <svg width={size} height={size} viewBox="0 0 40 40"><path d="M3 30 L7 10 L15 20 L20 6 L25 20 L33 10 L37 30 Z" fill={c} /><rect x="3" y="32" width="34" height="4" fill={c} /></svg>
  return null
}
function TierMark({ tier }) {
  const c = MARK_COLOR[tier]
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 46, padding: tier === 'base' ? '0 18px' : '0 18px 0 14px', background: alpha(CHASSIS.bg, 0.78), border: `2px solid ${alpha(c, tier === 'base' ? 0.5 : 0.95)}`, borderRadius: 8 }}>
      <TierIcon tier={tier} />
      <span style={{ fontSize: fs(26), fontWeight: 800, letterSpacing: 5, color: c, whiteSpace: 'nowrap' }}>{TIER_WORD[tier]}</span>
    </div>
  )
}
const Chip = ({ text, color = INK2 }) => (
  <div style={{ display: 'flex', alignItems: 'center', height: 40, alignSelf: 'flex-start', padding: '0 14px', background: alpha(CHASSIS.bg, 0.78), border: `2px solid ${alpha(color, 0.55)}`, borderRadius: 6 }}>
    <span style={{ fontSize: fs(22), fontWeight: 800, letterSpacing: 2, color, whiteSpace: 'nowrap' }}>{text}</span>
  </div>
)

// ── layer 4: the stats panel, per tier ──────────────────────────────────────────────────────────────────────────────────────────
function Tile({ s, w, tier, accent }) {
  const text = `${s.value}${s.unit ? ` ${s.unit}` : ''}`
  const big = text.length >= 8 ? 54 : text.length >= 6 ? 62 : 72
  const rule = tier === 'legend' ? alpha(FOIL.gold, 0.5) : tier === 'elite' ? alpha(HOLO.cyan, 0.4) : alpha(INK, 0.14)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: w, height: 150, padding: '0 20px', borderLeft: `2px solid ${rule}`, justifyContent: 'center' }}>
      <span style={{ fontSize: fs(22), fontWeight: 800, color: DIM, letterSpacing: 0.4, whiteSpace: 'nowrap' }}>{s.label}</span>
      <div style={{ display: 'flex', alignItems: 'center', height: 76 }}>
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
const panelStyle = (tier, accent) => ({
  base: { background: alpha(INK, 0.04), border: `2px solid ${alpha(INK, 0.16)}`, borderRadius: 6 },
  star: { background: alpha(INK, 0.05), border: `2px solid ${alpha(INK, 0.18)}`, borderTop: `4px solid ${FOIL.silver}`, borderRadius: 6 },
  elite: { background: alpha(FOIL.void, 0.62), border: `2px solid ${alpha(HOLO.cyan, 0.5)}`, borderTop: `3px solid ${alpha(HOLO.white, 0.55)}`, borderRadius: 8 },
  legend: { background: alpha(FOIL.void, 0.7), border: `2px solid ${alpha(FOIL.gold, 0.75)}`, borderTop: `2px solid ${FOIL.goldHi}`, borderBottom: `2px solid ${FOIL.goldMid}`, borderRadius: 4 },
}[tier])

// ── the ornate corner of a LEGEND: a bracket with a notch and a pearl, mirrored into the four corners ─────────────────────────────
function Corner({ x, y, flipX, flipY, s = 118 }) {
  return (
    <svg width={s} height={s} viewBox="0 0 120 120" style={{ position: 'absolute', left: x, top: y, transform: `scale(${flipX ? -1 : 1}, ${flipY ? -1 : 1})` }}>
      <path d="M4 116 V30 Q4 4 30 4 H116" fill="none" stroke={FOIL.goldHi} strokeWidth="5" />
      <path d="M14 116 V34 Q14 14 34 14 H116" fill="none" stroke={FOIL.goldMid} strokeWidth="2.5" />
      <path d="M4 4 L34 4 L34 14 L14 14 L14 34 L4 34 Z" fill={FOIL.gold} />
      <path d="M44 14 Q54 30 70 14 M14 44 Q30 54 14 70" fill="none" stroke={FOIL.gold} strokeWidth="3" />
      <circle cx="26" cy="26" r="6" fill={FOIL.goldHi} stroke={FOIL.goldDeep} strokeWidth="2" />
    </svg>
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

/** The design (1000 x 1400) of a collectible card, as an element. `m` = a special MODEL (lib/cards/specialData.js buildSpecialModel) + m.collect = { cardId, issue, ... }. */
export function collectDesign(m, grain, { tier = m.moment.tier } = {}) {
  const accent = SPORT_ACCENT[m.sport]
  const look = LOOK[tier]
  const b = look.inset
  const IW = W - 2 * b
  const IH = H - 2 * b
  const c = m.collect || {}
  const rnd = seeded(String(c.slotId || c.cardId || m.playerId || '1').replace(/^D[NS]-/, ''))
  const status = m.status === 'called' || m.status === 'board' ? m.status : null
  const tiles = (m.tiles || []).slice(0, 6)
  const cols = tiles.length > 4 ? 3 : tiles.length === 4 ? 2 : Math.max(1, tiles.length)
  const rows = Math.ceil(tiles.length / cols) || 0
  const tileW = Math.floor((IW - 2 * 24 - 8) / cols)
  const TOP = 64, NAME = 140, TEAM = 62, PANEL = rows * 150 + (rows ? 16 : 0), BANNER = 96, FOOT = 96
  const PZ = Math.max(380, IH - (TOP + NAME + TEAM + PANEL + BANNER + FOOT + 28))
  const portraitSize = Math.min(PZ, IW - 60)
  const nameSize = fitName(m.name, 128, IW - 70)
  const Env = ENVIRONMENT[m.sport]
  const BIcon = BANNER_ICON[m.sport]
  const layers = collectLayers(tier)
  const has = (n) => layers.includes(n)
  const accentText = tier === 'legend' ? FOIL.goldHi : accent
  const kick = String(m.kicker || '')
  const lookPreview = Boolean(c.styleOnly)

  // ── the stock (outer card): material and geometry per tier ──
  const stock = (
    <div style={{ display: 'flex', position: 'absolute', left: 0, top: 0, width: W, height: H, borderRadius: look.radius, overflow: 'hidden',
      background: tier === 'legend' ? goldRamp(135) : tier === 'elite' ? ringOf('elite') : FOIL.paper }}>
      {grain ? <img src={grain} width={W} height={H} style={{ position: 'absolute', left: 0, top: 0, opacity: tier === 'base' || tier === 'star' ? 0.5 : 0.2 }} /> : null}
      {tier === 'base' ? <div style={{ display: 'flex', position: 'absolute', left: 12, top: 12, width: W - 24, height: H - 24, borderRadius: look.radius - 10, border: `2px solid ${alpha(FOIL.paperEdge, 0.9)}` }} /> : null}
      {has('silver-strip') ? <div style={{ display: 'flex', position: 'absolute', left: 9, top: 9, width: W - 18, height: H - 18, borderRadius: look.radius - 6, background: silverRamp }} /> : null}
      {has('silver-strip') ? <div style={{ display: 'flex', position: 'absolute', left: 17, top: 17, width: W - 34, height: H - 34, borderRadius: look.radius - 12, background: FOIL.paper }} /> : null}
      {has('holo-bevel') ? <div style={{ display: 'flex', position: 'absolute', left: 8, top: 8, width: W - 16, height: H - 16, borderRadius: look.radius - 6, background: alpha(FOIL.void, 0.85) }} /> : null}
      {has('holo-bevel') ? <div style={{ display: 'flex', position: 'absolute', left: 12, top: 12, width: W - 24, height: H - 24, borderRadius: look.radius - 10, background: ringOf('elite') }} /> : null}
      {has('gold-bevel') ? <div style={{ display: 'flex', position: 'absolute', left: 10, top: 10, width: W - 20, height: H - 20, borderRadius: look.radius - 6, background: alpha(FOIL.goldDeep, 0.92) }} /> : null}
      {has('gold-bevel') ? <div style={{ display: 'flex', position: 'absolute', left: 15, top: 15, width: W - 30, height: H - 30, borderRadius: look.radius - 11, background: goldRamp(315) }} /> : null}
    </div>
  )

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

      {/* the portrait zone: environment, watermark, portrait, the kicker and the hero number */}
      <div style={{ display: 'flex', position: 'relative', width: IW, height: PZ, overflow: 'hidden', borderTop: `2px solid ${alpha(accentText, 0.4)}`, borderBottom: `2px solid ${alpha(accentText, 0.4)}` }}>
        {Env ? <Env w={IW} h={PZ} accent={accent} rnd={rnd} /> : null}
        {m.logo ? <div style={{ display: 'flex', position: 'absolute', right: -70, top: Math.round(PZ * 0.12), opacity: 0.2 }}><Logo m={m} size={Math.round(PZ * 0.82)} /></div> : null}
        <div style={{ display: 'flex', position: 'absolute', left: Math.round((IW - portraitSize) / 2), bottom: 0 }}><Portrait m={m} w={portraitSize} h={portraitSize} accent={accent} /></div>
        <div style={{ display: 'flex', flexDirection: 'column', position: 'absolute', left: 22, top: 20, gap: 8 }}>
          <Chip text={kick} color={accentText} />
          {m.tag ? <Chip text={m.tag} /> : null}
          {m.test ? <Chip text="TEST DATA" color={FOIL.gold} /> : null}
          {lookPreview ? <Chip text="STYLE PREVIEW · TIER NOT EARNED" color={FOIL.gold} /> : null}
        </div>
        {m.hero ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'absolute', right: 22, top: 20, padding: '10px 24px 6px 24px', background: alpha(CHASSIS.bg, 0.78), border: `2px solid ${alpha(accentText, 0.7)}`, borderRadius: 6 }}>
            <span style={{ fontSize: fs(22), fontWeight: 800, letterSpacing: 4, color: INK2, whiteSpace: 'nowrap' }}>{m.hero.word}</span>
            <span style={{ fontFamily: DISPLAY, fontSize: m.hero.value.length > 5 ? 72 : 96, fontWeight: 900, lineHeight: 1, color: accentText, transform: 'skewX(-8deg)', whiteSpace: 'nowrap' }}>{m.hero.value}</span>
          </div>
        ) : null}
      </div>

      {/* the name and the club */}
      <div style={{ display: 'flex', flexDirection: 'column', padding: '0 30px 0 26px' }}>
        <div style={{ display: 'flex', alignItems: 'center', height: NAME }}>
          <span style={{ fontFamily: DISPLAY, fontSize: nameSize, fontWeight: 900, lineHeight: 1.02, textTransform: 'uppercase', transform: 'skewX(-8deg)', letterSpacing: -0.5, whiteSpace: 'nowrap', color: tier === 'legend' ? FOIL.goldHi : INK }}>{m.name}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, height: TEAM }}>
          <Logo m={m} size={46} />
          <span style={{ fontSize: fs(36), fontWeight: 800, whiteSpace: 'nowrap' }}>{m.home == null ? `${m.team} · ${m.opp}` : `${m.team} ${m.home ? 'vs' : '@'} ${m.opp}`}</span>
          <span style={{ fontSize: fs(26), fontWeight: 600, color: DIM, whiteSpace: 'nowrap' }}>{[m.club || m.teamName, m.pos, m.number != null ? `#${m.number}` : null].filter((x) => x && x !== m.team).join('  ·  ')}</span>
        </div>
      </div>

      {/* the evidence: the verified stats */}
      {rows ? (
        <div style={{ display: 'flex', flexDirection: 'column', margin: '8px 24px 0 24px', ...panelStyle(tier, accent) }}>
          {Array.from({ length: rows }, (_, r) => (
            <div key={r} style={{ display: 'flex', borderTop: r ? `2px solid ${alpha(INK, 0.1)}` : 'none' }}>
              {tiles.slice(r * cols, r * cols + cols).map((s) => <Tile key={s.label} s={s} w={tileW} tier={tier} accent={accent} />)}
            </div>
          ))}
        </div>
      ) : null}

      {/* the event line */}
      <div style={{ display: 'flex', flexGrow: 1, alignItems: 'center', padding: '0 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', width: '100%', height: BANNER, padding: '0 22px', gap: 20, background: alpha(accentText, 0.1), borderStyle: 'solid', borderWidth: '2px 2px 2px 8px', borderColor: `${alpha(accentText, 0.4)} ${alpha(accentText, 0.4)} ${alpha(accentText, 0.4)} ${accentText}` }}>
          {BIcon ? <BIcon size={54} color={accentText} /> : null}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {status ? <span style={{ fontSize: fs(24), fontWeight: 800, letterSpacing: 5, color: accentText }}>{STATUS_WORD[status]}</span> : null}
            <span style={{ fontFamily: DISPLAY, fontSize: 52, fontWeight: 900, lineHeight: 1.05, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{status && m.callLine ? m.callLine : m.line}</span>
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
          <span style={{ fontSize: fs(22), fontWeight: 800, color: DIM, letterSpacing: 1.5, whiteSpace: 'nowrap' }}>{`ISSUE NO. ${c.issue || 'PREVIEW'}`}</span>
        </div>
      </div>
    </div>
  )

  // ── layer 5: the finish, over everything (low alpha: it never hides a word) ──
  const finish = collectLayers(tier).length ? (
    <div style={{ display: 'flex', position: 'absolute', left: 0, top: 0, width: W, height: H, borderRadius: look.radius, overflow: 'hidden' }}>
      {has('wash') ? <div style={{ display: 'flex', position: 'absolute', left: 0, top: 0, width: W, height: H, background: washOf(1) }} /> : null}
      {has('gold-wash') ? <div style={{ display: 'flex', position: 'absolute', left: 0, top: 0, width: W, height: H, background: goldWash(1.2) }} /> : null}
      {tier === 'star' && has('sheen-1') ? <div style={{ display: 'flex', position: 'absolute', left: -380, top: 520, width: 1800, height: 150, transform: 'rotate(-27deg)', background: bandOf(0.1) }} /> : null}
      {tier === 'elite' && has('sheen-1') ? <div style={{ display: 'flex', position: 'absolute', left: -380, top: 180, width: 1800, height: 170, transform: 'rotate(-27deg)', background: bandOf(0.16) }} /> : null}
      {tier === 'elite' && has('sheen-2') ? <div style={{ display: 'flex', position: 'absolute', left: -380, top: 520, width: 1800, height: 70, transform: 'rotate(-27deg)', background: bandOf(0.14) }} /> : null}
      {tier === 'elite' && has('sheen-3') ? <div style={{ display: 'flex', position: 'absolute', left: -380, top: 860, width: 1800, height: 240, transform: 'rotate(-27deg)', background: bandOf(0.08) }} /> : null}
      {tier === 'legend' && has('sheen-1') ? <div style={{ display: 'flex', position: 'absolute', left: -380, top: 260, width: 1800, height: 210, transform: 'rotate(-27deg)', background: `linear-gradient(180deg, ${alpha(FOIL.goldHi, 0)} 0%, ${alpha(FOIL.goldHi, 0.26)} 50%, ${alpha(FOIL.goldHi, 0)} 100%)` }} /> : null}
      {tier === 'legend' && has('sheen-2') ? <div style={{ display: 'flex', position: 'absolute', left: -380, top: 820, width: 1800, height: 90, transform: 'rotate(-27deg)', background: bandOf(0.16) }} /> : null}
      {has('glint-frame') ? <Glint x={Math.round(b / 2) + 8} y={Math.round(H * 0.07)} s={tier === 'legend' ? 64 : 52} a={0.85} /> : null}
      {has('glint-emblem') ? <Glint x={Math.round(W * 0.84)} y={Math.round(H * 0.22)} s={46} a={0.7} /> : null}
      {has('glint-hero') ? <Glint x={Math.round(W * 0.9)} y={Math.round(H * 0.08)} s={40} a={0.7} /> : null}
      {has('corner-ornaments') ? [<Corner key="a" x={6} y={6} />, <Corner key="b" x={W - 124} y={6} flipX />, <Corner key="c" x={6} y={H - 124} flipY />, <Corner key="d" x={W - 124} y={H - 124} flipX flipY />] : null}
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
