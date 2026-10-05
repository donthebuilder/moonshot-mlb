'use client'
import { useMemo } from 'react'
import PageHeader from '../../PageHeader'
import { C, NUM_FONT } from '../../../lib/nhl/theme'
import { useLampNumerology, useLampBoardOnce } from '../../../lib/nhl/useLamp'
import { DelayedBanner, Loading, EmptyState, SourceLine, fmtDay } from '../ui'
import TonightsNumbers from '../../numerology/TonightsNumbers'
import LaneTable from '../../numerology/LaneTable'
import HotNumbers from '../../numerology/HotNumbers'
import AlignmentsView from '../../numerology/AlignmentsView'
import { useIsPhone } from '../../MobileFold'
import { lampAlignModel, lampTonight, lampScoreOf } from '../../../lib/nhl/alignRows'

// 🔮 NUMEROLOGY (lamp research step 5, 2026-09-26) — the slot MOONSHOT's
// Alignments and TUDDY's Numerology fill, hockey edition. FOR FUN: numbers
// that line up, not a prediction. Not graded, never in the score, never on
// the board. Tonight's dressed skaters only (posted lineups); the count
// chance alone would give is printed beside the count that lined up, every
// time. Data: /api/lamp/numerology (lib/nhl/numerology.js).
//
// THROUGH MOONSHOT'S ALIGNMENTS (2026-09-29, numerology parity). This was one
// table of skaters who lined up; it is MOONSHOT's sections now
// (components/numerology/AlignmentsView.js): tonight's number (numbers pick
// the set, LAMP's goal score ranks it where the board rates him), the nine
// clubs against their arithmetic share, full braids and name families. Three
// axes -- jersey, birth day, life path -- because those are what the route
// publishes; no season-goal axis until the route carries skater stats, and
// no yesterday/today archive or builder (MOONSHOT-only). A skater the board
// doesn't rate shows no score rather than a zero.

const AXIS_META = {
  jersey: { label: 'jersey', why: (a) => `jersey #${a.jersey}`, raw: (a) => a.jersey },
  day: { label: 'birth day', why: (a) => `born on the ${String(a.birthDate).slice(8, 10)}`, raw: (a) => Number(String(a.birthDate || '').slice(8, 10)) || null },
  path: { label: 'life path', why: (a) => `life path from ${a.birthDate}`, raw: () => null },
}

const WORDS = {
  person: 'skater', persons: 'skaters', night: 'tonight', NIGHT: 'TONIGHT', unit: 'night',
  axesWord: 'three', slate: <>tonight&apos;s lineups</>, onSlate: 'in tonight’s lineups', empty: 'No dressed skaters yet.',
  scoreName: <>LAMP goal score</>, scoreShort: 'goal score',
  scoreRecord: 'the number LAMP grades every night',
  carrying: <>Carrying tonight&apos;s number, highest goal score first</>,
  braidNote: 'Two or more of his own numbers -- jersey, birth day, life path -- on one root. The rarest read here, and still arithmetic.',
  namesNote: 'Shared surnames (2+) and first names (3+; a pair of common first names is arithmetic).',
}

const scoreOf = lampScoreOf

export default function Numerology({ date = null, onOpenPlayer }) {
  const { data, error, loading } = useLampNumerology(date)
  const { data: board } = useLampBoardOnce(data?.date || date)
  const phone = useIsPhone()

  // the rows + tonight's carriers live in lib/nhl/alignRows.js (shared with Home's TONIGHT strip)
  const model = useMemo(() => lampAlignModel(data, board), [data, board])
  const tonight = useMemo(() => lampTonight(data, model), [data, model])

  const head = (
    <>
      <PageHeader eyebrow="LAMP · NUMEROLOGY" title={data ? `${fmtDay(data.date)} · the night's number is ${data.dateRoot}` : 'Numerology'}
        note="For fun: numbers that line up, not a prediction. Every digit of the date, added until one is left, against each dressed skater's jersey, birth day and life path. Not graded, and never part of the score."
        theme={C} numFont={NUM_FONT} accent={C.ice}
        stats={data ? [{ value: data.skaters, label: 'DRESSED', tone: C.text2 }, { value: data.aligned.length, label: 'LINED UP', tone: C.ice }, { value: `${data.alignedHits} v ${data.expectedHits}`, label: 'HITS V CHANCE', tone: C.text2 }] : null} />
      {data?.date ? <div style={{ margin: '14px 0 10px' }}><TonightsNumbers date={data.date} theme={C} numFont={NUM_FONT} accent={C.ice} /></div> : null}
      <HotNumbers sport="nhl" theme={C} numFont={NUM_FONT} accent={C.ice} eventWord="goals" />
      <DelayedBanner error={error} what="tonight’s lineups" />
      {data?.waiting?.length ? (
        <div style={{ color: C.text3, font: `700 10.5px/1.5 ${NUM_FONT}`, margin: '8px 0' }}>
          Lineup not posted yet: {data.waiting.join(', ')} — those skaters join once it is.
        </div>
      ) : null}
      <p style={{ margin: '8px 0 10px', color: C.text3, fontSize: 11, lineHeight: 1.5 }}>
        Chance alone lines up one axis in nine, so {data ? <b style={{ color: C.text2 }}>{data.expectedHits}</b> : 'about a ninth'} of tonight&apos;s axes would match whatever the date was{data ? `; ${data.alignedHits} did` : ''}.
      </p>
    </>
  )
  const foot = (
    <>
      <SourceLine>Jersey: gamecenter/{'{id}'}/play-by-play rosterSpots (the posted lineup). Birth date: roster/{'{team}'}/current. Score: tonight&apos;s goal board. Date: the game day.</SourceLine>
      {/* WHICH LANES RUN HOT (numerology v2 step 6), at the bottom. */}
      <LaneTable sport="nhl" theme={C} numFont={NUM_FONT} accent={C.ice} />
    </>
  )

  if (!model.rows.length) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {head}
        {loading && !data ? <Loading what="tonight’s lineups" /> : null}
        {data && data.games === 0 ? <EmptyState title="NO GAMES TODAY" note="Nothing to line up." /> : null}
        {data && data.games > 0 && !data.skaters ? <EmptyState title="NO LINEUPS YET" note="Skaters join once each game's lineup is posted." /> : null}
        {foot}
      </div>
    )
  }

  return (
    <AlignmentsView
      model={model} tonight={tonight} todayKey={data.date} todayRoot={data.dateRoot}
      AXIS_META={AXIS_META} scoreOf={scoreOf} words={WORDS}
      onName={(a) => onOpenPlayer?.(a.pid)} theme={C} numFont={NUM_FONT} accent={C.ice} sport="nhl"
      chipLimit={phone ? 6 : 24} compact={phone}
      head={head}
    >
      {foot}
    </AlignmentsView>
  )
}
