'use client'
// THE PENALTY BOX (2026-10-02, Donovan: "we should track players who get
// penalties too"). Every skater's penalties taken and drawn, from the league's
// own report (/api/lamp/penalties), tonight's skaters first. Measured, no score.
import { useMemo, useState } from 'react'
import LampTable from './LampTable'
import { C, NUM_FONT } from '../../lib/nhl/theme'
import { useLampPenalties } from '../../lib/nhl/useLamp'
import { DelayedBanner, Loading, SourceLine, Kicker } from './ui'

const chip = (on) => ({ minHeight: 44, padding: '0 12px', borderRadius: 10, border: `1px solid ${on ? C.ice : C.border2}`, background: on ? C.ice + '22' : 'transparent', color: on ? C.ice : C.text2, fontWeight: 800, fontSize: 12, cursor: 'pointer' })

export default function PenaltyBox({ onOpenPlayer, onOpenTeam }) {
  const [last, setLast] = useState(false)
  const [tonightOnly, setTonightOnly] = useState(true)
  const { data, error, loading } = useLampPenalties(last)
  const all = data?.players || []
  const anyTonight = all.some((p) => p.tonight)
  const rows = useMemo(() => (tonightOnly && anyTonight ? all.filter((p) => p.tonight) : all)
    .map((p) => ({ ...p, _id: p.id, opp: p.tonight ? `${p.tonight.home ? 'v' : '@'} ${p.tonight.opp}` : '' })), [all, tonightOnly, anyTonight])
  const columns = [
    { key: 'name', label: 'Skater', group: 'Skater', w: 150, heat: false, sticky: true, bold: true, link: (r) => (onOpenPlayer ? () => onOpenPlayer(r.id) : null) },
    { key: 'team', label: 'Team', group: 'Skater', w: 50, heat: false, link: (r) => (onOpenTeam && r.team ? () => onOpenTeam(r.team) : null) },
    { key: 'opp', label: 'Tonight', group: 'Skater', w: 62, heat: false, mono: true },
    { key: 'gp', label: 'GP', group: 'Skater', w: 36, heat: false },
    { key: 'taken', label: 'Taken', group: 'Penalties', w: 50, primary: true },
    { key: 'drawn', label: 'Drawn', group: 'Penalties', w: 50 },
    { key: 'net', label: 'Net', group: 'Penalties', w: 44, title: 'Drawn minus taken: above 0, he puts his team on the power play more than he sends it short' },
    { key: 'pim', label: 'PIM', group: 'Penalties', w: 44 },
    { key: 'majors', label: 'Majors', group: 'Penalties', w: 50, heat: false },
    { key: 'takenPer60', label: 'Taken/60', group: 'Per 60 minutes', w: 62, dp: 2 },
    { key: 'drawnPer60', label: 'Drawn/60', group: 'Per 60 minutes', w: 62, dp: 2 },
  ]
  return (
    <section aria-label="Penalty box" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Kicker>THE PENALTY BOX · {data?.label || ''}</Kicker>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button type="button" style={chip(!last)} aria-pressed={!last} onClick={() => setLast(false)}>This season</button>
        <button type="button" style={chip(last)} aria-pressed={last} onClick={() => setLast(true)}>Last season</button>
        {anyTonight ? <button type="button" style={chip(tonightOnly)} aria-pressed={tonightOnly} onClick={() => setTonightOnly((v) => !v)}>Playing tonight</button> : null}
      </div>
      <DelayedBanner error={error} what="the penalty report" />
      {loading && !data ? <Loading what="the penalty report" /> : null}
      {rows.length > 0 && (
        <LampTable rows={rows} columns={columns} heatMode="sorted" initialSort="taken" maxRows={12} maxHeight={9999}
          rowEdge={(r) => (r.tonight ? C.ice : null)}
          caption="Who takes penalties and who draws them. Sort any column; tap a skater for his page." />
      )}
      {data && !rows.length ? <p style={{ fontSize: 12, color: C.text3, fontFamily: NUM_FONT }}>No skater has a regular-season game yet.</p> : null}
      <SourceLine>{data?.source || 'api.nhle.com/stats skater/penalties'}: penalties, penaltiesDrawn, netPenalties, penaltyMinutes, majorPenalties, penaltiesTakenPer60, penaltiesDrawnPer60. Tonight: the league scoreboard.</SourceLine>
    </section>
  )
}
