// THE GOAL CARD -- LAMP's twin of the homer card (2026-09-28, MLB-PARITY plan
// C1, before the opener). Built FROM lib/dash/homerCard.js's own pieces
// (frame, Header, Footer, KV, fonts, mark, grain -- CLAUDE.md: MOONSHOT's
// components are the base), passing LAMP's words and its ice accent. Same
// 1200x675 poster: the face, the name, the call status, the goal's facts
// (his Nth this season, period + clock, strength, the score after it, the
// assists) and the CALLED IT · graded in public footer.
//
// Everything comes off the lamp_goal_feed row (lib/nhl/goalFeed.js rowFrom).
// Not on the row, so not on the card: the opposing goalie -- the feed does not
// record who was in net, and a card never guesses.
import { STATUS_WORD } from '../callStatus'   // the one set of words (R2; was 'OFF THE BOARD' here)
import { frame, Header, Footer, KV, loadFonts, loadMark, loadDisplay, loadGrain, DISPLAY, INK, PANEL, RULE, prettyDay } from '../dash/homerCard'
import { C } from './theme'
import { nhlMug } from './format'
import { nhlNickname } from './teams'
import { strengthWord, periodWord } from './goalFeed'

const txt = (v) => (v == null ? '' : String(v).trim())
// lib/scales' alpha() is a client module; the card renders on the server.
const alpha = (hex, a) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''))
  if (!m) return `rgba(255,255,255,${a})`
  const v = parseInt(m[1], 16)
  return `rgba(${v >> 16},${(v >> 8) & 255},${v & 255},${a})`
}

// The ice rink under the lights: MOONSHOT's field, re-lit in LAMP's accent.
const FIELD = [
  `radial-gradient(circle at 8% -8%, ${alpha(C.ice, 0.24)} 0%, ${alpha(C.ice, 0)} 42%)`,
  `radial-gradient(circle at 96% -10%, ${alpha(C.ice, 0.12)} 0%, ${alpha(C.ice, 0)} 36%)`,
  `radial-gradient(circle at 92% 112%, ${alpha(C.teal || C.ice, 0.14)} 0%, ${alpha(C.teal || C.ice, 0)} 46%)`,
  C.bg,
].join(', ')

const MUG_TIMEOUT_MS = 4000
const _mugs = new Map()
async function loadMug(season, team, id) {
  const url = nhlMug(season, team, id)
  if (!url) return ''
  if (_mugs.has(url)) return _mugs.get(url)
  let out = ''
  try {
    const ctl = new AbortController()
    const t = setTimeout(() => ctl.abort(), MUG_TIMEOUT_MS)
    const res = await fetch(url, { signal: ctl.signal })
    clearTimeout(t)
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer())
      if (buf.length) out = `data:image/png;base64,${buf.toString('base64')}`
    }
  } catch { /* no face, the card still renders */ }
  _mugs.set(url, out)
  return out
}

const STATUS_LINE = { called: 'LAMP CALLED IT', board: 'ON THE LAMP BOARD', off: 'NOT ON THE BOARD' }

/** The card for one lamp_goal_feed row. Returns an ImageResponse (PNG body). */
export async function goalCard(row, { site = 'dashnetwork.vercel.app' } = {}) {
  const [base, , display, , mug] = await Promise.all([loadFonts(), loadMark(), loadDisplay(), loadGrain(), loadMug(row?.season, row?.team, row?.player_id)])
  const fonts = [...base, ...display]
  const accent = C.ice
  const status = row?.status || null
  const called = status === 'called'
  const name = txt(row?.name) || 'Unknown'
  const team = txt(row?.team).toUpperCase()
  const opp = txt(row?.opp).toUpperCase()
  const nth = Number(row?.season_goals) > 0 ? Number(row.season_goals) : null
  const facts = []
  if (nth) facts.push({ label: 'This season', value: `goal #${nth}`, hot: nth % 10 === 0 })
  facts.push({ label: 'When', value: `${periodWord(row, { long: true })}${row?.time_in_period ? ` · ${row.time_in_period}` : ''}`, hot: false })
  facts.push({ label: 'Strength', value: strengthWord(row), hot: /PP|SH/.test(strengthWord(row)) })
  if (row?.score_after) facts.push({ label: 'Score after', value: String(row.score_after), hot: false })
  const assists = (Array.isArray(row?.assists) ? row.assists : []).map((a) => txt(a?.name)).filter(Boolean)
  facts.push({ label: 'Assists', value: assists.length ? assists.join(', ') : 'unassisted', hot: false })

  return frame([
    <Header product="LAMP" accent={accent} tile="G" word={called ? 'CALLED IT' : 'GOAL'} label="GOAL" sub={`${prettyDay(txt(row?.day))} · every goal, graded in public`} pills={[nth ? `GOAL #${nth}` : '', 'TONIGHT'].filter(Boolean)} key="h" />,

    // the emblem: the call, the LAMP score, where he sat in his game
    <div key="emblem" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'absolute', right: 40, top: 96, width: 208, padding: '13px 12px 11px 12px', borderRadius: 4, border: `1px solid ${called ? alpha(accent, 0.55) : alpha(INK, 0.14)}`, background: called ? alpha(accent, 0.09) : alpha(INK, 0.04) }}>
      <span style={{ fontSize: 34, lineHeight: 1 }}>{called ? '🚨' : status === 'board' ? '👀' : '🏒'}</span>
      <span style={{ fontSize: 14, fontWeight: 800, letterSpacing: 2, marginTop: 6, color: called ? accent : INK }}>{STATUS_WORD[status] || STATUS_WORD.off}</span>
      {row?.lamp_score != null ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 8, paddingTop: 8, width: '100%', borderTop: `1px solid ${called ? alpha(accent, 0.3) : alpha(INK, 0.12)}` }}>
          <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 3, color: INK }}>LAMP SCORE</span>
          <span style={{ fontFamily: DISPLAY, fontSize: 52, fontWeight: 900, lineHeight: 1, color: accent, transform: 'skewX(-8deg)' }}>{String(row.lamp_score)}</span>
        </div>
      ) : null}
      {row?.rank_in_game ? <span style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: 1.3, color: INK, marginTop: 5 }}>{`#${row.rank_in_game} IN HIS GAME`}</span> : null}
    </div>,

    // identity: the face, the status, the name, the club and the opponent
    <div key="id" style={{ display: 'flex', alignItems: 'flex-end', padding: '22px 268px 0 40px', gap: 22 }}>
      {mug ? <img src={mug} width={132} height={132} style={{ borderRadius: 66, border: `2px solid ${alpha(accent, 0.6)}`, background: PANEL }} /> : null}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <span style={{ fontSize: 14, fontWeight: 800, letterSpacing: 6, color: called ? accent : INK }}>{STATUS_LINE[status] || 'GOAL'}</span>
        <span style={{ fontFamily: DISPLAY, fontSize: 72, fontWeight: 900, lineHeight: 0.98, marginTop: 4, transform: 'skewX(-8deg)', letterSpacing: -1 }}>{name}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
          {team ? <span style={{ background: accent, color: C.bg, fontSize: 15, fontWeight: 800, letterSpacing: 1.4, borderRadius: 999, padding: '4px 14px' }}>{team}</span> : null}
          {opp ? <span style={{ fontSize: 17, fontWeight: 800, color: INK }}>{`vs ${nhlNickname(opp)}`}</span> : null}
        </div>
      </div>
    </div>,

    // the call line
    <div key="call" style={{ display: 'flex', alignItems: 'center', margin: '18px 268px 0 40px', padding: '13px 22px', borderRadius: 4, background: called ? alpha(accent, 0.14) : alpha(INK, 0.05), border: `1px solid ${called ? alpha(accent, 0.55) : alpha(INK, 0.1)}` }}>
      <span style={{ fontSize: 22, fontWeight: 800, color: called ? accent : INK }}>
        {called ? `CALLED · the top skater on his team, locked before puck drop` : status === 'board' ? `On the LAMP board${row?.rank_in_game ? ` · #${row.rank_in_game} in his game` : ''}` : status === 'off' ? "Not on tonight's LAMP board" : 'The game never locked a board'}
      </span>
    </div>,

    // the goal's facts
    <div key="facts" style={{ display: 'flex', flexDirection: 'column', margin: '16px 40px 0 40px', border: `1px solid ${RULE}`, background: PANEL }}>
      <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: 1.6, padding: '9px 14px', borderBottom: `1px solid ${RULE}` }}>THE GOAL</span>
      {facts.map((f) => <KV key={f.label} {...f} accent={accent} />)}
    </div>,

    <Footer site={site} accent={accent} key="f" />,
  ], fonts, 675, null, { tick: accent, field: FIELD })
}

