// THE PLAYER CARD, FRONT (server only, JSX). One drawing for every sport: the sport's accent, words and numbers arrive in the
// model (lib/cards/model.js), built by an adapter (lib/cards/adapters/*); nothing here names a sport.
// Look (Donovan's reference mockup, 2026-10-10): dark ground and a thin accent frame; status label + rule + position on top; the
// portrait over a faded club-logo watermark with the board rank (quiet tag) and the compact score box; an oversized italic display
// name; the club logo and the matchup; equal-height metric tiles in a grid (label / value + unit / percentile text / thin bar);
// a closing status banner; a quiet footer with the date. Accent colour marks only the signals: the status word, a hot (top 20%)
// number, the score, the foil strip (CALLED only).
import { Frame, assets, renderPng, sizeOf, fs, fitName, foil, alpha, heat, ord, Bar, Face, Logo, Price, Target, matchup, DISPLAY, INK, INK2, DIM, RULE, CHASSIS } from './cardKit'
import { SPORT_ACCENT } from '../sportAccent'
import { STATUS_WORD } from '../callStatus'

export const MAX_TILES = 6

function Tile({ s, w, accent, last }) {
  const h = heat(s.pct, accent)
  const text = `${s.value}${s.unit ? ` ${s.unit}` : ''}`
  const big = text.length >= 8 ? 56 : text.length >= 6 ? 64 : 74
  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: w, height: 160, padding: '0 22px', borderLeft: `2px solid ${alpha(INK, 0.12)}`, justifyContent: 'center' }}>
      <span style={{ fontSize: fs(22), fontWeight: 800, color: DIM, letterSpacing: 0.4, whiteSpace: 'nowrap' }}>{s.label}</span>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 2 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{ fontFamily: DISPLAY, fontSize: big, fontWeight: 900, lineHeight: 1, color: h.c, whiteSpace: 'nowrap' }}>{s.value}</span>
          {s.unit ? <span style={{ fontSize: fs(22), fontWeight: 700, color: DIM, whiteSpace: 'nowrap' }}>{s.unit}</span> : null}
        </div>
        {s.pct != null ? <span style={{ fontSize: fs(26), fontWeight: 800, color: h.c, whiteSpace: 'nowrap' }}>{ord(s.pct)}</span> : null}
      </div>
      <div style={{ display: 'flex', marginTop: 8, height: 28, alignItems: 'center' }}>
        {s.pct != null
          ? <Bar pct={s.pct} w={w - 44} h={8} color={h.hot ? accent : alpha(INK, 0.5)} accent={accent} />
          : s.sub ? <span style={{ fontSize: fs(22), fontWeight: 600, color: INK2, whiteSpace: 'nowrap' }}>{s.sub}</span> : null}
      </div>
    </div>
  )
}

/** The design (1080 x 1350) of a front, as an element. Exported so the type lint and the tests can read it without rendering. */
export function frontDesign(m, grain, size = { w: 1080, h: 1350 }) {
  const accent = SPORT_ACCENT[m.sport]
  const called = m.status === 'called'
  const stats = (m.stats || []).slice(0, MAX_TILES)
  const cols = stats.length <= 4 ? 2 : 3
  const rows = Math.ceil(stats.length / cols) || 0
  const inner = 1080 - 2 * 34
  const tileW = Math.floor(inner / cols)
  // fixed heights; the portrait takes whatever is left, so a card with fewer tiles has a taller portrait
  const FIXED = 62 + 150 + 70 + 24 + rows * 160 + (rows ? 44 : 0) + 112 + 64 + 40
  const portraitH = Math.max(380, 1298 - FIXED)
  const nameMax = inner - 70
  const nameSize = fitName(m.name, 150, nameMax)
  const tag = (t) => (
    <span key={t} style={{ fontSize: fs(24), fontWeight: 800, letterSpacing: 1, color: INK, background: alpha(CHASSIS.bg, 0.7), borderStyle: 'solid', borderWidth: '2px 2px 2px 6px', borderColor: `${alpha(INK, 0.22)} ${alpha(INK, 0.22)} ${alpha(INK, 0.22)} ${called ? accent : alpha(INK, 0.4)}`, padding: '6px 16px', alignSelf: 'flex-start', whiteSpace: 'nowrap' }}>{t}</span>
  )
  const el = (
    <Frame accent={accent} tone={m.tone} grain={grain}>
      <div style={{ display: 'flex', position: 'absolute', left: 26, top: 26, width: 1028, height: 1298, border: `3px solid ${alpha(accent, 0.55)}`, borderRadius: 22, flexDirection: 'column', overflow: 'hidden' }}>
        {called ? <div style={{ display: 'flex', height: 10, background: foil(accent) }} /> : <div style={{ display: 'flex', height: 10 }} />}
        <div style={{ display: 'flex', alignItems: 'center', height: 52, padding: '0 8px', gap: 22 }}>
          <span style={{ fontSize: fs(34), fontWeight: 800, letterSpacing: 10, color: called ? accent : INK2, whiteSpace: 'nowrap' }}>{STATUS_WORD[m.status]}</span>
          <div style={{ display: 'flex', flexGrow: 1, height: 2, background: alpha(accent, called ? 0.5 : 0.2) }} />
          <span style={{ fontSize: fs(30), fontWeight: 800, letterSpacing: 3, color: INK2 }}>{m.pos || ''}</span>
        </div>
        <div style={{ display: 'flex', position: 'relative', width: 1028 - 6, height: portraitH, overflow: 'hidden', marginTop: 0, borderBottom: `2px solid ${alpha(accent, 0.45)}`, background: `radial-gradient(circle at 50% 42%, ${alpha(m.tone || accent, 0.42)} 0%, ${alpha(accent, 0.08)} 64%, ${alpha(CHASSIS.bg, 0.3)} 100%)` }}>
          {m.logo ? <div style={{ display: 'flex', position: 'absolute', right: -90, top: Math.round(portraitH * 0.1), opacity: 0.16 }}><Logo m={m} size={Math.round(portraitH * 0.95)} /></div> : null}
          <div style={{ display: 'flex', position: 'absolute', left: Math.round((1022 - portraitH) / 2), bottom: 0 }}><Face m={m} w={portraitH} h={portraitH} accent={accent} /></div>
          <div style={{ display: 'flex', flexDirection: 'column', position: 'absolute', left: 26, top: 20, gap: 8 }}>{(m.rankLine || []).slice(0, 2).map(tag)}</div>
          {m.score != null ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'absolute', right: 26, top: 20, padding: '10px 26px 6px 26px', background: alpha(CHASSIS.bg, 0.72), border: `2px solid ${alpha(accent, called ? 0.6 : 0.3)}` }}>
              <span style={{ fontSize: fs(22), fontWeight: 800, letterSpacing: 4, color: INK2 }}>{m.scoreWord}</span>
              <span style={{ fontFamily: DISPLAY, fontSize: 92, fontWeight: 900, lineHeight: 1, color: accent, transform: 'skewX(-8deg)' }}>{String(Math.round(m.score))}</span>
            </div>
          ) : null}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', padding: '10px 34px 0 28px' }}>
          <span style={{ fontFamily: DISPLAY, fontSize: nameSize, fontWeight: 900, lineHeight: 1.02, textTransform: 'uppercase', transform: 'skewX(-8deg)', letterSpacing: -0.5, whiteSpace: 'nowrap', height: 150, alignItems: 'center', display: 'flex' }}>{m.name}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, height: 70 }}>
            <Logo m={m} size={52} />
            <span style={{ fontSize: fs(40), fontWeight: 800, whiteSpace: 'nowrap' }}>{matchup(m)}</span>
            <span style={{ fontSize: fs(28), fontWeight: 600, color: DIM, whiteSpace: 'nowrap' }}>{[m.club || m.teamName, m.number != null ? `#${m.number}` : null].filter((x) => x && x !== m.team).join('  ·  ')}</span>
          </div>
        </div>
        <div style={{ display: 'flex', height: 2, margin: '0 28px', background: RULE }} />
        {rows ? (
          <div style={{ display: 'flex', flexDirection: 'column', margin: '12px 28px 0 6px' }}>
            {Array.from({ length: rows }, (_, r) => (
              <div key={r} style={{ display: 'flex' }}>
                {stats.slice(r * cols, r * cols + cols).map((s, i) => <Tile key={s.label} s={s} w={tileW} accent={accent} last={i === cols - 1} />)}
              </div>
            ))}
          </div>
        ) : null}
        {rows ? <span style={{ fontSize: fs(22), fontWeight: 600, color: DIM, padding: '8px 34px 0 28px', whiteSpace: 'nowrap', height: 44 }}>{m.statNote || ''}</span> : null}
        <div style={{ display: 'flex', flexGrow: 1, alignItems: 'center', padding: '0 28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', height: 104, padding: '0 24px 0 22px', background: called ? `linear-gradient(90deg, ${alpha(accent, 0.2)} 0%, ${alpha(accent, 0.04)} 100%)` : alpha(INK, 0.05), borderStyle: 'solid', borderWidth: '2px 2px 2px 8px', borderColor: `${alpha(called ? accent : INK, called ? 0.4 : 0.14)} ${alpha(called ? accent : INK, called ? 0.4 : 0.14)} ${alpha(called ? accent : INK, called ? 0.4 : 0.14)} ${called ? accent : alpha(INK, 0.35)}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
              <Target size={56} color={called ? accent : INK2} />
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: fs(24), fontWeight: 800, letterSpacing: 5, color: called ? accent : INK2 }}>{STATUS_WORD[m.status]}</span>
                {m.callLine ? <span style={{ fontFamily: DISPLAY, fontSize: 50, fontWeight: 900, lineHeight: 1.05, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{m.callLine}</span> : null}
              </div>
            </div>
            <Price price={m.price} accent={accent} size={52} />
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 64, padding: '0 28px', gap: 20 }}>
          <span style={{ fontSize: fs(24), fontWeight: 800, color: INK2, letterSpacing: 2, whiteSpace: 'nowrap' }}>{`${m.brand.name} · DASH Network`}</span>
          <div style={{ display: 'flex', flexGrow: 1, height: 2, background: RULE }} />
          <span style={{ fontSize: fs(24), fontWeight: 600, color: DIM, whiteSpace: 'nowrap' }}>{m.dayWord || ''}</span>
        </div>
      </div>
    </Frame>
  )
  return el
}

/** PNG bytes of the front at `width` px (4:5; the design size by default). */
export async function renderFront(m, { width } = {}) {
  const { grain } = await assets()
  const size = sizeOf(width)
  return renderPng(frontDesign(m, grain, size), size, { card: 'front', design: frontDesign(m, grain) })
}
