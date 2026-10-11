'use client'
import { useMemo, useState } from 'react'
import TeamMark from '../TeamMark'
import BroadcastField from './BroadcastField'
import FlatStage, { StageSeg } from '../charts/FlatStage'
import { useIsPhone } from '../MobileFold'
import { C, NUM_FONT } from '../../lib/nfl/theme'
import { fieldModel, fieldView, mapAttempts, phrase, fmtPct, SIDES, DEPTHS, LANES, LANE_WORD, HEAT_FULL, SPOT_MIN_MINE } from '../../lib/nfl/fieldModel'

// THE FIELD, ON HIS PAGE (Wave 6, 2026-10-11). Where his own targets (or carries, or throws) went this season, by zone, on the same
// stage frame as the game page's field (components/charts/FlatStage). Real data only: nfl_matchup `field.player_pass` / `qb_pass` /
// `player_rush`, the season grids the matchups page reads. No grid for him means NO section (null), never an empty field.
// The opponent's leak (yards a play vs a normal defence) is the matchups model, shown on the tile only when he has a game and the
// defence's grid is published. Tap a zone: his plays there. Route shape and tracking are NOT claimed: zones, not paths.
const zonesOf = (pass) => (pass ? SIDES.flatMap((s) => DEPTHS.map((d) => `${s}|${d}`)) : LANES)
const TOP = 3

export default function PlayerField({ player, matchup }) {
  const phone = useIsPhone(430)
  const pid = player?.player_id
  const field = matchup?.field
  const isQB = String(player?.position || '').toUpperCase() === 'QB'
  const passSrc = field && pid != null ? (isQB ? field.qb_pass : field.player_pass)?.[pid] : null
  const rushSrc = field && pid != null ? field.player_rush?.[pid] : null
  const tg = mapAttempts(passSrc), ca = mapAttempts(rushSrc)
  const dv = fieldView({ tg, ca })
  const [pick, setPick] = useState(null)
  const [zone, setZone] = useState(null)
  const pass = (dv.toggle && pick ? pick : dv.view) !== 'rush'
  const src = pass ? passSrc : rushSrc
  const opp = player?.opp || null
  const model = useMemo(() => (opp && src ? fieldModel({ field, defTeam: opp, player, mode: 'player', pass, qb: isQB && pass }) : null), [field, opp, player, pass, isQB, src])
  if (!dv.view || !src) return null

  const zones = zonesOf(pass)
  const total = zones.reduce((a, z) => a + (src[z]?.att || 0), 0)
  if (!total) return null
  const rows = zones.map((z) => ({ z, att: src[z]?.att || 0, yds: src[z]?.yds || 0, td: src[z]?.td || 0, share: (100 * (src[z]?.att || 0)) / total }))
  const maxShare = Math.max(...rows.map((r) => r.share))
  const ranked = [...rows].filter((r) => r.att > 0).sort((a, b) => b.share - a.share)
  const loud = new Set(ranked.slice(0, TOP).map((r) => r.z))
  const where = (z) => (pass ? phrase(z) : LANE_WORD[z])
  const unit = isQB && pass ? 'throw' : pass ? 'target' : 'carry'
  const top = ranked[0]
  const cells = {}
  for (const r of rows) {
    const lk = model?.by?.[r.z]?.leak
    cells[r.z] = {
      heat: r.att > 0 ? r.share / maxShare : null,
      big: loud.has(r.z) ? `${Math.round(r.share)}%` : null,
      pips: r.td, arrow: loud.has(r.z) && !r.z.endsWith('|behind'), w: r.share / maxShare,
      title: [where(r.z), `${r.att} of his ${total} ${unit}s (${r.share.toFixed(1)}%), ${r.yds} yds, ${r.td} TD`, Number.isFinite(lk) ? `${opp} give up ${fmtPct(lk)} vs a normal defense here` : null].filter(Boolean).join('\n'),
    }
  }
  const spot = model?.spot || null
  const topLeak = top ? model?.by?.[top.z]?.leak : null
  const picked = zone ? rows.find((r) => r.z === zone) : null
  const th = { C, numFont: NUM_FONT, accent: C.green }
  const first = String(player.name || 'He').split(' ').slice(-1)[0]
  const thin = total < SPOT_MIN_MINE * 2
  return (
    <FlatStage theme={C} numFont={NUM_FONT} accent={C.green} label={`${player.name}: where his ${unit}s went`} kicker="THE FIELD" right={pass ? (isQB ? 'HIS THROWS' : 'HIS TARGETS') : 'HIS CARRIES'}
      lead={player.team ? <TeamMark sport="nfl" abbr={player.team} variant="logo" px={24} /> : null} title={`${first}: where it goes`}
      mark={player.team ? <TeamMark sport="nfl" abbr={player.team} variant="logo" px={120} /> : null}
      sentence={top ? <><b style={{ color: C.green, fontWeight: 900 }}>{Math.round(top.share)}%</b> of his {total} {unit}s this season {pass ? 'were' : 'went'} {where(top.z)}{top.td ? `, ${top.td} for a touchdown` : ''}.{thin ? ' A small sample: a hint, not a tendency.' : ''}{spot && opp ? <> {opp} give up {fmtPct(spot.leak)} there. That is the spot.</> : null}</> : null}
      tiles={[
        { label: 'HIS BUSIEST', big: top ? `${Math.round(top.share)}%` : '—', pct: 100, hot: true, line: top ? where(top.z) : '' },
        { label: opp ? `${opp} LEAK` : 'THEIR LEAK', big: Number.isFinite(topLeak) ? fmtPct(topLeak) : '—', pct: topLeak > 0 ? Math.min(100, (100 * topLeak) / HEAT_FULL) : null, hot: Boolean(spot), line: Number.isFinite(topLeak) ? `yards a play vs normal, there` : opp ? 'too few plays to call' : 'no game this week' },
        { label: 'TOUCHDOWNS', big: String(rows.reduce((a, r) => a + r.td, 0)), line: `on ${total} ${unit}s` },
      ]}
      foldTiles={phone} maxWidth={440} fullscreen fullLabel="His field, full screen"
      legend={<>Brighter = more of his {unit}s go there. The number is that share (his top {TOP} zones only). Dots = touchdowns. Zones, not routes. Tap a zone for his plays there.</>}
      controls={<>
        {picked && (
          <div aria-live="polite" style={{ font: `700 12px/1.4 ${NUM_FONT}`, color: C.text2 }}>
            <b style={{ color: C.text }}>{where(picked.z).toUpperCase()}</b>: {picked.att} {unit}{picked.att === 1 ? '' : 's'} ({picked.share.toFixed(1)}%), {picked.yds} yds, {picked.td} TD
          </div>
        )}
        {dv.toggle && <StageSeg {...th} label="Passing or running" value={pass ? 'pass' : 'rush'} onChange={(k) => { setPick(k); setZone(null) }} items={[['pass', isQB ? 'Throws' : 'Targets'], ['rush', 'Carries']]} />}
      </>}>
      <BroadcastField mode={pass ? 'pass' : 'rush'} maxWidth={440} hue={C.green} offTeam={player.team || ''} ringKey={spot?.z ?? top?.z ?? null} cells={cells}
        onZone={(z) => setZone((c) => (c === z ? null : z))} pickedZone={zone} label={`${player.name}: where his ${unit}s went`} />
    </FlatStage>
  )
}
