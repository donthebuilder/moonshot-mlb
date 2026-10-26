// THE NETWORK vs THE BOARD: THE SCOREBOARD CARD (server only, JSX; lib/posts/networkVsBoard.js imports it lazily, like every card). 1080 x 1350, drawn
// FROM the cards we post: cardKit's Frame (field + grain), the special card's foil (ringOf / stripOf / shimmerStrip / bandOf / Glint), the display
// italic, Film Room's banner. DASH orange (a network card). Two score panels (the week's leader in holo, a tie both shimmer), then one row per graded
// poll: the product, the two names and the question, the network's pick and the board's, each marked RIGHT (lit) or MISS (grey). No emoji.
import { Frame, assets, renderPng, fs, field, alpha, Target, DISPLAY, INK, INK2, DIM, RULE, CHASSIS } from './cardKit'
import { ringOf, stripOf, shimmerStrip, bandOf, Glint } from './specialCard'
import { SPORT_ACCENT } from '../sportAccent'
import { BRAND } from '../routes'
import { C } from '../theme'
import { lastName } from '../nfl/whoLines'

const ACCENT = C.orange
const MAX_ROWS = 6
const last = (n) => (n === 'Neither' ? 'NEITHER' : lastName(n).toUpperCase())
const Q = { pick: 'FIRST TO SCORE', board: 'FIRST TO CASH', guess: 'MOST OF THREE' }
const LEFT_W = 954 - 40 - 8 - 3 * 18 - 2 * 200      // the row, its padding, the bar, the three gaps, the two picks

function ScorePanel({ w, h, word, value, of, lead }) {
  const inner = (
    <div style={{ display: 'flex', flexDirection: 'column', position: 'relative', alignItems: 'center', justifyContent: 'center', width: w - (lead ? 8 : 6), height: h - (lead ? 8 : 6), borderRadius: lead ? 14 : 16, overflow: 'hidden', background: lead ? field(ACCENT) : alpha(INK, 0.045) }}>
      <div style={{ display: 'flex', position: 'absolute', left: 0, top: 0, width: w, height: 7, background: lead ? stripOf('elite') : shimmerStrip }} />
      <span style={{ fontSize: fs(28), fontWeight: 800, letterSpacing: 6, color: lead ? ACCENT : INK2 }}>{word}</span>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14 }}>
        <span style={{ fontFamily: DISPLAY, fontSize: 210, fontWeight: 900, lineHeight: 0.95, color: lead ? INK : INK2, transform: 'skewX(-8deg)' }}>{String(value)}</span>
        <span style={{ fontFamily: DISPLAY, fontSize: 56, fontWeight: 900, color: DIM, marginBottom: 26, transform: 'skewX(-8deg)' }}>{`OF ${of}`}</span>
      </div>
      {lead ? <div style={{ display: 'flex', position: 'absolute', left: -200, top: Math.round(h * 0.35), width: 1200, height: 70, transform: 'rotate(-10deg)', background: bandOf(0.12) }} /> : null}
      {lead ? <Glint x={w - 50} y={44} s={46} a={0.8} /> : null}
    </div>
  )
  return lead
    ? <div style={{ display: 'flex', width: w, height: h, borderRadius: 18, background: ringOf('elite'), alignItems: 'center', justifyContent: 'center' }}>{inner}</div>
    : <div style={{ display: 'flex', width: w, height: h, borderRadius: 18, border: `3px solid ${alpha(ACCENT, 0.45)}`, overflow: 'hidden' }}>{inner}</div>
}

function Pick({ who, name, right, accent }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', width: 200 }}>
      <span style={{ fontSize: fs(22), fontWeight: 800, letterSpacing: 3, color: DIM, whiteSpace: 'nowrap' }}>{who}</span>
      <span style={{ fontFamily: DISPLAY, fontSize: 36, fontWeight: 900, lineHeight: 1.05, color: right ? INK : DIM, transform: 'skewX(-8deg)', whiteSpace: 'nowrap' }}>{last(name)}</span>
      <span style={{ display: 'flex', fontSize: fs(22), fontWeight: 800, letterSpacing: 3, padding: '1px 10px', marginTop: 2, color: right ? CHASSIS.bg : DIM, background: right ? accent : 'transparent', border: `2px solid ${right ? accent : alpha(INK, 0.25)}`, whiteSpace: 'nowrap' }}>{right ? 'RIGHT' : 'MISS'}</span>
    </div>
  )
}

/** PNG bytes. `week` = { from, to }, `t` = tally(): { n, network, board, graded:[gradePoll()] }. */
export async function renderNetworkCard({ week, t }) {
  const { grain } = await assets()
  const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
  const wk = `WEEK OF ${MON[Number(String(week.from).slice(5, 7)) - 1]} ${Number(String(week.from).slice(8, 10))}`
  const rows = (t.graded || []).slice(0, MAX_ROWS)
  const rowH = rows.length <= 4 ? 132 : rows.length === 5 ? 118 : 104
  // the names line steps down to fit its column (the display face runs about 0.42 em a letter)
  const fitWho = (who) => { const len = who.join(who.length > 2 ? ', ' : ' OR ').length; for (const sz of [44, 40, 36, 32, 28]) if (len * sz * 0.42 <= LEFT_W) return sz; return 26 }
  const more = (t.graded || []).length - rows.length
  const netLead = t.network > t.board, boardLead = t.board > t.network
  const banner = netLead ? `THE NETWORK IS UP ${t.network}–${t.board}` : boardLead ? `THE BOARD IS UP ${t.board}–${t.network}` : `DEAD EVEN ${t.network}–${t.board}`
  const design = (
    <Frame accent={ACCENT} grain={grain}>
      <div style={{ display: 'flex', flexDirection: 'column', position: 'absolute', left: 26, top: 26, width: 1028, height: 1298, border: `3px solid ${alpha(ACCENT, 0.55)}`, borderRadius: 22, overflow: 'hidden' }}>
        <div style={{ display: 'flex', height: 10, background: shimmerStrip }} />
        <div style={{ display: 'flex', alignItems: 'center', height: 64, padding: '0 34px', gap: 22 }}>
          <span style={{ fontSize: fs(30), fontWeight: 800, letterSpacing: 6, color: ACCENT, whiteSpace: 'nowrap' }}>THE NETWORK vs THE BOARD</span>
          <div style={{ display: 'flex', flexGrow: 1, height: 2, background: alpha(ACCENT, 0.5) }} />
          <span style={{ fontSize: fs(26), fontWeight: 800, letterSpacing: 3, color: INK2, whiteSpace: 'nowrap' }}>{wk}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 24, padding: '8px 34px 0 34px' }}>
          <ScorePanel w={468} h={330} word="THE NETWORK" value={t.network} of={t.n} lead={netLead} />
          <ScorePanel w={468} h={330} word="THE BOARD" value={t.board} of={t.n} lead={boardLead} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', padding: '18px 34px 0 34px', gap: 8 }}>
          {rows.map((x, i) => {
            const acc = SPORT_ACCENT[x.sport] || ACCENT
            const who = (x.names || []).map(last)
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', height: rowH, padding: '0 20px', gap: 18, borderRadius: 14, background: alpha(INK, 0.045), border: `2px solid ${alpha(acc, 0.35)}` }}>
                <div style={{ display: 'flex', width: 8, height: 74, background: acc }} />
                <div style={{ display: 'flex', flexDirection: 'column', width: LEFT_W, overflow: 'hidden' }}>
                  <span style={{ fontSize: fs(22), fontWeight: 800, letterSpacing: 3, color: acc, whiteSpace: 'nowrap' }}>{`${BRAND[x.sport]?.name || ''} · ${Q[x.format] || ''}`}</span>
                  <span style={{ fontFamily: DISPLAY, fontSize: fitWho(who), fontWeight: 900, lineHeight: 1.05, transform: 'skewX(-8deg)', whiteSpace: 'nowrap' }}>{who.join(who.length > 2 ? ', ' : ' OR ')}</span>
                </div>
                <Pick who="THE NETWORK" name={x.network} right={x.networkRight} accent={acc} />
                <Pick who="THE BOARD" name={x.board} right={x.boardRight} accent={acc} />
              </div>
            )
          })}
          {more > 0 ? <span style={{ fontSize: fs(24), fontWeight: 700, color: DIM, paddingLeft: 6 }}>{`+ ${more} more polls graded`}</span> : null}
        </div>
        <div style={{ display: 'flex', flexGrow: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', padding: '0 28px', height: 130 }}>
          <div style={{ display: 'flex', alignItems: 'center', width: '100%', height: 108, padding: '0 24px 0 22px', gap: 22, background: `linear-gradient(90deg, ${alpha(ACCENT, 0.22)} 0%, ${alpha(ACCENT, 0.04)} 100%)`, borderStyle: 'solid', borderWidth: '2px 2px 2px 8px', borderColor: `${alpha(ACCENT, 0.4)} ${alpha(ACCENT, 0.4)} ${alpha(ACCENT, 0.4)} ${ACCENT}` }}>
            <Target size={58} color={ACCENT} />
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: fs(24), fontWeight: 800, letterSpacing: 5, color: ACCENT }}>{`${t.n} POLLS GRADED`}</span>
              <span style={{ fontFamily: DISPLAY, fontSize: 54, fontWeight: 900, lineHeight: 1.05, whiteSpace: 'nowrap' }}>{banner}</span>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 64, padding: '0 28px', gap: 20 }}>
          <span style={{ fontSize: fs(24), fontWeight: 800, color: INK2, letterSpacing: 2, whiteSpace: 'nowrap' }}>CALLED IT · DASH Network</span>
          <div style={{ display: 'flex', flexGrow: 1, height: 2, background: RULE }} />
          <span style={{ fontSize: fs(24), fontWeight: 600, color: DIM, whiteSpace: 'nowrap' }}>{t.test ? 'TEST DATA' : 'graded from the box scores'}</span>
        </div>
      </div>
    </Frame>
  )
  return renderPng(design, { w: 1080, h: 1350 }, { card: 'network', design })
}
