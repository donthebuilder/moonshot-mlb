// THE GRADED SLAB RESULT CARD (server only, JSX): after a straight, a Two-Man or a night's calls are graded, the result in a collector's slab: a
// thin clear case, the card behind it, and a LABEL on the side that says what happened in the real words (CASHED / MISSED / VOID / DID NOT PLAY
// per leg, the date, the product and market, the lane's record "K of N"). There is NO numeric grade and no sub-grades: the label states only
// facts the grading produced. A miss is drawn exactly like a hit (same layout, same size, same weight; only the small mark beside the word
// differs: filled for cashed, hollow for missed, a dash for a man who did not play): no stamp, no celebration, no red / green.
//   slab = { sport|null, brandName, kicker, product, market, dayWord, result:'cashed'|'missed'|'void'|null,
//            legs:[{ m, outcome:'cashed'|'missed'|'dnp', market? }], record:{ k, n, label }|null, note }
// `sport` null = a cross-sport receipt (the house accent: MOONSHOT's, as lib/dash/discordCard does). Data: lib/cards/slabData.js.
import { Frame, assets, renderPng, sizeOf, fs, fitName, alpha, Face, Logo, matchup, DISPLAY, INK, INK2, DIM, CHASSIS } from './cardKit'
import { SPORT_ACCENT } from '../sportAccent'
import { outcomeWord } from './outcome'

const PRINT = CHASSIS.bg
const SOFT = alpha(CHASSIS.bg, 0.72)
const LABEL_W = 300
const WIN_W = 1028 - 8 - 32 - LABEL_W - 16
const WIN_H = 1298 - 8 - 32
export const MAX_ROWS = 8

/** The mark beside an outcome word: filled (cashed), hollow (missed), a dash (did not play / void). Same size for all. */
const Mark = ({ outcome, accent, color }) => (outcome === 'cashed'
  ? <div style={{ display: 'flex', width: 22, height: 22, borderRadius: 4, background: accent }} />
  : outcome === 'missed'
    ? <div style={{ display: 'flex', width: 22, height: 22, borderRadius: 4, border: `3px solid ${color}` }} />
    : <div style={{ display: 'flex', width: 22, height: 6, background: color }} />)

const Chip = ({ outcome, accent }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: alpha(CHASSIS.bg, 0.78), border: `2px solid ${alpha(INK, 0.28)}`, padding: '6px 16px' }}>
    <Mark outcome={outcome} accent={accent} color={INK2} />
    <span style={{ fontSize: fs(26), fontWeight: 800, letterSpacing: 3, color: INK, whiteSpace: 'nowrap' }}>{outcomeWord(outcome)}</span>
  </div>
)

function PortraitLeg({ leg, accent, tall }) {
  const m = leg.m
  const h = tall ? 760 : 430
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', position: 'relative', width: WIN_W - 4, height: h, overflow: 'hidden', background: `radial-gradient(circle at 50% 40%, ${alpha(m.tone || accent, 0.45)} 0%, ${alpha(accent, 0.08)} 65%, ${alpha(CHASSIS.bg, 0.3)} 100%)` }}>
        {m.logo ? <div style={{ display: 'flex', position: 'absolute', right: -60, top: 20, opacity: 0.15 }}><Logo m={m} size={tall ? 520 : 330} /></div> : null}
        <div style={{ display: 'flex', position: 'absolute', left: Math.round((WIN_W - 4 - h) / 2), bottom: 0 }}><Face m={m} w={h} h={h} accent={accent} /></div>
        <div style={{ display: 'flex', position: 'absolute', left: 16, bottom: 16 }}><Chip outcome={leg.outcome} accent={accent} /></div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', padding: '10px 22px 0 22px' }}>
        <span style={{ fontFamily: DISPLAY, fontSize: fitName(m.name, tall ? 96 : 70, WIN_W - 60), fontWeight: 900, lineHeight: 1.05, textTransform: 'uppercase', transform: 'skewX(-8deg)', whiteSpace: 'nowrap' }}>{m.name}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
          <Logo m={m} size={40} />
          <span style={{ fontSize: fs(28), fontWeight: 800, whiteSpace: 'nowrap' }}>{m.team ? (m.opp ? matchup(m) : m.team) : ''}</span>
          {leg.market ? <span style={{ fontSize: fs(24), fontWeight: 600, color: DIM, whiteSpace: 'nowrap' }}>{leg.market}</span> : null}
        </div>
      </div>
    </div>
  )
}

function RowLeg({ leg, accent, h }) {
  const m = leg.m
  return (
    <div style={{ display: 'flex', alignItems: 'center', height: h, padding: '0 22px', gap: 18, borderTop: `2px solid ${alpha(INK, 0.1)}` }}>
      <div style={{ display: 'flex', width: 92, height: 92, borderRadius: 46, overflow: 'hidden', border: `3px solid ${alpha(accent, 0.6)}`, background: alpha(m.tone || accent, 0.3) }}><Face m={m} w={92} h={92} accent={accent} /></div>
      <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
        <span style={{ fontFamily: DISPLAY, fontSize: fitName(m.name, 50, 330), fontWeight: 900, lineHeight: 1.05, textTransform: 'uppercase', transform: 'skewX(-8deg)', whiteSpace: 'nowrap' }}>{m.name}</span>
        <span style={{ fontSize: fs(24), fontWeight: 600, color: INK2, whiteSpace: 'nowrap' }}>{[leg.sportLabel, leg.market].filter(Boolean).join(' · ')}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Mark outcome={leg.outcome} accent={accent} color={INK2} />
        <span style={{ fontSize: fs(24), fontWeight: 800, letterSpacing: 2, whiteSpace: 'nowrap' }}>{outcomeWord(leg.outcome)}</span>
      </div>
    </div>
  )
}

export function slabDesign(s, grain, mark) {
  const accent = SPORT_ACCENT[s.sport || 'mlb']
  const rowsMode = s.legs.length > 2
  const shownLegs = s.legs.slice(0, rowsMode ? MAX_ROWS : 2)
  const hidden = s.legs.length - shownLegs.length
  const rowH = Math.min(150, Math.floor((WIN_H - 130 - (hidden ? 50 : 0)) / Math.max(1, shownLegs.length)))
  const tally = ['cashed', 'missed', 'dnp'].map((k) => [k, s.legs.filter((l) => l.outcome === k).length]).filter(([, n]) => n > 0)
  return (
    <Frame accent={accent} tone={null} grain={grain}>
      <div style={{ display: 'flex', position: 'absolute', left: 26, top: 26, width: 1028, height: 1298, borderRadius: 28, border: `4px solid ${alpha(INK, 0.4)}`, background: alpha(INK, 0.05), padding: 16, gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', width: WIN_W, height: WIN_H, borderRadius: 14, overflow: 'hidden', border: `2px solid ${alpha(accent, 0.6)}`, background: `linear-gradient(180deg, ${alpha(INK, 0.05)} 0%, ${CHASSIS.bg} 100%)` }}>
          <div style={{ display: 'flex', alignItems: 'center', height: 70, padding: '0 22px', gap: 14, background: alpha(accent, 0.14), borderBottom: `2px solid ${alpha(accent, 0.45)}` }}>
            <span style={{ fontSize: fs(26), fontWeight: 800, letterSpacing: 5, color: INK2, whiteSpace: 'nowrap' }}>{s.kicker}</span>
          </div>
          {rowsMode ? (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {shownLegs.map((l, i) => <RowLeg key={`${l.m.playerId}-${i}`} leg={l} accent={accent} h={rowH} />)}
              {hidden ? <span style={{ fontSize: fs(26), fontWeight: 700, color: DIM, padding: '12px 22px 0 22px' }}>{`+${hidden} more in the ledger`}</span> : null}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {shownLegs.map((l, i) => <PortraitLeg key={`${l.m.playerId}-${i}`} leg={l} accent={accent} tall={shownLegs.length === 1} />)}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', width: LABEL_W, height: WIN_H, borderRadius: 10, background: INK, padding: '20px 18px', color: PRINT, border: `3px solid ${alpha(PRINT, 0.85)}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {mark ? <img src={mark} width={44} height={44} /> : null}
            <span style={{ fontSize: fs(22), fontWeight: 800, letterSpacing: 2, color: SOFT }}>{s.brandName}</span>
          </div>
          <div style={{ display: 'flex', height: 4, background: accent, margin: '12px 0' }} />
          <span style={{ fontFamily: DISPLAY, fontSize: 54, fontWeight: 900, lineHeight: 1, textTransform: 'uppercase', transform: 'skewX(-8deg)' }}>{s.product}</span>
          {s.market ? <span style={{ fontSize: fs(24), fontWeight: 700, color: SOFT, marginTop: 8 }}>{s.market}</span> : null}
          <span style={{ fontSize: fs(24), fontWeight: 800, marginTop: 4 }}>{s.dayWord}</span>
          <div style={{ display: 'flex', height: 2, background: alpha(PRINT, 0.3), margin: '16px 0' }} />
          <span style={{ fontSize: fs(22), fontWeight: 800, letterSpacing: 3, color: SOFT }}>RESULT</span>
          {s.result ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
              <Mark outcome={s.result === 'void' ? 'dnp' : s.result} accent={accent} color={PRINT} />
              <span style={{ fontFamily: DISPLAY, fontSize: 58, fontWeight: 900, lineHeight: 1 }}>{outcomeWord(s.result)}</span>
            </div>
          ) : null}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: s.result ? 12 : 6 }}>
            {(s.result ? s.legs.slice(0, 2) : []).map((l, i) => (
              <div key={`${l.m.playerId}-${i}`} style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: fs(24), fontWeight: 800 }}>{l.m.name}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Mark outcome={l.outcome} accent={accent} color={PRINT} /><span style={{ fontSize: fs(24), fontWeight: 700, color: SOFT }}>{outcomeWord(l.outcome)}</span></div>
              </div>
            ))}
            {!s.result ? tally.map(([k, n]) => (
              <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Mark outcome={k} accent={accent} color={PRINT} />
                <span style={{ fontFamily: DISPLAY, fontSize: 44, fontWeight: 900, lineHeight: 1 }}>{n}</span>
                <span style={{ fontSize: fs(24), fontWeight: 800 }}>{outcomeWord(k)}</span>
              </div>
            )) : null}
          </div>
          {s.record ? (
            <div style={{ display: 'flex', flexDirection: 'column', marginTop: 'auto', paddingTop: 14, borderTop: `2px solid ${alpha(PRINT, 0.3)}` }}>
              <span style={{ fontSize: fs(22), fontWeight: 800, letterSpacing: 3, color: SOFT }}>RECORD</span>
              <span style={{ fontFamily: DISPLAY, fontSize: 62, fontWeight: 900, lineHeight: 1 }}>{`${s.record.k} of ${s.record.n}`}</span>
              <span style={{ fontSize: fs(24), fontWeight: 700, color: SOFT }}>{s.record.label}</span>
            </div>
          ) : null}
          <span style={{ fontSize: fs(22), fontWeight: 600, color: SOFT, marginTop: s.record ? 12 : 'auto' }}>{s.note}</span>
        </div>
      </div>
    </Frame>
  )
}

/** PNG bytes of the slab at `width` px (4:5). */
export async function renderSlab(s, { width } = {}) {
  const { grain, mark } = await assets()
  const size = sizeOf(width)
  return renderPng(slabDesign(s, grain, mark), size, { card: 'slab', design: slabDesign(s, null, mark) })
}
