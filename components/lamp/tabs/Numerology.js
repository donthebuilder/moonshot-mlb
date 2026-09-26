'use client'
import PageHeader from '../../PageHeader'
import LampTable from '../LampTable'
import { C, NUM_FONT } from '../../../lib/nhl/theme'
import { useLampNumerology } from '../../../lib/nhl/useLamp'
import { DelayedBanner, Loading, EmptyState, SourceLine, fmtDay } from '../ui'

// 🔮 NUMEROLOGY (lamp research step 5, 2026-09-26) — the slot MOONSHOT's
// Alignments and TUDDY's Numerology fill, hockey edition. FOR FUN: numbers
// that line up, not a prediction. Not graded, never in the score, never on
// the board. Tonight's dressed skaters only (posted lineups); the count
// chance alone would give is printed beside the count that lined up, every
// time. Data: /api/lamp/numerology (lib/nhl/numerology.js).
const AXIS = { jersey: 'JERSEY', day: 'BIRTH DAY', path: 'LIFE PATH' }
const COLUMNS = [
  { key: 'name', label: 'Skater', heat: false, sticky: true, bold: true, w: 150 },
  { key: 'team', label: 'TM', heat: false, mono: true, w: 40 },
  { key: 'game', label: 'GAME', heat: false, mono: true, w: 80 },
  { key: 'jersey', label: '#', heat: false, mono: true, w: 36, fmt: (v) => v ?? '—' },
  { key: 'lined', label: 'LINES UP ON', heat: false, w: 190, fmt: (v, r) => r.hits.map((k) => AXIS[k]).join(' · ') },
  { key: 'n', label: 'AXES', heat: false, mono: true, w: 44 },
]

export default function Numerology({ date = null, onOpenPlayer }) {
  const { data, error, loading } = useLampNumerology(date)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <PageHeader eyebrow="LAMP · NUMEROLOGY" title={data ? `${fmtDay(data.date)} · the night's number is ${data.dateRoot}` : 'Numerology'}
        note="For fun: numbers that line up, not a prediction. Every digit of the date, added until one is left, against each dressed skater's jersey, birth day and life path. Not graded, and never part of the score."
        theme={C} numFont={NUM_FONT} accent={C.ice}
        stats={data ? [{ value: data.skaters, label: 'DRESSED', tone: C.text2 }, { value: data.aligned.length, label: 'LINED UP', tone: C.ice }, { value: `${data.alignedHits} v ${data.expectedHits}`, label: 'HITS V CHANCE', tone: C.text2 }] : null} />
      <DelayedBanner error={error} what="tonight’s lineups" />
      {loading && !data ? <Loading what="tonight’s lineups" /> : null}
      {data && data.games === 0 ? <EmptyState title="NO GAMES TODAY" note="Nothing to line up." /> : null}
      {data?.waiting?.length ? (
        <div style={{ color: C.text3, font: `700 10.5px/1.5 ${NUM_FONT}` }}>
          Lineup not posted yet: {data.waiting.join(', ')} — those skaters join once it is.
        </div>
      ) : null}
      {data && data.skaters > 0 && !data.aligned.length ? <EmptyState title="NOTHING LINES UP" note="No dressed skater's numbers reduce to tonight's." /> : null}
      {data?.aligned?.length ? (
        <LampTable rows={data.aligned.map((r) => ({ ...r, lined: r.n }))} columns={COLUMNS} heatMode="none" maxRows={40} maxHeight={9999}
          onRowClick={(r) => onOpenPlayer?.(r.id)} />
      ) : null}
      <p style={{ margin: 0, color: C.text3, fontSize: 11, lineHeight: 1.5 }}>
        Chance alone lines up one axis in nine, so {data ? <b style={{ color: C.text2 }}>{data.expectedHits}</b> : 'about a ninth'} of tonight&apos;s axes would match whatever the date was{data ? `; ${data.alignedHits} did` : ''}.
      </p>
      <SourceLine>Jersey: gamecenter/{'{id}'}/play-by-play rosterSpots (the posted lineup). Birth date: roster/{'{team}'}/current. Date: the game day.</SourceLine>
    </div>
  )
}
