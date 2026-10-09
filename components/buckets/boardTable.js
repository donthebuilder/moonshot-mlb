'use client'
// 🏀 THE BOARD'S ROWS AND COLUMNS -- one definition read by Props (one market),
// the Slate (one game) and the player's file, so a board row reads the same
// everywhere. Columns carry their group in order (skin v2): Player · Call ·
// Legs · Game. Status words come from lib/callStatus via CallStatusBadge.
import CallStatusBadge from '../CallStatusBadge'
import { C, NUM_FONT } from '../../lib/nba/theme'
import { NBA_MARKETS, LEG_LABEL, fmtLeg, ACTUAL_WORD, RAW_OF } from '../../lib/nba/legs'
import { fmtTip, RimDot } from './ui'

// PROJECTED POINTS (xPTS, lib/nba/expectedPoints.js): recent minutes x points a minute x the opponent's real points
// allowed. A measured projection of a box-score count, NOT a probability and not the score. Shown on the two markets that
// are about points (PTS, PRA); a dash with the reason for a player outside the rotation.
export const XPTS_MARKETS = ['pts', 'pra']
export const XPTS_TITLE = 'Projected points: his recent minutes x his points a minute (pulled toward his season) x what the opponent allows. A measured projection of a box-score count, not a probability. A dash: not in the rotation (under 12 minutes a game) or too few recent games.'

/** board route rows -> table rows (the game's matchup and tip joined on). `xpts` = Map(playerId -> { xpts, line }) from /api/buckets/expected. */
export function boardRows(data, { calledOnly = false, gameId = null, xpts = null } = {}) {
  const games = new Map((data?.games || []).map((g) => [g.id, g]))
  return (data?.rows || [])
    .filter((r) => (!calledOnly || r.status === 'called') && (!gameId || r.gameId === gameId))
    .sort((a, b) => (a.nightRank ?? 9999) - (b.nightRank ?? 9999) || String(a.name).localeCompare(String(b.name)))
    .map((r) => {
      const g = games.get(r.gameId)
      return { ...r, xpts: xpts?.get(String(r.playerId))?.xpts ?? null, xptsLine: xpts?.get(String(r.playerId))?.line ?? null, _id: `${r.gameId}-${r.playerId}`, oppTxt: r.home ? r.opp : `@${r.opp}`, tip: g?.start || null, gameState: g?.state || null, ...Object.fromEntries(Object.entries(r.legs || {})) }
    })
}

/** The columns for one market. `withGame` adds the game column (off on the one-game Slate). */
export function boardColumns(market, { onOpenTeam, onOpenGame, withGame = true, whyCol = null, withXpts = false } = {}) {
  const D = NBA_MARKETS[market] || NBA_MARKETS.pts
  return [
    { key: 'nightRank', label: '#', group: 'Player', w: 36, heat: false, mono: true, dim: true, title: 'His rank on the night’s board for this market' },
    { key: 'name', label: 'Player', group: 'Player', w: 150, heat: false, bold: true, sticky: true },
    { key: 'pos', label: 'Pos', group: 'Player', w: 36, heat: false, mono: true, dim: true },
    { key: 'team', label: 'Tm', group: 'Player', w: 52, heat: false, mono: true, teamMark: 'nba', link: (r) => (onOpenTeam ? () => onOpenTeam(r.team) : null) },
    { key: 'oppTxt', label: 'Opp', group: 'Player', w: 52, heat: false, mono: true, dim: true, link: (r) => (onOpenTeam ? () => onOpenTeam(r.opp) : null) },
    { key: 'score', label: 'Score', group: 'Call', w: 54, dp: 0, primary: true, scale: 'seq', domain: [0, 100], title: 'The market’s 0-100 score: a rank among tonight’s players, not a probability' },
    ...(withXpts && XPTS_MARKETS.includes(market) ? [{ key: 'xpts', label: 'xPTS', group: 'Call', w: 58, dp: 1, mono: true, title: XPTS_TITLE, fmt: (v, r) => (v == null ? <span style={{ color: C.text3 }}>—</span> : <span title={r.xptsLine || XPTS_TITLE}>{Number(v).toFixed(1)}</span>) }] : []),
    ...(whyCol ? [{ ...whyCol, group: 'Call' }] : []),
    { key: 'status', label: 'Status', group: 'Call', w: 156, heat: false, statusCol: true, fmt: (v, r) => (
      <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center', whiteSpace: 'nowrap' }}>
        <CallStatusBadge status={v} accent={C.purple} />
        {r.role ? <b style={{ fontSize: 10, color: C.purple, fontFamily: NUM_FONT }}>{r.role}</b> : null}
        {!r.locked && v !== 'off' ? <span style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT, fontWeight: 800, letterSpacing: '.08em' }}>PREVIEW</span> : null}
      </span>) },
    { key: 'actual', label: 'Result', group: 'Call', w: 64, heat: false, mono: true, title: market === 'dd' || market === 'td' ? `Did he get ${D.barWord}, once his game is final` : `What he did, once his game is final (${ACTUAL_WORD[market] || ''})`, fmt: (v, r) => (
      r.voidReason ? <span style={{ fontSize: 10, color: C.text3 }}>VOID</span>
        : v == null ? <span style={{ color: C.text3 }}>—</span>
          : <span style={{ color: r.hit ? C.rim : C.text2, fontWeight: 900 }}>{r.hit ? <RimDot size={6} /> : null}{market === 'first' || market === 'dd' || market === 'td' ? (r.hit ? 'YES' : 'NO') : v}</span>) },
    // the opponent-adjusted legs rank him; the column shows his own measured rate (RAW_OF), and OPP x says how the matchup scaled it
    ...D.legs.map((l) => { const k = RAW_OF[l] || l; return { key: k, label: LEG_LABEL[k] || k, group: 'Legs', w: 62, heat: false, mono: true, fmt: (v) => fmtLeg(k, v) } }),
    ...(D.needsLog ? [{ key: market === 'td' ? 'multTd' : 'multDd', label: 'OPP ×', group: 'Legs', w: 58, heat: false, mono: true, title: 'What his opponent allows of the stats he reaches, against the league mean, shrunk for a small sample and clamped to 0.8-1.25. It scales his own rate for the ranking; 1.00 = no adjustment.', fmt: (v) => (v == null ? <span style={{ color: C.text3 }}>—</span> : Number(v).toFixed(2)) }] : []),
    ...(withGame ? [{ key: 'tip', label: 'Game', group: 'Game', w: 84, heat: false, mono: true, dim: true,
      link: (r) => (onOpenGame ? () => onOpenGame(r.gameId) : null),
      fmt: (v, r) => (r.gameState === 'live' ? <span style={{ color: C.rim }}><RimDot size={6} />LIVE</span> : r.gameState === 'final' ? 'FINAL' : v ? fmtTip(v) : '—') }] : []),
    ...(whyCol ? [] : [{ key: 'why', label: 'Why', group: 'Game', w: 300, heat: false, fmt: (v, r) => <span style={{ fontSize: 11, color: C.text3, whiteSpace: 'nowrap' }}>{r.status === 'off' && r.reason ? r.reason : v || ''}{r.injury ? ` · ${r.injury}` : ''}</span> }]),
  ]
}
export const faceOf = (r) => ({ sport: 'nba', id: r.playerId, name: r.name })
