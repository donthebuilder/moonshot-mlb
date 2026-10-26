// FILM ROOM'S PICTURE (server only, JSX; lib/posts/filmRoom.js imports it lazily, like every card). Donovan, 2026-10-20: "lets build proto types",
// then "looks bland and not up to par with the cards we have now", then of round two: "wow these are beautiful". Drawn FROM the cards we post: the special card's frame and foil
// (lib/cards/specialCard.js ringOf / stripOf / shimmerStrip / bandOf / Glint), cardKit's Frame (the field gradient + grain), Face, Logo, Target and
// the display italic, and the Top 3 card's compact tile (lib/cards/topThreeCard.js CompactTile) for every example row. 1080 x 1350 like them.
//
// ONE CARD PER TOPIC (lib/posts/filmRoom.js TOPICS), each with its own body:
//   called    three tiles: CALLED (holo, a REAL CALLED scorer of the last 7 nights with his face), ON THE BOARD (shimmer), NOT ON THE BOARD (plain)
//   miss      the dot field: one dot per real call of the last 7 nights, landed lit in the accent
//   rank      the #1 hero (MOST LIKELY over a struck LIKELY) and the faces of the last 7 nights' hits ("WE HAD")
//   longshot  the +550 hero tile
//   grading   the four steps as tiles, the last one lit
// and the same banner as the special card: the Target and the week's real numbers. No link, no hashtag, no model chance.
// The Five is not here: it is the Top 3 card with five tiles (lib/cards/topThreeCard.js, compact mode).
import { Frame, assets, renderPng, fs, field, alpha, Face, Target, DISPLAY, INK, INK2, DIM, RULE, CHASSIS } from './cardKit'
import { ringOf, stripOf, shimmerStrip, bandOf, Glint } from './specialCard'
import { CompactTile } from './topThreeCard'
import { initMetrics, fitLine } from './fit'
import { STATUS_WORD } from '../callStatus'
import { BRAND } from '../routes'
import { C } from '../theme'
import { surname } from '../player'

const ACCENT = C.orange                 // DASH orange: a network card, not one product's
const BW = 1022
const BH = 1292
const PAD = 34
const INNER = BW - 2 * PAD

const last = (name) => surname(name).toUpperCase()
/** The banner's numbers: the same real numbers as the post, in caps (null = the series line). Pure. */
export function cardLine(topic, d) {
  if (!d) return null
  if (topic.key === 'called' && d.made) return { kick: 'THE LAST 7 NIGHTS', big: `${d.made} CALLS · ${d.cashed} LANDED` }
  if (topic.key === 'miss' && d.made) return { kick: 'THE LAST 7 NIGHTS', big: `${d.cashed} LANDED · ${d.missed} MISSED` }
  if (topic.key === 'rank' && d.names.length) return { kick: 'THE LAST 7 NIGHTS', big: `${d.names.length} DIFFERENT CALLED SCORERS` }
  if (topic.key === 'longshot' && d.tuesday) return { kick: 'LAST LONGSHOT TUESDAY', big: `${d.tuesday.landed} OF ${d.tuesday.graded} LANDED` }
  if (topic.key === 'grading' && d.sportLines.length) return { kick: 'THE LAST 7 NIGHTS', big: d.sportLines.map((l) => l.split(' · ')[0].replace(/\s+/g, ' ')).join(' · ').toUpperCase() }
  return null
}

// each title line is a list of [words, orange?] segments
const TITLE = {
  called: [[['WHAT', 0], ['CALLED', 1]], [['MEANS', 0]]],
  miss: [[['WHY A GOOD CALL', 0]], [['CAN', 0], ['MISS', 1]]],
  rank: [[['WHAT', 0], ['#1', 1]], [['ON OUR BOARD MEANS', 0]]],
  longshot: [[['WHAT A', 0]], [['LONG SHOT', 1], ['IS', 0]]],
  grading: [[['HOW WE', 0], ['GRADE', 1]]],
}
const DECK = {
  called: 'Three words. Only one of them is ours.',
  miss: 'A call is a read. It is not a promise.',
  rank: 'The top of the board, and what it does not say.',
  longshot: 'The price, and what it is telling you.',
  grading: 'Posted before. Graded after. Nothing changes in between.',
}

// ── the bodies ────────────────────────────────────────────────────────────────────────────────────────────────────────────
const tile = (o) => ({ name: '', team: '', face: '', logo: '', logoPlate: false, tone: null, tier: 'star', holo: false, shimmer: false, ...o })

function StatusRow({ word, what, color, strong = false }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', width: 960, height: 150, padding: '0 30px', gap: 26, borderRadius: 16, background: alpha(INK, 0.045), border: `3px solid ${alpha(color, strong ? 0.6 : 0.3)}`, position: 'relative', overflow: 'hidden' }}>
      <div style={{ display: 'flex', width: 10, height: 96, background: color }} />
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <span style={{ fontFamily: DISPLAY, fontSize: 72, fontWeight: 900, lineHeight: 1, color, transform: 'skewX(-8deg)', whiteSpace: 'nowrap' }}>{word}</span>
        <span style={{ fontSize: fs(30), fontWeight: 700, color: INK2, whiteSpace: 'nowrap' }}>{what}</span>
      </div>
      <span style={{ fontSize: fs(24), fontWeight: 800, letterSpacing: 4, color: DIM, marginLeft: 'auto', whiteSpace: 'nowrap' }}>NOT OURS</span>
    </div>
  )
}
function CalledBody({ ex }) {
  const one = ex
    ? tile({ ...ex, holo: true, tier: 'elite', tag: `${STATUS_WORD.called} · ${BRAND[ex.sport]?.name || ''} · ${ex.dayWord}`, line: 'PICKED BEFORE · HE SCORED' })
    : null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center' }}>
      {one ? <CompactTile t={one} i={0} h={214} accent={ACCENT} rank={false} /> : <StatusRow word={STATUS_WORD.called} what="We picked him. Before the game. In public." color={ACCENT} strong />}
      <StatusRow word={STATUS_WORD.board} what="He made our board. Not a pick." color={INK} />
      <StatusRow word={STATUS_WORD.off} what="We never had him." color={DIM} />
    </div>
  )
}

function MissBody({ d }) {
  const made = d?.made || 0
  const per = made > 120 ? Math.ceil(made / 120) : 1
  const n = Math.ceil(made / per)
  const lit = Math.round((d?.cashed || 0) / per)
  const W = 900, HH = 400, G = 12
  let D = 30
  for (let d = 84; d >= 30; d -= 2) { const cols = Math.floor((W + G) / (d + G)); if (Math.ceil(n / cols) * (d + G) <= HH) { D = d; break } }
  return (
    <Panel h={548}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: G, width: W, height: HH, alignContent: 'center' }}>
        {Array.from({ length: n }, (_, i) => i < lit).map((hit, i) => (
          <div key={i} style={{ display: 'flex', width: D, height: D, borderRadius: D / 2, background: hit ? `radial-gradient(circle at 35% 35%, ${alpha(INK, 0.55)} 0%, ${ACCENT} 45%, ${alpha(ACCENT, 0.85)} 100%)` : alpha(INK, 0.04), border: `3px solid ${hit ? ACCENT : alpha(INK, 0.35)}` }} />
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginTop: 'auto' }}>
        <div style={{ display: 'flex', width: 34, height: 34, borderRadius: 17, background: ACCENT }} /><span style={{ fontSize: fs(30), fontWeight: 800 }}>landed</span>
        <div style={{ display: 'flex', width: 34, height: 34, borderRadius: 17, border: `3px solid ${alpha(INK, 0.5)}`, marginLeft: 26 }} /><span style={{ fontSize: fs(30), fontWeight: 800 }}>missed</span>
        <span style={{ fontSize: fs(26), fontWeight: 600, color: DIM, marginLeft: 'auto' }}>{per > 1 ? `one dot = ${per} calls` : 'one dot = one call'}</span>
      </div>
    </Panel>
  )
}

function RankBody({ d, faces }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Panel h={262} holo>
        <div style={{ display: 'flex', alignItems: 'center', gap: 40 }}>
          <span style={{ fontFamily: DISPLAY, fontSize: 200, fontWeight: 900, lineHeight: 0.9, color: ACCENT, transform: 'skewX(-8deg)' }}>#1</span>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontFamily: DISPLAY, fontSize: 92, fontWeight: 900, lineHeight: 1, transform: 'skewX(-8deg)' }}>MOST LIKELY</span>
            <div style={{ display: 'flex', position: 'relative', height: 92 }}>
              <span style={{ fontFamily: DISPLAY, fontSize: 92, fontWeight: 900, lineHeight: 1, color: DIM, transform: 'skewX(-8deg)' }}>LIKELY</span>
              <div style={{ display: 'flex', position: 'absolute', left: -8, top: 40, width: 250, height: 9, background: ACCENT, transform: 'rotate(-4deg)' }} />
            </div>
          </div>
        </div>
      </Panel>
      <Panel h={290}>
        <span style={{ fontSize: fs(26), fontWeight: 800, letterSpacing: 4, color: ACCENT }}>THE LAST 7 NIGHTS · WE HAD</span>
        <div style={{ display: 'flex', gap: 16, marginTop: 14 }}>
          {(faces || []).slice(0, 5).map((f) => (
            <div key={`${f.sport}${f.id}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 168 }}>
              <div style={{ display: 'flex', width: 120, height: 120, overflow: 'hidden', borderRadius: 12, border: `2px solid ${alpha(ACCENT, 0.6)}`, background: `radial-gradient(circle at 50% 42%, ${alpha(ACCENT, 0.4)} 0%, ${alpha(CHASSIS.bg, 0.3)} 100%)` }}>
                <Face m={f} w={120} h={120} accent={ACCENT} />
              </div>
              <span style={{ fontFamily: DISPLAY, fontSize: 30, fontWeight: 900, marginTop: 6, whiteSpace: 'nowrap', transform: 'skewX(-8deg)' }}>{last(f.name)}</span>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  )
}

function LongshotBody() {
  return (
    <Panel h={548} holo>
      <span style={{ fontSize: fs(30), fontWeight: 800, letterSpacing: 6, color: INK2 }}>OUR LONG SHOT</span>
      <span style={{ fontFamily: DISPLAY, fontSize: 300, fontWeight: 900, lineHeight: 0.92, color: ACCENT, transform: 'skewX(-8deg)', marginTop: 8 }}>+550</span>
      <span style={{ fontFamily: DISPLAY, fontSize: 84, fontWeight: 900, lineHeight: 1, transform: 'skewX(-8deg)' }}>OR LONGER</span>
      <div style={{ display: 'flex', width: INNER - 60, height: 2, background: RULE, marginTop: 'auto' }} />
      <span style={{ fontSize: fs(32), fontWeight: 800, marginTop: 16 }}>Most of these miss. The price says it. So do we.</span>
    </Panel>
  )
}

function GradingBody() {
  const steps = [['POSTED', 'before the game'], ['GAME STARTS', 'the call can’t change'], ['FINAL', 'the box score'], ['GRADED', 'hit or miss, in public']]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {steps.map(([w, s], i) => {
        const on = i === steps.length - 1
        return (
          <div key={w} style={{ display: 'flex', alignItems: 'center', width: 960, height: 128, padding: '0 30px', gap: 28, borderRadius: 16, background: on ? field(ACCENT) : alpha(INK, 0.045), border: `3px solid ${on ? ACCENT : alpha(INK, 0.18)}`, position: 'relative', overflow: 'hidden' }}>
            {on ? <div style={{ display: 'flex', position: 'absolute', left: 0, top: 0, width: 960, height: 7, background: shimmerStrip }} /> : null}
            <span style={{ fontFamily: DISPLAY, fontSize: 90, fontWeight: 900, lineHeight: 1, color: on ? ACCENT : alpha(INK, 0.35), transform: 'skewX(-8deg)', width: 80 }}>{String(i + 1)}</span>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontFamily: DISPLAY, fontSize: 62, fontWeight: 900, lineHeight: 1, transform: 'skewX(-8deg)', color: on ? INK : INK }}>{w}</span>
              <span style={{ fontSize: fs(28), fontWeight: 600, color: on ? INK2 : DIM }}>{s}</span>
            </div>
            {on ? <div style={{ display: 'flex', marginLeft: 'auto' }}><Target size={70} color={ACCENT} /></div> : null}
          </div>
        )
      })}
    </div>
  )
}

/** A body panel in the tile chrome: holo = the ring + strip + wash band, else the quiet tile. */
export function Panel({ h, holo = false, children }) {
  const inner = (
    <div style={{ display: 'flex', flexDirection: 'column', position: 'relative', width: holo ? 952 : 954, height: holo ? h - 8 : h - 6, padding: '26px 30px', borderRadius: holo ? 14 : 16, overflow: 'hidden', background: holo ? field(ACCENT) : alpha(INK, 0.045) }}>
      <div style={{ display: 'flex', position: 'absolute', left: 0, top: 0, width: 960, height: 7, background: holo ? stripOf('elite') : shimmerStrip }} />
      {children}
      {holo ? <div style={{ display: 'flex', position: 'absolute', left: -200, top: Math.round(h * 0.3), width: 1500, height: 80, transform: 'rotate(-10deg)', background: bandOf(0.12) }} /> : null}
      {holo ? <Glint x={900} y={46} s={52} a={0.8} /> : null}
    </div>
  )
  return holo
    ? <div style={{ display: 'flex', width: 960, height: h, borderRadius: 18, background: ringOf('elite'), alignItems: 'center', justifyContent: 'center' }}>{inner}</div>
    : <div style={{ display: 'flex', width: 960, height: h, borderRadius: 18, border: `3px solid ${alpha(ACCENT, 0.45)}`, overflow: 'hidden' }}>{inner}</div>
}

/**
 * One Film Room card (1080 x 1350 PNG). `topic` = TOPICS[i], `n` = its number in the series, `data` = filmData(), `ex` = a real CALLED scorer of the last
 * 7 nights ({ sport, id, name, team, face, logo, logoPlate, dayWord }) or null, `faces` = the last 7 nights' hits with faces, `dayWord` = "Oct 21".
 */
export async function renderFilmRoom({ topic, n = 1, data = null, ex = null, faces = [], dayWord = '' }) {
  const { grain, fonts } = await assets()
  initMetrics(fonts)
  const banner = cardLine(topic, data)
  const lines = TITLE[topic.key] || [[[topic.title, 0]]]
  const words = (segs) => segs.map(([w]) => w).join(' ')
  const titleSize = (() => { for (const sz of [150, 136, 124, 112, 100]) { if (lines.every((segs) => fitLine(words(segs), { sizes: [sz], maxW: INNER - Math.round(sz * 0.17), quiet: true, family: 'Shoulders', weight: 900, upper: true }).fits)) return sz } return 100 })()
  const line = (segs, k) => (
    <div key={k} style={{ display: 'flex', gap: Math.round(titleSize * 0.2), fontFamily: DISPLAY, fontSize: titleSize, fontWeight: 900, lineHeight: 0.96, transform: 'skewX(-8deg)', whiteSpace: 'nowrap' }}>
      {segs.map(([w, orange], j) => <span key={j} style={orange ? { color: ACCENT } : {}}>{w}</span>)}
    </div>
  )
  const body = topic.key === 'called' ? <CalledBody ex={ex} /> : topic.key === 'miss' ? <MissBody d={data} /> : topic.key === 'rank' ? <RankBody d={data} faces={faces} /> : topic.key === 'longshot' ? <LongshotBody /> : <GradingBody />
  const design = (
    <Frame accent={ACCENT} grain={grain}>
      <div style={{ display: 'flex', flexDirection: 'column', position: 'absolute', left: 26, top: 26, width: 1028, height: 1298, border: `3px solid ${alpha(ACCENT, 0.55)}`, borderRadius: 22, overflow: 'hidden' }}>
        <div style={{ display: 'flex', flexDirection: 'column', width: BW, height: BH, position: 'relative' }}>
          <div style={{ display: 'flex', height: 10, background: shimmerStrip }} />
          <div style={{ display: 'flex', alignItems: 'center', height: 64, padding: `0 ${PAD}px`, gap: 22 }}>
            <span style={{ fontSize: fs(34), fontWeight: 800, letterSpacing: 9, color: ACCENT, whiteSpace: 'nowrap' }}>FILM ROOM</span>
            <div style={{ display: 'flex', flexGrow: 1, height: 2, background: alpha(ACCENT, 0.5) }} />
            <span style={{ fontSize: fs(28), fontWeight: 800, letterSpacing: 3, color: INK2, whiteSpace: 'nowrap' }}>{`NO. ${n} · WEDNESDAY`}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', padding: `6px ${PAD}px 0 ${PAD}px` }}>
            {lines.map(line)}
            <span style={{ fontSize: fs(34), fontWeight: 800, color: INK2, marginTop: 18 }}>{DECK[topic.key]}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexGrow: 1 }}>{body}</div>
          <div style={{ display: 'flex', alignItems: 'center', padding: `0 ${PAD - 6}px`, height: 150 }}>
            <div style={{ display: 'flex', alignItems: 'center', width: '100%', height: 116, padding: '0 24px 0 22px', gap: 22, background: `linear-gradient(90deg, ${alpha(ACCENT, 0.22)} 0%, ${alpha(ACCENT, 0.04)} 100%)`, borderStyle: 'solid', borderWidth: '2px 2px 2px 8px', borderColor: `${alpha(ACCENT, 0.4)} ${alpha(ACCENT, 0.4)} ${alpha(ACCENT, 0.4)} ${ACCENT}` }}>
              <Target size={60} color={ACCENT} />
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: fs(24), fontWeight: 800, letterSpacing: 5, color: ACCENT, whiteSpace: 'nowrap' }}>{banner ? banner.kick : 'EVERY CALL, GRADED'}</span>
                <span style={{ fontFamily: DISPLAY, fontSize: banner && banner.big.length > 26 ? 46 : 58, fontWeight: 900, lineHeight: 1.05, whiteSpace: 'nowrap' }}>{banner ? banner.big : 'MISSES INCLUDED'}</span>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 64, padding: `0 ${PAD - 6}px`, gap: 20 }}>
            <span style={{ fontSize: fs(24), fontWeight: 800, color: INK2, letterSpacing: 2, whiteSpace: 'nowrap' }}>CALLED IT · DASH Network</span>
            <div style={{ display: 'flex', flexGrow: 1, height: 2, background: RULE }} />
            <span style={{ fontSize: fs(24), fontWeight: 600, color: DIM, whiteSpace: 'nowrap' }}>{dayWord}</span>
          </div>
          <div style={{ display: 'flex', position: 'absolute', left: -380, top: 300, width: 1800, height: 150, transform: 'rotate(-27deg)', background: bandOf(0.06) }} />
        </div>
      </div>
    </Frame>
  )
  return renderPng(design, { w: 1080, h: 1350 }, { card: 'filmroom', design })
}
