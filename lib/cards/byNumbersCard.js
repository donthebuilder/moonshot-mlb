// TONIGHT'S CALLS, BY THE NUMBERS (server only, JSX). 1080 x 1350, from the cards we post: cardKit's Frame, Face, Logo, the display italic, the
// special card's foil ring. Donovan, 2026-10-21, of the roster-only version: "a cute post but not helpful". So the card starts from TONIGHT'S BOARD:
// only men in today's games, a number pattern only when it lands on a man we have a read on, and every man carries that read (CALLED / ON THE BOARD,
// his place, his per-game stat). The number is the hook; the call is the point. Never a pick of its own, never in a score.
//
// `duel` = [a, b] (same number, same game), each { sport, brand, club, team, name, number, status, place, stat, face, logo, logoPlate }.
// `rows` = up to 3 { kicker, title, sub, men: [{ face, logo, logoPlate, name }] }. `head`, `sub`, `asOf`.
import { Frame, Face, Logo, assets, renderPng, fs, field, alpha, DISPLAY, INK, INK2, DIM, RULE, CHASSIS } from './cardKit'
import { ringOf, shimmerStrip, bandOf, Glint } from './specialCard'
import { SPORT_ACCENT } from '../sportAccent'
import { STATUS_WORD } from '../callStatus'
import { C } from '../theme'

const ACCENT = C.orange
const MAX_ROWS = 3

function StatusChip({ status, place, accent }) {
  const called = status === 'called'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ display: 'flex', fontSize: fs(22), fontWeight: 800, letterSpacing: 3, padding: '2px 12px', color: called ? CHASSIS.bg : accent, background: called ? accent : 'transparent', border: `2px solid ${accent}`, whiteSpace: 'nowrap' }}>{STATUS_WORD[status] || ''}</span>
      {place ? <span style={{ fontSize: fs(24), fontWeight: 800, color: INK, whiteSpace: 'nowrap' }}>{place}</span> : null}
    </div>
  )
}

function Duelist({ p, w, h }) {
  const acc = SPORT_ACCENT[p.sport] || ACCENT
  const called = p.status === 'called'
  const inner = (
    <div style={{ display: 'flex', flexDirection: 'column', position: 'relative', width: w - (called ? 8 : 6), height: h - (called ? 8 : 6), borderRadius: called ? 14 : 16, overflow: 'hidden', background: called ? field(acc) : alpha(INK, 0.045), alignItems: 'center' }}>
      <div style={{ display: 'flex', width: '100%', height: 8, background: called ? acc : alpha(acc, 0.5) }} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '14px 22px 0 22px' }}>
        <span style={{ fontSize: fs(24), fontWeight: 800, letterSpacing: 5, color: acc }}>{p.brand}</span>
        <span style={{ fontSize: fs(24), fontWeight: 800, letterSpacing: 2, color: INK2, whiteSpace: 'nowrap' }}>{String(p.club || '').toUpperCase()}</span>
      </div>
      <div style={{ display: 'flex', position: 'relative', marginTop: 10, width: 300, height: 218 }}>
        <Face m={{ face: p.face, name: p.name }} w={300} h={218} accent={acc} radius={12} />
        <div style={{ display: 'flex', position: 'absolute', right: -14, bottom: -14 }}><Logo m={{ team: p.team, logo: p.logo, logoPlate: p.logoPlate }} size={78} /></div>
      </div>
      <span style={{ fontFamily: DISPLAY, fontSize: 132, fontWeight: 900, lineHeight: 0.95, marginTop: 12, color: called ? INK : INK2, transform: 'skewX(-8deg)' }}>{`#${p.number}`}</span>
      <span style={{ fontFamily: DISPLAY, fontSize: 44, fontWeight: 900, lineHeight: 1.05, color: INK, transform: 'skewX(-8deg)', whiteSpace: 'nowrap' }}>{String(p.name).toUpperCase()}</span>
      <div style={{ display: 'flex', marginTop: 10 }}><StatusChip status={p.status} place={p.place} accent={acc} /></div>
      {p.stat ? <span style={{ fontSize: fs(24), fontWeight: 700, color: INK2, marginTop: 8, whiteSpace: 'nowrap' }}>{p.stat}</span> : null}
      {called ? <div style={{ display: 'flex', position: 'absolute', left: -200, top: Math.round(h * 0.4), width: 1000, height: 60, transform: 'rotate(-10deg)', background: bandOf(0.1) }} /> : null}
      {called ? <Glint x={w - 48} y={h - 230} s={40} a={0.75} /> : null}
    </div>
  )
  return called
    ? <div style={{ display: 'flex', width: w, height: h, borderRadius: 18, background: ringOf('elite'), alignItems: 'center', justifyContent: 'center' }}>{inner}</div>
    : <div style={{ display: 'flex', width: w, height: h, borderRadius: 18, border: `3px solid ${alpha(acc, 0.45)}`, overflow: 'hidden' }}>{inner}</div>
}

function Row({ r }) {
  const men = (r.men || []).slice(0, 2)
  return (
    <div style={{ display: 'flex', alignItems: 'center', height: 168, padding: '0 22px', gap: 22, borderRadius: 14, background: alpha(INK, 0.045), border: `2px solid ${alpha(ACCENT, 0.3)}` }}>
      <div style={{ display: 'flex', gap: 10, width: men.length * 132 + (men.length - 1) * 10, flexShrink: 0 }}>
        {men.map((m, i) => (
          <div key={i} style={{ display: 'flex', position: 'relative', width: 132, height: 110 }}>
            <Face m={{ face: m.face, name: m.name }} w={132} h={96} accent={ACCENT} radius={10} />
            <div style={{ display: 'flex', position: 'absolute', right: -6, bottom: -4 }}><Logo m={{ team: m.team, logo: m.logo, logoPlate: m.logoPlate }} size={44} /></div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, overflow: 'hidden' }}>
        <span style={{ fontSize: fs(24), fontWeight: 800, letterSpacing: 4, color: ACCENT, whiteSpace: 'nowrap' }}>{r.kicker}</span>
        <span style={{ fontFamily: DISPLAY, fontSize: 46, fontWeight: 900, lineHeight: 1.05, color: INK, transform: 'skewX(-8deg)', whiteSpace: 'nowrap' }}>{r.title}</span>
        <span style={{ fontSize: fs(24), fontWeight: 700, color: INK2, marginTop: 4, whiteSpace: 'nowrap' }}>{r.sub}</span>
      </div>
    </div>
  )
}

/** PNG bytes. */
export async function renderByNumbers({ duel, rows = [], head, sub, asOf, test = false }) {
  const { grain } = await assets()
  const design = (
    <Frame accent={ACCENT} grain={grain}>
      <div style={{ display: 'flex', flexDirection: 'column', position: 'absolute', left: 26, top: 26, width: 1028, height: 1298, border: `3px solid ${alpha(ACCENT, 0.55)}`, borderRadius: 22, overflow: 'hidden' }}>
        <div style={{ display: 'flex', height: 10, background: shimmerStrip }} />
        <div style={{ display: 'flex', alignItems: 'center', height: 64, padding: '0 34px', gap: 22 }}>
          <span style={{ fontSize: fs(30), fontWeight: 800, letterSpacing: 6, color: ACCENT, whiteSpace: 'nowrap' }}>BY THE NUMBERS</span>
          <div style={{ display: 'flex', flexGrow: 1, height: 2, background: alpha(ACCENT, 0.5) }} />
          <span style={{ fontSize: fs(26), fontWeight: 800, letterSpacing: 3, color: INK2, whiteSpace: 'nowrap' }}>{`TONIGHT · ${asOf}`}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 24, padding: '6px 34px 0 34px' }}>
          <Duelist p={duel[0]} w={468} h={600} />
          <Duelist p={duel[1]} w={468} h={600} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '16px 34px 4px 34px' }}>
          <span style={{ fontFamily: DISPLAY, fontSize: 60, fontWeight: 900, lineHeight: 1.05, color: INK, transform: 'skewX(-8deg)', whiteSpace: 'nowrap' }}>{head}</span>
          <span style={{ fontSize: fs(26), fontWeight: 700, color: ACCENT, letterSpacing: 2, marginTop: 2, whiteSpace: 'nowrap' }}>{sub}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '10px 40px 8px 40px' }}>
          <span style={{ fontSize: fs(22), fontWeight: 800, letterSpacing: 4, color: INK2, whiteSpace: 'nowrap' }}>MORE NUMBERS ON TONIGHT'S CALLS</span>
          <div style={{ display: 'flex', flexGrow: 1, height: 2, background: RULE }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', padding: '0 34px', gap: 10 }}>
          {rows.slice(0, MAX_ROWS).map((r, i) => <Row key={i} r={r} />)}
        </div>
        <div style={{ display: 'flex', flexGrow: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 64, padding: '0 28px', gap: 20 }}>
          <span style={{ fontSize: fs(24), fontWeight: 800, color: INK2, letterSpacing: 2, whiteSpace: 'nowrap' }}>CALLED IT · DASH Network</span>
          <div style={{ display: 'flex', flexGrow: 1, height: 2, background: RULE }} />
          <span style={{ fontSize: fs(22), fontWeight: 600, color: DIM, whiteSpace: 'nowrap' }}>{test ? 'TEST DATA' : 'the board’s read · rosters: ESPN'}</span>
        </div>
      </div>
    </Frame>
  )
  return renderPng(design, { w: 1080, h: 1350 }, { card: 'bynumbers', design })
}
