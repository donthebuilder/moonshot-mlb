'use client'
// THE FULL WRITE-UP, HOCKEY DEPTH, DRAWN (2026-10-07). The sentences are lib/writeups/nhl.js
// (nhlDepth / nhlGameDepth: every number a field we hold, thin samples write nothing). This file
// only fetches what they read, once, when the full write-up is opened -- no polling -- and draws
// them as plain lists in LAMP's theme. A finished or live game is given no as-of-now inputs, so it
// never reads its own result back (the library gates on game.state too).
import { useMemo, useState } from 'react'
import { C, NUM_FONT, TYPE } from '../../lib/nhl/theme'
import { nhlDepth, nhlGameDepth, busiestGoalie } from '../../lib/writeups/nhl'
import { XG_COEF } from '../../lib/nhl/xg'
import { useLampShots, useLampGoalies, useLampGoalieZones, useLampSpecialTeams } from '../../lib/nhl/useLamp'

const Kicker = ({ children }) => (
  <div style={{ font: `800 ${TYPE.micro}px/1 ${NUM_FONT}`, letterSpacing: '.1em', color: C.text3, margin: '10px 0 4px' }}>{children}</div>
)

export function DepthSections({ sections }) {
  if (!sections?.length) return null
  return (
    <div>
      {sections.map((s) => (
        <div key={s.key}>
          <Kicker>{s.title}</Kicker>
          <ul style={{ margin: 0, paddingLeft: 16, fontSize: TYPE.body, lineHeight: 1.5, color: C.text2 }}>
            {s.lines.map((l, i) => <li key={`${i}-${l.t}`} title={l.src}>{l.t}</li>)}
          </ul>
        </div>
      ))}
    </div>
  )
}

/** what the sentences read, fetched only for an unstarted game; `clubs` = the clubs whose defence and goalie are wanted */
function useInputs(bg, { player = null, clubs = [] }) {
  const pre = bg?.game?.state === 'pre'
  const shots = useLampShots(pre && player ? { player } : null, 'auto')
  const a0 = useLampShots(pre && clubs[0] ? { against: clubs[0] } : null, 'auto')
  const a1 = useLampShots(pre && clubs[1] ? { against: clubs[1] } : null, 'auto')
  const season = a0.data?.season || a1.data?.season || shots.data?.season || null
  const goalies = useLampGoalies(season, pre && clubs.length > 0)
  const ids = clubs.map((c) => busiestGoalie(goalies.data, c)?.id || null)
  const z0 = useLampGoalieZones(ids[0], season)
  const z1 = useLampGoalieZones(ids[1], season)
  const special = useLampSpecialTeams()
  const busy = pre && [shots, a0, a1, goalies, z0, z1, special].some((x) => x.loading)
  const inp = useMemo(() => ({
    shots: shots.data || null,
    against: Object.fromEntries([[clubs[0], a0.data], [clubs[1], a1.data]].filter(([k, v]) => k && v)),
    goalies: goalies.data || null,
    zones: Object.fromEntries([[ids[0], z0.data], [ids[1], z1.data]].filter(([k, v]) => k && v)),
    special: special.data || null,
    goalieK: XG_COEF.goalie.k,
  }), [shots.data, a0.data, a1.data, goalies.data, z0.data, z1.data, special.data, clubs.join(), ids.join()])   // eslint-disable-line react-hooks/exhaustive-deps
  return { inp, busy }
}

const Busy = () => <div style={{ fontSize: TYPE.micro, color: C.text3, fontFamily: NUM_FONT, margin: '8px 0' }}>Reading the shot maps…</div>

/** one skater's sections. scope 'game': the game's own sections carry rest, special teams and the goalies. */
export function PlayerDepth({ row, game, scope = 'player' }) {
  const { inp, busy } = useInputs(game, { player: row?.playerId, clubs: [row?.opp] })
  const sections = useMemo(() => nhlDepth(row, game, inp, { game: scope === 'game' }), [row, game, inp, scope])
  if (busy && !sections.length) return <Busy />
  return <DepthSections sections={sections} />
}

/** the game's own sections: rest, special teams, the goalies */
export function GameDepth({ game }) {
  const clubs = [game?.game?.away?.abbrev, game?.game?.home?.abbrev]
  const { inp, busy } = useInputs(game, { clubs })
  const sections = useMemo(() => nhlGameDepth(game, inp), [game, inp])
  if (busy && !sections.length) return <Busy />
  return <DepthSections sections={sections} />
}

/** the player page's own toggle (the game page's is the write-up's) */
export function PlayerDepthToggle({ row, game }) {
  const [open, setOpen] = useState(false)
  if (!row || !game) return null
  return (
    <div style={{ marginTop: 2 }}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
        style={{ minHeight: 44, padding: '0 2px', border: 0, background: 'transparent', color: C.ice, font: `800 ${TYPE.micro}px/1 ${NUM_FONT}`, letterSpacing: '.06em', cursor: 'pointer' }}>
        {open ? 'SHOW LESS' : 'THE FULL WRITE-UP ›'}
      </button>
      {open && <PlayerDepth row={row} game={game} />}
    </div>
  )
}
