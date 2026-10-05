'use client'
// THE CALL, ON MOONSHOT'S GAME PAGE (2026-10-05). The same write-up the per-game CALL post
// carries (lib/writeups/mlb.js -> text.js), drawn from the same board rows, so the site can't
// say something the post didn't. TUDDY's WriteupBlock look (components/nfl/WriteupBlock.js) in
// MOONSHOT's colours. Phone first: each called hitter's name, status, bar and two reasons; the
// rest (watch-outs, the game, the bottom line) one tap down.
import { useMemo, useState } from 'react'
import { C, NUM_FONT, TYPE } from '../lib/theme'
import { SPORT_ACCENT } from '../lib/sportAccent'
import { buildMlbWriteup } from '../lib/writeups/mlb'
import CallStatusBadge from './CallStatusBadge'
import Tap from './Tap'

const ACCENT = SPORT_ACCENT.mlb
const Kicker = ({ children }) => (
  <div style={{ font: `800 ${TYPE.micro}px/1 ${NUM_FONT}`, letterSpacing: '.1em', color: C.text3, margin: '8px 0 4px' }}>{children}</div>
)

export default function MlbWriteupBlock({ rows, onPlayerClick }) {
  const [open, setOpen] = useState(false)
  const w = useMemo(() => buildMlbWriteup(rows || []), [rows])
  if (!w || !w.players.length) return null
  const byId = new Map((rows || []).map((r) => [String(r.player_id), r]))
  return (
    <section aria-label="The call" style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: '11px 13px', marginBottom: 12, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ font: `900 ${TYPE.label}px/1 ${NUM_FONT}`, letterSpacing: '.12em', color: ACCENT }}>THE CALL</span>
        <span style={{ fontSize: TYPE.micro, color: C.text3, fontFamily: NUM_FONT }}>{w.when}{w.locked ? ' · lineups confirmed' : ' · lineups not confirmed yet'}</span>
      </div>
      {w.players.map((p) => (
        <div key={p.player_id} style={{ marginTop: 10, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
            <Tap onClick={onPlayerClick ? () => onPlayerClick(byId.get(p.player_id) || { player_id: p.player_id, name: p.name }) : null}
              style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', fontSize: TYPE.name, fontWeight: 900, color: C.text }}>{p.name}</Tap>
            <CallStatusBadge status={p.status} />
            <span style={{ fontSize: TYPE.micro, color: C.text3, fontFamily: NUM_FONT }}>{p.team} · {p.role}</span>
          </div>
          <div style={{ fontSize: TYPE.body, color: C.text2, fontFamily: NUM_FONT }}>
            {[p.bar, p.score != null ? `${p.scoreName} ${p.score}` : null, p.rank != null && p.of ? `#${p.rank} of ${p.of}` : null, p.spot ? `bats ${p.spot}` : null].filter(Boolean).join(' · ')}
          </div>
          <ul style={{ margin: '4px 0 0', paddingLeft: 16, fontSize: TYPE.body, lineHeight: 1.5, color: C.text2 }}>
            {(open ? p.why : p.why.slice(0, 2)).map((l) => <li key={l.t} title={l.src}>{l.t}</li>)}
          </ul>
          {open && p.watch.length > 0 && (<><Kicker>WATCH OUT</Kicker>
            <ul style={{ margin: 0, paddingLeft: 16, fontSize: TYPE.body, lineHeight: 1.5, color: C.text2 }}>{p.watch.map((l) => <li key={l.t} title={l.src}>{l.t}</li>)}</ul></>)}
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
        style={{ marginTop: 6, minHeight: 44, padding: '0 2px', border: 0, background: 'transparent', color: ACCENT, font: `800 ${TYPE.micro}px/1 ${NUM_FONT}`, letterSpacing: '.06em', cursor: 'pointer' }}>
        {open ? 'SHOW LESS' : 'THE FULL WRITE-UP ›'}
      </button>
    </section>
  )
}
