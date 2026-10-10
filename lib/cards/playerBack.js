// THE PLAYER CARD, BACK (server only, JSX): the stat-table back Donovan picked. Cream stock, the product's accent only as tints and
// marks (never as small text on cream), one row per season WE HOLD, a distinct career row and playoffs row, the bio strip, and the
// "why he's on the board" panel. The rows come from the sport's adapter (lib/cards/adapters/*): this file names no sport.
//   back = { bio:[[label,value]], cols:[[head,weight,key]], rows:[{..}], career, careerLabel, playoffs, seasonsShown, note, source }
import { Frame, assets, renderPng, sizeOf, fs, fitName, alpha, ord, Face, Logo, Target, DISPLAY, INK, CHASSIS, RULE } from './cardKit'
import { SPORT_ACCENT } from '../sportAccent'

const PRINT = CHASSIS.bg           // printed in the chassis black
const SOFT = alpha(CHASSIS.bg, 0.72)
export const BACK_ROWS = 6

/** The evidence sentence and the rank line: composed ONLY from the stat words the front prints (percentiles, ranks); never a printed model number. */
export function blurbOf(m) {
  const ranked = (m.stats || []).filter((s) => s.pct != null).sort((a, b) => b.pct - a.pct).slice(0, 3)
  const word = (label) => label.replace(/ \/ (GP|G)$/, '').replace('HR / PA', 'HR per PA').split(' ').map((w) => (/^(HR|ISO|PA|TD|EV)$/.test(w) ? w : w.toLowerCase())).join(' ')
  const parts = ranked.map((s) => `${word(s.label)} ${ord(s.pct)}`)
  const head = parts.length ? `Ranks ${parts.join(', ')} among ${m.poolWord || 'the pool'}.` : ''
  const tail = (m.rankLine || []).map((t) => t[0] + t.slice(1).toLowerCase()).join(', ')
  return { line: head, rank: tail ? `${tail}.` : '' }
}

export function backDesign(m, b, grain, size = { w: 1080, h: 1350 }) {
  const accent = SPORT_ACCENT[m.sport]
  const shown = (b.rows || []).slice(-BACK_ROWS)
  const rowH = shown.length <= 2 ? 104 : shown.length <= 3 ? 80 : shown.length <= 4 ? 70 : 58
  const innerW = 1080 - 2 * (26 + 10)
  const tableW = innerW - 2 * 26
  const cellW = tableW - 28
  const unit = cellW / b.cols.reduce((a, c) => a + c[1], 0)
  const blurb = blurbOf(m)
  const parts = String(m.name || '').trim().split(/\s+/)
  const lines = parts.length > 1 ? [parts[0], parts.slice(1).join(' ')] : [parts[0] || '']
  const colW = innerW - 330 - 30
  const nameSize = Math.min(...lines.map((l) => fitName(l, 124, colW)))
  const cell = (c, v, i, kind) => (
    <div key={i} style={{ display: 'flex', width: Math.floor(c[1] * unit), justifyContent: i < 2 ? 'flex-start' : 'flex-end' }}>
      <span style={{ fontSize: fs(kind === 'head' ? 22 : 26), fontWeight: kind === 'row' ? 600 : 800, color: PRINT, whiteSpace: 'nowrap' }}>{v}</span>
    </div>
  )
  const line = (r, key, kind) => (
    <div key={key} style={{ display: 'flex', alignItems: 'center', height: kind === 'head' ? 52 : rowH, padding: '0 14px', background: kind === 'head' ? alpha(accent, 0.3) : kind === 'tot' ? alpha(accent, 0.2) : kind === 'po' ? alpha(accent, 0.1) : kind === 'alt' ? alpha(PRINT, 0.05) : 'transparent', borderTop: kind === 'tot' ? `3px solid ${PRINT}` : kind === 'po' ? `1px solid ${alpha(PRINT, 0.3)}` : 'none' }}>
      {b.cols.map((c, i) => cell(c, kind === 'head' ? c[0] : (r[c[2]] ?? ''), i, kind))}
    </div>
  )
  const range = shown.length ? `${shown[0].season}${shown.length > 1 ? ` TO ${shown[shown.length - 1].season}` : ''}` : ''
  const noteText = b.note || ''
  return (
    <Frame accent={accent} tone={null} grain={null}>
      <div style={{ display: 'flex', position: 'absolute', left: 26, top: 26, width: 1028, height: 1298, border: `10px solid ${accent}`, borderRadius: 30, background: INK, overflow: 'hidden', flexDirection: 'column' }}>
        {grain ? <img src={grain} width={1080} height={1350} style={{ position: 'absolute', left: -26, top: -26, opacity: 0.3 }} /> : null}
        <div style={{ display: 'flex', height: 372, position: 'relative' }}>
          <div style={{ display: 'flex', position: 'absolute', left: 0, top: 0, width: 330, height: 372, overflow: 'hidden', background: alpha(m.tone || accent, 0.35) }}>
            <div style={{ display: 'flex', position: 'absolute', left: 150, top: -60, width: 150, height: 520, background: alpha(accent, 0.45), transform: 'skewX(-14deg)' }} />
            <div style={{ display: 'flex', position: 'absolute', left: -10, bottom: 0 }}><Face m={m} w={350} h={350} accent={accent} /></div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', position: 'absolute', left: 350, top: 14, width: colW }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, height: 40 }}>
              <span style={{ fontSize: fs(24), fontWeight: 800, letterSpacing: 5, color: PRINT, whiteSpace: 'nowrap' }}>{`${m.brand.name} / PLAYER PROFILE`}</span>
              <div style={{ display: 'flex', flexGrow: 1, height: 2, background: alpha(accent, 0.8) }} />
              <Logo m={m} size={56} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', marginTop: 2 }}>
              {lines.map((l) => <span key={l} style={{ fontFamily: DISPLAY, fontSize: nameSize, fontWeight: 900, lineHeight: 0.98, color: PRINT, textTransform: 'uppercase', transform: 'skewX(-8deg)', whiteSpace: 'nowrap' }}>{l}</span>)}
            </div>
            <span style={{ fontSize: fs(30), fontWeight: 800, color: PRINT, marginTop: 8, whiteSpace: 'nowrap' }}>{[m.pos, m.teamName, m.number != null ? `#${m.number}` : null].filter(Boolean).join('  ·  ')}</span>
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', padding: '0 26px', margin: '8px 0 12px 0', minHeight: 62 }}>
          {(b.bio || []).slice(0, 4).map(([k, v]) => (
            <div key={k} style={{ display: 'flex', flexDirection: 'column', marginRight: 40, marginBottom: 4 }}>
              <span style={{ fontSize: fs(22), fontWeight: 800, color: SOFT, letterSpacing: 2, whiteSpace: 'nowrap' }}>{k}</span>
              <span style={{ fontSize: fs(26), fontWeight: 800, color: PRINT, whiteSpace: 'nowrap' }}>{v}</span>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', margin: '0 26px', borderRadius: 16, overflow: 'hidden', border: `3px solid ${PRINT}` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 64, padding: '0 22px', background: PRINT }}>
            <span style={{ fontFamily: DISPLAY, fontSize: 44, fontWeight: 900, color: INK, letterSpacing: 1, transform: 'skewX(-8deg)' }}>{b.title || 'CAREER STATS'}</span>
            <span style={{ fontSize: fs(22), fontWeight: 700, color: INK }}>{range}</span>
          </div>
          {line(null, 'h', 'head')}
          {shown.length ? shown.map((r, i) => line(r, r.season, i % 2 ? 'alt' : 'row')) : (
            <div style={{ display: 'flex', height: rowH, alignItems: 'center', padding: '0 14px' }}><span style={{ fontSize: fs(26), fontWeight: 700, color: SOFT }}>No season rows on file for this player</span></div>
          )}
          {b.career ? line(b.career, 'career', 'tot') : null}
          {b.playoffs ? line(b.playoffs, 'po', 'po') : null}
        </div>
        <div style={{ display: 'flex', margin: '6px 30px 0 30px', minHeight: 30 }}>
          <span style={{ fontSize: fs(22), fontWeight: 600, color: SOFT }}>{noteText}</span>
        </div>
        <div style={{ display: 'flex', flexGrow: 1, maxHeight: 300, alignItems: 'center', margin: '12px 26px 74px 26px', padding: '10px 22px', borderRadius: 16, background: alpha(accent, 0.16), gap: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 92, height: 92, borderRadius: 14, background: PRINT }}><Target size={58} color={accent} /></div>
          <div style={{ display: 'flex', flexDirection: 'column', width: 790, paddingLeft: 20, borderLeft: `2px solid ${alpha(PRINT, 0.3)}` }}>
            <span style={{ fontSize: fs(22), fontWeight: 800, letterSpacing: 3, color: SOFT }}>WHY HE'S ON THE BOARD</span>
            <span style={{ fontSize: fs(30), fontWeight: 800, color: PRINT, lineHeight: 1.2, marginTop: 2 }}>{blurb.line || m.why || ''}</span>
            {blurb.rank ? <span style={{ fontSize: fs(24), fontWeight: 700, color: SOFT, marginTop: 4 }}>{blurb.rank}</span> : null}
          </div>
        </div>
        <div style={{ display: 'flex', position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'space-between', height: 62, padding: '0 28px', background: PRINT, gap: 20 }}>
          <span style={{ fontSize: fs(24), fontWeight: 800, color: INK, letterSpacing: 2, whiteSpace: 'nowrap' }}>{`${m.brand.name} · DASH Network`}</span>
          <div style={{ display: 'flex', flexGrow: 1, height: 2, background: alpha(INK, 0.25) }} />
          <span style={{ fontSize: fs(24), fontWeight: 700, color: INK, whiteSpace: 'nowrap' }}>{m.dayWord || ''}</span>
        </div>
      </div>
    </Frame>
  )
}

/** PNG bytes of the back at `width` px (4:5). */
export async function renderBack(m, b, { width } = {}) {
  const { grain } = await assets()
  const size = sizeOf(width)
  return renderPng(backDesign(m, b, grain, size), size, { card: 'back', design: backDesign(m, b, grain) })
}
