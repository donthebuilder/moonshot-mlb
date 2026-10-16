// THE COLLECTIBLE CARD, BACK (server only, JSX): the other side of lib/cards/collect/collectCard.js, in the same 1000 x 1400 (5:7) frame.
// Two faces, one stock:
//   face 'stats'  the player's stat table (the SAME rows the old 4:5 back drew: the sport adapter's backOf, nothing new), the moment the card documents, and the real
//                 card id and issue number. Dark printed area, the tier's own stock around it (BASE paper, STAR silver, ELITE holo, LEGEND gold: lib/cards/collect/collectCard.js
//                 collectStock, the one piece of code both sides use).
//   face 'brand'  the shared CALLED IT back of Donovan's 2026-10-14 mock: DASH NETWORK, CALLED IT, the line under it, the public sports' marks, the DN mark. The mock's
//                 "1/250" is NOT drawn: that was a fake serial. The slot carries the card's real id and issue number instead.
// RARITY IS THE EVENT'S, NEVER A GRADE: no grade, no population, no serial. The issue number reads PREVIEW until supabase/migrations/202610141500_card_issues.sql has run and a
// row exists (the same rule as the front). Every text node is >= 22 px at the design size (lintType).
import { ImageResponse } from 'next/og'
import { assets, fs, fitName, field, alpha, Logo, DISPLAY, INK, INK2, DIM, CHASSIS, lintType, LINT } from '../cardKit'
import { FOIL, PRISM } from '../assets'
import { SPORT_ACCENT } from '../../sportAccent'
import { TIERS } from '../moments'
import { initMetrics } from '../fit'
import { bandOf, Glint } from '../specialCard'
import { CARD_SPORTS } from '../../card/core'
import { W, H, LOOK, collectLayers, collectStock, seeded, abs, TierMark, Corner, GoldDust, BANNER_ICON, panelStyle, prismRamp, goldRamp, prismWash, goldWash, Chip } from './collectCard'

export const FACES = ['stats', 'brand']
export const BACK_ROWS = 6          // the seasons drawn (the latest), as the old back did
const TOP = 60, HEAD = 150, FOOT = 88, MOMENT = 188, TITLE = 64, THEAD = 48, GAP = 14

/** The geometry numbers of the stats face, one place (the check reads them). */
export function backGeometry(b, tier) {
  const look = LOOK[tier]
  const bd = look.inset
  const IW = W - 2 * bd
  const IH = H - 2 * bd
  const shown = (b.rows || []).slice(-BACK_ROWS)
  const lines = shown.length + (b.career ? 1 : 0) + (b.playoffs ? 1 : 0)
  const bioChars = (b.bio || []).slice(0, 4).reduce((a, [k, v]) => a + Math.max(k.length, String(v).length * 1.15) + 3, 0)
  const BIO = (b.bio || []).length > 2 || bioChars > 52 ? 118 : 84
  const avail = IH - TOP - HEAD - BIO - MOMENT - FOOT - TITLE - THEAD - 4 * GAP - 40
  const rowH = Math.max(44, Math.min(76, Math.floor(avail / Math.max(1, lines || 1))))
  return { look, bd, IW, IH, shown, lines, BIO, rowH }
}

/** The tier's finish over the back: only on the frame and the edges (the back has no portrait), so foil never sits on the numbers. */
function BackFinish({ tier, bd, rnd, face }) {
  const layers = collectLayers(tier)
  if (!layers.length) return null
  const has = (n) => layers.includes(n)
  const wash = has('edge-wash') ? prismWash(0.12) : has('gold-wash') ? goldWash(1.5) : null
  const strip = (col) => alpha(col, has('edge-wash') ? 0.26 : 0.3)
  const L = has('edge-wash') ? PRISM.violet : FOIL.gold
  const R = has('edge-wash') ? PRISM.cyan : FOIL.gold
  return (
    <div style={abs({ left: 0, top: 0, width: W, height: H, borderRadius: LOOK[tier].radius, overflow: 'hidden' })}>
      {wash ? <div style={abs({ left: 0, top: 0, width: W, height: bd + TOP, background: wash })} /> : null}
      {wash ? <div style={abs({ left: 0, top: H - bd - FOOT, width: W, height: bd + FOOT, background: wash })} /> : null}
      {wash ? <div style={abs({ left: 0, top: bd + TOP, width: bd + 56, height: H - 2 * bd - TOP - FOOT, background: `linear-gradient(90deg, ${strip(L)} 0%, ${alpha(FOIL.void, 0)} 100%)` })} /> : null}
      {wash ? <div style={abs({ left: W - bd - 56, top: bd + TOP, width: bd + 56, height: H - 2 * bd - TOP - FOOT, background: `linear-gradient(270deg, ${strip(R)} 0%, ${alpha(FOIL.void, 0)} 100%)` })} /> : null}
      {tier === 'elite' ? <div style={abs({ left: -380, top: 10, width: 1800, height: 90, transform: 'rotate(-27deg)', background: bandOf(0.14) })} /> : null}
      {tier === 'star' ? <div style={abs({ left: -380, top: 40, width: 1800, height: 70, transform: 'rotate(-27deg)', background: bandOf(0.12) })} /> : null}
      {has('gold-dust') && face === 'brand' ? <GoldDust rnd={rnd} /> : null}
      {has('glint-frame') ? <Glint x={Math.round(bd / 2) + 8} y={Math.round(H * 0.07)} s={tier === 'legend' ? 70 : 56} a={0.9} /> : null}
      {has('corner-ornaments') ? [<Corner key="a" x={0} y={0} />, <Corner key="b" x={W - 200} y={0} flipX />, <Corner key="c" x={0} y={H - 200} flipY />, <Corner key="d" x={W - 200} y={H - 200} flipX flipY />] : null}
    </div>
  )
}

/** The printed area of either face: the field, the grain, the tier's pressed edge on BASE. `children` are drawn inside it. */
function Printed({ tier, grain, accent, tone, children }) {
  const { look, bd, IW, IH } = backGeometry({}, tier)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', position: 'absolute', left: bd, top: bd, width: IW, height: IH, borderRadius: look.radius - 20, overflow: 'hidden', background: field(accent, tone) }}>
      {grain ? <img src={grain} width={IW} height={IH} style={{ position: 'absolute', left: 0, top: 0, opacity: 0.9 }} /> : null}
      {children}
      {tier === 'base' ? <div style={abs({ left: 0, top: 0, width: IW, height: IH, borderRadius: look.radius - 20, border: `3px solid ${alpha(FOIL.void, 0.7)}` })} /> : null}
      {tier === 'base' ? <div style={abs({ left: 5, top: 5, width: IW - 10, height: IH - 10, borderRadius: look.radius - 24, border: `2px solid ${alpha(FOIL.paper, 0.4)}` })} /> : null}
    </div>
  )
}

/** The top bar and the foot, the same on both faces and on the front: the product, the rarity mark, the league; the real id and the issue number. */
const TopBar = ({ m, tier, accentText }) => (
  <div style={{ display: 'flex', alignItems: 'center', height: TOP, padding: '0 22px', gap: 16 }}>
    <span style={{ fontSize: fs(34), fontWeight: 800, letterSpacing: 8, color: accentText, whiteSpace: 'nowrap' }}>{m.brand.name}</span>
    <div style={{ display: 'flex', flexGrow: 1, height: 2, background: alpha(accentText, 0.5) }} />
    <TierMark tier={tier} />
    <span style={{ fontSize: fs(28), fontWeight: 800, letterSpacing: 3, color: INK2, whiteSpace: 'nowrap' }}>{String(m.sport).toUpperCase()}</span>
  </div>
)
const Foot = ({ m, c, left }) => (
  <div style={{ display: 'flex', flexDirection: 'column', height: FOOT, padding: '0 26px', justifyContent: 'center', gap: 6 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <span style={{ fontSize: fs(24), fontWeight: 800, color: INK2, letterSpacing: 2, whiteSpace: 'nowrap' }}>{left || `${m.brand.name} · DASH Network`}</span>
      <div style={{ display: 'flex', flexGrow: 1, height: 2, background: alpha(INK, 0.15) }} />
      <span style={{ fontSize: fs(24), fontWeight: 600, color: DIM, whiteSpace: 'nowrap' }}>{m.dayWord || ''}</span>
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <span style={{ fontSize: fs(22), fontWeight: 800, color: DIM, letterSpacing: 1.5, whiteSpace: 'nowrap' }}>{`ID ${c.cardId || 'NO ID'}`}</span>
      <div style={{ display: 'flex', flexGrow: 1, height: 2, background: alpha(INK, 0.1) }} />
      <span style={{ fontSize: fs(22), fontWeight: 800, color: DIM, letterSpacing: 1.5, whiteSpace: 'nowrap' }}>{c.issue === '' ? '' : `ISSUE NO. ${c.issue || 'PREVIEW'}`}</span>
    </div>
  </div>
)

// ── face 'stats' ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/**
 * @param m     the collect model (collectModel(...).model; m.collect = { cardId, issue, ... })
 * @param b     the sport adapter's back: { bio:[[label,value]], cols:[[head,weight,key]], rows:[{..}], career, playoffs, title, note, seasonsShown, source }
 */
function StatsFace({ m, b, tier, grain }) {
  const accent = SPORT_ACCENT[m.sport]
  const accentText = tier === 'legend' ? FOIL.goldHi : accent
  const c = m.collect || {}
  const g = backGeometry(b, tier)
  const { IW, shown, rowH, BIO } = g
  // a season word like 2023-24 needs about 1.6 units at 26 px: widen the first column so it never runs into the team
  const wide = (b.rows || []).some((r) => String(r.season || '').length > 5)
  const cols = (b.cols || []).map((col, i) => (i === 0 && wide ? [col[0], Math.max(col[1], 1.65), col[2]] : col))
  const tableW = IW - 2 * 24
  const cellW = tableW - 28
  const unit = cellW / Math.max(1, cols.reduce((a, x) => a + x[1], 0))
  const bodySize = cols.length > 10 ? 24 : 26
  const nameSize = fitName(m.name, 92, IW - 2 * 26 - 120)
  const cell = (col, v, i, kind) => (
    <div key={i} style={{ display: 'flex', width: Math.floor(col[1] * unit), justifyContent: i < 2 ? 'flex-start' : 'flex-end' }}>
      <span style={{ fontSize: fs(kind === 'head' ? 22 : bodySize), fontWeight: kind === 'row' || kind === 'alt' ? 600 : 800, color: kind === 'head' ? INK2 : INK, whiteSpace: 'nowrap' }}>{v}</span>
    </div>
  )
  const rule = tier === 'legend' ? goldRamp(90) : tier === 'elite' ? prismRamp(90) : tier === 'star' ? FOIL.silver : alpha(FOIL.paper, 0.55)
  const line = (r, key, kind) => (
    <div key={key} style={{ display: 'flex', alignItems: 'center', height: kind === 'head' ? THEAD : rowH, padding: '0 14px', background: kind === 'head' ? alpha(accentText, 0.18) : kind === 'tot' ? alpha(accentText, 0.14) : kind === 'po' ? alpha(accentText, 0.07) : kind === 'alt' ? alpha(INK, 0.05) : 'transparent', borderTop: kind === 'tot' ? `3px solid ${alpha(accentText, 0.7)}` : kind === 'po' ? `1px solid ${alpha(INK, 0.2)}` : 'none' }}>
      {cols.map((col, i) => cell(col, kind === 'head' ? col[0] : (r[col[2]] ?? ''), i, kind))}
    </div>
  )
  const range = b.range != null ? b.range : shown.length ? `${shown[0].season}${shown.length > 1 ? ` TO ${shown[shown.length - 1].season}` : ''}` : ''
  const club = [m.club || m.teamName, m.pos, m.number != null ? `#${m.number}` : null].filter((x) => x && x !== m.team).join('  ·  ')
  return (
    <Printed tier={tier} grain={grain} accent={accent} tone={m.tone}>
      <TopBar m={m} tier={tier} accentText={accentText} />
      <div style={{ display: 'flex', alignItems: 'center', height: HEAD, padding: '0 26px', gap: 22, borderTop: `2px solid ${alpha(accentText, 0.4)}`, background: `linear-gradient(90deg, ${alpha(FOIL.void, 0.9)} 0%, ${alpha(CHASSIS.bg, 0.6)} 100%)` }}>
        <Logo m={m} size={96} />
        <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, minWidth: 0 }}>
          <span style={{ fontFamily: DISPLAY, fontSize: nameSize, fontWeight: 900, lineHeight: 1.02, textTransform: 'uppercase', transform: 'skewX(-8deg)', whiteSpace: 'nowrap', color: tier === 'legend' ? FOIL.goldHi : INK }}>{m.name}</span>
          <span style={{ fontSize: fs(30), fontWeight: 800, color: INK2, marginTop: 6, whiteSpace: 'nowrap' }}>{[m.team, club].filter(Boolean).join('  ·  ')}</span>
        </div>
        {m.test ? <Chip text="TEST DATA" color={FOIL.gold} /> : null}
      </div>
      <div style={{ display: 'flex', height: 6, background: rule }} />
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', alignContent: 'center', padding: '0 26px', minHeight: BIO, height: BIO }}>
        {(b.bio || []).slice(0, 4).map(([k, v]) => (
          <div key={k} style={{ display: 'flex', flexDirection: 'column', width: (b.bio || []).length > 2 ? Math.floor((IW - 52) / 2) : 'auto', marginRight: (b.bio || []).length > 2 ? 0 : 30 }}>
            <span style={{ fontSize: fs(22), fontWeight: 800, color: DIM, letterSpacing: 2, whiteSpace: 'nowrap' }}>{k}</span>
            <span style={{ fontSize: fs(26), fontWeight: 800, color: INK, whiteSpace: 'nowrap' }}>{v}</span>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', margin: `0 24px`, overflow: 'hidden', ...panelStyle(tier, accent) }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: TITLE, padding: '0 22px', background: alpha(accentText, 0.22) }}>
          <span style={{ fontFamily: DISPLAY, fontSize: 40, fontWeight: 900, color: tier === 'legend' ? FOIL.goldHi : INK, letterSpacing: 1, transform: 'skewX(-8deg)' }}>{b.title || 'CAREER STATS'}</span>
          <span style={{ fontSize: fs(22), fontWeight: 700, color: INK2 }}>{range}</span>
        </div>
        {line(null, 'h', 'head')}
        {shown.length ? shown.map((r, i) => line(r, r.season, i % 2 ? 'alt' : 'row')) : (
          <div style={{ display: 'flex', height: rowH, alignItems: 'center', padding: '0 14px' }}><span style={{ fontSize: fs(26), fontWeight: 700, color: INK2 }}>No season rows on file for this player</span></div>
        )}
        {b.career ? line(b.career, 'career', 'tot') : null}
        {b.playoffs ? line(b.playoffs, 'po', 'po') : null}
      </div>
      <div style={{ display: 'flex', margin: '8px 28px 0 28px', minHeight: 30 }}>
        <span style={{ fontSize: fs(22), fontWeight: 600, color: DIM, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.note || ''}</span>
      </div>
      {/* the moment this card documents: the same words as the front's kicker and event line, the date, the game */}
      <div style={{ display: 'flex', flexGrow: 1, alignItems: 'center', padding: '0 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', width: '100%', height: MOMENT - 40, padding: '0 22px', gap: 20, background: alpha(accentText, 0.12), borderStyle: 'solid', borderWidth: '2px 2px 2px 8px', borderColor: `${alpha(accentText, 0.45)} ${alpha(accentText, 0.45)} ${alpha(accentText, 0.45)} ${accentText}` }}>
          {BANNER_ICON[m.sport] ? (() => { const BI = BANNER_ICON[m.sport]; return <BI size={52} color={accentText} /> })() : null}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: fs(22), fontWeight: 800, letterSpacing: 4, color: accentText, whiteSpace: 'nowrap' }}>THE MOMENT THIS CARD DOCUMENTS</span>
            <span style={{ fontFamily: DISPLAY, fontSize: 46, fontWeight: 900, lineHeight: 1.05, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{m.line || m.kicker}</span>
            <span style={{ fontSize: fs(26), fontWeight: 700, color: INK2, whiteSpace: 'nowrap' }}>{[m.kicker, m.dayWord].filter(Boolean).join('  ·  ')}</span>
          </div>
        </div>
      </div>
      <Foot m={m} c={c} />
    </Printed>
  )
}

// ── face 'brand' ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** The sports whose marks the back shows: the PUBLIC card sports only (lib/card/core CARD_SPORTS). BUCKETS is hidden and never drawn here. */
export const BRAND_SPORTS = CARD_SPORTS.slice()
const SPORT_WORD = { nfl: 'NFL', nhl: 'NHL', mlb: 'MLB' }
export const BRAND_LINE = 'REAL DATA. SHARPER INSIGHTS. SPORTS PREDICTIONS, BUILT FOR FANS WHO STUDY THE GAME.'

function BrandFace({ m, tier, grain }) {
  const accent = SPORT_ACCENT[m.sport]
  const accentText = tier === 'legend' ? FOIL.goldHi : accent
  const c = m.collect || {}
  const { IW, IH } = backGeometry({}, tier)
  const rnd = seeded(String(c.cardId || c.slotId || '1').replace(/^D[NS]-/, ''))
  // worn-stock scratches: seeded by the card id, so every card's back is its own
  const scratches = Array.from({ length: 22 }, (_, i) => ({ i, len: 200 + Math.round(rnd() * 520), x: Math.round(rnd() * (IW - 80)) - 100, y: Math.round(rnd() * IH), rot: -40 + Math.round(rnd() * 80), a: 0.04 + rnd() * 0.07 }))
  const mid = IH - TOP - FOOT
  return (
    <Printed tier={tier} grain={grain} accent={accent} tone={m.tone}>
      <div style={abs({ left: 0, top: 0, width: IW, height: IH, overflow: 'hidden' })}>
        {scratches.map((s) => <div key={s.i} style={abs({ left: s.x, top: s.y, width: s.len, height: 2, transform: `rotate(${s.rot}deg)`, background: `linear-gradient(90deg, ${alpha(INK, 0)}, ${alpha(INK, s.a)}, ${alpha(INK, 0)})` })} />)}
        <div style={abs({ left: 0, top: 0, width: IW, height: IH, background: `radial-gradient(circle at 50% 42%, ${alpha(accent, 0.2)} 0%, ${alpha(accent, 0.05)} 55%, ${alpha(CHASSIS.bg, 0)} 80%)` })} />
      </div>
      <TopBar m={m} tier={tier} accentText={accentText} />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: mid, padding: '0 40px', gap: 26 }}>
        <span style={{ fontSize: fs(34), fontWeight: 800, letterSpacing: 14, color: INK2, whiteSpace: 'nowrap' }}>DASH NETWORK</span>
        <span style={{ fontFamily: DISPLAY, fontSize: 196, fontWeight: 900, lineHeight: 1, textTransform: 'uppercase', transform: 'skewX(-10deg)', whiteSpace: 'nowrap', color: tier === 'legend' ? FOIL.goldHi : INK }}>CALLED IT</span>
        <div style={{ display: 'flex', width: 560, height: 3, background: tier === 'legend' ? goldRamp(90) : tier === 'elite' ? prismRamp(90) : alpha(accentText, 0.7) }} />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 640, textAlign: 'center' }}>
          <span style={{ fontSize: fs(28), fontWeight: 700, letterSpacing: 4, lineHeight: 1.6, color: INK2, textAlign: 'center' }}>{BRAND_LINE}</span>
        </div>
        <div style={{ display: 'flex', gap: 56, marginTop: 20 }}>
          {BRAND_SPORTS.filter((s) => BANNER_ICON[s]).map((s) => {
            const I = BANNER_ICON[s]
            return (
              <div key={s} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                <I size={84} color={SPORT_ACCENT[s]} />
                <span style={{ fontSize: fs(26), fontWeight: 800, letterSpacing: 4, color: s === m.sport ? INK : DIM, whiteSpace: 'nowrap' }}>{SPORT_WORD[s] || s.toUpperCase()}</span>
              </div>
            )
          })}
        </div>
      </div>
      <Foot m={m} c={c} left="DN · DASH Network" />
    </Printed>
  )
}

/** The design (1000 x 1400) of the back of a collectible card, as an element. face: 'stats' | 'brand'. `b` is the sport adapter's back (stats face only). */
export function collectBackDesign(m, b, grain, { tier = m.moment.tier, face = 'stats' } = {}) {
  const c = m.collect || {}
  const rnd = seeded(String(c.slotId || c.cardId || m.playerId || '1').replace(/^D[NS]-/, ''))
  const { bd } = backGeometry({}, tier)
  return (
    <div style={{ width: W, height: H, display: 'flex', position: 'relative', background: 'transparent', color: INK, fontFamily: 'Inter' }}>
      {collectStock(tier, grain, rnd)}
      {face === 'brand' ? <BrandFace m={m} tier={tier} grain={grain} /> : <StatsFace m={m} b={b || { cols: [], rows: [] }} tier={tier} grain={grain} />}
      <BackFinish tier={tier} bd={bd} rnd={rnd} face={face} />
    </div>
  )
}

/** PNG bytes of the back at `width` px (5:7; the design size by default). */
export async function renderCollectBack(m, b, { width, tier, face = 'stats' } = {}) {
  const { grain, fonts } = await assets()
  initMetrics(fonts)
  const t = TIERS.includes(tier) ? tier : m.moment.tier
  const f = FACES.includes(face) ? face : 'stats'
  LINT.push(...lintType(collectBackDesign(m, b, grain, { tier: t, face: f })).map((x) => ({ ...x, card: 'collect-back' })))
  const full = Buffer.from(await new ImageResponse(collectBackDesign(m, b, grain, { tier: t, face: f }), { width: W, height: H, fonts }).arrayBuffer())
  const w = Math.max(250, Math.min(W, Math.round(Number(width) || W)))
  if (w >= W) return full
  const sharp = (await import('sharp')).default
  return sharp(full).resize(w, Math.round((w * H) / W), { kernel: 'lanczos3' }).png().toBuffer()
}
