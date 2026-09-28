'use client'
import { useMemo, useState } from 'react'
import PageHeader from '../../PageHeader'
import LampTable from '../LampTable'
import { C, NUM_FONT } from '../../../lib/nhl/theme'
import { useLampHotSticks } from '../../../lib/nhl/useLamp'
import { DelayedBanner, Loading, SourceLine, StaleSeasonNote, EmptyState, fmtSec } from '../ui'
import { PillRow } from '../../Filters'

// 🔥 HOT STICKS (2026-09-27) — who is shooting more than usual. Every
// skater's last 5 and last 10 games (goals, shots, ice time, PP goals) beside
// his season shots per game, from the league's own per-game report
// (/api/lamp/hotsticks). Shots lead goals: a man putting five a night on
// net without scoring is the row to read. Measured, not a LAMP score.
// Clubs playing tonight carry a stripe and their opponent.

// The last ten games as bars, oldest on the left: height = shots, a goal
// lights the bar. Width is fixed so the column never pushes the table.
function Spark({ games }) {
  const top = Math.max(4, ...games.map(([, s]) => s))
  return (
    <span aria-label={`Last ${games.length} games, newest right: ${games.map(([g, s]) => `${s} shots${g ? `, ${g} goal${g > 1 ? 's' : ''}` : ''}`).reverse().join('; ')}`}
      style={{ display: 'inline-flex', alignItems: 'flex-end', gap: 2, height: 18, verticalAlign: 'middle' }}>
      {[...games].reverse().map(([g, s], i) => (
        <span key={i} style={{ width: 5, height: `${Math.max(2, (18 * s) / top)}px`, borderRadius: 1, background: g ? C.ice : C.text3, opacity: g ? 1 : 0.55 }} />
      ))}
    </span>
  )
}

const sign = (v) => (v == null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(2)}`)
const COLUMNS = [
  { key: 'name', label: 'Player', w: 150, heat: false, sticky: true, bold: true },
  { key: 'team', label: 'Team', w: 44, heat: false },
  { key: 'pos', label: 'Pos', w: 36, heat: false },
  { key: 'tonight', label: 'TONIGHT', w: 64, heat: false, mono: true },
  { key: 'spark', label: 'LAST 10', w: 76, heat: false, fmt: (v) => <Spark games={v || []} /> },
  { key: 'g5', label: 'G L5', w: 44, primary: true, dp: 0 },
  { key: 'sogPg5', label: 'SOG/GP L5', w: 66, primary: true, dp: 2 },
  { key: 'sogDelta', label: 'VS SZN', w: 56, primary: true, fmt: sign, title: 'Shots per game over his last 5, minus his season rate (shown once he has 10 games)' },
  { key: 'g10', label: 'G L10', w: 48, dp: 0 },
  { key: 'sogPg10', label: 'SOG/GP L10', w: 70, dp: 2 },
  { key: 'ppg10', label: 'PPG L10', w: 56, dp: 0 },
  { key: 'toiPg10', label: 'TOI L10', w: 56, fmt: fmtSec },
  { key: 'seasonSogPg', label: 'SZN SOG/GP', w: 72, dp: 2 },
  { key: 'seasonG', label: 'SZN G', w: 48, dp: 0 },
  { key: 'gp10', label: 'GP', w: 36, heat: false },
]

export default function HotSticks({ onOpenPlayer }) {
  const { data, error, loading } = useLampHotSticks()
  const [scope, setScope] = useState('all')
  // Last season's rows carry last season's team, so "tonight" would pair a
  // traded man with his old club's game: no tonight join until they're current.
  const tonight = useMemo(() => (data?.stale ? {} : data?.tonight || {}), [data])
  const rows = useMemo(() => (data?.rows || []).map((r) => ({
    ...r,
    tonight: tonight[r.team] ? `${tonight[r.team].home ? 'vs' : '@'} ${tonight[r.team].opp}` : '',
    _playing: Boolean(tonight[r.team]),
  })), [data, tonight])
  const playing = rows.filter((r) => r._playing).length
  const shown = scope === 'tonight' ? rows.filter((r) => r._playing) : scope === 'f' ? rows.filter((r) => r.pos !== 'D') : scope === 'd' ? rows.filter((r) => r.pos === 'D') : rows
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <PageHeader eyebrow="LAMP · HOT STICKS" title="Who is shooting more than usual"
        note="Every skater's last 5 and last 10 games beside his season rate. Shots come before goals: a man putting pucks on net without scoring shows up here first. Sort any column."
        theme={C} numFont={NUM_FONT} accent={C.ice}
        stats={data ? [{ value: rows.length, label: 'SKATERS', tone: C.text2 }, ...(data.stale ? [] : [{ value: playing, label: 'PLAYING TONIGHT', tone: C.ice }])] : null} />
      {data?.stale && <StaleSeasonNote label={data.seasonLabel} what="hot sticks" />}
      <DelayedBanner error={error} what="hot sticks" />
      {loading && !data ? <Loading what="hot sticks" /> : null}
      {data && !rows.length ? <EmptyState title="NO GAMES YET" note="No skater has three regular-season games in the window yet." /> : null}
      {rows.length > 0 && (
        <>
          <PillRow label="Show" value={scope} onChange={setScope} options={[
            { key: 'all', label: 'All', count: rows.length },
            ...(data?.stale ? [] : [{ key: 'tonight', label: 'Playing tonight', count: playing }]),
            { key: 'f', label: 'Forwards', count: rows.filter((r) => r.pos !== 'D').length },
            { key: 'd', label: 'Defense', count: rows.filter((r) => r.pos === 'D').length },
          ]} />
          <LampTable rows={shown} columns={COLUMNS} heatMode="primary" initialSort="sogPg5" maxRows={shown.length}
            rowEdge={(r) => (r._playing ? C.ice : null)} onRowClick={(r) => onOpenPlayer?.(r.id)} />
        </>
      )}
      <SourceLine>api.nhle.com/stats skater/summary, regular season (gameTypeId 2), one row per skater per game over the last {data?.windowDays || 35} days: goals, shots, timeOnIcePerGame, ppGoals; season rate from the same report aggregated. Skaters with fewer than 3 games in the window are left out. Tonight: the league scoreboard.</SourceLine>
    </div>
  )
}
