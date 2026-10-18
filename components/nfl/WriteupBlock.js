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
import { useLockOf, CardLockLine } from '../MemberGate'
import { useIsPhone } from '../MobileFold'
import { Chip, ChipRow } from '../writeups/ChipLines'
import { useEffect, useMemo, useState } from 'react'
import { C, NUM_FONT, TYPE } from '../../lib/nfl/theme'
import { buildNflWriteup } from '../../lib/writeups/build'
import { fetchNfl, nflGameCallsTotalsPaths } from '../../lib/nfl/dataSource'
import CallStatusBadge from '../CallStatusBadge'
import PlayerFace from '../PlayerFace'
import Tap from '../Tap'
import { DepthSections } from './DepthWriteup'
import TeamMark from '../TeamMark'
import { gradeFor } from '../../lib/nfl/theme'
import PlayerInjuryChip from '../injuries/PlayerInjuryChip'

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

const CHIP_THEME = { C, NUM_FONT, TYPE, get accent() { return C.green } }   // read at draw time: C is mutated after mount (applyTheme)
const Kicker = ({ children }) => (
  <div style={{ font: `800 12px/1 ${NUM_FONT}`, letterSpacing: '.1em', color: C.text2, margin: '10px 0 4px' }}>{children}</div>
)

// ── THE CALLS AS CARDS (2026-10-10, Donovan: "show the top touchdown cards ... better on the games") ──────────────────
// The headline of the game page. The player-card look (lib/cards/playerCard.js) at screen size: a thin frame, the status word
// letter-spaced on top, the face over a faded club mark, the score big and slanted, the name in heavy capitals, club logo and role,
// ONE reason, a thin bar. Foil only on CALLED. The called men first (the bot's calls for this game, unchanged), then this game's
// top touchdown scores that are not calls, wearing their own board word (tdCallStatus on their board rank). One row you swipe on a
// phone; three show, "+N more" opens the rest. The tap opens the player page.
function CallCard({ x, onPlayerClick, onOpenTeam }) {
  const called = x.status === 'called'
  const sc = Number.isFinite(Number(x.score)) ? Math.round(x.score) : null
  const col = gradeFor(x.score).color
  return (
    <div data-call-card={x.player_id} style={{ position: 'relative', flex: '0 0 min(272px, 80%)', scrollSnapAlign: 'start', minWidth: 0, boxSizing: 'border-box', border: `2px solid ${called ? `${C.green}88` : C.border2}`, borderRadius: 14, overflow: 'hidden', background: `radial-gradient(circle at 12% 0%, ${called ? `${C.green}24` : `${C.text}0d`} 0%, transparent 60%), ${C.bg2}` }}>
      <div aria-hidden="true" style={{ height: 4, background: called ? `linear-gradient(100deg, ${C.green}, ${C.text} 22%, ${C.green} 44%, ${C.text2} 66%, ${C.green})` : 'transparent' }} />
      <div style={{ position: 'absolute', right: -14, top: 26, opacity: 0.12, pointerEvents: 'none' }}><TeamMark sport="nfl" abbr={x.team} variant="logo" px={110} /></div>
      <div style={{ position: 'relative', padding: '8px 12px 10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 20 }}>
          <CallStatusBadge status={x.status} />
          <PlayerInjuryChip who={{ player_id: x.player_id, name: x.name, team: x.team }} C={C} font={NUM_FONT} size={9} />
          <span style={{ flex: 1, height: 1, background: called ? `${C.green}55` : C.border }} />
          <span style={{ fontFamily: NUM_FONT, fontSize: 11, fontWeight: 800, letterSpacing: '.12em', color: x.role === 'TOP' ? C.green : C.text2 }}>{x.role === 'TOP' ? 'TOP CALL' : x.role === 'TD' ? 'TD CALL' : `#${x.rank} OF ${x.of}`}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
          <PlayerFace sport="nfl" espnId={x.espn_id} team={x.team} name={x.name} size={52} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <Tap onClick={onPlayerClick ? () => onPlayerClick(x.row || { player_id: x.player_id, name: x.name }, 'TD') : null}
              style={{ minHeight: 44, display: 'flex', alignItems: 'center', fontSize: 17, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '-.01em', lineHeight: 1.05, color: C.text, transform: 'skewX(-8deg)', transformOrigin: 'left center' }}>{x.name}</Tap>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: C.text2, marginTop: -4 }}>
              <Tap onClick={onOpenTeam && (() => onOpenTeam(x.team))} style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', gap: 4 }}><TeamMark sport="nfl" abbr={x.team} variant="logo" px={16} />{x.team}</Tap>
              <span>· {x.depth_role || x.position}</span>
            </div>
          </div>
          {sc != null && <b title="Touchdown score, out of 100" style={{ fontFamily: NUM_FONT, fontSize: 38, fontWeight: 900, lineHeight: 1, color: col, transform: 'skewX(-8deg)', letterSpacing: '-.02em' }}>{sc}</b>}
        </div>
        {sc != null && <div aria-hidden="true" style={{ height: 4, borderRadius: 2, background: `${C.text}1a`, marginTop: 6 }}><div style={{ width: `${Math.max(4, Math.min(100, sc))}%`, height: 4, borderRadius: 2, background: col }} /></div>}
        {x.reason && <div style={{ marginTop: 8, fontSize: 12, lineHeight: 1.4, color: C.text2, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{x.reason}</div>}
      </div>
    </div>
  )
}

function CallsStrip({ cards, onPlayerClick, onOpenTeam }) {
  const [all, setAll] = useState(false)
  const shown = all ? cards : cards.slice(0, 3)
  const more = cards.length - shown.length
  return (
    <div style={{ display: 'flex', gap: 10, overflowX: 'auto', scrollSnapType: 'x proximity', margin: '6px -14px 0', padding: '2px 14px 8px', WebkitOverflowScrolling: 'touch' }}>
      {shown.map((x) => <CallCard key={x.player_id} x={x} onPlayerClick={onPlayerClick} onOpenTeam={onOpenTeam} />)}
      {more > 0 && (
        <button type="button" onClick={() => setAll(true)} style={{ flex: '0 0 72px', minHeight: 120, border: `1px dashed ${C.border2}`, borderRadius: 14, background: 'transparent', color: C.green, font: `800 13px/1.3 ${NUM_FONT}`, cursor: 'pointer', scrollSnapAlign: 'start' }}>+{more}<br />more</button>
      )}
    </div>
  )
}

export default function WriteupBlock({ game, gameCalls, week, matchup, logs, odds, onPlayerClick, onOpenTeam = null, extras: extrasIn = [] }) {
  const totals = useTotals(gameCalls?.season)
  const [open, setOpen] = useState(false)
  const phone = useIsPhone(560)   // the open view as chips on a phone (2026-10-17); a wider screen keeps the lists
  const g = useMemo(() => (gameCalls?.games || []).find((x) => String(x.game_id) === String(game?.game_id)) || null, [gameCalls, game?.game_id])
  const w0 = useMemo(() => (g ? buildNflWriteup(g, { week, totals, matchup, logs, odds }) : null), [g, week, totals, matchup, logs, odds])
  // MEMBERS GATE (2026-10-16, components/MemberGate.js): a CALLED player a non-member may not read is left out, with the lines that can name him (the game and bottom
  // lines, the full write-up); one count line says how many are for members. Members, unknown membership, started games: unchanged.
  const lockOf = useLockOf()
  const kick = g?.kickoff ? Date.parse(g.kickoff) : null
  const isHidden = (x) => x.status === 'called' && lockOf({ status: 'called', key: String(x.player_id), time: kick }).locked
  const hiddenN = (w0 ? w0.players.filter(isHidden).length : 0) + extrasIn.filter(isHidden).length
  const w = hiddenN > 0 && w0 ? { ...w0, players: w0.players.filter((p) => !isHidden(p)), game: [], bottom: [], noCall: [], footer: '' } : w0
  const extras = hiddenN > 0 ? extrasIn.filter((e) => !isHidden(e)) : extrasIn
  const head = (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 2 }}>
      <span style={{ font: `900 12px/1 ${NUM_FONT}`, letterSpacing: '.12em', color: C.green }}>OUR CALLS</span>
      <span style={{ fontSize: 12, color: C.text3 }}>{g?.locked ? 'Locked at kickoff' : 'Locks at kickoff'}</span>
    </div>
  )
  // no file yet, or no entry for this game: said, never hidden (0g E1)
  if (!g) {
    if (!gameCalls?.missing) return null
    return <section aria-label="Our calls" style={{ marginBottom: 16 }}>{head}<div style={{ fontSize: 13, color: C.text3 }}>Waiting on this week&apos;s calls. They post with the board and lock at kickoff.</div>{extras.length > 0 && <CallsStrip cards={extras} onPlayerClick={onPlayerClick} onOpenTeam={onOpenTeam} />}</section>
  }
  if (!w || !(w.players.length || w.noCall.length)) {
    return <section aria-label="Our calls" style={{ marginBottom: 16 }}>{head}{hiddenN > 0
      ? <CardLockLine C={C} NUM_FONT={NUM_FONT} />   /* every call here is for members: never say "no call" (it would be false) */
      : <div style={{ fontSize: 13, color: C.text3 }}>{g.no_lock_reason || 'No call for this game.'}</div>}{extras.length > 0 && <CallsStrip cards={extras} onPlayerClick={onPlayerClick} onOpenTeam={onOpenTeam} />}</section>
  }
  const playerById = new Map((week?.players || []).map((p) => [String(p.player_id), p]))
  const callOf = (id) => (g.calls || []).find((c) => String(c.player_id) === String(id)) || null
  return (
    <section aria-label="Our calls" style={{ marginBottom: 16, minWidth: 0 }}>
      {head}
      {!open && (() => {
        const called = w.players.map((p) => {
          const c = callOf(p.player_id)
          const row = playerById.get(p.player_id)
          return { player_id: p.player_id, name: p.name, team: p.team, position: p.position, depth_role: p.depth_role, role: p.role, status: p.status, espn_id: row?.espn_id, row,
            score: c && Number.isFinite(Number(c.score)) ? c.score : p.tdScore, reason: p.why?.[0]?.t || null }
        })
        const have = new Set(called.map((x) => String(x.player_id)))
        return <CallsStrip cards={[...called, ...extras.filter((e) => !have.has(String(e.player_id)))]} onPlayerClick={onPlayerClick} onOpenTeam={onOpenTeam} />
      })()}
      {open && w.players.map((p) => {
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
                  <Tap onClick={onOpenTeam && (() => onOpenTeam(p.team))} style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', gap: 5 }}><TeamMark sport="nfl" abbr={p.team} variant="logo" px={16} />{p.team}</Tap> · {p.depth_role || p.position}
                  <span title={p.role === 'TOP' ? "The game's top call" : 'The other team\'s call'} style={{ fontFamily: NUM_FONT, fontWeight: 800, color: p.role === 'TOP' ? C.green : C.text2 }}>{p.role === 'TOP' ? 'TOP CALL' : 'TD CALL'}</span>
                </div>
              </div>
              {score != null && <b title="Touchdown score, out of 100" style={{ fontFamily: NUM_FONT, fontSize: 24, color: gradeFor(c?.score ?? p.tdScore).color }}>{score}</b>}
            </div>
            {phone ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                <Chip theme={CHIP_THEME} value={`#${c?.slate_rank ?? p.rank}`} label={`of ${c?.of ?? p.of} this week`} heat={(c?.slate_rank ?? p.rank) <= 5 ? 2 : 0} />
                {p.posRank ? <Chip theme={CHIP_THEME} value={`#${p.posRank}`} label={`of ${p.posOf} ${p.position}s`} /> : null}
                {Number.isFinite(Number(c?.xtd_pg)) ? <Chip theme={CHIP_THEME} value={Number(c.xtd_pg).toFixed(2)} label="TDs expected a game" /> : null}
              </div>
            ) : (
            <div style={{ marginTop: 4, fontSize: 12, color: C.text2, fontFamily: NUM_FONT }}>
              #{c?.slate_rank ?? p.rank} of {c?.of ?? p.of} this week{p.posRank ? ` · #${p.posRank} of ${p.posOf} ${p.position}s` : ''}{Number.isFinite(Number(c?.xtd_pg)) ? ` · ${Number(c.xtd_pg).toFixed(2)} touchdowns expected a game` : ''}
            </div>
            )}
            {phone ? <ChipRow theme={CHIP_THEME} lines={p.why} /> : (
            <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 13, lineHeight: 1.5, color: C.text2 }}>
              {(open ? p.why : p.why.slice(0, 2)).map((l) => <li key={l.t} title={l.src}>{l.t}</li>)}
            </ul>
            )}
            {open && p.watch.length > 0 && (<><Kicker>WATCH OUT</Kicker>
              {phone ? <ChipRow theme={CHIP_THEME} lines={p.watch} warn style={{ marginTop: 0 }} /> : (
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.5, color: C.text2 }}>{p.watch.map((l) => <li key={l.t} title={l.src}>{l.t}</li>)}</ul>)}</>)}
            {open && <DepthSections sections={p.depth} chips={phone} />}
            {open && p.price && (phone
              ? <div style={{ marginTop: 6 }}><Chip theme={CHIP_THEME} value={p.price.odds > 0 ? `+${p.price.odds}` : p.price.odds} label={`${p.price.book ? `at ${p.price.book}` : 'price'}${p.price.implied != null ? ` · implies ${p.price.implied}%` : ''}`} /></div>
              : <div style={{ marginTop: 4, fontSize: 13, color: C.text2, fontFamily: NUM_FONT }}>Price {p.price.odds > 0 ? `+${p.price.odds}` : p.price.odds}{p.price.book ? ` at ${p.price.book}` : ''}{p.price.implied != null ? ` (implies ${p.price.implied}%)` : ''}</div>)}
          </div>
        )
      })}
      {/* no per-game count: with the visible list it could point at the man (2026-10-17) */}
      {hiddenN > 0 && <CardLockLine C={C} NUM_FONT={NUM_FONT} style={{ marginTop: 4 }} />}
      {open && (<>
        {w.game.length > 0 && (<><Kicker>THE GAME</Kicker>{w.game.map((l) => <div key={l.t} title={l.src} style={{ fontSize: 13, color: C.text2 }}>{l.t}</div>)}</>)}
        <Kicker>BOTTOM LINE</Kicker>
        {w.bottom.map((l) => <div key={l.t} style={{ fontSize: 13, color: C.text2 }}>{l.t}</div>)}
        <div style={{ marginTop: 8, fontSize: 12, color: C.text3 }}>{w.footer}</div>
      </>)}
      {!open && w.noCall.map((n) => <div key={n.team} style={{ marginTop: 8, fontSize: 13, color: C.text3 }}>{w.bottom.find((l) => l.t.startsWith(`${n.team}:`))?.t}</div>)}
      {hiddenN === 0 && <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
        style={{ marginTop: 2, minHeight: 44, padding: '0 2px', border: 0, background: 'transparent', color: C.green, font: `800 13px/1 ${NUM_FONT}`, letterSpacing: '.04em', cursor: 'pointer' }}>
        {open ? 'SHOW LESS' : 'THE FULL WRITE-UP ›'}
      </button>}
    </section>
  )
}
