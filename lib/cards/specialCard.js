// THE SPECIAL CARD (server only, JSX). A "moment" card (lib/cards/moments.js): a goal, a hat trick, a multi-homer game, a 100-yard game, a
// called pick that cashed at a long price. The SAME frame and type as the player front (lib/cards/playerCard.js): dark ground, the sport's
// accent in a thin frame, the status bar on top, the portrait over a faded club-logo watermark with a hero number box (where the front draws
// the board score), the oversized italic display name, the club and the matchup, tiles, a banner, the footer. Everything comes from one
// special MODEL (lib/cards/specialData.js buildSpecialModel); nothing here names a sport or invents a number.
//
// THE HOLO. A holo card is the same card drawn through a foil, with NO css effects and no extra fonts: (1) the thin accent frame becomes a
// gradient ring of the HOLO hues (lib/cards/assets.js HOLO) around an inset copy of the card; (2) a foil strip across the top; (3) a low-opacity
// rainbow wash across the whole face; (4) three diagonal sheen bands (rotated, white gradient) and a few four-point glints; (5) the card
// grain (loadGrain) laid a second time, larger and offset, as the sparkle. Every layer is a plain absolutely placed div or img with a
// linear / radial gradient: satori draws them, no blend modes. A holo is a RARITY (an ELITE or LEGEND moment), never a result.
// A STAR card SHIMMERS (a quieter foil: a thin silver strip, ONE soft sheen band and a faint sparkle of grain: no rainbow wash, no glints, the thin
// accent frame stays). Foil never changes a word on the card.
import { Frame, assets, renderPng, sizeOf, fs, fitName, field, alpha, Face, Logo, Target, DISPLAY, INK, INK2, DIM, RULE, CHASSIS } from './cardKit'
import { HOLO } from './assets'
import { SPORT_ACCENT } from '../sportAccent'
import { STATUS_WORD } from '../callStatus'
import { TIER_WORD } from './moments'
import { StampStrip } from './stampStrip'
import { initMetrics } from './fit'

const MAX_TILES = 6

// ── the holo layers (pure gradient strings; the hues are HOLO's) ────────────
const H = HOLO
export const ringOf = (tier) => (tier === 'legend'
  ? `linear-gradient(135deg, ${H.gold} 0%, ${H.white} 14%, ${H.rose} 28%, ${H.gold} 42%, ${H.cyan} 58%, ${H.violet} 72%, ${H.gold} 86%, ${H.white} 100%)`
  : `linear-gradient(135deg, ${H.cyan} 0%, ${H.blue} 14%, ${H.violet} 28%, ${H.rose} 42%, ${H.gold} 56%, ${H.lime} 70%, ${H.mint} 84%, ${H.cyan} 100%)`)
export const stripOf = (tier) => (tier === 'legend'
  ? `linear-gradient(90deg, ${H.gold} 0%, ${H.white} 12%, ${H.rose} 26%, ${H.gold} 40%, ${H.cyan} 56%, ${H.violet} 70%, ${H.gold} 84%, ${H.white} 100%)`
  : `linear-gradient(90deg, ${H.cyan} 0%, ${H.blue} 16%, ${H.violet} 32%, ${H.rose} 48%, ${H.gold} 64%, ${H.lime} 80%, ${H.mint} 100%)`)
export const washOf = (k) => `linear-gradient(115deg, ${alpha(H.cyan, 0)} 0%, ${alpha(H.cyan, 0.16 * k)} 14%, ${alpha(H.violet, 0.14 * k)} 28%, ${alpha(H.rose, 0.16 * k)} 42%, ${alpha(H.gold, 0.14 * k)} 56%, ${alpha(H.lime, 0.12 * k)} 70%, ${alpha(H.mint, 0.16 * k)} 84%, ${alpha(H.blue, 0)} 100%)`
export const bandOf = (a) => `linear-gradient(180deg, ${alpha(H.white, 0)} 0%, ${alpha(H.white, a)} 50%, ${alpha(H.white, 0)} 100%)`

/** A four-point glint centred on (x, y): two thin white bars crossed, a soft dot in the middle. */
export function Glint({ x, y, s, a = 0.9 }) {
  return (
    <div style={{ display: 'flex', position: 'absolute', left: x - s / 2, top: y - s / 2, width: s, height: s, alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ display: 'flex', position: 'absolute', width: s, height: 4, background: `linear-gradient(90deg, ${alpha(H.white, 0)}, ${alpha(H.white, a)}, ${alpha(H.white, 0)})` }} />
      <div style={{ display: 'flex', position: 'absolute', width: 4, height: s, background: `linear-gradient(180deg, ${alpha(H.white, 0)}, ${alpha(H.white, a)}, ${alpha(H.white, 0)})` }} />
      <div style={{ display: 'flex', position: 'absolute', width: s * 0.42, height: s * 0.42, borderRadius: s, background: `radial-gradient(circle, ${alpha(H.white, a)} 0%, ${alpha(H.white, 0)} 70%)` }} />
    </div>
  )
}

/** THE SHIMMER (a STAR card): one soft sheen band and a faint sparkle of the grain, over the face. Quiet: no wash, no glints. */
function ShimmerFoil({ w, h, grain }) {
  return (
    <div style={{ display: 'flex', position: 'absolute', left: 0, top: 0, width: w, height: h, overflow: 'hidden' }}>
      <div style={{ display: 'flex', position: 'absolute', left: -380, top: 330, width: 1800, height: 150, transform: 'rotate(-27deg)', background: bandOf(0.1) }} />
      {grain ? <img src={grain} width={Math.round(w * 1.5)} height={Math.round(h * 1.5)} style={{ position: 'absolute', left: -Math.round(w * 0.25), top: -Math.round(h * 0.2), opacity: 0.14 }} /> : null}
    </div>
  )
}
export const shimmerStrip = `linear-gradient(90deg, ${alpha(H.white, 0.2)} 0%, ${alpha(H.cyan, 0.75)} 22%, ${alpha(H.white, 0.95)} 46%, ${alpha(H.blue, 0.7)} 70%, ${alpha(H.white, 0.25)} 100%)`

/** The foil laid over the card face: wash, three sheen bands, the sparkle grain, the glints. `w` x `h` is the face. Drawn LAST, low opacity. */
function HoloFoil({ w, h, tier, grain }) {
  const k = tier === 'legend' ? 1.35 : 1
  return (
    <div style={{ display: 'flex', position: 'absolute', left: 0, top: 0, width: w, height: h, overflow: 'hidden' }}>
      <div style={{ display: 'flex', position: 'absolute', left: 0, top: 0, width: w, height: h, background: washOf(k) }} />
      <div style={{ display: 'flex', position: 'absolute', left: -380, top: 150, width: 1800, height: 170, transform: 'rotate(-27deg)', background: bandOf(0.16 * k) }} />
      <div style={{ display: 'flex', position: 'absolute', left: -380, top: 470, width: 1800, height: 70, transform: 'rotate(-27deg)', background: bandOf(0.14 * k) }} />
      <div style={{ display: 'flex', position: 'absolute', left: -380, top: 780, width: 1800, height: 260, transform: 'rotate(-27deg)', background: bandOf(0.08 * k) }} />
      {grain ? <img src={grain} width={Math.round(w * 1.5)} height={Math.round(h * 1.5)} style={{ position: 'absolute', left: -Math.round(w * 0.25), top: -Math.round(h * 0.2), opacity: 0.32 * k }} /> : null}
      <Glint x={Math.round(w * 0.16)} y={Math.round(h * 0.2)} s={74} />
      <Glint x={Math.round(w * 0.86)} y={Math.round(h * 0.34)} s={58} a={0.75} />
      <Glint x={Math.round(w * 0.7)} y={Math.round(h * 0.07)} s={40} a={0.7} />
      <Glint x={Math.round(w * 0.9)} y={Math.round(h * 0.5)} s={44} a={0.6} />
    </div>
  )
}

// ── tiles ───────────────────────────────────────────────────────────────────
function Tile({ s, w }) {
  const text = `${s.value}${s.unit ? ` ${s.unit}` : ''}`
  const big = text.length >= 8 ? 56 : text.length >= 6 ? 64 : 74
  const room = w - 44
  const small = s.small ? Math.max(24, Math.min(40, Math.floor(room / (String(s.value).length * 0.76)))) : 0
  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: w, height: 160, padding: '0 22px', borderLeft: `2px solid ${alpha(INK, 0.12)}`, justifyContent: 'center' }}>
      <span style={{ fontSize: fs(22), fontWeight: 800, color: DIM, letterSpacing: 0.4, whiteSpace: 'nowrap' }}>{s.label}</span>
      <div style={{ display: 'flex', alignItems: 'center', height: 78, marginTop: 2 }}>
        {small ? (
          <span style={{ fontSize: small, fontWeight: 800, lineHeight: 1.1, whiteSpace: 'nowrap' }}>{s.value}</span>
        ) : (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontFamily: DISPLAY, fontSize: big, fontWeight: 900, lineHeight: 1, whiteSpace: 'nowrap' }}>{s.value}</span>
            {s.unit ? <span style={{ fontSize: fs(22), fontWeight: 700, color: DIM, whiteSpace: 'nowrap' }}>{s.unit}</span> : null}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', marginTop: 8, height: 28, alignItems: 'center' }}>
        {s.sub ? <span style={{ fontSize: fs(22), fontWeight: 600, color: INK2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: room }}>{s.sub}</span> : null}
      </div>
    </div>
  )
}

/** The design (1080 x 1350) of a special card, as an element. Exported for the type lint and the tests. */
export function specialDesign(m, grain) {
  const accent = SPORT_ACCENT[m.sport]
  const tier = m.moment.tier
  const holo = Boolean(m.moment.holo)
  const shimmer = Boolean(m.moment.shimmer) && !holo
  const status = m.status === 'called' || m.status === 'board' ? m.status : null
  const called = status === 'called'
  const tiles = (m.tiles || []).slice(0, MAX_TILES)
  const cols = tiles.length > 4 ? 3 : tiles.length === 3 && tiles.every((t) => String(t.sub || '').length <= 18 && !t.small) ? 3 : 2
  const rows = Math.ceil(tiles.length / cols) || 0
  const BW = holo ? 1014 : 1022
  const BH = holo ? 1284 : 1292
  const inner = BW - 2 * 34
  const tileW = Math.floor(inner / cols)
  const FIXED = 62 + 150 + 70 + 24 + rows * 160 + (rows ? 44 : 0) + 112 + 64 + 40
  const portraitH = Math.max(380, BH - FIXED)
  const nameSize = fitName(m.name, 150, inner - 70)
  const tag = (t, strong) => (
    <span key={t} style={{ fontSize: fs(24), fontWeight: 800, letterSpacing: 1, color: INK, background: alpha(CHASSIS.bg, 0.7), borderStyle: 'solid', borderWidth: '2px 2px 2px 6px', borderColor: `${alpha(INK, 0.22)} ${alpha(INK, 0.22)} ${alpha(INK, 0.22)} ${strong ? accent : alpha(INK, 0.4)}`, padding: '6px 16px', alignSelf: 'flex-start', whiteSpace: 'nowrap' }}>{t}</span>
  )
  const kick = String(m.kicker || '')
  const body = (
    <div style={{ display: 'flex', flexDirection: 'column', width: BW, height: BH, overflow: 'hidden', borderRadius: holo ? 16 : 0, background: holo ? field(accent, m.tone) : 'transparent', position: 'relative' }}>
      {holo ? <div style={{ display: 'flex', height: 10, background: stripOf(tier) }} /> : shimmer ? <div style={{ display: 'flex', height: 10, background: shimmerStrip }} /> : <div style={{ display: 'flex', height: 10 }} />}
      <div style={{ display: 'flex', alignItems: 'center', height: 52, padding: '0 8px', gap: 22 }}>
        <span style={{ fontSize: fs(34), fontWeight: 800, letterSpacing: kick.length > 16 ? 5 : 9, color: accent, whiteSpace: 'nowrap' }}>{kick}</span>
        <div style={{ display: 'flex', flexGrow: 1, height: 2, background: alpha(accent, 0.5) }} />
        <span style={{ fontSize: fs(28), fontWeight: 800, letterSpacing: 3, color: INK2, whiteSpace: 'nowrap' }}>{`${TIER_WORD[tier]}${holo ? ' · HOLO' : shimmer ? ' · SHIMMER' : ''}`}</span>
      </div>
      <div style={{ display: 'flex', position: 'relative', width: BW - 6, height: portraitH, overflow: 'hidden', borderBottom: `2px solid ${alpha(accent, 0.45)}`, background: `radial-gradient(circle at 50% 42%, ${alpha(m.tone || accent, 0.42)} 0%, ${alpha(accent, 0.08)} 64%, ${alpha(CHASSIS.bg, 0.3)} 100%)` }}>
        {m.logo ? <div style={{ display: 'flex', position: 'absolute', right: -90, top: Math.round(portraitH * 0.1), opacity: 0.16 }}><Logo m={m} size={Math.round(portraitH * 0.95)} /></div> : null}
        <div style={{ display: 'flex', position: 'absolute', left: Math.round((BW - 6 - portraitH) / 2), bottom: 0 }}><Face m={m} w={portraitH} h={portraitH} accent={accent} /></div>
        <div style={{ display: 'flex', flexDirection: 'column', position: 'absolute', left: 26, top: 20, gap: 8 }}>
          {[m.tag ? tag(m.tag, true) : null, m.test ? tag('TEST DATA', false) : null].filter(Boolean)}
        </div>
        <StampStrip stamps={m.stamps} accent={accent} maxW={BW - 6 - 52} />
        {m.hero ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'absolute', right: 26, top: 20, padding: '10px 26px 6px 26px', background: alpha(CHASSIS.bg, 0.72), border: `2px solid ${alpha(accent, 0.6)}` }}>
            <span style={{ fontSize: fs(22), fontWeight: 800, letterSpacing: 4, color: INK2, whiteSpace: 'nowrap' }}>{m.hero.word}</span>
            <span style={{ fontFamily: DISPLAY, fontSize: m.hero.value.length > 5 ? 76 : 92, fontWeight: 900, lineHeight: 1, color: accent, transform: 'skewX(-8deg)', whiteSpace: 'nowrap' }}>{m.hero.value}</span>
          </div>
        ) : null}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', padding: '10px 34px 0 28px' }}>
        <span style={{ fontFamily: DISPLAY, fontSize: nameSize, fontWeight: 900, lineHeight: 1.02, textTransform: 'uppercase', transform: 'skewX(-8deg)', letterSpacing: -0.5, whiteSpace: 'nowrap', height: 150, alignItems: 'center', display: 'flex' }}>{m.name}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, height: 70 }}>
          <Logo m={m} size={52} />
          <span style={{ fontSize: fs(40), fontWeight: 800, whiteSpace: 'nowrap' }}>{m.home == null ? `${m.team} · ${m.opp}` : `${m.team} ${m.home ? 'vs' : '@'} ${m.opp}`}</span>
          <span style={{ fontSize: fs(28), fontWeight: 600, color: DIM, whiteSpace: 'nowrap' }}>{[m.club || m.teamName, m.pos, m.number != null ? `#${m.number}` : null].filter((x) => x && x !== m.team).join('  ·  ')}</span>
        </div>
      </div>
      <div style={{ display: 'flex', height: 2, margin: '0 28px', background: RULE }} />
      {rows ? (
        <div style={{ display: 'flex', flexDirection: 'column', margin: '12px 28px 0 6px' }}>
          {Array.from({ length: rows }, (_, r) => (
            <div key={r} style={{ display: 'flex' }}>
              {tiles.slice(r * cols, r * cols + cols).map((s) => <Tile key={s.label} s={s} w={tileW} />)}
            </div>
          ))}
        </div>
      ) : null}
      {rows ? <span style={{ fontSize: fs(22), fontWeight: 600, color: DIM, padding: '8px 34px 0 28px', whiteSpace: 'nowrap', height: 44 }}>{m.note || ''}</span> : null}
      <div style={{ display: 'flex', flexGrow: 1, alignItems: 'center', padding: '0 28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', height: 104, padding: '0 24px 0 22px', background: called ? `linear-gradient(90deg, ${alpha(accent, 0.2)} 0%, ${alpha(accent, 0.04)} 100%)` : alpha(INK, 0.05), borderStyle: 'solid', borderWidth: '2px 2px 2px 8px', borderColor: `${alpha(called ? accent : INK, called ? 0.4 : 0.14)} ${alpha(called ? accent : INK, called ? 0.4 : 0.14)} ${alpha(called ? accent : INK, called ? 0.4 : 0.14)} ${called ? accent : alpha(INK, 0.35)}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
            <Target size={56} color={called ? accent : INK2} />
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {status ? <span style={{ fontSize: fs(24), fontWeight: 800, letterSpacing: 5, color: called ? accent : INK2 }}>{STATUS_WORD[status]}</span> : null}
              <span style={{ fontFamily: DISPLAY, fontSize: 50, fontWeight: 900, lineHeight: 1.05, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{status && m.callLine ? m.callLine : m.line}</span>
            </div>
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 64, padding: '0 28px', gap: 20 }}>
        <span style={{ fontSize: fs(24), fontWeight: 800, color: INK2, letterSpacing: 2, whiteSpace: 'nowrap' }}>{`${m.brand.name} · DASH Network`}</span>
        <div style={{ display: 'flex', flexGrow: 1, height: 2, background: RULE }} />
        <span style={{ fontSize: fs(24), fontWeight: 600, color: DIM, whiteSpace: 'nowrap' }}>{m.dayWord || ''}</span>
      </div>
      {holo ? <HoloFoil w={BW} h={BH} tier={tier} grain={grain} /> : shimmer ? <ShimmerFoil w={BW} h={BH} grain={grain} /> : null}
    </div>
  )
  return (
    <Frame accent={accent} tone={m.tone} grain={grain}>
      {holo ? (
        <div style={{ display: 'flex', position: 'absolute', left: 26, top: 26, width: 1028, height: 1298, borderRadius: 22, background: ringOf(tier), alignItems: 'center', justifyContent: 'center' }}>{body}</div>
      ) : (
        <div style={{ display: 'flex', position: 'absolute', left: 26, top: 26, width: 1028, height: 1298, border: `3px solid ${alpha(accent, 0.55)}`, borderRadius: 22, flexDirection: 'column', overflow: 'hidden' }}>{body}</div>
      )}
    </Frame>
  )
}

/** PNG bytes of a special card at `width` px (4:5; the design size by default). */
export async function renderSpecial(m, { width } = {}) {
  const { grain, fonts } = await assets()
  initMetrics(fonts)
  const size = sizeOf(width)
  return renderPng(specialDesign(m, grain), size, { card: 'special', design: specialDesign(m, grain) })
}
