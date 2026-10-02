'use client'
// GAME CALLS (2026-10-01, BATCH-GAME-CALLS G3 + G5). Donovan: "The model needs
// to get a touchdown out of each game called, preferably one each team."
//
// Every game gets a call: the top player on EACH team by the TD score, the
// higher one TOP, the other TD -- which exists only if he is ON THE BOARD (top
// third). Built and locked by the bot (bots/nfl/nfl_game_calls.py); this only
// reads nfl_game_calls.json. A started game shows its LOCKED call, never a
// re-sort. Words, not a chart (0e: a stranger reads it in 5 seconds): name,
// team, TD score, the slate rank, the stat, and the boardReason why line.
// No probability is printed (the bot logs one; it waits for the calibration
// gate).
import { useEffect, useState } from 'react'
import { C, NUM_FONT, TYPE } from '../../lib/nfl/theme'
import { fetchNfl, nflGameCallsPaths, nflGameCallsTotalsPaths } from '../../lib/nfl/dataSource'
import { reasonFor } from './ScoreAnatomy'

/** The week's game-calls file, fetched once per mount. null = loading; { missing: true } = not there. */
export function useGameCalls() {
  const [data, setData] = useState(null)
  useEffect(() => {
    let alive = true
    // a failed or missing file is said, not hidden (0g E1): { missing: true } draws the waiting line
    fetchNfl(nflGameCallsPaths()).then((d) => { if (alive) setData(d || { missing: true }) }).catch(() => { if (alive) setData({ missing: true }) })
    return () => { alive = false }
  }, [])
  return data
}

/** A game's entry, matched on game_id (string compare: ESPN ids). */
export const gameCallsFor = (data, game) =>
  (data?.games || []).find((x) => String(x.game_id) === String(game?.game_id)) || null

function CallRow({ c, player, why, onPlayerClick }) {
  return (
    <button type="button" onClick={() => onPlayerClick?.(player || { player_id: c.player_id, name: c.name, team: c.team }, 'TD')}
      style={{ display: 'grid', gridTemplateColumns: '44px minmax(0,1fr)', gap: 8, alignItems: 'center', width: '100%', minHeight: 44,
        padding: '7px 10px', borderRadius: 10, border: `1px solid ${c.role === 'TOP' ? C.green : C.border}`, cursor: 'pointer',
        background: c.role === 'TOP' ? `${C.green}12` : C.glass, color: C.text, textAlign: 'left', font: 'inherit' }}>
      <span style={{ fontFamily: NUM_FONT, fontWeight: 900, fontSize: 11, letterSpacing: '.06em', color: c.role === 'TOP' ? C.green : C.text2 }}>{c.role}</span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 13, fontWeight: 800 }}>
          {c.name} <span style={{ color: C.text3, fontWeight: 600, fontFamily: NUM_FONT, fontSize: 11 }}>{c.team} · {c.position}</span>
        </span>
        <span style={{ display: 'block', fontSize: 11.5, color: C.text2, fontFamily: NUM_FONT, marginTop: 1 }}>
          TD score {Math.round(c.score)} · #{c.slate_rank} of {c.of}{Number.isFinite(Number(c.xtd_pg)) ? ` · xTD ${Number(c.xtd_pg).toFixed(2)} a game` : ''}
        </span>
        {/* The why lines are predicates ("is on the field for ..."): his surname leads. */}
        {why && <span style={{ display: 'block', fontSize: 11.5, color: C.text3, marginTop: 1 }}>{String(c.name || '').split(' ').slice(-1)[0]} {why}</span>}
      </span>
    </button>
  )
}

export default function GameCalls({ calls, game, playersById, weights, base, onPlayerClick }) {
  const g = gameCallsFor(calls, game)
  if (!g) {
    if (!calls?.missing) return null
    return (
      <div style={{ marginTop: 10, fontSize: 12, color: C.text3 }}>
        <span style={{ fontSize: TYPE.micro, fontWeight: 900, letterSpacing: '.12em', color: C.text, fontFamily: NUM_FONT, marginRight: 8 }}>GAME CALLS</span>
        Waiting on this week&apos;s calls. They post with the board and lock at kickoff.
      </div>
    )
  }
  const started = game?.state === 'in' || game?.completed
  const list = g.calls || []
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
        <span style={{ fontSize: TYPE.micro, fontWeight: 900, letterSpacing: '.12em', color: C.text, fontFamily: NUM_FONT }}>GAME CALLS</span>
        <span style={{ fontSize: TYPE.micro, color: g.locked ? C.green : C.text3, fontFamily: NUM_FONT, fontWeight: 800 }}>
          {g.locked ? 'LOCKED AT KICKOFF' : started ? 'no call locked for this game' : 'locks at kickoff'}
        </span>
      </div>
      {!list.length && !g.no_call?.length && (
        <div style={{ fontSize: 12, color: C.text3 }}>{g.no_lock_reason || 'No call for this game.'}</div>
      )}
      <div style={{ display: 'grid', gap: 5 }}>
        {list.map((c) => {
          const p = playersById?.[String(c.player_id)]
          return <CallRow key={`${c.role}-${c.player_id}`} c={c} player={p} why={p ? reasonFor(p, weights, base, 'TD') : null} onPlayerClick={onPlayerClick} />
        })}
        {(g.no_call || []).map((n) => (
          <div key={`no-${n.team}`} style={{ fontSize: 12, color: C.text3, padding: '2px 2px' }}>
            {n.text || `No call for ${n.team} — best is ${n.best_name}, #${n.best_rank} of ${n.of}.`}
          </div>
        ))}
      </div>
    </div>
  )
}

/** The season's game-call record in one sentence (BATCH-GAME-CALLS RECORD):
 *  "16 games · 31 calls · 9 scored (TOP 6 of 16, TD 3 of 15) · 1 void".
 *  Kept apart from the week card's five, never merged into its count. */
export function GameCallsRecord({ season }) {
  const [t, setT] = useState(undefined)
  useEffect(() => {
    let alive = true
    if (!season) { setT(null); return undefined }
    fetchNfl(nflGameCallsTotalsPaths(season)).then((d) => { if (alive) setT(d || null) }).catch(() => { if (alive) setT(null) })
    return () => { alive = false }
  }, [season])
  if (t === undefined) return null
  const top = t?.top || {}, second = t?.second || {}
  const graded = (top.n || 0) + (second.n || 0)
  return (
    <div style={{ margin: '8px 0 12px', padding: '10px 12px', borderRadius: 10, border: `1px solid ${C.border}`, background: C.glass }}>
      <div style={{ fontSize: TYPE.micro, fontWeight: 900, letterSpacing: '.12em', color: C.text, fontFamily: NUM_FONT, marginBottom: 3 }}>GAME CALLS</div>
      <div style={{ fontSize: 12.5, color: C.text2, lineHeight: 1.5 }}>
        {graded
          ? <>{t.games} games · {graded} calls · <b style={{ color: C.text }}>{(top.hit || 0) + (second.hit || 0)} scored</b> (TOP {top.hit || 0} of {top.n || 0}, TD {second.hit || 0} of {second.n || 0}){t.voids ? ` · ${t.voids} void` : ''}. One TD call per team, every game, locked at kickoff.</>
          : 'One TD call per team, every game, locked at kickoff. Nothing graded yet \u2014 the first calls grade after this week\u2019s games.'}
      </div>
    </div>
  )
}
