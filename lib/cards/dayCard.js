// THE CARD'S DAY LINEUP, AS AN IMAGE (server only, JSX): three straights and the Two-Man of one card window, in the family of the
// player cards. Built from the STORED rows (lib/card/store.js cardRows): nothing here picks or re-ranks. An empty slot says so in
// words (the Card never pads); a Two-Man that does not exist says why not. `scope` is decided by the caller:
//   'full'  the whole Card (the members image, drawn in-process by the members poster; the route serves it only once the Card is public record)
//   'free'  straight #1 and Donovan's Two-Man only (what the free X post may name)
import { Frame, assets, renderPng, sizeOf, fs, fitName, alpha, Face, Logo, Price, Target, matchup, DISPLAY, INK, INK2, DIM, RULE, CHASSIS } from './cardKit'
import { SPORT_ACCENT } from '../sportAccent'
import { STATUS_WORD } from '../callStatus'

const Mini = ({ m, size, nameMax, nameBase, accent }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
    <div style={{ display: 'flex', position: 'relative', width: size, height: size, borderRadius: size / 2, overflow: 'hidden', background: alpha(m.tone || accent, 0.3), border: `3px solid ${alpha(accent, 0.7)}` }}>
      <div style={{ display: 'flex', position: 'absolute', left: 0, bottom: 0 }}><Face m={m} w={size} h={size} accent={accent} /></div>
    </div>
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <span style={{ fontFamily: DISPLAY, fontSize: fitName(m.name, nameBase, nameMax), fontWeight: 900, lineHeight: 1, textTransform: 'uppercase', transform: 'skewX(-8deg)', whiteSpace: 'nowrap' }}>{m.name}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
        <Logo m={m} size={36} />
        <span style={{ fontSize: fs(28), fontWeight: 800, whiteSpace: 'nowrap' }}>{matchup(m)}</span>
        <span style={{ fontSize: fs(26), fontWeight: 700, color: m.status === 'called' ? accent : INK2, whiteSpace: 'nowrap' }}>{STATUS_WORD[m.status] || ''}</span>
      </div>
    </div>
  </div>
)

const SlotHead = ({ label, stake, accent }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
    <span style={{ fontSize: fs(26), fontWeight: 800, letterSpacing: 4, color: accent }}>{label}</span>
    <span style={{ fontSize: fs(24), fontWeight: 700, color: DIM }}>{stake}</span>
  </div>
)

export function dayDesign(d, grain) {
  const accent = SPORT_ACCENT[d.sport]
  const free = d.scope === 'free'
  const slots = free ? d.straights.slice(0, 1) : [0, 1, 2].map((i) => d.straights[i] || null)
  const frame = { display: 'flex', flexDirection: 'column', gap: 10, padding: '14px 24px', borderRadius: 14, border: `2px solid ${alpha(accent, 0.4)}`, background: alpha(INK, 0.045) }
  const empty = (label, why) => (
    <div style={{ ...frame, border: `2px dashed ${alpha(INK, 0.22)}`, background: 'transparent', justifyContent: 'center', height: 150 }}>
      <SlotHead label={label} stake="" accent={accent} />
      <span style={{ fontSize: fs(28), fontWeight: 700, color: DIM }}>{why}</span>
    </div>
  )
  const rowH = free ? 250 : 220
  const straight = (s, i) => {
    const label = `STRAIGHT ${i + 1}`
    if (!s) return <div key={label} style={{ display: 'flex', flexDirection: 'column' }}>{empty(label, 'No further call in a different game')}</div>
    return (
      <div key={label} style={{ ...frame, height: rowH, justifyContent: 'center' }}>
        <SlotHead label={label} stake={`${s.stake} unit`} accent={accent} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Mini m={s.m} size={104} nameMax={400} nameBase={62} accent={accent} />
          <Price price={s.price} accent={accent} size={50} />
        </div>
        {s.m.why ? <span style={{ fontSize: fs(24), fontWeight: 600, color: INK2, whiteSpace: 'nowrap' }}>{s.m.why}</span> : null}
      </div>
    )
  }
  const twoBox = (t, label, note) => (
    <div style={{ ...frame, height: 310, justifyContent: 'center', border: `2px solid ${alpha(accent, 0.75)}`, background: `linear-gradient(90deg, ${alpha(accent, 0.18)} 0%, ${alpha(accent, 0.04)} 100%)` }}>
      <SlotHead label={label} stake={`${t.stake} unit · different games`} accent={accent} />
      {t.legs.map((l) => (
        <div key={l.m.playerId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Mini m={l.m} size={86} nameMax={400} nameBase={52} accent={accent} />
          <Price price={l.price} accent={accent} size={44} />
        </div>
      ))}
      {note ? <span style={{ fontSize: fs(24), fontWeight: 700, color: INK2, whiteSpace: 'nowrap' }}>{note}</span> : null}
    </div>
  )
  const botTwo = free ? null : d.two ? twoBox(d.two, 'TWO-MAN', d.two.price ? `about ${d.two.price} best, the two prices multiplied` : null) : empty('TWO-MAN', 'No pair from two different games')
  const donTwo = d.donovan ? twoBox(d.donovan, "DONOVAN'S TWO-MAN", d.donovan.note || null) : null
  return (
    <Frame accent={accent} tone={null} grain={grain}>
      <div style={{ display: 'flex', position: 'absolute', left: 26, top: 26, width: 1028, height: 1298, border: `3px solid ${alpha(accent, 0.55)}`, borderRadius: 22, flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', height: 118, padding: '0 34px', gap: 22, borderBottom: `2px solid ${alpha(accent, 0.45)}`, background: alpha(accent, 0.14) }}>
          <Target size={64} color={accent} />
          <span style={{ fontFamily: DISPLAY, fontSize: 76, fontWeight: 900, textTransform: 'uppercase', transform: 'skewX(-8deg)', whiteSpace: 'nowrap' }}>{`THE CARD · ${d.league}`}</span>
          <div style={{ display: 'flex', flexGrow: 1 }} />
          <span style={{ fontSize: fs(34), fontWeight: 800, color: INK2, whiteSpace: 'nowrap' }}>{d.dayWord}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '20px 30px 0 30px' }}>
          {slots.map((s, i) => straight(s, i))}
          {botTwo}
          {donTwo}
        </div>
        <div style={{ display: 'flex', position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'space-between', height: 70, padding: '0 34px', borderTop: `2px solid ${RULE}`, gap: 20 }}>
          <span style={{ fontSize: fs(24), fontWeight: 800, color: INK2, letterSpacing: 2, whiteSpace: 'nowrap' }}>{`${d.brandName} · DASH Network`}</span>
          <span style={{ fontSize: fs(24), fontWeight: 600, color: DIM, whiteSpace: 'nowrap' }}>{`one ${d.market} market · graded in public`}</span>
        </div>
      </div>
    </Frame>
  )
}

/** PNG bytes of the day lineup at `width` px (4:5). */
export async function renderDay(d, { width } = {}) {
  const { grain } = await assets()
  const size = sizeOf(width)
  return renderPng(dayDesign(d, grain), size, { card: `day-${d.scope}`, design: dayDesign(d, null) })
}
