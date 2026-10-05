'use client'
import { useMemo } from 'react'
import PageHeader from '../../PageHeader'
import { C, NUM_FONT } from '../../../lib/nba/theme'
import { useBucketsNumerology, useBucketsBoard } from '../../../lib/nba/useBuckets'
import { DelayedBanner, Loading, EmptyState, fmtDay } from '../ui'
import TonightsNumbers from '../../numerology/TonightsNumbers'
import AlignmentsView from '../../numerology/AlignmentsView'
import { useIsPhone } from '../../MobileFold'
import { bucketsAlignModel, bucketsTonight, bucketsScoreOf } from '../../../lib/nba/alignRows'

// 🔮 NUMEROLOGY (parity, 2026-10-05) -- LAMP's Numerology tab, basketball's, through
// MOONSHOT's Alignments sections (components/numerology/AlignmentsView.js). FOR FUN:
// numbers that line up, not a prediction. Not graded, never in the score, never on
// the board. Data: /api/buckets/numerology (lib/nba/numerology.js) -- jersey and birth
// date from ESPN's club rosters; who played once a game tips, the roster before.
// Not here yet (said, not faked): Hot numbers and Which lanes run hot read the
// numerology record, which BUCKETS doesn't write until it is public.

const AXIS_META = {
  jersey: { label: 'jersey', why: (a) => `jersey #${a.jersey}`, raw: (a) => a.jersey },
  day: { label: 'birth day', why: (a) => `born on the ${String(a.birthDate).slice(8, 10)}`, raw: (a) => Number(String(a.birthDate || '').slice(8, 10)) || null },
  path: { label: 'life path', why: (a) => `life path from ${a.birthDate}`, raw: () => null },
}

const WORDS = {
  person: 'player', persons: 'players', night: 'tonight', NIGHT: 'TONIGHT', unit: 'night',
  axesWord: 'three', slate: <>tonight&apos;s games</>, onSlate: 'in tonight’s games', empty: 'No players yet.',
  scoreName: <>BUCKETS points score</>, scoreShort: 'points score',
  scoreRecord: 'the number BUCKETS grades every night',
  carrying: <>Carrying tonight&apos;s number, highest points score first</>,
  braidNote: 'Two or more of his own numbers -- jersey, birth day, life path -- on one root. The rarest read here, and still arithmetic.',
  namesNote: 'Shared surnames (2+) and first names (3+; a pair of common first names is arithmetic).',
}

export default function Numerology({ date = null, onOpenPlayer }) {
  const { data, error, loading } = useBucketsNumerology(date)
  const { data: board } = useBucketsBoard(data?.date || date, 'pts')
  const phone = useIsPhone()
  const model = useMemo(() => bucketsAlignModel(data, board), [data, board])
  const tonight = useMemo(() => bucketsTonight(data, model), [data, model])

  const head = (
    <>
      <PageHeader eyebrow="BUCKETS · NUMEROLOGY" title={data ? `${fmtDay(data.date)} · the night's number is ${data.dateRoot}` : 'Numerology'}
        note="For fun: numbers that line up, not a prediction. Every digit of the date, added until one is left, against each player's jersey, birth day and life path. Not graded, and never part of the score."
        theme={C} numFont={NUM_FONT} accent={C.purple}
        stats={data ? [{ value: data.players, label: 'PLAYERS', tone: C.text2 }, { value: data.aligned.length, label: 'LINED UP', tone: C.purple }, { value: `${data.alignedHits} v ${data.expectedHits}`, label: 'HITS V CHANCE', tone: C.text2 }] : null} />
      {data?.date ? <div style={{ margin: '14px 0 10px' }}><TonightsNumbers date={data.date} theme={C} numFont={NUM_FONT} accent={C.purple} /></div> : null}
      <DelayedBanner error={error} what="tonight’s rosters" />
      {data?.fromRoster?.length ? (
        <div style={{ color: C.text3, font: `700 11px/1.5 ${NUM_FONT}`, margin: '8px 0' }}>
          Not tipped yet: {data.fromRoster.join(', ')} -- the whole roster until tip, then who got in.
        </div>
      ) : null}
      <p style={{ margin: '8px 0 10px', color: C.text3, fontSize: 11, lineHeight: 1.5 }}>
        Chance alone lines up one axis in nine, so {data ? <b style={{ color: C.text2 }}>{data.expectedHits}</b> : 'about a ninth'} of tonight&apos;s axes would match whatever the date was{data ? `; ${data.alignedHits} did` : ''}.
      </p>
    </>
  )
  const foot = (
    <div style={{ fontSize: 11, color: C.text3, lineHeight: 1.5 }}>
      Jersey and birth date: ESPN teams/{'{id}'}/roster. Who played: the game&apos;s box score. Score: tonight&apos;s PTS board. Date: the game day.
    </div>
  )

  if (!model.rows.length) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {head}
        {loading && !data ? <Loading what="tonight’s rosters" /> : null}
        {data && data.games === 0 ? <EmptyState title="NO GAMES THAT DAY" note="Nothing to line up." /> : null}
        {foot}
      </div>
    )
  }

  return (
    <AlignmentsView
      model={model} tonight={tonight} todayKey={data.date} todayRoot={data.dateRoot}
      AXIS_META={AXIS_META} scoreOf={bucketsScoreOf} words={WORDS}
      onName={(a) => onOpenPlayer?.(a.pid)} theme={C} numFont={NUM_FONT} accent={C.purple} sport="nba"
      chipLimit={phone ? 6 : 24} compact={phone}
      head={head}
    >
      {foot}
    </AlignmentsView>
  )
}
