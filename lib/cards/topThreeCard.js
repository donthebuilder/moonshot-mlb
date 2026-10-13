// THE TOP THREE CARD (server only, JSX). The picture of the night's digest (lib/posts/digestPost.js): "TOP 3 TONIGHT" in the baseball-card look of the special
// card (lib/cards/specialCard.js): the same frame and type, the sport's accent in a thin outer frame, and ONE TILE PER MAN (rank, face, name in the display
// italic, club and matchup, the moment's own line 'HAT TRICK · 3 G' / '151 RUSH YDS' / 'OT GOAL', the tier word). The tile wears its rarity the way the
// special card does and nowhere else changes a word: LEGEND / ELITE = the holo ring + foil strip + rainbow wash + sheen + a glint; STAR = the quiet shimmer
// (silver strip + one sheen band). Foil is a RARITY, never a result.
//
// SIZE: designed once at 1080 x 1350 (the 4:5 phone feed, lib/cards/cardKit.js BASE) and scaled by renderPng like every other card. Every text node is at least
// 22px at that size (cardKit lintType re-checks it). A name or the moment's line is MEASURED with the real font files (lib/cards/fit.js fitLine) and stepped down
// until it fits its box (the italic slant is reserved); only a name that does not fit even at 40px is cut with an ellipsis. tileLayout() is that decision, pure
// once the fonts are read, so scripts/check-top-three-card.mjs can re-measure every tile it draws.
//
// ONE, TWO OR THREE tiles: a night with fewer than three names draws fewer tiles of the same face size, centred (the title says TOP 2 / TOP PERFORMER). Nothing is invented to fill the space.
//
// A TILE (plain data, built by lib/cards/topThreeData.js): { name, team, opp, home, club, face, logo, logoPlate, tone, tier, holo, shimmer, line, tag? } (`tag` replaces
// the tier word, e.g. 'ALDS' on a postseason tile, where the tier means nothing).
// THE MODEL: { sport, title, dayWord, brand:{ name }, tiles:[...], test }.
import { Frame, assets, renderPng, sizeOf, fs, field, alpha, Face, Logo, DISPLAY, INK, INK2, DIM, RULE, CHASSIS } from './cardKit'
import { SPORT_ACCENT } from '../sportAccent'
import { TIER_WORD } from './moments'
import { initMetrics, fitLine, ellipsize } from './fit'
import { ringOf, stripOf, washOf, bandOf, shimmerStrip, Glint } from './specialCard'

const OUTER = { x: 26, y: 26, w: 1028, h: 1298 }
const TILE_W = 960
const HEAD_H = 118
const FOOT_H = 56
const GAP = 12
/** Three tiles fill the frame; one or two keep a 400px tile (the face stays a face, the text column keeps its width) and sit centred between the header and the footer. */
export const tileHeight = (n) => (n >= 3 ? Math.floor((OUTER.h - 6 - HEAD_H - FOOT_H - 12 - GAP * 2) / 3) : 400)

const SLANT = 0.17          // skewX(-8deg) leans a glyph by tan(8deg) of its height: the box reserves it
const NAME_SIZES = [86, 78, 70, 62, 56, 50, 44, 40]
const LINE_SIZES = [66, 60, 54, 48, 44, 40, 36, 32]

/** The sizes and texts of one tile, from the real font metrics (call initMetrics first). Pure. `h` = the tile height. */
export function tileLayout(t, h) {
  const holo = Boolean(t.holo)
  const bw = holo ? TILE_W - 8 : TILE_W - 6
  const bh = holo ? h - 8 : h - 6
  const face = bh - 56
  const rightW = bw - 56 - face - 30
  const nameBox = rightW - 12
  const nameFont = { family: 'Shoulders', weight: 900, upper: true }
  let nf = null
  // the slant is part of the width: step down until the leaning word fits too
  for (const size of NAME_SIZES) { nf = fitLine(t.name, { sizes: [size], maxW: nameBox - Math.round(size * SLANT), quiet: true, ...nameFont }); if (nf.fits) break }
  const nameText = nf.fits ? t.name : ellipsize(String(t.name).toUpperCase(), { size: 40, maxW: nameBox - Math.round(40 * SLANT), ...nameFont })
  const lineBox = rightW - 36 - 14
  let lf = null
  for (const size of LINE_SIZES) { lf = fitLine(t.line, { sizes: [size], maxW: lineBox, quiet: true, family: 'Shoulders', weight: 900, upper: true }); if (lf.fits) break }
  const matchup = t.opp ? (t.home == null ? `${t.team} · ${t.opp}` : `${t.team} ${t.home ? 'vs' : '@'} ${t.opp}`) : t.team
  const mBox = rightW - 46 - 14
  return {
    bw, bh, face, rightW, nameBox, lineBox, mBox,
    name: { text: nameText, size: nf.fits ? nf.size : 40, w: nf.w },
    line: { text: t.line, size: lf.size, w: lf.w, fits: lf.fits },
    matchup: { text: ellipsize(matchup, { size: 34, maxW: mBox, family: 'Inter', weight: 800 }), full: matchup },
  }
}

/** One man's tile. `h` is the tile height; the face is a square that fills it. */
function Tile({ t, i, h, accent }) {
  const holo = Boolean(t.holo)
  const shimmer = !holo && Boolean(t.shimmer)
  const L = tileLayout(t, h)
  const { bw, bh, face, rightW } = L
  const body = (
    <div style={{ display: 'flex', position: 'relative', width: bw, height: bh, overflow: 'hidden', borderRadius: holo ? 14 : 16, background: holo ? field(accent, t.tone) : alpha(INK, 0.045), padding: '28px', gap: 30 }}>
      {holo ? <div style={{ display: 'flex', position: 'absolute', left: 0, top: 0, width: bw, height: 8, background: stripOf(t.tier) }} /> : shimmer ? <div style={{ display: 'flex', position: 'absolute', left: 0, top: 0, width: bw, height: 8, background: shimmerStrip }} /> : null}
      <div style={{ display: 'flex', position: 'relative', width: face, height: face, overflow: 'hidden', borderRadius: 12, background: `radial-gradient(circle at 50% 42%, ${alpha(t.tone || accent, 0.42)} 0%, ${alpha(accent, 0.08)} 70%, ${alpha(CHASSIS.bg, 0.3)} 100%)`, border: `2px solid ${alpha(accent, 0.45)}` }}>
        <Face m={t} w={face} h={face} accent={accent} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', width: rightW, height: face }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 96 }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: fs(26), fontWeight: 800, letterSpacing: 3, color: INK2, whiteSpace: 'nowrap' }}>{t.tag ? t.tag : `${TIER_WORD[t.tier]}${holo ? ' · HOLO' : shimmer ? ' · SHIMMER' : ''}`}</span>
            <span style={{ fontSize: fs(22), fontWeight: 700, color: DIM, whiteSpace: 'nowrap' }}>{t.club && t.club !== t.team ? t.club : ''}</span>
          </div>
          <span style={{ fontFamily: DISPLAY, fontSize: 104, fontWeight: 900, lineHeight: 1, color: accent, transform: 'skewX(-8deg)', whiteSpace: 'nowrap' }}>{`#${i + 1}`}</span>
        </div>
        <span style={{ fontFamily: DISPLAY, fontSize: L.name.size, fontWeight: 900, lineHeight: 1.02, textTransform: 'uppercase', transform: 'skewX(-8deg)', whiteSpace: 'nowrap', display: 'flex', height: 100, alignItems: 'center' }}>{L.name.text}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, height: 54 }}>
          <Logo m={t} size={46} />
          <span style={{ fontSize: fs(34), fontWeight: 800, whiteSpace: 'nowrap' }}>{L.matchup.text}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', height: 76, padding: '0 18px', background: alpha(accent, 0.12), borderStyle: 'solid', borderWidth: '2px 2px 2px 8px', borderColor: `${alpha(accent, 0.4)} ${alpha(accent, 0.4)} ${alpha(accent, 0.4)} ${accent}` }}>
          <span style={{ fontFamily: DISPLAY, fontSize: L.line.size, fontWeight: 900, lineHeight: 1, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{t.line}</span>
        </div>
      </div>
      {holo ? (
        <div style={{ display: 'flex', position: 'absolute', left: 0, top: 0, width: bw, height: bh, overflow: 'hidden' }}>
          <div style={{ display: 'flex', position: 'absolute', left: 0, top: 0, width: bw, height: bh, background: washOf(t.tier === 'legend' ? 1.35 : 1) }} />
          <div style={{ display: 'flex', position: 'absolute', left: -200, top: Math.round(bh * 0.28), width: 1500, height: 90, transform: 'rotate(-14deg)', background: bandOf(0.16) }} />
          <Glint x={Math.round(bw * 0.9)} y={Math.round(bh * 0.2)} s={56} a={0.8} />
        </div>
      ) : shimmer ? (
        <div style={{ display: 'flex', position: 'absolute', left: 0, top: 0, width: bw, height: bh, overflow: 'hidden' }}>
          <div style={{ display: 'flex', position: 'absolute', left: -200, top: Math.round(bh * 0.4), width: 1500, height: 80, transform: 'rotate(-14deg)', background: bandOf(0.1) }} />
        </div>
      ) : null}
    </div>
  )
  return holo
    ? <div style={{ display: 'flex', width: TILE_W, height: h, borderRadius: 18, background: ringOf(t.tier), alignItems: 'center', justifyContent: 'center' }}>{body}</div>
    : <div style={{ display: 'flex', width: TILE_W, height: h, borderRadius: 18, border: `3px solid ${alpha(accent, 0.5)}`, overflow: 'hidden' }}>{body}</div>
}

/** The design (1080 x 1350) of a top-three card, as an element. Exported for the type lint and the tests. */
export function topThreeDesign(m, grain) {
  const accent = SPORT_ACCENT[m.sport]
  const tiles = (m.tiles || []).slice(0, 3)
  const h = tileHeight(Math.max(1, tiles.length))
  const titleSize = Math.max(54, Math.min(92, Math.floor((OUTER.w - 80 - 300) / (String(m.title || '').length * 0.46))))
  return (
    <Frame accent={accent} tone={m.tone} grain={grain}>
      <div style={{ display: 'flex', flexDirection: 'column', position: 'absolute', left: OUTER.x, top: OUTER.y, width: OUTER.w, height: OUTER.h, border: `3px solid ${alpha(accent, 0.55)}`, borderRadius: 22, overflow: 'hidden', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: TILE_W, height: HEAD_H, gap: 20 }}>
          <span style={{ fontFamily: DISPLAY, fontSize: titleSize, fontWeight: 900, lineHeight: 1, color: accent, transform: 'skewX(-8deg)', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{m.title}</span>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <span style={{ fontSize: fs(32), fontWeight: 800, letterSpacing: 4, color: INK, whiteSpace: 'nowrap' }}>{m.brand?.league || ''}</span>
            <span style={{ fontSize: fs(26), fontWeight: 700, color: DIM, whiteSpace: 'nowrap' }}>{m.dayWord || ''}</span>
          </div>
        </div>
        <div style={{ display: 'flex', width: TILE_W, height: 2, background: alpha(accent, 0.5), marginBottom: 12 }} />
        <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, justifyContent: 'center', gap: GAP }}>
          {tiles.map((t, i) => <Tile key={`${t.name}${i}`} t={t} i={i} h={h} accent={accent} />)}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: TILE_W, height: FOOT_H, gap: 20 }}>
          <span style={{ fontSize: fs(24), fontWeight: 800, color: INK2, letterSpacing: 2, whiteSpace: 'nowrap' }}>{`${m.brand?.name || ''} · DASH Network`}</span>
          <div style={{ display: 'flex', flexGrow: 1, height: 2, background: RULE }} />
          <span style={{ fontSize: fs(24), fontWeight: 600, color: DIM, whiteSpace: 'nowrap' }}>{m.test ? 'TEST DATA' : m.note || ''}</span>
        </div>
      </div>
    </Frame>
  )
}

/** PNG bytes of a top-three card at `width` px (4:5; the design size by default). */
export async function renderTopThree(m, { width } = {}) {
  const { grain, fonts } = await assets()
  initMetrics(fonts)
  const size = sizeOf(width)
  return renderPng(topThreeDesign(m, grain), size, { card: 'topthree', design: topThreeDesign(m, grain) })
}
