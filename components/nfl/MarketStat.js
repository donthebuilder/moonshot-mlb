'use client'
import { NUM_FONT } from '../../lib/nfl/theme'

// THE NUMBER THAT MATTERS, DOMINANT (2026-10-03, Donovan: "the cards for
// football ... look the same ... make the important number dominant"). Each
// market's own per-game figure from the week file's stats (nfl_week.json
// players[].stats, the same numbers the board's columns print), large, in the
// card's grade colour, with its label -- so a receiving-yards card reads
// "125 REC YDS/G" at a glance and a TD card reads its xTD. Renders nothing
// when the player has no such stat (a kicker on a yards board, a fresh call-up).
const SPEC = {
  TD:       [(s) => s.xTD, 'xTD/G', 2],
  REC_YDS:  [(s) => s.RECYD, 'REC YDS/G', 0],
  REC:      [(s) => s.REC, 'REC/G', 1],
  RUSH_YDS: [(s) => s.RUYD, 'RUSH YDS/G', 0],
  RUSH_ATT: [(s) => s.CAR, 'CAR/G', 1],
  PASS_YDS: [(s) => s.PAYD, 'PASS YDS/G', 0],
  KICK_PTS: [(s) => (Number.isFinite(Number(s.FGM)) || Number.isFinite(Number(s.PAT)) ? 3 * (Number(s.FGM) || 0) + (Number(s.PAT) || 0) : null), 'KICK PTS/G', 1],
}

export default function MarketStat({ player, market, color, C }) {
  const spec = SPEC[market]
  if (!spec) return null
  const [get, label, dp] = spec
  const v = Number(get(player?.stats || {}))
  if (!Number.isFinite(v)) return null
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
      <b style={{ font: `900 26px/1 ${NUM_FONT}`, color, letterSpacing: '-.02em' }}>{v.toFixed(dp)}</b>
      <span style={{ font: `800 11px/1 ${NUM_FONT}`, color: C.text3, letterSpacing: '.06em' }}>{label}</span>
    </div>
  )
}
