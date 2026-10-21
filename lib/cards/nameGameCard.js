// THE NAME GAME: SAME NAME, TWO LEAGUES (server only, JSX). 1080 x 1350, drawn FROM the cards we post: cardKit's Frame (field + grain), Face, Logo,
// the display italic; the special card's foil ring on the two hero panels. DASH orange (a network card); each side wears its own sport's accent.
// Donovan, 2026-10-21: the rosters are all updated, the teams league wide are interesting; names, repeating names, jersey numbers across all
// sports, not grouped in one. FOR FUN: a roster fact, never a pick, never in a score.
//
// `pair` = the hero: [a, b], each { sport, league, club, name, number, pos, face, logo }. `rows` = more names in two leagues, each
// { name, sides: [{ sport, league, number, logo, club }, ...] }. `head`, `sub`, `pool` (players read), `asOf`, `source`.
import { Frame, Face, Logo, assets, renderPng, fs, field, alpha, DISPLAY, INK, INK2, DIM, RULE, CHASSIS } from './cardKit'
import { ringOf, shimmerStrip, bandOf, Glint } from './specialCard'
import { SPORT_ACCENT } from '../sportAccent'
import { C } from '../theme'

const ACCENT = C.orange
const MAX_ROWS = 5

function Hero({ p, w, h }) {
  const acc = SPORT_ACCENT[p.sport] || ACCENT
  return (
    <div style={{ display: 'flex', width: w, height: h, borderRadius: 18, background: ringOf('elite'), alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ display: 'flex', flexDirection: 'column', position: 'relative', width: w - 8, height: h - 8, borderRadius: 14, overflow: 'hidden', background: field(acc), alignItems: 'center' }}>
        <div style={{ display: 'flex', width: '100%', height: 8, background: acc }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '14px 22px 0 22px' }}>
          <span style={{ fontSize: fs(26), fontWeight: 800, letterSpacing: 5, color: acc }}>{p.league}</span>
          <span style={{ fontSize: fs(24), fontWeight: 800, letterSpacing: 2, color: INK2, whiteSpace: 'nowrap' }}>{String(p.club || '').toUpperCase()}</span>
        </div>
        <div style={{ display: 'flex', position: 'relative', marginTop: 10, width: 330, height: 240 }}>
          <Face m={{ face: p.face, name: p.name }} w={330} h={240} accent={acc} radius={12} />
          <div style={{ display: 'flex', position: 'absolute', right: -14, bottom: -14 }}><Logo m={{ team: p.club, logo: p.logo, logoPlate: true }} size={84} /></div>
        </div>
        <span style={{ fontFamily: DISPLAY, fontSize: 150, fontWeight: 900, lineHeight: 0.95, marginTop: 14, color: INK, transform: 'skewX(-8deg)' }}>{`#${p.number}`}</span>
        <span style={{ fontFamily: DISPLAY, fontSize: 46, fontWeight: 900, lineHeight: 1.05, color: INK, transform: 'skewX(-8deg)', whiteSpace: 'nowrap' }}>{String(p.name).toUpperCase()}</span>
        <span style={{ fontSize: fs(22), fontWeight: 700, letterSpacing: 3, color: DIM, marginTop: 4, whiteSpace: 'nowrap' }}>{String(p.pos || '').toUpperCase()}</span>
        <div style={{ display: 'flex', position: 'absolute', left: -200, top: Math.round(h * 0.42), width: 1000, height: 60, transform: 'rotate(-10deg)', background: bandOf(0.1) }} />
        <Glint x={w - 48} y={h - 200} s={40} a={0.75} />
      </div>
    </div>
  )
}

function Side({ s }) {
  const acc = SPORT_ACCENT[s.sport] || ACCENT
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: 196 }}>
      <Logo m={{ team: s.club, logo: s.logo, logoPlate: true }} size={50} />
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <span style={{ fontSize: fs(22), fontWeight: 800, letterSpacing: 3, color: acc }}>{s.league}</span>
        <span style={{ fontFamily: DISPLAY, fontSize: 36, fontWeight: 900, lineHeight: 1, color: INK, transform: 'skewX(-8deg)' }}>{`#${s.number}`}</span>
      </div>
    </div>
  )
}

/** PNG bytes. */
export async function renderNameGame({ pair, rows = [], head, sub, pool, asOf, source, more = 0 }) {
  const { grain } = await assets()
  const list = rows.slice(0, MAX_ROWS)
  const design = (
    <Frame accent={ACCENT} grain={grain}>
      <div style={{ display: 'flex', flexDirection: 'column', position: 'absolute', left: 26, top: 26, width: 1028, height: 1298, border: `3px solid ${alpha(ACCENT, 0.55)}`, borderRadius: 22, overflow: 'hidden' }}>
        <div style={{ display: 'flex', height: 10, background: shimmerStrip }} />
        <div style={{ display: 'flex', alignItems: 'center', height: 64, padding: '0 34px', gap: 22 }}>
          <span style={{ fontSize: fs(30), fontWeight: 800, letterSpacing: 6, color: ACCENT, whiteSpace: 'nowrap' }}>THE NAME GAME</span>
          <div style={{ display: 'flex', flexGrow: 1, height: 2, background: alpha(ACCENT, 0.5) }} />
          <span style={{ fontSize: fs(26), fontWeight: 800, letterSpacing: 3, color: INK2, whiteSpace: 'nowrap' }}>{`ALL FOUR LEAGUES · ${asOf}`}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 24, padding: '6px 34px 0 34px' }}>
          <Hero p={pair[0]} w={468} h={540} />
          <Hero p={pair[1]} w={468} h={540} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '18px 34px 6px 34px' }}>
          <span style={{ fontFamily: DISPLAY, fontSize: 60, fontWeight: 900, lineHeight: 1.05, color: INK, transform: 'skewX(-8deg)', whiteSpace: 'nowrap' }}>{head}</span>
          <span style={{ fontSize: fs(26), fontWeight: 700, color: ACCENT, letterSpacing: 2, marginTop: 4, whiteSpace: 'nowrap' }}>{sub}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '10px 40px 6px 40px' }}>
          <span style={{ fontSize: fs(22), fontWeight: 800, letterSpacing: 4, color: INK2, whiteSpace: 'nowrap' }}>SAME NAME, OTHER LEAGUE</span>
          <div style={{ display: 'flex', flexGrow: 1, height: 2, background: RULE }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', padding: '0 34px', gap: 8 }}>
          {list.map((r, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', height: 78, padding: '0 18px', gap: 16, borderRadius: 12, background: alpha(INK, 0.045), border: `2px solid ${alpha(INK, 0.08)}` }}>
              <span style={{ display: 'flex', flexGrow: 1, fontFamily: DISPLAY, fontSize: 42, fontWeight: 900, lineHeight: 1, color: INK, transform: 'skewX(-8deg)', whiteSpace: 'nowrap' }}>{String(r.name).toUpperCase()}</span>
              {r.sides.slice(0, 2).map((s, j) => <Side key={j} s={s} />)}
            </div>
          ))}
          {more > 0 ? <span style={{ fontSize: fs(22), fontWeight: 700, color: DIM, paddingLeft: 6 }}>{`+ ${more} more`}</span> : null}
        </div>
        <div style={{ display: 'flex', flexGrow: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 64, padding: '0 28px', gap: 20 }}>
          <span style={{ fontSize: fs(24), fontWeight: 800, color: INK2, letterSpacing: 2, whiteSpace: 'nowrap' }}>CALLED IT · DASH Network</span>
          <div style={{ display: 'flex', flexGrow: 1, height: 2, background: RULE }} />
          <span style={{ fontSize: fs(22), fontWeight: 600, color: DIM, whiteSpace: 'nowrap' }}>{`${pool} players · ${source}`}</span>
        </div>
      </div>
    </Frame>
  )
  return renderPng(design, { w: 1080, h: 1350 }, { card: 'namegame', design })
}
