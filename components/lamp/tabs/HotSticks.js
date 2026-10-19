'use client'
import { useMemo, useState } from 'react'
import PageHeader from '../../PageHeader'
import LampTable from '../LampTable'
import { nhlMugLatest } from '../../../lib/nhl/format'
import { C, NUM_FONT } from '../../../lib/nhl/theme'
import { useLampHotSticks } from '../../../lib/nhl/useLamp'
import { DelayedBanner, Loading, StaleSeasonNote, EmptyState, fmtSec } from '../ui'
import { PillRow } from '../../Filters'
import { HeatQuadrant, ValueBars } from '../../runs/StreakViews'

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
  const [hsPick, setHsPick] = useState(null)   // the skater whose games the value bars draw (10-18)
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
      <PageHeader eyebrow="LAMP · POWER · HOT STREAKS" title="Who is shooting more than usual"
        note="Last 5 and last 10 games beside his season rate."
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
          {/* THE HEAT QUADRANT + HIS GAMES (10-18, the TUDDY streaks views carried to LAMP): every skater as a dot, across = his
              season shots a game, up = his last 5; above the dashed diagonal he is shooting more than his norm. A tap picks him and
              draws his last 10 games as shots against his season rate (a goal game is lit). components/runs/StreakViews.js. */}
          {(() => {
            const pts = shown.filter((r) => Number.isFinite(r.seasonSogPg) && Number.isFinite(r.sogPg5)).map((r) => ({ id: String(r.id), name: r.name, x: r.seasonSogPg, y: r.sogPg5, title: `${r.name}: ${r.sogPg5.toFixed(2)} SOG/GP last 5, ${r.seasonSogPg.toFixed(2)} season` }))
            if (!pts.length) return null
            const top = Math.max(4, Math.ceil(Math.max(...pts.map((q) => Math.max(q.x, q.y)))))
            const pk = shown.find((r) => String(r.id) === hsPick) || [...shown].sort((a, b) => (b.sogPg5 - b.seasonSogPg) - (a.sogPg5 - a.seasonSogPg))[0]
            const games = pk ? [...(pk.spark || [])].reverse() : []
            return (
              <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', marginBottom: 12 }}>
                <section aria-label="Heat quadrant" style={{ padding: '10px 12px', border: `1px solid ${C.border}`, borderRadius: 12, background: C.bg2 }}>
                  <HeatQuadrant points={pts} picked={pk ? String(pk.id) : null} onPick={setHsPick} max={top} fmt={(v) => `${Math.round(v * 10) / 10}`} xLabel="→ season SOG/GP" yLabel="↑ last 5" C={C} accent={C.ice} numFont={NUM_FONT} />
                </section>
                {pk && games.length > 0 && (
                  <section aria-label={`${pk.name}: shots each game`} style={{ padding: '10px 12px', border: `1px solid ${C.border}`, borderRadius: 12, background: C.bg2 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                      <button type="button" className="tap-box" onClick={() => onOpenPlayer?.(pk.id)} style={{ border: 0, background: 'transparent', padding: 0, color: C.text, font: `900 15px/1.2 ${NUM_FONT}`, cursor: 'pointer' }}>{pk.name} ›</button>
                      <span style={{ fontFamily: NUM_FONT, fontSize: 12, color: C.text3 }}>L5 <b style={{ color: C.text }}>{pk.sogPg5?.toFixed(2)}</b> · season {pk.seasonSogPg?.toFixed(2)} SOG/GP</span>
                    </div>
                    <ValueBars values={games.map(([g, sh]) => ({ v: sh, label: g ? `${g}G` : '' }))} line={pk.seasonSogPg} ariaLabel={`${pk.name}'s shots, last ${games.length} games, against his season rate`} C={C} accent={C.ice} numFont={NUM_FONT} />
                  </section>
                )}
              </div>
            )
          })()}
          <LampTable nameCell="player" faceOf={(r) => ({ sport: 'nhl', photo: nhlMugLatest(r.id), name: r.name })} rows={shown} columns={COLUMNS} heatMode="primary" initialSort="sogPg5" maxRows={shown.length}
            rowEdge={(r) => (r._playing ? C.ice : null)} onRowClick={(r) => onOpenPlayer?.(r.id)} />
        </>
      )}
    </div>
  )
}
