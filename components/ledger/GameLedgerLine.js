'use client'
// LEDGER FOR THIS GAME (2026-10-07): one line on a game's page -- who scored first in it (the first home run,
// touchdown or goal) and whether the board had him: CALLED / ON THE BOARD / NOT ON THE BOARD. It reads the
// same first-scorer rows the Ledger's FIRST SCORERS section prints (lib/ledger/firstScorers.js via
// /api/ledger/first, cached five minutes): nothing new is stored or derived. A game with no first scorer on
// file yet (not started, or no scoring) draws nothing at all -- never a placeholder. Who else was called, and
// who else scored, is the Ledger's Tonight tab: the line links there. His name is a link to his card.
import { useEffect, useState } from 'react'
import { useSportTheme } from '../SportTheme'
import CallStatusBadge from '../CallStatusBadge'
import { ledgerHash } from '../../lib/ledger/views'
import { isHiddenSport, playerHref } from '../../lib/routes'

const FIRST = { mlb: 'first home run', nfl: 'first touchdown', nhl: 'first goal', nba: 'first basket' }

export default function GameLedgerLine({ sport, gameId, day = null }) {
  const { C, NUM_FONT, accent } = useSportTheme()
  const [row, setRow] = useState(null)
  useEffect(() => {
    if (!gameId || isHiddenSport(sport)) return undefined
    let alive = true
    setRow(null)
    fetch(`/api/ledger/first?sport=${encodeURIComponent(sport)}${day ? `&day=${encodeURIComponent(day)}` : ''}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive) setRow((j?.games || []).find((g) => String(g.gameId) === String(gameId)) || null) })
      .catch(() => {})
    return () => { alive = false }
  }, [sport, gameId, day])
  if (!row) return null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px 10px', flexWrap: 'wrap', minHeight: 44, padding: '0 2px', borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, margin: '8px 0' }}>
      <span style={{ font: `900 10px/1 ${NUM_FONT}`, letterSpacing: '.12em', color: C.text3 }}>LEDGER FOR THIS GAME</span>
      <span style={{ fontSize: 13, color: C.text2 }}>
        {FIRST[sport]}:{' '}
        {row.playerId
          ? <a href={playerHref(sport, row.playerId)} style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44, color: C.text, fontWeight: 800, textDecoration: 'none' }}>{row.name}</a>
          : <b style={{ color: C.text }}>{row.name}</b>}
        {row.when ? <span style={{ color: C.text3, fontFamily: NUM_FONT, fontSize: 11 }}> · {row.when}</span> : null}
      </span>
      <CallStatusBadge status={row.status} accent={accent} theme={C} numFont={NUM_FONT} />
      <a href={ledgerHash(sport)} style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', minHeight: 44, color: C.text2, font: `800 11px/1 ${NUM_FONT}`, textDecoration: 'none', whiteSpace: 'nowrap' }}>The Ledger ›</a>
    </div>
  )
}
