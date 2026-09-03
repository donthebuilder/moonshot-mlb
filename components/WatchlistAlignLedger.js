'use client'
import { useEffect, useMemo, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { playerId } from '../lib/player'
import { easternToday } from '../lib/data'
import {
  usePeople, slateAlignments,
  readAlignArchive, shiftDateKey, dateDigitRoot, AXIS_META,
} from '../lib/alignments'

// 🔮 MINI ALIGNMENT LEDGER, ON THE WATCHLIST ITSELF (2026-08-18, on request)
//
// Donovan: "if we can get a mini ledger to help show if any of my watchlist
// are starting to align that would be fire." The real cross-check already
// existed — Alignments.js's "⭐ Your watchlist, aligning" panel does exactly
// this — but it only lived inside Combos → 🔮 Alignments, a tab away from
// the watchlist it's checking. This is the SAME cross-check (same engine,
// same day-archive, same Y/T/+1 read), sized down and mounted where the
// watchlist actually lives, so you see it without leaving the tab.
//
// Deliberately NOT wired into Alignments' "build a ticket around these"
// hand-off — that's a Combos-only feature (the alignment justifies a
// ticket the group engine still has to build). Here, clicking a name just
// opens his card, matching how every other row on this tab behaves.
//
// PATTERN WATCHING, NOT EVIDENCE — same rule as the full Alignments view.
// Nothing computed here feeds any score; it's a "some of your names are
// showing the same numbers the last homer run showed" glance, nothing more.
export default function WatchlistAlignLedger({ players = [], watchIds = null, slateDate = '', onPlayerClick }) {
  const { people, loaded } = usePeople(players)
  const model = useMemo(() => slateAlignments(players, people), [players, people, loaded])
  const rows = model?.rows || []
  // 2026-08-30, Donovan: "make the watchlist align better." The panel only
  // ever checked a watched name against ONE daily number (the archive's
  // single leading root) -- everything else about him was invisible. His
  // own BRAID (2+ of his own numbers agreeing with each other -- jersey,
  // birthday, life path, next-HR count, lineup spot, position) is a signal
  // that needs no archive at all and was already computed by
  // slateAlignments for the full Alignments view; it just never made it to
  // this mini panel. Indexed by pid for an O(1) lookup per watched row.
  const braidByPid = useMemo(() => {
    const m = new Map()
    ;(model?.braids || []).forEach((b) => m.set(b.a.pid, b))
    return m
  }, [model])

  // Same 60s soft-poll as Alignments.js — HomerLedger keeps writing today's
  // archive key all night, and a localStorage read has no other way to know
  // that happened.
  const todayKey = slateDate || easternToday()
  const yesterdayKey = shiftDateKey(todayKey, -1)
  const tomorrowKey = shiftDateKey(todayKey, 1)
  const [archiveTick, setArchiveTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setArchiveTick((t) => t + 1), 60_000)
    return () => clearInterval(id)
  }, [])
  const yesterdayArchive = useMemo(() => readAlignArchive(yesterdayKey), [yesterdayKey, archiveTick])
  const todayArchive = useMemo(() => readAlignArchive(todayKey), [todayKey, archiveTick])
  const tomorrowRoot = useMemo(() => dateDigitRoot(tomorrowKey), [tomorrowKey])

  const watchedRows = useMemo(() => {
    if (!watchIds || !watchIds.size || !rows.length) return []
    return rows.filter((a) => watchIds.has(playerId(a.p))).map((a) => {
      // Which axis actually explains each hit, not just that one exists --
      // "Y" used to mean nothing more than "some number of his matched
      // something" with no way to know which. axisFor() finds the first
      // axis key whose value equals the given root, for the tooltip.
      const axisFor = (root) => Object.entries(a.axes).find(([, v]) => v === root)?.[0]
      const yAxis = yesterdayArchive?.topRoot ? axisFor(yesterdayArchive.topRoot.root) : null
      const tAxis = todayArchive?.topRoot ? axisFor(todayArchive.topRoot.root) : null
      const p1Axis = tomorrowRoot != null ? axisFor(tomorrowRoot) : null
      const hitsYesterday = !!yAxis
      const hitsToday = !!tAxis
      const hitsTomorrow = !!p1Axis
      const braid = braidByPid.get(a.pid) || null
      return {
        a, hitsYesterday, hitsToday, hitsTomorrow, braid,
        any: hitsYesterday || hitsToday || hitsTomorrow || !!braid,
        tip: [
          yAxis && `Y: ${AXIS_META[yAxis]?.why(a) || yAxis}`,
          tAxis && `T: ${AXIS_META[tAxis]?.why(a) || tAxis}`,
          p1Axis && `+1: ${AXIS_META[p1Axis]?.why(a) || p1Axis}`,
          braid && `own numbers agree: ${braid.keys.map((k) => AXIS_META[k]?.label || k).join(' + ')} all root to ${braid.root}`,
        ].filter(Boolean).join(' · ') || 'no alignment yet',
      }
    })
  }, [watchIds, rows, yesterdayArchive, todayArchive, tomorrowRoot, braidByPid])

  // No watchlist, or no slate loaded to check it against — nothing to show,
  // and unlike the full Alignments view this is a secondary panel, so it
  // stays silent rather than posting an explainer with nothing behind it.
  if (!watchIds || !watchIds.size || !rows.length) return null

  const anyAligning = watchedRows.some((w) => w.any)

  return (
    <div style={{
      border: `1px solid ${anyAligning ? C.orange + '77' : C.border}`,
      background: anyAligning ? 'rgba(249,115,22,.06)' : C.bg2,
      borderRadius: 10, padding: '9px 13px', marginBottom: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
        <span style={{ fontSize: 11.5, fontWeight: 800, color: C.text2 }}>🔮 Alignment ledger — your watchlist</span>
        <span style={{ fontSize: 9, color: C.text3 }}>pattern watching, not evidence — feeds no score</span>
      </div>
      {watchedRows.length === 0 ? (
        <div style={{ fontSize: 10, color: C.text3, lineHeight: 1.5 }}>
          None of your saved hitters are on tonight&apos;s slate — nothing to cross-check yet.
        </div>
      ) : (
        <>
          <div style={{ fontSize: 9.5, color: C.text3, lineHeight: 1.55, marginBottom: 6 }}>
            Checked against each man&apos;s own jersey / birthday / life-path roots —{' '}
            <b style={{ color: C.orange }}>Y</b> = matches yesterday&apos;s leading root,{' '}
            <b style={{ color: C.orange }}>T</b> = today&apos;s so far, <b style={{ color: C.orange }}>+1</b> = tomorrow&apos;s date,{' '}
            <b style={{ color: '#38bdf8' }}>🧬</b> = his own numbers agree with each other, no archive needed.
            {' '}Hover a name for exactly which numbers. Every axis, all nine root clubs: Parlays → 🔮 Alignments.
          </div>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {watchedRows.map(({ a, hitsYesterday, hitsToday, hitsTomorrow, braid, any, tip }) => (
              <button key={a.pid} onClick={() => onPlayerClick?.(a.p)}
                title={`${a.name} — ${tip} — click to open his card`}
                style={{
                  padding: '3px 10px', borderRadius: 999, cursor: 'pointer', fontSize: 10.5, fontWeight: 700,
                  border: `1px solid ${any ? C.orange + '55' : C.border}`,
                  background: 'transparent', color: C.text2,
                }}>
                {a.name}
                {hitsYesterday && <span style={{ color: C.orange, fontFamily: NUM_FONT, fontSize: 9, marginLeft: 5 }}>Y</span>}
                {hitsToday && <span style={{ color: C.orange, fontFamily: NUM_FONT, fontSize: 9, marginLeft: 3 }}>T</span>}
                {hitsTomorrow && <span style={{ color: C.orange, fontFamily: NUM_FONT, fontSize: 9, marginLeft: 3 }}>+1</span>}
                {/* 🧬 his OWN numbers agreeing — no archive needed, so it's
                    the one badge that can show up even on a slate with no
                    daily leading root at all. */}
                {braid && <span style={{ color: '#38bdf8', fontFamily: NUM_FONT, fontSize: 9, marginLeft: 3 }}>🧬{braid.root}</span>}
                {!any && <span style={{ color: C.text3, fontFamily: NUM_FONT, fontSize: 9, marginLeft: 5 }}>·</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
