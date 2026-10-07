'use client'
// THE CALLS, ONE BLOCK (2026-10-06, fix5-nflgame). The game page used to say the
// same two calls three times -- GAME CALLS, THE CALL and TOP TD LOOKS -- with
// three different scores (75, 75.1, 52). Now each team's called player appears
// once, with his score from ONE source: the game's own call (nfl_game_calls.json,
// c.score). The reasons, watch-outs and price are still the write-up's own
// (lib/writeups/build.js), never reworded here. Before that:
// THE CALL, ON THE GAME PAGE (BATCH-GAME-WRITEUP, 2026-10-04). The same
// write-up Discord and X get (lib/writeups/build.js -> text.js), drawn from the
// same JSON, so the site can never say something the post didn't. Phone first:
// each called player's name, status, score and two reasons; the full write-up
// (watch-outs, price, bottom line) one tap down, so the first useful row on the
// game page doesn't move far.
import { useEffect, useMemo, useState } from 'react'
import { C, NUM_FONT, TYPE } from '../../lib/nfl/theme'
import { buildNflWriteup } from '../../lib/writeups/build'
import { fetchNfl, nflGameCallsTotalsPaths } from '../../lib/nfl/dataSource'
import CallStatusBadge from '../CallStatusBadge'
import PlayerFace from '../PlayerFace'
import Tap from '../Tap'
import TeamMark from '../TeamMark'
import { gradeFor } from '../../lib/nfl/theme'

function useTotals(season) {
  const [t, setT] = useState(null)
  useEffect(() => {
    if (!season) return undefined
    let alive = true
    fetchNfl(nflGameCallsTotalsPaths(season)).then((d) => { if (alive) setT(d || null) }).catch(() => { if (alive) setT(null) })
    return () => { alive = false }
  }, [season])
  return t
}

const Kicker = ({ children }) => (
  <div style={{ font: `800 12px/1 ${NUM_FONT}`, letterSpacing: '.1em', color: C.text2, margin: '10px 0 4px' }}>{children}</div>
)

export default function WriteupBlock({ game, gameCalls, week, matchup, logs, odds, onPlayerClick, onOpenTeam = null }) {
  const totals = useTotals(gameCalls?.season)
  const [open, setOpen] = useState(false)
  const g = useMemo(() => (gameCalls?.games || []).find((x) => String(x.game_id) === String(game?.game_id)) || null, [gameCalls, game?.game_id])
  const w = useMemo(() => (g ? buildNflWriteup(g, { week, totals, matchup, logs, odds }) : null), [g, week, totals, matchup, logs, odds])
  const head = (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 2 }}>
      <span style={{ font: `900 12px/1 ${NUM_FONT}`, letterSpacing: '.12em', color: C.green }}>OUR CALLS</span>
      <span style={{ fontSize: 12, color: C.text3 }}>{g?.locked ? 'Locked at kickoff' : 'Locks at kickoff'}</span>
    </div>
  )
  // no file yet, or no entry for this game: said, never hidden (0g E1)
  if (!g) {
    if (!gameCalls?.missing) return null
    return <section aria-label="Our calls" style={{ marginBottom: 16 }}>{head}<div style={{ fontSize: 13, color: C.text3 }}>Waiting on this week&apos;s calls. They post with the board and lock at kickoff.</div></section>
  }
  if (!w || !(w.players.length || w.noCall.length)) {
    return <section aria-label="Our calls" style={{ marginBottom: 16 }}>{head}<div style={{ fontSize: 13, color: C.text3 }}>{g.no_lock_reason || 'No call for this game.'}</div></section>
  }
  const playerById = new Map((week?.players || []).map((p) => [String(p.player_id), p]))
  const callOf = (id) => (g.calls || []).find((c) => String(c.player_id) === String(id)) || null
  return (
    <section aria-label="Our calls" style={{ marginBottom: 16, minWidth: 0 }}>
      {head}
      {w.players.map((p) => {
        const c = callOf(p.player_id)
        const row = playerById.get(p.player_id)
        const score = c && Number.isFinite(Number(c.score)) ? Math.round(c.score) : p.tdScore != null ? Math.round(p.tdScore) : null
        return (
          <div key={p.player_id} style={{ marginTop: 8, padding: '10px 0', borderTop: `1px solid ${C.border}`, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <PlayerFace sport="nfl" espnId={row?.espn_id} team={p.team} name={p.name} size={44} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                  <Tap onClick={onPlayerClick ? () => onPlayerClick(row || { player_id: p.player_id, name: p.name }, 'TD') : null}
                    style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', fontSize: 15, fontWeight: 900, color: C.text }}>{p.name}</Tap>
                  <CallStatusBadge status={p.status} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.text2, marginTop: -6 }}>
                  <Tap onClick={onOpenTeam && (() => onOpenTeam(p.team))} style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', gap: 5 }}><TeamMark sport="nfl" abbr={p.team} variant="logo" px={16} />{p.team}</Tap> · {p.position}
                  <span title={p.role === 'TOP' ? "The game's top call" : 'The other team\'s call'} style={{ fontFamily: NUM_FONT, fontWeight: 800, color: p.role === 'TOP' ? C.green : C.text2 }}>{p.role === 'TOP' ? 'TOP CALL' : 'TD CALL'}</span>
                </div>
              </div>
              {score != null && <b title="Touchdown score, out of 100" style={{ fontFamily: NUM_FONT, fontSize: 24, color: gradeFor(c?.score ?? p.tdScore).color }}>{score}</b>}
            </div>
            <div style={{ marginTop: 4, fontSize: 12, color: C.text2, fontFamily: NUM_FONT }}>
              #{c?.slate_rank ?? p.rank} of {c?.of ?? p.of} this week{p.posRank ? ` · #${p.posRank} of ${p.posOf} ${p.position}s` : ''}{Number.isFinite(Number(c?.xtd_pg)) ? ` · ${Number(c.xtd_pg).toFixed(2)} touchdowns expected a game` : ''}
            </div>
            <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 13, lineHeight: 1.5, color: C.text2 }}>
              {(open ? p.why : p.why.slice(0, 2)).map((l) => <li key={l.t} title={l.src}>{l.t}</li>)}
            </ul>
            {open && p.watch.length > 0 && (<><Kicker>WATCH OUT</Kicker>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.5, color: C.text2 }}>{p.watch.map((l) => <li key={l.t} title={l.src}>{l.t}</li>)}</ul></>)}
            {open && p.price && <div style={{ marginTop: 4, fontSize: 13, color: C.text2, fontFamily: NUM_FONT }}>Price {p.price.odds > 0 ? `+${p.price.odds}` : p.price.odds}{p.price.book ? ` at ${p.price.book}` : ''}{p.price.implied != null ? ` (implies ${p.price.implied}%)` : ''}</div>}
          </div>
        )
      })}
      {open && (<>
        {w.game.length > 0 && (<><Kicker>THE GAME</Kicker>{w.game.map((l) => <div key={l.t} title={l.src} style={{ fontSize: 13, color: C.text2 }}>{l.t}</div>)}</>)}
        <Kicker>BOTTOM LINE</Kicker>
        {w.bottom.map((l) => <div key={l.t} style={{ fontSize: 13, color: C.text2 }}>{l.t}</div>)}
        <div style={{ marginTop: 8, fontSize: 12, color: C.text3 }}>{w.footer}</div>
      </>)}
      {!open && w.noCall.map((n) => <div key={n.team} style={{ marginTop: 8, fontSize: 13, color: C.text3 }}>{w.bottom.find((l) => l.t.startsWith(`${n.team}:`))?.t}</div>)}
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
        style={{ marginTop: 2, minHeight: 44, padding: '0 2px', border: 0, background: 'transparent', color: C.green, font: `800 13px/1 ${NUM_FONT}`, letterSpacing: '.04em', cursor: 'pointer' }}>
        {open ? 'SHOW LESS' : 'THE FULL WRITE-UP ›'}
      </button>
    </section>
  )
}
