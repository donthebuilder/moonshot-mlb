'use client'
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
import Tap from '../Tap'

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
  <div style={{ font: `800 ${TYPE.micro}px/1 ${NUM_FONT}`, letterSpacing: '.1em', color: C.text3, margin: '8px 0 4px' }}>{children}</div>
)

export default function WriteupBlock({ game, gameCalls, week, matchup, logs, odds, onPlayerClick }) {
  const totals = useTotals(gameCalls?.season)
  const [open, setOpen] = useState(false)
  const g = useMemo(() => (gameCalls?.games || []).find((x) => String(x.game_id) === String(game?.game_id)) || null, [gameCalls, game?.game_id])
  const w = useMemo(() => (g ? buildNflWriteup(g, { week, totals, matchup, logs, odds }) : null), [g, week, totals, matchup, logs, odds])
  if (!w || !(w.players.length || w.noCall.length)) return null
  const playerById = new Map((week?.players || []).map((p) => [String(p.player_id), p]))
  return (
    <section aria-label="The call" style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: '11px 13px', marginBottom: 12, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ font: `900 ${TYPE.label}px/1 ${NUM_FONT}`, letterSpacing: '.12em', color: C.green }}>THE CALL</span>
        <span style={{ fontSize: TYPE.micro, color: C.text3, fontFamily: NUM_FONT }}>{w.when}{w.locked ? ' · locked at kickoff' : ''}</span>
      </div>
      {w.players.map((p) => (
        <div key={p.player_id} style={{ marginTop: 10, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
            <Tap onClick={onPlayerClick ? () => onPlayerClick(playerById.get(p.player_id) || { player_id: p.player_id, name: p.name }, 'TD') : null}
              style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', fontSize: TYPE.name, fontWeight: 900, color: C.text }}>{p.name}</Tap>
            <CallStatusBadge status={p.status} />
            <span style={{ fontSize: TYPE.micro, color: C.text3, fontFamily: NUM_FONT }}>{p.team} {p.position}{p.role === 'TOP' ? ' · TOP' : ''}</span>
          </div>
          <div style={{ fontSize: TYPE.body, color: C.text2, fontFamily: NUM_FONT }}>
            Score {p.tdScore} ({p.grade}) · #{p.rank} of {p.of}{p.posRank ? ` · #${p.posRank} of ${p.posOf} ${p.position}s` : ''}
          </div>
          <ul style={{ margin: '4px 0 0', paddingLeft: 16, fontSize: TYPE.body, lineHeight: 1.5, color: C.text2 }}>
            {(open ? p.why : p.why.slice(0, 2)).map((l) => <li key={l.t} title={l.src}>{l.t}</li>)}
          </ul>
          {open && p.watch.length > 0 && (<><Kicker>WATCH OUT</Kicker>
            <ul style={{ margin: 0, paddingLeft: 16, fontSize: TYPE.body, lineHeight: 1.5, color: C.text2 }}>{p.watch.map((l) => <li key={l.t} title={l.src}>{l.t}</li>)}</ul></>)}
          {open && p.price && <div style={{ marginTop: 4, fontSize: TYPE.body, color: C.text2, fontFamily: NUM_FONT }}>Price {p.price.odds > 0 ? `+${p.price.odds}` : p.price.odds}{p.price.book ? ` at ${p.price.book}` : ''}{p.price.implied != null ? ` (implies ${p.price.implied}%)` : ''}</div>}
        </div>
      ))}
      {open && (<>
        {w.game.length > 0 && (<><Kicker>THE GAME</Kicker>{w.game.map((l) => <div key={l.t} title={l.src} style={{ fontSize: TYPE.body, color: C.text2 }}>{l.t}</div>)}</>)}
        <Kicker>BOTTOM LINE</Kicker>
        {w.bottom.map((l) => <div key={l.t} style={{ fontSize: TYPE.body, color: C.text2 }}>{l.t}</div>)}
        <div style={{ marginTop: 8, fontSize: TYPE.micro, color: C.text3 }}>{w.footer}</div>
      </>)}
      {!open && w.noCall.map((n) => <div key={n.team} style={{ marginTop: 8, fontSize: TYPE.body, color: C.text3 }}>{w.bottom.find((l) => l.t.startsWith(`${n.team}:`))?.t}</div>)}
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
        style={{ marginTop: 6, minHeight: 44, padding: '0 2px', border: 0, background: 'transparent', color: C.green, font: `800 ${TYPE.micro}px/1 ${NUM_FONT}`, letterSpacing: '.06em', cursor: 'pointer' }}>
        {open ? 'SHOW LESS' : 'THE FULL WRITE-UP ›'}
      </button>
    </section>
  )
}
