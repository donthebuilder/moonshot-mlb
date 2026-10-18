'use client'
// THE CALLS, ONE BLOCK (2026-10-06, fix5-nflgame): each team's called player appears once, his score from ONE source (the game's own call, nfl_game_calls.json),
// the reasons, watch-outs and price from the write-up (lib/writeups/build.js), never reworded here.
// ON THE SHARED BLOCK (2026-10-18): the frame, the open view's reasons / watch-outs / game / bottom line / footer, the members gate and the chips on a phone are
// components/GameWriteupBlock.js, the same as LAMP, MOONSHOT and BUCKETS. What stays TUDDY's: the swipe cards while it is closed (CallsStrip), the face / club /
// score row on each player, the price and the depth sections, and the three empty states.
import { useLockOf, CardLockLine } from '../MemberGate'
import { useIsPhone } from '../MobileFold'
import { Chip } from '../writeups/ChipLines'
import { useEffect, useMemo, useState } from 'react'
import { C, NUM_FONT, TYPE, gradeFor } from '../../lib/nfl/theme'
import { buildNflWriteup } from '../../lib/writeups/build'
import { fetchNfl, nflGameCallsTotalsPaths } from '../../lib/nfl/dataSource'
import GameWriteupBlock from '../GameWriteupBlock'
import CallStatusBadge from '../CallStatusBadge'
import PlayerFace from '../PlayerFace'
import Tap from '../Tap'
import TeamMark from '../TeamMark'
import { DepthSections } from './DepthWriteup'
import { CallsStrip } from './CallsStrip'

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

const THEME = { C, NUM_FONT, TYPE, get accent() { return C.green } }   // read at draw time: C is mutated after mount (applyTheme)

export default function WriteupBlock({ game, gameCalls, week, matchup, logs, odds, onPlayerClick, onOpenTeam = null, extras: extrasIn = [] }) {
  const totals = useTotals(gameCalls?.season)
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
  const rankOf = (p) => { const c = callOf(p.player_id); return { c, rank: c?.slate_rank ?? p.rank, of: c?.of ?? p.of } }
  const words = {
    status: () => (g?.locked ? 'Locked at kickoff' : 'Locks at kickoff'),
    meta: () => '',
    numbers: (p) => { const { c, rank, of } = rankOf(p); return `#${rank} of ${of} this week${p.posRank ? ` · #${p.posRank} of ${p.posOf} ${p.position}s` : ''}${Number.isFinite(Number(c?.xtd_pg)) ? ` · ${Number(c.xtd_pg).toFixed(2)} touchdowns expected a game` : ''}` },
    chips: (p) => {
      const { c, rank, of } = rankOf(p)
      return [
        { value: `#${rank}`, label: `of ${of} this week`, hot: rank <= 5 },
        p.posRank ? { value: `#${p.posRank}`, label: `of ${p.posOf} ${p.position}s` } : null,
        Number.isFinite(Number(c?.xtd_pg)) ? { value: Number(c.xtd_pg).toFixed(2), label: 'TDs expected a game' } : null,
      ].filter(Boolean)
    },
  }
  const playerHead = (p) => {
    const c = callOf(p.player_id)
    const row = playerById.get(p.player_id)
    const score = c && Number.isFinite(Number(c.score)) ? Math.round(c.score) : p.tdScore != null ? Math.round(p.tdScore) : null
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <PlayerFace sport="nfl" espnId={row?.espn_id} team={p.team} name={p.name} size={44} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
            <Tap onClick={onPlayerClick ? () => onPlayerClick(row || { player_id: p.player_id, name: p.name }, 'TD') : null}
              style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', fontSize: TYPE.name, fontWeight: 900, color: C.text }}>{p.name}</Tap>
            <CallStatusBadge status={p.status} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: TYPE.body, color: C.text2, marginTop: -6 }}>
            <Tap onClick={onOpenTeam && (() => onOpenTeam(p.team))} style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', gap: 5 }}><TeamMark sport="nfl" abbr={p.team} variant="logo" px={16} />{p.team}</Tap> · {p.depth_role || p.position}
            <span title={p.role === 'TOP' ? "The game's top call" : 'The other team\'s call'} style={{ fontFamily: NUM_FONT, fontWeight: 800, color: p.role === 'TOP' ? C.green : C.text2 }}>{p.role === 'TOP' ? 'TOP CALL' : 'TD CALL'}</span>
          </div>
        </div>
        {score != null && <b title="Touchdown score, out of 100" style={{ fontFamily: NUM_FONT, fontSize: 24, color: gradeFor(c?.score ?? p.tdScore).color }}>{score}</b>}
      </div>
    )
  }
  // closed: the swipe cards -- the called men first (the bot's calls for this game, unchanged), then this game's top touchdown scores that are not calls
  const called = w0.players.filter((p) => !isHidden(p)).map((p) => {
    const c = callOf(p.player_id)
    const row = playerById.get(p.player_id)
    return { player_id: p.player_id, name: p.name, team: p.team, position: p.position, depth_role: p.depth_role, role: p.role, status: p.status, espn_id: row?.espn_id, row,
      score: c && Number.isFinite(Number(c.score)) ? c.score : p.tdScore, reason: p.why?.[0]?.t || null }
  })
  const have = new Set(called.map((x) => String(x.player_id)))
  const strip = <CallsStrip cards={[...called, ...extras.filter((e) => !have.has(String(e.player_id)))]} onPlayerClick={onPlayerClick} onOpenTeam={onOpenTeam} bleed={13} />
  // the shared block draws the members line when a CALLED man in the write-up is hidden; when only a board card was, this block says it
  const extrasOnly = hiddenN > 0 && !w0.players.some(isHidden)
  const closed = extrasOnly ? <>{strip}<CardLockLine C={C} NUM_FONT={NUM_FONT} style={{ marginTop: 4 }} /></> : strip
  const depth = {
    player: (p) => (
      <div key={p.player_id}>
        <DepthSections sections={p.depth} chips={phone} />
        {p.price && (phone
          ? <div style={{ marginTop: 6 }}><Chip theme={THEME} value={p.price.odds > 0 ? `+${p.price.odds}` : p.price.odds} label={`${p.price.book ? `at ${p.price.book}` : 'price'}${p.price.implied != null ? ` · implies ${p.price.implied}%` : ''}`} /></div>
          : <div style={{ marginTop: 4, fontSize: TYPE.body, color: C.text2, fontFamily: NUM_FONT }}>Price {p.price.odds > 0 ? `+${p.price.odds}` : p.price.odds}{p.price.book ? ` at ${p.price.book}` : ''}{p.price.implied != null ? ` (implies ${p.price.implied}%)` : ''}</div>)}
      </div>
    ),
  }
  const lockIn = (p) => ({ key: String(p.player_id), time: kick })
  return <GameWriteupBlock w={w0} theme={THEME} words={words} depth={depth} lockIn={lockIn} chips title="OUR CALLS" ariaLabel="Our calls" closed={closed} playerHead={playerHead} />
}
