// THE SHARE CARDS, IN THE BASEBALL-CARD LOOK (server only, JSX). Donovan, 2026-10-12: "everything should be the baseball card look, even
// the one for the games". Every 📸 download (MOONSHOT, TUDDY, LAMP, BUCKETS) is now drawn by the SERVER card kit instead of the old browser
// canvas (lib/cards/kit.js + cards.js): the same frame as the player front (lib/cards/playerCard.js), the same foil strip (a CALLED #1 only),
// slanted display-caps names, the club logo, the display-number type and the product's accent only. Six layouts:
//   rankedDesign   a ranked list, #1 as the lead card           (MLB board / watchlist, TUDDY rankings, LAMP rankings, BUCKETS rankings)
//   gameDesign     one game: the two clubs, the team model's expected count, the men on the board (the calls first)
//   pitcherDesign  one starter and his tiles + the bat his split is built around   (MOONSHOT pitcher modal)
//   pickDesign     one TUDDY pick for one market, pregame or graded                 (TUDDY player modal, Accountability)
//   recordDesign   the season record by category                                    (MOONSHOT Results)
// Nothing here names a sport: each model arrives from lib/cards/shareData.js with the sport's own words, numbers and pictures, and the
// status words come only from lib/callStatus STATUS_WORD. A miss is built from the greys (no red); a man who did not play is VOID.
// Models (plain data, every field optional but the ones named):
//   list   { sport, brand:{name}, kicker, sub, dayWord, lead|null, banner|null, rows:[row], more, empty, note, headLabel }
//   row    { rank, name, team, where, opp, face, logo, logoPlate, tone, status, score, pct, tag, result:{text,hot}, miss }
//   lead   a row + { pos, number, scoreWord, line }
//   banner { away:{team,logo,logoPlate}, home:{...}, when, proj:{label,away,home,total}|null }
import { markNow } from './assets'
import { Frame, assets, renderPng, sizeOf, fs, fitName, foil, alpha, heat, ord, Bar, Face, Logo, Target, matchup, DISPLAY, INK, INK2, DIM, RULE, CHASSIS } from './cardKit'
import { SPORT_ACCENT } from '../sportAccent'
import { STATUS_WORD } from '../callStatus'
import { heroTone, WASH_MAX } from './clubTone'
import { initMetrics, textWidth, fitLine, fitBlock, ellipsize, initialName, logFit } from './fit'

export const MAX_ROWS = 8
export const MAX_GAME_ROWS = 8
const W_IN = 1028        // the inner frame
const H_IN = 1298
const FOOT = 64

const wordOf = (s) => STATUS_WORD[s] || ''

/** THE SHELL: the frame every share card wears (the player front's chrome): thin accent border, the foil strip (called only), the letter-spaced kicker + rule + right word, the quiet footer. */
export function Shell({ accent, tone, grain, called, kicker, right, brand, footRight, art = null, children }) {
  return (
    <Frame accent={accent} tone={tone} grain={grain}>
      <div style={{ display: 'flex', position: 'absolute', left: 26, top: 26, width: W_IN, height: H_IN, border: `3px solid ${alpha(accent, 0.55)}`, borderRadius: 22, flexDirection: 'column', overflow: 'hidden' }}>
        {/* depth: the corners fall away into the chassis dark, the middle stays lit */}
        <div style={{ display: 'flex', position: 'absolute', left: 0, top: 0, width: W_IN, height: H_IN, background: `radial-gradient(circle at 50% 38%, ${alpha(CHASSIS.bg, 0)} 46%, ${alpha(CHASSIS.bg, 0.55)} 100%)` }} />
        {art}
        {called ? <div style={{ display: 'flex', height: 10, background: foil(accent) }} /> : <div style={{ display: 'flex', height: 10 }} />}
        <div style={{ display: 'flex', alignItems: 'center', height: 52, padding: '0 22px 0 26px', gap: 22 }}>
          <span style={{ fontSize: fs(30), fontWeight: 800, letterSpacing: 8, color: called ? accent : INK2, whiteSpace: 'nowrap' }}>{kicker}</span>
          <div style={{ display: 'flex', flexGrow: 1, height: 2, background: alpha(accent, called ? 0.5 : 0.25) }} />
          <span style={{ fontSize: fs(26), fontWeight: 800, letterSpacing: 2, color: INK2, whiteSpace: 'nowrap' }}>{right || ''}</span>
        </div>
        {children}
        {/* THE BRAND STRIP: the DASH mark, the product, the day; an accent wash rising from the bottom edge and a foil hairline above it */}
        <div style={{ display: 'flex', position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'space-between', height: FOOT, padding: '0 28px', gap: 18, background: `linear-gradient(0deg, ${alpha(accent, 0.2)} 0%, ${alpha(accent, 0)} 100%)`, borderTop: `2px solid ${alpha(accent, 0.4)}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {markNow() ? <img src={markNow()} width={38} height={38} style={{ borderRadius: 8 }} /> : null}
            <span style={{ fontSize: fs(24), fontWeight: 800, color: INK2, letterSpacing: 2, whiteSpace: 'nowrap' }}>{`${brand} · DASH Network`}</span>
          </div>
          <div style={{ display: 'flex', flexGrow: 1, height: 2, background: RULE }} />
          <span style={{ fontSize: fs(24), fontWeight: 700, color: INK2, whiteSpace: 'nowrap' }}>{footRight || ''}</span>
        </div>
      </div>
    </Frame>
  )
}

const Slant = ({ children, size, color = INK, h, style }) => (
  <span style={{ fontFamily: DISPLAY, fontSize: size, fontWeight: 900, lineHeight: 1.02, textTransform: 'uppercase', transform: 'skewX(-8deg)', whiteSpace: 'nowrap', color, display: 'flex', alignItems: 'center', ...(h ? { height: h } : {}), ...style }}>{children}</span>
)

/** The status word as quiet text: accent only for a call. */
const StatusWord = ({ status, accent, size = 24 }) => (status ? <span style={{ fontSize: fs(size), fontWeight: 800, letterSpacing: 1, color: status === 'called' ? accent : DIM, whiteSpace: 'nowrap' }}>{wordOf(status)}</span> : null)

// ── the list table ─────────────────────────────────────────────────────────
const ROW_H = 72
function Row({ r, i, accent, wordW = 0 }) {
  const missed = Boolean(r.miss)
  const called = r.status === 'called' && !missed
  const h = r.pct != null ? heat(r.pct, accent) : { c: INK, hot: r.rank <= 3 }
  const rightW = r.result ? 190 : 120
  const nameMax = W_IN - 6 - 44 - 60 - 60 - 3 * 16 - rightW - 10
  const sub = r.where ? `${r.team}  ${r.where}` : `${r.team}${r.opp ? ` vs ${r.opp}` : ''}`
  return (
    <div style={{ display: 'flex', alignItems: 'center', height: ROW_H, padding: '0 22px 0 16px', gap: 16, borderLeft: `6px solid ${called ? accent : 'transparent'}`, background: called ? `linear-gradient(90deg, ${alpha(accent, 0.2)} 0%, ${alpha(accent, 0.02)} 70%)` : i % 2 ? 'transparent' : alpha(INK, 0.045) }}>
      <span style={{ fontFamily: DISPLAY, fontSize: 40, fontWeight: 900, width: 60, justifyContent: 'flex-end', display: 'flex', color: r.rank <= 3 && !missed ? INK : DIM }}>{String(r.rank)}</span>
      <div style={{ display: 'flex', width: 60, height: 60, borderRadius: 30, overflow: 'hidden', flexShrink: 0, border: `3px solid ${called ? alpha(accent, 0.8) : alpha(INK, 0.2)}`, background: alpha(r.tone || accent, 0.3), opacity: missed ? 0.55 : 1 }}>
        <Face m={{ name: r.name, face: r.face, tone: r.tone }} w={54} h={54} accent={accent} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', width: nameMax, overflow: 'hidden' }}>
        <Slant size={fitName(r.name, 40, nameMax)} color={missed ? DIM : INK}>{r.name}</Slant>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 30, whiteSpace: 'nowrap' }}>
          {r.logo ? <Logo m={{ team: r.team, logo: r.logo, logoPlate: r.logoPlate }} size={26} /> : null}
          <span style={{ fontSize: fs(24), fontWeight: 700, color: INK2, whiteSpace: 'nowrap' }}>{sub}</span>
          {r.status ? <StatusWord status={r.status} accent={accent} /> : null}
          {r.tag ? <span style={{ fontSize: fs(24), fontWeight: 800, color: INK2, whiteSpace: 'nowrap' }}>{r.tag}</span> : null}
        </div>
      </div>
      <div style={{ display: 'flex', width: rightW, justifyContent: 'flex-end', marginLeft: 'auto' }}>
        {r.result
          ? <span style={{ fontFamily: DISPLAY, fontSize: 46, fontWeight: 900, whiteSpace: 'nowrap', color: r.result.hot ? accent : missed ? DIM : INK }}>{r.result.text}</span>
          : <span style={{ fontFamily: DISPLAY, fontSize: 56, fontWeight: 900, lineHeight: 1, color: h.c, transform: 'skewX(-8deg)' }}>{r.score == null ? '—' : String(Math.round(r.score))}</span>}
      </div>
    </div>
  )
}

function Table({ rows, accent, head, empty }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', margin: '0 8px', borderTop: `2px solid ${alpha(accent, 0.45)}` }}>
      <div style={{ display: 'flex', alignItems: 'center', height: 40, padding: '0 22px', background: alpha(accent, 0.12), gap: 16 }}>
        <span style={{ fontSize: fs(22), fontWeight: 800, letterSpacing: 3, color: DIM, width: 60, display: 'flex', justifyContent: 'flex-end' }}>#</span>
        <span style={{ fontSize: fs(22), fontWeight: 800, letterSpacing: 3, color: DIM }}>PLAYER</span>
        <span style={{ fontSize: fs(22), fontWeight: 800, letterSpacing: 3, color: DIM, marginLeft: 'auto', whiteSpace: 'nowrap' }}>{head}</span>
      </div>
      {rows.length ? rows.map((r, i) => <Row key={`${r.rank}-${r.name}`} r={r} i={i} accent={accent} />) : (
        <div style={{ display: 'flex', alignItems: 'center', height: 120, padding: '0 22px' }}><span style={{ fontSize: fs(30), fontWeight: 700, color: DIM }}>{empty || 'Nothing to show on this list.'}</span></div>
      )}
    </div>
  )
}

const Tag = ({ children, accent, called }) => (
  <span style={{ fontSize: fs(24), fontWeight: 800, letterSpacing: 1, color: INK, background: alpha(CHASSIS.bg, 0.7), borderStyle: 'solid', borderWidth: '2px 2px 2px 6px', borderColor: `${alpha(INK, 0.22)} ${alpha(INK, 0.22)} ${alpha(INK, 0.22)} ${called ? accent : alpha(INK, 0.4)}`, padding: '6px 16px', alignSelf: 'flex-start', whiteSpace: 'nowrap' }}>{children}</span>
)

function ScoreBox({ word, value, accent, called, small }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '8px 24px 4px 24px', background: alpha(CHASSIS.bg, 0.72), border: `2px solid ${alpha(accent, called ? 0.6 : 0.3)}` }}>
      <span style={{ fontSize: fs(22), fontWeight: 800, letterSpacing: 4, color: INK2, whiteSpace: 'nowrap' }}>{word}</span>
      <span style={{ fontFamily: DISPLAY, fontSize: small ? 64 : 92, fontWeight: 900, lineHeight: 1, color: accent, transform: 'skewX(-8deg)', whiteSpace: 'nowrap' }}>{value}</span>
    </div>
  )
}

// ── 1. THE RANKED LIST ─────────────────────────────────────────────────────
export function rankedDesign(m, grain) {
  const accent = SPORT_ACCENT[m.sport]
  const lead = m.lead
  const rows = (m.rows || []).slice(0, MAX_ROWS)
  const called = Boolean(lead && lead.status === 'called' && !lead.miss)
  const heroH = 250
  const nameMax = 960
  const leadScore = lead ? (lead.result ? lead.result.text : lead.score == null ? '—' : String(Math.round(lead.score))) : ''
  return (
    <Shell accent={accent} tone={lead?.tone} grain={grain} called={called} kicker={m.kicker} right={m.right} brand={m.brand.name} footRight={m.dayWord}>
      {lead ? (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', position: 'relative', width: W_IN - 6, height: heroH, overflow: 'hidden', borderBottom: `2px solid ${alpha(accent, 0.45)}`, background: `radial-gradient(circle at 50% 42%, ${alpha(lead.tone || accent, 0.42)} 0%, ${alpha(accent, 0.08)} 64%, ${alpha(CHASSIS.bg, 0.3)} 100%)` }}>
            {lead.logo ? <div style={{ display: 'flex', position: 'absolute', right: -70, top: 14, opacity: 0.16 }}><Logo m={{ team: lead.team, logo: lead.logo, logoPlate: lead.logoPlate }} size={290} /></div> : null}
            <div style={{ display: 'flex', position: 'absolute', left: 0, bottom: 0, opacity: lead.miss ? 0.6 : 1 }}><Face m={{ name: lead.name, face: lead.face, tone: lead.tone }} w={heroH} h={heroH} accent={accent} /></div>
            <div style={{ display: 'flex', flexDirection: 'column', position: 'absolute', left: heroH + 26, top: 20, gap: 10 }}>
              <Tag accent={accent} called={called}>{`#${lead.rank} ON THIS LIST`}</Tag>
              {lead.status ? <span style={{ fontSize: fs(26), fontWeight: 800, letterSpacing: 6, color: called ? accent : INK2, whiteSpace: 'nowrap' }}>{wordOf(lead.status)}</span> : null}
            </div>
            <div style={{ display: 'flex', position: 'absolute', right: 24, top: 20 }}>
              <ScoreBox word={lead.result ? 'RESULT' : lead.scoreWord || 'SCORE'} value={leadScore} accent={lead.result && !lead.result.hot ? DIM : accent} called={called} small={Boolean(lead.result)} />
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', padding: '4px 34px 0 28px' }}>
            <Slant size={fitName(lead.name, 110, nameMax)} h={104}>{lead.name}</Slant>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, height: 54 }}>
              <Logo m={{ team: lead.team, logo: lead.logo, logoPlate: lead.logoPlate }} size={44} />
              <span style={{ fontSize: fs(34), fontWeight: 800, whiteSpace: 'nowrap' }}>{lead.where ? `${lead.team}  ${lead.where}` : `${lead.team}${lead.opp ? ` vs ${lead.opp}` : ''}`}</span>
              <span style={{ fontSize: fs(26), fontWeight: 600, color: DIM, whiteSpace: 'nowrap' }}>{[lead.pos, lead.number != null && lead.number !== '' ? `#${lead.number}` : null].filter(Boolean).join('  ·  ')}</span>
            </div>
            {lead.line ? <span style={{ fontSize: fs(24), fontWeight: 600, color: INK2, whiteSpace: 'nowrap', height: 32 }}>{lead.line}</span> : <span style={{ display: 'flex', height: 32 }} />}
          </div>
        </div>
      ) : <div style={{ display: 'flex', height: 12 }} />}
      <Table rows={rows} accent={accent} head={m.headLabel || 'SCORE'} empty={m.empty} />
      {m.more > 0 ? <span style={{ fontSize: fs(26), fontWeight: 700, color: DIM, padding: '12px 34px 0 34px' }}>{`+ ${m.more} more on the list`}</span> : null}
      {m.note ? <span style={{ fontSize: fs(22), fontWeight: 600, color: DIM, padding: '8px 34px 0 34px', whiteSpace: 'nowrap' }}>{m.note}</span> : null}
    </Shell>
  )
}

// ── 2. THE GAME ────────────────────────────────────────────────────────────
// Redesigned 2026-10-12 (Donovan: "the like games picture when exporting is ugly"). The old card was a banner over the SAME table the ranked list
// uses, which left a third of the frame empty on a small game and cramped every name on a big one. Now it reads like a baseball card sheet:
//   1. THE TITLE STRIP   away logo + code  @  home code + logo, the ET day and time (pregame), the status line (live) or the score (final)
//   2. THE EXPECTED BAND the team model's projected count for each club and the total (only when the model has one: never invented)
//   3. THE CALLS         a grid of mini cards, two across: the face, the name (one line, two when it is long, initials last), the club and
//                        opponent, the status word (lib/callStatus STATUS_WORD), the score or the graded result
// Every text box is MEASURED first (lib/cards/fit.js: fitLine / fitBlock / ellipsize) so nothing overflows, and nothing is under the 22px floor.
// The card grows its mini cards to the room it has: a small game gets bigger cards, never an empty frame.
const NAME_FONT = { family: DISPLAY, weight: 900, upper: true }
const BODY_FONT = { family: 'Inter', weight: 800 }
const GRID_PAD = 16
const GRID_GAP = 14

/** A player's name for a mini card: one line at the largest size that fits, two balanced lines when it is long, initials last, an ellipsis never first. */
export function nameFit(name, maxW, id = 'game-name', maxLines = 2, top = 46) {
  const done = (size, lines, truncated = false) => {
    logFit({ id, kind: 'block', text: String(name), size, w: Math.max(...lines.map((l) => textWidth(l, { size, ...NAME_FONT }))), maxW, ok: true, truncated, lines: lines.length, maxLines: 2 })
    return { size, lines }
  }
  const one = fitLine(name, { sizes: [top, 42, 38, 34].filter((z, i) => i === 0 || z < top), maxW, id, quiet: true, ...NAME_FONT })
  if (one.fits) return done(one.size, [String(name)])
  const two = maxLines >= 2 ? fitBlock(name, { sizes: [40, 36, 32, 30], maxW, maxLines: 2, id, quiet: true, ...NAME_FONT }) : null
  if (two && two.fits && two.lines.length === 2) return done(two.size, two.lines)
  const ini = initialName(name)
  const f = fitLine(ini, { sizes: [38, 34, 30, 26], maxW, id, quiet: true, ...NAME_FONT })
  if (f.fits) return done(f.size, [ini])
  const sur = String(name).trim().split(/\s+/).slice(1).join(' ')   // the surname alone, before any cut
  const g = sur ? fitLine(sur, { sizes: [34, 30, 26], maxW, id, quiet: true, ...NAME_FONT }) : null
  if (g && g.fits) return done(g.size, [sur])
  return done(26, [ellipsize(ini, { size: 26, maxW, ...NAME_FONT })], true)
}

/** A line of body type at the largest of `sizes` that fits; cut with an ellipsis only at the floor. */
function bodyFit(text, maxW, sizes = [26, 24, 22], id = 'game-body', font = BODY_FONT) {
  const f = fitLine(text, { sizes, maxW, id, quiet: true, ...font })
  if (f.fits) return { size: f.size, text: String(text) }
  const size = sizes[sizes.length - 1]
  const cut = ellipsize(text, { size, maxW, ...font })
  logFit({ id, kind: 'line', text: String(text), size, w: textWidth(cut, { size, ...font }), maxW, ok: true, truncated: true })
  return { size, text: cut }
}

/** One side of the hero: the club's mark, big, and its code (the code mirrored for the home club so the two read outward from the middle). */
function ClubSide({ c, home, w }) {
  const mark = 176
  const code = fitLine(c.team, { sizes: [128, 112, 100, 88, 76], maxW: w - mark - 18, id: 'game-club', quiet: true, ...NAME_FONT })
  const logo = <Logo key="m" m={{ team: c.team, logo: c.logo, logoPlate: c.logoPlate }} size={mark} />
  const text = <Slant key="t" size={code.size} h={Math.round(code.size * 1.04)}>{c.team}</Slant>
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: home ? 'flex-end' : 'flex-start', gap: 18, width: w }}>
      {home ? [text, logo] : [logo, text]}
    </div>
  )
}

/**
 * THE HERO: both clubs' own colours as a diagonal split behind huge marks (a faint copy of each mark under it), a quiet diagonal pattern, the matchup in giant
 * caps, the time or the score under it, the team model's expected count as a glass band at the bottom, and a foil rule under the whole thing.
 * Club colours go through heroTone (lib/cards/clubTone.js): never lighter than the cream ink can read on, the accent when a club has no colour.
 */
function Hero({ b, accent }) {
  const sideW = 440
  const aT = heroTone(b.away.tone, accent)
  const hT = heroTone(b.home.tone, accent)
  const scored = Boolean(b.score && Number.isFinite(b.score.away) && Number.isFinite(b.score.home) && (b.state === 'final' || b.state === 'live'))
  const winner = scored && b.state === 'final' ? (b.score.away > b.score.home ? 'away' : b.score.home > b.score.away ? 'home' : null) : null
  const line = bodyFit(b.whenLine || b.when || '', scored ? 430 : 700, [34, 30, 26, 22], 'game-when', { family: 'Inter', weight: 800, ls: scored ? 2 : 0 })
  const num = (w) => ({ fontFamily: DISPLAY, fontSize: 118, fontWeight: 900, lineHeight: 1, transform: 'skewX(-8deg)', color: w ? accent : INK, display: 'flex' })
  const proj = b.proj
  const label = proj ? bodyFit(`${proj.label}${proj.total != null ? `  ·  ${proj.total} TOTAL` : ''}`, 610, [24, 22], 'game-proj', { family: 'Inter', weight: 800, ls: 2 }) : null
  const pnum = { fontFamily: DISPLAY, fontSize: 76, fontWeight: 900, lineHeight: 1, color: accent, transform: 'skewX(-8deg)', display: 'flex' }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', position: 'relative', width: W_IN - 6, overflow: 'hidden', background: [
      `linear-gradient(180deg, ${alpha(CHASSIS.bg, 0)} 50%, ${alpha(CHASSIS.bg, 0.8)} 100%)`,
      `linear-gradient(112deg, ${alpha(aT, WASH_MAX)} 0%, ${alpha(aT, 0.5)} 36%, ${alpha(aT, 0)} 54%)`,
      `linear-gradient(292deg, ${alpha(hT, WASH_MAX)} 0%, ${alpha(hT, 0.5)} 36%, ${alpha(hT, 0)} 54%)`,
      CHASSIS.bg].join(', ') }}>
      {/* a diagonal hatch, felt more than seen */}
      <div style={{ display: 'flex', position: 'absolute', left: 0, top: 0, width: W_IN - 6, height: 520, backgroundImage: `repeating-linear-gradient(115deg, ${alpha(INK, 0.045)} 0px, ${alpha(INK, 0.045)} 2px, ${alpha(INK, 0)} 2px, ${alpha(INK, 0)} 26px)` }} />
      {/* each club's mark again, huge and faint, behind its own side */}
      <div style={{ display: 'flex', position: 'absolute', left: -110, top: -30, opacity: 0.1 }}><Logo m={{ team: b.away.team, logo: b.away.logo, logoPlate: false }} size={420} /></div>
      <div style={{ display: 'flex', position: 'absolute', right: -110, top: -30, opacity: 0.1 }}><Logo m={{ team: b.home.team, logo: b.home.logo, logoPlate: false }} size={420} /></div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '26px 30px 0 30px', height: 208, position: 'relative' }}>
        <ClubSide c={b.away} home={false} w={sideW} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 92, height: 92, borderRadius: 46, background: alpha(CHASSIS.bg, 0.78), border: `3px solid ${alpha(accent, 0.7)}` }}><Slant size={48} color={accent}>@</Slant></div>
        <ClubSide c={b.home} home w={sideW} />
      </div>
      {scored ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 70px', height: 122, position: 'relative' }}>
          <span style={num(winner === 'away')}>{String(b.score.away)}</span>
          <span style={{ fontSize: fs(line.size), fontWeight: 800, letterSpacing: 2, color: b.state === 'live' ? accent : INK2, whiteSpace: 'nowrap' }}>{line.text}</span>
          <span style={num(winner === 'home')}>{String(b.score.home)}</span>
        </div>
      ) : (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 76, position: 'relative' }}>
          <div style={{ display: 'flex', padding: '6px 30px', background: alpha(CHASSIS.bg, 0.66), border: `2px solid ${alpha(INK, 0.22)}`, borderRadius: 40 }}>
            <span style={{ fontSize: fs(line.size), fontWeight: 800, color: INK, whiteSpace: 'nowrap' }}>{line.text}</span>
          </div>
        </div>
      )}
      {proj ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 100, padding: '0 70px', margin: '8px 0 0 0', background: alpha(CHASSIS.bg, 0.62), borderTop: `2px solid ${alpha(INK, 0.12)}`, position: 'relative' }}>
          <span style={pnum}>{proj.away}</span>
          <span style={{ fontSize: fs(label.size), fontWeight: 800, letterSpacing: 2, color: INK2, whiteSpace: 'nowrap' }}>{label.text}</span>
          <span style={pnum}>{proj.home}</span>
        </div>
      ) : <div style={{ display: 'flex', height: 14 }} />}
      <div style={{ display: 'flex', height: 8, background: foil(accent) }} />
    </div>
  )
}

/** One player as a mini baseball card: the photo with his rank, then his name, his club and opponent, his word and his score (or his graded result). */
function MiniCard({ r, accent, w, h }) {
  const missed = Boolean(r.miss)
  const called = r.status === 'called' && !missed
  const hc = r.pct != null ? heat(r.pct, accent) : { c: INK, hot: r.rank <= 3 }
  const face = Math.min(h - 28, 168)
  const tight = h < 175   // eight players: the stack gets smaller type before anything is cut
  const cramped = h < 150 // and smaller still when a note takes the room
  const textW = w - 6 - 14 - face - 16 - 16
  const sub = bodyFit(r.where ? `${r.team}  ${r.where}` : `${r.team}${r.opp ? ` vs ${r.opp}` : ''}${r.tag ? `  ${r.tag}` : ''}`, textW, [26, 24, 22], 'game-sub', { family: 'Inter', weight: 700 })
  const scoreText = r.result ? r.result.text : r.score == null ? '—' : String(Math.round(r.score))
  const scoreFit = fitLine(scoreText, { sizes: r.result ? (tight ? [40, 34, 28] : [48, 40, 34, 28]) : (cramped ? [46, 42] : tight ? [56, 52] : [66, 60]), maxW: Math.round(textW * 0.5), id: 'game-score', quiet: true, ...NAME_FONT })
  const scoreW = textWidth(scoreText, { size: scoreFit.size, ...NAME_FONT }) + 34
  const wordBox = textW - scoreW - 14
  const word = r.status ? fitBlock(wordOf(r.status), { sizes: [24, 22], maxW: wordBox, maxLines: 2, id: 'game-status', family: 'Inter', weight: 800, ls: 1 }) : null
  // the text stack must fit the card: the status row, the club line and the name; a long name gives up its second line (initials) before anything is cut
  const availH = h - 16
  const rowH = Math.max(word ? word.lines.length * Math.ceil(word.size * 1.15) : 0, Math.round(scoreFit.size * 0.92))
  const stackH = (n) => n.lines.length * Math.round(n.size * 1.02) + Math.round(sub.size * 1.4) + rowH
  let nm = nameFit(r.name, textW, 'game-player-try', 2, cramped ? 34 : tight ? 40 : 46)
  if (stackH(nm) > availH) nm = nameFit(r.name, textW, 'game-player', 1, cramped ? 34 : tight ? 40 : 46)
  else nm = nameFit(r.name, textW, 'game-player', 2, cramped ? 34 : tight ? 40 : 46)
  logFit({ id: 'game-stack', kind: 'block', text: String(r.name), size: nm.size, w: stackH(nm), maxW: availH, ok: stackH(nm) <= availH, truncated: false, lines: nm.lines.length, maxLines: 2 })
  const glow = heroTone(r.tone, accent)
  const board = r.status === 'board' && !missed
  const edge = called ? foil(accent) : board ? alpha(accent, 0.45) : alpha(INK, 0.16)
  const stamp = r.result
  return (
    <div style={{ display: 'flex', width: w, height: h, padding: 3, borderRadius: 18, background: edge, boxShadow: called ? `0 0 34px ${alpha(accent, 0.38)}` : 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', width: w - 6, height: h - 6, padding: '0 16px 0 14px', gap: 16, borderRadius: 15, background: [
        `radial-gradient(circle at 16% 50%, ${alpha(glow, called ? 0.5 : 0.3)} 0%, ${alpha(glow, 0)} 60%)`,
        `linear-gradient(135deg, ${alpha(INK, called ? 0.1 : 0.06)} 0%, ${alpha(CHASSIS.bg, 0.5)} 100%)`,
        CHASSIS.bg].join(', ') }}>
        <div style={{ display: 'flex', position: 'relative', width: face, height: face, flexShrink: 0, borderRadius: 14, overflow: 'hidden', border: `3px solid ${called ? accent : alpha(INK, 0.3)}`, background: `radial-gradient(circle at 50% 38%, ${alpha(glow, 0.7)} 0%, ${alpha(glow, 0.15)} 100%)`, opacity: missed ? 0.55 : 1 }}>
          <Face m={{ name: r.name, face: r.face, tone: r.tone }} w={face - 6} h={face - 6} accent={accent} radius={9} />
          <div style={{ display: 'flex', position: 'absolute', left: 0, top: 0, padding: '1px 12px 1px 9px', borderBottomRightRadius: 12, background: called ? foil(accent) : alpha(CHASSIS.bg, 0.88) }}>
            <span style={{ fontSize: fs(24), fontWeight: 800, color: called ? CHASSIS.bg : INK }}>{`#${r.rank}`}</span>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', width: textW, justifyContent: 'center' }}>
          {nm.lines.map((l, i) => <Slant key={i} size={nm.size} h={Math.round(nm.size * 1.02)} color={missed ? DIM : INK}>{l}</Slant>)}
          <span style={{ fontSize: fs(sub.size), fontWeight: 700, color: INK2, whiteSpace: 'nowrap', height: Math.round(sub.size * 1.4), display: 'flex', alignItems: 'center' }}>{sub.text}</span>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: rowH, width: textW }}>
            {word ? <div style={{ display: 'flex', flexDirection: 'column' }}>{word.lines.map((l) => <span key={l} style={{ fontSize: fs(word.size), fontWeight: 800, letterSpacing: 1, lineHeight: 1.15, color: called ? accent : DIM, whiteSpace: 'nowrap' }}>{l}</span>)}</div> : <span style={{ display: 'flex' }} />}
            {stamp ? (
              <div style={{ display: 'flex', alignItems: 'center', padding: '0 12px', borderRadius: 8, border: `3px solid ${stamp.hot ? accent : alpha(INK, 0.4)}`, background: stamp.hot ? alpha(accent, 0.18) : 'transparent', transform: 'rotate(-5deg)' }}>
                <span style={{ fontFamily: DISPLAY, fontSize: scoreFit.size, fontWeight: 900, lineHeight: 1.1, color: stamp.hot ? accent : missed ? DIM : INK, whiteSpace: 'nowrap', display: 'flex' }}>{scoreText}</span>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', padding: '0 12px', borderRadius: 10, background: alpha(CHASSIS.bg, 0.6), border: `2px solid ${alpha(called ? accent : INK, called ? 0.5 : 0.12)}` }}>
                <span style={{ fontFamily: DISPLAY, fontSize: scoreFit.size, fontWeight: 900, lineHeight: 1, color: hc.c, transform: 'skewX(-8deg)', whiteSpace: 'nowrap', display: 'flex' }}>{scoreText}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/** The game card's plan: the mini cards' size and the bottom of the last row, so a check can prove nothing is pushed into the footer. */
export function gameLayout(m) {
  const b = m.banner
  const rows = (m.rows || []).slice(0, MAX_GAME_ROWS)
  const scored = Boolean(b.score && (b.state === 'final' || b.state === 'live'))
  const stripH = 208 + (scored ? 122 : 76) + (b.proj ? 108 : 14) + 8   // the hero (Hero): marks, the time or score, the expected band, the foil rule
  const bandH = 0
  const headH = 52
  const noteH = m.note ? 44 : 14
  const room = H_IN - 62 - stripH - bandH - headH - noteH - FOOT
  const one = rows.length <= 2
  const gridRows = one ? Math.max(1, rows.length) : Math.ceil(rows.length / 2)
  const cardH = Math.max(140, Math.min(one ? 200 : 214, Math.floor((room - GRID_GAP * (gridRows - 1)) / gridRows)))
  const cardW = one ? W_IN - 6 - 2 * GRID_PAD : Math.floor((W_IN - 6 - 2 * GRID_PAD - GRID_GAP) / 2)
  const gridH = rows.length ? gridRows * cardH + GRID_GAP * (gridRows - 1) : 140
  return { rows, one, gridRows, cardH, cardW, bottom: 62 + stripH + bandH + headH + gridH + noteH, limit: H_IN - FOOT }
}

export function gameDesign(m, grain) {
  const accent = SPORT_ACCENT[m.sport]
  const b = m.banner
  const { rows, one, cardH, cardW } = gameLayout(m)
  const headH = 52
  const called = rows.some((r) => r.status === 'called' && !r.miss)
  const proj = b.proj
  const tone = b.home.tone || b.away.tone || null
  const lines = []
  for (let i = 0; i < rows.length; i += one ? 1 : 2) lines.push(rows.slice(i, i + (one ? 1 : 2)))
  return (
    <Shell accent={accent} tone={tone} grain={grain} called={called} kicker={m.kicker} right={m.right} brand={m.brand.name} footRight={m.dayWord}>
      <Hero b={b} accent={accent} />
      <div style={{ display: 'flex', alignItems: 'center', height: headH, padding: '0 28px', gap: 16 }}>
        <span style={{ fontSize: fs(24), fontWeight: 800, letterSpacing: 5, color: DIM, whiteSpace: 'nowrap' }}>{`KEY PLAYERS  ·  ${m.headLabel || 'SCORE'}`}</span>
        <div style={{ display: 'flex', flexGrow: 1, height: 2, background: RULE }} />
      </div>
      {rows.length ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: GRID_GAP, padding: `0 ${GRID_PAD}px` }}>
          {lines.map((ln, i) => <div key={i} style={{ display: 'flex', gap: GRID_GAP }}>{ln.map((r) => <MiniCard key={`${r.rank}-${r.name}`} r={r} accent={accent} w={cardW} h={cardH} />)}</div>)}
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', height: 140, padding: '0 34px' }}><span style={{ fontSize: fs(30), fontWeight: 700, color: DIM }}>{m.empty || 'Nothing to show on this game.'}</span></div>
      )}
      {m.note ? <span style={{ fontSize: fs(22), fontWeight: 600, color: DIM, padding: '14px 34px 0 34px', whiteSpace: 'nowrap' }}>{m.note}</span> : null}
    </Shell>
  )
}

// ── tiles (shared by the pitcher and the pick) ─────────────────────────────
function MiniTile({ t, w, accent }) {
  const hot = t.hot === true
  const text = String(t.value ?? '—')
  const big = text.length >= 8 ? 54 : text.length >= 6 ? 62 : 72
  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: w, height: 132, padding: '0 20px', borderLeft: `2px solid ${alpha(INK, 0.12)}`, justifyContent: 'center' }}>
      <span style={{ fontSize: fs(22), fontWeight: 800, color: DIM, letterSpacing: 0.4, whiteSpace: 'nowrap' }}>{t.label}</span>
      <span style={{ fontFamily: DISPLAY, fontSize: big, fontWeight: 900, lineHeight: 1.05, color: hot ? accent : t.cold ? DIM : INK, whiteSpace: 'nowrap' }}>{text}</span>
      {t.sub ? <span style={{ fontSize: fs(22), fontWeight: 600, color: INK2, whiteSpace: 'nowrap' }}>{t.sub}</span> : null}
    </div>
  )
}

function Portrait({ m, accent, h, tag }) {
  return (
    <div style={{ display: 'flex', position: 'relative', width: W_IN - 6, height: h, overflow: 'hidden', borderBottom: `2px solid ${alpha(accent, 0.45)}`, background: `radial-gradient(circle at 50% 42%, ${alpha(m.tone || accent, 0.42)} 0%, ${alpha(accent, 0.08)} 64%, ${alpha(CHASSIS.bg, 0.3)} 100%)` }}>
      {m.logo ? <div style={{ display: 'flex', position: 'absolute', right: -90, top: Math.round(h * 0.1), opacity: 0.16 }}><Logo m={m} size={Math.round(h * 0.95)} /></div> : null}
      <div style={{ display: 'flex', position: 'absolute', left: Math.round((W_IN - 6 - h) / 2), bottom: 0, opacity: m.miss ? 0.6 : 1 }}><Face m={m} w={h} h={h} accent={accent} /></div>
      {tag ? <div style={{ display: 'flex', flexDirection: 'column', position: 'absolute', left: 26, top: 20, gap: 8 }}>{tag}</div> : null}
    </div>
  )
}

const NameBlock = ({ m, size = 150, line, sub }) => (
  <div style={{ display: 'flex', flexDirection: 'column', padding: '10px 34px 0 28px' }}>
    <Slant size={fitName(m.name, size, 960)} h={size + 6}>{m.name}</Slant>
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, height: 70 }}>
      <Logo m={m} size={52} />
      <span style={{ fontSize: fs(40), fontWeight: 800, whiteSpace: 'nowrap' }}>{line}</span>
      {sub ? <span style={{ fontSize: fs(28), fontWeight: 600, color: DIM, whiteSpace: 'nowrap' }}>{sub}</span> : null}
    </div>
  </div>
)

// ── 3. THE PITCHER ─────────────────────────────────────────────────────────
export function pitcherDesign(m, grain) {
  const accent = SPORT_ACCENT[m.sport]
  const tiles = (m.tiles || []).slice(0, 8)
  const cols = 4
  const rows = Math.ceil(tiles.length / cols)
  const tileW = Math.floor((W_IN - 6 - 36) / cols)
  const bat = m.topBat
  const portraitH = bat ? 400 : 500
  return (
    <Shell accent={accent} tone={m.tone} grain={grain} called={false} kicker="TONIGHT'S STARTER" right={m.throws ? `${m.throws}HP` : ''} brand={m.brand.name} footRight={m.dayWord}>
      <Portrait m={m} accent={accent} h={portraitH} />
      <NameBlock m={m} size={140} line={`${m.team}${m.opp ? ` vs ${m.opp}` : ''}`} sub={m.weakSide ? `bleeds vs ${m.weakSide}` : ''} />
      <div style={{ display: 'flex', height: 2, margin: '0 28px', background: RULE }} />
      {rows ? (
        <div style={{ display: 'flex', flexDirection: 'column', margin: '12px 18px 0 12px' }}>
          {Array.from({ length: rows }, (_, r) => <div key={r} style={{ display: 'flex' }}>{tiles.slice(r * cols, r * cols + cols).map((t) => <MiniTile key={t.label} t={t} w={tileW} accent={accent} />)}</div>)}
        </div>
      ) : null}
      {bat ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, margin: '14px 28px 0 28px', padding: '12px 22px', background: alpha(INK, 0.05), borderStyle: 'solid', borderWidth: '2px 2px 2px 8px', borderColor: `${alpha(INK, 0.14)} ${alpha(INK, 0.14)} ${alpha(INK, 0.14)} ${alpha(INK, 0.35)}` }}>
          <div style={{ display: 'flex', width: 84, height: 84, borderRadius: 42, overflow: 'hidden', border: `3px solid ${alpha(accent, 0.7)}`, background: alpha(bat.tone || accent, 0.3), flexShrink: 0 }}><Face m={bat} w={78} h={78} accent={accent} /></div>
          <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
            <span style={{ fontSize: fs(22), fontWeight: 800, letterSpacing: 3, color: DIM, whiteSpace: 'nowrap' }}>THE BAT THIS SPLIT IS BUILT AROUND</span>
            <Slant size={fitName(bat.name, 48, 560)}>{bat.name}</Slant>
            <span style={{ fontSize: fs(24), fontWeight: 700, color: INK2, whiteSpace: 'nowrap' }}>{`${bat.team}${bat.opp ? ` vs ${bat.opp}` : ''}`}</span>
          </div>
          <span style={{ fontFamily: DISPLAY, fontSize: 76, fontWeight: 900, color: accent, transform: 'skewX(-8deg)' }}>{bat.score == null ? '' : String(Math.round(bat.score))}</span>
        </div>
      ) : null}
      <span style={{ fontSize: fs(22), fontWeight: 600, color: DIM, padding: '10px 34px 0 34px', whiteSpace: 'nowrap' }}>{m.note || 'hot = good for the bats facing him · cold = his strength'}</span>
    </Shell>
  )
}

// ── 4. THE PICK (TUDDY, one market, pregame or graded) ─────────────────────
export function pickDesign(m, grain) {
  const accent = SPORT_ACCENT[m.sport]
  const graded = m.result != null
  const won = m.result?.hit === true
  const lost = graded && !won
  const called = m.status === 'called' && !lost
  const tag = (t) => <Tag key={t} accent={accent} called={called}>{t}</Tag>
  const stats = m.tiles || [
    m.score != null ? { label: `${String(m.marketLabel || '').toUpperCase()} SCORE`, value: String(Math.round(m.score)), hot: m.score >= 80 && !lost } : null,
    m.bar != null ? { label: "THE MARKET'S BAR", value: String(m.bar) } : null,
    m.rung ? { label: 'RUNG', value: `${m.rung} of 5` } : null,
    m.grade ? { label: 'GRADE', value: String(m.grade) } : null,
  ].filter(Boolean)
  const tileW = Math.floor((W_IN - 6 - 36) / Math.max(1, Math.min(4, stats.length)))
  return (
    <Shell accent={accent} tone={m.tone} grain={grain} called={called} kicker={graded ? 'RESULT CARD' : 'PICK CARD'} right={m.position || ''} brand={m.brand.name} footRight={m.dayWord}>
      <Portrait m={{ ...m, miss: lost }} accent={accent} h={graded ? 400 : 450} tag={[m.marketLabel ? tag(m.marketLabel.toUpperCase()) : null, m.flags ? tag(m.flags) : null].filter(Boolean)} />
      <NameBlock m={m} size={graded ? 128 : 140} line={`${m.team}${m.opp ? ` vs ${m.opp}` : ''}`} sub={m.number != null ? `#${m.number}` : ''} />
      <div style={{ display: 'flex', height: 2, margin: '0 28px', background: RULE }} />
      {graded ? (
        <div style={{ display: 'flex', flexDirection: 'column', margin: '16px 28px 0 28px', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', padding: '0 34px', height: 120, background: won ? accent : 'transparent', border: won ? `3px solid ${accent}` : `4px solid ${alpha(INK, 0.28)}` }}>
              <span style={{ fontFamily: DISPLAY, fontSize: 100, fontWeight: 900, color: won ? CHASSIS.bg : DIM, transform: 'skewX(-8deg)' }}>{m.result.word}</span>
            </div>
            {m.actual != null ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                <span style={{ fontSize: fs(22), fontWeight: 800, letterSpacing: 4, color: DIM }}>ACTUAL</span>
                <span style={{ fontFamily: DISPLAY, fontSize: 96, fontWeight: 900, lineHeight: 1, color: won ? accent : INK2, transform: 'skewX(-8deg)' }}>{String(m.actual)}</span>
              </div>
            ) : null}
          </div>
          {m.actual != null && m.bar != null && m.bar > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', position: 'relative', height: 28, width: W_IN - 6 - 56, borderRadius: 14, background: alpha(INK, 0.09) }}>
                <div style={{ display: 'flex', height: 28, borderRadius: 14, background: won ? accent : alpha(INK, 0.38), width: Math.max(28, Math.round((W_IN - 6 - 56) * (m.actual / (Math.max(m.actual, m.bar) * 1.12)))) }} />
                <div style={{ display: 'flex', position: 'absolute', top: -8, left: Math.round((W_IN - 6 - 56) * (m.bar / (Math.max(m.actual, m.bar) * 1.12))) - 2, width: 4, height: 44, background: INK }} />
              </div>
              <span style={{ fontSize: fs(22), fontWeight: 800, color: INK2, marginTop: 10 }}>{`BAR ${m.bar}`}</span>
            </div>
          ) : null}
          {m.result.note ? <span style={{ fontSize: fs(26), fontWeight: 700, color: INK2 }}>{m.result.note}</span> : null}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', margin: '14px 18px 0 12px' }}>
          <div style={{ display: 'flex' }}>{stats.slice(0, 4).map((t) => <MiniTile key={t.label} t={t} w={tileW} accent={accent} />)}</div>
        </div>
      )}
      <div style={{ display: 'flex', flexGrow: 1, alignItems: 'center', padding: '0 28px 70px 28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', width: '100%', height: 96, padding: '0 22px', gap: 20, background: called ? `linear-gradient(90deg, ${alpha(accent, 0.2)} 0%, ${alpha(accent, 0.04)} 100%)` : alpha(INK, 0.05), borderStyle: 'solid', borderWidth: '2px 2px 2px 8px', borderColor: `${alpha(called ? accent : INK, called ? 0.4 : 0.14)} ${alpha(called ? accent : INK, called ? 0.4 : 0.14)} ${alpha(called ? accent : INK, called ? 0.4 : 0.14)} ${called ? accent : alpha(INK, 0.35)}` }}>
          <Target size={54} color={called ? accent : INK2} />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {m.status ? <span style={{ fontSize: fs(24), fontWeight: 800, letterSpacing: 5, color: called ? accent : INK2 }}>{wordOf(m.status)}</span> : null}
            <span style={{ fontSize: fs(26), fontWeight: 700, color: INK, whiteSpace: 'nowrap' }}>{m.footLine}</span>
          </div>
        </div>
      </div>
    </Shell>
  )
}

// ── 5. THE RECORD (MOONSHOT's season, by category) ─────────────────────────
export function recordDesign(m, grain) {
  const accent = SPORT_ACCENT[m.sport]
  const rows = (m.rows || []).slice(0, 6)
  const rowH = Math.min(150, Math.floor(640 / Math.max(1, rows.length)))
  return (
    <Shell accent={accent} tone={null} grain={grain} called={false} kicker="TRACK RECORD" right={m.right} brand={m.brand.name} footRight={m.dayWord}>
      <div style={{ display: 'flex', flexDirection: 'column', padding: '26px 34px 0 34px', borderBottom: `2px solid ${alpha(accent, 0.45)}`, height: 380 }}>
        <span style={{ fontSize: fs(24), fontWeight: 800, letterSpacing: 5, color: DIM }}>SEASON, EVERY PICK</span>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 28 }}>
          <Slant size={150} h={160}>{m.seasonN ? `${m.seasonOk}/${m.seasonN}` : '—'}</Slant>
          {m.seasonPct != null ? <span style={{ fontFamily: DISPLAY, fontSize: 84, fontWeight: 900, color: accent, transform: 'skewX(-8deg)' }}>{`${m.seasonPct.toFixed(1)}%`}</span> : null}
        </div>
        {m.lockN ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, padding: '12px 20px', background: alpha(accent, 0.12), borderStyle: 'solid', borderWidth: '2px 2px 2px 8px', borderColor: `${alpha(accent, 0.4)} ${alpha(accent, 0.4)} ${alpha(accent, 0.4)} ${accent}` }}>
            <span style={{ fontSize: fs(26), fontWeight: 800, letterSpacing: 3, color: INK2 }}>FROZEN AT FIRST PITCH</span>
            <span style={{ fontFamily: DISPLAY, fontSize: 64, fontWeight: 900, lineHeight: 1, transform: 'skewX(-8deg)' }}>{`${m.lockOk}/${m.lockN}${m.lockPct != null ? ` · ${m.lockPct.toFixed(1)}%` : ''}`}</span>
          </div>
        ) : null}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', padding: '0 34px' }}>
        {rows.map((r) => (
          <div key={r.label} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: rowH, borderBottom: `2px solid ${alpha(INK, 0.1)}` }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <Slant size={44}>{r.label}</Slant>
              <span style={{ fontFamily: DISPLAY, fontSize: 56, fontWeight: 900, color: r.hot ? accent : r.cold ? DIM : INK, transform: 'skewX(-8deg)' }}>{r.pct == null ? '—' : `${r.pct.toFixed(1)}%`}</span>
            </div>
            <Bar pct={r.pct || 0} w={W_IN - 6 - 68} h={14} color={r.hot ? accent : r.cold ? alpha(INK, 0.3) : alpha(INK, 0.55)} accent={accent} />
            <span style={{ fontSize: fs(24), fontWeight: 600, color: DIM, marginTop: 6, whiteSpace: 'nowrap' }}>{r.line}</span>
          </div>
        ))}
      </div>
      <span style={{ fontSize: fs(22), fontWeight: 600, color: DIM, padding: '12px 34px 0 34px', whiteSpace: 'nowrap' }}>{m.note}</span>
    </Shell>
  )
}

const DESIGNS = { ranked: rankedDesign, game: gameDesign, pitcher: pitcherDesign, pick: pickDesign, record: recordDesign }

/** PNG bytes of a share card model at `width` px (4:5; the design size by default). kind: ranked | game | pitcher | pick | record. */
export async function renderShare(kind, m, { width } = {}) {
  if (kind === 'postseason' || kind === 'series') {
    const { renderPostseason } = await import('./postseasonCard')   // lazy: postseasonCard imports Shell from this file
    return renderPostseason(m, { side: m.side || 'front', width })
  }
  const make = DESIGNS[kind]
  if (!make) throw new Error(`no share card kind ${kind}`)
  const { grain, fonts } = await assets()
  initMetrics(fonts)
  const size = sizeOf(width)
  return renderPng(make(m, grain), size, { card: `share-${kind}`, design: make(m, null) })
}
