'use client'
import { useMemo, useState } from 'react'
import PageHeader from '../../PageHeader'
import BucketsTable from '../BucketsTable'
import { C, NUM_FONT } from '../../../lib/nba/theme'
import { useBucketsHot } from '../../../lib/nba/useBuckets'
import { DelayedBanner, Loading, SourceLine, EmptyState, LastSeasonNote, DayPager, fmtDay } from '../ui'
import { Para, Num, ConvictionClause, PowerLead, LensRow } from '../../power/PowerParts'
import { convictionOf, percentileOf } from '../../../lib/whyPick'
import { btnStyle } from '../../ui'

// 🚀 POWER, BASKETBALL EDITION (2026-10-15). LAMP's Power (components/lamp/tabs/Power.js) on MOONSHOT's Power frame
// (components/power/PowerParts.js): ONE LEAD -- the strongest scoring read of the night's rotation players, argued with his
// own numbers and how far clear of his own field he stands -- then ONE BOARD behind three lenses, each a question his own
// game log can answer:
//   Scoring     season points a game (min 3 games)
//   Heating up  last-5 points a game minus his season rate (min 6 games, so the last 5 are a slice of something)
//   Per minute  season points per 36 minutes (min 3 games; the rotation floor is 15 minutes a game)
// Every number is the league's own, from /api/buckets/hot (each player's ESPN game log); nothing here is a BUCKETS score or a
// prediction. Before this season has games the log is last season's and the page says so; under 20 games a head, it says early.
const MIN_GP = 3
const HEAT_GP = 6
const SMALL_GP = 20
const per36 = (r) => (r.pts_szn != null && r.min_szn > 0 ? (r.pts_szn * 36) / r.min_szn : null)
const LENSES = [
  { k: 'scoring', label: 'Scoring', tag: 'who scores the most a game', color: C.purple, ok: (r) => r.gp >= MIN_GP && r.pts_szn != null, v: (r) => r.pts_szn },
  { k: 'heating', label: 'Heating up', tag: 'who is scoring more than his season', color: C.teal, ok: (r) => r.gp >= HEAT_GP && Number.isFinite(r.pts_d), v: (r) => r.pts_d },
  { k: 'permin', label: 'Per minute', tag: 'who scores the most for his minutes', color: C.purple, ok: (r) => r.gp >= MIN_GP && Number.isFinite(r.p36), v: (r) => r.p36 },
]
const f1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : '—')
const signFmt = (v) => (Number.isFinite(v) ? `${v > 0 ? '+' : ''}${v.toFixed(1)}` : '—')

export default function Power({ date, setDate, onOpenPlayer, onOpenTeam }) {
  const { data, error, loading } = useBucketsHot(date)
  const [view, setView] = useState('scoring')
  const rows = useMemo(() => (data?.rows || []).map((r) => {
    const d = r.pts?.l5 != null && r.pts?.szn != null ? Math.round((r.pts.l5 - r.pts.szn) * 10) / 10 : null
    const row = { ...r, _id: r.playerId, oppTxt: r.home ? r.opp : `@${r.opp}`, pts_szn: r.pts?.szn ?? null, pts_l5: r.pts?.l5 ?? null, pts_d: d, min_szn: r.min?.szn ?? null }
    row.p36 = per36(row)
    return row
  }), [data])

  const topGp = rows.length ? Math.max(...rows.map((r) => Number(r.gp) || 0)) : 0
  const early = rows.length > 0 && !data?.stale && topGp < SMALL_GP
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
    { key: 'name', label: 'Player', group: 'Player', w: 150, heat: false, sticky: true, bold: true },
    { key: 'team', label: 'Tm', group: 'Player', w: 52, heat: false, mono: true, teamMark: 'nba', link: (r) => (onOpenTeam ? () => onOpenTeam(r.team) : null) },
    { key: 'oppTxt', label: 'Opp', group: 'Player', w: 52, heat: false, mono: true, dim: true, link: (r) => (onOpenTeam ? () => onOpenTeam(r.opp) : null) },
    { key: 'pts_szn', label: 'PTS/G', group: 'Scoring', w: 56, dp: 1, primary: view === 'scoring', title: 'Season points a game' },
    { key: 'pts_d', label: 'L5 VS SZN', group: 'Scoring', w: 70, fmt: signFmt, primary: view === 'heating', title: 'Points a game over his last 5, minus his season rate' },
    { key: 'p36', label: 'PTS/36', group: 'Scoring', w: 60, fmt: f1, primary: view === 'permin', title: 'Season points per 36 minutes' },
    { key: 'pts_l5', label: 'L5', group: 'Scoring', w: 44, fmt: f1, title: 'Points a game over his last 5' },
    { key: 'min_szn', label: 'MIN', group: 'Form', w: 46, fmt: f1, title: 'Season minutes a game' },
    { key: 'run25', label: '25+ RUN', group: 'Form', w: 62, dp: 0, title: 'Straight games of 25+ points, counting back from his latest' },
    { key: 'gp', label: 'GP', group: 'Form', w: 40, heat: false },
  ]
  const nf = { theme: C, numFont: NUM_FONT }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <PageHeader eyebrow="BUCKETS · POWER" title={data?.date ? fmtDay(data.date) : 'Who scores, heats up, per minute'}
        note="Scorers, three ways. League stats, not a BUCKETS score."
        theme={C} numFont={NUM_FONT} accent={C.purple} />
      <DayPager shown={data?.date || date} date={date} setDate={setDate} disabled={loading} />
      {data?.stale && <LastSeasonNote label={data.seasonLabel} what="game logs" />}
      {early && <div style={{ color: C.amber, font: `800 12px/1.4 ${NUM_FONT}`, letterSpacing: '.06em' }}>THIS SEASON ({data.seasonLabel}): {topGp} {topGp === 1 ? 'GAME' : 'GAMES'} AT MOST SO FAR · EARLY NUMBERS, READ LIGHTLY</div>}
      <DelayedBanner error={error} what="the players’ game logs" />
      {loading && !data ? <Loading what="every rotation player’s game log" /> : null}
      {data && !data.games?.length ? <EmptyState title="NO GAMES THAT DAY" note="Power follows the day’s games. Try another day." /> : null}
      {data && data.games?.length > 0 && !rows.length ? <EmptyState title="NO GAMES YET" note="No rotation player has games on file yet. This builds as the season plays." /> : null}

      {lead && (() => {
        const p = lead.p
        return (
          <PowerLead {...nf} color={lead.l.color} kicker={`The ${lead.l.label.toLowerCase()} read${data?.stale ? ` · ${data.seasonLabel}` : ''}`}
            name={p.name} meta={`${p.team}${p.pos ? ` · ${p.pos}` : ''}`} onName={onOpenPlayer ? () => onOpenPlayer(p.playerId) : undefined}>
            <Para theme={C}>
              {lead.l.k === 'scoring' && <>Nobody in tonight’s rotations scores more: <Num {...nf} color={lead.l.color}>{f1(p.pts_szn)}</Num> points a game over <Num {...nf}>{p.gp}</Num> games</>}
              {lead.l.k === 'heating' && <>Nobody is scoring further above his own season: <Num {...nf} color={lead.l.color}>{f1(p.pts_l5)}</Num> a game over his last 5 against <Num {...nf}>{f1(p.pts_szn)}</Num> on the season (<Num {...nf} color={lead.l.color}>{signFmt(p.pts_d)}</Num>)</>}
              {lead.l.k === 'permin' && <>Nobody scores more for his minutes: <Num {...nf} color={lead.l.color}>{f1(p.p36)}</Num> points per 36 minutes over <Num {...nf}>{p.gp}</Num> games</>}
              <ConvictionClause {...nf} conv={early ? null : lead.conv} field="his own field" unit="points" />.
              {p.run25 > 0 && <>{' '}<Num {...nf}>{p.run25}</Num> straight game{p.run25 === 1 ? '' : 's'} of 25+.</>}
            </Para>
            <Para theme={C} dim>What he has done, not a chance of anything tonight -- the Props page is where tonight is called.</Para>
          </PowerLead>
        )
      })()}

      {rows.length > 0 && !board.length && (
        <EmptyState title="NOT ENOUGH GAMES YET" note={`Nobody in ${data?.seasonLabel || 'this season'} qualifies for ${lens.label} yet (${lens.k === 'heating' ? `${HEAT_GP}+ games` : `${MIN_GP}+ games`}). Try another lens.`} />
      )}
      {rows.length > 0 && (
        <>
          <LensRow theme={C} lenses={LENSES} value={view} onChange={setView}
            btn={(color, on) => ({ ...btnStyle(color, on), border: `1px solid ${on ? `${color}99` : C.border}`, color: on ? color : C.text2, minHeight: 44, fontSize: 12, cursor: 'pointer' })} />
          <BucketsTable nameCell="player" faceOf={(r) => ({ sport: 'nba', id: r.playerId, name: r.name })} rows={board} columns={columns} heatMode="primary" maxRows={12} maxHeight={9999}
            onRowClick={(r) => onOpenPlayer?.((r?._raw ?? r).playerId)}
            caption={`${lens.label}: ${lens.tag}. Column headers sort; each row opens that player.`} />
        </>
      )}
      <SourceLine>Source: each player’s ESPN game log, regular season and playoffs (/api/buckets/hot). Scoring and per minute need {MIN_GP}+ games, heating up {HEAT_GP}+; rotation = 15+ minutes a game. Under {SMALL_GP} games the page says the numbers are early.</SourceLine>
    </div>
  )
}
