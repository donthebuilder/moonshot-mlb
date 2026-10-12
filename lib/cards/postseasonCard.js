// THE POSTSEASON CARDS, IN THE BASEBALL-CARD LOOK (server only, JSX). Same frame, fonts, slanted display-caps names and chassis as the player
// card (lib/cards/playerCard.js) and the share cards (lib/cards/shareCards.js Shell); the only addition is the POSTSEASON BANNER, drawn in the
// product's accent from lib/sportAccent. Three drawings, all 1080 x 1350 (4:5):
//   postseasonFront  one player: banner, portrait, name, six tiles of THIS postseason, his latest game
//   postseasonBack   the same cream stat-table back as the season card (lib/cards/playerBack.js), by round, with the total and career postseason
//   seriesDesign     one club's run: series results by round, the record, leaders, and its players' lines
// Models come from lib/cards/postseason.js (every number is MLB's own; nothing is printed that the source does not hold; no probability).
import { Frame, assets, renderPng, sizeOf, fs, fitName, alpha, Face, Logo, DISPLAY, INK, INK2, DIM, RULE, CHASSIS } from './cardKit'
import { Shell } from './shareCards'
import { backDesign } from './playerBack'
import { SPORT_ACCENT } from '../sportAccent'

const accent = SPORT_ACCENT.mlb
const W_IN = 1028

// THE ACTION-PHOTO ART (Donovan, 2026-10-12: "i just want action picture for the cards"). MLB's own action photo of the player (2:3) fills the card
// edge to edge BEHIND the frame, under a dark scrim that is light over the picture and nearly solid under the name and tiles, so the type stays
// readable on any photo (white-on-dark, checked on real photos by scripts/check-postseason-cards.mjs through SCRIM). No photo = the silo headshot portrait, as before.
export const SCRIM = Object.freeze([[0, 0.66], [0.1, 0.6], [0.26, 0.4], [0.38, 0.7], [0.5, 0.88], [0.6, 0.94], [1, 0.95]])   // [position 0-1, black alpha]
/** The scrim's alpha at a position (0 = top of the art, 1 = bottom), linear between the stops: the SAME numbers the gradient is drawn from. */
export const scrimAt = (p) => { const x = Math.max(0, Math.min(1, p)); for (let i = 1; i < SCRIM.length; i++) if (x <= SCRIM[i][0]) { const [p0, a0] = SCRIM[i - 1], [p1, a1] = SCRIM[i]; return a0 + ((a1 - a0) * (x - p0)) / (p1 - p0) } return SCRIM[SCRIM.length - 1][1] }
const scrimCss = `linear-gradient(180deg, ${SCRIM.map(([p, a]) => `${alpha(CHASSIS.bg, a)} ${Math.round(p * 100)}%`).join(', ')})`
export const ART_BOX = Object.freeze({ w: 1022, h: 1292 })
export const ArtLayer = ({ art }) => (
  <div style={{ display: 'flex', position: 'absolute', left: 0, top: 0, width: ART_BOX.w, height: ART_BOX.h }}>
    <img src={art} width={ART_BOX.w} height={ART_BOX.h} style={{ objectFit: 'cover' }} />
    <div style={{ display: 'flex', position: 'absolute', left: 0, top: 0, width: ART_BOX.w, height: ART_BOX.h, background: scrimCss }} />
  </div>
)

const Banner = ({ right, word = 'POSTSEASON' }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 80, padding: '0 28px', background: accent }}>
    <span style={{ fontFamily: DISPLAY, fontSize: 64, fontWeight: 900, letterSpacing: 6, color: CHASSIS.bg, textTransform: 'uppercase', transform: 'skewX(-8deg)', whiteSpace: 'nowrap' }}>{word}</span>
    <span style={{ fontSize: fs(34), fontWeight: 800, letterSpacing: 4, color: CHASSIS.bg, whiteSpace: 'nowrap' }}>{right || ''}</span>
  </div>
)

function Tile({ t, w }) {
  const text = String(t.value)
  const big = text.length >= 8 ? 56 : text.length >= 6 ? 64 : 74
  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: w, height: 160, padding: '0 22px', borderLeft: `2px solid ${alpha(INK, 0.12)}`, justifyContent: 'center' }}>
      <span style={{ fontSize: fs(22), fontWeight: 800, color: DIM, letterSpacing: 0.4, whiteSpace: 'nowrap' }}>{t.label}</span>
      <span style={{ fontFamily: DISPLAY, fontSize: big, fontWeight: 900, lineHeight: 1, color: INK, whiteSpace: 'nowrap', marginTop: 2 }}>{text}</span>
      <span style={{ fontSize: fs(22), fontWeight: 600, color: INK2, whiteSpace: 'nowrap', marginTop: 8 }}>{t.sub || ''}</span>
    </div>
  )
}

/** The design of a player's postseason FRONT, as an element (exported for the type lint and the check). */
export function postseasonFront(m, grain) {
  const tiles = (m.tiles || []).slice(0, 6)
  const cols = 3
  const rows = Math.ceil(tiles.length / cols)
  const inner = 1080 - 2 * 34
  const tileW = Math.floor(inner / cols)
  const portraitH = 335
  const nameSize = fitName(m.name, 150, inner - 70)
  const lastLine = m.last ? [m.last.dayWord, m.last.opp ? `${m.last.isHome === false ? '@' : 'vs'} ${m.last.opp}` : ''].filter(Boolean).join(' · ') : ''
  return (
    <Shell accent={accent} tone={m.tone} grain={grain} called={false} kicker={`${m.season} POSTSEASON`} right={m.pos || ''} brand={m.brand.name} footRight={m.dayWord} art={m.art ? <ArtLayer art={m.art} /> : null}>
      <Banner right={m.roundTag} />
      <div style={{ display: 'flex', position: 'relative', width: W_IN - 6, height: portraitH, overflow: 'hidden', borderBottom: `2px solid ${alpha(accent, 0.45)}`, background: m.art ? 'transparent' : `radial-gradient(circle at 50% 42%, ${alpha(m.tone || accent, 0.42)} 0%, ${alpha(accent, 0.08)} 64%, ${alpha(CHASSIS.bg, 0.3)} 100%)` }}>
        {m.logo && !m.art ? <div style={{ display: 'flex', position: 'absolute', right: -90, top: 30, opacity: 0.16 }}><Logo m={m} size={Math.round(portraitH * 0.95)} /></div> : null}
        {m.art ? null : <div style={{ display: 'flex', position: 'absolute', left: Math.round((1022 - portraitH) / 2), bottom: 0 }}><Face m={m} w={portraitH} h={portraitH} accent={accent} /></div>}
        <div style={{ display: 'flex', position: 'absolute', left: 26, top: 20 }}>
          <span style={{ fontSize: fs(24), fontWeight: 800, letterSpacing: 1, color: INK, background: alpha(CHASSIS.bg, 0.7), borderStyle: 'solid', borderWidth: '2px 2px 2px 6px', borderColor: `${alpha(INK, 0.22)} ${alpha(INK, 0.22)} ${alpha(INK, 0.22)} ${accent}`, padding: '6px 16px', whiteSpace: 'nowrap' }}>{`${m.games} GAME${m.games === 1 ? '' : 'S'} THIS POSTSEASON`}</span>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', padding: '10px 34px 0 28px' }}>
        <span style={{ fontFamily: DISPLAY, fontSize: nameSize, fontWeight: 900, lineHeight: 1.02, textTransform: 'uppercase', transform: 'skewX(-8deg)', letterSpacing: -0.5, whiteSpace: 'nowrap', height: 150, alignItems: 'center', display: 'flex' }}>{m.name}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, height: 70 }}>
          <Logo m={m} size={52} />
          <span style={{ fontSize: fs(40), fontWeight: 800, whiteSpace: 'nowrap' }}>{m.team}</span>
          <span style={{ fontSize: fs(28), fontWeight: 600, color: DIM, whiteSpace: 'nowrap' }}>{[m.club && m.club !== m.team ? m.club : '', m.number != null ? `#${m.number}` : ''].filter(Boolean).join('  ·  ')}</span>
        </div>
      </div>
      <div style={{ display: 'flex', height: 2, margin: '0 28px', background: RULE }} />
      <div style={{ display: 'flex', flexDirection: 'column', margin: '12px 28px 0 6px' }}>
        {Array.from({ length: rows }, (_, r) => <div key={r} style={{ display: 'flex' }}>{tiles.slice(r * cols, r * cols + cols).map((t) => <Tile key={t.label} t={t} w={tileW} />)}</div>)}
      </div>
      <span style={{ fontSize: fs(22), fontWeight: 600, color: DIM, padding: '8px 34px 0 28px', whiteSpace: 'nowrap', height: 38 }}>{m.group === 'pitching' ? 'MLB postseason pitching, this year only' : 'MLB postseason hitting, this year only'}</span>
      <div style={{ display: 'flex', flexGrow: 1, alignItems: 'center', padding: '0 28px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', width: '100%', height: 104, padding: '0 24px 0 22px', background: alpha(INK, 0.05), borderStyle: 'solid', borderWidth: '2px 2px 2px 8px', borderColor: `${alpha(INK, 0.14)} ${alpha(INK, 0.14)} ${alpha(INK, 0.14)} ${accent}` }}>
          <span style={{ fontSize: fs(22), fontWeight: 800, letterSpacing: 5, color: accent, whiteSpace: 'nowrap' }}>{`LATEST GAME${m.last?.round ? ` · ${m.last.round}` : ''}`}</span>
          <span style={{ fontFamily: DISPLAY, fontSize: 44, fontWeight: 900, lineHeight: 1.05, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{m.last?.summary || lastLine}</span>
          {m.last?.summary ? <span style={{ fontSize: fs(22), fontWeight: 600, color: INK2, whiteSpace: 'nowrap' }}>{lastLine}</span> : null}
        </div>
      </div>
    </Shell>
  )
}

/** The BACK of a player's postseason edition: the season card's cream stat-table back with the postseason table (rounds, total, career). */
export function postseasonBack(m, grain, size) {
  const b = m.back
  const back = { ...b, cols: b.cols, rows: b.rows, career: b.totalRow, playoffs: b.career ? { ...b.career, rd: 'CAREER', season: 'CAREER' } : null, bio: b.bio }
  return backDesign({ ...m, face: m.faceArt || m.face, dayWord: m.dayWord, stats: [], why: '' }, back, grain, size)
}

// ── THE SERIES CARD ───────────────────────────────────────────────────────
const Cell = ({ w, children, size = 26, weight = 700, color = INK, align = 'flex-end' }) => (
  <div style={{ display: 'flex', width: w, justifyContent: align, flexShrink: 0 }}><span style={{ fontSize: fs(size), fontWeight: weight, color, whiteSpace: 'nowrap' }}>{children}</span></div>
)
const TH = ({ cols, first }) => (
  <div style={{ display: 'flex', alignItems: 'center', height: 36, padding: '0 22px', background: alpha(accent, 0.12), gap: 0 }}>
    <Cell w={first} size={22} weight={800} color={DIM} align="flex-start">{cols[0]}</Cell>
    {cols.slice(1).map(([h, w]) => <Cell key={h} w={w} size={22} weight={800} color={DIM}>{h}</Cell>)}
  </div>
)

function PlayerRows({ rows, cols, first }) {
  return rows.map((r, i) => (
    <div key={r.id || r.name} style={{ display: 'flex', alignItems: 'center', height: 56, padding: '0 22px', background: i % 2 ? 'transparent' : alpha(INK, 0.045) }}>
      <div style={{ display: 'flex', width: first, alignItems: 'center', gap: 12, flexShrink: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', width: 52, height: 52, borderRadius: 26, overflow: 'hidden', flexShrink: 0, background: alpha(accent, 0.25) }}><Face m={{ name: r.name, face: r.face }} w={52} h={52} accent={accent} /></div>
        <span style={{ fontFamily: DISPLAY, fontSize: 32, fontWeight: 900, textTransform: 'uppercase', transform: 'skewX(-8deg)', whiteSpace: 'nowrap' }}>{r.name}</span>
      </div>
      {cols.map(([h, w, k]) => <Cell key={h} w={w} color={['hr', 'rbi', 'k'].includes(k) && Number(r[k]) > 0 ? INK : INK2}>{r[k]}</Cell>)}
    </div>
  ))
}

/** The design of a club's postseason run (series card). */
export function seriesDesign(m, grain) {
  const hCols = [['G', 70, 'g'], ['AB', 76, 'ab'], ['H', 70, 'h'], ['HR', 76, 'hr'], ['RBI', 86, 'rbi'], ['AVG', 110, 'avg'], ['OPS', 110, 'ops']]
  const pCols = [['G', 70, 'g'], ['IP', 90, 'ip'], ['W-L', 96, 'wl'], ['SV', 70, 'sv'], ['K', 70, 'k'], ['ERA', 100, 'era'], ['WHIP', 110, 'whip']]
  const first = W_IN - 6 - 44 - [...hCols].reduce((a, c) => a + c[1], 0) - 8
  const nameMax = 520
  const series = (m.series || []).slice(0, 4)
  const lead = m.status
  return (
    <Shell accent={accent} tone={m.tone} grain={grain} called={false} kicker={`${m.season} POSTSEASON`} right="THE RUN" brand={m.brand.name} footRight={m.dayWord}>
      <Banner right={m.record.word} word={lead.key === 'champ' ? 'CHAMPIONS' : 'POSTSEASON'} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 22, height: 150, padding: '0 28px', borderBottom: `2px solid ${alpha(accent, 0.45)}`, background: `radial-gradient(circle at 20% 50%, ${alpha(m.tone || accent, 0.34)} 0%, ${alpha(accent, 0.05)} 70%)` }}>
        <Logo m={m} size={112} />
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontFamily: DISPLAY, fontSize: fitName(m.teamName, 84, 780), fontWeight: 900, lineHeight: 1.02, textTransform: 'uppercase', transform: 'skewX(-8deg)', whiteSpace: 'nowrap' }}>{m.teamName}</span>
          <span style={{ fontSize: fs(30), fontWeight: 800, letterSpacing: 4, color: lead.key === 'out' ? INK2 : accent, whiteSpace: 'nowrap' }}>{`${lead.word}  ·  ${m.record.w} W  ${m.record.l} L`}</span>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', margin: '0 8px', borderTop: `2px solid ${alpha(accent, 0.45)}` }}>
        <div style={{ display: 'flex', alignItems: 'center', height: 36, padding: '0 22px', background: alpha(accent, 0.12) }}>
          <Cell w={250} size={22} weight={800} color={DIM} align="flex-start">ROUND</Cell>
          <Cell w={470} size={22} weight={800} color={DIM} align="flex-start">AGAINST</Cell>
          <Cell w={250} size={22} weight={800} color={DIM}>SERIES</Cell>
        </div>
        {series.map((s, i) => (
          <div key={`${s.tag}${s.opp}`} style={{ display: 'flex', alignItems: 'center', height: 56, padding: '0 22px', background: i % 2 ? 'transparent' : alpha(INK, 0.045) }}>
            <Cell w={250} align="flex-start" weight={800} size={28}>{s.tag}</Cell>
            <Cell w={470} align="flex-start" color={INK2}>{s.opp}</Cell>
            <Cell w={250} weight={800} size={28} color={s.status === 'lost' ? DIM : s.status === 'live' ? INK : accent}>{s.word}</Cell>
          </div>
        ))}
      </div>
      {m.leaders.length ? (
        <div style={{ display: 'flex', margin: '12px 8px 0 8px', borderTop: `2px solid ${RULE}`, borderBottom: `2px solid ${RULE}` }}>
          {m.leaders.slice(0, 4).map((l) => (
            <div key={l.label} style={{ display: 'flex', flexDirection: 'column', width: Math.floor((W_IN - 22) / Math.min(4, m.leaders.length)), padding: '8px 14px', borderLeft: `2px solid ${alpha(INK, 0.1)}` }}>
              <span style={{ fontSize: fs(22), fontWeight: 800, color: DIM, letterSpacing: 1, whiteSpace: 'nowrap' }}>{l.label}</span>
              <span style={{ fontFamily: DISPLAY, fontSize: 52, fontWeight: 900, lineHeight: 1, color: accent }}>{l.value}</span>
              <span style={{ fontSize: fs(22), fontWeight: 700, color: INK2, whiteSpace: 'nowrap', overflow: 'hidden', maxWidth: Math.floor((W_IN - 22) / Math.min(4, m.leaders.length)) - 28 }}>{l.word}</span>
            </div>
          ))}
        </div>
      ) : null}
      <div style={{ display: 'flex', flexDirection: 'column', margin: '12px 8px 0 8px', borderTop: `2px solid ${alpha(accent, 0.45)}` }}>
        <TH first={first} cols={['BATTERS', ...hCols]} />
        {PlayerRows({ rows: m.hitters, cols: hCols, first })}
      </div>
      {m.pitchers.length ? (
        <div style={{ display: 'flex', flexDirection: 'column', margin: '12px 8px 0 8px', borderTop: `2px solid ${alpha(accent, 0.45)}` }}>
          <TH first={first} cols={['PITCHERS', ...pCols]} />
          {PlayerRows({ rows: m.pitchers, cols: pCols, first })}
        </div>
      ) : null}
      <span style={{ fontSize: fs(22), fontWeight: 600, color: DIM, padding: '8px 34px 0 34px', whiteSpace: 'nowrap' }}>{`this postseason only · ${m.order}`}</span>
    </Shell>
  )
}

/** PNG bytes of a postseason model (kind 'postseason': side 'front' | 'back'; kind 'series'). */
export async function renderPostseason(m, { side = 'front', width } = {}) {
  const { grain } = await assets()
  const size = sizeOf(width)
  if (m.kind === 'series') return renderPng(seriesDesign(m, grain), size, { card: 'series', design: seriesDesign(m, null) })
  if (side === 'back') return renderPng(postseasonBack(m, grain, size), size, { card: 'postseason-back', design: postseasonBack(m, null) })
  return renderPng(postseasonFront(m, grain), size, { card: 'postseason-front', design: postseasonFront(m, null) })
}
