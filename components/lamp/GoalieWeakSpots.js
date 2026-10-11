'use client'
import { useEffect, useMemo, useState } from 'react'
import { C, NUM_FONT } from '../../lib/nhl/theme'
import { useLampGoalieWeak } from '../../lib/nhl/useLamp'
import { useLiveFetch } from '../../lib/useLiveFetch'
import { WEAK_FLOOR, leagueWord } from '../../lib/nhl/goalieWeak'
import { seasonLabel } from '../../lib/nhl/reduce'
import LampTable from './LampTable'
import CallStatusBadge from '../CallStatusBadge'
import Tap from '../Tap'
import { Loading, readHashParam } from './ui'

// 🥅 GOALIE WEAK SPOTS (2026-10-10, Donovan: "need to know what position the goalie is weak to"). A compact block for one
// game: for each side, the CONFIRMED starter's 2-3 zones where he has allowed the most goals above the league's own rate
// for his shots there (lib/nhl/goalieWeak.js holds the rules), the shots and goals behind each, and which of tonight's
// CALLED / ON THE BOARD skaters facing him took the most of their shots from those zones. Information only: a weak zone
// is where goals have gone in, not a forecast. The feed has no net location, so there is no glove / blocker / five-hole.
//
// Collapsed it is one chip (a 44px tap target drawn 22px high, so the first row of the page below does not move). It
// reads nothing until it is opened: then one board read (the starters and the skaters' statuses are the board's own)
// and one goalie read per side.
const cell = { fontFamily: NUM_FONT }
const pct = (v) => (Number.isFinite(v) ? `${(v * 100).toFixed(1)}%` : '—')
const entryId = (e) => String(e?.playerId ?? e?.id ?? '')

function gameFrom(board, { gameId, away, home }) {
  return (board?.games || []).find((g) => String(g.game?.id) === String(gameId)) || (board?.games || []).find((g) => g.game?.away?.abbrev === away && g.game?.home?.abbrev === home) || null
}

// the skaters facing a net: the OTHER club's CALLED, then ON THE BOARD, by their rank in the game
function facing(bg, netTeam) {
  const rows = (bg?.rows || []).filter((r) => r.team !== netTeam && (r.status === 'called' || r.status === 'board'))
  rows.sort((a, b) => (a.status === 'called' ? 0 : 1) - (b.status === 'called' ? 0 : 1) || (a.rank ?? 999) - (b.rank ?? 999))
  return rows.slice(0, 8)
}

function SpotsTable({ w }) {
  const rows = w.spots.map((s) => ({ ...s, _key: s.key, zone: s.short }))
  return (
    <LampTable bare noGroups tight heatMode="primary" maxHeight={9999} maxRows={9} caption="Where this goalie has allowed the most goals above the league"
      rows={rows} columns={[
        { key: 'zone', label: 'Zone', heat: false, sticky: true, w: 92, numeric: false, fmt: (v, r) => <span title={r.def}>{v}</span>, explain: 'Where the shot was taken from, in the rink’s own words. Left and right are the shooter’s.' },
        { key: 'sa', label: 'SHOTS', w: 46, dp: 0, explain: 'Shots on goal he has faced from there this regular season.' },
        { key: 'ga', label: 'GOALS', w: 48, dp: 0, explain: 'Goals he has allowed on those shots.' },
        { key: 'excess', label: '+GOALS', w: 56, dp: 1, primary: true, explain: 'His goals allowed there minus what the league’s rate gives for the same number of shots. The zones are ranked by this, not by the rate: three goals on eight shots is a rate, not a weakness.' },
        { key: 'rate', label: 'GOAL %', w: 56, fmt: pct, explain: 'Goals over shots on goal from there: his.' },
        { key: 'lg', label: 'LEAGUE', w: 56, fmt: pct, explain: 'The league’s goals over shots on goal from the same zone.' },
      ]} />
  )
}

function ShootersTable({ w, rows, onOpenPlayer }) {
  const byId = new Map(rows.map((r) => [String(r.playerId), r]))
  const list = (w.shooters || []).map((s) => { const r = byId.get(String(s.id)); return r ? { ...s, _key: String(s.id), r, name: r.name, status: r.status, byText: s.byZone.filter((z) => z.n > 0).map((z) => `${z.short} ${z.n}`).join(' · ') || 'none' } : null }).filter(Boolean)
  if (!list.length) return <p style={{ margin: 0, color: C.text3, font: '700 11px/1.45 system-ui, sans-serif' }}>None of tonight’s called or on-the-board skaters facing him has shots on goal on file this season.</p>
  return (
    <LampTable bare noGroups tight heatMode="primary" maxHeight={9999} maxRows={9} caption="Which skaters facing him shoot most from his weak zones"
      rows={list} columns={[
        { key: 'name', label: 'Skater', heat: false, sticky: true, w: 128, numeric: false, link: (x) => (onOpenPlayer ? () => onOpenPlayer(x.id) : null) },
        { key: 'status', label: 'Status', heat: false, statusCol: true, w: 118, numeric: false, fmt: (v) => <CallStatusBadge status={v} size={8} /> },
        { key: 'n', label: 'FROM THERE', w: 76, primary: true, dp: 0, fmt: (v, x) => <span style={cell}>{v} of {x.m}</span>, explain: 'His shots on goal this regular season taken from any of the goalie’s zones listed above, out of all his shots on goal.' },
        { key: 'byText', label: 'BY ZONE', heat: false, numeric: false, w: 150, fmt: (v) => <span style={{ color: C.text2 }}>{v}</span> },
      ]} />
  )
}

function Side({ bg, side, season, onOpenPlayer }) {
  const g = bg.game
  const net = g[side].abbrev
  const other = g[side === 'away' ? 'home' : 'away'].abbrev
  const entry = bg.starters?.[side] || null
  const confirmed = entry?.confirmed === true && /^\d{7}$/.test(entryId(entry))
  const rows = useMemo(() => facing(bg, net), [bg, net])
  const { data: w, loading, error } = useLampGoalieWeak(confirmed ? entryId(entry) : null, season, rows.map((r) => String(r.playerId)))
  const head = (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', minHeight: 24 }}>
      <b style={{ color: C.text, font: `900 12px/1.2 ${NUM_FONT}`, letterSpacing: '.06em' }}>{net} NET</b>
      {confirmed ? <Tap onClick={onOpenPlayer ? () => onOpenPlayer(entryId(entry)) : null}><span style={{ color: C.text, fontSize: 13, fontWeight: 700 }}>{entry.name}</span></Tap> : null}
      {confirmed && w?.sampleLabel ? <span style={{ color: C.text3, font: `700 11px/1.2 ${NUM_FONT}` }}>{w.sampleLabel}</span> : null}
    </div>
  )
  let body
  if (!confirmed) body = <p style={{ margin: 0, color: C.text2, fontSize: 12.5, lineHeight: 1.5 }}>Starter not confirmed. Nothing is shown about {net}’s goalie until the club names him.</p>
  else if (loading && !w) body = <Loading what="his zones" />
  else if (!w) body = <p style={{ margin: 0, color: C.text3, fontSize: 12.5 }}>{error ? 'His zones are delayed.' : 'No zone read.'}</p>
  else if (w.state === 'unavailable') body = <p style={{ margin: 0, color: C.text3, fontSize: 12.5, lineHeight: 1.5 }}>The goalie zone read is not available right now. Nothing is guessed in its place.</p>
  else if (w.state === 'thin') body = <p style={{ margin: 0, color: C.text2, fontSize: 12.5, lineHeight: 1.5 }}>Too few to read: {w.sampleLabel}. A goalie is read from {WEAK_FLOOR.starts} starts or {WEAK_FLOOR.shots} shots against; under that, no zone is ranked.</p>
  else if (w.state === 'none') body = <p style={{ margin: 0, color: C.text2, fontSize: 12.5, lineHeight: 1.5 }}>No zone is clearly above the league for him: none has {WEAK_FLOOR.zoneShots}+ shots, {WEAK_FLOOR.zoneGoals}+ goals and a gap of more than one standard error over the league’s rate.</p>
  else body = (
    <>
      <SpotsTable w={w} />
      <div style={{ color: C.text3, font: '700 11px/1.45 system-ui, sans-serif', marginTop: 4 }}>vs {leagueWord(w)}.</div>
      <div style={{ color: C.ice, font: `900 10px/1 ${NUM_FONT}`, letterSpacing: '.12em', margin: '10px 0 4px' }}>{other} SKATERS · SHOTS FROM HIS WEAK ZONES</div>
      <ShootersTable w={w} rows={rows} onOpenPlayer={onOpenPlayer} />
    </>
  )
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{head}{body}</div>
}

/**
 * @param game  { id, date, away, home, season, state } -- abbrevs and the game's own date; a finished game shows the starters its lock held
 * @param sides which nets: ['away','home'] (the game page) or one (Matchups: the defence's net)
 * @param open  start opened (a deep link, #gw=1, also opens it)
 */
export default function GoalieWeakSpots({ game, sides = ['away', 'home'], onOpenPlayer = null, startOpen = false, label = 'GOALIE WEAK SPOTS' }) {
  const [open, setOpen] = useState(startOpen)
  // #gw=1 opens it (a shared link, or the board's weak-zone cell, which writes it after the game page is up and says so with 'lamp-gw')
  useEffect(() => {
    const on = () => { if (readHashParam('gw') === '1') setOpen(true) }
    on(); window.addEventListener('lamp-gw', on)
    return () => window.removeEventListener('lamp-gw', on)
  }, [game?.id])
  // the board is read only once the block is opened (the same url the Board tab reads, so a read in flight is shared)
  const url = game?.date ? `/api/lamp/board?date=${encodeURIComponent(game.date)}` : '/api/lamp/board'
  const { data: board, loading, error } = useLiveFetch(open ? url : null, { enabled: open })
  const bg = open ? gameFrom(board, { gameId: game.id, away: game.away, home: game.home }) : null
  const season = bg?.game?.season || game.season
  return (
    <div style={{ minWidth: 0, flex: open ? '1 1 100%' : '0 0 auto', marginLeft: open ? 0 : 'auto' }}>
      {/* a 44px target drawn 22px high: the negative margin gives the thumb its room without moving what is below */}
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 44, margin: '-11px 0', padding: '0 4px', background: 'transparent', border: 0, cursor: 'pointer', color: C.ice, font: `900 10px/1 ${NUM_FONT}`, letterSpacing: '.12em' }}>
        <span aria-hidden="true">🥅</span>{label} <span aria-hidden="true">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 14, paddingTop: 10, borderTop: `1px solid ${C.border2}` }}>
          {loading && !board ? <Loading what="tonight’s goalies" /> : null}
          {board && !bg ? <p style={{ margin: 0, color: C.text3, fontSize: 12.5 }}>This game is not on the board for {game.date}.</p> : null}
          {error && !board ? <p style={{ margin: 0, color: C.text3, fontSize: 12.5 }}>The goalies are delayed.</p> : null}
          {bg && sides.map((s) => <Side key={s} bg={bg} side={s} season={season} onOpenPlayer={onOpenPlayer} />)}
          {bg && (
            <p style={{ margin: 0, color: C.text3, font: '700 11px/1.5 system-ui, sans-serif' }}>
              {seasonLabel(season)} regular season, the confirmed starter only. A weak zone is where goals have gone in, not a forecast. The league’s feed has no net location, so there is no glove, blocker or five-hole read.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
