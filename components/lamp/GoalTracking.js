'use client'
import { useMemo, useState } from 'react'
import StatStrip from '../StatStrip'
import { C, NUM_FONT } from '../../lib/nhl/theme'
import GoalGrid from './goal/GoalGrid'
import GoalRun from './goal/GoalRun'
import GoalColdCase from './goal/GoalColdCase'
import GoalForm from './goal/GoalForm'
import GoalRink from './goal/GoalRink'
import GoalShape from './goal/GoalShape'
import { marketOf, per60 } from '../../lib/nhl/goalLog'

// 🏒 GOAL TRACKING -- "treat goal scoring as if it's a home run, how we track
// and stat them" (Donovan, 2026-10-06). MOONSHOT's homer-tracking pieces, one
// per job, on a skater's own game log: the threshold grid, his run, the
// rates, the cold case, rolling form, his record at tonight's rink and the
// shape of his goals. One mount on the player page (components/lamp/tabs/
// Player.js); everything reads the player payload and the board the page
// already holds (plus the shot archive read the shot map makes). Skaters only.
export default function GoalTracking({ p, spot, row, board, season: pick = 'this' }) {
  const [bar, setBar] = useState({ mkt: 'g' })
  const [lines, setLines] = useState({})
  const prev = p.logPrev?.rows || []
  // the season toggle: this season's games, last season's, or both (newest first, as the log is)
  const rows = useMemo(() => (pick === 'last' ? p.logPrev?.rows || [] : pick === 'both' ? [...(p.log?.rows || []), ...(p.logPrev?.rows || [])] : p.log?.rows || []), [p.log, p.logPrev, pick])
  const rowsAll = useMemo(() => [...rows, ...prev], [rows, prev])
  const season = pick === 'last' ? p.logPrev?.seasonLabel || '' : pick === 'both' ? [p.logPrev?.seasonLabel, p.log?.seasonLabel || p.featured?.seasonLabel].filter(Boolean).join(' + ') : p.log?.seasonLabel || p.featured?.seasonLabel || ''
  const stale = pick === 'this' && Boolean(p.current && p.log?.season && p.log.season < p.current)
  const mk = marketOf(bar.mkt)
  const line = lines[mk.key] ?? mk.first
  const rates = useMemo(() => per60(rows), [rows])
  const g = spot?.g?.game
  const host = g?.home?.abbrev || null
  const opp = g ? (g.home?.abbrev === p.team ? g.away?.abbrev : g.home?.abbrev) || null : null
  const ctx = useMemo(() => {
    // tonight's opponents' goals allowed a game, from the rows the board already carries
    const byOpp = new Map()
    for (const gm of board?.games || []) for (const r of gm.rows || []) if (r.opp && Number.isFinite(r.context?.oppGaPg)) byOpp.set(r.opp, r.context.oppGaPg)
    const mine = row?.context?.oppGaPg
    const rank = Number.isFinite(mine) ? 1 + [...byOpp.values()].filter((v) => v < mine).length : null
    return { opp, home: g ? g.home?.abbrev === p.team : null, today: board?.date || null, oppGaPg: Number.isFinite(mine) ? mine : null, oppRank: rank, oppN: byOpp.size, b2b: Boolean(row?.context?.b2b), oppRows: opp ? rowsAll.filter((r) => r.opp === opp) : null }
  }, [board, row, g, opp, p.team, rowsAll])
  if (p.goalie) return null
  if (!rows.length) return <div style={{ color: C.text3, fontSize: 13, lineHeight: 1.5, padding: '8px 0' }}>No games to track in {season || 'this season'} yet. Try another season above.</div>
  const seasonsOn = [p.log?.seasonLabel, prev.length ? p.logPrev?.seasonLabel : null].filter(Boolean).join(' + ')
  const tag = stale ? ` (LAST SEASON)` : ''
  const stripStats = rates ? [
    { id: 'g60', label: 'G/60', text: rates.g60.toFixed(2), title: `${rates.goals} goals in ${rates.minutes} minutes on ice over ${rates.gp} games.` },
    { id: 'sog60', label: 'S/60', text: rates.sog60.toFixed(1), title: `${rates.shots} shots in ${rates.minutes} minutes.` },
    { id: 'gps', label: 'G/SHOT', text: rates.gps != null ? rates.gps.toFixed(3).replace(/^0/, '') : '—', title: `${rates.goals} goals on ${rates.shots} shots (his shooting percentage as a fraction).` },
  ] : []
  // Each piece is a fold: its title is one 44px tap, its body opens under it, so the tab is a short list, not a long scroll.
  const sec = (label, node, key, open0 = false) => <Fold key={key} label={label} aria={key} open0={open0}>{node}</Fold>
  return (
    <>
      {sec(`THE BAR · ${season}${tag} · ${rows.length} GAMES`, <GoalGrid rows={rows} bar={bar} setBar={setBar} lines={lines} setLines={setLines} seasonLabel={season} />, 'Goal threshold grid', true)}
      {sec(`HIS RUN · ${line}+ ${mk.label.toUpperCase()}`, <GoalRun rows={rows} bar={bar} line={line} today={ctx.today} />, 'His run', true)}
      {rates && sec(`GOALS PER 60 · ${season}${tag}`, (
        <div>
          <StatStrip stats={stripStats} />
          <div style={{ color: C.text3, fontSize: 12, lineHeight: 1.5, marginTop: 6 }}>
            <b style={{ color: C.text2, fontFamily: NUM_FONT }}>{rates.goals}</b> goals on <b style={{ color: C.text2, fontFamily: NUM_FONT }}>{rates.shots}</b> shots in <b style={{ color: C.text2, fontFamily: NUM_FONT }}>{rates.minutes}</b> minutes over {rates.gp} games{rates.of > rates.gp ? ` (${rates.of - rates.gp} without a time on ice left out)` : ''}.
            {rates.thin ? <b style={{ color: C.amber }}> Thin sample: under ten games, read it lightly.</b> : null}
          </div>
        </div>
      ), 'Goals per 60')}
      {sec('THE COLD CASE', <GoalColdCase rows={rows} ctx={ctx} />, 'The cold case')}
      {sec('ROLLING FORM', <GoalForm rows={rows} />, 'Rolling form')}
      {host && sec(`AT TONIGHT’S RINK · ${host}`, <GoalRink rows={rowsAll} host={host} team={p.team} seasons={seasonsOn} />, 'Goals at tonight’s rink')}
      {sec('HIS GOAL SHAPE', <GoalShape playerId={p.id} />, 'His goal shape')}
    </>
  )
}

function Fold({ label, aria, open0, children }) {
  const [open, setOpen] = useState(open0)
  return (
    <section aria-label={aria} style={{ borderTop: `1px solid ${C.border2}`, minWidth: 0 }}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, width: '100%', minHeight: 44, padding: 0, background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
        <span style={{ color: C.ice, font: `900 11px/1.3 ${NUM_FONT}`, letterSpacing: '.12em' }}>{label}</span>
        <span aria-hidden="true" style={{ color: C.text3, fontSize: 16, minWidth: 24, textAlign: 'center' }}>{open ? '–' : '+'}</span>
      </button>
      {open && <div style={{ paddingBottom: 14 }}>{children}</div>}
    </section>
  )
}
