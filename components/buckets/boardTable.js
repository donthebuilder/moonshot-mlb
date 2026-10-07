'use client'
// 🏀 THE BOARD'S ROWS AND COLUMNS -- one definition read by Props (one market),
// the Slate (one game) and the player's file, so a board row reads the same
// everywhere. Columns carry their group in order (skin v2): Player · Call ·
// Legs · Game. Status words come from lib/callStatus via CallStatusBadge.
import CallStatusBadge from '../CallStatusBadge'
import { C, NUM_FONT } from '../../lib/nba/theme'
import { NBA_MARKETS, LEG_LABEL, fmtLeg, ACTUAL_WORD } from '../../lib/nba/legs'
import { fmtTip, RimDot } from './ui'

/** board route rows -> table rows (the game's matchup and tip joined on). */
export function boardRows(data, { calledOnly = false, gameId = null } = {}) {
  const games = new Map((data?.games || []).map((g) => [g.id, g]))
  return (data?.rows || [])
    .filter((r) => (!calledOnly || r.status === 'called') && (!gameId || r.gameId === gameId))
    .sort((a, b) => (a.nightRank ?? 9999) - (b.nightRank ?? 9999) || String(a.name).localeCompare(String(b.name)))
    .map((r) => {
      const g = games.get(r.gameId)
      return { ...r, _id: `${r.gameId}-${r.playerId}`, oppTxt: r.home ? r.opp : `@${r.opp}`, tip: g?.start || null, gameState: g?.state || null, ...Object.fromEntries(Object.entries(r.legs || {})) }
    })
}

/** The columns for one market. `withGame` adds the game column (off on the one-game Slate). */
export function boardColumns(market, { onOpenTeam, onOpenGame, withGame = true, whyCol = null } = {}) {
  const D = NBA_MARKETS[market] || NBA_MARKETS.pts
  return [
    { key: 'nightRank', label: '#', group: 'Player', w: 36, heat: false, mono: true, dim: true, title: 'His rank on the night’s board for this market' },
    { key: 'name', label: 'Player', group: 'Player', w: 150, heat: false, bold: true, sticky: true },
    { key: 'pos', label: 'Pos', group: 'Player', w: 36, heat: false, mono: true, dim: true },
    { key: 'team', label: 'Tm', group: 'Player', w: 52, heat: false, mono: true, teamMark: 'nba', link: (r) => (onOpenTeam ? () => onOpenTeam(r.team) : null) },
    { key: 'oppTxt', label: 'Opp', group: 'Player', w: 52, heat: false, mono: true, dim: true, link: (r) => (onOpenTeam ? () => onOpenTeam(r.opp) : null) },
    { key: 'score', label: 'Score', group: 'Call', w: 54, dp: 0, primary: true, scale: 'seq', domain: [0, 100], title: 'The market’s 0-100 score: a rank among tonight’s players, not a probability' },
    ...(whyCol ? [{ ...whyCol, group: 'Call' }] : []),
    { key: 'status', label: 'Status', group: 'Call', w: 156, heat: false, statusCol: true, fmt: (v, r) => (
      <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center', whiteSpace: 'nowrap' }}>
        <CallStatusBadge status={v} accent={C.purple} />
        {r.role ? <b style={{ fontSize: 10, color: C.purple, fontFamily: NUM_FONT }}>{r.role}</b> : null}
        {!r.locked && v !== 'off' ? <span style={{ fontSize: 10, color: C.amber, fontFamily: NUM_FONT, fontWeight: 800, letterSpacing: '.08em' }}>PREVIEW</span> : null}
      </span>) },
    { key: 'actual', label: 'Result', group: 'Call', w: 64, heat: false, mono: true, title: `What he did, once his game is final (${ACTUAL_WORD[market] || ''})`, fmt: (v, r) => (
      r.voidReason ? <span style={{ fontSize: 10, color: C.text3 }}>VOID</span>
        : v == null ? <span style={{ color: C.text3 }}>—</span>
          : <span style={{ color: r.hit ? C.rim : C.text2, fontWeight: 900 }}>{r.hit ? <RimDot size={6} /> : null}{market === 'first' ? (r.hit ? 'YES' : 'NO') : v}</span>) },
    ...D.legs.map((l) => ({ key: l, label: LEG_LABEL[l] || l, group: 'Legs', w: 62, heat: false, mono: true, fmt: (v) => fmtLeg(l, v) })),
    ...(withGame ? [{ key: 'tip', label: 'Game', group: 'Game', w: 84, heat: false, mono: true, dim: true,
      link: (r) => (onOpenGame ? () => onOpenGame(r.gameId) : null),
      fmt: (v, r) => (r.gameState === 'live' ? <span style={{ color: C.rim }}><RimDot size={6} />LIVE</span> : r.gameState === 'final' ? 'FINAL' : v ? fmtTip(v) : '—') }] : []),
    ...(whyCol ? [] : [{ key: 'why', label: 'Why', group: 'Game', w: 300, heat: false, fmt: (v, r) => <span style={{ fontSize: 11, color: C.text3, whiteSpace: 'nowrap' }}>{r.status === 'off' && r.reason ? r.reason : v || ''}{r.injury ? ` · ${r.injury}` : ''}</span> }]),
  ]
}
export const faceOf = (r) => ({ sport: 'nba', id: r.playerId, name: r.name })
