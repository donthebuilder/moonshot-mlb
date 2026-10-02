'use client'
import { useMemo, useState } from 'react'
import PageHeader from '../../PageHeader'
import LampTable from '../LampTable'
import { C, NUM_FONT } from '../../../lib/nhl/theme'
import { useLampHotSticks } from '../../../lib/nhl/useLamp'
import { DelayedBanner, Loading, SourceLine, StaleSeasonNote, EmptyState, fmtSec } from '../ui'
import { Para, Num, ConvictionClause, PowerLead, LensRow } from '../../power/PowerParts'
import { convictionOf, percentileOf } from '../../../lib/whyPick'
import { btnStyle } from '../../ui'

// 🚀 POWER, HOCKEY EDITION (2026-09-29, Donovan: "did we ever do the player
// powers for all the sports?"). MOONSHOT's Power page shape
// (components/power/PowerParts.js): ONE LEAD -- the strongest shooting read,
// argued with his own numbers and how far clear of his own field he stands --
// then ONE BOARD behind three lenses. Hockey's power is shooting, so the
// lenses are the three honest questions the hot-sticks feed can answer:
//   Volume     season shots on goal per game (min 20 games)
//   Heating    last-5 shots per game minus his season rate (the feed's own sogDelta)
//   Finishing  season goals per shot on goal (min 60 shots)
// Every number is from /api/lamp/hotsticks (api.nhle.com skater summary);
// nothing here is a LAMP score or a prediction.

const MIN_GP = 20
const MIN_SHOTS = 60
const shotsOf = (r) => (Number(r.seasonSogPg) || 0) * (Number(r.seasonGp) || 0)
const LENSES = [
  { k: 'volume', label: 'Volume', tag: 'who puts the most pucks on net', color: C.ice,
    ok: (r) => r.seasonGp >= MIN_GP, v: (r) => r.seasonSogPg },
  { k: 'heating', label: 'Heating up', tag: 'who is shooting more than his season', color: C.teal || C.cyan,
    ok: (r) => r.gp5 >= 4 && r.seasonGp >= MIN_GP && Number.isFinite(r.sogDelta), v: (r) => r.sogDelta },
  { k: 'finishing', label: 'Finishing', tag: 'who turns shots into goals', color: C.lamp,
    ok: (r) => shotsOf(r) >= MIN_SHOTS, v: (r) => (100 * r.seasonG) / shotsOf(r) },
]
const pctFmt = (v) => (Number.isFinite(v) ? `${v.toFixed(1)}%` : '—')
const signFmt = (v) => (Number.isFinite(v) ? `${v > 0 ? '+' : ''}${v.toFixed(2)}` : '—')

export default function Power({ onOpenPlayer }) {
  const { data, error, loading } = useLampHotSticks()
  const [view, setView] = useState('volume')
  const rows = useMemo(() => (data?.rows || []).map((r) => ({ ...r, shooting: shotsOf(r) >= MIN_SHOTS ? (100 * r.seasonG) / shotsOf(r) : null })), [data])

  const lead = useMemo(() => {
    const cands = LENSES.map((l) => {
      const pool = rows.filter(l.ok)
      if (pool.length < 8) return null
      const top = [...pool].sort((a, b) => l.v(b) - l.v(a))[0]
      return { l, p: top, pool, conv: convictionOf(top, pool, l.v), pct: percentileOf(l.v(top), pool.map(l.v)) }
    }).filter(Boolean)
    if (!cands.length) return null
    return [...cands].sort((a, b) => (b.conv?.z ?? -99) - (a.conv?.z ?? -99))[0]
  }, [rows])

  const lens = LENSES.find((l) => l.k === view) || LENSES[0]
  const board = useMemo(() => rows.filter(lens.ok).sort((a, b) => lens.v(b) - lens.v(a)), [rows, lens])
  const columns = [
    { key: 'name', label: 'Skater', w: 150, heat: false, sticky: true, bold: true },
    { key: 'team', label: 'Team', w: 44, heat: false },
    { key: 'pos', label: 'Pos', w: 36, heat: false },
    { key: 'seasonSogPg', label: 'SOG/GP', w: 60, dp: 2, primary: view === 'volume' },
    { key: 'sogDelta', label: 'L5 VS SZN', w: 70, fmt: signFmt, primary: view === 'heating', title: 'Shots per game over his last 5, minus his season rate' },
    { key: 'shooting', label: 'SH%', w: 52, fmt: pctFmt, primary: view === 'finishing', title: `Season goals per shot on goal (${MIN_SHOTS}+ shots)` },
    { key: 'seasonG', label: 'G', w: 40, dp: 0 },
    { key: 'seasonGp', label: 'GP', w: 40, heat: false },
    { key: 'g5', label: 'G L5', w: 44, dp: 0 },
    { key: 'toiPg10', label: 'TOI L10', w: 56, fmt: fmtSec },
  ]
  const nf = { theme: C, numFont: NUM_FONT }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <PageHeader eyebrow="LAMP · POWER" title="Who shoots, who's heating up, who finishes"
        note="One lead, one board, three lenses -- MOONSHOT's power page, for shooters. Every number is the league's own skater summary; nothing here is a LAMP score."
        theme={C} numFont={NUM_FONT} accent={C.ice} />
      {data?.stale && <StaleSeasonNote label={data.seasonLabel} what="power" />}
      <DelayedBanner error={error} what="the skater feed" />
      {loading && !data ? <Loading what="the shooters" /> : null}
      {data && !rows.length ? <EmptyState title="NO GAMES YET" note="No skater has games in the window yet." /> : null}

      {lead && (() => {
        const p = lead.p
        const shots = Math.round(shotsOf(p))
        return (
          <PowerLead {...nf} color={lead.l.color} kicker={`The ${lead.l.label.toLowerCase()} read${data?.stale ? ` · ${data.seasonLabel}` : ''}`}
            name={p.name} meta={`${p.team} · ${p.pos}`} onName={onOpenPlayer ? () => onOpenPlayer(p.id) : undefined}>
            <Para theme={C}>
              {lead.l.k === 'volume' && <>Nobody puts more pucks on net: <Num {...nf} color={lead.l.color}>{p.seasonSogPg.toFixed(2)}</Num> shots on goal a game over <Num {...nf}>{p.seasonGp}</Num> games</>}
              {lead.l.k === 'heating' && <>Nobody is shooting further above his own season: <Num {...nf} color={lead.l.color}>{p.sogPg5.toFixed(1)}</Num> shots a game over his last 5 against <Num {...nf}>{p.seasonSogPg.toFixed(2)}</Num> on the season (<Num {...nf} color={lead.l.color}>{signFmt(p.sogDelta)}</Num>)</>}
              {lead.l.k === 'finishing' && <>Nobody turns shots into goals like him: <Num {...nf} color={lead.l.color}>{p.seasonG}</Num> goals on <Num {...nf}>{shots}</Num> shots, <Num {...nf} color={lead.l.color}>{pctFmt(p.shooting)}</Num></>}
              <ConvictionClause {...nf} conv={lead.conv} field="his own field" unit={lead.l.k === 'finishing' ? 'percentage points' : 'shots'} />.
              {' '}<Num {...nf}>{p.g5}</Num> goal{p.g5 === 1 ? '' : 's'} in his last 5.
            </Para>
            <Para theme={C} dim>What he has done, not a chance of a goal tonight -- the goal board is where tonight is scored.</Para>
          </PowerLead>
        )
      })()}

      {rows.length > 0 && (
        <>
          <LensRow theme={C} lenses={LENSES} value={view} onChange={setView}
            btn={(color, on) => ({ ...btnStyle(color, on), border: `1px solid ${on ? `${color}99` : C.border}`, color: on ? color : C.text2 })} />
          <LampTable rows={board} columns={columns} heatMode="primary" maxRows={12 /* 0g E3 */} maxHeight={9999}
            onRowClick={(r) => onOpenPlayer?.(r.id)} />
        </>
      )}
      <SourceLine>api.nhle.com/stats skater summary via /api/lamp/hotsticks (regular season). Volume needs {MIN_GP}+ games, finishing {MIN_SHOTS}+ shots on goal; heating up compares his last 5 games with his season.</SourceLine>
    </div>
  )
}
