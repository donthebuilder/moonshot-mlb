'use client'
import HelpTip from './HelpTip'
import { useEffect, useMemo, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { nameOf, teamOf, mlbId, playerId } from '../lib/player'
import { easternToday } from '../lib/data'
import TonightsNumbers from './numerology/TonightsNumbers'
import AlignmentsView from './numerology/AlignmentsView'
import LaneTable from './numerology/LaneTable'
import PageHeader from './PageHeader'
import { fromMlb } from '../lib/numerology/adapters'
import {
  usePeople, slateAlignments, AXIS_META, alignedWith,
  shiftDateKey, dateDigitRoot,
} from '../lib/alignments'

// ═══════════════════════════════════════════════════════════════════════════
// 🔮 ALIGNMENTS — where the numerology fully lives and breathes
// ═══════════════════════════════════════════════════════════════════════════
//
// Donovan: "especially in combos, i think that's where it should fully live
// and breathe." So this is a VIEW in Combos, not a strip on someone else's
// panel: the whole slate through every axis at once — gematria-style digit
// roots over next homer, jersey, birth day, life path, batting order and
// fielding position, plus the name families — with the ledger's own honesty
// copy carried over word for word where it applies.
//
// AND IT FEEDS THE BET SLIP (the Builder is deleted, 2026-10-07). Every hitter here can be checked, and the button
// puts the checked names on the slip on Props (those with a price) — the alignment is
// the reason you noticed him; the slip's pair notes use the measured rules. The two claims never blur: alignment is watched,
// the ticket is measured.


function useActualNight(date, live) {
  const [night, setNight] = useState(null)
  useEffect(() => {
    let alive = true
    const read = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
      fetch(`/api/numerology/night?sport=mlb&date=${date}`).then((r) => (r.ok ? r.json() : null)).then((j) => { if (alive && j && !j.error) setNight(j) }).catch(() => {})
    }
    read()
    const id = live ? setInterval(read, 180_000) : null
    return () => { alive = false; if (id) clearInterval(id) }
  }, [date, live])
  return night
}

export default function Alignments({ players = [], watchIds = null, slateDate = '', onPlayerClick, onBuildAround }) {
  const { people, loaded } = usePeople(players)

  const model = useMemo(() => slateAlignments(players, people), [players, people, loaded])
  const { rows, totalMemberships } = model

  // ── THE ARCHIVE, READ (2026-08-18) ────────────────────────────────────────
  // Donovan: "show daily number for today and yesterday['s] number that hit a
  // lot or aligned the most the night before... help see if the players on
  // watch list are aligned or aligning number for today yesterday and the
  // next day." HomerLedger.js is the WRITER (it's the only place with real
  // graded homers to learn from); this reads back what it wrote. Polled
  // rather than read once, because HomerLedger keeps updating today's key all
  // night and this view has no other way to know that happened — it's a
  // localStorage read, not a subscription. 60s matches the cadence of the
  // site's other soft pollers (Games.js's lineup watch).
  const todayKey = slateDate || easternToday()
  const yesterdayKey = shiftDateKey(todayKey, -1)
  const tomorrowKey = shiftDateKey(todayKey, 1)
  // WHAT ACTUALLY HAPPENED, FROM THE SERVER (2026-10-04, Donovan: "shows what is but
  // not what actual is"). Was this browser's copy of HomerLedger's archive -- empty
  // for anyone who hadn't had the HR Ledger open, and silent until three homers
  // shared a root. Now /api/numerology/night (homer_feed -> lib/numerology/actualNight)
  // for everyone, from the first homer. Tonight refreshes every 3 min while visible.
  const yesterdayArchive = useActualNight(yesterdayKey, false)
  const todayArchive = useActualNight(todayKey, true)
  const tomorrowRoot = useMemo(() => dateDigitRoot(tomorrowKey), [tomorrowKey])
  // ── TONIGHT'S NUMBER, AND WHO CARRIES IT (2026-08-31) ─────────────────────
  // Donovan: "you mus give us preditcution using the numeroly reductions."
  // alignedWith() returns the expected counts in the same call as the actual
  // ones, which is the only way this can be shown without inventing a signal
  // out of long division. See its note in lib/alignments.js.
  const todayRoot = useMemo(() => dateDigitRoot(todayKey), [todayKey])
  const tonight = useMemo(() => alignedWith(todayRoot, rows), [todayRoot, rows])

  // Every watched hitter who's actually on tonight's slate, with the three
  // day-roots checked against his OWN axes (jersey/birthday/life-path — none
  // of which change day to day, so "does he line up with tomorrow" is
  // answerable before tomorrow's roster even exists).
  const watchedRows = useMemo(() => {
    if (!watchIds || !watchIds.size) return []
    return rows.filter((a) => watchIds.has(playerId(a.p))).map((a) => {
      const ownRoots = new Set(Object.values(a.axes).filter((v) => v != null))
      const hitsYesterday = yesterdayArchive?.topRoot && ownRoots.has(yesterdayArchive.topRoot.root)
      const hitsToday = todayArchive?.topRoot && ownRoots.has(todayArchive.topRoot.root)
      const hitsTomorrow = tomorrowRoot != null && ownRoots.has(tomorrowRoot)
      return { a, hitsYesterday, hitsToday, hitsTomorrow, any: hitsYesterday || hitsToday || hitsTomorrow }
    })
  }, [watchIds, rows, yesterdayArchive, todayArchive, tomorrowRoot])

  // The sections themselves are components/numerology/AlignmentsView.js
  // (2026-09-29), shared with TUDDY and LAMP; this file is MOONSHOT's data:
  // its people fetch, its HomerLedger archive, its watchlist and the builder.
  const expected = totalMemberships / 9
  // TONIGHT'S PLAYERS ON THE LANES (2026-10-07): the slate's hitters, in the lanes' adapter shape (his birth date from MLB people)
  const laneTonight = useMemo(() => ({
    date: todayKey,
    items: players.map((p) => ({ id: p.player_id ?? p.id, name: nameOf(p), team: teamOf(p), a: fromMlb(p, people?.get(mlbId(p))), score: p.hr_score })),
  }), [players, people, loaded, todayKey])   // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <AlignmentsView
      model={model} tonight={tonight} todayKey={todayKey} todayRoot={todayRoot}
      AXIS_META={AXIS_META} scoreOf={(a) => a.hrScore}
      onName={onPlayerClick ? (a) => onPlayerClick(a.p) : undefined}
      days={{ yesterdayArchive, todayArchive, tomorrowKey, tomorrowRoot }}
      watchedRows={watchedRows} hasWatch={Boolean(watchIds && watchIds.size > 0)}
      builder onBuildAround={onBuildAround}
      children={<LaneTable sport="mlb" theme={C} numFont={NUM_FONT} accent={C.orange} tonight={laneTonight} />}
      head={(
        <>
          {/* ONE PAGE, ONE EXPLAINER (2026-10-07, Donovan: Numerology and Alignments on one page). The page is
              #tab=numerology; #tab=align is its old key. Three parts, top to bottom: tonight's numbers, the
              alignments, the lanes -- and one paragraph that says what all three are. */}
          <PageHeader
            title="🔮 Numerology"
            sub={<>For fun: numbers that line up. Not part of any score. <HelpTip label="How the numbers work" text={`Every number a hitter carries (the homers he is sitting on, his next homer, his jersey, his birth day, his life path, where he bats and where he fields) is reduced the same way: add the digits until one is left (17 → 8). Pattern watching, not evidence: ~${rows.length} hitters over nine roots put ~${Math.round(expected)} memberships in every club by arithmetic alone, so read the × against that share, not the raw count. Fun to track, never a reason to bet. Nothing here feeds any score.${loaded ? '' : ' Birthdays and positions are still loading.'}`} /></>}
          />
          {/* PART ONE: TONIGHT'S NUMBERS (numerology v2): the slate's own date. */}
          <div style={{ marginBottom: 10 }}><TonightsNumbers date={todayKey} theme={C} numFont={NUM_FONT} accent={C.orange} /></div>
        </>
      )}
    />
  )
}
